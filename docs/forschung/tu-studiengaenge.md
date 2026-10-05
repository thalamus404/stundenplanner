# Forschung: drei weitere TU-Studiengänge im 1. Fachsemester

> **Stand 05.10.2026**, `querwind`, Vorgang V-0228 (Programm P-0006, Phase 8). Demo auf dem eigenen
> Strang `vorgang/v-0228`, **nicht live**: Vorschau https://demo-tu.stundenplanner.pages.dev.
> Wie das System heute arbeitet und welche Annahmen es macht, steht in [`../SYSTEM.md`](../SYSTEM.md);
> dieser Bericht prüft die Annahmen aus §6 dort an drei weiteren Studiengängen.

---

## 1. Ausgangsfrage

Silas, 05.10.2026: Exemplarisch für **Wirtschaftsingenieurwesen B.Sc., Informatik B.Sc. und
Betriebswirtschaftslehre B.Sc.** an der TU Berlin dasselbe wie für Wirtschaftsinformatik (WI): die
Module des 1. Fachsemesters nach der gültigen Studien- und Prüfungsordnung (StuPO), echte Daten aus
MOSES, vollständig nachgebaut. Funktioniert es dort auch gut? Was lernt man daraus für die Öffnung
in Phase 2, wenn Studiengänge in Serie dazukommen sollen?

**Kurzantwort:** Die Kette trägt. Mit einer Katalogdatei je Plan und einer engen Lockerung im Abruf
laufen alle 20 Module (WI und die drei neuen) mit 3449 echten Einzelterminen durch, und die Seite
zeigt zehn Pläne ohne Fehler. Die Probleme liegen nicht im Code, sondern **vor** ihm: welche StuPO
für wen gilt, welches Fachsemester ein Modul hat, Wahlen schon im 1. Semester, Bestandteile, die keine
Wahl sind. Und eine Überraschung: Für Informatik gibt es am 05.10.2026 **keine** Wahl ohne
Überschneidung (§4.2).

## 2. Quellen

Alle abgerufen am **05.10.2026**. Primärquellen sind die amtlich veröffentlichten StuPOs (Amtliches
Mitteilungsblatt, AMBl.) und MOSES selbst. Webseiten der TU dienen nur als Wegweiser.

| Was | Adresse |
|---|---|
| Liste aller StuPOs der TU (Filter je Studiengang) | https://www.tu.berlin/studieren/studienorganisation/pruefungen/studien-und-pruefungsordnung/ |
| Studiengangsseiten der TU | https://www.tu.berlin/studieren/studienangebot/gesamtes-studienangebot/studiengang/wirtschaftsingenieurwesen-b-sc, `…/informatik-b-sc`, `…/nachhaltiges-management-b-sc`; `…/betriebswirtschaftslehre-b-sc` antwortet **404** |
| StuPO WiIng B.Sc. 2015 (AMBl. 37/2015, Berichtigung 8/2016, 1. Änderung vom 18.01.2017) | https://www.static.tu.berlin/fileadmin/www/10000000/Studiengaenge/StuPOs/Fakultaet_VII/Wirtschaftsingenieurwesen_B.Sc._2015.pdf |
| StuPO WiIng B.Sc. 2026 (AMBl. 20/2026, in Kraft erst am 01.04.2027) | https://www.static.tu.berlin/fileadmin/www/10000000/Studiengaenge/StuPOs/Fakultaet_VII/Wirtschaftsingenieurwesen_B.Sc._2026.pdf |
| StuPO Informatik B.Sc. 2025 (AMBl. 08/2026, in Kraft am 01.10.2026) | https://www.static.tu.berlin/fileadmin/www/10000000/Studiengaenge/StuPOs/Fakultaet_IV/Informatik_B.Sc._2025.pdf |
| Verlaufspläne Informatik als Bild (neu und alt), Seite der Fakultät IV | https://www.tu.berlin/eecs/studium-lehre/studienorganisation/waehrend-des-studiums/bsc-informatik, Bilder `…/2_B_Inf/B.Sc._IN_St_verlaufsplan_StuPO2025.png` und `…/2_B_Inf/Studienverlaufsplan_BSC_Inf_22_23.png` unter https://www.static.tu.berlin/fileadmin/www/10000040/1_Studium_Lehre/1_Studienangebot/1_Bachelorstudiengaenge/ |
| StuPO Nachhaltiges Management B.Sc. 2016 mit 1. Änderung 2022 (AMBl. 05/2017, 13/2022) | https://www.static.tu.berlin/fileadmin/www/10000000/Studiengaenge/StuPOs/Fakultaet_VII/NachhaltigesManagement_B.Sc._2016.pdf |
| MOSES, Studiengangsaufbau WiIng (StuPO 2015, Modulliste WiSe 2026/27) | https://moseskonto.tu-berlin.de/moses/modultransfersystem/studiengaenge/anzeigen.html?studiengang=59&mkg=1761&semester=77 |
| MOSES, Studiengangsaufbau Informatik (StuPO 2025, WiSe 2026/27) | `…/studiengaenge/anzeigen.html?studiengang=31&mkg=24983&semester=77` |
| MOSES, Studiengangsaufbau Nachhaltiges Management („StuPO 2022“, WiSe 2026/27) | `…/studiengaenge/anzeigen.html?studiengang=135&mkg=24928&semester=77` |
| MOSES, Studiengangssuche (Suchtexte „Betriebswirt“, „BWL“, „Wirtschaft“, „Management“, „Informatik“) | https://moseskonto.tu-berlin.de/moses/modultransfersystem/studiengaenge/suchen.html |
| MOSES je Modul: Versionsliste, Modulbeschreibung, Vorlesungsverzeichnis, CSV-Export | wie im Abruf ([`../SYSTEM.md`](../SYSTEM.md) §3) |

