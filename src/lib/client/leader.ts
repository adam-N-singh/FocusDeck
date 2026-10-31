/**
 * One engine at a time. Two tabs running the deck would double-process
 * sensor events and overwrite each other's storage, so the tab holding this
 * Web Lock runs the engine and every other tab waits (and takes over when
 * the leader closes). "Use here" steals the lock deliberately.
 *
 * Each election owns its state and checks `disposed` in every callback: a
 * lock can be granted after its effect was already cleaned up (React runs
 * effects twice in development), and a stale grant must release at once
 * rather than make this tab its own "other tab".
 */
const LOCK = "focusdeck-engine";
/** How long to wait for a queued lock before telling the person another tab has it. */
const FOLLOWER_GRACE_MS = 400;

let stealCurrent: (() => void) | null = null;

export function electLeader(onChange: (leader: boolean) => void): () => void {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    onChange(true);
    return () => {};
  }
  let disposed = false;
  let leading = false;
  let release: (() => void) | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const lead = async () => {
    if (disposed) return; // released immediately
    leading = true;
    if (graceTimer) clearTimeout(graceTimer);
    onChange(true);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  };

  const queue = (steal = false) => {
    navigator.locks.request(LOCK, steal ? { steal: true } : {}, lead).catch(() => {
      // Our lock was stolen by another tab: follow, and wait in line again.
      if (disposed) return;
      leading = false;
      onChange(false);
      queue();
    });
  };

  navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
    if (disposed) return;
    if (lock) return lead();
    graceTimer = setTimeout(() => {
      if (!disposed && !leading) onChange(false);
    }, FOLLOWER_GRACE_MS);
    queue();
  });

  stealCurrent = () => queue(true);
  return () => {
    disposed = true;
    if (graceTimer) clearTimeout(graceTimer);
    release?.();
    stealCurrent = null;
  };
}

export function takeOver(): void {
  stealCurrent?.();
}
