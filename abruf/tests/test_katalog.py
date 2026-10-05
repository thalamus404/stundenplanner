"""Der Katalog (katalog.py): Stufen, Erbe, Gültigkeit, Sichtbarkeit — und laut, wenn er sich widerspricht.

Grundlage ist der erfundene Katalog fixtures/auswahl/katalog (neues Format) und, für die
Rückwärtsverträglichkeit, fixtures/lesemodell/katalog (erstes Format). Jeder Fehlerfall ändert eine
Kopie an genau einer Stelle.
"""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import katalog as K

FIX = Path(__file__).resolve().parent / 'fixtures'
AUSWAHL = FIX / 'auswahl' / 'katalog'


def lies(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


class LesenTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.kat = K.lesen(AUSWAHL)
        cls.plan = {p['id']: p for p in cls.kat['plaene']}

    def test_kennung_und_datei_eindeutig_ueber_alle_stufen(self):
        self.assertEqual(len({p['id'] for p in self.kat['plaene']}), len(self.kat['plaene']))
        self.assertEqual(len({p['datei'] for p in self.kat['plaene']}), len(self.kat['plaene']))
        p = self.plan['ing-bsc:o-neu:ws-2030-31:fs1:chemie']
        self.assertEqual(p['datei'], 'ing-bsc/o-neu/chemie/ws-2030-31-fs1.json')
        # Ohne Ordnung und Vertiefung: Kennung und Pfad wie im ersten Format.
        self.assertEqual(self.plan['ein-bsc:ws-2030-31:fs1']['datei'], 'ein-bsc/ws-2030-31-fs1.json')

    def test_vertiefung_erbt_den_grundplan(self):
        self.assertEqual([m['nummer'] for m in self.plan['ing-bsc:o-neu:ws-2030-31:fs1:bau']['module']], ['90001', '90003'])
        self.assertEqual([m['nummer'] for m in self.plan['ing-bsc:o-neu:ws-2030-31:fs1:chemie']['module']], ['90001', '90002'])
        self.assertFalse(self.plan['ing-bsc:o-neu:ws-2030-31:fs1']['waehlbar'])

    def test_sichtbarkeit_erbt_von_hochschule_studiengang_plan(self):
        self.assertEqual(self.plan['zw-bsc:zw-ws-2030-31:fs1']['sichtbar'], 'vorschau')   # von der Hochschule
        self.assertEqual(self.plan['vor-msc:ws-2030-31:fs1']['sichtbar'], 'vorschau')     # vom Studiengang
        self.assertEqual(self.plan['ing-bsc:o-neu:ws-2030-31:fs3']['sichtbar'], 'vorschau')  # vom Plan
        self.assertEqual(self.plan['ing-bsc:o-alt:ws-2030-31:fs3']['sichtbar'], 'live')
        self.assertEqual({p['id'] for p in K.zur_wahl(self.kat)},
                         {'ein-bsc:ws-2030-31:fs1', 'ing-bsc:o-neu:ws-2030-31:fs1:bau',
                          'ing-bsc:o-neu:ws-2030-31:fs1:chemie', 'ing-bsc:o-alt:ws-2030-31:fs3'})
        self.assertEqual(len(K.zur_wahl(self.kat, mit_vorschau=True)), 7)

    def test_sperre_mit_grund(self):
        h = self.kat['hochschulen']['zweite-hs']
        self.assertEqual(h['abruf'], 'gesperrt')
        self.assertTrue(h['abruf_grund'])
        self.assertEqual(self.kat['hochschulen']['test-uni']['abruf'], 'erlaubt')

    def test_erstes_format_findet_die_hochschule_ueber_den_kurznamen(self):
        kat = K.lesen(FIX / 'lesemodell' / 'katalog')
        self.assertEqual({p['hochschule']['id'] for p in kat['plaene']}, {'testhochschule'})
        self.assertEqual({(p['ordnung'], p['vertiefung'], p['sichtbar']) for p in kat['plaene']}, {(None, None, 'live')})

    def test_der_echte_katalog_ist_gueltig_und_live_nur_wi_1_fs(self):
        # Silas, 05.10.2026: Die Live-Seite zeigt weiter nur WI B.Sc., 1. FS. Alles andere ist Vorschau.
        kat = K.lesen(Path(__file__).resolve().parents[2] / 'katalog')
        self.assertEqual([p['id'] for p in K.zur_wahl(kat)], ['wi-bsc:stupo-2025:wise-2026-27:fs1'])


class FehlerTests(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.kat = self.tmp / 'katalog'
        shutil.copytree(AUSWAHL, self.kat)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def aendere(self, name, wie):
        pfad = self.kat / name
        obj = lies(pfad)
        wie(obj)
        pfad.write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')

    def fehler(self, muster):
        with self.assertRaisesRegex(K.KatalogFehler, muster):
            K.lesen(self.kat)

    def plan(self, i, **felder):
        return lambda g: g['plaene'][i].update(felder)

    def test_ordnung_gilt_noch_nicht(self):
        # Erkenntnis 2 aus V-0228: Die „aktuelle“ StuPO galt erst ab dem nächsten Semester.
        self.aendere('studiengaenge/ing-bsc.json', lambda g: g['ordnungen'][0].update(gilt_ab='2031-04-01'))
        self.fehler('gilt erst ab 2031-04-01')

    def test_ordnung_gilt_nicht_mehr(self):
        self.aendere('studiengaenge/ing-bsc.json', lambda g: g['ordnungen'][1].update(gilt_bis='2030-09-30'))
        self.fehler('gilt nur bis 2030-09-30')

    def test_ordnung_fehlt_oder_ist_unbekannt(self):
        self.aendere('studiengaenge/ing-bsc.json', lambda g: g['plaene'][3].pop('ordnung'))
        self.fehler('steht nicht unter „ordnungen“')

    def test_ordnung_ohne_ordnungen(self):
        self.aendere('studiengaenge/ein-bsc.json', self.plan(0, ordnung='o-neu'))
        self.fehler('ohne „ordnungen“')

    def test_unbekannte_vertiefung(self):
        self.aendere('studiengaenge/ing-bsc.json', self.plan(1, vertiefung='physik'))
        self.fehler('physik')

    def test_plan_doppelt(self):
        self.aendere('studiengaenge/ing-bsc.json', lambda g: g['plaene'].append(dict(g['plaene'][2])))
        self.fehler('doppelt')

    def test_modul_im_grundplan_und_in_der_vertiefung(self):
        self.aendere('studiengaenge/ing-bsc.json', self.plan(2, module=[{'nummer': '90001'}]))
        self.fehler('Grundplan und in der Vertiefung')

    def test_grundplan_nur_als_grundlage_ohne_erben(self):
        self.aendere('studiengaenge/ing-bsc.json', lambda g: g['plaene'][3].update(waehlbar=False))
        self.fehler('keine Vertiefung erbt')

    def test_vertiefung_nicht_waehlbar(self):
        self.aendere('studiengaenge/ing-bsc.json', self.plan(2, waehlbar=False))
        self.fehler('waehlbar')

    def test_sperre_ohne_grund(self):
        self.aendere('hochschulen/zweite-hs.json', lambda h: h.pop('abruf_grund'))
        self.fehler('abruf_grund')

    def test_unbekannte_sichtbarkeit(self):
        self.aendere('studiengaenge/ein-bsc.json', self.plan(0, sichtbar='geheim'))
        self.fehler('sichtbar')

    def test_semester_einer_anderen_hochschule(self):
        self.aendere('studiengaenge/ein-bsc.json', self.plan(0, semester='zw-ws-2030-31'))
        self.fehler('anderen Hochschule')

    def test_unbekannte_hochschule(self):
        self.aendere('studiengaenge/ein-bsc.json', lambda g: g.update(hochschule='Nirgendwo'))
        self.fehler('Nirgendwo')

    def test_kennung_passt_nicht_zur_datei(self):
        self.aendere('studiengaenge/ein-bsc.json', lambda g: g.update(id='zwei-bsc'))
        self.fehler('Dateinamen')

    def test_kennung_mit_grossbuchstaben_oder_pfad(self):
        self.aendere('studiengaenge/ing-bsc.json', lambda g: g['vertiefungen'][0].update(id='../Bau'))
        self.fehler('keine Kennung')

    def test_modulnummer_mit_pfad(self):
        self.aendere('studiengaenge/ein-bsc.json', self.plan(0, module=[{'nummer': '../90001'}]))
        self.fehler('ungültige Modulnummer')

    def test_unbekanntes_semester_und_fachsemester(self):
        self.aendere('studiengaenge/ein-bsc.json', self.plan(0, semester='gibt-es-nicht'))
        self.fehler('gibt-es-nicht')

    def test_fachsemester_null(self):
        self.aendere('studiengaenge/ein-bsc.json', self.plan(0, fachsemester=0))
        self.fehler('fachsemester')

    def test_ersatzsemester_misst_die_gueltigkeit_am_gemeinten_semester(self):
        # V-0227: Termine des letzten Sommers stehen für den nächsten. Eine Ordnung, die erst dazwischen
        # in Kraft tritt, gilt für den gemeinten Sommer — gemessen an `ersatz_anker`, nicht am `anker`.
        kat = self.tmp / 'wp'
        shutil.copytree(FIX / 'wahlpflicht' / 'katalog', kat)
        g = lies(kat / 'studiengaenge/wp-bsc.json')
        g['ordnungen'][0]['gilt_ab'] = '2030-10-01'
        (kat / 'studiengaenge/wp-bsc.json').write_text(json.dumps(g), encoding='utf-8')
        plan = next(p for p in K.lesen(kat)['plaene'] if p['semester']['id'] == 'ss-2030')
        self.assertEqual(plan['semester']['ersatz_fuer'], 'SS 2031')
        s = lies(kat / 'semester/ss-2030.json')
        del s['ersatz_anker']
        (kat / 'semester/ss-2030.json').write_text(json.dumps(s), encoding='utf-8')
        with self.assertRaisesRegex(K.KatalogFehler, 'ersatz_anker'):
            K.lesen(kat)

    def test_wahlpflicht_mit_unbekanntem_bereich(self):
        kat = self.tmp / 'wp'
        shutil.copytree(FIX / 'wahlpflicht' / 'katalog', kat)
        g = lies(kat / 'studiengaenge/wp-bsc.json')
        g['plaene'][0]['wahlpflicht'][0]['bereich'] = 'Wahlpflichtbereich/Gibt es nicht'
        (kat / 'studiengaenge/wp-bsc.json').write_text(json.dumps(g), encoding='utf-8')
        with self.assertRaisesRegex(K.KatalogFehler, 'Gibt es nicht'):
            K.lesen(kat)

    def schreib_bestandteile(self, *eintraege):
        (self.kat / 'bestandteile.json').write_text(json.dumps({'bestandteile': list(eintraege)}), encoding='utf-8')

    def test_bestandteile_je_semester(self):
        # Punkt 633ed71d: wo die Gruppen eines Bestandteils nicht „wähle eine“ heißen.
        self.schreib_bestandteile({'id': '90003:520', 'gruppen': 'alle', 'semester': None, 'grund': 'erfunden'},
                                  {'id': '90001:510', 'gruppen': 'unklar', 'semester': ['ws-2030-31'], 'grund': 'erfunden'})
        kat = K.lesen(self.kat)
        self.assertEqual(K.bestandteile_im_semester(kat, 'ws-2030-31'),
                         {'90003:520': {'gruppen': 'alle', 'grund': 'erfunden'},
                          '90001:510': {'gruppen': 'unklar', 'grund': 'erfunden'}})
        self.assertEqual(list(K.bestandteile_im_semester(kat, 'zw-ws-2030-31')), ['90003:520'])

    def test_bestandteil_falsch(self):
        for eintrag, muster in (({'id': '90003', 'gruppen': 'alle', 'grund': 'x'}, 'Kennung'),
                                ({'id': '90003:520', 'gruppen': 'zwei', 'grund': 'x'}, 'gruppen'),
                                ({'id': '90003:520', 'gruppen': 'alle'}, 'grund'),
                                ({'id': '90003:520', 'gruppen': 'alle', 'grund': 'x', 'semester': ['gibt-es-nicht']}, 'semester')):
            self.schreib_bestandteile(eintrag)
            self.fehler(muster)
        self.schreib_bestandteile({'id': '90003:520', 'gruppen': 'alle', 'grund': 'x'},
                                  {'id': '90003:520', 'gruppen': 'keine', 'grund': 'y', 'semester': ['ws-2030-31']})
        self.fehler('doppelt')

    def test_der_echte_katalog_kennt_die_faelle_aus_v0227(self):
        kat = K.lesen(Path(__file__).resolve().parents[2] / 'katalog')
        regeln = K.bestandteile_im_semester(kat, 'wise-2026-27')
        self.assertEqual({k: v['gruppen'] for k, v in regeln.items() if k.split(':')[0] in ('70183', '70202', '41285', '40061', '20122')},
                         {'70183:266': 'alle', '70183:5680': 'alle', '70183:13776': 'unklar', '70202:1501': 'alle',
                          '41285:14229': 'alle', '41285:14230': 'unklar', '40061:741': 'alle', '20122:11814': 'keine'})

    def test_unlesbare_datei(self):
        (self.kat / 'studiengaenge/ein-bsc.json').write_text('{kaputt', encoding='utf-8')
        self.fehler('nicht lesbar')


if __name__ == '__main__':
    unittest.main()
