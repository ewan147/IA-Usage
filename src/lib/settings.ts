export type FontPreset = "pixel" | "clean" | "mono" | "soft" | "editorial";

export type AppSettings = {
  font: FontPreset;
  enableClaude: boolean;
  enableCursor: boolean;
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

const KEY = "ia-usage-settings-v1";

export const DEFAULT_SETTINGS: AppSettings = {
  font: "pixel",
  enableClaude: true,
  enableCursor: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const next: AppSettings = {
      font: parsed.font && parsed.font in FONT_PRESETS ? parsed.font : "pixel",
      enableClaude: parsed.enableClaude !== false,
      enableCursor: parsed.enableCursor !== false,
    };
    // Keep at least one source on.
    if (!next.enableClaude && !next.enableCursor) {
      next.enableClaude = true;
      next.enableCursor = true;
    }
    return next;
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
