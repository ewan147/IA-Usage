import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { sprites, type ClawdBuddyId } from "../assets/clawd/sprites";

const SRC: Record<ClawdBuddyId, string> = {
  sparkles: sprites.sparkles,
  sunglasses: sprites.sunglasses,
  halo: sprites.halo,
  blast: sprites.blast,
  skate: sprites.skate,
  invader: sprites.invader,
  arrows: sprites.arrows,
  flag: sprites.flag,
};

type Props = {
  id: ClawdBuddyId;
  size?: number;
  className?: string;
  title?: string;
  onClick?: () => void;
} & Omit<HTMLMotionProps<"button">, "children" | "id" | "onClick" | "title">;

export function ClawdSprite({
  id,
  size = 36,
  className,
  title,
  onClick,
  ...motionProps
}: Props) {
  if (onClick) {
    return (
      <motion.button
        type="button"
        className={`clawd-sprite ${className ?? ""}`}
        title={title}
        onClick={onClick}
        style={{ width: size, height: size }}
        {...motionProps}
      >
        <img src={SRC[id]} alt="" draggable={false} />
      </motion.button>
    );
  }

  return (
    <motion.span
      className={`clawd-sprite ${className ?? ""}`}
      title={title}
      style={{ width: size, height: size, display: "inline-flex" }}
      {...(motionProps as HTMLMotionProps<"span">)}
    >
      <img src={SRC[id]} alt="" draggable={false} />
    </motion.span>
  );
}