### Liefert MOSES Studiengänge und Modullisten maschinenlesbar?

**Teilweise, und das Wichtigste fehlt.** Für jeden Studiengang (`studiengang=<id>`) gibt es je StuPO
(`mkg=<id>`) und je Semester (`semester=<id>`, 77 = WiSe 2026/27) eine **Modulliste**: einen Baum aus
Studiengangsbereichen mit **Wahlregeln** („Bestehe alle Module“, „Mind. 6 LP, Max. 6 LP“, „Mind. 1
Studiengangsbereich, Max. 1“ für die WiIng-Studienrichtungen) und den **Modulnummern mit Version und
LP**. Lesbar ist das auf zwei Wegen, beide öffentlich und ohne Login:

- die Seite selbst (JSF/PrimeFaces-Baum; die Module eines Bereichs kommen erst per Ajax „select“,
  bei manchen Studiengängen ist der Baum eingeklappt und die Spalten heißen anders)
- der Knopf **„Studiengangsaufbau“**: ein PDF mit allen Bereichen, Regeln und Tabellen
  `Titel · #Nummer v Version · LP · Prüfungsform`, mit `pypdf` sauber lesbar

**Das Fachsemester steht nirgends in MOSES.** Es kommt nur aus dem exemplarischen
Studienverlaufsplan in der StuPO, und der ist ein PDF-Raster (WiIng, NaMa) oder bei Informatik eine
Tabelle **ohne Semesterbeschriftung**. Folge für Phase 2: Modulnummern, Bereiche und Wahlregeln lassen
sich erzeugen, die Zuordnung „Modul → Fachsemester“ bleibt Handarbeit (§8). Parallel hat `steigflug`
(V-0227) die Modulliste für WI als Datei gelesen (`docs/forschung/wi-hoehere-fachsemester.md` auf
`vorgang/v-0227`); das ist derselbe Weg.

## 3. Die Studiengänge im 1. Fachsemester

### 3.1 Wirtschaftsingenieurwesen B.Sc. (Fakultät VII)

**Welche StuPO?** Die TU nennt auf der Studiengangsseite die StuPO **2026** „aktuelle Fassung (für
Studienbewerber*innen gültig)“. Sie tritt aber erst **am 01.04.2027** in Kraft und gilt für alle, die
**ab dem SoSe 2027** beginnen (§ 2 Abs. 1). Wer im WiSe 2026/27 anfängt, studiert nach der **StuPO 2015**
(mit Berichtigung 2016 und 1. Änderung 2017, die die Studienrichtung Energie und Ressourcen
hinzufügt). MOSES führt für WiIng auch nur die „StuPO 2015“.

