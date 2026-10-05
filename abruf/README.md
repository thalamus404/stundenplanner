# Abruf und Lesemodell

Holt die öffentlichen Daten je Modul aus MOSES (`moses.py`) oder HIS LSF (`lsf.py`), gewählt in `abruf.py`, und rechnet daraus die Daten,
die die Seite liest (`plan.py`, `bauen.py`). Formate und Befehle: [`docs/ARCHITEKTUR.md`](../docs/ARCHITEKTUR.md)
§3–§7. Herkunft: Study OS (`stundenplan/moses.py`, `stundenplan/runner.py`, `app/stundenplan.py`), kopiert.

*Im Bau (Programm „Stundenplanner — erste Fassung“, Phase 2). Wer hier baut, schreibt in diese Datei,
wie man es benutzt und was beim Abruf schiefgehen kann.*

## Abruf

`abruf.py` und `moses.py` (V-0214). Was entsteht, steht in [`docs/ARCHITEKTUR.md`](../docs/ARCHITEKTUR.md)
§4: je Modul `daten/roh/<semester-id>/<modulnummer>.json` und je Semester `_lauf.json`.

```sh
pip install -r abruf/requirements.txt         # nur beautifulsoup4
python3 abruf/abruf.py                        # jedes Semester des Katalogs, das Pläne hat
python3 abruf/abruf.py --semester wise-2026-27 --nur 70450   # ein Modul nachholen
python3 abruf/abruf.py --roh /irgendwo/roh    # Rohstände anderswohin
```

- **Aus jedem Arbeitsverzeichnis.** Der Katalog hängt an der Lage von `abruf.py`, die Vorgabe für
  `--roh` an der Repo-Wurzel (`daten/roh`); ein ausdrücklich übergebenes `--roh` gilt relativ zum
  Arbeitsverzeichnis oder absolut.
- **Jedes Modul einmal je Semester**, auch wenn es in mehreren Plänen steht. Neue Studiengänge oder
  Fachsemester sind Katalogdateien, kein Code (ARCHITEKTUR §2).
- **Exit-Code** 0 nur, wenn jedes Semester `ok` ist; 1 bei `partial` oder `error`; 2, wenn der
  Aufruf oder der Katalog nicht stimmt (dann wird nichts geschrieben).
- Je Modul eine Zeile auf stderr (`✓ 70123 v11: 2 Bestandteile, 5 Gruppen, 63 Buchungen`), am Ende
  je Semester eine auf stdout.
- **Dauer:** je Modul 2 Seiten, je Bestandteil 5 Anfragen, mit 0,7 s Abstand. WI im 1. Fachsemester
  (5 Module, 11 Bestandteile) dauert gut eine Minute.

### Was schiefgehen kann

Ein Fehler kostet nie die Daten: Scheitert ein Bestandteil, bleibt der letzte erfolgreiche Rohstand
des Moduls stehen, nur `abruf.geprueft_am` und `abruf.fehler` ändern sich, und die Seite zeigt den
Datenstand. Der nächste Lauf versucht es von selbst wieder. Die Meldungen sind feste Sätze aus
`moses.py`; sie werden veröffentlicht und enthalten deshalb nie einen Antwortkörper oder eine
MOSES-Sitzung (`fehlertext()` in `abruf.py`).

