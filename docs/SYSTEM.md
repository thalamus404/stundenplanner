# Systembericht — wie der Stundenplanner heute funktioniert

> **⛔ Keine Zugriffe auf Systeme der TU Berlin ohne Silas’ ausdrückliche Genehmigung**
> (Silas, 05.10.2026; [AGENTS.md §2 ⑦](../AGENTS.md#2-die-regeln)). Das gilt für jeden Weg: Abruf-Code, Skript, `curl`,
> Browser-Automatisierung, `WebFetch` eines Agenten, auch für eine einzelne Seite „nur zum Nachsehen“.
> Genehmigt ist allein der tägliche Lauf um 05:20 im Container `stundenplanner-abruf`. Wer mehr braucht,
> fragt Silas **vorher** und nennt **Umfang**, **Maßnahmen gegen Last** und **Grund**. Dasselbe gilt für
> die Vorlesungsverzeichnisse anderer Hochschulen. Der Code sperrt selbst (`abruf/zugang.py`).

> Stand 05.10.2026, am Beispiel **Wirtschaftsinformatik B.Sc., 1. Fachsemester, WiSe 2026/27**.
> Für alle, die das System auf weitere Fachsemester, Studiengänge oder Hochschulen übertragen. Wie
> die Teile im Code heißen, steht in [`ARCHITEKTUR.md`](ARCHITEKTUR.md), was das Werkzeug können
> soll, im [Scope](SCOPE.md). Dieser Bericht erklärt die **Logik dahinter**: woher jede Information
> kommt, wer was festlegt und wo das System Annahmen macht.

---

## 1. Die Kette in einem Satz

Ein Mensch schreibt aus der Studienordnung auf, **welche Module** ein Fachsemester hat (Katalog).
Der Abruf holt **je Modul** aus MOSES die gültige Modulbeschreibung, ihre **Bestandteile** (Vorlesung,
Übung, Tutorium …) und für jeden Bestandteil die **Termingruppen** mit allen **Einzelterminen**.
Das Lesemodell rechnet daraus Wochen-Slots, Rhythmus und Fingerabdrücke. Die Seite lässt je
Bestandteil **eine Gruppe** wählen und prüft die Auswahl gegen alle Einzeltermine auf Konflikte.

```
Studienordnung ──(von Hand)──► katalog/  ─┐
                                          ├─► abruf.py ──► Rohstand je Modul ──► bauen.py ──► Plan-JSON ──► Seite
MOSES (öffentlich, ohne Login) ───────────┘   (HTML + CSV-Export)                (Slots, Rhythmus,   (Auswahl im Browser,
                                                                                    Fingerabdruck)      Konflikte)
```

## 2. Welche Module gehören zum Fachsemester? — der Katalog

**Das weiß MOSES nicht von selbst, und der Abruf errät es nicht.** Die Zuordnung „Studiengang +
Fachsemester → Module“ kommt aus dem **Studienverlaufsplan** der Studien- und Prüfungsordnung
(StuPO) und steht von Hand in `katalog/studiengaenge/wi-bsc.json`:

| Modulnummer | Kurzname | Titel (aus MOSES) |
|---|---|---|
| 70123 | Einf. WI | Einführung in die Wirtschaftsinformatik |
| 41077 | Prog I | Programmieren I |
| 40271 | TechGI | Technische Grundlagen der Informatik |
| 70450 | Statistik I | Statistik I für Wirtschaftswissenschaften |
| 70112 | BuK | Bilanzierung und Kostenrechnung |

- Das sind die **Pflichtmodule des 1. Fachsemesters nach Regelstudienplan**. Wahlpflicht, Vertiefungen,
  Wiederholer und Studierende außerhalb der Regelstudienzeit kommen im Katalog nicht vor.
- Die **Modulnummer** ist der einzige Schlüssel zu MOSES. Kurznamen sind Anzeige.
- Das **Semester** steht in `katalog/semester/wise-2026-27.json`: Beschriftung für MOSES (`WiSe
  2026/27`) und der **Anker**, der Montag der ersten Vorlesungswoche (12.10.2026), für die A/B-Wochen.
- **Offene Frage für jede Übertragung:** Liefert MOSES den Studienverlaufsplan selbst maschinenlesbar?
  Bisher ungeprüft. Wenn ja, ließe sich der Katalog erzeugen statt abschreiben.

## 3. Woher die Daten kommen — MOSES

MOSES ist das Modul- und Veranstaltungssystem der TU Berlin (`moseskonto.tu-berlin.de`). Alles, was
der Abruf liest, ist **öffentlich und ohne Login** erreichbar. Je Modul sind es drei Arten Seiten und
ein Export (`abruf/moses.py`):

### 3.1 Versionsliste des Moduls → die gültige Version

`/moses/modultransfersystem/bolognamodule/ansehen.html?number=<Modulnummer>`

Die Tabelle mit „Gültig ab“ listet alle Versionen eines Moduls (Titel, gültig ab Semester, gültig
bis Semester oder „offen“). Der Abruf nimmt **die höchste Version, die im Zielsemester gilt**, und
merkt sich alle gültigen (`valid_versions`). Gilt keine: Fehler, kein Rückgriff auf eine alte. Beispiel:
70123 hat Version 11, gültig ab WiSe 2023/24.

### 3.2 Modulbeschreibung → die Bestandteile

Die Seite der gewählten Version (Link aus 3.1). Sie bestätigt `#Nummer / #Version` und enthält:

- die Tabelle der **Lehrveranstaltungen** (erkannt an den Spalten `SWS` und `VVZ`) mit Titel, Art
  (`VL`, `UE`, `TUT`, `IV` …), LV-Nummer, SWS, Turnus, Sprache, dem Abschnitt darüber (z. B.
  „Pflichtbereich“) und dem Link ins **Vorlesungsverzeichnis** (`veranstaltungsvorlage=<id>`).
  Daraus wird ein **Bestandteil** mit der Kennung `<Modulnummer>:<veranstaltungsvorlage>`
- den Link zur **ISIS-Kurssuche** des Moduls
- die Texte „Beschreibung der Lehr- und Lernformen“, „Anmeldeformalitäten“, „Sonstiges“ (`notes`)

WI 1. FS hat **11 Bestandteile**: je VL + UE (Einf. WI, Prog I, TechGI), VL + UE + TUT (BuK),
IV + TUT (Statistik I). Alle im Abschnitt „Pflichtbereich“.

### 3.3 Vorlesungsverzeichnis je Bestandteil → Semester und Gruppen

`/moses/verzeichnis/veranstaltungen/veranstaltungsvorlage.html?veranstaltungsvorlage=<id>&semester=<id>`

- Die **Semesterwahl** der Seite liefert die interne Semester-ID zu „WiSe 2026/27“. Ist das Semester
  gesperrt oder fehlt es: Fehler.
- Die Seite listet die **Termingruppen** (Links `veranstaltung.html?veranstaltung=<Gruppen-ID>`),
  dazu je Gruppe eine Kalenderbeschreibung (LV-Nummer, Format, Sprache, Dozierende, „Do. 15.10 –
  17.12.26, wöchentlich …“, Anzahl Termine, Ort). Die Beschreibung bleibt als `series` erhalten,
  Termine werden **nie** daraus errechnet.

### 3.4 Der CSV-Export der Einzelbuchungen → die echten Termine

Hinter „Liste als Excel-Datei exportieren“ steckt ein JSF-Dialog, der auch CSV kann. Der Abruf
spielt ihn nach (ViewState und Komponenten-IDs werden aus jeder Antwort neu gelesen), wählt genau
diese Spalten und holt die CSV:

`Veranstaltung ID` · `Veranstaltungsname` · `Veranstaltungsformat` · `Gruppe/ Planungsgruppe` ·
`LV-Nummer` · `Veranstaltung Semester` · `Buchung ID` · `Ort` · `ISO Beginn (Studierende)` ·
`ISO Ende (Studierende)` · `Buchungsnotiz` · `Veranstaltung Zusatzinformationen`

Jede Zeile ist **ein Einzeltermin** (Buchung) mit Beginn und Ende als ISO-Zeit, Raum und Notiz. Das
ist die **einzige Quelle für Termine**: Ferien, ausfallende Termine, Raumwechsel und Einzeltermine
stehen so drin, wie die Hochschule sie gebucht hat. WI 1. FS am 05.10.2026: **65 Gruppen, 949
Einzeltermine**.

**Prüfungen beim Lesen:** Jede Zeile muss das Zielsemester tragen, zu einer der Gruppen der Seite
gehören, Beginn vor Ende haben, und doppelte Buchungen müssen gleich sein. **Ausnahme (seit
05.10.2026):** Eine Gruppe, deren Buchungen *alle* ein anderes Semester tragen, wird ausgelassen und
am Bestandteil unter `ausgelassen` vermerkt. Anlass: Statistik I listete eine Tutoriumsgruppe mit
einer einzigen Buchung „SoSe 2026“ auf der WiSe-Seite; die strenge Regel verwarf das ganze Modul.

### 3.5 Höflichkeit und Ausfall

Eigene MOSES-Sitzung je Modul, 0,7 s zwischen Anfragen, ein erkennbarer User-Agent, nur
`moseskonto.tu-berlin.de`. Ein Lauf über 5 Module dauert etwa 75 s. **Ein Modul wird nur ersetzt,
wenn alle seine Bestandteile gelungen sind**, sonst bleibt der letzte gute Stand stehen.

## 4. Die Formate dazwischen

| Stufe | Wo | Inhalt |
|---|---|---|
| Rohstand | `daten/roh/<semester>/<modul>.json` | Modul (Titel, Version, Gültigkeit, Links, Hinweise) → Bestandteile (Art, SWS, Turnus, Abschnitt, Pflicht, Links) → Gruppen (Name, Link, `series`) → Buchungen (Beginn, Ende, Raum, Format, LV-Nummer, Notiz, Info) und `abruf` (geprüft, Erfolg, Fehler). Dazu `_lauf.json` je Lauf |
| Lesemodell | `web/daten/index.json`, `web/daten/<studiengang>/<semester>-fs<n>.json` | dasselbe, je Gruppe ergänzt um `key`, `digest`, `slots`; je Plan Zählungen und `last_run` |
| Auswahl | `localStorage` im Browser | je Bestandteil: Gruppe, Fingerabdruck bei der Wahl, Name. Sonst nichts |

Die genauen Schlüssel stehen in ARCHITEKTUR §4–§6. Ein Plan-JSON für WI 1. FS ist etwa 400 KB groß,
komprimiert 28 KB.

## 5. Die Regeln der Planung

| Regel | Wie | Wo |
|---|---|---|
| **Eine Gruppe je Bestandteil** | Eine neue Wahl ersetzt die alte. Alle Termine einer Gruppe gehören zusammen, auch an mehreren Wochentagen | Seite |
| **Wochen-Slot** | Einzeltermine einer Gruppe, gruppiert nach Wochentag + Beginn + Ende. Über Mitternacht wird geteilt | `plan.py: slots` |
| **14-Tage-Rhythmus (A/B)** | nur bei mindestens 3 Terminen mit überwiegend 14-Tage-Abständen und keinem 7-Tage-Abstand, oder wenn die Quelle „14-täglich“ sagt. Eine einzelne Ferienlücke reicht nicht. Parität zählt echte Kalenderwochen ab dem Anker | `plan.py: slots` |
| **Konflikt** | zwei gewählte Gruppen haben mindestens einen Einzeltermin, der sich echt überschneidet (direkt anschließend ist keiner). Gerechnet über das ganze Semester, nicht über das Wochenraster | Seite (`conflicts` auch in `plan.py`) |
| **Geändert seit der Wahl** | Fingerabdruck = sha256 über `{id, start, end, room}` aller Buchungen der Gruppe. Weicht er vom gespeicherten ab, meldet die Seite es | `plan.py: fingerprint`, Seite |
| **Nicht mehr im Angebot** | eine gespeicherte Gruppe, die es nicht mehr gibt, bleibt mit Namen sichtbar, bis man sie löst | Seite |
| **Veraltet** | letzter Erfolg älter als 36 Stunden | Seite |

## 6. Was das System NICHT weiß — die Annahmen

Jede Übertragung muss diese Punkte prüfen. Hier entstehen die Problemstellen:

1. **Pflicht- statt Wahlpflicht:** Der Katalog listet feste Module. Ein Wahlpflichtbereich („wähle 2
   aus 8“), Vertiefungsrichtungen oder Leistungspunkte-Ziele kennt er nicht.
2. **Ein Fachsemester = ein Semester:** Höhere Fachsemester liegen je nach Lage im WiSe oder im SoSe.
   Daten für das kommende Sommersemester veröffentlicht MOSES erst später.
3. **Alle Bestandteile sind zu belegen:** Der Abschnitt aus der Modulbeschreibung (`section`,
   `required`) wird gelesen, aber jede angezeigte Gruppe gilt als wählbar. Ob z. B. ein Tutorium
   Pflicht ist, prüft niemand.
4. **Keine Gruppenbindungen:** Regeln wie „Tutorium nur zur eigenen Übung“ oder „UE-Gruppe 3 nur
   für Studiengang X“ stehen höchstens als Text in den Hinweisen. Das System erfindet sie nicht.
5. **Eine Gruppe ist eine Einheit:** Wer eine Gruppe wählt, wählt alle ihre Termine. Gruppen, die aus
   Wahlterminen bestehen, passen nicht in dieses Bild.
6. **Nur MOSES:** Andere Hochschulen haben andere Systeme (z. B. HIS/LSF, HISinOne, CampusNet). Der
   Abruf ist MOSES-spezifisch; Rohstand und Lesemodell sind es nicht. Eine andere Quelle braucht
   einen eigenen Abruf, der **denselben Rohstand** schreibt.
7. **Der Katalog ist Handarbeit:** Ohne maschinenlesbaren Studienverlaufsplan schreibt ein Mensch
   jedes Fachsemester jedes Studiengangs ab, mit Quelle und Stand.

## 7. Betrieb in einem Absatz

Ein eigener Container auf dem NAS (`stundenplanner-abruf`) holt jeden Morgen um 05:20 den Stand
`main` von GitHub, ruft MOSES ab, baut das Lesemodell, testet und lädt die fertige Seite zu
Cloudflare Pages hoch (`stundenplanner.de`). Scheitert ein Schritt, bleibt die Seite von gestern
online. Einzelheiten: [`BETRIEB.md`](BETRIEB.md).
