import type { ModelStat, SourceFilter } from "../lib/types";
import {
  formatHour,
  formatTokens,
  formatTokensFull,
  prettyModel,
} from "../lib/format";

type Props = {
  hourCounts: number[];
  avgHour: number | null;
  models: ModelStat[];
  source: SourceFilter;
  periodLabel: string;
};

export function PeriodInsights({
  hourCounts,
  avgHour,
  models,
  source,
  periodLabel,
}: Props) {
  const maxHour = Math.max(...hourCounts, 1);
  const filtered = models.filter((m) => {
    if (source === "claude") return m.source === "claude";
    if (source === "cursor") return m.source === "cursor";
    return true;
  });

  return (
    <section className="panel insights">
      <div className="panel-head">
        <h2>Période ({periodLabel})</h2>
        <p>
          Heure moyenne : <strong>{formatHour(avgHour)}</strong>
        </p>
      </div>

      <div className="detail-grid">
        <article className="detail-card wide">
          <h3>Heures d’usage — {periodLabel}</h3>
          <div className="hour-bars">
            {hourCounts.map((count, hour) => (
              <div key={hour} className="hour-col" title={`${hour}h : ${count}`}>
                <div
                  className="hour-bar"
                  style={{
                    height: `${Math.max(count > 0 ? 8 : 2, (count / maxHour) * 100)}%`,
                  }}
                />
                <span>{hour}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="detail-card wide">
          <h3>
            {source === "cursor"
              ? "Modèles Cursor"
              : source === "claude"
                ? "Modèles Claude"
                : "Modèles (Claude + Cursor)"}
          </h3>
          {filtered.length === 0 ? (
            <p className="muted">Aucun modèle sur cette période / filtre.</p>
          ) : (
            <ul className="model-list">
              {filtered.map((m) => (
                <li key={`${m.source}-${m.model}`}>
                  <span>
                    <em className={`src-tag ${m.source}`}>{m.source}</em>{" "}
                    {prettyModel(m.model)}
                  </span>
                  <span title={formatTokensFull(m.tokens)}>
                    {formatTokens(m.tokens)}
                  </span>
                  <span>{m.requests} req</span>
                  <span>{formatTokensFull(m.tokens)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
