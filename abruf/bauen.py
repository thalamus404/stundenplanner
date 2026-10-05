"""Das Lesemodell: aus Katalog und Rohständen die Dateien, die die Seite liest.

    python3 abruf/bauen.py [--katalog DIR] [--roh DIR] [--aus DIR] [--mit-vorschau]

Liest den Katalog (`katalog.py`, docs/ARCHITEKTUR.md §3) und je Semester
`<roh>/<semester-id>/<modulnummer>.json` samt `<roh>/<semester-id>/_lauf.json` (§4) und schreibt
`<aus>/index.json` und je Plan eine Plandatei, deren Pfad `katalog.plan_datei` vergibt (§5). Das
Format ist der Vertrag mit der Seite; er steht in docs/ARCHITEKTUR.md §5 und wird dort zuerst
geändert.

`index.json` trägt seit V-0233 zweierlei (Schema 2): `wahl`, den Baum der fünf Stufen, aus dem die
Seite ihren Startbildschirm baut (Hochschule → Studiengang → Vertiefung → Fachsemester → Ordnung;
je Knoten eine `regel`: wählen, überspringen oder automatisch), und `plaene`, die flache Liste der
ersten Seite, unverändert in ihren Schlüsseln, bis die Seite umgestellt ist. Vorschau-Pläne
(`"sichtbar": "vorschau"` im Katalog) stehen nur mit `--mit-vorschau` darin; der tägliche Lauf
ruft ohne den Schalter auf, die Live-Seite bleibt also, was sie war.

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
- **Je Plan `kombinationen`** (`plan.kombination`): ob es eine Wahl ohne Überschneidung gibt. Ist
  die Antwort nein, nennt die Ausgabe des Befehls den Plan, damit ein Mensch nachsieht, ob der
  Katalog stimmt oder die Hochschule so plant (Informatik, 05.10.2026). Gerechnet über die
  Pflichtmodule; Wahlpflicht wählt erst der Mensch.
- **Je Bestandteil `format`** (V-0238): `{kuerzel, lang, kategorie}` aus `katalog/formate.json`
  (`katalog.format_von`), damit die Seite Vorlesung, Übung und den Rest an der Sättigung
  unterscheidet, ohne selbst Kürzel zu kennen. `type` bleibt daneben, wie die Quelle es schreibt.
  Ein Format, das der Katalog nicht kennt, wird `sonstige` mit `unbekannt: true`, und die Ausgabe des
  Befehls nennt es: Ein Mensch trägt es mit Quelle und Grund ein (docs/forschung/formate.md).

**Wahlpflicht (V-0227, steigflug; übernommen in V-0233):** Ein Plan darf `wahlpflicht` (Bereiche
aus einer MTS-Modulliste, `katalog/modullisten/`) und `frei` (Wahlbereich, Bachelorarbeit: nur
Hinweise) tragen, ein Semester `ersatz_fuer`. Nur dann stehen diese Schlüssel in der Plandatei. Die
Kandidaten eines Bereichs stehen NICHT in `modules`: Die Plandatei nennt sie unter
`wahlpflicht[].angebot` mit Kennzahlen, ihre Termine liegen je Modul in
`module/<semester>/<nummer>.json` und werden erst geladen, wenn jemand das Modul wählt. Sonst wöge
der Plan des 5. Fachsemesters mit über 80 angebotenen Modulen viele Megabyte.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
import katalog as K  # noqa: E402
from katalog import KatalogFehler  # noqa: E402,F401  (bauen.KatalogFehler bleibt der Name für Aufrufer)
from plan import fingerprint, kombination, slots  # noqa: E402

SCHEMA = 2
WURZEL = Path(__file__).resolve().parent.parent
# Die fünf Stufen der Wahl in Silas' Reihenfolge (05.10.2026), mit der Beschriftung, die die Seite
# nimmt, wenn ein Knoten keine eigene trägt (die Vertiefung heißt je Studiengang anders).
STUFEN = (('hochschule', 'Hochschule'), ('studiengang', 'Studiengang'), ('vertiefung', 'Vertiefung'),
          ('fachsemester', 'Fachsemester'), ('ordnung', 'Studien- und Prüfungsordnung'))


def _lies(pfad):
    return json.loads(Path(pfad).read_text(encoding='utf-8'))


def modul(eintrag, roh_ordner, sem, regeln=None, formate=None):
    """Ein Modul des Lesemodells aus dem Katalogeintrag und seinem Rohstand (oder ohne).

    Die Felder des Moduls sind eine feste Liste (docs/ARCHITEKTUR.md §5), nicht „alles aus dem
    Rohstand“: Was der Abruf zusätzlich schreibt (`semester`, `abruf`), gelangt nicht unbemerkt in
    den Vertrag mit der Seite. Bestandteile und Gruppen tragen alles aus dem Rohstand weiter, jeder
    Bestandteil dazu `format` (`katalog.format_von`; `formate` aus `katalog.lesen`).
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
        c['format'] = K.format_von(formate, comp.get('type'),
                                   [b.get('format') for g in comp.get('groups') or [] for b in g.get('bookings') or []])
        if comp.get('id') in (regeln or {}):
            # Aus katalog/bestandteile.json: wie die Gruppen zu belegen sind, wo nicht „wähle eine“.
            c['gruppen'] = regeln[comp['id']]['gruppen']
            c['gruppen_grund'] = regeln[comp['id']]['grund']
        c['groups'] = []
        for group in comp.get('groups') or []:
            g = dict(group)
            g['key'] = comp['id'] + ':' + group['id']
            g['digest'] = fingerprint(group)
            g['slots'] = slots(group, sem['anker'])
            c['groups'].append(g)
        m['components'].append(c)
    return m


