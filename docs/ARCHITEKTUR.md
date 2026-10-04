# Architektur — wie der Stundenplanner gebaut ist

> Der Vertrag zwischen den Teilen. Wer ein Format, einen Ordner oder einen Befehl ändert, ändert
> ihn hier zuerst. Was das Werkzeug können soll, steht im [Scope](SCOPE.md), hier steht nur, wie.

## 1. Fünf Teile, eine Richtung

```
katalog/ ──► abruf/abruf.py ──► daten/roh/ ──► abruf/bauen.py ──► web/daten/ ──► web/ (Browser)
 (von Hand)    (MOSES, öffentlich)  (Rohstand)    (Lesemodell)      (JSON)        (Auswahl lokal)
 └───────────── täglich im Container stundenplanner-abruf auf dem NAS ─────────────┘ ──► Cloudflare Pages
```

**Der NAS crawlt, Cloudflare liefert aus** (Silas, 05.10.2026, nach seiner Hosting-Recherche). Ein
eigener Container rechnet einmal am Tag alles bis `web/` und lädt die fertige Seite mit `wrangler`
nach Cloudflare Pages hoch. Er baut nur ausgehende Verbindungen auf, der NAS ist nie ein Webserver.
Fällt er aus, bleibt die Seite von gestern online. GitHub Pages scheidet aus, weil es ein „online
business“ verbietet (Werbung ist später möglich). GitHub prüft nur: Tests bei jedem Push und eine
tägliche Frischeprüfung von außen.

| Teil | Ordner | Was | Bauteil |
|---|---|---|---|
| **Katalog** | `katalog/` | Semester, Studiengänge und welche Module in welchem Fachsemester dran sind. Von Hand, versioniert | `stundenplanner-abruf` |
| **Abruf** | `abruf/abruf.py`, `abruf/moses.py` | holt je Modul die öffentlichen MOSES-Seiten und den CSV-Export der Einzelbuchungen und schreibt einen **Rohstand** je Modul | `stundenplanner-abruf` |
| **Lesemodell** | `abruf/plan.py`, `abruf/bauen.py` | rechnet aus Rohständen und Katalog die Daten, die die Seite liest: Termin-Slots, 14-Tage-Rhythmus, Fingerabdruck je Gruppe, Zählungen | `stundenplanner-abruf` |
| **Seite** | `web/` | statisches HTML, CSS und JS, **ohne Build-Schritt**. Liest `web/daten/`, hält die Auswahl im Browser und rechnet die Konflikte der Auswahl. Wie sie aussieht und sich bedient: [`docs/DESIGN.md`](DESIGN.md) | `stundenplanner-oberflaeche` |
| **Betrieb** | `betrieb/`, `ops/bauen.sh`, `.github/workflows/` | auf dem NAS der Container `stundenplanner-abruf`: täglich Abruf → Bauen → Test → Cloudflare Pages, Stand `main` (live = main). Auf GitHub: Test bei jedem Push, Frischeprüfung. Einzelheiten: [`docs/BETRIEB.md`](BETRIEB.md) | `stundenplanner-betrieb` |

**Herkunft:** Abruf und Lesemodell sind aus dem Study OS übernommen (`thalamus404/studyOS`:
`stundenplan/moses.py`, `stundenplan/runner.py`, `app/stundenplan.py`), die Seite aus
`app/templates/stundenplan.html` und `app/static/stundenplan.js`/`.css`. Was übernommen ist, ist
kopiert. Eine Verbindung dorthin gibt es nicht (AGENTS.md §2 ④): keine Datenbank, kein Abruf aus
Silas' Systemen, kein gemeinsamer Code.

**Der Server ist weg, die Rechnung bleibt in Python.** Im Study OS rechnete der Server bei jedem
Aufruf Slots, Rhythmus und Fingerabdruck. Hier rechnet sie `abruf/bauen.py` einmal je Abruf. Die
geprüfte Logik bleibt also Python, und der Browser bekommt das Ergebnis. Im Browser rechnet nur,
was von der Auswahl abhängt: Konflikte, „noch offen“ und „geändert seit deiner Wahl“.

## 2. Erweiterbar, ohne Code anzufassen

Kein Code nennt einen Studiengang, ein Semester, ein Fachsemester oder ein Datum.

