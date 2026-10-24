import {
  CHART_METRIC_OPTIONS,
  CHART_SCALE_OPTIONS,
  CHART_STYLE_OPTIONS,
  FONT_PRESETS,
  type AppSettings,
  type ChartMetric,
  type ChartScale,
  type ChartStyle,
  type FontPreset,
} from "../lib/settings";

type Props = {
  open: boolean;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
};

type ChoiceProps<T extends string> = {
  options: { id: T; label: string; hint: string }[];
  value: T;
  onPick: (id: T) => void;
};

function ChoiceGrid<T extends string>({ options, value, onPick }: ChoiceProps<T>) {
  return (
    <div className="settings-choices">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`settings-choice ${value === opt.id ? "active" : ""}`}
          onClick={() => onPick(opt.id)}
        >
          <span className="settings-choice-label">{opt.label}</span>
          <span className="settings-choice-hint">{opt.hint}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`settings-toggle ${checked ? "on" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="settings-toggle-text">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}

export function SettingsPanel({ open, settings, onChange, onClose }: Props) {
  if (!open) return null;

  const patch = (partial: Partial<AppSettings>) =>
    onChange({ ...settings, ...partial });

  const setFont = (font: FontPreset) => patch({ font });

  const toggleClaude = () => {
    const enableClaude = !settings.enableClaude;
    if (!enableClaude && !settings.enableCursor) return;
    patch({ enableClaude });
  };

  const toggleCursor = () => {
    const enableCursor = !settings.enableCursor;
    if (!enableCursor && !settings.enableClaude) return;
    patch({ enableCursor });
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
                style={{ fontFamily: FONT_PRESETS[id].body }}
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
            <Toggle
              label="Claude Code"
              checked={settings.enableClaude}
              onChange={toggleClaude}
            />
            <Toggle
              label="Cursor"
              checked={settings.enableCursor}
              onChange={toggleCursor}
            />
          </div>
        </section>

        <section className="settings-block">
          <h3>Métrique du graphique</h3>
          <p className="settings-hint">Ce que mesurent les barres / la courbe.</p>
          <ChoiceGrid<ChartMetric>
            options={CHART_METRIC_OPTIONS}
            value={settings.chartMetric}
            onPick={(chartMetric) => patch({ chartMetric })}
          />
        </section>

        <section className="settings-block">
          <h3>Style de graphique</h3>
          <p className="settings-hint">Plusieurs façons de voir la même conso.</p>
          <ChoiceGrid<ChartStyle>
            options={CHART_STYLE_OPTIONS}
            value={settings.chartStyle}
            onPick={(chartStyle) => patch({ chartStyle })}
          />
        </section>

        <section className="settings-block">
          <h3>Échelle</h3>
          <p className="settings-hint">Valeur du jour, ou total qui s’accumule.</p>
          <ChoiceGrid<ChartScale>
            options={CHART_SCALE_OPTIONS}
            value={settings.chartScale}
            onPick={(chartScale) => patch({ chartScale })}
          />
        </section>

        <section className="settings-block">
          <h3>Blocs visibles</h3>
          <p className="settings-hint">Affiche ou masque les parties du dashboard.</p>
          <div className="settings-toggles">
            <Toggle
              label="Cartes totaux"
              hint="Claude / Cursor / Total en haut"
              checked={settings.showStatCards}
              onChange={() => patch({ showStatCards: !settings.showStatCards })}
            />
            <Toggle
              label="Coût sur les cartes"
              hint="Ligne $ sous les totaux"
              checked={settings.showCostOnCards}
              onChange={() =>
                patch({ showCostOnCards: !settings.showCostOnCards })
              }
            />
            <Toggle
              label="Répartition par heure"
              hint="Graphique 0–23 h"
              checked={settings.showHourChart}
              onChange={() => patch({ showHourChart: !settings.showHourChart })}
            />
            <Toggle
              label="Classement modèles"
              hint="Liste des modèles utilisés"
              checked={settings.showModels}
              onChange={() => patch({ showModels: !settings.showModels })}
            />
            <Toggle
              label="Graphique principal"
              hint="Par jour / ligne / calendrier"
              checked={settings.showDayChart}
              onChange={() => patch({ showDayChart: !settings.showDayChart })}
            />
            <Toggle
              label="Bloc Aujourd’hui"
              hint="Résumé du jour en cours"
              checked={settings.showToday}
              onChange={() => patch({ showToday: !settings.showToday })}
            />
            <Toggle
              label="Empiler Claude + Cursor"
              hint="Couleurs séparées dans les barres (Global)"
              checked={settings.splitSources}
              onChange={() => patch({ splitSources: !settings.splitSources })}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
