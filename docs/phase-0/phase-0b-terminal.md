# Phase 0b – Claude Code im eingebetteten Terminal

Stand: 2026-11-13 · Test-App: [`spike/terminal-test`](../../spike/terminal-test)

Priorität (vom Nutzer): **Claude Code mit besserer Oberfläche** – Projekte und Sitzungen sortieren, farblich hervorheben.
Entscheidung: Claude läuft als echtes Claude Code im Terminal, **ohne API-Key**.

## Was der Prototyp kann
- **Projekte** links: alle Ordner aus `Documents\Projekt`, je mit Farbe und Icon (änderbar, gespeichert in NEXUS-eigener Datei).
- **Sitzungen** in der Mitte: die Claude-Code-Sitzungen des Projekts mit Titel, Alter, Anzahl Prompts, Git-Branch. Suchen, **farbig markieren**, **anheften**, nach Farbe filtern.
- **Terminals** rechts als Tabs in Projektfarbe. Klick auf eine Sitzung → `claude --resume <id>` im Projektordner; „+ Neue Sitzung“ → `claude`.

Start:
```
cd spike/terminal-test
npm install
npm start
```

## Ergebnisse

| Prüfpunkt | Ergebnis | Nachweis |
|---|---|---|
| Natives Terminal-Modul in Electron 45 | ✅ | `node-pty` 1.1.0 lädt ohne eigenen Build (N-API-Prebuild) |
| Terminal-Darstellung | ✅ | `@xterm/xterm` 6.0.0 + `@xterm/addon-fit` 0.11.0 |
| Claude Code startet im Pseudo-Terminal | ✅ | Claude Code 2.1.322, ConPTY, richtiger Arbeitsordner |
| **Vorhandene Anmeldung wird genutzt** | ✅ | Startbildschirm zeigt „Claude Pro“, keine Login-Abfrage |
| Sitzungen auflisten | ✅ | Liest `~/.claude/projects/<kodierter Pfad>/*.jsonl`; Titel aus `custom-title`, sonst erste Nachricht |
| Geschwindigkeit Sitzungsliste | ⚠️ | NEXUS 13 ms, NORA 21 ms, **Nook 666 ms** (11 große Dateien) → im Produkt Cache nötig |
| Oberfläche ohne Fehler | ✅ | Probelauf ohne Konsolenfehler |
| Sitzung fortsetzen, Tabs, Farben im echten Gebrauch | ⏳ | manueller Test |

## Risiken
1. **Internes Dateiformat.** Die Sitzungsdateien in `~/.claude/projects` sind nicht dokumentiert. NEXUS liest sie nur (Titel, ID, Datum) und fällt robust zurück. Ändert Anthropic das Format, kann die Liste leer werden – Terminal und `claude --resume` funktionieren trotzdem.
2. **Pfad-Kodierung** (`[^A-Za-z0-9]` → `-`) ist beobachtet, nicht dokumentiert.
3. **Umgebungsvariablen:** Wird NEXUS aus einer Claude-Code-Sitzung gestartet, erbt es `CLAUDECODE` u. a. NEXUS entfernt diese vor dem Start von Claude Code.
4. **Windows-Start:** `claude` ist ein npm-Shim (`claude.cmd`), deshalb Start über `cmd.exe /c claude`. Für andere Installationsarten (nativer Installer) Pfad konfigurierbar machen.

## Sicherheit
- Oberfläche: `sandbox`, `contextIsolation`, kein `nodeIntegration`, CSP `script-src 'self'`.
- Nur der Hauptprozess startet Prozesse. IPC prüft den Absender, Projekte nur aus der eigenen Liste, Sitzungs-IDs nur als UUID, Farben nur als `#rrggbb`.
- NEXUS schreibt **nichts** in `~/.claude`; eigene Daten in `%APPDATA%\nexus-terminal-test\nexus-data.json`.

## Nächste Schritte
1. Manueller Test: Sitzung fortsetzen, neue Sitzung, mehrere Tabs, Farben/Pins, Neustart der App.
2. Rückmeldung zur Oberfläche: Was fehlt zum Sortieren? (z. B. Gruppen von Projekten, Umbenennen von Sitzungen, Notizen je Sitzung)
3. Danach Architekturvorschlag für MVP 1.0 mit Terminal-Connector als Kern.

## Update 2026-11-13: Chat-Oberfläche (statt nur Terminal)
Entscheidung: Claude Code bekommt eine **eigene Chat-Oberfläche mit Abo**, als reines Privatwerkzeug (siehe `docs/konzept/eigene-oberflaeche.md`). Das Terminal bleibt als Rückfallebene (⌨).

