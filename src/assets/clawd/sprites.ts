import sparkles from "./transparent/sparkles.png";
import sunglasses from "./transparent/sunglasses.png";
import halo from "./transparent/halo.png";
import blast from "./transparent/blast.png";
import skate from "./transparent/skate.png";
import invader from "./transparent/invader.png";
import arrows from "./transparent/arrows.png";
import flag from "./transparent/flag.png";
import cursorLogo from "./cursor-logo.png";

export type ClawdMood =
  | "idle"
  | "hover"
  | "open"
  | "loading"
  | "high"
  | "success";

export type ClawdBuddyId =
  | "sparkles"
  | "sunglasses"
  | "halo"
  | "blast"
  | "skate"
  | "invader"
  | "arrows"
  | "flag";

export const sprites = {
  idle: sparkles,
  idleTransparent: sparkles,
  hover: sunglasses,
  hoverAlt: halo,
  open: blast,
  openAlt: skate,
  loading: invader,
  high: arrows,
  success: flag,
  sparkles,
  sunglasses,
  halo,
  blast,
  skate,
  invader,
  arrows,
  flag,
  cursorLogo,
} as const;

export function spriteForMood(mood: ClawdMood, tick = 0): string {
  switch (mood) {
    case "idle":
      return sprites.sparkles;
    case "hover":
      return tick % 2 === 0 ? sprites.sunglasses : sprites.halo;
    case "open":
      return tick % 2 === 0 ? sprites.blast : sprites.skate;
    case "loading":
      return sprites.invader;
    case "high":
      return sprites.arrows;
    case "success":
      return sprites.flag;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}
