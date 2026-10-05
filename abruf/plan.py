"""Planungslogik ohne Datenbank: Fingerabdruck, Termin-Slots und Kollisionen einer Termingruppe.

Herkunft: Study OS (`thalamus404/studyOS`, `app/stundenplan.py`), kopiert. Übernommen ist nur,
was ohne Datenbank gilt — `fingerprint`, `slots`, `conflicts` —, in der Logik unverändert. Neu ist
nur, dass Semester und Anker keine Konstanten mehr sind: Der Anker kommt als Parameter aus dem
Katalog (`katalog/semester/<id>.json`, Feld `anker`), denn ein Code, der ein Semester nennt, gilt
für genau eines (docs/ARCHITEKTUR.md §2).

Wer das Ergebnis liest: `abruf/bauen.py` schreibt `key`, `digest` und `slots` je Gruppe ins
Lesemodell (docs/ARCHITEKTUR.md §5). `conflicts` rechnet im Betrieb die Seite (die Auswahl liegt im
Browser); hier steht sie als geprüfte Referenz, an der sich der Nachbau messen lässt. Neu (V-0233):
`kombination` sagt je Plan, ob es überhaupt eine Wahl ohne Überschneidung gibt — gerechnet mit
`conflicts`, also gegen dieselben Einzeltermine wie die Seite.

Die Regeln, die Fehler gekostet hätten (aus dem Vorbild, dort entstanden):
- SWS bleiben die offizielle Anforderung des Moduls, keine Summe der angebotenen Alternativen.
- Kollisionen zählen an echten Kalenderdaten, nicht an einem Wochentag oder an geratenen A/B-Wochen.
- Die A/B-Parität zählt echte Kalenderwochen ab dem Anker (Montag der ersten Vorlesungswoche).
- Nur Standardbibliothek: Das Lesemodell läuft überall, wo Python läuft.
"""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date, datetime, timedelta

# Wie viele Wahlschritte `kombination` höchstens versucht. Eine Grenze in Schritten statt in Sekunden:
# Gleiche Eingabe gibt dasselbe Ergebnis auf jedem Rechner (bauen.py verspricht gleiche Bytes). Die
# echten Pläne vom 05.10.2026 (zehn TU-Pläne, bis 66 Gruppen) brauchen höchstens einige hundert.
GRENZE = 200_000
TAGE = ('Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So')


def fingerprint(group):
    """sha256 über die nach `id` sortierten Buchungen `{id, start, end, room}`.

    Ändert sich Zeit oder Raum einer gewählten Gruppe, ändert sich der Fingerabdruck: Die Seite
    zeigt dann „geändert seit deiner Wahl“. Titel, Notiz und Info zählen absichtlich nicht.
    """
    payload = [{k: b[k] for k in ('id', 'start', 'end', 'room')} for b in group['bookings']]
    return hashlib.sha256(json.dumps(sorted(payload, key=lambda b: b['id']), sort_keys=True).encode()).hexdigest()


