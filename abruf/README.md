# Abruf und Lesemodell

Holt die öffentlichen MOSES-Daten je Modul (`abruf.py`, `moses.py`) und rechnet daraus die Daten,
die die Seite liest (`plan.py`, `bauen.py`). Formate und Befehle: [`docs/ARCHITEKTUR.md`](../docs/ARCHITEKTUR.md)
§3–§7. Herkunft: Study OS (`stundenplan/moses.py`, `stundenplan/runner.py`, `app/stundenplan.py`), kopiert.

*Im Bau (Programm „Stundenplanner — erste Fassung“, Phase 2). Wer hier baut, schreibt in diese Datei,
wie man es benutzt und was beim Abruf schiefgehen kann.*

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
