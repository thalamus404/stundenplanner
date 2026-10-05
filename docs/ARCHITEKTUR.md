# Architektur — wie der Stundenplanner gebaut ist

> **⛔ Keine Zugriffe auf Systeme der TU Berlin ohne Silas’ ausdrückliche Genehmigung**
> (Silas, 05.10.2026; [AGENTS.md §2 ⑦](../AGENTS.md#2-die-regeln)). Das gilt für jeden Weg: Abruf-Code, Skript, `curl`,
> Browser-Automatisierung, `WebFetch` eines Agenten, auch für eine einzelne Seite „nur zum Nachsehen“.
> Genehmigt ist allein der tägliche Lauf um 05:20 im Container `stundenplanner-abruf`. Wer mehr braucht,
> fragt Silas **vorher** und nennt **Umfang**, **Maßnahmen gegen Last** und **Grund**. Dasselbe gilt für
> die Vorlesungsverzeichnisse anderer Hochschulen. Der Code sperrt selbst (`abruf/zugang.py`).

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

Fünf Stufen, in der Reihenfolge, in der man auf der Seite wählt (Silas, 05.10.2026): **Hochschule →
Studiengang → Vertiefung → Fachsemester (in einem Semester) → Studien- und Prüfungsordnung**. Am Ende
steht genau ein Plan. Gelesen und geprüft wird der Katalog an einer Stelle, `abruf/katalog.py`, für
Abruf und Lesemodell gemeinsam. Ein Widerspruch ist ein Katalogfehler (Exit 2, nichts geschrieben).
Kennungen (`id`) sind Datei- und Speichernamen: nur `a–z`, `0–9`, `-`, gleich dem Dateinamen, und sie
ändern sich nicht.

`katalog/hochschulen/<hochschule-id>.json`

```json
{ "id": "tu-berlin", "kurz": "TU Berlin", "name": "Technische Universität Berlin", "farbe": "#c50e1f",
  "quelle": { "name": "MOSES", "url": "https://moseskonto.tu-berlin.de", "text": "…" },
  "sichtbar": "live", "abruf": "erlaubt" }
```

- `quelle` nennt das System der Termine für die Anzeige (Punkt 8541d9f5: die Seite soll nicht „TU“
  und „MOSES“ fest nennen). Welcher Abruf es liest, sagt das Semester (unten)
- `farbe` (frei, V-0243): `#rrggbb`, die Farbe der Hochschule. Ihre Karte im Startbildschirm ist damit
  gefüllt, die Schrift darauf weiß (DESIGN §3.6); `katalog.py` lässt nur Farben zu, auf denen Weiß
  mindestens 4,5:1 hat. Nur die Farbe, nie ein Logo. `bauen.py` gibt sie an die Option der Hochschule
- `"abruf": "gesperrt"` mit `abruf_grund` (Pflicht): Pläne dieser Hochschule holt `abruf.py` **nie**,
  auch nicht mit `--mit-vorschau`; ein ausdrücklich genanntes Semester endet mit Exit 2. Heute die HU
  Berlin (robots.txt von AGNES, Punkt 7411bed1)

`katalog/semester/<semester-id>.json`

```json
{ "id": "wise-2026-27", "label": "WiSe 2026/27", "hochschule": "tu-berlin",
  "moses": "WiSe 2026/27", "anker": "2026-10-12", "anker_quelle": "…" }
```

- `anker` ist der Montag der ersten Vorlesungswoche: Die A/B-Wochen zählen echte Kalenderwochen ab ihm
- `hochschule` (empfohlen): Ein Semester gehört zu einer Hochschule, denn Anker, Quelle und
  Modulnummern hängen daran (V-0229). Ein Plan einer anderen Hochschule darf nicht darauf zeigen
- Die **Quelle der Termine**: ohne `quelle` MOSES, `moses` ist die Beschriftung der Semesterwahl.
  Mit `"quelle": { "art": "lsf", "name", "basis", "semester", "label" }` liest `abruf/lsf.py` ein
  HIS-LSF-System (Felder: `abruf/README.md`)
- **Ersatzsemester**: `ersatz_fuer` (Text) und `ersatz_anker` (Pflicht dazu): Die Termine dieses
  Semesters stehen für ein kommendes, das die Quelle noch nicht freigibt (V-0227: SoSe 2026 für SoSe
  2027). Die Gültigkeit einer Ordnung wird an `ersatz_anker` gemessen

`katalog/studiengaenge/<studiengang-id>.json`

```json
{ "id": "wiing-bsc", "name": "Wirtschaftsingenieurwesen", "abschluss": "B.Sc.", "hochschule": "tu-berlin",
  "sichtbar": "vorschau", "vertiefung_heisst": "Studienrichtung",
  "ordnungen": [ { "id": "stupo-2015", "label": "StuPO 2015", "name": "…", "fundstelle": "AMBl. TU 37/2015 …",
                   "url": "…", "gilt_ab": "2016-04-01", "gilt_bis": "2031-03-31",
                   "studienbeginn": { "ab": null, "bis": "WiSe 2026/27" },
                   "fuer_wen": "Studienbeginn bis einschließlich WiSe 2026/27 …", "quelle": "§ 2 …" } ],
  "vertiefungen": [ { "id": "bi", "name": "Bauingenieurwesen", "kurz": "BI" } ],
  "plaene": [
    { "ordnung": "stupo-2015", "semester": "wise-2026-27", "fachsemester": 1, "waehlbar": false,
      "quelle": "…", "module": [ { "nummer": "20122", "kurz": "Analysis I/LinA" } ] },
    { "ordnung": "stupo-2015", "vertiefung": "bi", "semester": "wise-2026-27", "fachsemester": 1,
      "quelle": "…", "module": [ { "nummer": "50583", "kurz": "Statik" } ] } ] }
```

- **Ordnungen** (Studien- und Prüfungsordnungen): Welche gilt, hängt am Studienbeginn, nicht am Datum
  der neuesten (Erkenntnis 2 aus V-0228). `gilt_ab`/`gilt_bis` (Inkrafttreten, Außerkrafttreten,
  einschließlich) begrenzen die Semester: Liegt der Anker eines Plans außerhalb, ist das ein
  Katalogfehler. `studienbeginn` und `fuer_wen` sind Text für die Wahl auf der Seite: Ob jemand
  gewechselt hat, weiß nur er selbst (V-0227). Jede Angabe aus § 2 der Ordnung, mit `quelle`
- Hat ein Studiengang `ordnungen`, nennt jeder Plan eine; hat er keine, nennt keiner eine
- **Vertiefungen** (optional; `vertiefung_heisst` ist ihre Bezeichnung, z. B. „Studienrichtung“,
  `ohne_vertiefung` die Beschriftung der Option ohne, Vorgabe „Ohne <Bezeichnung>“). Ein Plan mit
  `vertiefung` **erbt** die Module des Grundplans derselben Ordnung, desselben Semesters und
  Fachsemesters (des Plans ohne `vertiefung`) und ergänzt nur seine eigenen; ein Modul in beiden ist
  ein Fehler. `"waehlbar": false` macht den Grundplan zur reinen Grundlage (WiIng: Die Studienrichtung
  hat schon im 1. FS ein Modul). Ein solcher Grundplan ohne Erben ist ein Fehler
- Ein Plan ist eindeutig durch (Ordnung, Vertiefung oder keine, Semester, Fachsemester)
- **`wahlpflicht`** (optional, V-0227): Bereiche einer Modulliste, nicht Module:
  `{ "id", "kurz", "name", "modulliste": "<datei in katalog/modullisten/>", "bereich": "Wahlpflichtbereich/…", "anteil" }`.
  Die Modulliste erzeugt `abruf/modulliste.py` aus dem MTS von MOSES; die Kandidaten sind genau die
  Module, die MOSES dem Bereich zuordnet. `frei` (optional): Hinweise ohne Module (Wahlbereich,
  Bachelorarbeit). Eine Vertiefung erbt nur die Pflichtmodule
- LSF-Pläne tragen dazu `vvz_pfad`, `bereich` und je Modul `vvz` (`abruf/README.md`)

`katalog/bestandteile.json` — **wie die Gruppen eines Bestandteils zu belegen sind**, wo es nicht
„wähle eine“ heißt (Punkt 633ed71d, V-0227 E5: MOSES-Gruppen sind Planungsgruppen):

```json
{ "bestandteile": [
  { "id": "70202:1501", "gruppen": "alle", "semester": null, "grund": "Vorlesung in zwei Teilen: …", "quelle": "…" },
  { "id": "41285:14230", "gruppen": "unklar", "semester": null, "grund": "Wahltermine in einer Gruppe …", "quelle": "…" },
  { "id": "20122:11814", "gruppen": "keine", "semester": null, "grund": "Lerninsel: offenes Angebot …", "quelle": "…" } ] }
```

- `id` ist die Kennung des Bestandteils im Rohstand (`<modulnummer>:<veranstaltungsvorlage>`), gilt
  in allen Plänen; `semester` (Liste) schränkt auf Semester ein, `null` heißt jedes
- `gruppen`: `eine` (Vorgabe, ohne Eintrag), `alle` (die Gruppen sind Teile, man besucht alle),
  `keine` (offenes Angebot, keine Wahl), `unklar` (weder noch, oder die Quelle sagt es nicht).
  `grund` ist Pflicht, `quelle` sagt, woher. Ob die Seite `alle` als Pflicht zu allen Gruppen oder
  als Mehrfachwahl zeigt, entscheidet Silas; die Daten bleiben dieselben
- **Erstes Format** (ohne `ordnungen` und `vertiefungen`, `hochschule` als Kurzname wie „TU Berlin“)
  gilt weiter und ergibt dieselben Dateinamen wie vorher

`katalog/formate.json` — **die Lehrveranstaltungsformate in drei Kategorien** (V-0238; Silas,
05.10.2026: die Seite unterscheidet sie an der Sättigung, Vorlesung 100 %, Übung 70 %, der Rest 50 %).
Recherche, Tabellen je Hochschule und Gründe: [`docs/forschung/formate.md`](forschung/formate.md).

```json
{ "stand": "2026-10-05", "bericht": "docs/forschung/formate.md",
  "kategorien": { "vorlesung": "…", "uebung": "…", "sonstige": "…" },
  "formate": {
    "IV": { "lang": "Integrierte Veranstaltung", "kategorie": "vorlesung", "hochschulen": ["tu"],
            "namen": ["Integrierte Veranstaltung"], "quelle": "TU: MOSES-Art „IV“, CSV …", "grund": "Silas: IV 100 %. …" },
    "SE": { "lang": "Seminar", "kategorie": "sonstige", "hochschulen": ["tu", "hu", "fu"],
            "namen": ["SEM", "Seminar", "Praxisseminar"], "quelle": "…", "grund": "…" },
    "KU": { "lang": "Kurs", "…": "…", "vermutung": "MOSES liefert zu „KU“ keinen Langnamen …" } } }
```

- Der Schlüssel ist das **Kürzel**, das die Seite zeigt (ein Wort, höchstens 20 Zeichen, auch
  `P-PR`, `VL/UE`). Wo zwei Hochschulen verschieden kürzen, gilt eines; die anderen Schreibweisen
  stehen in `namen` (MOSES „SEM“, AGNES „SE“ → `SE`). `kuerzel_eigen: true`, wo keine gelesene
  Quelle ein Kürzel kennt (`PJ`, `SU`, `BP`)
- `kategorie`: `vorlesung` (Präsenz im Stil einer Vorlesung), `uebung` (gemeinsam Aufgaben unter
  Anleitung lösen), `sonstige` (alles andere). Die drei Namen sind der Vertrag mit der Seite
  (`katalog.KATEGORIEN`); `kategorien` in der Datei beschreibt sie und muss genau sie nennen
- `lang`, `quelle` und `grund` sind Pflicht, `hochschulen` (Kennungen, heute `tu`, `hu`, `fu`) nennt,
  wo das Format belegt ist. `vermutung` sagt, was keine Quelle belegt (ein Langname, ein Kürzel)
- **Ein Name gehört zu genau einem Format** (Kürzel, `lang` und `namen`, ohne Groß- und
  Kleinschreibung, Leerzeichen zusammengefasst). Sonst Katalogfehler
- Fehlt die Datei, ist jedes Format unbekannt (Kategorie `sonstige`); so laufen alte Kataloge weiter

**Sichtbarkeit: Live und Vorschau aus demselben Katalog** (Silas, 05.10.2026: alle Studiengänge der
Forschung unter dem Dev-Link, live nur WI 1. FS). `"sichtbar": "vorschau"` an Hochschule, Studiengang
oder Plan, der nähere gewinnt; ohne Angabe `live`. Ohne Schalter bauen und holen `bauen.py` und
`abruf.py` nur Live-Pläne; **`--mit-vorschau`** nimmt die Vorschau dazu. Der tägliche Lauf
(`betrieb/lauf.py`) ruft ohne den Schalter auf. Den Dev-Link baut der Leit-Agent mit
`python3 abruf/bauen.py --mit-vorschau --roh <rohstände der vorschau>`.

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

**Schema 2 (V-0233).** `index.json` trägt die fünf Stufen der Wahl als Baum, aus dem die Seite ihren
Startbildschirm baut, ohne selbst Regeln zu kennen, und daneben die flache Liste `plaene` der ersten
Seite (Schlüssel wie in Schema 1), bis die Seite umgestellt ist.

`web/daten/index.json`

```json
{ "schema": 2, "erzeugt_am": "…",
  "stufen": [ { "id": "hochschule", "label": "Hochschule" }, { "id": "studiengang", "label": "Studiengang" },
              { "id": "vertiefung", "label": "Vertiefung" }, { "id": "fachsemester", "label": "Fachsemester" },
              { "id": "ordnung", "label": "Studien- und Prüfungsordnung" } ],
  "wahl": { "stufe": "hochschule", "regel": "waehlen", "optionen": [
    { "id": "tu-berlin", "label": "TU Berlin", "zusatz": "Technische Universität Berlin", "weiter": {
      "stufe": "studiengang", "regel": "waehlen", "optionen": [
      { "id": "wi-bsc", "label": "Wirtschaftsinformatik", "zusatz": "B.Sc.", "weiter": {
        "stufe": "vertiefung", "regel": "ueberspringen", "label": "Vertiefung", "optionen": [
        { "id": null, "label": "Ohne Vertiefung", "zusatz": null, "weiter": {
          "stufe": "fachsemester", "regel": "waehlen", "optionen": [
          { "id": "wise-2026-27:fs1", "label": "1. Fachsemester", "zusatz": "WiSe 2026/27",
            "semester": "wise-2026-27", "fachsemester": 1, "weiter": {
            "stufe": "ordnung", "regel": "automatisch", "optionen": [
            { "id": "stupo-2025", "label": "StuPO 2025", "zusatz": "Studienbeginn ab WiSe 2026/27. …",
              "plan": { "id": "wi-bsc:stupo-2025:wise-2026-27:fs1",
                        "datei": "wi-bsc/stupo-2025/wise-2026-27-fs1.json",
                        "kombinationen": { "loesbar": true, "beispiel": { "…": "…" } } } } ] } } ] } } ] } } ] } } ] },
  "plaene": [ { "studiengang": "wi-bsc", "name": "Wirtschaftsinformatik", "abschluss": "B.Sc.",
                "semester": "wise-2026-27", "label": "WiSe 2026/27", "fachsemester": 1,
                "datei": "wi-bsc/stupo-2025/wise-2026-27-fs1.json" } ],
  "module": [ "module/wise-2026-27/40530.json" ] }
```

- **Ein Knoten** ist `{ stufe, regel, optionen }`, am Knoten der Vertiefung dazu `label` (die
  Bezeichnung des Studiengangs, z. B. „Studienrichtung“). **Eine Option** ist `{ id, label, zusatz }`
  und `weiter` (der nächste Knoten) oder, auf der letzten Stufe, `plan`. Beim Fachsemester stehen
  `semester` und `fachsemester` dabei, bei der Hochschule `farbe`, wenn der Katalog eine nennt
  (`planwahl.mjs` lässt nur `#rrggbb` durch). Jeder Pfad endet in genau einem Plan
- **`regel`** sagt der Seite, was sie tut (Silas, 05.10.2026):
  - `ueberspringen`: Vertiefung oder Ordnung, deren einzige Option „keine“ ist (`id: null`): ein
    Studiengang ohne Vertiefung, ein Katalog ohne Ordnung. Die Stufe erscheint nicht
  - `automatisch`: Vertiefung oder Ordnung mit genau einer Option. Sie gilt als gewählt und wird
    angezeigt („gilt für ein Semester nur eine StuPO, wird sie automatisch gewählt“)
  - `waehlen`: sonst, und für Hochschule, Studiengang und Fachsemester immer, auch mit einer Option
- Reihenfolge: Hochschulen und Studiengänge nach Namen, Vertiefungen („keine“ zuerst), Ordnungen
  in der Reihenfolge des Katalogs, Fachsemester nach Semesterbeginn, dann Fachsemester
- `plan.id` ist die Kennung des Plans, eindeutig über alle Stufen und stabil:
  `<studiengang>[:<ordnung>]:<semester>:fs<n>[:<vertiefung>]`. `datei` ebenso eindeutig:
  `<studiengang>/[<ordnung>/][<vertiefung>/]<semester>-fs<n>.json`. Die heutige Seite speichert
  die Auswahl unter `<studiengang>:<semester>:fs<n>` (§6); wer auf `plan.id` umstellt, übernimmt
  die alten Schlüssel
- **`plaene`** (alt): nur noch für die heutige Seite. Vertiefung und, bei mehreren Ordnungen, die
  Ordnung stehen in `name` („Wirtschaftsingenieurwesen (Bauingenieurwesen)“), damit die alte
  Planwahl sie unterscheiden kann. Sortiert nach Studiengang-`id`, Semesterbeginn, Fachsemester,
  Ordnung und Vertiefung
- `module` nur, wenn es Moduldateien der Wahlpflicht gibt (unten)
- Vorschau-Pläne (§3) stehen nur mit `--mit-vorschau` im Index, im Baum wie in `plaene`. Pläne, die
  verschwinden, entfernt der nächste Bau samt leer gewordener Ordner; gelöscht wird nur, was das
  alte `index.json` nannte (in `plaene`, in den Blättern von `wahl` oder in `module`)

`web/daten/<plan.datei>`: die Felder, die die Seite des Study OS schon las (`load()` in
`app/stundenplan.py`), mit denselben Namen, dazu die übrigen Stufen und `kombinationen`:

```json
{ "schema": 2, "erzeugt_am": "…",
  "studiengang": { "id": "wi-bsc", "name": "…", "abschluss": "…" },
  "semester": "wise-2026-27", "label": "WiSe 2026/27", "anchor": "2026-10-12", "fachsemester": 1,
  "modules": [ { "number": "…", "short": "Einf. WI", "title": "…", "version": 11, "valid_from": "…",
      "valid_to": "…", "valid_versions": [11], "url": "…", "isis_url": "…", "notes": {},
      "checked_at": "…", "success_at": "…", "error": null,
      "components": [ { "…": "wie im Rohstand", "type": "IV",
          "format": { "kuerzel": "IV", "lang": "Integrierte Veranstaltung", "kategorie": "vorlesung" },
          "groups": [ { "…": "wie im Rohstand",
              "key": "70123:12345:678", "digest": "<sha256>", "slots": [ "… siehe unten" ] } ] } ] } ],
  "has_fortnightly": false, "group_count": 65, "booking_count": 949,
  "last_run": { "finished_at": "…", "status": "ok|partial|error", "modules": 5, "bookings": 949, "errors": [] },
  "id": "wi-bsc:stupo-2025:wise-2026-27:fs1",
  "hochschule": { "id": "tu-berlin", "kurz": "TU Berlin", "name": "…", "quelle": { "name": "MOSES", "…": "…" } },
  "vertiefung": null,
  "ordnung": { "id": "stupo-2025", "label": "StuPO 2025", "name": "…", "fundstelle": "…", "url": "…",
               "gilt_ab": "2026-10-01", "gilt_bis": null, "studienbeginn": { "ab": "WiSe 2026/27", "bis": null },
               "fuer_wen": "…" },
  "kombinationen": { "loesbar": true, "beispiel": { "70123:287": "365276", "…": "…" } } }
```

- `key` = `component_id + ":" + group_id`
- `digest` = `fingerprint(group)` aus `app/stundenplan.py`: sha256 über die nach `id` sortierte
  Liste `{id, start, end, room}` der Buchungen, `json.dumps(…, sort_keys=True)`
- `slots` = `slots(group, anchor)` aus `app/stundenplan.py`, unverändert: `day`, `start`, `end`,
  `dates`, `rooms`, `occurrences`, `fortnightly`, `parity`, `rhythm`
- `vertiefung` = `{ id, name, kurz, heisst }` oder `null`; `ordnung` mit genau den Feldern oben oder
  `null` (Katalog im ersten Format)
- Ein Bestandteil mit Eintrag in `katalog/bestandteile.json` trägt dazu `gruppen` (`alle`, `keine`,
  `unklar`, `eine`) und `gruppen_grund`; ohne Eintrag fehlen beide, und es gilt `eine`
- **Jeder Bestandteil trägt `format`** (V-0238): `{ "kuerzel": "IV", "lang": "Integrierte Veranstaltung",
  "kategorie": "vorlesung" }` aus `katalog/formate.json` (§3). Gesucht wird erst mit `type` (MOSES:
  Spalte „Art“), dann mit dem `format` der Buchungen (MOSES-CSV „Veranstaltungsformat“), wenn alle
  dasselbe bekannte Format nennen. Kennt der Katalog es nicht: `kuerzel` und `lang`, wie die Quelle
  sie schreibt, `kategorie: "sonstige"` und `"unbekannt": true`; `bauen.py` nennt es dann in seiner
  Ausgabe („Format unbekannt“). `kategorie` ist eine von `vorlesung`, `uebung`, `sonstige`, und die
  Seite macht daraus die Sättigung. `type` bleibt daneben, wie die Quelle es schreibt (MOSES „SEM“,
  `format.kuerzel` „SE“). Nicht verwechseln: Eine **Buchung** hat ihr eigenes `format`, einen Text
  aus der Quelle (§4)
- **`kombinationen`** = `plan.kombination` über alle Bestandteile der Pflichtmodule: Gibt es je
  Bestandteil eine Gruppe, sodass sich keine zwei gewählten an irgendeinem Einzeltermin
  überschneiden (`conflicts`, direkt anschließend ist keine)? Bestandteile ohne Gruppe zählen nicht
  (Punkt db561642), Bestandteile mit genau einer Gruppe sind fest; `gruppen: alle` zählt als eine
  feste Gruppe aus allen Terminen, `keine` und `unklar` zählen nicht.
  - `{ "loesbar": true, "sicher": true, "beispiel": { "<component_id>": "<group_id>" | ["<group_id>", …], … } }`
    (die Liste bei `gruppen: alle`)
  - `{ "loesbar": false, "sicher": true, "grund": "Jede Gruppe von … überschneidet sich mit einer Veranstaltung, die es nur einmal gibt: …" }`.
    Der Grund nennt Zeiten und, wenn es mehrere sind, an wie vielen Tagen. Die Seite sagt das
    ausdrücklich (Silas, 05.10.2026; Anlass Informatik 1. FS)
  - `{ "loesbar": null, "sicher": false, "grund": "…" }`: noch keine Termingruppe, ein Plan nur aus
    Wahlpflicht, oder die Suche stieß an ihre Grenze (200 000 Schritte, gezählt statt gestoppt:
    gleiche Eingabe, gleiche Bytes)
  - **`sicher`**: Ein „unlösbar“ ist sicher, wenn keiner der beteiligten Bestandteile verdächtig ist;
    ein „lösbar“, wenn keiner im Plan verdächtig oder `unklar` ist. Sonst steht `verdacht:
    [{ component, grund }]` dabei (Gruppen zeitlich nacheinander, Namen nennen verschiedene Teile,
    Lehrformen oder Rhythmen, eine Gruppe mit Terminen an drei und mehr Tagen weit über ihren SWS;
    `plan.verdacht`), und die Seite sagt „vermutlich“. Was `katalog/bestandteile.json` regelt, ist
    kein Verdacht mehr (Punkt 633ed71d)
  - `ausgenommen: [{ component, gruppen, grund }]` nennt, was nicht zählte (`keine`, `unklar`)
  - `fehlen: [<modulnummer>, …]`, wenn Modulen der Rohstand fehlt: Die Aussage gilt dann nur für
    die übrigen
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
- **Nur wenn der Katalog sie nennt** (V-0227): `ersatz_fuer` (Ersatzsemester, §3), `frei`
  (`[{ name, anteil, hinweis }]`) und `wahlpflicht`:
  `[{ id, kurz, name, bereich, anteil, lp_min, lp_max, regeln, modulliste: { ordnung, liste, quelle, abgerufen_am },
  angebot: [{ number, title, short, lp, turnus, unterbereich, datei, components, groups, bookings, tage }],
  ohne_termine: [{ number, title, lp, turnus, unterbereich, grund }] }]`. Die Kandidaten stehen
  **nicht** in `modules`; ihre Termine liegen je Modul in `web/daten/module/<semester>/<nummer>.json`
  (`{ schema, erzeugt_am, semester, label, anchor, module }`, `module` wie ein Eintrag von `modules`)
  und werden erst geladen, wenn jemand das Modul wählt

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
- **Neben der Auswahl** (V-0234, V-0251): `stundenplanner:v1:plan` = die Kennung des zuletzt im
  Startbildschirm gewählten Plans (geschrieben bei der letzten Wahl dort) und `stundenplanner:v1:tipp`
  = `pfeile`, wenn jemand den Pfeiltasten-Tipp mit dem X geschlossen hat (geschrieben nur bei diesem
  Klick). Beides ohne Zeitstempel, beides steht in der Datenschutzerklärung
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
| `python3 abruf/abruf.py [--semester wise-2026-27] [--nur <modulnummer>] [--roh <ordner>]` | **Gesperrt ohne Silas' Genehmigung** (AGENTS.md §2 ⑦, `abruf/zugang.py`): ohne sie Exit 2, bevor eine Anfrage rausgeht. Mit ihr: Rohstände nach `daten/roh/` oder `--roh` (Vorbestand dort wird nur je erfolgreichem Modul ersetzt). Läuft aus jedem Arbeitsverzeichnis: Der Katalog hängt an der Lage von `abruf.py`, ein relatives `--roh` am Arbeitsverzeichnis. Exit 0 nur, wenn jedes Semester `ok` ist; 1 bei `partial`/`error`; 2 bei falschem Aufruf oder ungültigem Katalog |
| `python3 abruf/bauen.py [--katalog <ordner>] [--roh <ordner>] [--aus <ordner>]` | Lesemodell nach `web/daten/` aus `katalog/` und `daten/roh/`. Die Vorgaben hängen an der Repo-Wurzel, nicht am Arbeitsverzeichnis. Ein widersprüchlicher Katalog endet mit 2 und schreibt nichts |
| `python3 -m http.server -d web 8000` | die Seite lokal ansehen |
| `sh ops/test.sh` | alle Tests: Regeln des öffentlichen Repos, `abruf/tests/test_*.py` (unittest), `web/tests/*.test.mjs` (`node --test`) |

`daten/` und `web/daten/` sind erzeugt und stehen in `.gitignore`. Erzeugt werden sie täglich im
Container auf dem NAS (`docs/BETRIEB.md`). Tests nehmen ihre Daten aus `abruf/tests/fixtures/` bzw. `web/tests/fixtures/`.

## 8. Laufzeit

Python ≥ 3.11 mit `beautifulsoup4` (`abruf/requirements.txt`). Node ≥ 20 für die Tests der Seite und
im Container für `wrangler`. Die Seite selbst braucht nichts außer einem Browser: kein Framework, keine Schrift von einem
fremden Server, nichts von einem CDN. Sie muss schnell sein und auch auf alten Handys laufen.
