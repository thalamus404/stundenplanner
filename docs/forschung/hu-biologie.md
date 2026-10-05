# Forschung: HU Berlin, Biologie B.Sc., 1. Fachsemester

> V-0229, Rufzeichen `fernflug`, 05.10.2026. Ein Demo-Strang (`vorgang/v-0229`), nicht für dev
> oder main gedacht. Die Vorschau zeigt echte Daten aus AGNES:
> <https://demo-hu.stundenplanner.pages.dev>. Wie das System für MOSES arbeitet, steht in
> [`docs/SYSTEM.md`](../SYSTEM.md). Dieser Bericht prüft dessen Annahme 6 („Nur MOSES“) an einer
> zweiten Hochschule.

## 1. Ausgangsfrage

Silas, 05.10.2026: *„Ich möchte nicht nur Oberflächendemo haben, sondern echte, gescrapte Daten
aus den anderen Unis. […] es müssen echte Daten kommen, und die müssen nach der echten Logik der
StuPo verwertet werden.“*

Daraus folgen drei Fragen:

1. Welche Module hat das 1. Fachsemester Biologie (Monobachelor) an der HU nach der geltenden
   Studien- und Prüfungsordnung, und mit welchen Lehrveranstaltungen?
2. Woher kommen an der HU die Termine, und kommt man an echte Einzeltermine, ohne zu raten?
3. Trägt der Vertrag des Stundenplanners (Katalog → Rohstand → Lesemodell → Seite) eine zweite
   Quelle, ohne dass Lesemodell und Seite sich ändern?

**Kurzantwort:** (1) BioB 1 bis BioB 4, alle Pflicht, dazu 5 LP im überfachlichen Wahlpflichtbereich
(ÜWP). (2) Aus AGNES, einem HIS-LSF-System. Echte Einzeldaten stehen nur im iCalendar-Export des
anonymen Stundenplans; Serien kommen dort als Regel mit Ausnahmen (RRULE und EXDATE) und werden
nachprüfbar ausgerechnet. (3) Ja. Neu sind eine Quelle (`abruf/lsf.py`), die Quellenwahl in
`abruf/abruf.py` und Felder im Katalog. `bauen.py`, `plan.py` und `web/` sind unverändert.

## 2. Quellen

Alle am 05.10.2026 gelesen.

| Quelle | Adresse | Was daraus stammt |
|---|---|---|
| **Studien- und Prüfungsordnung Biologie** (Fachspezifische Studienordnung und Prüfungsordnung für das Bachelorstudium im Fach Biologie), Amtliches Mitteilungsblatt der HU Nr. 27/2025 vom 18.07.2025, 83 Seiten | <https://doi.org/10.18452/34250>, als PDF über den Dokumentenserver edoc der HU (`edoc.hu-berlin.de/server/api/core/bitstreams/16900a72-1f9b-4019-b12a-d25ea8223108/content`) | §2 Beginn nur zum WiSe, §5 Lehrveranstaltungsarten, §6 Module des Monostudiengangs, §10 Inkrafttreten und Übergang, Anlage 1 Modulbeschreibungen BioB 1 bis 4, Anlage 3.1 idealtypischer Studienverlaufsplan, PO §2 Regelstudienzeit |
| **AGNES, Vorlesungsverzeichnis** WiSe 2026/27 (HIS LSF unter `/lupo/`, eingebettet in das HISinOne-Portal unter `/elsa/`) | <https://agnes.hu-berlin.de/lupo/rds?state=wtree&search=1&category=veranstaltung.browse> → Lebenswissenschaftliche Fakultät → Institut für Biologie → B.Sc. Biologie Monobachelor (SPO 2025) → Pflichtbereich → Wintersemester → [BioB 1] … [BioB 4] | Lehrveranstaltungen je Modul, Detailseiten (Art, Nummer, SWS, Gruppen, Terminzeilen, Freitexte) |
| **AGNES, anonymer Stundenplan** („vormerken“) und **iCalendar-Export** | `…/lupo/rds?state=wplan…` und `…/lupo/rds?state=verpublish&status=transform&moduleCall=iCalendarPlan&termine=<IDs>…` | Termin-IDs je Gruppe, alle Einzeldaten |
| **AGNES, Studiengangpläne** (Lehrplan Biologie B.Sc. Mono, PO 2025, Fachsemester 1) | `…/lupo/rds?state=wplan&act=stg&pool=stg&k_abstgv.abstgvnr=6124&r_zuordabstgv.semvonint=1&r_zuordabstgv.sembisint=1…` | Gegenprobe zum Studienverlaufsplan (§4) |
| **AGNES, robots.txt, Impressum, Datenschutzerklärung** | <https://agnes.hu-berlin.de/robots.txt>, `…/lupo/rds?state=template&template=about`, `…=datenschutzerklaerung` | Regeln für automatischen Zugriff (§9) |
| **Vorlesungszeit der HU** WiSe 2026/27 | <https://hu-berlin.de/en/study/before-your-studies/apply/deadlines> | 12.10.2026 bis 13.02.2027, am 12.10.2026 Dies academicus. **Nur über den Auszug einer Suchmaschine gelesen**: Die Seite selbst steht hinter einer Bot-Sperre (§9). Gegenprobe in AGNES: Montagsserien beginnen am 19.10.2026, Dienstagsserien am 13.10.2026; eine Terminzeile ohne Datum endet im Export am 13.02.2027 |

