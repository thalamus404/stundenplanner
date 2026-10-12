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
| `web/silas/grund.mjs` | Zeit, Semester, Termin-Muster, Einheiten, Prüfungstermine, Stellschrauben (`REGELN`) |
| `web/silas/modell.mjs` | die Vorkommen (jeder Termin, Block, jede Prüfung und Frist mit Datum) und die Hilfen der Seite; reicht `grund.mjs` und `kontingent.mjs` weiter (`M.*`) |
| `web/silas/kontingent.mjs` | das Kontingent-Modell (V-0349): Lebenslauf, Posten und Töpfe, Baum, Wochenwert, Prüfungen, Last, Vorschlag, Abgleich, Offenes |
| `web/silas/silas.mjs`, `index.html`, `silas.css` | die Seite |
| `web/silas/kalender.mjs` | die Ereignisse als iCalendar (zwei Abos) |
| `functions/silas/api/[[pfad]].js` | der private Speicher (Cloudflare Pages Function mit KV) |
| `ops/silas.mjs` | prüfen, holen, senden, einrichten — von der Werkbank |
| `web/tests/silas.test.mjs`, `web/tests/kontingent.test.mjs` | Modell, Kalender, Speicher; das Kontingent-Modell je Regel (mit erfundenen Daten) |

Alles rein: kein DOM, kein Netz, keine Uhr außer der übergebenen (`heute`, `jetzt_min`) — Seite und Server rechnen
dasselbe.

---

## 1. Die Grundidee: Kontingent statt SWS

- **1 LP = 30 Zeitstunden** (AllgStuPO § 45 Abs. 2). Ein Modul mit 6 LP sind 180 h, ein Semester mit 30 LP 900 h —
  das ist fest. Ob man die Stunden arbeitet, prüft niemand; verbindlich sind die Fristen (§ 63).
- Jede Modulbeschreibung zerlegt die 180 h in **Posten** („Präsenzzeit 15 × 2 h“, „Prüfungsvorbereitung 1 × 60 h“). Diese
  Aufteilung ist eine **Schätzung** des Lehrstuhls (KMK 2004: der Arbeitsaufwand wird „angenommen“; Berlin verlangt,
  dass er „validiert“ wird, BlnStudAkkV § 12 Abs. 5 Nr. 3) — hier der Prüfmaßstab, keine Regel.
- Silas, 12.10.2026, nach einer Rechnung, die keinen Sinn ergab (120/120/162/90/140 h bei je 6 LP): *„Ganz allgemein
  muss man das, glaube ich, mit einer Art Kontingent rechnen … dann wird geguckt, ist das an einen Präsenztermin oder an
  einen sonst fest geplanten Pflichttermin gelegt … und dann kommt eben diese Logik von: weiß man, wann es stattfindet?
  … die müssen weiterhin offen sein, aber nicht als ein Fehler, sondern als: hey, übrigens, halt die Augen und Ohren
  offen.“* Daraus wurde das Kontingent-Modell (Fassung 4 vom 12.10., mit Silas' Entscheidungen und drei Prüfungen
  durch einen zweiten Agenten): Jeder Posten ist ein **Kontingent**; Termine gehen vor; verteilt wird nur
  Selbststudium; was einer Prüfung dient, wird unter „Prüfungen“ geplant; ein Abgleich prüft nur.
- SWS kommen in der Rechnung nicht vor, außer in einer Regel: Ein c.t.-Termin belegt seine Doppelstunde (§2.5).

## 2. Das Modell

### 2.0 Die Grundsätze (Fassung 4)

| | Grundsatz |
|---|---|
| G1 | **Modul = LP × 30 h**, fest. |
| G2 | **Topf nach Zweck.** Was einer Prüfung dient — Prüfungsvorbereitung, Lernzielkontrollen, Probeklausur, Klausur-Fragestunde, die Prüfung selbst —, gehört in den **Prüfungs-Topf** und wird unter „Prüfungen“ geplant; alles andere in den **Semester-Topf** („Woche“). |
| G3 | **Woche nach Fenster.** Jedes Element liegt, wo sein Termin oder Fenster liegt; die Woche zeigt auch Prüfungslernen. Topf und Woche werden nie vermischt. |
| G4 | **Termine zuerst.** Was ISIS an Terminen nennt, gilt. Verteilt wird nur Selbststudium: was nach Terminen und Einheiten übrig ist. |
| G5 | **Rest umbuchen.** Liegt ein Präsenz-Posten jenseits der Toleranz unter seinem Kontingent, geht der Rest in die Vorbereitung der Hauptprüfung des Moduls („aus der Übung“). Reste innerhalb der Toleranz bleiben und zählen im Modul-Abgleich. |
| G6 | **Unbestätigt ist nicht erledigt.** Vergangenes bekommt ✓ oder ✗ (`plan.ist`); abgebucht wird erst nach ✓. |
| G7 | **Verweise statt Daten.** Was an einer offenen Wahl hängt (Fenster, Fristen), rechnet mit dem frühesten Termin als Arbeitsannahme und wandert mit, wenn gewählt ist. |
| G8 | **Kapazität:** 45 h je Woche, 9 h je Tag, alles eingerechnet (Silas' Grenze). |
| G9 | **Horizont** bis zum spätesten Rückfalltermin (`semester.ende`). Eine Wiederholung hat ein eigenes Kontingent außerhalb der 180 h. |
| G10 | **Vorrang der Prüfung.** Ist etwas zugleich Termin und Prüfungselement, gelten die Zustände der Prüfung: Eine verpasste Klausur ist „nicht bestanden“ (§ 63 Abs. 8), keine Nacharbeit. |

### 2.1 Begriffe

| Begriff | Was | Woher |
|---|---|---|
| **Semester** | Vorlesungszeit, Pausen (`frei`), Schließung der Gebäude (`geschlossen`), Ende des Planungszeitraums | Angebot |
| **Woche** | Montag bis Sonntag; Vorlesungswochen heißen W01 … W16, dazu „Pause“ und P1, P2 … (Prüfungszeit) | gerechnet |
| **Modul** | Nummer, Titel, LP, die Posten, die Elemente, die Prüfungen, `portfolio {bestehen, gesamt}` | Modulbeschreibung |
| **Posten** | eine Zeile der Aufwandstabelle: Multiplikator × Stunden = sein **Kontingent**; Art (Präsenz, Selbststudium, Prüfung) und Topf ergeben sich aus seinen Elementen | Modulbeschreibung |
| **Element** (Teil) | eine Veranstaltung oder Leistung: VL, Übung, Tutorium, Videos, Quiz, Nachbereitung, Labs, Vorbereitung — sie zählt zu einem Posten (`posten`) oder als Termin zum Prüfungs-Topf (`topf: 'pruefung'`) | Angebot |
| **Muster** | wann ein Termin stattfindet: Serie, Reihe oder Einzeltermin (§2.3) | ISIS, von Hand |
| **Option** | eine Gruppe eines Wahl-Elements (z. B. Übung G4), mit eigenem Muster | ISIS, von Hand |
| **Einheit** | ein Video, ein Quiz, eine Abgabe, eine „Vorbereitung auf …“ — mit eigenem Fenster [ab, bis] und einer Dauer | Angebot |
| **Prüfung** | Klausur, Test, E-Test, Portfolio-Teil — mit Terminen, Stand (§ 63), Fristen, Punkten | ISIS, Modulbeschreibung |
| **Block** | Silas' eigene Zeit: wöchentlich (jeden Di 14–17) oder an einem Datum | Plan |
| **Vorkommen** | jedes konkrete Ereignis mit Datum und Lebenslauf (✓/✗/…) | gerechnet |
| **Schicht** | A Fixtermin · B gewählte Gruppe · C Frist/Einzeltermin · D eigener Block · R Semesterrahmen | gerechnet |

### 2.2 Kontingent je Posten

Für jeden Posten (`erg.posten`): sein Kontingent K = mult × h. Seine Elemente tragen daraus:

| Element (`el`) | Was es trägt | Beispiel |
|---|---|---|
| `termin` | die Stunden seiner Termine (ohne Ausfälle); gewünschte Gruppe ohne Zuteilung als `annahme_min`; ohne Termine `erwartet` (Anzahl × 2 h, Annahme) | STAT1-IV: 15 Freitage = 30 h |
| `einheiten` | die Dauer seiner Einheiten: Videos je Woche Länge + Puffer aufs Raster, sonst `einheiten.dauer_min` × Anzahl | STAT1-Screencasts 23,5 h; TECHGI-Quiz 15 × 1 h; PROG1-Quicktests 12 × 0,5 h |
| `rest` | was vom Posten übrig ist (bei mehreren nach `soll_h`, sonst gleich) — das Selbststudium, das auf die Wochen verteilt wird | PROG1-VL-Nachbereitung 19,5 − 6 = 13,5 h |
| `vorbereitung` | Prüfungs-Topf, Fenster bis zur Prüfung; ein Posten für mehrere Prüfungen wird geteilt (`soll_h`, sonst gleich) | BuK-Lernzielkontrollen 5 h = 2,5 h je E-Test |
| `pruefungstermin` | Termin im Prüfungs-Topf; zählt zum Kontingent seiner Prüfung | EINFWI-Fragestunde, BuK-Probeklausuren |

**Die zwei Töpfe je Modul:** Prüfungs-Topf = die Prüfungs-Posten + die Reste nach G5; Semester-Topf = der Rest der
180 h. Silas' Semester (12.10.): 900 h = 595,5 h Semester + 304,5 h Prüfungen (268 h aus den Tabellen, dazu STAT1 6,5 h
aus der IV und 6 h aus dem Tutorium, EINFWI 20 h aus der Übung, BuK 4 h aus dem Tutorium).

