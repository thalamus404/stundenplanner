"""Die Planungslogik (plan.py): Rhythmus, Parität, Nachttermine, Kollisionen, Fingerabdruck.

Die ersten Fälle sind die des Vorbilds (Study OS, `app/tests_stundenplan.py`), übernommen mit
ausdrücklichem Anker statt der Konstante. Dazu kommen die Fälle, an denen ein Nachbau am ehesten
bricht: Jahreswechsel (2026 hat 53 ISO-Wochen — eine Parität nach Kalenderwoche kippte dort),
Ferienlücken, versetzte A/B-Gruppen, Mitternacht.
"""
import unittest
from datetime import date

import itertools
import random

from plan import conflicts, fingerprint, kombination, slots, verdacht

ANKER = date(2026, 10, 12)  # ein Montag; nur Testparameter, der Code kennt kein Datum


def group(key, dates, start='10:00', end='12:00', room='H 1', series=()):
    return {'key': key, 'series': list(series),
            'bookings': [{'id': str(i), 'start': d + 'T' + start + ':00', 'end': d + 'T' + end + ':00', 'room': room}
                         for i, d in enumerate(dates)]}


class VorbildTests(unittest.TestCase):
    """Die Fälle aus dem Study OS, unverändert in der Erwartung."""

    def test_fortnightly_alternatives_dont_conflict(self):
        a = group('a', ['2026-10-12', '2026-10-26', '2026-11-09'])
        b = group('b', ['2026-10-19', '2026-11-02', '2026-11-16'])
        self.assertEqual(conflicts([a, b]), [])
        self.assertTrue(slots(a, ANKER)[0]['fortnightly'])
        self.assertEqual(slots(a, ANKER)[0]['parity'], [0])
        self.assertEqual(slots(b, ANKER)[0]['parity'], [1])

    def test_holiday_gap_is_not_fortnightly(self):
        a = group('a', ['2026-12-07', '2026-12-14', '2027-01-04', '2027-01-11'])
        self.assertFalse(slots(a, ANKER)[0]['fortnightly'])

    def test_exact_collision_and_adjacent_classes(self):
        a = group('a', ['2026-10-12'])
        b = group('b', ['2026-10-12'], '11:00', '13:00')
        c = group('c', ['2026-10-12'], '12:00', '14:00')
        self.assertEqual(conflicts([a, b])[0]['dates'], ['2026-10-12'])
        self.assertEqual(conflicts([a, c]), [])

    def test_multiple_weekdays_of_one_group_survive(self):
        a = group('a', ['2026-10-15', '2026-10-16'])
        self.assertEqual({s['day'] for s in slots(a, ANKER)}, {3, 4})

    def test_room_change_needs_review(self):
        a = group('a', ['2026-10-12'])
        h = fingerprint(a)
        a['bookings'][0]['room'] = 'H 2'
        self.assertNotEqual(fingerprint(a), h)

    def test_overnight_keeps_second_day(self):
        a = group('a', ['2026-10-12'], '23:00', '23:59')
        a['bookings'][0]['end'] = '2026-10-13T01:00:00'
        self.assertEqual([(s['day'], s['start'], s['end']) for s in slots(a, ANKER)],
                         [(0, '23:00', '24:00'), (1, '00:00', '01:00')])

    def test_four_isolated_dates_not_a_weekly_promise(self):
        a = group('a', ['2026-10-12', '2026-10-19', '2027-02-01', '2027-02-08'])
        s = slots(a, ANKER)[0]
        self.assertFalse(s['fortnightly'])
        self.assertEqual(len(s['dates']), 4)
        self.assertEqual(s['rhythm'], '4 Einzeltermine')


