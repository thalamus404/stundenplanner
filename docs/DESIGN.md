# Design: der Stundenplanner als One-Pager

> **⛔ Keine Zugriffe auf Systeme der TU Berlin ohne Silas’ ausdrückliche Genehmigung**
> (Silas, 05.10.2026; [AGENTS.md §2 ⑦](../AGENTS.md#2-die-regeln)). Das gilt für jeden Weg: Abruf-Code, Skript, `curl`,
> Browser-Automatisierung, `WebFetch` eines Agenten, auch für eine einzelne Seite „nur zum Nachsehen“.
> Genehmigt ist allein der tägliche Lauf um 05:20 im Container `stundenplanner-abruf`. Wer mehr braucht,
> fragt Silas **vorher** und nennt **Umfang**, **Maßnahmen gegen Last** und **Grund**. Dasselbe gilt für
> die Vorlesungsverzeichnisse anderer Hochschulen. Der Code sperrt selbst (`abruf/zugang.py`).

> **Stand: 05.10.2026, nach Silas' Test am Handy und seinem Blick auf den Rechner** (V-0218,
> gebaut in V-0220, Bedienung neu in V-0225, Startbildschirm in V-0234, Silas' zweiter Test in V-0237, sein dritter Blick in V-0243). Diese Datei ist die geschlossene Menge an
> Entscheidungen, nach der die Seite (`web/`) gebaut ist. Silas' Entscheidungen stehen in §9, was
> der Bau begründet anders macht, steht an seiner Stelle und gesammelt in §10. Was hier nicht
> steht, wird nicht erfunden. Wer abweichen will, ändert zuerst diese Datei, mit Vorgang und Grund.
> **Was** die Seite kann, steht im [Scope](SCOPE.md) §3. **Welche Daten** sie hat, steht in der
> [Architektur](ARCHITEKTUR.md) §5 und §6 (dort auch die Speicherregeln und der Teilen-Link).
> Diese Datei regelt nur, **wie es aussieht und sich bedient**. Grundlage sind Silas'
> Anforderungen vom 04.10.2026 (§1.1), seine Tests vom 05.10.2026 (§9) und die Designprinzipien
> aus seiner Recherche vom 04.10.2026 (20 Regeln mit Werten, dazu die Liste der „AI tells“).

---

## 0. Die Entscheidungen auf einen Blick

1. **Am Rechner eine Seite, die nicht scrollt; am Handy darf sie scrollen** (Silas' Test,
   05.10.2026, §9). Am Rechner füllt die Seite genau das Fenster, die Woche nimmt die Höhe, die
   übrig bleibt. Am Handy stehen die Zonen untereinander, und das Raster füllt genau einen Schirm
   über dem schwebenden Umschalter (§3).
2. **Eine Bedienung auf jeder Breite.** Ganz oben der **Studiengang-Reiter**. Dann die **Module**
   als einzelne Kacheln, je mit ihren **Formaten** (VL, UE, IV, TUT …) und der Zahl der Gruppen:
   am Rechner als Spalte links neben der Woche, am Handy und Tablet darüber. Ein Tipp auf ein
   Modul zeigt alle seine Gruppen, ein Tipp auf ein Format nur dessen Gruppen, nochmals tippen
   hebt den Filter auf (§3.1, §4).
3. **Jede Gruppe hat eine Kachel im Raster, keine wird versteckt.** Parallele Gruppen liegen in
   **Spuren** nebeneinander. Oben in der Kachel steht das Modul, darunter die Einheit
   ausgeschrieben, Gruppe mit Zeit und Raum, so viel die Größe trägt; kein „+ N weitere“ (§3.2).
4. **Man sieht sofort, was eingeplant ist.** Die Vorgabe beim Öffnen ist immer **„Mein
   Stundenplan“** (V-0237): eingeplante Gruppen kräftig gefüllt, **Vorschläge** (die einzige Gruppe
   eines Formats) gestrichelt, noch nicht eingeplant. Wählbare Gruppen eines aufgeschlagenen Moduls
   sind weiße Kacheln mit Rand in Modulfarbe, die übrigen eines gewählten Formats blass; der Plan
   außerhalb des Filters tritt auf etwa 20 % Deckkraft zurück. Formate unterscheiden sich leicht
   in der Sättigung: Vorlesung voll, Übung 70 %, anderes 50 % (§3.2).
5. **Wählen auf beiden Wegen** (Silas, 05.10.2026, §9). Kacheln tragen am Rechner oben rechts ein
   abgerundetes Plus (Einplanen, Wechseln) bzw. ein Kreuz (Lösen), schmale unten. Sonst öffnet ein
   Tipp die Gruppenkarte, dort wird gewählt; am Handy als Blatt von unten (§3.5, §4).
6. **Tag oder Woche** über einen Umschalter: am Handy schwebend unten mittig, Vorgabe Tag; am
   Rechner in der Werkzeugzeile, Vorgabe Woche. Darunter eine Legende der Formate (§3.3).
7. **Farbe trägt Bedeutung, sonst nichts.** Grautreppe für alles Gerüst, acht Modulfarben als
   Kategorie, Rot für Überschneidung, Bernstein für Hinweise. Der eine Akzent ist die **Tinte**
   (fast schwarz, im dunklen Schema fast weiß), keine Markenfarbe (§5).
8. **Schnell auch auf alten Handys.** Keine Bibliothek, keine Webfont, kein Build. Die Höhe rechnet
   CSS, nicht JavaScript (§6).
9. **Am Anfang der Startbildschirm** (Silas, 05.10.2026, §9; neu in V-0243): Wer noch keinen Plan
   gewählt hat, sieht oben mittig den Schriftzug, darunter eine schlanke Fortschrittslinie und eine
   ruhige Spalte: Hochschule (die Karte in der Farbe der Hochschule), dann Studiengang, dann
   Fachsemester, dann „Stundenplan öffnen“ (§3.6, §4.5).
10. **Kein Zeichen, nur der Schriftzug** (Silas, 05.10.2026, V-0243): „stundenplanner“ in Rubik 600 als
    Pfad (V-0239, Entwurf B; SIL Open Font License 1.1), mittig in der Kopfzeile und im
    Startbildschirm, in Tinte. Die Seite selbst bleibt bei der Systemschrift (§5.7).

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
| Module | 5, Kurznamen 3–11 Zeichen | passen als Name einer Modulkachel in eine Zeile |
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

**Oben steht, für welchen Studiengang geplant wird, daneben bzw. darüber die Module mit ihren
Formaten und ihrem Stand, und die Woche zeigt alle noch offenen Gruppen, sodass man je Format eine
Gruppe wählt und sofort sieht, was eingeplant ist und ob sich etwas überschneidet.** Am Rechner
auf einem Bildschirm ohne Scrollen, am Handy mit dem Raster auf einem Schirm.

Alles, was dieser Aufgabe nicht dient (Modulhinweise, genaue Termine, Hilfe, Quelle, Impressum),
liegt eine Ebene tiefer (Karte, Blatt, eigene Seite) oder am Handy unten am Seitenende.

---

## 3. Layout

### 3.1 Die Zonen

Von oben nach unten: **Kopf** (Studiengang-Reiter, Schriftzug in der Mitte, Stand, „In Kalender
übernehmen“, „Stundenplan speichern“), **Module**, **Werkzeugzeile** (die Lage, Zeitraum, Tag/Woche),
bei Bedarf die **Teilen-Leiste**, das **Raster**, die **Legende** und der **Fuß**. Am Rechner (ab
1024 px) stehen die Module als Spalte von 240 px links neben Werkzeugzeile und Raster (Silas,
05.10.2026), darunter klein die Legende (V-0243; ab sechs Modulen unter dem Raster, sonst reicht die
Höhe nicht), darunter oben über ihnen. Am Rechner füllt die Seite genau die Fensterhöhe (`100dvh`), das Raster
bekommt den Rest. Am Handy scrollt sie (§3.3).

| Zone | Inhalt |
|---|---|
| **Kopf** | Drei Spalten (V-0243): links der **Studiengang-Reiter**, in der Mitte der **Schriftzug** (§0 Punkt 10, 22 px hoch, am Handy 18, unter 390 px 16), rechts die Knöpfe. Unter 1024 px zwei Zeilen: oben Schriftzug und Knöpfe, darunter der Reiter. Der Reiter: der offene Plan, Zeile 1 Studiengang mit ausgeschriebenem Abschluss und einem Winkel unten („Wirtschaftsinformatik, Bachelor of Science“), Zeile 2 Vertiefung (wenn es eine gibt), „1. Fachsemester nach Studienverlaufsplan“ (am Handy ohne „nach Studienverlaufsplan“, damit die Zeile eine Zeile bleibt), Semester und Ordnung („WiSe 2026/27, StuPO 2025“), mit einer Linie in Tinte darunter. Ein Tipp öffnet den Startbildschirm zum Wechseln (V-0234, §3.6); dort stehen alle Pläne, „Weitere folgen“ steht dort statt im Kopf. Der Code nennt keinen Studiengang. Rechts der Datenstand (ab 1440 px, sonst im Fuß), „In Kalender übernehmen“ und **„Stundenplan speichern“** (bis V-0243 „Teilen“; unter 1200 px „Kalender“ und „Speichern“, am Handy nur die Symbole, der Name im `aria-label`) |
| **Hinweise oben** (V-0234) | nur wenn nötig, je eine Zeile über die volle Breite: ein deutliches Schild in Bernstein, wenn die Termine Ersatz aus dem Vorjahr sind („Termine aus dem Vorjahr, Ersatz.“ mit Semester und wofür), und ein ruhiger Satz auf neutraler Fläche mit rotem Warnsymbol, wenn es keine Wahl ohne Überschneidung gibt („Mit den veröffentlichten Terminen gibt es keine Wahl ohne Überschneidung.“, unsicher mit „vermutlich“). „Warum“ öffnet eine Karte mit dem Grund aus dem Lesemodell (Zeiten, Tage), dem Verdacht und fehlenden Modulen. Der Grund steht nicht in der Zeile: Er ist bis 400 Zeichen lang und nähme der Woche am Rechner die Höhe |
| **Module** | je Modul eine **Modulkachel**: Farbkreis und Kurzname (der Knopf filtert auf das Modul), darunter klein die **Formate** in Studienordnungs-Reihenfolge, je mit der Zahl der Gruppen, auch bei einer („VL 1“, „TUT 20“). Der Farbkreis ist ein Ring und füllt sich, wenn das Modul aufgeschlagen ist; einen Rahmen um die Kachel gibt es dafür nicht mehr (V-0237) |
| **Werkzeugzeile** | links die **Lage**: was gezeigt wird und wie man zurückkommt (§4.2), mit „Modul-Infos“ und „Filter aufheben“, sobald gefiltert ist, und den Marken für Überschneidungen und Hinweise. Rechts Zeitraum (‹ „Alle Wochen“ › bzw. „Woche ab …“), A/B, Umschalter Tag/Woche |
| **Raster** | Tagesreiter bzw. Tageskopf, Zeitachse, Kacheln (§3.2) |
| **Legende** | klein und zurückgenommen (12 px, `--fuss-text`): die Formate, die im Plan vorkommen, ausgeschrieben („VL Vorlesung“, „IV Integrierte Veranstaltung“), und die Kachelarten als Muster mit einem Wort, was sie heißen (wählbar, eingeplant, Vorschlag, dein Plan, Format gewählt, Überschneidung; V-0243, vorher „umrandet: wählbar“ usw.). Am Rechner links unter den Modulen, die Kachelarten in zwei Spalten; ab sechs Modulen und unter 1024 px unter dem Raster. Immer dieselben Einträge, damit sie ihre Höhe nicht ändert. Am Handy davor die Modulfarben |
| **Fuß** | aufgeräumt (V-0237): links ein Absatz, klein (12 px) und zurückgenommen (`--fuss-text`, ≥ 4,5:1): „Kein offizielles Angebot der TU Berlin. Verbindlich sind MOSES und die Anmeldungen dort.“ (Hochschule und Quelle aus der Plandatei, V-0234, Punkt 8541d9f5; die Quelle ist ein Link auf ihre Seite, V-0243) Daneben immer der Speicherhinweis (ARCHITEKTUR §6) und, sobald es eine Auswahl gibt, „Auswahl zurücksetzen“. Dann „Hilfe“, „Impressum“, „Datenschutz“ (am Handy davor der Stand) |

Es gibt **keine Kästen um die Zonen**. Abstand gliedert, nicht Rahmen. Kästen haben nur die
Modulkacheln (eine Gruppe von Bedienelementen je Modul), die Kacheln im Raster und schwebende Ebenen.

**Das Format** (die kleine Pille unter dem Modul) ist zugleich Fortschrittsanzeige und Filter. Das
Ziel ist 28 px hoch am Rechner und 44 px auf Touch, sichtbar ist nur die Pille darin (24 bzw. 28 px).

| Zustand | Aussehen | Klick |
|---|---|---|
| offen | Rand in Modulfarbe, „UE 4“ | zeigt nur die Gruppen dieses Formats |
| gewählt | Fläche der Modulfarbe, Haken | wie oben (dort wechselt man) |
| Vorschlag (§3.2, V-0237) | Rand gestrichelt in `tinte`, ohne Haken | wie oben |
| gefiltert (gedrückt) | Tinte gefüllt, Schrift hell; der Farbkreis des Moduls ist gefüllt | hebt den Filter auf (§4.2) |
| Überschneidung | roter Ring, Warnsymbol statt Haken | wie oben |
| geändert, nicht mehr im Angebot | Hinweissymbol, Bernstein-Ring | wie oben |
| ohne veröffentlichte Termine („SE 0“) | gedämpft (38 %), nicht klickbar | — |

### 3.2 Das Raster

**Zeitachse.** Eine echte Zeitachse, keine Zeilen je Beginnzeit. Sie reicht vom frühesten Beginn
(abgerundet auf die volle Stunde) bis zum spätesten Ende (aufgerundet) **aller Gruppen des Plans**,
nicht nur der gerade sichtbaren. So springt das Raster nicht, wenn man Filter oder Ansicht
wechselt. Für WI 1. FS: 08–20 Uhr. Die Höhe einer Stunde ergibt sich aus der verfügbaren Höhe
geteilt durch die Stundenzahl. Das rechnet das CSS (gleich hohe Zeilenbruchteile), nicht ein
Skript, das beim Größerziehen misst.

- Stundenlinien in `--grau-4`, Beschriftung links „08“, „09“ … in 12 px `--grau-9`, Ziffern
  gleich breit (`tabular-nums`). Keine Halbstundenlinien.
- **Woche:** Tageskopf „Mo“ bis „Fr“ (ab 1280 px „Montag“ …), in der Kalenderwoche darunter das
  Datum. Ein Klick auf den Tageskopf zeigt diesen Tag (Tag). **Tag:** Tagesreiter in einer
  Schiene; ist ein Format gefiltert, steht darunter, wie viele seiner Gruppen an dem Tag liegen.
- **Mindesthöhe:** 20 px je Stunde, auf Touch-Geräten 22 px, gebaut je plus 0,5 px für die Luft
  über der Kachel (20,5 und 22,5 px). Reicht das Fenster dafür nicht, darf die Seite scrollen. Sie
  schneidet nie etwas ab.

**Spuren.** Je Tag werden die sichtbaren Kacheln zu Gruppen verketteter Überschneidungen
zusammengefasst. Innerhalb einer solchen Gruppe bekommt jede Kachel die erste freie Spur.
Reihenfolge: gewählte zuerst, dann nach Beginn, dann nach Modulreihenfolge, dann nach Gruppenname.
Die Kacheln einer Gruppe teilen sich die Tagesbreite gleichmäßig. Zwischen Spuren liegen 2 px.
Jede Kachel hat **oben 1 px Luft**, damit direkt anschließende (10–12, 12–14) getrennt lesbar sind.

**Beschriftung** nach der Größe der Kachel (Container-Abfragen; ohne Unterstützung Stufe M). Oben
steht immer das Modul, nie „Termingruppe 3“ (Silas, 05.10.2026):

| Stufe | Breite | Inhalt der Kachel |
|---|---|---|
| **L** | ab 96 px | Zeile 1 das Modul (14 px, 600): der Kurzname, ab 240 px der volle Titel („Einführung in die Wirtschaftsinformatik“). Zeile 2 die Einheit ausgeschrieben („Vorlesung“, „Integrierte Veranstaltung“). Zeile 3 ab 60 px Höhe Gruppe und Zeit („Gruppe 4, 14:00–16:00“, bei der einzigen Gruppe „Einzige Gruppe, …“). Zeile 4 ab 76 px Höhe der Raum; weicht der Rhythmus von „wöchentlich“ ab („4 Einzeltermine“, „A-Woche“), steht er statt des Raums. Zeile 2–4 in 12 px, auf weißen Kacheln `--grau-9` |
| **M** | 44–95 px | Zeile 1 der Kurzname des Moduls (12 px, 600), Zeile 2 Kürzel und Nummer („TUT 12“) |
| **S** | 24–43 px | nur das Kürzel |
| — | unter 24 px | nur Farbe (die Woche am Handy, §3.3) |

Die **Gruppennummer** steht nur, wenn der Name sie als Muster trägt („Termingruppe 12“, „1.
Termingruppe“, „Gruppe 3“); sonst steht der Name. Eine andere Zahl im Namen ist keine
Gruppennummer: „AnaLinA Space im E-N 004, Mo. 8-10 Uhr“ ergab vorher „Gruppe 004“, die Raumnummer
(querwind, V-0228). **Symbole** (Haken, Warnung, Hinweis, 12 px oben rechts) stehen ab Stufe M.

**Kachelarten** (Silas, 05.10.2026: „sofort sehen, welche Kacheln schon eingeplant sind“, weniger
blasse Pastellflächen):

| Art | wann | Aussehen |
|---|---|---|
| **möglich** | eine Gruppe, die man wählen kann | neutral (`--mN-hauch` = `--grau-1`, in beiden Schemata ohne Tönung, V-0236), 1 px Rand in Modulfarbe, Schrift `--grau-10` |
| **gewählt** | die ausdrücklich gewählte Gruppe eines Formats | kräftig gefüllt: Fläche in der `tinte` des Modultons mit Schrift `--grau-1`, in beiden Schemata (hell die dunkelste, dunkel die hellste Fläche); Haken |
| **Vorschlag** (V-0237) | die einzige Gruppe eines Formats, bei `gruppen: alle` alle (§4.1); noch **nicht** eingeplant | Fläche `flaeche`, Schrift und 2 px Rand **gestrichelt** in `tinte`, kein Haken; in Zeile 3 „Einzige Gruppe“ |
| **Kontext** | „Mein Stundenplan“ außerhalb des aktiven Filters (eingeplant und Vorschläge) | dieselbe Kachel, **durchscheinend** (Deckkraft 0,2; Silas: „ganz leichte Deckkraft“, V-0237). Sie zeigen, wo die Woche belegt ist, ohne mit der Wahl verwechselt zu werden |
| **zurückgenommen** | die übrigen Gruppen eines schon gewählten Formats (nur mit Filter zu sehen) | blass: eingelassen `--grau-3`, Rand `--grau-5`, Schrift `--grau-9`, Knopf „Wechseln“ |
| **Überschneidung** | gewählte Gruppen, die sich an mindestens einem echten Termin überschneiden | wie gewählt (bzw. Kontext), dazu ein roter Ring mit 1 px Luft und das Warnsymbol |
| **würde sich überschneiden** | mögliche Gruppe, die mit einer eingeplanten kollidiert | wie möglich, dazu das Warnsymbol |
| **geändert** | gewählt, aber der Fingerabdruck hat sich geändert | wie gewählt, Hinweissymbol |

**Der Knopf auf der Kachel** (am Rechner, feiner Zeiger; Silas' zweiter Test, V-0237): ein
abgerundetes Quadrat (24 px, Radius 8) in der `tinte` des Moduls mit einem Plus aus runden Strichen
(Einplanen, auf blassen Kacheln Wechseln), auf eingeplanten Kacheln hell mit einem Kreuz (Lösen).
`aria-label` „Einplanen: …“, „Wechseln zu: …“, „Auswahl lösen: …“. Ab 96 px Breite oben rechts neben
dem Titel (das Symbol rückt nach unten rechts), auf schmalen Kacheln (32–95 px, mindestens 52 px
hoch: parallele Gruppen quetschen die Spur) unten mittig. Vorher der Text „Einplanen“ ab 160 px.

**Formate nach Sättigung** (Silas' zweiter Test, V-0237): Kategorie `vorlesung` (VL, IV) voll,
`uebung` (UE) 70 %, `sonstige` (TUT und alles andere) 50 %, für Rand und Fläche der Kachel und die
Pille des Formats (`filter: saturate()`, das die Helligkeit hält: die Kontraste aus §5.5 bleiben). Die
Kategorie kommt aus dem Lesemodell (`format.kategorie`, V-0238), fehlt sie, aus dem Kürzel.

**Gerade gewählt:** Die gewählte Kachel setzt sich (Maßstab 0,96 → 1, 200 ms), die übrigen Gruppen
des Formats verblassen von „möglich“ ins Blasse (Deckkraft, 200 ms). Nur `transform` und
`opacity`; bei `prefers-reduced-motion` kein Maßstab, Deckkraft 100 ms (§5.10).

Hat eine Gruppe mehrere Wochentermine, erscheint sie mehrfach. Zeigt man auf eine ihrer Kacheln,
bekommen alle ihre Kacheln einen Ring in Tinte, denn gewählt wird immer die ganze Gruppe.

### 3.3 Je Breite

Umbrüche: 768 px (darunter das Handy-Layout), 1024 px (ab hier die Modulspalte links).
Seitenabstand 16 px am Handy, sonst 24 px. Über 2 400 px Inhaltsbreite wächst der Inhalt nicht
weiter und steht mittig.

**Die Woche nur, wenn sie passt (Vorgabe).** Bekäme ab 768 px eine Spur des dichtesten Blocks
weniger als 24 px, ist die Vorgabe dort der Tag. `wochenBreite()` rechnet die Grenze aus der
dichtesten Stelle des Plans, ab 1024 px samt Modulspalte (240 + 24 px); die Seite fragt sie über
`matchMedia` ab, ohne `resize`-Hörer. Der Umschalter zeigt die Woche trotzdem, wenn man sie will.

#### Handy, unter 768 px (gebaut für 360–430 px; Silas' Test, 05.10.2026)

```
┌─ 390 × 844, die Seite scrollt ───────────┐
│ Stundenplanner       [Kalender] [Teilen] │ 44
│ Wirtschaftsinformatik, Bachelor of Sci…  │ Reiter
│ 1. Fachsemester nach Studienverlaufsplan │
│ ──────────────────────────               │
│ Weitere Studiengänge folgen              │
│                                          │ 24
│ ┌● Einf. WI ─────┐ ┌● Prog I ────────┐   │ Modulkacheln,
│ │[✓VL 1][UE 4]   │ │[VL 2][UE 10]    │   │ 2 Spalten
│ └────────────────┘ └─────────────────┘   │
│ …                                        │
│                                          │ 32
│ Mein Stundenplan                         │ ┐ die Bühne:
│ Wähle ein Modul oder ein Format, …       │ │ genau ein Schirm
│ [Mo][Di][Mi][Do][Fr]                     │ │ über dem
│ 08 ┌──────────────────────────────┐      │ │ Umschalter
│    │ Bilanzierung und Kostenrechn…│      │ │
│    │ Tutorium                     │      │ │
│    │ Gruppe 20, 08:00–10:00       │      │ │
│    │ Charlottenburg, FH 311       │      │ │
│ …                                        │ │
│ 20                                       │ ┘
│          [▯ Tag | ▦ Woche]               │ schwebt, 16 px über dem Rand
│ ‹ [Alle Wochen ▾] ›                      │ darunter, beim Scrollen
│ ● Einf. WI ● Prog I …  VL Vorlesung …    │ Legende
│                                          │ 48
│ Kein offizielles Angebot der TU Berlin … │ Fuß
│ Deine Auswahl wird nur in diesem Brow…   │
│ Stand 05.10., 00:14                      │
│ Hilfe  Impressum  Datenschutz            │
└──────────────────────────────────────────┘
```

- **Die Seite scrollt** (Silas: „viel zu gequetscht“). Nie seitlich.
- **Die Bühne** (Lage, Tagesreiter, Raster) ist mindestens so hoch wie der Schirm über dem
  Umschalter (`100svh` minus dessen Zone), das Raster nimmt darin den Rest. Steht das Raster oben
  im Fenster, passen Raster und Umschalter auf einen Schirm, und nichts liegt unter dem Umschalter.
- **Der Umschalter** schwebt unten mittig, 16 px über dem Rand und der Home-Leiste
  (`env(safe-area-inset-bottom)`): „Tag“ (Symbol: schlichtes Rechteck) und „Woche“ (Rechteck mit
  Schachbrettmuster), je 44 px. Die Seite endet mit so viel Platz, dass er nichts verdeckt.
- **Tag** (Vorgabe): ein Wochentag, Tagesreiter Mo–Fr über die volle Breite, voreingestellt heute
  (am Wochenende Montag). Die Kacheln sind groß genug für Modul, Einheit, Gruppe mit Zeit und Raum.
- **Woche:** die ganze Woche klein. Die Kacheln sind Übersicht, oft schmaler als 24 px, nur Farbe
  bzw. Kürzel. Ein Tipp auf eine Kachel oder einen Tageskopf zeigt diesen Tag groß, statt eine
  Karte an einer 12 px schmalen Kachel zu öffnen.
- **Modulkacheln** in zwei Spalten, Formate 44 px hoch mit 28 px hoher Pille.
- **Fuß** mit 48 px Abstand, Text 14 px: der volle Satz zum inoffiziellen Angebot, der
  Speicherhinweis mit „Auswahl zurücksetzen“, der Stand (öffnet die Karte des Datenstands), dann
  Hilfe, Impressum, Datenschutz, je 44 px hoch.
- Die **Karte** ist ein Blatt von unten (§3.5).

#### Tablet, 768–1023 px

Kopf wie am Rechner, die Modulkacheln darüber in so vielen Spalten, wie 176 px breit passen. Die
Lage nimmt eine eigene Zeile, darunter Zeitraum links und Tag/Woche rechts. Die Woche ganz, wenn sie
passt (WI 1. FS: ja).

#### Rechner, ab 1024 px

```
┌─ 1440 × 900 ─────────────────────────────────────────────────────────────────────────┐
│ Stundenplanner  Wirtschaftsinformatik, B…  Weitere …    Stand …  [In Kalender …][Teilen]│
│                 1. Fachsemester nach …                                                │
│ ┌○ Einf. WI ─────┐ Mein Stundenplan  Wähle ein Modul … [‹][Alle Wochen ▾][›] [▯Tag|▦Woche]│
│ │[✓VL 1][UE 4]   │        Montag      Dienstag      Mittwoch     Donnerstag   Freitag   │
│ └────────────────┘ 08 ┌BuK  [Einplanen]┐┌──┐┌──┐ …                                      │
│ ┌● Prog I ───────┐    │Tutorium        ││UE││TUT│                                       │
│ │[VL 2][UE 10]   │    │Gruppe 20, 08–10││2 ││5 │                                        │
│ └────────────────┘    └────────────────┘└──┘└──┘                                        │
│ …                  …                                                                    │
│                    VL Vorlesung  UE Übung …  umrandet: wählbar  gefüllt: eingeplant …   │
│ Kein offizielles Angebot …   Deine Auswahl wird nur …               Hilfe Impressum Dat.│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Die **Modulkacheln untereinander** in einer Spalte von 240 px (Silas, 05.10.2026: „nicht
  nebeneinander in einer Zeile“), Name und Formate je 28 px hoch: Auch acht Module passen bei
  720 px Höhe. Wird die Spalte höher als das Fenster, scrollt die Seite statt abzuschneiden.
- Vorgabe ist die **Woche**; der Umschalter steht in der Werkzeugzeile, nicht schwebend.
- Ab 1280 px heißen die Tage „Montag“ …; ab 1600 px mehr Breite für die Spuren, keine Dekoration.

### 3.4 Höhen

Am Rechner: Rand 12 px (ab 860 px Höhe 16 px), Kopf 48, Werkzeugzeile 40, Tageskopf 32, Legende
16 bis 36 (eine oder zwei Zeilen) mit 8 px Abstand, Fuß 24 (unter 1280 px zwei Zeilen), Abstände
8 px. Gemessen mit dem Bau (V-0225): 1280 × 720 rund 39 px je Stunde, 1366 × 657 rund 33 px,
1440 × 900 rund 54 px; die Mindesthöhe (20,5 px) hält jedes Fenster ab 1024 × 657.

Am Handy bestimmt die Bühne die Höhe des Rasters: Bei 390 × 844 rund 55 px je Stunde, eine
2-h-Kachel ist 110 px hoch und trägt alle vier Zeilen; bei 360 × 640 rund 37 px je Stunde.

### 3.5 Schwebende Ebenen

| Ebene | ab 768 px | unter 768 px | Inhalt |
|---|---|---|---|
| **Gruppenkarte** | Karte, 320 px breit, neben der Kachel (rechts, sonst links; ist die Kachel so breit wie das Fenster, darunter oder darüber), nie über ihr, im Fenster gehalten | Blatt von unten, höchstens 70 % der Höhe | §4.2 |
| **Modulkarte** | Karte an der Modulkachel („Modul-Infos“ in der Lage, „Zum Modul“ in der Gruppenkarte) | Blatt | voller Titel, Nummer, Version, Gültigkeit, geprüft am, mehrere gültige Versionen, Links zu MOSES und zur ISIS-Kurssuche, je Format Typ, Titel, SWS, Pflicht-/Wahlbereich, Links zu VVZ und ISIS, die Hinweise des Moduls (je Abschnitt aufklappbar), Abruffehler |
| **Hinweise** | Karte an der Marke in der Lage | Blatt | Überschneidungen (Paare, Zahl gemeinsamer Termine, erster Termin), geänderte Gruppen („Änderung geprüft“), nicht mehr angebotene Gruppen („Auswahl lösen“), Formate ohne Termine, Abruffehler, veraltete Daten, „alle eingeplant“ |
| **Datenstand** | Karte am Stand im Kopf | Blatt (Stand im Fuß) | Quelle MOSES (öffentlich), Abrufzeit, Status, Zahl der Module, Formate, Gruppen, Einzeltermine, „Neu laden“ |
| **Hilfe** | Dialog, höchstens 66 Zeichen je Zeile | Blatt | „So funktioniert die Planung“ |
| **Rückfrage** | Dialog | Blatt | „Auswahl zurücksetzen“ und „Übernehmen“ über eine vorhandene Auswahl: sagt, was verloren geht, Hauptaktion mit dem Verb, daneben „Abbrechen“ |
| **Stundenplan speichern** (V-0237, bis V-0243 „Für später speichern“) | Blatt von unten, mittig, höchstens 640 px | Blatt | was der Link enthält, das Feld mit dem Link, „Kopieren“, „Lesezeichen“ (Anleitung je Gerät), „Teilen“ (`navigator.share`, wo es das gibt) |
| **Meldung** | unten mittig, 3 s, schließt sich selbst oder auf Klick | über dem Umschalter | „Link kopiert“, „Alle 11 Formate eingeplant“, was der Kalender-Export am Gerät tut. Sichtbar fängt sie Klicks |

Karten und Blätter schließen mit Esc, mit dem Schließknopf und mit einem Klick daneben. Es ist
immer höchstens eine offen. Lesetext darin darf scrollen, die Seite darunter nicht. Die Blätter
„Ansicht“ und „Mehr“ gibt es seit V-0225 nicht mehr: Was darin stand, steht in der Lage, im Fuß und
unter dem Raster.

### 3.6 Der Startbildschirm (Hello-Screen, V-0234, neu in V-0243)

Silas, 05.10.2026 (§9, Punkt 19) wollte ihn mit fünf Stufen und einer Leiste unten. Nach seinem
dritten Blick (§9, Punkt 24) sieht er so aus: „Das ist wirklich ziemlich hässlich im Vergleich zu der
eigentlichen Seite. […] Das wirklich Einzige, was sein soll, ist: oben zentriert in der Mitte das Logo
[…], und dann kommt einfach nur Hochschule. Und darunter TU Berlin, Technische Universität Berlin. Und
da gerne das Rot benutzen, was die TU Berlin benutzt. […] Sobald man TU ausgewählt hat, soll dann
Studiengang noch kommen und dann Fachsemester.“ Die Stufen, ihre Optionen und Regeln kommen weiter
aus `index.json` (`stufen`, `wahl`, ARCHITEKTUR §5); die Seite kennt keinen Studiengang.

```
┌─ 1536 × 864 ────────────────────────────────────────────────────┐
│ ‹ Zurück zum Plan                                                │ nur mit offenem Plan, leise
│                                                                  │ 14 % der Höhe (56–136 px)
│                        stundenplanner                            │ Schriftzug 34 px (Handy 28 px)
│                         ━━━ ━━━ ───                              │ je Stufe ein Strich, ohne Wörter
│                                                                  │
│              Hochschule                                          │ 13 px 600 Zweittext
│              ┌──────────────────────────────────────┐            │
│              │ TU Berlin                          ✓ │            │ Karte in der Farbe der Hochschule
│              │ Technische Universität Berlin        │            │ (katalog `farbe`), Schrift weiß
│              └──────────────────────────────────────┘            │
│              Studiengang                                         │ 32 px zwischen den Stufen
│              ┌ Wirtschaftsinformatik ─────────────── ┐           │ Optionen der aktuellen Stufe
│              └ B.Sc. ─────────────────────────────── ┘           │
│                                                                  │
│      Kein offizielles Angebot der Hochschulen. Deine Wahl …      │ 12 px, --fuss-text, mittig
│                       Impressum   Datenschutz                    │
└──────────────────────────────────────────────────────────────────┘
```

- **Eine ruhige Spalte von 440 px**, mittig. Oben der Schriftzug, darunter die Fortschrittslinie,
  dann die Stufen von oben nach unten. Am Rechner scrollt die Seite nicht, am Handy darf sie.
- **Nur Stufen, an denen jemand wählt.** Hochschule, Studiengang und Fachsemester kommen immer, auch
  mit einer Option (Regel `waehlen`, ARCHITEKTUR §5). Stufen, die entfallen oder nur eine gültige
  Option haben (Vertiefung, Ordnung), erscheinen nicht; die Seite setzt sie (die Ordnung steht danach
  im Reiter des Plans). Es gibt keinen „Weiter“-, keinen „Zurück“-Knopf und kein „Weitere folgen“.
- **Je Stufe** ein kleiner Titel (13 px 600, Zweittext) und große Karten (`--grau-1`, Rand `--grau-5`,
  Radius 14, mindestens 72 px, am Handy 68 px): Zeile 1 `label` 17 px 600, Zeile 2 `zusatz` 14 px.
  Teilen sich mindestens zwei Optionen einen Zusatz, stehen sie darunter gruppiert.
- **Gewählte Stufen bleiben stehen** als eine Karte mit Haken und Rand in Tinte. Ein Tipp öffnet die
  Stufe wieder mit allen Optionen; wählt man eine andere, fallen die späteren Wahlen weg. Die Stufe, an
  der man gerade ist, zeigt alle Optionen, spätere noch nichts.
- **Die Farbe einer Hochschule** (`farbe` in `katalog/hochschulen/*.json`, TU Berlin `#c50e1f`) füllt
  ihre Karte, die Schrift darauf ist weiß. `katalog.py` lässt nur Farben zu, auf denen Weiß mindestens
  4,5:1 hat (TU-Rot 5,9:1). Kein Logo der Hochschule, keine Nachahmung: nur die Farbe. Die Seite setzt
  sie über das CSSOM (`--h-farbe`), nie als `style`-Attribut.
- **Die Fortschrittslinie** (`data-sicht="fortschritt"`): je Stufe, an der jemand wählt, ein Strich
  28 × 4 px, erledigt Tinte, die aktuelle `--grau-7`, offen `--grau-5`. Keine Wörter (vorher:
  Stufe, Wert, „entfällt“, „automatisch“ unter jedem Balken, eine Leiste, die unten klebte); was sie
  sagt, hört ein Screenreader („Noch 2 Angaben bis zum Stundenplan“).
- **Ist alles gewählt**, folgt „Stundenplan öffnen“ (Tinte, volle Spaltenbreite, 52 px). Erst dieser
  Knopf öffnet den Plan; die Zusammenfassung „Deine Angaben“ entfällt, die Karten sind sie.
- **Fuß:** „Kein offizielles Angebot der Hochschulen. Deine Wahl bleibt in diesem Browser.“,
  Impressum, Datenschutz, mittig, 12 px in `--fuss-text`.
- **Tokens** nur aus §5.2 „Für neue Ansichten“ und die Farbe der Hochschule; im dunklen Schema
  dieselben Regeln.

---

## 4. Die Bedienung

### 4.1 Der Zustand

| | Werte | voreingestellt | wo |
|---|---|---|---|
| **Plan** | je Blatt im Baum `wahl` aus `index.json` (V-0234) | aus dem Teilen-Link, sonst der zuletzt im Startbildschirm geöffnete, sonst der einzige mit gespeicherter Auswahl, sonst der Startbildschirm | Startbildschirm, Reiter im Kopf öffnet ihn |
| **Filter** | keiner, ein Modul, ein Format (Bestandteil) darin | keiner | Modulkachel und Formate, Esc, „Filter aufheben“ |
| **Tag/Woche** | Tag, Woche | Handy Tag, sonst Woche (wenn sie passt, §3.3) | Umschalter, Tagesreiter, Tageskopf |
| **Tag** | Mo–Fr (Sa/So mit Daten) | heute, am Wochenende Montag | Tagesreiter |
| **Zeitraum** | Alle Wochen, Woche ab … (jede Woche des Semesters) | Alle Wochen | Auswahlfeld mit ‹ ›; am Handy unter dem Raster |
| **A/B** | Woche A, Woche B | A | nur bei „Alle Wochen“ und nur, wenn ein 14-Tage-Rhythmus erkannt ist |

Was das Raster zeigt:

- **Ohne Filter „Mein Stundenplan“** (die Vorgabe beim Öffnen, immer, auch nach dem Startbildschirm;
  Silas' zweiter Test, V-0237): jede eingeplante Gruppe und jeder Vorschlag. Offene Formate stehen
  dort nicht; man schlägt sie über Modul oder Format auf. (V-0225 bis V-0234: „Noch offen“, alle
  Gruppen offener Formate.)
- **Ein Modul gefiltert:** alle Gruppen aller seiner Formate, auch der schon gewählten (dort
  zurückgenommen, blass): So wählt und wechselt man. „Mein Stundenplan“ außerhalb als Kontext,
  durchscheinend.
- **Ein Format gefiltert:** nur seine Gruppen, die gewählte kräftig, die übrigen blass.
  „Mein Stundenplan“ anderswo als Kontext, durchscheinend.

**Vorschläge** (Silas' zweiter Test, V-0237; ersetzt „automatisch eingeplant“ aus V-0225): Ein
Format mit genau einer Gruppe, die Termine hat, schlägt sie vor (gestrichelt, §3.2), bei `gruppen:
alle` alle seine Gruppen. Ein Vorschlag ist **nicht eingeplant**: Er zählt nicht im Fortschritt, nicht
in den Überschneidungen und nicht im Kalender-Export, bis man ihn mit „Einplanen“ bestätigt. Er wird
**berechnet, nie gespeichert** (Laden schreibt nichts, ARCHITEKTUR §6). „Auswahl lösen“ einer
eingeplanten einzigen Gruppe macht sie wieder zum Vorschlag; ein `group: null` aus V-0225 gilt wie
kein Eintrag. Bekommt das Format später eine zweite Gruppe, ist es offen. In WI 1. FS sind es fünf:
Einf. WI VL, TechGI VL, Statistik I IV, BuK VL, BuK UE.

**Der Fortschritt** („3 von 11 Formaten gewählt“) zählt nur Formate mit Terminen in diesem
Semester; eines ohne Gruppe ist „noch ohne veröffentlichte Termine“ (Hinweise) und hält „alle
eingeplant“ nicht auf (querwind, V-0228).

**Wie die Gruppen zu belegen sind** (`gruppen` am Bestandteil, V-0233; gebaut in V-0234):
- `alle`: keine Wahl einer Gruppe. Alle Gruppen mit Terminen sind ein Vorschlag (V-0237);
  „Alle einplanen“ plant das Format als Ganzes ein (gespeichert wird eine seiner Gruppen), dann
  zählen alle im Fortschritt und im Kalender. Die Gruppenkarte sagt es mit dem Grund.
- `unklar`: wie „eine“, dazu ein leiser Hinweis (Gruppenkarte, Tooltip des Formats, Hinweise).
- `keine` (offenes Angebot, etwa die Lerninsel): zählt nicht im Fortschritt, wird nie vorgeschlagen
  und steht nicht in „Mein Stundenplan“, nur wenn man Modul oder Format aufschlägt. Das Format
  ist neutral umrandet statt in Modulfarbe.

### 4.2 Schritt für Schritt

1. **Ankommen.** Die Seite zeigt sofort ihren Rahmen und die Lage „Mein Stundenplan. Wähle ein Modul
   oder ein Format, dann zeigt der Plan dessen Gruppen.“ (der Satz steht schon im HTML). Mit den
   Daten erscheinen die Module mit ihren Formaten, das Eingeplante und gestrichelt die Vorschläge
   (V-0237). Wer noch keinen Plan gewählt hat, sieht statt dessen den Startbildschirm
   (§3.6, §4.5); gedrosselt (CPU 4×, 1,6 Mbit/s) steht der Rahmen dafür höchstens 0,3 s.
2. **Ein Modul aufschlagen.** Tipp auf den Namen „TechGI“: Der Farbkreis füllt sich, der übrige
   Plan wird durchscheinend,
   die Lage sagt „Technische Grundlagen der Informatik“ (am Rechner der Kurzname), „Alle Formate,
   7 Gruppen, 1 von 2 gewählt“, daneben „Modul-Infos“ und „Filter aufheben“.
3. **Ein Format aufschlagen.** Tipp auf „UE 6“: nur dessen sechs Gruppen, die Pille ist mit Tinte
   gefüllt, die Lage sagt „TechGI, Übung“, „6 Gruppen, noch keine gewählt“. Nochmals tippen hebt
   auf, was man zuletzt gesetzt hat: Kam man über das Modul, steht wieder das Modul, sonst kein
   Filter. Ein Tipp auf den Modulnamen, „Filter aufheben“ oder Esc (eine Stufe) führen zurück.
4. **Eine Gruppe ansehen.** Tipp auf eine Kachel öffnet die **Gruppenkarte**: Modul und Einheit
   als Titel, Gruppe, Termine je Wochentag, Rhythmus, Raum, Überschneidung mit der Auswahl
   (gerechnet gegen alle echten Termine des Semesters), Hauptaktion „Einplanen“, „Gruppe wechseln“
   oder „Auswahl lösen“, „In MOSES ansehen“, die Termine aufklappbar, „Zum Modul“. Bei einem
   Vorschlag sagt die Karte das, Hauptaktion „Einplanen“ (bei `alle`: „Alle einplanen“). Am Rechner
   tragen Kacheln dieselbe Aktion als Plus bzw. Kreuz (§3.2).
5. **Wählen.** Die Karte schließt sich, die Kachel ist gefüllt, die übrigen Gruppen des Formats
   verblassen ins Blasse, die Pille bekommt ihren Haken, der Fortschritt zählt hoch, ein
   Screenreader hört „TechGI, Übung: Termingruppe 6 eingeplant.“ Sind alle Formate eingeplant,
   sagt es eine Meldung.
6. **Wechseln** über eine blasse Kachel (Plus), **lösen** über die gewählte (Kreuz).
7. **Überschneidungen** tragen den roten Ring an Kachel und Pille; die Marke in der Lage öffnet die
   Liste. **Änderungen** (Zeit oder Raum einer gewählten Gruppe) tragen das Hinweissymbol und
   „Änderung geprüft“ in den Hinweisen.
8. **Eine echte Woche ansehen.** Zeitraum „Woche ab 19.10.“ oder ‹ ›.
9. **Tag oder Woche.** Der Umschalter; am Handy zeigt ein Tipp in der kleinen Woche den Tag groß.
10. **In den Kalender.** „In Kalender übernehmen“ erzeugt im Browser eine iCal-Datei der wirksamen
    Auswahl (nur Eingeplantes, keine Vorschläge, V-0237) und stößt sie an (`web/ics.mjs`, V-0231). Eine Meldung sagt
    in einem Satz, was am Gerät jetzt passiert. Ohne Wahl sagt sie, was fehlt.
11. **Stundenplan speichern** (V-0224 als „Teilen“, Fläche seit V-0237, Name seit V-0243): Der Knopf ist
    nie gesperrt; ohne Eingeplantes sagt eine Meldung, was fehlt. Sonst schiebt sich von unten die
    Fläche **„Stundenplan speichern“** herein
    (auf jeder Breite ein Blatt, am Rechner mittig, höchstens 640 px; bei reduzierter Bewegung nur
    Deckkraft): ein Satz, was der Link enthält, das Feld mit dem Link, „Kopieren“ (Hauptaktion),
    „Lesezeichen“ und, wo es das Teilen-Menü des Systems gibt (`navigator.share`), „Teilen“ (am
    iPhone mit allen Apps). Ein Lesezeichen kann keine Seite selbst setzen: Solange die Fläche offen
    ist, steht der Link in der Adresse, und „Lesezeichen“ sagt je Gerät, wie es geht (Cmd + D, Strg +
    D, Safari: Teilen, „Lesezeichen hinzufügen“). Geschlossen steht wieder `#plan=<id>` da. Ein
    geöffneter Link ist eine **Vorschau neben der eigenen Auswahl** mit der Teilen-Leiste
    („Übernehmen“, „Verwerfen“); überschrieben wird nie ohne Rückfrage. Vorschläge stehen nicht im
    Link, nur Eingeplantes.
12. **Zurücksetzen.** „Auswahl zurücksetzen“ im Fuß löscht nach Rückfrage die Auswahl dieses Plans.
    Speichert der Browser nicht, steht an der Stelle des Speicherhinweises in Bernstein: „Dein
    Browser speichert die Auswahl nicht. Sichere sie mit „Stundenplan speichern“.“

### 4.3 Alt → neu: jede Funktion des Vorbilds

| Vorbild | neu |
|---|---|
| Versalienzeile „Wintersemester 2026/27 · 1. Fachsemester“ | Studiengang-Reiter im Kopf (aus `index.json`) |
| Überschrift „Deine Woche. Dein Plan.“ und Einleitung | **entfällt.** Name in der Kopfzeile, die Seite erklärt sich durch ihren Inhalt (§7) |
| „Daten neu laden ↻“ | „Neu laden“ in der Karte des Datenstands |
| Statuszeile: Module, Lehrveranstaltungen, Termingruppen | Karte des Datenstands |
| Statuszeile: „x/y eingeplant“ | die Lage „3 von 11 Formaten gewählt“ und die Formate unter den Modulen |
| Statuszeile: MOSES-Abrufzeit und -status | Kopf „Stand 05.10., 05:20“, bei mehr als 36 h mit Hinweissymbol und „veraltet“. Handy: Fuß |
| „Täglich 05:20 · auf dem NAS gespeichert“, „Speichert …“, Testbestand-Hinweis | **entfällt:** Das gab es nur im Study OS. Gespeichert wird im Browser, sofort |
| Fehlerkasten (Laden/Speichern) | Laden: Text im Raster „Die Termine konnten nicht geladen werden.“ mit [Erneut versuchen]. Speichern im Browser misslingt: Text an der Stelle des Speicherhinweises (§4.2, Schritt 12) |
| Modulkarte: Kurzname, Titel, Nummer, Version | Modulkachel (Kurzname, Farbe), Lage (Titel) und Modulkarte (alles andere) |
| Modulkarte: „Abruf fehlgeschlagen“, „Daten älter als 36 h“ | Hinweissymbol am Modulnamen, Text in Modulkarte und Hinweisen |
| Modulkarte: „MOSES-Version weicht vom Modul im StudyOS ab“ | **entfällt:** Es gibt kein Study OS als Gegenstück (ARCHITEKTUR §4) |
| Bestandteilzeile: Haken/Kreis, durchgestrichen wenn gewählt | Format unter dem Modul: offen umrandet, gewählt gefüllt mit Haken, Vorschlag gestrichelt. Nichts wird durchgestrichen |
| Bestandteilzeile: Klick zeigt diesen Bestandteil im Kalender | Klick auf das Format filtert darauf, Klick auf das Modul auf alle seine Formate. Eingeplantes anderswo bleibt grau sichtbar |
| Bestandteilzeile: SWS, „Pflichtbereich“ | Modulkarte, Tooltip des Formats |
| Auswahlliste je Bestandteil („Termingruppe 3 · Di 12:00–14:00“, „ohne Termine“ gesperrt) | Format filtern, Kachel, Karte. Ohne Termine: Format gedämpft („SE 0“), in den Hinweisen genannt. Nur eine Gruppe: ein Vorschlag (§4.1, V-0237) |
| Links „MOSES ↗“, „ISIS-Kurssuche ↗“ | Modulkarte |
| „Gültigkeit & Hinweise“ (gültig ab/bis, geprüft, Versionen, Hinweistexte, je Bestandteil Titel, SWS, VVZ, ISIS) | Modulkarte |
| Konfliktliste (Paare, gemeinsame Termine, erster Termin) | Marke „n Überschneidung(en)“ in der Lage, Karte „Hinweise“. Dazu roter Ring an Kachel und Format, Text in der Gruppenkarte |
| „Termine seit deiner Auswahl geändert“ mit „Änderung geprüft“ | Hinweissymbol an Kachel und Format, Hinweise mit demselben Knopf |
| „Gespeicherte Auswahl nicht mehr im Angebot“ mit „Auswahl lösen“ | Hinweise mit demselben Knopf, Format mit Hinweissymbol |
| „Alle 11 Modulbestandteile eingeplant …“ | Lage und Hinweise, einmal als Meldung |
| Überschrift „Wochenbaukasten“, Zeile „Eine Woche · kein zweiwöchiger Rhythmus erkannt“ | **entfällt** als Text. A/B erscheint nur, wenn es ihn gibt, die Kalenderwoche steht im Zeitraum-Feld |
| Auswahl „Ansicht“ (Alle Möglichkeiten, Noch offen, Mein Stundenplan) | **„Mein Stundenplan“ ist die Ansicht ohne Filter** und die Vorgabe beim Öffnen (Silas' zweiter Test, V-0237; von V-0225 bis V-0234 war es „Noch offen“). „Alle Möglichkeiten“ eines Moduls zeigt der Tipp auf das Modul, der übrige Plan bleibt durchscheinend dahinter |
| Auswahl „Modul“ | die Modulkacheln |
| Auswahl „Zeitraum“ (Wochenskelett, Woche ab …) | Auswahlfeld „Alle Wochen“, „Woche ab …“, dazu ‹ › |
| Auswahl „Tag“ (nur in der Kalenderwoche) | Umschalter Tag/Woche, Tagesreiter, Tageskopf (in jedem Zeitraum) |
| Hilfesatz „Ein Klick auf Einplanen übernimmt die ganze Termingruppe …“ | Gruppenkarte bei Gruppen mit mehreren Terminen, Hilfe |
| Tabelle mit Zeilen je Beginnzeit, 2 Karten je Zelle, „+ N weitere Möglichkeiten“ | Zeitachse mit Spuren, jede Gruppe sichtbar |
| zwei Tabellen untereinander bei A/B | ein Raster, Umschalter A/B |
| Karte: Modul·Typ, Gruppe, Zeit, Raum, Rhythmus, „✓ Eingeplant“, „Überschneidung“ | Kachel (je nach Stufe) und Gruppenkarte (vollständig) |
| Karte: Knopf „Einplanen“, „Gruppe wechseln“, „Auswahl lösen“ | Hauptaktion der Gruppenkarte, gleiche Wörter |
| Karte: „N genaue Termine & Quelle“, Link „MOSES-Termingruppe“ | Gruppenkarte: „15 Termine“ aufklappbar, „In MOSES ansehen“ |
| Hinweis „Noch ohne veröffentlichte Termine: …“ | Format gedämpft, Hinweise |
| „So funktioniert die Planung“ (drei Absätze) | Hilfe im Fuß, sinngemäß übernommen, ohne den Satz über das NAS |
| „Für Agenten · Daten und Schnittstellen“ | **entfällt:** Schnittstelle und Speicherweg des Study OS gibt es hier nicht. Die Hilfe nennt stattdessen die Quelle und dass die Datendatei öffentlich neben der Seite liegt |
| — (neu, Scope §3) | Planwahl, Teilen-Link mit Teilen-Leiste, Datenstand mit Warnung, „Kein offizielles Angebot“, Impressum, Datenschutz, auf den Home-Bildschirm legbar |
| — (neu, ARCHITEKTUR §6) | Speicherhinweis und „Auswahl zurücksetzen“ im Fuß, Vorschau eines geteilten Plans mit Vergleich |
| — (neu, Silas 05.10.2026) | Studiengang-Reiter, Legende, Tag/Woche, automatisch eingeplante einzige Gruppen, „In Kalender übernehmen“ (iCal, V-0231) |
| — (neu, Silas 05.10.2026, V-0234) | Startbildschirm mit Leiste (§3.6, §4.5), Hinweis „keine Wahl ohne Überschneidung“ und Ersatz-Schild oben im Plan, Regeln `alle`/`unklar`/`keine` (§4.1) |

Nichts aus dem Vorbild fällt weg, ohne dass die Tabelle den Grund nennt.

### 4.4 Tastatur und Screenreader

- Reihenfolge: Kopf, Module, Werkzeugzeile, Raster, Legende, Fuß.
- **Das Raster ist ein Tabulatorhalt.** Darin wandern ↑ ↓ zur vorigen/nächsten Kachel des Tages,
  ← → zur zeitlich nächsten Kachel im Nachbartag, Pos1/Ende zur ersten/letzten Kachel des Tages.
  Enter oder Leertaste öffnet die Karte. In der Karte ist die Hauptaktion zuerst fokussiert.
  Esc schließt sie und setzt den Fokus zurück auf die Kachel.
- Esc ohne offene Karte geht eine Stufe im Filter zurück (Format → Modul, wenn man darüber kam → keiner).
- Jede Kachel nennt sich vollständig: „Statistik I, Tutorium, Termingruppe 12, Freitag 15:30 bis
  17:30, Raum …, nicht gewählt, überschneidet sich mit Prog I Übung.“
- Modulnamen, Formate, Studiengang-Reiter, Tag/Woche und Segmente sind Schalter mit `aria-pressed`. Wahl, Lösen und Filter
  werden in einem höflichen Live-Bereich angesagt.
- Bei 200 % Textgröße darf die Seite scrollen, aber nichts überlappt oder wird abgeschnitten.

### 4.5 Der Startbildschirm Schritt für Schritt (V-0234, V-0243)

1. **Wann er kommt.** Beim Öffnen ohne Teilen-Link, ohne gespeicherte Planwahl und ohne genau einen
   Plan mit gespeicherter Auswahl (wer vor V-0234 gewählt hat, kommt so direkt in seinen Plan). Ein
   gespeicherter Link (`#plan=<id>`) und ein alter Link (Studiengang, Semester, Fachsemester, wenn
   eindeutig) gehen am Startbildschirm vorbei. Der Live-Fall hat je Stufe eine Option: drei Tipps und
   „Stundenplan öffnen“.
2. **Wählen.** Tipp auf eine Option: Sie bleibt als Karte mit Haken stehen, darunter erscheint die
   nächste Stufe, der Fokus steht auf ihrem Titel, ein Screenreader hört „Studiengang:
   Wirtschaftsinformatik. Weiter mit Fachsemester.“ Entfällt eine Stufe oder gibt es nur eine
   Möglichkeit, geht es darüber hinweg.
3. **Ändern.** Tipp auf eine gewählte Karte öffnet ihre Stufe wieder; Esc geht eine Stufe zurück. Auf
   der ersten Stufe führt Esc zum offenen Plan, wenn es einen gibt.
4. **Öffnen.** „Stundenplan öffnen“ unter den Karten (der Fokus steht dort). Erst jetzt kommt die
   Planwahl in den Speicher (`stundenplanner:v1:plan`, eine Kennung; ARCHITEKTUR §6, wie die Auswahl
   erst nach einer aktiven Wahl). Die Adresse trägt danach `#plan=<id>`: So bleibt der Plan auch ohne
   Speicher beim Neuladen.
5. **Wechseln.** Der Reiter im Plan öffnet den Startbildschirm mit allen Angaben des offenen Plans
   (alle Karten gewählt, „Stundenplan öffnen“ darunter). Die Auswahl gehört zum Plan
   (`stundenplanner:v1:<plan.id>`) und bleibt beim Wechseln erhalten.

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
| **Tinte** (`--grau-10`) | Text. Als Fläche nur für das eine, das gerade gilt: die Hauptaktion einer Karte, das gedrückte Format, die Meldung, den Ring um die gefilterte Modulkachel, die Fläche der gewählten Kachel im Farbton ihres Moduls (`tinte`: hell dunkel, dunkel hell). Fokusring | nicht als Fläche einer Zone, nicht für mehr als eine Aktion je Karte |
| Modulfarben | **Kategorie Modul:** Kacheln, Formate, Farbpunkt vor dem Modulnamen, Legende | nicht für Knöpfe, Links, Überschriften, Hintergründe von Zonen |
| Rot (Konflikt) | Überschneidung: Ring, Symbol auf neutraler Fläche, Text in Hinweisen | nicht für Löschen oder Fehler beim Laden |
| Bernstein (Hinweis) | geändert, nicht mehr im Angebot, veraltet, Abruffehler, Speicher fehlt | nicht als Dekoration |

**Warum Tinte statt einer Akzentfarbe:** Die Seite braucht acht Farbtöne für Module und zwei für
Signale. Ein farbiger Akzent wäre der elfte und würde mit einem Modul verwechselt. Die Tinte ist
eindeutig, kontraststark und lässt den Modulen die Farbe. Violett und Indigo als Akzent sind
ohnehin ausgeschlossen (§7).

### 5.2 Grautreppe und Flächen

Ein Hauch kühl (Ton 260, Chroma 0,004), keine Creme. Zehn Stufen und eine schwebende Fläche, jede
mit einer Aufgabe. Dunkel neu gerechnet in V-0236 (Silas, 05.10.2026: „im Darkmode irgendwie etwas
unstimmig“): vorher lagen Seite, Schiene, getönte Kacheln und Karten auf 0,18/0,225/0,235/0,285
ohne Ordnung, die Karte auf derselben Stufe wie die Modulkachel.

| Token | Aufgabe | hell OKLCH L | hell | dunkel OKLCH L | dunkel |
|---|---|---|---|---|---|
| `--grau-1` | erhöhte Fläche in der Seite: Modulkachel, mögliche Kachel (`hauch`), gewähltes Segment, Auswahl- und Eingabefeld | 0,995 | `#fdfdff` | 0,27 | `#252628` |
| `--ebene` | schwebende Flächen: Karte, Blatt, Dialog. Hell gleich `--grau-1`, die Höhe macht der Schatten | 0,995 | `#fdfdff` | 0,315 | `#303234` |
| `--grau-2` | Seite | 0,980 | `#f7f8fb` | 0,18 | `#111213` |
| `--grau-3` | eingelassen: Segment-Schiene, Leiste, zurückgenommene Kachel | 0,955 | `#eef0f3` | 0,225 | `#1b1c1e` |
| `--grau-4` | Stunden- und Tageslinien | 0,925 | `#e5e6e9` | 0,25 | `#202224` |
| `--grau-5` | Trennlinien, Rand der Modulkachel und der zurückgenommenen Kachel | 0,885 | `#d7d9dc` | 0,31 | `#2f3032` |
| `--grau-6` | Rand von Knöpfen ohne Modul (Segmente, Teilen); dunkel die Fläche der Kontextkachel | 0,800 | `#bcbec0` | 0,40 | `#46484a` |
| `--grau-7` | Rand von Eingabefeldern und Auswahlfeldern (3:1) | 0,600 | `#7f8083` | 0,56 | `#737477` |
| `--grau-8` | Symbole | 0,540 | `#6d6f71` | 0,64 | `#8b8c8f` |
| `--grau-9` | Zweittext: Zeitachse, Zähler, Datenstand, Fußzeile; hell die Fläche der Kontextkachel | 0,450 | `#545557` | 0,81 | `#bfc1c3` |
| `--grau-10` | Text, Tinte, Fokusring, Hauptaktion | 0,235 | `#1d1e20` | 0,93 | `#e6e8ea` |

**Dunkel: je höher, desto heller, vier Stufen im Abstand 0,045** — Seite 0,18 (Ton 6, nie reines
Schwarz), eingelassen 0,225, erhöht 0,27, schwebend 0,315. Schwebende Flächen tragen dunkel keinen
Schatten, sondern 1 px `--rand-ebene` (`rgb(255 255 255 / .1)`). **Schrift** 0,93 und 0,81 statt
etwa 87/60 % Weiß aus dem Masterfile: Bei 60 % (L ≈ 0,70) fiele der Zweittext auf der Karte unter
7:1 (5,0); mit 0,81 hält er 7,13:1 auf `--ebene` und bleibt deutlich unter der Hauptschrift.

**Rollen-Tokens** (V-0236): Wo ein Zustand je Schema eine andere Stufe braucht, steht eine Rolle
statt einer Stufe in der Regel, und Kachel und Legende lesen dieselbe:

| Token | Aufgabe | hell | dunkel |
|---|---|---|---|
| `--fuss-text` (V-0237) | der Hinweis im Fuß: tritt zurück, ≥ 4,5:1 | `--grau-9` (7,03:1) | `--grau-8` (5,58:1) |
| `--ebene`, `--rand-ebene`, `--schatten` | schwebende Ebene | `#fdfdff`, `--grau-5`, zweilagig | `#303234`, `rgb(255 255 255 / .1)`, keiner |

**Für neue Ansichten** (der Hello-Screen, V-0234): nur diese Tokens benutzen, keine Hex-Werte in
Regeln. Seite `--grau-2`; Karte oder Zeile in der Seite `--grau-1` mit Rand `--grau-5`; schwebend
`--ebene` mit `--rand-ebene` und `--schatten`; Schiene `--grau-3`, gewähltes Segment `--grau-1` mit
Rand `--grau-6`; Text `--grau-10`, Zweittext `--grau-9`; die eine Hauptaktion `--grau-10` mit
Schrift `--grau-1`. Im dunklen Block von `web/stil.css` stehen **nur Tokens**, keine Regel
(`web/tests/farben.test.mjs` prüft es): Was ein Schema anders braucht, wird ein Token.

### 5.3 Modulfarben

Acht Farbtöne, je vier Rollen. Ein Modul bekommt die Farbe nach seiner Stelle in `modules`
(Reihenfolge des Katalogs): erstes Modul `--m1`, neuntes wieder `--m1`. Die Reihenfolge der Töne
ist so gelegt, dass Nachbarn sich stark unterscheiden. Für fünf Module: Blau, Sand, Grün, Rosé,
Türkis. Rot (um 27) und reines Gelb bleiben den Signalen.

Regel (Chroma wird gesenkt, bis die Farbe in sRGB liegt). Dunkel entsättigt (V-0236: Rand 0,095
statt 0,11, Flächen 0,055 statt 0,075), damit nichts flimmert; der Ton bleibt, nur die Helligkeit
folgt dem Schema, so dass ein Modul in beiden gleich erkennbar ist.

| Rolle | Aufgabe | hell L / C | dunkel L / C |
|---|---|---|---|
| `hauch` | Fläche der möglichen Kachel, **neutral**: gleich `--grau-1`, in beiden Schemata ohne Tönung (hell seit V-0225, Silas: weniger blasse Pastellflächen; dunkel seit V-0236, vorher je Modul getönt, ein Flickenteppich) | 0,995 / 0 | 0,27 / 0 |
| `rand` | Rand der möglichen Kachel und des offenen Formats, Farbpunkt | 0,62 / ≤ 0,12 | 0,70 / 0,095 |
| `flaeche` | Fläche des gewählten Formats und der Vorschlagskachel | 0,87 / ≤ 0,075 | 0,35 / 0,055 |
| `tinte` | Fläche der gewählten Kachel (Schrift `--grau-1`); Schrift und Symbole auf `flaeche`, gestrichelter Rand der Vorschlagskachel, Fläche des Plus-Knopfs | 0,33 / ≤ 0,08 | 0,87 / 0,055 |

| | Ton | hell `hauch` | `rand` | `flaeche` | `tinte` | dunkel `hauch` | `rand` | `flaeche` | `tinte` |
|---|---|---|---|---|---|---|---|---|---|
| `--m1` Blau | 250 | `#fdfdff` | `#488acb` | `#b4d8ff` | `#0e375c` | `#252628` | `#70a3d8` | `#233c56` | `#bad8f8` |
| `--m2` Sand | 80 | `#fdfdff` | `#ac7d1b` | `#eecf9c` | `#483000` | `#252628` | `#bd9857` | `#4a3716` | `#e8d1ac` |
| `--m3` Grün | 150 | `#fdfdff` | `#4a9a5e` | `#b2e3bb` | `#0d401e` | `#252628` | `#72af7f` | `#24432b` | `#bcdfc2` |
| `--m4` Rosé | 350 | `#fdfdff` | `#bb6690` | `#fbc1db` | `#53223b` | `#252628` | `#cb86a7` | `#502e3f` | `#f2c6d9` |
| `--m5` Türkis | 200 | `#fdfdff` | `#03999f` | `#98e4e8` | `#003e41` | `#252628` | `#48b0b6` | `#0a4346` | `#aae0e2` |
| `--m6` Violett | 300 | `#fdfdff` | `#9274c3` | `#dbcaff` | `#3c2a58` | `#252628` | `#a791d1` | `#3f3453` | `#d9cdf4` |
| `--m7` Orange | 50 | `#fdfdff` | `#bf6e3e` | `#fec7a9` | `#552707` | `#252628` | `#ce8d68` | `#52321f` | `#f3cbb5` |
| `--m8` Oliv | 115 | `#fdfdff` | `#848e2d` | `#d2dba2` | `#343900` | `#252628` | `#9ca65f` | `#3a3e1a` | `#d2d9b0` |

**Zustandslogik, in beiden Schemata dieselbe Regel** (V-0236; vorher hatte das dunkle Schema eigene
Regeln, dort waren eingeplant und automatisch gleich gefüllt und kaum von wählbar zu trennen). Ein
Schema tauscht nur Tokens. Die Stärke ist die Entfernung zur Seite:

| Zustand | Regel | hell | dunkel |
|---|---|---|---|
| wählbar | neutral `hauch`, 1 px `rand` | weiß, Rand farbig | erhöht 0,27, Rand farbig |
| eingeplant | gefüllt `tinte`, Schrift `--grau-1` — die stärkste Fläche | dunkelste (0,33) | hellste (0,87) |
| Vorschlag (V-0237) | gefüllt `flaeche`, Schrift und gestrichelter Rand `tinte` — eine Stufe leiser, nicht eingeplant | 0,87 | 0,35 |
| außerhalb des Filters (V-0237) | dieselbe Kachel, Deckkraft 0,2 — durchscheinend | — | — |
| Format schon gewählt | `--grau-3`, Rand `--grau-5`, Schrift `--grau-9` — blass, eingelassen | 0,955 | 0,225 |

Die Legende benennt die Zustände nach der Rolle („grau“, „blass“), nicht nach einem Farbton, und
ihre Felder für grau und blass stehen in derselben CSS-Regel wie die Kachel.

Farbe ist nie das einzige Merkmal: Die Kachel nennt Modul oder Typ als Text (Stufe L/M), der
Format steht unter seinem Modulnamen, und gewählt/möglich
unterscheidet sich durch gefüllt/umrandet und den Haken. Das trägt auch bei Farbfehlsichtigkeit.

### 5.4 Signalfarben

| Token | Aufgabe | hell | dunkel |
|---|---|---|---|
| `--konflikt` | Ring, Symbol auf neutraler Fläche | `#cc2827` (0,55 0,20 27) | `#ef675c` (0,68 0,17 27) |
| `--konflikt-text` | Text „Überschneidung …“ | `#a51f1e` (0,47 0,17 27) | `#f8a59b` (0,80 0,10 27) |
| `--konflikt-flaeche` | Hintergrund einer Konfliktzeile in den Hinweisen | `#ffebe8` (0,955 0,022 27) | `#3b1c19` (0,27 0,05 27) |
| `--hinweis` | Ring, Symbol | `#c17a00` (0,64 0,139 70) | `#e9b452` (0,80 0,13 80) |
| `--hinweis-text` | Text | `#7b4c00` (0,46 0,10 70) | `#e9ca89` (0,85 0,09 85) |
| `--hinweis-flaeche` | Hintergrund einer Hinweiszeile | `#fef0d4` (0,96 0,04 85) | `#31240e` (0,27 0,04 80) |

### 5.5 Kontraste, nachgerechnet

WCAG-2-Kontrast aus den Hex-Werten oben, kleinster Wert über alle acht Modulfarben. Dunkel neu
gerechnet am 05.10.2026 (V-0236), nicht gerundet. Ziel für Text 7:1, Pflicht 4,5:1, Nicht-Text 3:1.
`ops/sicht.py` prüft die Paare in beiden Schemata (Prüfung 8a) und jeden sichtbaren Text (8b).

| Paar | hell | dunkel | Ziel |
|---|---|---|---|
| Text `--grau-10` auf Seite `--grau-2` | 15,71 | 15,27 | 7 |
| Text auf Karte `--ebene` | 16,42 | 10,48 | 7 |
| Text auf erhöhter Fläche `--grau-1` | 16,42 | 12,33 | 7 |
| Zweittext `--grau-9` auf Seite | 7,03 | 10,39 | 7 |
| Zweittext auf Karte `--ebene` | 7,35 | 7,13 | 7 |
| Zweittext auf `--grau-1` | 7,35 | 8,39 | 7 |
| zurückgenommene Kachel: `--grau-9` auf `--grau-3` | 6,54 | 9,45 | 4,5 |
| Hinweis im Fuß: `--fuss-text` auf Seite (V-0237; die Kontextkachel ist seit V-0237 durchscheinend und kein Lesetext) | 7,03 | 5,58 | 4,5 |
| `--grau-1` auf `--grau-9` (Paar in sicht.py) | 7,35 | 8,39 | 7 |
| `--grau-10` auf `--grau-6` (Paar in sicht.py) | 8,95 | 7,48 | 7 |
| gewählte Kachel: `--grau-1` auf `tinte` | 11,68 | 9,99 | 7 |
| Text `--grau-10` auf `hauch` (mögliche Kachel) | 16,42 | 12,33 | 7 |
| `tinte` auf `flaeche` (Vorschlagskachel, gewähltes Format) | 8,25 | 7,57 | 7 |
| `rand` auf Seite (Kachelrand, Chiprand, Farbpunkt) | 3,26 | 6,70 | 3 |
| `rand` auf `--grau-1` (Modulkachel, mögliche Kachel) | 3,40 | 5,41 | 3 |
| Rand der Eingabefelder `--grau-7` auf Seite | 3,72 | 4,01 | 3 |
| Symbole `--grau-8` auf Seite | 4,75 | 5,58 | 3 |
| Fokusring `--grau-10` auf Seite | 15,71 | 15,27 | 3 |
| Hauptaktion: `--grau-1` auf `--grau-10` | 16,42 | 12,33 | 7 |
| Konfliktring auf Seite | 5,07 | 6,04 | 3 |
| Konflikttext auf Seite | 7,03 | 9,69 | 4,5 |
| Konflikttext auf Konfliktfläche | 6,50 | 7,94 | 4,5 |
| Hinweissymbol auf Seite | 3,27 | 9,93 | 3 |
| Hinweistext auf Hinweisfläche | 6,48 | 9,55 | 4,5 |

Zwei Folgerungen stehen schon in §3.2: Der Konfliktring liegt **außen mit 1 px Luft** in
Seitenfarbe, weil Rot neben der gefüllten Kachel nur 2,20:1 (hell) bzw. 2,05:1 (dunkel) hätte.
Symbole in Kacheln haben die Schriftfarbe der Kachel. Auf farbigen Flächen steht nie ein mittleres
Grau, sondern die `tinte` desselben Tons oder, auf `tinte` selbst, `--grau-1` (hell fast weiß,
dunkel fast schwarz). Ändert jemand einen Wert, rechnet er diese Tabelle neu.

### 5.6 Abstände

Einheit 4 px, Rhythmus 8 px. Stufen: **2** (nur zwischen Spuren und Kacheln), **4, 8, 12, 16,
24, 32, 48**. `ops/sicht.py` misst es (Prüfung `abstand`, V-0225): jeder Innenabstand, jeder
Außenabstand bis 64 px und jede Lücke in Flex und Grid außerhalb der Kacheln. Am Handy zwischen
den Zonen 24 px (Module), 32 px (Bühne), 24 px (Legende), 48 px (Fuß). Innerhalb einer Gruppe ist der Abstand kleiner als um sie herum: 4 px zwischen den Formaten
eines Moduls, 8 px zwischen den Modulkacheln. 8 px zwischen
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
| 12 px | Kacheln (Stufen S/M und Zeilen 2–3 von L), Zeitachse, Datum im Tageskopf, Formate, Legende, Fuß am Rechner, Datenstand |
| 14 px | Bedienelemente, Modulnamen, Tageskopf, Werkzeugzeile, Kartentext, Fuß am Handy, Zeile 1 der Stufe-L-Kachel |
| 16 px | Optionen des Startbildschirms, Kartentitel, Lesetext in Hilfe und Modulhinweisen. Auf Touch-Geräten alle Auswahl- und Eingabefelder (sonst vergrößert iOS beim Antippen) |

- **Zwei Gewichte:** 400 und 600. Hierarchie zuerst über Gewicht und Farbe, nicht über Größe.
- Laufweite 0 (alle Größen ≤ 16 px). Keine Versalien, auch nicht für Beschriftungen.
- Lesetext höchstens 66 Zeichen je Zeile.

### 5.8 Radien und Tiefe

- **Radien:** 4 px (Kacheln), 6 px (Formate), 8 px (Knöpfe, Segmente, Auswahlfelder, Meldung),
  12 px (Modulkacheln, Karten, Dialog, obere Ecken des Blatts), rund (Farbpunkt). Verschachtelt gilt:
  innen = außen − Innenabstand (Segment in einer Schiene mit 8 px und 2 px Rand: 6 px).
- **Ringe** (Überschneidung rot, Hinweis Bernstein, Gruppe beim Zeigen Tinte) sind `outline` mit
  1 px Abstand, kein Schatten: Schatten gehören nur den schwebenden Ebenen.
- **Tiefe:** Die Seite ist flach. Schatten haben nur schwebende Ebenen (Karte, Blatt, Dialog,
  Meldung), zweilagig aus einer Lichtquelle: `0 1px 2px rgb(0 0 0 / .06), 0 8px 24px rgb(0 0 0 / .12)`,
  dazu 1 px Rand `--grau-5`. Dunkel: kein Schatten, Höhe über die hellere Fläche `--ebene` und den
  hellen 1-px-Rand `rgb(255 255 255 / .1)` (§5.2).
  Kein Schein, kein Glas, keine Unschärfe.

### 5.9 Zustände

| Zustand | wie | wo |
|---|---|---|
| Zeigen (hover) | Überlage in der Schriftfarbe des Elements, 8 %, nur bei `(hover: hover)`. Auf hellen Flächen ist das die Tinte, auf Tinte das helle Grau | alles Klickbare |
| Drücken (active) | Überlage 10 % | alles Klickbare |
| Fokus (`:focus-visible`) | 2 px Tinte, 2 px Abstand. An Kacheln 4 px Abstand, damit er außerhalb des Konfliktrings liegt. Die fokussierte Kachel liegt oben | alles Fokussierbare |
| gedrückt / gewählt | Format gefiltert: Tinte gefüllt. Segment gewählt: `--grau-1`, 1 px `--grau-6`, 600. Kachel gewählt: §3.2 | Formate, Segmente, Kacheln |
| gesperrt | Inhalt 38 % Deckkraft, Fläche 12 %, kein Zeiger | Format ohne Termine, ‹ › am Rand des Semesters |
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
- **Keine Bewegung im Raster, eine Ausnahme:** Filter, Woche und Tag wechseln sofort. 65 Kacheln
  zu animieren ruckelt auf alten Handys, und ein Wechsel soll sich wie ein Wechsel anfühlen. Die
  Ausnahme (Silas, 05.10.2026): Nach einer Wahl setzt sich die gewählte Kachel (Maßstab 0,96 → 1,
  200 ms) und die übrigen Gruppen ihres Formats verblassen ins Blasse (Deckkraft, 200 ms), nur
  diese Kacheln und nur einmal.
- Keine Einblende-Animation beim Laden. Nichts ist unsichtbar, bis eine Animation läuft.
- `prefers-reduced-motion: reduce`: keine Wege, nur Deckkraft in 100 ms.

### 5.11 Ziele

- Jedes Bedienelement mindestens **24 × 24 px**, am Rechner Knöpfe 32 px hoch, Modulnamen und
  Formate 28 px (damit acht Module untereinander in 720 px passen). Der
  Knopf direkt auf einer Kachel ist 24 px hoch, damit er in eine 2-h-Kachel ab 76 px passt.
- Auf Touch-Geräten (`pointer: coarse`) mindestens **44 × 44 px**: Modulnamen, Formate, Reiter, Segmente,
  Knöpfe, ‹ ›, Schließen. Knöpfe in Blättern 48 px hoch, volle Breite. Mindestens 8 px zwischen
  Zielen. Am Handy sind seit V-0225 auch Links und Knöpfe im Fuß 44 px hoch (die Seite darf dort
  scrollen); `ops/sicht.py` misst Links weiter gegen 24 px. Die Tagesreiter am Handy liegen ohne
  Lücke in ihrer Schiene.
- Kacheln: mindestens 44 px hoch auf Touch (dafür die 22 px je Stunde), mindestens 24 px breit.
  Ausnahme: die Woche am Handy (Übersicht); dort zeigt ein Tipp den Tag groß, ein Fehltipp kostet
  nichts. Der Knopf auf der Kachel steht nur ab 160 px Breite und 52 px Höhe.

### 5.12 Symbole

Ein Satz, eigene Inline-SVG (kein Symbolfont, keine Bibliothek), Raster 24 px, Strich 2 px, runde
Enden, gezeichnet bei 16 px (in Kacheln 12 px). Eine Farbe je Symbol. Genau diese: Haken
(gewählt), Warndreieck (Überschneidung), Kreispfeil (geändert), Ausrufekreis (Hinweis, veraltet),
i-Kreis (Info), Kreuz (schließen), Winkel links/rechts (Woche), schlichtes Rechteck (Tag),
Rechteck mit Schachbrettmuster (Woche), Kalender (Export), Winkel unten (Auswahlfelder und
des Zeitraums, statt des Zeichens ▾; im Bau dazugekommen), Teilen, externer Link (öffnet
MOSES/ISIS/VVZ in neuem Tab), dazu seit V-0237 Plus (Einplanen, auf der Kachel im abgerundeten
Quadrat, Strich 2,25 px), Kopieren und Lesezeichen (Fläche „Für später speichern“). Neben jedem
Symbol steht ein Wort, außer an Schließen, ‹ › und dem Plus bzw. Kreuz auf der Kachel, die einen
zugänglichen Namen tragen. Keine Emoji und keine Unicode-Zeichen als Symbole
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
| HTML | ≤ 16 KB | Rahmen mit Kopf- und Fußzeile, SVG-Symbole inline, der Rahmen des Startbildschirms, der Schriftzug als Pfad (3,9 KB, inline statt einer eigenen Anfrage vor der ersten Kachel; V-0243). Bis V-0234: 10 KB, bis V-0243: 11 KB |
| CSS | ≤ 44 KB | eine Datei, Tokens §5 (bis V-0225: 28 KB, bis V-0234: 32 KB, bis V-0237: 40 KB, siehe unten) |
| JavaScript | ≤ 128 KB, in höchstens 6 Dateien | Module ohne Build-Schritt, mit Kommentaren, die das Warum tragen (bis V-0225: 80 KB, bis V-0234: 90 KB, bis V-0237: 120 KB). `ics.mjs` lädt erst bei der ersten Bedienung und zählt hier nicht |
| Code zusammen, komprimiert | **≤ 62 KB** | die Auslieferung (Cloudflare Pages) komprimiert (bis V-0225: 40 KB, bis V-0234: 45 KB, bis V-0237: 58 KB) |
| Datendatei des Plans | ≤ 600 KB, komprimiert ≤ 60 KB | heute 407 KB / 28 KB. Wird es mehr, ist das ein Befund fürs Lesemodell |
| Anfragen bis zum fertigen Raster | ≤ 10, alle vom eigenen Ort und **ohne Kaskade**: Das HTML nennt CSS und jedes Modul (`modulepreload`), sie laden parallel | HTML, CSS, die Module, `index.json`, Plan-Datei (bis 05.10.2026: 6) |
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
Budget, die Bytes und Anfragen hielten das erste Budget nicht. Entschieden am 05.10.2026 (anflug, technisch): Die
Grenzen der **Wirkung** bleiben, die der **Bytes und Anfragen** steigen auf die gebauten Werte mit Puffer (Tabelle oben).

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
zählt, ist das Ergebnis auf einem langsamen Handy, und das hält das Budget mit Abstand. **Entschieden (05.10.2026):** Die Byte-Grenzen
steigen (Tabelle oben). Ein Schritt, der beim Ausliefern Kommentare entfernt und Module bündelt,
würde „kein Build“ brechen und eine Seite schneller machen, die schon schnell ist. Wird die Seite
spürbar langsamer, gilt wieder: Erst die Wirkung messen, dann über einen Bau-Schritt reden.

**V-0225 (Silas' Test, 05.10.2026), entschieden von landeklappe, technisch; Silas kann es ändern:**
Die neue Bedienung (Studiengang-Reiter, Modulkacheln, Lage, Umschalter, Legende, Kachelarten mit
Animation, automatisch eingeplante Gruppen, Kalender-Knopf) kostet Bytes; CSS ≤ 32 KB, JS ≤ 90 KB,
gzip ≤ 45 KB, die Grenzen der Wirkung bleiben. Gemessen mit `ops/sicht.py` am 05.10.2026 (vollständige Messung, grün): HTML 9,4 KB, CSS 30,4 KB, JS 85,3 KB in 5 Dateien, gzip 42,6 KB, LCP 0,90 s, CLS 0,015, TBT 8 ms, 1 024 DOM-Knoten bei 65 Kacheln. Am Handy ist der größte
Inhalt der Satz der Lage („Wähle ein Modul oder ein Format …“); er steht deshalb schon im HTML,
sonst wäre er erst mit den Daten erschienen (LCP 3,5 s statt 0,9 s auf dem Prüfserver, der die
Plandatei ungepackt ausliefert).

**V-0234 (Startbildschirm, Silas, 05.10.2026), entschieden von einflug, technisch; Silas kann es
ändern:** Der Startbildschirm (Baum, Leiste, Zusammenfassung, `planwahl.mjs`), der Umzug des
Speicherschlüssels, die Hinweise oben im Plan und die Regeln der Gruppen kosten rund 6 KB CSS und 30 KB
JS (gzip etwa 11 KB). Die Grenzen der Bytes steigen auf HTML ≤ 11 KB, CSS ≤ 40 KB, JS ≤ 120 KB, gzip ≤ 58 KB; die
Grenzen der Wirkung bleiben. Die Dateien bleiben bei sechs (`planwahl.mjs` ist die sechste) und die
Anfragen bis zur ersten Kachel bei zehn. **Kein vorgeschaltetes Skript**, das vor dem ersten Bild
zwischen Plan und Startbildschirm entscheidet: Es wäre die siebte Datei und die elfte Anfrage, und
gedrosselt (CPU 4×, 1,6 Mbit/s) steht der Rahmen des Plans beim ersten Besuch nur bis zu 0,3 s, bevor
der Startbildschirm kommt. Gemessen mit `ops/sicht.py` am 05.10.2026: die Zahlen im Bericht von V-0234.

**V-0237 (Silas' zweiter Test), entschieden von einflug, technisch; Silas kann es ändern:** die
Fläche „Für später speichern“, der Knopf als Plus und Kreuz, Vorschläge, Sättigung und Fuß kosten
rund 1 KB CSS und 1 KB JS, und die Seite lag schon an den Grenzen von V-0234. Die Grenzen der Bytes
steigen auf CSS ≤ 44 KB, JS ≤ 128 KB, gzip ≤ 62 KB; die Grenzen der Wirkung bleiben (gemessen: LCP
1,1 s, CLS 0,016, TBT 0 ms). Wird es wieder eng, ist das der Zeitpunkt für die Frage aus §9 Punkt 4
(ein Auslieferschritt, der Kommentare entfernt).

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
| A | Einblenden beim Scrollen, Anheben beim Zeigen | Kacheln, Formate | keine Bewegung im Raster außer der kurzen Wahl-Animation, Zeigen ist eine 8-%-Überlage (§5.10) |
| A | Floskeln („nahtlos“, „Entdecke …“) | Leerzustände, Hilfe | Wörter der Quelle, Verben auf Knöpfen (§5.13) |
| B | nur dunkel, gedämpfter Zweittext unter 7:1 | Vorbild nur dunkel | beide Schemata, Zweittext 7,03:1 hell, 9,35:1 dunkel |
| B | Versalien-Zeile über Überschriften | „WINTERSEMESTER 2026/27 · 1. FACHSEMESTER“ | keine Versalien |
| B | Monospace für Daten, Terminal-Anmutung | Zeiten, SWS, Nummern im Vorbild | Systemschrift mit gleich breiten Ziffern |
| B | Regenbogen aus Farben, pulsierende Punkte | acht Modulfarben, Hinweismarken | Modulfarben nur auf Kacheln, Formaten, Farbpunkt, Legende. Gerüst grau. Nichts pulsiert |
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

Seit V-0237 ist die Standardansicht „Mein Stundenplan“; die dichteste Stelle entsteht erst beim
Aufschlagen eines Moduls. Der **Stressfall** wird deshalb mit aufgeschlagenem Modul A gemessen (seine
zehn Gruppen, darunter die sechs parallelen, dazu der übrige Plan durchscheinend).

**Fenster:** 360 × 640, 375 × 667, 390 × 844, 430 × 932, 768 × 1024, 865 × 1021, 1024 × 768,
1280 × 720, 1280 × 800, 1366 × 657, 1440 × 900, 1920 × 1080, 2560 × 1440. Jedes hell und dunkel.

| # | Kriterium | Messung | Soll |
|---|---|---|---|
| 1 | **Am Rechner kein Scrollen der Standardansicht** („Mein Stundenplan“ seit V-0237, Alle Wochen, kein Filter), mit leerer, halber und voller Auswahl. **Am Handy** (unter 768 px, Silas' Test, V-0225) nie seitlich | `scrollHeight ≤ innerHeight` und `scrollWidth ≤ innerWidth`; am Handy nur `scrollWidth`, und kein Element ragt seitlich hinaus | in allen Fenstern erfüllt. Kein innerer Bereich außer Karten und Blättern scrollt |
| 1h | **Am Handy: Tag und Woche samt Umschalter auf einem Schirm unterhalb der Module** | gescrollt, bis das Raster 8 px unter dem oberen Rand steht, im Tag und nach „Woche“: jede Kachel ganz und frei, erste und letzte Stundenmarke ganz, der Umschalter ganz im Fenster, das Raster endet über ihm und steht unter den Modulen. In der Woche jeder Tag, Höhe ≥ 22 px je Stunde, die Breite zählt nicht | in allen Handy-Fenstern |
| 2 | dasselbe im Stressfall | wie 1 (am Handy wie 1h) | erfüllt ab 1280 × 720 und bei 390 × 844. Kleinere Fenster dürfen scrollen, schneiden aber nichts ab |
| 3 | alle Formate sichtbar | jedes Format liegt vollständig im Fenster (am Handy beim Öffnen, oben) | in allen Fenstern |
| 4 | **jede sichtbare Gruppe hat eine Kachel** | Zahl der Kacheln = Zahl der Slots, die Ansicht und Filter zeigen | gleich, kein „+ N weitere“ |
| 5 | ganze Zeitachse sichtbar | erste und letzte Stundenmarke im Fenster | ab 768 px alle Wochentage, darunter der gewählte Tag |
| 6 | Kachelgröße | `getBoundingClientRect` | Breite ≥ 24 px. Höhe einer 2-h-Kachel ≥ 40 px, auf Touch ≥ 44 px. Stufe wie in §3.4 |
| 7 | Ziele | alle Bedienelemente | ≥ 24 × 24 px, bei `pointer: coarse` ≥ 44 × 44 px (Kacheln: Kriterium 6) |
| 8 | Kontraste | die Paare aus §5.5, nachgerechnet aus den CSS-Werten | alle wie in §5.5. Nichts gerundet |
| 9 | Schrift | berechnete `font-size` aller sichtbaren Texte je Ansicht | höchstens 12, 14, 16 px. Gewichte nur 400 und 600 |
| 10 | Tastatur | Durchlauf ohne Maus: Bestandteil filtern, Gruppe wählen, wechseln, lösen, Woche wechseln, teilen | alles erreichbar, Fokus immer sichtbar (≥ 2 px, ≥ 3:1), Esc schließt, Fokus kehrt zurück |
| 11 | Parität | jede Zeile aus §4.3 | jede Funktion an der genannten Stelle |
| 12 | Leistung | Größen der ausgelieferten Dateien, Lighthouse Mobil | Budget §6 eingehalten: Code ≤ 45 KB komprimiert, LCP ≤ 1,5 s, CLS ≤ 0,02, TBT ≤ 50 ms, keine fremde Anfrage |
| 13 | Bewegung | `prefers-reduced-motion` emuliert | keine Wege, nur Deckkraft (auch die Wahl-Animation, §5.10) |
| 14 | Text 200 % | Browser-Zoom auf Text | nichts überlappt oder wird abgeschnitten (Scrollen erlaubt) |
| 15 | AI tells | Liste §7 | keiner vorhanden |
| 16 | ohne Speicher | privates Fenster, `localStorage` wirft | Seite funktioniert, der Text an der Stelle des Speicherhinweises erscheint (§4.2, Schritt 12; am Handy am Seitenende) |
| 17 | Speicherregeln | Laden ohne Wahl, dann eine Wahl | Laden schreibt nichts in den Speicher (auch nicht die Vorschläge). Der Speicherhinweis ist am Rechner ohne Scrollen sichtbar, am Handy am Seitenende |
| 18 | Abstände | Innen- und Außenabstände, Lücken (`ops/sicht.py`, Prüfung `abstand`) | in Stufen von 4 px, dazu 2 px (§5.6) |
| 19 | **Startbildschirm** (V-0234, V-0243) | ohne Speicher und ohne `#plan`: der Anfang, die Stufe mit den meisten Optionen, alles gewählt vor dem ersten Plan; dazu Ziele, Kontrast, Schrift, Abstände, Tells wie oben | ab 768 px kein Scrollen; am Handy nie seitlich, die Fortschrittslinie ganz im Fenster, jede Option ins Bild gescrollt ganz und frei; „Kein offizielles Angebot“, Impressum und Datenschutz zu sehen (am Handy am Seitenende); Laden und Wählen schreiben nichts |
| 20 | Planwahl im Speicher | „Stundenplan öffnen“ | der Plan steht (Kacheln), danach im Speicher genau `stundenplanner:v1:plan` mit der Kennung, vorher nichts |

Am Handy heißt §3.3 „ohne Scrollen sichtbar“ seit V-0225: „Teilen“ oben, der Fuß (inoffiziell,
Speicherhinweis, Impressum, Datenschutz) am Seitenende ganz und nicht unter dem Umschalter.
`ops/sicht.py` misst alles außer #11 und Teilen von #10; Kontrast am Handy Fenster für Fenster an
jeder gemessenen Stelle. Gemessen wird der erste Plan im Baum von `index.json` (`--plan <id>` für
einen anderen), geöffnet über die Adresse `#plan=<id>` wie ein Teilen-Link ohne Auswahl (V-0234).

Silas testet die Bedienung selbst. Was er ändert, wird hier eingetragen, bevor es gebaut wird.

---

## 9. Was Silas entscheidet

Die Grundentscheidungen, die der Entwurf vorschlug. **Silas hat sie am 05.10.2026 entschieden**,
so ist es gebaut (V-0220):

1. **Keine Markenfarbe.** Der Akzent ist nur die Tinte, Farbe tragen nur die Module, Rot steht für
   Überschneidungen, Bernstein für Hinweise (§5.1).
2. **Startansicht „Noch offen“, und die gewählten Gruppen bleiben darin sichtbar** (§4.1). Das
   Vorbild startete mit „Alle Möglichkeiten“ und blendete in „Noch offen“ das Gewählte aus.
   *Abgelöst durch Punkt 21 (V-0237): Die Startansicht ist „Mein Stundenplan“.*
3. **Wählen auf beiden Wegen.** Auf breiten Kacheln am Rechner direkt „Einplanen“ bzw.
   „Wechseln“/„Lösen“ wie im Study OS. Auf schmalen Kacheln und am Handy öffnet Antippen die
   Gruppenkarte (am Handy als Blatt von unten), dort wird gewählt. Die Gruppenkarte gibt es auf
   jeder Breite (§4.2, Schritt 3–4). Gebaut: der Knopf ab Stufe L und 76 px Höhe, nur mit feinem
   Zeiger (Maus, Trackpad) und ab 768 px.

Offen, vorgelegt mit dem Bau:

4. **Das Byte-Budget** (§6), entschieden am 05.10.2026 (anflug, technisch; Silas kann es
   ändern): Die Grenzen der Wirkung (LCP, CLS, TBT, Wahl bis Bild) bleiben, die Seite hält sie mit
   Abstand. Die Grenzen der Bytes und Anfragen steigen auf CSS ≤ 28 KB, JS ≤ 80 KB, gzip ≤ 40 KB,
   ≤ 10 Anfragen ohne Kaskade; mit V-0225 auf CSS ≤ 32 KB, JS ≤ 90 KB, gzip ≤ 45 KB (landeklappe).
   Ein Bündel-Schritt beim Ausliefern widerspräche „kein Build“ aus §0.

**Silas' Test am Handy, 05.10.2026** (Punkt e006f480, gebaut in V-0225): „Das Nicht-Scrollen ist
sehr ernst genommen …, aber jetzt ist es viel zu gequetscht. Die Spacings passen nicht mehr … Die
Navigation ergibt nicht wirklich Sinn und die Beschriftung auch nicht.“ Sein Bild, so gebaut:

5. **Ganz oben der Studiengang-Reiter**, heute ein Reiter und „Weitere Studiengänge folgen“ (§3.1).
6. **Die Module einzeln, darunter klein ihre Formate**, mit Zustand gewählt/offen (§3.1).
7. **Modul tippen: alle seine Gruppen; Format tippen: nur dessen; nochmals tippen hebt auf.** Ohne
   Filter „Noch offen“, das Gewählte bleibt sichtbar (§4.1, §4.2). *Seit V-0237 ohne Filter „Mein
   Stundenplan“ (Punkt 21).*
8. **Der Hinweis „Kein offizielles Angebot“ samt Speicherhinweis, Zurücksetzen, Impressum und
   Datenschutz ans Seitenende, mit deutlich mehr Abstand; dafür darf die Seite am Handy scrollen.**
9. **Unten mittig ein schwebender Umschalter Tag/Woche**, Woche „die ganze Woche klein“, darunter
   eine Legende der Formate, die Modulfarben gelten auch dort (§3.3).

**Silas' Blick auf den Rechner, 05.10.2026** (Punkt 623ac2d5, V-0225), für eine Bedienung:

10. Oben sofort der Studiengang als Reiter („1. Fachsemester nach Studienverlaufsplan“).
11. **Die Module als Kacheln untereinander**, am Rechner als Spalte links; je Format immer die Zahl
    der Gruppen („VL 1“).
12. **Kachel: zuerst das Modul, darunter die Einheit ausgeschrieben, dann Gruppe, Zeit, Raum.**
13. Kompakter, „Einplanen“ ruhig oben rechts statt gequetscht unten links.
14. Hochwertiger statt „Arztsystem“: klare Hierarchie über Schrift, weniger blasse Pastellflächen,
    saubere Ausrichtung, Tiefe sparsam (§3.2, §5.3).
15. **Eingeplantes sofort erkennbar** (kräftig gefüllt), die übrigen Gruppen eines gewählten
    Formats **hellgrau**, mit kleiner Animation (§3.2, §5.10).
16. Klarer zeigen, dass man auf Formate tippen kann: der Satz der Lage, Formate als Knöpfe.
17. **Kalender-Export als iCal** mit einem Klick (gebaut von bordkalender in V-0231, der Knopf hier).

**Silas, 05.10.2026, danach:** 18. **Termine, bei denen es nur EINE Gruppe gibt, stehen von Anfang
an gestrichelt drin**; man muss sie nicht von Hand wählen (§4.1). Berechnet, nicht gespeichert.
*Seit V-0237 (Punkt 24) stehen sie gestrichelt als Vorschlag drin und zählen erst nach „Einplanen“.*

**Silas, 05.10.2026, der Startbildschirm** (V-0234, gebaut von einflug):

19. *„Die Seite soll beginnen mit Hello-Screen und dort soll man 1. Uni wählen, 2. Studiengang, 3.
    Vertiefung, 4. Semester, für das geplant werden soll, 5. Studienprüfungsordnung. Unten soll eine
    dynamische Progress-Bar sein, die visuell zeigt, welche Entscheidung noch fehlt für eine
    eindeutige Zuordnung. Gibt es für einen Studiengang keine Vertiefung, soll übersprungen werden;
    gibt es für ein Semester nur eine gültige Studienprüfungsordnung, dann soll die automatisch
    gewählt werden. Diese Auswahl soll im Browser gespeichert werden, sodass, wenn man es erneut
    aufruft, ohne Caches zu leeren, die letzte Auswahl + Stundenplan gespeichert sind.“* (§3.6, §4.5)
20. **Gibt es keine Kombination ohne Überschneidung, sagt die Seite das ausdrücklich** (Silas: „ja“;
    §3.1 „Hinweise oben“). Unsicher heißt „vermutlich“, mit dem Verdacht.

**Silas' zweiter Test, 05.10.2026** (live 8e2f757, Punkt 09a3f4d2, gebaut von einflug in V-0237):

21. **Die Standardansicht beim Öffnen ist immer „Mein Stundenplan“**, auch nach dem Startbildschirm (§4.1).
22. **Ein aufgeschlagenes Modul zeigt sich nicht mehr durch einen Rahmen um die Modulkachel:** Der
    Farbkreis ist ein Ring und füllt sich (§3.1).
23. **Sobald gefiltert ist, tritt alles aus „Mein Stundenplan“ auf ganz leichte Deckkraft (≈ 20 %)
    zurück** (§3.2 Kontext).
24. **Formate mit nur einer Gruppe sind Vorschläge, noch nicht eingeplant:** gestrichelt in beiden
    Ansichten, bis man sie mit „Einplanen“ bestätigt; beim Filtern sinkt auch ihre Deckkraft (§4.1).
25. **Formate unterscheiden sich leicht über die Sättigung:** Vorlesung und IV 100 %, Übung 70 %,
    alles andere 50 % (§3.2; Kategorien aus V-0238).
26. **Statt „Einplanen“ ein schönes, modern abgerundetes Plus**, auch auf gequetschten Kacheln (§3.2).
27. **Der Fuß sauber und aufgeräumt, der Hinweis kleiner und dunkler** (§3.1).
28. **Teilen: eine Fläche von unten, „Save for later“**, mit Kopieren, Lesezeichen und Teilen (das
    Teilen-Menü des Systems; §4.2 Schritt 11).

**Silas' dritter Blick, 05.10.2026** (live 0d16303, Punkt d705ab47, gebaut in V-0243). Vorweg: „An dem
Scope von dem eigentlichen Tool soll jetzt erstmal nichts geändert werden, bis wir nicht den API-Key
haben […]. Das Wichtigste ist jetzt, dass wir die Benutzung wirklich komplett streamlinen und schön
machen.“

29. **MOSES im Hinweis ist ein Link** auf die Quelle (§3.1 Fuß).
30. **Die Legende wandert an die linke Seite, klein und unauffällig** (§3.1); der Hinweis „Kein
    offizielles Angebot“ bleibt im Fuß, **blasser**, ebenso Hilfe, Impressum, Datenschutz
    (`--fuss-text` eine Stufe heller, §5.2).
31. **Die Auswahl der Module rückt weiter nach unten**, mehr Platz unter der Kopfzeile; **jedes Element
    hat Raum zum Atmen** (Kopf 56 px, 16 px zwischen den Zonen, 32 px zwischen Modulspalte und Bühne,
    12 px zwischen den Modulkacheln; gemessen in zehn Fenstergrößen von 360 bis 1920 px).
32. **„Teilen“ heißt „Stundenplan speichern“** (§3.1, §4.2 Schritt 11).
33. **Kein Zeichen, nur der Schriftzug**: „stundenplanner“ in Rubik 600 als Pfad, mittig in der
    Kopfzeile (§0 Punkt 10). Die Zeichen aus V-0239 (Feld, Anschluss, Kuhle) entfallen.
34. **Der Startbildschirm, neu und aufgeräumt**: oben mittig der Schriftzug, dann nur Hochschule (die
    Karte im Rot der TU, ohne Logo), Studiengang, Fachsemester; alles Unnötige entfällt (§3.6, §4.5).

---

## 10. Was der Bau anders macht als oben, gesammelt

Jede Abweichung steht mit ihrem Grund an ihrer Stelle; hier nur die Liste, damit Silas' Test sie
findet.

- **Luft über jeder Kachel, 1 px, nur oben** (§3.2), statt oben und unten an anschließenden.
- **Mindesthöhe 20,5 und 22,5 px je Stunde** (§3.2), damit die Luft die 2-h-Kachel nicht unter
  40 bzw. 44 px drückt.
- **Gruppenkarte unter oder über der Kachel**, wenn diese so breit wie das Fenster ist (§3.5).
- **Die Meldung schließt sich auch auf Klick** und fängt Klicks, solange sie zu sehen ist (§3.5).
- **Winkel unten** als zusätzliches Symbol (§5.12).
- **Eine leise Marke „Hinweise“** (i-Kreis) in der Lage, wenn es nur Informationen gibt (Formate
  ohne Termine, alles eingeplant): So bleibt die Karte „Hinweise“ erreichbar.
- **Ringe als `outline`**, nicht als Schatten (§5.8).
- **Bytes über dem ersten Budget** (§6, §9, Punkt 4).
- **V-0243:** Die Fortschrittslinie bleibt (Silas, Punkt 19), aber als schlanke Linie unter dem
  Schriftzug ohne Wörter statt einer klebenden Leiste unten; die Legende steht ab sechs Modulen auch
  am Rechner unter dem Raster (sonst passt der Stressfall, acht Module, bei 1280 × 720 nicht ohne
  Scrollen); unter 1200 px heißen die Knöpfe „Kalender“ und „Speichern“, am Handy stehen nur ihre
  Symbole (sonst reicht der Platz neben dem mittigen Schriftzug nicht).
- **V-0225:** „Mein Plan“ und „Alle“ als Ansichten entfallen (§4.3); „Wochenskelett“ heißt „Alle
  Wochen“; die Meldung „Tippe auf eine Gruppe“ beim ersten Laden entfällt (die Lage sagt es); die
  Woche am Handy öffnet keine Karten, ein Tipp zeigt den Tag groß; die einzige Gruppe heißt auf
  der Kachel „Einzige Gruppe“; die Kachel zeigt ab 240 px den vollen Modultitel; die Legende hat
  immer alle Einträge, damit das Raster nicht springt; der Knopf auf der Kachel erst ab 160 px
  Breite (oben rechts neben dem Titel ist darunter kein Platz); zurückgenommene Gruppen tragen
  „Wechseln“; ausdrücklich abgewählte einzige Gruppen werden als `group: null` gespeichert.
- **Nicht gebaut (V-0225):** der Hinweis „war automatisch eingeplant, hat jetzt eine zweite Gruppe“.
  Ohne Speichern ist nicht zu wissen, dass ein Format früher nur eine Gruppe hatte; gespeichert
  werden darf je Format nur `group`, `digest`, `name` (ARCHITEKTUR §6). Das Format erscheint dann
  einfach wieder als offen.
- **V-0236, dunkles Schema neu geordnet** (Silas, 05.10.2026: „im Darkmode irgendwie etwas
  unstimmig“; gemessen in beiden Schemata, alle Flächen und Zustände): die mögliche Kachel dunkel
  neutral statt je Modul getönt; eingeplant dunkel die hellste Fläche (`tinte`, vorher `flaeche`
  wie automatisch); eine eigene schwebende Stufe `--ebene` für Karte, Blatt und Dialog; Rollen
  `--kontext-flaeche`/`--kontext-text`; Akzente dunkel entsättigt; Schrift 0,93/0,81 statt der
  87/60 % des Masterfiles, damit der Zweittext auf der Karte 7:1 hält (§5.2). Die Legende sagt
  „grau“ und „blass“ statt „dunkelgrau“ und „hellgrau“ (§3.1). Der dunkle Block in `web/stil.css`
  enthält nur Tokens; `web/tests/farben.test.mjs` hält das fest, dazu neutrale `hauch`, gleiche
  Werte in `recht.css` und eine gemeinsame Regel für Kachel und Legendenfeld. Die nicht mehr
  benutzte Klasse `.zahl` (Zahl am Knopf, seit V-0225 ohne Markup) ist entfernt. Der Studiengang
  füllt die Kopfzeile, sonst blieb links vom Knopfpaar ein Rest außerhalb des 4-px-Rasters (53 px
  bei 865 px, §5.6).
- **V-0234, Startbildschirm** (einflug, technisch; Silas kann es ändern):
  - **Am Ende eine Zusammenfassung mit „Stundenplan öffnen“**, statt nach der letzten Wahl sofort zu
    öffnen: Die automatisch gesetzte Ordnung soll man sehen (Silas: „gesetzt und gezeigt“), und der
    Plan öffnet sich auf eine bewusste Handlung. Das ist ein Tipp mehr (live: vier statt drei).
  - **Eine automatische Stufe wird nicht eigens gefragt**, sie steht in Leiste und Zusammenfassung;
    ein Tipp in der Leiste zeigt sie mit „Weiter“ und „Zurück“.
  - **Auch mit nur einem Plan kommt der Startbildschirm** (live heute: WI 1. FS), weil Silas mit ihm
    beginnen will und Hochschule, Studiengang und Fachsemester immer gewählt werden (`waehlen`).
    Wer vor V-0234 schon eine Auswahl hat, kommt direkt in seinen Plan.
  - **Am Handy keine Wörter unter den Balken**, dafür nennt der Satz darüber die offenen Stufen.
  - **„Weitere folgen.“** unter einer Stufe mit nur einer Option ersetzt „Weitere Studiengänge
    folgen“ im Kopf.
  - **Optionen mit gleichem Zusatz gruppiert** (Fachsemester nach Semester, Studiengänge nach
    Abschluss), damit „WiSe 2026/27“ nicht sechsmal dasteht.
  - **Der Grund für „keine Wahl ohne Überschneidung“ steht in einer Karte („Warum“)**, nicht in der
    Zeile: Er ist bis 400 Zeichen lang.
  - **`gruppen: alle`** wird nicht als Mehrfachwahl gezeigt, sondern als „alle eingeplant“
    (ARCHITEKTUR §3: Silas entscheidet, ob Pflicht oder Mehrfachwahl; die Daten bleiben dieselben).
  - **Reiter am Handy ohne „nach Studienverlaufsplan“**: Mit der Ordnung wäre die Zeile umgebrochen,
    und der Kopf hätte beim Laden seine Höhe geändert (CLS).
- **V-0237, Silas' zweiter Test** (einflug, technisch; Silas kann es ändern):
  - **„Save for later“ heißt auf der Seite „Für später speichern“**: Die Seite ist deutsch (§5.13).
  - **Auf eingeplanten Kacheln ein Kreuz statt „Lösen“**: neben dem Plus wäre ein Wort ein Bruch.
  - **Der Kontext behält sein Aussehen** (gefüllt bzw. gestrichelt in Modulfarbe) und wird nur
    durchscheinend; vorher grau gefüllt. Die Tokens `--kontext-flaeche`/`--kontext-text` sind entfernt.
  - **Was „dunkler“ beim Hinweis im Fuß heißt:** dunkel eine Stufe dunkler (`--grau-8`, 5,58:1),
    hell bleibt der Zweittext (`--grau-9`, 7,03:1), beide 12 px; die Links bleiben `--grau-9`.
  - **Ein `group: null` aus V-0225** (abgewählte einzige Gruppe) gilt wie kein Eintrag: Die Gruppe ist
    wieder ein Vorschlag. Sie ist ja nicht eingeplant, und eine Abwahl muss nicht mehr gespeichert werden.
  - **Das Plus nur am Rechner** (feiner Zeiger), wie vorher „Einplanen“: Am Handy öffnet der Tipp die
    Karte, ein 24-px-Plus wäre unter den 44 px für Touch (§5.11).
  - **Der Stressfall mit aufgeschlagenem Modul** (§8): Ohne Filter zeigt die Seite nur den Plan.
- **Nicht geändert (V-0236):** das helle Schema (Werte und Aussehen wie von Silas getestet) und der
  schwebende Umschalter am Handy; er bleibt dunkel auf `--grau-3` mit hellem Rand, damit das
  gewählte Segment heller ist als seine Schiene.
