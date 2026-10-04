# Betrieb — wie der Stundenplanner online bleibt

> **Das Muster (Silas, 05.10.2026): „Der NAS crawlt, Cloudflare liefert aus.“** Ein eigener
> Container auf dem NAS holt einmal am Tag die Termine aus MOSES, baut das Lesemodell und lädt die
> fertige Seite zu Cloudflare Pages hoch. Der NAS baut dafür nur **ausgehende** Verbindungen auf
> (GitHub, MOSES, Cloudflare) und ist **nie ein Webserver**: kein Port, keine Weiterleitung, kein
> Weg von außen hinein. Die Besucher sprechen nur mit Cloudflare.

**Warum nicht GitHub Pages und GitHub Actions** (Kurswechsel vom 05.10.2026, vorher so geplant):
GitHub Pages untersagt den Betrieb als „online business“, und Werbung kommt vielleicht später
(docs/SCOPE.md §4). GitHub-Runner kommen aus Azure-Adressen, die eine Hochschule jederzeit sperren
kann. Die Probe vom 05.10.2026 zeigte zwar, dass MOSES GitHub antwortet (`probe-moses.yml`), aber
ein Abruf von einer festen Adresse zu Hause ist berechenbarer. GitHub Pages ist **aus**.

## 1. Was wo läuft

| Wo | Was | Datei |
|---|---|---|
| NAS, Container `stundenplanner-abruf` | täglich 05:20 (Europe/Berlin): holen, bauen, prüfen, ausliefern | `betrieb/lauf.py`, `betrieb/Dockerfile`, `betrieb/docker-compose.yml` |
| Cloudflare Pages, Projekt `stundenplanner` | liefert `web/` aus, Daten in `web/daten/` | (Direct Upload, kein Git-Anschluss) |
| GitHub Actions | Test bei jedem Push | `.github/workflows/test.yml` |
| GitHub Actions | täglich: Sind die ausgelieferten Daten frisch? | `.github/workflows/frische.yml` |
| GitHub Actions, nur von Hand | Antwortet MOSES GitHubs Servern? (Rückfall) | `.github/workflows/probe-moses.yml` |

**Live ist `main`.** Der Lauf holt jedes Mal den Stand `main` von GitHub. Was in `dev` liegt, geht
erst online, wenn Silas es nach `main` freigibt. Die Freigabe baut den Container neu und löst
sofort einen Lauf aus (`befehle.bau_live` in `.tower/airfield.json`).

**Die Seite:** `https://stundenplanner.de` (Silas hat die Domain am 05.10.2026 gekauft) und
`https://www.stundenplanner.de`. Bis die Domain auf Cloudflare zeigt, gilt die Adresse des
Pages-Projekts, `https://stundenplanner.pages.dev` (die vergibt Cloudflare nach dem
Projektnamen; ist der Name vergeben, hängt Cloudflare etwas an, `einrichten` nennt sie).

**Getrennt von allem anderen** (AGENTS.md §2 ④): Der Container ist ein eigenes Compose-Projekt
`stundenplanner` mit eigenem Netz (`stundenplanner_default`) und eigenem benannten Volume
(`stundenplanner-daten`). Er hat keine Datenbank, keinen Port, keinen Bind-Mount und keinen
Schlüssel außer dem Cloudflare-Token in `betrieb/.env`. Er teilt nichts mit den anderen Diensten
derselben Maschine. **Keine Bind-Mounts**: Docker löst Host-Pfade auf dem Host auf, nicht dort,
wo `docker compose` aufgerufen wird. Ein Pfad aus einem Container heraus zeigte deshalb auf dem
Host ins Leere oder in einen fremden Ordner.

## 2. Was täglich passiert

`betrieb/lauf.py` im Container, eine Schleife wie `serve()` im Study OS:

1. **Stand holen:** `main` von `https://github.com/thalamus404/stundenplanner` nach
   `/daten/repo` (erst `git clone`, danach `fetch` und `clean`; das Lesemodell von gestern fliegt
   dabei raus)