- **Weiteres Fachsemester:** ein Eintrag mehr unter `plaene` in `katalog/studiengaenge/<id>.json`
- **Weiterer Studiengang:** eine Datei mehr in `katalog/studiengaenge/`
- **Neues Semester:** eine Datei in `katalog/semester/` und Pläne, die darauf zeigen

Der Abruf holt jedes Modul **einmal je Semester**, auch wenn es in mehreren Plänen steht. Die
Termine hängen an der Modulnummer und sind TU-weit dieselben. Die Seite liest
`web/daten/index.json` und zeigt die Wahl „Studiengang · Fachsemester“. Steht dort nur ein Plan,
ist die Wahl schon getroffen.

## 3. Der Katalog — `katalog/`

`katalog/semester/<semester-id>.json`

```json
{ "id": "wise-2026-27", "label": "WiSe 2026/27", "moses": "WiSe 2026/27", "anker": "2026-10-12" }
```

`moses` ist die Beschriftung in der Semesterwahl von MOSES. `anker` ist der Montag der ersten
Vorlesungswoche: Die A/B-Wochen zählen echte Kalenderwochen ab ihm.

`katalog/studiengaenge/<studiengang-id>.json`

```json
{ "id": "wi-bsc", "name": "Wirtschaftsinformatik", "abschluss": "B.Sc.", "hochschule": "TU Berlin",
  "plaene": [ { "semester": "wise-2026-27", "fachsemester": 1, "quelle": "…",
                "module": [ { "nummer": "70123", "kurz": "Einf. WI" } ] } ] }
```

## 4. Der Rohstand — `daten/roh/<semester-id>/<modulnummer>.json`

Was der Abruf je Modul schreibt, im Format des Study-OS-Abrufs (`runner.py`, `data`), ohne die
Felder, die dort aus Silas' Datenbank kamen (`short`, `studyos_version`):

```json
{ "number": "70123", "title": "…", "version": 11, "valid_from": "WiSe 2024/25", "valid_to": "offen",
  "valid_versions": [11], "url": "https://moseskonto…", "isis_url": "https://isis…", "notes": { "…": "…" },
  "semester": "WiSe 2026/27",
  "components": [ { "id": "70123:12345", "lvvid": "12345", "title": "…", "type": "Vorlesung", "number": "…",
      "sws": 2.0, "cycle": "…", "language": "…", "section": "Pflichtbereich", "required": true,
      "vvz_url": "…", "isis_url": "…", "semester_id": "…", "status": "ok",
      "groups": [ { "id": "678", "name": "…", "url": "…", "series": [ { "…": "…" } ],
          "bookings": [ { "id": "1", "start": "2026-10-13T10:00:00", "end": "2026-10-13T12:00:00",
              "room": "…", "title": "…", "format": "…", "number": "…", "note": "…", "info": "…" } ] } ] } ],
  "abruf": { "geprueft_am": "2026-10-05T05:20:00+02:00", "erfolg_am": "2026-10-05T05:20:00+02:00", "fehler": null } }
```

**Ein Modul wird nur ersetzt, wenn alle seine Bestandteile gelungen sind.** Scheitert eines, bleibt
der letzte erfolgreiche Rohstand stehen. Nur `abruf.geprueft_am` und `abruf.fehler` ändern sich.
Ein Bestandteil kann `ausgelassen` tragen: `[ { "id", "name", "semester", "bookings": n } ]`, die
Gruppen, die die Seite des Zielsemesters listet, deren Buchungen aber alle ein anderes Semester
tragen (Regel und Anlass: `abruf/README.md`, „Was schiefgehen kann“). Sie stehen nicht in `groups`.
Ohne Vorbestand entsteht ein Rohstand ohne Bestandteile:
`{ "number", "semester", "components": [], "abruf": { "geprueft_am", "erfolg_am": null, "fehler" } }`.
Jede Datei wird atomar geschrieben (tmp im selben Ordner + rename): Ein Leser sieht den alten oder
den neuen Stand, nie eine halbe Datei. `fehler` ist die erste Zeile von `Typ: Meldung`, höchstens
300 Zeichen, nie ein Antwortkörper von MOSES und nie eine `jsessionid`, denn er wird veröffentlicht.

**Der Lauf — `daten/roh/<semester-id>/_lauf.json`.** Am Ende jedes Laufs eines Semesters, auch eines
gescheiterten. Das Lesemodell übernimmt ihn als `last_run`:

