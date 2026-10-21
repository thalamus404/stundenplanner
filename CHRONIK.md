# Chronik — der Stundenplanner

> **⛔ Keine Zugriffe auf Systeme der TU Berlin ohne Silas’ ausdrückliche Genehmigung**
> (Silas, 05.10.2026; [AGENTS.md §2 ⑦](AGENTS.md#2-die-regeln)). Das gilt für jeden Weg: Abruf-Code, Skript, `curl`,
> Browser-Automatisierung, `WebFetch` eines Agenten, auch für eine einzelne Seite „nur zum Nachsehen“.
> Genehmigt ist allein der tägliche Lauf um 05:20 im Container `stundenplanner-abruf`. Wer mehr braucht,
> fragt Silas **vorher** und nennt **Umfang**, **Maßnahmen gegen Last** und **Grund**. Dasselbe gilt für
> die Vorlesungsverzeichnisse anderer Hochschulen. Der Code sperrt selbst (`abruf/zugang.py`).

Was wann passiert ist, das Neueste oben. Ein Eintrag sagt, was entschieden wurde und warum,
nicht jeden Commit: Die Commits stehen in git, die Vorgänge im TOWER.

---

## 21.10.2026 — /silas am Surface und MacBook: ein Ganztägiges je Tag, Seiten einklappbar (SP-0424)

- Silas: *„Kannst du bitte den stundenplanner vom layout nochmal aufs surface (zusätzlich zu macbook) screen
  optimieren? Um mehr platz zu haben sollen maximal 1 ganztags termine angezeigt werden und darunter +X … Außerdem soll
  man das linke Seitenmenü … einklappbar sein so wie semester und wochenende auf der rechten seite. … Das Feld oben
  Festgelegt am ... und bearbeiten und daneben offen abgleich so wird gerechnet und zurücksetzen soll standardmäßig
  eingeklappt sein“*.
- Über dem Raster steht je Tag nur noch das wichtigste Ganztägige, darunter „+n“; Darüberfahren oder Antippen zeigt
  die übrigen der ganzen Woche in einem Feld über dem Raster. Die Zeile „Festgelegt am … / Offen / Abgleich …“ ist
  zugeklappt hinter „✓ Festgelegt“ neben dem Titel. Die linke Spalte klappt auf eine Schiene mit „Menü“, „Woche“ und
  „Prüfungen“, standardmäßig ist sie offen. Der Titel der Woche braucht zwei Zeilen statt drei bis vier, die Seiten
  sind zwischen 1281 und 1599 px etwas schmaler.
- Mit Silas' Stand: am Surface (1440 × 830) 533 statt 390 px Raster, im halben MacBook-Fenster (865 × 1021) beginnt
  das Raster 145 px weiter oben, im ganzen (1728 × 1000) 703 statt 588 px. `ops/sicht_silas.py` misst jetzt auch diese
  drei Fenster (docs/SILAS.md §3).

## 21.10.2026 — /silas: Präsenztermin nur diese Woche verlegen, roter Bereich „fällt aus“ (SP-0423)

- Silas: *„… dass man einen Präsenztermin in der Wochenansicht für eine bestimmte Woche auch verschieben kann. Und
  sobald man einen Termin verschiebt, soll unten ein kleiner roter Bereich auftauchen, und wenn man das, was man grad
  verschiebt, dorthin schiebt und loslässt, dann wird die Veranstaltung in der Woche als ‚Fällt aus‘ rot markiert.“*
- Festgelegt, in einer echten Woche, lässt sich jeder Termin mit der Maus ziehen, wie seit SP-0415 ein eigener Block.
  Nur dieses Vorkommen liegt dann woanders (`plan.verlegt`, `verlegen()`). Es bleibt ein Termin seiner Reihe, sperrt
  seinen neuen Platz und trägt die Marke „nur diese Woche“, die zurücksetzt. Das Kalender-Abo sagt, wo er sonst liegt.
- Beim Ziehen steht unten ein roter Bereich. Wer dort loslässt, trägt `{s: 'ausgefallen'}` in den Lebenslauf ein
  (`ausfallen()`), denselben Eintrag wie „… ausgefallen“ in der Ist-Karte (V-0357), nur auch vorab. Der Termin steht
  rot an seinem Platz, zählt nicht, sperrt nichts, braucht keine Fahrzeit und fehlt im Kalender-Abo. Die Marke
  „fällt aus“ öffnet „Findet doch statt“ und ein Feld für den Grund. Was Silas schon als ausgefallen gemeldet hatte,
  steht seitdem auch rot da statt blass. Blass bleibt nur, was ausfällt, weil die TU geschlossen ist.
- Am Telefon zieht man nicht; dort gibt es das Verlegen noch nicht.

## 21.10.2026 — /silas/api rechnet nur noch bei einer Änderung (SP-0422)

- Cloudflare meldete am 20.10. über 100 Überschreitungen des CPU-Limits in 24 Stunden. Silas: *„… wer die Seite
  abruft, ob das legit Traffic ist oder Bot Traffic.“* Ein Mitschnitt von 15 Minuten (Tail-API, nur lesen) zeigte keinen
  fremden Verkehr. Alle Aufrufe der Functions kamen von Silas' eigenem Anschluss: SILAS.OS und Apple Kalender holten
  die Kalender-Abos von `/silas` alle 5 Minuten, das Study OS die Ereignisse alle 4 Minuten. Jeder Abruf brauchte 21–49 ms
  CPU, erlaubt sind im Free-Plan 10 ms. Hochgerechnet waren das rund 1100 am Tag, weil jedes Mal das ganze Semester
  neu gerechnet wurde. Die öffentliche Seite war nicht betroffen, sie ist statisch.
- Seitdem gibt es ein ETag und den Cache der Edge. Neu gerechnet wird nur, wenn sich Stand, Code oder (bei den
  Ereignissen) der Tag ändert. Silas stellt das Abo im Apple Kalender auf „automatisch“ (die Abos schlagen stündlich
  vor). Die Takte von SILAS.OS und Study OS bleiben dort (AGENTS.md §2 ④).

## 19.10.2026 — /silas: Präsenz nur diese Woche bei einer anderen Gruppe, „nur diese Woche“ setzt zurück (SP-0421)

- Silas: *„… wenn ich auf Statistik 1 Tutorium am Montag raufklicke, dass dann in dunkelgrau alle anderen Termine diese
  Woche angezeigt werden, die es dazu noch gibt. Und wenn ich auf einen anderen, dann noch grauen Termin raufdrücke,
  dann kommt quasi die Abfrage für diese Woche ändern?“* Festgelegt, in einer echten Woche, zeigt ein Klick auf eine
  gewählte Gruppe das Element wie bisher farbig und die Termine der anderen Gruppen dieser Woche dunkelgrau
  (`ausweichTermine()`); „Ja, nur diese Woche“ legt nur dieses Vorkommen dorthin (`plan.tausch`, `tauschen()`). Es
  zählt weiter als Termin der eigenen Gruppe, ein ✓/✗ zieht mit, das Kalender-Abo sagt, wo er sonst liegt.
- *„… wenn man auf dieses kleine Schildchen nur diese Woche rauftippt, dass dann ein kleines Fenster aufploppt, wo man
  sagt, zurücksetzen.“* Die Marke ist jetzt ein Ziel, für getauschte Termine wie für einzeln verschobene Blöcke
  (`einzelnZuruecksetzen()`, das Gegenstück zu SP-0414).
- Wer die Gruppe ganz wechselt, verliert die Täusche der alten (die Meldung sagt es, ⌘Z holt sie); „Zurücksetzen ab
  Schritt 2“ legt sie mit der Wahl beiseite.

## 18.10.2026 — Der Styleguide des Study OS: /silas und die öffentliche Seite (SP-0420)

- Silas: *„… mach einen Design-Rehaul … lass alle Elemente so, wie sie sind, aber füg bitte irgendwie ein Style-Guide
  vom Study-OS hinzu … das Logo … nach diesen Style-Vorgaben … aber bitte dabei das Layout nicht verändern, sondern
  wirklich nur die Akzente setzen … Die Bedienung sollte darunter nicht leiden.“* Danach: *„Es geht mir vor allem um
  den Semesterplan, also den Stundenplanner unter /silas“*; die öffentliche Seite geht mit („Beides“).
- Übernommen, kopiert und nicht verlinkt (AGENTS.md §2 ④): das Zeichen „Raster“ aus thalamus404/studyOS
  (`app/static/brand/logo.svg`), die Flächen, das Neon, die Radien und das Etikett aus dem Study OS (`app/static/os.css`)
  und seinem Obsidian-Theme „Study Style“. Hell Papier, dunkel Tiefblau-Schwarz; das Neon an Marke und Navigation
  (Zeichen, „planner“, Reiter, Segment, Schritt, Hauptaktion), nie im Plan — ein Test hält es dort heraus.
- Silas' Entscheidung „keine Markenfarbe“ (05.10.2026) gilt seitdem nur noch im Plan (docs/DESIGN.md §9 Punkte 1
  und 55). `ops/sicht.py` kennt die Stellen, an denen Neon, Etikett, Mono und der Raum des Startbildschirms jetzt
  gewollt sind; überall sonst bleiben es Tells.
- Gemessen, nicht geschätzt: Der Neon-Fokusring hielt an den Kanten keine 3:1 und der große Schatten der Überlagerungen
  verdeckte am Handy Formate unter dem Umschalter; beides ist zurück (Fokus Tinte, Schatten 24 px, Tiefblau). Das
  Byte-Budget steigt (HTML 18, CSS 59, komprimiert 74 KB). Favicon und App-Symbol sind unverändert.

## 17.10.2026 — /silas: Festgelegt zeigen die Modulbalken, was getan ist (SP-0419)

- Silas: *„… wenn der Stundenplaner fertig ist, dann soll es die Progress Bar sein bei ganzes Semester: Wie viel hast du
  gemacht von dem, was da ist, und wie viel kommt noch? … Und bei dieser Woche soll es genau die gleiche Logik sein, nur
  eben für diese Woche, und da soll auch der Hinweis kommen, in Rot, wie viel Prozent noch nicht verplant sind … oben
  bei ‚Dein Stundenplan‘ weiterhin die Progress Bar für wie viel einem noch fehlt in der Planung.“*
- Bisher maß jeder Balken die Planung, auch nach dem Festlegen — ein Modul stand bei 100 %, sobald alles lag, egal ob
  etwas davon getan war. Jetzt rechnet `vollzug()` (docs/SILAS.md §2.10): grün erledigt, rot nicht gemacht und
  nachzuholen, schwarz verpasste Präsenz, schraffiert vorbei ohne ✓/✗, grau kommt noch; 100 % erst, wenn alles erledigt
  ist. „Diese Woche“ dasselbe für die Woche, dazu rot schraffiert und als Zeile „n % noch nicht verplant“.
- Im Ablauf (Schritte 1–4) und oben unter „Dein Stundenplan“ bleibt der Planungsfortschritt.

## 17.10.2026 — /silas: Fahrzeit und Mittag über keiner Kachel, Mittag 30 min nahe 12 (SP-0418)

- Silas: *„Fahrzeitlogik und Mittaglogik … überschneiden sich manchmal mit irgendwelchen Modulkacheln, aber das geht ja
  nicht.“* Ursache: Die Fahrzeit hing fest am ersten und letzten Termin vor Ort, auch wenn dort ein Online-Termin oder
  ein Block lag; der Mittag lag ohne Lücke um 12:30 und gezogen genau dort, wohin er gezogen war — beides über dem, was
  dort stand. Jetzt sucht beides mit einer Funktion (`naechsterPlatz()`) die nächste Lücke, die nichts überdeckt.
- **Mittag**: 30 min, so nah an 12 Uhr wie möglich, nie vor 11 und nie nach 15 Uhr, nicht in der Fahrzeit. Ohne 30 freie
  Minuten die größte Lücke (näher an 12 bei gleicher Größe) mit einem „!“, das beim Zeigen die Minuten nennt.
- **Fahrzeit** lässt sich wie der Mittag am Schild ziehen, je Tag und nur in dieser Woche (`plan.fahrt`), Doppelklick
  löst sie wieder. Am Telefon hat sie dafür wieder ein Schild. Beim Ziehen folgen beide derselben Regel.

## 17.10.2026 — /silas: Das Wochenende klappt an der Seite auf (SP-0417)

- Silas: *„… da an der Seite, wo man auch das Semester aufklappen kann, soll man auch aufklappen können, dass man das
  Wochenende für die jeweilige ausgewählte Woche sehen kann und da auch Sachen hin verschieben kann.“* Neben „Semester“
  steht jetzt „Wochenende“ (eingeklappt als zweite Schiene); er zeigt Sa und So der gewählten Woche im Raster, dorthin
  legt und zieht man wie an jedem Tag. Der Schalter `ansicht.wochenende` gab es schon, nur setzte ihn nichts.

## 17.10.2026 — /silas: einzeln Verschobenes gekennzeichnet, „weit vom Stoff“ entfernt (SP-0416)

- Silas: *„Sobald ein Termin … für eine einzelne Woche verschoben wird, muss der … eine Kennzeichnung tragen.“* Jetzt
  trägt er die blaue Marke „nur diese Woche“; Tooltip und Blockkarte sagen, wo die Reihe sonst liegt, das Kalender-Abo
  schreibt es in die Beschreibung, das Ereignis trägt `einzeln`. Kein gestrichelter Rand: der heißt „zur Wahl“.
- *„Kannst du bitte entfernen, das weit vom Stoff, das verwirrt nur.“* Marke, Hinweis in der Liste, Satz in Karte,
  Tooltip und Meldung sind weg; der neutrale Satz „Zum Stoff: meist …“ bleibt, ebenso das Einrasten beim Stoff.

## 17.10.2026 — /silas: Auch festgelegt lässt sich ein Block in einer echten Woche ziehen (SP-0415)

- Silas versuchte nach SP-0414 im echten Plan (W01, TGI VL-Nachbereitung) einen Block zu schieben — es ging nicht:
  Festgelegt waren Blöcke nur Knöpfe. *„Ich will nicht vorher erst auf Bearbeiten klicken müssen, sondern es soll
  direkt funktionieren mit dem Rumschieben.“*
- Festgelegt, in einer echten Woche: jeder eigene Block zieht, nur dieses Vorkommen (wie die Mittagspause, V-0345). Ein
  Klick bleibt Klick; die Standardwoche bleibt festgelegt gesperrt.

## 17.10.2026 — /silas: In einer echten Woche verschiebt Ziehen nur dieses eine Vorkommen (SP-0414)

- Silas: In der Standardwoche soll Ziehen bleiben, wie es ist: Alle Termine der Reihe ziehen mit. In einer echten
  Woche dagegen *„soll das für diese Woche halt verschoben werden, aber nicht für die anderen Termine … es gilt nur für
  diese eine Instanz des Termins“*. Bis dahin verschob Ziehen eines Wochenblocks in jeder Ansicht die ganze Reihe.
- Die Reihe lässt diese Woche aus (`ohne`, nach Montag, damit es auch einen neuen Wochentag übersteht und `alle: n`
  nicht verrutscht), und das Vorkommen wird ein Datumsblock mit `serie`. Die Blockkarte fragt in einer echten Woche
  „Gilt für: nur diese Woche / jede Woche“ (das Telefon zieht nicht), Löschen ebenso; eine Reihe zu löschen nimmt
  ihre einzeln verschobenen Wochen mit.

## 17.10.2026 — /silas: Probeplan zum echten Plan machen (SP-0413)

- Silas: Im Probeplan soll man sagen können *„Probeplan zum echten Plan machen und damit wird quasi der echte Plan
  überschrieben, alles wird überschrieben mit dem Probeplan … und der Probeplan selbst wird wieder frei“*.
- Ein Knopf neben der Planwahl; der Server macht es in einem Weg (`POST /silas/api/uebernehmen?plan=n`): den alten
  echten Plan auf die Minute sichern, den Probeplan als nächste Version des echten schreiben, den Probeplan löschen.
  Übernommen wird nur die Version, die die Seite zeigt (sonst 409) — und ganz, auch Angebot und `festgelegt`.
- Folge für das Study OS: Liest es `ereignisse?plan=n` und wird genau dieser Probeplan übernommen, ist er danach leer
  (404) — es muss dann den echten Plan lesen (docs/SILAS.md §7).

## 17.10.2026 — /silas/api/ereignisse: Probeplan wählbar, Prüfungen und Zeiträume für das Study OS (SP-0412)

- Silas: Das Study OS soll *„die Termine und Intervalle und auch die Daten vom Prüfungstab“* aus /silas zeigen — und
  zwar aus *„der dritten Version“*, dem Probeplan, den er gerade festgelegt hat. Bis dahin lieferte `ereignisse` nur den
  echten Plan (V-0345: „Ereignisse und Kalender kommen immer aus dem echten Plan“) und nur Vorkommen.
- `ereignisse?plan=n` liest den Probeplan; ohne `plan` bleibt alles, wie es war. Die Kalender-Abos bleiben beim echten.
- Dazu `pruefungen[]` (der Reiter „Prüfungen“ als Daten: Art, gilt/Rückfall, gewählt oder Arbeitsannahme, Stand,
  Punkte, Fristen, Kontingent, die Strecke der Vorbereitung, Termine ohne Datum) und `zeitraeume[]` (Vorlesungszeit,
  Pausen, vorlesungsfreie Zeit, Schließung) — aus demselben `rechnen()` wie die Seite, damit das Study OS nichts
  nachrechnet (docs/SILAS.md §6).
- Befund: Ein Probeplan trägt eine eigene Kopie des Angebots. Was danach am Angebot des echten Plans korrigiert wird,
  fehlt dort — wer einen Probeplan liest, liest dessen Stand der ISIS-Angaben.

## 16.10.2026 — /silas: Prüfungen ohne Umbuchung, EINFWI nach Punkten, Surface-Ansicht (SP-0411)

- Silas ließ die Prüfungskontingente nachrechnen (*„sagt mir jetzt nur mein Bauchgefühl“*): Die Grundzahlen stammen aus
  den Modulbeschreibungen, aber G5 schob Präsenz, die nicht stattfindet, in die Klausurvorbereitung (EINFWI +20 h aus 5
  statt 15 Übungen, STAT1 +14,5 h), und der EINFWI-Online-Test bekam 40 h für 20 Punkte — achtmal so viel je Punkt wie
  die BuK-E-Tests. Silas nahm beide Vorschläge an: Reste bleiben **Puffer** im Semester (G5 neu), die 90 h EINFWI werden
  **nach Punkten** geteilt (Test 18 h, Klausur 72 h). 900 h = 632 h Semester (38,5 h Puffer) + 268 h Prüfungen.
- Damit nichts still zu viel liegt: eine Meldung, wenn für eine Prüfung mehr gelegt ist als ihr Kontingent (die
  40 h Testvorbereitung standen nach der Senkung ohne Hinweis da).
- Am Surface Pro 11 (1440 × 830 im größten Fenster): Legende auf jeder Breite zugeklappt und gemerkt, Festgelegt in einer
  Zeile mit den Werkzeugen, die Semester-Leiste klappt auf eine beschriftete Schiene, Analytics deckt bis zur Kante. Das
  Raster hat 40 statt 33 px je Stunde, mit eingeklappter Leiste 190 px je Tag (docs/SILAS.md §3).

## 16.10.2026 — /silas am Telefon: jeder Schritt auf einen Schirm (V-0391)

- Silas: *„die app bitte einmal für jeden schritt auch für mobile optimieren“*. Gemessen bei 390 × 844: Das Raster war
  640 px breit und seitlich zu schieben (Mo, Di, halb Mi), die Seite 9 000 px lang (6 900 davon die
  Semester-Übersicht), und was dran war, stand unter Raster und Legende.
- Jetzt passt die Woche in die Breite, über dem Raster steht, was dran ist, mit seinen Knöpfen (Gruppe wählen, Block
  legen, Weiter), Legende und Übersicht sind zugeklappt, Karten kommen als Blatt von unten. Ein Schritt ist rund
  2 000 px lang. Am Rechner bleibt alles, wie es war (docs/SILAS.md §3 „Am Telefon“).
- Damit es so bleibt: `ops/sicht_silas.py` misst die Seite am Telefon mit erfundenem Stand (32 Ansichten).

## 12.10.2026 — /silas: Zeitleiste unten, gemeinsamer Vorschlag, Verpasstes im Balken, Analytics (V-0357)

- Unter „Prüfungen“ geht mit der Wahl einer Prüfung unten eine Zeitleiste auf: je Tag von heute bis zwei Tage nach dem
  Termin eine Säule (9 h), Wochenenden weiß gerahmt, Lernaufwand x von y h; Tippen und Ziehen legen Lernzeit.
- Der Vorschlag rechnet jetzt alle Prüfungen gemeinsam: je Prüfung 10 h ans Wochenende davor, 10 h ans davor, dann je
  4 h, Periode für Periode für alle zugleich und in halben Stunden reihum — so teilen sich PROG1 und BuK (beide 17.02.)
  die Wochenenden, und an einem Tag lernt man für mehrere. Vorher rechnete jede Prüfung für sich nach Datum, die
  spätere bekam Reste.
- Kalender: Prüfungen in Modulfarbe, die Form nach Art (● Klausur, ■ E-Test, ◆ Test); die gewählte springt in den Blick
  und leuchtet; Fristen als i-Knopf statt als Zeilen.
- Ist-Erfassung: ✗ wird im Modulbalken rot (nachzuholen) bzw. schwarz (Präsenz verpasst), der Balken bleibt gleich lang;
  „Ansehen“ listet das Verpasste mit der Zeit zum Nachholen; Termine haben „ausgefallen“ mit Grund.
- Analytics (Knopf unten links): Lernverhalten aus ✓/✗ je Woche, Art, Wochentag und Stunde, Verpasstes, Prüfungs-
  vorbereitung und die Nutzung (je Tag Sitzungen, Änderungen, aktive Minuten — gezählt im Browser, gespeichert mit der
  nächsten Änderung).
- Prüfung der ersten zwei Wochen (Agent, beide Pläne): Blöcke decken Videos und Quizze jetzt in Minuten (Quiz nur im
  Fenster, ein Rest deckt die nächste Woche), ✗ deckt nichts, Ungedecktes ist eine Meldung — das TECHGI-Quiz mit 2 h alle
  zwei Wochen ließ 7 Quizze ohne Block, ohne dass es jemand merkte. Dazu: Last ohne Doppeltes, Vorbereitung vor dem
  Fenster zählt nicht, „Diese Woche“ nach Abdeckung und anteilig, Kopf und Liste derselben Woche mit derselben Zahl,
  Fahrzeit nach Raum statt Zoom-Link, Wochenblock auf dem Kick-off „dran“, „Frist vorbei — angemeldet?“ statt sofort
  „gescheitert“, Portfolio-Fristen einmal.

## 12.10.2026 — /silas: halbe Lernblöcke, Modul leuchtet, Prüfungen aufgeräumt, Vorschlag am Wochenende (V-0356)

- Silas' zweite Rückmeldung beim Neuaufbau (Probeplan 2): Vor-/Nachbereitung und Quizze in halben Blöcken mit doppelter
  Anzahl (2 h → 2 × 1 h, EINFWI 1,5 h → 2 × 45 min, Quiz 1 h jede Woche, BuK 2 × 1,5 h bleibt); die Knöpfe einer Sache in
  einer Zeile, der Vorgabe-Satz in den Details; ein Klick auf ein Modul lässt alles von ihm im Raster aufleuchten.
- Nach dem Festlegen sprang der Balken von „alles erledigt“ auf 57 %, weil er die Prüfungsvorbereitung mitzählte — jetzt
  zählt „Woche“ die Schritte 1–4, „Prüfungen“ den Rest. Der Prüfungsbalken war rot, obwohl alles geplant war (die Farbe
  „geplant“ war die der Prüfung) — jetzt grün/gelb/grau wie überall.
- Prüfungen: Termin, Stand und Punkte klein, alle Sätze in den Details, „Vorschlag ansehen“ zeigt nur seine Wochen und
  lässt sie aufleuchten, nach fertigem Planen geht die nächste Prüfung auf. Der Vorschlag legt die zwei Wochenenden vor
  einer Prüfung gleichmäßig auf Sa und So und ohne die 45-h-Wochengrenze (die in den Vorlesungswochen immer schon
  überschritten ist): BuK E-Test 1 bekommt Sa 1 h und So 1,5 h statt halber Stunden über drei Wochenenden. Der
  EINFWI-Test: 17,5 h passen, 5,5 h nicht (vorher 0 / 23 h).
- Vorbereitung auf die Übungen: alle Übungstermine im Kalender, das Wochenende davor als Option.

## 12.10.2026 — /silas: Fortschritt je Schritt und Modul, Unregelmäßiges unter Prüfungen (V-0354)

- Silas' Rückmeldung beim Neuaufbau seines Plans: oben links statt des erklärenden Satzes ein Fortschrittsbalken je
  Schritt (grün geplant, gelb bekannt und noch offen, grau noch nicht bekannt), je Modul derselbe Balken; fertige Sachen
  klappen mit grünem Haken ein, unbekannte mit grauem, ein Modul ohne Offenes zeigt nur Name, Balken und „Blöcke ändern“.
  Der Schrittknopf trägt den vollen grünen Haken erst bei 100 %, sonst einen gestrichelten, wenn nur noch Unbekanntes fehlt.
- Was in echten Wochen gelegt wird (Quicktests, Vorbereitung auf die EINFWI-Übungen, BuK-Literatur), steht nicht mehr im
  Ablauf, sondern unter „Prüfungen“ an seinen Bezugsterminen — „In W07 legen“ öffnet die Woche vor dem Termin mit dem
  Block am Zeiger; ohne Termine bleibt es offen (Folgeentscheidung). Die Standardwoche ist das Gerüst des Regelmäßigen;
  seltenere Reihen stehen nur als Umriss da.
- „Block verschieben“ statt „Block legen“, wenn schon einer liegt (die Blöcke leuchten auf); Festlegen nennt, was bekannt,
  aber nicht gelegt ist („Trotzdem festlegen“); unter Prüfungen „Wahl ändern“ statt der Terminknöpfe, Details und
  Hinweise zugeklappt.

## 12.10.2026 — /silas rechnet nach dem Kontingent-Modell (V-0349)

- Silas fand die Rechnung unverständlich (120/120/162/90/140 h bei je 6 LP; BuK „138 von 140“ trotz Überschuss) und ließ
  das Modell abseits des Tools neu aufstellen (Fassung 4, mit seinen Entscheidungen und drei Prüfungen durch einen
  zweiten Agenten). Der Planer rechnet jetzt danach: jeder Posten der Aufwandstabelle ein Kontingent, Termine zuerst,
  verteilt wird nur Selbststudium (Wochenwert = (Kontingent − erledigt) ÷ Wochen im Fenster), zwei Töpfe (Semester,
  Prüfungen; 900 h = 595,5 + 304,5 h). Zu wenige Präsenztermine gehen nach G5 in die Prüfungsvorbereitung (EINFWI-Übung
  20 h, STAT1 12,5 h, BuK-Tutorium 4 h) — die Umwidmung von Hand ist entfernt.
- Der Baum je Veranstaltung mit „Info fehlt“ samt Stichtag (kein Fehler, „Augen offen“), Zuteilung (Wunsch zählt nicht
  als verplant), die TU-Schließung 18.12.–04.01., ✓/✗/… für Vergangenes. Prüfungen mit Stand nach § 63, Fristen als
  Verweise, Punkten, Quote, Wiederholung — und ein Vorschlag (zwei Wochenenden à 10 h, dann rückwärts, Grenzen 45 h/9 h,
  keine Feiertage) samt Ziehen im Prüfungskalender. Der Abgleich ist eine eigene Ansicht, das Offene eine Liste mit
  Stichtagen. Präsenz rot umrandet, Quizze als Lernen, Klausur-Fragestunde und Probeklausuren unter Prüfungen.
- Befund mit Silas' echten Blöcken: In den Vorlesungswochen ist kein Platz für den EINFWI-Test (40 h); das und das
  PROG1-Mehr (30 h) stehen als Entscheidung offen (docs/SILAS.md §8).

## 12.10.2026 — /silas: Probepläne, Gruppenwahl mit Abwählen, Mittag je Tag, Fahrzeit 45 min, einzelne Blöcke (V-0345)

- Silas ging den Planer von vorn durch. Neu: Probepläne unter /silas/1 … /9 (eigener Stand, der echte bleibt unberührt);
  in Schritt 2 bleibt eine Wahl dran, die anderen Gruppen stehen blass daneben, ein zweiter Klick wählt ab; Schritt 1
  zeigt keine Quizze mehr; die Reihe der Schritte 2–4 steht unter ihren Modulen.
- Die „kleine Lücke“ zwischen Fahrzeit und Termin war ein Klassenkonflikt (`reihe` an Kachel und Liste) — umbenannt,
  ein Test verhindert es künftig. Fahrzeit 45 min; die Mittagspause liegt nicht mehr in der Fahrt, nur in echten
  Wochen und lässt sich je Tag ziehen.
- Seltener als alle zwei Wochen gibt es kein Wochenmuster mehr: solche Blöcke legt man einzeln in echte Wochen, mit
  bekannten Terminen nur an den offenen Tagen.

## 11.10.2026 — /silas: Lernblöcke erst ab dem Stoff, Bezug zum Stoff beim Legen (V-0342)

- Silas prüfte seinen Plan vor dem ersten Unitag: Am Montag standen PROG1-Quicktests und EINFWI-Nachbereitung, obwohl
  PROG1 erst Donnerstag und EINFWI erst mit dem Kick-off am 19.10. beginnt. Ein Lernblock zählt jetzt erst ab dem
  ersten Stoff seines Moduls; neue Blöcke (auch Videoblöcke) beginnen dort, ältere bieten „Erst ab …“ an.
- Beim Legen sind die Plätze direkt nach dem Stoff gerahmt, ein belegter wird mit dem genannt, was dort liegt; Blöcke,
  die meist weit weg vom Stoff liegen, tragen eine Marke (docs/SILAS.md §2.5 6a/6b, §3).

## 11.10.2026 — /silas: Wochenend-Pakete, Tagessäulen, Pastell, Fahrzeit nach Hause, Mittag (V-0340)

- Mit 2 h je Woche hätte die Vorbereitung vor Semesterbeginn anfangen müssen. Jetzt hat jede Prüfung zwei feste
  Wochenenden davor (je 10 h, Fr–So) und nur der Rest wird nach vorne gerechnet; die Pakete stehen in der Modulkachel,
  ihre Tage leuchten im Kalender, ein Tipp legt einen Lernblock, ein zweiter nimmt ihn heraus (docs/SILAS.md §3).
- Jeder Tag im Prüfungskalender ist eine Säule (9 h = voll). Die Minimap zeigt unter „Woche“ nur die Vorlesungszeit.
- Dunkler Modus in Pastell; Fahrzeit über den Kacheln (die Fahrt nach Hause war unter dem nächsten Block versteckt);
  45 min Mittagspause zum Erinnern.

## 11.10.2026 — Umbau-Hinweis; /silas: Prüfungen neu, Hauptreiter, Fahrzeit, dunkler Modus (V-0338)

- **stundenplanner.de** trägt über Plan und Start einen kleinen Hinweis (Silas): gebaut unter der Annahme, dass
  Semesterwochenstunden das Maß für den Aufwand sind und die Angaben aus MOSES stimmen — die Annahme ist widerlegt, der
  Stundenplanner wird umgebaut (DESIGN.md §3.1).
- /silas, Prüfungen: Zeitleiste mit einer Spur für alle Prüfungsarten und einem Vorlauf je Prüfung (bei 2 h je Woche),
  darunter alle Zeiträume aufklappbar mit allen Prüfungen, links die Prüfungen mit offenen Stunden; eine Prüfung wählen
  hebt sie und ihre Übungszeit hervor und öffnet die Zeiträume (docs/SILAS.md §3).
- /silas: Woche und Prüfungen als Hauptreiter oben links; ein Klick ins Leere hebt die Auswahl auf; 40 min Fahrzeit vor
  dem ersten und nach dem letzten Termin vor Ort (nur gezeigt); dunkler Modus mit abgestimmten Farben, eigene Blöcke ohne
  Streifen.

## 11.10.2026 — /silas: Prüfungen mit Semester-Zeitleiste und Vorbereitung in der Vorlesungszeit (V-0337)

- Silas sah im Reiter Prüfungen nicht, wann E-Test 1, E-Test 2 und der Online-Test sind. Oben steht jetzt die
  Zeitleiste des ganzen Semesters mit den Phasen und je einer Spur für Klausuren, E-Tests und Online-/schriftliche
  Tests; die vorlesungsfreien Abschnitte führen zu ihrem Kalender (docs/SILAS.md §3).
- „Vorlesungszeit öffnen“: das Raster mit gesperrtem Stundenplan, sieben Tage, 7–22 Uhr; Prüfungsvorbereitung wird
  abgelegt — in der Standardwoche jede Woche bis zum Tag vor der Prüfung, in einer echten Woche einmal.

## 11.10.2026 — /silas: Wochenlast geprüft, hellgrau, einklappen, kurz zurück (V-0336)

- Silas' festgelegter Plan zeigte 9 / 8,5 / 8,25 / 8 / 8 h je Tag. Geprüft: Die Standardwoche zählte Blöcke „alle n
  Wochen“ und Reihen so, als lägen sie jede Woche (41,75 h); im Mittel der 16 echten Vorlesungswochen belegt der Plan
  37,2 h. Verlangt sind laut Modulbeschreibungen 41,8 h je Vorlesungswoche (627 von 900 h; 273 h sind
  Prüfungsvorbereitung). Zu viel geplant waren gut 60 h: PROG1 VL/Übung zweimal je Woche (+34 h, Silas entscheidet),
  BuK-Videos zwei Blöcke (+10 h) und jede Vorgabe 16 statt 15 Wochen (+2 h je Teil) — die Vorgabe endet jetzt eine
  Woche früher, die Standardwoche zeigt das echte Mittel.
- Im selben Schritt Gewähltes ist hellgrau, frühere Schritte dunkelgrau; fertige Module klappen ein (grüner Haken,
  „ändern“); ein Klick auf etwas aus einem früheren Schritt springt kurz dorthin zurück und danach von selbst wieder
  vor (docs/SILAS.md §3).

## 11.10.2026 — /silas: geführt eine Sache nach der anderen, Blöcke an der Maus (V-0335)

- Silas konnte in Schritt 3 auf keinem Gerät Blöcke zeichnen: Ein `const fertig` im Zeiger-Handler verdeckte das neue
  `fertig()` aus V-0334, jeder Zeigerdruck brach ab. Repariert, kommentiert, und ein Test verbietet jetzt innere Namen,
  die einen Helfer der obersten Ebene verdecken.
- Statt zeichnen: Je Bestandteil eine Vorgabe je Woche (Video: Soll ÷ Videowochen, höchstens der Videobedarf; EVL:
  1,5–2-h-Blöcke, k je Woche oder alle n Wochen) — „Block legen“ hängt ihn an den Zeiger, freie Plätze sind grün
  (in Schritt 4 kräftig zwischen 10 und 18 Uhr), ein Klick legt ihn ab (docs/SILAS.md §2.8a, §3, §4).
- Schritt 2–4 führen von oben nach unten: oben links die Reihe des Schritts (wie viele Gruppen vorhanden, was gewählt
  oder gelegt ist), dran ist immer genau eine Sache.

## 11.10.2026 — /silas: Schritt für Schritt, festlegen, Prüfungen danach (V-0334)

- Silas zu V-0333: Schritt 1 soll wirklich nur die Grundlage zeigen; in jedem weiteren Schritt ist alles Frühere grau
  und Späteres unsichtbar; in Schritt 2 zeigt ein Klick auf Modul oder Bestandteil nur dessen Gruppen, nicht gewählte
  verblassen anders als das Graue; links je Modul „1 von 2 gewählt“. Am Ende „Stundenplan festlegen“ — erst dann ist
  alles farbig —, „Bearbeiten“ springt zurück und behält die Auswahl (docs/SILAS.md §2.8a, §3).
- Prüfungen, ihre Anmeldungen und die Prüfungsvorbereitung sind kein Schritt mehr, sondern kommen nach dem Festlegen
  (Reiter „Prüfungen“, Silas: „ab Mitte des Semesters“).
- Silas' Plan beginnt neu ohne Auswahl: Zurücksetzen löscht nichts mehr, es legt beiseite (`plan.zurueckgesetzt`,
  „Wiederherstellen“). Seine zwei Gruppen und 12 Blöcke aus dem alten Semesterplan liegen dort.

