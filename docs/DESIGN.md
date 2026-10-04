# Design: der Stundenplanner als One-Pager

> **Stand: 05.10.2026** (V-0218, gebaut in V-0220). Diese Datei ist die geschlossene Menge an
> Entscheidungen, nach der die Seite (`web/`) in Phase 5 des Programms „Stundenplanner, erste
> Fassung“ von Grund auf neu gebaut wurde. Silas' Entscheidungen zu den offenen Fragen stehen in §9,
> was der Bau begründet anders macht, steht an seiner Stelle und gesammelt in §10. Was hier nicht steht, wird nicht erfunden. Wer abweichen will, ändert zuerst diese
> Datei, mit Vorgang und Grund.
> **Was** die Seite kann, steht im [Scope](SCOPE.md) §3. **Welche Daten** sie hat, steht in der
> [Architektur](ARCHITEKTUR.md) §5 und §6 (dort auch die Speicherregeln und der Teilen-Link).
> Diese Datei regelt nur, **wie es aussieht und sich
> bedient**. Grundlage sind Silas' Anforderungen vom 04.10.2026 (§1.1) und die Designprinzipien
> aus seiner Recherche vom selben Tag (20 Regeln mit Werten, dazu die Liste der „AI tells“).

---

## 0. Die Entscheidungen auf einen Blick

1. **Eine Seite, die nicht scrollt.** Die Seite füllt genau das Fenster. Die Wochenansicht nimmt
   die Höhe, die nach Kopf-, Modul-, Werkzeug- und Fußzeile übrig bleibt, und die Zeitachse
   staucht sich hinein (§3).
2. **Oben die Module, darunter die Woche.** Die Bedienlogik des Vorbilds bleibt. Die Module
   schrumpfen von 450 px hohen Karten auf eine **Modulleiste** von 40 px: Modulname, dahinter je
   Bestandteil ein Chip (§3.1).
3. **Jede Gruppe hat eine Kachel im Raster, keine wird versteckt.** Parallele Gruppen liegen in
   **Spuren** nebeneinander. Die Beschriftung passt sich der Spurbreite an, es gibt kein
   „+ N weitere“ (§3.2).
4. **Wählen auf beiden Wegen** (Silas, 05.10.2026, §9). Breite Kacheln tragen am Rechner direkt
   „Einplanen“, „Wechseln“ oder „Lösen“. Sonst öffnet ein Tipp die Gruppenkarte mit Details und
   Überschneidung, und dort wird gewählt. Die Karte gibt es auf jeder Breite, auf dem Handy als
   Blatt von unten (§3.5, §4).
5. **Farbe trägt Bedeutung, sonst nichts.** Grautreppe für alles Gerüst, acht Modulfarben als
   Kategorie, Rot für Überschneidung, Bernstein für Hinweise. Der eine Akzent ist die **Tinte**
   (fast schwarz, im dunklen Schema fast weiß): Er füllt nur die Hauptaktion (§5).
6. **Handy zuerst, aber jede Breite eigens.** Unter 768 px gibt es einen Tag mit Tagesreitern,
   ab 768 px die ganze Woche. Hell und dunkel folgen dem System (§3.3, §5).
7. **Schnell auch auf alten Handys.** Keine Bibliothek, keine Webfont, kein Build. Höchstens
   20 KB Code komprimiert, die Höhe rechnet CSS, nicht JavaScript (§6).

---

## 1. Ausgangslage

### 1.1 Silas' Anforderungen (04.10.2026)

- Eine **statische Seite**, für jede Ansicht perfektioniert: Handy und alle üblichen
  Bildschirmgrößen, sehr responsiv und schnell, nach den Designprinzipien.
- **Die Bedienlogik bleibt:** oben die Module mit ihren Bestandteilen nach Studienordnung
  (Vorlesung, Übung, Tutorium …), darunter die Termine. Gruppen wählen und wechseln, alle noch
  offenen sehen, nach Modulen filtern.
- Heute wird zu viel gescrollt, und der breite Schirm bleibt ungenutzt. Silas: *„Es muss wirklich
  eine statische One-Pager-Seite sein … die Standardansicht, dass man sich den Stundenplan
  zusammenstellt, wirklich auf einer Seite möglich, ohne dass man scrollen muss.“*
- Danach testet Silas die Bedienung selbst.

### 1.2 Die Daten, mit denen das Layout funktionieren muss

Gemessen am 05.10.2026 am öffentlichen MOSES-Stand für WiSe 2026/27, Wirtschaftsinformatik
B.Sc., 1. Fachsemester (dieselben Zahlen im Lesemodell `web/daten/wi-bsc/wise-2026-27-fs1.json`).

| Größe | Wert | Was daraus folgt |
|---|---|---|
| Module | 5, Kurznamen 3–11 Zeichen | passen in eine Zeile, wenn die Bestandteile als Chips daneben stehen |
| Bestandteile | 11, 2–3 je Modul. Typen `VL`, `UE`, `TUT`, `IV` | Typkürzel sind höchstens 3 Zeichen lang und taugen als Beschriftung schmaler Kacheln |
| Gruppen je Bestandteil | 1, 1, 1, 1, 1, 2, 4, 6, 10, 18, 20 (zusammen 65) | Tutorien sind die Masse: 38 der 65 Gruppen |
| Termine je Gruppe | genau ein Wochentermin, immer 2 Stunden | die Kachel ist immer gleich hoch, das Raster braucht keine Sonderfälle |
| Wochentage | Mo–Fr, kein Wochenende | fünf Spalten. Sa/So erscheinen nur, wenn Daten dort liegen |
| Zeitachse | frühester Beginn 08:00, spätestes Ende 20:00 | 12 Stunden |
| Beginnzeiten | 08, 10, 12, 14, 16, 18 Uhr und **einmal 15:30** | das Raster muss echte Zeiten können, nicht nur Zwei-Stunden-Zeilen |
| Gleichzeitig, alles offen | je Tag höchstens 3, 4, 3, 3, **5** parallele Gruppen | dichteste Stelle Fr 14–18 Uhr: 8 Gruppen in 5 Spuren, weil die 15:30-Gruppe zwei Blöcke verkettet. Höchstens 4 beginnen zur selben Zeit |
| Gleichzeitig, ein Bestandteil gefiltert | höchstens 3 Spuren (ein Tutorium) | beim eigentlichen Wählen ist Platz für volle Beschriftung |
| Rhythmus | 64 × „wöchentlich mit Ausnahmen“, 1 × „4 Einzeltermine“, kein 14-Tage-Rhythmus | A/B bleibt die Ausnahme. Abweichender Rhythmus gehört sichtbar auf die Kachel |
| Räume | bis 34 Zeichen, bis 2 Räume je Termin | der Raum steht nur auf breiten Kacheln, sonst in der Karte |
| Gruppennamen | „Termingruppe 12“ oder „1. Termingruppe“ | schmale Kacheln zeigen nur die Zahl |
| Modulhinweise | 0,3–0,9 Tausend Zeichen je Modul | Lesetext, gehört in eine eigene Ebene, nicht auf die Seite |
| Datendatei | 407 KB, komprimiert 28 KB | trägt das Leistungsbudget (§6) |

### 1.3 Was am Vorbild falsch ist, gemessen

Gemessen am 05.10.2026 mit Playwright, Ansicht „Alle Möglichkeiten“, innerhalb der Hülle des
Study OS (deshalb ist die sichtbare Höhe kleiner als das Fenster).

| Fenster | sichtbare Höhe | Seitenhöhe | Bildschirme | das Raster beginnt bei |
|---|---|---|---|---|
| 390 × 844 | 766 px | 6 241 px | **8,1** | 2 608 px. Die Tabelle ist 850 px breit in 288 px: seitlich schieben |
| 1280 × 720 | 642 px | 4 138 px | **6,4** | 955 px, also unter dem Rand |
| 1280 × 800 | 722 px | 4 138 px | 5,7 | 955 px |
| 1440 × 900 | 822 px | 4 062 px | 4,9 | 938 px |
| 1920 × 1080 | 1 002 px | 4 062 px | 4,1 | 938 px. Der Inhalt bleibt 1 280 px breit, 31 % der Breite bleiben leer |

Woran das liegt:

- **Die Module fressen den ersten Bildschirm.** Fünf Karten von 439–457 px Höhe, auf dem Handy
  untereinander 1 718 px. Darin je Bestandteil eine Auswahlliste, die dasselbe zeigt wie das
  Raster darunter.
- **Das Raster ist eine Tabelle mit Zeilen je Beginnzeit, nicht eine Zeitachse.** Eine
  Zwei-Stunden-Zeile ist 425 px hoch (Handy 501 px), weil jede Gruppe eine Karte von 184 px mit
  Knopf und Aufklapper ist. Zwölf Stunden ergeben 2 900 px.
- **Gruppen werden versteckt.** 13 Aufklapper „+ N weitere Möglichkeiten“ verbergen 15 der
  65 Gruppen, dazu hat jede der 65 Karten einen eigenen Aufklapper „N genaue Termine & Quelle“.
- **Hilfstexte, Kopf und Statuszeile** stehen vor dem Inhalt: Überschrift mit Slogan,
  Einleitung, Erklärsatz über dem Raster.
- **Acht Schriftgrößen** (10–40 px) und 165 Bedienelemente kleiner als 24 px (Handy: 50).
- Das Aussehen trägt mehrere der „AI tells“ aus §7: violetter Akzent, farbige Kartenränder,
  Karten in Karten, Versalien-Zeile in Monospace über der Überschrift, nur dunkel.

---

## 2. Die Aufgabe der Standardansicht in einem Satz

**Auf einem Bildschirm, ohne Scrollen, stehen oben alle Bestandteile mit ihrem Stand und darunter
die ganze Woche mit allen noch offenen Gruppen, sodass man je Bestandteil eine Gruppe wählt und
sofort sieht, ob sich etwas überschneidet.**

Alles, was dieser Aufgabe nicht dient (Modulhinweise, genaue Termine, Hilfe, Quelle, Impressum),
liegt eine Ebene tiefer: in einer Karte, einem Blatt oder einer eigenen Seite.

---

## 3. Layout

### 3.1 Fünf Zonen, eine Seite

Die Seite ist ein senkrechter Stapel aus fünf Zonen und füllt genau die Fensterhöhe (`100dvh`,
ersatzweise `100vh`). Die Zonen 1–3 und 5 sind so hoch wie ihr Inhalt, die Zone 4 bekommt den Rest.

