# Höhere Fachsemester der Wirtschaftsinformatik B.Sc. — Lösungsplan und Demo

> **Forschung V-0227** (P-0006, Phase 8), steigflug, 05.10.2026. Auftrag von Silas, 05.10.2026.
> **Demo-Strang, nicht live:** Zweig `vorgang/v-0227`, Vorschau
> <https://demo-wi-hoehere.stundenplanner.pages.dev>. Ob und wie das in Phase 2 nach `dev` geht,
> entscheidet Silas. Was hier „Ersatzdaten“ heißt, sind die **echten Termine des SoSe 2026**,
> gezeigt für Fachsemester, die erst im SoSe 2027 liegen.

**Zusammenfassung.** Der Stundenplanner trägt die höheren Fachsemester der WI, wenn drei Dinge
dazukommen, die das 1. Fachsemester nicht brauchte: **Wahlpflichtbereiche** (ab FS 3/4, im 5./6. FS
fast alles), **zwei Prüfungsordnungen** gleichzeitig (StuPO 2021 für alle, die vor dem WiSe 2026/27
begonnen haben, StuPO 2025 für die Neuen) und **Fachsemester im Sommer**, für das MOSES im Winter
noch keine Termine hat. Die Modullisten der Wahlpflicht muss niemand abschreiben: **MOSES liefert sie
maschinenlesbar** (Studiengangsaufbau im MTS); nur das Fachsemester steht allein im
Studienverlaufsplan der StuPO. Die Demo baut daraus 10 Pläne mit echten Daten: 320 Module,
9 444 Einzeltermine. Der schwerste Befund kam aus den Daten selbst: **MOSES-Gruppen sind
Planungsgruppen**; bei vier von 92 Modulen mit Terminen im WiSe 2026/27 gehören zwei Vorlesungsgruppen zusammen, statt
Alternativen zu sein, darunter Marketing und Produktionsmanagement im 3. FS der StuPO 2021. Das muss
vor einer Öffnung entschieden werden (P1).

---

## 1. Ausgangsfrage

Die erste Fassung kann genau einen Fall: **WI B.Sc., 1. Fachsemester, WiSe 2026/27**, fünf
Pflichtmodule, von Hand aus dem Studienverlaufsplan abgeschrieben (docs/SYSTEM.md). Silas fragt:

1. Wie ist es für das **2. bis 6. Fachsemester** derselben Wirtschaftsinformatik?
2. Ein ganz detaillierter **Lösungsplan**.
3. Ein **Testfall mit echten MOSES-Daten** nach der neuen Logik, der den Stundenplan baut, als
   **fertige Demo aller höheren Fachsemester** auf einem eigenen Strang.
4. **Erkenntnisse und Problemstellen**, aus denen sich die Öffnung für mehr Leute in Phase 2
   planen lässt.

Geprüft wird dabei jede Annahme aus docs/SYSTEM.md §6. Ergebnis vorweg: Vier der sieben Annahmen
brechen ab dem 3. Fachsemester, eine halb (Abschnitt 3).

## 2. Quellen

Alle abgerufen am **05.10.2026**. Nichts geraten: Was nicht aus diesen Quellen folgt, steht als
Vermutung da.

| # | Quelle | Adresse | Was daraus folgt |
|---|---|---|---|
| Q1 | **StuPO 2025**, Studien- und Prüfungsordnung B.Sc. Wirtschaftsinformatik vom 13.10.2025, AMBl. TU Nr. 04/2026 (02.03.2026), S. 13–26, „berichtigt“ | <https://www.static.tu.berlin/fileadmin/www/10002457/K3-AMBl/AMBl_2026/AMBl._Nr._04_2026_BSc_Wirtschaftsinformatik_AEnderSa_MSC_ISM_ZZO_Fak._IV_berichtigt.pdf> | § 2 Inkrafttreten 01.10.2026, gilt für Immatrikulation ab WiSe 2026/27, Wechsel bis 30.09.2029; § 5 Gliederung (Pflicht 108 LP, Wahlpflicht 54 LP in fünf Bereichen, Wahl 18 LP); Anlage 1 Modulliste; Anlage 2 Studienverlaufsplan (nur als Bild) |
| Q2 | **StuPO 2021**, vom 14.04.2021 (AMBl. TU 14/2021 S. 142), mit Korrektur, 1. Änderung (24.11.2021) und 2. Änderung (06.11.2024) | <https://www.static.tu.berlin/fileadmin/www/10000000/Studiengaenge/StuPOs/Fakultaet_IV/Wirtschaftsinformatik_B.Sc._2021.pdf> | § 5 Gliederung (Pflicht 117 LP, Wahlpflicht 36–39 LP: Kataloge Informatik und Wirtschaftswissenschaften je ≥ 12 LP, ein Seminar, ein Projekt, Programmierpraktikum 6 LP; Wahl 12–15 LP); Anlage 2 Studienverlaufsplan (als Text lesbar). Tritt nach Q1 § 2 Abs. 3 am 30.09.2029 außer Kraft |
| Q3 | Studienverlaufsplan StuPO 2025 (Bild der Fakultät IV) | <https://www.static.tu.berlin/fileadmin/www/10000040/1_Studium_Lehre/1_Studienangebot/1_Bachelorstudiengaenge/4_B_WI/BSc_WIWS2026_27_Studienverlaufsplan.png> | Module je Fachsemester (Tabelle 3.2) |
| Q4 | Studienverlaufsplan StuPO 2021 (Bild) | <https://www.static.tu.berlin/fileadmin/www/10000040/1_Studium_Lehre/1_Studienangebot/1_Bachelorstudiengaenge/4_B_WI/Studienverlaufsplan_BA_WI_22_23.png> | deckt sich mit Anlage 2 von Q2 |
| Q5 | Studiengangsseite der Fakultät IV | <https://www.tu.berlin/eecs/studium-lehre/studienorganisation/waehrend-des-studiums/bsc-wirtschaftsinformatik> | „Neuausrichtung“ zum WiSe 2026/27, Verweis auf die Moduldatenbank (MTS) als „aktuelle Übersicht aller Module“ |
| Q6 | Informationen zum StuPO-Wechsel 2025 | <https://www.tu.berlin/eecs/studium-lehre/studienorganisation/waehrend-des-studiums/bsc-wirtschaftsinformatik/informationen-zum-stupo-wechsel-2025> | Wechsel frühestens ab Oktober 2026, unwiderruflich, empfohlen in den ersten zwei Monaten; Tabelle „Was ändert sich?“ |
| Q7 | Äquivalenzliste StuPO 2021 → 2025 (13.02.2026) | <https://www.static.tu.berlin/fileadmin/www/10000040/1_Studium_Lehre/1_Studienangebot/1_Bachelorstudiengaenge/4_B_WI/20260213_AEquivalenzliste_B.Sc._WI_StuPO_25_final.pdf> | welches alte Modul in welchem neuen Bereich angerechnet wird (z. B. Statistik II → Vertiefung WiWi, ISDA → Datenmanagement und Datensysteme) |
| Q8 | **MOSES, Modultransfersystem, Studiengangsseite WI** (öffentlich, ohne Login) | `https://moseskonto.tu-berlin.de/moses/modultransfersystem/studiengaenge/anzeigen.html?studiengang=121&mkg=<StuPO>&semester=<Liste>`; StuPO 2025 = `mkg=24980`, StuPO 2021 = `24921`, StuPO 2015 = `24514`; Liste WiSe 2026/27 = `77`, SoSe 2026 = `76` | Kopf: **Turnus „Wintersemester“** (Studienbeginn nur im Winter); Studiengangsaufbau als Baum mit Modulzuordnungen und Regeln je Bereich. Für StuPO 2025 gibt es nur die Liste WiSe 2026/27 |
| Q9 | MOSES, Vorlesungsverzeichnis, Semesterwahl einer beliebigen Veranstaltungsvorlage | z. B. `…/verzeichnis/veranstaltungen/vorlage.html?veranstaltungsvorlage=4940` | SoSe 2026 (`76`) und WiSe 2026/27 (`77`) wählbar, **SoSe 2027 (`78`) gesperrt** |
| Q10 | MOSES, Modulbeschreibung (Beispiel 40029, Version 7) | `…/bolognamodule/beschreibung/anzeigen.html?number=40029&version=7` | „Diese Modulversion wird in folgenden Studiengängen verwendet“ (Studiengang/StuPO, erste und letzte Verwendung) und „kann in folgenden Semestern begonnen werden“; **kein Fachsemester** |
| Q11 | TU Berlin, Studierendensekretariat, Fristen und Termine | <https://www.tu.berlin/studierendensekretariat/fristen-und-termine-fuer-die-bewerbung-einschreibung-an-der-tu-berlin> | Vorlesungszeit SoSe 2026: 13.04.–18.07.2026; WiSe 2026/27: 12.10.2026–13.02.2027; SoSe 2027: 12.04.–17.07.2027 |