class RhythmusTests(unittest.TestCase):

    def test_weekly(self):
        a = group('a', ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
        s = slots(a, ANKER)
        self.assertEqual(len(s), 1)
        self.assertEqual(s[0]['rhythm'], 'wöchentlich')
        self.assertEqual(s[0]['parity'], [0, 1])
        self.assertFalse(s[0]['fortnightly'])

    def test_holiday_gap_in_weekly_class_is_an_exception_not_a_rhythm(self):
        # Wöchentlich bis vor Weihnachten, zwei Wochen Pause, dann weiter: wöchentlich mit Ausnahmen.
        a = group('a', ['2026-12-07', '2026-12-14', '2026-12-21', '2027-01-04', '2027-01-11', '2027-01-18'])
        s = slots(a, ANKER)[0]
        self.assertFalse(s['fortnightly'])
        self.assertEqual(s['rhythm'], 'wöchentlich mit Ausnahmen')

    def test_fortnightly_across_year_end_keeps_parity(self):
        # 28.12.2026 ist ISO-Woche 53, 11.01.2027 ISO-Woche 2. Eine Parität nach Kalenderwoche
        # kippte hier; ab Anker gezählt bleibt die Gruppe in derselben Woche.
        a = group('a', ['2026-12-14', '2026-12-28', '2027-01-11', '2027-01-25'])
        s = slots(a, ANKER)[0]
        self.assertTrue(s['fortnightly'])
        self.assertEqual(s['rhythm'], '14-tägig')
        self.assertEqual(s['parity'], [1])
        self.assertEqual(s['dates'], ['2026-12-14', '2026-12-28', '2027-01-11', '2027-01-25'])

    def test_offset_ab_groups(self):
        a = group('a', ['2026-10-13', '2026-10-27', '2026-11-10', '2026-11-24', '2026-12-08'])
        b = group('b', ['2026-10-20', '2026-11-03', '2026-11-17', '2026-12-01', '2026-12-15'])
        sa, sb = slots(a, ANKER)[0], slots(b, ANKER)[0]
        self.assertTrue(sa['fortnightly'] and sb['fortnightly'])
        self.assertEqual((sa['parity'], sb['parity']), ([0], [1]))
        self.assertEqual((sa['day'], sa['start'], sa['end']), (sb['day'], sb['start'], sb['end']))
        self.assertEqual(conflicts([a, b]), [])

    def test_source_says_fortnightly_two_dates_suffice(self):
        a = group('a', ['2026-10-12', '2026-10-26'], series=[{'Datum/Uhrzeit': 'Mo. 12.10 - 26.10.26, 14-täglich, 10:00 - 12:00'}])
        self.assertTrue(slots(a, ANKER)[0]['fortnightly'])

    def test_source_says_fortnightly_but_a_week_is_between(self):
        a = group('a', ['2026-10-12', '2026-10-19', '2026-11-02'], series=[{'Datum/Uhrzeit': 'zweiwöchentlich'}])
        self.assertFalse(slots(a, ANKER)[0]['fortnightly'])

    def test_two_dates_without_source_evidence_are_single_dates(self):
        a = group('a', ['2026-10-12', '2026-10-26'])
        s = slots(a, ANKER)[0]
        self.assertFalse(s['fortnightly'])
        self.assertEqual(s['rhythm'], '2 Einzeltermine')

    def test_multiple_weekdays_each_weekly(self):
        mo = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']
        do = ['2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12']
        a = group('a', mo + do)
        s = slots(a, ANKER)
        self.assertEqual([x['day'] for x in s], [0, 3])
        self.assertEqual([x['rhythm'] for x in s], ['wöchentlich', 'wöchentlich'])
        self.assertEqual(sum(len(x['occurrences']) for x in s), 10)

    def test_anchor_as_text_equals_anchor_as_date(self):
        a = group('a', ['2026-10-12', '2026-10-26', '2026-11-09'])
        self.assertEqual(slots(a, '2026-10-12'), slots(a, ANKER))

    def test_parity_moves_with_anchor(self):
        # Der Anker kommt aus dem Katalog; ein anderer Semesterbeginn verschiebt A/B, sonst nichts.
        a = group('a', ['2026-10-12', '2026-10-26', '2026-11-09'])
        self.assertEqual(slots(a, date(2026, 10, 19))[0]['parity'], [1])


class SlotFormTests(unittest.TestCase):

    def test_slot_fields_and_occurrences(self):
        a = group('a', ['2026-10-12', '2026-10-19'], room='H 1')
        a['bookings'][1]['room'] = 'H 2'
        a['bookings'][1]['note'] = 'Raum verlegt'
        s = slots(a, ANKER)[0]
        self.assertEqual(sorted(s), ['dates', 'day', 'end', 'fortnightly', 'occurrences', 'parity', 'rhythm', 'rooms', 'start'])
        self.assertEqual(s['rooms'], ['H 1', 'H 2'])
        self.assertEqual(s['occurrences'][1], {'id': '1', 'date': '2026-10-19', 'start': '10:00', 'end': '12:00',
                                               'room': 'H 2', 'note': 'Raum verlegt', 'info': ''})

    def test_ending_at_midnight_is_one_slot_until_24(self):
        a = group('a', ['2026-10-12'], '22:00', '23:00')
        a['bookings'][0]['end'] = '2026-10-13T00:00:00'
        self.assertEqual([(s['day'], s['start'], s['end']) for s in slots(a, ANKER)], [(0, '22:00', '24:00')])

    def test_group_without_bookings_has_no_slots(self):
        self.assertEqual(slots(group('a', []), ANKER), [])

    def test_slots_are_sorted_by_day_and_time(self):
        a = group('a', ['2026-10-16', '2026-10-12'])
        a['bookings'].append({'id': '9', 'start': '2026-10-12T08:00:00', 'end': '2026-10-12T09:00:00', 'room': 'H 1'})
        self.assertEqual([(s['day'], s['start']) for s in slots(a, ANKER)], [(0, '08:00'), (0, '10:00'), (4, '10:00')])


class KollisionTests(unittest.TestCase):

    def test_adjacent_classes_are_no_conflict(self):
        a = group('a', ['2026-10-12', '2026-10-19'], '10:00', '12:00')
        b = group('b', ['2026-10-12', '2026-10-19'], '12:00', '14:00')
        self.assertEqual(conflicts([a, b]), [])

    def test_conflict_counts_real_dates_only(self):
        # Gleicher Wochentag, gleiche Zeit, aber nur ein gemeinsames Datum: nur dieses zählt.
        a = group('a', ['2026-10-12', '2026-10-19', '2026-10-26'])
        b = group('b', ['2026-10-19', '2026-11-02'], '11:00', '12:30')
        self.assertEqual(conflicts([a, b]), [{'a': 'a', 'b': 'b', 'dates': ['2026-10-19']}])

    def test_overnight_conflict_uses_full_interval(self):
        a = group('a', ['2026-10-12'], '23:00', '23:59')
        a['bookings'][0]['end'] = '2026-10-13T01:00:00'
        b = group('b', ['2026-10-13'], '00:30', '01:30')
        self.assertEqual(conflicts([a, b]), [{'a': 'a', 'b': 'b', 'dates': ['2026-10-13']}])

    def test_every_pair_once(self):
        a = group('a', ['2026-10-12'])
        b = group('b', ['2026-10-12'])
        c = group('c', ['2026-10-12'])
        self.assertEqual([(x['a'], x['b']) for x in conflicts([a, b, c])], [('a', 'b'), ('a', 'c'), ('b', 'c')])

    def test_same_time_other_week_is_no_conflict(self):
        self.assertEqual(conflicts([group('a', ['2026-10-12']), group('b', ['2026-10-19'])]), [])


class FingerabdruckTests(unittest.TestCase):

    def test_time_change_changes_digest(self):
        a = group('a', ['2026-10-12'])
        h = fingerprint(a)
        a['bookings'][0]['end'] = '2026-10-12T12:15:00'
        self.assertNotEqual(fingerprint(a), h)

    def test_new_booking_changes_digest(self):
        a = group('a', ['2026-10-12'])
        self.assertNotEqual(fingerprint(a), fingerprint(group('a', ['2026-10-12', '2026-10-19'])))

    def test_order_title_and_note_do_not_change_digest(self):
        a = group('a', ['2026-10-12', '2026-10-19'])
        h = fingerprint(a)
        a['bookings'].reverse()
        a['bookings'][0]['title'] = 'Neuer Titel'
        a['bookings'][0]['note'] = 'Hinweis'
        a['name'] = 'Umbenannt'
        self.assertEqual(fingerprint(a), h)

    def test_digest_is_sha256_hex(self):
        h = fingerprint(group('a', []))
        self.assertEqual(len(h), 64)
        self.assertEqual(h, fingerprint(group('b', [])))



def teil(cid, *gruppen, title=None, typ='UE'):
    """Ein Bestandteil wie im Lesemodell; jede Gruppe ist (gid, [(datum, beginn, ende), …])."""
    gs = []
    for gid, termine in gruppen:
        gs.append({'id': gid, 'key': f'{cid}:{gid}', 'name': f'Gruppe {gid}',
                   'bookings': [{'id': f'{gid}-{i}', 'start': f'{d}T{s}:00', 'end': f'{d}T{e}:00', 'room': 'R'}
                                for i, (d, s, e) in enumerate(termine)]})
    return {'id': cid, 'title': title or f'Teil {cid}', 'type': typ, 'groups': gs}


MO = '2026-10-12'
DI = '2026-10-13'


class KombinationTests(unittest.TestCase):
    """Gibt es je Bestandteil eine Gruppe ohne Überschneidung? (V-0233, Anlass Informatik 1. FS)"""

    def test_loesbar_mit_beispiel(self):
        a = teil('m:1', ('a1', [(MO, '10:00', '12:00')]), ('a2', [(DI, '10:00', '12:00')]))
        b = teil('m:2', ('b1', [(MO, '11:00', '13:00')]))
        self.assertEqual(kombination([a, b]), {'loesbar': True, 'sicher': True, 'beispiel': {'m:1': 'a2', 'm:2': 'b1'}})

    def test_feste_termine_verhindern_jede_gruppe(self):
        # Wie Informatik am 05.10.2026: jede Gruppe der Analysis-VL liegt auf einer einmaligen Pflicht-VL.
        ana = teil('ana', ('g1', [(DI, '16:00', '18:00')]), ('g2', [(DI, '10:00', '12:00')]), title='Analysis', typ='VL')
        inf = teil('inf', ('x', [(DI, '16:00', '18:00')]), title='Informatik als Disziplin', typ='VL')
        prog = teil('prog', ('y', [(DI, '10:00', '12:00')]), title='Programmierung', typ='VL')
        r = kombination([ana, inf, prog])
        self.assertIs(r['loesbar'], False)
        self.assertIs(r['sicher'], True)
        self.assertNotIn('beispiel', r)
        self.assertIn('Jede Gruppe von Analysis (VL)', r['grund'])
        self.assertIn('Gruppe g1 mit Informatik als Disziplin (VL), Di 13.10.2026 16:00–18:00', r['grund'])
        ana['groups'][0]['bookings'].append({'id': 'x', 'start': '2026-10-20T16:00:00', 'end': '2026-10-20T18:00:00', 'room': 'R'})
        inf['groups'][0]['bookings'].append({'id': 'y', 'start': '2026-10-20T16:00:00', 'end': '2026-10-20T18:00:00', 'room': 'R'})
        self.assertIn('Gruppe g1 mit Informatik als Disziplin (VL), an 2 Tagen, erstmals Di 13.10.2026', kombination([ana, inf, prog])['grund'])
        self.assertIn('Gruppe g2 mit Programmierung (VL), Di 13.10.2026 10:00–12:00', r['grund'])

    def test_zwei_feste_ueberschneiden_sich(self):
        a = teil('a', ('1', [(MO, '10:00', '12:00')]), title='A')
        b = teil('b', ('1', [(MO, '11:30', '12:30')]), title='B')
        r = kombination([a, b])
        self.assertIs(r['loesbar'], False)
        self.assertIn('Die einzigen Gruppen von A (UE) und B (UE) überschneiden sich (Mo 12.10.2026 11:30–12:00)', r['grund'])

    def test_bestandteil_ohne_gruppe_zaehlt_nicht(self):
        # Punkt db561642: Übung ohne Gruppe im Semester — weder einplanbar noch ein Hindernis.
        leer = teil('leer')
        a = teil('a', ('1', [(MO, '10:00', '12:00')]))
        self.assertEqual(kombination([leer, a]), {'loesbar': True, 'sicher': True, 'beispiel': {'a': '1'}})

    def test_ohne_jede_gruppe_ist_offen(self):
        r = kombination([teil('leer')])
        self.assertIsNone(r['loesbar'])
        self.assertTrue(r['grund'])
        self.assertIsNone(kombination([])['loesbar'])

    def test_direkt_anschliessend_und_alternativen_desselben_teils(self):
        a = teil('a', ('1', [(MO, '10:00', '12:00')]), ('2', [(MO, '10:00', '12:00')]))
        b = teil('b', ('1', [(MO, '12:00', '14:00')]))
        self.assertIs(kombination([a, b])['loesbar'], True)

    def test_ohne_einfachen_grund_ein_allgemeiner(self):
        # Drei Teile, je zwei Gruppen in denselben zwei Zeitfenstern: Schubfach, kein fester Termin schuld.
        z = [(MO, '10:00', '12:00')], [(DI, '10:00', '12:00')]
        teile = [teil(c, ('1', z[0]), ('2', z[1])) for c in 'abc']
        r = kombination(teile)
        self.assertIs(r['loesbar'], False)
        self.assertIn('3 Bestandteile mit 6 Gruppen', r['grund'])

    def test_grenze_in_schritten_nicht_in_sekunden(self):
        z = [[(MO, f'{h}:00', f'{h}:30')] for h in range(10, 16)]
        teile = [teil(c, *[(str(i), z[i]) for i in range(5)]) for c in 'abcdef']  # 6 Teile, 5 Fenster
        self.assertIs(kombination(teile)['loesbar'], False)
        r = kombination(teile, grenze=10)
        self.assertIsNone(r['loesbar'])
        self.assertIn('10 Schritten', r['grund'])
        self.assertEqual(kombination(teile, grenze=10), r)

    def test_gruppen_alle_sind_teile_und_zaehlen_zusammen(self):
        # 70202 im WiSe 2026/27: Vorlesung wöchentlich bis Dezember, dann ein Block — man besucht beide.
        vl = teil('vl', ('w', [(MO, '10:00', '12:00')]), ('blk', [(DI, '10:00', '12:00')]), typ='VL')
        ue = teil('ue', ('1', [(MO, '10:00', '12:00')]))
        self.assertIs(kombination([vl, ue])['loesbar'], True)          # als Alternativen gelesen: lösbar
        vl['gruppen'] = 'alle'
        r = kombination([vl, ue])
        self.assertIs(r['loesbar'], False)                              # als Teile: Montag kollidiert
        self.assertIn('Die einzigen Gruppen von Teil vl (VL) und Teil ue (UE)', r['grund'])
        ue['groups'][0]['bookings'][0]['start'] = MO + 'T14:00:00'
        ue['groups'][0]['bookings'][0]['end'] = MO + 'T16:00:00'
        self.assertEqual(kombination([vl, ue])['beispiel'], {'vl': ['w', 'blk'], 'ue': '1'})

    def test_gruppen_keine_und_unklar_zaehlen_nicht(self):
        a = teil('a', ('1', [(MO, '10:00', '12:00')]))
        li = teil('li', ('x', [(MO, '10:00', '12:00')]), ('y', [(MO, '10:30', '11:00')]), typ='LI')
        li['gruppen'] = 'keine'
        r = kombination([a, li])
        self.assertEqual((r['loesbar'], r['sicher']), (True, True))
        self.assertEqual(r['ausgenommen'], [{'component': 'li', 'gruppen': 'keine', 'grund': 'offenes Angebot, keine Wahl'}])
        li['gruppen'] = 'unklar'
        r = kombination([a, li])
        self.assertEqual((r['loesbar'], r['sicher']), (True, False))   # was unklar ist, könnte stören

    def test_verdacht_macht_ein_unloesbar_unsicher(self):
        # Wie die Übung von 41285: eine Gruppe mit Terminen an vier Tagen bei 2 SWS — Wahltermine?
        ue = teil('ue', ('ex', [(d, '10:00', '12:00') for d in ('2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15')]))
        ue['sws'] = 2
        vl = teil('vl', ('1', [(DI, '10:00', '12:00')]), typ='VL')
        self.assertIn('weit mehr Termine', verdacht(ue))
        r = kombination([ue, vl])
        self.assertEqual((r['loesbar'], r['sicher']), (False, False))
        self.assertEqual([v['component'] for v in r['verdacht']], ['ue'])

    def test_verdacht_aus_namen_und_zeitspannen(self):
        haelften = teil('m', ('1', [(MO, '10:00', '12:00'), ('2026-10-19', '10:00', '12:00')]),
                        ('2', [('2026-12-14', '10:00', '12:00'), ('2026-12-21', '10:00', '12:00')]), typ='VL')
        self.assertIn('nacheinander', verdacht(haelften))
        haelften['groups'][0]['name'], haelften['groups'][1]['name'] = '1. Hälfte', '2. Teil: Blockveranstaltung'
        self.assertIn('verschiedene Teile', verdacht(haelften))
        parallel = teil('u', ('1', [(MO, '10:00', '12:00')]), ('2', [(DI, '10:00', '12:00')]))
        parallel['groups'][0]['name'], parallel['groups'][1]['name'] = '1. Hälfte, Gruppe 1', '1. Hälfte, Gruppe 2'
        self.assertIsNone(verdacht(parallel))
        formen = teil('k', ('a', [(MO, '10:00', '12:00')]), ('b', [(DI, '10:00', '12:00')]))
        formen['groups'][0]['name'], formen['groups'][1]['name'] = 'Vorlesung', 'Übung'
        self.assertIn('Lehrformen', verdacht(formen))
        formen['groups'][0]['name'], formen['groups'][1]['name'] = 'Vorlesung wöchentlich', 'Vorlesung Ungerade Wochen'
        self.assertIn('Rhythmen', verdacht(formen))
        formen['groups'][0]['name'], formen['groups'][1]['name'] = 'Termingruppe 1', 'Termingruppe 2'
        self.assertIsNone(verdacht(formen))

    def test_stimmt_mit_vollstaendiger_aufzaehlung(self):
        # Gegenprobe gegen das Durchprobieren aller Kombinationen, mit festem Zufall.
        rnd = random.Random(20261005)
        fenster = [(d, f'{h:02d}:00', f'{h + 2:02d}:00') for d in (MO, DI) for h in (8, 10, 11, 14)]
        for _ in range(300):
            teile = [teil(f't{i}', *[(f'g{j}', rnd.sample(fenster, rnd.randint(1, 2))) for j in range(rnd.randint(0, 3))])
                     for i in range(rnd.randint(1, 5))]
            mit = [c for c in teile if c['groups']]
            erwartet = None if not mit else any(
                not conflicts(list(wahl)) for wahl in itertools.product(*[c['groups'] for c in mit]))
            r = kombination(teile)
            self.assertEqual(r['loesbar'], erwartet)
            if r['loesbar']:
                wahl = [next(g for g in c['groups'] if g['id'] == r['beispiel'][c['id']]) for c in mit]
                self.assertEqual(conflicts(wahl), [])
                self.assertEqual(list(r['beispiel']), [c['id'] for c in mit])

if __name__ == '__main__':
    unittest.main()