def slots(group, anchor):
    """Die Buchungen einer Gruppe, zusammengefasst je (Wochentag, Beginn, Ende).

    `anchor` ist der Montag der ersten Vorlesungswoche (`date` oder ISO-Text `JJJJ-MM-TT`).
    Je Slot: `day` (0 = Montag), `start`, `end` (`24:00` für einen Termin bis Mitternacht),
    `dates`, `rooms`, `occurrences`, `fortnightly`, `parity` (Liste aus 0/1, Wochen ab Anker),
    `rhythm` (Text für die Anzeige).
    """
    if isinstance(anchor, str):
        anchor = date.fromisoformat(anchor)
    grouped = defaultdict(list)
    for b in group['bookings']:
        start = datetime.fromisoformat(b['start']); end = datetime.fromisoformat(b['end'])
        # Nachttermine werden für die Anzeige an Mitternacht geteilt; die Kollisionsprüfung
        # (conflicts) behält das ganze Intervall.
        cursor = start
        while cursor < end:
            midnight = datetime.combine(cursor.date() + timedelta(days=1), datetime.min.time())
            stop = min(end, midnight)
            grouped[(cursor.weekday(), cursor.strftime('%H:%M'),
                     stop.strftime('%H:%M') if stop < midnight else '24:00')].append((cursor.date(), b))
            cursor = stop
    out = []
    evidence = ' '.join(s.get('Datum/Uhrzeit', '') for s in group.get('series', []))
    for (day, start, end), entries in sorted(grouped.items()):
        dates = sorted(set(d for d, b in entries))
        gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
        # Mindestens 3 echte Termine und ein anhaltender 14-Tage-Abstand; eine einzelne
        # Ferienlücke ist kein Beleg für einen 14-tägigen Termin.
        fortnight = (len(dates) >= 3 and gaps.count(14) >= max(2, len(gaps) * 0.65) and 7 not in gaps)
        # Sagt die Quelle selbst „14-tägig“, genügen zwei Termine — solange keine Woche dazwischen fehlt.
        if ('14-täg' in evidence or 'zweiwöch' in evidence or '2-wöch' in evidence) and len(dates) >= 2:
            fortnight = 7 not in gaps
        parity = sorted({((d - anchor).days // 7) % 2 for d in dates})
        out.append({'day': day, 'start': start, 'end': end, 'dates': [d.isoformat() for d in dates],
                    'rooms': sorted(set(b['room'] for d, b in entries)),
                    'occurrences': [{'id': b['id'], 'date': d.isoformat(), 'start': start, 'end': end,
                                     'room': b['room'], 'note': b.get('note', ''), 'info': b.get('info', '')}
                                    for d, b in entries],
                    'fortnightly': fortnight, 'parity': parity,
                    'rhythm': '14-tägig' if fortnight else (
                        ('wöchentlich' if set(gaps) == {7} else 'wöchentlich mit Ausnahmen')
                        if len(dates) >= 5 and 7 in gaps else f'{len(dates)} Einzeltermine')})
    return out


def conflicts(groups):
    """Paare von Gruppen (`key`), deren Buchungen sich an echten Daten überschneiden.

    Direkt anschließende Termine (Ende 12:00, Beginn 12:00) sind keine Kollision. Verglichen wird
    der ISO-Text der Ortszeit, wie ihn der Abruf schreibt (immer dasselbe Format, ohne Zone).
    """
    out = []
    for i, a in enumerate(groups):
        for b in groups[i + 1:]:
            dates = set()
            for x in a['bookings']:
                for y in b['bookings']:
                    if x['start'] < y['end'] and y['start'] < x['end']:
                        dates.add(max(x['start'], y['start'])[:10])
            if dates:
                out.append({'a': a['key'], 'b': b['key'], 'dates': sorted(dates)})
    return out


class _Grenze(Exception):
    pass


def _name(c):
    titel = c.get('title') or c.get('id')
    return f"{titel} ({c['type']})" if c.get('type') else str(titel)


def _zeit(a, b):
    """Die erste echte Überschneidung zweier Gruppen, lesbar: „Di 13.10.2026 16:00–18:00“."""
    paare = [(max(x['start'], y['start']), min(x['end'], y['end']))
             for x in a['bookings'] for y in b['bookings'] if x['start'] < y['end'] and y['start'] < x['end']]
    if not paare:
        return ''
    s, e = (datetime.fromisoformat(z) for z in min(paare))
    return f"{TAGE[s.weekday()]} {s:%d.%m.%Y} {s:%H:%M}–{e:%H:%M}"


def kombination(components, grenze=GRENZE):
    """Gibt es je Bestandteil eine Gruppe, sodass sich keine zwei gewählten Gruppen überschneiden?

    `components` wie im Lesemodell: je Bestandteil `id`, `title`, `type` und `groups`, je Gruppe `id`,
    `key`, `name` und `bookings`. Ergebnis (docs/ARCHITEKTUR.md §5, Feld `kombinationen`):

        {"loesbar": true,  "beispiel": {"<component_id>": "<group_id>", …}}
        {"loesbar": false, "grund": "…"}
        {"loesbar": null,  "grund": "…"}   noch keine Gruppe im Plan, oder die Suche stieß an `grenze`

    Regeln, an denen etwas hängt:
    - **Ein Bestandteil ohne Gruppe zählt nicht** (Punkt db561642): MOSES listet im Semester keine,
      also lässt er sich weder einplanen noch verhindert er etwas.
    - **Ein Bestandteil mit genau einer Gruppe ist fest**: Es gibt nichts zu wählen.
    - **Überschneidung heißt `conflicts`**: echte Einzeltermine, direkt anschließend ist keine.
    - Gesucht wird mit Rückverfolgung: immer zuerst der Bestandteil mit den wenigsten noch passenden
      Gruppen; nach jeder Wahl fallen bei den übrigen die Gruppen weg, die sich mit ihr
      überschneiden, und bleibt bei einem keine, geht es sofort zurück. Die Reihenfolge ist die der
      Daten, das Beispiel also bei gleicher Eingabe dasselbe.
    - Der Grund nennt, wenn er sich so sagen lässt, die festen Termine, an denen es scheitert
      (Anlass: Informatik B.Sc., 1. FS, am 05.10.2026 — jede Gruppe der Analysis-Vorlesung liegt auf
      einer Pflichtvorlesung, die es nur einmal gibt; V-0228). Er wird veröffentlicht: nur Titel,
      Gruppennamen und Zeiten aus MOSES.
    """
    teile = [c for c in components if c.get('groups')]
    if not teile:
        return {'loesbar': None, 'grund': 'Im Plan steht noch keine Termingruppe.'}
    gruppe, teil_von = {}, {}
    for i, c in enumerate(teile):
        for g in c['groups']:
            gruppe[g['key']] = g
            teil_von[g['key']] = i
    feind = defaultdict(set)
    for k in conflicts([g for c in teile for g in c['groups']]):
        if teil_von[k['a']] != teil_von[k['b']]:
            feind[k['a']].add(k['b'])
            feind[k['b']].add(k['a'])
    schritte = 0

    def suche(offen, gewaehlt):
        nonlocal schritte
        if not offen:
            return gewaehlt
        i = min(offen, key=lambda j: (len(offen[j]), j))
        for k in offen[i]:
            schritte += 1
            if schritte > grenze:
                raise _Grenze
            rest = {}
            for j, d in offen.items():
                if j != i:
                    rest[j] = [x for x in d if x not in feind[k]]
                    if not rest[j]:
                        break
            else:
                gefunden = suche(rest, {**gewaehlt, i: k})
                if gefunden is not None:
                    return gefunden
        return None

    try:
        gefunden = suche({i: [g['key'] for g in c['groups']] for i, c in enumerate(teile)}, {})
    except _Grenze:
        return {'loesbar': None, 'grund': f'Die Suche hat nach {grenze} Schritten aufgehört; ob es eine Wahl '
                                          'ohne Überschneidung gibt, ist offen.'}
    if gefunden is not None:
        return {'loesbar': True, 'beispiel': {teile[i]['id']: gruppe[gefunden[i]]['id'] for i in sorted(gefunden)}}
    return {'loesbar': False, 'grund': _grund(teile, gruppe, feind)}


def _grund(teile, gruppe, feind):
    """Warum es keine Wahl ohne Überschneidung gibt — so konkret, wie es sich sagen lässt."""
    fest = {c['groups'][0]['key']: i for i, c in enumerate(teile) if len(c['groups']) == 1}
    saetze = []
    for a, i in fest.items():
        for b, j in fest.items():
            if i < j and b in feind[a]:
                saetze.append(f'Die einzigen Gruppen von {_name(teile[i])} und {_name(teile[j])} '
                              f'überschneiden sich ({_zeit(gruppe[a], gruppe[b])}).')
    for i, c in enumerate(teile):
        if len(c['groups']) < 2:
            continue
        stoerer = []
        for g in c['groups']:
            b = next((x for x in sorted(feind[g['key']], key=lambda x: fest.get(x, -1)) if x in fest), None)
            if b is None:
                break
            stoerer.append(f"{g.get('name') or g['id']} mit {_name(teile[fest[b]])}, {_zeit(g, gruppe[b])}")
        else:
            saetze.append(f'Jede Gruppe von {_name(c)} überschneidet sich mit einer Veranstaltung, die es nur '
                          f'einmal gibt: ' + '; '.join(stoerer) + '.')
    if saetze:
        return ' '.join(saetze)
    return (f'Keine Wahl aus je einer Gruppe pro Bestandteil ist frei von Überschneidungen '
            f'({len(teile)} Bestandteile mit {len(gruppe)} Gruppen geprüft).')