**Widerspruch zwischen den Quellen, nebenbei:** Q6 nennt für die StuPO 2021 „Grundlagen der
Wirtschaftsinformatik (24 LP)“ und „Grundlagen der Betriebswirtschaft (30 LP)“, Q2 § 5 Abs. 3 und
die Modulliste umgekehrt (30 und 24). Es gilt die Ordnung (Q2). Auch die Liste
„Gesellschaftliche Verantwortung und Nachhaltigkeit“ weicht ab: Anlage 1 von Q1 nennt sieben
Module, MOSES (Q8) sechs, darunter eines, das in Q1 fehlt („Cradle to Cradle …“), während zwei aus
Q1 in MOSES fehlen. Q1 sagt selbst, dass die semesterweise veröffentlichte Modulliste gilt
(Anlage 1, Hinweise). **Maßgeblich ist deshalb die MOSES-Liste des Semesters**, nicht die PDF.

## 3. Was sich gegenüber dem 1. Fachsemester ändert

### 3.1 Die Annahmen aus docs/SYSTEM.md §6, geprüft

| Annahme (SYSTEM §6) | ab FS 2 | Beleg |
|---|---|---|
| 1. Pflicht statt Wahlpflicht | **bricht ab FS 3 (StuPO 2025) bzw. FS 4 (StuPO 2021)**. Im 5. und 6. FS gibt es fast nur Wahlpflicht | Q1 § 5 Abs. 4, Q2 § 5 Abs. 4, Q3, Q4 |
| 2. Ein Fachsemester = ein Semester | **bricht**: gerade FS liegen im SoSe, ungerade im WiSe (Studienbeginn nur im Winter). Für das SoSe 2027 hat MOSES noch keine Termine | Q8 (Turnus), Q9 |
| 3. Alle Bestandteile sind zu belegen | gilt weiter als Annahme, ungeprüft wie in FS 1 | — |
| 4. Keine Gruppenbindungen | **bricht**: In vier Modulen gehören zwei Gruppen derselben Vorlesung zusammen (beide besuchen), die Regel „eine Gruppe je Bestandteil“ (SYSTEM §5) passt dort nicht | E5 |
| 5. Eine Gruppe ist eine Einheit | **bricht** an mindestens einem Pflichtmodul: Eine Übungsgruppe bündelt vier Wahltermine. Dazu haben Projekte und Seminare oft **keine festen Termine** (Gruppen ohne Buchungen) | E5, 8.3 |
| 6. Nur MOSES | gilt | — |
| 7. Der Katalog ist Handarbeit | **halb widerlegt**: Die Modullisten (welche Module in welchem Bereich, LP, Turnus, Regeln) liefert MOSES maschinenlesbar. Das **Fachsemester** liefert es nicht | Q8, Q10 |

Dazu kommt, was SYSTEM §6 nicht kannte:

- **Zwei Prüfungsordnungen gleichzeitig.** Seit dem 01.10.2026 gilt für Neue die StuPO 2025; wer
  vorher angefangen hat, studiert (meist) nach der StuPO 2021 und darf bis 30.09.2029 wechseln,
  unwiderruflich (Q1 § 2, Q6). Die StuPO 2015 steht noch in MOSES (Q8) und gilt nach der
  2. Änderung der StuPO 2021 bis 30.09.2027 (Q2, Anhang „Zweite Änderung“), betrifft aber nur
  Langzeitstudierende.
- **Wer heute in welchem Fachsemester ist:**

| Semester | FS 1 | FS 2 | FS 3 | FS 4 | FS 5 | FS 6 |
|---|---|---|---|---|---|---|
| WiSe 2026/27 | StuPO 2025 (Jahrgang 26/27) | – | StuPO 2021 (Jg. 25/26) oder gewechselt | – | StuPO 2021 (Jg. 24/25) oder gewechselt | – |
| SoSe 2027 | – | StuPO 2025 (Jg. 26/27) | – | StuPO 2021 (Jg. 25/26) oder gewechselt | – | StuPO 2021 (Jg. 24/25) oder gewechselt |
| WiSe 2027/28 | StuPO 2025 | – | **StuPO 2025** erstmals regulär | – | StuPO 2021 oder gewechselt | – |

  Wer regulär studiert, ist im Winter in FS 1, 3 oder 5, im Sommer in FS 2, 4 oder 6. Teilzeit,
  Urlaubssemester und Wiederholungen verschieben das (dazu 10., P7).

### 3.2 Die Studienverlaufspläne (Q3, Q4)

**StuPO 2025** (Q3; Modulnummern aus Q8, Liste WiSe 2026/27):

| FS | Semester | Pflicht (Modulnummer) | Wahlpflicht | Frei |
|---|---|---|---|---|
| 1 | WiSe | Statistik I (70450), TechGI (40271), Prog I (41077), Einf. WI (70123), BuK (70112) | – | – |
| 2 | SoSe | Analysis I und Lineare Algebra (20122, 12 LP), Prog II (41262), Engineering verteilter Anwendungen (41284), Investition und Finanzierung (70174) | – | – |
| 3 | WiSe | Datenmanagement und Datensysteme (41286), Software & Business Engineering (41285), Platform Economics (70501) | **Gesellschaftliche Verantwortung und Nachhaltigkeit** 6 LP (6 Module), **Wirtschaftswissenschaftliche Grundlagen** 6 LP (3 Module) | – |
| 4 | SoSe | Grundlagen von Data Science und AI (41231), Security & Privacy Engineering (41287), Geschäftsprozesse (40064) | **Programmierpraktikum** 6 LP (29 Module) | Freie Wahl, anteilig |
| 5 | WiSe | – | **Vertiefung Informatik** 18–27 LP (82 Module), **Vertiefung Wirtschaftswissenschaften** 9–18 LP (52 Module), über FS 5–6; zusammen ein Seminar ≥ 3 LP und ein Projekt ≥ 6 LP | Freie Wahl, anteilig |
| 6 | SoSe | – | Vertiefungen (Rest) | Freie Wahl (Rest, gesamt 18 LP), Bachelorarbeit 12 LP |

