# Die Seite

Statisches HTML, CSS und JS ohne Build-Schritt: der Stundenplanner als **One-Pager**, gebaut nach
[`docs/DESIGN.md`](../docs/DESIGN.md) (V-0220). Liest `web/daten/` (das Lesemodell,
[`docs/ARCHITEKTUR.md`](../docs/ARCHITEKTUR.md) §5) und hält die Auswahl im Browser (§6). Lokal
ansehen:

```sh
python3 abruf/bauen.py                       # Lesemodell nach web/daten/ (aus daten/roh/)
python3 -m http.server -d web 8000           # dann http://localhost:8000/
node --test web/tests/*.test.mjs             # die Tests der Seite (auch in sh ops/test.sh)
python3 ops/sicht.py --web web               # misst DESIGN §8 in allen Fenstern (V-0221)
```

Über `file://` geht es nicht: ES-Module und `fetch` brauchen einen Server, irgendeinen statischen.

## Dateien

| Datei | Was |
|---|---|
| `index.html` | der Rahmen: fünf Zonen (Kopf, Module, Werkzeug, Raster, Fuß), die Hilfe als `<template>`, der SVG-Symbolsatz. Steht ohne JS (erstes Bild) |
| `stil.css` | das Aussehen: Tokens aus DESIGN §5 auf `:root` (hell und dunkel), Zonen, Raster, Kacheln mit Container-Abfragen, Ebenen, Handy-Layout |
| `app.js` | lädt die Daten, zeichnet, verdrahtet die Bedienung, Karten, Blätter, Dialoge, Meldung. Der einzige Teil mit DOM |
| `raster.mjs` | das Raster ohne DOM: Zeitachse, Spuren paralleler Gruppen, dichteste Stelle, was sichtbar ist, Gruppennummer, Typ ausgeschrieben |
| `woche.mjs` | Konflikte gegen echte Termine, Ansichtsfilter, Wochen, A/B, Termine einer Karte |
| `auswahl.mjs` | die Auswahl: Speicher, eine Gruppe je Bestandteil, `changed`, `missing`, `stale`, Teilen-Link |
| `text.mjs` | Escapen, sichere Links, Datumsangaben, Berliner Zeit ohne `Intl` |
| `manifest.webmanifest`, `icon.svg`, `icon-180/192/512.png` | Home-Bildschirm. Das Symbol ist eine Woche aus fünf Kacheln in Modulfarben auf Tinte; die PNGs sind daraus gerendert |
| `tests/` | `node --test` für die vier `.mjs`, gegen `tests/fixtures/plan.json` (synthetisch, Format §5) |
| `impressum.html`, `datenschutz.html`, `recht.css` | gehören zum Betrieb, nicht zu diesem Teil |
| `daten/` | erzeugt (`abruf/bauen.py`), nicht im Repo |

Die reine Logik steht in den `.mjs`, damit Node sie ohne Browser prüfen kann. Wer etwas an
Auswahl, Konflikten, Spuren oder Filtern ändert, ändert es dort und schreibt den Test dazu;
`app.js` zeichnet nur. Herkunft: Die `.mjs` (außer `raster.mjs`) kommen aus dem Nachbau V-0216, der
sie aus dem Study OS kopierte.

## Layout je Breite

Die Seite füllt genau das Fenster (`height: 100dvh`), die Zonen 1–3 und 5 sind so hoch wie ihr
Inhalt, das Raster bekommt den Rest. Die Stunde teilt sich die Rasterhöhe: Stundenlinien und
Kacheln liegen in Prozent, kein Skript misst beim Größerziehen. Reicht die Höhe nicht für 20 px je
Stunde (Touch 22 px, je plus 0,5 px für die Luft über jeder Kachel), scrollt die Seite statt
abzuschneiden.

| Breite | Kopf | Module | Werkzeug | Raster | Fuß |
|---|---|---|---|---|---|
| unter 768 px | Name, Teilen, Mehr (mit Zahl der Hinweise) | Chips mit Modulnamen, umbrechend | im Blatt „Ansicht“ | ein Tag, Tagesreiter, daneben „Ansicht“ | drei Zeilen: inoffiziell, Speicherhinweis, Stand mit Impressum und Datenschutz |
| 768–1023 px | Name, Plan, Stand, Teilen | Modulname, dahinter die Chips, bis zwei Zeilen | bis zwei Zeilen | die ganze Woche | zwei Zeilen |
| 1024–1279 px | wie oben | eine Zeile | eine Zeile | die Woche | zwei Zeilen |
| ab 1280 px | wie oben | eine Zeile | eine Zeile | die Woche, Tageskopf ausgeschrieben | eine Zeile |
| ab 1600 px | wie oben | Chips mit gewähltem Termin bzw. „Gruppen“ | | | |