```json
{ "gestartet_am": "2026-10-05T05:20:00+02:00", "beendet_am": "2026-10-05T05:21:10+02:00",
  "status": "ok", "modules": 5, "bookings": 949, "errors": [ { "module": "70450", "message": "SourceError: …" } ] }
```

- `status`: `ok` ohne Fehler, `partial` wenn mindestens ein Modul gelang und eines scheiterte,
  `error` wenn keines gelang oder der Lauf als Ganzes scheiterte (dann `module: null`)
- `modules` und `bookings` zählen nur die in diesem Lauf **gelungenen** Module, nicht die
  stehengebliebenen Vorbestände
- Ein Nachabruf mit `--nur` schreibt **kein** `_lauf.json`: Er ist kein Lauf des Semesters, und
  `last_run` soll nicht „1 Modul“ melden, wo der Plan fünf hat

## 5. Das Lesemodell — `web/daten/`

`web/daten/index.json`

```json
{ "schema": 1, "erzeugt_am": "…",
  "plaene": [ { "studiengang": "wi-bsc", "name": "Wirtschaftsinformatik", "abschluss": "B.Sc.",
                "semester": "wise-2026-27", "label": "WiSe 2026/27", "fachsemester": 1,
                "datei": "wi-bsc/wise-2026-27-fs1.json" } ] }
```

`web/daten/<studiengang>/<semester>-fs<n>.json`: die Felder, die die Seite des Study OS schon
las (`load()` in `app/stundenplan.py`). Die Schlüssel bleiben dieselben, damit der Nachbau der
Seite dieselben Namen benutzt:

```json
{ "schema": 1, "erzeugt_am": "…",
  "studiengang": { "id": "wi-bsc", "name": "…", "abschluss": "…" },
  "semester": "wise-2026-27", "label": "WiSe 2026/27", "anchor": "2026-10-12", "fachsemester": 1,
  "modules": [ { "number": "…", "short": "Einf. WI", "title": "…", "version": 11, "valid_from": "…",
      "valid_to": "…", "valid_versions": [11], "url": "…", "isis_url": "…", "notes": {},
      "checked_at": "…", "success_at": "…", "error": null,
      "components": [ { "…": "wie im Rohstand",
          "groups": [ { "…": "wie im Rohstand",
              "key": "70123:12345:678", "digest": "<sha256>", "slots": [ "… siehe unten" ] } ] } ] } ],
  "has_fortnightly": false, "group_count": 65, "booking_count": 949,
  "last_run": { "finished_at": "…", "status": "ok|partial|error", "modules": 5, "bookings": 949, "errors": [] } }
```

- `key` = `component_id + ":" + group_id`
- `digest` = `fingerprint(group)` aus `app/stundenplan.py`: sha256 über die nach `id` sortierte
  Liste `{id, start, end, room}` der Buchungen, `json.dumps(…, sort_keys=True)`
- `slots` = `slots(group, anchor)` aus `app/stundenplan.py`, unverändert: `day`, `start`, `end`,
  `dates`, `rooms`, `occurrences`, `fortnightly`, `parity`, `rhythm`
- **Nicht** im Lesemodell steht, was vom Betrachter abhängt: `selected`, `changed`, `revision`,
  `selection`, `missing`, `selected_count`, `conflicts` und `stale`. Das rechnet die Seite: `stale`
  aus `success_at` (älter als 36 Stunden oder `null`), den Rest aus der lokalen Auswahl
- `checked_at`, `success_at` und `error` kommen aus `abruf.geprueft_am`, `abruf.erfolg_am` und
  `abruf.fehler` des Rohstands. `semester` und `abruf` stehen nicht im Modul. `last_run` kommt aus
  `_lauf.json` (`finished_at` = `beendet_am`) und ist `null`, wenn es die Datei nicht gibt
- Ein Modul ohne (lesbaren) Rohstand steht trotzdem im Plan: `components: []`, `error` gesetzt,
  `title`, `version`, `url`, `isis_url`, `checked_at` und `success_at` sind `null`,
  `valid_versions: []`, `notes: {}`. Die Seite zeigt dann `short`