## 11.10.2026 — /silas als geführter Ablauf in vier Schritten (V-0333)

- Silas: Der Planer soll durch genau die Entscheidungen führen, die er selbst trifft, in Schichten — Grundlage (feste
  Präsenz, Prüfungen, Quizze), Gruppen, Videos, EVL —, ohne Vorschläge, mit Zurückspringen und einem Zurücksetzen auf
  die Grundlage. Jede Kachel trägt ihr Etikett (Präsenz, Video, EVL) und wie oft sie bis zum Semesterende noch kommt
  (docs/SILAS.md §2.8a, §3).
- Präsenz und gewählte Gruppen sind gesperrt: Auf sie lässt sich kein Block legen; ein Block, der durch eine spätere
  Gruppenwahl darauf landet, ist hellblau „verschieben“ (§2.5 Regel 5). Der Lernplan-Vorschlag ist entfernt.
- Zweimal schrieb die Seite „null“ als Text (`replaceChildren` mit leerem Kind): Jedes Ersetzen geht jetzt durch
  `fuellen()`, ein Test hält das so.

## 11.10.2026 — /silas, Rückmeldung 2: Stufen, Farben nach Art, Wochenbedarf (V-0332)

- Silas: Man wird „erschlagen von roten Fehlermeldungen“, „du musst noch was eintragen“ war so rot wie ein Fehler, die
  Farbcodes waren unklar. Jetzt vier Stufen (docs/SILAS.md §2.6): rot kritisch, orange Achtung, hellblau „du bist dran“,
  grau „kommt noch“, „später“ oder Hinweis — nach Datum, Phase und Stand der Prüfung; Abweichungen bis ±2 h schweigen.
