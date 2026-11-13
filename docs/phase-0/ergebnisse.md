# Phase 0 – Technische Validierung

Stand: 2026-11-13 · Branch `phase-0/validierung` · Test-App: [`spike/embed-test`](../../spike/embed-test)

## Testumgebung
- Windows 11 Pro (10.0.26200), Node 24.13.0, npm 11.6.2
- **Electron 45.3.1** (aktuelles Stable, Chromium 156.0.8078.96)
- Je Anbieter ein `WebContentsView` mit eigener Partition (`persist:nexus-claude`, `persist:nexus-chatgpt`)

## Ergebnisse

| # | Prüfpunkt | Ergebnis | Nachweis |
|---|---|---|---|
| 1 | Electron + `WebContentsView` bewerten | ✅ geeignet | Läuft unter 45.3.1; mehrere Views in einem Fenster, Umschalten über `setVisible` ohne Neuladen |
| 2 | Claude einbetten | ✅ lädt | `claude.ai/` → `claude.ai/login`, HTTP 200, keine Cloudflare-Challenge |
| 3 | Claude-Login | ✅ funktioniert, **auch mit Google** | Manueller Test 09:34: Google-Popup (`accounts.google.com`) → angemeldet auf `claude.ai/new` |
| 4 | Sitzung übersteht Neustart (Claude) | ✅ | Nach dem Neustart-Knopf lädt `claude.ai/` direkt `claude.ai/new`, ohne `/login`; 56 persistente Cookies |
| 5 | ChatGPT einbetten | ✅ lädt | `chatgpt.com/`, HTTP 200, keine Cloudflare-Challenge |
| 5 | ChatGPT-Login + Neustart | ✅ | Google-Login **direkt in der View** (kein Popup), inkl. 2-Faktor-Bestätigung → angemeldet auf `chatgpt.com` (09:37). Neustart laut manuellem Test ok; im Protokoll ist nach dem erfolgreichen Login kein Neustart mehr erfasst |
| 6 | Einschränkungen der Anbieter | 🟡 recherchiert | siehe *Risiken* |
| 7 | Sicherheitsarchitektur | 🟡 umgesetzt, nicht geprüft | siehe *Sicherheit* |
| 8 | Grenzen dokumentieren | ✅ | dieses Dokument |

### Ladetest im Detail
Zwei Läufe mit `--load-all`, je 35 s:

| Lauf | User-Agent | Claude | ChatGPT |
|---|---|---|---|
| A | Electron-Standard (enthält `Electron/45.3.1`) | 200, Login-Seite in ~1,8 s | 200, Startseite in ~2,3 s |
| B | bereinigt (ohne App-/Electron-Kennung) | 200, Login-Seite | 200, Startseite |

**Folgerung:** Der Electron-Standard-UA reicht zum Laden. Eine UA-Änderung ist vorerst nicht nötig – das ist gut, denn UA-Manipulation sollte NEXUS vermeiden.

Beobachtung: In Lauf A hat die Claude-Login-Seite nach ~14 s ein Popup zu `accounts.google.com/o/oauth2/v2/auth` geöffnet – unklar, ob von selbst (Google One Tap) oder durch einen Klick im offenen Testfenster. Das Popup wurde nach der Erlaubnisliste zugelassen. Für das Produkt klären, ob ungefragte Popups erlaubt sein sollen.

## Manueller Test

**Durchgeführt 2026-11-13 (Claude):** Anmeldung über Google im Popup hat funktioniert, die Sitzung hat einen Neustart überstanden. Ob Chat, Datei-Upload usw. funktionieren, zeigt das Protokoll nicht; das ist noch nicht bestätigt.

**Durchgeführt 2026-11-13 (ChatGPT):** Anmeldung über Google hat funktioniert, laut Test auch nach dem Neustart.

Auffälligkeiten beim ChatGPT-Login:
- Erster Versuch brach auf der Passwortseite mit `ERR_CACHE_MISS` ab (Formular erneut gesendet). Nach dem Neustart klappte der zweite Versuch.
- Die Weiterleitung zu `accounts.youtube.com/accounts/SetSID` wurde von der Erlaubnisliste blockiert. Die Anmeldung lief trotzdem durch, das ist also unkritisch. Für das Produkt soll Google-Login als gemeinsamer „Auth-Baustein“ mit allen nötigen Google-Domains gepflegt werden.
- `persistent-storage` wurde von ChatGPT angefragt und abgelehnt. Produktentscheidung: wahrscheinlich erlauben.

**Noch offen:** Chat und Datei-Upload gezielt bestätigen, Gemini.


Ablauf:

```
cd spike/embed-test
npm install
npm start
```