**„Vorbereitung auf …“** (unregelmäßige Termine): Ein Element mit `vorbereitung_auf: <element>` hat je Termin dieses
Elements eine Einheit, Fenster vom vorigen Termin bis zu diesem — die Daten kommen aus der gewählten oder gewünschten
Gruppe (ein Verweis, G7). EINFWI: 5 Fallstudientexte à 2 h vor jeder Übung, aus der VL-Vor-/Nachbereitung (30 − 10 =
20 h Rest, 1,33 h je Woche).

### 2.3 Drei Terminformen und die Wahl

| Form | Beispiel | Im Angebot |
|---|---|---|
| **Serie** — wiederkehrend in einem Takt, mit Ausnahmen | TECHGI-VL jeden Do 16:15–17:45, außer 24.12. und 31.12. | `{typ:'serie', tag, start, ende, von, bis, ausser, alle}` |
| **Reihe** — feste Daten ohne Takt | BuK-Präsenz an 6 Freitagen; EINFWI-Übung an 5 Terminen je Gruppe | `{typ:'reihe', start, ende, daten:[{datum, titel}]}` |
| **Einzeltermin** — eine Reihe mit einem Datum | EINFWI-Kick-off am 19.10. | wie Reihe |

Eine Serie überspringt die vorlesungsfreie Zeit von selbst. Während die Gebäude geschlossen sind (`semester.geschlossen`,
TU 17.12.2026 22:00 bis 05.01.2027 06:00) fällt **Präsenz vor Ort** aus (`ausgefallen: 'geschlossen'`), Online-Termine
nicht (`nurOnline`). Ein **Wahl-Element** hat Optionen (Gruppen), jede mit eigenem Muster; Silas wählt eine.

### 2.4 Der Baum je Veranstaltung

Jedes Element läuft durch denselben Baum (`baum()` in kontingent.mjs):

1. **Gehört es zu einem Posten?** Ja: Kontingent wie oben. Nein: ein Termin im Prüfungs-Topf (Probeklausur) oder nur
   Kalender (Sprechstunde).
2. **Zeitbindung:** `termin` (Serie, Reihe, Einzeltermin), `fenster` (Video, Quiz, Nachbereitung, Vorbereitung — Silas
   legt es selbst) oder `unbekannt` (PROG1-Labs: Termine oder nur Fristen? — `zeitbindung: 'unbekannt'` im Angebot).
3. **Alternativen** (nur Termine): `fest` · `info_fehlt` (keine Termine oder keine Gruppen) · `wahl_offen` · mit
   Zuteilung (`zuteilung: true`, MOSES, Tutorienanmeldung) `zuteilung_offen`, nachdem Silas „Angemeldet“ gesagt hat
   (`plan.angemeldet`) · `gewaehlt` (ohne Zuteilung sofort, mit Zuteilung nach `plan.zugeteilt`) · `gescheitert`
   (Anmeldefrist vorbei ohne Anmeldung, oder `zugeteilt: 'keine'`). Silas, 12.10.: *„Wieso sind 10 h Übung schon
   verplant? Ich habe doch noch gar keinen Termin zugewiesen bekommen.“* — eine gewünschte Gruppe ohne Zuteilung steht als
   Arbeitsannahme im Plan und sperrt, zählt aber nicht als verplant (`annahme`).
4. **Lebenslauf** (§2.5 Regel 8).

**Info fehlt** ist kein Fehler: Jedes trägt eine Frage (`offen` im Angebot, sonst eine allgemeine), wo man nachsieht
(`quelle_suchen`) und einen **Stichtag** — den Tag, an dem die Antwort kommen sollte (`stichtag`, sonst der erste Termin
des Moduls; Prüfungstermine 14 Tage nach Modulbeginn, Portfolio-Teile 14 Tage nach Vorlesungsbeginn, § 65 Abs. 3).
Bis dahin grau („Augen offen“), danach orange („Stichtag vorbei — nachfragen“). Die **Übungs-Nachbereitung wartet** auf
die Übung (Silas: *„Nachbereitung für eine Übung erst eintragen können, wenn der tatsächliche Übungstermin bekannt
ist“*): Hat die eigene Lehrveranstaltung keine Termine, hat ein Vor-/Nachbereitungs-Element noch kein Fenster und lässt
sich nicht legen.

### 2.5 Wie gezählt wird — jede Regel mit ihrem Grund

1. **c.t.-Termine belegen die Doppelstunde.** 16:15–17:45 zählt 2 h: Das Viertel davor und danach ist der Weg, und die
   Modulbeschreibung rechnet 2 SWS als 2 h Präsenzzeit. s.t.-Zeiten (10:00–11:00) zählen ihre echte Dauer.