**Verlaufsplan, Studienbeginn im WiSe, 1. Semester** (Anlage 2): Analysis I und Lineare Algebra
(12 LP), Einführung in die Informatik (6 von 9 LP), Mikroökonomik (4 LP) und das Modul der
**technischen Studienrichtung**. Die Studienrichtung wird erst „spätestens mit der Rückmeldung zum
zweiten Fachsemester“ gewählt (§ 5 Abs. 3), ihr Modul steht aber schon im 1. Semester. Es gibt sieben:

| Studienrichtung | Modul im 1. Semester | Nummer |
|---|---|---|
| Bauingenieurwesen (BI) | Statik und elementare Festigkeitslehre | 50583 |
| Chemie und Verfahrenstechnik (CVT) | Einführung in die Allgemeine und Anorganische Chemie | 20321 |
| Elektrotechnik (ET) | Grundlagen der Elektrotechnik (GLET) | 40774 |
| Energie und Ressourcen (ER) | Mechanik E | 50656 |
| Informations- und Kommunikationssysteme (IKS) | Rechnerorganisation | 40019 |
| Maschinenbau (MB) | Mechanik E | 50656 |
| Verkehrswesen (VW) | Mechanik E | 50656 |

Gemeinsam: 20122 Analysis I und Lineare Algebra für Ingenieurwissenschaften, 40013 Einführung in die
Informatik, 70188 Mikroökonomik (4 LP). Die Nummern stammen aus der MOSES-Modulliste WiSe 2026/27.
**MOSES und StuPO-Text weichen ab:** „Einführung in die Informatik“ hat laut StuPO 9 LP (6 im 1., 3 im
2. Semester), MOSES führt das Modul mit 6 LP; die BI-Pflichtmodule heißen in MOSES inzwischen „Baubetrieb
I“ und „Bauwirtschaft I“ statt „Bauwirtschaft und Baubetrieb“. Die semesterweise Modulliste ist aktueller
als der Text der StuPO.

**WiIng beginnt auch im SoSe.** Der Verlaufsplan hat einen eigenen Ablauf für Studienbeginn im SoSe;
dort sieht das 1. Semester anders aus (z. B. nur der 3-LP-Teil der Einführung in die Informatik), und ab
SoSe 2027 gilt die neue StuPO 2026. „1. Fachsemester“ allein reicht als Schlüssel also nicht.

### 3.2 Informatik B.Sc. (Fakultät IV)

**Welche StuPO?** Die **neue StuPO 2025** tritt am 01.10.2026 in Kraft und gilt für alle, die ab dem
WiSe 2026/27 beginnen. Ihre Module sind neu (in MOSES Version 1, gültig ab WiSe 2026/27); die TU-Seite
sagte noch: „Die Module der neuen StuPO 2025 werden erst zum Wintersemester 2026/27 im MTS einzusehen
sein.“ Am 05.10.2026 sind sie da, mit Terminen.

**Verlaufsplan, 1. Semester:** 20122 Analysis I und Lineare Algebra für Ingenieurwissenschaften
(12 LP), 41319 Informatik als Disziplin, 41320 Grundlagen der Programmierung, 41313 Rechnerorganisation
und Betriebssysteme (je 6 LP). Keine Wahl im 1. Semester.

**Annahme, gekennzeichnet:** Der Plan (Anlage 2 der StuPO und das Bild auf der Fakultätsseite) trägt
**keine Semesterbeschriftung**. Gelesen ist die erste Zeile als 1. Semester, weil (a) jede der drei
oberen Zeilen genau 30 LP hat, (b) der alte Plan der StuPO 2014 dieselbe Gliederung **mit**
Beschriftung hat und dort Analysis I/LinA, Rechnerorganisation, Einführung in die Programmierung und
das Propädeutikum im 1. Semester stehen (die Vorgänger der vier neuen Module), und (c) die Fakultät
„Formal-mathematische Grundlagen“ (Zeile 2) ab dem SoSe und „Theoretische Informatik“ (Zeile 3) ab dem
WiSe einführt. Eine amtliche Bestätigung fehlt.

### 3.3 Betriebswirtschaftslehre B.Sc. — gibt es an der TU Berlin nicht