1. **Claude:** mit **E-Mail-Code** anmelden. Prüfen, ob der Chat funktioniert (Nachricht senden, Datei anhängen).
2. **Neustart** in der Toolbar klicken → ist Claude noch angemeldet?
3. **ChatGPT:** Tab wechseln, mit E-Mail anmelden, Chat testen.
4. **Neustart** → ist ChatGPT noch angemeldet? Ist Claude noch angemeldet (Partitionen getrennt)?
5. Optional: **Google-Login** bei einem Anbieter versuchen und das Ergebnis notieren (Erwartung: kann blockiert werden).
6. Optional: Spracheingabe → wird erwartungsgemäß abgelehnt (`permission-request` im Log).

Protokoll: `%APPDATA%\nexus-embed-test\phase0-log.jsonl` (ohne Query-Strings, ohne Cookie-Werte).

## Risiken und Einschränkungen

1. **Google-Login in eingebetteten Browsern.** Google blockiert Anmeldungen aus eingebetteten Frameworks seit 2021 grundsätzlich; aus 2026 gibt es Berichte über neue Fehler (401 „malformed“) in Electron-Webviews. **Im Test (2026-11-13) hat der Google-Login bei Claude trotzdem funktioniert** – im Popup, mit Standard-UA. Das kann Google jederzeit ändern. → Für NEXUS einplanen: Google-Login zulassen, aber bei Fehlschlag klarer Hinweis + „Extern öffnen“ bzw. E-Mail-Login. Kein UA-Trick, kein Umgehen.
   - Nebenwirkung: Google-Cookies (`SID`, `__Secure-1PSID` …) landen in der Partition des jeweiligen Anbieters. Die Partitionen bleiben getrennt, ein Google-Login gilt also nur für diesen Anbieter.
2. **Cloudflare/Turnstile.** Heute kein Problem, aber Anbieter können das jederzeit ändern. Es gibt Berichte über Turnstile-Schleifen und GPU-Abstürze in Electron-Apps. → Fehlerzustand erkennen (Schleife, Absturz via `render-process-gone`) und Fallback auf externen Browser anbieten.
3. **Nutzungsbedingungen.** Anthropics Consumer Terms verbieten automatisierten Zugriff auf claude.ai ohne API-Key oder ausdrückliche Erlaubnis. NEXUS zeigt die Seite nur an, wie ein Browser – **kein Skript in Anbieterseiten, kein Auslesen von Chats, keine automatische Bedienung**. Das gilt als harte Architekturregel. OpenAIs genauer Wortlaut zu Einbettung/Automatisierung ist noch nicht geprüft → vor Release Primärtext lesen.
4. **Funktionsumfang.** Spracheingabe, Benachrichtigungen, Downloads und Datei-Uploads brauchen eigene Berechtigungsentscheidungen. Im Test sind Mikrofon/Kamera/Benachrichtigungen abgelehnt und Downloads blockiert → Produktentscheidung nötig.
5. **Provider-Updates.** Login-Flows und Domains können sich ändern → Erlaubnislisten je Connector konfigurierbar halten, nicht hart verdrahten.

## Sicherheit (umgesetzt im Test)
- Eigene persistente Partition je Anbieter → keine geteilten Cookies (nach Lauf A hatte jede Partition nur eigene Cookies).
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false` für alle Anbieter-Views.
- **Kein Preload** in Anbieterseiten; Preload nur für die eigene Toolbar, IPC nur von deren `webContents` angenommen.
- Navigation: Erlaubnisliste je Anbieter; alles andere → Standardbrowser. Redirects außerhalb der Liste werden blockiert.
- Popups nur für erlaubte Hosts (Login), sonst extern.
- Berechtigungen standardmäßig abgelehnt und protokolliert; Downloads blockiert.
- `<webview>`-Tags global unterbunden; CSP in der Toolbar.
- Protokoll ohne Query-Strings und ohne Cookie-Werte.

Noch nicht geprüft: Electron-Fuses (z. B. `RunAsNode` aus), Code-Signing, Electronegativity-/Audit-Lauf, `session.setSpellCheckerEnabled`, Verhalten von `shell.openExternal` bei unerwarteten Protokollen (im Test nur https).

## Bewertung des Stacks
| Baustein | Bewertung |
|---|---|
| Electron 45 + `WebContentsView` | ✅ bestätigt, Grundlage für Phase 1 |
| React + TypeScript + Vite | ✅ unkritisch; Empfehlung: `electron-vite` oder Electron Forge mit Vite-Plugin |
| Tailwind + CSS-Variablen | ✅ unkritisch |
| Zustand, Zod, Lucide | ✅ unkritisch |
| SQLite | ⚠️ native Module (`better-sqlite3`) müssen gegen Electron gebaut werden. Alternative: `node:sqlite` – **getestet**: Electron 45 bringt Node 24.22.2 mit, `DatabaseSync` funktioniert ohne natives Build. Empfehlung für Phase 1 |

## Nächste Schritte
1. Bei beiden Anbietern kurz Chat und Datei-Upload bestätigen (falls noch nicht geschehen).
2. Gemini mit demselben Aufbau testen (im Konzept als dritter Anbieter genannt).
3. Danach: Architekturvorschlag, Repo-Struktur, Datenmodell, Connector-Design und MVP-Meilensteine vorlegen → Freigabe.