def _kopf_hochschule(h):
    return {'id': h['id'], 'kurz': h['kurz'], 'name': h['name'], 'quelle': h['quelle']}


def _kopf_ordnung(o):
    return None if o is None else {k: o[k] for k in K.ORDNUNG_FELDER}


def _kopf_vertiefung(plan):
    v = plan['vertiefung']
    return None if v is None else {**v, 'heisst': plan['studiengang']['vertiefung_heisst']}


def plan_bauen(plan, roh, erzeugt_am, module_aus=None, regeln=None, formate=None):
    """Die Plandatei (docs/ARCHITEKTUR.md §5) für einen aufgelösten Plan aus `katalog.lesen`.

    `module_aus` (dict) sammelt die Moduldateien der Wahlpflicht-Kandidaten (Pfad → Modul).
    `formate` ist `katalog.lesen(…)['formate']`; ohne sie ist jedes Format unbekannt."""
    module_aus = {} if module_aus is None else module_aus
    studiengang, sem = plan['studiengang'], plan['semester']
    roh_ordner = Path(roh) / sem['id']
    module = [modul(e, roh_ordner, sem, regeln, formate) for e in plan['module']]
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
           'last_run': lauf,
           # Seit V-0233: die übrigen Stufen der Wahl und die Prüfung auf eine Wahl ohne Überschneidung.
           'id': plan['id'], 'hochschule': _kopf_hochschule(plan['hochschule']),
           'vertiefung': _kopf_vertiefung(plan), 'ordnung': _kopf_ordnung(plan['ordnung']),
           'kombinationen': _kombinationen(module, bool(plan['wahlpflicht']))}
    # Die Erweiterungen von V-0227 nur, wenn der Katalog sie nennt (Docstring oben).
    if sem.get('ersatz_fuer'):
        out['ersatz_fuer'] = sem['ersatz_fuer']
    if plan['wahlpflicht']:
        pflicht = {m['number'] for m in module}
        out['wahlpflicht'] = [wahlpflicht_bauen(wp, roh_ordner, sem, pflicht, module_aus, regeln, formate)
                              for wp in plan['wahlpflicht']]
    if plan['roh'].get('frei'):
        out['frei'] = [{k: f.get(k) for k in ('name', 'anteil', 'hinweis')} for f in plan['roh']['frei']]
    return out


