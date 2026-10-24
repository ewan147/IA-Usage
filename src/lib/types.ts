export type ModelStat = {
  model: string;
  tokens: number;
  requests: number;
  costUsd: number;
  source: "claude" | "cursor" | string;
};

export type DayBucket = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  claudeTokens: number;
  cursorTokens: number;
  cursorTokensNoCache: number;
  claudeCostUsd: number;
  cursorCostUsd: number;
  requestCount: number;
  favoriteModel: string | null;
  models: ModelStat[];
  hourCounts: number[];
  claudeHourCounts: number[];
  cursorHourCounts: number[];
  avgHour: number | null;
};

export type MergedUsageResponse = {
  days: DayBucket[];
  cursorImportedAt: string | null;
  cursorDayCount: number;
  cursorAutoPath: string | null;
};

export type CursorImportResult = {
  importedAt: string;
  rowCount: number;
  dayCount: number;
  totalTokens: number;
  sourcePath: string | null;
};

export type SourceFilter = "all" | "claude" | "cursor";
/** `0` = all available history (lifetime). */
export type PeriodFilter = 7 | 30 | 90 | 0;
