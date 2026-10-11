# /silas — der persönliche Semesterplaner nach Leistungspunkten

> **⛔ Keine Zugriffe auf Systeme der TU Berlin ohne Silas’ ausdrückliche Genehmigung**
> (Silas, 05.10.2026; [AGENTS.md §2 ⑦](../AGENTS.md#2-die-regeln)). Auch /silas holt nichts von dort: Das Angebot
> pflegt Silas von Hand (aus ISIS und den Modulbeschreibungen), die Seite fragt weder MOSES noch ISIS.

Silas, 11.10.2026, nach einem Gespräch mit dem Fachbereich: Der Stundenplanner zählt Semesterwochenstunden,
aber seit der Bologna-Reform zählt der **Aufwand in Leistungspunkten**. Unter `stundenplanner.de/silas`, erst nur
für ihn, ein Planer mit neuer Logik, die nichts aus der alten übernimmt: das Wochenraster wie gewohnt, darin
die Präsenztermine, Blöcke für Vorlesungsvideos, für Vor- und Nachbereitung und für die Klausurvorbereitung;
links die Module mit allen Bestandteilen, rot, was an Information fehlt und was nicht im Plan ist; rechts das
Unregelmäßige als Muster. Ziel: das ganze Fachsemester so geplant, dass **alle Leistungspunkte einen festen
Platz** haben. Von Anfang an so gebaut, dass die Termine später in der Timeline des Study OS erscheinen — die
Timeline ist die Lesesicht, geplant wird hier.

| Datei | Was |
|---|---|
| `web/silas/modell.mjs` | das Modell: reine Funktionen, keine Uhr, kein Netz — Seite und Server rechnen damit |
| `web/silas/silas.mjs`, `index.html`, `silas.css` | die Seite |
| `web/silas/kalender.mjs` | die Ereignisse als iCalendar (zwei Abos) |
| `functions/silas/api/[[pfad]].js` | der private Speicher (Cloudflare Pages Function mit KV) |
| `ops/silas.mjs` | prüfen, holen, senden, einrichten — von der Werkbank |
| `web/tests/silas.test.mjs` | das Modell, der Kalender, der Speicher (mit erfundenen Daten) |

---

## 1. Die Grundidee: Aufwand statt SWS

- **1 LP = 30 Zeitstunden** (AllgStuPO § 45 Abs. 2). Ein Modul mit 6 LP sind 180 h, ein Semester mit 30 LP 900 h.
- Jede Modulbeschreibung zerlegt die 180 h in **Posten**: „Präsenzzeit 15 × 2 h“, „Vor-/Nachbereitung 15 × 2 h“,
  „Prüfungsvorbereitung 1 × 60 h“. Diese Tabelle ist amtlich; sie ist die Grundlage der Rechnung.
- **Eingeplant** ist eine Stunde, wenn sie einen festen Platz im Kalender hat: einen Termin des Lehrstuhls,
  eine gewählte Gruppe oder einen eigenen Block. Der Planer rechnet für jeden Posten, wie viel davon
  eingeplant ist, und zeigt den Rest rot.
- SWS kommen in der Rechnung nicht vor, außer in einer Regel: Ein c.t.-Termin belegt seine Doppelstunde (§2.5).

## 2. Das Modell

### 2.1 Begriffe

| Begriff | Was | Woher |
|---|---|---|
| **Semester** | Vorlesungszeit, vorlesungsfreie Zeit, Ende des Planungszeitraums (letzte Prüfung) | Angebot |
| **Woche** | Montag bis Sonntag; Vorlesungswochen heißen W01 … W16, dazu „Pause“ und P1, P2 … (Prüfungszeit) | gerechnet |
| **Modul** | Nummer, Titel, LP, die Posten, die Teile, die Prüfungen | Modulbeschreibung |
| **Posten** | eine Zeile der Aufwandstabelle: Multiplikator × Stunden | Modulbeschreibung |
| **Teil** (Bestandteil) | was Silas plant: VL, Übung, Tutorium, Videos, Labs, Nachbereitung, Klausurvorbereitung. Jeder Teil deckt einen Posten oder einen Anteil davon | Angebot |
| **Muster** | wann ein Termin stattfindet: Serie, Reihe oder Einzeltermin (§2.3) | ISIS, von Hand |
| **Option** | eine Gruppe eines Wahl-Teils (z. B. Tutorium Mi 10–12), mit eigenem Muster | ISIS, von Hand |
| **Prüfung** | Klausur, Test, E-Test — mit Terminen (Erst- und Zweittermin) | ISIS, Modulbeschreibung |
| **Termin** | Einzeltermin, Frist oder Semesterrahmen ohne Stunden (Anmeldung endet, Kick-off-Info) | ISIS, von Hand |
| **Block** | Silas' eigene Zeit: wöchentlich (jeden Di 14–17) oder an einem Datum | Plan |
| **Umwidmung** | Stunden eines Teils, die nicht stattfinden können, gehen an einen anderen Teil desselben Moduls | Plan |
| **Vorkommen** | jedes konkrete Ereignis mit Datum: ein Termin, ein Block an einem Tag, eine Prüfung, eine Frist | gerechnet |
| **Schicht** | A Fixtermin · B gewählte Gruppe · C Frist/Einzeltermin · D eigener Block · R Semesterrahmen | gerechnet |

Die Schichten A–D stammen aus Silas' Semesterplan („Generalstruktur des Kalenders“): Was verpflichtend ist und
was selbst gesetzt ist, darf man nie verwechseln. Die Seite zeichnet A und B kräftig gefüllt, D heller (bis V-0337 schraffiert; Silas: die Streifen machten die Farben unruhig) und mit Etikett Video/EVL.

### 2.2 Vom Posten zum Teil

Meist deckt ein Teil genau einen Posten (TECHGI „Übung · Nachbereitung“ = „Vor- und Nachbereitung 15 × 1 h“).
Manchmal teilen sich mehrere Teile einen Posten: Die BuK-Vorlesung (Präsenzzeit 30 h) findet als 7 Präsenztermine
**und** als wöchentliche Videos statt. Dann steht im Angebot der Anteil (`soll_h: 14` und `soll_h: 16`). Fehlt er,
teilt das Modell gleich auf und sagt es als gelben Hinweis „Aufteilung angenommen“. Die Summe der Teile ist immer
die Summe der Posten, und die ist LP × 30 h. Stimmt die Aufwandstabelle nicht mit den LP überein, ist das Modul rot.

### 2.3 Drei Terminformen und die Wahl

| Form | Beispiel | Im Angebot |
|---|---|---|
| **Serie** — wiederkehrend in einem Takt, mit Ausnahmen | TECHGI-VL jeden Do 16:15–17:45, außer 24.12. und 31.12. | `{typ:'serie', tag, start, ende, von, bis, ausser, alle}` |
| **Reihe** — feste Daten ohne Takt | BuK-Präsenz an 7 Freitagen; EINFWI-Übung an 5 Terminen je Gruppe | `{typ:'reihe', start, ende, daten:[{datum, titel}]}` |
| **Einzeltermin** — eine Reihe mit einem Datum | EINFWI-Kick-off am 19.10. | wie Reihe |

Eine Serie überspringt die vorlesungsfreie Zeit von selbst. Ein **Wahl-Teil** hat Optionen (Gruppen), jede mit
eigenem Muster; Silas wählt genau eine. Sind die Gruppen noch nicht bekannt (`wahl: true`, keine Optionen), fehlt
eine Information. Optionen legt Silas auf der Seite selbst an — ISIS ist die Quelle, nicht MOSES.

### 2.4 Vier Arten von Teilen

| Art | Was zählt | Beispiel |
|---|---|---|
| `praesenz` | die Termine (Serie, Reihe) oder die gewählte Gruppe | VL, Übung, Tutorium, Kick-off |
| `video` | Silas' Blöcke — je Woche so viel, wie ihre Videos dauern (plus Puffer), und erst ab der Freigabe | STAT1-Screencasts (29, mit Länge je Video), EINFWI-Lehrvideos (12, montags), BuK-Videos (freitags) |
| `selbst` | Silas' Blöcke; mit Einheiten (Quiz, Blatt, Abgabe) im Fenster der Einheit, sonst jeder Block | Labs, Nachbereitung, ISIS-Quiz, Quicktests |
| `pruefung` | Silas' Blöcke vor dem Prüfungstermin | Klausurvorbereitung, Testvorbereitung |

### 2.5 Wie gezählt wird — jede Regel mit ihrem Grund

1. **c.t.-Termine belegen die Doppelstunde.** 16:15–17:45 zählt 2 h: Das Viertel davor und danach ist der Weg, die
   Kalenderzeit 16–18 ist blockiert, und die Modulbeschreibung rechnet 2 SWS als 2 h Präsenzzeit. Sonst wäre jede
   Präsenz ewig zu 75 % gedeckt. s.t.-Zeiten (10:00–11:00) zählen ihre echte Dauer.
2. **Ein Wochenblock gilt in jeder Vorlesungswoche**, nicht in der Pause (außer `pause: true`) und nicht in der
   Prüfungszeit; mit `ab`/`bis` nur in einem Zeitraum. Für die Prüfungszeit gibt es Datumsblöcke.
3. **Videos zählen je Woche, nach ihrer echten Länge** (V-0328; Silas: „Woche 2 … Screencast 3, 40 Minuten. Und
   Screencast 4, auch 40 Minuten“). Jedes Video trägt seine Länge (`laenge_min`, sonst die Annahme `annahme_min`). Die
   Videos einer Woche gehören zusammen: Die Woche braucht ihre Summe plus Puffer, aufgerundet (80 + 15 min → 2 h).
   Silas' Blöcke füllen die Wochen der Reihe nach — ein Block deckt die früheste freigegebene Woche, die noch Zeit
   braucht; so holt ein späterer Block eine verpasste Woche nach. Ein Block, für den es (noch) kein Video gibt, zählt
   nicht; eine Woche ohne Block ist rot, ein zu kurzer Block gelb. Brauchen die Videos zusammen weniger als der Posten,
   ist der Rest strukturell und lässt sich umwidmen.
   **Quiz, Blätter, Abgaben** (`selbst` mit Einheiten): Mit erwarteter Dauer (`einheiten.dauer_min`) wie Videos; ohne
   Dauer gilt ein **Fenster**: Ein Block zählt, solange eine Einheit offen ist (`ab` bis `bis`, ohne `bis` bis zur
   nächsten Freigabe). Sonst zählte von zwei Lab-Blöcken je Woche nur einer. `bis` wird eine Frist. Einheiten ohne
   Datum (`einheiten.anzahl`, `ab: null`) sind rot; bis dahin zählt jeder Block.
4. **Prüfungsvorbereitung zählt nur vor der Prüfung** — vor dem Termin, den Silas schreibt: dem gewählten
   (`plan.pruefungstermin`, etwa der Alternativtermin eines E-Tests oder der Zweittermin), sonst dem ersten regulären.
   Bei einer echten Wahl (`pruefung.wahl`: zwei gleichwertige Termine) verschwindet der andere, sobald gewählt ist. Ein Block am oder nach dem Prüfungstag
   zählt nicht und ist rot.
5. **Präsenz ist gesperrt** (V-0333, Silas: *„während ein Präsenztermin stattfindet, darf es nicht möglich sein, dass
   man irgendetwas anderes macht … und bei Tutoriumsterminen, wenn man eine Gruppe gewählt hat, müssen die danach auch
   geblockt sein … alles andere kann man rumschieben“*). Termine (`hart`: Präsenz, gewählte Gruppen, Prüfungen außer
   ungewählten Ausweichterminen, Einzeltermine mit Uhrzeit) sperren ihre Zeit: Die Seite lässt keinen Block darauf
   legen (`gesperrtDurch()` — in der Standardwoche gegen alles Wiederkehrende, an einem Datum gegen die Termine des
   Tages). Liegt trotzdem einer darauf — weil Silas danach eine Gruppe gewählt hat oder ein Wochenblock nur an einzelnen
   Tagen trifft —, verliert der Block die überlappte Zeit (`gesperrt`). Trifft er in mindestens drei Wochen (oder an
   jedem seiner Tage), muss er weg: hellblau „verschieben“. Trifft er nur einzeln (Kick-off, E-Test), fällt er dort weg:
   ein Hinweis. Gerechnet wird an den echten Tagen, nicht im Wochenraster.
6. **Zwei Termine übereinander sind ein Konflikt** (rot an beiden): Eine andere Gruppe wählen.
7. **Gedeckt ist je Teil höchstens sein Soll.** Zu viel bei den Labs gleicht zu wenig bei der Nachbereitung nicht aus:
   Modul und Semester zählen die Summe der gedeckten Stunden, das Mehr steht als gelber Hinweis daneben
   („34 h mehr als in der Modulbeschreibung“ — die PROG1-Präsenz hat zwei Termine je Woche statt 2 SWS).

### 2.6 Die Stufen: rot, orange, hellblau, grau (V-0332)

Silas, 11.10.: *„Orange ist Achtung, Hinweis … Raum noch nicht bekannt ist keine kritische Warnung. Wenn man das Datum
von etwas kennt, kann es schon mal nicht kritisch sein“* — und *„was muss der User jetzt selber eintragen? … markiert als
hellblau: das musst du noch eintragen, das musst du noch festlegen“.* Jede Meldung entsteht mit einer rohen Art; ihre
Stufe vergibt `einstufen()` am Ende, nach dem heutigen Datum, der Semesterphase und dem Stand der Prüfung:

| Stufe | Farbe | Was | Beispiele |
|---|---|---|---|
| `kritisch` | rot | jetzt handeln | eine Anmeldung läuft; zwei feste Termine übereinander; Prüfungsthemen, sobald die Anmeldung des Moduls läuft; Prüfungsvorbereitung, wenn ihre Zeit da ist |
| `achtung` | orange | prüfen | Unsicheres; Raum oder Uhrzeit fehlt bei bekanntem Datum; selbst geplantes Zuviel über 2 h; Block nach der Prüfung; Prüfungsthemen, sobald ein Termin bekannt ist |
| `dran` | hellblau | du bist dran | Gruppe wählen, Blöcke setzen, einen Block von einem Termin wegschieben (gesperrt), Videolängen ablesen (nur erschienene Videos), umwidmen; eine Gruppenanmeldung (in der letzten Woche rot) |
| `kommt` | grau | kommt noch | Termine, Fristen, Gruppen, die der Lehrstuhl noch nicht veröffentlicht hat; Prüfungsthemen, solange kein Termin bekannt ist |
| `spaeter` | grau | später | Prüfungsvorbereitung vor ihrer Zeit: kritisch ab Beginn der vorlesungsfreien Zeit, bei Prüfungen in der Vorlesungszeit (E-Test, Online-Test) `vorlauf_tage` (21) vorher |
| `info` | grau | Hinweis | Annahmen (sie stehen unter „Offen & Annahmen“), Hinweise aus ISIS, Blöcke ohne Video, Wochenblöcke, die an einzelnen Tagen einem Termin weichen |

- **±2 h:** Lücken und Zuviel unter `toleranz_min` (120 min) werden nicht gemeldet (Silas: „sonst zu verwirrend“).
- **Anmelden:** `plan.angemeldet[id]` hakt eine Anmeldung ab (Prüfung oder Gruppe); bis dahin steht „Jetzt anmelden — bis …“.
- **Ausweich- und Zweittermine**, die Silas nicht gewählt hat, verdrängen nichts und zählen nicht zur Tageslast; sie
  stehen über dem Raster.

### 2.6a Fristen, die das Modell selbst bildet

Aus `anmeldung {von, von_zeit, bis, bis_zeit, wo, nur}` — an einer Prüfung, an einem einzelnen Prüfungstermin oder an
einem Bestandteil (die EINFWI-Übung über MOSES bis 14.10.) — werden die Fristen „Anmeldung öffnet/endet“; aus
`einheiten.liste[].bis` die Fristen „… fällig“. Was an einer Prüfung oder Anmeldung `offen`/`unsicher` ist (Raum,
Bestehensgrenze, Frist nur in MOSES), steht am Modul; ein Einzeltermin ohne Datum ebenso. Zwei Prüfungen, die sich
überschneiden, sind rot am Modul.

### 2.7 Umwidmung

Die EINFWI-Übung hat 30 h Präsenzzeit, findet aber nur 5× statt: 20 h können dort nie stattfinden. Sie gehören
trotzdem zum Modul. Silas' Semesterplan sagt, wohin: „die freie Zeit gehört in die Testvorbereitung“. Eine
Umwidmung `{von, nach, h}` nimmt das Soll beim einen Teil weg und gibt es dem anderen; die 180 h bleiben. Die Seite
bietet sie an, wenn eine Lücke strukturell ist (alle Termine bekannt, Gruppe gewählt).

### 2.8 Keine Vorschläge (V-0333)

Silas, 11.10.: *„Es sollen nicht so wie jetzt Vorschläge zu den ganzen Sachen kommen, sondern man soll die selber wählen
können.“* Der Lernplan-Vorschlag (bis V-0332 `lernplanVorschlag`) ist entfernt. Was bleibt, misst nur:

- **Videoblock:** Videolänge + 15 min Puffer, auf 30 min aufgerundet (Silas: „1:45 Video → 2 h einplanen“) — die
  Länge, die ein Block zum Aufziehen anfangs hat. Ist die Länge unbekannt, nimmt das Angebot eine Annahme
  (`annahme_min`, 90 min für eine 2-SWS-Vorlesung), bis die echte eingetragen ist.
- **Lerntag** (Prüfungszeit, Schritt 4): Silas tippt einen Tag an; der Block liegt in der größten freien Lücke des
  Lernfensters 09–19 Uhr, höchstens 6 h (Faustregel aus Silas' Semesterplan: Stunden ÷ 6 = Lerntage). Den Tag wählt
  er, verschieben kann er ihn im Raster.

### 2.8a Die vier Schritte (V-0333)

Silas, 11.10.: *„Die absolute Foundation muss sein, alle bestätigten Pflichtpräsenztermine sind dort eingetragen und
die Quizze … Dann der zweite Layer, das sind Optionstermine … Tutoriumsgruppe XY oder Übungsgruppe XY … dann die dritte
Schicht, Screencasts und alles, was eigentlich eine Präsenzveranstaltung wäre, aber über ein Video … und dann als letzte
Sache für alle Sachen eine Vor- und Nachbereitung. Das Tool soll einen durch genau diese Entscheidungen durchführen und
man soll die selber treffen … und zurückspringen können.“* Jeder Teil gehört zu genau einem Schritt (`schrittVon`,
im Angebot mit `schritt` überschreibbar), jedes Vorkommen trägt ihn (`schritt`):

| Schritt | Was | Teile | Silas tut |
|---|---|---|---|
| 1 Grundlage | feste Präsenztermine, Quizze und ihre Fristen, Einzeltermine | Präsenz mit eigenen Terminen | nichts wählen — prüfen, fehlende Uhrzeit/Raum eintragen |
| 2 Gruppen | Tutorien und Übungen mit Gruppen, ihre Anmeldungen | Präsenz mit `optionen` oder ohne Termine (die Gruppen kommen noch) | Gruppe wählen oder eintragen |
| 3 Videos | Screencasts, Lehrvideos | `video` | Blöcke legen |
| 4 EVL | eigenverantwortliches Lernen: Vor-/Nachbereitung, Labs, Quizze bearbeiten | `selbst` | Blöcke legen |
| 5 Prüfungen (`PRUEFUNGEN`) | Prüfungen, ihre Anmeldungen, Prüfungstermin-Wahl, Prüfungsvorbereitung — **nicht im Ablauf** | `pruefung` | erst nach dem Festlegen, „ab Mitte des Semesters“ (Silas, V-0334) |

Ein Block gehört zum Schritt seines Teils (`schrittVonBlock`: Video 3, Prüfungsvorbereitung 5, sonst 4, auch ohne
Teil). `schritte(erg)` zählt je Schritt die Meldungen nach Stufe (Modul-Meldungen zu einer Prüfung zu 5, die Anmeldung
einer Gruppe zu 2, die übrigen zu 1, Puffer-Blöcke zu 4); der fünfte Eintrag sind die Prüfungen.
**Zurücksetzen** (`zuruecksetzen(plan, angebot, ab, {am})`) nimmt alles aus den Schritten `ab` bis 4 heraus — ab 2
`wahl`, ab 3 die Video-Blöcke, ab 4 die übrigen Blöcke — und **hebt es in `plan.zurueckgesetzt` auf**
(`wiederherstellen(plan)` holt es zurück; ein zweites Zurücksetzen legt dazu). Es bleibt, was Silas über das Semester
weiß (`angemeldet`, `bestaetigt`, `umwidmungen`, Videolängen und Uhrzeiten im Angebot) und alles zu den Prüfungen
(`pruefungstermin`, Lerntage). Danach ist der Plan wieder in Arbeit (`festgelegt` fällt weg).

**Festlegen** (V-0334, Silas: *„wenn man eben alles gewählt hat, dann kann man sagen, Stundenplan festlegen. Und dann
ist erst das erste Mal, dass man alles in voller Farbe sieht. Und dann kann man sagen, Stundenplan bearbeiten …
zurückspringen, nur dass diesmal die Auswahl dahinter auch gespeichert wird“*): `plan.festgelegt` (Zeitpunkt). Bis
dahin führt die Seite durch die Schritte, danach zeigt sie alles farbig; „Bearbeiten“ nimmt `festgelegt` weg und
springt in einen Schritt, die Auswahl bleibt.

**Vorgabe je Woche** (V-0335, `vorgabe(erg, teil)`): Für einen Video-Teil EIN Block jede Woche ab der ersten
Freigabe, so lang, dass er das Soll (abzüglich der ±2 h) deckt, höchstens aber, was die Videos mit Puffer brauchen
(mehr zählte nicht). Für EVL Blöcke von 1,5–2 h — k je Woche oder einer alle n Wochen (`alle` am Block; `versatz`
verschiebt), was dem Soll am nächsten kommt, bei Gleichstand der längere Block. Ein Wochenblock darf eine Woche vor
dem Ende aufhören (`bis`): Die Modulbeschreibungen rechnen mit 15 Wochen, das Semester hat 16 Vorlesungswochen — sonst
plante jede Vorgabe 32 h für 30 h (V-0336, Silas' Prüfung der Wochenlast). Mit Silas' Stand: STAT1-Screencasts
1,5 h jede Woche (die Videos brauchen 23,5 h), STAT1-Nachbereitung 2 h jede Woche, TECHGI-Übung-Nachbereitung 2 h alle
2 Wochen, PROG1-Labs 3 × 1:45 jede Woche. Was tatsächlich zählt, rechnet danach `rechnen()` an den echten Tagen.

**Wiederholungen** (Silas: *„pro Eintrag, wie oft sich dieser Eintrag bis zum Ende des Semesters wiederholt — da wird
dann auch sofort klar, welche sich nicht wiederholen“*): Jedes Vorkommen trägt `nr`, `gesamt` und `rest` (ab ihm noch,
es eingeschlossen). Ein Eintrag ist ein Muster eines Termins (Serie oder Reihe, `muster`-Index), ein Block oder eine
Prüfung/ein Einzeltermin (immer 1).

## 2.9 Annahmen und Lücken an einem Ort

Silas, 11.10.: *„Gibt es einen Ort, an dem ich einmal alle Annahmen als Liste sehe und auf diese antworten kann,
beziehungsweise dort Werte verändern könnte manuell? Und genau das Gleiche mit den Warnungen.“* `annahmen()` sammelt
die festen Regeln (mit Quelle, nicht änderbar), die Stellschrauben (`regeln`, änderbar), jede Aufteilung eines
Postens (`soll_h`, änderbar — teilen sich genau zwei Teile einen Posten, bekommt der andere den Rest), jede
Videolängen-Annahme (`annahme_min`) und jede `annahme` am Teil oder an einer Gruppe. Eine Annahme ist gelb, bis Silas
sie ändert oder bestätigt (`plan.bestaetigt[id]`). `luecken()` sammelt alle Flaggen aller Teile und Module, rot vor gelb.

## 3. Die Seite

- **Kopf:** Semester, die Bilanz („600 h von 900 h“, Balken) und die Zähler (kritisch, zu tun); der Speicherstand;
  „Kalender“ (die Abos, §6).
- **Oben in der Mitte, die vier Schritte** (V-0333, §2.8a): je ein Knopf mit Stand (rot kritisch, hellblau mit Zahl
  „zu tun“, sonst ✓). Man springt frei vor und zurück; links führt „Weiter: 3 · Videos“ zum nächsten, in Schritt 4
  „Stundenplan festlegen“ (die Karte davor nennt, was noch offen ist). Daneben *Offen & Annahmen* (§2.9), *So wird
  gerechnet* und **Zurücksetzen** (ab Schritt 2, ab 3 oder nur 4; was herausfällt, liegt beiseite —
  „Wiederherstellen“).
- **Festgelegt** ruhen die Schritte: „Stundenplan festgelegt am …“ und **Stundenplan bearbeiten** (welcher Schritt?).
  Reiter *Woche*, *Prüfungen* (die Prüfungen mit Terminen, Anmeldung und Formularen, ihre Vorbereitung, der Kalender
  der vorlesungsfreien Zeit: Prüfung wählen, Tage antippen — jeder Tipp ein Lerntag, §2.8), *Offen & Annahmen*, *So
  wird gerechnet*.
- **Zwei Hauptansichten** (V-0338, Silas: *„Woche und Prüfungen noch etwas prominenter oben links … die zwei
  Hauptfenster von diesem Tool“*): oben links „Woche“ und „Prüfungen“; Prüfungen erst nach dem Festlegen.
- **Prüfungen, oben die Zeitleiste** (V-0337, umgebaut V-0338): das Semester mit Monaten, heute und den Zeiträumen
  (Vorlesungszeit, Pause, Vorlesungszeit, vorlesungsfrei — ein Klick klappt ihren Kalender auf), darunter **eine Spur**
  für alle Prüfungen (Silas: *„Klausuren und E-Tests auf eine Spur … mit der Farbe gekennzeichnet“*): Klausur rund und
  rot, E-Test eckig und grün, Online-/schriftlicher Test als Raute (`pruefungsArt()`); gefüllt, was gilt, hohl Ausweich-
  und Zweittermine. Vor jedem geltenden Termin sein **Vorlauf** als Linie mit einem Strich am Anfang (Silas: *„angenommen,
  du übst zwei Stunden in der Woche, wie viele Wochen solltest du vorher anfangen, damit du auf die 40 Stunden
  kommst“*): Soll der Vorbereitung ÷ Stunden je Woche (oben wählbar, 1–8 h, Standard 2 h); beginnt er vor dem Semester,
  läuft die Linie links mit einem Pfeil aus. Die Seite ordnet Beschriftungen und Linien nach gemessener Breite in Zeilen.
- **Prüfungen, darunter die Zeiträume** als aufklappbare Kalender (Wochen × Tage) mit allen Prüfungen (nach Art
  gefärbt, Ausweichtermine hohl), Fristen, Lernblöcken, dem, was der Plan belegt, und der freien Zeit (Vorlesungszeit:
  um den Stundenplan herum 7–22 Uhr; vorlesungsfrei: im Lernfenster). Links jede Prüfung nach Datum mit dem, was an
  Vorbereitung noch fehlt (Silas: *„nach demselben Prinzip wie bei der Wochenplanung … wie viele Stunden sind noch
  offen“*). Eine Prüfung wählen (links oder in der Zeitleiste): Sie leuchtet, die anderen treten zurück, ihr Tag ist
  im Kalender umrandet, ihre Übungszeit (der Vorlauf) getönt, und die Zeiträume, in denen sie und die drei Wochen davor
  liegen, gehen auf. Ein Tipp auf einen Tag legt einen Lernblock — vorlesungsfrei bis 6 h, in der Vorlesungszeit bis 2 h,
  zuerst im Lernfenster, sonst früh oder abends. Ein Tipp auf eine Woche der Vorlesungszeit öffnet sie gesperrt
  (s. u.).
- **Vorlesungszeit öffnen** (V-0337, Silas: *„der Stundenplan muss in der Ansicht auf jeden Fall gelockt sein, aber
  außerhalb des Stundenplans — vor den Zeiträumen, nach den Zeiträumen und am Wochenende — kann man auch während der
  Vorlesungszeit Prüfungsvorbereitung einrichten … sich wiederholende Termine“*): das Raster mit allen sieben Tagen
  von 7 bis 22 Uhr; der Stundenplan ist dunkelgrau und fest, die Prüfungen farbig. Links jede Prüfungsvorbereitung nach
  Prüfungsdatum mit Länge (1–4 h) und „Block legen“; freie Plätze (`pruef_fenster` 07–22 Uhr) sind grün. In der
  Standardwoche liegt der Block jede Woche bis zum Tag vor der Prüfung (`bis`), in einer echten Woche nur an diesem
  Tag.
- **Abwählen** (V-0338, Silas: *„wenn man rausklickt, einfach auf irgendeinen Blankspot im Stundenplan, … soll das
  wieder deselected werden“*): Ein Klick auf eine leere Stelle im Raster hebt die Auswahl auf (Modul, Bestandteil, die
  nach vorn geholte Sache, die gewählte Prüfung); nur wenn nichts gewählt ist, erklärt er, wie man legt.
- **Fahrzeit** (V-0338, Silas: *„beim ersten Präsenztermin eines Tages 40 Minuten Fahrzeit davor … und bei dem letzten
  auch nochmal … nicht freigehalten, sondern visuell, mit einer grauen Strichellinie“*): `fahrzeiten()` — vor dem
  frühesten und nach dem spätesten Termin vor Ort (Online zählt nicht), `pendeln_min` 40; grau gestrichelt hinter den
  Kacheln, sie sperrt nichts.
- **Links, was der Schritt will** (im Ablauf): oben ein Satz, was hier zu tun ist, und der Weg weiter; darunter je
  Modul nur die Teile dieses Schritts (Module ohne sie blass). Schritt 1 zeigt dazu die Quizze mit ihren Fristen.
  Schritt 2 zählt je Modul **„1 von 2 gewählt · 1 noch wählen“** (oder „kommt noch“), je Teil „gewählt ✓“, „wählen“,
  „kommt noch“. Jeder Teil: Art, Form, Stand und die Zeile in der Farbe seiner Stufe. Ein Klick klappt die Karte auf:
  alle Meldungen, Soll und Ist, Woher, die Gruppen als Knöpfe, die Vorgabe, umwidmen, fehlende Angaben eintragen.
- **Geführt, eine Sache nach der anderen** (V-0335, Silas: *„dass man von oben nach unten durchgeführt wird … eine
  Zusammenfassung, welche alle da gewählt werden und wie viele jeweils vorhanden sind … du wählst halt genau gerade
  eine einzige Sache“*): Oben links steht in Schritt 2–4 die **Reihe** des Schritts in der Reihenfolge der Module — in
  2 jede Wahl mit „4 Gruppen“, „0 vorhanden“ oder „✓ G4“, in 3 und 4 jeder Bestandteil mit seiner Vorgabe je Woche
  oder „✓ 24 h“. **Dran** (hellblau) ist, was Silas dort anklickt, sonst die erste offene Sache; nach jeder Wahl, nach
  jedem letzten Block rückt sie weiter. Ein Klick auf ein Modul macht seine erste offene Sache zu der, die dran ist.
  In Schritt 2 stehen im Raster nur die Gruppen dieser einen Wahl; ist sie schon gewählt, alle ihre Gruppen, die
  gewählte weiß umrandet.
- **Farben im Ablauf** (V-0336): Was dran ist, ist farbig; was im selben Schritt schon gewählt oder gelegt ist, aber
  zu einer anderen Sache gehört, **hellgrau** (ein Klick macht es zu der Sache, die dran ist); frühere Schritte
  **dunkelgrau**. Module, deren Sachen im Schritt alle erledigt sind, klappen ein — grüner Haken „alles gewählt“ /
  „alles gelegt“ (oder „nichts wählbar — kommt noch“) und „Wahl ändern“ / „Termine ändern“. Der Schrittknopf oben
  zählt, was in der Reihe noch offen ist, sonst ✓ grün; ein roter „!“ heißt: etwas Kritisches (eine laufende
  Anmeldung).
- **Kurz zurück** (V-0336, Silas: *„wenn man in einem weiteren Schritt ist und man klickt auf ein Event, das in einem
  Schritt vorher war, soll man temporär in den vorherigen Schritt zurückspringen … und es sollen alle Wahlen aus allen
  anderen Schritten dunkelgrau angezeigt werden“*): Ein Klick auf eine dunkelgraue gewählte Gruppe oder einen
  dunkelgrauen Block holt dessen Schritt mit genau dieser Sache dran; alles andere — auch was aus späteren Schritten
  schon liegt — ist dunkelgrau. Nach der Wahl, dem Verschieben oder dem Legen geht es von selbst zurück (Esc oder
  „Zurück zu Schritt …“ ohne Änderung).
- **Block legen statt zeichnen** (V-0335, Silas: *„dass man sich einmal fest einen Slot pro Woche einplant … und der
  soll hochgerechnet werden auf die ganzen Vorlesungswochen … die Vorgabe … müsstest du in der Woche zwei Stunden
  blocken … an dem Mauszeiger rangeheftet dieser Block … anstatt dass man den zeichnet“*): Die Vorgabe (`vorgabe()`,
  §2.8a) steht bei der Sache, die dran ist („1,5 h jede Woche — 16× = 24 h von 30 h“). „Block legen“ hängt einen Block
  dieser Länge an den Zeiger; die freien Plätze (`freieFenster()` im Tagesfenster 08–20 Uhr) sind grün, in Schritt 4
  kräftiger zwischen 10 und 18 Uhr (Silas: *„alles zwischen 10 und 18 Uhr preferred“*), und der Block rastet in den
  freien Platz ein, in dem der Zeiger steht. Ein Klick legt ihn als Wochenblock (mit `alle`, wenn die Vorgabe es
  sagt); auf Präsenz wird er rot und abgelehnt. Braucht die Sache mehrere Blöcke (PROG1-Labs: 3 × 1:45), bleibt der
  nächste hängen. Esc oder „Abbrechen“ lässt los. Am Telefon und Surface legt ein Tipp ab.
- **Das Raster nach Schichten** (V-0334, Silas: *„immer beim nächsten Schritt ist alles aus den vorherigen Schritten
  dunkelgrau … wirklich keine von den anderen Sachen soll eingetragen oder angezeigt werden“*): Schritt 1 zeigt nur
  die Grundlage. Ab Schritt 2 ist alles aus früheren Schritten **grau** (gefüllt, lesbar, ohne Farbe der Art); der
  gezeigte Schritt ist farbig; Späteres und die Prüfungen fehlen ganz. In Schritt 2 stehen die Gruppen zur Wahl
  (farbig, weiß gestrichelt); ist eine gewählt, ist sie weiß durchgezogen und die anderen **verblassen anders** als das
  Graue — ohne Füllung, gestrichelt in der Farbe ihrer Art —, sichtbar, solange ihr Modul oder Teil gewählt ist. Unter
  dem Raster: „Noch zu wählen“ und „Noch nicht wählbar — Termine kommen noch“. Ein grauer Block aus einem früheren
  Schritt springt per Klick in seinen Schritt. Blöcke gibt es erst ab Schritt 3; auf Präsenz geht keiner.
- **Jede Kachel** trägt rechts senkrecht ihr **Etikett** — *Präsenz* (Termine, Gruppen, Prüfungen), *Video*, *EVL*
  (kurze Kacheln nur den Anfangsbuchstaben) — und vorn in Zeile 2, **wie oft** sie noch kommt: in der Standardwoche alle
  Termine des Eintrags, in einer echten Woche die ab diesem Tag; „1×“ dunkel heißt einmalig.
- **Die Woche:** die **Standardwoche** (was jede Vorlesungswoche wiederkehrt; im Kopf je Tag und für die Woche das
  **Mittel der echten Vorlesungswochen** — „Ø 7,5 h“, c.t. als Doppelstunde — neben dem Soll der Modulbeschreibungen;
  bis V-0336 zählte sie Blöcke „alle n Wochen“ und Reihen, als lägen sie jede Woche; Reihen an ihrem typischen Platz
  mit „7×“ und „nächster 13.11.“; ein Wochenblock sagt „zählt 12 von 16“, wenn er nicht jede Woche zählt) oder eine
  **echte Woche** (jede Woche des Semesters, W01 … Pause … P8, mit Datum, Ganztägigem oben: Fristen, Prüfungen, die
  Freigaben des Schritts). Gelegte Blöcke lassen sich verschieben, an der Unterkante verlängern (EVL mindestens
  1,5 h), anklicken zum Bearbeiten (auch Takt: jede, alle 2 … 8 Wochen). ← → wechselt die Woche, ⌘Z macht
  rückgängig, Esc schließt.
- **Dunkel** (V-0338, Silas: *„im Dark Mode sehen die Farben zusammengewürfelt und chaotisch aus“*): die Farben der
  Arten in OKLCH mit gleicher Helligkeit und Sättigung, Ränder, Modulstreifen und Etikett gedämpft; eigene Blöcke ohne
  Streifen, nur heller gefüllt (Silas: *„die als dein Block markierten sind hinten so gestreift … das macht es
  komischer“*). Die mit stil.css geteilten Tokens (grau, m1–m8) bleiben gleich (Test).
- **Farben nach Art** (V-0332, Silas: „Präsenzveranstaltung sollte das gleiche Farbschema haben bei allen Modulen …
  Quiz zum Beispiel immer grün“): Präsenz, Videos, Vor- und Nachbereitung, Aufgaben und Labs, Quiz und Tests, Prüfung —
  je eine Farbe (`kategorie()`), das Modul als Streifen links an jeder Kachel. Formen: fester Termin (gefüllt), **zur
  Wahl** (gefüllt, weiß gestrichelte Linie innen — solange nicht gewählt, stehen alle Gruppen im Plan), **gewählt**
  (weiß durchgezogen; die anderen nur noch ausgegraut, wenn der Teil gewählt ist), nur an einzelnen Tagen (heller, mit
  Anzahl), dein Block (heller gefüllt, ohne Streifen).
- **Unter dem Raster:** in Schritt 2 die Gruppen (s. o.), in Schritt 3 und 4 und festgelegt, was in dieser Woche
  (Standardwoche: jede Woche) dran wäre, aber noch nicht im Plan ist (`wochenBedarf()`): grau „Termine kommen noch“,
  hellblau „Block setzen“. Videos zählen in der Woche, in der ein Block sie deckt.
- **Links: Ganzes Semester | Diese Woche** (ab Schritt 3 und festgelegt). Die Woche ist die im Raster gezeigte.
- **Ohne Uhrzeit:** Ein Termin mit Datum, aber ohne Uhrzeit steht über dem Raster; ein Klick trägt Uhrzeit und Ort nach.
- **Kopf, die Bilanz:** *eingeplant − zu viel = gedeckt von Soll* (Silas: „die Zahl davor muss alles
  zusammengerechnet sein und dahinter muss stehen minus so und so viele Stunden, die zu viel eingeplant sind“).
- **Woher:** Die Karte eines Teils nennt die Zeile der Aufwandstabelle, den Anteil dieses Teils, Umwidmungen und die
  Quelle der Termine (`quelle`). Videos stehen dort einzeln, mit einem Feld für ihre Länge.
- **Rechts, die Minimap** (V-0328, Silas: „wie die Minimap, die die Semesterübersicht einmal in Wochenansicht gibt“):
  je Modul eine Summenzeile, darunter jeder Bestandteil, regelmäßig wie unregelmäßig, dazu Prüfungen und Fristen;
  Termine kräftig, eigene Blöcke heller, Freigaben als Punkt. Der links gewählte Bestandteil leuchtet, die anderen
  treten zurück; im Ablauf sind Zeilen anderer Schritte und die Prüfungen blass. Darunter die Chronik des Unregelmäßigen.
- **Am Telefon** liegt alles untereinander, das Raster scrollt seitlich; ein Tipp legt den hängenden Block ab
  (auch er nicht auf Präsenz). Die Schritte zeigen nur den gezeigten mit Namen, die anderen mit Nummer und Stand.

## 4. Stellschrauben (`REGELN` in `modell.mjs`, im Angebot unter `regeln` überschreibbar)

| Regel | Wert | Grund |
|---|---|---|
| `lp_h` | 30 | AllgStuPO § 45 Abs. 2 |
| `video_puffer_min`, `raster_min` | 15, 30 | Silas: 1:45 → 2 h |
| `lerntag_h`, `lernfenster` | 6, 09–19 | Faustregel aus dem Semesterplan |
| `toleranz_min` | 120 | Silas, V-0332: Abweichungen bis ±2 h nicht melden |
| `pendeln_min` | 40 | Silas, V-0338: 40 min Fahrzeit vor dem ersten und nach dem letzten Termin vor Ort (nur gezeigt) |
| `evl_block_min`, `evl_min_min` | 120, 90 | Silas, V-0335: „EVL-Block muss einfach zwei Stunden sein … mindestens anderthalb“ |
| `evl_fenster`, `tag_fenster` | 10–18, 08–20 | bevorzugte und überhaupt gesuchte freie Plätze (Silas: „zwischen 10 und 18 Uhr preferred“) |
| `pruef_fenster` | 07–22 | Prüfungsvorbereitung in der Vorlesungszeit: auch früh und abends (V-0337) |

## 5. Das Datenformat

Ein **Stand** ist ein JSON-Dokument `{schema: 1, version, geaendert, angebot, plan}`.

- **`angebot`** — was es gibt: `semester {id, titel, vorlesung {von, bis}, frei [{von, bis}], ende, studiengang,
  fachsemester}`, `regeln`, `module [{id, nr, titel, kurz, lp, farbe 1–8, posten [{id, lv, titel, mult, h}],
  teile [{id, titel, art, posten, soll_h?, termine?, optionen? [{id, label, termine}], wahl?, einheiten?
  {liste? [{nr, ab, titel}], takt? {tag, von, bis}, laenge_min?, annahme_min?, offen?}, pruefung?, offen?, unsicher?,
  hinweis?, annahme?, quelle?, ort?, online?, anmeldung?}], pruefungen [{id, titel, dauer_min, wahl?, offen?, unsicher?,
  zulassung?, anmeldung?, termine [{datum|null, start?, ende?, ort?, label, wichtig?, offen?, unsicher?, quelle?,
  anmeldung?}]}],
  notizen [], links {}}]`, `termine [{id, modul?, art: frist|info|rahmen, datum, bis?, start?, ende?, titel, ort?,
  wichtig?, unsicher?}]`.
- **`plan`** — was Silas entschieden hat: `wahl {teil: option}`, `pruefungstermin {pruefung: datum}`, `bloecke [{id,
  teil|null, tag | datum, start, ende, ab?, bis?, pause?, alle?, versatz?, titel?}]`, `umwidmungen [{id, von, nach, h}]`,
  `bestaetigt {annahme-id: true}`, `angemeldet {pruefung- oder teil-id: true}`, `festgelegt` (Zeitpunkt, §2.8a),
  `zurueckgesetzt {am, ab, wahl, bloecke}` (was Zurücksetzen beiseitegelegt hat). (Ein `lernplan: true` an alten Blöcken
  aus dem entfernten Vorschlag wird nicht mehr gelesen.) Ein Teil kann mit `schritt: 1–4` in einen anderen Schritt
  gestellt werden (§2.8a).
- **Einheiten** (`einheiten`): `liste [{nr, ab, titel, woche, laenge_min, bis?, bis_zeit?, quelle, offen?, unsicher?}]`
  oder `takt {tag, von, bis}`; dazu `annahme_min` (Videos), `dauer_min` (Quiz/Blatt), `anzahl` (Datum noch offen), `offen`.
- **Serie mit Angaben je Tag:** `tage {datum: {titel, ort, unsicher, quelle}}` — der Freitag mit Übung statt VL.
- `pruefeAngebot()` lehnt ab, was formal nicht stimmt (doppelte Ids, unbekannte Art, kaputtes Muster); die API
  speichert dann nicht (422).

## 6. Die Schnittstelle zum Study OS — und zum Kalender

Die Richtung ist **Study OS → Stundenplanner**: Das Study OS liest, der Stundenplanner fragt nie etwas von dort ab
(AGENTS.md §2 ④).

- `GET /silas/api/ereignisse` mit `Authorization: Bearer <Schlüssel>` liefert `{schema, version, geaendert, semester,
  ereignisse[]}`. Ein Ereignis: `id` (stabil: `<teil>@<datum>@<uhrzeit>`, `<block>@<datum>`, `<prüfung>@<datum>`),
  `schicht` (A/B/C/D/R), `quelle`, `art`, `modul`, `modulnummer`, `titel` („TECHGI · VL“), `datum`, `bis`, `start`/`ende`
  als ISO mit Zeitzone (`2026-10-29T12:15:00+01:00`), `ganztag`, `uhrzeit` (Fristen mit Zeitpunkt), `ort`, `online`,
  `wichtig`, `unsicher`, `teil`, `zaehlt_min`, `flags`.
- Für die Timeline heißt das: `modulnummer` → Spur `modul:<nr>`, `ganztag`/`start` → `von`/`zeit`, `unsicher` →
  Status `entwurf`, Schicht D → „geplant“. Das Study OS braucht dafür nur den Schlüssel (Vault
  `stundenplanner-silas-schluessel`) und einen Abruf, z. B. stündlich.
- **Kalender-Abos:** `/silas/api/kalender/termine.ics?k=…` („TU · Termine“: A, B, C) und `…/lernen.ics?k=…`
  („TU · Lernen“: D), so wie Silas' Semesterplan es vorschlägt. `alles.ics` vereint beide. Stündlich aktualisiert.

## 7. Privat

- **Im Repo liegt nur das Werkzeug.** Silas' Semester (mit ISIS-Angaben, Tutorennamen, Zoom-Links, seiner Wahl)
  liegt nur im KV-Namensraum `stundenplanner-silas` hinter `/silas/api`. Ein Test hält fest, dass `web/silas/` keine
  Datendateien enthält; die Tests nehmen ein erfundenes Beispielmodul.
- **Der Schlüssel** (32 Zufallsbytes) steht in `betrieb/.env` (`SILAS_SCHLUESSEL`) und in Silas' Browsern; Cloudflare
  kennt nur seinen SHA-256 (Geheimnis `SILAS_SCHLUESSEL` der Pages). `#schluessel=…` in der Adresse legt ihn einmal
  in einem Browser ab und verschwindet sofort aus der Adresse (ein Fragment geht nie an den Server).
- **Speichern** mit optimistischer Sperre: Wer auf einem älteren Stand geändert hat (anderes Gerät), bekommt 409 und
  wählt „neuesten laden“ oder „meinen behalten“. Je Stunde eine Sicherung (60 Tage, `GET /silas/api/verlauf`).
  Ungespeichertes bleibt im Browser und wird nachgereicht.
- Die Vorschau-Auslieferungen schreiben in einen eigenen Namensraum (`stundenplanner-silas-vorschau`).

## 8. Offen

- Die Daten kamen am 11.10. aus Silas' ISIS-Export, je Modul von einem Agenten gelesen (V-0328). Was ISIS noch nicht
  nennt, steht rot unter „Offen & Annahmen“ (Tutorien, Übungsgruppen, Quiz- und Abgabefristen, Räume, Videolängen,
  STAT1-Klausur) und wird auf der Seite nachgetragen.
- Ein Termin für zwei Posten (PROG1: VL und Übungsanteile gemischt) bucht das Modell auf einen Posten; `posten` je
  Muster wäre genauer. Einlass und Zeitfenster einer Prüfung (Erscheinen 08:15, 60 min im Fenster 08:30–10:30) und
  Räume nach Nachnamen stehen nur als Text.
- Das Study OS liest `/silas/api/ereignisse` (Vorgang im Airfield studyos).
- Ob der Planer für alle kommt, entscheidet Silas; das Modell ist dafür schon allgemein.
