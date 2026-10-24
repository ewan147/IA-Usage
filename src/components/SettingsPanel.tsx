import {
  FONT_PRESETS,
  type AppSettings,
  type FontPreset,
} from "../lib/settings";

type Props = {
  open: boolean;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
};

export function SettingsPanel({ open, settings, onChange, onClose }: Props) {
  if (!open) return null;

  const setFont = (font: FontPreset) => onChange({ ...settings, font });

  const toggleClaude = () => {
    const enableClaude = !settings.enableClaude;
    if (!enableClaude && !settings.enableCursor) return;
    onChange({ ...settings, enableClaude });
  };

  const toggleCursor = () => {
    const enableCursor = !settings.enableCursor;
    if (!enableCursor && !settings.enableClaude) return;
    onChange({ ...settings, enableCursor });
  };

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <aside
        className="settings-panel"
        role="dialog"
        aria-label="Réglages"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h2>Réglages</h2>
          <button type="button" className="ghost settings-close" onClick={onClose}>
            Fermer
          </button>
        </div>

        <section className="settings-block">
          <h3>Police</h3>
          <p className="settings-hint">Change l’apparence du texte dans toute l’app.</p>
          <div className="settings-fonts">
            {(Object.keys(FONT_PRESETS) as FontPreset[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`settings-font ${settings.font === id ? "active" : ""}`}
                style={{
                  fontFamily: FONT_PRESETS[id].body,
                }}
                onClick={() => setFont(id)}
              >
                <span className="settings-font-label">{FONT_PRESETS[id].label}</span>
                <span
                  className="settings-font-sample"
                  style={{ fontFamily: FONT_PRESETS[id].display }}
                >
                  Aa 123
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-block">
          <h3>Sources actives</h3>
          <p className="settings-hint">
            Désactive Claude ou Cursor pour ne garder que ce qui t’intéresse.
          </p>
          <div className="settings-toggles">
            <label className={`settings-toggle ${settings.enableClaude ? "on" : ""}`}>
              <input
                type="checkbox"
                checked={settings.enableClaude}
                onChange={toggleClaude}
              />
              <span>Claude Code</span>
            </label>
            <label className={`settings-toggle ${settings.enableCursor ? "on" : ""}`}>
              <input
                type="checkbox"
                checked={settings.enableCursor}
                onChange={toggleCursor}
              />
              <span>Cursor</span>
            </label>
          </div>
        </section>
      </aside>
    </div>
  );
}