**StuPO 2021** (Q2 Anlage 2, Q4; Modulnummern aus Q8):

| FS | Semester | Pflicht (Modulnummer) | Wahlpflicht | Frei |
|---|---|---|---|---|
| 1 | WiSe | Analysis I und Lineare Algebra (20122), Prog I (41077), Einf. WI (70123), Theoretische Grundlagen der Informatik (40743) | – | – |
| 2 | SoSe | Statistik I (70450), Architektur von Anwendungssystemen (41277), Prog II (41262), BuK (70112), Organisation und Innovationsmanagement (70202) | – | – |
| 3 | WiSe | Statistik II (70232), TechGI (40271), Softwaretechnik und Programmierparadigmen (40029), OR-Grundlagen (70146), Marketing und Produktionsmanagement (70183) | – | – |
| 4 | SoSe | Informationssysteme und Datenanalyse (40002), Einführung in die IT-Sicherheit (41034, 3 LP), Geschäftsprozesse (40064), Investition und Finanzierung (70174) | **Programmierpraktikum** 6 LP (29–31 Module) | – |
| 5 | WiSe | Informatik und Gesellschaft (40499) | **Katalog Informatik** und **Katalog Wirtschaftswissenschaften** (je 12–21 LP, zusammen 30–33 LP über FS 5–6; ein Seminar, ein Projekt) | Wahlbereich 12–15 LP |
| 6 | SoSe | – | Kataloge (Rest) | Wahlbereich (Rest), Bachelorarbeit 12 LP |

Die Demo baut **StuPO 2025 FS 2–6** und **StuPO 2021 FS 3–6**. StuPO 2021 FS 2 fehlt absichtlich:
Nach ihr beginnt seit dem WiSe 2026/27 niemand mehr, im SoSe 2027 ist dort regulär niemand.

## 4. Datenmodell

Rückwärtsverträglich: **Ein Katalog ohne die neuen Felder ergibt Byte für Byte dasselbe
Lesemodell wie vorher.** Die Schlüsseltests aus `abruf/tests/test_bauen.py` (ARCHITEKTUR §5,
„genau diese Schlüssel“) laufen unverändert grün; die neuen Schlüssel erscheinen nur, wenn der
Katalog sie nennt.

### 4.1 Katalog

```
katalog/
  semester/sose-2026.json              neu: Ersatzsemester
  studiengaenge/wi-bsc.json            + "ordnung": "StuPO 2025", Pläne FS 2–6
  studiengaenge/wi-bsc-stupo2021.json  neu: dieselbe WI nach StuPO 2021, FS 3–6
  modullisten/<studiengang>-<stupo>-<liste>.json   neu: erzeugt von abruf/modulliste.py
```

**Semester** — zwei neue, freiwillige Felder:

```json
{ "id": "sose-2026", "label": "SoSe 2026 (Ersatz für SoSe 2027)", "moses": "SoSe 2026",
  "anker": "2026-04-13", "ersatz_fuer": "SoSe 2027", "quelle": "Vorlesungszeit … (Q11) …" }
```

`ersatz_fuer` macht Ersatzdaten zu einer Eigenschaft der Daten, nicht des Textes: Index, Plan und
Seite tragen sie mit. Der Anker 13.04.2026 ist der erste Vorlesungstag des SoSe 2026 (Q11), ein
Montag.

**Studiengang** — `ordnung` (freiwillig). Zwei Ordnungen desselben Studiengangs sind in der Demo
**zwei Katalogdateien** mit eigener `id` (`wi-bsc`, `wi-bsc-stupo2021`). Das braucht keine Änderung
an Index, Plandateinamen oder Speicherschlüsseln. Für Phase 2 ist eine eigene Ebene „Ordnung“
sauberer (10., P1).

**Plan** — zwei neue, freiwillige Listen:

```json
{ "semester": "wise-2026-27", "fachsemester": 5, "quelle": "StuPO 2021 … Anlage 2 …; MTS-Modulliste …",
  "module": [ { "nummer": "40499", "kurz": "Inf & Ges" } ],
  "wahlpflicht": [
    { "id": "inf", "kurz": "WP Informatik", "name": "Wahlpflicht Katalog Informatik",
      "modulliste": "wi-bsc-stupo2021-wise-2026-27", "bereich": "Wahlpflichtbereich/Informatik",
      "anteil": "Wahlpflicht 30–33 LP über das 5. und 6. FS, aus jedem Katalog mindestens 12 LP …" } ],
  "frei": [ { "name": "Wahlbereich", "anteil": "12–15 LP über das 5. und 6. FS", "hinweis": "…" } ] }
```

- **`module`** bleibt, was es war: Pflichtmodule des Fachsemesters, von Hand aus dem
  Studienverlaufsplan, mit Kurznamen.
- **`wahlpflicht[]`** nennt **keine Module**, sondern einen Bereich einer Modulliste. Welche Module
  dazugehören, LP, Turnus, Unterbereich (z. B. „Projekte“, „Seminare“) und die LP-Grenzen kommen aus
  MOSES. Abgeschrieben wird nur, was MOSES nicht weiß: welcher Bereich in welchem Fachsemester
  dran ist, und der Anteil des Fachsemesters am Bereich (`anteil`, Text aus dem Studienverlaufsplan).
- **`frei[]`** sind Hinweise ohne Module: Wahlbereich bzw. Freie Wahl (aus dem ganzen Angebot der
  TU, keine Liste) und die Bachelorarbeit (keine Termine).
- Eine Vertiefung, die über zwei Fachsemester geht, steht in beiden Plänen. Die LP-Grenzen gelten
  für den Bereich, nicht für das Fachsemester; die Seite zeigt beides.

**Modulliste** (`katalog/modullisten/*.json`, erzeugt, mit Quelle und Abrufzeit):

```json
{ "quelle": "https://moseskonto…/anzeigen.html?studiengang=121&mkg=24980&semester=77",
  "abgerufen_am": "2026-10-05T09:44:45+02:00",
  "studiengang": { "moses_id": 121, "name": "Wirtschaftsinformatik", "kurz": "WI",
                   "abschluss": "Bachelor of Science", "turnus": "Wintersemester" },
  "stupo": { "moses_id": 24980, "label": "StuPO 2025" }, "liste": { "moses_id": 77, "label": "WiSe 2026/27" },
  "bereiche": [ { "name": "Wahlpflichtbereich", "schluessel": "0_1", "lp_min": 54, "lp_max": 54,
      "regeln": [ "…" ], "module": [],
      "bereiche": [ { "name": "Vertiefung Informatik", "lp_min": 18, "lp_max": 27, "bereiche": [
          { "name": "Projekte", "lp_min": 6, "module": [ { "nummer": "…", "version": 1, "titel": "…",
              "lp": 12, "benotet": "Benotet", "pruefungsform": "Portfolioprüfung",
              "turnus": "WiSe/SoSe", "gewicht": "1.0", "url": "…" } ] } ] } ] } ] }
```

### 4.2 Was wo entschieden wird

| Information | Quelle | Wo im Repo | Wer pflegt |
|---|---|---|---|
| Module eines Wahlpflichtbereichs, LP, Turnus, Unterbereich, LP-Grenzen | MOSES MTS (Q8) | `katalog/modullisten/` | `abruf/modulliste.py`, je Semester neu |
| Pflichtmodule je Fachsemester, Bereich je Fachsemester, Anteil | Studienverlaufsplan (Q1/Q2 Anlage 2, Q3/Q4) | `katalog/studiengaenge/` | Mensch, mit Quelle |
| Welche Ordnung jemand hat | nur der Mensch selbst (Q6) | Wahl auf der Seite | Nutzer |
| Termine | MOSES VVZ, CSV-Export | Rohstand | `abruf/abruf.py`, täglich |