Nicht gelesen: Die Webseiten des Instituts (`biologie.hu-berlin.de`, Studienverlaufspläne als PDF) und
die Seiten des Amtlichen Mitteilungsblatts auf `hu-berlin.de`/`gremien.hu-berlin.de`. Sie stehen
hinter „Anubis“, einer Sperre gegen KI-Crawler mit Rechenaufgabe im Browser. Wir haben sie nicht
umgangen; das Mitteilungsblatt kam vom Dokumentenserver edoc, dessen robots.txt den Abruf erlaubt.

## 3. Wie die HU-Quelle gebaut ist, im Vergleich zu MOSES

AGNES heißt an der HU das Campus-Management. Das Portal ist HISinOne (Release 2022.12), das
Vorlesungsverzeichnis darin ist noch das alte **HIS LSF** („QIS“, Pfad `/lupo/`), als iframe
eingebettet. Alles hier Genutzte ist ohne Login erreichbar.

| | MOSES (TU, docs/SYSTEM.md §3) | AGNES / HIS LSF (HU) |
|---|---|---|
| Einstieg | Modulnummer → Versionsliste → Modulbeschreibung | Baum des Vorlesungsverzeichnisses nach Studiengang und SPO; das Modul ist ein Knoten „[BioB 1] Titel“. Knoten-IDs sind je Semester neu, also über **Titel** gesucht |
| Modulversion | gültige Version je Semester | keine Version im VVZ; die SPO steht im Knotennamen („SPO 2025“) |
| Bestandteile | Tabelle „Lehrveranstaltungen“ der Modulbeschreibung | Veranstaltungen unter dem Modulknoten (Vst.-Nr. wie `2112BioB001VL`, Art, Format) |
| Gruppen | Termingruppen je Veranstaltungsvorlage, eigene Seite | „Gruppe 1 … n“ als Tabellen auf der Detailseite der Veranstaltung |
| Termine | **CSV-Export der Einzelbuchungen** (jede Zeile ein Termin, ISO-Zeit) | Seite: Terminzeilen (Tag, Zeit, Rhythmus, Dauer von–bis, Raum, „fällt aus am“). **Einzeldaten nur im iCalendar-Export**: Einzeltermin = VEVENT, Serie = RRULE mit EXDATE (vorlesungsfreie Tage trägt LSF selbst als EXDATE ein) |
| Weg zu den Termin-IDs | die Seite nennt sie | keine Seite nennt sie; nur der Link „iCalendar Export“ im anonymen Stundenplan, nachdem man Gruppen „vorgemerkt“ hat |
| Semesterwahl | Auswahl auf der Seite | Semester im Parameter `root1<schlüssel>` (`20262` = WiSe 2026/27); ohne Wahl gilt das „aktuelle“ Semester |
| Fachsemester | MOSES kennt kein Fachsemester (querwind, V-0228) | „Studiengangpläne“ nennen je Veranstaltung ein Fachsemester; für Bio FS 1 korrekt bis auf einen Fehleintrag (§4) |
| Anfragen | 5 je Bestandteil | 2 je Gruppe + 2 je Bestandteil + Baum: **74 für BioB 1–4** (51 GET, 23 POST), 89 s |
| Ausnahmen der Quelle | eine fremde Semestergruppe (`ausgelassen`) | EXDATE mit falscher Uhrzeit, `DTSTART:T00` für Zeilen ohne Termin, „14tgl./2“ zeigt den Zeitraum, nicht den ersten Termin (§7) |