| Meldung | Was dahintersteckt | Was tun |
|---|---|---|
| `Unbekanntes Modulbestandteile-Layout`, `Semesterwahl fehlt`, `VVZ-Formular fehlt`, `VVZ-Export fehlt`, `Exportspalten fehlen`, `CSV-Header unvollständig`, `CSV-Export fehlt` | MOSES hat sein **Layout** geändert. Der Parser rät nicht, er hört auf | `moses.py` an die neue Seite anpassen, mit einem Test in `tests/test_moses.py`, der das neue Layout belegt |
| `… ist im VVZ noch gesperrt`, `… fehlt in der Semesterwahl`, `keine gültige Version für …` | Das **Semester** ist in MOSES noch nicht freigegeben, oder es gibt keine im Semester gültige Modulversion | Warten. Es gibt absichtlich keinen Rückgriff auf ein anderes Semester oder eine abgelaufene Version |
| `VVZ zeigt trotz Auswahl ein anderes Semester`, `Falsches Semester im Export` | MOSES liefert Termine eines anderen Semesters, und zwar so, dass die enge Ausnahme (unten) nicht greift: eine Gruppe mischt Semester, oder der Export hat keine einzige Zeile des Zielsemesters | Den Export von Hand ansehen. Nie die Prüfung abschalten: Ein Sommerplan im Winter ist schlimmer als ein fehlendes Modul |
| `Export enthält unbekannte Gruppe/Buchung`, `Widersprüchliche doppelte Buchung`, `Ungültige ISO-Zeit`, `Terminende liegt vor dem Beginn` | Der Export passt nicht zur Seite, die ihn angeboten hat | Einen Tag abwarten; bleibt es, den Export von Hand ansehen |
| `HTTPError: HTTP Error 429/503 …`, `URLError …`, `TimeoutError` | MOSES ist nicht erreichbar oder bremst | Nichts. Nicht sofort wiederholen (Höflichkeit, unten) |
| `Unerwarteter MOSES-Host`, `Unerwartete Weiterleitung` | Eine Adresse oder Weiterleitung führt weg von MOSES | Nicht folgen. `moses.py` holt nur von MOSES selbst |

**Die eine Ausnahme der Semesterprüfung: ganze Gruppen eines fremden Semesters.** Jede Zeile des
Exports muss das Zielsemester tragen, bis auf diesen Fall: Eine Gruppe, die die Seite des
Zielsemesters listet, deren Buchungen aber **alle** ein anderes Semester tragen, wird ausgelassen
und im Bestandteil vermerkt, damit nichts still verschwindet:

```json
"ausgelassen": [ { "id": "367131", "name": "(Tutorium)", "semester": "SoSe 2026", "bookings": 1 } ]
```

Weiter ein Fehler bleiben eine Gruppe mit Buchungen beider Semester und ein Export ohne eine
einzige Zeile des Zielsemesters. Anlass: Seit dem 29.09.2026 listet MOSES im Tutorium von
Statistik I (70450) für das WiSe 2026/27 genau so eine Gruppe mit einer Buchung des SoSe 2026, und
die strenge Regel kippte das ganze Modul (19 Gruppen, 277 Termine). Freigegeben vom Leit-Agenten am
05.10.2026; die Regel steht als Docstring an `parse_export()` in `moses.py`, die Tests in
`tests/test_moses.py`.

### Höflichkeit

MOSES ist ein öffentlicher Dienst der TU Berlin, kein Angebot an uns. Deshalb:

- **Einmal am Tag** reicht. Die Termine ändern sich selten, und die Seite sagt, wie alt sie sind.
  Kein Lauf in einer Schleife und kein sofortiges Wiederholen nach einem Fehler
- Zwischen zwei Anfragen derselben Sitzung mindestens **0,7 s** (`Client(delay=0.7)`)
- Der **User-Agent** nennt das Projekt und seine Adresse (`moses.USER_AGENT`), damit MOSES einen
  auffälligen Abruf zuordnen kann, statt ihn zu sperren
- Je Modul eine frische Sitzung **ohne Login**. Die Exporteinstellungen gelten nur für sie;
  „Als Standard speichern“ wird nie aufgerufen
- Nur öffentliche Seiten, nur der Host von MOSES, auch nach Weiterleitungen
- Die Tests laufen **ohne Netz**: `tests/test_moses.py` auf einem echten, öffentlichen CSV-Export,
  `tests/test_abruf.py` mit einer Attrappe des Clients auf erfundenem HTML und einem erfundenen
  Katalog

## Die zweite Quelle: HIS LSF (`lsf.py`)

*V-0229, Forschungsstrang HU Berlin, 05.10.2026. Bericht mit Quellen und Problemstellen:
[`docs/forschung/hu-biologie.md`](../docs/forschung/hu-biologie.md).*

