# IA Usage

Petite app Windows (Tauri) pour suivre ta conso tokens **Claude Code** et **Cursor**, avec un widget flottant Clawd.

## Fonctionnalités

- **Claude Code** — lecture locale des logs JSONL (`~/.claude/projects`)
- **Cursor** — sync auto 1×/jour depuis cursor.com (session Cursor locale), fallback CSV Téléchargements
- **Widget** — se colle en bas à droite des fenêtres Cursor / Claude ; clic = ouvrir le dashboard

## Lancer

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

L’exécutable sort dans `src-tauri/target/release/`.
