<p align="center">
  <img src="app/build/icon.png" alt="NEXUS" width="96">
</p>

<h1 align="center">NEXUS</h1>

<p align="center"><strong>Alle deine KIs an einem Ort – sortiert nach Projekten.</strong><br>
<em>Your AI. Your Workspace. Your Way.</em></p>

<p align="center">
  <a href="https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-Setup.exe"><img src="https://img.shields.io/badge/Windows-Download-6366f1?style=for-the-badge&logo=windows&logoColor=white" alt="Download für Windows"></a>
  <a href="#macos"><img src="https://img.shields.io/badge/macOS-Download-6366f1?style=for-the-badge&logo=apple&logoColor=white" alt="Download für macOS"></a>
  <a href="#linux"><img src="https://img.shields.io/badge/Linux-Download-6366f1?style=for-the-badge&logo=linux&logoColor=white" alt="Download für Linux"></a>
</p>

<p align="center">
  <a href="https://github.com/CaseyMazey/NEXUS/releases/latest"><img src="https://img.shields.io/github/v/release/CaseyMazey/NEXUS?label=Version" alt="Neueste Version"></a>
  <img src="https://img.shields.io/badge/System-Windows%20%7C%20macOS%20%7C%20Linux-0078d4" alt="Windows, macOS und Linux">
  <img src="https://img.shields.io/badge/Sprache-Deutsch%20%7C%20English-555" alt="Deutsch und Englisch">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-22c55e" alt="MIT-Lizenz"></a>
</p>

<p align="center">
  <img src="docs/screenshots/desk-dunkel.png" alt="NEXUS: links die Projekte, rechts der Desk des Projekts mit Claude Code, Claude und ChatGPT nebeneinander" width="900">
</p>

Du nutzt Claude, ChatGPT, Gemini und Claude Code, und jedes läuft in einem eigenen Fenster oder Tab? **NEXUS bringt alles an einen Ort.**

Links stehen deine Projekte. Jedes Projekt hat einen eigenen **Desk**: einen Schreibtisch, auf dem bis zu vier KIs nebeneinander liegen. Wechselst du das Projekt, wechselt der ganze Desk mit, und jede KI macht genau dort weiter, wo du aufgehört hast.

- 🔒 **Ohne Konto, ohne Server.** NEXUS läuft komplett auf deinem Rechner.
- 🔑 **Deine Anmeldungen bleiben bei dir.** Du meldest dich bei deinen KIs selbst an. NEXUS speichert keine Zugangsdaten.
- 🔄 **Aktualisiert sich selbst.** Neue Versionen kommen automatisch.

## Installieren

NEXUS gibt es kostenlos für Windows, macOS und Linux, direkt hier von GitHub. Ein Konto brauchst du nicht.

### Windows

1. **[NEXUS-Setup.exe herunterladen](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-Setup.exe)** (Windows 10/11).
2. Die Datei ausführen. NEXUS installiert sich für deinen Benutzer, ohne Admin-Rechte, mit Verknüpfung auf dem Desktop und im Startmenü.
3. Erscheint „Der Computer wurde durch Windows geschützt“: auf **Weitere Informationen → Trotzdem ausführen** klicken. Die Meldung kommt, weil das Setup nicht signiert ist.

**Updates kommen automatisch.** Deinstallieren geht über Einstellungen → Apps. Deine Daten bleiben dabei erhalten.

### macOS

1. Herunterladen, passend zu deinem Mac (Apfel-Menü → Über diesen Mac):
   - **[Apple Silicon (M1, M2, M3 …)](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-mac-arm64.dmg)**
   - **[Intel](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-mac-x64.dmg)**
2. Die `.dmg` öffnen und **NEXUS in den Ordner „Programme“ ziehen**.
3. **Beim ersten Öffnen** blockiert macOS die App, weil sie nicht über ein kostenpflichtiges Apple-Entwicklerkonto signiert ist. So öffnest du sie trotzdem:
   - **Rechtsklick** auf NEXUS → **Öffnen** → **Öffnen**.
   - Klappt das nicht (macOS 15 und neuer): **Systemeinstellungen → Datenschutz & Sicherheit**, nach unten scrollen, bei NEXUS auf **„Dennoch öffnen“** klicken.
   - Meldet macOS, die App sei **„beschädigt“**: Terminal öffnen und `xattr -dr com.apple.quarantine /Applications/NEXUS.app` eingeben, danach normal öffnen.

