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
| `VVZ zeigt trotz Auswahl ein anderes Semester`, `Falsches Semester im Export` | MOSES liefert Termine eines anderen Semesters | Nachsehen, welche Gruppe es ist (siehe unten). Nie die Prüfung abschalten: Ein Sommerplan im Winter ist schlimmer als ein fehlendes Modul |
| `Export enthält unbekannte Gruppe/Buchung`, `Widersprüchliche doppelte Buchung`, `Ungültige ISO-Zeit`, `Terminende liegt vor dem Beginn` | Der Export passt nicht zur Seite, die ihn angeboten hat | Einen Tag abwarten; bleibt es, den Export von Hand ansehen |
| `HTTPError: HTTP Error 429/503 …`, `URLError …`, `TimeoutError` | MOSES ist nicht erreichbar oder bremst | Nichts. Nicht sofort wiederholen (Höflichkeit, unten) |
| `Unerwarteter MOSES-Host`, `Unerwartete Weiterleitung` | Eine Adresse oder Weiterleitung führt weg von MOSES | Nicht folgen. `moses.py` holt nur von MOSES selbst |

**Bekannt seit dem 29.09.2026:** Statistik I (70450) scheitert mit `Falsches Semester im Export`.
Im Tutorium listet MOSES auf der Seite des WiSe 2026/27 eine Gruppe, deren einzige Buchung als
`SoSe 2026` gekennzeichnet ist. Weil `parse_export()` jede Zeile prüft, fällt der ganze Export.

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
