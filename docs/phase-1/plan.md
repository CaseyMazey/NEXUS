# Phase 1 – Vom Prototyp zur richtigen App

Stand: 2026-11-16 · Status: **Vorschlag, noch nicht entschieden**

## Ausgangslage

Phase 0 ist abgeschlossen: Der Prototyp in `spike/terminal-test` wird täglich benutzt und hat sich bewährt (Desks, Claude-Code-Chat, Terminal, Meine KIs, Projektverwaltung, helles Theme). Er ist aber als Wegwerf-Test gebaut:

| Thema | Heute | Problem |
|---|---|---|
| Ort | `spike/terminal-test`, Paketname `nexus-terminal-test` | sieht nach Test aus, Daten liegen unter `%APPDATA%\nexus-terminal-test` |
| Start | Verknüpfung auf `electron.exe` im Projektordner | braucht `node_modules` und den Quellordner; kein Installer |
| Code | `app.js` 750 Zeilen, `main.js` 440 Zeilen, alles in wenigen Dateien | schwer zu erweitern |
| Daten | `nexus-data.json` wird direkt überschrieben, kein Versionsfeld | Absturz beim Speichern kann die Datei zerstören; keine geordneten Updates des Datenformats |
| Tests | Selbsttests per Startparameter in `main.js` | kein echter Testlauf, hängt am Produktivcode |
| Updates | keine | jede Änderung heißt: Quellcode holen, `npm install` |

## Ziel von Phase 1

NEXUS ist ein installierbares Windows-Programm: **Setup ausführen → NEXUS im Startmenü → Updates kommen nach**. Alle heutigen Daten (Projekte, Desks, KIs mit Anmeldung, Einstellungen) werden übernommen. Funktional ändert sich zunächst nichts; danach kommen die MVP-Funktionen aus dem Konzept.

## Meilensteine

### M1 – Fundament: Umzug in eine saubere App-Struktur
- Neuer Ordner `app/` im selben Repo; `spike/` bleibt als Archiv stehen.
- Paketname `nexus`, Version `0.1.0`, App-ID `NEXUS`.
- Aufteilung in Module:
  - `app/main/`: `store` (Daten), `projects`, `desks`, `terminal`, `chat`, `webviews`, `ipc`, `window`
  - `app/renderer/`: `sidebar`, `desk`, `workspaces`, `chatview`, `modals`, `theme`
  - `app/preload/`
- **Datenspeicher richtig machen:** Schema-Version in der Datei, Migrationen pro Version, atomares Speichern (in temporäre Datei schreiben, dann umbenennen), tägliche Sicherungskopie der letzten 7 Tage.
- **Daten-Umzug:** Beim ersten Start wird `%APPDATA%\nexus-terminal-test` nach `%APPDATA%\NEXUS` kopiert, inklusive der Anmeldedaten der KIs (Ordner `Partitions`). Der alte Ordner bleibt unangetastet, bis du ihn selbst löschst.
- Selbsttests werden zu echten Tests: Unit-Tests (`node:test`) für Prüfungen und Migrationen, Oberflächentests mit Playwright für Electron. Laufen mit `npm test` und immer mit getrenntem Datenordner.
- Codeprüfung mit ESLint.

### M2 – Installer und Start wie eine App
- Installer mit **electron-builder** (NSIS): `NEXUS-Setup-0.1.0.exe`.
- **Installation pro Benutzer** (`%LOCALAPPDATA%\Programs\NEXUS`), braucht keine Admin-Rechte.
- Startmenü- und Desktop-Verknüpfung, Deinstallation über Windows-Einstellungen; Daten bleiben beim Deinstallieren erhalten.
- `node-pty` ist ein natives Modul und wird beim Bauen passend zu Electron kompiliert (`@electron/rebuild`).
- Fallback ohne Installer: portable `NEXUS.exe` zum Testen.
- Das Skript `create-shortcuts.ps1` aus dem Prototyp entfällt danach.

### M3 – Updates
- Variante A (empfohlen, sobald geklärt): **electron-updater mit GitHub Releases**. NEXUS prüft beim Start, lädt im Hintergrund und fragt „Jetzt neu starten?“.
- Variante B (einfach, für den Anfang): neue Setup-Datei manuell ausführen; Daten bleiben erhalten.
- Haken: Das Repo ist privat. Für Variante A braucht es entweder ein öffentliches Release-Repo (nur die fertigen Dateien, kein Quellcode) oder einen eingebauten Lese-Token.

### M4 – Stabilität im Alltag
- Protokolldatei (`%APPDATA%\NEXUS\logs`) statt Konsolenausgabe; „Protokoll öffnen“ im Menü.
- Fehlerseite statt leerem Fenster, wenn etwas beim Start scheitert.
- Prüfen beim Start: Ist Claude Code installiert und angemeldet? Wenn nicht, verständlicher Hinweis statt Fehlermeldung im Chat.
- Langsame KI-Anmeldung untersuchen (Trace-Protokoll ist im Prototyp schon eingebaut).
- Fenstergröße und -position merken.

### M5 – Funktionen aus dem MVP-Konzept
Reihenfolge zum Abstimmen:
1. **Projekt-Kontextdatei** `.nexus/context.md`, gespiegelt nach `CLAUDE.md` / `AGENTS.md` (im Konzept fürs MVP entschieden).
2. **Projektgruppen** in der Seitenleiste (das Feld `group` gibt es in den Daten schon).
3. **Einstellungen-Seite** (Theme, Nachfragen, Projektstammordner, Updates).
4. Tastenkürzel (Projekt wechseln, Workspace wechseln, neuer Chat).
5. Codex als zweiter Agent mit eigener Oberfläche (`codex app-server`, Abo-Login vorgesehen).

## Entscheidungen, die du treffen musst

1. **Nur für dich oder auch für andere?** Der Claude-Code-Chat läuft über dein Abo im Headless-Modus. Im Konzept ist das als *reines Privatwerkzeug* entschieden (Grauzone bei Anthropics Regeln). Soll NEXUS an andere gehen, braucht dieser Teil einen API-Key oder eine Genehmigung, und der Installer sollte signiert sein. → Bestimmt M2 und M3.
2. **Firmenrechner:** Darf dort ein selbst gebautes, unsigniertes Programm installiert werden? Windows SmartScreen warnt beim ersten Start; Firmen-Richtlinien oder Sophos können es blockieren. → Vor M2 kurz mit der IT klären.
3. **Updates:** Variante A (automatisch, braucht Release-Repo oder Token) oder B (manuell)?
4. **Struktur:** `app/` im selben Repo (Vorschlag) oder ein neues Repo nur für die App?

## Reihenfolge und Arbeitsweise
- M1 → M2 → M4 → M3 → M5. M1 und M2 zuerst, damit du schnell eine installierte Version nutzt; M3 erst, wenn die Update-Frage entschieden ist.
- Ein Branch pro Meilenstein (`phase-1/fundament`, `phase-1/installer`, …), Pull Request nach `main`.
- Der Prototyp bleibt startbar, bis die installierte Version alles kann. Erst dann werden die alten Verknüpfungen entfernt.
- Jeder Meilenstein endet mit: Tests grün, Installer gebaut, einmal auf deinem Rechner installiert und mit deinen echten Daten gestartet.
