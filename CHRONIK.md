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