2. **Ein Wochenblock gilt in jeder Vorlesungswoche**, nicht in der Pause (außer `pause: true`) und nicht in der
   Prüfungszeit; mit `ab`/`bis` nur in einem Zeitraum, mit `alle: n` in jeder n-ten. Für die Prüfungszeit gibt es
   Datumsblöcke.
3. **Videos zählen je Woche, nach ihrer echten Länge** (V-0328). Die Videos einer Woche gehören zusammen: Die Woche
   braucht ihre Summe plus Puffer, aufgerundet (80 + 15 min → 2 h). Silas' Blöcke füllen die Wochen der Reihe nach; ein
   Block ohne Video zählt nicht (`leer`). **Quiz, Abgaben, Vorbereitung** (`selbst` mit Einheiten): mit Dauer
   (`einheiten.dauer_min`) wie Videos, ohne Dauer gilt ein Fenster — ein Block zählt, solange eine Einheit offen ist.
4. **Prüfungsvorbereitung zählt nur vor der Prüfung**, die gilt (G7: gewählt, sonst die früheste; ein Termin mit
   `wichtig: false` ist nie die Arbeitsannahme, `nachholen: true` nur nach einem Rücktritt).
5. **Präsenz ist gesperrt** (V-0333): Termine (`hart`: Präsenz, gewünschte und gewählte Gruppen, die geltende Prüfung,
   Einzeltermine mit Uhrzeit) sperren ihre Zeit (`gesperrtDurch()`); Ausgefallenes sperrt nichts. Liegt trotzdem ein
   Block darauf, verliert er die überlappte Zeit (`gesperrt`); trifft er in mindestens drei Wochen, muss er weg.
6. **Zwei Termine übereinander sind ein Konflikt** (rot an beiden).
6a. **Ein Lernblock zählt erst ab dem Stoff seines Moduls** (V-0342): vor dem ersten Termin oder der ersten Freigabe
   seiner Lehrveranstaltung (`stoff_ab`) zählt er nicht (`vor_stoff`).
6b. **Bezug zum Stoff** (V-0342): `bezug` je Vorkommen — direkt, nah, fern, ohne; ein Hinweis, wenn ein Block meist weit
   weg liegt. Er zählt nichts ab, er hilft beim Legen.
7. **Wochenwert** (nur `rest`-Elemente im Semester-Topf): **(Kontingent − erledigt) ÷ Vorlesungswochen, die im Fenster
   bleiben** — gezählt ab der Woche von heute; die Weihnachtspause zählt nicht mit. Das Fenster beginnt mit dem Stoff
   (Regel 6a) und endet mit der Vorlesungszeit. Ein einmaliger Posten (`mult: 1`, BuK-Literatur 5 h) hat keine Rate,
   er wird `einzeln` gelegt. Ist das Fenster vorbei und das Kontingent nicht erledigt, heißt der Rest **verfehlt** — er
   verfällt oder wird umgebucht, Silas entscheidet; nichts wird still verschoben.
8. **Lebenslauf** (G6, Silas, 12.10.: *„bei den Sachen, die in der Vergangenheit liegen, soll einfach ein Haken kommen
   … oder ein X … und daneben drei Punkte: verschieben, Hälfte gemacht“*): Ein vergangenes Vorkommen ohne Eintrag ist
   `offen` (unbestätigt). `plan.ist[vorkommen-id]`: `'ja'` (✓ erledigt/besucht), `'nein'` (✗ — bei einem Termin wird
   daraus **Nacharbeit** im selben Posten bis zum nächsten Termin; `nachgeholt: true` hakt sie ab), `{s:'teil', min}`,
   `'verschoben'` (der Block liegt jetzt als Datumsblock mit `aus` woanders) und `'ausgefallen'` (Termin).
   `erledigt_min` bucht nur ✓ und „teil“ ab; `plan_min` ist, was der Kalender als Plan trägt (vergangen ✗ nicht, eine
   gewünschte Gruppe nicht). Einheiten einer Quote (TECHGI-Quiz) bekommen `plan.ist['<element>#<nr>']`.

### 2.6 Prüfungen

Je Prüfung (`erg.pruefungen`):

- **Termin:** gewählt (`plan.pruefungstermin`) oder als Arbeitsannahme der früheste (G7); die anderen bleiben als
  Rückfall stehen (§ 65 Abs. 2). Alternativen: `info_fehlt` (kein Termin; oder `alternativen: 'info_fehlt'` im Angebot,
  wenn unklar ist, wie man wählt — BuK-E-Tests per ISIS-Formular), `wahl_offen`, `gewaehlt`, `fest`.
- **Stand** nach § 63 (`plan.pruefung[pid].status`): offen · vorbehalt · angemeldet · abgemeldet · ruecktritt_anerkannt
  (→ der nächste Termin gilt, die Vorbereitung wandert mit) · ruecktritt_abgelehnt (→ nicht bestanden; im Portfolio
  0 Punkte) · bestanden · nicht_bestanden (→ **Wiederholung** am nächsten Termin, eigenes Kontingent außerhalb der
  180 h — Vorschlag wie beim ersten Versuch, `kontingent_h` ändert es —, Fenster ab der Note `note_am`). Ein Portfolio
  hat eine Anmeldung für alle Teile: Ein Teil ohne eigenen Stand erbt sie.
- **Fristen** als Verweise (`fristen()`): ISIS geht vor (`anmeldung {von, bis, bis_zeit, wo}`); sonst § 63 — Anmeldung
  bis eine Woche vor einer schriftlichen Prüfung, Abmeldung bis drei Tage vorher; Portfolio: An- und Abmeldung bis
  einen Tag vor dem ersten Teil; mit Zulassung (Übungsschein, Prog1WINF) der Vorbehalt bis zwei Wochen vorher. Sie
  stehen im Kalender (Schicht C, Schritt 5).
- **Kontingent:** die Vorbereitungs-Posten (+ G5 bei der Hauptprüfung: der mit dem spätesten Termin), mit Herkunft
  („Prüfungsvorbereitung (Klausur) 50 h + aus der Übung 20 h“). Termine im Prüfungs-Topf, die der Prüfung dienen
  (Fragestunde, Probeklausuren), sind Teil davon; **zu planen** ist der Rest. Erledigt (✓) und geplant (künftige und
  unbestätigte Blöcke) zählen dagegen.
- **Punkte** (Portfolio): `punkte` je Teil, `plan.pruefung[pid].punkte` erreicht; `portfolio_rest` sagt, wie viele die
  offenen Teile für das Bestehen (`modul.portfolio.bestehen`, die 4,0) brauchen.
- **Quote** (`quote {anteil, pruefung}` an einem Element mit Einheiten, TECHGI 80 %): jede ✗-Einheit zählt als verpasst;
  höchstens erreichbar, Puffer; ab Puffer 1 eine Warnung.

### 2.7 Last und Vorschlag