| | Zone | Inhalt | Höhe |
|---|---|---|---|
| 1 | **Kopfzeile** | Name „Stundenplanner“, der Plan (Studiengang, Abschluss, Fachsemester, Semester), Datenstand, „Teilen“ | 48 px |
| 2 | **Modulleiste** | je Modul: Farbpunkt und Kurzname (öffnet die Modulkarte), dahinter je Bestandteil ein **Chip** in Studienordnungs-Reihenfolge | 40 px je Zeile. Bricht um, so oft nötig: für WI 1. FS ab 1024 px eine Zeile, ab 768 px zwei |
| 3 | **Werkzeugleiste** | Ansicht, Modulfilter, Zeitraum, A/B. Rechts der Stand: „3 von 11 gewählt“ und die Hinweismarken (Überschneidung, Änderung) | 40 px, unter 1024 px bis zu 2 Zeilen |
| 4 | **Raster** | Tageskopf, Zeitachse, Kacheln | der Rest |
| 5 | **Fußzeile** | „Kein offizielles Angebot der TU Berlin. Verbindlich sind MOSES und die Anmeldungen dort.“ Daneben immer der Speicherhinweis „Deine Auswahl wird nur in diesem Browser gespeichert.“ (ARCHITEKTUR §6) und, sobald es eine Auswahl gibt, „Auswahl zurücksetzen“. Rechts „Hilfe“, „Impressum“, „Datenschutz“ | 24 px ab 1280 px, darunter 40 px (zwei Zeilen), Handy 48 px (drei Zeilen) |

Dazu bei Bedarf, nur solange es gilt, zwischen Zone 3 und 4: die **Teilen-Leiste** (ein geteilter
Plan ist geöffnet, §4.2) mit 44 px. Das Raster wird entsprechend niedriger, die Seite scrollt nicht.

Es gibt **keine Kästen um die Zonen**. Abstand gliedert, nicht Rahmen. Nur das Raster hat Linien,
weil sie Information tragen (Stunden, Tage).

**Der Chip** (Bestandteil in der Modulleiste) ist zugleich Fortschrittsanzeige und Filter:

| Zustand | Aussehen | Klick |
|---|---|---|
| offen | Rand in Modulfarbe, Typkürzel, bei mehr als einer Gruppe die Anzahl („TUT 20“) | filtert das Raster auf diesen Bestandteil |
| gewählt | Fläche in Modulfarbe, Haken | wie oben |
| gefiltert (gedrückt) | Tinte gefüllt, Schrift hell, Haken bleibt sichtbar, wenn gewählt | hebt den Filter auf |
| Überschneidung | wie gewählt, Warnsymbol statt Haken, roter Ring | wie oben |
| geändert seit der Wahl, nicht mehr im Angebot | Hinweissymbol, Bernstein-Ring | wie oben |
| ohne veröffentlichte Termine | gedämpft (38 %), nicht klickbar, Grund im Tooltip und in den Hinweisen | — |

Ab 1600 px Breite zeigt der Chip mehr: gewählt den Termin („UE Di 12:00“), offen die Anzahl als
Wort („TUT 20 Gruppen“). Die Modulleiste wird damit zur Textfassung des Plans.

### 3.2 Das Raster

**Zeitachse.** Eine echte Zeitachse, keine Zeilen je Beginnzeit. Sie reicht vom frühesten Beginn
(abgerundet auf die volle Stunde) bis zum spätesten Ende (aufgerundet) **aller Gruppen des Plans**,
nicht nur der gerade sichtbaren. So springt das Raster nicht, wenn man Ansicht oder Filter
wechselt. Für WI 1. FS: 08–20 Uhr. Die Höhe einer Stunde ergibt sich aus der verfügbaren Höhe
geteilt durch die Stundenzahl. Das rechnet das CSS (gleich hohe Zeilenbruchteile), nicht ein
Skript, das beim Größerziehen misst.

- Stundenlinien in `--grau-4`, Beschriftung links „08“, „09“ … in 12 px `--grau-9`, Ziffern
  gleich breit (`tabular-nums`). Keine Halbstundenlinien.
- Tageskopf: „Mo“ bis „Fr“ (ab 1280 px „Montag“ …), in der Kalenderwoche darunter das Datum.
  Ein Klick auf den Tageskopf zeigt nur diesen Tag (Tagesansicht), „Ganze Woche“ führt zurück.
- **Mindesthöhe:** 20 px je Stunde, auf Touch-Geräten 22 px, gebaut je plus 0,5 px für die Luft
  über der Kachel (20,5 und 22,5 px). Dann ist eine Zwei-Stunden-Kachel mindestens 40 bzw. 44 px
  hoch. Reicht das Fenster dafür nicht (Handy quer, sehr kleine Fenster), darf die Seite scrollen.
  Sie schneidet nie etwas ab.

**Spuren.** Je Tag werden die sichtbaren Kacheln zu Gruppen verketteter Überschneidungen
zusammengefasst. Innerhalb einer solchen Gruppe bekommt jede Kachel die erste freie Spur.
Reihenfolge: gewählte zuerst, dann nach Beginn, dann nach Modulreihenfolge, dann nach Gruppenname.
Die Kacheln einer Gruppe teilen sich die Tagesbreite gleichmäßig. Eine Kachel, die allein liegt,
ist so breit wie der Tag. Zwischen Spuren liegen 2 px. Jede Kachel hat **oben 1 px Luft**, damit
direkt anschließende (10–12, 12–14) getrennt lesbar sind. *Gebaut (V-0220):* nur oben und an jeder
Kachel statt oben und unten an anschließenden, denn mit 2 px Luft wäre die 2-h-Kachel am
kleinsten Handy unter 44 px gefallen.

**Beschriftungsstufen** nach der Breite der Kachel. Die Stufe wählt das CSS über Container-Abfragen
(ohne Unterstützung: Stufe M).

| Stufe | Breite | Inhalt der Kachel |
|---|---|---|
| **L** | ab 112 px | Zeile 1 Modul-Kurzname (14 px, 600). Zeile 2 Typ und Gruppe („TUT, Gruppe 12“). Zeile 3 Raum, ab 72 px Höhe. Weicht der Rhythmus von „wöchentlich“ ab („4 Einzeltermine“, „A-Woche“), ersetzt er den Raum. Beginnt die Kachel nicht zur vollen Stunde, steht die Uhrzeit vor dem Typ |
| **M** | 44–111 px | Zeile 1 Typkürzel (12 px, 600). Zeile 2 Gruppennummer („12“) |
| **S** | 24–43 px | nur das Typkürzel |

Ist ein Bestandteil gefiltert, ist das Modul klar. Dann zeigt Zeile 1 die Gruppe und Zeile 2
den Raum. Den vollen Text trägt jede Kachel als zugänglichen Namen (§4.4) und in der Karte.

Die **Gruppennummer** ist die Zahl im Gruppennamen („Termingruppe 12“ und „1. Termingruppe“
ergeben 12 und 1). Hat der Name keine Zahl, steht der Name, am Ende mit … gekürzt. **Symbole**
(Haken, Warnung, Hinweis, 12 px oben rechts) stehen ab Stufe M. In Stufe S zeigen Fläche, Rand
und Ring den Zustand allein.

**Was die echten Mengen ergeben** (§3.4): Im dichtesten Fall (alles offen, Fr 14–18 Uhr,
5 Spuren) ist jede Kachel ab 1280 px Breite mindestens Stufe M, auf dem Handy ebenfalls (ein Tag,
volle Breite). Auf Tablets (768–1024 px) fällt dieser eine Block auf Stufe S. Sobald man einen
Bestandteil filtert, sind es höchstens 3 Spuren und überall mindestens Stufe M.

**Kachelarten.**

| Art | wann | Aussehen |
|---|---|---|
| **möglich** | eine Gruppe, die man wählen kann | Hauch der Modulfarbe, 1 px Rand in Modulfarbe, Schrift `--grau-10` |
| **gewählt** | die gewählte Gruppe eines Bestandteils | Fläche der Modulfarbe, Schrift in der Tinte desselben Farbtons, Haken oben rechts |
| **Kontext** | gewählte Gruppen außerhalb des aktiven Filters | `--grau-3`, 1 px Rand `--grau-5`, Schrift `--grau-9`, keine Modulfarbe. Sie zeigen, wo die Woche schon belegt ist |
| **Überschneidung** | gewählte Gruppen, die sich an mindestens einem echten Termin überschneiden | wie gewählt (bzw. Kontext), dazu ein roter Ring mit 1 px Luft und das Warnsymbol statt des Hakens |
| **würde sich überschneiden** | mögliche Gruppe, die mit einer gewählten kollidiert | wie möglich, dazu das Warnsymbol |
| **geändert** | gewählt, aber der Fingerabdruck hat sich geändert | wie gewählt, Hinweissymbol |

Symbole in einer Kachel haben die Schriftfarbe der Kachel. Das Rot trägt der Ring außen, weil Rot
auf den dunklen Modulflächen nicht genug Kontrast hätte (§5.5).

Hat eine Gruppe mehrere Wochentermine, erscheint sie mehrfach. Zeigt man auf eine ihrer Kacheln,
bekommen alle ihre Kacheln einen Ring in Tinte, denn gewählt wird immer die ganze Gruppe.

### 3.3 Je Breite

Die Umbrüche richten sich nach dem Inhalt: 768 px (ab hier bekommt im dichtesten Block jede Spur
der Woche mindestens 24 px), 1024 px (ab hier passen Modul- und Werkzeugleiste in je eine Zeile),
1600 px (ab hier haben die Chips Platz für den Termin). Seitenabstand 16 px im Handy-Layout,
sonst 24 px. Über 2 400 px Inhaltsbreite wächst der Inhalt nicht weiter und steht mittig.

**Die Woche nur, wenn sie passt.** Bekäme in einem Fenster ab 768 px eine Spur des dichtesten
Blocks weniger als 24 px (mehr parallele Gruppen als in WI 1. FS), zeigt die Seite dort einen Tag
mit Tagesreitern. Kacheln werden nie schmaler als 24 px. *Gebaut (V-0220):* Nur das Raster wechselt
auf einen Tag, Kopf, Modul- und Werkzeugleiste und Fuß bleiben im Layout ihrer Breite, denn sie
passen dort; eng sind nur die Spuren. Die Grenze rechnet `wochenBreite()` aus der dichtesten
Stelle des Plans, die Seite fragt sie über `matchMedia` ab, ohne `resize`-Hörer.

**Was immer ohne Scrollen sichtbar sein muss:** alle Bestandteile (Chips), der ganze Zeitraum der
Zeitachse, die Kopfzeile mit „Teilen“, die Fußzeile mit dem Hinweis auf das inoffizielle Angebot,
Impressum und Datenschutz. Ab 768 px zusätzlich alle Wochentage und die Werkzeugleiste.

#### Handy, unter 768 px (gebaut für 360–430 px)

```
┌─ 390 × 844 ──────────────────────────────┐
│ Stundenplanner          [Teilen] [Mehr •]│ 48  Kopfzeile
│                                          │
│ [Einf. WI VL] [Einf. WI UE 4]            │
│ [Prog I VL 2] [Prog I UE 10] [TechGI VL] │ 4 Zeilen Chips, je 44
│ [TechGI UE 6] [Statistik I IV]           │ (Modulname im Chip)
│ [Statistik I TUT 18] [BuK VL] [BuK UE] … │
│                                          │
│ [Mo][Di][Mi][Do][Fr]     [Noch offen ▾]  │ 44  Tagesreiter, Ansicht
│ 08 ┌──────────────┐┌───────┐┌───────┐    │
│    │ BuK          ││ TUT   ││ UE    │    │ ein Tag, ganze Breite,
│ 09 │ TUT, Gruppe 3││ 7     ││ 2     │    │ Zeitachse 08–20 komplett
│ 10 └──────────────┘└───────┘└───────┘    │
│ …                                        │
│ 20                                       │
│ Kein offizielles Angebot der TU Berlin.  │ 48  Fußzeile, drei Zeilen
│ Deine Auswahl wird nur in diesem Brow…   │
│ Stand 05.10., 05:20  Impressum  Datens.  │
└──────────────────────────────────────────┘
```