# Bausteine für kurze Namen der Wahlpflichtmodule (V-0227). Für das 1. FS schreibt ein Mensch `kurz`
# in den Katalog; für 150 Kandidaten aus der Modulliste geht das nicht. Die Seite braucht aber kurze
# Namen (Chips, Kacheln). Der volle Titel steht immer daneben (Karte, Wahlliste).
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


def wahlpflicht_bauen(wp, roh_ordner, sem, pflicht, module_aus, regeln=None, formate=None):
    """Ein Wahlpflichtbereich eines Plans: Regeln aus der Modulliste, Angebot mit Terminen im
    Semester (Module dazu in `module_aus`), und was ohne Termine bleibt, mit Grund (V-0227)."""
    liste, b = wp['liste'], wp['bereich_daten']
    angebot, ohne = [], []
    for k in wp['kandidaten']:
        if k['nummer'] in pflicht:
            continue  # im Plan schon Pflicht: nicht ein zweites Mal als Wahl
        kopf = {'number': k['nummer'], 'title': k['titel'], 'lp': k['lp'], 'turnus': k['turnus'],
                'unterbereich': k['unterbereich']}
        pfad = Path(roh_ordner) / f'{k["nummer"]}.json'
        if not pfad.exists():
            ohne.append({**kopf, 'grund': f'nicht abgerufen (Turnus laut MOSES: {k["turnus"] or "k. A."})'})
            continue
        m = modul({'nummer': k['nummer'], 'kurz': kurzname(k['titel'])}, roh_ordner, sem, regeln, formate)
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
        module_aus[datei] = (sem, m)
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


def _kombinationen(module, mit_wahlpflicht=False):
    """`plan.kombination` über die Bestandteile der Pflichtmodule. Fehlt einem Modul der Rohstand,
    gilt die Aussage nur für die übrigen: `fehlen` nennt sie (ein „lösbar“ kann mit ihnen noch
    kippen). Wahlpflichtmodule wählt erst der Mensch; hat ein Plan nur sie, ist die Frage offen."""
    k = kombination([c for m in module for c in m['components']])
    if k['loesbar'] is None and mit_wahlpflicht and not any(c['groups'] for m in module for c in m['components']):
        k = {'loesbar': None, 'sicher': False,
             'grund': 'Der Plan hat keine Pflichtmodule mit Terminen; was sich überschneidet, '
                                       'hängt an den Wahlpflichtmodulen, die du dazunimmst.'}
    fehlen = [m['number'] for m in module if m['error'] and not m['components']]
    return {**k, 'fehlen': fehlen} if fehlen else k


def _sortname(text):
    # Studiengänge nach Namen, wie man sie sucht; Umlaute wie ihr Grundbuchstabe (Ökonomie bei O).
    return str(text or '').casefold().translate(str.maketrans({'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss'}))


def _knoten(stufe, optionen, label=None):
    """Ein Knoten des Wahlbaums. `regel` sagt der Seite, was sie tut (Silas, 05.10.2026):
    - `ueberspringen`: Vertiefung oder Ordnung mit nur der Option „keine“ (Studiengang ohne
      Vertiefung, Katalog ohne Ordnung). Die Stufe erscheint nicht.
    - `automatisch`: Vertiefung oder Ordnung mit genau einer Option. Sie gilt als gewählt, die Seite
      zeigt sie an („gilt für ein Semester nur eine StuPO, wird sie automatisch gewählt“).
    - `waehlen`: sonst, und für Hochschule, Studiengang und Fachsemester immer (auch mit einer
      Option: Silas will die Hochschule wählen sehen)."""
    regel = 'waehlen'
    if stufe in ('vertiefung', 'ordnung') and len(optionen) == 1:
        regel = 'ueberspringen' if optionen[0]['id'] is None else 'automatisch'
    k = {'stufe': stufe, 'regel': regel}
    if label:
        k['label'] = label
    k['optionen'] = optionen
    return k