2. **Abruf:** `python3 abruf/abruf.py --roh /daten/roh`. Exit 1 heißt „teilweise“ und ist **kein
   Abbruch**: Je gescheitertem Modul bleibt der letzte gelungene Rohstand im Volume stehen
   (docs/ARCHITEKTUR.md §4), und das Lesemodell sagt es. Exit 2 (Katalog oder Aufruf falsch) bricht ab
3. **Bauen:** `python3 abruf/bauen.py --roh /daten/roh` schreibt `web/daten/` im geholten Stand
4. **Prüfen:** `sh ops/test.sh`. Ein roter Stand wird nicht ausgeliefert
5. **Ausliefern:** `web/` ohne `tests/` und `*.md` mit `wrangler pages deploy … --branch main`
   zu Cloudflare. Ohne Token in `betrieb/.env` endet der Lauf hier mit **„kein Token, nicht
   ausgeliefert“**

Ein verpasster Lauf (NAS aus, Container gestoppt, Neustart) wird nachgeholt, sobald der
Container wieder läuft. Ein unterbrochener Lauf wird wiederholt. Zwei Läufe zugleich verhindert
eine Dateisperre im Volume.

**Was im Volume `stundenplanner-daten` liegt:** `repo/` (der geholte Stand), `roh/` (die
Rohstände, der Vorbestand je Modul — **das Einzige, was nicht neu entstehen kann**; verloren
heißt: Ein Modul, das am nächsten Tag scheitert, steht ohne Termine da), `ausliefern/` (was
zuletzt hochgeladen wurde), `letzter-lauf.json` (Zustand), `heartbeat`, `lauf.lock`.

## 3. Wenn ein Lauf scheitert

- **Die Daten von gestern bleiben online.** Ausgeliefert wird nur nach gelungenem Bauen und
  grünem Test. Cloudflare behält den letzten Upload
- **Wiederholt wird zum nächsten Termin** (05:20 am nächsten Tag), wie im Vorbild. Von Hand
  sofort: §4
- **Die Seite sagt es selbst:** Ist `success_at` eines Moduls älter als 36 Stunden, zeigt sie
  „veraltet“ (docs/ARCHITEKTUR.md §5). Ein gescheitertes Modul zeigt seinen Fehler
- **GitHub sagt es Silas:** `frische.yml` liest täglich um 09:17 UTC
  `<SEITE_URL>/daten/index.json` und wird rot, wenn `erzeugt_am` älter als 36 Stunden ist. Ein
  roter geplanter Lauf kommt als Mail von GitHub. `SEITE_URL` ist eine Repo-Variable (Settings →
  Secrets and variables → Actions → Variables): `https://stundenplanner.de`, bis dahin die
  pages.dev-Adresse. **Erst setzen, wenn die Seite unter der Adresse wirklich antwortet**, sonst
  ist der Job ab dem ersten Tag rot. Ohne sie überspringt der Job mit einem Hinweis. Geplante Workflows laufen nur auf `main`, und GitHub
  schaltet sie nach 60 Tagen ohne Aktivität im Repo ab. Dann im Reiter Actions wieder einschalten
- **Das Protokoll:** `docker logs stundenplanner-abruf` und `sh ops/bauen.sh status`. Die
  Ausgabe von wrangler wird absichtlich **nicht** protokolliert (sie kann Antwortkörper der
  Cloudflare-API enthalten). Protokolliert werden Exit-Code und Cloudflares Fehlercodes
  (`code: 1234`), nachzuschlagen in der Cloudflare-Doku. Den Token schreibt kein Schritt hin, und
  kein Schritt außer dem Ausliefern bekommt ihn zu sehen