**Last** (`last()`): je Tag und Woche, was liegt — Termine (ohne Ausfälle, mit gewünschten Gruppen), geltende
Prüfungen, alle Blöcke (auch die, die noch nicht zählen, sie belegen die Zeit) — und der **Bedarf ohne Block**
(Wochenwert, Einheiten der Woche, erwartete Gruppen), verteilt auf Mo–Fr. **Vorschlag** (`vorschlag()`, Silas, 12.10.:
*„als Vorschlag vom System in Weihnachtspause und Januarwochenenden verteilen … an den zwei Wochenenden vor einer
Prüfung … zehn Stunden, die aber dann vom Menschen verteilt werden“*): Prüfungen nach Datum (am selben Tag nach
Uhrzeit); je Prüfung zuerst die zwei Wochenenden davor, je höchstens `we_h` (10 h) — auch danach füllt nichts sie
weiter auf —, dann rückwärts vom Tag vor der Prüfung bis zum Fensteranfang: in der Vorlesungszeit nur Sa/So, sonst
jeder Tag; nie an Feiertagen (24.–26.12., 31.12., 01.01.), nie vor heute; je Tag höchstens, was nach allem frei ist
(9 h), je Woche ebenso (45 h); in halben Stunden. Was nicht passt, steht als `passt_nicht_min` da und wartet auf Silas'
Entscheidung. Der Vorschlag legt nichts: „Vorschlag übernehmen“ macht daraus Blöcke (`lernStrecken()`: am Stück im
Lernfenster 9–19 Uhr, sonst 7–22 Uhr, sonst in die größten Lücken geteilt).

### 2.8 Abgleich (nur prüfend)

Silas: das Audit als eigene Schicht, nicht als Logik. `audit()`:

- **Je Posten:** Präsenz gegen seine Struktur (Termine — eine wöchentliche Serie gegen höchstens `katalog_wochen` = 15,
  die 16. Woche ist Luft —, Videos, erwartete Gruppen), Selbststudium gegen den Plan. `passt` (Abweichung bis 10 %,
  mindestens 1 h), `mehr` (Präsenz: Entscheidung offen — PROG1 hat zwei Termine je Woche: 30 h mehr), `weniger` (Präsenz:
  G5), `offen` (Videolängen oder Termine fehlen), `ungeplant` (Selbststudium ohne Blöcke).
- **Je Modul:** „mehr“ und „weniger“ getrennt über die Reste innerhalb der Toleranz; ab `modul_meldung_min` (2 h)
  meldet das Modul. Nichts wird verrechnet.
- **Last:** Wochen über 45 h und Tage über 9 h — gezählt, was wirklich liegt. **Zwei Prüfungen an einem Tag**,
  **Rückfalltermine, die sich überschneiden** (ein Hinweis: wichtig nur, wenn beide nötig werden), **Quoten**.

### 2.9 Die Stufen

Jede Meldung trägt ihre Stufe (`meldungen()` am Ende): `kritisch` (rot, jetzt handeln: Gruppenanmeldung in der letzten
Woche, Prüfungsanmeldung in der letzten Woche oder vorbei ohne Stand, gescheitert, Vorbehalt in der letzten Woche,
Konflikt fester Termine), `achtung` (orange, prüfen oder entscheiden: Stichtag vorbei, Unsicheres, Abweichungen und
Entscheidungen des Abgleichs, Vorschlag passt nicht, verfehlt, zu volle Wochen und Tage, zwei Prüfungen an einem Tag),
`dran` (hellblau, du bist dran: wählen, anmelden, Zuteilung bestätigen, ✓/✗ für Vergangenes, Nacharbeit,
Videolängen erschienener Videos, Block von einem Termin wegschieben), `kommt` (grau, Augen offen: Info fehlt vor dem
Stichtag, wartet), `info` (Hinweise). `erg.offen` ist die Liste fürs „Offen“, nach Stufe und Stichtag.

### 2.10 Die vier Schritte (V-0333)

Silas, 11.10.: *„Die absolute Foundation muss sein, alle bestätigten Pflichtpräsenztermine sind dort eingetragen …
Dann der zweite Layer, das sind Optionstermine … dann die dritte Schicht, Screencasts … und dann als letzte Sache für
alle Sachen eine Vor- und Nachbereitung.“* Jedes Element gehört zu genau einem Schritt (`schrittVon`, im Angebot mit
`schritt` überschreibbar), jedes Vorkommen trägt ihn:

| Schritt | Was | Elemente | Silas tut |
|---|---|---|---|
| 1 Grundlage | feste Präsenztermine und Einzeltermine | Präsenz mit eigenen Terminen | prüfen, fehlende Uhrzeit/Raum eintragen |
| 2 Gruppen | Tutorien und Übungen mit Gruppen, ihre Anmeldungen | Präsenz mit `optionen` oder ohne Termine | Gruppe wählen oder eintragen; mit Zuteilung: anmelden, Zuteilung bestätigen |
| 3 Videos | Screencasts, Lehrvideos | `video` | Blöcke legen |
| 4 EVL | Vor-/Nachbereitung, Labs, Quizze, Vorbereitung auf Übungen | `selbst` | Blöcke legen (die Übungs-Nachbereitung erst mit Übungsterminen) |
| 5 Prüfungen (`PRUEFUNGEN`) | der Prüfungs-Topf: Prüfungen, ihre Fristen, Vorbereitung, Probeklausur, Fragestunde — **nicht im Ablauf** | `pruefung`, `topf: 'pruefung'` | nach dem Festlegen, unter „Prüfungen“ |

Ein Block gehört zum Schritt seines Elements (`schrittVonBlock`: Video 3, Prüfungs-Topf 5, sonst 4). **Zurücksetzen**
(`zuruecksetzen(plan, angebot, ab, {am})`) nimmt alles aus den Schritten `ab` bis 4 heraus und **hebt es in
`plan.zurueckgesetzt` auf** (`wiederherstellen()`); es bleibt, was Silas weiß (`angemeldet`, `zugeteilt`, `ist`,
`bestaetigt`, Videolängen) und alles zu den Prüfungen. **Festlegen** (V-0334): `plan.festgelegt`; bis dahin führt die
Seite durch die Schritte. **Vorgabe je Woche** (`vorgabe()`, V-0335, seit V-0349 aus dem Kontingent): Videos ein Block
je Woche ab der ersten Freigabe, so lang, dass er die Einheiten deckt; Selbststudium Blöcke von 1,5–2 h, k je Woche oder
einer alle n Wochen, was dem Kontingent im Fenster am nächsten kommt; eine Woche vor dem Ende darf er aufhören (15
statt 16 Wochen). Seltener als alle zwei Wochen oder ein einmaliger Posten: `einzeln` in echten Wochen
(`blockTagErlaubt()`). **Wiederholungen:** Jedes Vorkommen trägt `nr`, `gesamt` und `rest`.

### 2.11 Annahmen an einem Ort

`annahmen()` sammelt die festen Regeln (mit Quelle), die Stellschrauben (`regeln`, änderbar), jede `annahme` am
Element oder an einer Gruppe, jede Videolängen-Annahme (`annahme_min`), jede Erwartung (`erwartet.anzahl`) und jede
Dauer je Einheit (`einheiten.dauer_min`) — änderbar unter „Offen“. `luecken()` ist `erg.offen`.

## 3. Die Seite

- **Kopf:** Semester, die Bilanz (V-0349: „900 h = 595,5 Semester + 304,5 Prüfungen“, der Balken teilt die zwei Töpfe,
  ein dunkler Strich darunter ist, was mit ✓ erledigt ist) und die Zähler (kritisch, zu tun); der Speicherstand;
  „Kalender“ (die Abos, §6).