- **Ein Tag, nicht die Woche.** Die Woche in fünf Spalten wäre auf 358 px unlesbar (das Vorbild
  schiebt sie seitlich). Tagesreiter Mo–Fr, je mindestens 44 px breit, voreingestellt der heutige
  Wochentag (am Wochenende Montag). Ist ein Bestandteil gefiltert, zeigt jeder Reiter darunter,
  wie viele seiner Gruppen an diesem Tag liegen. In der Kalenderwoche steht dort das Datum.
- **Chips mit Modulnamen** („BuK TUT“), weil eine eigene Modulspalte auf 358 px zu viele Zeilen
  bräuchte. Reihenfolge und Farbe halten die Module zusammen. Für WI 1. FS sind das bei 360 und
  390 px vier Zeilen, 8 px zwischen Chips einer Zeile, 4 px zwischen den Zeilen.
- **Die Fußzeile hat drei Zeilen:** „Kein offizielles Angebot der TU Berlin.“, der
  Speicherhinweis, dann „Stand 05.10., 05:20“ mit „Impressum“ und „Datenschutz“. Der Datenstand
  steht am Handy hier, nicht in der Kopfzeile. Der zweite Satz („Verbindlich sind MOSES und die
  Anmeldungen dort.“) passt auf 328 px nicht mehr dazu, er steht oben im Blatt „Mehr“ und in der
  Hilfe.
- **„Ansicht“** öffnet ein Blatt mit Ansicht, Modulfilter, Zeitraum und A/B. Die Knopfbeschriftung
  nennt die aktuelle Ansicht, darunter klein, was davon abweicht („BuK, Woche ab 19.10.“).
- **„Mehr“** öffnet ein Blatt mit: Hinweise (Überschneidungen, Änderungen, mit ihren Knöpfen),
  Plan wechseln (nur wenn es mehrere gibt), Datenstand und Quelle, Modul-Infos, „Auswahl
  zurücksetzen“, Hilfe, Impressum, Datenschutz. Gibt es Hinweise, trägt der Knopf eine Zahl
  (rot bei Überschneidung, sonst Bernstein). Sie pulsiert nicht.
- Der **Fortschritt** ist die Chipreihe selbst. Wird der letzte Bestandteil gewählt, meldet das
  eine kurze Meldung („Alle 11 Bestandteile eingeplant. Keine Überschneidung.“).
- Die **Karte** ist ein Blatt von unten (§3.5), mit den Knöpfen im Daumenbereich.

#### Tablet, 768–1023 px (768 × 1024, 865 × 1021, 1024 × 768)

```
┌─ 768 × 1024 ─────────────────────────────────────────────────┐
│ Stundenplanner  Wirtschaftsinformatik B.Sc., 1. FS  [Teilen] │ 48
│ ● Einf. WI [VL][UE 4]  ● Prog I [VL 2][UE 10]  ● TechGI …    │ 2 × 40
│ ● Statistik I [IV][TUT 18]  ● BuK [VL][UE][TUT 20]           │
│ [Alle|Noch offen|Mein Plan] [Modul: alle ▾] [‹ Wochensk. ›]  │ 2 × 40
│                                    3 von 11 gewählt  ⚠ 1     │
│      Mo        Di        Mi        Do        Fr              │ 32
│ 08 ┌────┐   ┌──┬──┬──┐   …                                   │ Raster: ganze Woche,
│    │TUT │   │T │U │T │                                       │ 55 px je Stunde
│ …                                                            │
│ 20                                                           │
│ Kein offizielles Angebot der TU Berlin …  Hilfe Impr. Dat.   │ 40, zwei Zeilen
│ Deine Auswahl wird nur in diesem Browser gespeichert.        │
└──────────────────────────────────────────────────────────────┘
```

- **Die ganze Woche**, wie am Laptop. Die Tagesansicht über den Tageskopf gibt einem Tag die
  volle Breite. Modulleiste und Werkzeugleiste dürfen je zwei Zeilen haben, Höhe ist hier genug.
- Der Datenstand steht ab 768 px in der Kopfzeile (am Handy in der Fußzeile). Wird es dort zu
  eng, kürzt sich der Plan auf Studiengang und Fachsemester, das Semester steht dann in der Karte
  des Datenstands.
- Die Karte ist eine schwebende Karte am Kachelrand (§3.5).

#### Laptop, 1024–1439 px (1280 × 720, 1280 × 800, 1366 × 657)

