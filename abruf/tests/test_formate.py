"""Die Formate (katalog/formate.json, V-0238): drei Kategorien für die Sättigung auf der Seite.

Geprüft werden die echte Datei (Silas' feste Beispiele, jede Schreibweise, die die Quellen heute
liefern) und der Leser `katalog._formate`/`katalog.format_von` (Synonyme, Unbekanntes, Fehler).
Die Recherche dahinter: docs/forschung/formate.md.
"""
import json
import shutil
import tempfile
import unittest
from pathlib import Path

import katalog as K
import lsf

WURZEL = Path(__file__).resolve().parent.parent.parent
ECHT = K._formate(WURZEL / 'katalog')

# Was die Quellen heute in den Rohständen schreiben (docs/forschung/formate.md §2 und §3): MOSES in
# der Spalte „Art“ der Modulbeschreibung (Bestandteil `type`) und in der CSV-Spalte
# „Veranstaltungsformat“ (Buchung `format`); AGNES über lsf.ARTEN.
MOSES_ART = {'VL': 'VL', 'UE': 'UE', 'IV': 'IV', 'TUT': 'TUT', 'SEM': 'SE', 'Projekt': 'PJ', 'Praktikum': 'PR',
             'P-PR': 'P-PR', 'LI': 'LI', 'KU': 'KU', 'LAB': 'LAB', 'Kolloquium-F': 'KO'}
MOSES_CSV = {'Vorlesung': 'VL', 'Übung': 'UE', 'Integrierte Veranstaltung': 'IV', 'Tutorium': 'TUT',
             'Seminar': 'SE', 'Projekt': 'PJ', 'Praktikum': 'PR', 'Programmierpraktikum': 'P-PR',
             'Lerninsel': 'LI', 'Kolloquium': 'KO'}


def von(typ, *buchungen):
    return K.format_von(ECHT, typ, buchungen)


class EchteFormate(unittest.TestCase):

    def test_silas_feste_beispiele(self):
        # Silas, 05.10.2026: Vorlesung 100 %, IV auch, Übung 70 %, Tutorium 50 %.
        self.assertEqual(von('VL')['kategorie'], 'vorlesung')
        self.assertEqual(von('IV')['kategorie'], 'vorlesung')
        self.assertEqual(von('UE')['kategorie'], 'uebung')
        self.assertEqual(von('TUT')['kategorie'], 'sonstige')

    def test_moses_art_und_csv_sind_bekannt(self):
        for art, kuerzel in MOSES_ART.items():
            with self.subTest(art=art):
                self.assertEqual(von(art)['kuerzel'], kuerzel)
                self.assertNotIn('unbekannt', von(art))
        for csv, kuerzel in MOSES_CSV.items():
            with self.subTest(csv=csv):
                self.assertEqual(von(csv)['kuerzel'], kuerzel)

    def test_jede_kurzform_des_lsf_abrufs_ist_bekannt(self):
        # Was abruf/lsf.py als `type` schreibt, darf nie still als unbekannt enden.
        for lang, kurz in lsf.ARTEN.items():
            with self.subTest(kurz=kurz):
                self.assertNotIn('unbekannt', von(kurz))
                self.assertEqual(von(kurz)['kuerzel'], von(lang)['kuerzel'])

    def test_beispiel_aus_dem_auftrag(self):
        # MOSES schreibt im CSV „Integrierte Veranstaltung“, im Bestandteil „IV“: dasselbe Format.
        self.assertEqual(von('IV'), von(None, 'Integrierte Veranstaltung'))
        self.assertEqual(von('IV'), {'kuerzel': 'IV', 'lang': 'Integrierte Veranstaltung', 'kategorie': 'vorlesung'})

    def test_grenzfaelle_wie_entschieden(self):
        # docs/forschung/formate.md §5: jede Entscheidung mit Grund in katalog/formate.json.
        erwartet = {'PR': 'uebung', 'LAB': 'uebung', 'LTP': 'uebung', 'MU': 'uebung', 'SE/UE': 'uebung',
                    'VL/UE': 'vorlesung', 'RV': 'vorlesung', 'SE': 'sonstige', 'PJ': 'sonstige',
                    'P-PR': 'sonstige', 'LI': 'sonstige', 'KU': 'sonstige', 'BP': 'sonstige'}
        for kuerzel, kategorie in erwartet.items():
            with self.subTest(kuerzel=kuerzel):
                self.assertEqual(von(kuerzel)['kategorie'], kategorie)
        self.assertEqual(von('Berufspraktikum')['kuerzel'], 'BP')  # nie als Praktikum (PR) gelesen
        self.assertEqual(von('Seminar am PC')['kuerzel'], 'SE')  # Wort der Quelle; Grund in formate.json

    def test_datei_traegt_quelle_und_grund(self):
        roh = json.loads((WURZEL / 'katalog' / 'formate.json').read_text(encoding='utf-8'))
        self.assertEqual(set(roh['kategorien']), set(K.KATEGORIEN))
        for kuerzel, f in roh['formate'].items():
            with self.subTest(kuerzel=kuerzel):
                self.assertTrue(set(f['hochschulen']) <= {'tu', 'hu', 'fu'})
                self.assertGreater(len(f['quelle']), 10)
                self.assertGreater(len(f['grund']), 10)


