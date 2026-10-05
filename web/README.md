# Die Seite

Statisches HTML, CSS und JS ohne Build-Schritt: der Stundenplanner als **One-Pager**, gebaut nach
[`docs/DESIGN.md`](../docs/DESIGN.md) (V-0220, Bedienung nach Silas' Tests neu in V-0225). Liest `web/daten/` (das Lesemodell,
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
| `index.html` | der Rahmen: Kopf (mit Studiengang-Reiter, Kalender, Teilen), Module, Bühne (Werkzeugzeile mit Lage und Umschalter Tag/Woche, Raster), Legende, Fuß; die Hilfe als `<template>`, der SVG-Symbolsatz. Steht ohne JS (erstes Bild), der Satz der Lage schon im HTML (größter Inhalt früh) |
| `stil.css` | das Aussehen: Tokens aus DESIGN §5 auf `:root` (hell und dunkel), Zonen, Modulkacheln und Formate, Raster, Kachelarten mit Container-Abfragen und der kurzen Wahl-Animation, Ebenen, Tablet und Handy |
| `app.js` | lädt die Daten, zeichnet, verdrahtet die Bedienung, Karten, Blätter, Dialoge, Meldung. Der einzige Teil mit DOM |
| `raster.mjs` | das Raster ohne DOM: Zeitachse, Spuren paralleler Gruppen, dichteste Stelle, was sichtbar ist, die Navigation Modul → Format (`tippeModul`, `tippeFormat`, `stufeZurueck`), die Legende, Gruppennummer, Typ ausgeschrieben |
| `woche.mjs` | Konflikte gegen echte Termine, Ansichtsfilter, Wochen, A/B, Termine einer Karte |
| `auswahl.mjs` | die Auswahl: Speicher, eine Gruppe je Format, `changed`, `missing`, `stale`, die automatisch eingeplante einzige Gruppe (`einzige`, `auto`), Fortschritt, wirksame Auswahl, Teilen-Link |
| `text.mjs` | Escapen, sichere Links, Datumsangaben, Berliner Zeit ohne `Intl`, Abschluss ausgeschrieben |
| `manifest.webmanifest`, `icon.svg`, `icon-180/192/512.png` | Home-Bildschirm. Das Symbol ist eine Woche aus fünf Kacheln in Modulfarben auf Tinte; die PNGs sind daraus gerendert |
| `tests/` | `node --test` für die vier `.mjs`, gegen `tests/fixtures/plan.json` (synthetisch, Format §5) |
| `impressum.html`, `datenschutz.html`, `recht.css` | gehören zum Betrieb, nicht zu diesem Teil |
| `daten/` | erzeugt (`abruf/bauen.py`), nicht im Repo |

Die reine Logik steht in den `.mjs`, damit Node sie ohne Browser prüfen kann. Wer etwas an
Auswahl, Konflikten, Spuren oder Filtern ändert, ändert es dort und schreibt den Test dazu;
`app.js` zeichnet nur. Herkunft: Die `.mjs` (außer `raster.mjs`) kommen aus dem Nachbau V-0216, der
sie aus dem Study OS kopierte.

## Layout je Breite

Am Rechner füllt die Seite genau das Fenster (`height: 100dvh`), das Raster bekommt den Rest; die
Stunde teilt sich die Rasterhöhe (Stundenlinien und Kacheln in Prozent, kein Skript beim
Größerziehen). Reicht die Höhe nicht für 20 px je Stunde (Touch 22 px, je plus 0,5 px Luft), scrollt
die Seite statt abzuschneiden. Am Handy scrollt sie immer (Silas' Test, V-0225).

| Breite | Kopf | Module | Werkzeugzeile | Raster | unten |
|---|---|---|---|---|---|
| unter 768 px | Name, Kalender, Teilen; darunter der Studiengang-Reiter | Kacheln in zwei Spalten | Lage; Zeitraum unter dem Raster; Tag/Woche schwebt unten mittig | die Bühne füllt einen Schirm über dem Umschalter; Tag (Vorgabe) oder die ganze Woche klein | Zeitraum, Legende mit Modulfarben, mit 48 px Abstand der Fuß (14 px, Ziele 44 px) |
| 768–1023 px | Name, Reiter, Stand, Kalender, Teilen | Kacheln darüber, so viele Spalten wie 176 px passen | Lage in einer Zeile, darunter Zeitraum und Tag/Woche | die Woche, wenn sie passt | Legende, Fuß zweizeilig |
| ab 1024 px | wie oben | Spalte von 240 px links neben der Woche | eine Zeile | die Woche (ab 1280 px Tage ausgeschrieben) | Legende, Fuß (ab 1280 px einzeilig) |

**Die Woche nur, wenn sie passt** (Vorgabe, DESIGN §3.3): `raster.mjs` rechnet die dichteste Stelle
(`dichteste()`) und daraus die Mindestbreite (`wochenBreite()`), bei der jede Spur 24 px bekommt;
ab 1024 px kommt die Modulspalte dazu (240 + 24 px). Die Entscheidung fällt über eine
`matchMedia`-Abfrage, nicht über einen `resize`-Hörer. Der Umschalter zeigt die Woche trotzdem.

**Kacheln** sind Container (`container: kachel / size`); die Beschriftung wählen Container-Abfragen:
L ab 96 px (Modul, ab 240 px der volle Titel; die Einheit ausgeschrieben; ab 60 px Höhe Gruppe mit
Zeit; ab 76 px der Raum oder ein abweichender Rhythmus), M (80–95 px Modulname und „TUT 12“,
darunter Kürzel und Nummer), S unter 44 px (das Kürzel), unter 24 px nur Farbe. Arten: möglich
(weiß, Rand in Modulfarbe), gewählt (kräftig), automatisch (gestrichelt), Kontext (dunkelgrau),
zurückgenommen (hellgrau), dazu Ringe für Überschneidung. Am Rechner (feiner Zeiger, ab 768 px)
tragen Kacheln ab 160 px Breite und 52 px Höhe oben rechts „Einplanen“, „Wechseln“ oder „Lösen“;
sonst öffnet ein Klick die Gruppenkarte. Die Woche am Handy öffnet keine Karte: Ein Tipp zeigt den Tag.

**Ebenen:** eine zur Zeit. Ab 768 px Karte an ihrem Anker (Gruppenkarte neben der Kachel, rechts,
sonst links, sonst darunter, nie über ihr), Hilfe und Rückfrage als Dialog. Unter 768 px wird
jede Ebene ein Blatt von unten. Esc, der Schließknopf und ein Klick daneben schließen sie, der
Fokus kehrt zur Kachel zurück.

## Ablauf beim Öffnen

1. Der Rahmen steht sofort aus HTML und CSS; erst nach 300 ms ohne Daten erscheint „Termine werden
   geladen …“ (CSS, ohne Skript). Solange halten Studiengang und Module ihre Höhe (`.laedt`, für
   WI 1. FS gemessen; sonst springt das Raster, CLS).
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
- **Die einzige Gruppe eines Formats** ist automatisch eingeplant (`auswerten()`, `g.auto`):
  berechnet, nie gespeichert. „Lösen“ speichert die Abwahl als `{ "group": null, … }`, sonst käme
  sie beim nächsten Laden wieder; mit einer zweiten Gruppe ist das Format wieder offen.
- **Im Speicher der Seite** (`z` in `app.js`), nicht im Browser: der Filter (`modul`, `teil`,
  `ueber`), Tag oder Woche (`modus`, null heißt Vorgabe), der Tag (heute, am Wochenende Montag),
  Zeitraum, A/B, welche Kachel den Fokus hat, eine laufende Vorschau.

## Was das Raster zeigt

`sichtbar()` in `raster.mjs` (DESIGN §4.1): jede eingeplante Gruppe, dunkelgrau als Kontext, wenn
sie nicht zum Filter passt; ohne Filter dazu die Gruppen der Formate ohne Wahl („Noch offen“), mit
Filter alle Gruppen des Moduls bzw. Formats, auch die eines schon gewählten Formats (hellgrau): So
wechselt man. Die Navigation: Modul tippen filtert auf das Modul, Format tippen auf das Format;
nochmals tippen hebt auf, was man zuletzt gesetzt hat (`tippeModul`, `tippeFormat`, `stufeZurueck`). `spuren()` verteilt die Kacheln eines Tages auf Spuren
(gewählte zuerst, dann Beginn, Modul, Gruppenname); verkettete Überschneidungen teilen sich die
Tagesbreite. Die Zeitachse kommt aus allen Gruppen des Plans, damit das Raster beim Filtern nicht
springt.

## Der Teilen-Link

```
https://…/#studiengang=wi-bsc&semester=wise-2026-27&fs=1&w=10001:100~11&w=10002:500~52
```

- `w` = Bestandteil `~` Gruppe, je ausdrücklich gewählter Gruppe einmal (automatisch eingeplante
  rechnet, wer den Link öffnet, selbst). Getrennt wird am letzten `~`, weil die
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
schließt und setzt den Fokus zurück. Esc ohne Karte geht im Filter eine Stufe zurück. Jede Kachel
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

## Kalender-Export

`ics.mjs` (V-0231) macht aus der wirksamen Auswahl eine iCalendar-Datei (RFC 5545), die Apple-,
Google- und Outlook-Kalender übernehmen. Die Datei entsteht nur im Browser; nichts geht an einen
Server. Deshalb gibt es kein Abo (`webcal://`), das sich selbst aktualisiert: Dafür müsste ein
Server die Auswahl kennen.

- **Ein VEVENT je echtem Einzeltermin** (`bookings`) der gewählten Gruppen, keine RRULE: So stimmen
  Ferien, Ausfälle und Raumwechsel. `SUMMARY` „Modul · Art“, `LOCATION` der Raum, `DESCRIPTION`
  Modultitel, Art und Gruppe, LV-Nummer, Notiz, Link zu MOSES und „Kein offizielles Angebot“.
  `DTSTART`/`DTEND` in Berliner Ortszeit mit `TZID=Europe/Berlin` und eigenem `VTIMEZONE`.
- **UID = Buchungs-ID@stundenplanner.de**, stabil über Abrufe: Ein zweiter Import ersetzt, statt zu
  verdoppeln, soweit der Kalender das kann. Am iPhone kann er es nicht (ein zweites „Alle
  hinzufügen“ mit denselben UIDs tut nichts); deshalb rät `ICS_TEXTE.abzug` zu einem eigenen
  Kalender, den man ersetzt.
- `group: null` in der Auswahl ist eine bewusste Abwahl und liefert nichts, ebenso eine Gruppe
  ohne Termine. Zeilen mit CRLF, gefaltet bei 75 Oktetten (nie mitten in einem Umlaut).
- Die Seite ruft `icsHerunterladen(plan, auswahl)` → `{ blob, name, termine, text }`, dann im
  Klick-Handler `icsAnstossen(datei)` → Gerät, und zeigt `ICS_TEXTE[gerät]`: den einen Satz, was
  jetzt passiert oder was nicht mit einem Klick geht.
- **Der Knopf** „In Kalender übernehmen“ (am Handy „Kalender“) steht neben „Teilen“ (V-0225).
  `app.js` lädt `ics.mjs` bei der ersten Bedienung (pointerdown, keydown), nicht beim Laden: So
  zählt es nicht ins Budget und nicht zu den Anfragen bis zum Raster, und beim Klick ist das Modul
  meist da, der Export läuft ohne `await` (Safari gibt die Nutzergeste nicht über ein langes await
  weiter). Übergeben wird die wirksame Auswahl (`wirksameAuswahl()`: gewählt und automatisch).

**Was ein Klick auf welchem Gerät tut** (Recherche 05.10.2026):

| Gerät | Ein Klick? | Was passiert |
|---|---|---|
| iPhone/iPad, Safari | ja | Kalender-Vorschau mit „Alle hinzufügen“, dann den Kalender wählen. Geladen über eine `data:`-Adresse: `blob:` mit `download` kam in WebKit-Ansichten nicht beim Kalender an ([WebKit 216918](https://bugs.webkit.org/show_bug.cgi?id=216918)) |
| iPhone, Chrome, Firefox, Instagram & Co. | nein | geben die Datei nicht an den Kalender; der Satz schickt zum Teilen-Link in Safari |
| Android | halb | Download, dann öffnen; Kalender-Apps wie Samsung Kalender übernehmen sie. Die Google-Kalender-App importiert keine Dateien ([Google: nur am Computer](https://support.google.com/calendar/answer/37118?co=GENIE.Platform%3DAndroid)) |
| Mac | halb | Download, öffnen, Kalender fragt nach dem Ziel ([Apple](https://support.apple.com/guide/calendar/import-or-export-calendars-icl1023/mac)) |
| Windows | halb | Download, mit Outlook öffnen; neues Outlook und Outlook im Web: „Kalender hinzufügen“, „Aus Datei hochladen“ ([Microsoft](https://support.microsoft.com/office/cff1429c-5af6-41ec-a5b4-74f2c278e98c)) |
| Google Kalender im Web | nein | nur Einstellungen, „Importieren & exportieren“ ([Google](https://support.google.com/calendar/answer/37118)) |

Teilen mit `navigator.share` und der Datei geht nicht: Chromium lässt `.ics` und `text/calendar`
nicht teilen (Liste in `chrome/browser/webshare/share_service_impl.cc`).
