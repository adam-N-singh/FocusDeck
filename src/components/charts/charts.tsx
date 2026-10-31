import type { StateWord, WeekSummary } from "@/lib/focus/mirror";

/**
 * Small inline-SVG charts. Colors were validated for this dark surface
 * (#121214) with the dataviz palette validator: the series marks pass the
 * lightness band, contrast and CVD checks; the sequential ramp is one hue,
 * monotone, with visible steps and a dark end that still clears 2:1.
 * Each mark carries an SVG <title>, which is both its hover tooltip and its
 * accessible name; a table view sits beside every chart on its page.
 */
export const SERIES = { trend: "#059669", wait: "#0284c7" } as const;
/** Sequential, low → high. Near-zero recedes toward the dark surface. */
export const HEAT_RAMP = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"] as const;
const SURFACE = "#121214";
const MUTED = "#898781";

export function heatStep(value: number, min: number, max: number): { fill: string; ink: string } {
  const t = max > min ? (value - min) / (max - min) : 0;
  const index = Math.min(HEAT_RAMP.length - 1, Math.max(0, Math.round(t * (HEAT_RAMP.length - 1))));
  return { fill: HEAT_RAMP[index], ink: index >= 3 ? "#0b0b0b" : "#f0efec" };
}

const STATE_ICON: Record<StateWord, string> = { Climbing: "↗", Steady: "→", Drifting: "↘" };
const STATE_TEXT: Record<StateWord, string> = { Climbing: "text-emerald-300", Steady: "text-zinc-200", Drifting: "text-amber-200" };

/** The state word, always with its icon — never color alone. */
export function StateBadge({ state, size = "md", empty = "Not enough weeks yet" }: { state: StateWord | null; size?: "md" | "lg"; empty?: string }) {
  if (!state) return <span className="text-zinc-400">{empty}</span>;
  return (
    <span className={`${STATE_TEXT[state]} ${size === "lg" ? "text-4xl font-semibold tracking-tight" : "text-sm font-medium"}`}>
      <span aria-hidden>{STATE_ICON[state]} </span>
      {state}
    </span>
  );
}

const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The trend line, deliberately without a numeric axis: no hero number, only
 * direction (Hymah: trend + state word). A forgiven week is drawn hollow.
 */
export function TrendSparkline({ weeks }: { weeks: WeekSummary[] }) {
  if (weeks.length < 2) return <p className="text-sm text-zinc-500">The trend line starts after your second week.</p>;
  const width = 560;
  const height = 120;
  const pad = 16;
  const values = weeks.map((w) => w.index);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (weeks.length - 1);
  const y = (v: number) => (hi === lo ? height / 2 : height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad));
  const points = weeks.map((w, i) => `${x(i)},${y(w.index)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height + 22}`} className="h-auto w-full max-w-xl" role="img" aria-label={`Trend over ${weeks.length} weeks: ${weeks.map((w) => `${shortDate(w.weekStart)} ${w.state ?? "baseline"}${w.forgiven ? " (forgiven)" : ""}`).join(", ")}`}>
      <line x1={pad} x2={width - pad} y1={height - pad + 6} y2={height - pad + 6} stroke="#383835" strokeWidth={1} />
      <polyline points={points} fill="none" stroke={SERIES.trend} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {weeks.map((w, i) => (
        <g key={w.weekStart}>
          <circle cx={x(i)} cy={y(w.index)} r={5} fill={w.forgiven ? SURFACE : SERIES.trend} stroke={w.forgiven ? SERIES.trend : SURFACE} strokeWidth={2}>
            <title>{`Week of ${shortDate(w.weekStart)}: ${w.state ?? "the first week, the baseline"}${w.forgiven ? " — forgiven by the climb that followed" : ""}`}</title>
          </circle>
          {/* A larger invisible hit target than the mark itself. */}
          <circle cx={x(i)} cy={y(w.index)} r={14} fill="transparent">
            <title>{`Week of ${shortDate(w.weekStart)}: ${w.state ?? "baseline"}${w.forgiven ? " (forgiven)" : ""}`}</title>
          </circle>
          <text x={x(i)} y={height + 16} textAnchor="middle" fontSize={11} fill={MUTED}>{shortDate(w.weekStart)}</text>
        </g>
      ))}
    </svg>
  );
}

/** Mean minutes an agent waited on you, per week — open-loop ageing, the headline target. */
export function WaitBars({ weeks }: { weeks: WeekSummary[] }) {
  const rows = weeks.filter((w) => w.meanTimeToCloseMinutes !== null);
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No closed loops yet.</p>;
  const max = Math.max(...rows.map((w) => w.meanTimeToCloseMinutes ?? 0), 1);
  return (
    <div className="space-y-2" role="list" aria-label="Mean agent wait per week">
      {rows.map((w) => {
        const minutes = w.meanTimeToCloseMinutes ?? 0;
        return (
          <div key={w.weekStart} role="listitem" className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 text-xs">
            <span className="text-zinc-500">{shortDate(w.weekStart)}</span>
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
              <rect x={0} y={0} width={Math.max(1.5, (minutes / max) * 100)} height={10} rx={2} fill={SERIES.wait}>
                <title>{`${minutes}m average wait`}</title>
              </rect>
            </svg>
            <span className="text-right text-zinc-300 tabular-nums">{minutes}m</span>
          </div>
        );
      })}
    </div>
  );
}
