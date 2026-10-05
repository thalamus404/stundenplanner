"""Keine Anfrage an eine Hochschule ohne Silas' Genehmigung (V-0242, abruf/zugang.py, AGENTS.md §2 ⑦).

Silas, 05.10.2026: „Ab jetzt sind keine Zugriffe mehr auf das TU-System erlaubt, solange ich es nicht
ausdrücklich genehmigt habe.“ Diese Tests halten fest, dass jeder Weg zu MOSES und LSF vor der ersten
Anfrage endet, wenn die Genehmigung fehlt, und dass der Abruf das nicht als „Modul gescheitert“
schluckt. Nichts hier geht ins Netz: Jeder Opener ist eine Attrappe, die einen Aufruf meldet.
"""
import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import abruf  # noqa: E402
import lsf  # noqa: E402
import modulliste  # noqa: E402
import moses  # noqa: E402
import zugang  # noqa: E402

MOSES_URL = 'https://moseskonto.tu-berlin.de/moses/modultransfersystem/bolognamodule/ansehen.html?number=1'
LSF_BASIS = 'https://lsf.example.org/qisserver/rds'


def ohne_genehmigung():
    umgebung = {k: v for k, v in os.environ.items() if k != zugang.VARIABLE}
    return mock.patch.dict(os.environ, umgebung, clear=True)


def mit_genehmigung():
    return mock.patch.dict(os.environ, {zugang.VARIABLE: zugang.TAEGLICHER_LAUF})


class Sperre(unittest.TestCase):
    def test_moses_fragt_ohne_genehmigung_nicht(self):
        c = moses.Client(delay=0)
        c.opener = mock.Mock()
        with ohne_genehmigung(), self.assertRaises(zugang.Gesperrt):
            c.get(MOSES_URL)
        c.opener.open.assert_not_called()

    def test_lsf_fragt_ohne_genehmigung_nicht(self):
        c = lsf.Client(LSF_BASIS, delay=0)
        c.opener = mock.Mock()
        with ohne_genehmigung(), self.assertRaises(zugang.Gesperrt):
            c.get(LSF_BASIS + '?state=wtree')
        c.opener.open.assert_not_called()

    def test_ein_anderer_wert_ist_keine_genehmigung(self):
        c = moses.Client(delay=0)
        c.opener = mock.Mock()
        with mock.patch.dict(os.environ, {zugang.VARIABLE: 'ja'}), self.assertRaises(zugang.Gesperrt):
            c.get(MOSES_URL)
        c.opener.open.assert_not_called()

    def test_mit_genehmigung_geht_die_anfrage_raus(self):
        c = moses.Client(delay=0)
        c.opener = mock.Mock(open=mock.Mock(side_effect=OSError('kein Netz im Test')))
        with mit_genehmigung(), self.assertRaises(OSError):
            c.get(MOSES_URL)
        c.opener.open.assert_called_once()

    def test_die_meldung_nennt_was_zu_tun_ist(self):
        with ohne_genehmigung(), self.assertRaises(zugang.Gesperrt) as fall:
            zugang.pruefen('moseskonto.tu-berlin.de')
        for wort in ('Silas', 'Umfang', 'Last', 'Grund', 'nie selbst'):
            self.assertIn(wort, str(fall.exception))


class Einstiege(unittest.TestCase):
    def test_abruf_bricht_vor_dem_ersten_modul_ab(self):
        with tempfile.TemporaryDirectory() as tmp, ohne_genehmigung(), \
                contextlib.redirect_stderr(io.StringIO()) as fehler:
            self.assertEqual(abruf.main(['--roh', tmp]), 2)
            self.assertEqual(list(Path(tmp).iterdir()), [])
        self.assertIn('gesperrt', fehler.getvalue())

    def test_modulliste_bricht_ab(self):
        with ohne_genehmigung(), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(modulliste.main(['--studiengang', '1', '--stupo', '1', '--liste', '1']), 2)

    def test_die_modulschleife_schluckt_die_sperre_nicht(self):
        # Ohne das re-raise stünde „Modul gescheitert, der Vorbestand trägt“ im Rohstand, und der Lauf
        # liefe mit dem nächsten Modul weiter, wieder gegen die Sperre.
        def holer(client, nummer, ziel):
            zugang.pruefen('moseskonto.tu-berlin.de')
        semester = {'id': 'wise-test', 'moses': 'WiSe 2026/27'}
        with tempfile.TemporaryDirectory() as tmp, ohne_genehmigung(), self.assertRaises(zugang.Gesperrt):
            abruf.lauf_semester(semester, ['10001', '10002'], Path(tmp), client_fabrik=lambda: None,
                                holer=holer, pause=0, schreibe_lauf=False, log=lambda *a, **k: None)
