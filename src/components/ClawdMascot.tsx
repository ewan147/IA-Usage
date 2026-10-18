import { sprites } from "../assets/clawd/sprites";

type Props = {
  size?: number;
  className?: string;
  onClick?: () => void;
  /** kept for API compat — always static transparent sprite */
  static?: boolean;
  mood?: string;
};

export function ClawdMascot({ size = 96, className, onClick }: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        outline: "none",
      }}
      aria-label="Clawd"
      title="Clique pour rafraîchir + roller"
    >
      <img
        src={sprites.sparkles}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </button>
  );
}
