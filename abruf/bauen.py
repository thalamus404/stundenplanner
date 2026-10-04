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
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from plan import fingerprint, slots  # noqa: E402

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
        studiengaenge.append(g)
    studiengaenge.sort(key=lambda g: g['id'])
    return semester, studiengaenge


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


def plan_bauen(studiengang, plan, sem, roh, erzeugt_am):
    """Die Plandatei (docs/ARCHITEKTUR.md §5) für einen Plan eines Studiengangs."""
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
    return {'schema': SCHEMA, 'erzeugt_am': erzeugt_am,
            'studiengang': {'id': studiengang['id'], 'name': studiengang['name'],
                            'abschluss': studiengang.get('abschluss')},
            'semester': sem['id'], 'label': sem['label'], 'anchor': sem['anker'],
            'fachsemester': plan['fachsemester'], 'modules': module,
            'has_fortnightly': any(s['fortnightly'] for g in gruppen for s in g['slots']),
            'group_count': len(gruppen), 'booking_count': sum(len(g['bookings']) for g in gruppen),
            'last_run': lauf}


def bauen(katalog, roh, aus, erzeugt_am=None):
    """Schreibt das Lesemodell nach `aus` und gibt `index.json` als dict zurück."""
    erzeugt_am = erzeugt_am or datetime.now(timezone.utc).isoformat(timespec='seconds')
    semester, studiengaenge = katalog_lesen(katalog)
    aus = Path(aus)
    eintraege, dateien = [], {}
    for g in studiengaenge:
        plaene = sorted(g.get('plaene', []), key=lambda p: (semester[p['semester']]['anker'], p['fachsemester']))
        for p in plaene:
            sem = semester[p['semester']]
            datei = f"{g['id']}/{sem['id']}-fs{p['fachsemester']}.json"
            if datei in dateien:
                raise KatalogFehler(f'{g["id"]}: Plan {sem["id"]} FS {p["fachsemester"]} steht doppelt im Katalog')
            dateien[datei] = plan_bauen(g, p, sem, roh, erzeugt_am)
            eintraege.append({'studiengang': g['id'], 'name': g['name'], 'abschluss': g.get('abschluss'),
                              'semester': sem['id'], 'label': sem['label'], 'fachsemester': p['fachsemester'],
                              'datei': datei})
    index = {'schema': SCHEMA, 'erzeugt_am': erzeugt_am, 'plaene': eintraege}

    alt = []
    if (aus / 'index.json').exists():
        try:
            alt = [p['datei'] for p in _lies(aus / 'index.json').get('plaene', [])]
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
        print(f"  {p['datei']}: {len(inhalt['modules'])} Module, {inhalt['group_count']} Gruppen, "
              f"{inhalt['booking_count']} Buchungen" + (f", Fehler: {' '.join(fehler)}" if fehler else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
