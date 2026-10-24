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
  showHourChart: boolean;
  showModels: boolean;
};

export function PeriodInsights({
  hourCounts,
  avgHour,
  models,
  source,
  periodLabel,
  showHourChart,
  showModels,
}: Props) {
  if (!showHourChart && !showModels) return null;

  const maxHour = Math.max(...hourCounts, 1);
  const filtered = models.filter((m) => {
    if (source === "claude") return m.source === "claude";
    if (source === "cursor") return m.source === "cursor";
    return true;
  });

  return (
    <section className="panel insights">
      <div className="panel-head">
        <h2>Sur {periodLabel}</h2>
        <p>
          Activité moyenne vers <strong>{formatHour(avgHour)}</strong>
        </p>
      </div>

      <div className="detail-grid">
        {showHourChart && (
          <article className="detail-card wide">
            <h3>Répartition par heure</h3>
            <div className="hour-bars">
              {hourCounts.map((count, hour) => (
                <div
                  key={hour}
                  className="hour-col"
                  title={`${hour}h : ${count}`}
                >
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
        )}

        {showModels && (
          <article className="detail-card wide">
            <h3>
              {source === "cursor"
                ? "Modèles Cursor"
                : source === "claude"
                  ? "Modèles Claude"
                  : "Modèles utilisés"}
            </h3>
            {filtered.length === 0 ? (
              <p className="muted">Rien à afficher pour ce filtre.</p>
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
        )}
      </div>
    </section>
  );
}
