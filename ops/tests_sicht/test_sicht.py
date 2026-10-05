"""Prüft den Prüfstand: misst ops/sicht.py, was es zu messen behauptet?

Zwei Prüfseiten mit bekannten Werten (seiten/), dazu der Stressfall und die Bewertung. Braucht
Playwright mit Chromium und gehört deshalb NICHT in ops/test.sh (der läuft ohne Browser). Aufruf:

    python3 -m unittest discover -s ops/tests_sicht

Wer an der Messung in ops/sicht.py etwas ändert, lässt diese Tests laufen. Meldet jemand eine
Fehlmessung, gehört sie als Prüfseite hierher, bevor sie behoben wird (Axiom 0).
"""

import sys
import unittest
from pathlib import Path

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER.parent))

import sicht  # noqa: E402

try:
    import playwright  # noqa: F401
    HAT_PLAYWRIGHT = True
except ImportError:
    HAT_PLAYWRIGHT = False


@unittest.skipUnless(HAT_PLAYWRIGHT, 'Playwright fehlt')
class Messung(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv, cls.url = sicht.server_starten(HIER / 'seiten')
        sicht._arbeiter_start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        sicht._PW['browser'].close()
        sicht._PW['pw'].stop()
        sicht._PW.clear()

    def messen(self, seite, w, h, **mehr):
        return sicht.lauf({'fenster': (w, h), 'touch': False, 'schema': 'light', 'url': self.url + seite, **mehr})

    def test_kontrast_gegen_den_tatsaechlichen_grund(self):
        k = self.messen('kontrast.html', 600, 400)['kontrast']
        fehler = {f['text']: f['wert'] for f in k['fehler']}
        unbestimmt = {u['text'] for u in k['unbestimmt']}
        # 777777 auf Weiß: 4,48:1 — knapp unter 4,5, ungerundet
        self.assertAlmostEqual(fehler['Grau 777777 auf Weiß'], 4.48, places=2)
        # 767676 auf Weiß: 4,54:1 — erfüllt
        self.assertNotIn('Grau 767676 auf Weiß', fehler)
        self.assertNotIn('Grau 767676 auf Weiß', unbestimmt)
        # durchscheinender Grund: rgba(0,0,0,.5) über Weiß ist 7F7F7F, Weiß darauf 4,00:1
        self.assertAlmostEqual(fehler['Weiß auf halbem Schwarz'], 4.0, delta=0.06)
        # Deckkraft der Vorfahren: Schwarz bei .4 auf Weiß ist 999999, 2,85:1
        self.assertAlmostEqual(fehler['Schwarz mit Deckkraft'], 2.85, delta=0.03)
        # Verlauf ohne vorherrschenden Grund: unbestimmt, nicht bestanden
        self.assertIn('Schwarz auf Verlauf', unbestimmt)
        # eine 2-px-Linie hinter der Zeile ist kein Grund: 595959 auf Weiß erfüllt
        self.assertNotIn('Grau mit Linie dahinter', fehler)
        self.assertNotIn('Grau mit Linie dahinter', unbestimmt)
        # verdeckt (eine feste Meldung liegt darüber): nicht gemessen, gezählt — „Unter der Meldung“
        # ganz, „7“ bis auf eine Randreihe, deren Kern die Kante der Fläche berührt
        self.assertNotIn('Unter der Meldung', fehler)
        self.assertEqual(k['verdeckt'], 2)
        # teilweise verdeckt: nur der freie Teil zählt, die Tinte der Meldung nicht
        self.assertNotIn('Teilweise unter der Meldung', fehler)
        self.assertNotIn('Teilweise unter der Meldung', unbestimmt)
        # ein einzelnes Zeichen an der (gebrochenen) Kante: keine Pixelreihe der Fläche im Maß
        self.assertNotIn('7', fehler)
        # im Schatten einer schwebenden Fläche: der Schatten ist kein Grund, gemessen wird der freie Teil
        self.assertNotIn('Im Schatten einer schwebenden Fläche', fehler)
        self.assertNotIn('Im Schatten einer schwebenden Fläche', unbestimmt)
        # gesperrte Elemente sind ausgenommen (WCAG)
        self.assertEqual(k['gesperrt'], 1)
        self.assertNotIn('Gesperrt', fehler)

    def test_layout(self):
        m = self.messen('layout.html', 400, 300)
        self.assertGreater(m['seite']['h'], 300)                 # scrollt
        self.assertGreater(m['seite']['b'], 400)                 # und seitlich
        self.assertEqual(m['aussen'], 2)                         # Chip TUT und der Absatz rechts
        self.assertTrue(any('Ragt rechts hinaus' in x for x in m['aussenBsp']))
        self.assertEqual(len(m['innen']), 1)
        self.assertEqual(len(m['abgeschnitten']), 1)             # Kachel IV unter overflow: hidden
        self.assertIn('IV', m['abgeschnitten'][0])
        klein = [z for z in m['ziele'] if z['b'] < 24 or z['h'] < 24]
        self.assertEqual([z['name'] for z in klein if not z['link']], ['button.klein „x“'])
        chips = {c['text']: c for c in m['chips']}
        self.assertEqual(len(chips), 3)
        self.assertFalse(chips['TUT']['ganz'])
        self.assertTrue(chips['VL']['ganz'] and chips['VL']['frei'])
        self.assertEqual(m['aussenX'], 2)                        # beide ragen seitlich hinaus
        self.assertEqual(len(m['kacheln']), 4)
        self.assertEqual([s['text'] for s in m['stunden']], ['08', '12'])
        self.assertEqual(m['log']['schreiben'][0]['schluessel'], 'pruef')
        self.assertEqual(m['log']['resize'], 1)
        self.assertTrue(m['pflicht']['impressum']['ok'])
        self.assertFalse(m['pflicht']['speicher']['ok'])

    def test_handy(self):
        # V-0225: am Handy darf die Seite senkrecht scrollen; Raster und Umschalter auf einem Schirm,
        # der Fuß am Seitenende.
        m = sicht.lauf({'fenster': (390, 600), 'touch': True, 'schema': 'light', 'url': self.url + 'handy.html'})
        erw = {'je_tag': {0: 1}, 'gesamt': 1, 'achse': [8, 10], 'tage': [0, 1, 2, 3, 4], 'bestandteile': 1}
        self.assertEqual(sicht.schirm_probleme(m['schirm'], erw, True), [])
        self.assertIsNotNone(m['woche'])                          # der Knopf „Woche“ wurde gefunden
        self.assertTrue(all(sicht.pflicht_ok(m, k) for k in ('inoffiziell', 'impressum', 'datenschutz', 'speicher')))
        bf = sicht.Befund()
        sicht.bewerten_lauf(bf, {'fenster': (390, 600), 'touch': True, 'schema': 'light', 'auswahl': 'leer'}, m, erw)
        self.assertEqual(bf.status('1'), sicht.OK)                # scrollt nur senkrecht
        self.assertEqual(bf.status('33'), sicht.OK)
        self.assertEqual(bf.status('1h'), sicht.OK)
        hoch = sicht.lauf({'fenster': (390, 600), 'touch': True, 'schema': 'light', 'url': self.url + 'handy.html?hoch'})
        self.assertTrue(any('unter den Umschalter' in p for p in sicht.schirm_probleme(hoch['schirm'], erw, True)))

    def test_abstaende_im_raster(self):
        m = self.messen('layout.html', 400, 300)
        self.assertTrue(any('div.krumm' in a and 'paddingTop 10 px' in a for a in m['abstand']), m['abstand'])
        self.assertFalse(any('div.gerade' in a for a in m['abstand']), m['abstand'])

    def test_abgeschnitten(self):
        z = sicht.lauf_zoom({'fenster': (400, 300), 'touch': False, 'schema': 'light', 'url': self.url + 'layout.html'})
        self.assertTrue(any('Ein sehr langer' in x and 'gekürzt' in x for x in z['abgeschnitten']))
        self.assertFalse(any('Luft' in x for x in z['abgeschnitten']), z['abgeschnitten'])

    def test_bewertung_kacheln(self):
        m = self.messen('layout.html', 400, 300)
        bf = sicht.Befund()
        erw = {'je_tag': {0: 2, 1: 2}, 'gesamt': 4, 'achse': [8, 12], 'tage': [0, 1, 2, 3, 4], 'bestandteile': 3}
        sicht.kacheln_pruefen(bf, m, erw, 800, '800×300')
        b = bf.liste[0]
        self.assertEqual(b['status'], sicht.FEHLER)
        self.assertIn('1 Paare überlappen', b['detail'])         # VL und UE
        bf = sicht.Befund()
        sicht.bewerten_lauf(bf, {'fenster': (400, 300), 'touch': False, 'schema': 'light', 'auswahl': 'leer'}, m, erw)
        self.assertEqual(bf.status('1'), sicht.FEHLER)
        self.assertEqual(bf.status('6'), sicht.FEHLER)           # TUT ist 20 px breit
        self.assertEqual(bf.status('17'), sicht.FEHLER)          # Laden schreibt
        self.assertEqual(bf.status('resize'), sicht.FEHLER)


    def test_startbildschirm(self):
        # §8 #19 (V-0234): am Handy jede Option ins Bild gescrollt ganz und frei, nicht unter der Leiste.
        spec = {'fenster': (390, 600), 'touch': True, 'schema': 'light', 'url': self.url + 'hallo.html', 'wege': [('start', [])]}
        r = sicht.lauf_hallo(spec)
        hl = r['ansichten']['start']['hallo']
        self.assertEqual(len(hl['optionen']), 5)
        self.assertTrue(all(o['ganz'] and o['frei'] for o in hl['optionen']), hl['optionen'])
        self.assertTrue(hl['leiste']['ganz'] and hl['nachher']['ganz'])
        bf = sicht.Befund()
        sicht.bewerten_hallo(bf, spec, r, None)
        self.assertEqual(bf.status('h1'), sicht.OK, bf.liste)
        # Ohne scroll-padding liegt die letzte Option unter der klebenden Leiste: nicht erreichbar.
        zu = sicht.lauf_hallo({**spec, 'url': self.url + 'hallo.html?zu'})
        self.assertFalse(zu['ansichten']['start']['hallo']['optionen'][-1]['frei'])
        bf = sicht.Befund()
        sicht.bewerten_hallo(bf, spec, zu, None)
        self.assertEqual(bf.status('h1'), sicht.FEHLER)
        self.assertIn('unter der Leiste', next(b['detail'] for b in bf.liste if b['pruefung'] == 'h1'))
        # Am Rechner (600 px hoch) scrollt die Seite: Das ist ab 768 px ein Fehler.
        bf = sicht.Befund()
        sicht.bewerten_hallo(bf, {**spec, 'fenster': (800, 600), 'touch': False},
                             sicht.lauf_hallo({**spec, 'fenster': (800, 600), 'touch': False}), None)
        self.assertIn('scrollt', next(b['detail'] for b in bf.liste if b['pruefung'] == 'h1'))


class Baum(unittest.TestCase):
    """Der Weg durch index.json (Schema 2, V-0233/V-0234), ohne Browser."""

    INDEX = {'schema': 2, 'wahl': {'stufe': 'hochschule', 'regel': 'waehlen', 'optionen': [
        {'id': 'a', 'label': 'A', 'weiter': {'stufe': 'studiengang', 'regel': 'waehlen', 'optionen': [
            {'id': 'x', 'label': 'X', 'weiter': {'stufe': 'vertiefung', 'regel': 'ueberspringen', 'optionen': [
                {'id': None, 'label': 'Ohne', 'weiter': {'stufe': 'fachsemester', 'regel': 'waehlen', 'optionen': [
                    {'id': 's:fs1', 'label': '1.', 'weiter': {'stufe': 'ordnung', 'regel': 'automatisch', 'optionen': [
                        {'id': 'o', 'label': 'O', 'plan': {'id': 'x:o:s:fs1', 'datei': 'x/o/s-fs1.json'}}]}},
                    {'id': 's:fs3', 'label': '3.', 'weiter': {'stufe': 'ordnung', 'regel': 'waehlen', 'optionen': [
                        {'id': 'o', 'label': 'O', 'plan': {'id': 'x:o:s:fs3', 'datei': 'x/o/s-fs3.json'}},
                        {'id': 'p', 'label': 'P', 'plan': {'id': 'x:p:s:fs3', 'datei': 'x/p/s-fs3.json'}},
                        {'id': 'q', 'label': 'Q', 'plan': {'id': 'x:q:s:fs3', 'datei': 'x/q/s-fs3.json'}}]}}]}}]}}]}},
        {'id': 'b', 'label': 'B', 'weiter': {'stufe': 'studiengang', 'regel': 'waehlen', 'optionen': [
            {'id': 'z', 'label': 'Z', 'plan': {'id': 'z:s:fs1', 'datei': 'z/s-fs1.json'}}]}}]},
        'plaene': [{'datei': 'alt.json'}]}

    def test_blaetter_und_klicks(self):
        b = sicht.blaetter_aus(self.INDEX)
        self.assertEqual([x['id'] for x in b], ['x:o:s:fs1', 'x:o:s:fs3', 'x:p:s:fs3', 'x:q:s:fs3', 'z:s:fs1'])
        # Geklickt wird nur, wo „waehlen“ steht: Vertiefung entfällt, die Ordnung im 1. FS ist automatisch.
        self.assertEqual(sicht.klicks(b[0]['weg']), [('hochschule', 0), ('studiengang', 0), ('fachsemester', 0)])
        self.assertEqual(sicht.klicks(b[2]['weg']), [('hochschule', 0), ('studiengang', 0), ('fachsemester', 1), ('ordnung', 1)])
        self.assertEqual(sicht.blaetter_aus({'plaene': [{'datei': 'alt.json'}]}), [{'id': None, 'datei': 'alt.json', 'weg': []}])

    def test_wege_des_startbildschirms(self):
        self.assertEqual(sicht.hallo_wege(self.INDEX), [
            ('start', []),
            ('meiste', [('hochschule', 0), ('studiengang', 0), ('fachsemester', 1)]),   # drei Ordnungen
            ('fertig', [('hochschule', 0), ('studiengang', 0), ('fachsemester', 0)])])
        self.assertEqual(sicht.hallo_wege({'plaene': [{'datei': 'alt.json'}]}), [])

    def test_plan_waehlen_und_schluessel(self):
        self.assertEqual(sicht.plan_waehlen(self.INDEX, None)['id'], 'x:o:s:fs1')
        self.assertEqual(sicht.plan_waehlen(self.INDEX, 'z:s:fs1')['datei'], 'z/s-fs1.json')
        with self.assertRaises(LookupError):
            sicht.plan_waehlen(self.INDEX, 'gibt:es:nicht')
        plan = {'id': 'x:o:s:fs1', 'studiengang': {'id': 'x'}, 'semester': 's', 'fachsemester': 1}
        self.assertEqual(sicht.speicher_schluessel(plan), 'stundenplanner:v1:x:o:s:fs1')
        self.assertEqual(sicht.speicher_schluessel({**plan, 'id': None}), 'stundenplanner:v1:x:s:fs1')


class Stressfall(unittest.TestCase):
    def test_wie_section_8_ihn_verlangt(self):
        index, plan = sicht.stressplan()
        self.assertEqual(len(plan['modules']), 8)
        self.assertEqual(len(sicht.bestandteile(plan)), 20)
        self.assertTrue(plan['has_fortnightly'])
        erw = sicht.erwartung(plan, {})
        self.assertEqual(erw['achse'], [7, 21])
        self.assertEqual(erw['tage'], [0, 1, 2, 3, 4, 5])
        # höchstens 6 gleichzeitig, und an einer Stelle genau 6 (Woche A, alles offen)
        slots = [s for c in sicht.bestandteile(plan) for g in c['groups'] for s in g['slots'] if 0 in s['parity']]
        spitze = 0
        for s in slots:
            t = sicht.stunde(s['start']) + 0.01
            n = sum(1 for x in slots if x['day'] == s['day'] and sicht.stunde(x['start']) < t < sicht.stunde(x['end']))
            spitze = max(spitze, n)
        self.assertEqual(spitze, 6)
        self.assertEqual(erw['gesamt'], len(slots))
        # Schema 2 mit einem Blatt (V-0234): Die Seite öffnet ihn über #plan=<id>.
        self.assertEqual(index['schema'], 2)
        self.assertEqual([b['id'] for b in sicht.blaetter_aus(index)], [sicht.STRESS_ID])
        self.assertEqual(plan['id'], sicht.STRESS_ID)


if __name__ == '__main__':
    unittest.main()