```
┌─ 1280 × 720 ───────────────────────────────────────────────────────────────────────────┐
│ Stundenplanner  Wirtschaftsinformatik B.Sc., 1. Fachsemester, WiSe 2026/27             │ 48
│                                                   Stand 05.10., 05:20  [Teilen]        │
│ ● Einf. WI [VL][UE 4]   ● Prog I [VL 2][UE 10]   ● TechGI [VL][UE 6]                   │ 40
│   ● Statistik I [IV][TUT 18]   ● BuK [VL][UE][TUT 20]   (in Wirklichkeit eine Zeile)   │
│ [Alle|Noch offen|Mein Plan]  [Modul: alle ▾]  [‹][Wochenskelett ▾][›]                  │ 40
│                                                          0 von 11 gewählt              │
│        Montag        Dienstag      Mittwoch      Donnerstag    Freitag                 │ 32
│ 08  ┌──────────┐   ┌───┬───┬───┐ ┌───┬───┬───┐ ┌───┬───┬───┐ ┌───┬───┬───┐             │
│     │BuK       │   │UE │UE │TUT│ │TUT│TUT│UE │ │TUT│TUT│UE │ │TUT│TUT│TUT│             │ 40 px
│ 10  └──────────┘   … 5 Spuren am Freitagnachmittag, je 47 px breit: Stufe M …          │ je Stunde
│ …                                                                                      │
│ 20                                                                                     │
│ Kein offizielles Angebot …  Deine Auswahl wird nur in …   Hilfe  Impressum  Datenschutz│ 24
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- Alle Zonen je einzeilig. Die Breite gehört dem Raster: **keine Seitenleiste**, denn jede
  Spalte daneben machte die Spuren schmaler, und die sind im dichtesten Fall das Nadelöhr.
- Details erscheinen als Karte an der Kachel, Hinweise als Karte an ihrer Marke in der
  Werkzeugleiste.

#### Desktop, 1440–1599 px (1440 × 900)

Wie Laptop, mit mehr Luft. 54 px je Stunde: Eine Zwei-Stunden-Kachel ist 109 px hoch, und bei
bis zu 2 Spuren je Tag passt Stufe L mit Raum.

#### Breit, ab 1600 px (1920 × 1080, 2560 × 1440)

- Die Chips zeigen den gewählten Termin bzw. die Gruppenzahl als Wort (§3.1).
- 69 px je Stunde bei 1080 px Höhe, Tage 366 px breit: Selbst im dichtesten Fall sind die
  Kacheln 73 px breit (Stufe M), ab 3 Spuren Stufe L mit Raum und Rhythmus.
- Der Platz wird nicht mit Dekoration gefüllt. Mehr Breite heißt breitere Spuren und ausführlichere
  Kacheln.

### 3.4 Höhenbudget und Spurbreiten

Feste Zeilen am Rechner: 12 px Rand oben, Kopfzeile 48, Modulleiste 40, Werkzeugleiste 40,
Tageskopf 32, Fußzeile 24, vier Abstände zu 8 px, 12 px Rand unten, zusammen **240 px**
(ab 860 px Fensterhöhe 16 px Rand, 248 px). Unter 1280 px ist die Fußzeile zweizeilig (+16 px),
unter 1024 px kommen 48 px je zusätzlicher Leistenzeile dazu. Am Handy: Ränder 2 × 8, Kopfzeile
44, Chips 4 × 44 + 3 × 4, Tagesreiter 44, Fußzeile 48, Abstände 8 + 8 + 4 + 8, zusammen
**368 px** bei vier Chipzeilen. *Gebaut (V-0220):* Die Kopfzeile am Handy ist 44 statt 48 px (ihre
Knöpfe sind ohnehin 44 px hoch); sonst wäre bei 360 × 640 mit der Luft über der Kachel die
2-h-Kachel unter 44 px gefallen. Gemessen mit dem Bau: 360 × 640 hat 272 px Raster, 22,7 px je
Stunde; die übrigen Zeilen der Tabelle stimmen auf ±2 px.

| Fenster | Raster­höhe | je Stunde | 2-h-Kachel | Tagesbreite | dichtester Fall (5 Spuren) | gefiltert (3 Spuren) |
|---|---|---|---|---|---|---|
| 360 × 640 | 268 px | 22,3 px | 45 px | 292 px (ein Tag) | 58 px, M | 97 px, M |
| 375 × 667 | 295 px | 24,6 px | 49 px | 307 px | 61 px, M | 102 px, M |
| 390 × 844 | 472 px | 39,3 px | 79 px | 322 px | 64 px, M | 107 px, M |
| 430 × 932 | 560 px | 46,7 px | 93 px | 362 px | 72 px, M | 120 px, L |
| 768 × 1024 | 664 px | 55,3 px | 111 px | 136 px | 27 px, S | 45 px, M |
| 865 × 1021 | 661 px | 55,1 px | 110 px | 155 px | 31 px, S | 52 px, M |
| 1024 × 768 | 464 px | 38,7 px | 77 px | 187 px | 37 px, S | 62 px, M |
| 1280 × 720 | 480 px | 40,0 px | 80 px | 238 px | 47 px, M | 79 px, M |
| 1280 × 800 | 560 px | 46,7 px | 93 px | 238 px | 47 px, M | 79 px, M |
| 1366 × 657 | 417 px | 34,8 px | 70 px | 256 px | 51 px, M | 85 px, M |
| 1440 × 900 | 652 px | 54,3 px | 109 px | 270 px | 54 px, M | 90 px, M |
| 1920 × 1080 | 832 px | 69,3 px | 139 px | 366 px | 73 px, M | 122 px, L |
| 2560 × 1440 | 1 192 px | 99,3 px | 199 px | 472 px | 94 px, M | 157 px, L |

Die Fenstermaße sind die Größe des Anzeigebereichs ohne Browserleisten (1366 × 657 ist ein
1366 × 768-Laptop mit Browser). Spurbreite = Tagesbreite ÷ Spuren, ohne die 2 px Abstand.
Tablets haben je zwei Zeilen Modul- und Werkzeugleiste (768, 865) bzw. zwei Zeilen Modulleiste
(1024).

### 3.5 Schwebende Ebenen

| Ebene | ab 768 px | unter 768 px | Inhalt |
|---|---|---|---|
| **Gruppenkarte** | Karte, 320 px breit, neben der Kachel (rechts, sonst links; ist die Kachel so breit wie das Fenster, darunter oder darüber), nie über ihr, im Fenster gehalten | Blatt von unten, höchstens 70 % der Höhe | §4.2 |
| **Modulkarte** | Karte an der Modulbeschriftung | Blatt | voller Titel, Nummer, Version, Gültigkeit, geprüft am, mehrere gültige Versionen, Links zu MOSES und zur ISIS-Kurssuche, je Bestandteil Typ, Titel, SWS, Pflicht-/Wahlbereich, Links zu VVZ und ISIS, die Hinweise des Moduls (je Abschnitt aufklappbar), Abruffehler |
| **Hinweise** | Karte an der Marke in der Werkzeugleiste | Teil von „Mehr“ | Überschneidungen (Paare, Zahl gemeinsamer Termine, erster Termin), geänderte Gruppen („Änderung geprüft“), nicht mehr angebotene Gruppen („Auswahl lösen“), Bestandteile ohne Termine, Abruffehler, veraltete Daten, „alle eingeplant“ |
| **Datenstand** | Karte am Datenstand | Teil von „Mehr“ | Quelle MOSES (öffentlich), Abrufzeit, Status, Zahl der Module, Bestandteile, Gruppen, Einzeltermine, „Neu laden“ |
| **Ansicht** | — (liegt in der Werkzeugleiste) | Blatt | Ansicht, Modulfilter, Zeitraum, A/B |
| **Hilfe** | Dialog, höchstens 66 Zeichen je Zeile | Blatt | „So funktioniert die Planung“ (§4.3) |
| **Rückfrage** | Dialog | Blatt | „Auswahl zurücksetzen“ und „Übernehmen“ über eine vorhandene Auswahl: sagt, was verloren geht („Deine Auswahl (6 Gruppen) wird gelöscht.“), Hauptaktion mit dem Verb („Zurücksetzen“, „Ersetzen“), daneben „Abbrechen“ |
| **Meldung** | unten mittig über dem Fuß, 3 s, schließt sich selbst oder auf Klick | gleich | „Link kopiert“, „Alle 11 Bestandteile eingeplant“. Sichtbar fängt sie Klicks, damit niemand aus Versehen die Kachel darunter trifft |

Karten und Blätter schließen mit Esc, mit dem Schließknopf und mit einem Klick daneben. Es ist
immer höchstens eine offen. Lesetext darin darf scrollen (Modulhinweise, Terminliste), die Seite
darunter nicht.

---

## 4. Die Bedienung

### 4.1 Der Zustand

| | Werte | voreingestellt | wo |
|---|---|---|---|
| **Ansicht** | Alle, Noch offen, Mein Plan | **Noch offen** | Werkzeugleiste (Segmente), Handy: Blatt „Ansicht“ |
| **Filter** | keiner, ein Modul, ein Bestandteil | keiner | Modul: Auswahlfeld „Modul“. Bestandteil: Chip |
| **Zeitraum** | Wochenskelett, Woche ab … (jede Woche des Semesters) | Wochenskelett | Auswahlfeld mit ‹ › daneben |
| **A/B** | Woche A, Woche B | A | nur im Wochenskelett und nur, wenn ein 14-Tage-Rhythmus erkannt ist |
| **Tag** | Woche, ein Tag | Woche (Handy: heute) | Tageskopf, Handy: Tagesreiter |

Was das Raster zeigt:

- **als mögliche Kachel** jede Gruppe, die zu Filter und Ansicht passt. „Alle“: jede Gruppe.
  „Noch offen“: die Gruppen der Bestandteile ohne Wahl. „Mein Plan“: nur gewählte.
  **Ein gefilterter Bestandteil zeigt immer alle seine Gruppen**, auch wenn er schon gewählt ist.
  So wechselt man eine Gruppe.
- **als gewählte Kachel** jede gewählte Gruppe, in allen drei Ansichten. Das ist neu gegenüber
  dem Vorbild, dessen „Noch offen“ die gewählten Gruppen ausblendete: Wer die nächste Gruppe
  sucht, muss sehen, wo die Woche schon belegt ist.
- **als Kontextkachel** (grau) gewählte Gruppen, die nicht zum Filter passen.

### 4.2 Schritt für Schritt

1. **Ankommen.** Die Seite zeigt sofort ihren Rahmen. Sobald die Daten da sind, stehen alle
   Bestandteile als offene Chips oben und alle 65 Gruppen als mögliche Kacheln in der Woche.
   Solange nichts gewählt ist, steht neben „0 von 11 gewählt“: „Tippe auf eine Gruppe, um sie
   einzuplanen.“ Auf dem Handy sagt das eine Meldung beim ersten Laden.
   Gibt es mehrere Pläne (Studiengang, Fachsemester) und noch keine Wahl, fragt die Seite zuerst
   danach. Gibt es nur einen, ist die Wahl getroffen.
2. **Einen Bestandteil aufschlagen** (wahlweise). Klick auf den Chip „TUT 20“: Das Raster zeigt
   nur noch dessen 20 Gruppen in Farbe, alles Gewählte grau als Kontext. Der Chip ist gedrückt.
   Noch ein Klick, Esc oder ein anderer Chip hebt den Filter auf.
3. **Eine Gruppe ansehen.** Klick auf eine Kachel öffnet die **Gruppenkarte**:

   ```
   ┌ Statistik I, Tutorium ────────────── ✕ ┐
   │ Termingruppe 12                        │
   │ Freitag, 15:30–17:30                   │
   │ wöchentlich mit Ausnahmen              │
   │ Raum …                                 │
   │ ⚠ Überschneidung mit Prog I, Übung:    │
   │   14 gemeinsame Termine, zuerst 16.10. │
   │ [ Einplanen ]        In MOSES ansehen  │
   │ ▸ 15 Termine                           │
   │ Zum Modul                              │
   └────────────────────────────────────────┘
   ```

   Die Hauptaktion heißt „Einplanen“, „Gruppe wechseln“ (der Bestandteil hat schon eine Wahl)
   oder „Auswahl lösen“ (diese Gruppe ist gewählt). Am Rechner (feiner Zeiger, ab 768 px) tragen
   Kacheln ab Stufe L und 76 px Höhe dieselbe Aktion kurz als Knopf: „Einplanen“, „Wechseln“,
   „Lösen“ (Silas, 05.10.2026, §9). Ein Klick daneben öffnet weiter die Karte. Braucht der Knopf
   den Platz (Kachel unter 104 px hoch), entfällt dort die Raumzeile. Die Überschneidung steht **vor** der Wahl in
   der Karte, gerechnet gegen alle echten Termine des Semesters. „15 Termine“ klappt die Liste
   mit Datum, Uhrzeit, Raum und Anmerkung auf. Hat die Gruppe mehrere Wochentermine, nennt die
   Karte alle („Gewählt wird die ganze Gruppe“).
4. **Wählen.** Klick auf die Hauptaktion: Die Karte schließt sich, die Kachel ist gewählt, der
   Chip bekommt seinen Haken, „3 von 11 gewählt“ zählt hoch, und ein Screenreader hört
   „Statistik I, Tutorium: Termingruppe 12 eingeplant.“ Eine neue Wahl ersetzt die alte. In
   „Noch offen“ verschwinden die übrigen Gruppen dieses Bestandteils.
5. **Wechseln.** Chip anklicken (zeigt alle Gruppen dieses Bestandteils), andere Kachel, „Gruppe
   wechseln“. Oder Ansicht „Alle“.
6. **Lösen.** Gewählte Kachel, „Auswahl lösen“.
7. **Überschneidungen prüfen.** Gewählte Kacheln mit Überschneidung tragen den roten Ring, ihre
   Chips auch. Die Marke „⚠ 1 Überschneidung“ in der Werkzeugleiste öffnet die Liste.
8. **Änderungen bestätigen.** Hat sich Zeit oder Raum einer gewählten Gruppe geändert, tragen
   Kachel und Chip das Hinweissymbol, und die Hinweise nennen sie mit dem Knopf „Änderung
   geprüft“. Eine gewählte Gruppe, die es nicht mehr gibt, bleibt mit ihrem gespeicherten Namen
   in den Hinweisen stehen, mit „Auswahl lösen“.
9. **Eine echte Woche ansehen.** Zeitraum „Woche ab 19.10.“ oder ‹ ›: Das Raster zeigt nur die
   Termine dieser Woche, mit den Räumen dieser Woche, Einzeltermine nur in ihrer Woche.
10. **Teilen.** „Teilen“ öffnet auf dem Handy das Teilen-Menü des Systems, sonst kopiert es den
    Link („Link kopiert“). Wer einen geteilten Link öffnet, sieht ihn als **Vorschau neben der
    eigenen Auswahl** (ARCHITEKTUR §6): Die Gruppen des Links sind die gewählten Kacheln, wo die
    eigene Auswahl abweicht, steht sie als graue Kontextkachel daneben. Darüber die
    **Teilen-Leiste**: „Geteilter Plan, 9 von 11 gewählt. 4 Gruppen weichen von deiner Auswahl
    ab (grau).“ Gruppen aus dem Link, die es nicht mehr gibt, nennt sie hier. Knöpfe:
    [Übernehmen] (Hauptaktion) und [Verwerfen]. Solange sie steht, öffnen Kacheln nur ihre
    Karte, und statt „Einplanen“ steht dort „Erst den Plan übernehmen“. Hat das Gerät schon eine
    Auswahl, fragt „Übernehmen“ nach (Rückfrage, §3.5). Überschrieben wird nie ohne Rückfrage.
11. **Zurücksetzen.** „Auswahl zurücksetzen“ neben dem Speicherhinweis (Handy: in „Mehr“)
    löscht nach Rückfrage die ganze Auswahl dieses Plans. Den Speicherhinweis sieht man immer.
    Speichert der Browser nicht (privates Fenster), steht an seiner Stelle in Bernstein: „Dein
    Browser speichert die Auswahl nicht. Nimm den Teilen-Link mit.“
12. **Fertig.** Sind alle Bestandteile gewählt, steht in der Werkzeugleiste „Alle 11 eingeplant“
    mit Haken, die Hinweise sagen dazu „Anmeldung und Kursvorgaben bitte in MOSES und ISIS prüfen“.

### 4.3 Alt → neu: jede Funktion des Vorbilds

| Vorbild | neu |
|---|---|
| Versalienzeile „Wintersemester 2026/27 · 1. Fachsemester“ | Plan in der Kopfzeile (aus `index.json`) |
| Überschrift „Deine Woche. Dein Plan.“ und Einleitung | **entfällt.** Name in der Kopfzeile, die Seite erklärt sich durch ihren Inhalt (§7) |
| „Daten neu laden ↻“ | „Neu laden“ in der Karte des Datenstands |
| Statuszeile: Module, Lehrveranstaltungen, Termingruppen | Karte des Datenstands |
| Statuszeile: „x/y eingeplant“ | Werkzeugleiste „3 von 11 gewählt“, Handy: die Chipreihe |
| Statuszeile: MOSES-Abrufzeit und -status | Kopfzeile „Stand 05.10., 05:20“, bei mehr als 36 h mit Hinweissymbol und „veraltet“. Handy: Fußzeile |
| „Täglich 05:20 · auf dem NAS gespeichert“, „Speichert …“, Testbestand-Hinweis | **entfällt:** Das gab es nur im Study OS. Gespeichert wird im Browser, sofort |
| Fehlerkasten (Laden/Speichern) | Laden: Text im Raster „Die Termine konnten nicht geladen werden.“ mit [Erneut versuchen]. Speichern im Browser misslingt: Text an der Stelle des Speicherhinweises (§4.2, Schritt 11) |
| Modulkarte: Kurzname, Titel, Nummer, Version | Modulleiste (Kurzname, Farbe) und Modulkarte (alles andere) |
| Modulkarte: „Abruf fehlgeschlagen“, „Daten älter als 36 h“ | Hinweissymbol an der Modulbeschriftung, Text in Modulkarte und Hinweisen |
| Modulkarte: „MOSES-Version weicht vom Modul im StudyOS ab“ | **entfällt:** Es gibt kein Study OS als Gegenstück (ARCHITEKTUR §4) |
| Bestandteilzeile: Haken/Kreis, durchgestrichen wenn gewählt | Chip: offen umrandet, gewählt gefüllt mit Haken. Nichts wird durchgestrichen |
| Bestandteilzeile: Klick zeigt diesen Bestandteil im Kalender | Klick auf den Chip filtert auf den Bestandteil. Gewähltes bleibt grau sichtbar |
| Bestandteilzeile: SWS, „Pflichtbereich“ | Modulkarte, Tooltip des Chips |
| Auswahlliste je Bestandteil („Termingruppe 3 · Di 12:00–14:00“, „ohne Termine“ gesperrt) | Chip filtern, Kachel, Karte. Gruppen ohne Termine: Chip gedämpft, in den Hinweisen genannt |
| Links „MOSES ↗“, „ISIS-Kurssuche ↗“ | Modulkarte |
| „Gültigkeit & Hinweise“ (gültig ab/bis, geprüft, Versionen, Hinweistexte, je Bestandteil Titel, SWS, VVZ, ISIS) | Modulkarte |
| Konfliktliste (Paare, gemeinsame Termine, erster Termin) | Marke „⚠ n Überschneidung(en)“, Karte „Hinweise“. Dazu roter Ring an Kachel und Chip, Text in der Gruppenkarte |
| „Termine seit deiner Auswahl geändert“ mit „Änderung geprüft“ | Hinweissymbol an Kachel und Chip, Hinweise mit demselben Knopf |
| „Gespeicherte Auswahl nicht mehr im Angebot“ mit „Auswahl lösen“ | Hinweise mit demselben Knopf, Chip mit Hinweissymbol |
| „Alle 11 Modulbestandteile eingeplant …“ | Werkzeugleiste und Hinweise, einmal als Meldung |
| Überschrift „Wochenbaukasten“, Zeile „Eine Woche · kein zweiwöchiger Rhythmus erkannt“ | **entfällt** als Text. A/B erscheint nur, wenn es ihn gibt, die Kalenderwoche steht im Zeitraum-Feld |
| Auswahl „Ansicht“ (Alle Möglichkeiten, Noch offen, Mein Stundenplan) | Segmente „Alle“, „Noch offen“, „Mein Plan“. Voreinstellung „Noch offen“, gewählte Gruppen bleiben sichtbar (§4.1) |
| Auswahl „Modul“ | Auswahlfeld „Modul“ in der Werkzeugleiste, Handy: Blatt „Ansicht“ |
| Auswahl „Zeitraum“ (Wochenskelett, Woche ab …) | gleiches Auswahlfeld, dazu ‹ › |
| Auswahl „Tag“ (nur in der Kalenderwoche) | Tageskopf anklicken, Handy: Tagesreiter (in jedem Zeitraum) |
| Hilfesatz „Ein Klick auf Einplanen übernimmt die ganze Termingruppe …“ | Gruppenkarte bei Gruppen mit mehreren Terminen, Hilfe |
| Tabelle mit Zeilen je Beginnzeit, 2 Karten je Zelle, „+ N weitere Möglichkeiten“ | Zeitachse mit Spuren, jede Gruppe sichtbar |
| zwei Tabellen untereinander bei A/B | ein Raster, Umschalter A/B |
| Karte: Modul·Typ, Gruppe, Zeit, Raum, Rhythmus, „✓ Eingeplant“, „Überschneidung“ | Kachel (je nach Stufe) und Gruppenkarte (vollständig) |
| Karte: Knopf „Einplanen“, „Gruppe wechseln“, „Auswahl lösen“ | Hauptaktion der Gruppenkarte, gleiche Wörter |
| Karte: „N genaue Termine & Quelle“, Link „MOSES-Termingruppe“ | Gruppenkarte: „15 Termine“ aufklappbar, „In MOSES ansehen“ |
| Hinweis „Noch ohne veröffentlichte Termine: …“ | Chip gedämpft, Hinweise |
| „So funktioniert die Planung“ (drei Absätze) | Hilfe (Fußzeile, Handy: „Mehr“), sinngemäß übernommen, ohne den Satz über das NAS |
| „Für Agenten · Daten und Schnittstellen“ | **entfällt:** Schnittstelle und Speicherweg des Study OS gibt es hier nicht. Die Hilfe nennt stattdessen die Quelle und dass die Datendatei öffentlich neben der Seite liegt |
| — (neu, Scope §3) | Planwahl, Teilen-Link mit Teilen-Leiste, Datenstand mit Warnung, „Kein offizielles Angebot“, Impressum, Datenschutz, auf den Home-Bildschirm legbar |
| — (neu, ARCHITEKTUR §6) | Speicherhinweis und „Auswahl zurücksetzen“ in der Fußzeile, Vorschau eines geteilten Plans mit Vergleich |

Nichts aus dem Vorbild fällt weg, ohne dass die Tabelle den Grund nennt.

### 4.4 Tastatur und Screenreader

- Reihenfolge: Kopfzeile, Modulleiste, Werkzeugleiste, Raster, Fußzeile.
- **Das Raster ist ein Tabulatorhalt.** Darin wandern ↑ ↓ zur vorigen/nächsten Kachel des Tages,
  ← → zur zeitlich nächsten Kachel im Nachbartag, Pos1/Ende zur ersten/letzten Kachel des Tages.
  Enter oder Leertaste öffnet die Karte. In der Karte ist die Hauptaktion zuerst fokussiert.
  Esc schließt sie und setzt den Fokus zurück auf die Kachel.
- Esc ohne offene Karte hebt einen Bestandteil-Filter auf.
- Jede Kachel nennt sich vollständig: „Statistik I, Tutorium, Termingruppe 12, Freitag 15:30 bis
  17:30, Raum …, nicht gewählt, überschneidet sich mit Prog I Übung.“
- Chips und Segmente sind Schalter mit `aria-pressed` bzw. Radiogruppe. Wahl, Lösen und Filter
  werden in einem höflichen Live-Bereich angesagt.
- Bei 200 % Textgröße darf die Seite scrollen, aber nichts überlappt oder wird abgeschnitten.

---

## 5. Tokens

Alle Werte sind Variablen auf `:root`. Die Quelle ist OKLCH (gleiche Helligkeit sieht gleich hell
aus). **Ins CSS kommen die Hex-Werte**, weil OKLCH erst ab iOS 15.4 und Chrome 111 geht und die
Seite auch auf alten Handys laufen muss (ARCHITEKTUR §8). Das Schema folgt
`prefers-color-scheme`. Einen Umschalter gibt es nicht, `color-scheme: light dark` passt die
eingebauten Bedienelemente an. `theme-color` hell `#f7f8fb`, dunkel `#111213`.