- **Oben in der Mitte, die vier Schritte** (V-0333, §2.8a): je ein Knopf mit Stand (rot kritisch, hellblau mit Zahl
  „zu tun“, sonst ✓). Man springt frei vor und zurück; links führt „Weiter: 3 · Videos“ zum nächsten, in Schritt 4
  „Stundenplan festlegen“ (die Karte davor nennt, was noch offen ist). Daneben *Offen* (§2.9, §2.11), *Abgleich* (§2.8),
  *So wird gerechnet* und **Zurücksetzen** (ab Schritt 2, ab 3 oder nur 4; was herausfällt, liegt beiseite —
  „Wiederherstellen“).
- **Festgelegt** ruhen die Schritte: „Stundenplan festgelegt am …“ und **Stundenplan bearbeiten** (welcher Schritt?).
  Reiter *Woche* (Semester-Topf), *Prüfungen* (Prüfungs-Topf, §2.6–2.7), dazu *Offen*, *Abgleich*, *So wird
  gerechnet*.
- **Festgelegt, links je Modul** (V-0349): die Töpfe („Semester 107,5 h · Prüfungen 72,5 h“) und darunter die Elemente
  **nach Posten der Aufwandstabelle** — je Posten Titel, Kontingent und das Ergebnis des Abgleichs als Chip (passt, +30 h,
  −6,5 h, offen); je Element ein Chip mit seinem Weg durch den Baum („fest · 15×, 1 fällt aus“, „Info fehlt · bis
  16.10.“, „Wunsch · anmelden“, „Zuteilung offen“, „1,9 h je Woche“, „wartet auf Übung“) und rechts „im Plan / Kontingent“.
  Der Prüfungs-Topf steht als eine Zeile, die zu „Prüfungen“ führt. Die Karte eines Elements zeigt **So wird gerechnet**:
  Posten und Topf, Zeitbindung, Alternativen, Info fehlt mit Stichtag, wie sein Kontingent entsteht, den Wochenwert als
  Rechnung, Lebenslauf und Abgleich; mit Zuteilung die Knöpfe „Angemeldet?“, „Zugeteilt: G4“, „Kein Platz bekommen“.
- **Ist-Erfassung** (V-0349, G6): Vergangenes trägt unten rechts eine Marke — „?“ (blau: vorbei, noch offen), ✓, ✗, ½,
  →. Ein Klick öffnet die Karte: ✓ erledigt/besucht, ✗ nicht gemacht/verpasst, bei Terminen „fiel aus“, bei Blöcken
  „… teilweise“ (Minuten oder Hälfte) und „… verschieben“ (neuer Tag und Uhrzeit). Über dem Raster einer echten Woche
  hakt „n× ✓“ alles Offene der Woche auf einmal ab.
- **Präsenz rot umrandet, Wunsch gestrichelt, Ausfall durchgestrichen** (V-0349, Silas: *„Präsenztermine sollen im
  Planner eine leicht rote Outline bekommen, sodass man sie besser erkennt“*): Termine des Semester-Topfs tragen
  `t-praesenz` (nicht `k-praesenz` — Kachel-Klassen dürfen keine Regel ohne `.kachel` haben, Test). Eine gewünschte Gruppe
  ohne Zuteilung trägt die Marke „Wunsch“; was ausfällt (TU geschlossen), steht blass und durchgestrichen da.
- **Zwei Hauptansichten** (V-0338, Silas: *„Woche und Prüfungen noch etwas prominenter oben links … die zwei
  Hauptfenster von diesem Tool“*): oben links „Woche“ und „Prüfungen“; Prüfungen erst nach dem Festlegen.
- **Prüfungen, oben die Zeitleiste** (V-0337, umgebaut V-0338): das Semester mit Monaten, heute und den Zeiträumen
  (ein Klick klappt ihren Kalender auf), darunter **eine Spur** für alle Prüfungen (Klausur rund, E-Test eckig,
  Online-/schriftlicher Test als Raute, `pruefungsArt()`); gefüllt, was gilt, hohl Rückfall- und Nachholtermine. Vor
  jedem geltenden Termin die **Strecke seiner Vorbereitung** (seit V-0349: vom ersten gelegten oder vorgeschlagenen
  Tag an; bis dahin ein „Vorlauf“ bei angenommenen Stunden je Woche und die Wochenend-Pakete, `pruefungsPakete()` —
  beides entfernt). Darunter der **Prüfungs-Topf als Tabelle**: je Prüfung Termin (* = Arbeitsannahme), Kontingent,
  gelegt, Vorschlag, passt nicht, und die Summe.
- **Prüfungen, links je Prüfung ihr Kontingent** (V-0349, Silas: *„da soll … eine Art Kontingent mitlaufen“*): nach
  Datum, mit Stand (§ 63) und einem Balken aus erledigt (dunkel), geplant, Vorschlag (blau schraffiert) und „passt
  nicht“ (rot). Gewählt (Klick, auch in Zeitleiste und Tabelle) zeigt sie alles: Kontingent mit Herkunft („50 h + aus
  der Übung 20 h“) und den Terminen im Topf, Fenster, Termin wählen, Stand und Punkte, Fristen als Verweise, den
  **Vorschlag** mit „Vorschlag übernehmen“, „Künftige Lernblöcke entfernen“ und die Termin-Formulare.
- **Verteilen durch Antippen und Ziehen** (V-0340, V-0349, Silas: *„man soll auch draufklicken und ziehen … auf einen
  Tag raufklicken und dann runterziehen“*): Mit einer gewählten Prüfung legt ein Tipp auf einen Tag Lernzeit — so viel,
  wie offen ist, höchstens 6 h, in die freien Strecken (`lernStrecken()`); ein zweiter Tipp auf den Tag oder den Block
  nimmt sie heraus. **Drücken und nach unten ziehen** wählt die Stunden (je 14 px eine halbe Stunde, höchstens, was der
  Tag frei hat); loslassen legt sie. Ein vorgeschlagener Tag trägt „+ 9 h“ — ein Klick übernimmt nur diesen Tag.
- **Prüfungen, darunter die Zeiträume** als aufklappbare Kalender (Wochen × Tage) mit allen Prüfungen, Fristen und
  Lernblöcken. **Jeder Tag ist eine Säule** (V-0340): `tagesLast()` füllt den Tag von unten, `tag_h` (9 h) ist voll,
  darüber rot getönt; der Vorschlag aller Prüfungen liegt blau schraffiert darüber. Das Fenster der gewählten Prüfung
  ist getönt, ihr Prüfungstag umrandet, Feiertage rot beschriftet.
- **Vorlesungszeit öffnen** (V-0337, Silas: *„der Stundenplan muss in der Ansicht auf jeden Fall gelockt sein, aber
  außerhalb des Stundenplans — vor den Zeiträumen, nach den Zeiträumen und am Wochenende — kann man auch während der
  Vorlesungszeit Prüfungsvorbereitung einrichten … sich wiederholende Termine“*): das Raster mit allen sieben Tagen
  von 7 bis 22 Uhr; der Stundenplan ist dunkelgrau und fest, die Prüfungen farbig. Links die Prüfungen; die gewählte
  hat Länge (1–4 h) und „Block legen“; freie Plätze (`pruef_fenster` 07–22 Uhr) sind grün. In der
  Standardwoche liegt der Block jede Woche bis zum Tag vor der Prüfung (`bis`), in einer echten Woche nur an diesem
  Tag.
