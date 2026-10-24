export type FontPreset = "pixel" | "clean" | "mono" | "soft" | "editorial";

export type ChartMetric = "tokens" | "cost" | "requests";
export type ChartStyle = "bars" | "line" | "area" | "heatmap";
export type ChartScale = "daily" | "cumulative";

export type AppSettings = {
  font: FontPreset;
  enableClaude: boolean;
  enableCursor: boolean;
  /** What the main chart measures. */
  chartMetric: ChartMetric;
  /** How the main chart is drawn. */
  chartStyle: ChartStyle;
  /** Per-day values vs running total. */
  chartScale: ChartScale;
  /** Stack Claude / Cursor in bar charts when source = Global. */
  splitSources: boolean;
  showStatCards: boolean;
  showHourChart: boolean;
  showModels: boolean;
  showDayChart: boolean;
  showToday: boolean;
  showCostOnCards: boolean;
};

export const FONT_PRESETS: Record<
  FontPreset,
  { label: string; display: string; body: string }
> = {
  pixel: {
    label: "Pixel (défaut)",
    display: '"Silkscreen", monospace',
    body: '"Outfit", sans-serif',
  },
  clean: {
    label: "Clean",
    display: '"Space Grotesk", sans-serif',
    body: '"DM Sans", sans-serif',
  },
  mono: {
    label: "Mono",
    display: '"JetBrains Mono", monospace',
    body: '"JetBrains Mono", monospace',
  },
  soft: {
    label: "Doux",
    display: '"Nunito", sans-serif',
    body: '"Nunito", sans-serif',
  },
  editorial: {
    label: "Éditorial",
    display: '"Fraunces", serif',
    body: '"Source Serif 4", serif',
  },
};

export const CHART_METRIC_OPTIONS: { id: ChartMetric; label: string; hint: string }[] = [
  { id: "tokens", label: "Tokens", hint: "Volume consommé" },
  { id: "cost", label: "Coût $", hint: "Estimation USD" },
  { id: "requests", label: "Requêtes", hint: "Nombre d’appels" },
];

export const CHART_STYLE_OPTIONS: { id: ChartStyle; label: string; hint: string }[] = [
  { id: "bars", label: "Barres", hint: "Classique jour par jour" },
  { id: "line", label: "Ligne", hint: "Tendance fine" },
  { id: "area", label: "Aire", hint: "Ligne remplie" },
  { id: "heatmap", label: "Calendrier", hint: "Intensité par jour" },
];

export const CHART_SCALE_OPTIONS: { id: ChartScale; label: string; hint: string }[] = [
  { id: "daily", label: "Par jour", hint: "Valeur du jour" },
  { id: "cumulative", label: "Cumulé", hint: "Total qui monte" },
];

const KEY = "ia-usage-settings-v2";
const LEGACY_KEY = "ia-usage-settings-v1";

export const DEFAULT_SETTINGS: AppSettings = {
  font: "pixel",
  enableClaude: true,
  enableCursor: true,
  chartMetric: "tokens",
  chartStyle: "bars",
  chartScale: "daily",
  splitSources: true,
  showStatCards: true,
  showHourChart: true,
  showModels: true,
  showDayChart: true,
  showToday: true,
  showCostOnCards: true,
};

function isChartMetric(v: unknown): v is ChartMetric {
  return v === "tokens" || v === "cost" || v === "requests";
}

function isChartStyle(v: unknown): v is ChartStyle {
  return v === "bars" || v === "line" || v === "area" || v === "heatmap";
}

function isChartScale(v: unknown): v is ChartScale {
  return v === "daily" || v === "cumulative";
}

function normalize(parsed: Partial<AppSettings>): AppSettings {
  const next: AppSettings = {
    font: parsed.font && parsed.font in FONT_PRESETS ? parsed.font : "pixel",
    enableClaude: parsed.enableClaude !== false,
    enableCursor: parsed.enableCursor !== false,
    chartMetric: isChartMetric(parsed.chartMetric)
      ? parsed.chartMetric
      : DEFAULT_SETTINGS.chartMetric,
    chartStyle: isChartStyle(parsed.chartStyle)
      ? parsed.chartStyle
      : DEFAULT_SETTINGS.chartStyle,
    chartScale: isChartScale(parsed.chartScale)
      ? parsed.chartScale
      : DEFAULT_SETTINGS.chartScale,
    splitSources: parsed.splitSources !== false,
    showStatCards: parsed.showStatCards !== false,
    showHourChart: parsed.showHourChart !== false,
    showModels: parsed.showModels !== false,
    showDayChart: parsed.showDayChart !== false,
    showToday: parsed.showToday !== false,
    showCostOnCards: parsed.showCostOnCards !== false,
  };
  if (!next.enableClaude && !next.enableCursor) {
    next.enableClaude = true;
    next.enableCursor = true;
  }
  return next;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalize(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function applyFontPreset(font: FontPreset): void {
  const preset = FONT_PRESETS[font];
  const root = document.documentElement;
  root.style.setProperty("--font-display", preset.display);
  root.style.setProperty("--font-body", preset.body);
}
