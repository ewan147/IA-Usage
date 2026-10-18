import type { DayBucket, SourceFilter } from "../lib/types";
import {
  formatHour,
  formatTokens,
  formatTokensFull,
  formatUsd,
  hoursForSource,
  prettyModel,
  tokensForSource,
} from "../lib/format";

type Props = {
  day: DayBucket;
  source: SourceFilter;
  onClose: () => void;
};

export function DayDetail({ day, source, onClose }: Props) {
  const hours = hoursForSource(day, source);
  const maxHour = Math.max(...hours, 1);
  const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dayMain = tokensForSource(day, source);
  const models = day.models.filter((m) => {
    if (source === "claude") return m.source === "claude";
    if (source === "cursor") return m.source === "cursor";
    return true;
  });

  return (
    <section className="day-detail">
      <div className="day-detail-head">
        <div>
          <h2>{dateLabel}</h2>
          <p className="detail-hero-num" title={formatTokensFull(dayMain)}>
            {formatTokens(dayMain)}
          </p>
          <p className="detail-hero-full">{formatTokensFull(dayMain)} tokens</p>
          <p className="muted">
            {day.requestCount} requêtes · {formatUsd(day.estimatedCostUsd)}
          </p>
        </div>
        <button type="button" className="ghost" onClick={onClose}>
          Fermer
        </button>
      </div>

      <div className="detail-grid">
        <article className="detail-card">
          <h3>Split</h3>
          <p className="split-lines">
            {source !== "cursor" && (
              <span className="pill claude">
                Claude {formatTokens(day.claudeTokens)}
                <small>{formatTokensFull(day.claudeTokens)}</small>
              </span>
            )}
            {source !== "claude" && (
              <span className="pill cursor">
                Cursor {formatTokens(day.cursorTokens)}
                <small>{formatTokensFull(day.cursorTokens)} (Total Tokens CSV)</small>
              </span>
            )}
          </p>
        </article>

        <article className="detail-card">
          <h3>Modèle préféré</h3>
          <p className="big">
            {models[0] ? prettyModel(models[0].model) : "—"}
          </p>
          <p className="muted small">Heure moyenne : {formatHour(day.avgHour)}</p>
        </article>
      </div>

      <div className="detail-grid">
        <article className="detail-card wide">
          <h3>Modèles ce jour</h3>
          {models.length === 0 ? (
            <p className="muted">Aucun modèle pour ce filtre.</p>
          ) : (
            <ul className="model-list">
              {models.map((m) => (
                <li key={`${m.source}-${m.model}`}>
                  <span>
                    <em className={`src-tag ${m.source}`}>{m.source}</em>{" "}
                    {prettyModel(m.model)}
                  </span>
                  <span title={formatTokensFull(m.tokens)}>{formatTokens(m.tokens)}</span>
                  <span>{m.requests} req</span>
                  <span>{formatTokensFull(m.tokens)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="detail-card wide">
          <h3>Heures d’activité (jour)</h3>
          <div className="hour-bars">
            {hours.map((count, hour) => (
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
      </div>
    </section>
  );
}
