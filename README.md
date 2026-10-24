# IA Usage

Dashboard Windows pour ta conso tokens **Claude Code** + **Cursor**, avec un petit Clawd collé en bas à droite des fenêtres.

```
Cursor / Claude  →  [Clawd]  →  clic  →  dashboard
```

## Install rapide (Windows)

Une commande depuis le repo cloné :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

Ça build si besoin, installe dans `%LOCALAPPDATA%\IA-Usage`, active le **démarrage Windows**, crée un raccourci bureau, et lance l’app. Au prochain login, le logo est déjà là.

## Ce que ça fait

| Source | Données |
| --- | --- |
| **Claude Code** | Logs locaux `~/.claude/projects/**/*.jsonl` (1 appel API = 1 total, dédup streaming) |
| **Cursor** | CSV officiel `cursor.com` via ta session Cursor (Total Tokens, jour local) |

Le widget suit Cursor et Claude. Clic = ouvrir le dashboard (qui reste en fond si tu le fermes).

## Dev

```bash
npm install
npm run tauri dev
```

Build seul :

```bash
npm run tauri build
```

## Releases

Les builds Windows partent aussi via GitHub Actions (tag `v*` ou manuel). Voir l’onglet [Releases](https://github.com/ewan147/IA-Usage/releases).
