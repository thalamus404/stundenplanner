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
import re
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
    """Wann sich zwei Gruppen überschneiden, lesbar: „Di 13.10.2026 16:00–18:00“ an einem Tag, sonst
    „an 16 Tagen, erstmals Di 13.10.2026 16:00–18:00“. Die Zahl zählt: Eine Blockwoche, die einmal
    auf eine Vorlesung fällt, ist etwas anderes als ein Termin, der jede Woche kollidiert."""
    paare = [(max(x['start'], y['start']), min(x['end'], y['end']))
             for x in a['bookings'] for y in b['bookings'] if x['start'] < y['end'] and y['start'] < x['end']]
    if not paare:
        return ''
    s, e = (datetime.fromisoformat(z) for z in min(paare))
    tage = len({z[:10] for z, _ in paare})
    text = f"{TAGE[s.weekday()]} {s:%d.%m.%Y} {s:%H:%M}–{e:%H:%M}"
    return text if tage == 1 else f'an {tage} Tagen, erstmals {text}'


GRUPPEN = ('eine', 'alle', 'keine', 'unklar')
LEHRFORMEN = re.compile(r'vorlesung|lecture|übung|exercise|tutorium|tutorial|seminar|praktikum|labor')


def verdacht(c):
    """Warum die Gruppen eines Bestandteils vielleicht nicht „wähle eine“ bedeuten — oder None.

    Anlass (steigflug, V-0227, Punkt 633ed71d): MOSES-Gruppen sind Planungsgruppen. Bei 70183,
    70202, 41285 und 40061 besucht man beide Vorlesungsgruppen; die Übung von 41285 bündelt Termine
    an vier Tagen in einer Gruppe, von denen man wohl einen besucht. Die Zeichen dafür, aus den
    Daten gelesen, nie zum Umdeuten, nur zum Warnen (`sicher: false` in `kombination`):
    - die Gruppen liegen zeitlich nacheinander (eine endet, bevor die nächste beginnt): Teile
    - die Gruppennamen nennen Teile („Hälfte“, „Teil“, „Block“) oder verschiedene Lehrformen
      (eine Gruppe „Vorlesung“, eine „Übung“ im selben Bestandteil)
    - die Gruppennamen nennen verschiedene Rhythmen („wöchentlich“ neben „Ungerade Wochen“)
    - eine Gruppe hat je Woche mehr als das Zweieinhalbfache der SWS an Terminen: Wahltermine
    Was der Katalog regelt (`gruppen` am Bestandteil), ist kein Verdacht mehr.
    """
    gs = [g for g in c.get('groups') or [] if g.get('bookings')]
    gruende = []
    if len(gs) >= 2:
        # Nur Gruppen mit mehreren Terminen: Eine Einzelgruppe (Klausureinsicht) ist kein Teil.
        spannen = sorted((min(b['start'] for b in g['bookings']), max(b['end'] for b in g['bookings']))
                         for g in gs if len(g['bookings']) >= 2)
        if any(x[1] <= y[0] for x, y in zip(spannen, spannen[1:])):
            gruende.append('Gruppen liegen zeitlich nacheinander')
        namen = [str(g.get('name') or '').casefold() for g in gs]
        # Teile nur, wenn die Gruppen VERSCHIEDENE Teile nennen: „1. Hälfte, Gruppe 1“ und „1. Hälfte,
        # Gruppe 2“ sind Alternativen (70202, Übung), „1. Hälfte“ und „2. Teil: Block“ nicht.
        teile = {m.group(0) for n in namen for m in re.finditer(r'\d+\.\s*(?:semester)?(?:h[äa]lfte|teil)|block', n)}
        if len(teile) >= 2:
            gruende.append('Gruppennamen nennen verschiedene Teile')
        if len({m for n in namen for m in LEHRFORMEN.findall(n)}) >= 2:
            gruende.append('Gruppennamen nennen verschiedene Lehrformen')
        if any('wöchentlich' in n for n in namen) and any(re.search(r'gerade|14', n) for n in namen):
            gruende.append('Gruppennamen nennen verschiedene Rhythmen')
    sws = c.get('sws')
    if isinstance(sws, (int, float)) and sws > 0:
        for g in gs:
            je_woche = defaultdict(set)
            for x in g['bookings']:
                d = datetime.fromisoformat(x['start'])
                je_woche[d.isocalendar()[:2]].add(d.weekday())
            stunden = sum((datetime.fromisoformat(x['end']) - datetime.fromisoformat(x['start'])).total_seconds()
                          for x in g['bookings']) / 3600
            # Beides muss gelten: viel mehr Stunden je Woche als die SWS UND Termine an mindestens drei
            # Tagen einer Woche. Ein Block (wenige Wochen, lange Termine) ist kein Verdacht, eine
            # Vorlesung an drei Tagen mit passenden SWS (Analysis, 6 SWS) auch nicht.
            if stunden / len(je_woche) > 2.5 * sws * 0.75 and max(len(t) for t in je_woche.values()) >= 3:
                gruende.append(f"Gruppe „{g.get('name') or g['id']}“ hat je Woche weit mehr Termine, als {sws:g} SWS verlangen")
                break
    return '; '.join(gruende) or None