**Updates:** NEXUS meldet sich, wenn es eine neue Version gibt. Dann lädst du sie mit einem Klick herunter und ziehst sie wieder in „Programme“. Deine Daten bleiben erhalten. Automatisch installieren kann sich NEXUS auf dem Mac ohne Apple-Signatur nicht.

### Linux

- **[AppImage](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-linux-x86_64.AppImage)** (läuft auf den meisten Distributionen): herunterladen, ausführbar machen mit `chmod +x NEXUS-linux-x86_64.AppImage`, starten. **Updates kommen automatisch.**
- **[.deb-Paket](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-linux-amd64.deb)** (Debian, Ubuntu, Mint …): `sudo apt install ./NEXUS-linux-amd64.deb`. Bei neuen Versionen meldet sich NEXUS mit einem Download-Link.

## So sieht NEXUS aus

### Projekte und Desks

Jedes Projekt bekommt einen eigenen Desk. Darauf liegen bis zu vier KIs nebeneinander: Claude Code, Claude, ChatGPT, Gemini oder jede andere KI-Webseite. Die Zeichen an den Projektnamen zeigen, was gerade passiert:

- **pulsierender Punkt:** Claude arbeitet noch
- **!**: Claude wartet auf deine Entscheidung
- **✓**: Claude ist fertig, und du hast es noch nicht angesehen

<p align="center"><img src="docs/screenshots/desk-hell.png" alt="Desk im hellen Theme: Claude-Code-Chat und Gemini nebeneinander" width="860"></p>

### 3C – Claude Code mit eigener Chat-Oberfläche