- Wahltermine weiß gestrichelt, gewählte weiß durchgezogen; Farben nach Art statt nach Modul; unter dem Raster, was
  diese Woche dran wäre, aber nicht im Plan ist; links „Ganzes Semester | Diese Woche“; Prüfungsteile nur in der
  vorlesungsfreien Zeit. Danach alle 16 Vorlesungswochen durchgesehen: Video-Bedarf in der Woche des Blocks,
  Ausweichtermine über dem Raster, Freigaben zusammengefasst.
- Silas' 29 Screencast-Längen für STAT1 eingetragen. `ops/silas.mjs senden` sendet jetzt auf der geholten Version
  (vorher hätte es eine gleichzeitige Änderung von Silas überschrieben).

## 11.10.2026 — /silas, Rückmeldung 1: Herkunft, Minimap, vorlesungsfreie Zeit, ISIS-Daten (V-0328)

- Silas' erster Blick: Woher kommt jede Zahl, was sagt Bologna, jedes Video ist anders lang, die Auswahl soll rechts
  aufleuchten, rechts eine Minimap des ganzen Semesters, die Bilanz soll das Zuviel abziehen, Annahmen und Warnungen an
  einem Ort zum Ändern, Vorlesungszeit und vorlesungsfreie Zeit unterscheiden. Alles gebaut (docs/SILAS.md §2.5–§3).