def kombination(components, grenze=GRENZE):
    """Gibt es je Bestandteil eine Gruppe, sodass sich keine zwei gewählten Gruppen überschneiden?

    `components` wie im Lesemodell: je Bestandteil `id`, `title`, `type`, `sws`, optional `gruppen`
    (aus dem Katalog) und `groups`, je Gruppe `id`, `key`, `name` und `bookings`. Ergebnis
    (docs/ARCHITEKTUR.md §5, Feld `kombinationen`):

        {"loesbar": true,  "sicher": …, "beispiel": {"<component_id>": "<group_id>" | ["<id>", …], …}}
        {"loesbar": false, "sicher": …, "grund": "…"}
        {"loesbar": null,  "sicher": false, "grund": "…"}   keine Gruppe im Plan, oder die Grenze
        dazu, wenn es sie gibt: "ausgenommen": [{component, gruppen, grund}], "verdacht": [{component, grund}]

    Regeln, an denen etwas hängt:
    - **`gruppen` am Bestandteil** (Katalog, `katalog/bestandteile.json`): `eine` (Vorgabe: wähle
      eine Gruppe), `alle` (die Gruppen sind Teile, man besucht alle: sie zählen als eine feste
      Gruppe; im Beispiel steht die Liste), `keine` (offenes Angebot wie die Lerninsel: zählt nicht),
      `unklar` (z. B. Wahltermine in einer Gruppe: zählt nicht, und ein „lösbar“ ist nicht sicher).
    - **Ein Bestandteil ohne Gruppe zählt nicht** (Punkt db561642): MOSES listet im Semester keine.
    - **Ein Bestandteil mit genau einer Gruppe ist fest**: Es gibt nichts zu wählen.
    - **Überschneidung heißt `conflicts`**: echte Einzeltermine, direkt anschließend ist keine.
    - **`sicher`**: Ein „unlösbar“ ist sicher, wenn keiner der beteiligten Bestandteile verdächtig
      ist (`verdacht`); ein „lösbar“, wenn keiner im Plan verdächtig oder `unklar` ist. Sonst steht
      `verdacht` dabei, und die Seite sagt „vermutlich“ (Punkt 633ed71d, V-0227).
    - Gesucht wird mit Rückverfolgung: immer zuerst der Bestandteil mit den wenigsten noch passenden
      Gruppen; nach jeder Wahl fallen bei den übrigen die Gruppen weg, die sich mit ihr
      überschneiden, und bleibt bei einem keine, geht es sofort zurück. Die Reihenfolge ist die der
      Daten, das Beispiel also bei gleicher Eingabe dasselbe.
    - Der Grund nennt, wenn er sich so sagen lässt, die festen Termine, an denen es scheitert
      (Anlass: Informatik B.Sc., 1. FS, am 05.10.2026 — jede Gruppe der Analysis-Vorlesung liegt auf
      einer Pflichtvorlesung, die es nur einmal gibt; V-0228). Er wird veröffentlicht: nur Titel,
      Gruppennamen und Zeiten aus der Quelle.
    """
    teile, ausgenommen, verdaechtig = [], [], {}
    for c in components:
        if not c.get('groups'):
            continue
        art = c.get('gruppen') or 'eine'
        if art in ('keine', 'unklar'):
            ausgenommen.append({'component': c['id'], 'gruppen': art,
                                'grund': 'offenes Angebot, keine Wahl' if art == 'keine' else 'laut Katalog unklar'})
            continue
        if art == 'alle':
            # Teile eines Bestandteils: zusammen eine feste „Gruppe“ aus allen Terminen.
            c = {**c, 'groups': [{'id': [g['id'] for g in c['groups']], 'key': c['id'] + ':alle', 'name': 'alle Gruppen',
                                  'bookings': [b for g in c['groups'] for b in g['bookings']]}]}
        elif len(c['groups']) > 1 or art == 'eine':
            v = verdacht(c)
            if v:
                verdaechtig[c['id']] = v
        teile.append(c)
    zusatz = {}
    if ausgenommen:
        zusatz['ausgenommen'] = ausgenommen
    if not teile:
        return {'loesbar': None, 'sicher': False, 'grund': 'Im Plan steht noch keine Termingruppe.', **zusatz}
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

    def mit_verdacht(ids):
        v = [{'component': i, 'grund': verdaechtig[i]} for i in ids if i in verdaechtig]
        return {'verdacht': v} if v else {}

    try:
        gefunden = suche({i: [g['key'] for g in c['groups']] for i, c in enumerate(teile)}, {})
    except _Grenze:
        return {'loesbar': None, 'sicher': False,
                'grund': f'Die Suche hat nach {grenze} Schritten aufgehört; ob es eine Wahl ohne Überschneidung '
                         'gibt, ist offen.', **zusatz}
    alle_ids = [c['id'] for c in teile]
    if gefunden is not None:
        v = mit_verdacht(alle_ids)
        unklar = any(a['gruppen'] == 'unklar' for a in ausgenommen)
        return {'loesbar': True, 'sicher': not v and not unklar,
                'beispiel': {teile[i]['id']: gruppe[gefunden[i]]['id'] for i in sorted(gefunden)}, **zusatz, **v}
    grund, beteiligt = _grund(teile, gruppe, feind)
    v = mit_verdacht(beteiligt if beteiligt is not None else alle_ids)
    return {'loesbar': False, 'sicher': not v, 'grund': grund, **zusatz, **v}


