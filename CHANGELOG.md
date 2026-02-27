# Changelog

All notable changes to Logbuch are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

---

## [1.1.8] - 2026-02-27

### Fixed
- Windows: NMEA-Bridge-Sidecar startet nun korrekt — fehlende ACL-Berechtigung `shell:allow-spawn` in `capabilities/default.json` verhinderte `Command.sidecar().spawn()`; bisher war nur `shell:allow-execute` (blocking) eingetragen

---

## [1.1.7] - 2026-02-27

### Fixed
- macOS: NMEA-Badge flackert nicht mehr gelb — Bridge sendet alle 5 s einen JSON-Heartbeat (nur wenn NMEA-TCP verbunden), der `updatedAt` im Browser aktuell hält; `ws.ping()` (Protocol-Level) aktualisiert `updatedAt` nicht und war daher wirkungslos für den Badge
- NMEA-Badge: Stale-Schwelle von 30 s auf 60 s erhöht (Tooltip angepasst)

---

## [1.1.6] - 2026-02-27

### Fixed
- macOS/Windows: NMEA-Daten gehen beim Seitenwechsel nicht mehr verloren — eine einzige persistente WebSocket-Verbindung läuft jetzt in AppLayout (React Context) statt pro Seite neu aufgebaut zu werden; LogEntryForm und Einstellungen zeigen sofort aktuelle NMEA-Daten ohne Wartezeit

---

## [1.1.5] - 2026-02-27

### Fixed
- Windows: NMEA-Bridge-Sidecar startet jetzt automatisch neu wenn er abstürzt — 30s Watchdog-Intervall prüft `/api/status` und startet den Prozess neu falls nicht erreichbar; `bridgeSpawning`-Guard verhindert parallele Spawn-Versuche
- Windows: NMEA-Bridge-Sidecar beendet sich sauber mit Exit-Code 0 wenn Port 3001 bereits belegt ist (EADDRINUSE) statt lautlosem Absturz

---

## [1.1.4] - 2026-02-27

### Fixed
- Windows/macOS: Veraltete Service Worker werden jetzt zuverlässig beim App-Start über den Rust-Layer unregistriert — behebt dauerhaft den Catch-22 bei dem der alte SW den neuen self-destroying SW blockierte (isTauri=false, falsche NMEA-Einstellungen)
- NMEA Bridge: WebSocket-Keepalive-Ping alle 20 s — verhindert dass WKWebView/WebView2 idle Verbindungen schließt (NMEA-Abbruch beim Seitenwechsel)

---

## [1.1.3] - 2026-02-27

### Fixed
- Tauri (Windows/macOS): NMEA-Bridge-Sidecar startet nun korrekt — PWA Service Worker im WebView2/WKWebView verursachte stale JS-Cache über Reinstalls hinweg; Tauri-Builds generieren jetzt einen Self-Destroying Service Worker

---

## [1.1.2] - 2026-02-27

### Added
- NMEA Bridge: Wird in der Tauri-Desktop-App (macOS & Windows) automatisch gestartet (Sidecar via bun compile)

### Fixed
- macOS: Backup-Ordner wählen öffnet jetzt nativen Finder-Dialog (WKWebView unterstützt keine File System Access API)
- macOS: Backup ZIP exportieren funktioniert jetzt über nativen Speichern-Dialog
- Sidebar: Versionsnummer zeigt korrekte App-Version via `__APP_VERSION__`

### Changed
- NMEA-Einstellungen: URL-Feld entfernt; Bridge startet automatisch beim App-Start wenn NMEA aktiv

---

## [1.1.1] - 2026-02-27

### Fixed
- NMEA: Verbindungsstatus in Einstellungen konsistent mit Header-Badge
- NMEA: Live-Daten Panel bezieht Werte zuverlässig aus dem useNMEA-Hook
- PWA: Weisse Seite nach Service-Worker-Update behoben
- Updater: macOS-Updatefehler behoben (dialog:true Konflikt entfernt)
- Windows: Versionsnummer wird nach Update korrekt angezeigt
- Crew-Kacheln: Passportnummer und «An Bord seit» auf gleicher Höhe

### Changed
- NMEA-Einstellungen: Bridge-Server und NMEA-Gerät klarer getrennt; Live-Daten-Panel
- NMEA-Einstellungen: Doppelter Verbinden-Button zu einem kontextuellen Button konsolidiert
- Tabelle Logbucheinträge: Kurs, SOG, BFT, Oktas, hPa, nm zentriert ausgerichtet
- Einstellungen: Schweizer Flagge für Deutsch-Sprachauswahl

---

## [1.1.0] - 2026-02-27

### Added
- Wartung: Wiederkehrende Aufgaben (täglich / wöchentlich / monatlich / jährlich / Motorstunden)
- Wartung: Checklisten pro Aufgabe mit Fortschrittsanzeige auf Kanban-Karten
- Dashboard: Wartungsbenachrichtigungen für Aufgaben, die in 14 Tagen fällig sind
- Sidebar: Rotes Badge für überfällige Wartungsaufgaben
- Länderflaggen: CSS-Sprites (flag-icons) statt Emoji in Länderauswahl und Spracheinstellungen
- Notfall & Sicherheit: Vollständige i18n-Übersetzung (DE/EN)
- Crew: Löschen-Bestätigung über Modal (kein nativer confirm()-Dialog mehr)
- Port Log: Löschen-Bestätigung über Modal; Saison-Lock Toasts übersetzt
- Export: Karten gleiche Höhe, Button immer am unteren Rand
- PDF: Alle Beschriftungen auf Englisch vereinheitlicht

### Fixed
- Tabellentypografie-Fehler in PortLog und Dashboard (Safari-Kompatibilität)
- Tauri v2 Updater: `createUpdaterArtifacts: true` aktiviert

---

## [1.0.8] - 2026-02-26

### Fixed
- GitHub Actions: macOS ARM-Runner (`macos-latest` statt deprecated `macos-13`)
- Tauri Updater: Signing-Key aktualisiert; `latest.json` wird korrekt generiert

---

## [1.0.7] - 2026-02-26

### Fixed
- macOS: Universelles Binary für Updater-Kompatibilität (Rosetta 2)

---

## [1.0.6] - 2026-02-25

### Fixed
- Updater-Workflow und Signing-Prozess stabilisiert
- GitHub Release Workflow: `workflow_dispatch` für manuelle Releases

---

## [1.0.5] - 2026-02-25

### Added
- Initiale Tauri-Desktop-App (macOS ARM, Windows x64, Linux AppImage)
- Auto-Updater über GitHub Releases (`tauri-plugin-updater`)
- PDF-Export in Tauri via nativen Save-Dialog (`tauri-plugin-dialog`)
