# Abruf und Lesemodell

Holt die öffentlichen MOSES-Daten je Modul (`abruf.py`, `moses.py`) und rechnet daraus die Daten,
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
- **Dauer:** je Modul 2 Seiten, je Bestandteil 5 Anfragen, mit 0,7 s Abstand, zwischen Modulen 2 s.
  WI im 1. Fachsemester (5 Module, 11 Bestandteile) dauert gut eine Minute; mit den
  Wahlpflichtbereichen der höheren Fachsemester etwa 11 s je Modul (V-0227).

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
- Zwischen zwei Anfragen derselben Sitzung mindestens **0,7 s** (`Client(delay=0.7)`), zwischen
  zwei Modulen **2 s** (`abruf.PAUSE`, `--pause`; seit V-0227). Nie mehrere Abrufe parallel
- Der **User-Agent** nennt das Projekt und seine Adresse (`moses.USER_AGENT`), damit MOSES einen
  auffälligen Abruf zuordnen kann, statt ihn zu sperren
- Je Modul eine frische Sitzung **ohne Login**. Die Exporteinstellungen gelten nur für sie;
  „Als Standard speichern“ wird nie aufgerufen
- Nur öffentliche Seiten, nur der Host von MOSES, auch nach Weiterleitungen
- Die Tests laufen **ohne Netz**: `tests/test_moses.py` auf einem echten, öffentlichen CSV-Export,
  `tests/test_abruf.py` mit einer Attrappe des Clients auf erfundenem HTML und einem erfundenen
  Katalog

## Modullisten und Wahlpflicht (V-0227, Demo-Strang)

`modulliste.py` liest den **Studiengangsaufbau** eines Studiengangs aus dem MTS von MOSES
(öffentlich): alle Bereiche mit ihren Modulen (Nummer, Version, LP, benotet, Prüfungsform,
Turnus, Gewicht) und den „Regeln zum Bestehen“ (daraus `lp_min`, `lp_max`). Was MOSES dort nicht
sagt, ist das **Fachsemester**: Das steht nur im Studienverlaufsplan der StuPO und bleibt Handarbeit
im Katalog.

```sh
# WI B.Sc. (121), StuPO 2025 (mkg 24980), Modulliste WiSe 2026/27 (semester 77)
python3 abruf/modulliste.py --studiengang 121 --stupo 24980 --liste 77 \
    --aus katalog/modullisten/wi-bsc-stupo2025-wise-2026-27.json
```

- Die drei Zahlen stehen in der Adresse der Studiengangsseite
  (`modultransfersystem/studiengaenge/anzeigen.html?studiengang=…&mkg=…&semester=…`); die
  Auswahllisten der Seite nennen alle StuPOs und Modullisten.
- **Je Bereich zwei Anfragen**, 1 s Abstand: WI mit 26 Bereichen dauert gut eine Minute. Es gibt
  keinen täglichen Lauf dafür; eine Liste ändert sich je Semester und wird mit dem Katalog neu
  erzeugt und committet.
- Der Baum wird über die **Auswahl je Zeilenschlüssel** (`0_1_4`) gelesen, der Tiefe nach, bis eine
  Auswahl leer zurückkommt. Das Aufklappen per Ajax gibt in dieser PrimeFaces-Fassung den Baum
  unverändert zurück. Fehlt eine Spalte der Modulzuordnungen, endet der Abruf mit
  `Unbekanntes Layout der Modulzuordnungen` (nicht raten).

**Im Katalog** nennt ein Plan seine Wahlpflichtbereiche mit `modulliste` (Datei unter
`katalog/modullisten/`) und `bereich` (Pfad im Baum, z. B. `Wahlpflichtbereich/Vertiefung
Informatik`). Der Abruf holt dann zusätzlich jedes Modul des Bereichs, dessen **Turnus** laut MTS
zum Semester passt (`k.A.` zählt als ja). `--alle-kandidaten` schaltet diesen Filter ab; damit
wurde am 05.10.2026 gemessen, wie verlässlich der Turnus ist (docs/forschung/wi-hoehere-fachsemester.md).

- **Ein Kandidat ohne Angebot ist kein Fehler des Laufs.** „keine gültige Version für …“ ist für ein
  Wahlpflichtmodul der Normalfall. Sein Scheitern steht im Rohstand und in `_lauf.json` unter
  `kandidaten: {module, fehler: [...]}`; `status` und `errors` richten sich nur nach Pflichtmodulen.
- **Ein Bestandteil ohne Termine im Semester** (keine Gruppenlinks und kein Listenexport auf der
  VVZ-Seite) ergibt `status: unplanned` mit leeren `groups`, statt `VVZ-Export fehlt`. Gibt es den
  Export, aber keine Gruppenlinks, bleibt es ein Fehler: Das kann ein geänderter Parser sein.
- **Pause zwischen Modulen: 2 s** (`--pause`, Punkt aed3e76c). WI FS 1–6 holt je Semester 120–170
  Module statt 5; ein Lauf dauert damit etwa eine halbe Stunde je Semester.

Das Lesemodell dazu (`wahlpflicht[]`, Moduldateien unter `module/<semester>/`) beschreibt der
Docstring von `bauen.py`, das Format im Ganzen docs/forschung/wi-hoehere-fachsemester.md. In
docs/ARCHITEKTUR.md §3–§5 steht es erst, wenn Silas die Öffnung für Phase 2 entscheidet.

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
