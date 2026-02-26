Info# Logbuch ⚓

**Digitales Segellogbuch als Progressive Web App (PWA)**

Logbuch ist ein vollständig offline-fähiges Logbuch für Segelyachten. Alle Daten werden lokal im Browser gespeichert (IndexedDB) — kein Server, kein Cloud-Abo, keine Internetverbindung erforderlich. Die App kann auf jedem Gerät (iOS, Android, macOS, Windows) als installierbare App genutzt werden.

---

## Features

- **Logeinträge** — Position, Kurs, Geschwindigkeit, Wind (Beaufort), Seegang, Barometer, Segelkonfiguration, Motor, Besatzung, Notizen
- **Passagen** — Port-to-Port-Verwaltung mit automatischer Datumssynchronisation aus Logeinträgen; Sperren nach Abschluss; PDF-Export je Passage
- **Wartung** — Kanban-Board (Geplant / In Arbeit / Erledigt) mit Drag & Drop, Prioritäten, Fälligkeiten, Kostentracking
- **Besatzung** — Crewliste mit Qualifikationen, Passdaten, Bordzeiten
- **Statistiken** — Gesegelte Meilen, Windverteilung, Mooringstatus, Saisonübersicht
- **Suche** — Volltextsuche über alle Einträge mit Such-Operatoren (`port:`, `bft:`, `date:`, `crew:`)
- **PDF-Export** — Logbuch (A4 Querformat), Schiffsdossier, Besatzungsliste, Zollerklärung
- **NMEA-Bridge** — Optionaler Node.js-Server liest NMEA 0183-Daten vom Bordsystem (TCP/UDP) und überträgt sie per WebSocket an den Browser
- **Backup** — Automatisches tägliches Backup als ZIP-Datei; manueller Export/Import
- **Mehrsprachig** — Deutsch / Englisch
- **Dark Mode** — Systemeinstellung oder manuell

---

## Voraussetzungen

**Für die PWA (Webversion):**

| Software | Version | Download |
|----------|---------|----------|
| **Node.js** | 18 oder neuer (getestet mit v19.1.0) | https://nodejs.org |
| **npm** | wird mit Node.js mitgeliefert | — |
| **Git** | optional, für Clone | https://git-scm.com |

**Zusätzlich für die Tauri Desktop-App (nur Entwickler, die selbst bauen):**

| Software | Version | Download |
|----------|---------|----------|
| **Rust** | stable | https://rustup.rs |