## 4. Die Studienordnung und das 1. Fachsemester

**Welche Ordnung gilt.** Die Studien- und Prüfungsordnung vom 21.05.2025 (AMB 27/2025) gilt seit dem
01.10.2025 für alle, die ab dann beginnen (StO §10 Abs. 2). Wer am 12.10.2026 im 1. Fachsemester
anfängt, studiert also nach ihr. Die alte Ordnung (AMB 7/2021, geändert AMB 27/2022, Module „MB …“)
gilt für frühere Jahrgänge übergangsweise bis 30.09.2027 (§10 Abs. 3); AGNES führt beide Bäume
nebeneinander („SPO 2021“, „SPO 2025“). Das Studium beginnt nur zum Wintersemester (§2).

**Aufbau (§6):** 180 LP. Pflichtbereich 135 LP (BioB 1 bis 21), fachlicher Wahlpflichtbereich 20 LP
(zwei aus BioB 22 bis 32), überfachlicher Wahlpflichtbereich 25 LP (frei aus Modulkatalogen
anderer Fächer).

**1. Fachsemester nach Anlage 3.1** (idealtypisch, „nicht verpflichtend“; 18 SWS, 30 LP):

| Modul | LP | Lehrveranstaltungen (Anlage 1) | Prüfung | in AGNES |
|---|---|---|---|---|
| BioB 1 Grundlagen der molekularen Zellbiologie | 10 | VL 4 SWS, SE 1 SWS, UE 1 SWS | Klausur 90 min oder mündlich | VL `2112BioB001VL`, SE `…SE` (6 Gruppen), UE `…UE` (6 Gruppen) |
| BioB 2 Evolution und Biosystematik | 5 | VL 2 SWS, UE 2 SWS | dto. | VL, UE (5 Gruppen) |
| BioB 3 Mathematische Grundlagen der Biologie 1 | 5 | VL 2 SWS, UE 2 SWS | dto. | VL, UE (1 Gruppe ohne Termine) |
| BioB 4 Allgemeine und Anorganische Chemie | 5 | VL 3 SWS, SE 1 SWS | dto. | VL, SE |
| Überfachlicher Wahlpflichtbereich | 5 | frei wählbar | je Modul | nicht im Plan (§8, Problemstelle E1) |

SWS je Veranstaltung in AGNES stimmen mit Anlage 1 überein. Für alle Lehrveranstaltungen ist
„Teilnahme“ Voraussetzung der Leistungspunkte: Jeder Bestandteil ist zu belegen (`required`).
Wahlpflicht gibt es im 1. Fachsemester nur im ÜWP.

