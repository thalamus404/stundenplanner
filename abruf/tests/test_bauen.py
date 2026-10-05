"""Das Lesemodell (bauen.py) gegen den Vertrag in docs/ARCHITEKTUR.md §5.

Die Fixtures (`fixtures/lesemodell/`) sind erfunden: zwei Studiengänge, drei Pläne, zwei Semester,
ein Modul ohne Rohstand, eines mit gescheitertem ersten Abruf, ein Semester ganz ohne Rohstände.
Die Schlüssel stehen hier ein zweites Mal, unabhängig vom Code: Ändert jemand das Format, ohne den
Vertrag zu ändern, wird dieser Test rot.
"""
import contextlib
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import bauen
import katalog as K
from plan import fingerprint, slots

HIER = Path(__file__).resolve().parent
FIX = HIER / 'fixtures' / 'lesemodell'
ABRUF = HIER.parent

# docs/ARCHITEKTUR.md §5 — genau diese Schlüssel, nicht mehr.
INDEX_KEYS = {'schema', 'erzeugt_am', 'stufen', 'wahl', 'plaene'}
INDEX_PLAN_KEYS = {'studiengang', 'name', 'abschluss', 'semester', 'label', 'fachsemester', 'datei'}
PLAN_KEYS = {'schema', 'erzeugt_am', 'studiengang', 'semester', 'label', 'anchor', 'fachsemester', 'modules',
             'has_fortnightly', 'group_count', 'booking_count', 'last_run',
             'id', 'hochschule', 'vertiefung', 'ordnung', 'kombinationen'}
HOCHSCHULE_KEYS = {'id', 'kurz', 'name', 'quelle'}
ORDNUNG_KEYS = {'id', 'label', 'name', 'fundstelle', 'url', 'gilt_ab', 'gilt_bis', 'studienbeginn', 'fuer_wen'}
KNOTEN_KEYS = {'stufe', 'regel', 'optionen'}  # dazu `label` nur am Knoten der Vertiefung
OPTION_KEYS = {'id', 'label', 'zusatz'}       # dazu `weiter`, oder `plan` an der letzten Stufe
STUDIENGANG_KEYS = {'id', 'name', 'abschluss'}
MODULE_KEYS = {'number', 'short', 'title', 'version', 'valid_from', 'valid_to', 'valid_versions', 'url', 'isis_url',
               'notes', 'checked_at', 'success_at', 'error', 'components'}
LAST_RUN_KEYS = {'finished_at', 'status', 'modules', 'bookings', 'errors'}
GROUP_EXTRA = {'key', 'digest', 'slots'}
SLOT_KEYS = {'day', 'start', 'end', 'dates', 'rooms', 'occurrences', 'fortnightly', 'parity', 'rhythm'}
# Was vom Betrachter abhängt, rechnet die Seite — es darf nirgends im Lesemodell stehen.
VIEWER_KEYS = {'selected', 'changed', 'revision', 'selection', 'missing', 'selected_count', 'conflicts', 'stale'}

T = '2030-10-01T06:00:00+00:00'


