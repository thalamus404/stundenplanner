"""Der Lauf ohne Netz: Katalog lesen, jedes Modul einmal, Rückfall auf den Vorbestand, _lauf.json.

Die Attrappe ersetzt nur den MOSES-Client. choose_version() und module_parts() laufen echt, auf
erfundenem HTML aus fixtures/ (moses-versionen.html, moses-modul.html); der Katalog unter
fixtures/katalog/ ist ebenso erfunden.
"""
import contextlib
import io
import json
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import abruf  # noqa: E402
import moses  # noqa: E402

FIX = Path(__file__).parent / 'fixtures'
KATALOG = FIX / 'katalog'


class Welt:
    """Was die Attrappe weiß: welche Bestandteile scheitern, wie oft welche Seite geholt wurde."""

    def __init__(self, scheitert=()):
        self.scheitert = set(scheitert)
        self.abrufe = []

    def client(self):
        return Attrappe(self)


class Attrappe:
    def __init__(self, welt):
        self.welt = welt

    def get(self, url):
        self.welt.abrufe.append(url)
        if 'ansehen.html?number=' in url:
            nummer = url.rsplit('=', 1)[1]
            return (FIX / 'moses-versionen.html').read_text(encoding='utf-8').replace('{nummer}', nummer)
        if 'beschreibung/anzeigen.html' in url:
            nummer = url.split('nummer=')[1].split('&')[0]
            return (FIX / 'moses-modul.html').read_text(encoding='utf-8').replace('{nummer}', nummer)
        raise AssertionError('unerwartete Adresse: ' + url)

    def component(self, part, target):
        self.welt.abrufe.append(part['vvz_url'])
        if part['id'] in self.welt.scheitert:
            raise moses.SourceError('Falsches Semester im Export')
        gid = '7' + part['lvvid']
        buchungen = [{'id': str(i), 'start': f'2026-10-{13 + 7 * i:02d}T10:00:00',
                      'end': f'2026-10-{13 + 7 * i:02d}T12:00:00', 'room': 'Erfundener Raum',
                      'title': part['title'], 'format': part['type'], 'number': part['number'],
                      'note': '', 'info': ''} for i in range(3)]
        return {**part, 'semester_id': '77', 'status': 'ok',
                'groups': [{'id': gid, 'name': 'Termingruppe 1', 'url': 'https://moseskonto.tu-berlin.de/x',
                            'series': [], 'bookings': buchungen}]}, 'csv'


def uhr(start=0):
    n = iter(range(start, start + 1000))
    return lambda: f'2026-10-05T05:20:00+02:00#{next(n):03d}'


def still(*a, **k):
    pass


class KatalogTests(unittest.TestCase):
    def test_katalog_wird_gelesen(self):
        kat = abruf.lade_katalog(KATALOG)
        self.assertEqual(sorted(kat['semester']), ['sose-2027', 'wise-2026-27'])
        self.assertEqual(len(kat['plaene']), 3)
        self.assertEqual({p['studiengang'] for p in kat['plaene']}, {'aa-bsc', 'bb-bsc'})

    def test_jedes_modul_einmal_je_semester(self):
        je = abruf.module_je_semester(abruf.lade_katalog(KATALOG))
        self.assertEqual(je['wise-2026-27'], ['99901', '99902', '99903'])
        self.assertEqual(je['sose-2027'], [])

    def test_der_echte_katalog_ist_gueltig_und_wird_ueber_die_datei_gefunden(self):
        # Der tägliche Lauf ruft abruf.py aus einem anderen Arbeitsverzeichnis auf: Der Katalog
        # hängt an __file__, nicht am Arbeitsverzeichnis.
        self.assertEqual(abruf.KATALOG, Path(abruf.__file__).resolve().parents[1] / 'katalog')
        kat = abruf.lade_katalog()
        self.assertTrue(kat['plaene'])

    def test_ungueltige_modulnummer_wird_abgelehnt(self):
        with tempfile.TemporaryDirectory() as t:
            k = Path(t)
            (k / 'semester').mkdir()
            (k / 'studiengaenge').mkdir()
            (k / 'semester' / 'wise-2026-27.json').write_text(
                (KATALOG / 'semester' / 'wise-2026-27.json').read_text(encoding='utf-8'), encoding='utf-8')
            (k / 'studiengaenge' / 'x.json').write_text(json.dumps(
                {'id': 'x', 'plaene': [{'semester': 'wise-2026-27', 'module': [{'nummer': '../99901'}]}]}),
                encoding='utf-8')
            with self.assertRaises(abruf.KatalogFehler):
                abruf.lade_katalog(k)

    def test_plan_mit_unbekanntem_semester_wird_abgelehnt(self):
        with tempfile.TemporaryDirectory() as t:
            k = Path(t)
            (k / 'semester').mkdir()
            (k / 'studiengaenge').mkdir()
            (k / 'studiengaenge' / 'x.json').write_text(json.dumps(
                {'id': 'x', 'plaene': [{'semester': 'wise-2030-31', 'module': [{'nummer': '99901'}]}]}),
                encoding='utf-8')
            with self.assertRaises(abruf.KatalogFehler):
                abruf.lade_katalog(k)


