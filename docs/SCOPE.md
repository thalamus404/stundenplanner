# Scope — was der Stundenplanner können und abdecken soll

> **Stand: festgelegt am 04.10.2026** (V-0210). Silas hat die Fragen aus §6 entschieden, E10
> bestätigt er vor dem Bau des Zählens. Die Datei ändert sich nur mit einem Vorgang und einem
> Eintrag in der [`CHRONIK.md`](../CHRONIK.md).
> Wer etwas baut, das hier nicht steht oder §5 widerspricht, fragt vorher Silas.

---

## 1. Worum es geht

Studierende sollen ihren Stundenplan **schneller, einfacher und übersichtlicher** zusammenstellen
als in den Systemen der Hochschule. Sie wählen je Bestandteil eines Moduls eine Gruppe (Übung,
Tutorium …) und sehen sofort, wie ihre Woche aussieht und wo sich Termine überschneiden.

**Anlass und Frist:** Die Vorlesungen des Wintersemesters 2026/27 beginnen am **Montag, dem
12.10.2026**. In der Einführungswoche davor bauen viele Erstsemester gleichzeitig ihren ersten
Stundenplan. Die **erste Fassung** muss deshalb vor dem 12.10.2026 im Netz stehen, je früher in
der Einführungswoche, desto besser. Silas: Dieses Semester ist zum Verfügbarmachen, Testen und
Datensammeln da. **Richtig gemacht wird es für den nächsten Jahrgang** (WiSe 2027/28). Was die
Frist nicht schafft, steht im Zielbild (§4), nicht in der ersten Fassung (§3).

## 2. Was es heute schon gibt — der Befund

Der Stundenplan des Study OS (Airfield `studyos`) ist das Vorbild. Gesichtet am 04.10.2026 von
anflug und sichter:

| | |
|---|---|
| **Quelle** | MOSES der TU Berlin, **öffentlich und ohne Login**: je Modulnummer der offizielle CSV-Export der Einzelbuchungen (Termine mit Datum, Uhrzeit, Raum, Gruppe, Hinweis) |
| **Gleich für alle** | Die Termine eines Moduls hängen an seiner Nummer und sind TU-weit dieselben. Jeder Studiengang ist technisch identisch |
| **Je Studiengang** | nur die Liste, welche Module in welchem Fachsemester dran sind. Bei WI im 1. FS sind es fünf, heute von Hand aus der Studienordnung |
| **Umfang am 16.09.2026** | 5 Module, 11 Bestandteile, 64 Gruppen, 949 Einzelbuchungen |
| **Der wertvolle Kern** (~130 Zeilen) | eine Gruppe je Bestandteil · Konflikte gegen die **echten** Termine des Semesters, nicht gegen ein Wochenraster · Erkennung des 14-Tage-Rhythmus (A/B-Woche) · Fingerabdruck je Gruppe, damit eine geänderte Zeit oder ein geänderter Raum auffällt |
| **Fest auf einen Menschen gebaut** | Semester und Wochenanker (12.10.2026) im Code, die Modulliste aus seiner Datenbank, die Auswahl in seiner Datenbank (ein Nutzer) |
| **Nicht abgebildet** | Gruppenbindungen einzelner Fakultäten (z. B. „Tutorium nur zur eigenen Übung“). Sie werden nicht erfunden |
| **Ungeprüft** | ob MOSES die Studienverlaufspläne maschinenlesbar liefert. Davon hängt ab, ob „wähle deinen Studiengang“ automatisch geht oder je Studiengang eine Liste von Hand braucht |

**Der Kern, auf dem alles steht:** Die Termine sind öffentlich, und die Auswahl kann auf dem
Gerät bleiben. Ein Login ist dafür nicht nötig, eine App aus dem Store auch nicht, und es gibt
keine persönlichen Daten auf einem Server.

## 3. Die erste Fassung, vor dem 12.10.2026

**Für wen:** Erstsemester der **Wirtschaftsinformatik** an der TU Berlin, die ihr 1. Semester
nach Studienverlaufsplan bauen (Silas). Die Studiengangswahl ist von Anfang an eingebaut, und
vorerst steht dort nur WI. Ein weiterer Studiengang ist dann eine Modulliste mehr, keine neue
Software.

**Was:** ein getreuer Nachbau des Study-OS-Stundenplans, für jeden im Netz, mit den Änderungen,
die „für viele statt für einen“ verlangt, und nicht mehr:

1. **Module und Bestandteile** mit offiziellen SWS und Links zu MOSES und zum
   Vorlesungsverzeichnis, die Hinweise der Module aufklappbar
2. **Gruppenwahl von Hand:** eine Gruppe je Bestandteil. Eine neue Wahl ersetzt die alte
3. **Wochenskelett** mit allen angebotenen Zeiten, Alternativen aufklappbar, dazu die
   **konkrete Woche** mit den echten Terminen
4. **Konflikte** aus sämtlichen Einzelterminen des Semesters. A/B-Ansicht nur bei erkanntem
   14-Tage-Rhythmus