> **Hinweis:** Auf macOS empfiehlt sich die Installation von Node.js über [nvm](https://github.com/nvm-sh/nvm) oder [Homebrew](https://brew.sh) (`brew install node`).
> Endnutzer können die fertige Desktop-App direkt von GitHub Releases herunterladen — ohne Rust oder Node.js.

---

## Installation

### 1. Projekt herunterladen

**Option A — Git Clone (empfohlen):**
```bash
git clone https://github.com/FlowPro/Logbook.git
cd Logbook
```

**Option B — ZIP herunterladen:**
Archiv entpacken und in das Projektverzeichnis wechseln.

---

### 2. Abhängigkeiten installieren

```bash
npm install
```

Dieser Schritt lädt alle Bibliotheken aus dem Internet und legt sie im Ordner `node_modules/` ab. Dauert beim ersten Mal ca. 30–60 Sekunden.

---

### 3. App starten

```bash
npm run dev
```

Die App ist dann unter **http://localhost:5173** erreichbar.

> Der Browser öffnet sich nicht automatisch — URL manuell eingeben oder im Terminal auf den Link klicken.

---

## Produktiv-Build (für Hosting / lokale PWA-Installation)

```bash
npm run build
```

Erzeugt einen optimierten Build im Ordner `dist/`. Dieser kann:

- **Lokal vorschauen:** `npm run preview` → http://localhost:4173
- **Auf einem Webserver deployen:** Inhalt von `dist/` in das Web-Root kopieren (z.B. Nginx, Apache, GitHub Pages)
- **Als PWA installieren:** Im Browser auf die Installations-Schaltfläche in der Adressleiste klicken

> Für die PWA-Installation muss die App über **HTTPS** oder **localhost** ausgeliefert werden.

---

## Alle Befehle im Überblick

| Befehl | Beschreibung |
|--------|-------------|
| `npm run dev` | Entwicklungsserver starten (hot reload) |
| `npm run build` | Produktions-Build erstellen (PWA) |
| `npm run preview` | Fertigen Build lokal testen |
| `npm run server` | Nur NMEA-Bridge starten |
| `npm run dev:nmea` | App + NMEA-Bridge gleichzeitig starten |
| `npm run tauri:dev` | Tauri Desktop-App im Entwicklungsmodus starten |
| `npm run tauri:build` | Tauri Desktop-App für aktuelles Betriebssystem bauen |

---

## Desktop-App

Logbuch ist als native Desktop-App für Windows, macOS und Linux verfügbar — gebaut mit [Tauri](https://tauri.app).

---

### Für Endnutzer — Installer herunterladen

Aktuelle Version auf der **[Releases-Seite](https://github.com/FlowPro/Logbook/releases)** herunterladen:

| Betriebssystem | Datei | Beschreibung |
|----------------|-------|--------------|
| **Windows** | `.msi` | Windows Installer |
| **macOS** | `.dmg` | Disk Image — öffnen und App in Programme ziehen |
| **Linux** | `.AppImage` | Ausführbar machen (`chmod +x`) und starten |

Kein Node.js, kein Rust, keine Kommandozeile erforderlich.

> **Automatische Updates:** Die App prüft beim Start auf neue Versionen und bietet ein Update an.

#### Sicherheitswarnung beim ersten Start

Die App ist **nicht mit einem offiziellen Zertifikat signiert**. Beim ersten Start erscheint deshalb eine Warnung des Betriebssystems — das ist normal und kein Zeichen für Schadsoftware.

**macOS:**
> *„Logbuch.app kann nicht geöffnet werden, da der Entwickler nicht verifiziert werden kann."*

→ **Rechtsklick** auf die App → **Öffnen** → im Dialog erneut **Öffnen** klicken.
Alternativ: Systemeinstellungen → Datenschutz & Sicherheit → **Trotzdem öffnen**.

**Windows:**
> *„Windows hat den PC geschützt"* (SmartScreen)

→ **Weitere Informationen** klicken → **Trotzdem ausführen**.

---

### Für Entwickler — Aus dem Quellcode bauen

```bash
# Voraussetzungen: Node.js + Rust (rustup.rs)
npm install
npm run tauri:build
```

Der fertige Installer liegt danach unter `src-tauri/target/release/bundle/`.

Für den Entwicklungsmodus mit Live-Reload:

```bash
npm run tauri:dev
```

---

## NMEA-Bridge (optional)

Die NMEA-Bridge ist ein optionaler Node.js-Dienst, der Live-Daten vom Bordsystem (GPS, Wind, Log) über TCP oder UDP empfängt und per WebSocket an die App weitergibt. Damit können Logeinträge automatisch mit aktuellen Positionsdaten befüllt werden.

### Konfiguration

Datei `server/config.json` anpassen:

```json
{
  "nmea": {
    "host": "192.168.1.100",
    "port": 10110,
    "protocol": "tcp",
    "reconnectIntervalMs": 5000
  },
  "websocket": {
    "port": 3001
  }
}
```

| Feld | Bedeutung |
|------|-----------|
| `host` | IP-Adresse des NMEA-Gateways / Plotters |
| `port` | TCP- oder UDP-Port des NMEA-Streams |
| `protocol` | `"tcp"` oder `"udp"` |
| `reconnectIntervalMs` | Wartezeit in ms bei Verbindungsabbruch |

Die Konfiguration kann alternativ direkt in der App unter **Einstellungen → NMEA-Integration** vorgenommen werden.

### Starten

```bash
# Nur Bridge
npm run server

# Bridge + App gleichzeitig
npm run dev:nmea
```

---

## Node-Module aktualisieren

### Verfügbare Updates prüfen

```bash
npx npm-check-updates
```

Zeigt alle veralteten Pakete mit den verfügbaren Versionen an (liest nur — ändert nichts).

### Patch- und Minor-Updates einspielen (empfohlen, sicher)

```bash
npx npm-check-updates -u --target minor
npm install
npm run build
```

Aktualisiert `package.json` auf neueste Minor-Versionen (keine Breaking Changes), installiert und verifiziert den Build.

### Alle Updates inklusive Major-Versionen

> **Vorsicht:** Major-Updates können Breaking Changes enthalten. Nur mit anschließendem Test durchführen.

```bash
npx npm-check-updates -u
npm install
npm run build
```

### Sicherheits-Audit

```bash
npm audit
npm audit fix        # Automatisch behebbare Schwachstellen fixen
```

### Empfohlene Update-Routine (z.B. einmal pro Quartal)

```bash
# 1. Aktuelle Abhängigkeiten prüfen
npx npm-check-updates

# 2. Sichere Updates einspielen
npx npm-check-updates -u --target minor
npm install

# 3. Build testen
npm run build

# 4. App kurz im Browser testen
npm run preview

# 5. Sicherheits-Audit
npm audit
```

---

## Datensicherung & Migration

Alle Daten liegen im **Browser-eigenen IndexedDB-Speicher** — sie werden nicht synchronisiert und sind gerätespezifisch. Beim Löschen des Browser-Caches oder bei einem neuen Gerät gehen Daten verloren, wenn kein Backup vorhanden ist.

### Backup erstellen

In der App: **Einstellungen → Datensicherung → Jetzt sichern**

Das Backup wird als `.zip`-Datei gespeichert (enthält alle Passagen, Logeinträge, Besatzung, Wartung und Schiffsdaten als JSON).

### Automatisches Backup

Unter **Einstellungen → Datensicherung → Automatische Sicherung** aktivieren. Die App erstellt dann täglich beim ersten Öffnen ein Backup.

### Daten wiederherstellen

In der App: **Einstellungen → Datensicherung → Backup laden** → ZIP-Datei auswählen.

### Auf ein neues Gerät umziehen

1. Auf dem alten Gerät: Backup erstellen (ZIP)
2. ZIP-Datei auf das neue Gerät übertragen
3. App auf neuem Gerät öffnen, unter Einstellungen das Backup laden

---

## Projektstruktur

```
logbuch/
├── src/
│   ├── components/     UI-Komponenten (Layout, Buttons, Formulare)
│   ├── db/             Datenbank-Schema (Dexie/IndexedDB) und Typen
│   ├── hooks/          React Hooks (Daten lesen/schreiben)
│   ├── i18n/           Übersetzungen (de.ts, en.ts)
│   ├── pages/          Alle Seiten der App
│   └── utils/          Hilfsfunktionen (PDF, Geo, Einheiten)
├── src-tauri/          Tauri Desktop-App (Rust + Konfiguration)
│   ├── src/            Rust-Quellcode (main.rs, lib.rs)
│   ├── icons/          App-Icons (alle Plattformen)
│   └── tauri.conf.json Tauri-Konfiguration (Fenster, Updater, ...)
├── server/             NMEA-Bridge (optionaler Node.js-Dienst)
├── public/             Statische Assets (Icons, Manifest)
├── dist/               Produktions-Build (nach npm run build)
├── package.json
└── vite.config.ts
```

---

## Technologie

- [Vite](https://vitejs.dev) + [React 18](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Dexie.js](https://dexie.org) (IndexedDB)
- [Tailwind CSS v3](https://tailwindcss.com)
- [React Router v6](https://reactrouter.com)
- [jsPDF](https://github.com/parallax/jsPDF) + [autotable](https://github.com/simonbengtsson/jsPDF-AutoTable)
- [Recharts](https://recharts.org)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app)

---

## Haftungsausschluss

Logbuch wird **ohne jegliche Gewährleistung** und ohne Support bereitgestellt. Die Nutzung erfolgt auf eigene Verantwortung.

- Kein offizieller Support, keine garantierten Updates, kein SLA
- Datenverlust durch Browsercache-Löschung oder fehlende Backups liegt in der Verantwortung des Nutzers
- Die App ist nicht für sicherheitskritische Navigation geeignet — sie ersetzt keine offiziellen Seekarten oder zugelassene Navigationssoftware

Die Software wird so bereitgestellt, wie sie ist (*„as is"*).

---

## Lizenz

Veröffentlicht unter der [MIT License](LICENSE) — frei nutzbar, veränderbar und weitergabe erlaubt, solange der Copyright-Hinweis erhalten bleibt.
