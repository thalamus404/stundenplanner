# Forschung: Lehrveranstaltungsformate an TU, HU und FU, in drei Kategorien

> **⛔ Keine Zugriffe auf Systeme der TU Berlin ohne Silas’ ausdrückliche Genehmigung**
> (Silas, 05.10.2026; [AGENTS.md §2 ⑦](../../AGENTS.md#2-die-regeln)). Das gilt für jeden Weg: Abruf-Code, Skript, `curl`,
> Browser-Automatisierung, `WebFetch` eines Agenten, auch für eine einzelne Seite „nur zum Nachsehen“.
> Genehmigt ist allein der tägliche Lauf um 05:20 im Container `stundenplanner-abruf`. Wer mehr braucht,
> fragt Silas **vorher** und nennt **Umfang**, **Maßnahmen gegen Last** und **Grund**. Dasselbe gilt für
> die Vorlesungsverzeichnisse anderer Hochschulen. Der Code sperrt selbst (`abruf/zugang.py`).

> V-0238, Rufzeichen `formation`, 05.10.2026. Die Daten stehen in
> [`katalog/formate.json`](../../katalog/formate.json), das Feld im Lesemodell in
> [`docs/ARCHITEKTUR.md`](../ARCHITEKTUR.md) §3 und §5. Dieser Bericht sagt, woher jede Zeile
> kommt und warum sie in ihrer Kategorie steht.

## 1. Auftrag und Kurzantwort

Silas, 05.10.2026: Die Seite soll Formate leicht über die Sättigung unterscheiden, Vorlesung 100 %,
IV auch, Übung 70 %, Tutorium 50 %. *„Dafür bitte vorher einmal checken, welche Formate es gibt,
alle an der TU auflisten, alle an der HU auflisten und alle an der FU auflisten, und dann 3
Kategorien erstellen: 100 % = alles, was üblicherweise Präsenz und im Stil einer Vorlesung passiert,
70 % alles, was dem Format Übung entspricht (gemeinsam Aufgaben machen etc.), und 50 % alles
andere.“*

| Kategorie | Sättigung | Formate (Kürzel im Katalog) |
|---|---|---|
| `vorlesung` | 100 % | VL Vorlesung (auch Vertiefungsvorlesung), IV Integrierte Veranstaltung, VL/UE Vorlesung/Übung, RV Ringvorlesung |
| `uebung` | 70 % | UE Übung (auch Methodenübung), MU Mathematik-Übung, PR Praktikum, LTP Labortechnisches Praktikum, LAB Labor, SE/UE Seminar/Übung |
| `sonstige` | 50 % | TUT Tutorium, SE Seminar (auch Praxisseminar, Seminar/Proseminar, Seminar am PC), PS Proseminar, HS Hauptseminar, PJS Projektseminar, PJ Projekt, P-PR Programmierpraktikum, SPJ Studienprojekt, LI Lerninsel, KO Kolloquium, EX Exkursion, KU Kurs, SU Seminaristischer Unterricht, BP Berufspraktikum, **und jedes Format, das der Katalog nicht kennt** |

Silas' Beispiele gelten fest (VL 100, IV 100, UE 70, TUT 50); ein Test prüft sie
(`abruf/tests/test_formate.py`).

## 2. Wie gelesen wurde, und was nicht

Vor jedem Abruf stand die `robots.txt` des Servers (gelesen am 05.10.2026).

| Server | robots.txt | Folge |
|---|---|---|
| `moseskonto.tu-berlin.de` (MOSES) | `User-agent: *` / `Disallow: /` | **Keine neue Anfrage.** Gelesen wurden nur die Rohstände, die der Abruf des Stundenplanners am 05.10.2026 ohnehin geholt hatte (V-0227, V-0228). Dass der tägliche Abruf gegen diese Regel liest, ist ein eigener Befund: Punkt 458a4bee |
| `www.tu.berlin`, `www.static.tu.berlin` | sperrt u. a. `Claude-User`, `Claude-Code`, `ClaudeBot` ausdrücklich, `Content-Signal: ai-input=no` | Keine Anfrage. Die Allgemeine Studien- und Prüfungsordnung der TU und die fachspezifischen Ordnungen sind deshalb **nicht** gelesen |
| `agnes.hu-berlin.de` und die HU-Seiten hinter der KI-Sperre | (Punkt 7411bed1) | Keine Anfrage. Gelesen wurde der vorhandene AGNES-Rohstand Biologie FS 1 (V-0229) |
| `edoc.hu-berlin.de` (Dokumentenserver der HU) | erlaubt alles außer `/search`, `/admin`, `/login` u. a. | 7 PDFs, gefunden über eine Suchmaschine, nicht über die Suche von edoc: 5 Ordnungen bzw. Änderungen (§9), 2 Fehltreffer |
| `www.fu-berlin.de` | erlaubt alles außer `…/_search` | 14 Anfragen: RSPO (Amtsblatt), Start und Suchmaske des Vorlesungsverzeichnisses, 5 Fachbereichsseiten, 6 Veranstaltungslisten. Je Anfrage 2 bis 3 Sekunden Pause |

## 3. TU Berlin

**Quelle:** MOSES, wie der Abruf es liest (`abruf/moses.py`): die Spalte **„Art“** der Tabelle
„Lehrveranstaltungen“ in der Modulbeschreibung (im Rohstand `components[].type`) und die Spalte
**„Veranstaltungsformat“** des CSV-Exports der Einzelbuchungen (`bookings[].format`). Stichprobe:
die Rohstände vom 05.10.2026 für alle Module des Katalogs (Wirtschaftsinformatik mit Wahlpflicht,
Wirtschaftsingenieurwesen, Informatik, Nachhaltiges Management), **182 Module im WiSe 2026/27 und
150 im SoSe 2026**. Das ist nicht die ganze TU; ein Format, das nur in anderen Fakultäten vorkommt,
fehlt hier und wird beim ersten Abruf als unbekannt gemeldet (§7).

MOSES mischt in „Art“ Kürzel und Wörter: „VL“, aber „Projekt“ und „Praktikum“.

| MOSES-Art | CSV „Veranstaltungsformat“ | Bestandteile WiSe 26/27 | SoSe 26 | Buchungen WiSe / SoSe | Katalog | Kategorie |
|---|---|---:|---:|---:|---|---|
| VL | Vorlesung | 70 | 32 | 987 / 513 | VL | vorlesung |
| IV | Integrierte Veranstaltung | 36 | 21 | 511 / 342 | IV | vorlesung |
| UE | Übung | 56 | 25 | 2486 / 1071 | UE | uebung |
| Praktikum | Praktikum | 11 | 26 | 228 / 250 | PR | uebung (Grenzfall) |
| LAB | (keine Buchung) | 1 | 0 | 0 / 0 | LAB | uebung (Langname vermutet) |
| TUT | Tutorium | 13 | 9 | 2030 / 1466 | TUT | sonstige |
| SEM | Seminar | 58 | 52 | 430 / 402 | SE | sonstige |
| Projekt | Projekt | 25 | 21 | 202 / 215 | PJ | sonstige |
| P-PR | Programmierpraktikum | 0 | 6 | 0 / 67 | P-PR | sonstige |
| LI | Lerninsel | 1 | 1 | 395 / 148 | LI | sonstige |
| KU | (keine Buchung) | 1 | 1 | 0 / 0 | KU | sonstige (Langname vermutet) |
| Kolloquium-F | Kolloquium | 1 | 1 | 16 / 0 | KO | sonstige |

Art und CSV-Format passen in jeder Buchung zusammen (kein Bestandteil mit gemischten Formaten).
Was die Modulbeschreibungen unter „Beschreibung der Lehr- und Lernformen“ sagen, trägt die
Grenzfälle in §6: etwa 40525 Kognitive Algorithmen zu „KU“ („mehrtägige Blockveranstaltung mit
Frontalunterricht und betreuten Übungen“), 40774 Grundlagen der Elektrotechnik zu „LAB“
(„Laborübungen in Kleingruppen“), die sechs Module mit „P-PR“ („Projektteam- und
Kleingruppenarbeit, … Meilensteine, … Abschlusspräsentation“).

## 4. HU Berlin

**Quellen:** die fachspezifischen Studien- und Prüfungsordnungen im Amtlichen Mitteilungsblatt (AMB),
vom Dokumentenserver edoc (§9), und der AGNES-Rohstand Biologie B.Sc. FS 1 (4 Module, V-0229).
AGNES nennt die Art ausgeschrieben („Vorlesung“, „Übung“, „Seminar“); `abruf/lsf.py` kürzt sie
mit `ARTEN` (z. B. „Seminar“ → „SE“).

**Die Liste der HU steht in der ZSP-HU**, der Fächerübergreifenden Satzung zur Regelung von
Zulassung, Studium und Prüfung (Fassung vom 30.04.2013, AMB 15/2013). Die Ordnungen verweisen
darauf: „Lehrveranstaltungsarten sind über die in der ZSP-HU benannten Lehrveranstaltungsarten
hinaus auch …“ (AMB 27/2025 § 5, AMB 26/2025 § 4). Die ZSP-HU selbst liegt nur auf HU-Seiten
hinter der KI-Sperre; auf edoc fand sich nur ihre 25. Änderung (AMB 25/2026), die den Abschnitt
nicht berührt. **Die Grundliste der HU ist also nicht gelesen** (§8).

| Kürzel | Langname | Beleg | Katalog | Kategorie |
|---|---|---|---|---|
| VL | Vorlesung | AMB 27/2025 Anlage 1 (49-mal), 26/2025, 41/2026, 35/2025; AGNES (4 Bestandteile, 95 Buchungen) | VL | vorlesung |
| UE | Übung | AMB 27/2025 (20-mal), 41/2026, 35/2025; AGNES (3 Bestandteile, 111 Buchungen) | UE | uebung |
| MU | Mathematik-Übung | AMB 26/2025 § 4: „Es werden Aufgaben gestellt und unter Anleitung gelöst.“ | MU | uebung |
| PR | Praktikum | AMB 27/2025 (8-mal; „Im Praktikum werden Experimente zu folgenden … durchgeführt“) | PR | uebung |
| LTP | Labortechnisches Praktikum | AMB 27/2025 § 5 Abs. 3: Durchführung, Protokollierung und Auswertung von Experimenten | LTP | uebung |
| SE | Seminar | AMB 27/2025 (11-mal), 41/2026 (54-mal), 35/2025; AGNES (2 Bestandteile, 44 Buchungen) | SE | sonstige |
| TU | Tutorium | AMB 41/2026: „Übung (UE) oder Tutorium (TU)“ | TUT | sonstige |
| SPJ | Studienprojekt | AMB 27/2025 § 5 Abs. 2 | SPJ | sonstige |
| HS | (nicht ausgeschrieben) | AMB 27/2025, Wahlpflichtmodule (16-mal) | HS Hauptseminar | sonstige |
| CO | (nicht ausgeschrieben) | AMB 27/2025, 35/2025 | KO Kolloquium | sonstige |
| FS | (nicht ausgeschrieben) | AMB 35/2025 („VL/SE/UE/FS/CO“) | **nicht im Katalog** | sonstige als unbekannt |
| — | Exkursion | AMB 27/2025, nur als Inhalt („Exkursion: Biologische Feldarbeit …“) | EX | sonstige |

Dazu kann `abruf/lsf.py` diese Kurzformen schreiben, auch wenn sie in den gelesenen Quellen nicht
vorkamen: PS, HS, KO, PJS, EX, VL/UE, SE/UE. Alle stehen im Katalog; ein Test hält das fest.

## 5. FU Berlin

**Quellen:** die Rahmenstudien- und -prüfungsordnung (RSPO, FU-Mitteilungen 32/2013) und das
Vorlesungsverzeichnis WiSe 2026/27, das aus dem Campus Management kommt. Die RSPO zählt keine
Arten auf; sie verlangt nur, dass Modul und Leistungsnachweis sie nennen (§ 10 Abs. 6 b:
„Lehrveranstaltungsarten“). Die Arten stehen also in den Ordnungen der Fächer und im Verzeichnis.
Gelesen wurden sechs Listen mit zusammen **494 Einträgen**: Informatik (gesamtes Lehrangebot),
Mathematik B.Sc. (2024), Chemie B.Sc. (2024), Politikwissenschaft B.A. (2019), Philosophie
Kernfach (2022), BWL B.Sc. (ab 2017/18). Das Verzeichnis schreibt die Art aus, Kürzel stehen
höchstens im Titel (BWL: „(V)“, „(Ü)“, „(S)“, „(T)“, „(P)“).

| Art im Verzeichnis | Einträge | wo | Katalog | Kategorie |
|---|---:|---|---|---|
| Seminar | 169 | Philosophie 144, Informatik 10, BWL 6, Mathematik 5, Chemie 3, Politik 1 | SE | sonstige |
| Vorlesung | 91 | Informatik 27, Chemie 24, BWL 17, Mathematik 9, Politik 8, Philosophie 6 | VL | vorlesung |
| Übung | 71 | Informatik 26, Chemie 20, BWL 13, Mathematik 12 | UE | uebung |
| Proseminar | 52 | Politik 49, Informatik 3 | PS | sonstige |
| Colloquium | 19 | Politik 12, Philosophie 7 | KO | sonstige |
| Hauptseminar | 16 | Politik 16 | HS | sonstige |
| Methodenübung | 15 | BWL 15 (die „(Ü)“ zur Vertiefungsvorlesung) | UE | uebung |
| Vertiefungsvorlesung | 13 | BWL 13 | VL | vorlesung |
| Projektseminar | 9 | Informatik 9 („Softwareprojekt …“) | PJS | sonstige |
| Praktikum | 8 | Chemie 6 (Labor), Informatik 2 | PR | uebung |
| Seminar/Proseminar | 7 | Informatik 6, Mathematik 1 | SE | sonstige |
| Praxisseminar | 5 | Philosophie 3, Informatik 2 | SE | sonstige |
| Tutorium | 4 | BWL 4 | TUT | sonstige |
| Seminar am PC | 3 | Informatik 3 | SE | sonstige (Grenzfall) |
| Kurs | 3 | Informatik 3 | KU | sonstige |
| Begrüßungs- und Abschlussveranstaltung | 2 | Informatik 2 | **nicht im Katalog** (keine Lehrveranstaltung) | sonstige als unbekannt |
| Seminaristischer Unterricht | 2 | Informatik 1, BWL 1 | SU | sonstige |
| Methodenkurs | 1 | Informatik | KU | sonstige |
| Brückenkurs | 1 | Informatik | KU | sonstige |
| Berufspraktikum | 1 | Informatik | BP | sonstige |
| RV | 1 | Informatik („Einführung in die Profilbereiche Data Science“) | RV Ringvorlesung | vorlesung |
| Projekt | 1 | BWL | PJ | sonstige |

Die FU hat noch keinen Abruf im Stundenplanner. Ihre Zeilen stehen im Katalog, damit ein späterer
Abruf sie trifft; sechs Listen sind aber nicht das ganze Verzeichnis.

## 6. Zuordnung und Grenzfälle

Die Regel hinter den drei Kategorien:

- **`vorlesung`**: Lehrende tragen vor, alle Teilnehmenden zugleich, in Präsenz. Mischformen aus
  Vorlesung und Übung zählen wie ihr Vorlesungsanteil, denn so hat Silas die IV gesetzt.
- **`uebung`**: Aufgaben werden gemeinsam und **unter Anleitung von Lehrenden** gelöst, in festen
  Gruppen und Terminen.
- **`sonstige`**: alles andere, besonders was von Studierenden geleitet wird (Tutorium, Silas: 50 %),
  was frei zugänglich ist, was erarbeitet, vorgetragen und diskutiert wird (Seminar), und was als
  Projekt oder Block läuft.

| Format | Entscheidung | Grund |
|---|---|---|
| **Praktikum (PR)** | uebung | Im Kern betreute praktische Arbeit zu festen Terminen: Versuche im Labor (HU Biologie, FU Chemie, HU LTP), betreute Rechnerübungen (TU, Betriebssystempraktikum 40358). Das ist gemeinsames Aufgabenlösen unter Anleitung. **Vorbehalt:** An der TU heißen auch Software-Teamprojekte „Praktikum“ (z. B. 40045, 40135); die wären als sonstige richtiger, sind am Kürzel aber nicht zu erkennen |
| **Programmierpraktikum (P-PR, TU)** | sonstige | Trotz des Namens ein Projekt: alle sechs Modulbeschreibungen nennen Projektteams, Besprechungen, Meilensteine, Abschlusspräsentation |
| **Labor (LAB, TU), Labortechnisches Praktikum (LTP, HU)** | uebung | Versuche in Kleingruppen unter Anleitung, wie PR |
| **Seminar (SE) und seine Spielarten** (Proseminar, Hauptseminar, Praxisseminar, Seminar/Proseminar) | sonstige | Erarbeiten, Vortragen, Diskutieren: weder Vortrag im Stil einer Vorlesung noch Aufgabenrechnen |
| **Seminar am PC (FU)** | sonstige | Einmal die Übung zu Rechnerarchitektur (zehn parallele Termine im Rechnerpool), einmal ein Seminar, einmal ein Programmierpraktikum. Es bleibt beim Wort der Quelle |
| **Projekt (PJ), Projektseminar (PJS), Studienprojekt (SPJ)** | sonstige | Eigenständige Teamarbeit; feste Termine sind Besprechungen |
| **Lerninsel (LI, TU)** | sonstige | Man rechnet dort Aufgaben, aber in einem offenen Angebot ohne feste Gruppe (`katalog/bestandteile.json`: Gruppen „keine“), betreut wie ein Tutorium |
| **Kurs (KU), Methodenkurs, Brückenkurs** | sonstige | Mischen Vortrag und Übung, oft als Block oder vor dem Semester |
| **Kolloquium (KO, auch „Kolloquium-F“ und „CO“), Exkursion (EX)** | sonstige | Vorträge zur Forschung, Arbeit im Gelände, meist Block |
| **Seminaristischer Unterricht (SU, FU)** | sonstige | Unterricht in Seminarform mit Beteiligung, nicht im Stil einer Vorlesung |
| **Berufspraktikum (BP, FU)** | sonstige | Tätigkeit im Betrieb, keine Lehrveranstaltung. Eigener Eintrag, damit es nie als PR gelesen wird |
| **Vorlesung/Übung (VL/UE), Seminar/Übung (SE/UE)** | vorlesung bzw. uebung | Mischformen zählen wie ihr höherer Anteil, wie die IV |
| **Ringvorlesung (RV, FU)** | vorlesung | Vorlesungsreihe mit wechselnden Vortragenden |
| **Vertiefungsvorlesung, Methodenübung (FU, BWL)** | wie VL bzw. UE | Das Paar „(V)“ und „(Ü)“ desselben Moduls |

**Ein Kürzel für alle Hochschulen.** Wo zwei Quellen dasselbe Format verschieden schreiben, gilt im
Katalog ein Kürzel, die anderen Schreibweisen sind `namen`: MOSES „SEM“ und AGNES „SE“ ergeben `SE`,
MOSES „Projekt“ ergibt `PJ`, „Kolloquium-F“, „Colloquium“ und „CO“ ergeben `KO`, HU „TU“ ergibt
`TUT`. `PJ`, `SU` und `BP` hat keine gelesene Quelle als Kürzel (`kuerzel_eigen`). Im Lesemodell
bleibt `type` daneben, wie die Quelle es schreibt.

## 7. Im Lesemodell

Jeder Bestandteil trägt `format: { kuerzel, lang, kategorie }` (ARCHITEKTUR §5). `abruf/bauen.py`
sucht erst mit der Art des Bestandteils, dann mit dem Format seiner Buchungen. Ein Format, das der
Katalog nicht kennt, wird `sonstige` mit `unbekannt: true`, und die Ausgabe von `bauen.py` nennt
es („Format unbekannt: „XY“ in 3 Bestandteilen, z. B. …“). Mit den Rohständen der Vorschau vom
05.10.2026 bleibt kein Format unbekannt: 269 Bestandteile, davon 102 vorlesung, 82 uebung und 85
sonstige.

**Eintragen eines neuen Formats:** Quelle lesen (robots.txt beachten, §2), dann in
`katalog/formate.json` ein Kürzel mit `lang`, `kategorie`, `hochschulen`, `namen`, `quelle`,
`grund` und, wo etwas nicht belegt ist, `vermutung`; die Tabelle der Hochschule hier ergänzen.

## 8. Lücken und was Silas entscheidet

1. **Die Grundliste der HU (ZSP-HU) ist nicht gelesen.** Sie liegt nur hinter der KI-Sperre. Die
   HU-Zeilen kommen aus vier Fachordnungen und einem AGNES-Rohstand. Die Langnamen zu **HS**, **CO**
   und **FS** stehen dort nicht; HS und CO sind nach dem Wort der FU eingetragen (`vermutung`), FS
   fehlt im Katalog und würde als unbekannt gemeldet.
2. **TU-Ordnungen nicht gelesen.** `tu.berlin` sperrt Claude ausdrücklich und setzt
   `ai-input=no`; die TU-Zeilen kommen allein aus MOSES-Rohständen, die schon da waren. Die
   Langnamen zu **KU** (Kurs) und **LAB** (Labor) liefert MOSES nicht, weil die Bestandteile keine
   Buchung haben; sie folgen aus den Modulbeschreibungen (`vermutung`). Was das „F“ in
   **„Kolloquium-F“** heißt, sagt keine gelesene Quelle.
3. **MOSES verbietet in der robots.txt jeden Abruf** (`Disallow: /`), auch den täglichen des
   Stundenplanners. Punkt 458a4bee, wie bei der HU (7411bed1): Silas entscheidet, ob die TU
   gefragt wird.
4. **Praktikum als Übung** (70 %) passt für Labor und betreute Rechnerübungen, an der TU-Informatik
   aber nicht für die Teamprojekte, die auch „Praktikum“ heißen. Wenn das auf der Seite stört,
   wäre die Alternative `sonstige`, dann sähe das Laborpraktikum der Chemie aus wie ein Tutorium.
5. **Kürzel über alle Hochschulen** (`SE` statt MOSES „SEM“, `PJ` statt „Projekt“): Ob die Seite
   `format.kuerzel` oder `type` zeigt, entscheidet, wer die Seite baut.
6. **FU ohne Abruf**, und die sechs Listen sind eine Stichprobe. Neue Arten meldet erst ein Abruf.

## 9. Quellen

Alle am 05.10.2026 gelesen.

| Quelle | Adresse | Was daraus stammt |
|---|---|---|
| MOSES (TU), Modulbeschreibungen und CSV-Export, über die Rohstände des Abrufs (V-0227, V-0228) | <https://moseskonto.tu-berlin.de> (nicht neu abgerufen) | §3: Art, CSV-Format, Zählungen, Beschreibungen der Lehr- und Lernformen |
| robots.txt MOSES, TU-Webseiten | <https://moseskonto.tu-berlin.de/robots.txt>, <https://www.tu.berlin/robots.txt>, <https://www.static.tu.berlin/robots.txt> | §2 |
| AGNES (HU), Rohstand Biologie B.Sc. FS 1 (V-0229) | <https://agnes.hu-berlin.de> (nicht neu abgerufen) | §4: Arten Vorlesung, Übung, Seminar |
| HU, AMB 27/2025: Fachspezifische Studien- und Prüfungsordnung Bachelor Biologie | <https://doi.org/10.18452/34250>, PDF: <https://edoc.hu-berlin.de/server/api/core/bitstreams/16900a72-1f9b-4019-b12a-d25ea8223108/content> | § 5 (SPJ, LTP, Verweis auf ZSP-HU), Anlage 1 (VL, UE, SE, PR, HS, CO) |
| HU, AMB 26/2025: Fachspezifische Studien- und Prüfungsordnung Bachelor Mathematik (Kombination) | <https://doi.org/10.18452/34249>, PDF: <https://edoc.hu-berlin.de/server/api/core/bitstreams/4665ab2b-38f7-4dba-93a8-7bab422b9d32/content> | § 4 (MU) |
| HU, AMB 41/2026: Fachspezifische Studien- und Prüfungsordnung Bachelor Deutsch | <https://doi.org/10.18452/38349>, PDF: <https://edoc.hu-berlin.de/server/api/core/bitstreams/ab960b65-d772-4b8b-9cbd-ad64bc9a0fa6/content> | TU = Tutorium, SE, VL, UE |
| HU, AMB 35/2025: Studien- und Prüfungsordnung Bildungswissenschaften und Sprachbildung (Master Lehramt) | <https://doi.org/10.18452/34409>, PDF: <https://edoc.hu-berlin.de/server/api/core/bitstreams/abb2a231-857d-4da2-bc8c-26483f67a7bf/content> | VL, SE, UE, FS, CO |
| HU, AMB 25/2026: Fünfundzwanzigste Änderung der ZSP-HU | <https://doi.org/10.18452/37498>, PDF: <https://edoc.hu-berlin.de/bitstreams/ff5fcca2-ccac-4923-a662-2c1fdc8c813f/download> | Fundstelle der ZSP-HU (Fassung vom 30.04.2013, AMB 15/2013); berührt die Lehrveranstaltungsarten nicht |
| robots.txt edoc | <https://edoc.hu-berlin.de/robots.txt> | §2 |
| FU, Rahmenstudien- und -prüfungsordnung (RSPO), FU-Mitteilungen 32/2013 | <https://www.fu-berlin.de/service/zuvdocs/amtsblatt/2013/ab322013.pdf> | § 10 Abs. 6 b: Arten stehen in Modul und Nachweis, keine eigene Liste |
| FU, Vorlesungsverzeichnis WiSe 2026/27 | <https://www.fu-berlin.de/vv/de/fb>; Listen: Informatik `modul?id=130142`, Mathematik `909351`, Chemie `914134`, Politikwissenschaft `559434`, Philosophie `770433`, BWL `407254` (je `&sm=1039762`) | §5: 494 Einträge mit Art |
| robots.txt FU | <https://www.fu-berlin.de/robots.txt> | §2 |
