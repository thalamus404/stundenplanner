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
was selbst gesetzt ist, darf man nie verwechseln. Die Seite zeichnet A und B gefüllt, D schraffiert.

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
| `video` | Silas' Blöcke — aber nur ab der Freigabe eines Videos und nur so viele, wie es Videos gibt | EINFWI-Lehrvideos (12, montags), BuK-Videos (freitags) |
| `selbst` | Silas' Blöcke; mit Einheiten (Quiz, Blatt) wie bei Videos, sonst jeder Block | Labs, Nachbereitung, ISIS-Quiz |
| `pruefung` | Silas' Blöcke vor dem Prüfungstermin | Klausurvorbereitung, Testvorbereitung |

### 2.5 Wie gezählt wird — jede Regel mit ihrem Grund

1. **c.t.-Termine belegen die Doppelstunde.** 16:15–17:45 zählt 2 h: Das Viertel davor und danach ist der Weg, die
   Kalenderzeit 16–18 ist blockiert, und die Modulbeschreibung rechnet 2 SWS als 2 h Präsenzzeit. Sonst wäre jede
   Präsenz ewig zu 75 % gedeckt. s.t.-Zeiten (10:00–11:00) zählen ihre echte Dauer.
2. **Ein Wochenblock gilt in jeder Vorlesungswoche**, nicht in der Pause (außer `pause: true`) und nicht in der
   Prüfungszeit; mit `ab`/`bis` nur in einem Zeitraum. Für die Prüfungszeit gibt es Datumsblöcke.
3. **Ein Video- oder Einheiten-Block zählt erst ab der Freigabe.** Die Blöcke eines Teils werden der Reihe nach den
   Einheiten zugeordnet (Video 1 dem ersten Block am oder nach seiner Freigabe …). Ein Block ohne Einheit (Woche 1, vor
   dem ersten Video) zählt nicht; ein Video ohne Block ist rot.
4. **Prüfungsvorbereitung zählt nur vor der Prüfung** (vor dem Erst-Termin). Ein Block am oder nach dem Prüfungstag
   zählt nicht und ist rot.
5. **Ein Termin schlägt einen Block.** Überlappt ein eigener Block an einem Tag einen Termin, verliert der Block die
   überlappte Zeit (gelber Hinweis am Teil). Der Termin bleibt, wie er ist. Gerechnet wird an den echten Tagen, nicht
   im Wochenraster: Eine Übungsgruppe, die nur an fünf Terminen stattfindet, stört die übrigen Wochen nicht.
6. **Zwei Termine übereinander sind ein Konflikt** (rot an beiden): Eine andere Gruppe wählen.
7. **Gedeckt ist je Teil höchstens sein Soll.** Zu viel bei den Labs gleicht zu wenig bei der Nachbereitung nicht aus:
   Modul und Semester zählen die Summe der gedeckten Stunden, das Mehr steht als gelber Hinweis daneben
   („34 h mehr als in der Modulbeschreibung“ — die PROG1-Präsenz hat zwei Termine je Woche statt 2 SWS).

### 2.6 Rot und gelb

Rot ist alles, was Silas noch tun muss — **Information fehlt** (ⓘ) oder **nicht im Plan** (⚠):

| Code | Stufe | Wann |
|---|---|---|
| `termine_offen` | Info | Präsenz ohne Termine, Wahl ohne Gruppen |
| `datum_offen`, `uhrzeit_offen` | Info | Prüfung ohne Datum oder ohne Uhrzeit |
| `laenge_offen`, `freigabe_offen`, `offen` | Info | Videolänge, Freigabetag, eine offene Angabe aus dem Angebot |
| `wahl_offen` | Plan | Gruppen da, keine gewählt |
| `ungeplant`, `luecke` | Plan | nichts oder zu wenig eingeplant; bei Präsenz mit allen Terminen: strukturell → umwidmen |
| `einheit_ohne_block`, `nach_pruefung`, `konflikt` | Plan | siehe §2.5 |
| `unsicher`, `hinweis`, `aufteilung`, `ueber`, `weicht`, `leer` | Hinweis (gelb) | prüfen, aber kein Fehler |

Ein Teil ist rot, sobald er eine Info- oder Plan-Flagge hat; ein Modul, sobald einer seiner Teile rot ist. Der Kopf
zählt die roten Teile („12 offen“), ein Klick springt zum ersten.

### 2.7 Umwidmung

Die EINFWI-Übung hat 30 h Präsenzzeit, findet aber nur 5× statt: 20 h können dort nie stattfinden. Sie gehören
trotzdem zum Modul. Silas' Semesterplan sagt, wohin: „die freie Zeit gehört in die Testvorbereitung“. Eine
Umwidmung `{von, nach, h}` nimmt das Soll beim einen Teil weg und gibt es dem anderen; die 180 h bleiben. Die Seite
bietet sie an, wenn eine Lücke strukturell ist (alle Termine bekannt, Gruppe gewählt).

### 2.8 Vorschläge

- **Videoblock:** Videolänge + 15 min Puffer, auf 30 min aufgerundet (Silas: „1:45 Video → 2 h einplanen“). Ist die
  Länge unbekannt, nimmt das Angebot eine Annahme (`annahme_min`, 90 min für eine 2-SWS-Vorlesung) und der Teil bleibt
  rot, bis die echte Länge eingetragen ist.
