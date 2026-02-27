# Changelog

All notable changes to Logbuch are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

---

## [1.2.4] - 2026-02-27

### Fixed
- Layout: Sidebar-Logo-Zeile und Header haben jetzt exakt dieselbe Höhe (`h-14`) — die horizontale Trennlinie fluchtet nun korrekt
- Header-Titel wird auf Desktop ausgeblendet (Sidebar zeigt den aktiven Eintrag bereits) — auf Mobile/Tablet bleibt er erhalten; rechte Aktionsbuttons bleiben rechtsbündig
- Einstellungen > Backup: Hinweistext im Backup-Ordner-Bereich unterscheidet jetzt zwischen App («Speichert Backups direkt in den gewählten Ordner») und PWA (mit Zusatz «Erfordert Chrome oder Edge»)
- Auswertung: Passage-Dropdown verwendet jetzt den einheitlichen `Select`-Component statt einem rohen `<select>`-Element

---

## [1.2.3] - 2026-02-27

### Fixed
- Windows App: NMEA-Gerätekonfiguration (Host/Port/Protokoll) geht beim Schliessen und Neustart der App nicht mehr verloren — die Konfiguration wird nun in Dexie `AppSettings` gespeichert; beim Speichern in den Einstellungen wird sie zusätzlich dort persistiert; beim Start der Bridge liest `AppLayout` die gespeicherten Werte und sendet sie per `POST /api/config` an die Bridge sobald diese erreichbar ist (Retry bis 10 s)
- Alle Plattformen: NMEA-Geräteformular zeigt beim Öffnen der Einstellungen die zuletzt gespeicherten Werte auch wenn die Bridge noch nicht gestartet ist (Dexie-Fallback statt Standardwerte `192.168.0.1:10110`)

---

## [1.2.2] - 2026-02-27

### Fixed
- Windows App: NSIS-Installer kann `nmea-bridge.exe` beim Update nun überschreiben — dreifache Absicherung: (1) NSIS Pre-Install Hook (`NSIS_HOOK_PREINSTALL`) ruft `taskkill /F /IM nmea-bridge.exe` vor der Dateiextraktion auf, (2) Rust `RunEvent::Exit`-Handler killt die Bridge beim App-Exit, (3) JS `invoke('kill_bridge')` direkt vor `relaunch()` im In-App-Updater

---

## [1.2.1] - 2026-02-27

### Fixed
- Windows App: NMEA-Einstellungen speichern schlugen mit «Bridge nicht erreichbar» fehl, obwohl die Bridge lief — `writeFileSync` schlug im read-only App-Verzeichnis (Windows Program Files) still fehl; der Fehler ist nun nicht-fatal, Config wird in-memory aktualisiert und `reconnect()` läuft immer; betrifft nur Persistenz über Neustarts, nicht die aktive Verbindung
- Alle Plattformen (App & PWA): «Letzte Nachrichten» im NMEA-Debug-Panel zeigte akkumulierte Felder aus allen vorherigen Satztypen statt der tatsächlichen Inhalte des jeweiligen Satzes (`$DBT` zeigte z.B. Lat/Lon/SOG aus vorherigen `$RMC`-Meldungen); Panel zeigt nun die rohe NMEA-Sentence je Eintrag

---

## [1.2.0] - 2026-02-27

### Fixed
- Windows/macOS: Länderflaggen in Dropdowns und Sprachauswahl werden nun plattformübergreifend korrekt angezeigt — emoji-Flags (funktionieren nicht auf Windows) und CSS-Sprites (flag-icons, unzuverlässig in WebView2/WKWebView) wurden durch `<img>`-Tags mit Vite-gebündelten SVG-Assets ersetzt; `flagUrl.ts` lädt alle Flaggen via `import.meta.glob` als echte Asset-URLs
- Port Log: «Logeintrag hinzufügen»-Button am unteren Ende der Einträgsliste ist bei gesperrten Passagen nun korrekt deaktiviert (nur der Header-Button war gesperrt)

---

## [1.1.9] - 2026-02-27

### Fixed
- Windows/macOS: NMEA-Debugpanel «Letzte Nachrichten» zeigt nun Einträge — das Panel erstellte bisher eine eigene WebSocket-Verbindung zum Bridge-Server, die zwar verbunden war (sichtbar als «2 Clients»), aber keine Nachrichten empfing; das Panel nutzt jetzt den NMEAContext-Datenstrom aus AppLayout und benötigt keine eigene Verbindung mehr
- `type` und `_raw` werden nun in `NMEAData` gespeichert, sodass der Satztyp (RMC, MWV, …) im Log weiterhin angezeigt wird

### Changed
- Button-UX: Alle Buttons (primary, secondary, danger, ghost) haben nun sichtbares Hover (Abdunklung) und Press-Feedback (`translateY(1px)`); Text und Icon bleiben bei Hover weiss — Tailwind JIT kompilierte `.btn-primary`/`.btn-secondary` aus `@layer components` nicht zuverlässig; Stile vollständig außerhalb `@layer` definiert

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