Welche Quelle ein Semester hat, sagt der Katalog, nicht der Code. Ohne `quelle` ist es MOSES (wie
bisher, Feld `moses`). Mit `"quelle": {"art": "lsf", …}` liest `lsf.py` ein HIS-LSF-System, an der HU
Berlin AGNES. Gewählt wird allein in `standard_quelle()` in `abruf.py`; beide schreiben denselben
Rohstand (docs/ARCHITEKTUR.md §4).

```json
katalog/semester/hu-wise-2026-27.json:
{ "id": "hu-wise-2026-27", "label": "WiSe 2026/27", "anker": "2026-10-12",
  "quelle": { "art": "lsf", "name": "AGNES", "basis": "https://agnes.hu-berlin.de/lupo/rds",
              "semester": "20262", "label": "WiSe 2026/27" } }

ein Plan in katalog/studiengaenge/hu-biologie-bsc.json:
{ "semester": "hu-wise-2026-27", "fachsemester": 1, "bereich": "Pflichtbereich",
  "vvz_pfad": ["Lebenswissenschaftliche Fakultät", "Institut für Biologie",
               "B.Sc. Biologie Monobachelor (SPO 2025)", "Pflichtbereich", "Wintersemester"],
  "module": [ { "nummer": "BioB-1", "vvz": "BioB 1", "kurz": "Zellbio" } ] }
```

- **Ein Semester je Hochschule.** `hu-wise-2026-27` ist ein eigenes Semester, auch wenn es wie
  `wise-2026-27` heißt: eigene Quelle, eigener Anker, eigener Ordner `daten/roh/hu-wise-2026-27/`
  und eigene Modulnummern. Ein Modul wird je Semester einmal geholt; zwei Hochschulen in einem
  Semester würden ihre Nummern vermischen.
- `quelle.semester` ist der LSF-Schlüssel des Semesters (`20262` = WiSe 2026/27, im Parameter
  `root120262` des Baums), `quelle.label` steht so auf jeder Detailseite und wird geprüft.
- `nummer` ist bei LSF nur ein Schlüssel (`[A-Za-z0-9-]`, ohne Leerzeichen: Dateiname, Kennung im
  Teilen-Link). Was LSF anzeigt, steht in `vvz` und wird als `[BioB 1] …` im Baum gesucht, unter
  dem Pfad aus **Titeln** `vvz_pfad` (Plan oder Modul). Knoten-IDs ändern sich jedes Semester.
- `bereich` kommt aus der Studienordnung, nicht aus LSF: `Pflichtbereich` macht jeden Bestandteil
  `required`.

```sh
python3 abruf/abruf.py --semester hu-wise-2026-27 --roh /irgendwo/roh   # 4 Module, ~90 s
```

**Was je Veranstaltung geholt wird** (eine eigene Sitzung ohne Login, ≥ 1 s Abstand): die
Detailseite, dann je Gruppe „vormerken“ + Semesteransicht des anonymen Stundenplans (dort steht der
iCalendar-Link mit den Termin-IDs, sonst nirgends), am Ende ein iCalendar-Export für alle Termine.
Die Termin-IDs, die beim Vormerken einer Gruppe neu dazukommen, gehören zu ihr. Baumseiten holt ein
Lauf einmal. BioB 1–4 (9 Veranstaltungen, 23 Gruppen): etwa 70 Anfragen.

**Termine nur aus dem Export, nie aus Freitext.** Einzeltermine sind VEVENTs ohne RRULE; Serien
rechnet `expandiere()` nach RFC 5545 aus, so weit LSF sie schreibt (WEEKLY/DAILY, INTERVAL, UNTIL,
COUNT, BYDAY), abzüglich EXDATE und „fällt aus am“ der Seite. Jede andere Regel ist ein Fehler.

