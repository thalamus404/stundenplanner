# Scope — was der Stundenplanner können und abdecken soll

> **Stand: ENTWURF** (V-0210, 04.10.2026). Was mit **OFFEN** markiert ist, entscheidet Silas,
> und jede offene Frage trägt eine Empfehlung. Erst wenn keine mehr offen ist, gilt diese Datei
> als Scope. Danach ändert sie sich nur mit einem Vorgang und einem Eintrag in der
> [`CHRONIK.md`](../CHRONIK.md).

---

## 1. Worum es geht

Studierende sollen ihren Stundenplan **schneller, einfacher und übersichtlicher** zusammenstellen
als in den Systemen der Hochschule. Sie wählen ihre Module, je Bestandteil eine Gruppe (Übung,
Tutorium …) und sehen sofort, wie ihre Woche aussieht und wo sich Termine überschneiden.

**Anlass:** die Einführungswoche im Oktober 2026. Die Vorlesungen beginnen am Montag, dem
12.10.2026, und in der Woche davor bauen viele Erstsemester gleichzeitig ihren ersten
Stundenplan. Daraus folgt die wichtigste Grenze dieses Scopes: Die **erste Fassung** muss in
Tagen stehen, nicht in Wochen. Alles, was das nicht schafft, steht im Zielbild (§4), nicht in
der ersten Fassung (§3).

## 2. Was es heute schon gibt — der Befund

Der Stundenplan des Study OS (Airfield `studyos`) ist das Vorbild. Gesichtet am 04.10.2026 (anflug,
sichter):

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

## 3. Die erste Fassung, zur Einführungswoche

**Ein getreuer Nachbau des Study-OS-Stundenplans, für jeden im Netz**, mit den Änderungen, die
„für viele statt für einen“ verlangt, und nicht mehr:

1. **Module und Bestandteile** mit offiziellen SWS und Links zu MOSES und zum
   Vorlesungsverzeichnis, die Hinweise der Module aufklappbar
2. **Gruppenwahl:** eine Gruppe je Bestandteil. Eine neue Wahl ersetzt die alte
3. **Wochenskelett** mit allen angebotenen Zeiten, Alternativen aufklappbar, dazu die
   **konkrete Woche** mit den echten Terminen
4. **Konflikte** aus sämtlichen Einzelterminen des Semesters. A/B-Ansicht nur bei erkanntem
   14-Tage-Rhythmus
5. **Geändert seit deiner Wahl:** Ändert sich Zeit oder Raum einer gewählten Gruppe, sagt die
   Seite es (der Fingerabdruck wandert mit der lokalen Auswahl)
6. **Speichern ohne Konto:** die Auswahl im Browser. Dazu ein **Teilen-Link**, der sie trägt:
   zum Mitnehmen aufs andere Gerät und zum Vergleichen mit anderen
7. **Für das Handy zuerst:** In der Einführungswoche wird am Telefon geplant
8. **Ehrlich über die Quelle:** Datenstand mit Uhrzeit, ein Hinweis bei veralteten Daten und
   gut sichtbar „kein offizielles Angebot der TU Berlin, verbindlich sind MOSES und die
   Anmeldungen dort“

Umfang der Daten: **OFFEN — E1**.

## 4. Das Zielbild, wohin es wachsen kann

Nicht für die Einführungswoche. Die Reihenfolge entscheidet Silas nach der ersten Fassung:

- **Jeder Studiengang der TU Berlin**, jedes Fachsemester, jedes Semester: Studiengang wählen,
  Module stehen da (ab §2 „Ungeprüft“ geklärt)
- **Beliebige Module dazu** über die Suche (Wahlpflicht, Nebenfach, Wiederholer)
- **Vorschläge:** automatisch konfliktfreie Kombinationen, auf Wunsch mit Vorlieben („freitags
  frei“, „nicht vor 10 Uhr“)
- **Mit Freunden planen:** Pläne nebeneinander legen und sehen, wer in derselben Gruppe sitzt
- **Kalender-Export** (ICS) mit allen echten Terminen
- **Aussehen:** deutlich schöner als das Vorbild (Silas: „vor allem von der Appearance“). Das
  ist der erste Ausbau nach dem Nachbau
- **Englisch** für internationale Studierende

## 5. Was es nicht ist — die Nicht-Ziele

- **Keine Anmeldung.** Der Stundenplanner meldet zu keinem Kurs, keiner Gruppe und keiner
  Prüfung an. Er verbindet sich mit keinem Konto in MOSES, ISIS oder einem anderen System der
  Hochschule