**Die Woche nur, wenn sie passt** (DESIGN §3.3): `raster.mjs` rechnet die dichteste Stelle des
Plans (`dichteste()`) und daraus die Mindestbreite (`wochenBreite()`), bei der jede Spur 24 px
bekommt. Ist das Fenster schmaler, zeigt das Raster einen Tag mit Reitern; die Entscheidung fällt
über eine `matchMedia`-Abfrage mit dieser Breite, nicht über einen `resize`-Hörer.

**Kacheln** sind Container (`container: kachel / size`); ihre Beschriftung wählen
Container-Abfragen: Stufe M (Typ, Nummer) ohne Abfrage, L ab 112 px (Modul, Typ und Gruppe, ab
72 px Höhe der Raum oder ein abweichender Rhythmus), S unter 44 px (nur der Typ). Ist ein
Bestandteil gefiltert (`.teil`), zeigt die Kachel Gruppe und Raum. Am Rechner (feiner Zeiger, ab
768 px) tragen breite Kacheln ab 76 px Höhe den Knopf „Einplanen“, „Wechseln“ oder „Lösen“ (Silas,
05.10.2026); sonst öffnet ein Klick die Gruppenkarte, und dort wird gewählt.

**Ebenen:** eine zur Zeit. Ab 768 px Karte an ihrem Anker (Gruppenkarte neben der Kachel, rechts,
sonst links, sonst darunter, nie über ihr), Hilfe und Rückfrage als Dialog. Unter 768 px wird
jede Ebene ein Blatt von unten. Esc, der Schließknopf und ein Klick daneben schließen sie, der
Fokus kehrt zur Kachel zurück.

## Ablauf beim Öffnen

1. Der Rahmen steht sofort aus HTML und CSS; erst nach 300 ms ohne Daten erscheint „Termine werden
   geladen …“ (CSS, ohne Skript). Solange halten Modul- und Werkzeugleiste ihre Höhe (`.laedt`).
2. `daten/index.json` laden. Ein Plan: gewählt. Mehrere: die Wahl im Raster (vorgewählt, wenn die
   Adresse einen Plan nennt oder genau ein Plan eine gespeicherte Auswahl hat). Die Wahl steht danach
   im Fragment der Adresse (`#studiengang=…&semester=…&fs=…`).
3. Die Plandatei laden (`daten/<datei>` aus dem Index; nur relative Pfade unter `daten/`).
4. Kopf, Module und Werkzeug zeichnen, das Raster in einer eigenen Aufgabe danach: So blockiert keine
   einzelne Aufgabe den Browser lange (TBT, DESIGN §6).

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
  beim Neuladen. An der Stelle des Speicherhinweises steht in Bernstein „Dein Browser speichert die
  Auswahl nicht. Nimm den Teilen-Link mit.“
- **Zwei Registerkarten:** Ändert die eine die Auswahl, zieht die andere über das `storage`-Ereignis
  nach.
- **Im Speicher der Seite** (`z` in `app.js`), nicht im Browser: Ansicht (voreingestellt „Noch
  offen“), Modul- oder Bestandteil-Filter, Zeitraum, A/B, Tag (Handy: heute, am Wochenende Montag),
  welche Kachel den Fokus hat, eine laufende Vorschau.

## Was das Raster zeigt

`sichtbar()` in `raster.mjs` (DESIGN §4.1): jede gewählte Gruppe in jeder Ansicht, grau als
Kontext, wenn sie nicht zum Filter passt; dazu die möglichen Gruppen der Ansicht („Alle“ jede,
„Noch offen“ die der Bestandteile ohne Wahl, „Mein Plan“ keine). Ein gefilterter Bestandteil zeigt
immer alle seine Gruppen: So wechselt man. `spuren()` verteilt die Kacheln eines Tages auf Spuren
(gewählte zuerst, dann Beginn, Modul, Gruppenname); verkettete Überschneidungen teilen sich die
Tagesbreite. Die Zeitachse kommt aus allen Gruppen des Plans, damit das Raster beim Filtern nicht
springt.

## Der Teilen-Link

```
https://…/#studiengang=wi-bsc&semester=wise-2026-27&fs=1&w=10001:100~11&w=10002:500~52
```

