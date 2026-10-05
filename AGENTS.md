# Hier anfangen — der Stundenplanner

> **Dieses Repo wird im TOWER gebaut.** Melde dich an, bevor du liest, planst oder eine Datei anfasst:
> `tower anmelden <rufzeichen> "<deine Rolle>"` — die Antwort ist die Lage, und sie ist aktueller als jede Datei.
> Das Protokoll (Vorgang, Arbeitsbaum, Punkte, Sichtung, Bericht, dev) liefert dein TOWER: `/tower/doku/PROTOKOLL.md`.
> Ohne `tower` im PATH: `sh ~/.tower/kit/<pin>/tower anmelden …` (Pin: `kit` in `.tower/airfield.json`) — `tower kit verteiler` legt `tower` in den PATH, `tower hilfe` nennt jeden Befehl.
> Ist der TOWER stumm, warnt der Hook und merkt vor; gesperrt wird nur, wenn er antwortet und ablehnt.
> Was DIESES Airfield ist, steht darunter. Was der TOWER ist, steht dort.

Dies ist der **einzige** Einstieg in `stundenplanner`, für Menschen und für Agenten.
`CLAUDE.md` ist ein Symlink auf diese Datei. Wer nur das Werkzeug benutzen oder verstehen will,
liest die [`README.md`](README.md).

---

## 1. Wo du bist

**Das Airfield `stundenplanner`**: ein öffentliches Werkzeug, mit dem Studierende ihren
Stundenplan zusammenstellen, schneller, einfacher und übersichtlicher als in den Systemen der
Hochschule. Das Repo `thalamus404/stundenplanner` ist **öffentlich** und wurde am 04.10.2026
gegründet. Es ist ein eigenes Airfield, kein Kind eines anderen: Es steht auf keinem fremden
Fundament.

**Das Vorbild** ist der Stundenplan des Study OS (Airfield `studyos`, Repo `thalamus404/studyOS`:
`stundenplan/` holt die Daten, `app/stundenplan.py` und `app/static/stundenplan.*` bilden den
Wochenbaukasten). Dort ist er für **einen** Studenten und **ein** Semester gebaut. Hier wird er
für viele gebaut. **Lesen darfst du dort, gebaut wird hier.** Was du übernimmst, kopierst du
bewusst und nennst die Herkunft im Commit. Eine Abhängigkeit auf das andere Repo gibt es nicht.

**Was es können soll und was nicht, steht im Scope: [`docs/SCOPE.md`](docs/SCOPE.md)**
(festgelegt am 04.10.2026). Lies ihn, bevor du etwas baust. Ein Wunsch, der dort nicht steht oder
§5 dort widerspricht, geht erst an Silas.

## 2. Die Regeln

**① Das Repo ist öffentlich.** Alles, was du committest, liest die ganze Welt, auch alte
Commits. Deshalb gehört nichts davon hinein, weder in Code noch in Commits, Issues, Testdaten
oder Pull Requests:
- ein Geheimnis (Token, Passwort, Schlüssel, `.env`)
- eine Adresse oder ein Pfad der Werkstatt (Host, Port, IP des Heimnetzes, Gerätepfad)
- persönliche Daten: keine echte Auswahl eines Menschen, keine Matrikelnummer, keine Sitzung
  eines Hochschulsystems

Testdaten sind erfunden oder stammen aus öffentlich abrufbaren Quellen. `sh ops/test.sh` prüft
das Muster. Rutscht trotzdem etwas durch, ist es öffentlich: Sag es Silas sofort. Ein
Folgecommit macht es nicht ungeschehen.

**② Jeder Commit geht nach GitHub.** Ein Commit, der nur auf einer Platte liegt, ist für alle
anderen unsichtbar, und der Klon selbst ist nicht die Wahrheit. GitHub ist es.

**③ Nichts wird still gelöscht, und nichts bleibt still liegen.** Was du abschaltest, entfernst
du ganz, mit den Sätzen, die es beschreiben.

