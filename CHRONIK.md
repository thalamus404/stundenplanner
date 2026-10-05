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
