# Die Seite

> **⛔ Keine Zugriffe auf Systeme der TU Berlin ohne Silas’ ausdrückliche Genehmigung**
> (Silas, 05.10.2026; [AGENTS.md §2 ⑦](../AGENTS.md#2-die-regeln)). Das gilt für jeden Weg: Abruf-Code, Skript, `curl`,
> Browser-Automatisierung, `WebFetch` eines Agenten, auch für eine einzelne Seite „nur zum Nachsehen“.
> Genehmigt ist allein der tägliche Lauf um 05:20 im Container `stundenplanner-abruf`. Wer mehr braucht,
> fragt Silas **vorher** und nennt **Umfang**, **Maßnahmen gegen Last** und **Grund**. Dasselbe gilt für
> die Vorlesungsverzeichnisse anderer Hochschulen. Der Code sperrt selbst (`abruf/zugang.py`).

Statisches HTML, CSS und JS ohne Build-Schritt: der Stundenplanner als **One-Pager**, gebaut nach
[`docs/DESIGN.md`](../docs/DESIGN.md) (V-0220, Bedienung nach Silas' Tests neu in V-0225, Startbildschirm
in V-0234). Liest `web/daten/` (das Lesemodell,
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
| `index.html` | der Rahmen: der Startbildschirm (`#hallo`, versteckt, bis `app.js` ihn braucht), dann der Plan: Kopf (Studiengang-Reiter, Schriftzug als `<use href="#marke">`, Kalender, „Stundenplan speichern“), Hinweise oben, Module, Bühne (Werkzeugzeile mit Lage und Umschalter Tag/Woche, Raster), Legende, Fuß; die Hilfe als `<template>`, der SVG-Symbolsatz. Steht ohne JS (erstes Bild), der Satz der Lage schon im HTML (größter Inhalt früh) |
| `stil.css` | das Aussehen: Tokens aus DESIGN §5 auf `:root` (hell und dunkel), Zonen, Modulkacheln und Formate, Raster, Kachelarten mit Container-Abfragen und der kurzen Wahl-Animation, Ebenen, Tablet und Handy |
| `app.js` | lädt die Daten, zeichnet Startbildschirm und Plan, verdrahtet die Bedienung, Karten, Blätter, Dialoge, Meldung. Der einzige Teil mit DOM |
| `planwahl.mjs` | der Startbildschirm ohne DOM (V-0234): den Baum aus `index.json` prüfen (`wahlBaum`), alle Pläne flach (`blaetter`), wo die Wahl steht und was die Leiste zeigt (`wahlStand`, mit Voraussage), wählen, zurück, vorbelegen, welcher Plan zu einem Link gehört (`planZumLink`), Optionen nach Zusatz gruppieren, was die Seite bei „keine Wahl ohne Überschneidung“ sagt (`ohneLoesung`) |
| `raster.mjs` | das Raster ohne DOM: Zeitachse, Spuren paralleler Gruppen, dichteste Stelle, was sichtbar ist, die Navigation Modul → Format (`tippeModul`, `tippeFormat`, `stufeZurueck`), die Legende, Gruppennummer, Typ ausgeschrieben |
| `woche.mjs` | Konflikte gegen echte Termine, Ansichtsfilter, Wochen, A/B, Termine einer Karte |
| `auswahl.mjs` | die Auswahl: Speicher (Schlüssel je `plan.id`, Umzug des alten Schlüssels, die Planwahl), eine Gruppe je Format, `changed`, `missing`, `stale`, der Vorschlag der einzigen Gruppe (`einzige`, `vorschlag`), die Regeln `alle`/`keine` der Gruppen, Fortschritt, wirksame Auswahl, Teilen-Link |
| `text.mjs` | Escapen, sichere Links, Datumsangaben, Berliner Zeit ohne `Intl`, Abschluss ausgeschrieben |
| `manifest.webmanifest`, `icon.svg`, `icon-32/180/192/512.png` | Tab und Home-Bildschirm. Das Symbol ist „sp“ aus dem Schriftzug, „s“ in Sora 800, „p“ leicht (im Favicon 450, damit es bei 16 px trägt, im App-Symbol 300), genau mittig auf einer Kachel: hell Tinte auf `#f7f8fb`, im dunklen Schema hell auf Schwarz `#000` (V-0254, Silas: „komplett mittig … tieferer Schwarzton für die dunkle Version“). `icon-32.png` ist der Rückfall für Browser ohne SVG-Favicon; die App-PNGs sind deckend, iOS rundet selbst. Vorher fünf Kacheln in Modulfarben (bis V-0253) |
| `tests/` | `node --test` für die `.mjs`, gegen `tests/fixtures/plan.json` (synthetisch, Format §5); `planwahl.test.mjs` mit einem erfundenen Baum im Format von `index.json` |
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
| unter 768 px | der Schriftzug links, rechts Kalender und Speichern als Symbole; darunter der Studiengang-Reiter | Kacheln in zwei Spalten | Lage; Zeitraum unter dem Raster; Tag/Woche schwebt unten mittig | die Bühne füllt einen Schirm über dem Umschalter; die ganze Woche klein (Vorgabe, V-0247) oder ein Tag | Zeitraum, Legende mit Modulfarben, mit 48 px Abstand der Fuß (14 px, Ziele 44 px) |
| 768–1023 px | der Schriftzug mittig, rechts „Kalender“ und „Speichern“; darunter der Reiter; Stand im Fuß | Kacheln darüber, so viele Spalten wie 176 px passen | Lage in einer Zeile, darunter Zeitraum und Tag/Woche | die Woche, wenn sie passt | Legende, Fuß zweizeilig |
| ab 1024 px | eine Zeile: Reiter links, Schriftzug mittig, Knöpfe rechts (ab 1200 px ausgeschrieben, ab 1440 px mit Stand) | Spalte von 240 px links neben der Woche, darunter klein die Legende (bis fünf Module) | eine Zeile | die Woche (ab 1280 px Tage ausgeschrieben) | Fuß (ab 1280 px einzeilig); ab sechs Modulen die Legende unter dem Raster |

**Die Woche nur, wenn sie passt** (Vorgabe, DESIGN §3.3): `raster.mjs` rechnet die dichteste Stelle
(`dichteste()`) und daraus die Mindestbreite (`wochenBreite()`), bei der jede Spur 24 px bekommt;
ab 1024 px kommt die Modulspalte dazu (240 + 24 px). Die Entscheidung fällt über eine
`matchMedia`-Abfrage, nicht über einen `resize`-Hörer. Der Umschalter zeigt die Woche trotzdem.

**Kacheln** sind Container (`container: kachel / size`); die Beschriftung wählen Container-Abfragen:
L ab 96 px (Modul, ab 240 px der volle Titel; die Einheit ausgeschrieben; ab 60 px Höhe Gruppe mit
Zeit; ab 76 px der Raum oder ein abweichender Rhythmus), M (80–95 px Modulname und „TUT 12“,
darunter Kürzel und Nummer), S unter 44 px (das Kürzel), unter 24 px nur Farbe. Arten: möglich
(weiß, Rand in Modulfarbe), gewählt (kräftig), Vorschlag (gestrichelt, nicht eingeplant), Kontext
(dieselbe Kachel durchscheinend, Deckkraft 0,2), zurückgenommen (blass), dazu Ringe für
Überschneidung. Die Sättigung folgt der Kategorie des Formats (`R.kategorie()`, Klassen `kat-uebung`
70 %, `kat-sonstige` 50 %, `filter: saturate()`). Am Rechner (feiner Zeiger, ab 768 px) tragen Kacheln
ein abgerundetes Plus (Einplanen, Wechseln) bzw. ein Kreuz (Lösen): ab 96 px Breite oben rechts, auf
schmalen ab 52 px Höhe unten mittig; sonst öffnet ein Klick die Gruppenkarte (V-0237). Am Handy plant ein Tipp auf eine Kachel ein, ein zweiter löst sie (V-0247, Aktion `umschalten`); lange drücken (500 ms) öffnet die Karte, der click beim Loslassen wird verschluckt. Nicht in der Vorschau eines geteilten Plans und nicht auf dem durchscheinenden eigenen Plan beim Filtern.

**Ebenen:** eine zur Zeit. Ab 768 px Karte an ihrem Anker (Gruppenkarte neben der Kachel, rechts,
sonst links, sonst darunter, nie über ihr), Hilfe und Rückfrage als Dialog. Unter 768 px wird
jede Ebene ein Blatt von unten. Esc, der Schließknopf und ein Klick daneben schließen sie, der
Fokus kehrt zur Kachel zurück.

## Ablauf beim Öffnen

1. Der Rahmen des Plans steht sofort aus HTML und CSS; erst nach 300 ms ohne Daten erscheint „Termine
   werden geladen …“ (CSS, ohne Skript). Solange halten Studiengang und Module ihre Höhe (`.laedt`,
   für WI 1. FS gemessen; sonst springt das Raster, CLS).
2. `daten/index.json` laden und den Baum `wahl` prüfen (`planwahl.mjs`; Blätter nur mit gültiger
   Kennung und relativer Datei unter `daten/`). Welcher Plan: der aus dem Teilen-Link (`#plan=<id>`,
   alte Links über Studiengang, Semester, Fachsemester, wenn eindeutig), sonst die gespeicherte
   Planwahl, sonst der einzige Plan mit gespeicherter Auswahl, sonst **der Startbildschirm**
   (DESIGN §3.6, §4.5). Ohne Plan ist der Plan-Rahmen höchstens so lange zu sehen, bis `index.json`
   da ist; ein vorgeschaltetes Skript, das das vor dem ersten Bild entscheidet, gibt es bewusst nicht
   (DESIGN §6).
3. Die Plandatei laden (`daten/<datei>` aus dem Blatt). Danach trägt die Adresse `#plan=<id>`.
4. Kopf, Module und Werkzeug zeichnen, das Raster in einer eigenen Aufgabe danach: So blockiert keine
   einzelne Aufgabe den Browser lange (TBT, DESIGN §6).

## Der Startbildschirm

`app.js` zeichnet je Stufe eine Frage mit Optionen und unten die Leiste; was er weiß, sagt
`planwahl.mjs` (`wahlStand`): je Stufe `gewaehlt`, `automatisch`, `entfaellt` oder `offen`, auch
vorausgesagt für Stufen, an denen man noch nicht ist (entfällt oder automatisch in jedem Zweig
darunter). Eine Option wählt und führt zur nächsten offenen Stufe; steht damit der Plan fest, öffnet
er sich (`halloFertig`, V-0251; bis dahin kam eine Zusammenfassung mit „Stundenplan öffnen“). Zurück
geht es über die gewählten Karten und Esc.
Der Reiter im Plan öffnet den Startbildschirm vorbelegt mit dem offenen Plan (`wahlFuer`). Die
Leiste klebt unten (`position: sticky`), `scroll-padding-bottom` hält fokussierte Optionen über ihr.
Die Haken für `ops/sicht.py`: `data-sicht="hallo"`, `data-sicht="option"` mit `data-s` (Stufe) und
`data-i` (Stelle im Knoten), `data-sicht="fortschritt"`, `[data-act="h-oeffnen"]`.

## Der Zustand — was wo liegt

- **Im Speicher des Browsers** ein Schlüssel je Plan, seit V-0234 je `plan.id`:
  `stundenplanner:v1:<plan.id>` =
  `{ "<component_id>": { "group": "…", "digest": "…", "name": "…" } }`, dazu
  `stundenplanner:v1:plan` = die Kennung des Plans, den man zuletzt im Startbildschirm geöffnet hat.
  Nichts sonst.
- **Umzug** (V-0234): Bis dahin hieß der Schlüssel `stundenplanner:v1:<studiengang>:<semester>:fs<n>`,
  und Pläne mit Vertiefung oder anderer Ordnung teilten ihn. Liegt unter dem neuen Schlüssel nichts
  und gehört der alte genau einem Plan (WI 1. FS, live), gilt die Auswahl von dort
  (`ladeAuswahlFuer`). Die erste aktive Änderung schreibt sie unter den neuen Schlüssel und entfernt
  den alten (`speichereUndZiehUm`); „Auswahl zurücksetzen“ löscht beide. Laden schreibt auch hier nichts.
- **Regeln** (Silas' Hosting-Recherche, DSK-Orientierungshilfe zu Web Storage; damit kein
  Einwilligungsbanner nötig ist): geschrieben wird erst, wenn jemand aktiv eine Gruppe wählt,
  einen geteilten Plan übernimmt, eine Änderung als geprüft markiert, im Startbildschirm die letzte
  Stufe wählt (dann nur die Planwahl) oder den Pfeiltasten-Tipp mit dem X schließt (dann nur
  `stundenplanner:v1:tipp` = `pfeile`, V-0251). Laden schreibt nichts,
  auch kein Probeschreiben. Kein Zeitstempel, keine Kennung. „Auswahl zurücksetzen“ (mit Rückfrage)
  löscht den Schlüssel, und eine leer gewordene Auswahl entfernt ihn ebenfalls. Die Tests in
  `tests/auswahl.test.mjs` halten jede dieser Regeln fest.
- **Ohne Speicher** (privates Fenster, gesperrte Website-Daten) geht alles, nur vergisst die Seite
  beim Neuladen. An der Stelle des Speicherhinweises steht in Bernstein „Dein Browser speichert die
  Auswahl nicht. Sichere sie mit „Stundenplan speichern“.“
- **Zwei Registerkarten:** Ändert die eine die Auswahl, zieht die andere über das `storage`-Ereignis
  nach.
- **Die einzige Gruppe eines Formats** ist ein Vorschlag (`auswerten()`, `g.vorschlag`, V-0237):
  berechnet, nie gespeichert, **nicht eingeplant** (nicht in `selected`, nicht im Fortschritt, nicht
  im Export, nicht im Link), bis man „Einplanen“ drückt. „Lösen“ entfernt den Eintrag, die Gruppe ist
  wieder ein Vorschlag. Ein `group: null` aus V-0225 gilt wie kein Eintrag.
- **Wie die Gruppen zu belegen sind** (`gruppen`, V-0233): `alle` heißt, alle Gruppen mit Terminen
  sind ein Vorschlag; eingeplant wird das Format als Ganzes (eine seiner Gruppen im Speicher), im
  Export ist `group` dann eine Liste. `keine` (offenes Angebot) wird nie vorgeschlagen, zählt nicht
  im Fortschritt und steht nicht in „Mein Stundenplan“ (`sichtbar()` in `raster.mjs`). `unklar` wählt
  man wie üblich, die Seite sagt es leise.
- **Im Speicher der Seite** (`z` in `app.js`), nicht im Browser: der Filter (`modul`, `teil`,
  `ueber`), Tag oder Woche (`modus`, null heißt Vorgabe), der Tag (heute, am Wochenende Montag),
  Zeitraum, A/B, welche Kachel den Fokus hat, eine laufende Vorschau.

## Was das Raster zeigt

`sichtbar()` in `raster.mjs` (DESIGN §4.1): ohne Filter „Mein Stundenplan“, jede eingeplante Gruppe
und jeder Vorschlag (die Vorgabe beim Öffnen, immer, V-0237); mit Filter alle Gruppen des Moduls
bzw. Formats, auch die eines schon gewählten Formats (blass): So wechselt man. „Mein Stundenplan“
außerhalb des Filters steht als Kontext da, durchscheinend. Die Navigation: Modul tippen filtert auf das Modul, Format tippen auf das Format;
nochmals tippen hebt auf, was man zuletzt gesetzt hat (`tippeModul`, `tippeFormat`, `stufeZurueck`). `spuren()` verteilt die Kacheln eines Tages auf Spuren
(gewählte zuerst, dann Beginn, Modul, Gruppenname); verkettete Überschneidungen teilen sich die
Tagesbreite. Die Zeitachse kommt aus allen Gruppen des Plans, damit das Raster beim Filtern nicht
springt.

## Der Teilen-Link

```
https://…/#plan=wi-bsc:stupo-2025:wise-2026-27:fs1&w=10001:100~11&w=10002:500~52
```

- `plan` ist die Kennung des Plans (seit V-0234). Ein Link führt direkt in den Plan, am
  Startbildschirm vorbei. Alte Links (`#studiengang=wi-bsc&semester=wise-2026-27&fs=1&w=…`) gelten
  weiter, wenn genau ein Plan dazu passt; sonst fragt der Startbildschirm.

- `w` = Bestandteil `~` Gruppe, je eingeplanter Gruppe einmal (Vorschläge rechnet, wer den Link
  öffnet, selbst; bei `gruppen: alle` genügt eine Gruppe). Getrennt wird am letzten `~`, weil die
  Bestandteil-ID selbst einen Doppelpunkt trägt. Fingerabdruck und Name stehen nicht drin.
- **Im Fragment (hinter `#`), nicht in der Abfrage:** Das Fragment schickt der Browser nie an den
  Server.
- „Stundenplan speichern“ (bis V-0243 „Teilen“) schiebt von unten die gleichnamige Fläche herein (V-0237, ein Blatt auf jeder
  Breite): der Link im Feld, „Kopieren“ (ohne Clipboard-API wird der Link markiert), „Lesezeichen“
  (eine Seite kann keins setzen: Solange die Fläche offen ist, steht der Link in der Adresse, und die
  Fläche nennt je Gerät die Taste bzw. den Weg, `lesezeichenText()`), „Teilen“ nur, wo es
  `navigator.share` gibt (`{ title, url }`, am iPhone das Teilen-Menü mit allen Apps). Geschlossen
  steht wieder `#plan=<id>` in der Adresse (`zu` an `oeffne()`). Gesperrt ist der Knopf nie: Ohne
  eingeplante Gruppe oder während einer Vorschau sagt eine Meldung, was fehlt (`teilenWeg()` in
  `auswahl.mjs`; ein grauer Knopf ohne Antwort hielt Silas am Handy für kaputt).
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
Google- und Outlook-Kalender übernehmen.

**Das Abo (V-0271, Silas' Entscheidung vom 06.10.2026):** Der Hauptweg ist ein Kalender-Abo. Silas
wollte „einen neuen Kalender namens Stundenplan“, und das kann nur ein Abo: Eine Datei fragt am
iPhone bei „Alle hinzufügen“ nach einem vorhandenen Kalender. `aboAdressen()` baut aus der Auswahl
(dasselbe Format wie der Link aus „Stundenplan speichern“) `webcal://…/abo/stundenplan.ics?plan=…&w=…`
und den Google-Link `calendar.google.com/calendar/render?cid=…`. Dahinter steht die einzige Funktion
der Seite, `functions/abo/[datei].js` (Cloudflare Pages Function): Sie liest die öffentlichen Daten
derselben Auslieferung, rechnet mit denselben Modulen wie der Browser und gibt die Datei mit
`X-WR-CALNAME:Stundenplan` und `REFRESH-INTERVAL` 6 Stunden zurück. Sie speichert nichts. Nur `/abo/*`
ruft sie auf (`web/_routes.json`). Ändert sich die Auswahl, braucht es ein neues Abo (die Auswahl
steht in der Adresse); der Dialog sagt das. Die einmalige Datei bleibt als leiser Rückfall
(„Nur einmal als Datei laden“), sie entsteht nur im Browser.

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
- Die Seite ruft beim Öffnen des Kalender-Dialogs `icsHerunterladen(plan, auswahl)` → `{ blob, name,
  termine, text }` und `icsLink(datei)` → `{ href (blob:), download, target, geraet, freigeben }` und setzt
  daraus einen **echten Link** in den Dialog, den der Nutzer selbst antippt (V-0270). Danach zeigt sie
  `ICS_TEXTE[gerät]`: den einen Satz, was jetzt passiert oder was nicht mit einem Klick geht.
- **Der Knopf** „In Kalender übernehmen“ (am Handy „Kalender“) steht neben „Teilen“ (V-0225).
  Seit V-0253 öffnet der Knopf zuerst das Bild des fertigen Plans (`bild.mjs`: `planBildHtml`,
  `planBildLegen`, `kalenderSatz`); „In eigenen Kalender exportieren“ darin ist seit V-0270 der Link
  auf die Datei (vorher ein Knopf, der einen Link per Skript anklickte). „Stundenplan speichern“ zeigt dasselbe Bild.
  `app.js` lädt `ics.mjs` und `bild.mjs` bei der ersten Bedienung (pointerdown, keydown), nicht beim Laden: So
  zählt es nicht ins Budget und nicht zu den Anfragen bis zum Raster, und beim Klick ist das Modul
  meist da, der Export läuft ohne `await` (Safari gibt die Nutzergeste nicht über ein langes await
  weiter). Übergeben wird die wirksame Auswahl (`wirksameAuswahl()`: nur Eingeplantes, keine Vorschläge, V-0237).

**Was ein Klick auf welchem Gerät tut** (Recherche 05.10.2026):

| Gerät | Ein Klick? | Was passiert |
|---|---|---|
| iPhone/iPad, Safari | ja | Kalender-Vorschau mit „Alle hinzufügen“, dann den Kalender wählen. Seit V-0270 über eine `blob:`-Adresse vom Typ `text/calendar` in einem echten Link mit `download` und `target=_self`, den der Nutzer antippt. **Nicht über `data:`:** Seit iOS 26.6 verweigert WebKit `data:text/calendar` still, es passiert nichts (gemessen an Silas' iPhone am 06.10.2026; [add-to-calendar-button #823](https://github.com/add2cal/add-to-calendar-button/issues/823), [#834](https://github.com/add2cal/add-to-calendar-button/issues/834) für das iPad). Bis V-0270 stand hier `data:`, wegen [WebKit 216918](https://bugs.webkit.org/show_bug.cgi?id=216918) (`blob:` mit einem Klick aus dem Skript kam nicht an) |
| iPhone, Chrome, Firefox, Instagram & Co. | nein | geben die Datei nicht an den Kalender; der Satz schickt zum Teilen-Link in Safari |
| Android | halb | Download, dann öffnen; Kalender-Apps wie Samsung Kalender übernehmen sie. Die Google-Kalender-App importiert keine Dateien ([Google: nur am Computer](https://support.google.com/calendar/answer/37118?co=GENIE.Platform%3DAndroid)) |
| Mac | halb | Download, öffnen, Kalender fragt nach dem Ziel ([Apple](https://support.apple.com/guide/calendar/import-or-export-calendars-icl1023/mac)) |
| Windows | halb | Download, mit Outlook öffnen; neues Outlook und Outlook im Web: „Kalender hinzufügen“, „Aus Datei hochladen“ ([Microsoft](https://support.microsoft.com/office/cff1429c-5af6-41ec-a5b4-74f2c278e98c)) |
| Google Kalender im Web | nein | nur Einstellungen, „Importieren & exportieren“ ([Google](https://support.google.com/calendar/answer/37118)) |

Teilen mit `navigator.share` und der Datei geht nicht: Chromium lässt `.ics` und `text/calendar`
nicht teilen (Liste in `chrome/browser/webshare/share_service_impl.cc`).
