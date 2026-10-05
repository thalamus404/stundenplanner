"""Wahlpflicht und höhere Fachsemester (V-0227): Modulliste aus dem MTS, Kandidaten im Abruf,
Pause zwischen Modulen, Lesemodell mit `wahlpflicht`, Moduldateien und Ersatzsemester.

Alles ohne Netz, auf erfundenen Daten unter fixtures/wahlpflicht/ (Katalog, Modulliste, Rohstände)
und fixtures/mts-bereich.html / vvz-leer*.html (im Layout von MOSES, Inhalt erfunden).
"""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import abruf  # noqa: E402
import bauen  # noqa: E402
import modulliste  # noqa: E402
import moses  # noqa: E402

FIX = Path(__file__).parent / 'fixtures'
WP = FIX / 'wahlpflicht'
T = '2030-10-01T06:00:00+00:00'


def lies(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def still(*a, **k):
    pass


class ModullisteTests(unittest.TestCase):
    def test_bereich_liest_module_regeln_und_grenzen(self):
        b = modulliste.bereich((FIX / 'mts-bereich.html').read_text(encoding='utf-8'))
        self.assertEqual((b['name'], b['liste'], b['lp_min'], b['lp_max']), ('Erfundene Seminare', 'WiSe 2030/31', 3, 12))
        self.assertEqual([(m['nummer'], m['version'], m['lp'], m['turnus']) for m in b['module']],
                         [('90010', 2, 3, 'WiSe'), ('90011', 1, 4.5, 'SoSe')])
        self.assertEqual(b['module'][0]['titel'], 'Seminar: Erfundene Themen')
        self.assertEqual(len(b['regeln']), 2)

    def test_keine_sitzung_in_der_ausgabe(self):
        b = modulliste.bereich((FIX / 'mts-bereich.html').read_text(encoding='utf-8'))
        self.assertNotIn('jsessionid', json.dumps(b))

    def test_leere_auswahl_ist_kein_bereich(self):
        self.assertIsNone(modulliste.bereich(''))

    def test_fehlende_spalte_ist_ein_layoutwechsel(self):
        html = (FIX / 'mts-bereich.html').read_text(encoding='utf-8').replace('Prüfungsform', 'Etwas anderes')
        with self.assertRaises(moses.SourceError):
            modulliste.bereich(html)

    def test_baum_der_tiefe_nach_bis_zur_leeren_auswahl(self):
        knoten = {'0': 'Wurzel', '0_0': 'Pflicht', '0_1': 'Wahlpflicht', '0_1_0': 'Vertiefung'}

        class Seite:
            def __init__(self):
                self.gefragt = []

            def waehle(self, rk):
                self.gefragt.append(rk)
                if rk not in knoten:
                    return None
                return {'name': knoten[rk], 'liste': None, 'module': [], 'regeln': [], 'lp_min': None, 'lp_max': None}

        s = Seite()
        w = modulliste.lies_baum(s)
        self.assertEqual([b['name'] for b in w['bereiche']], ['Pflicht', 'Wahlpflicht'])
        self.assertEqual(w['bereiche'][1]['bereiche'][0]['schluessel'], '0_1_0')
        # Je Bereich eine Auswahl und eine Probe für das nächste (fehlende) Kind.
        self.assertEqual(len(s.gefragt), 2 * len(knoten))

    def test_finde_und_module_von(self):
        liste = lies(WP / 'katalog/modullisten/wp-bsc-o2030-ws-2030-31.json')
        b = modulliste.finde(liste, 'Wahlpflichtbereich/Vertiefung')
        self.assertEqual(b['lp_max'], 21)
        nummern = [(m['nummer'], m['unterbereich']) for m in modulliste.module_von(b)]
        # Jedes Modul einmal, an seiner ersten Fundstelle (90010 steht in Seminare und Projekte).
        self.assertEqual(nummern, [('90013', None), ('90010', 'Seminare'), ('90011', 'Seminare'),
                                   ('90012', 'Projekte'), ('90001', 'Projekte')])
        with self.assertRaises(KeyError):
            modulliste.finde(liste, 'Wahlpflichtbereich/Gibt es nicht')


class LeeresSemesterTests(unittest.TestCase):
    """moses.Client.component: Ein Bestandteil ohne Termine im Semester ist kein Layoutwechsel."""

    class Attrappe(moses.Client):
        def __init__(self, seite):
            super().__init__(delay=0)
            self.seite = seite

        def get(self, url):
            return (FIX / self.seite).read_text(encoding='utf-8')

        def request(self, url, data=None, ajax=False):
            raise moses.SourceError('kein Netz im Test')

    TEIL = {'id': '90011:7', 'lvvid': '7', 'title': 't', 'type': 'SEM',
            'vvz_url': 'https://moseskonto.tu-berlin.de/moses/verzeichnis/veranstaltungen/vorlage.html?veranstaltungsvorlage=7'}

    def test_ohne_gruppen_und_ohne_listenexport_unplanned(self):
        teil, roh = self.Attrappe('vvz-leer.html').component(self.TEIL, 'WiSe 2030/31')
        self.assertEqual((teil['status'], teil['groups'], teil['semester_id'], roh), ('unplanned', [], '77', ''))

    def test_mit_listenexport_wird_weiter_exportiert(self):
        # Gruppenlinks fehlen, der Export ist da: Das kann ein geänderter Parser sein, also nicht still.
        with self.assertRaises(moses.SourceError):
            self.Attrappe('vvz-leer-mit-export.html').component(self.TEIL, 'WiSe 2030/31')


class AbrufTests(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.roh = Path(self._t.name) / 'roh'

    def tearDown(self):
        self._t.cleanup()

    def test_kandidaten_aus_der_modulliste_und_turnusfilter(self):
        kat = abruf.lade_katalog(WP / 'katalog')
        plan = next(p for p in kat['plaene'] if p['fachsemester'] == 5)
        self.assertEqual([k['nummer'] for k in plan['kandidaten']], ['90013', '90010', '90011', '90012', '90001'])
        self.assertEqual(abruf.module_je_semester(kat)['ws-2030-31'], ['90001', '90010', '90012', '90013'])
        self.assertEqual(abruf.module_je_semester(kat, turnusfilter=False)['ws-2030-31'],
                         ['90001', '90010', '90011', '90012', '90013'])
        self.assertEqual(abruf.pflicht_je_semester(kat), {'ws-2030-31': {'90001'}, 'ss-2030': {'90002'}})

    def test_im_turnus(self):
        self.assertTrue(abruf.im_turnus('WiSe/SoSe', 'SoSe 2030'))
        self.assertTrue(abruf.im_turnus('k.A.', 'SoSe 2030'))
        self.assertTrue(abruf.im_turnus('WiSe', 'WiSe 2030/31'))
        self.assertFalse(abruf.im_turnus('WiSe', 'SoSe 2030'))
        self.assertFalse(abruf.im_turnus('SoSe', 'WiSe 2030/31'))

    def test_unbekannter_bereich_oder_fehlende_liste_ist_ein_katalogfehler(self):
        for aendern in ({'bereich': 'Wahlpflichtbereich/Gibt es nicht'}, {'modulliste': 'fehlt'}, {'modulliste': '../x'}):
            with tempfile.TemporaryDirectory() as t:
                k = Path(t) / 'katalog'
                shutil.copytree(WP / 'katalog', k)
                g = lies(k / 'studiengaenge/wp-bsc.json')
                g['plaene'][0]['wahlpflicht'][0].update(aendern)
                (k / 'studiengaenge/wp-bsc.json').write_text(json.dumps(g), encoding='utf-8')
                with self.assertRaises(abruf.KatalogFehler, msg=str(aendern)):
                    abruf.lade_katalog(k)

    def laufe(self, scheitert=(), **kw):
        geholt, schlaf = [], []

        def holer(client, nummer, ziel):
            geholt.append(nummer)
            if nummer in scheitert:
                raise moses.SourceError(f'Modul {nummer}: keine gültige Version für {ziel}')
            return {'number': nummer, 'title': 't', 'version': 1, 'components': [
                {'id': nummer + ':1', 'groups': [{'id': '1', 'bookings': [{'id': '1'}]}]}]}
        e = abruf.lauf(katalog=WP / 'katalog', roh=self.roh, semester=['ws-2030-31'], holer=holer,
                       client_fabrik=lambda: None, log=still, schlaf=schlaf.append, **kw)['ws-2030-31']
        return e, geholt, schlaf

    def test_pause_zwischen_modulen_nicht_davor(self):
        e, geholt, schlaf = self.laufe()
        self.assertEqual(geholt, ['90001', '90010', '90012', '90013'])
        self.assertEqual(schlaf, [abruf.PAUSE_MODULE] * 3)
        self.assertEqual(abruf.PAUSE_MODULE, 2.0)
        self.assertEqual(self.laufe(pause=0)[2], [])

    def test_kandidat_ohne_angebot_ist_kein_fehler_des_laufs(self):
        e, _, _ = self.laufe(scheitert={'90013'})
        self.assertEqual((e['status'], e['errors'], e['modules']), ('ok', [], 3))
        self.assertEqual(e['kandidaten']['module'], 2)
        self.assertEqual([f['module'] for f in e['kandidaten']['fehler']], ['90013'])
        lauf = lies(self.roh / 'ws-2030-31/_lauf.json')
        self.assertEqual(lauf['kandidaten'], e['kandidaten'])
        # Der Rohstand des Kandidaten trägt den Grund, damit das Lesemodell ihn nennen kann.
        self.assertIn('keine gültige Version', lies(self.roh / 'ws-2030-31/90013.json')['abruf']['fehler'])

    def test_pflichtmodul_bleibt_ein_fehler(self):
        e, _, _ = self.laufe(scheitert={'90001'})
        self.assertEqual((e['status'], [x['module'] for x in e['errors']]), ('partial', ['90001']))

    def test_ohne_wahlpflicht_kein_neuer_schluessel(self):
        e = abruf.lauf(katalog=WP / 'katalog', roh=self.roh, semester=['ss-2030'], log=still, schlaf=still,
                       client_fabrik=lambda: None,
                       holer=lambda c, n, z: {'number': n, 'components': []})['ss-2030']
        self.assertNotIn('kandidaten', e)


class LesemodellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.aus = cls.tmp / 'daten'
        cls.index = bauen.bauen(WP / 'katalog', WP / 'roh', cls.aus, erzeugt_am=T)
        cls.fs5 = lies(cls.aus / 'wp-bsc/o2030/ws-2030-31-fs5.json')
        cls.fs4 = lies(cls.aus / 'wp-bsc/o2030/ss-2030-fs4.json')

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def test_index_traegt_ersatz_und_moduldateien(self):
        # Seit V-0233 steht die Ordnung als eigene Stufe im Wahlbaum und als Objekt in der Plandatei;
        # die flache Liste `plaene` behält die Schlüssel der ersten Seite.
        p4, p5 = self.index['plaene']
        self.assertEqual((p4['fachsemester'], p4['label']), (4, 'SS 2030 (Ersatz für SS 2031)'))
        self.assertEqual(self.index['module'], ['module/ws-2030-31/90010.json'])

    def test_pflicht_bleibt_in_modules_kandidaten_nicht(self):
        self.assertEqual([m['number'] for m in self.fs5['modules']], ['90001'])
        self.assertEqual((self.fs5['group_count'], self.fs5['booking_count']), (1, 3))
        self.assertEqual(self.fs5['ordnung']['label'], 'Ordnung 2030')
        self.assertEqual(self.fs4['ersatz_fuer'], 'SS 2031')
        self.assertNotIn('ersatz_fuer', self.fs5)

    def test_wahlpflicht_angebot_und_ohne_termine_mit_grund(self):
        (wp,) = self.fs5['wahlpflicht']
        self.assertEqual((wp['id'], wp['lp_min'], wp['lp_max']), ('vt', 12, 21))
        self.assertEqual(wp['modulliste']['ordnung'], 'Ordnung 2030')
        (a,) = wp['angebot']
        self.assertEqual((a['number'], a['lp'], a['unterbereich'], a['groups'], a['bookings'], a['tage'], a['datei']),
                         ('90010', 3, 'Seminare', 2, 2, [2, 4], 'module/ws-2030-31/90010.json'))
        self.assertEqual(a['short'], 'Sem. Erfundene Themen…')
        gruende = {o['number']: o['grund'] for o in wp['ohne_termine']}
        self.assertEqual(gruende, {'90013': 'keine im Semester gültige Modulversion',
                                   '90011': 'nicht abgerufen (Turnus laut MOSES: SoSe)',
                                   '90012': 'Gruppen ohne Termine (z. B. nach Vereinbarung)'})
        self.assertNotIn('90001', gruende, 'Pflicht im Plan ist kein Kandidat')
        self.assertEqual(self.fs5['frei'], [{'name': 'Wahlbereich', 'anteil': '12 LP', 'hinweis': 'frei'}])

    def test_moduldatei_wie_ein_modul_der_plandatei(self):
        d = lies(self.aus / 'module/ws-2030-31/90010.json')
        self.assertEqual((d['semester'], d['anchor']), ('ws-2030-31', '2030-10-14'))
        g = d['module']['components'][0]['groups'][0]
        self.assertEqual(g['key'], '90010:5:51')
        self.assertTrue(g['digest'] and g['slots'])

    def test_veraltete_moduldatei_wird_entfernt(self):
        with tempfile.TemporaryDirectory() as t:
            aus = Path(t) / 'daten'
            bauen.bauen(WP / 'katalog', WP / 'roh', aus, erzeugt_am=T)
            fremd = aus / 'module' / 'ws-2030-31' / 'liegt-da.json'
            fremd.write_text('{}', encoding='utf-8')
            roh = Path(t) / 'roh'
            shutil.copytree(WP / 'roh', roh)
            (roh / 'ws-2030-31/90010.json').unlink()
            index = bauen.bauen(WP / 'katalog', roh, aus, erzeugt_am=T)
            self.assertNotIn('module', index)
            self.assertFalse((aus / 'module/ws-2030-31/90010.json').exists())
            self.assertTrue(fremd.exists(), 'nur, was das alte index.json nannte')

    def test_plan_nur_mit_wahlpflicht_laesst_die_kombination_offen(self):
        # V-0233: Ohne Pflichtmodul mit Terminen entscheidet erst die Wahl der Module.
        with tempfile.TemporaryDirectory() as t:
            k = Path(t) / 'katalog'
            shutil.copytree(WP / 'katalog', k)
            g = lies(k / 'studiengaenge/wp-bsc.json')
            g['plaene'][0]['module'] = []
            (k / 'studiengaenge/wp-bsc.json').write_text(json.dumps(g), encoding='utf-8')
            bauen.bauen(k, WP / 'roh', Path(t) / 'aus', erzeugt_am=T)
            kom = lies(Path(t) / 'aus/wp-bsc/o2030/ws-2030-31-fs5.json')['kombinationen']
            self.assertIsNone(kom['loesbar'])
            self.assertIn('Wahlpflichtmodulen', kom['grund'])

    def test_kurzname(self):
        self.assertEqual(bauen.kurzname('Verteilte Systeme'), 'Verteilte Systeme')
        self.assertEqual(bauen.kurzname('Programmierpraktikum: Datensysteme'), 'PP Datensysteme')
        self.assertEqual(bauen.kurzname('Mikroökonomik (6 LP)'), 'Mikroökonomik')
        self.assertLessEqual(len(bauen.kurzname('Wie weiter mit der Klimapolitik? Ökonomische Perspektiven')), 22)


if __name__ == '__main__':
    unittest.main()
