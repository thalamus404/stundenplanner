# Chronik — der Stundenplanner

Was wann passiert ist, das Neueste oben. Ein Eintrag sagt, was entschieden wurde und warum,
nicht jeden Commit: Die Commits stehen in git, die Vorgänge im TOWER.

---

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
