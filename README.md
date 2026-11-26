# IA Usage

**See your Claude Code and Cursor token history in one Windows dashboard.** A small desktop widget follows the active Cursor or Claude window. Click it to open your charts and model breakdown.

![IA Usage dashboard with sample data](docs/dashboard-demo.png)

*Dashboard shown with sample data.*

## Audio summary demo

In the local Windows build, the **Résumé audio** button turns a completed Claude or Cursor reply into a short spoken summary in French. Summarization and speech synthesis run on the PC. [Listen to a demo made from a fictional reply](docs/audio-summary-demo.wav?raw=1).

The current downloadable Windows preview only includes the usage dashboard and CSV import. The audio button and its local models are separate from that installer.

## Install on Windows

**[Download the Windows x64 installer](https://github.com/ewan147/IA-Usage/releases/download/0.1.0-preview.1/IA.Usage_0.1.0_x64-setup.exe)** · [MSI and release notes](https://github.com/ewan147/IA-Usage/releases/tag/0.1.0-preview.1). To build from source, install [Node.js 24 LTS](https://nodejs.org/) and the [Windows prerequisites for Tauri](https://v2.tauri.app/start/prerequisites/#windows), then run:

```powershell
git clone https://github.com/ewan147/IA-Usage.git
cd IA-Usage
npm ci
npm run tauri build
```

The Windows app enables startup for the current user when launched in a release build. The optional `scripts/setup.ps1` script also creates a desktop shortcut and opens the app.

## What the numbers mean

| Source | Data |
| --- | --- |
| **Claude Code** | Local session logs. Streaming updates for the same call are deduplicated. USD figures use estimated API prices. |
| **Cursor** | Usage events from the dashboard CSV. Totals include cache tokens and group events by local date. |

The dashboard reads local Claude Code logs. Cursor sync connects to cursor.com and keeps the latest imported export and totals on your PC. If automatic sync fails, open **Données Cursor** in IA Usage, export the desired date range from the Cursor dashboard, then select the CSV. Each manual import replaces the displayed Cursor history and pauses automatic sync. A successful **Synchroniser avec Cursor** starts it again. Cursor's newer plans can share a weekly allowance with Grok. IA Usage displays event totals for all rows in the export. If the export includes Grok Bot, filter to Cursor in the dashboard before exporting. The app does not show your remaining allowance. [Cursor usage limits](https://cursor.com/help/models-and-usage/usage-limits)

Trying IA Usage on a clean install? Use the [sample Cursor export](campaign/cursor-demo.csv) and choose **Total** to see all three events. Importing the sample replaces any Cursor history already in IA Usage. Share what worked or what failed in the [Windows preview feedback form](https://github.com/ewan147/IA-Usage/issues/new?template=windows-preview.yml). Keep account details, session data and private logs out of public reports. If the widget saves you a trip to the usage dashboard, a star helps other Windows users find it.

## En français

IA Usage rassemble l’historique des tokens Claude Code et Cursor dans un tableau de bord Windows. Clique sur la mascotte près de la fenêtre active pour l’afficher. Les coûts Claude Code sont estimés d’après des tarifs API. Pour Cursor, l’application affiche les événements disponibles dans l’export du compte. Le quota hebdomadaire restant est consultable dans Cursor.

Dans la version locale de Windows, le bouton **Résumé audio** résume une réponse terminée de Claude ou de Cursor et la lit en français. La préversion publique propose le tableau de bord et l’import CSV. [Écouter la démo sur une réponse fictive](docs/audio-summary-demo.wav?raw=1).

[Télécharger la préversion Windows x64](https://github.com/ewan147/IA-Usage/releases/tag/0.1.0-preview.1) · [Donner un retour](https://github.com/ewan147/IA-Usage/issues/new?template=windows-preview.yml)

Build de développement : `npm ci`, puis `npm run tauri dev`.