- **Abwählen** (V-0338, Silas: *„wenn man rausklickt, einfach auf irgendeinen Blankspot im Stundenplan, … soll das
  wieder deselected werden“*): Ein Klick auf eine leere Stelle im Raster hebt die Auswahl auf (Modul, Bestandteil, die
  nach vorn geholte Sache, die gewählte Prüfung); nur wenn nichts gewählt ist, erklärt er, wie man legt.
- **Fahrzeit** (V-0338, Silas: *„beim ersten Präsenztermin eines Tages 40 Minuten Fahrzeit davor … und bei dem letzten
  auch nochmal … nicht freigehalten, sondern visuell, mit einer grauen Strichellinie“*): `fahrzeiten()` — vor dem
  frühesten und nach dem spätesten Termin vor Ort (Online zählt nicht), `pendeln_min` 45 (V-0345, Silas: *„45 Minuten
  vor dem ersten Präsenzmodul … und 45 Minuten nach dem letzten“*); grau gestrichelt (2 px) und seit V-0340 ÜBER den
  Kacheln, durchsichtig — die Fahrt nach Hause lag sonst unter dem nächsten Block. Sie sperrt nichts, auch in der
  Standardwoche. **Lücke zwischen Fahrzeit und Termin** (V-0345, Silas: *„manchmal ist die Fahrzeit direkt dran
  gekoppelt und manchmal ist da eine kleine Lücke“*): Kacheln einer Terminreihe (EINFWI-Übung, BuK-VL) trugen die
  Klasse `reihe`, die auch die geführte Liste links hat (`margin-top: 8px`) — sie rutschten 10 min unter ihre Zeit.
  Jetzt `t-reihe`; ein Test hält jede Kachel-Klasse frei von Regeln ohne `.kachel`.
- **Mittagspause** (V-0340, Silas: *„einen Slot von 45 Minuten für Mittagspause … der hat keine logische Konsequenz,
  da kann man drüber planen … dass man im Hinterkopf behält, dass man auch noch essen möchte“*): `mittagspause()` — Mo–Fr
  45 min im ersten freien Fenster 11:30–14:30, nicht in der Fahrzeit (V-0345); ohne ganzes Fenster in der längsten
  Lücke, ohne jede Lücke um 12:30; bernstein gepunktet über den Kacheln. Seit V-0345 (Silas: *„leicht verschieben, auch
  wenn man gerade nicht den Stundenplan selbst bearbeitet … pro Woche einzeln … in der Standardwoche gar nicht“*) nur in
  echten Wochen, und am Schild „Mittag“ lässt sie sich je Tag ziehen — auch festgelegt; sie steht dann in
  `plan.mittag[datum]` (durchgezogen), ein Doppelklick aufs Schild macht sie wieder automatisch.
- **Minimap** (V-0340): unter „Woche“ nur die Vorlesungszeit bis zur letzten Vorlesungswoche, unter „Prüfungen“ das
  ganze Semester.
- **Links, was der Schritt will** (im Ablauf): oben ein Satz, was hier zu tun ist, und der Weg weiter; darunter je
  Modul nur die Teile dieses Schritts (Module ohne sie blass) — nur, was im Schritt zu wählen oder zu legen ist
  (V-0345, Silas: *„Bei Quiz kann ich hier ja gar nicht auswählen“*): Schritt 1 zeigt keine Quizze mehr.
  Schritt 2 zählt je Modul **„1 von 2 gewählt · 1 noch wählen“** (oder „kommt noch“), je Teil „gewählt ✓“, „wählen“,
  „kommt noch“. Jeder Teil: Art, Form, Stand und die Zeile in der Farbe seiner Stufe. Ein Klick klappt die Karte auf:
  alle Meldungen, „So wird gerechnet“ (der Baum), die Gruppen als Knöpfe, die Vorgabe, fehlende Angaben eintragen.
- **Geführt, eine Sache nach der anderen** (V-0335, Silas: *„dass man von oben nach unten durchgeführt wird … eine
  Zusammenfassung, welche alle da gewählt werden und wie viele jeweils vorhanden sind … du wählst halt genau gerade
  eine einzige Sache“*): Oben links steht in Schritt 2–4 die **Reihe** des Schritts in der Reihenfolge der Module — in
  2 jede Wahl mit „4 Gruppen“, „0 vorhanden“ oder „✓ G4“, in 3 und 4 jeder Bestandteil mit seiner Vorgabe je Woche
  oder „✓ 24 h“. Seit V-0345 steht die Reihe **unter ihren Modulen** (Silas: *„die EVL-Sachen sollen unter jedem Modul
  abgelegt werden und nicht oben unter EVL allgemein“*); oben bleibt der Satz des Schritts mit „Weiter“ bzw.
  „Festlegen“. **Dran** (hellblau) ist, was Silas dort anklickt, sonst die erste offene Sache; nach jedem letzten Block
  rückt sie weiter, „Details“ klappt die Karte des Bestandteils darunter auf. Ein Klick auf ein Modul macht seine erste
  offene Sache zu der, die dran ist. In Schritt 2 stehen im Raster nur die Gruppen dieser einen Wahl. **Nach einer Wahl
  bleibt sie dran** (V-0345, Silas: *„man soll ja ein bisschen auch hin und her schieben können … wenn ich erneut auf
  die gewählte Sache klicke, möchte ich wieder alle Wahloptionen angezeigt bekommen“*): die gewählte Gruppe in Farbe,
  weiß umrandet, die anderen blass und grauer (`alternative`, ein anderer Ton als das Grau früherer Schritte) und
  weiter wählbar; ein Klick auf die gewählte wählt ab, dann stehen alle wieder in Farbe da. Weiter geht es mit
  „Nächste Wahl: …“ an der Sache, die dran ist.
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
- **Dunkel** (V-0338, Silas: *„im Dark Mode sehen die Farben zusammengewürfelt und chaotisch aus“*; V-0340: *„noch zu
  hässlich … fröhlicher, pastellfarbener … matschig“*): Pastellflächen mit dunkler Schrift, je Art gleiche Helligkeit
  und Sättigung (OKLCH), eigene Blöcke etwas gedämpfter (`--k-*-b`), Etiketten kräftig; keine Streifen (Silas: *„die als
  dein Block markierten sind hinten so gestreift … das macht es komischer“*). Die mit stil.css geteilten Tokens (grau,
  m1–m8) bleiben gleich (Test).
- **Farben nach Art** (V-0332, Silas: „Präsenzveranstaltung sollte das gleiche Farbschema haben bei allen Modulen“; V-0349:
  „ISIS-Quiz soll auch als Lernen markiert sein“): Präsenz, Videos, Vor- und Nachbereitung mit Quizzen, Aufgaben und Labs, Prüfung —
  je eine Farbe (`kategorie()`), das Modul als Streifen links an jeder Kachel. Formen: fester Termin (gefüllt), **zur
  Wahl** (gefüllt, weiß gestrichelte Linie innen — solange nicht gewählt, stehen alle Gruppen im Plan), **gewählt**
  (weiß durchgezogen; die anderen nur noch ausgegraut, wenn der Teil gewählt ist), nur an einzelnen Tagen (heller, mit
  Anzahl), dein Block (heller gefüllt, ohne Streifen).