**Gegenprobe gegen AGNES.** Der „Studiengangplan“ (Biologie B.Sc. Mono, PO 2025, Fachsemester 1–1)
listet genau die 9 Veranstaltungen von BioB 1 bis 4, und dazu `2112BioB026PR` „Taxa in Raum und
Zeit“, ein Praktikum des Wahlpflichtmoduls BioB 26, das Anlage 3.1 ins 5. Semester legt. Seine
Studiengangzuordnung nennt kein Fachsemester; der Filter nimmt es trotzdem mit. Der Studiengangplan
ist deshalb eine gute **Gegenprobe**, aber nicht die Wahrheit: Die bleibt das Mitteilungsblatt.

## 5. Was gebaut ist

| Datei | Was |
|---|---|
| `abruf/lsf.py` | Die zweite Quelle. Baum nach Titeln, Detailseiten, Termin-IDs je Gruppe über den anonymen Stundenplan, iCalendar-Export, Serien nach RFC 5545 (`expandiere`), Gegenprobe Seite ↔ Export (`_passt`, `_zuordnung`), Freitext geschwärzt (`schwaerzen`). Schreibt den Rohstand nach ARCHITEKTUR §4 |
| `abruf/abruf.py` | `standard_quelle()` wählt je Semester MOSES oder LSF, wie der Katalog es sagt. Katalogprüfung für LSF (Schlüssel, `vvz`, `vvz_pfad`, `quelle.basis` https). Sonst unverändert; die MOSES-Tests laufen weiter |
| `katalog/semester/hu-wise-2026-27.json` | Eigenes Semester der HU: Anker 12.10.2026, `quelle` = LSF/AGNES, Semesterschlüssel `20262` |
| `katalog/studiengaenge/hu-biologie-bsc.json` | Biologie B.Sc., FS 1: BioB 1 bis 4, Pflichtbereich, Pfad im VVZ, Quelle AMB 27/2025 |
| `abruf/tests/test_lsf.py`, `abruf/tests/fixtures/lsf/` | 28 Tests auf echten, gekürzten AGNES-Ausschnitten (Namen der Lehrenden entfernt, der Kommentar unter „Inhalt“ ist erfunden) |
| `abruf/README.md` | Benutzung, Katalogfelder, Fehlermeldungen, Höflichkeit der LSF-Quelle |

**Halb manuell, aber echt:** Der Katalog ist von Hand aus dem Mitteilungsblatt übernommen. Der Abruf
läuft automatisch mit `python3 abruf/abruf.py --semester hu-wise-2026-27`, derselbe Befehl wie für
MOSES. Er steht aber nur auf diesem Strang und läuft nicht täglich (Problemstelle A1).

**Warum ein eigenes Semester `hu-wise-2026-27`:** Ein Modul wird je Semester einmal geholt, und die
Rohstände liegen je Semester in einem Ordner. Teilten TU und HU ein Semester, teilten sie den Ordner,
das `_lauf.json` und den Namensraum der Modulnummern, und die Quelle wäre je Modul statt je Semester
zu wählen. Der Anker ist hier zufällig derselbe Montag.

**Warum die Modulnummer `BioB-1` heißt:** Sie ist Dateiname und Teil der Kennung im Teilen-Link.
Ein Leerzeichen dort wäre eine Falle. Die Bezeichnung aus AGNES steht in `vvz`.

## 6. Ergebnis mit Zahlen

Abruf am 05.10.2026, 10:08 bis 10:10 Uhr: **4 Module, 9 Bestandteile, 23 Gruppen, 250 Buchungen**, Status `ok`.

| Modul | Bestandteile | Gruppen | Buchungen |
|---|---|---|---|
| BioB 1 Zellbio | VL, SE, UE | 1 + 6 + 6 | 31 + 36 + 36 = 103 |
| BioB 2 Evolution | VL, UE | 1 + 5 | 16 + 75 = 91 |
| BioB 3 Mathe 1 | VL, UE | 1 + 1 | 16 + 0 = 16 |
| BioB 4 Chemie | VL, SE | 1 + 1 | 32 + 8 = 40 |

