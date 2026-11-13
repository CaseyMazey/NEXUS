# Eigene KI-Oberfläche – Analyse

Stand: 2026-11-13

## Ziel (vom Nutzer, 2026-11-13)
NEXUS soll eine **eigene Oberfläche für die KIs** bieten, weil die Oberfläche von Claude Code unpraktisch ist:
- eigene Projekte
- farbliche Hervorhebungen und farbige Icons
- mehrere KIs zu einem Projekt zusammenstellen
- vielleicht Kontext zwischen den KIs teilen

## Entscheidungen
- **2026-11-13: Claude läuft über den Terminal-Connector, ohne API-Key.** NEXUS startet das echte Claude Code (mit dem Claude-Abo) in einem eingebetteten Terminal im Projektrahmen. Keine eigene Chat-UI für Claude, kein Agent SDK, kein Headless-Wrapper.
- **2026-11-13: Terminal-Connector und Projekt-Kontextdatei kommen ins MVP 1.0.**

## Kernproblem
Phase 0 hat gezeigt: claude.ai und chatgpt.com lassen sich einbetten. **Die Oberfläche im eingebetteten Fenster bleibt aber die des Anbieters.** Umgestalten hieße Skripte einschleusen oder Seiten fernsteuern – das verbietet die Architekturregel (und bei claude.ai die Nutzungsbedingungen).

→ Eine eigene Chat-/Agent-Oberfläche geht nur über **offizielle Schnittstellen**.

## Optionen je Anbieter

| Weg | Eigene UI? | Abo nutzbar? | Kontext teilbar? | Bewertung |
|---|---|---|---|---|
| **Web eingebettet** (claude.ai, chatgpt.com) | ❌ nur der Rahmen | ✅ | nur manuell (Kopieren/Einfügen) | Phase 0 bestätigt; gut als Ergänzung |
| **Terminal eingebettet** (echtes Claude Code / Codex CLI in NEXUS, xterm.js + node-pty) | ❌ Terminal-UI des Tools, aber im NEXUS-Rahmen mit Projektfarben | ✅ (es ist das Original-Tool) | ✅ über Projektdateien | legitim, wenig Aufwand |
| **Claude: Agent SDK / CLI im Headless-Modus** (`claude -p --output-format stream-json`) | ✅ komplett eigene UI | ⚠️ **nein, nur mit API-Key**: Anthropic erlaubt Drittprodukten keinen claude.ai-Login, auch nicht für Agent-SDK-Agents; Berichte über serverseitige Sperren seit 2026 | ✅ | technisch gut, kostet API-Geld |
| **Codex: `codex app-server`** (JSON-RPC, für eigene Oberflächen gedacht) | ✅ komplett eigene UI | ✅ ChatGPT-Login ist im Protokoll vorgesehen (`account/login/start`) | ✅ | **bester Kandidat für eigene UI mit Abo** |
| **Direkte APIs** (Anthropic, OpenAI, Gemini) | ✅ | ❌ getrennte Abrechnung | ✅ voll | maximale Kontrolle, laufende Kosten |
| Gemini CLI / API | ? | ? | ? | noch nicht recherchiert |

## Kontext teilen – was realistisch ist
1. **Projektdateien als gemeinsamer Kontext (empfohlen, sofort machbar):** NEXUS pflegt pro Projekt eine Kontextdatei (z. B. `.nexus/context.md`) und spiegelt sie in die Dateien, die die Agents ohnehin lesen: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`. Jeder lokale Agent im selben Projektordner bekommt damit denselben Kontext. Keine Regelverstöße, keine APIs.
2. **Übergaben:** Knopf „Zusammenfassung an andere KI übergeben“ – bei eigenen UIs (Codex app-server, API) automatisch, bei eingebetteten Webseiten über die Zwischenablage.
3. **Gemeinsamer Chatverlauf zwischen Anbietern:** nur mit API- bzw. eigener-UI-Connectors möglich, nicht mit eingebetteten Webseiten.

## Vorschlag für die Architektur (von Claude, noch nicht entschieden)
Ein Projekt ist die Mitte. Jede KI hängt als **Connector** am Projekt, mit einem von vier Typen:

```
Projekt (Name, Farbe, Icon, Ordner, Kontext)
 ├─ Connector "web"       → eingebettete Webseite (nur Rahmen)
 ├─ Connector "terminal"  → echtes CLI-Tool im eingebetteten Terminal
 ├─ Connector "agent"     → eigene NEXUS-Chat-UI über offizielles Protokoll (z. B. Codex app-server; für Claude nicht vorgesehen)
 └─ Connector "api"       → später: direkte API
```

Die eigene UI (Farben, Icons, Projekte, mehrere KIs pro Projekt) ist dann der **NEXUS-Rahmen plus die Agent-Ansicht**, die für alle Agent-Connectors gleich aussieht.

## Auswirkungen auf das MVP (Vorschlag)
Das Konzept schließt im MVP einen „vollständigen API-basierten Chat-Client“ und „gemeinsamen Chatverlauf“ aus. Das Ziel „eigene Oberfläche“ verschiebt die Gewichte:
- **MVP behalten:** Projekte, Farben, Icons, Gruppen, mehrere KIs pro Projekt, Web-Connector (validiert).
- **Neu ins MVP (entschieden 2026-11-13):** Terminal-Connector (Claude Code, Codex CLI im NEXUS-Rahmen) und Projekt-Kontextdatei mit Spiegelung nach `CLAUDE.md`/`AGENTS.md`.
- **Phase 0b (Vorschlag):** Terminal-Connector testen (Claude Code in xterm.js + node-pty, Projektordner als Arbeitsverzeichnis, Kontextdatei-Spiegelung nach `CLAUDE.md`). Optional: eigene Agent-UI mit `codex app-server` (Abo).

## Offene Entscheidungen
1. ~~Claude über API-Key oder Terminal?~~ → entschieden: Terminal, kein API-Key (2026-11-13).
2. ~~Terminal-Connector und Projekt-Kontext ins MVP?~~ → entschieden: ja (2026-11-13).
3. Gemini: welcher Weg (CLI, API, nur Web)?

## Quellen
- Claude Agent SDK, Hinweis zur Authentifizierung: https://code.claude.com/docs/en/agent-sdk/overview
- Claude Code Legal & Compliance: https://code.claude.com/docs/en/legal-and-compliance
- Claude Code Headless: https://code.claude.com/docs/en/headless
- Codex App Server: https://developers.openai.com/codex/app-server
- OpenAI, Unlocking the Codex harness: https://openai.com/index/unlocking-the-codex-harness
