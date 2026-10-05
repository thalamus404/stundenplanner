"""Der tägliche Lauf (betrieb/lauf.py): Nur der Zeitplan fragt MOSES, eine Auslieferung nie (V-0241).

Bis zum 05.10.2026 fuhr jede Auslieferung nach main einen vollen Lauf mit Abruf; an einem Tag mit
mehreren Freigaben fragte der Stundenplanner MOSES also mehrmals, ohne dass es jemand wollte.
innoCampus (TU) sieht das Abrufen der Weboberfläche nicht gern. Diese Tests halten fest: Ein Lauf
ohne Abruf ruft abruf.py nicht auf, verdeckt den Tagesabruf nicht und löst ihn nicht aus.
Die Schritte (git, pip, abruf, bauen, test, ausliefern) sind Attrappen; nichts geht ins Netz.
"""
import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

LAUF_PY = Path(__file__).resolve().parents[2] / 'betrieb' / 'lauf.py'


def lade_lauf(daten):
    """lauf.py liest DATEN beim Import; jede Probe bekommt ein eigenes, leeres Volume."""
    with mock.patch.dict(os.environ, {'DATEN': str(daten)}):
        spec = importlib.util.spec_from_file_location('lauf_probe', LAUF_PY)
        modul = importlib.util.module_from_spec(spec)
        with contextlib.redirect_stdout(io.StringIO()):
            spec.loader.exec_module(modul)
    modul.log.disabled = True
    return modul


class LaufOhneAbruf(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.L = lade_lauf(Path(self._tmp.name))
        self.gerufen = []
        L = self.L

        self.umgebung = {}

        def schritt(name, befehl, **k):
            self.gerufen.append(name)
            self.umgebung[name] = dict(k.get('env') or {})
            if name == 'bauen':
                (L.REPO / 'web' / 'daten').mkdir(parents=True, exist_ok=True)
                (L.REPO / 'web' / 'daten' / 'index.json').write_text('{}', encoding='utf-8')
                (L.REPO / 'web' / 'index.html').write_text('<!doctype html>', encoding='utf-8')
            return 0, '', 0

        for name, wert in {'stand_holen': lambda p: 'abc1234', 'abhaengigkeiten': lambda p: None,
                           'git_umgebung': dict, 'schritt': schritt,
                           'ausliefern': lambda c, p: True, 'herz': lambda: None}.items():
            patcher = mock.patch.object(L, name, wert)
            patcher.start()
            self.addCleanup(patcher.stop)

    def tearDown(self):
        self._tmp.cleanup()

    def rohstand(self):
        datei = self.L.ROH / 'wise-2026-27' / 'modul.json'
        datei.parent.mkdir(parents=True, exist_ok=True)
        datei.write_text('{}', encoding='utf-8')

    def test_auslieferung_fragt_moses_nicht(self):
        self.rohstand()
        self.assertEqual(self.L.lauf(mit_abruf=False), 'ausgeliefert')
        self.assertNotIn('abruf', self.gerufen)
        self.assertEqual(self.L.lies_zustand()['abruf'], 'ausgelassen')

    def test_ohne_rohstand_wird_nicht_abgerufen_sondern_abgebrochen(self):
        self.assertEqual(self.L.lauf(mit_abruf=False), 'fehler')
        self.assertEqual(self.gerufen, [])
        self.assertIn('kein Rohstand', self.L.lies_zustand()['meldung'])

    def test_zeitplan_ruft_ab(self):
        self.L.lauf()
        z = self.L.lies_zustand()
        self.assertEqual(self.gerufen[0], 'abruf')
        self.assertEqual(z['letzter_abruf_am'], z['begonnen_am'])

    def test_nur_der_schritt_abruf_traegt_die_genehmigung(self):
        # V-0242: Silas hat nur den täglichen Abruf genehmigt. Test und Bauen laufen ohne sie, sonst
        # könnte ein Test mit echtem Netz im Lauf an MOSES fragen. Die Namen müssen zu zugang.py passen.
        import sys
        sys.path.insert(0, str(LAUF_PY.parents[1] / 'abruf'))
        import zugang
        self.L.lauf()
        self.assertEqual(self.L.ABRUF_GENEHMIGT, zugang.VARIABLE)
        self.assertEqual(self.umgebung['abruf'].get(zugang.VARIABLE), zugang.TAEGLICHER_LAUF)
        for name in ('bauen', 'test'):
            self.assertNotIn(zugang.VARIABLE, self.umgebung[name])

    def test_lauf_ohne_abruf_traegt_den_letzten_abruf_weiter(self):
        # Ein Zustand von vor V-0241 kennt letzter_abruf_am nicht: Damals fragte jeder Lauf.
        alt = '2026-10-05T10:33:27+00:00'
        self.L.ZUSTAND.write_text(json.dumps({'begonnen_am': alt, 'status': 'ausgeliefert', 'abruf': 'ok'}),
                                  encoding='utf-8')
        self.rohstand()
        self.L.lauf(mit_abruf=False)
        self.L.lauf(mit_abruf=False)
        self.assertEqual(self.L.lies_zustand()['letzter_abruf_am'], alt)

    def test_auslieferung_nach_0520_verdeckt_einen_verpassten_tagesabruf_nicht(self):
        z = {'begonnen_am': '2026-10-06T10:00:00+00:00', 'status': 'ausgeliefert', 'mit_abruf': False,
             'letzter_abruf_am': '2026-10-05T03:20:00+00:00'}
        faellig = self.L.faellig_seit(datetime.fromisoformat('2026-10-06T12:00:00+02:00'))
        self.assertLess(datetime.fromisoformat(self.L.letzter_abruf(z)), faellig)


if __name__ == '__main__':
    unittest.main()
