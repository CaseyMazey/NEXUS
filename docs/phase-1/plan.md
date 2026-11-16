# Phase 1 – Vom Prototyp zur richtigen App

Stand: 2026-11-16 · Status: **entschieden, M1 umgesetzt**

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

> **Stand 2026-11-16: umgesetzt** (Branch `phase-1/fundament`). Abweichungen vom Plan: Oberfläche als mehrere klassische Skripte statt Bundler (kommt mit Bedarf); Daten-Umzug kopiert ohne Caches; zusätzlich Deutsch/Englisch, und in 3C: Nachrichten einreihen während eines Auftrags, Vorschläge per Tab, Modus „Nie fragen“. Details in `app/README.md`.
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

## Entscheidungen (getroffen 2026-11-16)

1. **Für alle, als lokaler Rahmen.** NEXUS ist ein Rahmen für KIs, den jeder frei nutzen kann. Jede Person verbindet ihre eigenen KIs und meldet sich dort mit den eigenen Daten an. NEXUS selbst hat **kein Konto, keine Anmeldung und keinen Server**. Es läuft komplett lokal.
2. **Firmenrechner:** Programme selbst zu installieren ist erlaubt.
3. **Updates automatisch** (Variante A): electron-updater mit GitHub Releases.
4. **Struktur:** `app/` im selben Repo.

### Was daraus folgt
- **Kein fest eingebauter Pfad.** Den Projektordner (heute `Documents\Projekt`) wählt man beim ersten Start. Es gibt keine vorab eingetragenen KIs und keine persönlichen Daten im Installer.
- **Erster Start mit Einrichtungs-Assistent:** Projektordner wählen, die ersten KIs aufnehmen, prüfen, ob Claude Code installiert ist. Fehlt es, erklärt NEXUS, wie man es installiert, und 3C bleibt aus, bis es da ist.
- **3C nutzt das Claude Code der jeweiligen Person** mit deren eigener Anmeldung. NEXUS liefert Claude Code nicht mit, meldet niemanden an und speichert keine Zugangsdaten. Die Web-KIs sind die echten Anbieterseiten mit der eigenen Anmeldung, ohne eingeschleuste Skripte (bleibt harte Regel).
- **Updates für alle** gehen nur, wenn die fertigen Dateien öffentlich herunterladbar sind. Das Repo ist privat → Frage 5 unten.
- **Unsignierter Installer:** Bei anderen Personen warnt Windows SmartScreen beim ersten Start („Unbekannter Herausgeber“). Für den Anfang reicht das, eine Signatur kann später kommen (Frage 7).

### Noch offen (nicht dringend für M1)
5. **Veröffentlichung:** Das Repo öffentlich machen (Open Source, dann mit Lizenz) oder ein eigenes öffentliches Repo nur für die Setup-Dateien? Muss vor M3 entschieden sein.
6. **Sprache:** Nur Deutsch, oder Deutsch und Englisch? Wenn andere es nutzen sollen, lohnt es sich, die Texte von Anfang an austauschbar anzulegen (kostet in M1 wenig).
7. **Code-Signing** später (z. B. Azure Trusted Signing, etwa 10 USD im Monat), damit die Windows-Warnung verschwindet.
8. **Anthropics Regeln für 3C:** NEXUS startet das offizielle Claude Code der Person und bietet selbst keine Claude-Anmeldung an. Vor einer Veröffentlichung noch einmal die aktuellen Regeln für Drittanbieter-Apps prüfen.

## Reihenfolge und Arbeitsweise
- M1 → M2 → M4 → M3 → M5. M1 und M2 zuerst, damit du schnell eine installierte Version nutzt; M3 erst, wenn Frage 5 (Veröffentlichung) entschieden ist.
- Ein Branch pro Meilenstein (`phase-1/fundament`, `phase-1/installer`, …), Pull Request nach `main`.
- Der Prototyp bleibt startbar, bis die installierte Version alles kann. Erst dann werden die alten Verknüpfungen entfernt.
- Jeder Meilenstein endet mit: Tests grün, Installer gebaut, einmal auf deinem Rechner installiert und mit deinen echten Daten gestartet.