def _grund(teile, gruppe, feind):
    """Warum es keine Wahl ohne Überschneidung gibt — so konkret, wie es sich sagen lässt — und die
    Kennungen der beteiligten Bestandteile (None: alle, der Grund ist allgemein)."""
    fest = {c['groups'][0]['key']: i for i, c in enumerate(teile) if len(c['groups']) == 1}
    saetze, beteiligt = [], []
    for a, i in fest.items():
        for b, j in fest.items():
            if i < j and b in feind[a]:
                saetze.append(f'Die einzigen Gruppen von {_name(teile[i])} und {_name(teile[j])} '
                              f'überschneiden sich ({_zeit(gruppe[a], gruppe[b])}).')
                beteiligt += [teile[i]['id'], teile[j]['id']]
    for i, c in enumerate(teile):
        if len(c['groups']) < 2:
            continue
        stoerer, wer = [], []
        for g in c['groups']:
            b = next((x for x in sorted(feind[g['key']], key=lambda x: fest.get(x, -1)) if x in fest), None)
            if b is None:
                break
            stoerer.append(f"{g.get('name') or g['id']} mit {_name(teile[fest[b]])}, {_zeit(g, gruppe[b])}")
            wer.append(teile[fest[b]]['id'])
        else:
            saetze.append(f'Jede Gruppe von {_name(c)} überschneidet sich mit einer Veranstaltung, die es nur '
                          f'einmal gibt: ' + '; '.join(stoerer) + '.')
            beteiligt += [c['id']] + wer
    if saetze:
        return ' '.join(saetze), list(dict.fromkeys(beteiligt))
    return (f'Keine Wahl aus je einer Gruppe pro Bestandteil ist frei von Überschneidungen '
            f'({len(teile)} Bestandteile mit {len(gruppe)} Gruppen geprüft).'), None
