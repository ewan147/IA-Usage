import type { ChartMetric, ChartScale, ChartStyle } from "../lib/settings";
import type { DayBucket, SourceFilter } from "../lib/types";
import {
  formatMetricValue,
  metricForSource,
  metricUnitLabel,
  shortDate,
  toCumulative,
} from "../lib/format";

type Props = {
  days: DayBucket[];
  source: SourceFilter;
  selectedDate: string | null;
  onSelect: (date: string) => void;
  metric: ChartMetric;
  chartStyle: ChartStyle;
  scale: ChartScale;
  splitSources: boolean;
};

export function DayChart({
  days,
  source,
  selectedDate,
  onSelect,
  metric,
  chartStyle,
  scale,
  splitSources,
}: Props) {
  const raw = days.map((d) => metricForSource(d, source, metric));
  const values = scale === "cumulative" ? toCumulative(raw) : raw;
  const max = Math.max(...values, 1e-9);

  if (chartStyle === "heatmap") {
    return (
      <Heatmap
        days={days}
        values={values}
        max={max}
        metric={metric}
        selectedDate={selectedDate}
        onSelect={onSelect}
      />
    );
  }

  if (chartStyle === "line" || chartStyle === "area") {
    return (
      <LineAreaChart
        days={days}
        values={values}
        max={max}
        metric={metric}
        filled={chartStyle === "area"}
        selectedDate={selectedDate}
        onSelect={onSelect}
      />
    );
  }

  return (
    <div className="chart">
      <div className="chart-bars" role="list">
        {days.map((day, i) => {
          const value = values[i];
          const height = Math.max(4, (value / max) * 100);
          const canSplit =
            splitSources &&
            source === "all" &&
            scale === "daily" &&
            metric === "tokens" &&
            day.totalTokens > 0;
          const claudeShare = canSplit
            ? (day.claudeTokens / day.totalTokens) * 100
            : 0;
          const selected = selectedDate === day.date;
          return (
            <button
              key={day.date}
              type="button"
              role="listitem"
              className={`chart-col ${selected ? "selected" : ""}`}
              title={`${day.date}: ${formatMetricValue(value, metric)} ${metricUnitLabel(metric)}`}
              onClick={() => onSelect(day.date)}
            >
              <div className="chart-bar" style={{ height: `${height}%` }}>
                {canSplit ? (
                  <>
                    <span
                      className="chart-seg claude"
                      style={{ height: `${claudeShare}%` }}
                    />
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

function LineAreaChart({
  days,
  values,
  max,
  metric,
  filled,
  selectedDate,
  onSelect,
}: {
  days: DayBucket[];
  values: number[];
  max: number;
  metric: ChartMetric;
  filled: boolean;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  const w = 640;
  const h = 180;
  const padX = 8;
  const padY = 12;
  const n = Math.max(days.length, 1);
  const step = n <= 1 ? 0 : (w - padX * 2) / (n - 1);

  const points = values.map((v, i) => {
    const x = padX + i * step;
    const y = h - padY - (v / max) * (h - padY * 2);
    return { x, y, v, date: days[i]?.date ?? "" };
  });

  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaD =
    points.length === 0
      ? ""
      : `${lineD} L ${points[points.length - 1].x.toFixed(1)} ${(h - padY).toFixed(1)} L ${points[0].x.toFixed(1)} ${(h - padY).toFixed(1)} Z`;

  return (
    <div className="chart chart-line">
      <svg
        className="line-svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Graphique"
      >
        <line
          className="line-baseline"
          x1={padX}
          x2={w - padX}
          y1={h - padY}
          y2={h - padY}
        />
        {filled && areaD && <path className="line-area" d={areaD} />}
        {lineD && <path className="line-path" d={lineD} fill="none" />}
        {points.map((p) => {
          const selected = selectedDate === p.date;
          return (
            <circle
              key={p.date}
              className={`line-dot ${selected ? "selected" : ""}`}
              cx={p.x}
              cy={p.y}
              r={selected ? 5.5 : 3.5}
              onClick={() => onSelect(p.date)}
            >
              <title>
                {p.date}: {formatMetricValue(p.v, metric)}{" "}
                {metricUnitLabel(metric)}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="line-labels">
        {days.map((day, i) => {
          if (days.length > 14 && i % Math.ceil(days.length / 10) !== 0) {
            return <span key={day.date} />;
          }
          return (
            <button
              key={day.date}
              type="button"
              className={`line-label ${selectedDate === day.date ? "selected" : ""}`}
              onClick={() => onSelect(day.date)}
            >
              {shortDate(day.date)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Heatmap({
  days,
  values,
  max,
  metric,
  selectedDate,
  onSelect,
}: {
  days: DayBucket[];
  values: number[];
  max: number;
  metric: ChartMetric;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="chart chart-heat" role="list">
      {days.map((day, i) => {
        const value = values[i];
        const intensity = value <= 0 ? 0 : Math.min(1, 0.18 + (value / max) * 0.82);
        const selected = selectedDate === day.date;
        return (
          <button
            key={day.date}
            type="button"
            role="listitem"
            className={`heat-cell ${selected ? "selected" : ""} ${value <= 0 ? "empty" : ""}`}
            style={{ ["--heat" as string]: String(intensity) }}
            title={`${day.date}: ${formatMetricValue(value, metric)} ${metricUnitLabel(metric)}`}
            onClick={() => onSelect(day.date)}
          >
            <span className="heat-day">{day.date.slice(8)}</span>
            <span className="heat-val">{formatMetricValue(value, metric)}</span>
          </button>
        );
      })}
    </div>
  );
}
