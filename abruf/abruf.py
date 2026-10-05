"""Der Abruf: holt je Modul des Katalogs die öffentlichen MOSES-Daten und schreibt einen Rohstand.

Vertrag (Formate, Ordner, Befehle): docs/ARCHITEKTUR.md §3, §4 und §7. Ohne Datenbank, ohne
Scheduler und ohne Lock: Ein Lauf liest `katalog/`, holt jedes Modul eines Semesters EINMAL (auch
wenn es in mehreren Plänen steht, denn die Termine hängen an der Modulnummer) und schreibt je Modul
`<roh>/<semester-id>/<modulnummer>.json`, dazu `<roh>/<semester-id>/_lauf.json`.

Aufruf von jedem Arbeitsverzeichnis aus; der Katalog wird relativ zu dieser Datei gefunden, weil der
tägliche Lauf das Repo an einen anderen Ort klont und mit absolutem `--roh` aufruft:

    python3 abruf/abruf.py [--semester <id>] [--nur <modulnummer>] [--roh <ordner>]

Exit-Code 0, wenn jedes abgerufene Semester `ok` ist, sonst 1 (2 bei falschem Aufruf/Katalog).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

HIER = Path(__file__).resolve().parent
WURZEL = HIER.parent
sys.path.insert(0, str(HIER))  # moses.py liegt daneben, egal von wo aus aufgerufen wird

import katalog as K  # noqa: E402
import moses  # noqa: E402

KATALOG = WURZEL / 'katalog'
ROH = WURZEL / 'daten' / 'roh'
LAUF = '_lauf.json'

# Pause zwischen zwei Modulen, in Sekunden (Punkt aed3e76c). Der Abstand von 0,7 s in moses.Client gilt
# nur innerhalb eines Moduls, denn jedes Modul bekommt eine frische Sitzung; ohne diese Pause folgte
# die erste Anfrage des nächsten Moduls sofort auf die letzte des vorigen. Mit mehreren Studiengängen
# im Katalog (V-0228: 20 Module statt 5) wird daraus ein Dauerfeuer. Nie parallel: Ein Lauf holt
# ein Modul nach dem anderen.
PAUSE_MODULE = 2.0

# Eine Modulnummer landet in einer MOSES-Adresse und in einem Dateinamen. Nur Ziffern: Ein Tippfehler
# im Katalog wie "../70123" darf weder eine fremde Datei überschreiben noch eine fremde Seite holen.
NUMMER = re.compile(r'\d{3,8}')
SEMESTER_ID = re.compile(r'[a-z0-9][a-z0-9-]*')

try:
    from zoneinfo import ZoneInfo
    BERLIN = ZoneInfo('Europe/Berlin')
except Exception:  # ohne Zeitzonendaten lieber UTC mit Versatz als ein Zeitstempel ohne Zone
    BERLIN = timezone.utc


KatalogFehler = K.KatalogFehler  # ein Fehlertyp für den ganzen Katalog, wo immer er gelesen wird


def jetzt() -> str:
    return datetime.now(BERLIN).isoformat(timespec='seconds')


# --- Katalog -----------------------------------------------------------------------------------

def lade_katalog(katalog: Path = KATALOG, mit_vorschau: bool = False) -> dict:
    """Semester und abzurufende Pläne (docs/ARCHITEKTUR.md §3), gelesen und aufgelöst von katalog.py
    (Erbe der Vertiefungen, Sichtbarkeit); hier geprüft wird nur, was der MOSES-Abruf braucht.

    Abgerufen wird ein Plan nur, wenn er live ist (Vorschau nur mit `mit_vorschau`) und seine
    Hochschule den Abruf nicht sperrt. Eine Sperre gilt auch mit `mit_vorschau` (Punkt 7411bed1):
    Was übergangen wurde, steht je Semester unter `gesperrt` (Grund der Sperre, oder „Vorschau“),
    damit ein ausdrücklich genanntes Semester laut abgelehnt wird.
    Auch nicht wählbare Grundpläne zählen: Ihre Module stehen in den Plänen der Vertiefungen.
    """
    kat = K.lesen(katalog)
    semester = {}
    for sid, s in kat['semester'].items():
        if not SEMESTER_ID.fullmatch(sid):
            raise KatalogFehler(f'{sid}.json: "id" ist keine Semester-Kennung')
        if not isinstance(s.get('moses'), str) or not s['moses'].strip():
            raise KatalogFehler(f'{sid}.json: "moses" (Beschriftung der MOSES-Semesterwahl) fehlt')
        semester[sid] = s
    plaene, gesperrt = [], {}
    for p in kat['plaene']:
        sid = p['semester']['id']
        if not K.sichtbar(p, mit_vorschau):
            gesperrt.setdefault(sid, set()).add('Vorschau-Pläne nur mit --mit-vorschau')
            continue
        if p['hochschule']['abruf'] == 'gesperrt':
            gesperrt.setdefault(sid, set()).add(f"{p['hochschule']['kurz']}: {p['hochschule']['abruf_grund']}")
            continue
        for m in p['module']:
            if not NUMMER.fullmatch(m['nummer']):
                raise KatalogFehler(f'{p["studiengang"]["id"]}.json: ungültige Modulnummer {m["nummer"]!r}')
        plaene.append({**p['roh'], 'id': p['id'], 'studiengang': p['studiengang']['id'], 'semester': sid,
                       'module': p['module']})
    return {'semester': semester, 'plaene': plaene, 'gesperrt': gesperrt}


def module_je_semester(katalog: dict) -> dict[str, list[str]]:
    """Je Semester die Modulnummern aller Pläne, jede nur einmal, sortiert."""
    out: dict[str, set[str]] = {sid: set() for sid in katalog['semester']}
    for plan in katalog['plaene']:
        out[plan['semester']].update(m['nummer'] for m in plan.get('module', []))
    return {sid: sorted(nummern) for sid, nummern in out.items()}


# --- Ein Modul ---------------------------------------------------------------------------------

def hole_modul(client, nummer: str, ziel: str) -> dict:
    """Ein Modul aus MOSES, wie `run()` des Vorbilds es holte. Wirft, wenn ein Bestandteil scheitert:
    Ein halbes Modul wird nie geschrieben."""
    v = moses.choose_version(client.get(moses.MTS + 'ansehen.html?number=' + nummer), nummer, ziel)
    teile, suche, hinweise = moses.module_parts(client.get(v['url']), nummer, v['version'])
    bestandteile = [client.component(teil, ziel)[0] for teil in teile]
    return {'number': nummer, 'title': v['title'], **v, 'isis_url': suche,
            'notes': hinweise, 'components': bestandteile, 'semester': ziel}


def buchungen(daten: dict) -> int:
    return sum(len(g['bookings']) for c in daten.get('components', []) for g in c['groups'])


def fehlertext(exc: BaseException) -> str:
    """Die Fehlermeldung für Rohstand und _lauf.json. Beide werden veröffentlicht.

    Die Meldungen von moses.py sind feste Sätze, und urllib nennt nur Status und Grund. Trotzdem
    hält diese Funktion strukturell fest, dass kein Antwortkörper und keine MOSES-Sitzung
    mitkommt: nur die erste Zeile, keine jsessionid, Schluss beim ersten Zeichen, das nach HTML
    aussieht, höchstens 300 Zeichen.
    """
    text = f'{type(exc).__name__}: {exc}'
    text = (text.splitlines() or [''])[0]
    text = moses.public_url(text)
    html = re.search(r'<[A-Za-z!/?]', text)
    if html:
        text = text[:html.start()].rstrip() + ' […]'
    return text if len(text) <= 300 else text[:299] + '…'


# --- Schreiben ---------------------------------------------------------------------------------

def schreibe_atomar(pfad: Path, daten) -> None:
    """tmp im selben Ordner + rename: Ein Leser (bauen.py, ein abgebrochener Lauf) sieht den alten
    oder den neuen Stand, nie eine halbe Datei."""
    pfad.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.' + pfad.name + '.', suffix='.tmp', dir=pfad.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(daten, f, ensure_ascii=False, indent=1)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        # mkstemp legt 0600 an. Die Rohstände liest aber ein anderer Schritt (bauen.py, ein anderer
        # Benutzer im Container): Sie sind öffentliche Daten, also lesbar für alle.
        os.chmod(tmp, 0o644)
        os.replace(tmp, pfad)
    except BaseException:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def lies_vorbestand(pfad: Path):
    try:
        alt = json.loads(pfad.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        return None  # kaputte Datei: wie kein Vorbestand; sie wird durch einen Fehlerstand ersetzt
    return alt if isinstance(alt, dict) else None


def rohstand_erfolg(daten: dict, zeit: str) -> dict:
    return {**daten, 'abruf': {'geprueft_am': zeit, 'erfolg_am': zeit, 'fehler': None}}


def rohstand_fehler(vorbestand, nummer: str, ziel: str, zeit: str, meldung: str) -> dict:
    """Der Vorbestand bleibt, nur geprueft_am und fehler ändern sich. Ohne Vorbestand ein Rohstand
    mit leerer components-Liste, damit das Lesemodell das Modul trotzdem zeigt (mit Fehler)."""
    if vorbestand is None:
        return {'number': nummer, 'semester': ziel, 'components': [],
                'abruf': {'geprueft_am': zeit, 'erfolg_am': None, 'fehler': meldung}}
    abruf = dict(vorbestand.get('abruf') or {})
    abruf.update({'geprueft_am': zeit, 'fehler': meldung})
    abruf.setdefault('erfolg_am', None)
    return {**vorbestand, 'abruf': abruf}


# --- Der Lauf ----------------------------------------------------------------------------------

def lauf_semester(semester: dict, nummern: list[str], roh: Path, *, client_fabrik=None,
                  holer=hole_modul, uhr=jetzt, schreibe_lauf=True, log=print,
                  pause=PAUSE_MODULE, schlaf=None) -> dict:
    """Ein Semester: jedes Modul einmal, je Modul ein Rohstand, am Ende `_lauf.json`.

    Zwischen zwei Modulen wartet der Lauf `pause` Sekunden (vor dem ersten nicht), auch nach einem
    gescheiterten Modul. `schlaf` ist für Tests; ohne ihn `time.sleep`, zur Laufzeit nachgeschlagen.
    """
    client_fabrik = client_fabrik or moses.Client
    schlaf = schlaf or time.sleep
    ziel = semester['moses']
    ordner = roh / semester['id']
    lauf = {'gestartet_am': uhr(), 'beendet_am': None, 'status': 'error',
            'modules': 0, 'bookings': 0, 'errors': []}
    try:
        if not nummern:
            raise KatalogFehler(f'Kein Plan nennt Module für {semester["id"]}')
        for i, nummer in enumerate(nummern):
            if i:
                schlaf(pause)
            pfad = ordner / f'{nummer}.json'
            try:
                # Je Modul eine frische, loginfreie MOSES-Sitzung wie im Vorbild: Ein verklemmter
                # JSF-Zustand eines Moduls kann das nächste nicht verderben.
                daten = holer(client_fabrik(), nummer, ziel)
            except Exception as exc:
                meldung = fehlertext(exc)
                log(f'  ✗ {nummer}: {meldung}', file=sys.stderr)
                lauf['errors'].append({'module': nummer, 'message': meldung})
                schreibe_atomar(pfad, rohstand_fehler(lies_vorbestand(pfad), nummer, ziel, uhr(), meldung))
                continue
            n = buchungen(daten)
            schreibe_atomar(pfad, rohstand_erfolg(daten, uhr()))
            lauf['modules'] += 1
            lauf['bookings'] += n
            log(f'  ✓ {nummer} v{daten.get("version")}: {len(daten["components"])} Bestandteile, '
                f'{sum(len(c["groups"]) for c in daten["components"])} Gruppen, {n} Buchungen',
                file=sys.stderr)
        lauf['status'] = 'ok' if not lauf['errors'] else ('partial' if lauf['modules'] else 'error')
    except Exception as exc:
        lauf['errors'].append({'module': None, 'message': fehlertext(exc)})
        lauf['status'] = 'error'
    finally:
        lauf['beendet_am'] = uhr()
        if schreibe_lauf:
            schreibe_atomar(ordner / LAUF, lauf)
    return lauf


def lauf(*, katalog: Path = KATALOG, roh: Path = ROH, semester=None, nur=None, mit_vorschau=False, **kw) -> dict:
    """Alle (oder die genannten) Semester. Gibt je Semester das Ergebnis von lauf_semester zurück.

    Mit `nur` entsteht kein `_lauf.json`: Ein gezielter Nachabruf einzelner Module ist kein Lauf des
    Semesters, und `last_run` der Seite soll nicht „1 Modul“ melden, wo der Plan fünf hat.
    Ohne `mit_vorschau` werden nur Live-Pläne geholt (der tägliche Lauf). Ein ausdrücklich genanntes
    Semester, dessen Pläne alle Vorschau oder gesperrt sind, ist ein Aufruffehler, bevor etwas
    geschrieben wird: Sonst überschriebe ein `_lauf.json` mit „error“ den Stand eines Ordners, in dem
    nur nichts geholt werden durfte. (Ganz ohne Plan bleibt es ein gescheiterter Lauf, wie bisher.)
    """
    kat = lade_katalog(katalog, mit_vorschau)
    je = module_je_semester(kat)
    gewaehlt = list(semester) if semester else [sid for sid in kat['semester'] if je[sid]]
    for sid in gewaehlt:
        if sid not in kat['semester']:
            raise KatalogFehler(f'Semester {sid!r} steht nicht in katalog/semester/')
        if not je[sid] and kat['gesperrt'].get(sid):
            raise KatalogFehler(f'Für {sid} ist nichts abzurufen: ' + '; '.join(sorted(kat['gesperrt'][sid])))
    ergebnis = {}
    for sid in gewaehlt:
        nummern = je[sid]
        if nur:
            fremd = sorted(set(nur) - set(nummern))
            if fremd:
                raise KatalogFehler(f'{", ".join(fremd)} steht in keinem Plan von {sid}')
            nummern = [n for n in nummern if n in set(nur)]
        ergebnis[sid] = lauf_semester(kat['semester'][sid], nummern, roh,
                                      schreibe_lauf=not nur, **kw)
    return ergebnis


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description='Holt die öffentlichen MOSES-Daten je Modul des Katalogs '
                                            '(docs/ARCHITEKTUR.md §4, §7).')
    p.add_argument('--semester', action='append', metavar='ID',
                   help='Semester-ID aus katalog/semester/ (mehrfach möglich; Vorgabe: alle mit Plänen)')
    p.add_argument('--nur', action='append', metavar='MODULNUMMER',
                   help='nur dieses Modul (mehrfach möglich); schreibt kein _lauf.json')
    p.add_argument('--roh', type=Path, default=ROH,
                   help='Ordner der Rohstände (Vorgabe: daten/roh im Repo; relativ zum Arbeitsverzeichnis)')
    p.add_argument('--mit-vorschau', action='store_true',
                   help='auch Pläne mit "sichtbar": "vorschau" holen (nie im täglichen Lauf); gesperrte nie')
    p.add_argument('--katalog', type=Path, default=KATALOG, help=argparse.SUPPRESS)
    a = p.parse_args(argv)
    try:
        ergebnis = lauf(katalog=a.katalog, roh=a.roh.resolve(), semester=a.semester, nur=a.nur,
                        mit_vorschau=a.mit_vorschau)
    except KatalogFehler as exc:
        print(f'abruf: {exc}', file=sys.stderr)
        return 2
    if not ergebnis:
        print('abruf: kein Semester mit Plänen im Katalog', file=sys.stderr)
        return 2
    for sid, r in ergebnis.items():
        print(f'{sid}: {r["status"]} — {r["modules"]} Module, {r["bookings"]} Buchungen, '
              f'{len(r["errors"])} Fehler')
    return 0 if all(r['status'] == 'ok' for r in ergebnis.values()) else 1


if __name__ == '__main__':
    sys.exit(main())