## 5. Abruf

- **`abruf/modulliste.py` (neu).** Liest die Studiengangsseite (Q8): Kopf (Name, Kurzname,
  Abschluss, Turnus, gewählte StuPO und Liste), dann den Baum der Bereiche. Die Seite rendert nur die
  erste Ebene; das Aufklappen per Ajax (`<baum>_expand`) gibt in dieser PrimeFaces-Fassung (14.0)
  den Baum unverändert zurück. Die **Auswahl** eines Knotens per Zeilenschlüssel (`0_1_4`)
  funktioniert dagegen auf jeder Tiefe, auch ungerendert, und liefert per Ajax den Bereich mit
  Modulzuordnungen und Regeln. Also: Tiefensuche, je Knoten die Kinder `<rk>_0`, `<rk>_1`, … bis
  eine Auswahl leer zurückkommt. Je Bereich zwei Anfragen, 1 s Abstand, für WI gut eine Minute je Liste.
- **Kandidaten im Abruf.** `abruf.py` liest für jeden Plan die Kandidaten seiner Wahlpflichtbereiche
  aus der Modulliste und holt sie wie Pflichtmodule, **jedes Modul einmal je Semester**, auch wenn es
  in mehreren Plänen oder Ordnungen steht (Q8: StuPO 2025 und 2021 teilen 172 von 212 ihrer Module).
- **Turnusfilter.** Ein Kandidat, dessen Turnus laut MTS nur das andere Semester ist, wird nicht
  geholt (`k.A.` wird geholt). Abschaltbar mit `--alle-kandidaten`; für das WiSe 2026/27 lief die
  Demo ohne Filter, um ihn zu messen (8.3).
- **Ein Kandidat ohne Angebot ist kein Fehler des Laufs.** `status` und `errors` von `_lauf.json`
  richten sich nur nach Pflichtmodulen; Kandidaten stehen unter `kandidaten: {module, fehler}`.
- **Ein Bestandteil ohne Termine im Semester** (keine Gruppen, kein Listenexport) ergibt
  `unplanned` statt `VVZ-Export fehlt`. Ohne diese Änderung scheiterte jedes Modul, das im Semester
  nicht angeboten wird, als sähe MOSES anders aus. Gibt es den Export, aber keine Gruppenlinks,
  bleibt es ein Fehler (das kann ein geänderter Parser sein).
- **Pause zwischen Modulen: 2 s** (Punkt aed3e76c). Nie parallel. Je Modul weiter eine eigene
  Sitzung ohne Login, 0,7 s zwischen Anfragen.

**Verhältnis zu V-0228** (querwind, Commit `1a3f26c` auf `vorgang/v-0228`, parallel gebaut): Zwei
Stellen sind dieselben, unabhängig voneinander gelöst.

| | V-0227 (dieser Strang) | V-0228 | Für Phase 2 |
|---|---|---|---|
| Pause zwischen Modulen | `PAUSE = 2.0`, nicht vor dem ersten, auch nach einem Fehler; `schlaf` für Tests; dazu `--pause` auf der Kommandozeile | `PAUSE_MODULE = 2.0`, gleiche Regeln, `schlaf` für Tests, ohne Schalter | gleichwertig; eine Fassung nehmen, `--pause` ist für Tests mit `main()` praktisch |
| Bestandteil ohne Gruppe | leer (`unplanned`), wenn **keine Gruppenlinks und kein Listenexport**; mit Export geht es weiter in den Export | leer, wenn das Zielsemester gewählt ist, **keine Gruppenlinks, kein Ereignis im Kalender und der Kalender da** ist; sonst „VVZ ohne Gruppen in unbekanntem Layout“ | **V-0228** übernehmen: Es verlangt positive Belege (leerer Kalender) statt nur fehlender Dinge und fällt bei einem Layoutwechsel lauter aus |

Was nur dieser Strang hat und in Phase 2 dazugehört: Kandidaten aus Modullisten, Turnusfilter,
Kandidaten-Fehler getrennt von `errors`, `modulliste.py`. Die Demo-Daten dieses Strangs sind mit der
eigenen Fassung abgerufen; beide ergeben für einen leeren Bestandteil dasselbe (`groups: []`,
`unplanned`).

## 6. Lesemodell

`abruf/bauen.py` schreibt zusätzlich, nur wenn der Katalog es nennt:

- im **Index** je Plan `ordnung` und `ersatz_fuer`, dazu `module: [<datei>, …]` (damit der nächste
  Lauf weiß, welche Moduldateien er geschrieben hat und entfernen darf, dieselbe Regel wie für
  Plandateien);
- in der **Plandatei** `studiengang.ordnung`, `ersatz_fuer`, `frei[]` und `wahlpflicht[]`:

```json
{ "id": "inf", "kurz": "WP Informatik", "name": "…", "bereich": "Wahlpflichtbereich/Informatik",
  "anteil": "…", "lp_min": 12, "lp_max": 21, "regeln": [ "…" ],
  "modulliste": { "ordnung": "StuPO 2021", "liste": "WiSe 2026/27", "quelle": "…", "abgerufen_am": "…" },
  "angebot": [ { "number": "40530", "title": "…", "short": "…", "lp": 9, "turnus": "WiSe",
                 "unterbereich": null, "datei": "module/wise-2026-27/40530.json",
                 "components": 2, "groups": 3, "bookings": 41, "tage": [1, 3] } ],
  "ohne_termine": [ { "number": "…", "title": "…", "lp": 6, "turnus": "SoSe", "unterbereich": null,
                      "grund": "nicht abgerufen (Turnus laut MOSES: SoSe)" } ] }
```

- **`modules` enthält nur die Pflichtmodule.** Die Kandidaten stehen unter `angebot` mit
  Kennzahlen; ihre Termine liegen je Modul in **`module/<semester>/<nummer>.json`**
  (`{schema, erzeugt_am, semester, label, anchor, module}`, `module` genau wie ein Eintrag von
  `modules`). Grund: Alle 74 angebotenen Module des 5. FS (StuPO 2021) in der Plandatei wären 1,27 MB (111 KB komprimiert); als eigene Dateien lädt die Seite nur, was jemand wählt (8.4).
- **`ohne_termine[].grund`** ist einer von: `nicht abgerufen (Turnus laut MOSES: …)`,
  `keine im Semester gültige Modulversion`, `keine Termine im Vorlesungsverzeichnis`,
  `Gruppen ohne Termine (z. B. nach Vereinbarung)`, `Abruf gescheitert: …`.
- **Kurznamen** der Kandidaten kommen aus `kurzname()` (Kürzel wie „PP“, „Sem.“, höchstens 22
  Zeichen). Ein Mensch schreibt sie für 150 Module nicht; der volle Titel steht in Liste und Karte.
- Ein Modul, das im selben Plan Pflicht ist, ist kein Kandidat (z. B. „Informatik und Gesellschaft“
  steht in StuPO 2021 im Pflichtbereich, in StuPO 2025 im Wahlpflichtbereich).

## 7. Seite — was der Nutzer wählen muss

Gebaut (klein, getrennt von V-0225: `web/wahl.mjs`, `web/wahl.css`, Haken in `app.js`):

1. **Plan:** Studiengang, Ordnung, Fachsemester, Semester stehen im Plannamen
   („Wirtschaftsinformatik B.Sc. (StuPO 2021), 5. Fachsemester, WiSe 2026/27“). Gewählt wird wie
   bisher aus der Liste der Pläne.
