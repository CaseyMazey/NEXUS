# NEXUS (App)

Die richtige NEXUS-App (Phase 1). Der Prototyp liegt weiter unter `spike/terminal-test` und bleibt startbar, bis diese App alles kann.

NEXUS ist ein **lokaler Rahmen für KIs**: Jede Person verbindet ihre eigenen KIs und meldet sich dort selbst an. NEXUS hat kein eigenes Konto, keinen Server und speichert keine Zugangsdaten. 3C (der Claude-Code-Chat) nutzt das installierte Claude Code der jeweiligen Person.

## Starten und testen

```bash
npm install
npm start          # NEXUS mit deinen Daten (%APPDATA%\NEXUS)
npm test           # Unit-Tests + Oberflächentests (eigener, leerer Datenordner)
npm run lint
```

`npm start -- --nexus-data=<ordner>` startet mit einem anderen Datenordner.

## Installer bauen

```bash
npm run dist       # dist/NEXUS-Setup-<version>.exe
npm run pack       # nur entpackt: dist/win-unpacked/NEXUS.exe (zum Testen)
```

- **Installation pro Benutzer**, ohne Admin-Rechte, nach `%LOCALAPPDATA%\Programs\nexus`. Startmenü- und Desktop-Verknüpfung „NEXUS“. Die Verknüpfungen des Prototyps werden dabei ersetzt.
- **Deinstallieren** über Windows-Einstellungen → Apps. Deine Daten in `%APPDATA%\NEXUS` bleiben erhalten.
- Der Installer ist **nicht signiert**: Beim ersten Start warnt Windows SmartScreen („Unbekannter Herausgeber“ → „Weitere Informationen“ → „Trotzdem ausführen“).
- `node-pty` bringt fertige Binärdateien mit; beim Bauen wird nichts kompiliert (`npmRebuild: false`).
- Oberflächentests gegen die gepackte App: `NEXUS_EXE=dist/win-unpacked/NEXUS.exe npm run test:e2e`.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/main/` | Hauptprozess: `index.js` (Start, Fenster, Benachrichtigung), `ipc.js` (alle Aufrufe aus der Oberfläche), `store.js` (Datenspeicher), `legacy.js` (Umzug vom Prototyp), `projects.js`, `agents.js` (Claude Code: Terminal + 3C), `chat.js`, `sessions.js`, `webviews.js` (Web-KIs), `settings.js`, `validate.js`, `i18n.js` |
| `src/preload/` | Brücke zur Oberfläche (nur für NEXUS selbst, nie für Anbieterseiten) |
| `src/renderer/` | Oberfläche: `core.js` (Sprache, Zustand, Dialoge), `theme.js` (Themes, Einstellungen), `projects.js`, `desk.js`, `ais.js`, `chatview.js` (3C), `main.js` (Start) |
| `locales/` | Texte auf Deutsch (`de.json`) und Englisch (`en.json`) |
| `test/unit/` | Tests ohne Electron (`node:test`) |
| `test/e2e/` | Oberflächentests mit Playwright, starten die echte App |

## Daten

- Ort: `%APPDATA%\NEXUS\nexus-data.json` mit Versionsnummer (`version`), Migrationen in `store.js`.
- Speichern ist atomar (temporäre Datei, dann umbenennen). Sicherungen: `backups\`, eine pro Tag, die letzten 7.
- Ist die Datei beschädigt, wird sie beiseitegelegt und die neueste Sicherung geladen.
- **Umzug vom Prototyp:** Beim ersten Start wird `%APPDATA%\nexus-terminal-test` kopiert (ohne Caches, mit den Anmeldungen der Web-KIs). Der alte Ordner bleibt unverändert. Läuft der Prototyp noch, bittet NEXUS, ihn zuerst zu schließen.

## Sprache

Einstellung ⚙ → Sprache: „Wie Windows“ (Standard), Deutsch oder English. Neue Texte kommen in beide Dateien unter `locales/`. Der Test `i18n.test.js` prüft, dass jeder Schlüssel im Code in beiden Sprachen existiert und die Platzhalter übereinstimmen.

## Regeln

- Anbieterseiten bekommen nie einen Preload und keine eingeschleusten Skripte.
- NEXUS löscht nie Ordner oder Dateien der Nutzer. „Entfernen“ nimmt Projekte nur aus NEXUS heraus.
- Clippy 📎 in 3C bleibt.