def wahlbaum(eintraege):
    """Der Baum der fünf Stufen aus den Plänen zur Wahl. `eintraege`: Liste `(plan, blatt)` mit
    `blatt = {id, datei, kombinationen}`; jeder Pfad endet in genau einem Blatt (`plan`)."""
    def gruppiere(liste, schluessel):
        out = {}
        for e in liste:
            out.setdefault(schluessel(e[0]), []).append(e)
        return out

    hs_opt = []
    hs_je = gruppiere(eintraege, lambda p: p['hochschule']['id'])
    for hid, hs_e in sorted(hs_je.items(), key=lambda kv: (_sortname(kv[1][0][0]['hochschule']['name']), kv[0])):
        h = hs_e[0][0]['hochschule']
        sg_opt = []
        for gid, sg_e in sorted(gruppiere(hs_e, lambda p: p['studiengang']['id']).items(),
                                key=lambda kv: (_sortname(kv[1][0][0]['studiengang']['name']),
                                                kv[1][0][0]['studiengang'].get('abschluss') or '', kv[0])):
            g = sg_e[0][0]['studiengang']
            rv = {v['id']: i for i, v in enumerate(g['vertiefungen'])}
            ro = {o['id']: i for i, o in enumerate(g['ordnungen'])}
            vt_opt = []
            for vid, vt_e in sorted(gruppiere(sg_e, lambda p: (p['vertiefung'] or {}).get('id')).items(),
                                    key=lambda kv: rv.get(kv[0], -1)):
                v = vt_e[0][0]['vertiefung']
                fs_opt = []
                for (_, sid, fs), fs_e in sorted(gruppiere(vt_e, lambda p: (p['semester']['anker'], p['semester']['id'],
                                                                             p['fachsemester'])).items()):
                    sem = fs_e[0][0]['semester']
                    o_opt = []
                    for plan, blatt in sorted(fs_e, key=lambda e: ro.get((e[0]['ordnung'] or {}).get('id'), -1)):
                        o = plan['ordnung']
                        o_opt.append({'id': o and o['id'], 'label': o and o['label'], 'zusatz': o and o['fuer_wen'],
                                      'plan': blatt})
                    fs_opt.append({'id': f'{sid}:fs{fs}', 'label': f'{fs}. Fachsemester', 'zusatz': sem['label'],
                                   'semester': sid, 'fachsemester': fs, 'weiter': _knoten('ordnung', o_opt)})
                vt_opt.append({'id': vid, 'label': v['name'] if v else g['ohne_vertiefung'],
                               'zusatz': v['kurz'] if v else None, 'weiter': _knoten('fachsemester', fs_opt)})
            sg_opt.append({'id': gid, 'label': g['name'], 'zusatz': g.get('abschluss'),
                           'weiter': _knoten('vertiefung', vt_opt, g['vertiefung_heisst'])})
        hs_opt.append({'id': hid, 'label': h['kurz'], 'zusatz': h['name'], 'weiter': _knoten('studiengang', sg_opt)})
    return _knoten('hochschule', hs_opt)


