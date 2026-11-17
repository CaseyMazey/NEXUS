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

`npm run screenshots` erzeugt die Bilder der Repo-README neu (`docs/screenshots/`). Das Skript nutzt einen eigenen Demo-Ordner mit erfundenen Projekten und nie deine echten Daten. Das Gespräch in 3C spielt es als Beispiel ein, es wird nichts an Claude gesendet. In den frischen Demo-Sitzungen der Web-KIs lehnt es die Cookie-Hinweise ab.

## Installer bauen

```bash
npm run dist:win     # Windows: dist/NEXUS-Setup-<version>.exe
npm run dist:mac     # macOS (nur auf einem Mac): dist/NEXUS-mac-arm64.dmg und -x64.dmg
npm run dist:linux   # Linux (nur unter Linux): AppImage und .deb
npm run pack         # nur entpackt, zum Testen
```

Normalerweise baut **GitHub Actions** alle drei Systeme, siehe „Neue Version veröffentlichen“.

**Windows**
- **Installation pro Benutzer**, ohne Admin-Rechte, nach `%LOCALAPPDATA%\Programs\nexus`. Startmenü- und Desktop-Verknüpfung „NEXUS“. Die Verknüpfungen des Prototyps werden dabei ersetzt.
- **Deinstallieren** über Windows-Einstellungen → Apps. Deine Daten in `%APPDATA%\NEXUS` bleiben erhalten.
- Der Installer ist **nicht signiert**: Beim ersten Start warnt Windows SmartScreen („Unbekannter Herausgeber“ → „Weitere Informationen“ → „Trotzdem ausführen“).
- `node-pty` bringt für Windows und macOS fertige Binärdateien mit; beim Bauen wird nichts kompiliert (`npmRebuild: false`). Unter Linux wird es kompiliert (`dist:linux`).

**macOS**
- Ohne Apple-Entwicklerkonto: Die App ist nur ad-hoc signiert (`identity: "-"`), damit sie auf Apple-Silicon-Macs startet. Beim ersten Öffnen braucht es Rechtsklick → Öffnen (Anleitung in der Repo-README).
- Selbst aktualisieren kann sich eine Mac-App ohne Apple-Signatur nicht. NEXUS meldet neue Versionen und öffnet die Download-Seite.
- NEXUS übernimmt beim Start den Programmpfad der Shell (`platform.js`), damit `claude` gefunden wird.

**Linux**
- Das AppImage aktualisiert sich selbst. Beim `.deb` meldet NEXUS neue Versionen nur.
- Oberflächentests gegen die gepackte App: `NEXUS_EXE=dist/win-unpacked/NEXUS.exe npm run test:e2e`.

## Neue Version veröffentlichen (Updates)

```bash
npm run release -- 0.2.0 "Was ist neu – kurz, für Nutzer"
```

Das Skript setzt die Version in `package.json`, committet, legt den Tag `v0.2.0` mit den Notizen an und pusht beides. Es läuft nur auf `main` mit sauberem Arbeitsverzeichnis.

Den Rest erledigt GitHub Actions (`.github/workflows/release.yml`):
- Es baut auf echten Windows-, Mac- und Linux-Rechnern.
- Danach legt es das Release mit allen Dateien an: Setup, `.dmg`, AppImage, `.deb` und die `latest*.yml` für die Updates.
- Zusätzlich gibt es `NEXUS-Setup.exe` mit festem Namen für den Download-Knopf.

Bei jedem Pull Request laufen die Unit-Tests auf allen drei Systemen (`.github/workflows/ci.yml`).

Die installierte App prüft 15 Sekunden nach dem Start und danach alle 6 Stunden auf GitHub Releases (`CaseyMazey/NEXUS`). Ein Update lädt sie im Hintergrund und zeigt dann „Jetzt neu starten“ oder „Später“. Bei „Später“ wird beim Beenden installiert. In ⚙ Einstellungen stehen die Version und „Nach Updates suchen“, und automatische Updates lassen sich dort abschalten.

Zum Testen startet `NEXUS_UPDATE_TEST=1` die gepackte App mit `--nexus-data=<ordner>` samt Update-Prüfung. In diesem Modus wird nur geprüft und geladen, nie installiert.

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
