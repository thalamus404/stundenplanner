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

import moses  # noqa: E402
import modulliste  # noqa: E402

KATALOG = WURZEL / 'katalog'
ROH = WURZEL / 'daten' / 'roh'
LAUF = '_lauf.json'
# Pause zwischen zwei Modulen (Punkt aed3e76c, V-0227). Innerhalb eines Moduls wartet der Client
# 0,7 s je Anfrage; zwischen Modulen gab es bis V-0227 keine Pause. Mit Wahlpflichtbereichen holt
# ein Lauf statt 5 Module über 200: Ohne Pause wäre das ein Dauerfeuer auf MOSES.
PAUSE = 2.0

# Eine Modulnummer landet in einer MOSES-Adresse und in einem Dateinamen. Nur Ziffern: Ein Tippfehler
# im Katalog wie "../70123" darf weder eine fremde Datei überschreiben noch eine fremde Seite holen.
NUMMER = re.compile(r'\d{3,8}')
SEMESTER_ID = re.compile(r'[a-z0-9][a-z0-9-]*')

try:
    from zoneinfo import ZoneInfo
    BERLIN = ZoneInfo('Europe/Berlin')
except Exception:  # ohne Zeitzonendaten lieber UTC mit Versatz als ein Zeitstempel ohne Zone
    BERLIN = timezone.utc


class KatalogFehler(ValueError):
    pass


def jetzt() -> str:
    return datetime.now(BERLIN).isoformat(timespec='seconds')


# --- Katalog -----------------------------------------------------------------------------------