Weder die StuPO-Liste der TU noch die Studiengangssuche in MOSES kennt einen Bachelor
„Betriebswirtschaftslehre“ (Suchtexte „Betriebswirt“ und „BWL“: kein Treffer; die Studiengangsseite
`…/betriebswirtschaftslehre-b-sc` antwortet 404). Die wirtschaftswissenschaftlichen Bachelor der TU
sind Wirtschaftsingenieurwesen, Wirtschaftsinformatik, Wirtschaftsmathematik, Volkswirtschaftslehre,
Volkswirtschaftslehre und Nachhaltigkeit und **Nachhaltiges Management**. Letzterer ist laut TU „eine
qualitativ hochwertige betriebswirtschaftliche Ausbildung“ und ist in der Demo der **Stellvertreter**,
im Namen als „Nachhaltiges Management (statt BWL)“ gekennzeichnet. **Ob er für Silas' Frage passt, oder
ob er BWL einer anderen Hochschule meinte, entscheidet Silas.**

**Welche StuPO?** Die StuPO vom 02.11.2016 in der Fassung der 1. Änderung vom 05.01.2022 (gilt ab WiSe
2022/23; MOSES nennt sie „StuPO 2022“). **Verlaufsplan, 1. Semester:** 70432 Grundlagen des Nachhaltigen
Managements, 70295 Mikroökonomik (6 LP), 70112 Bilanzierung und Kostenrechnung, 70202 Organisation und
Innovationsmanagement, 20367 Mathematik I für Wirtschaftswissenschaften (je 6 LP). Keine Wahl im
1. Semester.

### 3.4 Module in mehreren Studiengängen

| Modul | in |
|---|---|
| 20122 Analysis I und Lineare Algebra | Informatik und alle sieben WiIng-Pläne |
| 70112 Bilanzierung und Kostenrechnung | WI und Nachhaltiges Management |
| 40013 Einführung in die Informatik, 70188 Mikroökonomik (4 LP) | alle sieben WiIng-Pläne |
| 50656 Mechanik E | WiIng ER, MB, VW |

27 Moduleinträge in zehn Plänen, **20 verschiedene Module**: Der Abruf holt jedes Modul einmal je
Semester (`module_je_semester`), das hat ohne Änderung funktioniert. **Eine Ebene tiefer nicht:**
70188 „Mikroökonomik (4 LP)“ (WiIng) und 70295 „Mikroökonomik (6 LP)“ (NaMa) sind zwei Module mit
**denselben** Lehrveranstaltungen (Vorlesung 42, Tutorium 1583, je 9 Gruppen, 139 Termine). Sie werden
zweimal geholt, und ihre Bestandteile tragen verschiedene Kennungen (`70188:42` und `70295:42`).

## 4. Die Demo mit echten Daten

### 4.1 Zahlen

Abruf am 05.10.2026, 09:57–10:02 (5:18 min), Status `ok`, 20 Module, 44 Bestandteile, 3449
Einzeltermine. Je Plan (Bestandteile „leer“ = ohne Termingruppe im WiSe 2026/27, §4.3):

| Plan | Module | Bestandteile (leer) | Gruppen | Termine | Wahlen ohne Überschneidung |
|---|---|---|---|---|---|
| Informatik | 4 | 9 (1) | 61 | 989 | **0** |
| Nachhaltiges Management (statt BWL) | 5 | 10 (0) | 49 | 709 | 762 |
| Wirtschaftsinformatik (zum Vergleich) | 5 | 11 (0) | 65 | 949 | 33 587 |
| WiIng · Bauingenieurwesen | 4 | 9 (2) | 42 | 738 | 218 |
| WiIng · Chemie und Verfahrenstechnik | 4 | 10 (2) | 52 | 808 | 8 868 |
| WiIng · Elektrotechnik | 4 | 10 (3) | 63 | 986 | 8 492 |
| WiIng · Energie und Ressourcen / Maschinenbau / Verkehrswesen | 4 | 10 (2) | 66 | 1 031 | 5 013 |
| WiIng · Informations- und Kommunikationssysteme | 4 | 9 (2) | 53 | 866 | 3 872 |
| **WiIng gesamt** (8 verschiedene Module) | 8 | 20 | 116 | 1 661 | — |