class Nachschlagen(unittest.TestCase):

    def test_gross_klein_und_leerzeichen_egal(self):
        self.assertEqual(von('  integrierte   veranstaltung ')['kuerzel'], 'IV')
        self.assertEqual(von('sem')['kuerzel'], 'SE')

    def test_art_vor_buchungen(self):
        self.assertEqual(von('UE', 'Vorlesung')['kuerzel'], 'UE')

    def test_unbekannte_art_mit_bekannten_buchungen(self):
        self.assertEqual(von('XY', 'Vorlesung', 'Vorlesung')['kuerzel'], 'VL')
        # Nennen die Buchungen zwei verschiedene Formate, entscheiden sie nicht.
        self.assertTrue(von('XY', 'Vorlesung', 'Übung')['unbekannt'])

    def test_unbekannt_ist_sonstige_mit_den_woertern_der_quelle(self):
        self.assertEqual(von('XY', 'Neues Format'), {'kuerzel': 'XY', 'lang': 'Neues Format',
                                                     'kategorie': 'sonstige', 'unbekannt': True})
        self.assertEqual(von('XY'), {'kuerzel': 'XY', 'lang': 'XY', 'kategorie': 'sonstige', 'unbekannt': True})
        self.assertEqual(von(None), {'kuerzel': None, 'lang': None, 'kategorie': 'sonstige', 'unbekannt': True})

    def test_ohne_katalog(self):
        self.assertEqual(K.format_von(None, 'VL', ['Vorlesung']),
                         {'kuerzel': 'VL', 'lang': 'Vorlesung', 'kategorie': 'sonstige', 'unbekannt': True})


class Pruefung(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def mit(self, formate, kategorien=None):
        roh = {'formate': formate}
        if kategorien is not None:
            roh['kategorien'] = kategorien
        (self.tmp / 'formate.json').write_text(json.dumps(roh, ensure_ascii=False), encoding='utf-8')
        return K._formate(self.tmp)

    def eintrag(self, **anders):
        return {'lang': 'Vorlesung', 'kategorie': 'vorlesung', 'hochschulen': ['tu'], 'quelle': 'q', 'grund': 'g',
                **anders}

    def test_ohne_datei_keine_formate(self):
        self.assertEqual(K._formate(self.tmp), {'formate': {}, 'namen': {}})

    def test_gueltig(self):
        f = self.mit({'VL': self.eintrag(namen=['V'])}, {k: 'x' for k in K.KATEGORIEN})
        self.assertEqual(f['namen'], {'vl': 'VL', 'vorlesung': 'VL', 'v': 'VL'})

    def test_fehler(self):
        faelle = {
            'Name zweimal': {'VL': self.eintrag(), 'VO': self.eintrag(lang='Vortrag', namen=['Vorlesung'])},
            'Kategorie unbekannt': {'VL': self.eintrag(kategorie='praesenz')},
            'Grund fehlt': {'VL': {k: v for k, v in self.eintrag().items() if k != 'grund'}},
            'Langname fehlt': {'VL': self.eintrag(lang='')},
            'keine Hochschule': {'VL': self.eintrag(hochschulen=[])},
            'Hochschule keine Kennung': {'VL': self.eintrag(hochschulen=['TU Berlin'])},
            'Kürzel mit Leerzeichen': {'V L': self.eintrag()},
            'namen kein Text': {'VL': self.eintrag(namen=[1])},
            'leer': {},
        }
        for was, formate in faelle.items():
            with self.subTest(was=was), self.assertRaises(K.KatalogFehler):
                self.mit(formate)

    def test_kategorien_genau_drei(self):
        with self.assertRaises(K.KatalogFehler):
            self.mit({'VL': self.eintrag()}, {'vorlesung': 'x', 'uebung': 'x'})


if __name__ == '__main__':
    unittest.main()