def _json(pfad: Path):
    try:
        return json.loads(pfad.read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise KatalogFehler(f'{pfad.name}: nicht lesbar ({type(exc).__name__})') from exc


def lade_katalog(katalog: Path = KATALOG) -> dict:
    """Semester und Pläne aus `katalog/` (docs/ARCHITEKTUR.md §3). Prüft, was der Abruf braucht."""
    semester = {}
    for pfad in sorted((katalog / 'semester').glob('*.json')):
        s = _json(pfad)
        sid = s.get('id')
        if not isinstance(sid, str) or not SEMESTER_ID.fullmatch(sid) or pfad.stem != sid:
            raise KatalogFehler(f'{pfad.name}: "id" fehlt oder passt nicht zum Dateinamen')
        if not isinstance(s.get('moses'), str) or not s['moses'].strip():
            raise KatalogFehler(f'{pfad.name}: "moses" (Beschriftung der MOSES-Semesterwahl) fehlt')
        semester[sid] = s
    plaene = []
    listen = {}
    for pfad in sorted((katalog / 'studiengaenge').glob('*.json')):
        g = _json(pfad)
        for plan in g.get('plaene', []):
            if plan.get('semester') not in semester:
                raise KatalogFehler(f'{pfad.name}: Plan nennt unbekanntes Semester {plan.get("semester")!r}')
            for m in plan.get('module', []):
                if not isinstance(m.get('nummer'), str) or not NUMMER.fullmatch(m['nummer']):
                    raise KatalogFehler(f'{pfad.name}: ungültige Modulnummer {m.get("nummer")!r}')
            kandidaten = []
            for wp in plan.get('wahlpflicht', []):
                kandidaten += wahlpflicht_kandidaten(katalog, wp, listen, pfad.name)
            plaene.append({**plan, 'studiengang': g.get('id'), 'kandidaten': kandidaten})
    return {'semester': semester, 'plaene': plaene}


def wahlpflicht_kandidaten(katalog: Path, wp: dict, listen: dict, datei: str) -> list[dict]:
    """Die Module eines Wahlpflichtbereichs aus der gespeicherten Modulliste (V-0227).

    Der Plan nennt `modulliste` (Datei unter katalog/modullisten/, erzeugt von modulliste.py) und
    `bereich` (Pfad im Baum, z. B. "Wahlpflichtbereich/Vertiefung Informatik"). Abgeschrieben wird
    nichts: Die Kandidaten sind genau die Module, die MOSES dem Bereich zuordnet.
    """
    lid = wp.get('modulliste')
    if not isinstance(lid, str) or not SEMESTER_ID.fullmatch(lid):
        raise KatalogFehler(f'{datei}: Wahlpflicht ohne gültige "modulliste"')
    if lid not in listen:
        listen[lid] = _json(katalog / 'modullisten' / f'{lid}.json')
    try:
        b = modulliste.finde(listen[lid], wp.get('bereich') or '')
    except KeyError as exc:
        raise KatalogFehler(f'{datei}: {exc.args[0]} ({lid})') from exc
    out = []
    for m in modulliste.module_von(b):
        if not NUMMER.fullmatch(m['nummer']):
            raise KatalogFehler(f'{lid}: ungültige Modulnummer {m["nummer"]!r}')
        out.append({**m, 'wp': wp.get('id')})
    return out


def im_turnus(turnus: str | None, moses_label: str) -> bool:
    """Bietet das Modul laut MTS-Turnus im Semester `moses_label` an? Unbekannt (k.A.) zählt als ja.

    Der Turnus ist eine Angabe der Modulbeschreibung, kein Termin. Er spart nur Anfragen: Ein
    Modul mit Turnus „SoSe“ wird für ein WiSe gar nicht erst abgerufen. Ob der Turnus stimmt, misst
    `abruf.py --alle-kandidaten` (V-0227, docs/forschung/wi-hoehere-fachsemester.md).
    """
    t = (turnus or '').replace(' ', '')
    art = 'WiSe' if moses_label.startswith(('WiSe', 'WS')) else 'SoSe'
    return t not in ('WiSe', 'SoSe') or t == art


def module_je_semester(katalog: dict, turnusfilter: bool = True) -> dict[str, list[str]]:
    """Je Semester die Modulnummern aller Pläne, jede nur einmal, sortiert: Pflichtmodule und die
    Kandidaten der Wahlpflichtbereiche (diese nur, wenn ihr Turnus zum Semester passt)."""
    out: dict[str, set[str]] = {sid: set() for sid in katalog['semester']}
    for plan in katalog['plaene']:
        out[plan['semester']].update(m['nummer'] for m in plan.get('module', []))
        label = katalog['semester'][plan['semester']]['moses']
        out[plan['semester']].update(k['nummer'] for k in plan.get('kandidaten', [])
                                     if not turnusfilter or im_turnus(k.get('turnus'), label))
    return {sid: sorted(nummern) for sid, nummern in out.items()}


def pflicht_je_semester(katalog: dict) -> dict[str, set[str]]:
    """Je Semester die Modulnummern, die in mindestens einem Plan Pflicht sind."""
    out: dict[str, set[str]] = {sid: set() for sid in katalog['semester']}
    for plan in katalog['plaene']:
        out[plan['semester']].update(m['nummer'] for m in plan.get('module', []))
    return out


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
                  kandidaten=frozenset(), pause=PAUSE, schlaf=time.sleep) -> dict:
    """Ein Semester: jedes Modul einmal, je Modul ein Rohstand, am Ende `_lauf.json`.

    `kandidaten` sind Module, die nur als Wahlpflicht-Kandidat im Katalog stehen (V-0227). Dass
    einer davon im Semester nicht angeboten wird („keine gültige Version“), ist der Normalfall,
    kein Fehler des Laufs: Sein Scheitern steht im Rohstand und unter `kandidaten` in
    `_lauf.json`, `status` und `errors` richten sich nur nach den Pflichtmodulen.
    """
    client_fabrik = client_fabrik or moses.Client
    ziel = semester['moses']
    ordner = roh / semester['id']
    lauf = {'gestartet_am': uhr(), 'beendet_am': None, 'status': 'error',
            'modules': 0, 'bookings': 0, 'errors': []}
    kand = {'module': 0, 'fehler': []} if kandidaten else None
    try:
        if not nummern:
            raise KatalogFehler(f'Kein Plan nennt Module für {semester["id"]}')
        for i, nummer in enumerate(nummern):
            if i and pause:
                schlaf(pause)
            pfad = ordner / f'{nummer}.json'
            try:
                # Je Modul eine frische, loginfreie MOSES-Sitzung wie im Vorbild: Ein verklemmter
                # JSF-Zustand eines Moduls kann das nächste nicht verderben.
                daten = holer(client_fabrik(), nummer, ziel)
            except Exception as exc:
                meldung = fehlertext(exc)
                log(f'  {"·" if nummer in kandidaten else "✗"} {nummer}: {meldung}', file=sys.stderr)
                if nummer in kandidaten:
                    kand['fehler'].append({'module': nummer, 'message': meldung})
                else:
                    lauf['errors'].append({'module': nummer, 'message': meldung})
                schreibe_atomar(pfad, rohstand_fehler(lies_vorbestand(pfad), nummer, ziel, uhr(), meldung))
                continue
            n = buchungen(daten)
            schreibe_atomar(pfad, rohstand_erfolg(daten, uhr()))
            lauf['modules'] += 1
            lauf['bookings'] += n
            if nummer in kandidaten:
                kand['module'] += 1
            log(f'  ✓ {nummer} v{daten.get("version")}: {len(daten["components"])} Bestandteile, '
                f'{sum(len(c["groups"]) for c in daten["components"])} Gruppen, {n} Buchungen',
                file=sys.stderr)
        lauf['status'] = 'ok' if not lauf['errors'] else ('partial' if lauf['modules'] else 'error')
    except Exception as exc:
        lauf['errors'].append({'module': None, 'message': fehlertext(exc)})
        lauf['status'] = 'error'
    finally:
        lauf['beendet_am'] = uhr()
        if kand is not None:
            lauf['kandidaten'] = kand
        if schreibe_lauf:
            schreibe_atomar(ordner / LAUF, lauf)
    return lauf