- **Kein Login und keine persönlichen Daten auf einem Server**, solange E2 nicht anders
  entschieden ist
- **Kein Study OS für alle:** keine Noten, kein Lernstand, keine Aufgaben
- **Keine anderen Hochschulen** in absehbarer Zeit: Ohne MOSES ist es ein anderes Projekt
- **Keine erfundenen Regeln:** Gruppenbindungen und Anmeldevorgaben, die die Quelle nicht
  nennt, behauptet die Seite nicht

## 6. Die Entscheidungen — OFFEN, bei Silas

Fünf davon hat `sichter` dir parallel im Chat gestellt (die „Knackfragen“). Hier stehen sie mit
Empfehlung, damit die Antworten an einem Ort landen.

| | Frage | Empfehlung | Warum |
|---|---|---|---|
| **E1** | Für wen ist die erste Fassung: diese Erstis (Beginn 12.10.2026) oder erst der nächste Jahrgang? Und welche Studiengänge? | **Diese Erstis, Start mit WI im 1. FS**, die Studiengangswahl aber schon eingebaut | Die Daten für WI gibt es heute. Weitere Studiengänge sind dann nur eine Modulliste mehr, keine neue Software |
| **E2** | Soll der Plan geräteübergreifend synchron sein (mit Login)? | **Nein. Lokal speichern plus Teilen-Link** | Ein Login heißt Konten, persönliche Daten, Datenschutz und Betrieb, und das schafft niemand in Tagen. Der Link deckt „aufs andere Gerät“ ab |
| **E3** | Browser-Link, iPhone-App oder beides? | **Eine Website**, die sich auf den Home-Bildschirm legen lässt | Eine Store-App braucht Wochen für Prüfung und Konto. Ein Link verbreitet sich in der Einführungswoche von allein |
| **E4** | Selbst klicken oder automatisch konfliktfreie Vorschläge? | **Selbst klicken** wie heute, Vorschläge als erster Ausbau | Nachbau zuerst, so war die Reihenfolge |
| **E5** | Dürfen die Daten vom NAS kommen (dort läuft der Abruf schon), oder alles extern? | **Alles extern:** eine statische Seite (z. B. GitHub Pages), der tägliche Abruf bei MOSES als geplanter Lauf auf GitHub | Das NAS bleibt privat und ist kein Ausfallpunkt. Eine statische Seite hält Andrang aus und kostet nichts. Der Abruf ist ein öffentlicher CSV-Export, einmal täglich |
| **E6** | Wer steht im Impressum? | — (deine Entscheidung) | *Vermutung, keine Rechtsberatung:* Eine öffentliche deutsche Website braucht nach § 5 DDG ein Impressum mit Namen und ladungsfähiger Anschrift, jedenfalls sobald sie geschäftsmäßig ist (Werbung macht sie dazu). Ohne Tracking und Cookies bleibt die Datenschutzerklärung kurz. Vor dem Start klären |
| **E7** | Unter welcher Adresse läuft es? | erst `thalamus404.github.io/stundenplanner`, eine eigene Domain später | kostet nichts und steht sofort. Eine Domain lässt sich nachziehen, ohne dass Links brechen müssen (Weiterleitung) |
| **E8** | Lizenz | **entschieden: später** (04.10.2026) | bis dahin öffentlich lesbar, nicht frei nutzbar |

## 7. Der Weg danach — als Vorgänge

| | Vorgang | Ergebnis |
|---|---|---|
| 1 | **Scope** (dieser, V-0210) | diese Datei ohne OFFEN |
| 2 | **Datenweg** | Abruf aus dem Study OS übernommen, die Modulliste als Datei je Studiengang statt aus einer Datenbank, das Ergebnis als JSON, ein täglicher Lauf (je nach E5) |
| 3 | **Oberfläche nachbauen** | die Seite aus §3, Auswahl im Browser, Teilen-Link, `ops/test.sh` rechnet die Fälle des Vorbilds nach (Jahreswechsel, Ferienlücke, A/B, direkt anschließende Termine) |
| 4 | **Online** | öffentliche Adresse (E7), Impressum (E6), Hinweis „kein offizielles Angebot“, Befehle in `.tower/airfield.json` |
| 5 | **Schöner** | der Ausbau des Aussehens, danach das Zielbild in Silas' Reihenfolge |

Ziel für 2–4: **vor Mitte der Einführungswoche.** Jeder Tag später ist ein Tag, an dem die
meisten ihren Plan schon gebaut haben.