„Wahlen ohne Überschneidung“ zählt die Kombinationen aus je einer Gruppe pro Bestandteil mit Terminen,
in denen sich keine zwei Einzeltermine echt überschneiden (dieselbe Regel wie auf der Seite). Kein Plan
hat einen 14-Tage-Rhythmus. Die WI-Zahlen sind gleich denen des Live-Abrufs (11/65/949). Die Plan-JSON
sind 300–445 KB groß, komprimiert 20–27 KB, also wie WI.

**Sichtprüfung** (Playwright, Vorschau-Adresse, je Plan 390×844 und 1440×900): alle zehn Pläne laden
ohne Skriptfehler, kein Scrollen der Standardansicht, keine waagerechte Rolle; die Wahl „Studiengang ·
Fachsemester“ listet die zehn Pläne. Eine gesetzte Auswahl in Informatik (Analysis-VL Gruppe Keiper +
Grundlagen der Programmierung, VL) meldet „1 Überschneidung“, wie es sein soll.

### 4.2 Informatik: keine Wahl ohne Überschneidung

Jede der drei Vorlesungsgruppen von Analysis I und Lineare Algebra (je drei Termine pro Woche)
überschneidet sich mit einer Pflichtvorlesung, die es nur einmal gibt:

| Analysis-VL | Termine | kollidiert mit |
|---|---|---|
| Termingruppe 1 (Winkert) | Mo 14–16, Di 16–18, Mi 14–16 | Informatik als Disziplin, VL Di 16–18 |
| Termingruppe 2 (Keiper) | Mo 10–12, Di 10–12, Do 12–14 | Grundlagen der Programmierung, VL Di 10–12 |
| Termingruppe 3 (Nabben) | Di 10–12, Mi 16–18, Do 8–10 | Grundlagen der Programmierung, VL Di 10–12 |

Auch ohne die Lerninsel als Pflichtwahl (§6) bleibt es bei null; erst ohne Analysis-Vorlesung und Lerninsel gäbe es 514 Wahlen ohne Überschneidung. Ob das so gewollt ist (etwa mit
Aufzeichnung) oder in MOSES noch geändert wird, ist offen; das System erfindet keine Ausnahme. **Für
das Produkt heißt das:** Die Seite zeigt die Überschneidung ehrlich, sagt aber nicht, dass es **keine**
Lösung gibt. Ein Studierender sucht dann vergeblich. Diese Aussage sollte das Lesemodell je Plan
rechnen und die Seite zeigen (§8, Empfehlung 6).

### 4.3 Was der Abruf zuerst nicht konnte — und die enge Lockerung

Im ersten Lauf scheiterten drei Module an `VVZ-Export fehlt`: 20122 (Analysis I/LinA), 40013
(Einführung in die Informatik) und 40774 (GLET). **Ursache:** Je ein Bestandteil hat im WiSe 2026/27
**keine einzige Termingruppe** (die Übung 20122:11966, die Übung 40013:5675, das Labor 40774:631).
MOSES zeigt dann nur den leeren Kalender; die Liste mit „Liste als Excel-Datei exportieren“ fehlt,
weil es nichts zu listen gibt. Die alte Regel verwarf deshalb jedes Mal das **ganze** Modul, auch die
geplanten Vorlesungen und Übungen (zusammen 54 Gruppen, 847 Termine).

**Lockerung, eng:** Ein Bestandteil ist nur dann „leer“ (`groups: []`, `status: "unplanned"`, kein
Export), wenn das Zielsemester gewählt ist, kein Gruppenlink und kein Kalenderereignis auf der Seite
steht **und** der Kalender selbst da ist. Sonst bleibt es ein Fehler (`VVZ ohne Gruppen in unbekanntem
Layout`), und wo Gruppen gelistet sind, gilt `VVZ-Export fehlt` wie bisher. Regel: Docstring von
`empty_component()` in `abruf/moses.py`, vier Tests in `abruf/tests/test_moses.py`, Beschreibung in
`abruf/README.md`. `steigflug` ist in V-0227 auf dieselbe Ursache gestoßen (bei Wahlpflichtmodulen)
und hat eine ähnliche, etwas weitere Lockerung gebaut; wer nach dev zusammenführt, sollte die zwei
Zusatzprüfungen von hier übernehmen.

