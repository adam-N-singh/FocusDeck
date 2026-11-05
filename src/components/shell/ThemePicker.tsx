"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * Light, dark or soft (a low-contrast light theme), or follow the system.
 * A per-browser preference: kept in localStorage under a key outside the
 * app's `focusdeck:` namespace, so changing it never makes other tabs reload
 * the deck. layout.tsx applies it before first paint, and repeats the key
 * as a literal (a server component can't import values from this file).
 */
export const THEME_KEY = "focusdeck-theme";

const THEMES = [
  { id: "auto", label: "Auto", hint: "Follows your system’s light or dark setting" },
  { id: "light", label: "Light", hint: "Bright and crisp" },
  { id: "soft", label: "Soft", hint: "Light with low contrast, easy on the eyes over a long day" },
  { id: "dark", label: "Dark", hint: "Dark, whatever your system is set to" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

// Fixed previews of each theme, independent of the one in use.
const SWATCH: Record<ThemeId, CSSProperties> = {
  auto: { background: "linear-gradient(135deg, oklch(97% 0.012 262) 50%, oklch(22% 0.025 262) 50%)" },
  light: { background: "oklch(97.5% 0.012 262)" },
  soft: { background: "oklch(89% 0.018 262)" },
  dark: { background: "oklch(22% 0.025 262)" },
};

const listeners = new Set<() => void>();

function read(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : "auto";
  } catch {
    return "auto";
  }
}

function apply(theme: ThemeId) {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it: follow along.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    apply(read());
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function setTheme(theme: ThemeId) {
  try {
    if (theme === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies for this page.
  }
  apply(theme);
  listeners.forEach((l) => l());
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, read, () => "auto" as ThemeId);
  return (
    <div className="flex items-center gap-2">
      <span id="theme-label" className="text-ink-3">Theme</span>
      <div role="radiogroup" aria-labelledby="theme-label" className="inline-flex rounded-full border border-line p-0.5">
        {THEMES.map((t) => {
          const selected = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={t.hint}
              onClick={() => setTheme(t.id)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors ${
                selected ? "bg-accent-soft font-medium text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              <span aria-hidden className="size-3 rounded-full ring-1 ring-line-strong" style={SWATCH[t.id]} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
