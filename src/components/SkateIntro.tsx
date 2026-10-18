import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ClawdSprite } from "./ClawdSprite";

/** Skate Clawd rolls across the top bar once when the app opens. */
export function SkateIntro({ replayKey = 0 }: { replayKey?: number }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 2800);
    return () => window.clearTimeout(t);
  }, [replayKey]);

  return (
    <div className="skate-track" aria-hidden>
      <AnimatePresence>
        {show && (
          <motion.div
            className="skate-runner"
            initial={{ left: "-10%", rotate: -6 }}
            animate={{ left: "110%", rotate: [ -6, 4, -3, 0 ] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: [0.22, 0.8, 0.3, 1] }}
          >
            <ClawdSprite id="skate" size={44} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