- **Unter dem Raster:** in Schritt 2 die Gruppen (s. o.), in Schritt 3 und 4 und festgelegt, was in dieser Woche
  (Standardwoche: der Wochenwert) dran wäre, aber noch nicht im Plan ist (`wochenBedarf()`): grau „Info fehlt —
  angenommen“ (erwartete Gruppen) und „wartet“, hellblau „Block legen“. Videos zählen in der Woche, in der ein Block sie
  deckt.
- **Im Kopf der Woche** steht ihre Last: „Vorlesungswoche 5 · 47,5 h von 45 h (davon 6 h noch ohne Block)“ — rot über 45 h.
- **Links: Ganzes Semester | Diese Woche** (ab Schritt 3 und festgelegt). Die Woche ist die im Raster gezeigte.
- **Ohne Uhrzeit:** Ein Termin mit Datum, aber ohne Uhrzeit steht über dem Raster; ein Klick trägt Uhrzeit und Ort nach.
- **Abgleich** (V-0349, §2.8): je Modul eine Tabelle Posten · Tabelle · Wirklichkeit · Ergebnis · Folge („6,5 h →
  Klausur (G5)“, „Entscheidung offen“), darunter mehr/weniger innerhalb der Toleranz; die **Last je Woche** als Säulen
  (Termine, Blöcke, Prüfungslernen, Bedarf ohne Block, Vorschlag) mit der Grenze 45 h als Linie, ein Klick zeigt die
  Woche; Tage über 9 h; Prüfungen an einem Tag, Rückfall-Überschneidungen, Quoten.
- **Offen** (V-0349, §2.9): „Jetzt“ (kritisch und dran, mit „Angemeldet ✓“, „Zugeteilt ✓“, „Nachgeholt ✓“, „Woche
  ansehen“), „Prüfen und entscheiden“ (orange), „Augen offen“ (Info fehlt, nach Stichtag sortiert), die Annahmen
  (änderbar), Hinweise. Die Befunde des Abgleichs stehen hier und im Abgleich, nicht links.
- **So wird gerechnet:** die Grundsätze, der Baum, Wochenwert und Vorschlag, der Abgleich, ein Modul als Tabelle
  (Posten · Kontingent · Topf · Elemente · Abgleich), die Quellen. Videos stehen in der Karte ihres Elements einzeln,
  mit einem Feld für ihre Länge; Quizze mit Quote mit ✓/✗ je Quiz.
- **Rechts, die Minimap** (V-0328, Silas: „wie die Minimap, die die Semesterübersicht einmal in Wochenansicht gibt“):
  je Modul eine Summenzeile, darunter jeder Bestandteil, regelmäßig wie unregelmäßig, dazu Prüfungen und Fristen;
  Termine kräftig, eigene Blöcke heller, Freigaben als Punkt. Der links gewählte Bestandteil leuchtet, die anderen
  treten zurück; im Ablauf sind Zeilen anderer Schritte und die Prüfungen blass. Darunter die Chronik des Unregelmäßigen.
- **Am Telefon** liegt alles untereinander, das Raster scrollt seitlich; ein Tipp legt den hängenden Block ab
  (auch er nicht auf Präsenz). Die Schritte zeigen nur den gezeigten mit Namen, die anderen mit Nummer und Stand.

## 4. Stellschrauben (`REGELN` in `grund.mjs`, im Angebot unter `regeln` überschreibbar)

| Regel | Wert | Grund |
|---|---|---|
| `lp_h` | 30 | AllgStuPO § 45 Abs. 2 |
| `katalog_wochen` | 15 | Multiplikator der Aufwandstabellen; eine wöchentliche Serie wird gegen höchstens 15 Termine geprüft (§2.8) |
| `woche_h`, `tag_h` | 45, 9 | G8, Silas 12.10.: Kapazität je Woche und Tag, alles eingerechnet (Säule = 9 h) |
| `toleranz_anteil`, `toleranz_mind_min` | 0,1, 60 | Abgleich je Posten: passt bis 10 %, mindestens 1 h |
| `modul_meldung_min` | 120 | Abgleich je Modul: ab 2 h „mehr“ oder „weniger“ melden (Silas, 11.10.: ±2 h nicht melden) |
| `stichtag_tage` | 14 | § 65 Abs. 3: Prüfungstermine 14 Tage nach Modulbeginn bekannt — Stichtag eines fehlenden Termins |
| `anmeldung_tage`, `abmeldung_tage`, `portfolio_tage`, `vorbehalt_tage`, `anmeldung_ab_tage` | 7, 3, 1, 14, 14 | § 63 Abs. 2, 4, 5: Fristen als Verweise, wenn ISIS keine nennt |
| `we_h` | 10 | Silas, V-0340: die zwei Wochenenden vor einer Prüfung je höchstens 10 h (Vorschlag) |
| `erwartet_min` | 120 | ein erwarteter Termin, dessen Daten fehlen: eine Doppelstunde |
| `video_puffer_min`, `raster_min` | 15, 30 | Silas: 1:45 → 2 h |
| `lerntag_h`, `lernfenster` | 6, 09–19 | höchstens so lang legt ein Tipp im Prüfungskalender; wo zuerst gesucht wird |
| `pendeln_min` | 45 | Silas, V-0345 (V-0338: 40): Fahrzeit vor dem ersten und nach dem letzten Termin vor Ort (nur gezeigt) |
| `evl_block_min`, `evl_min_min` | 120, 90 | Silas, V-0335: „EVL-Block muss einfach zwei Stunden sein … mindestens anderthalb“ |
| `evl_fenster`, `tag_fenster` | 10–18, 08–20 | bevorzugte und überhaupt gesuchte freie Plätze |
| `pruef_fenster` | 07–22 | Prüfungsvorbereitung: auch früh und abends (V-0337) |
| `mittag_min`, `mittag_fenster` | 45, 11:30–14:30 | Silas, V-0340: Mittagspause, nur gezeigt |
| `bezug_direkt_min`, `bezug_nah_tage` | 120, 3 | V-0342: bis 2 h nach dem Stoff ist „direkt“, bis 3 Tage „nah“ |

## 5. Das Datenformat

Ein **Stand** ist ein JSON-Dokument `{schema: 1, version, geaendert, angebot, plan}`.

- **`angebot`** — was es gibt: `semester {id, titel, vorlesung {von, bis}, frei [{von, bis, titel}], geschlossen? [{von,
  bis, titel, quelle}], feiertage? [datum], ende, studiengang, fachsemester}`, `regeln`, `module [{id, nr, titel, kurz,
  lp, farbe 1–8, portfolio? {bestehen, gesamt, quelle}, posten [{id, lv, titel, mult, h, topf?}], teile [Element],
  pruefungen [Prüfung], notizen [], links {}}]`, `termine [{id, modul?, art: frist|info|rahmen, datum, bis?, start?,
  ende?, titel, ort?, wichtig?, unsicher?}]`.