2. **Wahlpflichtmodule:** je Bereich ein Knopf am Ende der Modulliste mit den gewählten LP („WP
   Informatik 12 LP“). Er öffnet die Liste des Bereichs: Titel, LP, Unterbereich, Wochentage, Zahl
   der Gruppen; Anteil und LP-Grenzen des Bereichs; aufklappbar die Module ohne Termine mit Grund;
   die Quelle (MOSES, Ordnung, Liste). Ein Klick nimmt ein Modul dazu oder lässt es weg. Erst dann
   lädt die Seite seine Moduldatei.
3. **Gruppen** wie bisher, je Bestandteil eine. Wahlpflichtmodule tragen „WP“ am Namen und in der
   Modulkarte den Bereich und „Modul weglassen“.
4. **Ersatzdaten** zeigt ein Knopf vorn in der Modulliste, auf jeder Breite: „Ersatzdaten, nicht
   SoSe 2027“; er öffnet den Datenstand mit der Erklärung.

Kein neuer Speicher: Aktiv ist ein Wahlpflichtmodul, wenn die Auswahl eine Gruppe darin hat (die
Kennung eines Bestandteils beginnt mit der Modulnummer), oder wenn man es in dieser Sitzung
dazugenommen hat. Damit bleibt ARCHITEKTUR §6 (ein Schlüssel je Plan, nur Kennungen) unverändert,
und ein Teilen-Link bringt die Wahlpflichtmodule seiner Gruppen mit.