**④ Getrennt von allem anderen.** Der Stundenplanner ist eine eigene Infrastruktur. Er hat
nichts mit SILAS.OS, dem Study OS oder dem TOWER gemein: kein Abruf, keine Datenbank, kein
Dienst, kein Schlüssel und keine Datei von dort. Er wird höchstens im TOWER gebaut und liegt
vielleicht am selben Ort (Silas, 04.10.2026: „da darf niemals irgendwas vermischt werden“). Was
du aus dem Vorbild übernimmst, kopierst du und nennst die Herkunft (§1). Die Wahrheit ist git.

**⑤ Bedeutung, Prioritäten und Grundentscheidungen entscheidet Silas**, die technische Umsetzung
der Agent. Was in den Scope gehört, gehört dazu: Funktionen, Hochschulen, Lizenz, Betrieb,
Geld.

**⑥ Axiom 0: reparieren, dokumentieren, unmöglich machen.** Geht etwas kaputt, schuldest du
drei Dinge: Es soll wieder gehen. Der Grund steht dort, wo der Nächste denselben Fehler machen
würde. Und eine Änderung sorgt dafür, dass diese Klasse Fehler nicht wiederkommt. Geht das
nicht, sag laut, warum.

Dass jede Änderung ein Vorgang ist (Arbeitsbaum `.arbeit/v-00NN`, Punkte, Bericht, Weg über
`dev`, nach `main` nur mit Silas' Freigabe), ist keine Regel dieses Repos. Es ist das Protokoll
des TOWER (Block oben).

## 3. Befehle

| | |
|---|---|
| Test | `sh ops/test.sh`: die Regeln eines öffentlichen Repos (§2 ①), die Haustür und jede Datei `abruf/tests/test_*.py` und `web/tests/*.test.mjs`. Neue Tests legst du dorthin, `ops/test.sh` findet sie |
| Abruf, Bauen, Ansehen | `python3 abruf/abruf.py` · `python3 abruf/bauen.py` · `python3 -m http.server -d web 8000` (docs/ARCHITEKTUR.md §7) |
| Oberfläche messen | `python3 ops/sicht.py --web web`: alle Fenstergrößen aus docs/DESIGN.md §8, hell und dunkel, kein Scrollen der Standardansicht, Kontrast, Tippziele, Bytes (braucht Playwright) |
| Ausliefern | `sh ops/bauen.sh live [<stand>]`: der Container `stundenplanner-abruf` auf dem NAS baut aus `main` und lädt zu Cloudflare hoch (`befehle.bau_live`, so ruft es die Freigabe). Alles Weitere, auch `zugang`, `einrichten`, `status`, `rueckweg`: docs/BETRIEB.md §4 |
| Vorschau, Dev-Hub im TOWER | keine: Es gibt keinen Server. Den Stand eines Zweigs siehst du lokal mit dem Befehl oben. `tower vorgang fertig` braucht deshalb `TOWER_PRUEFZIEL=arbeitsbaum` (Punkt dcd0ebbd) |

## 4. Wohin du weiterliest

| Thema | Datei |
|---|---|
| Was das Werkzeug ist, für alle | [`README.md`](README.md) |
| **Wie es gebaut ist**: Teile, Ordner, Datenformate, Befehle | [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) |
| **Wie es aussieht und sich bedient**: Layout je Breite, Tokens, Abnahmekriterien. Vor jeder Arbeit an `web/` lesen | [`docs/DESIGN.md`](docs/DESIGN.md) |
| Wie es online bleibt: Container, Cloudflare, was bei Fehlern passiert | [`docs/BETRIEB.md`](docs/BETRIEB.md) |
| Was wann passiert ist | [`CHRONIK.md`](CHRONIK.md) |
| **Was es können soll und was nicht**: zuerst lesen | [`docs/SCOPE.md`](docs/SCOPE.md) |

---

*Diese Datei ist absichtlich kurz. Was hier nicht steht, kommt aus der Anmeldung oder aus dem
Protokoll des TOWER.*
