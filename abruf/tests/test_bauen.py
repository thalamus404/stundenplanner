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
from plan import fingerprint, slots

HIER = Path(__file__).resolve().parent
FIX = HIER / 'fixtures' / 'lesemodell'
ABRUF = HIER.parent

# docs/ARCHITEKTUR.md §5 — genau diese Schlüssel, nicht mehr.
INDEX_KEYS = {'schema', 'erzeugt_am', 'plaene'}
INDEX_PLAN_KEYS = {'studiengang', 'name', 'abschluss', 'semester', 'label', 'fachsemester', 'datei'}
PLAN_KEYS = {'schema', 'erzeugt_am', 'studiengang', 'semester', 'label', 'anchor', 'fachsemester', 'modules',
             'has_fortnightly', 'group_count', 'booking_count', 'last_run'}
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
        self.assertEqual(self.index['schema'], 1)
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


class BefehlTests(unittest.TestCase):

    def test_defaults_hang_on_repo_root_not_cwd(self):
        # Der tägliche Lauf ruft das Skript aus einem anderen Verzeichnis. Ohne --katalog muss der
        # Katalog des Repos gelesen werden — welcher Plan darin steht, weiß dieser Test nicht.
        with tempfile.TemporaryDirectory() as tmp:
            r = subprocess.run([sys.executable, str(ABRUF / 'bauen.py'), '--roh', str(Path(tmp) / 'leer'),
                                '--aus', str(Path(tmp) / 'aus')], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            plaene = sum(len(lies(p).get('plaene', [])) for p in (ABRUF.parent / 'katalog/studiengaenge').glob('*.json'))
            self.assertEqual(len(lies(Path(tmp) / 'aus/index.json')['plaene']), plaene)
        self.assertEqual(bauen.WURZEL, ABRUF.parent)

    def test_code_names_no_programme_semester_or_date(self):
        # docs/ARCHITEKTUR.md §2 als Prüfung statt als Satz: Wer eine Konstante einbaut, wird hier rot.
        verboten = re.compile(r'(19|20)\d\d-\d\d-\d\d|\b(WiSe|SoSe|WS|SS) ?\d{2,4}|\bwise-|\bsose-|\bwi-bsc\b', re.I)
        for name in ('plan.py', 'bauen.py'):
            for nr, zeile in enumerate((ABRUF / name).read_text(encoding='utf-8').splitlines(), 1):
                self.assertIsNone(verboten.search(zeile), f'{name}:{nr}: {zeile.strip()}')


if __name__ == '__main__':
    unittest.main()
