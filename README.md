<p align="center">
  <img src="app/build/icon.png" alt="NEXUS" width="96">
</p>

<h1 align="center">NEXUS</h1>

<p align="center"><em>Your AI. Your Workspace. Your Way.</em></p>

<p align="center">
  <a href="https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-Setup.exe"><img src="https://img.shields.io/badge/Download-NEXUS%20f%C3%BCr%20Windows-6366f1?style=for-the-badge&logo=windows&logoColor=white" alt="Download NEXUS für Windows"></a>
</p>

<p align="center">
  <a href="https://github.com/CaseyMazey/NEXUS/releases/latest"><img src="https://img.shields.io/github/v/release/CaseyMazey/NEXUS?label=Version" alt="Neueste Version"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4" alt="Windows 10 und 11">
  <img src="https://img.shields.io/badge/Sprache-Deutsch%20%7C%20English-555" alt="Deutsch und Englisch">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-22c55e" alt="MIT-Lizenz"></a>
</p>

NEXUS ist ein **lokaler Rahmen für deine KIs**. Deine Projekte stehen links. Zu jedem Projekt gehört ein eigener Schreibtisch („Desk“), auf dem Claude Code, Claude, ChatGPT, Gemini und andere KIs nebeneinander liegen. Wechselst du das Projekt, ist alles wieder genau so da, wie du es verlassen hast.

- **Ohne Konto, ohne Server:** NEXUS läuft komplett auf deinem Rechner und hat selbst keine Anmeldung.
- **Deine Anmeldungen bleiben bei dir:** Du verbindest deine eigenen KIs und meldest dich dort selbst an. NEXUS speichert keine Zugangsdaten.

## Installieren

1. **[NEXUS-Setup.exe herunterladen](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-Setup.exe)** (Windows 10/11, ca. 120 MB).
2. Die Datei ausführen. NEXUS installiert sich für deinen Benutzer, ohne Admin-Rechte, und legt eine Verknüpfung auf dem Desktop und im Startmenü an.
3. Beim ersten Start warnt Windows eventuell „Der Computer wurde durch Windows geschützt“, weil das Setup noch nicht signiert ist. Klick dann auf **Weitere Informationen → Trotzdem ausführen**.

**Updates kommen automatisch.** NEXUS prüft beim Start, ob es eine neue Version gibt, lädt sie im Hintergrund und fragt, ob es neu starten soll. **Deinstallieren** geht über Windows-Einstellungen → Apps. Deine Daten bleiben dabei erhalten.

## Was NEXUS kann

- **Projekte und Desks:** Jedes Projekt ist ein Ordner auf deinem Rechner. Pro Desk legst du bis zu vier KIs nebeneinander.
- **Meine KIs:** Claude, ChatGPT, Gemini, Perplexity, Le Chat, Copilot, DeepSeek oder jede andere KI-Webseite. Du meldest dich einmal an, und die Anmeldung gilt in allen Desks und übersteht Neustarts.
- **3C, der Claude-Code-Chat:** [Claude Code](https://claude.com/claude-code) mit eigener Chat-Oberfläche:
  - Bilder per 📎 anhängen und Befehle mit `/` aufrufen.
  - Weiterschreiben, während Claude arbeitet, und Vorschläge für die nächste Nachricht per Tab übernehmen.
  - Uhrzeit und Dauer zu jedem Auftrag.
  - Rechte-Modi von „fragt immer“ über „fragt nur beim Pushen“ bis „fragt nie“.
  - Eine Windows-Meldung, wenn Claude eine Entscheidung von dir braucht.
- **Claude-Code-Sitzungen:** Alle Sitzungen eines Projekts kannst du durchsuchen, farbig markieren und anheften. Ein Klick setzt eine Sitzung fort.
- **Sechs Themes:** Hell, Creme, Sand, Nacht, Retro und Kupfer. Der Sonne/Mond-Knopf wechselt zwischen deinem hellen und deinem dunklen Theme.
- **Deutsch und Englisch**, standardmäßig in der Sprache von Windows.

Für 3C und das Terminal brauchst du [Claude Code](https://claude.com/claude-code) auf deinem Rechner, angemeldet mit deinem eigenen Konto. Fehlt es, sagt NEXUS dir, was zu tun ist.

## Datenschutz

- Alles bleibt auf deinem Rechner, in `%APPDATA%\NEXUS`. Sicherungen der letzten 7 Tage liegen in `backups\`.
- Die KI-Webseiten laufen unverändert und in getrennten Bereichen. NEXUS schleust keine Skripte ein und liest keine Chats aus.
- Das Protokoll in `logs\` enthält keine Zugangsdaten und keine E-Mail-Adressen. Du öffnest es über ⚙ → „Protokoll öffnen“.

## Für Entwickler

Der Code der App liegt in [`app/`](app/README.md) (Electron).

```bash
cd app
npm install
npm start          # aus dem Quellcode starten
npm test           # Unit- und Oberflächentests
npm run dist       # Setup bauen
```

- [`docs/phase-1/plan.md`](docs/phase-1/plan.md): Plan und Stand der Meilensteine (Fundament, Installer, Updates, Stabilität, Funktionen)
- [`docs/phase-0/ergebnisse.md`](docs/phase-0/ergebnisse.md): technische Validierung
- [`spike/`](spike): Prototypen aus Phase 0 (nur noch als Archiv)

---

### English

NEXUS is a **local frame for your AIs** on Windows. Every project gets its own desk with Claude Code, Claude, ChatGPT, Gemini and others side by side. There is no NEXUS account and no server. You connect your own AIs and sign in to them yourself.

**[Download NEXUS-Setup.exe](https://github.com/CaseyMazey/NEXUS/releases/latest/download/NEXUS-Setup.exe)**, run it (no admin rights needed), and NEXUS keeps itself up to date. On first start Windows SmartScreen may warn because the installer is not signed yet: click **More info → Run anyway**. The app is available in English and German.

## Lizenz

[MIT](LICENSE) © CaseyMazey