- Silas hatte alle fünf ISIS-Kurse heruntergeladen. Je Modul las ein Agent den Export, prüfte jede Angabe und trug
  nach, was es gibt; was ISIS noch nicht nennt, bleibt rot. Ihre Funde zum Format (Einheiten ohne Datum, Abgaben im
  Fenster, Anmeldungen an Gruppen, Wahl zwischen Prüfungsterminen, Prüfungsüberschneidung) sind ins Modell eingegangen.
  Nichts davon wurde bei der TU abgerufen; der Export liegt nur privat auf dem NAS.

## 11.10.2026 — /silas: der Semesterplaner nach Leistungspunkten (V-0321)

- Silas, nach einem Gespräch mit dem Fachbereich: Seit Bologna zählt nicht die SWS, sondern der Aufwand in
  Leistungspunkten (1 LP = 30 h). Der Stundenplaner „so wie er jetzt existiert“ ergibt dafür keinen Sinn. Unter
  `stundenplanner.de/silas`, erst nur für ihn, ein Planer mit neuer Logik: Jede Stunde der Aufwandstabellen soll
  einen festen Platz im Kalender haben — Termine, gewählte Gruppen, eigene Blöcke für Videos, Labs, Vor- und
  Nachbereitung und Klausurvorbereitung. Rot, was an Information fehlt oder nicht geplant ist; rechts das
  Unregelmäßige als Muster über das Semester. Das Modell steht in docs/SILAS.md.
