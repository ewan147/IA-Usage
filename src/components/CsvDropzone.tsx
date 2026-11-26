import { openUrl } from "@tauri-apps/plugin-opener";
import { sprites } from "../assets/clawd/sprites";

type Props = {
  importedAt: string | null;
  syncError: string | null;
  manual: boolean;
  busy?: boolean;
  message: string | null;
  onManual: (file: File) => Promise<void>;
  onAuto: () => Promise<void>;
  onError: (error: unknown) => void;
};

export function CsvDropzone({ importedAt, syncError, manual, busy, message, onManual, onAuto, onError }: Props) {
  return (
    <div className="dropzone">
      <img src={sprites.cursorLogo} alt="" className="dropzone-logo" />
      <div>
        <p className="dropzone-title">Données Cursor</p>
        <p className="dropzone-sub">
          Exporte l’historique souhaité depuis le tableau de bord Cursor. Un import remplace l’historique Cursor affiché.
        </p>
        {importedAt && (
          <p className="dropzone-meta">
            Dernier import : {new Date(importedAt).toLocaleString("fr-FR")}
          </p>
        )}
        {syncError && <p className="dropzone-error">Synchronisation indisponible. {syncError}</p>}
        {manual && <p className="dropzone-meta">Mode CSV manuel. La synchronisation automatique est en pause.</p>}
        {message && <p className="dropzone-meta" role="status">{message}</p>}
      </div>
      <div className="dropzone-actions">
        <button type="button" className="ghost file-alt" onClick={() => void openUrl("https://cursor.com/dashboard/usage").catch(onError)}>
          Ouvrir le tableau de bord Cursor
        </button>
        <input
          aria-label="Importer un CSV Cursor"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onManual(file);
          }}
        />
        <button type="button" className="ghost file-alt" disabled={busy} onClick={() => void onAuto()}>
          Synchroniser avec Cursor
        </button>
      </div>
    </div>
  );
}
