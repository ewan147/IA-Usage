import { useRef } from "react";
import { SPARKLES_DATA_URL } from "./assets/clawd/sparklesDataUrl";
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
      {/* Data-URL sprite: never depends on asset:// path resolution */}
      <img src={SPARKLES_DATA_URL} alt="" draggable={false} />
    </button>
  );
}
