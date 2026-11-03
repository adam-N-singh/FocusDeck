import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { APP, FINISHED_SUBJECT_TYPES, VIA, hashThread, seenKey, selectNew, toSensorEvent } from "./mapping.mjs";
import { SECRET, CONTRACT, meetsContract, intake, thread, review, ci, mention, sandboxes } from "./fixtures";

describe("GitHub notification → FocusDeck event", () => {
  it.each([
    ["review_requested", "PullRequest", "agent-needs-input"],
    ["approval_requested", "WorkflowRun", "agent-needs-input"],
    ["ci_activity", "CheckSuite", "agent-finished"],
    ["subscribed", "CheckSuite", "agent-finished"],
    ["agent_session_finished", "PullRequest", "agent-finished"],
    ["mention", "Issue", "notification"],
    ["team_mention", "Discussion", "notification"],
    ["comment", "PullRequest", "notification"],
    ["author", "PullRequest", "notification"],
    ["assign", "Issue", "notification"],
    ["state_change", "PullRequest", "notification"],
    ["subscribed", "Release", "notification"],
    ["manual", "Issue", "notification"],
    ["invitation", "RepositoryInvitation", "notification"],
    ["security_alert", "RepositoryVulnerabilityAlert", "notification"],
    ["member_feature_requested", "Issue", "notification"],
    ["from_the_future", "Commit", "notification"],
    ["__proto__", "Issue", "notification"],
    [undefined, "Issue", "notification"],
  ])("maps reason %s on a %s to %s", (reason, type, kind) => {
    expect(toSensorEvent(thread("17964567185", reason, type))).toEqual({ kind, app: APP, source: hashThread("17964567185"), via: VIA });
    expect([APP, VIA]).toEqual(["github", "github"]);
  });

  it("lets the reason decide before the subject type, and treats any CheckSuite as CI", () => {
    expect(FINISHED_SUBJECT_TYPES).toEqual(["CheckSuite"]);
    expect(toSensorEvent(thread("1", "review_requested", "CheckSuite"))?.kind).toBe("agent-needs-input");
    expect(toSensorEvent({ ...thread("1", "comment", "Issue"), subject: null })?.kind).toBe("notification");
  });

  it("accepts a numeric thread id as the same thread", () => {
    expect(toSensorEvent({ ...review, id: 17964567185 })).toEqual(toSensorEvent(review));
  });

  it.each([[null], [undefined], ["review_requested"], [42], [true], [[]], [[{ id: "1", reason: "mention" }]]])("returns null for non-object input %j", (input) => {
    expect(toSensorEvent(input)).toBeNull();
  });

  it.each([undefined, "", null, 1.5, -1, Number.NaN, {}])("returns null without a usable thread id (%j)", (id) => {
    expect(toSensorEvent({ ...review, id })).toBeNull();
  });

  it("returns null for a thread you've already read", () => {
    expect(toSensorEvent({ ...review, unread: false })).toBeNull();
  });
});

describe("Class E: content never leaves the mapping", () => {
  const needles = [SECRET, "acme", "github.com", "17964567185", "Rotate", "1347", "990417", "PullRequest", "review_requested", "2026-11-03", "MDEw", "583231"];

  it.each([review, ci, mention])("emits only kind, app, source and via for a $reason thread", (input) => {
    const event = toSensorEvent(input);
    expect(Object.keys(event ?? {}).sort()).toEqual(["app", "kind", "source", "via"]);
    const wire = JSON.stringify(event);
    for (const needle of needles) expect(wire).not.toContain(needle);
  });

  it("builds the event from constants, so thread fields named like event fields cannot ride along", () => {
    const sneaky = { ...mention, kind: "agent-resumed", app: "slack", source: "alice@example.com", via: "evil", at: 0, title: SECRET };
    expect(toSensorEvent(sneaky)).toEqual({ kind: "notification", app: "github", source: hashThread("17964567187"), via: "github" });
  });

  it.each([review, ci, mention])("passes the bridge's intake contract for a $reason thread", (input) => {
    expect(meetsContract(toSensorEvent(input))).toBe(true);
    if (intake) expect(intake.parseSensorEvent(toSensorEvent(input), Date.now())).toMatchObject({ ok: true, event: { via: "github" } });
  });
});

describe("thread hashing: stable and opaque", () => {
  const SOURCE = hashThread("17964567185");

  it("is the first 16 hex chars of sha256(thread id), and a valid opaque source", () => {
    expect(SOURCE).toBe(createHash("sha256").update("17964567185").digest("hex").slice(0, 16));
    expect(SOURCE).toMatch(/^[0-9a-f]{16}$/);
    expect(SOURCE).toMatch(CONTRACT.source);
  });

  it("is the same for every notification on one thread, and distinct across threads", () => {
    expect(toSensorEvent(thread("17964567185", "comment", "PullRequest", "2026-11-03T10:00:00Z"))?.source).toBe(SOURCE);
    expect(toSensorEvent(ci)?.source).not.toBe(SOURCE);
  });

  it("keys what was seen by thread and updated_at, hashed apart from the source", () => {
    const later = thread("17964567185", "comment", "PullRequest", "2026-11-03T10:00:00Z");
    expect(seenKey(review)).toMatch(/^[0-9a-f]{16}$/);
    expect(seenKey(review)).toBe(seenKey({ ...review, reason: "comment" }));
    expect(seenKey(later)).not.toBe(seenKey(review));
    expect(seenKey(review)).not.toBe(SOURCE);
    expect(seenKey({ ...review, id: undefined })).toBeNull();
    expect(seenKey("17964567185")).toBeNull();
  });
});

describe("selectNew: each notification once", () => {
  it("returns events for what wasn't seen, and the keys of everything listed", () => {
    const all = selectNew([review, ci, mention], new Set());
    expect(all.events.map((e) => e.kind)).toEqual(["agent-needs-input", "agent-finished", "notification"]);
    expect(all.listed).toHaveLength(3);
    const next = selectNew([review, ci, mention], new Set([seenKey(review) as string]));
    expect(next.events.map((e) => e.kind)).toEqual(["agent-finished", "notification"]);
    expect(next.listed).toEqual(all.listed);
  });

  it("counts a thread listed twice once, remembers read threads without sending them, and skips junk", () => {
    const read = { ...thread("5", "mention", "Issue"), unread: false };
    const { events, listed } = selectNew([review, review, read, null, 42, "x", {}, { id: "" }], new Set());
    expect(events).toEqual([toSensorEvent(review)]);
    expect(listed).toEqual([seenKey(review), seenKey(read)]);
  });

  it.each([null, {}, "[]", 42])("returns nothing for a body that isn't a list (%j)", (body) => {
    expect(selectNew(body, new Set())).toEqual({ events: [], listed: [] });
  });
});

afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});