### 5.1 Farbe hat Aufgaben

| Farbe | Aufgabe | nie |
|---|---|---|
| Grautreppe | Flächen, Linien, Text, Symbole, Bedienelemente | — |
| **Tinte** (`--grau-10`) | Text. Als Fläche nur für das eine, das gerade gilt: die Hauptaktion einer Karte, den gedrückten Filter-Chip, die Meldung. Fokusring | nicht als Fläche einer Zone, nicht für mehr als eine Aktion je Karte |
| Modulfarben | **Kategorie Modul:** Kacheln, Chips, Farbpunkt vor dem Modulnamen | nicht für Knöpfe, Links, Überschriften, Hintergründe von Zonen |
| Rot (Konflikt) | Überschneidung: Ring, Symbol auf neutraler Fläche, Text in Hinweisen | nicht für Löschen oder Fehler beim Laden |
| Bernstein (Hinweis) | geändert, nicht mehr im Angebot, veraltet, Abruffehler, Speicher fehlt | nicht als Dekoration |

**Warum Tinte statt einer Akzentfarbe:** Die Seite braucht acht Farbtöne für Module und zwei für
Signale. Ein farbiger Akzent wäre der elfte und würde mit einem Modul verwechselt. Die Tinte ist
eindeutig, kontraststark und lässt den Modulen die Farbe. Violett und Indigo als Akzent sind
ohnehin ausgeschlossen (§7).

### 5.2 Grautreppe

Ein Hauch kühl (Ton 260, Chroma 0,004), keine Creme. Zehn Stufen, jede mit einer Aufgabe.

| Token | Aufgabe | hell OKLCH L | hell | dunkel OKLCH L | dunkel |
|---|---|---|---|---|---|
| `--grau-1` | schwebende Flächen: Karte, Blatt, Dialog, gewähltes Segment | 0,995 | `#fdfdff` | 0,285 | `#292a2c` |
| `--grau-2` | Seite | 0,980 | `#f7f8fb` | 0,180 | `#111213` |
| `--grau-3` | Kontextkachel, Segment-Schiene, Fläche der Tagesansicht beim Zeigen | 0,955 | `#eef0f3` | 0,225 | `#1b1c1e` |
| `--grau-4` | Stunden- und Tageslinien | 0,925 | `#e5e6e9` | 0,250 | `#202224` |
| `--grau-5` | Trennlinien, Rand schwebender Flächen | 0,885 | `#d7d9dc` | 0,300 | `#2d2e30` |
| `--grau-6` | Rand von Chips ohne Modul (Segmente, Teilen) | 0,800 | `#bcbec0` | 0,380 | `#414244` |
| `--grau-7` | Rand von Eingabefeldern und Auswahlfeldern (3:1) | 0,600 | `#7f8083` | 0,560 | `#737477` |
| `--grau-8` | Symbole | 0,540 | `#6d6f71` | 0,640 | `#8b8c8f` |
| `--grau-9` | Zweittext: Zeitachse, Zähler, Datenstand, Fußzeile | 0,450 | `#545557` | 0,780 | `#b6b7ba` |
| `--grau-10` | Text, Tinte, Fokusring, Hauptaktion | 0,235 | `#1d1e20` | 0,940 | `#e9ebee` |

Im dunklen Schema heißt höher heller: Karten liegen auf `--grau-1` (heller als die Seite) mit
1 px Rand `rgb(255 255 255 / .08)`, nicht mit Schatten.

### 5.3 Modulfarben