def alle_schluessel(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from alle_schluessel(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from alle_schluessel(v)


def lies(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


class LesemodellTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.aus = cls.tmp / 'daten'
        cls.index = bauen.bauen(FIX / 'katalog', FIX / 'roh', cls.aus, erzeugt_am=T)
        cls.fs1 = lies(cls.aus / 'test-bsc/ws-2030-31-fs1.json')
        cls.fs3 = lies(cls.aus / 'test-bsc/ws-2030-31-fs3.json')
        cls.msc = lies(cls.aus / 'probe-msc/ss-2031-fs2.json')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def modul(self, plan, nummer):
        return next(m for m in plan['modules'] if m['number'] == nummer)

    # — index.json —

    def test_index_keys_and_order(self):
        self.assertEqual(lies(self.aus / 'index.json'), self.index)
        self.assertEqual(set(self.index), INDEX_KEYS)
        self.assertEqual(self.index['schema'], 2)
        self.assertEqual(self.index['erzeugt_am'], T)
        for p in self.index['plaene']:
            self.assertEqual(set(p), INDEX_PLAN_KEYS)
        # Studiengang nach id, dann Semesterbeginn, dann Fachsemester — nicht die Reihenfolge der Datei.
        self.assertEqual([p['datei'] for p in self.index['plaene']],
                         ['probe-msc/ss-2031-fs2.json', 'test-bsc/ws-2030-31-fs1.json', 'test-bsc/ws-2030-31-fs3.json'])
        self.assertEqual(self.index['plaene'][1], {'studiengang': 'test-bsc', 'name': 'Testlehre', 'abschluss': 'B.Sc.',
                                                   'semester': 'ws-2030-31', 'label': 'WS 2030/31', 'fachsemester': 1,
                                                   'datei': 'test-bsc/ws-2030-31-fs1.json'})

    def test_every_listed_file_exists(self):
        for p in self.index['plaene']:
            self.assertTrue((self.aus / p['datei']).is_file(), p['datei'])

    # — Plandatei —

    def test_plan_keys_exactly(self):
        for plan in (self.fs1, self.fs3, self.msc):
            self.assertEqual(set(plan), PLAN_KEYS)
            self.assertEqual(set(plan['studiengang']), STUDIENGANG_KEYS)
            self.assertEqual(plan['erzeugt_am'], T)
            for m in plan['modules']:
                self.assertEqual(set(m), MODULE_KEYS, m['number'])
        self.assertEqual(set(self.fs1['last_run']), LAST_RUN_KEYS)

    def test_plan_header(self):
        self.assertEqual(self.fs1['studiengang'], {'id': 'test-bsc', 'name': 'Testlehre', 'abschluss': 'B.Sc.'})
        self.assertEqual((self.fs1['semester'], self.fs1['label'], self.fs1['anchor'], self.fs1['fachsemester']),
                         ('ws-2030-31', 'WS 2030/31', '2030-10-14', 1))
        self.assertEqual((self.msc['semester'], self.msc['anchor'], self.msc['fachsemester']), ('ss-2031', '2031-04-14', 2))

    def test_modules_in_plan_order_with_short_from_catalog(self):
        self.assertEqual([(m['number'], m['short']) for m in self.fs3['modules']], [('90003', 'Mod C'), ('90001', 'Mod A')])
        self.assertEqual([m['number'] for m in self.fs1['modules']], ['90001', '90002', '90009'])

    def test_components_and_groups_carry_raw_fields(self):
        roh = lies(FIX / 'roh/ws-2030-31/90001.json')
        m = self.modul(self.fs1, '90001')
        self.assertEqual((m['title'], m['version'], m['url'], m['notes']), (roh['title'], roh['version'], roh['url'], roh['notes']))
        self.assertEqual((m['checked_at'], m['success_at'], m['error']),
                         (roh['abruf']['geprueft_am'], roh['abruf']['erfolg_am'], None))
        for rc, c in zip(roh['components'], m['components']):
            self.assertEqual(set(c), set(rc))
            self.assertEqual({k: v for k, v in c.items() if k != 'groups'}, {k: v for k, v in rc.items() if k != 'groups'})
            for rg, g in zip(rc['groups'], c['groups']):
                self.assertEqual(set(g), set(rg) | GROUP_EXTRA)
                self.assertEqual({k: g[k] for k in rg}, rg)
                self.assertEqual(g['key'], rc['id'] + ':' + rg['id'])
                self.assertEqual(g['digest'], fingerprint(rg))
                self.assertEqual(g['slots'], slots(rg, '2030-10-14'))
                for s in g['slots']:
                    self.assertEqual(set(s), SLOT_KEYS)

    def test_raw_extras_do_not_leak_into_module(self):
        for plan in (self.fs1, self.fs3):
            for m in plan['modules']:
                self.assertNotIn('abruf', m)
                self.assertNotIn('semester', m)

    def test_no_viewer_state_anywhere(self):
        for plan in (self.index, self.fs1, self.fs3, self.msc):
            self.assertEqual(VIEWER_KEYS & set(alle_schluessel(plan)), set())

    def test_module_without_raw_state_appears_with_error(self):
        m = self.modul(self.fs1, '90009')
        self.assertEqual(m['components'], [])
        self.assertEqual(m['short'], 'Fehlt')
        self.assertIsNone(m['title'])
        self.assertIsNone(m['success_at'])
        self.assertIn('90009', m['error'])
        self.assertIn('WS 2030/31', m['error'])

    def test_failed_first_fetch_keeps_its_error(self):
        m = self.modul(self.fs1, '90002')
        self.assertEqual(m['components'], [])
        self.assertEqual(m['error'], 'SourceError: erfundener Testfehler')
        self.assertEqual(m['checked_at'], '2030-10-01T05:20:30+02:00')
        self.assertIsNone(m['success_at'])
        self.assertEqual((m['valid_versions'], m['notes']), ([], {}))

    def test_semester_without_any_raw_state(self):
        self.assertIsNone(self.msc['last_run'])
        self.assertEqual((self.msc['group_count'], self.msc['booking_count'], self.msc['has_fortnightly']), (0, 0, False))
        self.assertTrue(self.msc['modules'][0]['error'])

    def test_counts_and_fortnightly(self):
        # fs1: 90001 — 3 Gruppen (Vorlesung, Übung A, Übung B), 10 + 4 + 4 Buchungen, Übungen 14-tägig.
        self.assertEqual((self.fs1['group_count'], self.fs1['booking_count'], self.fs1['has_fortnightly']), (3, 18, True))
        # fs3: 90003 (3 Gruppen, 6 Buchungen, eine Gruppe ohne Termine) + 90001.
        self.assertEqual((self.fs3['group_count'], self.fs3['booking_count']), (6, 24))
        ua, ub = self.modul(self.fs1, '90001')['components'][1]['groups']
        self.assertEqual((ua['slots'][0]['parity'], ub['slots'][0]['parity']), ([0], [1]))

    def test_last_run_from_lauf(self):
        lauf = lies(FIX / 'roh/ws-2030-31/_lauf.json')
        self.assertEqual(self.fs1['last_run'], {'finished_at': lauf['beendet_am'], 'status': lauf['status'],
                                                'modules': lauf['modules'], 'bookings': lauf['bookings'],
                                                'errors': lauf['errors']})

    def test_overnight_and_unplanned_group(self):
        c = self.modul(self.fs3, '90003')['components']
        leer = c[0]['groups'][1]
        self.assertEqual((leer['bookings'], leer['slots']), ([], []))
        nacht = c[1]['groups'][0]['slots']
        self.assertEqual([(s['day'], s['start'], s['end']) for s in nacht], [(4, '23:00', '24:00'), (5, '00:00', '01:00')])
        self.assertEqual(c[0]['groups'][0]['slots'][0]['rooms'], ['Raum 3', 'Raum 4'])


class DeterminismusTests(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def bytes_of(self, aus):
        return {str(p.relative_to(aus)): p.read_bytes() for p in sorted(aus.rglob('*')) if p.is_file()}

    def test_same_input_same_bytes(self):
        bauen.bauen(FIX / 'katalog', FIX / 'roh', self.tmp / 'a', erzeugt_am=T)
        bauen.bauen(FIX / 'katalog', FIX / 'roh', self.tmp / 'b', erzeugt_am=T)
        self.assertEqual(self.bytes_of(self.tmp / 'a'), self.bytes_of(self.tmp / 'b'))

    def test_only_erzeugt_am_differs_between_runs(self):
        bauen.bauen(FIX / 'katalog', FIX / 'roh', self.tmp / 'a', erzeugt_am=T)
        bauen.bauen(FIX / 'katalog', FIX / 'roh', self.tmp / 'b', erzeugt_am='2030-10-02T06:00:00+00:00')
        a, b = self.bytes_of(self.tmp / 'a'), self.bytes_of(self.tmp / 'b')
        self.assertEqual(a.keys(), b.keys())
        for k in a:
            self.assertNotEqual(a[k], b[k])
            self.assertEqual(a[k].replace(T.encode(), b'X'), b[k].replace(b'2030-10-02T06:00:00+00:00', b'X'))

    def test_default_erzeugt_am_is_now_utc(self):
        index = bauen.bauen(FIX / 'katalog', FIX / 'roh', self.tmp / 'a')
        self.assertRegex(index['erzeugt_am'], r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$')

    def test_no_tmp_files_left(self):
        bauen.bauen(FIX / 'katalog', FIX / 'roh', self.tmp / 'a', erzeugt_am=T)
        self.assertEqual([p for p in (self.tmp / 'a').rglob('*.tmp')], [])


class KatalogTests(unittest.TestCase):
    """Erweiterbar ohne Code (docs/ARCHITEKTUR.md §2) — und laut, wenn der Katalog sich widerspricht."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.kat = self.tmp / 'katalog'
        shutil.copytree(FIX / 'katalog', self.kat)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def schreib(self, pfad, obj):
        pfad.write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')

    def test_new_plan_appears_without_code_change(self):
        g = lies(self.kat / 'studiengaenge/probe-msc.json')
        g['plaene'].append({'semester': 'ws-2030-31', 'fachsemester': 1, 'module': [{'nummer': '90003', 'kurz': 'C'}]})
        self.schreib(self.kat / 'studiengaenge/probe-msc.json', g)
        index = bauen.bauen(self.kat, FIX / 'roh', self.tmp / 'aus', erzeugt_am=T)
        self.assertIn('probe-msc/ws-2030-31-fs1.json', [p['datei'] for p in index['plaene']])
        neu = lies(self.tmp / 'aus/probe-msc/ws-2030-31-fs1.json')
        self.assertEqual((neu['group_count'], neu['booking_count']), (3, 6))

    def test_removed_plan_is_removed_from_output_and_nothing_else(self):
        aus = self.tmp / 'aus'
        bauen.bauen(self.kat, FIX / 'roh', aus, erzeugt_am=T)
        (aus / 'fremd.json').write_text('{}')
        (self.kat / 'studiengaenge/probe-msc.json').unlink()
        index = bauen.bauen(self.kat, FIX / 'roh', aus, erzeugt_am=T)
        self.assertNotIn('probe-msc', {p['studiengang'] for p in index['plaene']})
        self.assertFalse((aus / 'probe-msc').exists())
        self.assertTrue((aus / 'fremd.json').exists())
        self.assertTrue((aus / 'test-bsc/ws-2030-31-fs1.json').exists())

    def test_unknown_semester_is_an_error(self):
        g = lies(self.kat / 'studiengaenge/probe-msc.json')
        g['plaene'][0]['semester'] = 'gibt-es-nicht'
        self.schreib(self.kat / 'studiengaenge/probe-msc.json', g)
        with self.assertRaises(bauen.KatalogFehler):
            bauen.bauen(self.kat, FIX / 'roh', self.tmp / 'aus', erzeugt_am=T)
        fehler = io.StringIO()
        with contextlib.redirect_stderr(fehler):
            rc = bauen.main(['--katalog', str(self.kat), '--roh', str(FIX / 'roh'), '--aus', str(self.tmp / 'aus')])
        self.assertEqual(rc, 2)
        self.assertIn('gibt-es-nicht', fehler.getvalue())
        self.assertFalse((self.tmp / 'aus').exists())

    def test_duplicate_plan_is_an_error(self):
        g = lies(self.kat / 'studiengaenge/test-bsc.json')
        g['plaene'].append(dict(g['plaene'][0]))
        self.schreib(self.kat / 'studiengaenge/test-bsc.json', g)
        with self.assertRaises(bauen.KatalogFehler):
            bauen.bauen(self.kat, FIX / 'roh', self.tmp / 'aus', erzeugt_am=T)

    def test_semester_without_anchor_is_an_error(self):
        s = lies(self.kat / 'semester/ss-2031.json')
        del s['anker']
        self.schreib(self.kat / 'semester/ss-2031.json', s)
        with self.assertRaises(bauen.KatalogFehler):
            bauen.bauen(self.kat, FIX / 'roh', self.tmp / 'aus', erzeugt_am=T)


class KaputteRohstaendeTests(unittest.TestCase):
    """Ein kaputter Rohstand oder Lauf lässt den Plan nicht verschwinden und sieht nicht aus wie „alles gut“."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.roh = self.tmp / 'roh'
        shutil.copytree(FIX / 'roh', self.roh)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def bau(self):
        with contextlib.redirect_stderr(io.StringIO()) as fehler:
            bauen.bauen(FIX / 'katalog', self.roh, self.tmp / 'aus', erzeugt_am=T)
        return lies(self.tmp / 'aus/test-bsc/ws-2030-31-fs1.json'), fehler.getvalue()

    def test_unreadable_module(self):
        (self.roh / 'ws-2030-31/90001.json').write_text('{kaputt', encoding='utf-8')
        plan, fehler = self.bau()
        m = plan['modules'][0]
        self.assertEqual((m['number'], m['components']), ('90001', []))
        self.assertIn('unlesbar', m['error'])
        self.assertIn('90001.json', fehler)

    def test_unreadable_lauf(self):
        (self.roh / 'ws-2030-31/_lauf.json').write_text('', encoding='utf-8')
        plan, fehler = self.bau()
        self.assertEqual(set(plan['last_run']), LAST_RUN_KEYS)
        self.assertEqual(plan['last_run']['status'], 'error')
        self.assertTrue(plan['last_run']['errors'])
        self.assertIn('_lauf.json', fehler)


AUSWAHL = HIER / 'fixtures' / 'auswahl' / 'katalog'


def knoten_pfad(index, *ids):
    """Folgt dem Wahlbaum über die Kennungen der Optionen; gibt die letzte Option zurück."""
    k, option = index['wahl'], None
    for i in ids:
        option = next(o for o in k['optionen'] if o['id'] == i)
        k = option.get('weiter')
    return option


class AuswahlTests(unittest.TestCase):
    """Schema 2 (V-0233): die fünf Stufen als Baum, Erbe der Vertiefungen, Vorschau, Kombinationen.
    Katalog im neuen Format, erfunden: fixtures/auswahl/katalog, Rohstände aus fixtures/lesemodell."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def bau(self, aus='aus', **kw):
        with contextlib.redirect_stderr(io.StringIO()):
            return bauen.bauen(AUSWAHL, FIX / 'roh', self.tmp / aus, erzeugt_am=T, **kw)

    def test_ohne_vorschau_kein_vorschauplan(self):
        index = self.bau()
        dateien = [p['datei'] for p in index['plaene']]
        self.assertEqual(dateien, ['ein-bsc/ws-2030-31-fs1.json', 'ing-bsc/o-neu/bau/ws-2030-31-fs1.json',
                                   'ing-bsc/o-neu/chemie/ws-2030-31-fs1.json', 'ing-bsc/o-alt/ws-2030-31-fs3.json'])
        self.assertEqual([o['id'] for o in index['wahl']['optionen']], ['test-uni'])  # zweite-hs ist Vorschau
        self.assertNotIn('vor-msc', json.dumps(index))
        self.assertEqual(sorted(str(p.relative_to(self.tmp / 'aus')) for p in (self.tmp / 'aus').rglob('*.json')),
                         sorted(dateien + ['index.json']))

    def test_mit_vorschau_alle_waehlbaren_plaene(self):
        index = self.bau(mit_vorschau=True)
        self.assertEqual(len(index['plaene']), 7)  # 8 Pläne, davon ein Grundplan nur als Grundlage
        # Hochschulen nach Namen: „Andere erfundene …“ vor „Erfundene Test-Universität“.
        self.assertEqual([o['id'] for o in index['wahl']['optionen']], ['zweite-hs', 'test-uni'])
        self.assertIn('zw-bsc/zw-ws-2030-31-fs1.json', [p['datei'] for p in index['plaene']])

    def test_baum_form_und_regeln(self):
        index = self.bau()
        self.assertEqual([s['id'] for s in index['stufen']],
                         ['hochschule', 'studiengang', 'vertiefung', 'fachsemester', 'ordnung'])

        def pruefe(k, tiefe=0):
            self.assertEqual(set(k) - {'label'}, KNOTEN_KEYS)
            self.assertEqual(k['stufe'], index['stufen'][tiefe]['id'])
            for o in k['optionen']:
                self.assertEqual(set(o) - {'weiter', 'plan', 'semester', 'fachsemester'}, OPTION_KEYS)
                if tiefe == 4:
                    self.assertEqual(set(o['plan']), {'id', 'datei', 'kombinationen'})
                else:
                    pruefe(o['weiter'], tiefe + 1)
        pruefe(index['wahl'])
        sg = knoten_pfad(index, 'test-uni', 'ein-bsc')
        # Kein Studiengang ohne Vertiefung fragt nach ihr; ohne Ordnung im Katalog auch nicht danach.
        self.assertEqual(sg['weiter']['regel'], 'ueberspringen')
        fs = knoten_pfad(index, 'test-uni', 'ein-bsc', None, 'ws-2030-31:fs1')
        self.assertEqual((fs['label'], fs['zusatz'], fs['weiter']['regel']), ('1. Fachsemester', 'WS 2030/31', 'ueberspringen'))
        # Mit Vertiefungen: wählen, beschriftet wie im Katalog; „ohne“ nur, wo es einen Plan ohne gibt.
        ing = knoten_pfad(index, 'test-uni', 'ing-bsc')['weiter']
        self.assertEqual((ing['regel'], ing['label']), ('waehlen', 'Studienrichtung'))
        self.assertEqual([(o['id'], o['label'], o['zusatz']) for o in ing['optionen']],
                         [(None, 'Ohne Studienrichtung', None), ('bau', 'Bauwesen', 'BW'), ('chemie', 'Chemie', None)])
        # Nur eine Ordnung gilt: automatisch gewählt, mit dem Satz, für wen sie gilt.
        o = knoten_pfad(index, 'test-uni', 'ing-bsc', 'bau', 'ws-2030-31:fs1')['weiter']
        self.assertEqual(o['regel'], 'automatisch')
        self.assertEqual((o['optionen'][0]['id'], o['optionen'][0]['zusatz']), ('o-neu', 'Studienbeginn ab WS 2030/31'))
        self.assertEqual(o['optionen'][0]['plan']['id'], 'ing-bsc:o-neu:ws-2030-31:fs1:bau')

    def test_zwei_ordnungen_mit_vorschau_wollen_eine_wahl(self):
        index = self.bau(mit_vorschau=True)
        o = knoten_pfad(index, 'test-uni', 'ing-bsc', None, 'ws-2030-31:fs3')['weiter']
        self.assertEqual(o['regel'], 'waehlen')
        self.assertEqual([x['id'] for x in o['optionen']], ['o-neu', 'o-alt'])  # Reihenfolge des Katalogs

    def test_plandatei_traegt_alle_stufen(self):
        self.bau()
        bau = lies(self.tmp / 'aus/ing-bsc/o-neu/bau/ws-2030-31-fs1.json')
        self.assertEqual(set(bau), PLAN_KEYS)
        self.assertEqual(bau['id'], 'ing-bsc:o-neu:ws-2030-31:fs1:bau')
        self.assertEqual(set(bau['hochschule']), HOCHSCHULE_KEYS)
        self.assertEqual(bau['hochschule']['kurz'], 'Test-Uni')
        self.assertEqual(set(bau['ordnung']), ORDNUNG_KEYS)
        self.assertEqual((bau['ordnung']['id'], bau['ordnung']['gilt_ab']), ('o-neu', '2030-10-01'))
        self.assertEqual(bau['vertiefung'], {'id': 'bau', 'name': 'Bauwesen', 'kurz': 'BW', 'heisst': 'Studienrichtung'})
        # Erbe: zuerst die Module des Grundplans, dann die eigenen.
        self.assertEqual([m['number'] for m in bau['modules']], ['90001', '90003'])
        ein = lies(self.tmp / 'aus/ein-bsc/ws-2030-31-fs1.json')
        self.assertEqual((ein['ordnung'], ein['vertiefung']), (None, None))

    def test_kombinationen_im_plan_und_im_baum(self):
        index = self.bau()
        bau = lies(self.tmp / 'aus/ing-bsc/o-neu/bau/ws-2030-31-fs1.json')
        # 90003:520 hat Seminar 1 (mit Terminen) und Seminar 2 (ohne): beides wählbar.
        self.assertIs(bau['kombinationen']['loesbar'], True)
        self.assertEqual(list(bau['kombinationen']['beispiel']), ['90001:500', '90001:510', '90003:520', '90003:530'])
        blatt = knoten_pfad(index, 'test-uni', 'ing-bsc', 'bau', 'ws-2030-31:fs1', 'o-neu')['plan']
        self.assertEqual(blatt['kombinationen'], bau['kombinationen'])
        # 90002 hat keinen Rohstand mit Bestandteilen: Die Aussage gilt nur für den Rest.
        chemie = lies(self.tmp / 'aus/ing-bsc/o-neu/chemie/ws-2030-31-fs1.json')
        self.assertEqual(chemie['kombinationen']['fehlen'], ['90002'])

    def test_bestandteile_aus_dem_katalog_im_plan_und_in_der_kombination(self):
        kat = self.tmp / 'katalog'
        shutil.copytree(AUSWAHL, kat)
        (kat / 'bestandteile.json').write_text(json.dumps({'bestandteile': [
            {'id': '90001:510', 'gruppen': 'alle', 'semester': None, 'grund': 'erfunden: A und B gehören zusammen'}]}),
            encoding='utf-8')
        with contextlib.redirect_stderr(io.StringIO()):
            bauen.bauen(kat, FIX / 'roh', self.tmp / 'aus', erzeugt_am=T)
        plan = lies(self.tmp / 'aus/ein-bsc/ws-2030-31-fs1.json')
        ue = plan['modules'][0]['components'][1]
        self.assertEqual((ue['id'], ue['gruppen'], ue['gruppen_grund']), ('90001:510', 'alle', 'erfunden: A und B gehören zusammen'))
        self.assertNotIn('gruppen', plan['modules'][0]['components'][0])  # ohne Eintrag: wie im Rohstand
        self.assertEqual(plan['kombinationen']['beispiel']['90001:510'], ['602', '603'])
        self.assertIs(plan['kombinationen']['sicher'], True)

    def test_alte_liste_unterscheidet_vertiefung_und_ordnung(self):
        index = self.bau(mit_vorschau=True)
        for p in index['plaene']:
            self.assertEqual(set(p), INDEX_PLAN_KEYS)
        namen = {p['datei']: p['name'] for p in index['plaene']}
        # Mit Vorschau zwei Hochschulen: Sie steht vorn im Namen.
        self.assertEqual(namen['ing-bsc/o-neu/bau/ws-2030-31-fs1.json'], 'Testingenieurwesen (Test-Uni, Bauwesen, Ordnung neu)')
        self.assertEqual(namen['ing-bsc/o-alt/ws-2030-31-fs3.json'], 'Testingenieurwesen (Test-Uni, Ordnung alt)')
        self.assertEqual(namen['zw-bsc/zw-ws-2030-31-fs1.json'], 'Zweitfach (Zweite HS)')
        # Ohne Vorschau eine Hochschule: Sie fehlt im Namen; ein Studiengang mit einer Ordnung hat
        # Namen wie in Schema 1.
        namen = {p['datei']: p['name'] for p in self.bau('ohne')['plaene']}
        self.assertEqual(namen['ing-bsc/o-neu/bau/ws-2030-31-fs1.json'], 'Testingenieurwesen (Bauwesen, Ordnung neu)')
        self.assertEqual(namen['ein-bsc/ws-2030-31-fs1.json'], 'Einfachlehre')

    def test_vorschau_verschwindet_samt_leeren_ordnern(self):
        self.bau(mit_vorschau=True)
        self.assertTrue((self.tmp / 'aus/zw-bsc/zw-ws-2030-31-fs1.json').exists())
        (self.tmp / 'aus/fremd.json').write_text('{}')
        self.bau()
        self.assertFalse((self.tmp / 'aus/zw-bsc').exists())
        self.assertFalse((self.tmp / 'aus/vor-msc').exists())
        self.assertFalse((self.tmp / 'aus/ing-bsc/o-neu/ws-2030-31-fs3.json').exists())
        self.assertTrue((self.tmp / 'aus/ing-bsc/o-neu/bau/ws-2030-31-fs1.json').exists())
        self.assertTrue((self.tmp / 'aus/fremd.json').exists())

    def test_gleiche_bytes(self):
        self.bau('a', mit_vorschau=True)
        self.bau('b', mit_vorschau=True)
        a = {str(p.relative_to(self.tmp / 'a')): p.read_bytes() for p in (self.tmp / 'a').rglob('*') if p.is_file()}
        b = {str(p.relative_to(self.tmp / 'b')): p.read_bytes() for p in (self.tmp / 'b').rglob('*') if p.is_file()}
        self.assertEqual(a, b)

    def test_befehl_mit_vorschau_und_meldung_ohne_loesung(self):
        aus = io.StringIO()
        with contextlib.redirect_stdout(aus), contextlib.redirect_stderr(io.StringIO()):
            rc = bauen.main(['--katalog', str(AUSWAHL), '--roh', str(FIX / 'roh'), '--aus', str(self.tmp / 'aus')])
        self.assertEqual(rc, 0)
        self.assertNotIn('zw-bsc', aus.getvalue())
        with contextlib.redirect_stdout(io.StringIO()) as aus2, contextlib.redirect_stderr(io.StringIO()):
            bauen.main(['--katalog', str(AUSWAHL), '--roh', str(FIX / 'roh'), '--aus', str(self.tmp / 'aus'), '--mit-vorschau'])
        self.assertIn('zw-bsc', aus2.getvalue())
        # Ohne Rohstand im Semester der zweiten Hochschule: keine Gruppe, also nichts zu melden;
        # gemeldet wird nur, was ein Mensch prüfen sollte.
        self.assertNotIn('keine Wahl ohne Überschneidung', aus2.getvalue())


class BefehlTests(unittest.TestCase):

    def test_defaults_hang_on_repo_root_not_cwd(self):
        # Der tägliche Lauf ruft das Skript aus einem anderen Verzeichnis. Ohne --katalog muss der
        # Katalog des Repos gelesen werden — welcher Plan darin steht, weiß dieser Test nicht.
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([sys.executable, str(ABRUF / 'bauen.py'), '--roh', str(Path(tmp) / 'leer'),
                                '--aus', str(Path(tmp) / 'aus')], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            kat = K.lesen(ABRUF.parent / 'katalog')
            self.assertEqual([p['datei'] for p in lies(Path(tmp) / 'aus/index.json')['plaene']],
                             [p['datei'] for p in K.zur_wahl(kat)])
            self.assertTrue(all(p['sichtbar'] == 'live' for p in K.zur_wahl(kat)))
        self.assertEqual(bauen.WURZEL, ABRUF.parent)

    def test_code_names_no_programme_semester_or_date(self):
        # docs/ARCHITEKTUR.md §2 als Prüfung statt als Satz: Wer eine Konstante einbaut, wird hier rot.
        verboten = re.compile(r'(19|20)\d\d-\d\d-\d\d|\b(WiSe|SoSe|WS|SS) ?\d{2,4}|\bwise-|\bsose-|\bwi-bsc\b', re.I)
        for name in ('plan.py', 'bauen.py', 'katalog.py'):
            for nr, zeile in enumerate((ABRUF / name).read_text(encoding='utf-8').splitlines(), 1):
                self.assertIsNone(verboten.search(zeile), f'{name}:{nr}: {zeile.strip()}')


if __name__ == '__main__':
    unittest.main()