def _alter_eintrag(plan, ordnungen, mehrere_hochschulen):
    """Ein Eintrag der flachen Liste `plaene`, die die erste Seite liest (Schlüssel wie Schema 1).
    Im Namen stehen, was die alte Planwahl sonst nicht unterscheiden könnte: die Hochschule, wenn
    der Index mehrere zeigt; die Vertiefung; die Ordnung, wenn der Studiengang Pläne mehrerer
    Ordnungen zeigt (`ordnungen`: deren Kennungen). Die Live-Seite (eine Hochschule, eine Ordnung)
    sieht so dieselben Namen wie vorher."""
    g, sem = plan['studiengang'], plan['semester']
    zusatz = ([plan['hochschule']['kurz']] if mehrere_hochschulen else []) \
        + ([plan['vertiefung']['name']] if plan['vertiefung'] else []) \
        + ([plan['ordnung']['label']] if plan['ordnung'] and len(ordnungen) > 1 else [])
    return {'studiengang': g['id'], 'name': g['name'] + (f" ({', '.join(zusatz)})" if zusatz else ''),
            'abschluss': g.get('abschluss'), 'semester': sem['id'], 'label': sem['label'],
            'fachsemester': plan['fachsemester'], 'datei': plan['datei']}


def _dateien_im_index(index):
    """Alle Dateien, die ein (altes) index.json nennt: die flache Liste und die Blätter des Baums."""
    out = [p.get('datei') for p in index.get('plaene') or []] + list(index.get('module') or [])

    def blaetter(k):
        for o in (k or {}).get('optionen') or []:
            if 'plan' in o:
                out.append((o['plan'] or {}).get('datei'))
            blaetter(o.get('weiter'))
    blaetter(index.get('wahl'))
    return [d for d in out if isinstance(d, str)]