Die bestehende Ausnahme für Gruppen eines fremden Semesters (SYSTEM §3.4) griff ein zweites Mal: In der
„Lerninsel“ von 20122 listet MOSES eine Gruppe mit 60 Buchungen des SoSe 2026.

Dazu im selben Commit: **2 s Pause zwischen zwei Modulen** (`abruf.PAUSE_MODULE`, Punkt aed3e76c), nie
parallel. Der Lauf über 20 Module dauert damit gut fünf Minuten.

## 5. Was ohne Änderung funktioniert

- **Ein Studiengang ist eine Katalogdatei.** Zehn Pläne aus neun neuen Dateien, ohne eine Zeile Code
  in Lesemodell oder Seite. Die Wahl „Studiengang · Fachsemester“ der Seite zeigt sie alle.
- **Jedes Modul einmal je Semester**, auch wenn es in acht Plänen steht (27 Einträge, 20 Abrufe).
- **Die MOSES-Logik** (Versionswahl, Modulbeschreibung, Vorlesungsverzeichnis, CSV-Export,
  Semesterprüfung, Ausnahme für fremde Gruppen) trägt bei 17 von 20 Modulen sofort und bei allen 20
  nach der Lockerung, auch bei **ganz neuen Modulen** (Informatik, Version 1) und bei anderen Arten von
  Bestandteilen (`LI` Lerninsel, `LAB`, `SEM`, `Praktikum`, `IV`).
- **Lesemodell und Seite:** Slots, Fingerabdruck, Konflikte über alle Einzeltermine, Hinweis „ohne
  Termine“ für leere Bestandteile, Teilen-Link je Plan. Größe je Plan wie bei WI.

## 6. Was nicht funktioniert, und warum

| Was | Warum | Heute in der Demo |
|---|---|---|
| **BWL** | gibt es an der TU nicht | Stellvertreter Nachhaltiges Management, gekennzeichnet |
| **Studienrichtung im 1. Semester** (WiIng) | Der Katalog kennt je Studiengang, Semester und Fachsemester genau einen Plan mit festen Modulen, keine Wahl (SYSTEM §6, Annahme 1) | ein Plan je Studienrichtung: sieben WiIng-Einträge in der Wahl, drei davon inhaltsgleich |
| **Keine Wahl ohne Überschneidung** (Informatik) | so stehen die Termine in MOSES (§4.2) | sichtbar als Überschneidung, aber nicht als „unlösbar“ |
| **Bestandteile, die keine Wahl sind** | Die Seite verlangt je Bestandteil genau eine Gruppe (Annahmen 3 und 5). Die **Lerninsel** von 20122 ist ein offenes Lernangebot mit 27 „Gruppen“ (Stunden-Slots im Raum E-N 004, dazu ganztägige), keine Gruppe zum Wählen. Bei 70202 sind die zwei **Vorlesungs-„Gruppen“ zwei Teile** (wöchentlich bis 09.12., dann ein Block 14.–16.12.); wer eine wählt, verliert die andere aus dem Plan | Lerninsel als Pflichtwahl, sie füllt das Raster; Organisation und Innovationsmanagement zeigt nur einen Teil |
| **Leere Bestandteile zählen als offen** | „x von N gewählt“ und „Alles eingeplant“ zählen alle Bestandteile, auch die ohne Gruppe | WiIng-ET kann höchstens „7 von 10“ erreichen |
| **Wie Gruppen vergeben werden** | MOSES-Anmeldung, Einteilung über ISIS in der ersten Woche (41320, Praktikum 20321), „keine Anmeldung erforderlich“ (70202). Das steht nur in den Hinweisen (Annahme 4) | die Seite tut so, als wähle man frei |
| **Dieselbe Lehrveranstaltung in zwei Modulen** | Mikroökonomik 4 LP / 6 LP | doppelt geholt, Auswahl wandert nicht mit |

## 7. Erkenntnisse

1. **Der teure Teil ist der Katalog, nicht der Abruf.** Code für einen neuen Studiengang: null Zeilen.
   Recherche je Studiengang: 20–60 Minuten, und jede Stunde davon steckte in Fragen, die ein Mensch
   beantworten muss: welche StuPO, welches Semester, was ist Wahl.