5. **Geändert seit deiner Wahl:** Ändert sich Zeit oder Raum einer gewählten Gruppe, sagt die
   Seite es (der Fingerabdruck wandert mit der lokalen Auswahl)
6. **Ohne Konto:** Die Auswahl bleibt im Browser. Dazu ein **Teilen-Link**, der sie trägt:
   zum Mitnehmen aufs andere Gerät und zum Vergleichen mit anderen
7. **Eine Website, fürs Handy zuerst.** Sie lässt sich auf den Home-Bildschirm legen. Keine
   App aus dem Store
8. **Ehrlich über die Quelle:** Datenstand mit Uhrzeit, ein Hinweis bei veralteten Daten und
   gut sichtbar „kein offizielles Angebot der TU Berlin, verbindlich sind MOSES und die
   Anmeldungen dort“
9. **Impressum und Datenschutzhinweis**

**Wie die Daten kommen** (E5, geändert am 05.10.2026): Das Repo hat **einen eigenen Abruf**. Er
übernimmt nur die MOSES-Logik des Vorbilds, liest nur öffentliche Seiten und nimmt die Modulliste
aus einer Datei im Repo, nicht aus einer Datenbank. Er läuft einmal am Tag auf dem NAS, aber **in
einem eigenen Container**, der mit Silas' anderen Systemen nichts teilt: kein Abruf, keine
Datenbank, kein Netz von dort. Das Ergebnis lädt er als fertige Seite mit Datendateien zu
Cloudflare hoch. Die Daten fließen nur in eine Richtung: MOSES → Abruf → Website. Der NAS baut nur
ausgehende Verbindungen auf und ist nie ein Webserver. Fällt er aus, bleibt die Seite von gestern
online. Antworten würde MOSES auch GitHubs Servern (geprüft am 05.10.2026, nur die normalen Seiten,
nicht der CSV-Export); das bleibt der Ersatzweg.

**Wo** (E7, geändert am 05.10.2026): auf **Cloudflare Pages** (Free) unter **`stundenplanner.de`**.
Silas hat die Domain am 05.10.2026 gekauft. Bis sie zeigt, gilt die Adresse von Cloudflare
(`*.pages.dev`). GitHub Pages scheidet aus, weil es ein „online business“ verbietet und Werbung
später möglich bleiben soll.

**Kurz nach dem Start, noch vor dem 12.10.2026** (E9, eigener Schritt): **anonym mitzählen.**
Silas zählt das „mit zu den wichtigsten Sachen: das Verhalten der User kennenlernen“. Gezählt
werden nur **Summen**, ohne Konten, Cookies oder Kennungen, und keine IP-Adresse wird
gespeichert. Ein kleiner eigener Zähldienst übernimmt das, er ist das einzige Stück, das nicht
statisch ist. Dazu kommt ein Datenschutzhinweis, der Silas als Verantwortlichen nennt. Die Seite
geht zuerst ohne Zählen online, und das Zählen folgt wenige Tage später, solange noch gewählt
wird.

*Was genau gezählt wird* (E10), ist ein Vorschlag, den Silas vor dem Bau bestätigt: je Gruppe,
wie oft sie gewählt wurde, und je Tag fünf Abläufe (Seite geöffnet, Studiengang gewählt, erste
Gruppe gewählt, Plan vollständig, Plan geteilt).

## 4. Das Zielbild, wohin es wachsen kann

Nicht vor dem 12.10.2026. Die Reihenfolge entscheidet Silas nach der ersten Fassung, das meiste
mit Blick auf den nächsten Jahrgang:

- **Schöner:** deutlich schöner als das Vorbild (Silas: „vor allem von der Appearance“). Das
  ist der erste Ausbau nach dem Nachbau
- **Vorschläge:** automatisch konfliktfreie Kombinationen. Dafür braucht es nur die Termine.
  *Gute* Vorschläge, etwa beliebte oder volle Gruppen, brauchen die gezählten Daten aus §3
- **Ein freiwilliges Konto**, um den Plan zwischen Geräten abzugleichen. Die Grundbedienung
  bleibt ohne Konto: Wer zum ersten Mal kommt, muss nie eins anlegen (Silas)
- **Eine App** fürs Handy. Langfristig ist das wohl die bessere Form (Silas). Sie liest dieselbe
  Datendatei, deshalb muss die Datei von Anfang an sauber und eigenständig sein
- **Jeder Studiengang der TU Berlin**, jedes Fachsemester, auch außerhalb der Regelstudienzeit
- **Beliebige Module dazu** über die Suche (Wahlpflicht, Nebenfach, Wiederholer)
- **Mit Freunden planen:** Pläne nebeneinander legen und sehen, wer in derselben Gruppe sitzt
- **Kalender-Export** (ICS) mit allen echten Terminen
- **Englisch** für internationale Studierende
- **Geld:** Werbung oder Ähnliches erst, wenn viele es benutzen (Silas). Bis dahin nichts davon

## 5. Was es nicht ist — die Nicht-Ziele

