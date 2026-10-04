# Die Seite

Statisches HTML, CSS und JS ohne Build-Schritt. Liest `web/daten/` (das Lesemodell,
[`docs/ARCHITEKTUR.md`](../docs/ARCHITEKTUR.md) §5) und hält die Auswahl im Browser (§6). Lokal
ansehen:

```sh
python3 abruf/bauen.py                       # Lesemodell nach web/daten/ (aus daten/roh/)
python3 -m http.server -d web 8000           # dann http://localhost:8000/
node --test web/tests/*.test.mjs             # die Tests der Seite (auch in sh ops/test.sh)
```

Über `file://` geht es nicht: ES-Module und `fetch` brauchen einen Server, irgendeinen statischen.

**Stand: getreuer Nachbau** des Stundenplans im Study OS (V-0216): dieselbe Bedienung, dasselbe
Aussehen. Das neue Aussehen kommt mit dem Neubau nach `docs/DESIGN.md`; die Logik in den `.mjs`
bleibt dabei.

## Dateien

| Datei | Was | Herkunft im Study OS |
|---|---|---|
| `index.html` | das Gerüst: Kopf, Status, Speicherhinweis, Teilen-Box, Modulkarten, Rückmeldungen, Wochenbaukasten, „So funktioniert die Planung“, Fuß | `app/templates/stundenplan.html` |
| `app.js` | lädt die Daten, zeichnet, verdrahtet die Bedienung. Der einzige Teil mit DOM | `app/static/stundenplan.js` |
| `auswahl.mjs` | die Auswahl: Speicher, eine Gruppe je Bestandteil, `changed`, `missing`, `stale`, Teilen-Link | `load()`/`save()` in `app/stundenplan.py` |
| `woche.mjs` | der Baukasten ohne DOM: Konflikte, Ansichtsfilter, Wochen, A/B, Termine einer Karte | `stundenplan.js`, `conflicts()` in `app/stundenplan.py` |
| `text.mjs` | Escapen, sichere Links, Datumsangaben | `stundenplan.js` |
| `stil.css` | das Aussehen des Vorbilds, Farben aus dessen `os.css` | `app/static/stundenplan.css`, `os.css` |
| `tests/` | `node --test` für die drei `.mjs`, gegen `tests/fixtures/plan.json` (synthetisch, Format §5) | `app/tests_stundenplan.py` |
| `impressum.html`, `datenschutz.html` | gehören zum Betrieb, nicht zu diesem Teil | — |
| `daten/` | erzeugt (`abruf/bauen.py`), nicht im Repo | — |

Die reine Logik steht in den `.mjs`, damit Node sie ohne Browser prüfen kann. Wer etwas an
Auswahl, Konflikten oder Filtern ändert, ändert es dort und schreibt den Test dazu; `app.js`
zeichnet nur.

## Ablauf beim Öffnen

1. `daten/index.json` laden. Ein Plan: gewählt. Mehrere: die Wahl „Studiengang · Fachsemester“
   (vorgewählt, wenn die Adresse einen Plan nennt oder genau ein Plan eine gespeicherte Auswahl hat).
   Die Wahl steht danach im Fragment der Adresse (`#studiengang=…&semester=…&fs=…`), damit Neuladen
   und Lesezeichen sie behalten, ohne dass etwas gespeichert wird.
2. Die Plandatei laden (`daten/<datei>` aus dem Index; nur relative Pfade unter `daten/`).
3. Die Auswahl aus `localStorage` lesen und anwenden (`auswerten()`): `selected`, `changed`,
   `missing`. Konflikte rechnet `conflictPairs()` gegen alle Einzeltermine.

## Der Zustand — was wo liegt

- **Im Speicher des Browsers** genau ein Schlüssel je Plan:
  `stundenplanner:v1:<studiengang>:<semester>:fs<n>` =
  `{ "<component_id>": { "group": "…", "digest": "…", "name": "…" } }`. Nichts sonst.
- **Regeln** (Silas' Hosting-Recherche, DSK-Orientierungshilfe zu Web Storage; damit kein
  Einwilligungsbanner nötig ist): geschrieben wird erst, wenn jemand aktiv eine Gruppe wählt,
  einen geteilten Plan übernimmt oder eine Änderung als geprüft markiert. Laden schreibt nichts,
  auch kein Probeschreiben. Kein Zeitstempel, keine Kennung. „Auswahl zurücksetzen“ (mit Rückfrage)
  löscht den Schlüssel, und eine leer gewordene Auswahl entfernt ihn ebenfalls. Die Tests in
  `tests/auswahl.test.mjs` halten jede dieser Regeln fest.