| Meldung | Bedeutung |
|---|---|
| `kein Token, nicht ausgeliefert` | `betrieb/.env` fehlt oder ist leer, §5 |
| `abruf.py rc 2` | Katalog oder Aufruf falsch, oder `abruf/abruf.py` fehlt im Stand `main` |
| `ops/test.sh rot` | `main` ist rot. Erst reparieren, dann ausliefern |
| `web/index.html fehlt im Stand` | in `main` gibt es noch keine Seite |
| `wrangler … Cloudflare-Code 6003, 6111, 9106` | Token fehlt oder hat kein gültiges Format (so gemessen am 05.10.2026 mit einem Falschwert) |
| `wrangler … Cloudflare-Code 10000` | Token ungültig oder ohne die Berechtigung aus §5 |
| `wrangler … Cloudflare-Code 8000007` | das Pages-Projekt gibt es nicht (Name in `PAGES_PROJEKT`) |
| `Lücke in der Seite: <datei>: <name>` | Warnung, kein Abbruch: Eine Seite trägt eine Stelle mit `data-luecke="<name>"`, die Silas noch füllen muss. So markiert man eine Lücke, statt etwas zu erfinden |

## 4. Von Hand

Aus einem Klon des Repos auf dem NAS, dort, wo git und docker sind (aus dem Hauptklon oder einem
Arbeitsbaum, das Skript rechnet den Hauptklon selbst aus):

| Befehl | Was |
|---|---|
| `sh ops/bauen.sh live` | Image aus `origin/main` bauen, Container neu starten, Lauf sofort |
| `sh ops/bauen.sh live <stand>` | dasselbe aus einem bestimmten Commit (so ruft es die Freigabe auf: `befehle.bau_live`) |
| `sh ops/bauen.sh live <stand> --probe` | nur prüfen, bis vor `docker build` (`befehle.bau_probe`) |
| `sh ops/bauen.sh lauf` | einen Lauf jetzt, ohne neu zu bauen. Läuft schon einer, wartet er und meldet dessen Ergebnis |
| `sh ops/bauen.sh status` | Zustand des letzten Laufs |
| `sh ops/bauen.sh rueckweg` | Container auf das Image vor dem letzten Bau zurücksetzen |
| `sh ops/bauen.sh zugang` | Cloudflare-Token und Account-ID **unsichtbar** abfragen und nach `<hauptklon>/betrieb/.env` schreiben (Rechte 600). Braucht ein Terminal: über ssh mit `-t`, in einen Container mit `docker exec -it` |
| `sh ops/bauen.sh einrichten` | bei Cloudflare anlegen, was fehlt: Pages-Projekt, die eigenen Domains am Projekt, je Domain den DNS-Eintrag. Wiederholbar: Ein zweiter Aufruf ändert nichts und zeigt den Status (`betrieb/einrichten.py`) |

Exit-Codes von `live` und `lauf`: **0** ausgeliefert · **1** gescheitert, nichts ausgeliefert ·
**3** Lauf gelungen, aber nicht ausgeliefert (kein Token oder Testlauf). 3 ist absichtlich nicht
grün: Live ist, was bei Cloudflare liegt.

Das Image wird aus `git archive <stand>` gebaut, nicht aus dem Ordner: Darin steckt genau ein
Commit, egal in welchem Arbeitsbaum man steht. Die `.env` kommt immer aus dem **Hauptklon**
(`<klon>/betrieb/.env`), nie aus einem Arbeitsbaum.

**wrangler ist gepinnt** (`WRANGLER_VERSION` in `betrieb/Dockerfile`). Anheben heißt: die Zeile
ändern, `sh ops/bauen.sh live`, einen Lauf mit Token beobachten.

**Ein Testlauf gegen einen anderen Stand** (zum Prüfen eines Zweigs vor der Freigabe):
`docker exec -e STAND=<zweig> stundenplanner-abruf python3 /opt/stundenplanner/lauf.py --jetzt`.
Er holt, ruft ab, baut und prüft, lädt aber **nie** hoch: `lauf.py` liefert nur `main` von
GitHub aus, auch wenn der Token im Container steckt. Er nutzt dieselben Rohstände im Volume, als
Vorbestand und als Ziel.

**Abschalten** (AGENTS.md §2 ③: ganz, nicht halb): `docker compose -p stundenplanner down`,
`docker image rm stundenplanner-abruf:live stundenplanner-abruf:vorher`, das Volume
`stundenplanner-daten` erst, wenn auch die Rohstände nicht mehr gebraucht werden, das
Pages-Projekt bei Cloudflare, und die Sätze hier.

## 5. Was Silas einmal tun muss