2. **Die gültige StuPO hängt am Studienbeginn, nicht am Datum der neuesten Ordnung.** WiIng: Die als
   „aktuell“ verlinkte StuPO 2026 gilt erst ab SoSe 2027. Informatik: Die neue StuPO 2025 gilt ab genau
   diesem Semester, mit lauter neuen Modulen. Ein Katalog, der „die neueste StuPO“ nimmt, wäre für WiIng
   falsch und für Informatik richtig.
3. **MOSES weiß die Module, aber nicht das Semester.** Modullisten mit Wahlregeln sind maschinenlesbar
   (§2), der Studienverlaufsplan ist es nicht. Und MOSES ist aktueller als der StuPO-Text (LP, Titel,
   umbenannte Module): Nummern aus MOSES, Fachsemester aus der StuPO.
4. **„1. Fachsemester“ ist kein fester Begriff.** WiIng hat einen eigenen Ablauf für Beginn im SoSe;
   WiIng hat eine Wahl schon im 1. Semester; NaMa und Informatik haben keine.
5. **Der Wochenplan ist nicht immer „eine Gruppe je Bestandteil“.** Lerninseln, geteilte
   Vorlesungen, Übungen ohne Termin, Einteilung statt Wahl: Je mehr Studiengänge, desto öfter.
6. **Der Planer findet echte Probleme.** Informatik hat am 05.10.2026 keine überschneidungsfreie Wahl.
   Das ist für Erstsemester wertvoll, wenn die Seite es klar sagt.

## 8. Problemstellen nach Gewicht, und Empfehlung für Phase 2

### Problemstellen

| Gewicht | Problemstelle | Wo |
|---|---|---|
| **hoch** | Gültige StuPO je Kohorte (Studienbeginn) unklar; falsche StuPO = falsche Module | Katalog |
| **hoch** | Wahl im Plan (Studienrichtung, „wähle 1 aus n“) nicht abbildbar | Katalog, Lesemodell, Seite |
| **hoch** | Fachsemester nur aus PDF oder Bild, teils ohne Beschriftung | Katalog (Handarbeit) |
| **hoch** | Keine Aussage „es gibt keine Wahl ohne Überschneidung“ | Lesemodell, Seite |
| mittel | Bestandteile, die keine Wahl sind (Lerninsel), und Gruppen, die Teile sind (70202) | Lesemodell, Seite |
| mittel | Leere Bestandteile zählen als offen | Seite |
| mittel | Vergabeweg der Gruppen (MOSES, ISIS, Einteilung) nur im Hinweistext | Seite |
| mittel | Studienbeginn im SoSe hat ein anderes 1. Fachsemester | Katalog |
| niedrig | Dieselbe Lehrveranstaltung unter zwei Modulnummern | Abruf |
| niedrig | Gruppennummer aus dem Namen geraten: „AnaLinA Space im E-N 004“ heißt „Gruppe 004“ (Raum), „Termingruppe 2 Keiper“ „Gruppe 2“ | Seite |
| niedrig | Lange Namen in der Planwahl, Reihenfolge nach Kennung (ET nach ER) | Katalog, Seite |
| niedrig | Wonach Nutzer suchen („BWL“) und wie die TU es nennt, weicht ab | Katalog |

### Empfehlung: Studiengänge in Serie aufnehmen

1. **Katalog in zwei Hälften.** (a) **Erzeugt**: je Studiengang, StuPO und Semester die MOSES-Modulliste
   (Bereiche, Wahlregeln, Nummern, Version, LP), über das PDF „Studiengangsaufbau“ oder den Baum; so wie
   `steigflug` es für WI in V-0227 begonnen hat. (b) **Von Hand**, klein: je Studiengang und Studienbeginn
   die Verlaufsplan-Zuordnung „Fachsemester → Modulnummern bzw. Bereich“, mit Quelle und Abrufdatum. Ein
   Prüfschritt vergleicht (b) mit (a): Jede Nummer muss in der Modulliste der StuPO stehen, Titel und LP
   werden gegenübergestellt (fängt 40013: 9 statt 6 LP).
2. **Gültigkeit in den Katalog.** Je Plan `stupo` und für welche Kohorte sie gilt (Studienbeginn ab/bis),
   aus § 2 der StuPO abgeschrieben. Der Prüfschritt warnt, wenn eine neuere StuPO für die Kohorte gilt.
