import { useRef } from "react";
import { sprites } from "./assets/clawd/sprites";
import { showDashboard } from "./lib/api";

/** Minimal widget UI — no layout chrome, just the transparent mascot. */
export function WidgetApp() {
  const opening = useRef(false);

  const openDashboard = () => {
    if (opening.current) return;
    opening.current = true;
    // pointerdown is closer to the OS input event than click — better foreground rights.
    void showDashboard()
      .catch(() => showDashboard())
      .finally(() => {
        window.setTimeout(() => {
          opening.current = false;
        }, 400);
      });
  };

  return (
    <button
      type="button"
      className="widget-hit"
      title="IA Usage"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        openDashboard();
      }}
    >
      <img src={sprites.sparkles} alt="" draggable={false} />
    </button>
  );
}