**Nicht gebaut** (bewusst, weil es Regeln erfände oder Silas' Entscheidung braucht): Prüfen, ob die
Wahl die Ordnung erfüllt (Seminar, Projekt, LP-Summen über zwei Semester); Voraussetzungen;
Wahlbereich und Freie Wahl (bräuchten eine Suche über alle Module); eine Frage „Welche Ordnung hast
du?“.

## 8. Ergebnis des Testfalls

### 8.1 Die Demo

**<https://demo-wi-hoehere.stundenplanner.pages.dev>** (Cloudflare-Vorschau, nicht die Produktion),
gebaut aus Zweig `vorgang/v-0227` mit den Rohständen vom 05.10.2026. Zehn Pläne: StuPO 2025 FS 1–6,
StuPO 2021 FS 3–6. Die Pläne der geraden Fachsemester tragen „SoSe 2026 (Ersatz für SoSe 2027)“ im
Namen und vorn in der Modulliste den Knopf „Ersatzdaten, nicht SoSe 2027“.

Geprüft mit Playwright auf der veröffentlichten Vorschau, 390×844 und 1440×900, zweimal: auf der
Oberfläche vom Morgen und nach dem Hereinholen von dev (neue Bedienung V-0225, Kalender V-0231),
auf der die Vorschau jetzt läuft: Planwahl mit allen
zehn Plänen, Wahlpflichtliste öffnen (WP Informatik, 5. FS StuPO 2021: 43 Module), ein Modul
dazunehmen (erscheint mit „WP“ in der Leiste, seine Gruppen im Raster), Ersatzdaten-Chip und
Datenstand, die neun Beispielpläne unten über ihren Teilen-Link übernommen (alle Formate
eingeplant, „Keine Überschneidung“), der leere Zustand eines Plans ohne Pflichtmodule. Keine Fehler in
der Konsole. `sh ops/test.sh` grün (105 Python-, 82 Node-Tests nach dem Hereinholen von dev).

**Beispielpläne** — je Plan eine konfliktfreie Auswahl aus den echten Daten, automatisch gesucht
(alle Pflicht-Bestandteile, dazu Wahlpflichtmodule mit Wochenrhythmus bis zum LP-Anteil). Sie
zeigen, dass die Daten einen ganzen Plan tragen; sie sind keine Empfehlung:

- [StuPO 2025, FS 2, SoSe 2026 (Ersatz für SoSe 2027)](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc&semester=sose-2026&fs=2&w=20122:11814~333706&w=20122:7721~326585&w=41262:5790~326270&w=41262:5791~332718&w=70174:1451~331137&w=70174:1452~331283)
- [StuPO 2025, FS 4, SoSe 2026 (Ersatz für SoSe 2027)](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc&semester=sose-2026&fs=4&w=40045:7382~326009&w=40064:9049~326058&w=40064:9050~332809&w=41231:13680~325663&w=41231:13683~325991)
- [StuPO 2025, FS 6, SoSe 2026 (Ersatz für SoSe 2027)](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc&semester=sose-2026&fs=6&w=40317:4594~326280&w=40401:8033~327593&w=70033:7288~327572)
- [StuPO 2025, FS 1, WiSe 2026/27](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc&semester=wise-2026-27&fs=1&w=40271:236~366776&w=40271:5310~366782&w=41077:14241~366255&w=41077:4940~367257&w=70112:1437~365973&w=70112:1438~366005&w=70112:62~365974&w=70123:287~365276&w=70123:5266~365489&w=70450:43~364415&w=70450:5296~366531)
- **StuPO 2025, FS 3, WiSe 2026/27:** kein konfliktfreier Plan im Modell (E5, P1)
- [StuPO 2025, FS 5, WiSe 2026/27](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc&semester=wise-2026-27&fs=5&w=40000:7550~363571&w=40000:7551~366471&w=40061:741~365909&w=40061:742~363647&w=70000:5292~363905&w=70000:5614~365675&w=70032:7124~365804)
- [StuPO 2021, FS 4, SoSe 2026 (Ersatz für SoSe 2027)](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc-stupo2021&semester=sose-2026&fs=4&w=40002:5421~325058&w=40002:5422~332428&w=40045:7382~330924&w=40064:9049~326058&w=40064:9050~332809&w=41034:11294~327777&w=70174:1451~331138&w=70174:1452~325216)
- [StuPO 2021, FS 6, SoSe 2026 (Ersatz für SoSe 2027)](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc-stupo2021&semester=sose-2026&fs=6&w=40282:8621~325681&w=40282:8622~326131&w=70033:7288~327572)
- [StuPO 2021, FS 3, WiSe 2026/27](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc-stupo2021&semester=wise-2026-27&fs=3&w=40029:5419~366656&w=40029:5420~363980&w=40271:236~366776&w=40271:5310~366779&w=70146:2287~365061&w=70146:281~365988&w=70183:13776~364955&w=70183:266~363543&w=70183:5680~365581&w=70232:34~364707&w=70232:5297~366613)
- [StuPO 2021, FS 5, WiSe 2026/27](https://demo-wi-hoehere.stundenplanner.pages.dev/#studiengang=wi-bsc-stupo2021&semester=wise-2026-27&fs=5&w=40000:7550~363571&w=40000:7551~366475&w=40061:741~365909&w=40061:742~363647&w=40499:59~364138&w=70032:7124~365804&w=70034:7291~365160&w=70034:7292~363518)

### 8.2 Abruf

| | WiSe 2026/27 | SoSe 2026 (Ersatz) |
|---|---|---|
| Module im Lauf | 170 (13 Pflicht, 157 Kandidaten, **ohne** Turnusfilter) | 150 (9 Pflicht, 141 Kandidaten, mit Turnusfilter) |
| gelungen / ohne Angebot | 168 / 2 („Falsches Semester im Export“, E6) | 147 / 3 („keine gültige Version für SoSe 2026“) |
| Bestandteile | 245 | 195 |
| Einzeltermine | **4 970** | **4 474** |
| Dauer | 28 min (09:51–10:19) | 25 min (10:19–10:44) |
| Anfragen an MOSES (geschätzt aus den Rohständen) | ≈ 1 240 | ≈ 1 090 |
| `_lauf.json` | `ok`, `errors: []` | `ok`, `errors: []` |

Zum Vergleich: WI FS 1 allein sind 5 Module, 949 Termine, gut eine Minute. Die drei Modullisten
dauerten je gut eine Minute (StuPO 2025: 26 Bereiche, 184 Module, 1:07 min). Alle Abrufe nacheinander,
2 s zwischen Modulen, 0,7 s zwischen Anfragen, 1 s im MTS.

### 8.3 Je Plan

Pflicht: Module / Bestandteile / Gruppen / Einzeltermine. Wahlpflicht: Kandidaten laut MOSES →
davon mit Terminen (Gruppen, Termine, angebotene LP). „(E)“ = Ersatzdaten SoSe 2026.

| Ordnung | FS | Semester | Pflicht | Wahlpflicht | konfliktfreier Plan? |
|---|---|---|---|---|---|
| 2025 | 1 | WiSe 26/27 | 5 / 11 / 65 / 949 | – | ja |
| 2025 | 2 | SoSe (E) | 4 / 9 / 65 / 817 — Engineering verteilter Anwendungen (41284) ohne Termine | – | ja |
| 2025 | 3 | WiSe 26/27 | 3 / 6 / 10 / 172 | Nachhaltigkeit 6 → 5 (14 Gr., 179 T., 30 LP); WiWi-Grundlagen 3 → 3 (27 Gr., 266 T., 18 LP) | **nein** (E5, P1) |
| 2025 | 4 | SoSe (E) | 3 / 6 / 15 / 197 — Security & Privacy Engineering (41287) ohne Termine | Programmierpraktikum 29 → 12 (19 Gr., 195 T.) | ja |
| 2025 | 5 | WiSe 26/27 | – | Vertiefung Informatik 82 → 35 (86 Gr., 1 235 T., 210 LP); Vertiefung WiWi 52 → 34 (120 Gr., 1 743 T., 210 LP) | ja |
| 2025 | 6 | SoSe (E) | – | Vertiefung Informatik 82 → 38 (89 Gr., 965 T.); Vertiefung WiWi 52 → 29 (141 Gr., 1 628 T.) | ja |
| 2021 | 3 | WiSe 26/27 | 5 / 14 / 71 / 948 | – | ja, aber MuP falsch modelliert (E5) |
| 2021 | 4 | SoSe (E) | 4 / 7 / 83 / 889 | Programmierpraktikum 29 → 13 (20 Gr., 209 T.) | ja |
| 2021 | 5 | WiSe 26/27 | 1 / 1 / 9 / 120 | Katalog Informatik 101 → 43 (98 Gr., 1 445 T., 255 LP); Katalog WiWi 49 → 31 (84 Gr., 1 343 T., 188 LP) | ja |
| 2021 | 6 | SoSe (E) | – | Katalog Informatik 100 → 51 (106 Gr., 1 241 T.); Katalog WiWi 50 → 26 (92 Gr., 1 139 T.) | ja |

**Ohne Termine**, über alle Pläne: meist „keine Termine im Vorlesungsverzeichnis“ (z. B. 54 von 101
im Katalog Informatik, WiSe), dann „nicht abgerufen (Turnus laut MOSES: …)“ (nur SoSe, 5–25 je
Bereich), „Gruppen ohne Termine (z. B. nach Vereinbarung)“ (1–3 je Bereich), „keine im Semester
gültige Modulversion“ (3, SoSe) und „Abruf gescheitert“ (2, WiSe, E6).

**Ersatzdaten haben alte Versionen.** Die Liste der StuPO 2025 gibt es nur für das WiSe 2026/27; im
SoSe 2026 wählt der Abruf die damals gültige Version. 11 von 125 Modulen weichen ab (z. B. 41284 und
41287 Version 1 statt 2). Die zwei neuen Pflichtmodule haben im SoSe 2026 eine Version, aber keine
Termine: Sie laufen erst im SoSe 2027 zum ersten Mal.

### 8.4 Größen

| Datei | roh | gzip |
|---|---|---|
| Plandateien mit vielen Pflichtmodulen (FS 1, FS 3 / 2021, FS 2 und 4 SoSe) | 391–414 KB | 27–29 KB |
| Plandateien mit Wahlpflicht und wenig Pflicht (FS 5, FS 6) | 29–88 KB | 5–10 KB |
| 177 Moduldateien (`module/<semester>/<nummer>.json`) | 3,2 MB, Median 11 KB, größte 114 KB | 0,4 MB |
| zum Vergleich: alle 74 angebotenen Module des 5. FS (2021) in einer Plandatei | 1,27 MB | 111 KB |
| `web/daten/` gesamt | 5,6 MB | — |

## 9. Erkenntnisse

**E1 · MOSES liefert die Modullisten, nicht den Studienverlaufsplan.** Die Studiengangsseite im
MTS (Q8) hat je Ordnung und Semester den ganzen Studiengangsaufbau: Bereiche, Module mit Nummer und
Version, LP, Turnus, Prüfungsform, LP-Grenzen und Modulzahlen. Das ist per Ajax maschinenlesbar,
ohne Login, in gut einer Minute je Liste. Das **Fachsemester** steht nirgends in MOSES: nicht im
Baum, nicht in der Modulbeschreibung (Q10 nennt nur „kann im Wintersemester begonnen werden“ und
die Studiengänge, in denen ein Modul verwendet wird). Der Studienverlaufsplan steht nur in Anlage 2
der StuPO, für 2025 sogar nur als Bild. Daraus folgt die Teilung des Katalogs: **Handarbeit ist nur
noch der Studienverlaufsplan** (für WI je Fachsemester drei bis fünf Pflichtmodule und ein bis zwei
Bereichsnamen), **die 150–200 Module der Wahlpflicht kommen aus MOSES**.

**E2 · Wer heute in den höheren Fachsemestern sitzt, studiert nach der StuPO 2021.** Im WiSe 2026/27
sind das FS 3 (Jahrgang 2025/26) und FS 5 (Jahrgang 2024/25), solange sie nicht gewechselt haben.
Für genau diese Pläne gibt es heute echte Termine, und sie funktionieren in der Demo vollständig
(8.1). Nach der StuPO 2025 gibt es ein 3. Fachsemester regulär erst im WiSe 2027/28, also für den
Jahrgang, für den Silas den Stundenplanner „richtig“ bauen will (SCOPE §1). Die StuPO-2025-Pläne
FS 3–6 der Demo sind deshalb eine Vorschau mit den Terminen von heute.

**E3 · Gerade Fachsemester liegen im Sommer, und für den Sommer gibt es im Winter keine Termine.**
WI beginnt nur im Wintersemester (Q8, Turnus). MOSES sperrte am 05.10.2026 das SoSe 2027 im
Vorlesungsverzeichnis (Q9). Wer im Winter seinen nächsten Sommer planen will, kann es nicht; die
Demo zeigt für FS 2, 4 und 6 die echten Termine des SoSe 2026, gekennzeichnet. Wann MOSES ein
Semester freigibt, war nicht zu ermitteln.

**E4 · Ab dem 4. Fachsemester ist Wahlpflicht die eigentliche Arbeit.** Im 5. Fachsemester (beide
Ordnungen) hat der Plan null oder ein Pflichtmodul, aber 70–80 Wahlpflichtmodule mit Terminen. Die
Seite braucht dort zuerst eine Modulwahl, dann die Gruppenwahl. Diese Modulwahl ist dieselbe
Funktion wie „Beliebige Module dazu“ aus dem Zielbild (SCOPE §4), nur mit einer Liste aus MOSES statt
einer Suche.

**E5 · Eine MOSES-Gruppe ist eine Planungsgruppe, nicht immer eine Wahleinheit.** Die Spalte im
Export heißt „Gruppe/ Planungsgruppe“, und so verhält sie sich. In den 92 Modulen mit Terminen im
WiSe 2026/27 hat die Vorlesung von fünf Modulen zwei Gruppen; bei vier davon gehören beide
zusammen, statt dass man eine wählt: Marketing und Produktionsmanagement (70183, „1. Semesterhälfte –
Marketing“ und „2. Semesterhälfte – Produktion“, **Pflicht im 3. FS der StuPO 2021**), Organisation
und Innovationsmanagement (70202, „1. Hälfte“ und „2. Teil: Blockveranstaltung“), Software & Business
Engineering (41285, „Vorlesung wöchentlich“ und „Vorlesung Ungerade Wochen“), Kommunikationsnetze
(40061, „Vorlesung“ und „Übung“ im selben Bestandteil). Nur bei Programmieren I (41077) sind es
Alternativen (je Gruppe 2 h/Woche bei 2 SWS). Umgekehrt bündelt die Übung von Software & Business
Engineering in einer Gruppe vier Termine an vier Wochentagen („Exercise (Ungerade Wochen)“), von
denen man wohl einen besucht. **Folge:** Für das 3. FS der StuPO 2025 findet die Planungslogik
keinen konfliktfreien Plan, weil sie annimmt, man besuche alle vier Übungstermine (die
Donnerstagsübung liegt auf der Vorlesung von Platform Economics). SYSTEM §6, Annahmen 4 und 5, und
die Regel „eine Gruppe je Bestandteil“ (SYSTEM §5) brechen hier an echten Daten. Im 1. Fachsemester (live) kommt der Fall nicht vor.

**E6 · Der Turnus aus dem MTS ist ein guter Filter, aber kein Beleg.** Gemessen am WiSe 2026/27
(alle 157 Kandidaten geholt, ohne Filter): Von 50 Modulen mit Turnus „SoSe“ hatten 4 doch Termine
im Winter; von 44 mit „WiSe“ hatten 10 (noch) keine. Der Filter spart ein Drittel der Abrufe und
verliert etwa 5 % der angebotenen Module. Zwei SoSe-Module (Algorithmentheorie 40464, Internet and
Network Security 41059) listet das VVZ im WiSe mit Gruppen des Sommers; die Semesterprüfung aus
V-0215 weist sie richtig ab („Falsches Semester im Export“).

**E7 · Die Hälfte der Wahlpflichtmodule hat im Semester keine Termine.** Von 157 Kandidaten im
WiSe hatten 79 Termine. Bei den anderen ist meist kein Bestandteil im VVZ geplant („keine Termine
im Vorlesungsverzeichnis“), bei vier gibt es Gruppen ohne Buchungen (Projekte nach Vereinbarung).
Ob ein Modul „in diesem Semester nicht angeboten“ oder „noch nicht eingetragen“ ist, sagt MOSES
nicht. Die Seite nennt es deshalb „ohne Termine in diesem Semester“ mit dem gemessenen Grund.

**E8 · Die Versionen stimmen überein.** Für alle 305 Paare aus Modulliste (Spalte #V) und Abruf
(höchste im Semester gültige Version, `choose_version`) im WiSe 2026/27 war es dieselbe Version.
Die Regel des Abrufs und die Zuordnung der Studiengangsliste widersprechen sich nicht.

**E9 · Die Listen ändern sich von Semester zu Semester, auch in der Form.** StuPO 2021: Die Liste
SoSe 2026 hat einen flachen Pflichtbereich und keine einzige Regel, die Liste WiSe 2026/27
Unterbereiche und LP-Grenzen; 6 Module kamen dazu, 4 fielen weg. StuPO 2025 und 2021 teilen 172 von
212 Modulen. Die PDF-Anlage weicht von MOSES ab (Abschnitt 2). Eine Modulliste gehört deshalb zu
einem Semester und wird je Semester neu erzeugt.

**E10 · Die Regeln im MTS sind nur zum Teil formal.** Formal sind LP-Grenzen und Modulzahlen
(„mindestens 1 Modul“). Die Pflicht aus StuPO 2025 § 5 Abs. 4 („ein Seminar … sowie ein Projekt“ in
beiden Vertiefungen zusammen) bildet das MTS als Unterbereiche „Projekte“, „Seminare“, „Projekte +
Seminare“ mit eigenen Mindest-LP ab, ohne das „oder“ dazwischen. In der StuPO 2021 stehen Seminar
und Projekt nur als Fußnoten der PDF. Eine Prüfung „deine Wahl erfüllt die Ordnung“ wäre also
erfunden; die Seite zeigt den LP-Stand und die Grenzen, sonst nichts.

## 10. Problemstellen nach Gewicht

Gewicht = wie sehr es einen falschen oder unbrauchbaren Plan erzeugt, mal wie viele es trifft.

| # | Gewicht | Problem | Wo es sich zeigte | Was helfen könnte (Entscheidung bei Silas, wo es Regeln berührt) |
|---|---|---|---|---|
| P1 | **hoch** | **Gruppen sind Planungsgruppen.** „Eine Gruppe je Bestandteil“ ist bei zusammengehörigen Vorlesungsgruppen falsch (man muss beide besuchen), und eine Gruppe mit vier Wahlterminen erzeugt falsche Konflikte | E5; StuPO 2025 FS 3 ohne konfliktfreien Plan; StuPO 2021 FS 3 (MuP) betrifft reale Nutzer jetzt | Im Katalog je Modul vermerken, welche Gruppen zusammengehören (aus der Modulbeschreibung, von Hand, mit Quelle), oder mehrere Gruppen je Bestandteil wählbar machen; Erkennung als Prüfliste (zwei Gruppen in einer Vorlesung, Namen mit „Hälfte/Teil“, zeitlich getrennt) |
| P2 | **hoch** | **Welche Ordnung?** Zwei Ordnungen gleichzeitig, bis 2029; die falsche gibt einen falschen Plan. Nur der Mensch weiß, ob er gewechselt hat | E2, Q6 | Ordnung als eigene Wahl vor dem Fachsemester, mit dem Satz „Studienbeginn vor dem WiSe 2026/27: StuPO 2021, außer du hast gewechselt“ |
| P3 | **hoch** | **Kein Sommer im Winter.** Für FS 2, 4, 6 gibt es Termine erst, wenn MOSES das Semester freigibt | E3, Q9 | Bis dahin ehrlich „noch nicht veröffentlicht“; Vorjahrestermine nur als ausdrücklich gekennzeichnete Vorschau, wenn Silas das will |
| P4 | **hoch** | **Abrufvolumen.** WI allein: 170 Module und etwa 1 200 Anfragen je Wintersemester, 28 min mit 2 s Pause; für alle Studiengänge der TU täglich nicht höflich | 8.2 | Module je Semester einmal TU-weit; Pflichtmodule täglich, Wahlpflicht rollierend (z. B. ein Siebtel je Tag) oder wöchentlich; Turnusfilter; Obergrenze je Lauf (Punkt aed3e76c); Datenstand je Modul zeigen |
| P5 | mittel | **Wahlregeln nicht prüfbar** (Seminar/Projekt, LP über zwei Semester, Alternativen) | E10 | Nur anzeigen: LP-Stand, Grenzen, Unterbereich. Keine „erfüllt“-Prüfung (SCOPE §5) |
| P6 | mittel | **Ohne Termine ≠ nicht angeboten.** Die Hälfte der Kandidaten hat keine Termine; Projekte und Blockseminare oft „nach Vereinbarung“ | E7 | Grund anzeigen (gebaut); Projekte ohne Termine trotzdem wählbar machen, damit die LP stimmen |
| P7 | mittel | **Abweichende Verläufe.** Der Studienverlaufsplan ist eine Empfehlung (Q1/Q2 § 5 Abs. 1). Wiederholer, Teilzeit, Auslandssemester, Wechsler sind in höheren FS häufig | — | Ein Fachsemester-Plan als Start, dazu „Modul hinzufügen“ aus allen Modullisten der Ordnung (dieselbe Mechanik wie Wahlpflicht) |
| P8 | mittel | **Lange Listen, lange Titel.** 30–45 Module je Bereich; Kurznamen nur geschnitten | 8.4 | Suche und Filter (Unterbereich, Wochentag, LP) in der Liste; Kurznamen für häufige Module von Hand |
| P9 | niedrig | **PDF und MOSES weichen ab**, Listen ändern sich je Semester | Abschnitt 2, E9 | MOSES-Liste des Semesters ist maßgeblich; je Semester neu erzeugen, Unterschied im Diff des Katalogs sichtbar |
| P10 | niedrig | **Turnusfilter verliert ~5 %** | E6 | Einmal je Semester ohne Filter, danach mit; oder Kandidaten ohne Termine seltener prüfen |
| P11 | niedrig | **Zwei Fassungen für „Bestandteil ohne Gruppe“** | V-0227 und V-0228 bauten es getrennt (Abschnitt 5) | Für Phase 2 `empty_component()` aus V-0228 übernehmen |
| P12 | niedrig | **Plandateien mit vielen Pflichtmodulen sind groß** (≈ 400 KB, 29 KB komprimiert) | 8.4 | Alle Module als eigene Dateien je Semester, Pläne nennen nur Nummern |
| P13 | niedrig | **Blockveranstaltungen füllen das Wochenskelett** (z. B. Innovationswerkstatt 70164: 08–20 Uhr an allen Tagen eines Monats) | Demo, Beispielsuche | Im Skelett als Block kennzeichnen statt als Wochentermin; die konkrete Woche zeigt sie richtig |

## 11. Empfehlung für Phase 2

**Kurz:** Öffnen lässt sich **sofort** WI StuPO 2021 FS 3 und FS 5 für das WiSe 2026/27 (echte
Daten, echte Nutzer), **sobald P1 entschieden ist**, denn MuP im 3. FS ist genau der Fall
„zwei Gruppen gehören zusammen“. Die Sommer-Fachsemester erst, wenn MOSES das SoSe 2027 freigibt.
StuPO 2025 FS 3–6 bleiben bis zum WiSe 2027/28 Vorschau.

In der Reihenfolge, in der es Phase 2 bauen sollte:

1. **Entscheidung P1 (Silas):** Wie geht die Seite mit Gruppen um, die zusammengehören? Vorschlag:
   im Katalog je Modul eine kurze Liste `zusammen` (Gruppennamen-Muster oder Gruppen-IDs je
   Semester, mit Quelle aus der Modulbeschreibung), von Hand für die wenigen Fälle; der Abruf meldet
   Verdachtsfälle (zwei Gruppen in einer Vorlesung) als Prüfliste. Das ist eine Regel, die die
   Quelle nennt (Gruppenname, Modulbeschreibung), keine erfundene.
2. **Datenmodell festschreiben** (ARCHITEKTUR §3–§6): Ordnung als eigene Ebene in Index, Adresse
   und Speicherschlüssel (`stundenplanner:v1:<studiengang>:<ordnung>:<semester>:fs<n>`, mit
   Übernahme der heutigen Schlüssel ohne Ordnung); `wahlpflicht`, `frei`, `ersatz_fuer` wie in
   dieser Demo; Modullisten als erzeugte Katalogdateien.
3. **Alle Module als eigene Dateien je Semester** (`module/<semester>/<nummer>.json`), auch die
   Pflichtmodule; Plandateien nennen nur Nummern und Bereiche. Ein Modul, das in zwanzig
   Studiengängen vorkommt, liegt einmal da (P12).
4. **Abruf planen statt alles täglich** (P4): Pflichtmodule täglich; Wahlpflichtkandidaten mit
   Terminen alle zwei Tage, ohne Termine wöchentlich; Turnusfilter an, einmal je Semester ohne; eine
   Obergrenze an Anfragen je Lauf; Datenstand je Modul auf der Seite (gibt es schon: `success_at`).
   Für „bestandteil ohne Gruppe“ die Fassung aus V-0228.
5. **Seite** (mit dem Umbau der Bedienung abgestimmt): Einstieg Studiengang → Ordnung → Fachsemester;
   die Wahlpflichtliste mit Suche und Filtern; „Modul hinzufügen“ aus der ganzen Modulliste der
   Ordnung (P7), dieselbe Mechanik; kein „erfüllt“-Haken (P5).
6. **Sommer:** Bis MOSES das Semester freigibt, steht dort „noch nicht veröffentlicht“. Ob
   Vorjahrestermine als gekennzeichnete Vorschau gezeigt werden, entscheidet Silas (Ersatzdaten
   sind keine Termine des kommenden Semesters).
7. **Weitere Studiengänge** sind danach je Studiengang und Ordnung: eine Modulliste erzeugen
   (`modulliste.py`, eine Minute) und den Studienverlaufsplan abschreiben (eine Stunde, mit
   Quelle). Die Prüfliste aus 1. gehört zu jeder Übernahme dazu.

## 12. Aufwand

Geschätzt in Agenten-Arbeitstagen, ohne Silas' Entscheidungen und Sichtprüfung; aus dem, was
diese Demo gekostet hat (ein Tag Recherche, Abruf und Lesemodell, Demo-Oberfläche).

| Schritt | Aufwand | Abhängig von |
|---|---|---|
| P1 Gruppen, die zusammengehören: Prüfliste im Abruf, Katalogfeld, Seite | 1–1,5 Tage | Silas' Entscheidung |
| Datenmodell und ARCHITEKTUR §3–§6 mit Ordnung, Speicherschlüssel-Übernahme | 1 Tag | — |
| Alle Module als Dateien je Semester, Plandateien schlank | 0,5 Tage | Datenmodell |
| Abruf planen (Takte, Obergrenze, Turnus), Betrieb anpassen | 1 Tag | — |
| Seite: Einstieg mit Ordnung, Wahlliste mit Suche/Filter, „Modul hinzufügen“, Sichtprüfung nach DESIGN | 2–3 Tage | Umbau der Bedienung (V-0225) |
| WI StuPO 2021 und 2025 je Semester pflegen | 15 min je Semester (Modullisten neu erzeugen, Diff lesen) | — |
| Je weiterer Studiengang × Ordnung | 1–2 Stunden (Studienverlaufsplan abschreiben, Modulliste erzeugen, Prüfliste P1) | — |

Für den laufenden WiSe-Jahrgang (WI StuPO 2021 FS 3 und 5, Öffnung vor Semesterende sinnvoll)
reichen die ersten zwei Zeilen und eine kleine Fassung der Seite: etwa **2–3 Tage**.
