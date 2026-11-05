import type { StateWord, WeekSummary } from "@/lib/focus/mirror";

/**
 * Small inline-SVG charts, drawn in the mode's own accent via token classes,
 * so they follow the mode and the light/dark scheme. Each mark carries an SVG
 * <title> (its tooltip and accessible name); a table view sits beside every
 * chart on its page.
 *
 * The heat ramp is a separate, validated sequential scale (one hue, monotone,
 * visible steps) used by the Lab's stress table.
 */
export const HEAT_RAMP = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"] as const;

export function heatStep(value: number, min: number, max: number): { fill: string; ink: string } {
  const t = max > min ? (value - min) / (max - min) : 0;
  const index = Math.min(HEAT_RAMP.length - 1, Math.max(0, Math.round(t * (HEAT_RAMP.length - 1))));
  return { fill: HEAT_RAMP[index], ink: index >= 3 ? "#0b0b0b" : "#f0efec" };
}

const STATE_ICON: Record<StateWord, string> = { Climbing: "↗", Steady: "→", Drifting: "↘" };
// Drifting is said quietly, never in an alarm colour: direction, not judgement.
const STATE_TEXT: Record<StateWord, string> = { Climbing: "text-accent", Steady: "text-ink", Drifting: "text-ink-2" };

/** The state word, always with its arrow — never colour alone. */
export function StateBadge({ state, size = "md", empty = "Not enough weeks yet" }: { state: StateWord | null; size?: "md" | "lg"; empty?: string }) {
  if (!state) return <span className={size === "lg" ? "text-4xl font-semibold tracking-tight text-ink-2" : "text-sm text-ink-3"}>{empty}</span>;
  return (
    <span className={`${STATE_TEXT[state]} ${size === "lg" ? "text-6xl leading-none font-semibold tracking-tight" : "text-sm font-medium"}`}>
      <span aria-hidden className={size === "lg" ? "mr-2 font-normal" : ""}>{STATE_ICON[state]} </span>
      {state}
    </span>
  );
}

const shortDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The trend line, deliberately without a numeric axis: no hero number, only
 * direction (trend + state word). A forgiven week is drawn hollow.
 */
export function TrendSparkline({ weeks }: { weeks: WeekSummary[] }) {
  if (weeks.length < 2) return <p className="text-sm text-ink-3">The trend line starts after your second week.</p>;
  const width = 560;
  const height = 120;
  const pad = 16;
  const values = weeks.map((w) => w.index);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (weeks.length - 1);
  const y = (v: number) => (hi === lo ? height / 2 : height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad));
  const points = weeks.map((w, i) => `${x(i)},${y(w.index)}`).join(" ");
  const area = `${x(0)},${height - pad + 6} ${points} ${x(weeks.length - 1)},${height - pad + 6}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 22}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Trend over ${weeks.length} weeks: ${weeks.map((w) => `${shortDate(w.weekStart)} ${w.state ?? "baseline"}${w.forgiven ? " (forgiven)" : ""}`).join(", ")}`}
    >
      <polygon points={area} className="fill-accent/10" />
      <line x1={pad} x2={width - pad} y1={height - pad + 6} y2={height - pad + 6} className="stroke-line" strokeWidth={1} />
      <polyline points={points} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {weeks.map((w, i) => (
        <g key={w.weekStart}>
          <circle cx={x(i)} cy={y(w.index)} r={5} className={w.forgiven ? "fill-bg stroke-accent" : "fill-accent stroke-bg"} strokeWidth={2}>
            <title>{`Week of ${shortDate(w.weekStart)}: ${w.state ?? "the first week, the baseline"}${w.forgiven ? ", forgiven by the climb that followed" : ""}`}</title>
          </circle>
          {/* A larger invisible hit target than the mark itself. */}
          <circle cx={x(i)} cy={y(w.index)} r={14} fill="transparent">
            <title>{`Week of ${shortDate(w.weekStart)}: ${w.state ?? "baseline"}${w.forgiven ? " (forgiven)" : ""}`}</title>
          </circle>
          {/* The end labels anchor inward so they're never clipped at the edges. */}
          <text
            x={i === 0 ? 2 : i === weeks.length - 1 ? width - 2 : x(i)}
            y={height + 16}
            textAnchor={i === 0 ? "start" : i === weeks.length - 1 ? "end" : "middle"}
            fontSize={12}
            className="fill-ink-3"
          >
            {shortDate(w.weekStart)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Mean minutes an agent waited on you, per week. */
export function WaitBars({ weeks }: { weeks: WeekSummary[] }) {
  const rows = weeks.filter((w) => w.meanTimeToCloseMinutes !== null);
  if (rows.length === 0) return <p className="text-sm text-ink-3">No answered agents yet.</p>;
  const max = Math.max(...rows.map((w) => w.meanTimeToCloseMinutes ?? 0), 1);
  return (
    <div className="space-y-2.5" role="list" aria-label="Average agent wait per week">
      {rows.map((w) => {
        const minutes = w.meanTimeToCloseMinutes ?? 0;
        return (
          <div key={w.weekStart} role="listitem" className="grid grid-cols-[4rem_1fr_3rem] items-center gap-3 text-sm">
            <span className="text-ink-3">{shortDate(w.weekStart)}</span>
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" aria-hidden>
              <rect x={0} y={0} width={100} height={10} rx={3} className="fill-line/60" />
              <rect x={0} y={0} width={Math.max(2, (minutes / max) * 100)} height={10} rx={3} className="fill-accent">
                <title>{`${minutes}m average wait`}</title>
              </rect>
            </svg>
            <span className="text-right text-ink tabular-nums">{minutes}m</span>
          </div>
        );
      })}
    </div>
  );
}