- Die 250 Buchungen sind Termin × Raum. Verschiedene Termine je Gruppe sind es 238: Die Übung von
  BioB 1 teilt an zwei von vier Tagen jede Gruppe auf zwei Labore (6 Zeilen für 4 Termine).
- Ein Bestandteil hat keine Termine: BioB 3 UE, „Montag – Freitag, nach Vereinbarung“, die Zeiten
  stehen nur im Moodle-Kurs (Status `unplanned`, die Seite zeigt den Chip gesperrt).
- 180 Kombinationen aus je einer Gruppe pro Bestandteil, **108 davon ohne Überschneidung**
  (`plan.conflicts` über alle Einzeltermine). 4 Gruppenpaare überschneiden sich: Die Seminare
  BioB 1 Gruppe 3 und 6 (Fr 14–16) mit der Chemie-Vorlesung (Fr 13–17), die Seminare BioB 1
  Gruppe 2 und 5 (Mi 10–12) mit der Evolution-Übung Gruppe 2 (Mi 10:15–11:45).
- Lesemodell 159 KB (WI: etwa 400 KB). Die Vorschau zeigt beide Pläne, Biologie (HU) und
  Wirtschaftsinformatik (TU, Rohstand eines MOSES-Laufs vom selben Tag), über die Planwahl der Seite.
- Abruf: 74 Anfragen in 89 s, je Veranstaltung eine Sitzung, ≥ 1 s Abstand.
- Tests: `sh ops/test.sh` grün, 112 Python-Tests (28 neu) und 49 der Seite.

## 7. Erkenntnisse

1. **AGNES ist ein HIS LSF hinter einem HISinOne-Portal.** Alles, was der Stundenplanner braucht,
   ist ohne Login da. Echte Einzeldaten liefert aber nur der iCalendar-Export, und den erreicht man
   nur über den anonymen „Persönlichen Stundenplan“. Der Abruf merkt jede Gruppe einzeln vor und
   liest die neu hinzugekommenen Termin-IDs. Das ist sitzungsgebunden und nirgends dokumentiert,
   aber die Bedienung, die jede Studentin auch hat.
2. **Serien sind Regeln mit Ausnahmen, und LSF kennt die Ausnahmen.** Weihnachten steht als EXDATE
   im Export (VL Mo: 21.12. und 28.12.; Fr: 25.12. und 01.01.). `expandiere` rechnet nur das aus,
   was LSF schreibt (WEEKLY/DAILY, INTERVAL, UNTIL, COUNT, BYDAY), und jede Serie wird gegen die
   Terminzeile der Seite geprüft. So ist „ausgerechnet“ hier nachvollziehbar und kein Raten. Eigenheiten
   von LSF, alle mit Test: EXDATE trägt eine unpassende Uhrzeit (14:00Z für 08:15), also zählt nur das
   Datum. UNTIL ist der letzte Tag um 23:59Z. Eine Zeile ohne Termin wird `DTSTART:T00`. Und bei
   „14tgl./2“ zeigt die Seite den Beginn des Zeitraums, der erste Termin liegt eine Woche später
   (BioB 4 SE: Dauer ab 13.10., erster Termin 20.10.).
3. **Der Vertrag hält.** Rohstand, Lesemodell und Seite blieben unverändert; neu sind eine Quelle, die
   Quellenwahl und Katalogfelder. SYSTEM.md §6 Annahme 6 („Nur MOSES“) ist damit widerlegt, so wie
   es dort vorgesehen war: Eine andere Quelle schreibt denselben Rohstand.
4. **Das Semester gehört zur Hochschule.** Anker, Quelle und Namensraum der Module hängen daran.
   „WiSe 2026/27“ ist kein gemeinsamer Schlüssel für TU und HU.
5. **Die StuPO war hier schnell gelesen und gut maschinell gegenprüfbar.** Ein Mitteilungsblatt,
   Anlage 3 und Anlage 1 genügten. AGNES nennt je Veranstaltung das Fachsemester, MOSES nicht. Der eine
   Fehleintrag (BioB 26 PR) zeigt aber, dass der Katalog ein Mensch freigeben muss.
