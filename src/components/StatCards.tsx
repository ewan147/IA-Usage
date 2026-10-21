import { formatTokens, formatTokensFull, formatUsd } from "../lib/format";
import type { SourceFilter } from "../lib/types";

type Props = {
  claudeTokens: number;
  cursorTokens: number;
  totalTokens: number;
  claudeCost: number;
  cursorCost: number;
  totalCost: number;
  periodLabel: string;
  source: SourceFilter;
};

export function StatCards({
  claudeTokens,
  cursorTokens,
  totalTokens,
  claudeCost,
  cursorCost,
  totalCost,
  periodLabel,
  source,
}: Props) {
  const allCards = [
    {
      key: "claude" as const,
      label: "Claude",
      tokens: claudeTokens,
      cost: claudeCost,
      tone: "claude" as const,
    },
    {
      key: "cursor" as const,
      label: "Cursor",
      tokens: cursorTokens,
      cost: cursorCost,
      tone: "cursor" as const,
    },
    {
      key: "global" as const,
      label: "Total",
      tokens: totalTokens,
      cost: totalCost,
      tone: "global" as const,
    },
  ];

  const cards = allCards.filter((card) => {
    if (source === "claude") return card.key === "claude";
    if (source === "cursor") return card.key === "cursor";
    return true;
  });

  return (
    <div className={`stats stats-${source}`}>
      {cards.map((card) => (
        <article key={card.key} className={`stat tone-${card.tone}`}>
          <p className="stat-label">{card.label}</p>
          <p className="stat-value" title={formatTokensFull(card.tokens)}>
            {formatTokens(card.tokens)}
          </p>
          <p className="stat-full">{formatTokensFull(card.tokens)} tokens</p>
          <p className="stat-cost">
            {formatUsd(card.cost)} · {periodLabel}
          </p>
        </article>
      ))}
    </div>
  );
}
