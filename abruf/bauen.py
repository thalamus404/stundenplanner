"""Das Lesemodell: aus Katalog und Rohständen die Dateien, die die Seite liest.

    python3 abruf/bauen.py [--katalog DIR] [--roh DIR] [--aus DIR]

Liest `katalog/semester/*.json`, `katalog/studiengaenge/*.json` und je Semester
`<roh>/<semester-id>/<modulnummer>.json` samt `<roh>/<semester-id>/_lauf.json` (docs/ARCHITEKTUR.md
§3, §4) und schreibt `<aus>/index.json` und je Plan `<aus>/<studiengang>/<semester>-fs<n>.json`
(§5). Das Format ist der Vertrag mit der Seite; er steht in docs/ARCHITEKTUR.md §5 und wird dort
zuerst geändert.

Warum hier gerechnet wird: Im Study OS rechnete der Server bei jedem Aufruf (`load()` in
`app/stundenplan.py`, Herkunft dieser Felder). Hier gibt es keinen Server; die geprüfte Rechnung
(`plan.py`) läuft einmal je Abruf, der Browser bekommt das Ergebnis.

Regeln, an denen etwas hängt:
- **Kein Code nennt einen Studiengang, ein Semester oder ein Datum** (§2). Was es gibt, steht im
  Katalog; ein zweiter Plan erscheint ohne Codeänderung.
- **Nichts vom Betrachter.** `selected`, `changed`, `revision`, `selection`, `missing`,
  `selected_count`, `conflicts` und `stale` rechnet die Seite aus der lokalen Auswahl und der Uhr.
- **Ein Modul ohne Rohstand verschwindet nicht.** Es erscheint mit leeren `components` und `error`,
  sonst sähe ein fehlgeschlagener erster Abruf aus wie „dieses Modul hat keine Termine“.
- **Gleiche Eingabe, gleiche Bytes** (bis auf `erzeugt_am`): Reihenfolge der Module wie im Plan,
  Pläne nach Studiengang, Semesterbeginn (`anker`) und Fachsemester; keine Mengen, keine Uhr außer
  `erzeugt_am`. Ein Diff des Lesemodells zeigt so nur echte Änderungen.
- **`erzeugt_am` steht in jeder Datei**: Eine Frischeprüfung von außen erkennt daran einen
  ausgebliebenen Lauf.
- **Die Vorgaben der Pfade hängen an der Repo-Wurzel, nicht am Arbeitsverzeichnis**: Der tägliche
  Lauf ruft das Skript aus einem anderen Verzeichnis auf. Ausdrücklich übergebene Pfade gelten
  relativ zum Arbeitsverzeichnis, wie bei jedem Befehl.
- Was ein früherer Lauf geschrieben hat und kein Plan mehr ist, wird entfernt (nur Dateien, die
  das alte `index.json` nennt — nie etwas anderes in `--aus`).

**Wahlpflicht (V-0227, Demo-Strang, noch nicht in ARCHITEKTUR §5):** Ein Plan darf `wahlpflicht`
(Bereiche aus einer MTS-Modulliste, `katalog/modullisten/`) und `frei` (Wahlbereich,
Bachelorarbeit: nur Hinweise) tragen, ein Studiengang `ordnung`, ein Semester `ersatz_fuer`. Nur
dann stehen die zusätzlichen Schlüssel im Lesemodell; ein Katalog ohne sie ergibt Byte für Byte
dasselbe wie vorher. Die Kandidaten eines Bereichs stehen NICHT in `modules`: Die Plandatei nennt
sie unter `wahlpflicht[].angebot` mit Kennzahlen, ihre Termine liegen je Modul in
`module/<semester>/<nummer>.json` und werden erst geladen, wenn jemand das Modul wählt. Sonst
wöge der Plan des 5. Fachsemesters mit über 80 angebotenen Modulen viele Megabyte.
Format und Gründe: docs/forschung/wi-hoehere-fachsemester.md.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from plan import fingerprint, slots  # noqa: E402
import modulliste  # noqa: E402

SCHEMA = 1
WURZEL = Path(__file__).resolve().parent.parent


class KatalogFehler(ValueError):
    """Der Katalog widerspricht sich (z. B. ein Plan zeigt auf ein unbekanntes Semester)."""


def _lies(pfad):
    return json.loads(Path(pfad).read_text(encoding='utf-8'))


def katalog_lesen(katalog):
    """`(semester, studiengaenge)`: Semester je `id`, Studiengänge nach `id` sortiert."""
    katalog = Path(katalog)
    semester = {}
    for pfad in sorted((katalog / 'semester').glob('*.json')):
        s = _lies(pfad)
        for feld in ('id', 'label', 'anker'):
            if not s.get(feld):
                raise KatalogFehler(f'{pfad.name}: Feld „{feld}“ fehlt')
        date.fromisoformat(s['anker'])  # ein unlesbarer Anker fällt hier auf, nicht in der Rechnung
        semester[s['id']] = s
    studiengaenge = []
    for pfad in sorted((katalog / 'studiengaenge').glob('*.json')):
        g = _lies(pfad)
        for feld in ('id', 'name'):
            if not g.get(feld):
                raise KatalogFehler(f'{pfad.name}: Feld „{feld}“ fehlt')
        for p in g.get('plaene', []):
            if p.get('semester') not in semester:
                raise KatalogFehler(f'{pfad.name}: Plan zeigt auf unbekanntes Semester „{p.get("semester")}“')
            if not isinstance(p.get('fachsemester'), int):
                raise KatalogFehler(f'{pfad.name}: Plan ohne ganzzahliges „fachsemester“')
            for wp in p.get('wahlpflicht', []):
                wp['_liste'] = _modulliste(katalog, wp.get('modulliste'), pfad.name)
                try:
                    wp['_bereich'] = modulliste.finde(wp['_liste'], wp.get('bereich') or '')
                except KeyError as exc:
                    raise KatalogFehler(f'{pfad.name}: {exc.args[0]}') from exc
                if not wp.get('id') or not re.fullmatch(r'[a-z0-9-]+', wp['id']):
                    raise KatalogFehler(f'{pfad.name}: Wahlpflicht ohne gültige „id“')
        studiengaenge.append(g)
    studiengaenge.sort(key=lambda g: g['id'])
    return semester, studiengaenge


_LISTEN = {}


def _modulliste(katalog, lid, datei):
    if not isinstance(lid, str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]*', lid):
        raise KatalogFehler(f'{datei}: Wahlpflicht ohne gültige „modulliste“')
    pfad = Path(katalog) / 'modullisten' / f'{lid}.json'
    if pfad not in _LISTEN:
        try:
            _LISTEN[pfad] = _lies(pfad)
        except (OSError, ValueError) as exc:
            raise KatalogFehler(f'{datei}: Modulliste {lid} nicht lesbar ({type(exc).__name__})') from exc
    return _LISTEN[pfad]


def modul(eintrag, roh_ordner, sem):
    """Ein Modul des Lesemodells aus dem Katalogeintrag und seinem Rohstand (oder ohne).

    Die Felder des Moduls sind eine feste Liste (docs/ARCHITEKTUR.md §5), nicht „alles aus dem
    Rohstand“: Was der Abruf zusätzlich schreibt (`semester`, `abruf`), gelangt nicht unbemerkt in
    den Vertrag mit der Seite. Bestandteile und Gruppen tragen alles aus dem Rohstand weiter.
    """
    nummer = eintrag['nummer']
    pfad = Path(roh_ordner) / f'{nummer}.json'
    roh, fehler = {}, None
    if not pfad.exists():
        fehler = f'Noch kein Rohstand: Modul {nummer} wurde für {sem["label"]} nicht abgerufen.'
    else:
        try:
            roh = _lies(pfad)
        except (OSError, ValueError) as exc:
            # Ein kaputter Rohstand soll den Plan nicht verschwinden lassen, aber auch nicht still
            # als „keine Termine“ erscheinen.
            fehler = f'Rohstand unlesbar: {type(exc).__name__}'
            print(f'  ! {pfad}: {exc}', file=sys.stderr)
    abruf = roh.get('abruf') or {}
    m = {'number': nummer, 'short': eintrag.get('kurz'), 'title': roh.get('title'),
         'version': roh.get('version'), 'valid_from': roh.get('valid_from'), 'valid_to': roh.get('valid_to'),
         'valid_versions': roh.get('valid_versions') or [], 'url': roh.get('url'), 'isis_url': roh.get('isis_url'),
         'notes': roh.get('notes') or {}, 'checked_at': abruf.get('geprueft_am'),
         'success_at': abruf.get('erfolg_am'), 'error': fehler or abruf.get('fehler'), 'components': []}
    for comp in roh.get('components') or []:
        c = dict(comp)
        c['groups'] = []
        for group in comp.get('groups') or []:
            g = dict(group)
            g['key'] = comp['id'] + ':' + group['id']
            g['digest'] = fingerprint(group)
            g['slots'] = slots(group, sem['anker'])
            c['groups'].append(g)
        m['components'].append(c)
    return m


def plan_bauen(studiengang, plan, sem, roh, erzeugt_am, module_aus=None):
    """Die Plandatei (docs/ARCHITEKTUR.md §5) für einen Plan eines Studiengangs.

    `module_aus` (dict) sammelt die Moduldateien der Wahlpflicht-Kandidaten (Pfad → Modul)."""
    module_aus = {} if module_aus is None else module_aus
    roh_ordner = Path(roh) / sem['id']
    module = [modul(e, roh_ordner, sem) for e in plan.get('module', [])]
    gruppen = [g for m in module for c in m['components'] for g in c['groups']]
    lauf = None
    lauf_pfad = roh_ordner / '_lauf.json'
    if lauf_pfad.exists():
        try:
            l = _lies(lauf_pfad)
        except (OSError, ValueError) as exc:
            # Unlesbar ist nicht „nie gelaufen“: Die Seite soll einen gescheiterten Lauf zeigen.
            print(f'  ! {lauf_pfad}: {exc}', file=sys.stderr)
            l = {'status': 'error', 'errors': [{'message': f'Lauf-Datei unlesbar: {type(exc).__name__}'}]}
        lauf = {'finished_at': l.get('beendet_am'), 'status': l.get('status'), 'modules': l.get('modules'),
                'bookings': l.get('bookings'), 'errors': l.get('errors') or []}
    out = {'schema': SCHEMA, 'erzeugt_am': erzeugt_am,
           'studiengang': {'id': studiengang['id'], 'name': studiengang['name'],
                           'abschluss': studiengang.get('abschluss')},
           'semester': sem['id'], 'label': sem['label'], 'anchor': sem['anker'],
           'fachsemester': plan['fachsemester'], 'modules': module,
           'has_fortnightly': any(s['fortnightly'] for g in gruppen for s in g['slots']),
           'group_count': len(gruppen), 'booking_count': sum(len(g['bookings']) for g in gruppen),
           'last_run': lauf}
    # Die Erweiterungen von V-0227 nur, wenn der Katalog sie nennt (Docstring oben).
    if studiengang.get('ordnung'):
        out['studiengang']['ordnung'] = studiengang['ordnung']
    if sem.get('ersatz_fuer'):
        out['ersatz_fuer'] = sem['ersatz_fuer']
    if plan.get('wahlpflicht'):
        pflicht = {m['number'] for m in module}
        out['wahlpflicht'] = [wahlpflicht_bauen(wp, roh_ordner, sem, pflicht, module_aus)
                              for wp in plan['wahlpflicht']]
    if plan.get('frei'):
        out['frei'] = [{k: f.get(k) for k in ('name', 'anteil', 'hinweis')} for f in plan['frei']]
    return out


# Bausteine für kurze Namen der Wahlpflichtmodule. Für das 1. FS schreibt ein Mensch `kurz` in den
# Katalog; für 150 Kandidaten aus der Modulliste geht das nicht. Die Seite braucht aber kurze Namen
# (Chips, Kacheln). Der volle Titel steht immer daneben (Karte, Wahlliste).
_KUERZEL = [(r'^Programmierpraktikum:?\s*', 'PP '), (r'^Praktikum:?\s*', 'Prakt. '),
            (r'^Seminar:?\s*', 'Sem. '), (r'^Bachelorseminar:?\s*', 'BA-Sem. '),
            (r'^Projekt:?\s*', 'Proj. '), (r'^Einführung in (die|das|den)\s+', 'Einf. '),
            (r'^Grundlagen (der|des|von)\s+', 'Grdl. '), (r'\s*\((\d+ (LP|CP)|benotet)\)', ''),
            (r'\s+und\s+', ' & ')]


def kurzname(titel, laenge=22):
    """Ein kurzer Anzeigename aus dem Modultitel: übliche Kürzel, dann höchstens `laenge` Zeichen.
    Geschnitten wird an einer Wortgrenze, wenn dabei höchstens ein Viertel verloren geht."""
    t = ' '.join(str(titel or '').split())
    for muster, ersatz in _KUERZEL:
        t = re.sub(muster, ersatz, t)
    t = t.strip()
    if len(t) <= laenge:
        return t
    schnitt = t[:laenge - 1].rsplit(' ', 1)[0].rstrip(' :,-&')
    return (schnitt if len(schnitt) >= laenge * 3 // 4 else t[:laenge - 1].rstrip()) + '…'


def wahlpflicht_bauen(wp, roh_ordner, sem, pflicht, module_aus):
    """Ein Wahlpflichtbereich eines Plans: Regeln aus der Modulliste, Angebot mit Terminen im
    Semester (Module dazu in `module_aus`), und was ohne Termine bleibt, mit Grund."""
    liste, b = wp['_liste'], wp['_bereich']
    angebot, ohne = [], []
    for k in modulliste.module_von(b):
        if k['nummer'] in pflicht:
            continue  # im Plan schon Pflicht: nicht ein zweites Mal als Wahl
        kopf = {'number': k['nummer'], 'title': k['titel'], 'lp': k['lp'], 'turnus': k['turnus'],
                'unterbereich': k['unterbereich']}
        pfad = Path(roh_ordner) / f'{k["nummer"]}.json'
        if not pfad.exists():
            ohne.append({**kopf, 'grund': f'nicht abgerufen (Turnus laut MOSES: {k["turnus"] or "k. A."})'})
            continue
        m = modul({'nummer': k['nummer'], 'kurz': kurzname(k['titel'])}, roh_ordner, sem)
        termine = sum(len(g['bookings']) for c in m['components'] for g in c['groups'])
        if not termine:
            if m['error']:
                grund = ('keine im Semester gültige Modulversion' if 'keine gültige Version' in m['error']
                         else 'Abruf gescheitert: ' + m['error'])
            elif any(c['groups'] for c in m['components']):
                grund = 'Gruppen ohne Termine (z. B. nach Vereinbarung)'
            else:
                grund = 'keine Termine im Vorlesungsverzeichnis'
            ohne.append({**kopf, 'grund': grund})
            continue
        datei = f'module/{sem["id"]}/{k["nummer"]}.json'
        module_aus[datei] = m
        gruppen = [g for c in m['components'] for g in c['groups']]
        angebot.append({**kopf, 'short': m['short'], 'datei': datei,
                        'components': len(m['components']), 'groups': len(gruppen), 'bookings': termine,
                        'tage': sorted({s['day'] for g in gruppen for s in g['slots']})})
    return {'id': wp['id'], 'kurz': wp.get('kurz'), 'name': wp.get('name'), 'bereich': wp.get('bereich'),
            'anteil': wp.get('anteil'), 'lp_min': b.get('lp_min'), 'lp_max': b.get('lp_max'),
            'regeln': b.get('regeln', []),
            'modulliste': {'ordnung': (liste.get('stupo') or {}).get('label'),
                           'liste': (liste.get('liste') or {}).get('label'),
                           'quelle': liste.get('quelle'), 'abgerufen_am': liste.get('abgerufen_am')},
            'angebot': angebot, 'ohne_termine': ohne}


def bauen(katalog, roh, aus, erzeugt_am=None):
    """Schreibt das Lesemodell nach `aus` und gibt `index.json` als dict zurück."""
    erzeugt_am = erzeugt_am or datetime.now(timezone.utc).isoformat(timespec='seconds')
    semester, studiengaenge = katalog_lesen(katalog)
    aus = Path(aus)
    eintraege, dateien, module_aus = [], {}, {}
    for g in studiengaenge:
        plaene = sorted(g.get('plaene', []), key=lambda p: (semester[p['semester']]['anker'], p['fachsemester']))
        for p in plaene:
            sem = semester[p['semester']]
            datei = f"{g['id']}/{sem['id']}-fs{p['fachsemester']}.json"
            if datei in dateien:
                raise KatalogFehler(f'{g["id"]}: Plan {sem["id"]} FS {p["fachsemester"]} steht doppelt im Katalog')
            dateien[datei] = plan_bauen(g, p, sem, roh, erzeugt_am, module_aus)
            eintrag = {'studiengang': g['id'], 'name': g['name'], 'abschluss': g.get('abschluss'),
                       'semester': sem['id'], 'label': sem['label'], 'fachsemester': p['fachsemester'],
                       'datei': datei}
            if g.get('ordnung'):
                eintrag['ordnung'] = g['ordnung']
            if sem.get('ersatz_fuer'):
                eintrag['ersatz_fuer'] = sem['ersatz_fuer']
            eintraege.append(eintrag)
    index = {'schema': SCHEMA, 'erzeugt_am': erzeugt_am, 'plaene': eintraege}
    if module_aus:
        # Die Moduldateien der Wahlpflicht stehen im Index, damit der nächste Lauf weiß, was er
        # geschrieben hat und wieder entfernen darf (dieselbe Regel wie für Plandateien).
        index['module'] = sorted(module_aus)
        for datei, m in module_aus.items():
            sem_id = datei.split('/')[1]
            sem = semester[sem_id]
            dateien[datei] = {'schema': SCHEMA, 'erzeugt_am': erzeugt_am, 'semester': sem['id'],
                              'label': sem['label'], 'anchor': sem['anker'], 'module': m}

    alt = []
    if (aus / 'index.json').exists():
        try:
            altes = _lies(aus / 'index.json')
            alt = [p['datei'] for p in altes.get('plaene', [])] + list(altes.get('module') or [])
        except (OSError, ValueError, KeyError, TypeError):
            alt = []
    for datei, inhalt in dateien.items():
        _schreib(aus / datei, inhalt)
    # Die Plandateien zuerst, das index.json zuletzt: Wer mitten im Lauf liest, findet nie einen
    # Index, der auf eine noch fehlende Datei zeigt.
    _schreib(aus / 'index.json', index)
    for datei in alt:
        if datei not in dateien and '..' not in Path(datei).parts:
            pfad = aus / datei
            if pfad.is_file():
                pfad.unlink()
                if pfad.parent != aus and not any(pfad.parent.iterdir()):
                    pfad.parent.rmdir()
    return index


def _schreib(pfad, inhalt):
    # Kompakt, weil die Seite auch auf alten Handys schnell laden soll; lesbar machen:
    # python3 -m json.tool <datei>. Erst eine Nachbardatei, dann umbenennen: nie halb geschrieben.
    pfad.parent.mkdir(parents=True, exist_ok=True)
    tmp = pfad.with_name(pfad.name + '.tmp')
    tmp.write_text(json.dumps(inhalt, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    tmp.replace(pfad)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Lesemodell aus Katalog und Rohständen (docs/ARCHITEKTUR.md §5).')
    ap.add_argument('--katalog', type=Path, default=WURZEL / 'katalog')
    ap.add_argument('--roh', type=Path, default=WURZEL / 'daten' / 'roh')
    ap.add_argument('--aus', type=Path, default=WURZEL / 'web' / 'daten')
    a = ap.parse_args(argv)
    try:
        index = bauen(a.katalog, a.roh, a.aus)
    except KatalogFehler as exc:
        print(f'  ✗ Katalog: {exc}', file=sys.stderr)
        return 2
    for p in index['plaene']:
        inhalt = _lies(a.aus / p['datei'])
        fehler = [m['number'] for m in inhalt['modules'] if m['error']]
        wp = ''.join(f"; {w['kurz'] or w['id']}: {len(w['angebot'])} angeboten "
                     f"({sum(x['groups'] for x in w['angebot'])} Gruppen, {sum(x['bookings'] for x in w['angebot'])} Buchungen), "
                     f"{len(w['ohne_termine'])} ohne Termine" for w in inhalt.get('wahlpflicht', []))
        print(f"  {p['datei']}: {len(inhalt['modules'])} Module, {inhalt['group_count']} Gruppen, "
              f"{inhalt['booking_count']} Buchungen" + (f", Fehler: {' '.join(fehler)}" if fehler else '') + wp)
    return 0


if __name__ == '__main__':
    sys.exit(main())