- Privat, weil das Repo öffentlich ist: Silas' Semester (ISIS-Angaben, seine Wahl) liegt nur im KV-Speicher hinter
  `/silas/api`, mit Schlüssel — die erste Funktion mit Speicher. Das Study OS soll später von dort lesen; die
  Richtung ist nur Study OS → Stundenplanner (AGENTS.md §2 ④ um diese Brücke ergänzt).
- Die Daten kamen aus Silas' Übergabe im Studienordner (Semesterplan & Checkliste, Stand 11.10.) und den
  Aufwandstabellen der fünf Modulbeschreibungen; nichts wurde bei der TU abgerufen.

## 06.10.2026 — Kalender-Abo „Stundenplan“ (V-0271)

- Silas: „dass man beim ‚in eigenen Kalender übernehmen‘ ein neuer Kalender namens Stundenplan angelegt
  wird. So landet es nicht im privaten Kalender.“ Eine Datei kann das am iPhone nicht; ein Abo kann es.
  Silas entschied sich für das Abo über eine kleine Cloudflare-Funktion (die erste der Seite, ohne
  Speicher). Der Kalender „Stundenplan“ holt Änderungen aus MOSES von selbst; die Datei bleibt als
  Rückfall. Datenschutz um das Abo ergänzt.

## 06.10.2026 — Kalender-Export am iPhone (V-0270)