Acht Farbtöne, je vier Rollen. Ein Modul bekommt die Farbe nach seiner Stelle in `modules`
(Reihenfolge des Katalogs): erstes Modul `--m1`, neuntes wieder `--m1`. Die Reihenfolge der Töne
ist so gelegt, dass Nachbarn sich stark unterscheiden. Für fünf Module: Blau, Sand, Grün, Rosé,
Türkis. Rot (um 27) und reines Gelb bleiben den Signalen.

Regel (Chroma wird gesenkt, bis die Farbe in sRGB liegt):

| Rolle | Aufgabe | hell L / C | dunkel L / C |
|---|---|---|---|
| `hauch` | Fläche der möglichen Kachel | 0,965 / ≤ 0,022 | 0,235 / 0,030 |
| `rand` | Rand der möglichen Kachel und des offenen Chips, Farbpunkt | 0,62 / ≤ 0,12 | 0,68 / 0,11 |
| `flaeche` | Fläche der gewählten Kachel und des gewählten Chips | 0,87 / ≤ 0,075 | 0,40 / ≤ 0,075 |
| `tinte` | Schrift und Symbole auf `flaeche` | 0,33 / ≤ 0,08 | 0,96 / ≤ 0,025 |

| | Ton | hell `hauch` | `rand` | `flaeche` | `tinte` | dunkel `hauch` | `rand` | `flaeche` | `tinte` |
|---|---|---|---|---|---|---|---|---|---|
| `--m1` Blau | 250 | `#ebf5ff` | `#488acb` | `#b4d8ff` | `#0e375c` | `#131f2c` | `#619dda` | `#254a6e` | `#e9f3ff` |
| `--m2` Sand | 80 | `#fbf2e3` | `#ac7d1b` | `#eecf9c` | `#483000` | `#261c0d` | `#bc9041` | `#5d420e` | `#fbf0e0` |
| `--m3` Grün | 150 | `#eaf8ec` | `#4a9a5e` | `#b2e3bb` | `#0d401e` | `#142216` | `#63ab74` | `#265331` | `#e7f7e9` |
| `--m4` Rosé | 350 | `#ffeef5` | `#bb6690` | `#fbc1db` | `#53223b` | `#291820` | `#cb7ba2` | `#65364d` | `#ffecf4` |
| `--m5` Türkis | 200 | `#e3f8f9` | `#03999f` | `#98e4e8` | `#003e41` | `#0a2224` | `#20acb3` | `#005356` | `#dff7f8` |
| `--m6` Violett | 300 | `#f5f1ff` | `#9274c3` | `#dbcaff` | `#3c2a58` | `#201b2a` | `#a388d2` | `#4e3e6a` | `#f4efff` |
| `--m7` Orange | 50 | `#fff0e8` | `#bf6e3e` | `#fec7a9` | `#552707` | `#2a1a11` | `#cf8358` | `#683b20` | `#ffeee5` |
| `--m8` Oliv | 115 | `#f3f6e5` | `#848e2d` | `#d2dba2` | `#343900` | `#1e200f` | `#96a04c` | `#474c17` | `#f1f4e1` |

Farbe ist nie das einzige Merkmal: Die Kachel nennt Modul oder Typ als Text (Stufe L/M), der
Chip trägt den Modulnamen (Handy) bzw. steht hinter ihm (ab 768 px), und gewählt/möglich
unterscheidet sich durch gefüllt/umrandet und den Haken. Das trägt auch bei Farbfehlsichtigkeit.

### 5.4 Signalfarben

| Token | Aufgabe | hell | dunkel |
|---|---|---|---|
| `--konflikt` | Ring, Symbol auf neutraler Fläche, Zahl am Knopf „Mehr“ | `#cc2827` (0,55 0,20 27) | `#ef675c` (0,68 0,17 27) |
| `--konflikt-text` | Text „Überschneidung …“ | `#a51f1e` (0,47 0,17 27) | `#f8a59b` (0,80 0,10 27) |
| `--konflikt-flaeche` | Hintergrund einer Konfliktzeile in den Hinweisen | `#ffebe8` (0,955 0,022 27) | `#3b1c19` (0,27 0,05 27) |
| `--hinweis` | Ring, Symbol | `#c17a00` (0,64 0,139 70) | `#e9b452` (0,80 0,13 80) |
| `--hinweis-text` | Text | `#7b4c00` (0,46 0,10 70) | `#e9ca89` (0,85 0,09 85) |
| `--hinweis-flaeche` | Hintergrund einer Hinweiszeile | `#fef0d4` (0,96 0,04 85) | `#31240e` (0,27 0,04 80) |

### 5.5 Kontraste, nachgerechnet

WCAG-2-Kontrast aus den Hex-Werten oben, kleinster Wert über alle acht Modulfarben. Gerechnet am
05.10.2026, nicht gerundet. Ziel für Text 7:1, Pflicht 4,5:1, Nicht-Text 3:1.

| Paar | hell | dunkel | Ziel |
|---|---|---|---|
| Text `--grau-10` auf Seite `--grau-2` | 15,71 | 15,70 | 7 |
| Text auf Karte `--grau-1` | 16,42 | 12,03 | 7 |
| Zweittext `--grau-9` auf Seite | 7,03 | 9,35 | 7 |
| Zweittext auf Karte | 7,35 | 7,16 | 7 |
| Kontextkachel: `--grau-9` auf `--grau-3` | 6,54 | 8,50 | 4,5 |
| Text `--grau-10` auf `hauch` (mögliche Kachel) | 14,94 | 13,84 | 7 |
| `tinte` auf `flaeche` (gewählte Kachel, Haken) | 8,25 | 7,93 | 7 |
| `rand` auf Seite (Kachelrand, Chiprand, Farbpunkt) | 3,26 | 6,16 | 3 |
| `rand` auf Karte | 3,40 | 4,72 | 3 |
| Rand der Eingabefelder `--grau-7` auf Seite | 3,72 | 4,01 | 3 |
| Symbole `--grau-8` auf Seite | 4,75 | 5,58 | 3 |
| Fokusring `--grau-10` auf Seite | 15,71 | 15,70 | 3 |
| Hauptaktion: `--grau-1` auf `--grau-10` | 16,42 | 12,03 | 7 |
| Konfliktring auf Seite | 5,07 | 6,04 | 3 |
| Konflikttext auf Seite | 7,03 | 9,69 | 4,5 |
| Konflikttext auf Konfliktfläche | 6,50 | 7,94 | 4,5 |
| Hinweissymbol auf Seite | 3,27 | 9,93 | 3 |
| Hinweistext auf Hinweisfläche | 6,48 | 9,55 | 4,5 |

Zwei Folgerungen stehen schon in §3.2: Der Konfliktring liegt **außen mit 1 px Luft** in
Seitenfarbe, weil Rot neben der dunklen Modulfläche nur 2,85:1 hätte. Symbole in Kacheln haben
die Schriftfarbe der Kachel. Auf farbigen Flächen steht nie Grau, sondern die `tinte` desselben
Tons. Ändert jemand einen Wert, rechnet er diese Tabelle neu.

### 5.6 Abstände

Einheit 4 px, Rhythmus 8 px. Stufen: **2** (nur zwischen Spuren und Kacheln), **4, 8, 12, 16,
24, 32**. Innerhalb einer Gruppe ist der Abstand kleiner als um sie herum: 4 px zwischen Chips
eines Moduls, 16 px zwischen Modulen (Handy: 8 px zwischen allen Chips, §5.11). 8 px zwischen
den Zonen, Seitenrand 16/24 px (§3.3). Kachelinnenabstand 4 px (Stufen S und M), 8 px (Stufe L). Große Abschnittsabstände (96–160 px)
gelten für Werbeseiten, nicht für dieses Werkzeug.

### 5.7 Schrift

- **Systemschrift**, keine Webfont: `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans",
  "Helvetica Neue", Arial, sans-serif`. Kein Monospace, auch nicht für Zeiten: Ziffern sind
  gleich breit über `font-variant-numeric: tabular-nums`.
- **Eine Skala, drei Größen:** 12 / 14 / 16 px, Zeilenhöhe 16 / 20 / 24 px. Keine Ansicht nutzt
  mehr als diese drei.

| Größe | wofür |
|---|---|
| 12 px | Kacheln (Stufen S/M und Zeilen 2–3 von L), Zeitachse, Datum im Tageskopf, Zähler im Chip, Fußzeile, Datenstand |
| 14 px | Bedienelemente, Chips, Modulnamen, Tageskopf, Werkzeugleiste, Kartentext, Zeile 1 der Stufe-L-Kachel |
| 16 px | Name in der Kopfzeile, Kartentitel, Lesetext in Hilfe und Modulhinweisen. Auf Touch-Geräten alle Auswahl- und Eingabefelder (sonst vergrößert iOS beim Antippen) |

- **Zwei Gewichte:** 400 und 600. Hierarchie zuerst über Gewicht und Farbe, nicht über Größe.
- Laufweite 0 (alle Größen ≤ 16 px). Keine Versalien, auch nicht für Beschriftungen.
- Lesetext höchstens 66 Zeichen je Zeile.

### 5.8 Radien und Tiefe

- **Radien:** 4 px (Kacheln), 8 px (Chips, Knöpfe, Segmente, Auswahlfelder, Meldung), 12 px
  (Karten, Dialog, obere Ecken des Blatts), rund (Farbpunkt, Zahl am Knopf). Verschachtelt gilt:
  innen = außen − Innenabstand (Segment in einer Schiene mit 8 px und 2 px Rand: 6 px).
- **Ringe** (Überschneidung rot, Hinweis Bernstein, Gruppe beim Zeigen Tinte) sind `outline` mit
  1 px Abstand, kein Schatten: Schatten gehören nur den schwebenden Ebenen.
- **Tiefe:** Die Seite ist flach. Schatten haben nur schwebende Ebenen (Karte, Blatt, Dialog,
  Meldung), zweilagig aus einer Lichtquelle: `0 1px 2px rgb(0 0 0 / .06), 0 8px 24px rgb(0 0 0 / .12)`,
  dazu 1 px Rand `--grau-5`. Dunkel: kein Schatten, Höhe über `--grau-1` und den hellen 1-px-Rand.
  Kein Schein, kein Glas, keine Unschärfe.

### 5.9 Zustände

| Zustand | wie | wo |
|---|---|---|
| Zeigen (hover) | Überlage in der Schriftfarbe des Elements, 8 %, nur bei `(hover: hover)`. Auf hellen Flächen ist das die Tinte, auf Tinte das helle Grau | alles Klickbare |
| Drücken (active) | Überlage 10 % | alles Klickbare |
| Fokus (`:focus-visible`) | 2 px Tinte, 2 px Abstand. An Kacheln 4 px Abstand, damit er außerhalb des Konfliktrings liegt. Die fokussierte Kachel liegt oben | alles Fokussierbare |
| gedrückt / gewählt | Chip gefiltert: Tinte gefüllt. Segment gewählt: `--grau-1`, 1 px `--grau-6`, 600. Kachel gewählt: §3.2 | Chips, Segmente, Kacheln |
| gesperrt | Inhalt 38 % Deckkraft, Fläche 12 %, kein Zeiger | Chip ohne Termine, ‹ › am Rand des Semesters |
| lädt | Rahmen und Raster-Gerüst stehen sofort. Erst nach 300 ms ohne Daten erscheint im Raster „Termine werden geladen …“ | Raster |