6. **Die Gruppenlogik der HU ist eine andere.** Gruppen werden selten frei gewählt: Die Übung
   BioB 1 teilt die Modulleitung ein, das Seminar BioB 1 wird in der Vorbesprechung vergeben, die Übung
   BioB 2 verlost AGNES nach Prioritäten, die Übung BioB 3 vergibt Moodle. Der Stundenplanner ist an der
   HU damit eher eine **Hilfe beim Setzen von Prioritäten** als ein Plan zum Buchen.

## 8. Problemstellen, nach Gewicht

### A. Rechtliches (zuerst klären, bevor etwas täglich läuft)

1. **robots.txt von AGNES sperrt KI-Crawler ausdrücklich.** `User-agent: ClaudeBot`, `anthropic-ai`,
   `GPTBot`, `CCBot`, `PerplexityBot` u. a.: `Disallow: /`. Für alle anderen (`*`) sind u. a. `/lsf*`,
   `/his*`, `/qisfsv*` gesperrt, **nicht** `/lupo/` (die Zeile `#Disallow: /lupo/` ist auskommentiert).
   Der Abruf meldet sich als `Stundenplanner/1.0 (+github…)` und liest nur `/lupo/`. Er ist also nicht
   gesperrt. Aber diese Recherche hat ein KI-Agent gemacht (mit dem Projekt-User-Agent, wenige
   gezielte Abrufe, etwa 300 Anfragen über den Tag). Ob das dem Willen der HU entspricht, muss **Silas
   entscheiden**. Empfehlung: Vor einem täglichen Lauf das AGNES-Team (ZE CMS, Abt. 1, Adresse im
   Impressum von AGNES) fragen, und nach einem offiziellen Export.
2. **Die Webseiten der HU stehen hinter einer Bot-Sperre gegen KI-Firmen** (Anubis auf
   `hu-berlin.de`, `biologie.hu-berlin.de`, `gremien.hu-berlin.de`). Wir haben sie nicht umgangen. Folge:
   Die Vorlesungszeit ist nur über einen Suchauszug belegt (§2) und braucht Silas' Blick.
3. **Nutzungsbedingungen:** Das Impressum von AGNES schützt nur Fotos und Grafiken. Zu den
   Daten des Vorlesungsverzeichnisses sagt es nichts. *Vermutung, keine Rechtsauskunft:* Ein
   täglicher, systematischer Auszug könnte das Schutzrecht des Datenbankherstellers berühren
   (§ 87b UrhG). Das gilt für MOSES genauso und gehört in Silas' Entscheidung zu Betrieb und Lizenz.
4. **AGNES veröffentlicht Zugangsdaten im Freitext**: Moodle-Einschreibeschlüssel und Kurspasswörter
   in Kommentaren (BioB 2, BioB 3). Der Abruf schwärzt jeden Satz, der danach klingt, und jede
   E-Mail-Adresse (`schwaerzen`, mit Tests). Das Muster ist eine Heuristik und schwärzt im Zweifel
   zu viel. Rohe Kommentare dürfen nie ins öffentliche Lesemodell.
5. **Texte der Seite sind für die HU falsch** (absichtlich nicht angefasst, `web/` baut landeklappe):
   „Kein offizielles Angebot der TU Berlin. Verbindlich sind MOSES und die Anmeldungen dort.“, „Quelle:
   MOSES der TU Berlin“, Linkbeschriftungen „MOSES“/„ISIS“, „Prüfe die Termine in MOSES“, Impressum.
   Vorschlag: Die Seite nimmt `hochschule` aus dem Studiengang und `quelle.name` aus dem Semester
   (Katalog → Lesemodell), statt TU und MOSES fest zu nennen. Dazu kennt `typLang` in
   `web/raster.mjs` die Kürzel `SE` und `PR` nicht (die Seite zeigt „SE“ statt „Seminar“).