- **Keine Anmeldung.** Der Stundenplanner meldet zu keinem Kurs, keiner Gruppe und keiner
  Prüfung an. Er verbindet sich mit keinem Konto in MOSES, ISIS oder einem anderen System der
  Hochschule
- **Keine persönlichen Daten auf einem Server.** Das gilt, bis das freiwillige Konto aus §4
  ein eigener Vorgang ist. Das anonyme Zählen aus §3 erfasst keine Personen
- **Keine Kopplung an Silas' andere Systeme.** Kein Abruf, keine Datenbank, kein Dienst und
  kein Schlüssel aus SILAS.OS, dem Study OS oder dem TOWER (Silas: „da darf niemals irgendwas
  vermischt werden“). Was aus dem Study OS übernommen wird, wird kopiert und mit Herkunft
  committet
- **Kein Study OS für alle:** keine Noten, kein Lernstand, keine Aufgaben
- **Keine anderen Hochschulen** in absehbarer Zeit: Ohne MOSES ist es ein anderes Projekt
- **Keine erfundenen Regeln:** Gruppenbindungen und Anmeldevorgaben, die die Quelle nicht
  nennt, behauptet die Seite nicht

## 6. Die Entscheidungen — wer, wann, was

E1–E5 und E9 hat `sichter` gefragt, E6–E8 anflug. Silas hat alle am 04.10.2026 entschieden, bis auf
den Feinschnitt E10. E5 und E7 hat er am 05.10.2026 nach seiner Hosting-Recherche geändert.

| | Frage | Entscheidung |
|---|---|---|
| **E1** | Für wen zuerst? | **Diese Erstis**, ab Vorlesungsbeginn 12.10.2026: WI, 1. Semester, Studiengangswahl eingebaut. Richtig gemacht wird es für den nächsten Jahrgang |
| **E2** | Konto und Abgleich zwischen Geräten? | **Grundbedienung ohne Konto.** Später ein freiwilliges Konto zum Abgleich. Bis dahin Browser plus Teilen-Link |
| **E3** | Website oder App? | **Erst eine Website**, damit niemand erst etwas herunterladen muss. Langfristig vermutlich eine App |
| **E4** | Selbst klicken oder Vorschläge? | **Selbst zusammenstellen** wie im Vorbild. Vorschläge später, gute Vorschläge mit den gezählten Daten |
| **E5** | Woher kommen die Daten? | **Der eigene öffentliche Abruf aus dem Repo, täglich in einem eigenen Container auf dem NAS, Auslieferung über Cloudflare** (Silas' Hosting-Recherche, 05.10.2026). Nie der Abruf des Study OS: Silas wollte ausdrücklich nichts, was Persönliches mitliefern könnte. Zuerst, am 04.10., hieß es „nicht vom NAS, täglich auf GitHub“ |
| **E6** | Impressum | **Silas, mit Name und Anschrift.** Die Anschrift steht erst im Impressum der Seite (Online-Vorgang), nicht in den Planungsdokumenten |
| **E7** | Adresse | **`stundenplanner.de` auf Cloudflare Pages**, gekauft am 05.10.2026. Zuerst, am 04.10., hieß es GitHub Pages zum Testen |
| **E8** | Lizenz | **Später.** Bis dahin öffentlich lesbar, nicht frei nutzbar |
| **E9** | Anonym mitzählen? | **Ja, noch in der Fassung vor dem 12.10.**, als eigener Schritt kurz nach dem Start: nur Summen, keine Kennungen, Datenschutzhinweis. Silas will das Verhalten der Nutzer kennenlernen |
| **E10** | Was genau wird gezählt? | **Vorschlag in §3**, Silas bestätigt ihn vor dem Bau von Schritt 5 |

## 7. Der Weg — als Vorgänge

| | Vorgang | Ergebnis |
|---|---|---|
| 1 | **Scope** (V-0210) | diese Datei |
| 2 | **Datenweg** | Abruf aus dem Study OS übernommen, Modulliste als Datei je Studiengang, Ergebnis als JSON, täglicher Lauf. Erledigt (V-0214, V-0215): alle 5 Module wie im Study OS |
| 3 | **Oberfläche nachbauen** | die Seite aus §3 mit Auswahl im Browser und Teilen-Link. `ops/test.sh` rechnet die Fälle des Vorbilds nach (Jahreswechsel, Ferienlücke, A/B, direkt anschließende Termine, Nachttermin) |
| 4 | **Online** | Container auf dem NAS, Cloudflare Pages unter stundenplanner.de (E7), Impressum (E6), Datenschutzhinweis, „kein offizielles Angebot“, Befehle in `.tower/airfield.json` |
| 5 | **Mitzählen** | E10 bestätigen lassen, dann der Zähldienst aus §3 (E9) und der Datenschutzhinweis dazu |
| 6 | **Schöner** | der Ausbau des Aussehens, danach das Zielbild in Silas' Reihenfolge |

2–5 gehören vor den 12.10.2026: 2–4 so früh in der Einführungswoche wie möglich, 5 wenige
Tage danach.
