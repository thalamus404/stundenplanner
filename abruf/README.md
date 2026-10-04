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
