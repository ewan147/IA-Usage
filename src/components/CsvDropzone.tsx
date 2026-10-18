import { sprites } from "../assets/clawd/sprites";

type Props = {
  importedAt: string | null;
  autoPath: string | null;
  busy?: boolean;
  onManual: (content: string) => Promise<void>;
  onAuto: () => Promise<void>;
};

export function CsvDropzone({ importedAt, autoPath, busy, onManual, onAuto }: Props) {
  return (
    <div className="dropzone">
      <img src={sprites.cursorLogo} alt="" className="dropzone-logo" />
      <div>
        <p className="dropzone-title">Cursor — sync auto</p>
        <p className="dropzone-sub">
          Une fois par jour, l’app télécharge ton usage depuis cursor.com avec la session
          Cursor déjà ouverte sur ce PC. Fallback : CSV dans Téléchargements.
        </p>
        {autoPath && <p className="dropzone-meta">Fichier : {autoPath}</p>}
        {importedAt && (
          <p className="dropzone-meta">
            Dernier import : {new Date(importedAt).toLocaleString("fr-FR")}
          </p>
        )}
      </div>
      <div className="dropzone-actions">
        <button type="button" className="file-btn" disabled={busy} onClick={() => void onAuto()}>
          {busy ? "Import…" : "Chercher le CSV"}
        </button>
        <label className="ghost file-alt">
          Manuel
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(onManual);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