| Meldung | Was dahintersteckt | Was tun |
|---|---|---|
| `Vorlesungsverzeichnis: „…“ fehlt` / `ist mehrdeutig` | Ein Titel aus `vvz_pfad` oder `[vvz]` steht so nicht (mehr) im Baum | Den Baum in LSF ansehen, den Katalog anpassen (Titel ändern sich mit einer neuen SPO) |
| `Vorlesungsverzeichnis zeigt ein anderes Semester` | LSF zeigt ohne Wahl das „aktuelle“ Semester; ein anderes Semester wählt der Abruf (noch) nicht | Warten, bis LSF umstellt, oder die Semesterwahl in `lsf.py` bauen |
| `Falsches Semester auf der Detailseite` | Die Veranstaltung gehört zu einem anderen Semester als der Katalog sagt | Katalog prüfen |
| `iCalendar-Export passt nicht zur Seite`, `… enthält einen fremden Termin` | Terminzeilen der Seite und VEVENTs lassen sich nicht eins zu eins zuordnen (Uhrzeit, Zeitraum) | Seite und Export von Hand vergleichen; nie die Prüfung abschalten |
| `Unbekannte Wiederholungsregel`, `Unerwartete Zeitzone` | LSF exportiert eine Serie, die `expandiere()` nicht kennt | Mit einem echten Export als Test in `tests/test_lsf.py` erweitern |
| `Unbekannter Terminstatus` | Eine Zeile steht nicht auf „findet statt“ | Ansehen, was der Status bedeutet, dann bewusst abbilden |
| `Stundenplan zeigt nicht die Semesteransicht`, `… hat vorgemerkte Termine verloren` | Der anonyme Stundenplan verhält sich anders als am 05.10.2026 | `termine_je_gruppe()` an das neue Verhalten anpassen |

**Freitext wird geschwärzt.** AGNES veröffentlicht in Kommentaren Moodle-Einschreibeschlüssel. Die
Hinweise (`notes`) übernehmen Belegung, „Wichtige Änderungen“, Kommentar und Bemerkung, aber jeder
Satz, der nach Zugangsdaten klingt, und jede E-Mail-Adresse werden ersetzt (`schwaerzen()`). Nennt
ein Freitext selbst Termine, steht davor eine Warnung: Die Seite rechnet damit nicht.

**Tests ohne Netz:** `tests/test_lsf.py` auf echten, gekürzten Ausschnitten vom 05.10.2026 unter
`tests/fixtures/lsf/` (Namen der Lehrenden entfernt; erfunden ist nur der Kommentar unter „Inhalt“).

## Lesemodell

`plan.py` und `bauen.py` (V-0215). Das Format ist der Vertrag mit der Seite und steht in
[`docs/ARCHITEKTUR.md`](../docs/ARCHITEKTUR.md) §5; die Regeln dahinter stehen in den Docstrings
der beiden Dateien.

```sh
python3 abruf/bauen.py                                   # katalog/ + daten/roh/ → web/daten/
python3 abruf/bauen.py --roh <ordner> --aus <ordner>     # andere Rohstände, anderes Ziel
```

- **Vorgaben hängen an der Repo-Wurzel**, nicht am Arbeitsverzeichnis; ausdrücklich übergebene
  Pfade gelten relativ zum Arbeitsverzeichnis.
- **Ein Modul ohne (lesbaren) Rohstand verschwindet nicht**: Es steht mit `components: []`,
  `title: null` und `error` im Plan. Die Zeile der Ausgabe nennt es unter „Fehler“. Der Befehl
  endet trotzdem mit 0, denn ein teilweiser Abruf ist ein normaler Tag.
- **Widerspricht sich der Katalog** (Plan zeigt auf ein unbekanntes Semester, Plan doppelt, Semester
  ohne `anker`), endet der Befehl mit 2 und schreibt nichts.
- **Gleiche Eingabe, gleiche Bytes** bis auf `erzeugt_am`. Pläne, die aus dem Katalog verschwinden,
  entfernt der nächste Lauf aus `--aus` (nur Dateien, die das alte `index.json` nannte).
- Die Ausgabe ist kompaktes JSON; lesbar mit `python3 -m json.tool web/daten/index.json`.
- Tests: `abruf/tests/test_plan.py` (Rhythmus, Parität, Nachttermine, Kollisionen, Fingerabdruck)
  und `abruf/tests/test_bauen.py` (Schlüssel exakt wie §5, Determinismus, Katalogfehler) mit
  erfundenen Daten unter `abruf/tests/fixtures/lesemodell/`.