def lauf(*, katalog: Path = KATALOG, roh: Path = ROH, semester=None, nur=None,
         turnusfilter=True, **kw) -> dict:
    """Alle (oder die genannten) Semester. Gibt je Semester das Ergebnis von lauf_semester zurück.

    Mit `nur` entsteht kein `_lauf.json`: Ein gezielter Nachabruf einzelner Module ist kein Lauf des
    Semesters, und `last_run` der Seite soll nicht „1 Modul“ melden, wo der Plan fünf hat.
    """
    kat = lade_katalog(katalog)
    je = module_je_semester(kat, turnusfilter)
    pflicht = pflicht_je_semester(kat)
    gewaehlt = list(semester) if semester else [sid for sid in kat['semester'] if je[sid]]
    for sid in gewaehlt:
        if sid not in kat['semester']:
            raise KatalogFehler(f'Semester {sid!r} steht nicht in katalog/semester/')
    ergebnis = {}
    for sid in gewaehlt:
        nummern = je[sid]
        if nur:
            fremd = sorted(set(nur) - set(nummern))
            if fremd:
                raise KatalogFehler(f'{", ".join(fremd)} steht in keinem Plan von {sid}')
            nummern = [n for n in nummern if n in set(nur)]
        ergebnis[sid] = lauf_semester(kat['semester'][sid], nummern, roh,
                                      schreibe_lauf=not nur,
                                      kandidaten=frozenset(set(nummern) - pflicht[sid]), **kw)
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
    p.add_argument('--pause', type=float, default=PAUSE,
                   help=f'Sekunden Pause zwischen zwei Modulen (Vorgabe {PAUSE:g}; Punkt aed3e76c)')
    p.add_argument('--alle-kandidaten', action='store_true',
                   help='Wahlpflicht-Kandidaten auch abrufen, wenn ihr MTS-Turnus nicht zum Semester passt')
    p.add_argument('--katalog', type=Path, default=KATALOG, help=argparse.SUPPRESS)
    a = p.parse_args(argv)
    try:
        ergebnis = lauf(katalog=a.katalog, roh=a.roh.resolve(), semester=a.semester, nur=a.nur,
                        turnusfilter=not a.alle_kandidaten, pause=max(0.0, a.pause))
    except KatalogFehler as exc:
        print(f'abruf: {exc}', file=sys.stderr)
        return 2
    if not ergebnis:
        print('abruf: kein Semester mit Plänen im Katalog', file=sys.stderr)
        return 2
    for sid, r in ergebnis.items():
        k = r.get('kandidaten')
        print(f'{sid}: {r["status"]} — {r["modules"]} Module, {r["bookings"]} Buchungen, '
              f'{len(r["errors"])} Fehler'
              + (f' (Wahlpflicht: {k["module"]} geholt, {len(k["fehler"])} ohne Angebot/Fehler)' if k else ''))
    return 0 if all(r['status'] == 'ok' for r in ergebnis.values()) else 1


if __name__ == '__main__':
    sys.exit(main())