- **Ohne Speicher** (privates Fenster, gesperrte Website-Daten) geht alles, nur vergisst die Seite
  beim Neuladen. Sie sagt das an der Stelle des Speicherhinweises.
- **Zwei Registerkarten:** Ändert die eine die Auswahl, zieht die andere über das `storage`-Ereignis
  nach. (Im Vorbild verhinderte das eine Revision auf dem Server.)
- **Im Speicher der Seite**, nicht im Browser: Ansicht, Modulfilter, Zeitraum, Tag, aufgeklappte
  Details, eine laufende Vorschau.

## Der Teilen-Link

```
https://…/#studiengang=wi-bsc&semester=wise-2026-27&fs=1&w=10001:100~11&w=10002:500~52
```

- `w` = Bestandteil `~` Gruppe, je gewählter Gruppe einmal. Getrennt wird am letzten `~`, weil die
  Bestandteil-ID selbst einen Doppelpunkt trägt. Fingerabdruck und Name stehen nicht drin; sie
  kommen beim Öffnen aus dem aktuellen Plan.
- **Im Fragment (hinter `#`), nicht in der Abfrage:** Das Fragment schickt der Browser nie an den
  Server. Wer einen Link öffnet, verrät die Auswahl darin also auch dem Hoster nicht.
- **Öffnen heißt ansehen:** Die Seite zeigt den geteilten Plan als Vorschau (Status „im geteilten
  Plan“, Wahl gesperrt) und vergleicht ihn mit der eigenen Auswahl. „Übernehmen“ ersetzt die eigene
  Auswahl erst nach einer Rückfrage, wenn eine da ist; „Meine Auswahl zeigen“/„Verwerfen“ beendet die
  Vorschau. Gruppen aus dem Link, die es nicht mehr gibt, nennt die Seite und übernimmt sie nicht.
  Danach verschwindet die Auswahl aus der Adresse, damit Neuladen nicht wieder fragt.

## Sicherheit und Tempo

- Kein Text aus der Datendatei wird HTML: alles durch `esc()`. Links nur zu
  `https://moseskonto.tu-berlin.de/` und `https://isis.tu-berlin.de/` (`sichereUrl()`), sonst kein Link.
- `index.html` setzt eine Content-Security-Policy: nur eigene Dateien, kein Inline-Skript, kein
  Inline-Stil. Deshalb tragen die Modulfarben Klassen (`sp-c0` … `sp-c4`) statt `style`-Attributen.
  Wer ein `style="…"` ins HTML schreibt, sieht es nicht wirken.
- Kein Framework, kein Build, keine fremde Schrift, nichts von einem CDN, alle Pfade relativ (die
  Seite läuft so unter jedem Pfad und bei jedem statischen Hoster).

## Was anders ist als im Vorbild — und warum

- **Kein Server:** Auswahl im Browser statt in einer Datenbank; „Speichert …“, Revisionen und 409
  fallen weg. Neu sind Speicherhinweis, „Auswahl zurücksetzen“, Teilen-Link, Vorschau und die
  Planwahl bei mehreren Plänen.
- **Kein Datum im Code:** A/B-Beschriftung und „Kalenderwochen ab …“ kommen aus `anchor` der
  Plandatei (im Vorbild stand 12.10.2026 im Code).
- **A/B vor dem Anker:** Das JS des Vorbilds rechnete für Termine vor dem Anker die Woche -1 und
  ließ sie aus der A/B-Liste fallen; `paritaet()` rechnet wie die Python-Seite 0 oder 1.
- **Entfallen:** der Block „Für Agenten · Daten und Schnittstellen“ und der Hinweis „MOSES-Version
  weicht vom Modul im Study OS ab“ (es gibt kein Study OS dahinter). Die Uhrzeit des täglichen Laufs
  nennt die Seite nicht mehr; sie zeigt den tatsächlichen Datenstand.
- **„1 gemeinsamer Termin, am …“** statt „1 gemeinsame Termine, zuerst …“.
- **Reihenfolge der Module:** wie im Lesemodell (Katalog), nicht nach Modulnummer wie im Vorbild.
