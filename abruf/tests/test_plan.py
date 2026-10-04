"""Die Planungslogik (plan.py): Rhythmus, Parität, Nachttermine, Kollisionen, Fingerabdruck.

Die ersten Fälle sind die des Vorbilds (Study OS, `app/tests_stundenplan.py`), übernommen mit
ausdrücklichem Anker statt der Konstante. Dazu kommen die Fälle, an denen ein Nachbau am ehesten
bricht: Jahreswechsel (2026 hat 53 ISO-Wochen — eine Parität nach Kalenderwoche kippte dort),
Ferienlücken, versetzte A/B-Gruppen, Mitternacht.
"""
import unittest
from datetime import date

from plan import conflicts, fingerprint, slots

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


if __name__ == '__main__':
    unittest.main()