**Technik:** NEXUS startet das installierte Claude Code als Kindprozess:
```
claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages
       --permission-mode <default|acceptEdits|plan> --permission-prompts host --permission-prompt-tool stdio [--resume <id>]
```
- Nachrichten gehen als JSON-Zeilen über stdin, der Prozess bleibt über mehrere Nachrichten offen.
- Live-Text über `stream_event` → `text_delta`; Werkzeugaufrufe und Ergebnisse über `assistant`/`user`-Nachrichten.
- **Rückfragen:** Claude Code schickt `control_request` `can_use_tool` (mit `description` und `permission_suggestions`); NEXUS antwortet mit `control_response` (`allow` / `deny`, bei „immer“ mit `updatedPermissions`). **Ohne `--permission-prompt-tool stdio` werden Rückfragen automatisch abgelehnt** (getestet).
- Stoppen: `control_request` `interrupt`; Modus wechseln: `set_permission_mode`.
- `rate_limit_event` liefert die Abo-Auslastung (5 Std. / Woche) → Anzeige im Eingabefeld.

| Prüfpunkt | Ergebnis |
|---|---|
| Neue Sitzung, Live-Text | ✅ (Test mit Haiku) |
| Rückfrage in NEXUS, „Erlauben“ → Datei angelegt | ✅ |
| Fortsetzen (`--resume`), Kontext bleibt, gleiche Sitzungs-ID | ✅ |
| Verlauf einer Sitzung in der Chat-Ansicht | ✅ (Selbsttest mit Screenshot) |
| Oberfläche lädt ohne Fehler | ✅ |
| Alltagstest mit echter Arbeit | ⏳ |

**Bekannte Lücken im Prototyp:** keine Bilder/Dateien anhängen, keine Slash-Befehle, keine Anzeige von Unteragenten-Details, `AskUserQuestion` wird nur als allgemeine Rückfrage gezeigt, lange Werkzeug-Ketten werden noch nicht gruppiert.

## Update 2026-11-13: Desks, Raster, Web-Workspaces, Bilder, Slash-Befehle
**Desk pro Projekt:** Workspaces, Raster (1–4 nebeneinander, 4 = 2×2), aktiver Platz und **pro Workspace der fortzusetzende Chat**:
- Claude Code: `sessionId` (kommt aus `system:init`, wird beim ersten Senden gespeichert) → `--resume`
- Claude / ChatGPT / Gemini: Chat-Adresse (nur Ursprung + Pfad, z. B. `https://claude.ai/chat/<id>`) → wird beim Öffnen geladen

Gespeichert in `nexus-data.json` unter `desks[<projekt>]`, automatisch bei jeder Änderung. Beim Start öffnet NEXUS das zuletzt genutzte Projekt.

**Leiste oben:** Projekt (Icon/Farbe änderbar), Workspace-Chips (Klick = im aktiven Platz anzeigen, × = aus dem Desk entfernen, Punkt = arbeitet, ! = wartet auf Freigabe), ＋ (Claude Code Chat, Claude Code Terminal, Claude, ChatGPT, Gemini), Rasterknöpfe.

**Web-Workspaces:** Code aus Phase 0 übernommen (`webviews.js`): eigene Partition je Anbieter (eine Anmeldung gilt für alle Desks), Sandbox, kein Preload, keine Skripte, Navigation nur zu erlaubten Hosts. Native Ansichten liegen über dem DOM → NEXUS blendet sie aus, solange ein Menü offen ist.

**Claude-Code-Chat:**
- **Bilder:** einfügen (Strg+V), hineinziehen oder 📎; PNG/JPEG/GIF/WebP bis 5 MB, max. 8; werden als `image`-Inhalt gesendet. Test: rotes Testbild → „Rot“ ✅
- **Slash-Befehle:** Vorschlagsliste aus `slash_commands` (inkl. Skills), Pfeiltasten/Tab/Enter. Lokale Befehle wie `/context` liefern ihre Ausgabe nur im `result` → wird als Befehlsausgabe angezeigt. Test ✅
- Lange Werkzeug-Ketten werden zu „🔧 n Schritte“ gruppiert.

| Prüfpunkt | Ergebnis |
|---|---|
| Desk mit 3 Workspaces im 3er-Raster (Selbsttest) | ✅ |
| Web-Ansichten exakt in ihren Plätzen (x=667/1078, 403 px breit) | ✅ |
| Desk gespeichert inkl. Chat-Adressen | ✅ |
| Bild + Slash-Befehl über stream-json | ✅ |
| Projektwechsel stellt Chats wieder her, im Alltag | ⏳ manueller Test |
| Gemini-Login eingebettet | ⏳ ungetestet |

**Hinweis:** Die Web-Workspaces nutzen neue Partitionen im NEXUS-Datenordner → bei Claude/ChatGPT/Gemini einmal neu anmelden; danach bleibt die Anmeldung für alle Desks.
