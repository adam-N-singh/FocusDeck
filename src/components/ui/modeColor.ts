import type { CSSProperties } from "react";
import type { Mode } from "@/lib/focus/types";

/**
 * Each mode has a hue, so the room tells you where you are without reading.
 * Built-in modes get hues chosen for what they are; modes you add take the
 * next free hue from a spare set, in the order you made them.
 */
const BUILT_IN: Record<string, { h: number; k: number }> = {
  building: { h: 262, k: 1 }, // deep indigo: heads-down
  writing: { h: 158, k: 1 }, // ink green
  "reviewing-agents": { h: 75, k: 1 }, // ochre: supervision, eyes open
  comms: { h: 342, k: 1 }, // rose: reachable on purpose
  idle: { h: 118, k: 0.55 }, // sage, quietly desaturated
};

const SPARE = [205, 295, 48, 185, 228, 12];

export interface ModeTint {
  h: number;
  k: number;
}

export function modeTint(modes: Pick<Mode, "id">[], id: string): ModeTint {
  const builtIn = BUILT_IN[id];
  if (builtIn) return builtIn;
  const custom = modes.filter((m) => !BUILT_IN[m.id]);
  const index = custom.findIndex((m) => m.id === id);
  const fallback = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return { h: SPARE[(index >= 0 ? index : fallback) % SPARE.length], k: 1 };
}

/** Props that give an element its own mode hue (see `[data-hue]` in globals.css). */
export function hueProps(tint: ModeTint): { "data-hue": true; style: CSSProperties } {
  return { "data-hue": true, style: { "--h": tint.h } as CSSProperties };
}