Die Überlagen liegen auf einem Pseudo-Element, damit nur dessen Deckkraft animiert wird.

### 5.10 Bewegung

| Was | Dauer | Kurve |
|---|---|---|
| Zeigen, Drücken (Überlage) | 100 ms | linear |
| Karte erscheint (Deckkraft, 4 px Weg) | 150 ms | `cubic-bezier(0.2, 0, 0, 1)` |
| Karte verschwindet | 100 ms | `cubic-bezier(0.3, 0, 1, 1)` |
| Blatt fährt ein / aus | 250 ms / 200 ms | dieselben Kurven |
| Meldung | 150 ms ein, 100 ms aus | dieselben Kurven |

- Animiert werden nur `transform` und `opacity`, nie `transition: all`.
- **Keine Bewegung im Raster:** Wahl, Ansicht, Filter, Woche und Tag wechseln sofort. 65 Kacheln
  zu animieren ruckelt auf alten Handys, und ein Wechsel soll sich wie ein Wechsel anfühlen.
- Keine Einblende-Animation beim Laden. Nichts ist unsichtbar, bis eine Animation läuft.
- `prefers-reduced-motion: reduce`: keine Wege, nur Deckkraft in 100 ms.

### 5.11 Ziele

- Jedes Bedienelement mindestens **24 × 24 px**, am Rechner Knöpfe und Chips 32 px hoch. Der
  Knopf direkt auf einer Kachel ist 24 px hoch, damit er in eine 2-h-Kachel ab 76 px passt.
- Auf Touch-Geräten (`pointer: coarse`) mindestens **44 × 44 px**: Chips, Reiter, Segmente,
  Knöpfe, ‹ ›, Schließen. Knöpfe in Blättern 48 px hoch, volle Breite. Mindestens 8 px zwischen
  Zielen. **Links** (Impressum, Datenschutz in der dreizeiligen Fußzeile) sind 24 × 24 px: Die
  Liste oben nennt sie nicht, und eine 44-px-Zeile passte bei 360 × 640 nicht mehr ohne Scrollen
  (V-0220; `ops/sicht.py` misst Links gegen 24 px). Die Tagesreiter am Handy liegen ohne Lücke
  in ihrer Schiene, damit fünf zu 44 px neben „Ansicht“ in 328 px passen.
- Kacheln: mindestens 44 px hoch auf Touch (dafür die 22 px je Stunde), mindestens 24 px breit.
  Unter 44 px Breite liegt eine Kachel nur im dichtesten Fall auf dem Tablet (§3.4). Weil Tippen
  erst die Karte öffnet, kostet ein Fehltipp dort nichts.

### 5.12 Symbole

Ein Satz, eigene Inline-SVG (kein Symbolfont, keine Bibliothek), Raster 24 px, Strich 2 px, runde
Enden, gezeichnet bei 16 px (in Kacheln 12 px). Eine Farbe je Symbol. Genau diese: Haken
(gewählt), Warndreieck (Überschneidung), Kreispfeil (geändert), Ausrufekreis (Hinweis, veraltet),
i-Kreis (Info), Kreuz (schließen), Winkel links/rechts (Woche), Winkel unten (Auswahlfelder und
„Ansicht“, statt des Zeichens ▾; im Bau dazugekommen), Teilen, externer Link (öffnet
MOSES/ISIS/VVZ in neuem Tab). Neben jedem Symbol steht ein Wort, außer an Schließen und ‹ ›,
die einen zugänglichen Namen tragen. Keine Emoji und keine Unicode-Zeichen als Symbole
(✓ ○ ↻ ↗ des Vorbilds werden SVG).

### 5.13 Sprache

- Du, kurz, Verben auf Knöpfen: „Einplanen“, „Gruppe wechseln“, „Auswahl lösen“, „Änderung
  geprüft“, „Übernehmen“, „Teilen“, „Neu laden“.
- Die Wörter der Quelle bleiben: Termingruppe, Bestandteil, Vorlesung, Übung, Tutorium, SWS.
  Typkürzel ausgeschrieben, wo Platz ist (VL Vorlesung, UE Übung, TUT Tutorium, IV Integrierte
  Veranstaltung, unbekannte Kürzel wie geliefert).
- Zeiten „08:00–10:00“, Tage „Mo“ bzw. „Montag“, Daten „19.10.“ bzw. „19.10.2026“.
- Keine Ketten mit Mittelpunkt („A · B · C“), stattdessen Abstand oder Komma. Keine Pfeile als
  Schmuck an Knöpfen und Links. Kein Gedankenstrich in jedem Satz.
- Fehler sagen, was passiert ist und was jetzt geht, ohne Entschuldigung: „Die Termine konnten
  nicht geladen werden.“ [Erneut versuchen].
- Die Seite behauptet nichts, was die Quelle nicht sagt (Scope §5): keine Gruppenbindungen,
  keine Zulassung, keine Anmeldung.

---

## 6. Leistungsbudget

| | Budget | Begründung |
|---|---|---|
| Bibliotheken, Frameworks, Webfonts, CDN | **keine** | ARCHITEKTUR §8 |
| HTML | ≤ 10 KB | Rahmen mit Kopf- und Fußzeile, SVG-Symbole inline |
| CSS | ≤ 15 KB | eine Datei, Tokens §5 |
| JavaScript | ≤ 35 KB, in höchstens 6 Dateien | Vorbild: 15 KB JS, 7 KB CSS, dazu 144 KB gemeinsames CSS des Study OS |
| Code zusammen, komprimiert | **≤ 20 KB** | die Auslieferung (Cloudflare Pages) komprimiert |
| Datendatei des Plans | ≤ 600 KB, komprimiert ≤ 60 KB | heute 407 KB / 28 KB. Wird es mehr, ist das ein Befund fürs Lesemodell |
| Anfragen bis zum fertigen Raster | ≤ 6, alle vom eigenen Ort | HTML, CSS, JS, `index.json`, Plan-Datei |
| Erstes Bild | Rahmen und Raster-Gerüst aus HTML und CSS, ohne JS | kein leerer weißer Schirm |
| Layout-Verschiebung (CLS) | ≤ 0,02 | Zonen und Raster haben ihren Platz, bevor die Daten kommen |
| Größter Inhalt (LCP), Lighthouse Mobil | ≤ 1,5 s | |
| Blockierzeit (TBT) | ≤ 50 ms | Daten einmal einlesen, Spuren einmal je Datenänderung rechnen |
| Wahl bis neues Bild (INP), 4-fach gedrosselte CPU | ≤ 100 ms | |
| DOM-Knoten bei 65 Kacheln | ≤ 1 200 | etwa 10 je Kachel |
| Größe ändern | kein Skript | Höhe aus CSS, Beschriftungsstufe aus Container-Abfragen |
| Inline-Stil und -Skript | keine | Die Seite hat eine Content-Security-Policy (`web/README.md`). Modulfarben kommen über Klassen, die Lage einer Kachel setzt das Skript über `element.style` oder Klassen, nie über ein `style`-Attribut im HTML |

Die Seite lässt sich auf den Home-Bildschirm legen (Scope §3, Punkt 7): Manifest und Symbol
gehören zum Rahmen, nicht zum Budget der Daten.

**Gebaut (V-0220), gemessen mit `ops/sicht.py` (V-0221) am 05.10.2026:** Die Ergebnisse halten das
Budget, die Bytes und Anfragen nicht.

| | Budget | gebaut |
|---|---|---|
| LCP, gedrosselt (390 × 844, CPU 4×, 150 ms, 1,6 Mbit/s) | ≤ 1,5 s | 0,87 s |
| CLS | ≤ 0,02 | 0,002 |
| TBT, gedrosselt | ≤ 50 ms | 0 ms |
| Wahl bis neues Bild, CPU 4× | ≤ 100 ms | 40–80 ms |
| DOM-Knoten bei 65 Kacheln | ≤ 1 200 | 821 |
| HTML | ≤ 10 KB | 7,9 KB |
| CSS | ≤ 15 KB | 25,9 KB |
| JavaScript | ≤ 35 KB in ≤ 6 Dateien | 73,5 KB in 5 Dateien |
| Code zusammen, gzip | ≤ 20 KB | 36,4 KB (Brotli, wie Cloudflare ausliefert: etwa 32 KB) |
| Anfragen bis zur ersten Kachel | ≤ 6 | 9 |

Warum: **Ohne Build-Schritt** bleibt jedes Modul eine eigene Datei und eine eigene Anfrage (HTML,
CSS, fünf Module, `index.json`, Plan = 9). Die Zeile widerspricht sich selbst: „höchstens 6
JS-Dateien“ und „höchstens 6 Anfragen“ gehen nur mit einer einzigen JS-Datei. `modulepreload` im
HTML holt alle Module sofort und parallel zum CSS, es gibt keine Kaskade. **Die Bytes** sind
Kommentare, die das Warum tragen (ohne sie wären es etwa 27 KB gzip), und die Bedienung, die das
Vorbild nicht hatte: Karten, Blätter, Dialoge, Tastatur im Raster, Teilen-Leiste mit Vergleich,
Hinweise, zwei Layouts. Das Vorbild-Budget (15 KB JS, 7 KB CSS) maß eine Seite ohne all das. Was
zählt, ist das Ergebnis auf einem langsamen Handy, und das hält das Budget mit Abstand. Ob die
Byte-Grenzen bleiben (dann braucht es einen Schritt, der beim Ausliefern Kommentare entfernt und
die Module zusammenfasst) oder auf die gebauten Werte steigen, entscheidet Silas (§9, Punkt 4).

Zwei Dinge, die die Blockierzeit gedrückt haben und so bleiben müssen: **kein `Intl`** (ein
`Intl.Collator` und ein `Intl.DateTimeFormat` mit Zeitzone kosteten beim Laden zusammen 90 ms im
längsten Block; `raster.mjs` vergleicht Namen selbst, `text.mjs` rechnet die Berliner Zeit nach
der EU-Regel) und **das Raster in einer eigenen Aufgabe** nach Kopf, Modulen und Werkzeug.

---

## 7. Welche „AI tells“ hier drohen und was wir tun

Gestuft wie in Silas' Recherche, S = verrät es allein, C = Details. Aufgeführt ist nur, was
hier konkret droht, viele davon trägt das Vorbild.

