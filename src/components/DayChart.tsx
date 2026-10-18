import type { DayBucket, SourceFilter } from "../lib/types";
import { formatTokens, shortDate, tokensForSource } from "../lib/format";

type Props = {
  days: DayBucket[];
  source: SourceFilter;
  selectedDate: string | null;
  onSelect: (date: string) => void;
};

export function DayChart({ days, source, selectedDate, onSelect }: Props) {
  const values = days.map((d) => tokensForSource(d, source));
  const max = Math.max(...values, 1);

  return (
    <div className="chart">
      <div className="chart-bars" role="list">
        {days.map((day, i) => {
          const value = values[i];
          const height = Math.max(4, (value / max) * 100);
          const claudeShare =
            day.totalTokens > 0 ? (day.claudeTokens / day.totalTokens) * 100 : 0;
          const selected = selectedDate === day.date;
          return (
            <button
              key={day.date}
              type="button"
              role="listitem"
              className={`chart-col ${selected ? "selected" : ""}`}
              title={`${day.date}: ${formatTokens(value)} tokens — cliquer pour détail`}
              onClick={() => onSelect(day.date)}
            >
              <div className="chart-bar" style={{ height: `${height}%` }}>
                {source === "all" && day.totalTokens > 0 ? (
                  <>
                    <span className="chart-seg claude" style={{ height: `${claudeShare}%` }} />
                    <span
                      className="chart-seg cursor"
                      style={{ height: `${100 - claudeShare}%` }}
                    />
                  </>
                ) : (
                  <span
                    className={`chart-seg ${source === "cursor" ? "cursor" : "claude"}`}
                    style={{ height: "100%" }}
                  />
                )}
              </div>
              <span className="chart-label">{shortDate(day.date)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