- **Lernplan vor einer Prüfung** (`lernplanVorschlag`): rückwärts ab dem Tag vor dem Tag vor der Prüfung — der Tag
  direkt davor bleibt als Puffer frei —, je Tag die größte freie Lücke im Lernfenster 09–19 Uhr, höchstens ein
  Lerntag (6 h, Faustregel aus Silas' Semesterplan: Stunden ÷ 6 = Lerntage), Sonntage frei, bis die fehlenden
  Stunden gedeckt sind. Er erscheint gestrichelt in den echten Wochen; erst „Übernehmen“ legt Datumsblöcke an
  (`lernplan: true`, gemeinsam wieder entfernbar).

## 3. Die Seite

- **Kopf:** Semester, die Bilanz („600 h von 900 h“, Balken) und die Zahl der roten Teile; der Speicherstand;
  „Kalender“ (die Abos, §6).
- **Links, die Module:** je Modul LP, eingeplant von Soll, darunter jeder Teil mit Art (Termin, Gruppen, Video,
  Lernen, Prüfung), Form („Do 16:15–17:45 · A 151“, „Wahl · 12 Gruppen“), Stand (32/30 h) und der roten Zeile, was
  fehlt. Ein Klick klappt die Karte des Teils auf: alle Flaggen, Soll und Ist, und was man tun kann — Gruppe wählen
  (die Gruppen stehen gestrichelt im Raster, mit „14× belegt“, wenn sie mit dem Plan kollidieren), Block setzen,
  Lernplan vorschlagen, umwidmen, fehlende Angaben eintragen (Termine, Gruppen, Prüfungstermin, Videolänge,
  Ausfälle). Ein Klick auf den Modulnamen zeigt die Aufwandstabelle neben dem, was davon eingeplant ist.
- **Mitte, die Woche:** die **Standardwoche** (was jede Vorlesungswoche wiederkehrt; Reihen an ihrem typischen Platz
  mit „nur 7× — nächster 13.11.“; ein Wochenblock zeigt „12/16“, wenn er nicht jede Woche zählt) oder eine **echte
  Woche** (W01 … P8, mit Datum, Ganztägigem oben: Fristen, Prüfungen, Video-Freigaben). Im Raster ziehen setzt einen
  Block (Standardwoche: jede Woche; echte Woche: fragt „nur am … / jeden …“); Blöcke lassen sich verschieben, an der
  Unterkante verlängern, anklicken zum Bearbeiten. ← → wechselt die Woche, ⌘Z macht rückgängig, Esc schließt.
- **Rechts, das Unregelmäßige:** ein **Muster** über alle Wochen des Semesters — je Modul eine Zeile für jede Reihe,
  die Video-Freigaben, Lernplan-Tage, Prüfungen und Fristen; ein Klick auf eine Woche zeigt sie — und darunter die
  **Chronik**: alles Unregelmäßige nach Wochen, ab heute (Serien stehen in der Standardwoche, nicht hier).
- **Am Telefon** liegt alles untereinander, das Raster scrollt seitlich; ein Tipp legt einen Block mit Standardlänge an.

## 4. Stellschrauben (`REGELN` in `modell.mjs`, im Angebot unter `regeln` überschreibbar)

| Regel | Wert | Grund |
|---|---|---|
| `lp_h` | 30 | AllgStuPO § 45 Abs. 2 |
| `video_puffer_min`, `raster_min` | 15, 30 | Silas: 1:45 → 2 h |
| `lerntag_h`, `lernfenster` | 6, 09–19 | Faustregel aus dem Semesterplan |
| `toleranz_min` | 15 | darunter gilt eine Lücke als gedeckt |
| `pendeln_min` | 45 | steht im Angebot; die Seite zeichnet es noch nicht (§8) |

## 5. Das Datenformat

Ein **Stand** ist ein JSON-Dokument `{schema: 1, version, geaendert, angebot, plan}`.

- **`angebot`** — was es gibt: `semester {id, titel, vorlesung {von, bis}, frei [{von, bis}], ende, studiengang,
  fachsemester}`, `regeln`, `module [{id, nr, titel, kurz, lp, farbe 1–8, posten [{id, lv, titel, mult, h}],
  teile [{id, titel, art, posten, soll_h?, termine?, optionen? [{id, label, termine}], wahl?, einheiten?
  {liste? [{nr, ab, titel}], takt? {tag, von, bis}, laenge_min?, annahme_min?, offen?}, pruefung?, offen?, unsicher?,
  hinweis?, ort?, online?}], pruefungen [{id, titel, dauer_min, termine [{datum, start?, ende?, ort?, label}]}],
  notizen [], links {}}]`, `termine [{id, modul?, art: frist|info|rahmen, datum, bis?, start?, ende?, titel, ort?,
  wichtig?, unsicher?}]`.
- **`plan`** — was Silas entschieden hat: `wahl {teil: option}`, `bloecke [{id, teil|null, tag | datum, start,
  ende, ab?, bis?, pause?, titel?, lernplan?}]`, `umwidmungen [{id, von, nach, h}]`.
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

- Die echten Daten nachtragen, sobald ISIS sie nennt: STAT1-Tutorien und die Freitage der Präsenz, TECHGI-Übungsgruppen
  und Quiz-Fristen, PROG1-Tutorials und -Labs, BuK-Prüfungstermine, Klausurtermine STAT1 und PROG1, Videolängen.
- Pendeln (45 min vor dem ersten und nach dem letzten Campustermin eines Tages) als eigene Schicht zeichnen.
- Das Study OS liest `/silas/api/ereignisse` (Vorgang im Airfield studyos).
- Ob der Planer für alle kommt, entscheidet Silas; das Modell ist dafür schon allgemein.