- **Element** (`teile[]`): `{id, titel, art: praesenz|video|selbst|pruefung, posten?, topf?: 'pruefung', pruefung?,
  termine?, optionen? [{id, label, termine, quelle?, notiz?}], wahl?, zuteilung?, anmeldung? {von, bis, bis_zeit, wo},
  erwartet? {anzahl, dauer_min?, ab_woche?, quelle?}, einheiten?, vorbereitung_auf?, zeitbindung?: 'unbekannt', quote?
  {anteil, pruefung, text?}, soll_h? (Anteil eines geteilten Selbststudium- oder Vorbereitungs-Postens), stichtag?,
  offen?, quelle_suchen?, unsicher?, hinweis?, annahme?, quelle?, ort?, online?, ct?, schritt?, kategorie?}`.
- **Einheiten** (`einheiten`): `liste [{nr, ab, titel, woche, laenge_min, bis?, bis_zeit?, quelle, offen?, unsicher?}]`
  oder `takt {tag, von, bis}`; dazu `annahme_min` (Videos), `dauer_min` (Quiz, Test, Vorbereitung), `dauer_quelle`,
  `anzahl` (Daten noch offen), `offen`, `stichtag`.
- **Prüfung**: `{id, titel, form: schriftlich|Portfolio, dauer_min, punkte?, art?, zulassung?, alternativen?:
  'info_fehlt', stichtag?, offen?, unsicher?, anmeldung?, termine [{datum|null, start?, ende?, ort?, label, wichtig?
  (false: Rückfall), nachholen? (nur nach Rücktritt), offen?, unsicher?, quelle?, anmeldung?}]}`.
- **Serie mit Angaben je Tag:** `tage {datum: {titel, ort, unsicher, quelle}}` — der Freitag mit Übung statt VL.
- **`plan`** — was Silas entschieden hat und was passiert ist: `wahl {element: option}` (mit Zuteilung: der Wunsch),
  `angemeldet {element- oder prüfungs-id: true}`, `zugeteilt {element: option | 'keine'}`, `pruefungstermin {prüfung:
  datum}`, `pruefung {prüfung: {status, termin?, punkte?, note_am?, kontingent_h?}}`, `ist {vorkommen-id | element#nr:
  'ja' | 'nein' | 'ausgefallen' | 'verschoben' | {s: 'teil', min} | {s: 'nein', nachgeholt: true}}`, `bloecke [{id,
  teil|null, tag | datum, start, ende, ab?, bis?, pause?, alle?, versatz?, titel?, aus? (verschoben von), vorschlag?
  (aus dem Vorschlag übernommen)}]`, `bestaetigt {annahme-id: true}`, `festgelegt` (Zeitpunkt), `mittag {datum:
  "HH:MM"}`, `zurueckgesetzt {am, ab, wahl, bloecke}`. Nicht mehr gelesen: `umwidmungen` (seit V-0349 ersetzt G5 sie),
  `lernplan: true` an alten Blöcken.
- `pruefeAngebot()` lehnt ab, was formal nicht stimmt (doppelte Ids, unbekannte Art oder Topf, kaputtes Muster); die
  API speichert dann nicht (422).

## 6. Die Schnittstelle zum Study OS — und zum Kalender

Die Richtung ist **Study OS → Stundenplanner**: Das Study OS liest, der Stundenplanner fragt nie etwas von dort ab
(AGENTS.md §2 ④).

- `GET /silas/api/ereignisse` mit `Authorization: Bearer <Schlüssel>` liefert `{schema, version, geaendert, semester,
  ereignisse[]}`. Ein Ereignis: `id` (stabil: `<teil>@<datum>@<uhrzeit>`, `<block>@<datum>`, `<prüfung>@<datum>`),
  `schicht` (A/B/C/D/R), `quelle`, `art`, `modul`, `modulnummer`, `titel` („TECHGI · VL“), `datum`, `bis`, `start`/`ende`
  als ISO mit Zeitzone (`2026-10-29T12:15:00+01:00`), `ganztag`, `uhrzeit` (Fristen mit Zeitpunkt), `ort`, `online`,
  `wichtig`, `unsicher`, `teil`, `zaehlt_min`, `flags`, `ausgefallen` (TU geschlossen, abgesagt — fehlt in den
  Kalender-Abos), `ist` (Lebenslauf). Die Fristen der Prüfungen (Verweise nach § 63) kommen mit (`<prüfung>-anmeldung`).
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
- **Probepläne** (V-0345, Silas: *„verschiedene Stundenpläne abspeichern … unter stundenplanner.de/silas/1, 2, 3 … um
  eben jetzt einfach nur fürs Testen von dem Tool zu sehen, wo es noch nicht klappt“*): `/silas/1` … `/silas/9` ist
  dieselbe Seite (`web/_redirects`, 200), die den Plan aus der Adresse liest (`PLAN_NR`) und `stand?plan=<n>` liest
  und schreibt (KV `stand:<n>`, dieselbe Sperre, keine Sicherung). Zwischenspeicher und Ansicht im Browser sind je Plan
  getrennt (`silas:v1:stand:<n>`), sonst landete ein Probeplan beim nächsten Laden im echten. Ein leerer Probeplan
  bietet „Leer beginnen“ (die Module des echten, ohne Wahl und Blöcke) oder „Kopie meines Plans“ (ohne `festgelegt`).
  Oben links wählt man den Plan; das Schild heißt „silas · Probeplan n“, das Kalender-Abo fehlt dort. Ereignisse und
  Kalender kommen immer aus dem echten Plan. `GET /silas/api/plaene` listet die angelegten.

## 8. Offen

- **Entscheidungen, die Silas später trifft** (12.10., „die mache ich später“): das **PROG1-Mehr** (zwei Termine je
  Woche: 30 h über der Aufwandstabelle — behalten oder gegen die Labs buchen) und der **EINFWI-Test** (40 h Vorbereitung
  bis 14.12. — mit seinen echten Blöcken passt in den Vorlesungswochen nichts mehr: 47 h je Woche zulassen, das PROG1-Mehr
  gegen die Labs buchen, beides, oder weniger Vorbereitung). Beide stehen auf der Seite als „Entscheidung offen“.
- **Die Testfälle der Fassung 4 mit Silas' Zahlen** prüft ein Skript außerhalb des Repos gegen seinen Stand (sein
  Semester darf nicht ins Repo); die Regeln selbst prüft `web/tests/kontingent.test.mjs` mit erfundenen Daten.
- Die Daten kamen am 11.10. aus Silas' ISIS-Export (V-0328) und wurden am 12.10. auf das Kontingent-Modell umgestellt
  (Stichtage, Erwartungen, Zuteilung, Probeklausuren, Fragestunde, TU-Schließung). Was ISIS noch nicht nennt, steht
  unter „Offen“ → „Augen offen“ mit Stichtag und wird auf der Seite nachgetragen.
- Ein Termin für zwei Posten (PROG1: VL und Übungsanteile gemischt) bucht das Modell vorläufig ganz auf die VL; das Mehr
  steht im Abgleich. Einlass, Zeitfenster und Räume nach Nachnamen einer Prüfung stehen nur als Text.
- Das Study OS liest `/silas/api/ereignisse` (Vorgang im Airfield studyos).
- Ob der Planer für alle kommt, entscheidet Silas; das Modell ist dafür schon allgemein.
