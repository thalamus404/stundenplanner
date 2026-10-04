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
        self.assertEqual(len(m['kacheln']), 4)
        self.assertEqual([s['text'] for s in m['stunden']], ['08', '12'])
        self.assertEqual(m['log']['schreiben'][0]['schluessel'], 'pruef')
        self.assertEqual(m['log']['resize'], 1)
        self.assertTrue(m['pflicht']['impressum']['ok'])
        self.assertFalse(m['pflicht']['speicher']['ok'])

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


if __name__ == '__main__':
    unittest.main()