def bauen(katalog, roh, aus, erzeugt_am=None, mit_vorschau=False):
    """Schreibt das Lesemodell nach `aus` und gibt `index.json` als dict zurück."""
    erzeugt_am = erzeugt_am or datetime.now(timezone.utc).isoformat(timespec='seconds')
    kat = K.lesen(katalog)
    aus = Path(aus)
    dateien, eintraege, module_aus = {}, [], {}
    for plan in K.zur_wahl(kat, mit_vorschau):
        inhalt = plan_bauen(plan, roh, erzeugt_am, module_aus, K.bestandteile_im_semester(kat, plan['semester']['id']),
                            kat['formate'])
        dateien[plan['datei']] = inhalt
        eintraege.append((plan, {'id': plan['id'], 'datei': plan['datei'], 'kombinationen': inhalt['kombinationen']}))
    index = {'schema': SCHEMA, 'erzeugt_am': erzeugt_am,
             'stufen': [{'id': i, 'label': l} for i, l in STUFEN],
             'wahl': wahlbaum(eintraege),
             'plaene': []}
    je_studiengang = {}
    for p, _ in eintraege:
        je_studiengang.setdefault(p['studiengang']['id'], set()).add((p['ordnung'] or {}).get('id'))
    mehrere = len({p['hochschule']['id'] for p, _ in eintraege}) > 1
    index['plaene'] = [_alter_eintrag(p, je_studiengang[p['studiengang']['id']], mehrere) for p, _ in eintraege]
    if module_aus:
        # Die Moduldateien der Wahlpflicht stehen im Index, damit der nächste Lauf weiß, was er
        # geschrieben hat und wieder entfernen darf (dieselbe Regel wie für Plandateien).
        index['module'] = sorted(module_aus)
        for datei, (sem, m) in sorted(module_aus.items()):
            dateien[datei] = {'schema': SCHEMA, 'erzeugt_am': erzeugt_am, 'semester': sem['id'],
                              'label': sem['label'], 'anchor': sem['anker'], 'module': m}

    alt = []
    if (aus / 'index.json').exists():
        try:
            alt = _dateien_im_index(_lies(aus / 'index.json'))
        except (OSError, ValueError, AttributeError, TypeError):
            alt = []
    for datei, inhalt in dateien.items():
        _schreib(aus / datei, inhalt)
    # Die Plandateien zuerst, das index.json zuletzt: Wer mitten im Lauf liest, findet nie einen
    # Index, der auf eine noch fehlende Datei zeigt.
    _schreib(aus / 'index.json', index)
    for datei in alt:
        teile = Path(datei).parts
        if datei in dateien or '..' in teile or Path(datei).is_absolute():
            continue
        pfad = aus / datei
        if pfad.is_file():
            pfad.unlink()
            # Leere Ordner bis hinauf zu `aus` mit entfernen (Plandateien liegen seit V-0233 bis zu drei tief).
            ordner = pfad.parent
            while ordner != aus and not any(ordner.iterdir()):
                ordner.rmdir()
                ordner = ordner.parent
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
    ap.add_argument('--mit-vorschau', action='store_true',
                    help='auch Pläne mit "sichtbar": "vorschau" (nie im täglichen Lauf für die Live-Seite)')
    a = ap.parse_args(argv)
    try:
        index = bauen(a.katalog, a.roh, a.aus, mit_vorschau=a.mit_vorschau)
    except KatalogFehler as exc:
        print(f'  ✗ Katalog: {exc}', file=sys.stderr)
        return 2
    for p in index['plaene']:
        inhalt = _lies(a.aus / p['datei'])
        fehler = [m['number'] for m in inhalt['modules'] if m['error']]
        k = inhalt['kombinationen']
        wp = ''.join(f"; {w['kurz'] or w['id']}: {len(w['angebot'])} angeboten "
                     f"({sum(x['groups'] for x in w['angebot'])} Gruppen, {sum(x['bookings'] for x in w['angebot'])} Buchungen), "
                     f"{len(w['ohne_termine'])} ohne Termine" for w in inhalt.get('wahlpflicht', []))
        print(f"  {p['datei']}: {len(inhalt['modules'])} Module, {inhalt['group_count']} Gruppen, "
              f"{inhalt['booking_count']} Buchungen" + (f", Fehler: {' '.join(fehler)}" if fehler else '') + wp)
        if k['loesbar'] is False:
            # Laut, damit ein Mensch nachsieht: stimmt der Katalog, oder plant die Hochschule so?
            print(f"    ! keine Wahl ohne Überschneidung: {k['grund']}")
        elif k['loesbar'] is None and inhalt['group_count']:
            print(f"    ! ob es eine Wahl ohne Überschneidung gibt, ist offen: {k['grund']}")
        for v in k.get('verdacht', []):
            # Ein Mensch sieht nach und trägt den Bestandteil in katalog/bestandteile.json ein.
            print(f"    ? nicht sicher, {v['component']}: {v['grund']}")
    for (kuerzel, lang), ids in sorted(unbekannte_formate(a.aus, index).items(), key=lambda kv: str(kv[0])):
        # Laut, nicht still: Ein unbekanntes Format sähe auf der Seite aus wie ein Tutorium. Ein
        # Mensch trägt es mit Quelle und Grund in katalog/formate.json ein (V-0238).
        name = f'„{kuerzel}“' + (f' ({lang})' if lang and lang != kuerzel else '') if kuerzel or lang else '(ohne Angabe)'
        print(f"  ! Format unbekannt: {name} in {len(ids)} Bestandteil{'en' if len(ids) != 1 else ''}, "
              f"z. B. {sorted(ids)[0]}; zählt als sonstige, gehört in katalog/formate.json")
    return 0


def unbekannte_formate(aus, index):
    """{(kuerzel, lang): {component_id, …}} über alle Plan- und Moduldateien, die `index` nennt.
    Gelesen wird das Geschriebene, nicht der Katalog: gemeldet wird, was die Seite wirklich bekommt."""
    out = {}
    for datei in [p['datei'] for p in index['plaene']] + list(index.get('module') or []):
        inhalt = _lies(Path(aus) / datei)
        module = inhalt.get('modules') or ([inhalt['module']] if inhalt.get('module') else [])
        for m in module:
            for c in m['components']:
                f = c.get('format') or {}
                if f.get('unbekannt'):
                    out.setdefault((f.get('kuerzel'), f.get('lang')), set()).add(c.get('id'))
    return out


if __name__ == '__main__':
    sys.exit(main())
