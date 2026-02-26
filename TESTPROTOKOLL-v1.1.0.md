# Testprotokoll — Logbuch v1.1.0

**Datum:** 2026-02-27
**Version:** 1.1.0
**Plattform:** macOS (Darwin 25.3.0, Apple Silicon)
**Node.js:** v22 (via Homebrew)
**Getestet in:** Safari (macOS), Chrome (macOS)

---

## 1. Automatisierte Checks

### 1.1 TypeScript-Kompilierung (`tsc`)
| Ergebnis | Details |
|----------|---------|
| ✅ **PASS** | Keine TypeScript-Fehler |

### 1.2 Produktions-Build (`npm run build`)
| Ergebnis | Details |
|----------|---------|
| ✅ **PASS** | Exit code 0, Build in ~5 s |
| ✅ PWA-Manifest | 155 Einträge im Precache |
| ✅ Service Worker | `dist/sw.js` + `dist/workbox-*.js` generiert |
| ⚠️ Bundle-Grösse | 2 349 kB / 748 kB gzip — erwartet und dokumentiert |
| ⚠️ jszip Import | Statischer + dynamischer Import in Settings/backupDir — bekanntes nicht-blockierendes Warning |

### 1.3 ESLint (`npm run lint`)
| Ergebnis | Details |
|----------|---------|
| ⚠️ **SKIPPED** | ESLint nicht in `node_modules` installiert — kein `eslint`-Binary vorhanden. Kein Blocker für Release. |

---

## 2. Manuelle Funktionstests

### 2.1 Tabellen-Typografie (Bugfix dieser Version)
| Test | Ergebnis |
|------|---------|
| PortLog: Header-Zellen einheitliche Schriftformatierung | ✅ PASS |
| Dashboard: Header-Zellen einheitliche Schriftformatierung | ✅ PASS |
| PortLog: Datenzellen einheitlich Monospace | ✅ PASS |
| Dashboard: Datenzellen einheitlich Monospace | ✅ PASS |
| Safari und Chrome identisches Rendering | ✅ PASS |

### 2.2 Wiederkehrende Wartungsaufgaben
| Test | Ergebnis |
|------|---------|
| Aufgabe als wiederkehrend markieren (z.B. alle 3 Monate) | ✅ PASS |
| Aufgabe auf "Erledigt" setzen → neue Folgeaufgabe wird erstellt | ✅ PASS |
| Drag & Drop auf "Erledigt" → Folgeaufgabe wird erstellt | ✅ PASS |
| Motorstunden-Wiederholung (engine_hours) | ✅ PASS |
| Badge auf Kanban-Karte sichtbar | ✅ PASS |

### 2.3 Hafen-Autocomplete
| Test | Ergebnis |
|------|---------|
| Eingabe eines bekannten Hafens → Vorschlag erscheint | ✅ PASS |
| Tab/Enter übernimmt Hafen + Land automatisch | ✅ PASS |
| Tab überspringt das Länder-Feld (bereits ausgefüllt) | ✅ PASS |
| Unbekannter Hafen → kein Vorschlag, freie Eingabe möglich | ✅ PASS |

### 2.4 Sicherheits-Checklisten
| Test | Ergebnis |
|------|---------|
| PDF-Export Crew-Einweisung | ✅ PASS |
| Erledigte Checkboxen im PDF korrekt dargestellt (grünes Häkchen) | ✅ PASS |
| localStorage-Persistenz (Reload behält Zustand) | ✅ PASS |

### 2.5 Dashboard
| Test | Ergebnis |
|------|---------|
| Wartungs-Alerts Widget (überfällig / fällig in 14 Tagen) | ✅ PASS |
| Sidebar-Badge rot bei überfälligen Aufgaben | ✅ PASS |

### 2.6 Passage PDF
| Test | Ergebnis |
|------|---------|
| "Crew auf Wache"-Spalte im Passage-PDF vorhanden | ✅ PASS |

---

## 3. Bekannte Einschränkungen / Offene Punkte

| # | Beschreibung | Priorität |
|---|-------------|-----------|
| 1 | ESLint nicht installiert — kein statischer Code-Analyse-Lauf möglich | Niedrig |
| 2 | Keine automatisierten Unit-/Integrationstests (kein Vitest/Jest) | Niedrig |
| 3 | Bundle-Grösse ~748 kB gzip (akzeptabel, dokumentiert in CLAUDE.md) | Info |

---

## 4. Änderungen gegenüber v1.0.8

### Neue Features
- **Wiederkehrende Wartungsaufgaben** — Zyklen: Tage / Wochen / Monate / Jahre / Motorstunden; automatische Folgeaufgabe bei Abschluss
- **Wartungs-Checklisten** — Checklistenpunkte pro Aufgabe mit Fortschrittsbalken auf Kanban-Karte
- **Dashboard Wartungs-Alerts** — Fällige Aufgaben (nächste 14 Tage + überfällig) direkt auf der Startseite
- **Hafen-Autocomplete** — Autovervollständigung mit Länderübernahme beim Erstellen neuer Passagen
- **Crew-Einweisung PDF** — Sicherheits-Checklisten-Export mit Unterschriftenzeilen je Besatzungsmitglied
- **Passage-PDF: Wach-Spalte** — „Crew auf Wache" pro Logeintrag im Passage-PDF

### Bugfixes
- **Tabellen-Typografie** — Inkonsistente Schriftformatierung in Logbuch-Tabellen (PortLog, Dashboard) durch Kollision von `.table-cell`-Komponente (index.css) mit Tailwind `sm:table-cell`-Utility behoben. Fix: `hidden sm:table-cell` → `max-sm:hidden` (analog für md/lg)
- **Crew-Einweisung PDF** — Erledigte Checkboxen wurden leer dargestellt
- **Crew-Karten** — Button-Ausrichtung bei unterschiedlicher Kartenhöhe korrigiert (flex-col + flex-1)
- **Sidebar** — Einstellungen als Zahnrad-Icon im Footer; Wartungs-Badge rot bei überfälligen Aufgaben

### Verbesserungen
- Flag-Icons (CSS-Sprites) in CountrySelect und Sprachauswahl
- Sicherheits-Checklisten: Kürzere deutsche Button-Labels; Layout des Crew-Einweisungs-PDF an bestehende Reports angepasst
- PDF-Exports: Einheitlich englischsprachig

---

## 5. Build-Artefakte

| Datei | Grösse | Beschreibung |
|-------|--------|--------------|
| `dist/assets/index-*.js` | 2 349 kB (748 kB gz) | Haupt-Bundle |
| `dist/assets/index-*.css` | 474 kB (94 kB gz) | Tailwind CSS |
| `dist/sw.js` | — | PWA Service Worker |
| `dist/manifest.webmanifest` | 0.5 kB | PWA Manifest |
| Precache-Einträge | 155 | ~6.7 MB total |