class LaufTests(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.roh = Path(self._t.name) / 'roh'
        self.ordner = self.roh / 'wise-2026-27'

    def tearDown(self):
        self._t.cleanup()

    def laufe(self, welt, start=0, **kw):
        return abruf.lauf(katalog=KATALOG, roh=self.roh, client_fabrik=welt.client,
                          uhr=uhr(start), log=still, schlaf=still, **kw)

    def lies(self, name):
        return json.loads((self.ordner / name).read_text(encoding='utf-8'))

    def test_jedes_modul_wird_einmal_geholt(self):
        welt = Welt()
        self.laufe(welt)
        versionsseiten = [u for u in welt.abrufe if 'ansehen.html?number=' in u]
        self.assertEqual(sorted(versionsseiten), sorted(
            moses.MTS + 'ansehen.html?number=' + n for n in ('99901', '99902', '99903')))

    def test_rohstand_im_format_der_architektur(self):
        ergebnis = self.laufe(Welt())
        self.assertEqual(list(ergebnis), ['wise-2026-27'])  # sose-2027 hat keine Pläne
        r = self.lies('99901.json')
        for k in ('number', 'title', 'version', 'valid_from', 'valid_to', 'valid_versions', 'url',
                  'isis_url', 'notes', 'semester', 'components', 'abruf'):
            self.assertIn(k, r)
        self.assertNotIn('short', r)
        self.assertNotIn('studyos_version', r)
        self.assertEqual((r['number'], r['version'], r['semester']), ('99901', 3, 'WiSe 2026/27'))
        self.assertEqual([c['id'] for c in r['components']], ['99901:901', '99901:902'])
        self.assertEqual(r['abruf']['geprueft_am'], r['abruf']['erfolg_am'])
        self.assertIsNone(r['abruf']['fehler'])

    def test_dateien_sind_lesbar_und_ohne_reste(self):
        self.laufe(Welt())
        namen = sorted(p.name for p in self.ordner.iterdir())
        self.assertEqual(namen, ['99901.json', '99902.json', '99903.json', '_lauf.json'])
        for p in self.ordner.iterdir():
            self.assertTrue(p.stat().st_mode & stat.S_IROTH, p.name)

    def test_lauf_json(self):
        self.laufe(Welt())
        lauf = self.lies('_lauf.json')
        self.assertEqual(set(lauf), {'gestartet_am', 'beendet_am', 'status', 'modules', 'bookings', 'errors'})
        self.assertEqual((lauf['status'], lauf['modules'], lauf['bookings'], lauf['errors']),
                         ('ok', 3, 3 * 2 * 3, []))
        self.assertLess(lauf['gestartet_am'], lauf['beendet_am'])

    def test_scheiterndes_modul_laesst_den_vorbestand_stehen(self):
        self.laufe(Welt())
        vorher = self.lies('99902.json')
        ergebnis = self.laufe(Welt(scheitert={'99902:902'}), start=500)['wise-2026-27']
        nachher = self.lies('99902.json')
        self.assertEqual(nachher['components'], vorher['components'])
        self.assertEqual(nachher['abruf']['erfolg_am'], vorher['abruf']['erfolg_am'])
        self.assertGreater(nachher['abruf']['geprueft_am'], vorher['abruf']['geprueft_am'])
        self.assertEqual(nachher['abruf']['fehler'], 'SourceError: Falsches Semester im Export')
        self.assertEqual({k: v for k, v in nachher.items() if k != 'abruf'},
                         {k: v for k, v in vorher.items() if k != 'abruf'})
        # Die anderen Module sind neu geschrieben.
        self.assertGreater(self.lies('99901.json')['abruf']['erfolg_am'], vorher['abruf']['erfolg_am'])
        self.assertEqual((ergebnis['status'], ergebnis['modules']), ('partial', 2))
        self.assertEqual(self.lies('_lauf.json')['errors'],
                         [{'module': '99902', 'message': 'SourceError: Falsches Semester im Export'}])

    def test_ohne_vorbestand_ein_rohstand_ohne_bestandteile(self):
        alle = {f'{n}:{v}' for n in ('99901', '99902', '99903') for v in ('901', '902')}
        ergebnis = self.laufe(Welt(scheitert=alle))['wise-2026-27']
        r = self.lies('99903.json')
        self.assertEqual(r['components'], [])
        self.assertEqual((r['number'], r['semester']), ('99903', 'WiSe 2026/27'))
        self.assertIsNone(r['abruf']['erfolg_am'])
        self.assertTrue(r['abruf']['fehler'])
        self.assertEqual((ergebnis['status'], ergebnis['modules'], ergebnis['bookings']), ('error', 0, 0))

    def test_semester_ohne_plan_ist_ein_fehler_wenn_ausdruecklich_verlangt(self):
        ergebnis = self.laufe(Welt(), semester=['sose-2027'])['sose-2027']
        self.assertEqual(ergebnis['status'], 'error')
        self.assertIsNone(ergebnis['errors'][0]['module'])

    def test_nur_ein_modul_und_kein_lauf_json(self):
        self.laufe(Welt(), nur=['99903'])
        self.assertEqual(sorted(p.name for p in self.ordner.iterdir()), ['99903.json'])
        with self.assertRaises(abruf.KatalogFehler):
            self.laufe(Welt(), nur=['12345'])

    def test_main_exit_code_und_roh_von_anderswo(self):
        def main(*argv, welt):
            with mock.patch.object(moses, 'Client', welt.client), \
                    contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                return abruf.main(['--katalog', str(KATALOG), '--roh', str(self.roh), '--pause', '0', *argv])
        self.assertEqual(main(welt=Welt()), 0)
        self.assertEqual(main(welt=Welt(scheitert={'99901:901'})), 1)
        self.assertEqual(main('--semester', 'gibt-es-nicht', welt=Welt()), 2)
        self.assertTrue((self.ordner / '_lauf.json').exists())


class FehlertextTests(unittest.TestCase):
    def test_kein_antwortkoerper_und_keine_sitzung(self):
        exc = moses.SourceError('Unerwartet bei https://moseskonto.tu-berlin.de/a.html;jsessionid=ABC123?x=1 '
                                '<html><body>geheim</body></html>\nzweite Zeile')
        text = abruf.fehlertext(exc)
        self.assertTrue(text.startswith('SourceError: Unerwartet'))
        for verboten in ('jsessionid', 'ABC123', '<html', 'geheim', 'zweite Zeile'):
            self.assertNotIn(verboten, text)

    def test_lange_meldung_wird_gekuerzt(self):
        self.assertLessEqual(len(abruf.fehlertext(ValueError('x' * 5000))), 300)


if __name__ == '__main__':
    unittest.main()