[Claude Code](https://claude.com/claude-code) bekommt in NEXUS ein Chatfenster statt des Terminals:
- Werkzeug-Schritte erscheinen als aufklappbare Karten.
- Zu jeder Nachricht stehen Uhrzeit und Dauer.
- Du kannst weiterschreiben, während Claude arbeitet.
- Vorschläge für die nächste Nachricht übernimmst du mit Tab.
- 📎 Clippy hängt Dateien jeder Art an: Bilder, PDFs, Word, Excel und mehr.

Beim Rechte-Modus wählst du, wie viel Claude selbst entscheiden darf:
- **Manuell:** fragt vor allem
- **Änderungen automatisch:** ändert Dateien ohne Rückfrage
- **Auto:** fragt nur bei riskanten Schritten
- **Fragt nur bei Push:** fragt nur vor `git push`
- **Nie fragen:** fragt gar nicht

Braucht Claude eine Entscheidung, während NEXUS im Hintergrund ist, meldet sich Windows unten rechts.

<p align="center"><img src="docs/screenshots/3c-chat.png" alt="3C: Claude Code als Chat mit Werkzeug-Karten, Tabelle und Abschlusszeile" width="860"></p>

### Codex – der zweite Agent

Neben Claude Code gibt es auch [Codex](https://github.com/openai/codex) von OpenAI mit derselben Chat-Oberfläche: über ＋ → Codex oder mit Strg+⇧+N. Codex nutzt dein eigenes ChatGPT-Konto und liest den Projektkontext über `AGENTS.md`. Was er darf, legst du mit dem Modus fest:
- **Nur lesen:** liest und schlägt vor, ändert aber nichts
- **Im Projektordner:** darf im Projektordner ändern und Befehle ausführen
- **Voller Zugriff:** darf alles auf dem Rechner, ohne Sandbox

### Projektkontext – ein Wissen für alle KIs

Halte pro Projekt fest, was alle KIs wissen sollen, also Ziel, Stand und Regeln:
- **Claude Code** liest den Kontext automatisch. NEXUS legt ihn als Abschnitt in `CLAUDE.md` und `AGENTS.md` im Projektordner ab.
- **Claude, ChatGPT und Gemini im Web** bekommen ihn per Knopf **📋 Kontext**: Er landet in der Zwischenablage, und du fügst ihn mit Strg+V ein.

<p align="center"><img src="docs/screenshots/projektkontext.png" alt="Projektkontext bearbeiten" width="760"></p>

### Projektgruppen und Tastenkürzel

**Gruppen:** Ordne Projekte in Gruppen wie „Arbeit“, „Privat“ oder „Uni“. Du legst sie im Projekt-Editor fest, in der Seitenleiste lassen sie sich ein- und ausklappen. Eine eingeklappte Gruppe zeigt trotzdem an, ob eine KI darin arbeitet oder fertig ist.

**Tastenkürzel** funktionieren auch, wenn gerade eine KI-Webseite den Fokus hat. Auf dem Mac gilt ⌘ statt Strg.

| Kürzel | Wirkung |
|---|---|
| Strg+K | Schnellsuche: Projekte, Workspaces, Sitzungen, Aktionen |
| Strg+1 … 9 | Projekt 1 bis 9 öffnen |
| Strg+⇧+1 … 4 | Raster mit 1 bis 4 Plätzen |
| Strg+Tab | nächster Workspace (mit ⇧ vorheriger) |
| Strg+N / Strg+⇧+N | neuer Claude-Code-Chat / neuer Codex-Chat |
| Strg+W | aktiven Workspace schließen |
| Strg+, | Einstellungen |

### Meine KIs

Claude, ChatGPT, Gemini, Perplexity, Le Chat, Copilot, DeepSeek oder jede andere KI-Webseite: **einmal anmelden**, und die Anmeldung gilt in allen Desks und übersteht Neustarts.

<p align="center"><img src="docs/screenshots/meine-kis.png" alt="Meine KIs: KIs aufnehmen und anmelden" width="760"></p>

### Einstellungen und Themes

- **Sechs Themes:** Hell, Creme, Sand, Nacht, Retro und Kupfer. Der Sonne/Mond-Knopf wechselt zwischen deinem hellen und deinem dunklen Theme.
- **Sprache:** Deutsch oder Englisch.
- **Hilfe:** Über „Protokoll öffnen“ kommst du an das Protokoll, falls einmal etwas nicht klappt.

<p align="center"><img src="docs/screenshots/einstellungen.png" alt="Einstellungen mit Sprache, Themes und Projektordner" width="760"></p>

<sub>Die Bilder zeigen Beispielprojekte. Das Gespräch im Chat ist ein Beispiel, und die Web-KIs sind nicht angemeldet.</sub>

## Gut zu wissen

- **Claude Code und Codex:** Für 3C und das Terminal brauchst du [Claude Code](https://claude.com/claude-code), für den Codex-Chat [Codex](https://github.com/openai/codex), jeweils auf deinem Rechner und mit deinem eigenen Konto angemeldet. Fehlt Claude Code, sagt NEXUS dir, was zu tun ist.
- **Wo deine Daten liegen:** Windows `%APPDATA%\NEXUS`, macOS `~/Library/Application Support/NEXUS`, Linux `~/.config/NEXUS`.
- **Deine Daten:** Alles bleibt bei dir. Im Datenordner liegen Sicherungen der letzten 7 Tage (`backups`) und das Protokoll (`logs`). Das Protokoll enthält keine Zugangsdaten und keine E-Mail-Adressen.
- **Die KI-Webseiten** laufen unverändert und getrennt voneinander. NEXUS schleust keine Skripte ein und liest keine Chats aus.

## Für Entwickler

Der Code der App liegt in [`app/`](app/README.md) (Electron).

```bash
cd app
npm install
npm start              # aus dem Quellcode starten
npm test               # Unit- und Oberflächentests
npm run screenshots    # Bilder für diese README neu erzeugen (mit Demo-Daten)
npm run dist:win       # Setup bauen (dist:mac auf einem Mac, dist:linux unter Linux)
npm run release -- 0.2.0 "Was ist neu"   # Version + Tag; GitHub baut alle Systeme
```

- [`docs/phase-1/plan.md`](docs/phase-1/plan.md): Plan und Stand der Meilensteine
- [`docs/phase-0/ergebnisse.md`](docs/phase-0/ergebnisse.md): technische Validierung
- [`spike/`](spike): Prototypen aus Phase 0 (Archiv)

---

### English

NEXUS puts **all your AIs in one place, organised by project** – on Windows, macOS and Linux. Every project gets its own desk with up to four AIs side by side: Claude Code (with its own chat UI, “3C”), Claude, ChatGPT, Gemini and more. A shared **project context** keeps every AI on the same page. There is no NEXUS account and no server. You connect your own AIs and sign in to them yourself.

Download: **[Windows](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-Setup.exe)** · **[macOS Apple Silicon](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-mac-arm64.dmg)** · **[macOS Intel](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-mac-x64.dmg)** · **[Linux AppImage](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-linux-x86_64.AppImage)** · **[Linux .deb](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-linux-amd64.deb)**. The apps are not signed with paid developer certificates. On Windows click **More info → Run anyway**. On macOS right-click NEXUS → **Open** (or System Settings → Privacy & Security → **Open Anyway**). Windows and the Linux AppImage update themselves; on macOS and with the .deb, NEXUS tells you when a new version is ready to download. The app speaks English and German.

## Lizenz

[MIT](LICENSE) © CaseyMazey
