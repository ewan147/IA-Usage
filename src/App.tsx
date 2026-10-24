import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClawdMascot } from "./components/ClawdMascot";
import { ClawdSprite } from "./components/ClawdSprite";
import { SkateIntro } from "./components/SkateIntro";
import { DayChart } from "./components/DayChart";
import { DayDetail } from "./components/DayDetail";
import { PeriodInsights } from "./components/PeriodInsights";
import { SettingsPanel } from "./components/SettingsPanel";
import { StatCards } from "./components/StatCards";
import { fetchMergedUsage } from "./lib/api";
import {
  applyFontPreset,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "./lib/settings";
import type {
  MergedUsageResponse,
  ModelStat,
  PeriodFilter,
  SourceFilter,
} from "./lib/types";
import {
  costForSource,
  formatHour,
  formatTokens,
  formatTokensFull,
  hoursForSource,
  prettyModel,
  tokensForSource,
} from "./lib/format";
import "./App.css";

function resolveSource(
  source: SourceFilter,
  enableClaude: boolean,
  enableCursor: boolean,
): SourceFilter {
  if (enableClaude && !enableCursor) return "claude";
  if (enableCursor && !enableClaude) return "cursor";
  return source;
}

export default function App() {
  const [period, setPeriod] = useState<PeriodFilter>(7);
  const [source, setSource] = useState<SourceFilter>("all");
  const [data, setData] = useState<MergedUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [skateKey, setSkateKey] = useState(0);
  const [blastTick, setBlastTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const activeSource = resolveSource(
    source,
    settings.enableClaude,
    settings.enableCursor,
  );

  useEffect(() => {
    applyFontPreset(settings.font);
    saveSettings(settings);
    // Keep filter coherent with enabled sources.
    if (settings.enableClaude && !settings.enableCursor) setSource("claude");
    else if (settings.enableCursor && !settings.enableClaude) setSource("cursor");
    else if (source !== "all" && source === "claude" && !settings.enableClaude) {
      setSource("all");
    } else if (source !== "all" && source === "cursor" && !settings.enableCursor) {
      setSource("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to settings toggles/font
  }, [settings]);

  const refresh = useCallback(async (days: PeriodFilter) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMergedUsage(days);
      setData(next);
      setSelectedDate((prev) => {
        if (prev && next.days.some((d) => d.date === prev)) return prev;
        return next.days[next.days.length - 1]?.date ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(period);
  }, [period, refresh]);

  const totals = useMemo(() => {
    const days = data?.days ?? [];
    return days.reduce(
      (acc, d) => {
        const claudeTokens = settings.enableClaude ? d.claudeTokens : 0;
        const cursorTokens = settings.enableCursor ? d.cursorTokens : 0;
        const claudeCost = settings.enableClaude ? d.claudeCostUsd : 0;
        const cursorCost = settings.enableCursor ? d.cursorCostUsd : 0;
        return {
          claudeTokens: acc.claudeTokens + claudeTokens,
          cursorTokens: acc.cursorTokens + cursorTokens,
          totalTokens: acc.totalTokens + claudeTokens + cursorTokens,
          claudeCost: acc.claudeCost + claudeCost,
          cursorCost: acc.cursorCost + cursorCost,
          totalCost: acc.totalCost + claudeCost + cursorCost,
        };
      },
      {
        claudeTokens: 0,
        cursorTokens: 0,
        totalTokens: 0,
        claudeCost: 0,
        cursorCost: 0,
        totalCost: 0,
      },
    );
  }, [data, settings.enableClaude, settings.enableCursor]);

  const periodModels = useMemo(() => {
    const map = new Map<string, ModelStat>();
    for (const d of data?.days ?? []) {
      for (const m of d.models) {
        if (m.source === "claude" && !settings.enableClaude) continue;
        if (m.source === "cursor" && !settings.enableCursor) continue;
        const key = `${m.source}::${m.model}`;
        const prev = map.get(key);
        if (prev) {
          prev.tokens += m.tokens;
          prev.requests += m.requests;
          prev.costUsd += m.costUsd;
        } else {
          map.set(key, { ...m });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens);
  }, [data, settings.enableClaude, settings.enableCursor]);

  const periodFavorite = useMemo(() => {
    const filtered = periodModels.filter((m) => {
      if (activeSource === "claude") return m.source === "claude";
      if (activeSource === "cursor") return m.source === "cursor";
      return true;
    });
    return filtered[0]?.model ?? null;
  }, [periodModels, activeSource]);

  const periodHours = useMemo(() => {
    const hours = Array(24).fill(0) as number[];
    for (const d of data?.days ?? []) {
      const srcHours = hoursForSource(d, activeSource);
      // If "all" but one source disabled, rebuild from enabled only.
      if (activeSource === "all") {
        const claude = settings.enableClaude
          ? d.claudeHourCounts?.length === 24
            ? d.claudeHourCounts
            : Array(24).fill(0)
          : Array(24).fill(0);
        const cursor = settings.enableCursor
          ? d.cursorHourCounts?.length === 24
            ? d.cursorHourCounts
            : Array(24).fill(0)
          : Array(24).fill(0);
        for (let h = 0; h < 24; h++) hours[h] += claude[h] + cursor[h];
      } else {
        srcHours.forEach((c, h) => {
          hours[h] += c;
        });
      }
    }
    return hours;
  }, [data, activeSource, settings.enableClaude, settings.enableCursor]);

  const periodAvgHour = useMemo(() => {
    let sum = 0;
    let weight = 0;
    periodHours.forEach((c, h) => {
      sum += h * c;
      weight += c;
    });
    return weight > 0 ? sum / weight : null;
  }, [periodHours]);

  const chartDays = useMemo(() => {
    if (!data) return [];
    if (settings.enableClaude && settings.enableCursor) return data.days;
    return data.days.map((d) => ({
      ...d,
      claudeTokens: settings.enableClaude ? d.claudeTokens : 0,
      cursorTokens: settings.enableCursor ? d.cursorTokens : 0,
      totalTokens:
        (settings.enableClaude ? d.claudeTokens : 0) +
        (settings.enableCursor ? d.cursorTokens : 0),
      models: d.models.filter((m) => {
        if (m.source === "claude") return settings.enableClaude;
        if (m.source === "cursor") return settings.enableCursor;
        return true;
      }),
    }));
  }, [data, settings.enableClaude, settings.enableCursor]);

  const selected = chartDays.find((d) => d.date === selectedDate) ?? null;
  const periodLabel = `${period} jours`;
  const bothSources = settings.enableClaude && settings.enableCursor;

  const sourceButtons = (
    [
      ...(bothSources ? ([["all", "Global", null]] as const) : []),
      ...(settings.enableClaude ? ([["claude", "Claude", "halo"]] as const) : []),
      ...(settings.enableCursor
        ? ([["cursor", "Cursor", "sunglasses"]] as const)
        : []),
    ] as const
  );

  const today = chartDays[chartDays.length - 1];

  return (
    <div className="app">
      <div className="grain" aria-hidden />
      <SkateIntro replayKey={skateKey} />

      <header className="hero">
        <div className="hero-copy">
          <div className="brand-row">
            <p className="brand">
              <ClawdSprite id="sparkles" size={28} className="brand-sprite" />
              IA Usage
            </p>
            <button
              type="button"
              className="ghost settings-btn"
              onClick={() => setSettingsOpen(true)}
              title="Réglages"
            >
              Réglages
            </button>
          </div>
          <h1>Tes tokens, jour après jour</h1>
          <p className="lede">
            Sur {periodLabel}
            <span className="lede-sep">·</span>
            modèle le plus utilisé :{" "}
            <strong>{periodFavorite ? prettyModel(periodFavorite) : "—"}</strong>
            <span className="lede-sep">·</span>
            pic vers <strong>{formatHour(periodAvgHour)}</strong>
          </p>
        </div>
        <ClawdMascot
          static
          size={112}
          onClick={() => {
            setSkateKey((k) => k + 1);
            void refresh(period);
          }}
        />
      </header>

      <div className="toolbar">
        <div className="seg with-sprite">
          <motion.span
            key={period}
            animate={{ x: [0, -3, 3, -2, 0] }}
            transition={{ duration: 0.35 }}
            className="seg-sprite"
          >
            <ClawdSprite id="arrows" size={32} title="Changer de période" />
          </motion.span>
          {([7, 30] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              type="button"
              className={period === p ? "active" : ""}
              onClick={() => setPeriod(p)}
            >
              {p} j
            </button>
          ))}
        </div>

        {sourceButtons.length > 1 && (
          <div className="seg">
            {sourceButtons.map(([id, label, sprite]) => (
              <button
                key={id}
                type="button"
                className={activeSource === id ? "active" : ""}
                onClick={() => setSource(id)}
              >
                {activeSource === id && sprite && (
                  <ClawdSprite id={sprite} size={22} className="inline-sprite" />
                )}
                {label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="ghost refresh-btn"
          disabled={loading}
          onClick={() => void refresh(period)}
        >
          <ClawdSprite id="invader" size={26} title="Rafraîchir" />
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {error && <p className="banner error">{error}</p>}

      <StatCards {...totals} periodLabel={periodLabel} source={activeSource} />

      <PeriodInsights
        hourCounts={periodHours}
        avgHour={periodAvgHour}
        models={periodModels}
        source={activeSource}
        periodLabel={periodLabel}
      />

      <section className="panel">
        <div className="panel-head">
          <h2>
            <motion.span
              key={blastTick}
              animate={
                blastTick > 0
                  ? { x: [0, 10, -6, 4, 0], scale: [1, 1.2, 1] }
                  : {}
              }
              transition={{ duration: 0.45 }}
              className="panel-sprite"
            >
              <ClawdSprite id="blast" size={32} title="Détail jour" />
            </motion.span>
            Par jour
          </h2>
          <p>Clique une barre pour le détail</p>
        </div>
        {data ? (
          <DayChart
            days={chartDays}
            source={activeSource}
            selectedDate={selectedDate}
            onSelect={(date) => {
              setSelectedDate(date);
              setBlastTick((t) => t + 1);
            }}
          />
        ) : (
          <p className="muted">Chargement…</p>
        )}
      </section>

      {selected && (
        <DayDetail
          day={selected}
          source={activeSource}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {!selected && today && (
        <section className="today panel today-panel">
          <h2>
            <ClawdSprite id="halo" size={28} className="inline-sprite" />
            Aujourd’hui
          </h2>
          <p className="today-big">
            {formatTokens(tokensForSource(today, activeSource))}
          </p>
          <p className="today-full">
            {formatTokensFull(tokensForSource(today, activeSource))} tokens
            <span className="lede-sep">·</span>
            {today.requestCount} requêtes
            <span className="lede-sep">·</span>
            {costForSource(today, activeSource).toFixed(2)} $
          </p>
        </section>
      )}

      <footer className="foot">
        <button
          type="button"
          className="foot-skate"
          onClick={() => setSkateKey((k) => k + 1)}
          title="Relancer le roller"
        >
          <ClawdSprite id="skate" size={28} />
        </button>
        <span className="foot-meta">
          {[
            settings.enableClaude ? "Claude · logs locaux" : null,
            settings.enableCursor
              ? data?.cursorAutoPath
                ? `Cursor · ${data.cursorAutoPath}`
                : "Cursor · sync cursor.com"
              : null,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </span>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
