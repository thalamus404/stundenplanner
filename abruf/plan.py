"""Planungslogik ohne Datenbank: Fingerabdruck, Termin-Slots und Kollisionen einer Termingruppe.

Herkunft: Study OS (`thalamus404/studyOS`, `app/stundenplan.py`), kopiert. Übernommen ist nur,
was ohne Datenbank gilt — `fingerprint`, `slots`, `conflicts` —, in der Logik unverändert. Neu ist
nur, dass Semester und Anker keine Konstanten mehr sind: Der Anker kommt als Parameter aus dem
Katalog (`katalog/semester/<id>.json`, Feld `anker`), denn ein Code, der ein Semester nennt, gilt
für genau eines (docs/ARCHITEKTUR.md §2).

Wer das Ergebnis liest: `abruf/bauen.py` schreibt `key`, `digest` und `slots` je Gruppe ins
Lesemodell (docs/ARCHITEKTUR.md §5). `conflicts` rechnet im Betrieb die Seite (die Auswahl liegt im
Browser); hier steht sie als geprüfte Referenz, an der sich der Nachbau messen lässt.

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