In dieser Reihenfolge (Silas, 05.10.2026). Die Domain `stundenplanner.de` liegt bei Porkbun.

1. **Cloudflare-Konto** anlegen (Free) und dort `stundenplanner.de` als **Site** hinzufügen
   (Free-Plan). Cloudflare übernimmt dabei die vorhandenen DNS-Einträge, auch die Parkseite von
   Porkbun. Die ersetzt `einrichten` in Schritt 5
2. **Nameserver bei Porkbun:** die vier Porkbun-Nameserver durch die zwei ersetzen, die Cloudflare
   nennt. Bis Cloudflare die Zone als aktiv meldet, können Stunden vergehen
3. **API-Token** anlegen (My Profile → API Tokens → Create Custom Token) mit genau diesen
   Berechtigungen: **Account → Cloudflare Pages → Edit** (nur dieses Konto) und **Zone → DNS →
   Edit** (nur die Zone `stundenplanner.de`). Nichts sonst. Dazu die **Account-ID** aus der
   Kontoübersicht
4. **Token und Account-ID auf den NAS:** `sh ops/bauen.sh zugang` in einem Klon auf dem NAS. Es
   fragt beide Werte ab, ohne sie anzuzeigen, und schreibt `betrieb/.env` im Hauptklon mit Rechten
   600 (Vorlage der Namen: `betrieb/.env.example`). Der Token gehört in keinen Chat, keinen Commit
   und auf keine Kommandozeile. Die Datei wird nie committet (`.gitignore`: `.env`)
5. **Danach der Agent**, beides wiederholbar:
   `sh ops/bauen.sh einrichten` legt das Pages-Projekt `stundenplanner` an (Production branch
   `main`), hängt `stundenplanner.de` und `www.stundenplanner.de` als Custom Domains an und legt
   je Domain den DNS-Eintrag `CNAME → <projekt>.pages.dev` an (proxied). Über die API legt Pages
   diesen Eintrag nicht selbst an. Ein Parkeintrag von Porkbun wird ersetzt, jeden anderen fremden
   Eintrag lässt das Skript stehen und meldet ihn. Dann `sh ops/bauen.sh live`: Container mit der
   neuen `.env`, Lauf, erste Auslieferung. Liegt `main` noch ohne Seite da, meldet der Lauf das
   (§3), und die Auslieferung folgt mit der Freigabe
6. **Email Routing** in Cloudflare einschalten (Zone `stundenplanner.de` → Email → Email Routing),
   `kontakt@stundenplanner.de` an Silas' Postfach weiterleiten und die Zieladresse bestätigen. Den
   Bestätigungsklick in der Mail macht Silas. **Bis dahin kommt an `kontakt@stundenplanner.de`
   nichts an**, obwohl die Adresse schon im Impressum steht
7. **Die Domain selbst:** bei Porkbun Domain-Lock und automatische Verlängerung einschalten. Die
   Inhaberprüfung der DENIC (NIS2) per E-Mail innerhalb von 30 Tagen beantworten. Nach dem
   Nameserver-Wechsel **DNSSEC** in Cloudflare einschalten (DNS → Settings) und den DS-Eintrag, den
   Cloudflare dann zeigt, bei Porkbun eintragen
8. **In Cloudflare ausgeschaltet lassen:** Web Analytics für das Pages-Projekt und Bot Fight
   Mode. Beide setzen Skripte oder Cookies, und `web/datenschutz.html` sagt, dass es keine gibt.
   Wer eins davon einschaltet, ändert zuerst die Datenschutzseite
9. **Repo-Variable `SEITE_URL`** auf GitHub auf `https://stundenplanner.de` setzen, sobald die Seite
   dort antwortet (§3)
10. **Die Freigabe nach `main`**: Erst danach liefert der Lauf die Seite aus. `main` braucht dafür
    `abruf/`, `web/index.html` und diese Dateien

Der Container hängt an keinem Pfad des Klons. Zieht der Klon um, läuft er weiter; nur
`betrieb/.env` muss danach im neuen Hauptklon liegen, bevor das nächste `ops/bauen.sh live` den
Container neu anlegt.
