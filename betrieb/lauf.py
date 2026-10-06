#!/usr/bin/env python3
"""Der tägliche Lauf des Stundenplanners: holen, bauen, prüfen, ausliefern (docs/BETRIEB.md).

Das Muster (Silas, 05.10.2026): „Der NAS crawlt, Cloudflare liefert aus.“ Dieser Prozess läuft
im Container `stundenplanner-abruf`, baut nur AUSGEHENDE Verbindungen auf (GitHub, MOSES,
Cloudflare) und ist nie ein Webserver. Er teilt nichts mit anderen Systemen auf derselben
Maschine (AGENTS.md §2 ④): eigenes Netz, eigenes Volume, keine Datenbank, kein fremder Ordner.

Je Lauf:
  1. den Stand `main` von GitHub holen (live = main) nach /daten/repo
  2. python3 abruf/abruf.py --roh /daten/roh   (der Vorbestand im Volume trägt je Modul)
  3. python3 abruf/bauen.py --roh /daten/roh   (schreibt web/daten im geholten Stand)
  4. sh ops/test.sh                            (rot = nicht ausliefern)
  5. wrangler pages deploy                     (nur mit Token; ohne: „kein Token, nicht ausgeliefert“;
                                                 aus dem Klon, damit functions/ mitkommt, V-0271)

Scheitert ein Schritt vor 5, wird nichts ausgeliefert: Online bleiben die Daten des letzten
gelungenen Laufs. Die Seite zeigt ihr Alter selbst (stale nach 36 Stunden), und frische.yml
auf GitHub schlägt dann Alarm.

Aufrufe:
  python3 lauf.py            die Zeitplan-Schleife (CMD des Containers)
  python3 lauf.py --jetzt    ein Lauf auf Abruf; läuft schon einer, wartet er und meldet dessen Ergebnis
  python3 lauf.py --jetzt --ohne-abruf
                             derselbe Lauf ohne Schritt 2: baut aus dem Rohstand im Volume und
                             liefert aus, ohne MOSES zu fragen. So liefert `ops/bauen.sh live` aus.
  python3 lauf.py --status   der Zustand des letzten Laufs (JSON)

Exit-Codes von --jetzt: 0 ausgeliefert · 1 gescheitert, nichts ausgeliefert ·
3 gelungen, aber nicht ausgeliefert (kein Token, oder ein Testlauf mit STAND/REPO_URL — der lädt nie hoch).

MOSES FRAGT NUR DER ZEITPLAN (V-0241, 05.10.2026). Bis dahin fuhr jede Auslieferung nach main
(`ops/bauen.sh live`) einen vollen Lauf, also einen Abruf mehr je Freigabe; am 05.10. waren das
mehrere am Tag, ohne dass es jemand wollte. innoCampus (TU) sieht das Abrufen der Weboberfläche
nicht gern und sperrt auffällige Adressen. Seitdem fragt nur die Schleife MOSES, einmal am Tag;
`letzter_abruf_am` im Zustand merkt sich den letzten Abruf, damit ein Lauf ohne Abruf den
Tagestermin weder auslöst noch verdeckt.

Herkunft der Zeitplan-Schleife: serve() in stundenplan/runner.py des Study OS (kopiert, nicht
geteilt). Dort hielt eine Datenbank-Sperre den Lauf exklusiv; hier, ohne Datenbank, eine
Dateisperre im Volume (fcntl) und eine Zustandsdatei statt der Tabelle stundenplan_lauf.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

DATEN = Path(os.getenv('DATEN', '/daten'))
REPO_URL_LIVE = 'https://github.com/thalamus404/stundenplanner'
REPO_URL = os.getenv('REPO_URL', REPO_URL_LIVE)
# live = main. STAND ist ein Zweig und nur für Tests veränderbar (docs/BETRIEB.md).
STAND = os.getenv('STAND', 'main')
LAUF_UM = os.getenv('LAUF_UM', '05:20')
PAGES_PROJEKT = os.getenv('PAGES_PROJEKT', 'stundenplanner')
BERLIN = ZoneInfo('Europe/Berlin')

REPO = DATEN / 'repo'
ROH = DATEN / 'roh'
AUSLIEFERN = DATEN / 'ausliefern'
ZUSTAND = DATEN / 'letzter-lauf.json'
HERZ = DATEN / 'heartbeat'
SPERRE = DATEN / 'lauf.lock'
# Die Genehmigung, MOSES zu fragen (abruf/zugang.py: VARIABLE und TAEGLICHER_LAUF). Hier abgeschrieben,
# weil lauf.py im Image liegt und das Repo erst holt; abruf/tests/test_lauf.py hält beide gleich.
ABRUF_GENEHMIGT = 'STUNDENPLANNER_ABRUF_GENEHMIGT'

# Obergrenzen je Schritt in Sekunden. Ein hängender Schritt darf den Tag nicht blockieren;
# der Abruf wartet höflich zwischen Anfragen und braucht deshalb am längsten.
GRENZE = {'git': 300, 'pip': 300, 'abruf': 2700, 'bauen': 300, 'test': 600, 'ausliefern': 900}

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                    stream=sys.stdout)
log = logging.getLogger('lauf')


class Abbruch(Exception):
    """Ein Schritt ist gescheitert: nichts ausliefern, der Stand von gestern bleibt online."""


def jetzt_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def herz():
    DATEN.mkdir(parents=True, exist_ok=True)
    HERZ.touch()


def lies_zustand():
    try:
        return json.loads(ZUSTAND.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def schreib_zustand(zustand):
    # Erst daneben schreiben, dann umbenennen: Ein Abbruch mitten im Schreiben hinterlässt
    # sonst eine halbe Datei, und die Schleife hielte den Lauf für nie begonnen.
    tmp = ZUSTAND.with_suffix('.tmp')
    tmp.write_text(json.dumps(zustand, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(ZUSTAND)


def schritt(name, befehl, cwd=None, env=None, grenze=None, zeigen=True):
    """Einen Befehl fahren. Gibt (rc, ausgabe) zurück; die Ausgabe landet in einer Datei, nicht
    in einer Pipe (eine volle Pipe hält den Kindprozess an). Während er läuft, schlägt das Herz."""
    grenze = grenze or GRENZE.get(name, 600)
    herz()
    beginn = time.monotonic()
    with tempfile.TemporaryFile(mode='w+', encoding='utf-8', errors='replace') as aus:
        p = subprocess.Popen(befehl, cwd=cwd, env=env, stdout=aus, stderr=subprocess.STDOUT,
                             stdin=subprocess.DEVNULL)
        while True:
            try:
                rc = p.wait(timeout=15)
                break
            except subprocess.TimeoutExpired:
                herz()
                if time.monotonic() - beginn > grenze:
                    p.kill()
                    p.wait()
                    rc = 124
                    aus.write(f'\n(nach {grenze} s abgebrochen)\n')
                    break
        aus.seek(0)
        ausgabe = aus.read()
    dauer = round(time.monotonic() - beginn)
    if zeigen:
        zeilen = ausgabe.rstrip().splitlines()
        for zeile in zeilen[-60:]:
            log.info('  %s │ %s', name, zeile)
    log.info('%s: rc %s nach %s s', name, rc, dauer)
    return rc, ausgabe, dauer


def git_umgebung():
    env = dict(os.environ)
    env['GIT_TERMINAL_PROMPT'] = '0'   # ein öffentliches Repo braucht keine Anmeldung; nie fragen
    # Der Token gehört nur dem Ausliefern; kein anderer Schritt bekommt ihn zu sehen.
    env.pop('CLOUDFLARE_API_TOKEN', None)
    # Die Genehmigung für MOSES bekommt nur der Schritt abruf, auch wenn sie in der Umgebung stünde (V-0242).
    env.pop(ABRUF_GENEHMIGT, None)
    return env


def stand_holen(protokoll):
    env = git_umgebung()
    # Ein Klon, der woandershin zeigt (ein Testlauf mit REPO_URL), wird neu angelegt: Sonst holte
    # der nächste reguläre Lauf von einer Quelle, die es nicht mehr gibt.
    herkunft = subprocess.run(['git', '-C', str(REPO), 'remote', 'get-url', 'origin'], env=env,
                              capture_output=True, text=True).stdout.strip() if (REPO / '.git').is_dir() else ''
    if herkunft == REPO_URL:
        befehle = [['git', '-C', str(REPO), 'fetch', '-q', '--depth', '1', 'origin', STAND],
                   ['git', '-C', str(REPO), 'checkout', '-q', '-f', '--detach', 'FETCH_HEAD'],
                   # clean -x nimmt auch das Lesemodell von gestern mit: bauen.py schreibt es neu,
                   # und was nicht neu entsteht, darf nicht aus einem alten Lauf ausgeliefert werden.
                   ['git', '-C', str(REPO), 'clean', '-q', '-f', '-d', '-x']]
    else:
        shutil.rmtree(REPO, ignore_errors=True)   # ein halber Klon von einem abgebrochenen Lauf
        befehle = [['git', 'clone', '-q', '--depth', '1', '--single-branch', '--branch', STAND,
                    REPO_URL, str(REPO)]]
    for befehl in befehle:
        rc, _, dauer = schritt('git', befehl, env=env)
        protokoll.append({'schritt': 'git ' + befehl[3 if befehl[1] == '-C' else 1], 'rc': rc, 'sekunden': dauer})
        if rc != 0:
            raise Abbruch(f'Stand {STAND} ließ sich nicht von GitHub holen (git rc {rc})')
    rc, ausgabe, _ = schritt('git', ['git', '-C', str(REPO), 'rev-parse', '--short', 'HEAD'],
                             env=env, zeigen=False)
    return ausgabe.strip() if rc == 0 else '?'


def abhaengigkeiten(protokoll):
    """Das Image bringt abruf/requirements.txt seines Baustands mit. Ändert main sie danach,
    zieht der Lauf sie nach, statt mit alten Paketen zu rechnen (pip fragt nur, was fehlt)."""
    req = REPO / 'abruf' / 'requirements.txt'
    if not req.exists():
        return
    rc, _, dauer = schritt('pip', [sys.executable, '-m', 'pip', 'install', '--user', '-q',
                                   '--disable-pip-version-check', '--no-warn-script-location',
                                   '-r', str(req)], env=git_umgebung())
    protokoll.append({'schritt': 'pip', 'rc': rc, 'sekunden': dauer})
    if rc != 0:
        raise Abbruch(f'abruf/requirements.txt ließ sich nicht installieren (pip rc {rc})')


def ausliefern(commit, protokoll):
    """wrangler pages deploy. Die Ausgabe von wrangler wird NIE protokolliert: Sie kann Antwort-
    körper der Cloudflare-API enthalten. Protokolliert werden der Exit-Code, die Adresse der
    Auslieferung und Cloudflares Fehlercodes (`code: 1234`) — genug, um in der Doku nachzusehen."""
    token = os.getenv('CLOUDFLARE_API_TOKEN', '').strip()
    konto = os.getenv('CLOUDFLARE_ACCOUNT_ID', '').strip()
    if STAND != 'main' or REPO_URL != REPO_URL_LIVE:
        # live = main, und zwar der von GitHub. Ein Testlauf gegen einen anderen Stand darf nie
        # hochladen, auch nicht, wenn der Token im Container steckt.
        log.warning('Testlauf (Stand %s), nicht ausgeliefert — ausgeliefert wird nur main von GitHub', STAND)
        protokoll.append({'schritt': 'ausliefern', 'rc': None, 'sekunden': 0, 'hinweis': 'Testlauf'})
        return False
    if not token or not konto:
        fehlt = ' und '.join(n for n, w in (('CLOUDFLARE_API_TOKEN', token), ('CLOUDFLARE_ACCOUNT_ID', konto)) if not w)
        log.warning('kein Token, nicht ausgeliefert (%s fehlt in betrieb/.env)', fehlt)
        protokoll.append({'schritt': 'ausliefern', 'rc': None, 'sekunden': 0, 'hinweis': 'kein Token'})
        return False
    env = dict(os.environ)
    env.update({'CLOUDFLARE_API_TOKEN': token, 'CLOUDFLARE_ACCOUNT_ID': konto,
                'WRANGLER_SEND_METRICS': 'false', 'CI': 'true'})
    befehl = ['wrangler', 'pages', 'deploy', str(AUSLIEFERN), '--project-name', PAGES_PROJEKT,
              '--branch', 'main', '--commit-hash', commit, '--commit-dirty=true',
              '--commit-message', f'Lauf {datetime.now(BERLIN):%Y-%m-%d %H:%M} · {commit}']
    # cwd = der Klon (V-0271): wrangler sucht die Funktionen in ./functions (das Kalender-Abo,
    # functions/abo) und bündelt sie mit den Modulen aus web/, die sie importieren. Aus DATEN heraus
    # fand es keine, und die Seite lief ohne Abo; ausgeliefert wird trotzdem nur AUSLIEFERN.
    rc, ausgabe, dauer = schritt('ausliefern', befehl, cwd=str(REPO), env=env, zeigen=False)
    ausgabe = ausgabe.replace(token, '***')
    adresse = re.findall(r'https://[A-Za-z0-9.-]+\.pages\.dev\S*', ausgabe)
    codes = sorted(set(re.findall(r'code:\s*(\d{3,6})', ausgabe)))
    protokoll.append({'schritt': 'ausliefern', 'rc': rc, 'sekunden': dauer})
    if rc != 0:
        raise Abbruch(f'wrangler pages deploy rc {rc}' + (f', Cloudflare-Code {", ".join(codes)}' if codes else '')
                      + ' (Ausgabe absichtlich nicht protokolliert; von Hand: docs/BETRIEB.md)')
    log.info('ausgeliefert: %s', adresse[-1] if adresse else f'Projekt {PAGES_PROJEKT}, Zweig main')
    return True


def lauf_innen(zustand):
    protokoll = zustand['schritte']
    commit = stand_holen(protokoll)
    zustand['commit'] = commit
    log.info('Stand %s @ %s', STAND, commit)
    abhaengigkeiten(protokoll)

    ROH.mkdir(parents=True, exist_ok=True)
    env = git_umgebung()
    if not zustand['mit_abruf']:
        # Eine Auslieferung fragt MOSES nicht (V-0241): Sie baut aus dem Rohstand des letzten
        # Abrufs. Ohne Rohstand gäbe es nichts zu bauen; den ersten holt der Zeitplan oder von
        # Hand `ops/bauen.sh lauf --mit-abruf` (docs/BETRIEB.md).
        if not any(p.is_file() for p in ROH.rglob('*')):
            raise Abbruch('kein Rohstand im Volume — der erste Abruf kommt mit dem Zeitplan (docs/BETRIEB.md)')
        zustand['abruf'] = 'ausgelassen'
        log.info('abruf: ausgelassen, gebaut wird aus dem Rohstand im Volume (MOSES wird nicht gefragt)')
    else:
        # Die Genehmigung für Anfragen an MOSES trägt NUR dieser Schritt (V-0242, abruf/zugang.py):
        # Silas hat den täglichen Lauf genehmigt, sonst nichts. Test und Bauen laufen ohne sie.
        env_abruf = {**env, ABRUF_GENEHMIGT: 'taeglicher-lauf'}
        rc, _, dauer = schritt('abruf', [sys.executable, 'abruf/abruf.py', '--roh', str(ROH)], cwd=str(REPO), env=env_abruf)
        protokoll.append({'schritt': 'abruf', 'rc': rc, 'sekunden': dauer})
        if rc == 1:
            # Teilweise gescheitert ist kein Abbruch: Je gescheitertem Modul steht der letzte
            # gelungene Rohstand im Volume (docs/ARCHITEKTUR.md §4), und das Lesemodell sagt es.
            zustand['abruf'] = 'teilweise'
            log.warning('abruf: teilweise gescheitert, der Vorbestand trägt')
        elif rc != 0:
            raise Abbruch(f'abruf.py rc {rc}')
        else:
            zustand['abruf'] = 'ok'

    rc, _, dauer = schritt('bauen', [sys.executable, 'abruf/bauen.py', '--roh', str(ROH)], cwd=str(REPO), env=env)
    protokoll.append({'schritt': 'bauen', 'rc': rc, 'sekunden': dauer})
    if rc != 0:
        raise Abbruch(f'bauen.py rc {rc}')
    if not (REPO / 'web' / 'daten' / 'index.json').exists():
        raise Abbruch('bauen.py lief durch, aber web/daten/index.json fehlt')
    if not (REPO / 'web' / 'index.html').exists():
        # Eine Auslieferung ersetzt die ganze Seite. Ohne index.html stünden online nur Daten.
        raise Abbruch('web/index.html fehlt im Stand — keine Seite, nichts auszuliefern')

    rc, _, dauer = schritt('test', ['sh', 'ops/test.sh'], cwd=str(REPO), env=env)
    protokoll.append({'schritt': 'test', 'rc': rc, 'sekunden': dauer})
    if rc != 0:
        raise Abbruch(f'ops/test.sh rot (rc {rc}) — ein roter Stand wird nicht ausgeliefert')

    # Ausgeliefert wird die Seite, nicht ihre Werkstatt: ohne Tests und Anleitungen.
    shutil.rmtree(AUSLIEFERN, ignore_errors=True)
    shutil.copytree(REPO / 'web', AUSLIEFERN, ignore=shutil.ignore_patterns('tests', '*.md'))
    # Lücken, die Silas noch füllen muss (z. B. die Kontakt-E-Mail im Impressum), tragen
    # data-luecke. Sie halten die Auslieferung nicht an — ob die Seite mit einer Lücke online
    # geht, entscheidet Silas —, aber jeder Lauf sagt sie, statt sie still mitzunehmen.
    zustand['luecken'] = sorted(f'{p.name}: {m}' for p in AUSLIEFERN.rglob('*.html')
                                for m in re.findall(r'data-luecke="([^"]+)"', p.read_text(encoding='utf-8', errors='replace')))
    for luecke in zustand['luecken']:
        log.warning('Lücke in der Seite: %s', luecke)
    # DER STAND DER SEITE (V-0230, Punkt 0c0eed42): /api/stand sagt, welcher Commit ausgeliefert
    # ist. Der TOWER fragt dort (Haken `laeuft`, Nachweis der Freigabe) — eine statische Seite hat
    # keine Route, also liefert sie eine Datei an genau dieser Stelle aus; `_headers` gibt ihr den
    # JSON-Typ. Bis V-0230 antwortete dort nichts, und der Nachweis der ersten Freigabe fiel rot,
    # obwohl die Seite den neuen Stand trug.
    (AUSLIEFERN / 'api').mkdir(parents=True, exist_ok=True)
    (AUSLIEFERN / 'api' / 'stand').write_text(json.dumps(
        {'stand': commit, 'zweig': STAND, 'erzeugt_am': jetzt_iso()}, ensure_ascii=False) + '\n', encoding='utf-8')
    return ausliefern(commit, protokoll)


def letzter_abruf(z):
    """Wann zuletzt ein Lauf MOSES gefragt hat (begonnen, gelungen oder nicht). Zustände von vor
    V-0241 kennen das Feld nicht; damals fragte jeder Lauf, also gilt dort sein Beginn."""
    if z.get('letzter_abruf_am'):
        return z['letzter_abruf_am']
    return z.get('begonnen_am') if z.get('mit_abruf', True) else None


def lauf(warten=False, mit_abruf=True):
    """Ein Lauf unter der Dateisperre. Gibt den Endstatus zurück oder None, wenn ein anderer läuft
    (mit warten=True: auf ihn warten und SEINEN Status zurückgeben). mit_abruf=False baut aus dem
    Rohstand im Volume, ohne MOSES zu fragen (V-0241)."""
    DATEN.mkdir(parents=True, exist_ok=True)
    with open(SPERRE, 'w') as sperre:
        try:
            fcntl.flock(sperre, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            if not warten:
                return None
            log.info('ein Lauf läuft schon; ich warte auf ihn und melde sein Ergebnis')
            fcntl.flock(sperre, fcntl.LOCK_EX)
            return lies_zustand().get('status')
        begonnen = jetzt_iso()
        zustand = {'begonnen_am': begonnen, 'status': 'laeuft', 'stand': STAND,
                   'image': os.getenv('STAND_IMAGE', 'unbekannt'), 'schritte': [],
                   'mit_abruf': mit_abruf,
                   'letzter_abruf_am': begonnen if mit_abruf else letzter_abruf(lies_zustand())}
        schreib_zustand(zustand)
        log.info('Lauf beginnt (Image %s, Stand %s)', zustand['image'], STAND)
        try:
            zustand['status'] = 'ausgeliefert' if lauf_innen(zustand) else 'nicht_ausgeliefert'
            if zustand['status'] == 'ausgeliefert':
                zustand['meldung'] = None
            elif STAND != 'main' or REPO_URL != REPO_URL_LIVE:
                zustand['meldung'] = f'Testlauf (Stand {STAND}), nicht ausgeliefert'
            else:
                zustand['meldung'] = 'kein Token, nicht ausgeliefert'
        except Abbruch as exc:
            zustand['status'] = 'fehler'
            zustand['meldung'] = str(exc)[:500]
            log.error('Lauf gescheitert, nichts ausgeliefert: %s', zustand['meldung'])
        except Exception as exc:   # noqa: BLE001 — die Schleife muss weiterlaufen
            zustand['status'] = 'fehler'
            # Nur Typ und Text der Ausnahme, nie Umgebung oder Antwortkörper.
            zustand['meldung'] = f'{type(exc).__name__}: {exc}'[:500]
            log.error('Lauf gescheitert: %s', zustand['meldung'])
        zustand['beendet_am'] = jetzt_iso()
        schreib_zustand(zustand)
        herz()
        log.info('Lauf beendet: %s', zustand['status'])
        return zustand['status']


def faellig_seit(jetzt):
    stunde, minute = map(int, LAUF_UM.split(':'))
    faellig = jetzt.replace(hour=stunde, minute=minute, second=0, microsecond=0)
    return faellig - timedelta(days=1) if jetzt < faellig else faellig


def schleife():
    """Ein Versuch je Tag, auch nach Neustarts; ein verpasster Lauf wird nachgeholt. Wie serve()
    im Vorbild: Ein gescheiterter Lauf wird erst zum nächsten Termin wiederholt, die Daten des
    letzten gelungenen Laufs bleiben so lange online."""
    log.info('Zeitplan: täglich %s Europe/Berlin, Stand %s, Projekt %s', LAUF_UM, STAND, PAGES_PROJEKT)
    while True:
        herz()
        try:
            z = lies_zustand()
            # Gemessen am letzten ABRUF, nicht am letzten Lauf (V-0241): Eine Auslieferung ohne
            # Abruf nach 05:20 darf einen verpassten Tagesabruf nicht verdecken.
            abruf = letzter_abruf(z)
            abruf = datetime.fromisoformat(abruf) if abruf else None
            faellig = faellig_seit(datetime.now(BERLIN))
            # 'laeuft' im Zustand heißt: Ein Lauf wurde begonnen und nicht beendet (Container
            # gestoppt, Absturz). Hält ihn noch jemand (ein --jetzt), gibt lauf() None zurück.
            # Ein abgebrochener Lauf OHNE Abruf löst keinen Abruf aus.
            haengt = z.get('status') == 'laeuft' and z.get('mit_abruf', True)
            if abruf is None or abruf < faellig or haengt:
                lauf()
        except Exception as exc:   # noqa: BLE001
            log.error('Zeitplan: %s', type(exc).__name__)
        time.sleep(60)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Der tägliche Lauf des Stundenplanners (docs/BETRIEB.md).')
    ap.add_argument('--jetzt', action='store_true', help='einen Lauf jetzt fahren')
    ap.add_argument('--ohne-abruf', action='store_true',
                    help='mit --jetzt: aus dem Rohstand im Volume bauen und ausliefern, MOSES nicht fragen')
    ap.add_argument('--status', action='store_true', help='den Zustand des letzten Laufs zeigen')
    a = ap.parse_args(argv)
    if a.status:
        print(json.dumps(lies_zustand(), ensure_ascii=False, indent=2))
        return 0
    if a.jetzt:
        status = lauf(warten=True, mit_abruf=not a.ohne_abruf)
        return {'ausgeliefert': 0, 'nicht_ausgeliefert': 3}.get(status, 1)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    schleife()
    return 0


if __name__ == '__main__':
    sys.exit(main())