| Stufe | Tell | wo es hier droht | was wir tun |
|---|---|---|---|
| S | violetter/indigo Akzent | das Vorbild ist violett | Akzent ist die Tinte. Violett gibt es nur als sechste Modulfarbe, blass |
| S | Emoji oder Zeichen als Symbole | ✓ ○ ↻ ↗ im Vorbild | ein SVG-Satz (§5.12) |
| S | erfundene Zahlen, Platzhalter | Statuszeile mit Zählern, Beispieldaten | nur echte Zahlen, und nur dort, wo man sie braucht. Testdaten sind erkennbar erfunden |
| A | Werbezeile als Überschrift („Deine Woche. Dein Plan.“), Hilfstext unter jeder Überschrift | Kopf und Erklärsatz im Vorbild | kein Kopfbereich, kein Slogan, keine Erklärsätze auf der Seite. Hilfe liegt in der Hilfe |
| A | farbiger Streifen am Karten- oder Kachelrand | Modulfarbe als Rand oben/links im Vorbild | Modulfarbe als Fläche (gewählt) oder ringsum dünner Rand (möglich), nie als Streifen |
| A | Karten in Karten, jeder Abschnitt im Kasten | Kalenderkasten, Tabelle, Karten darin | keine Kästen um Zonen. Kästen haben nur Kacheln und schwebende Ebenen |
| A | Einblenden beim Scrollen, Anheben beim Zeigen | Kacheln, Chips | keine Bewegung im Raster, Zeigen ist eine 8-%-Überlage (§5.10) |
| A | Floskeln („nahtlos“, „Entdecke …“) | Leerzustände, Hilfe | Wörter der Quelle, Verben auf Knöpfen (§5.13) |
| B | nur dunkel, gedämpfter Zweittext unter 7:1 | Vorbild nur dunkel | beide Schemata, Zweittext 7,03:1 hell, 9,35:1 dunkel |
| B | Versalien-Zeile über Überschriften | „WINTERSEMESTER 2026/27 · 1. FACHSEMESTER“ | keine Versalien |
| B | Monospace für Daten, Terminal-Anmutung | Zeiten, SWS, Nummern im Vorbild | Systemschrift mit gleich breiten Ziffern |
| B | Regenbogen aus Farben, pulsierende Punkte | acht Modulfarben, Hinweismarken | Modulfarben nur auf Kacheln, Chips, Farbpunkt. Gerüst grau. Nichts pulsiert |
| B | die Gegen-Masche: fast schwarz mit einem grellen Akzent, Haarlinien, null Radius | ein dichtes Raster verführt dazu | hell als Grundfall, Radien 4/8/12, Linien nur wo sie Zeit und Tag tragen |
| B | Inhalt hängt an einer Animation | Laden | Rahmen sofort sichtbar, nichts wird eingeblendet |
| C | Mittelpunkt-Ketten, „→“ an Knöpfen | „5 Module · 11 Lehrveranstaltungen“, „MOSES ↗“ | Kommas und Abstand, externes Symbol nur als Signal |
| C | Haarlinie und weicher Schatten an jeder Karte | Kacheln | Schatten nur auf schwebenden Ebenen |
| C | ein großer Radius überall | Kacheln, Karten | Radienskala §5.8 |
| C | `transition: all`, `hover:scale` | Kacheln, Knöpfe | verboten (§5.10) |
| C | `clamp()` an jeder Größe | Überschriften im Vorbild | drei feste Größen, die Höhe des Rasters rechnet sich, nicht die Schrift |
| C | Kommentar über jedem Abschnitt im Quelltext | HTML | Kommentare nur, wo sie ein Warum tragen |
| D | Inter als einzige Schrift | — | Systemschrift |

Die dauerhafte Vorbeugung ist nicht die Liste, sondern §5: eine kleine, geschlossene Menge an
Werten, die überall gleich angewandt wird.

---

## 8. Abnahmekriterien für Phase 5

Gemessen mit einem Browser-Skript (z. B. Playwright, wie in den Sichtprüfungen) und Lighthouse.
Das Ergebnis steht mit Zahlen im Bericht des Vorgangs. **Daten:** der echte öffentliche Stand
WiSe 2026/27, WI 1. FS (65 Gruppen, dichteste Stelle 5 Spuren). **Auswahl:** erfunden, z. B. je
Bestandteil die erste Gruppe, eine Variante mit einer Überschneidung, nie die Auswahl eines
Menschen. **Stressfall:** eine erfundene Datei mit 8 Modulen, 20 Bestandteilen, 6 parallelen
Spuren, Mo–Sa, 07–21 Uhr und A/B-Rhythmus.

**Fenster:** 360 × 640, 375 × 667, 390 × 844, 430 × 932, 768 × 1024, 865 × 1021, 1024 × 768,
1280 × 720, 1280 × 800, 1366 × 657, 1440 × 900, 1920 × 1080, 2560 × 1440. Jedes hell und dunkel.

| # | Kriterium | Messung | Soll |
|---|---|---|---|
| 1 | **Kein Scrollen der Standardansicht** (Noch offen, Wochenskelett, kein Filter), mit leerer, halber und voller Auswahl | `scrollHeight ≤ innerHeight` und `scrollWidth ≤ innerWidth` | in allen Fenstern erfüllt. Kein innerer Bereich außer Karten und Blättern scrollt |
| 2 | dasselbe im Stressfall | wie 1 | erfüllt ab 1280 × 720 und bei 390 × 844. Kleinere Fenster dürfen scrollen, schneiden aber nichts ab |
| 3 | alle Bestandteile sichtbar | jeder Chip liegt vollständig im Fenster | in allen Fenstern |
| 4 | **jede sichtbare Gruppe hat eine Kachel** | Zahl der Kacheln = Zahl der Slots, die Ansicht und Filter zeigen | gleich, kein „+ N weitere“ |
| 5 | ganze Zeitachse sichtbar | erste und letzte Stundenmarke im Fenster | ab 768 px alle Wochentage, darunter der gewählte Tag |
| 6 | Kachelgröße | `getBoundingClientRect` | Breite ≥ 24 px. Höhe einer 2-h-Kachel ≥ 40 px, auf Touch ≥ 44 px. Stufe wie in §3.4 |
| 7 | Ziele | alle Bedienelemente | ≥ 24 × 24 px, bei `pointer: coarse` ≥ 44 × 44 px (Kacheln: Kriterium 6) |
| 8 | Kontraste | die Paare aus §5.5, nachgerechnet aus den CSS-Werten | alle wie in §5.5. Nichts gerundet |
| 9 | Schrift | berechnete `font-size` aller sichtbaren Texte je Ansicht | höchstens 12, 14, 16 px. Gewichte nur 400 und 600 |
| 10 | Tastatur | Durchlauf ohne Maus: Bestandteil filtern, Gruppe wählen, wechseln, lösen, Woche wechseln, teilen | alles erreichbar, Fokus immer sichtbar (≥ 2 px, ≥ 3:1), Esc schließt, Fokus kehrt zurück |
| 11 | Parität | jede Zeile aus §4.3 | jede Funktion an der genannten Stelle |
| 12 | Leistung | Größen der ausgelieferten Dateien, Lighthouse Mobil | Budget §6 eingehalten: Code ≤ 20 KB komprimiert, LCP ≤ 1,5 s, CLS ≤ 0,02, TBT ≤ 50 ms, keine fremde Anfrage |
| 13 | Bewegung | `prefers-reduced-motion` emuliert | keine Wege, nur Deckkraft |
| 14 | Text 200 % | Browser-Zoom auf Text | nichts überlappt oder wird abgeschnitten (Scrollen erlaubt) |
| 15 | AI tells | Liste §7 | keiner vorhanden |
| 16 | ohne Speicher | privates Fenster, `localStorage` wirft | Seite funktioniert, der Text an der Stelle des Speicherhinweises erscheint (§4.2, Schritt 11) |
| 17 | Speicherregeln | Laden ohne Wahl, dann eine Wahl | Laden schreibt nichts in den Speicher. Der Speicherhinweis ist in jedem Fenster ohne Scrollen sichtbar |

Danach testet Silas die Bedienung selbst. Was er ändert, wird hier eingetragen, bevor es gebaut wird.

---

## 9. Was Silas entscheidet

Die Grundentscheidungen, die der Entwurf vorschlug. **Silas hat sie am 05.10.2026 entschieden**,
so ist es gebaut (V-0220):

1. **Keine Markenfarbe.** Der Akzent ist nur die Tinte, Farbe tragen nur die Module, Rot steht für
   Überschneidungen, Bernstein für Hinweise (§5.1).
2. **Startansicht „Noch offen“, und die gewählten Gruppen bleiben darin sichtbar** (§4.1). Das
   Vorbild startete mit „Alle Möglichkeiten“ und blendete in „Noch offen“ das Gewählte aus.
3. **Wählen auf beiden Wegen.** Auf breiten Kacheln am Rechner direkt „Einplanen“ bzw.
   „Wechseln“/„Lösen“ wie im Study OS. Auf schmalen Kacheln und am Handy öffnet Antippen die
   Gruppenkarte (am Handy als Blatt von unten), dort wird gewählt. Die Gruppenkarte gibt es auf
   jeder Breite (§4.2, Schritt 3–4). Gebaut: der Knopf ab Stufe L und 76 px Höhe, nur mit feinem
   Zeiger (Maus, Trackpad) und ab 768 px.

Offen, vorgelegt mit dem Bau:

4. **Das Byte-Budget** (§6). Die Ergebnisse (LCP, CLS, TBT, Wahl bis Bild) hält die Seite mit
   Abstand, die Bytes (CSS 25,9 statt 15 KB, JS 73,5 statt 35 KB, gzip 36,4 statt 20 KB) und die
   Anfragen (9 statt 6) nicht. Entweder steigen die Grenzen auf die gebauten Werte, oder es kommt
   ein Schritt beim Ausliefern dazu, der Kommentare entfernt und die Module zusammenfasst; der
   widerspricht „kein Build“ aus §0.

---

## 10. Was der Bau anders macht als oben, gesammelt

Jede Abweichung steht mit ihrem Grund an ihrer Stelle; hier nur die Liste, damit Silas' Test sie
findet.

- **Luft über jeder Kachel, 1 px, nur oben** (§3.2), statt oben und unten an anschließenden.
- **Mindesthöhe 20,5 und 22,5 px je Stunde** (§3.2), damit die Luft die 2-h-Kachel nicht unter
  40 bzw. 44 px drückt.
- **Kopfzeile am Handy 44 px** (§3.4), Höhenbudget am Handy 368 statt 372 px.
- **Wenn die Woche nicht passt, wechselt nur das Raster** auf einen Tag mit Reitern (§3.3).
- **Gruppenkarte unter oder über der Kachel**, wenn diese so breit wie das Fenster ist (§3.5).
- **Die Meldung schließt sich auch auf Klick** und fängt Klicks, solange sie zu sehen ist (§3.5).
- **Knopf auf der Kachel** am Rechner (§4.2, Silas' Entscheidung 3), 24 px hoch (§5.11).
- **Links 24 × 24 px** auch auf Touch (§5.11), Tagesreiter am Handy ohne Lücke in der Schiene.
- **Winkel unten** als zusätzliches Symbol (§5.12).
- **Eine leise Marke „Hinweise“** (i-Kreis) in der Werkzeugleiste, wenn es nur Informationen gibt
  (Bestandteile ohne Termine, alles eingeplant): So bleibt die Karte „Hinweise“ auch ohne
  Überschneidung und Änderung erreichbar (§3.1, §3.5).
- **Ringe als `outline`**, nicht als Schatten (§5.8).
- **Bytes und Anfragen über dem Budget** (§6, offen in §9, Punkt 4).