- Silas am iPhone: „In eigenen Kalender exportieren“ zeigte die Meldung, aber es kam weder Datei noch
  Kalender-Vorschau. Ursache: Seit iOS 26.6 verweigert Safari `data:text/calendar` still
  (add-to-calendar-button #823, #834); genau so lieferte die Seite die Datei am iPhone aus (V-0231).
- Jetzt ist der Knopf ein echter Link auf eine `blob:`-Adresse (`ics.mjs` `icsLink`), den der Finger
  selbst antippt, auf jedem Gerät. Ein Test hält fest, dass `ics.mjs` keine `data:`-Adresse mehr baut.

## 05.10.2026 abends — Favicon und App-Symbol „sp“ (V-0254)

- Silas wählte aus fünf Entwürfen „Schwer und leicht“: „s“ in Sora 800, „p“ leicht, „komplett mittig und
  zentriert“, im dunklen Schema auf tiefem Schwarz. Ersetzt die fünf bunten Kacheln.

## 05.10.2026 abends — Der fertige Plan als Bild vor Kalender und Speichern (V-0253)

- Silas: „nicht gleich der Download …, sondern der finale fertige Stundenplan … 75 % des Fullscreens …
  Hintergrund gedimmt“. „In Kalender übernehmen“ und „Stundenplan speichern“ öffnen jetzt einen großen
  Dialog mit dem Plan als Bild (nur das Eingeplante, ohne Knöpfe), darunter „In eigenen Kalender
  exportieren“ bzw. der Link. Neues Modul `web/bild.mjs`, lädt erst bei Bedarf.

## 05.10.2026 abends — Silas klickt sich durch (V-0251)

- **Pfeiltasten-Tipp:** Silas hatte ihn nie gesehen (90 s nach dem ersten Filter, nach 12 s weg). Jetzt
  eine Minute nach dem Plan, er bleibt bis zum X; geschlossen kommt er nicht wieder
  (`stundenplanner:v1:tipp`, in der Datenschutzerklärung).
- **← → wirken immer:** Nach einem Klick auf eine Kachel hielten die offene Karte und der Fokus im
  Raster die Pfeile fest. Jetzt schließt sich die Karte, und der Schritt geschieht; Kachel zu Kachel
  nur nach Tab.
- **Startbildschirm:** Block mittig, Schriftzug höher, die Wahl des Fachsemesters öffnet den Plan
  („Stundenplan öffnen“ entfällt).
- **Heller Modus:** Silas sah ihn zum ersten Mal: eingeplante Termine „hässlich … matschig dunkel“.
  Jetzt Pastell wie die Formate links, Vorschläge heller; der dunkle Modus ist pixelgleich (eigene
  Tokens je Schema).
- **Ausgegraut:** Schrift und Plus der übrigen Gruppen verlieren Deckkraft. **Modul-Infos** ist ein
  Info-Symbol in der aufgeschlagenen Modulkachel. **Legende** links: Formate übereinander.

## 05.10.2026 abends — Der Schriftzug in Sora (V-0250)

- Silas: „Sora 2 Gewichte. Mit Stunden schwer, Planner leicht, Name zerfällt in seine zwei Worte ohne
  Leerzeichen.“ Der Schriftzug ist jetzt „stundenplanner“ in Sora 800 und 300 als Pfad, gesetzt aus der
  variablen Schrift (SIL OFL). Er löst Barlow Condensed ab (V-0248, am selben Tag gewählt).

## 05.10.2026 — Silas' dritter Blick: Schriftzug, Startbildschirm, Luft (V-0243)

- Silas: Bis der API-Token da ist, ändert sich am Umfang nichts; jetzt zählt, dass die Bedienung
  „wirklich komplett streamlined und schön“ wird.
- **Marke entschieden:** kein Zeichen, nur der Schriftzug „stundenplanner“ in Rubik 600 als Pfad
  (aus V-0239, Entwurf B), mittig in der Kopfzeile. Die drei Zeichen-Entwürfe entfallen.
- **Startbildschirm neu:** oben der Schriftzug, eine schlanke Fortschrittslinie, dann nur Hochschule
  (Karte im Rot der TU, `farbe` im Katalog, ohne Logo), Studiengang, Fachsemester, „Stundenplan
  öffnen“. Leiste unten, Zusammenfassung, „Weitere folgen“ und „Zurück“ sind weg.
- **Plan:** Legende klein links unter den Modulen, mehr Abstand überall, MOSES im Hinweis als Link,
  der Fuß blasser, „Teilen“ heißt „Stundenplan speichern“. Gemessen in zehn Fenstergrößen von 360 bis
  1920 px, hell und dunkel (`ops/sicht.py` grün).

## 05.10.2026 — Keine Zugriffe auf die TU mehr ohne Silas' Genehmigung (V-0241, V-0242)

- innoCampus (TU Berlin) antwortete auf Silas' Anfrage: Eine REST-API mit Token gibt es, das Abrufen der
  Weboberfläche wird „gar nicht gerne gesehen“, auffällige Adressen werden gesperrt. Beim Nachsehen zeigte
  sich: Agenten hatten beim Bauen am 4. und 5.10. einige tausend MOSES-Seiten abgerufen, und jede
  Auslieferung fuhr einen Abruf mehr. Silas wusste davon nicht.
- V-0241: Eine Auslieferung fragt MOSES nicht mehr, nur der tägliche Lauf um 05:20.
- V-0242: **Silas: „Ab jetzt sind keine Zugriffe mehr auf das TU-System erlaubt, solange ich es nicht
  ausdrücklich genehmigt habe.“** Regel AGENTS.md §2 ⑦, ein Hinweis oben in jeder Anleitung, und eine
  Sperre im Code (`abruf/zugang.py`): MOSES und LSF fragen nur mit der Genehmigung, die allein der
  tägliche Lauf trägt. Wer mehr braucht, nennt Silas Umfang, Maßnahmen gegen Last und Grund.

## 05.10.2026 — Der Brief für den One-Pager und drei Entscheidungen

- `docs/DESIGN.md` (leitwerk, V-0218) misst das Vorbild: 4 bis 8 Bildschirme hoch, das Raster beginnt
  überall unter dem sichtbaren Bereich, 13 „+N weitere“ verstecken 15 der 65 Gruppen. Der Brief legt die
  geschlossene Menge an Entscheidungen fest: eine Seite, die das Fenster füllt und nicht scrollt, eine
  Modulleiste statt Modulkarten, jede Gruppe als eigene Kachel in Spuren, Farbe nur mit Bedeutung.
- Silas entscheidet die offenen Fragen des Briefs: keine Markenfarbe; Start mit „Noch offen“, das Gewählte
  bleibt sichtbar; gewählt wird direkt auf breiten Kacheln und über die Gruppenkarte auf schmalen Kacheln
  und am Handy, nah an der heutigen Bedienung.
- Der Neubau gehört noch vor den Start (E11 im Scope). Gemessen wird er mit `ops/sicht.py`, nicht mit
  Augenmaß.

## 05.10.2026 — Der Nachbau steht, der Betrieb zieht um (P-0006)

- **Viele Agenten zugleich (Silas):** Der Leit-Agent legt das Programm P-0006 im TOWER an (sieben Phasen,
  jeder Schritt ein Punkt) und das Gerüst `docs/ARCHITEKTUR.md` als Vertrag zwischen den Teilen. Danach
  bauen fünf Agenten parallel: Abruf, Lesemodell, Seite, Betrieb, Design-Brief.
- **Gleich wie im Study OS:** Abruf und Lesemodell liefern für alle fünf Module von WI im 1. Semester
  dieselben Daten wie der Stundenplan des Study OS, Gruppe für Gruppe: 11 Bestandteile, 65 Gruppen,
  949 Einzeltermine. Die Seite ist funktionsgleich nachgebaut, die Auswahl bleibt im Browser.
- **Statistik I:** MOSES führt im Tutorium eine Gruppe mit einer Buchung, die „SoSe 2026“ trägt. Die
  strenge Prüfung verwarf deshalb das ganze Modul, im Study OS schon seit dem 29.09. Jetzt wird eine
  Gruppe, deren Buchungen alle ein anderes Semester tragen, ausgelassen und vermerkt (`ausgelassen`).
  Gemischte Gruppen bleiben ein Fehler. Der Fund ging als Punkt an das Airfield `studyos`.
- **Hosting (Silas' Recherche):** Der NAS crawlt in einem eigenen Container, Cloudflare Pages liefert
  aus. GitHub Pages fällt weg, weil es ein „online business“ verbietet. Silas kauft `stundenplanner.de`.
  Die Auswahl im Browser folgt der Orientierungshilfe der Datenschutzkonferenz: erst nach der ersten
  Wahl gespeichert, nur Kennungen, zurücksetzbar, deshalb ohne Einwilligungsbanner.

## 04.10.2026 — Der Scope steht (V-0210)

Silas entscheidet die Fragen von sichter (E1–E5, E9) und anflug (E6–E8), festgehalten in
[`docs/SCOPE.md`](docs/SCOPE.md). Das Wichtigste:

- **Erste Fassung vor dem Vorlesungsbeginn am 12.10.2026**, für die WI-Erstis im 1. Semester. Die
  Studiengangswahl ist eingebaut. Dieses Semester ist zum Testen und Datensammeln da, richtig
  gemacht wird es für den nächsten Jahrgang.
- **Eine Website ohne Konto**, Auswahl im Browser, Teilen-Link. Ein Konto kommt vielleicht
  später, freiwillig. Eine App ist eher langfristig.
- **Eigener Abruf statt des Study-OS-Abrufs:** Silas will nicht, dass vom bestehenden System
  etwas Persönliches mitkommt. Der Abruf läuft öffentlich auf GitHub, und es gibt keinen
  Endpunkt mit Schlüssel. Silas hatte einen vorgeschlagen, aber ein Weg ganz ohne Rückkanal ist
  einfacher und sicherer.
- **Anonym mitzählen**, kurz nach dem Start: Silas will das Verhalten der Nutzer kennenlernen.
- **Getrennt von allem anderen** (AGENTS.md §2 ④): eine eigene Infrastruktur, auch wenn sie
  im TOWER gebaut wird.
- Impressum mit Silas' Namen und Anschrift. Adresse zuerst
  `thalamus404.github.io/stundenplanner`, eine eigene Domain später.

## 04.10.2026 — Gründung

Silas legt das öffentliche Repo an („Create your Stundenplan faster, simpler and cleaner"). Am
selben Tag wird es das Airfield `stundenplanner` im TOWER: das erste Projekt dort, das öffentlich
benutzt werden soll.

- **Wofür:** Der Stundenplan aus dem Study OS (für einen Studenten und ein Semester gebaut)
  soll ein eigenständiges Werkzeug werden, das jeder im Netz benutzen kann. Anlass ist die
  Einführungswoche im Oktober 2026, in der viele gleichzeitig ihren ersten Stundenplan bauen.
- **Reihenfolge (Silas):** erst das Airfield, dann der Scope (was es können und abdecken soll),
  dann den Study-OS-Stundenplan so getreu wie möglich nachbauen und online stellen, dann
  verbessern, vor allem im Aussehen.
- **Bewusst offen:** die Lizenz („später entscheiden"). Bis dahin ist der Code öffentlich
  lesbar, aber nicht frei nutzbar. Ebenso offen: Geld. Erst Open Source, Werbung oder
  Ähnliches vielleicht später, wenn viele es benutzen.
- **Der Name:** `stundenplanner`. Das Repo hieß bei der Anlage `studenplanner` (ein
  Schreibfehler) und wurde vor der Gründung umbenannt. Der Schlüssel des Airfields ist
  unveränderlich.