### B. Stabilität der Quelle

1. **Der Weg zu den Termin-IDs ist undokumentiert und sitzungsgebunden** (vormerken per POST, dann
   Semesteransicht). Ändert die HU das, scheitert der Abruf mit einer festen Meldung. Der letzte gute
   Stand bleibt dann stehen.
2. **LSF ist ein Auslaufmodell.** Das Portal ist schon HISinOne, nur das Vorlesungsverzeichnis ist
   noch LSF im iframe. Zieht die HU es nach HISinOne um, braucht es eine dritte Quelle.
3. **Titel im Baum ändern sich** mit jeder SPO und jedem Semester-Neuaufbau („B.Sc. Biologie
   Monobachelor (SPO 2025)“). Der Katalog muss sie dann nachziehen. Der Abruf meldet „… fehlt“, statt
   ein falsches Modul zu nehmen.
4. **Keine Semesterwahl:** Der Abruf liest das Semester, das AGNES ohne Wahl zeigt (heute WiSe
   2026/27). Für ein SoSe 2027 vor dem Umschalten fehlt die Wahl in `lsf.py`. Er bricht ab, statt das
   falsche Semester zu lesen.
5. **Anfragen je Modul höher als bei MOSES** (2 je Gruppe): Bei Modulen mit vielen Gruppen wächst der
   Lauf linear. Für BioB 1–4 sind es 74 Anfragen.

### C. Gruppenlogik

1. **Freie Gruppenwahl ist an der HU die Ausnahme** (§7 Punkt 6). Das Modell „eine Gruppe je
   Bestandteil, die du wählst“ stimmt als Planung, nicht als Anmeldung. Wie vergeben wird, steht nur
   im Freitext. Vorschlag: ein Katalogfeld je Bestandteil (`vergabe`: frei, Prioritäten, Einteilung,
   extern), von Hand aus StuPO und AGNES gepflegt, das die Seite nennt.
2. **Strukturierte Termine und Freitext widersprechen sich** bei BioB 4. Laut AGNES-Zeilen liegt die
   VL wöchentlich Fr 13–17 ab 16.10. Laut Freitext beginnt sie am 06.11., dazu kommen Zoom-Termine
   dienstags. Das SE steht als „Di 13–15, 14-täglich“ in den Zeilen, laut Freitext gibt es Präsenz
   freitags und Zoom dienstags. Der Freitext hat dazu Tippfehler („Freitag, 04.11.2026“, ein
   Mittwoch). Der Abruf rechnet nur mit den Zeilen und setzt vor den Hinweis „Achtung: Der Freitext in
   AGNES nennt eigene Termine“. Auflösen kann das nur die Lehrende oder die HU.
3. **Termine ohne Zeit:** BioB 3 UE hat keine Termine in AGNES, nur in Moodle (Login). Der
   Bestandteil bleibt sichtbar, ohne Gruppe zum Einplanen.
4. **Ein Termin in zwei Räumen** (BioB 1 UE): zwei Buchungen zur selben Zeit. Die Konfliktprüfung ist
   davon nicht betroffen (gleiche Gruppe), die Zählung „Einzeltermine“ zählt Termin × Raum.
5. **Raum fehlt** (BioB 4 SE): Der Ort steht in der Bemerkung der Zeile. Er erscheint als Notiz
   der Buchung, nicht als Raum.

### D. Praktika

1. Das 1. Fachsemester hat **kein Praktikum**. Ab dem 2. kommen sie: BioB 8 „Labortechnisches
   Praktikum der Chemie“ (50 Std., „blockweise oder studienbegleitend“, Antestat und
   Sicherheitseinweisung, StO §5 Abs. 3) und BioB 20 Studienprojekt (360 Std. Präsenz). Blocktermine
   kommen in LSF als Rhythmus „Block“/„BlockSa“. Welche RRULE der Export dafür schreibt, ist
   ungeprüft. `expandiere` kennt FREQ=DAILY, lehnt aber jede andere Form ab. Das zeigt sich erst mit
   dem 2. Fachsemester (SoSe 2027).