3. **Wahl im Katalog.** Ein Plan darf Varianten haben („Studienrichtung: BI | CVT | …“), die je ein
   Modul tauschen, und Wahlbereiche („wähle k aus n“, wie V-0227 für Wahlpflicht). Dann ist WiIng ein
   Plan mit einer Frage statt sieben Einträgen.
4. **Bestandteile kennzeichnen** statt Regeln erfinden: optional (Lerninsel), „Gruppen sind Teile“
   (70202), „ohne Termine“. Woher die Kennzeichnung kommt (Art `LI`, Namensmuster, Hand), entscheidet
   eine kleine Liste im Katalog mit Quelle, nicht eine Heuristik im Code.
5. **Abruf:** je Lauf jede Lehrveranstaltung (`veranstaltungsvorlage`) einmal statt jedes Modul einmal;
   eine Obergrenze je Lauf (Punkt aed3e76c); die Pause steht.
6. **Ein Prüfstein je Plan:** Das Lesemodell rechnet „gibt es eine Wahl ohne Überschneidung?“ (für zehn
   Pläne unter einer Sekunde mit Rückverfolgung). Ist die Antwort nein, sagt die Seite es, und der Bau
   nennt es in seiner Ausgabe, damit ein Mensch nachsieht, ob der Katalog stimmt.
7. **Reihenfolge:** zuerst Studiengänge ohne Wahl im 1. Semester und mit vielen Erstsemestern
   (z. B. Informatik, Maschinenbau, Elektrotechnik, Wirtschaftsmathematik), dann die mit Studienrichtungen,
   sobald Punkt 3 steht. Fakultätsweise, weil Verlaufspläne einer Fakultät gleich aussehen.

### Aufwand je Studiengang

| | Recherche und Katalog von Hand (heute) | Abruf | mit Empfehlung 1–3 |
|---|---|---|---|
| Informatik | ~40 min (neue StuPO, Plan ohne Semesterbeschriftung, Gegenprobe am alten Plan) | 4 Module, ~1 min | ~15 min |
| Wirtschaftsingenieurwesen | ~60 min (Falle StuPO 2026, sieben Studienrichtungen, MOSES ≠ StuPO-Text) | 8 Module, ~2 min | ~20 min |
| Nachhaltiges Management | ~20 min, dazu ~15 min für „BWL gibt es nicht“ | 5 Module, ~1,5 min | ~10 min |
| Lockerung im Abruf (einmalig) | ~45 min Ursache, Regel, Tests | | |

Je Modul dauert der Abruf rund 15 s (5:18 min für 20 Module, mit 0,7 s je Anfrage und 2 s zwischen
Modulen). Hundert Studiengänge mit je fünf Modulen im 1. Semester wären mit vielen geteilten Modulen
grob 200–300 Module, also eine gute Stunde je Lauf: einmal am Tag vertretbar, mit Obergrenze und
LV-Dedupe (Empfehlung 5) deutlich weniger.

## 9. Was Silas entscheiden muss

- **BWL:** Ist Nachhaltiges Management der richtige Stellvertreter, oder war BWL einer anderen
  Hochschule gemeint (dann gilt SCOPE §5 „keine anderen Hochschulen“)?
- **Informatik:** Soll die Seite einen Plan ohne überschneidungsfreie Wahl so zeigen, mit einem klaren
  Satz, oder soll so ein Plan erst nach einer Rückfrage bei der Fakultät erscheinen?
- **Studienrichtungen:** Varianten in einem Plan (Empfehlung 3) oder ein Eintrag je Richtung, wie in der
  Demo?

## 10. Die Demo nachbauen

```sh
python3 abruf/abruf.py --roh daten/roh            # 20 Module, gut 5 min, höflich
python3 abruf/bauen.py --roh daten/roh            # 10 Pläne nach web/daten/
python3 -m http.server -d web 8000                # ansehen
```

Katalog: `katalog/studiengaenge/in-bsc.json`, `nama-bsc.json`, `wiing-bsc-<richtung>.json`, jede mit
Quelle und Stand in `quelle`. Die Rohstände liegen nicht im Repo (`daten/` ist ignoriert).
