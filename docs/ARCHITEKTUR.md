# Architektur — wie der Stundenplanner gebaut ist

> Der Vertrag zwischen den Teilen. Wer ein Format, einen Ordner oder einen Befehl ändert, ändert
> ihn hier zuerst. Was das Werkzeug können soll, steht im [Scope](SCOPE.md), hier steht nur, wie.

## 1. Fünf Teile, eine Richtung

```
katalog/ ──► abruf/abruf.py ──► daten/roh/ ──► abruf/bauen.py ──► web/daten/ ──► web/ (Browser)
 (von Hand)    (MOSES, öffentlich)  (Rohstand)    (Lesemodell)      (JSON)        (Auswahl lokal)
```

| Teil | Ordner | Was | Bauteil |
|---|---|---|---|
| **Katalog** | `katalog/` | Semester, Studiengänge und welche Module in welchem Fachsemester dran sind. Von Hand, versioniert | `stundenplanner-abruf` |
| **Abruf** | `abruf/abruf.py`, `abruf/moses.py` | holt je Modul die öffentlichen MOSES-Seiten und den CSV-Export der Einzelbuchungen und schreibt einen **Rohstand** je Modul | `stundenplanner-abruf` |
| **Lesemodell** | `abruf/plan.py`, `abruf/bauen.py` | rechnet aus Rohständen und Katalog die Daten, die die Seite liest: Termin-Slots, 14-Tage-Rhythmus, Fingerabdruck je Gruppe, Zählungen | `stundenplanner-abruf` |
| **Seite** | `web/` | statisches HTML, CSS und JS, **ohne Build-Schritt**. Liest `web/daten/`, hält die Auswahl im Browser und rechnet die Konflikte der Auswahl | `stundenplanner-oberflaeche` |
| **Betrieb** | `.github/workflows/` | auf GitHub: Test bei jedem Push, täglich Abruf → Bauen → GitHub Pages | `stundenplanner-betrieb` |

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
Ohne Vorbestand entsteht ein Rohstand ohne `components` mit `fehler`.

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
  "has_fortnightly": false, "group_count": 64, "booking_count": 949,
  "last_run": { "finished_at": "…", "status": "ok|partial|error", "modules": 5, "bookings": 949, "errors": [] } }
```

- `key` = `component_id + ":" + group_id`
- `digest` = `fingerprint(group)` aus `app/stundenplan.py`: sha256 über die nach `id` sortierte
  Liste `{id, start, end, room}` der Buchungen, `json.dumps(…, sort_keys=True)`
- `slots` = `slots(group, anchor)` aus `app/stundenplan.py`, unverändert: `day`, `start`, `end`,
  `dates`, `rooms`, `occurrences`, `fortnightly`, `parity`, `rhythm`
- **Nicht** im Lesemodell steht, was vom Betrachter abhängt: `selected`, `changed`, `revision`,
  `selection`, `missing`, `selected_count`, `conflicts` und `stale`. Das rechnet die Seite: `stale`
  aus `success_at` (älter als 36 Stunden), den Rest aus der lokalen Auswahl

## 6. Die Auswahl — nur im Browser

- **Speicher:** `localStorage["stundenplanner:v1:<studiengang>:<semester>:fs<n>"]` =
  `{ "<component_id>": { "group": "<group_id>", "digest": "<digest bei der Wahl>", "name": "<Gruppenname>", "at": "<ISO>" } }`.
  Jeder Zugriff in `try/catch`, denn ohne Speicher (privates Fenster) funktioniert die Seite
  trotzdem, sie vergisst nur beim Neuladen
- **Eine Gruppe je Bestandteil.** Eine neue Wahl ersetzt die alte
- **Geändert seit deiner Wahl:** gewählt, aber `digest` der Auswahl ≠ `digest` der Gruppe.
  „Änderung geprüft“ übernimmt den neuen Digest
- **Nicht mehr im Angebot:** eine gespeicherte Gruppe, die es im Lesemodell nicht mehr gibt.
  Sie bleibt sichtbar (Name aus der Auswahl), bis man sie löst
- **Teilen-Link:** trägt Studiengang, Semester, Fachsemester und die Auswahl (Paare
  Bestandteil → Gruppe) in der Adresse. Wer ihn öffnet, sieht den Plan und kann ihn übernehmen.
  Eine vorhandene Auswahl wird nie ohne Rückfrage überschrieben

## 7. Befehle

| Befehl | Was |
|---|---|
| `python3 abruf/abruf.py [--semester wise-2026-27] [--nur <modulnummer>]` | Rohstände nach `daten/roh/` (Vorbestand dort wird nur je erfolgreichem Modul ersetzt) |
| `python3 abruf/bauen.py` | Lesemodell nach `web/daten/` aus `katalog/` und `daten/roh/` |
| `python3 -m http.server -d web 8000` | die Seite lokal ansehen |
| `sh ops/test.sh` | alle Tests: Regeln des öffentlichen Repos, `abruf/tests/test_*.py` (unittest), `web/tests/*.test.mjs` (`node --test`) |

`daten/` und `web/daten/` sind erzeugt und stehen in `.gitignore`. Auf GitHub erzeugt sie der
tägliche Lauf neu. Tests nehmen ihre Daten aus `abruf/tests/fixtures/` bzw. `web/tests/fixtures/`.

## 8. Laufzeit

Python ≥ 3.11 mit `beautifulsoup4` (`abruf/requirements.txt`). Node ≥ 20 nur für die Tests der
Seite. Die Seite selbst braucht nichts außer einem Browser: kein Framework, keine Schrift von einem
fremden Server, nichts von einem CDN. Sie muss schnell sein und auch auf alten Handys laufen.
