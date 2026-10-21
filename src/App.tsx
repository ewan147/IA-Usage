import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ClawdMascot } from "./components/ClawdMascot";
import { ClawdSprite } from "./components/ClawdSprite";
import { SkateIntro } from "./components/SkateIntro";
import { DayChart } from "./components/DayChart";
import { DayDetail } from "./components/DayDetail";
import { PeriodInsights } from "./components/PeriodInsights";
import { StatCards } from "./components/StatCards";
import { fetchMergedUsage } from "./lib/api";
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

export default function App() {
  const [period, setPeriod] = useState<PeriodFilter>(7);
  const [source, setSource] = useState<SourceFilter>("all");
  const [data, setData] = useState<MergedUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [skateKey, setSkateKey] = useState(0);
  const [blastTick, setBlastTick] = useState(0);

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
      (acc, d) => ({
        claudeTokens: acc.claudeTokens + d.claudeTokens,
        cursorTokens: acc.cursorTokens + d.cursorTokens,
        totalTokens: acc.totalTokens + d.totalTokens,
        claudeCost: acc.claudeCost + d.claudeCostUsd,
        cursorCost: acc.cursorCost + d.cursorCostUsd,
        totalCost: acc.totalCost + d.estimatedCostUsd,
      }),
      {
        claudeTokens: 0,
        cursorTokens: 0,
        totalTokens: 0,
        claudeCost: 0,
        cursorCost: 0,
        totalCost: 0,
      },
    );
  }, [data]);

  const periodModels = useMemo(() => {
    const map = new Map<string, ModelStat>();
    for (const d of data?.days ?? []) {
      for (const m of d.models) {
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
  }, [data]);

  const periodFavorite = useMemo(() => {
    const filtered = periodModels.filter((m) => {
      if (source === "claude") return m.source === "claude";
      if (source === "cursor") return m.source === "cursor";
      return true;
    });
    return filtered[0]?.model ?? null;
  }, [periodModels, source]);

  const periodHours = useMemo(() => {
    const hours = Array(24).fill(0) as number[];
    for (const d of data?.days ?? []) {
      const srcHours = hoursForSource(d, source);
      srcHours.forEach((c, h) => {
        hours[h] += c;
      });
    }
    return hours;
  }, [data, source]);

  const periodAvgHour = useMemo(() => {
    let sum = 0;
    let weight = 0;
    periodHours.forEach((c, h) => {
      sum += h * c;
      weight += c;
    });
    return weight > 0 ? sum / weight : null;
  }, [periodHours]);

  const selected = data?.days.find((d) => d.date === selectedDate) ?? null;
  const periodLabel = `${period} jours`;

  return (
    <div className="app">
      <div className="grain" aria-hidden />
      <SkateIntro replayKey={skateKey} />

      <header className="hero">
        <div className="hero-copy">
          <p className="brand">
            <ClawdSprite id="sparkles" size={28} className="brand-sprite" />
            IA Usage
          </p>
          <h1>Tes tokens, jour après jour</h1>
          <p className="lede">
            Sur {periodLabel} — modèle le plus utilisé :{" "}
            <strong>{periodFavorite ? prettyModel(periodFavorite) : "—"}</strong>
            <span className="lede-sep">·</span>
            pic d’activité vers <strong>{formatHour(periodAvgHour)}</strong>
          </p>
        </div>
        <ClawdMascot
          static
          size={120}
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

        <div className="seg">
          {(
            [
              ["all", "Global", null],
              ["claude", "Claude", "halo"],
              ["cursor", "Cursor", "sunglasses"],
            ] as const
          ).map(([id, label, sprite]) => (
            <button
              key={id}
              type="button"
              className={source === id ? "active" : ""}
              onClick={() => setSource(id)}
            >
              {source === id && sprite && (
                <ClawdSprite id={sprite} size={22} className="inline-sprite" />
              )}
              {label}
            </button>
          ))}
        </div>

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

      <StatCards {...totals} periodLabel={periodLabel} source={source} />

      <PeriodInsights
        hourCounts={periodHours}
        avgHour={periodAvgHour}
        models={periodModels}
        source={source}
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
            days={data.days}
            source={source}
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
          source={source}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {!selected && data?.days[data.days.length - 1] && (
        <section className="today panel today-panel">
          <h2>
            <ClawdSprite id="halo" size={28} className="inline-sprite" />
            Aujourd’hui
          </h2>
          <p className="today-big">
            {formatTokens(tokensForSource(data.days[data.days.length - 1], source))}
          </p>
          <p className="today-full">
            {formatTokensFull(tokensForSource(data.days[data.days.length - 1], source))}{" "}
            tokens
            <span className="lede-sep">·</span>
            {data.days[data.days.length - 1].requestCount} requêtes
            <span className="lede-sep">·</span>
            {costForSource(data.days[data.days.length - 1], source).toFixed(2)} $
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
        <span>
          {data?.cursorAutoPath
            ? `Cursor · ${data.cursorAutoPath}`
            : "Cursor · sync auto une fois par jour (session Cursor)"}
        </span>
      </footer>
    </div>
  );
}