2. Labore teilen Gruppen über Räume auf (C4). Bei Praktika ist mit mehr davon zu rechnen.

### E. Katalog und Studienordnung

1. **Der ÜWP (5 LP im 1. Semester) fehlt im Plan.** Er ist frei aus Katalogen der ganzen HU wählbar.
   Das ist SYSTEM.md §6 Annahme 1 (Wahlpflicht) in seiner weitesten Form.
2. **Zwei Ordnungen zugleich:** Höhere Fachsemester studieren bis 30.09.2027 nach SPO 2021 (Module
   „MB …“, eigener Baum). Ein Plan für sie braucht eigene Katalogeinträge, kein Fachsemester-Feld.
3. **Der Studienverlaufsplan ist „idealtypisch, aber nicht verpflichtend“** (Anlage 3). Der Katalog
   bildet ihn ab. Wer abweicht, findet seine Module nur in anderen Plänen.

## 9. Empfehlung für Phase 2: wie man eine weitere Hochschule anbindet

1. **Recherche in fester Reihenfolge**, je 15 bis 30 Minuten:
   (a) geltende StuPO im Amtsblatt und der Studienverlaufsplan, mit Inkrafttreten und Übergang;
   (b) welches System die Termine hat (MOSES, HIS LSF, HISinOne, CampusNet, Stud.IP …);
   (c) robots.txt, Impressum, Bot-Sperren; (d) Vorlesungszeit als Anker, aus einer Primärquelle.
2. **Quellen je System, nicht je Hochschule.** `lsf.py` nennt keine HU: Eine zweite LSF-Hochschule
   ist eine Semester- und eine Studiengangsdatei. Der nächste sinnvolle Test ist genau das, mit einer
   anderen Hochschule, die noch LSF hat. Für HISinOne braucht es eine neue Quelle nach demselben
   Muster: erst ein echter Export, dann Gegenprobe Seite ↔ Export, dann der Rohstand.
3. **ARCHITEKTUR §3 nachziehen** (Datei des Leit-Agenten): Semester mit `quelle {art, name, basis,
   semester, label}` statt nur `moses`, Plan/Modul mit `vvz_pfad`, `vvz`, `bereich`, und das Semester je
   Hochschule (§5 hier). Die Felder stehen schon in `abruf/README.md`.
4. **Die Seite nennt Hochschule und Quelle aus dem Katalog** (A5), statt TU und MOSES im Text.
5. **Vor jedem täglichen Lauf: Einverständnis der Hochschule.** Der Abruf ist höflich (eine Sitzung je
   Veranstaltung, ≥ 1 s, Projekt-User-Agent, nur der Host aus dem Katalog), aber die HU sperrt
   KI-Crawler ausdrücklich (A1). Eine Mail an das AGNES-Team ist billiger als eine Sperre.
6. **Semesterwahl in `lsf.py`** (B4), bevor das SoSe 2027 gebraucht wird.
7. **Vergabeart je Bestandteil** in den Katalog (C1), damit die Seite sagt, wann eine Wahl nur
   eine Priorität ist.

## 10. Aufwand

Etwa 4 Stunden Agentenzeit: Recherche (StuPO, AGNES, Exportweg) etwa 1,5 h, Bau mit Tests 2 h,
Bericht und Vorschau 0,5 h. An AGNES gingen über den Tag etwa 300 Anfragen: Erkundung, drei volle
Läufe zu je 74 Anfragen und Fehlersuche. Ein täglicher Lauf wären 74. Für eine weitere
LSF-Hochschule schätze ich 1 bis 2 Stunden (Katalog, Pfad, ein Lauf, Gegenprobe), für ein neues
System 4 bis 8 Stunden.
