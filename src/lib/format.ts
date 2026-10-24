import type { ChartMetric } from "./settings";
import type { DayBucket, SourceFilter } from "./types";

/** Compact label for big numbers (FR: Md = milliards). */
export function formatTokens(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${trimNum(n / 1_000_000_000)} Md`;
  if (abs >= 1_000_000) return `${trimNum(n / 1_000_000)} M`;
  if (abs >= 1_000) return `${trimNum(n / 1_000)} k`;
  return String(Math.round(n));
}

/** Full French-spaced number: 123 033 146 */
export function formatTokensFull(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
}

function trimNum(n: number): string {
  const s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  return s.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1");
}

export function formatUsd(n: number): string {
  if (n < 0.01 && n > 0) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function formatHour(avg: number | null): string {
  if (avg == null) return "—";
  const h = Math.floor(avg);
  const m = Math.round((avg - h) * 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

export function prettyModel(model: string): string {
  return model
    .replace(/^claude[-_]?/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Always use CSV Total Tokens for Cursor (includes cache). */
export function tokensForSource(
  day: {
    claudeTokens: number;
    cursorTokens: number;
    totalTokens: number;
  },
  source: "all" | "claude" | "cursor",
): number {
  switch (source) {
    case "claude":
      return day.claudeTokens;
    case "cursor":
      return day.cursorTokens;
    case "all":
      return day.totalTokens;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function costForSource(
  day: {
    claudeCostUsd: number;
    cursorCostUsd: number;
    estimatedCostUsd: number;
  },
  source: "all" | "claude" | "cursor",
): number {
  switch (source) {
    case "claude":
      return day.claudeCostUsd;
    case "cursor":
      return day.cursorCostUsd;
    case "all":
      return day.estimatedCostUsd;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function hoursForSource(
  day: {
    hourCounts: number[];
    claudeHourCounts: number[];
    cursorHourCounts: number[];
  },
  source: "all" | "claude" | "cursor",
): number[] {
  switch (source) {
    case "claude":
      return day.claudeHourCounts?.length === 24
        ? day.claudeHourCounts
        : day.hourCounts;
    case "cursor":
      return day.cursorHourCounts?.length === 24
        ? day.cursorHourCounts
        : Array(24).fill(0);
    case "all":
      return day.hourCounts;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function requestsForSource(day: DayBucket, source: SourceFilter): number {
  switch (source) {
    case "all":
      return day.requestCount;
    case "claude":
      return day.models
        .filter((m) => m.source === "claude")
        .reduce((s, m) => s + m.requests, 0);
    case "cursor":
      return day.models
        .filter((m) => m.source === "cursor")
        .reduce((s, m) => s + m.requests, 0);
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function metricForSource(
  day: DayBucket,
  source: SourceFilter,
  metric: ChartMetric,
): number {
  switch (metric) {
    case "tokens":
      return tokensForSource(day, source);
    case "cost":
      return costForSource(day, source);
    case "requests":
      return requestsForSource(day, source);
    default: {
      const _exhaustive: never = metric;
      return _exhaustive;
    }
  }
}

export function formatMetricValue(n: number, metric: ChartMetric): string {
  switch (metric) {
    case "tokens":
      return formatTokens(n);
    case "cost":
      return formatUsd(n);
    case "requests":
      return formatTokensFull(Math.round(n));
    default: {
      const _exhaustive: never = metric;
      return _exhaustive;
    }
  }
}

export function metricUnitLabel(metric: ChartMetric): string {
  switch (metric) {
    case "tokens":
      return "tokens";
    case "cost":
      return "USD";
    case "requests":
      return "requêtes";
    default: {
      const _exhaustive: never = metric;
      return _exhaustive;
    }
  }
}

export function toCumulative(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => {
    sum += v;
    return sum;
  });
}