- `ausgelassen` an einem Bestandteil geht unverändert durch (§4)
- In `index.json` stehen die Pläne nach Studiengang-`id`, dann `anker` des Semesters, dann
  Fachsemester. Pläne, die aus dem Katalog verschwinden, entfernt der nächste Bau. Gelöscht wird nur,
  was das alte `index.json` nannte

## 6. Die Auswahl — nur im Browser

- **Speicher:** `localStorage["stundenplanner:v1:<studiengang>:<semester>:fs<n>"]` =
  `{ "<component_id>": { "group": "<group_id>", "digest": "<digest bei der Wahl>", "name": "<Gruppenname>" } }`.
  Jeder Zugriff in `try/catch`, denn ohne Speicher (privates Fenster) funktioniert die Seite
  trotzdem, sie vergisst nur beim Neuladen
- **So, dass es ohne Einwilligungsbanner geht** (Silas' Recherche, 05.10.2026, nach der
  Orientierungshilfe der Datenschutzkonferenz zu Web Storage): Geschrieben wird erst, wenn jemand
  aktiv die erste Gruppe wählt; Laden schreibt nichts. Gespeichert werden nur Kennungen und was die
  Funktion braucht: kein Zeitstempel, keine Nutzer-ID. Sichtbar steht „Deine Auswahl wird nur in
  diesem Browser gespeichert.“, und „Auswahl zurücksetzen“ löscht den Schlüssel nach Rückfrage
- **Eine Gruppe je Bestandteil.** Eine neue Wahl ersetzt die alte
- **Geändert seit deiner Wahl:** gewählt, aber `digest` der Auswahl ≠ `digest` der Gruppe.
  „Änderung geprüft“ übernimmt den neuen Digest
- **Nicht mehr im Angebot:** eine gespeicherte Gruppe, die es im Lesemodell nicht mehr gibt.
  Sie bleibt sichtbar (Name aus der Auswahl), bis man sie löst
- **Teilen-Link:** trägt die Auswahl im Fragment hinter `#`, das nie an den Server geht:
  `#studiengang=<id>&semester=<id>&fs=<n>&w=<component_id>~<group_id>,…`. Wer ihn öffnet, sieht den
  Plan als Vorschau neben der eigenen Auswahl und übernimmt ihn erst auf Knopfdruck. Eine vorhandene
  Auswahl wird nie ohne Rückfrage überschrieben (`web/README.md`)

## 7. Befehle

| Befehl | Was |
|---|---|
| `python3 abruf/abruf.py [--semester wise-2026-27] [--nur <modulnummer>] [--roh <ordner>]` | Rohstände nach `daten/roh/` oder `--roh` (Vorbestand dort wird nur je erfolgreichem Modul ersetzt). Läuft aus jedem Arbeitsverzeichnis: Der Katalog hängt an der Lage von `abruf.py`, ein relatives `--roh` am Arbeitsverzeichnis. Exit 0 nur, wenn jedes Semester `ok` ist; 1 bei `partial`/`error`; 2 bei falschem Aufruf oder ungültigem Katalog |
| `python3 abruf/bauen.py [--katalog <ordner>] [--roh <ordner>] [--aus <ordner>]` | Lesemodell nach `web/daten/` aus `katalog/` und `daten/roh/`. Die Vorgaben hängen an der Repo-Wurzel, nicht am Arbeitsverzeichnis. Ein widersprüchlicher Katalog endet mit 2 und schreibt nichts |
| `python3 -m http.server -d web 8000` | die Seite lokal ansehen |
| `sh ops/test.sh` | alle Tests: Regeln des öffentlichen Repos, `abruf/tests/test_*.py` (unittest), `web/tests/*.test.mjs` (`node --test`) |

`daten/` und `web/daten/` sind erzeugt und stehen in `.gitignore`. Erzeugt werden sie täglich im
Container auf dem NAS (`docs/BETRIEB.md`). Tests nehmen ihre Daten aus `abruf/tests/fixtures/` bzw. `web/tests/fixtures/`.

## 8. Laufzeit

Python ≥ 3.11 mit `beautifulsoup4` (`abruf/requirements.txt`). Node ≥ 20 für die Tests der Seite und
im Container für `wrangler`. Die Seite selbst braucht nichts außer einem Browser: kein Framework, keine Schrift von einem
fremden Server, nichts von einem CDN. Sie muss schnell sein und auch auf alten Handys laufen.