- `w` = Bestandteil `~` Gruppe, je gewählter Gruppe einmal. Getrennt wird am letzten `~`, weil die
  Bestandteil-ID selbst einen Doppelpunkt trägt. Fingerabdruck und Name stehen nicht drin.
- **Im Fragment (hinter `#`), nicht in der Abfrage:** Das Fragment schickt der Browser nie an den
  Server.
- „Teilen“ öffnet am Handy (grober Zeiger) das Teilen-Menü des Systems, sonst kopiert es den Link
  („Link kopiert“); ohne Clipboard-API zeigt eine Karte den Link zum Kopieren von Hand. Gesperrt ist
  der Knopf nie: Ohne gewählte Gruppe oder während einer Vorschau sagt eine Meldung, was fehlt
  (`teilenWeg()` in `auswahl.mjs`; ein grauer Knopf ohne Antwort hielt Silas am Handy für kaputt).
- **Öffnen heißt ansehen:** Die Teilen-Leiste über dem Raster nennt den geteilten Plan und wie viele
  Gruppen von der eigenen Auswahl abweichen; die eigenen stehen grau daneben. Kacheln öffnen nur
  ihre Karte („Erst den Plan übernehmen“). „Übernehmen“ fragt nach, wenn eine eigene Auswahl da
  ist, „Verwerfen“ beendet die Vorschau. Danach verschwindet die Auswahl aus der Adresse.

## Tastatur und Screenreader

Das Raster ist ein Tabulatorhalt (wandernder `tabindex`): ↑ ↓ im Tag, ← → zur zeitlich nächsten
Kachel im Nachbartag, Pos1/Ende. Enter öffnet die Karte, die Hauptaktion hat den Fokus, Esc
schließt und setzt den Fokus zurück. Esc ohne Karte hebt einen Bestandteil-Filter auf. Jede Kachel
nennt sich vollständig (`aria-label`), Wahl, Lösen und Filter sagt ein höflicher Live-Bereich an.
Die Knöpfe direkt auf den Kacheln haben `tabindex="-1"`: Mit der Tastatur geht es über die Karte.

## Sicherheit und Tempo

- Kein Text aus der Datendatei wird HTML: alles durch `esc()`. Links nur zu
  `https://moseskonto.tu-berlin.de/` und `https://isis.tu-berlin.de/` (`sichereUrl()`).
- `index.html` setzt eine Content-Security-Policy: nur eigene Dateien, kein Inline-Skript, kein
  Inline-Stil. Deshalb tragen die Modulfarben Klassen (`m1` … `m8`, aus den Tokens `--m1-…`), und
  die Lage der Kacheln setzt `app.js` über `element.style` (CSSOM, das die Richtlinie erlaubt). Wer
  ein `style="…"` ins HTML schreibt, sieht es nicht wirken.
- Kein Framework, kein Build, keine fremde Schrift, nichts von einem CDN, alle Pfade relativ.
- **Kein `Intl`:** Ein `Intl.Collator` und ein `Intl.DateTimeFormat` mit Zeitzone kosteten beim
  Laden auf 4-fach gedrosselter CPU zusammen 90 ms im längsten Block. Gruppennamen vergleicht
  `raster.mjs` selbst (Zahlen als Zahlen), die Berliner Zeit rechnet `text.mjs` nach der EU-Regel.
- Das Budget aus DESIGN §6 hält die Seite in den Ergebnissen (LCP, CLS, TBT), aber nicht in den
  Bytes und Anfragen; warum, steht dort in der Liste der Abweichungen.

## Was anders ist als im Vorbild — und warum

Die Tabelle alt → neu steht in DESIGN §4.3. Dazu, was schon der Nachbau änderte:

- **Kein Server:** Auswahl im Browser statt in einer Datenbank; neu sind Speicherhinweis, „Auswahl
  zurücksetzen“, Teilen-Link, Vorschau und die Planwahl bei mehreren Plänen.
- **Kein Datum im Code:** A/B und Wochen kommen aus `anchor` der Plandatei.
- **A/B vor dem Anker:** `paritaet()` rechnet wie die Python-Seite 0 oder 1.
- **Entfallen:** „Für Agenten · Daten und Schnittstellen“ und „MOSES-Version weicht vom Modul im
  Study OS ab“ (es gibt kein Study OS dahinter).
- **Reihenfolge der Module:** wie im Lesemodell (Katalog), nicht nach Modulnummer.
- **`ausgelassen`** (Gruppen, die nur Termine eines anderen Semesters haben) nennt die Modulkarte
  leise beim Bestandteil; das Vorbild kannte es nicht.
