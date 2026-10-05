"""Die zweite Quelle, HIS LSF (AGNES der HU Berlin), ohne Netz.

Die Fixtures unter fixtures/lsf/ sind echte, gekürzte Ausschnitte aus AGNES vom 05.10.2026 (BioB 1,
BioB 3 und BioB 4 des B.Sc. Biologie, WiSe 2026/27): Baumseiten, Detailseiten, die Semesteransicht
des Stundenplans und die iCalendar-Exporte. Entfernt sind die Namen der Lehrenden. ERFUNDEN ist nur
der Kommentar unter „Inhalt“ jeder Detailseite (er prüft das Schwärzen) und der Platzhalter
TERMINE im Stundenplan, den die Attrappe füllt.
"""
import json
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import abruf  # noqa: E402
import lsf  # noqa: E402

FIX = Path(__file__).parent / 'fixtures' / 'lsf'
BASIS = 'https://agnes.hu-berlin.de/lupo/rds'
QUELLE = {'art': 'lsf', 'name': 'AGNES', 'basis': BASIS, 'semester': '20262', 'label': 'WiSe 2026/27'}
PFAD = ['Lebenswissenschaftliche Fakultät', 'Institut für Biologie', 'B.Sc. Biologie Monobachelor (SPO 2025)',
        'Pflichtbereich', 'Wintersemester']
ANGABE = {'vvz': 'BioB 4', 'vvz_pfad': PFAD, 'bereich': 'Pflichtbereich'}


def _reihe(a, b):
    return {str(i) for i in range(a, b + 1)}


# Termin-IDs je Veranstaltung und Gruppe, wie AGNES sie am 05.10.2026 beim Vormerken lieferte.
TERMINE = {
    '253147': {'1': {'1646068', '1646069'}},
    '253148': {'1': {'1646070'}},
    '247159': {'1': {'1632040'}},
    '249626': {'1': {'1638294', '1638296', '1638297', '1638298', '1638530', '1638531'},
               '2': {'1638302', '1638303', '1638529', '1638532', '1638535', '1638536'},
               '3': {'1638533', '1638534'} | _reihe(1638537, 1638540),
               '4': _reihe(1638304, 1638309), '5': _reihe(1638541, 1638546), '6': _reihe(1638547, 1638552)},
}


class Agnes:
    """Attrappe einer LSF-Sitzung: liefert die Fixtures und merkt sich, was vorgemerkt wurde."""

    def __init__(self, termine=None, woche='-2', verliert=False, ersetze=None):
        self.termine = termine or TERMINE
        self.woche = woche
        self.verliert = verliert
        self.ersetze = ersetze or {}
        self.vorgemerkt = []
        self.abrufe = []

    def url(self, params):
        return BASIS + '?' + urlencode(params)

    def get(self, url):
        self.abrufe.append(url)
        q = parse_qs(urlsplit(url).query)
        st = q['state'][0]
        if st == 'wtree':
            roots = [k for k in q if k.startswith('root1')]
            name = f"baum-{q[roots[0]][0].split('|')[-1]}.html" if roots else 'baum-wurzel.html'
            return (FIX / name).read_text(encoding='utf-8')
        if st == 'verpublish' and q.get('moduleCall') == ['webInfo']:
            html = (FIX / f"detail-{q['publishid'][0]}.html").read_text(encoding='utf-8')
            for alt, neu in self.ersetze.items():
                html = html.replace(alt, neu)
            return html
        if st == 'wplan':
            ids = set()
            for pid, g in self.vorgemerkt:
                ids |= self.termine[pid][g]
            if self.verliert and len(self.vorgemerkt) > 1:
                ids = set(sorted(ids)[1:])
            html = (FIX / 'plan.html').read_text(encoding='utf-8').replace('TERMINE', ','.join(sorted(ids)))
            if self.woche != '-2':
                html = html.replace(' selected="selected"', '').replace(
                    f'value="{self.woche}"', f'selected="selected" value="{self.woche}"')
            return html
        if st == 'verpublish' and q.get('moduleCall') == ['iCalendarPlan']:
            gefragt = set(q['termine'][0].split(','))
            pid = next(p for p, gs in self.termine.items() if gefragt <= set().union(*gs.values()))
            return (FIX / f'ical-{pid}.ics').read_text(encoding='utf-8')
        raise AssertionError('unerwartete Adresse: ' + url)

    baumseite = get

    def post(self, url, data):
        self.abrufe.append(url)
        (k, v), = data.items()
        self.vorgemerkt.append((k.split('.', 1)[1], v))
        return ''


def bestandteil(pid, titel='Allgemeine und Anorganische Chemie', quelle=QUELLE, client=None):
    return lsf.bestandteil(client or Agnes(), 'BioB-4', {'publishid': pid, 'nummer': '', 'titel': titel},
                           quelle['label'], quelle, 'Pflichtbereich')


def tage(gruppe):
    return sorted({b['start'][:10] for b in gruppe['bookings']})


class ModulTests(unittest.TestCase):
    def setUp(self):
        self.sitzungen = []

        def neue():
            self.sitzungen.append(Agnes())
            return self.sitzungen[-1]
        self.modul = lsf.hole_modul(Agnes(), 'BioB-4', QUELLE, ANGABE, neue)

    def test_modul_wird_ueber_die_titel_im_baum_gefunden(self):
        m = self.modul
        self.assertEqual(m['title'], 'Allgemeine und Anorganische Chemie')
        self.assertIn('root120262=342437%7C331075%7C343736%7C342701%7C342647%7C342684%7C342598', m['url'])
        self.assertEqual([c['id'] for c in m['components']], ['BioB-4:253147', 'BioB-4:253148'])
        self.assertEqual([(c['type'], c['number'], c['sws']) for c in m['components']],
                         [('VL', '2112BioB004VL', 3.0), ('SE', '2112BioB004SE', 1.0)])
        self.assertTrue(all(c['required'] and c['section'] == 'Pflichtbereich' for c in m['components']))
        self.assertEqual(m['semester'], 'WiSe 2026/27')

    def test_rohstand_hat_die_felder_der_architektur(self):
        m = self.modul
        self.assertEqual(set(m), {'number', 'title', 'version', 'valid_from', 'valid_to', 'valid_versions',
                                  'url', 'isis_url', 'notes', 'components', 'semester'})
        c = m['components'][0]
        self.assertEqual(set(c), {'id', 'lvvid', 'title', 'type', 'number', 'sws', 'cycle', 'language', 'section',
                                  'required', 'vvz_url', 'isis_url', 'semester_id', 'status', 'groups'})
        g = c['groups'][0]
        self.assertEqual(set(g), {'id', 'name', 'url', 'series', 'bookings'})
        self.assertEqual(set(g['bookings'][0]), {'id', 'start', 'end', 'room', 'title', 'format', 'number',
                                                 'note', 'info'})

    def test_jede_veranstaltung_in_eigener_sitzung(self):
        # Der vorgemerkte Stundenplan hängt an der Sitzung; zwei Veranstaltungen dürfen sich ihn
        # nicht teilen, sonst gehören Termin-IDs der einen zur anderen.
        self.assertEqual(len(self.sitzungen), 2)
        self.assertEqual([s.vorgemerkt for s in self.sitzungen], [[('253147', '1')], [('253148', '1')]])

    def test_vorlesung_freitags_ohne_weihnachtspause(self):
        vl = self.modul['components'][0]['groups'][0]
        self.assertEqual(len(vl['bookings']), 32)  # 2 Zeilen × 16 Freitage (18 minus 25.12. und 01.01.)
        self.assertNotIn('2026-12-25', tage(vl))
        self.assertNotIn('2027-01-01', tage(vl))
        self.assertEqual(vl['bookings'][0]['start'], '2026-10-16T13:00:00')
        self.assertEqual(vl['bookings'][-1]['end'], '2027-02-12T17:00:00')

    def test_seminar_14taeglich_zweite_woche(self):
        # Seite: „14tgl./2, 13.10.2026 bis 09.02.2027“; Export: ab 20.10.2026 alle 14 Tage, ohne 29.12.
        se = self.modul['components'][1]['groups'][0]
        self.assertEqual(tage(se), ['2026-10-20', '2026-11-03', '2026-11-17', '2026-12-01', '2026-12-15',
                                    '2027-01-12', '2027-01-26', '2027-02-09'])
        self.assertEqual(se['bookings'][0]['room'], '')
        self.assertIn('Rudower Chaussee 26', se['bookings'][0]['note'])
        self.assertIn('14-täglich', se['series'][0]['Datum/Uhrzeit'])

    def test_hinweise_geschwaerzt_und_mit_warnung(self):
        notes = self.modul['notes']
        self.assertEqual(sorted(notes), ['Seminar 2112BioB004SE', 'Vorlesung 2112BioB004VL'])
        se = notes['Seminar 2112BioB004SE']
        self.assertNotIn('Beispiel123', se)
        self.assertNotIn('beispiel@', se)
        self.assertIn('[Zugangsdaten nur in AGNES]', se)
        self.assertNotIn('PW für den Moodle-Kurs', se)
        self.assertLessEqual(len(se), 1500)
        self.assertTrue(notes['Vorlesung 2112BioB004VL'].startswith('Achtung: Der Freitext in AGNES nennt eigene Termine.'))

    def test_anderes_semester_im_baum_ist_ein_fehler(self):
        with self.assertRaisesRegex(lsf.SourceError, 'anderes Semester'):
            lsf.hole_modul(Agnes(), 'BioB-4', {**QUELLE, 'semester': '20271'}, ANGABE, Agnes)

    def test_fehlender_titel_im_pfad_ist_ein_fehler(self):
        with self.assertRaisesRegex(lsf.SourceError, 'Pflichtbereich X.*fehlt'):
            lsf.hole_modul(Agnes(), 'BioB-4', QUELLE, {**ANGABE, 'vvz_pfad': PFAD[:3] + ['Pflichtbereich X']}, Agnes)
        with self.assertRaisesRegex(lsf.SourceError, r'\[BioB 99\].*fehlt'):
            lsf.hole_modul(Agnes(), 'BioB-4', QUELLE, {**ANGABE, 'vvz': 'BioB 99'}, Agnes)


class BestandteilTests(unittest.TestCase):
    def test_einzeltermine_in_zwei_raeumen(self):
        # BioB 1 UE: 6 Gruppen, je 4 Termine, zwei davon in zwei Laboren zugleich (6 Zeilen).
        teil, _ = bestandteil('249626', 'Grundlagen der molekularen Zellbiologie')
        self.assertEqual([g['name'] for g in teil['groups']], [f'Gruppe {i}' for i in range(1, 7)])
        g1 = teil['groups'][0]
        self.assertEqual(len(g1['bookings']), 6)
        self.assertEqual(tage(g1), ['2026-11-09', '2026-11-23', '2027-01-04', '2027-01-25'])
        am_23 = [b['room'] for b in g1['bookings'] if b['start'].startswith('2026-11-23')]
        self.assertEqual(len(set(am_23)), 2)
        self.assertEqual(teil['status'], 'ok')

    def test_zeile_ohne_tag_und_zeit(self):
        # BioB 3 UE: „Montag – Freitag, nach Vereinbarung“; LSF exportiert DTSTART:T00.
        teil, _ = bestandteil('247159', 'Mathematische Grundlagen der Biologie 1')
        self.assertEqual(teil['status'], 'unplanned')
        self.assertEqual(len(teil['groups']), 1)
        self.assertEqual(teil['groups'][0]['bookings'], [])
        self.assertIn('nach Vereinbarung', teil['groups'][0]['series'][0]['Bemerkung'])

    def test_falsches_semester_auf_der_detailseite(self):
        with self.assertRaisesRegex(lsf.SourceError, 'Falsches Semester'):
            bestandteil('253148', quelle={**QUELLE, 'label': 'SoSe 2027'})

    def test_unbekannter_terminstatus(self):
        with self.assertRaisesRegex(lsf.SourceError, 'Terminstatus'):
            bestandteil('253148', client=Agnes(ersetze={'findet statt': 'verlegt'}))

    def test_export_muss_zur_seite_passen(self):
        # Die Seite sagt 13–14 Uhr, der Export 13–15 Uhr: keine Zuordnung, kein Rohstand.
        with self.assertRaisesRegex(lsf.SourceError, 'passt nicht zur Seite'):
            bestandteil('253147', client=Agnes(ersetze={'13:00 bis 15:00': '13:00 bis 14:00'}))
        # Der Export nennt einen Termin, der beim Vormerken keiner Gruppe zufiel.
        falsch = {**TERMINE, '253147': {'1': {'1646068'}}}
        with self.assertRaisesRegex(lsf.SourceError, 'fremden Termin'):
            bestandteil('253147', client=Agnes(termine=falsch))

    def test_stundenplan_ohne_semesteransicht(self):
        with self.assertRaisesRegex(lsf.SourceError, 'Semesteransicht'):
            bestandteil('253148', client=Agnes(woche='-1'))

    def test_stundenplan_verliert_termine(self):
        with self.assertRaisesRegex(lsf.SourceError, 'verloren'):
            bestandteil('249626', client=Agnes(verliert=True))

    def test_faellt_aus_am_der_seite_gilt_zusaetzlich(self):
        # Abgewandelt: Die Zeile nennt einen Ausfall, den der Export (noch) nicht als EXDATE trägt.
        c = Agnes()
        d = lsf.detail(c.get(lsf.detail_url(c, '253148')), '253148')
        d['gruppen'][0]['zeilen'][0]['fällt aus am'] = '03.11.2026'
        evs = {e['UID'][1][len('253148'):]: e for e in lsf.ereignisse((FIX / 'ical-253148.ics').read_text(encoding='utf-8'))}
        g, = lsf.gruppen_buchungen(d['gruppen'], TERMINE['253148'], evs, '253148', 'x', 'y')
        self.assertNotIn('2026-11-03', tage(g))
        self.assertEqual(len(g['bookings']), 7)


class IcalTests(unittest.TestCase):
    def setUp(self):
        self.evs = lsf.ereignisse((FIX / 'ical-247555.ics').read_text(encoding='utf-8'))

    def test_serie_mit_exdate(self):
        mo = next(e for e in self.evs if e['UID'][1].endswith('1632960'))
        beginne = lsf.expandiere(mo)
        self.assertEqual((beginne[0], beginne[-1]), (datetime(2026, 10, 19, 8, 15), datetime(2027, 2, 8, 8, 15)))
        self.assertEqual(len(beginne), 17)
        # EXDATE trägt 14:00Z, die Vorlesung beginnt 08:15: verglichen wird nur das Datum.
        self.assertEqual(lsf.ausfaelle(mo), {date(2026, 12, 21), date(2026, 12, 28)})
        self.assertEqual(len([b for b in beginne if b.date() not in lsf.ausfaelle(mo)]), 15)

    def test_until_zaehlt_mit_count_und_daily(self):
        ev = {'DTSTART': ({'TZID': 'Europe/Berlin'}, '20261013T100000'),
              'RRULE': ({}, 'FREQ=WEEKLY;UNTIL=20261027T235900Z;INTERVAL=1;BYDAY=TU')}
        self.assertEqual([b.day for b in lsf.expandiere(ev)], [13, 20, 27])
        ev['RRULE'] = ({}, 'FREQ=WEEKLY;COUNT=2;BYDAY=TU,TH')
        self.assertEqual([b.day for b in lsf.expandiere(ev)], [13, 15])
        ev['RRULE'] = ({}, 'FREQ=DAILY;UNTIL=20261016T235900Z')
        self.assertEqual([b.day for b in lsf.expandiere(ev)], [13, 14, 15, 16])

    def test_unbekannte_regel_wird_nicht_geraten(self):
        for regel in ('FREQ=MONTHLY;UNTIL=20270101T000000Z', 'FREQ=WEEKLY;BYDAY=1TU;UNTIL=20270101T000000Z',
                      'FREQ=WEEKLY;BYMONTHDAY=3;UNTIL=20270101T000000Z', 'FREQ=WEEKLY;BYDAY=TU'):
            ev = {'DTSTART': ({}, '20261013T100000'), 'RRULE': ({}, regel)}
            with self.assertRaises(lsf.SourceError, msg=regel):
                lsf.expandiere(ev)

    def test_ohne_datum_und_fremde_zone(self):
        self.assertEqual(lsf.expandiere({'DTSTART': ({'TZID': 'Europe/Berlin'}, 'T00')}), [])
        with self.assertRaises(lsf.SourceError):
            lsf.expandiere({'DTSTART': ({'TZID': 'America/New_York'}, '20261013T100000')})

    def test_zuordnung_vierzehntaeglich_zweite_woche(self):
        ev, = lsf.ereignisse((FIX / 'ical-253148.ics').read_text(encoding='utf-8'))
        b = lsf.expandiere(ev)
        self.assertTrue(lsf._passt((date(2026, 10, 13), date(2027, 2, 9), '13:00', '15:00'), ev, b))
        self.assertFalse(lsf._passt((date(2026, 10, 13), date(2027, 2, 9), '13:15', '15:00'), ev, b))
        self.assertFalse(lsf._passt((date(2026, 10, 27), date(2027, 2, 9), '13:00', '15:00'), ev, b))


class HoeflichkeitTests(unittest.TestCase):
    def test_pause_gilt_ueber_sitzungen_hinweg(self):
        # Zwei Sitzungen nacheinander: Die zweite wartet auf die erste (Punkt aed3e76c).
        from unittest import mock
        schlaf = []
        jetzt = iter([100.0, 100.2, 100.4, 100.6])  # vor/nach der 1. Anfrage, vor/nach der 2.
        with mock.patch.object(lsf.time, 'monotonic', lambda: next(jetzt)), \
             mock.patch.object(lsf.time, 'sleep', schlaf.append), \
             mock.patch.object(lsf.Client, 'letzte', 0.0):
            a, b = lsf.Client(BASIS), lsf.Client(BASIS)
            for c in (a, b):
                c.opener = mock.Mock(open=mock.Mock(side_effect=OSError('kein Netz im Test')))
                with self.assertRaises(OSError):
                    c.get(BASIS + '?state=wtree')
        self.assertEqual(schlaf[0], 0.0)
        self.assertAlmostEqual(schlaf[1], 0.8)

    def test_nur_der_host_aus_dem_katalog(self):
        with self.assertRaisesRegex(lsf.SourceError, 'Host'):
            lsf.Client(BASIS).get('https://example.org/lupo/rds?state=wtree')


class SchwaerzenTests(unittest.TestCase):
    def test_zugangsdaten_und_mail(self):
        self.assertEqual(lsf.schwaerzen('Moodle-Einschreibeschlüssel: Geheim1'), '[Zugangsdaten nur in AGNES]')
        self.assertEqual(lsf.schwaerzen('Kontakt: a.b@example.org. Raum 1.'), 'Kontakt: [E-Mail in AGNES]. Raum 1.')
        # Der erfundene Kommentar der Fixture, wie detail() ihn liest: Zeilen getrennt.
        c = Agnes()
        texte = lsf.detail(c.get(lsf.detail_url(c, '253148')), '253148')['texte']
        t = lsf.schwaerzen(texte['Kommentar'])
        self.assertEqual(t, 'Anmeldung über den Moodlekurs: https://moodle.example.org/course/view.php?id=1 '
                            '[Zugangsdaten nur in AGNES] Fragen an [E-Mail in AGNES]. '
                            'Die Einschreibung in die Vorlesung erfolgt hier in Agnes.')
        t = lsf.schwaerzen('Die Einschreibung in die Vorlesung erfolgt in Agnes.\nKey: abc')
        self.assertEqual(t, 'Die Einschreibung in die Vorlesung erfolgt in Agnes. [Zugangsdaten nur in AGNES]')

    def test_fixtures_tragen_keine_echten_zugangsdaten(self):
        # Das Repo ist öffentlich (AGENTS.md §2 ①): In den Ausschnitten steht nur Erfundenes.
        for f in FIX.iterdir():
            text = f.read_text(encoding='utf-8')
            for echt in ('hu-berlin.de/course', 'Evolution2025', 'LHospital'):
                self.assertNotIn(echt, text, f.name)


class KatalogTests(unittest.TestCase):
    def katalog(self, semester, plan):
        t = tempfile.TemporaryDirectory()
        self.addCleanup(t.cleanup)
        k = Path(t.name)
        (k / 'semester').mkdir()
        (k / 'studiengaenge').mkdir()
        (k / 'semester' / 'hu-x.json').write_text(json.dumps(semester), encoding='utf-8')
        (k / 'studiengaenge' / 'x.json').write_text(json.dumps({'id': 'x', 'plaene': [plan]}), encoding='utf-8')
        return k

    SEM = {'id': 'hu-x', 'label': 'WiSe 2026/27', 'anker': '2026-10-12', 'quelle': QUELLE}
    PLAN = {'semester': 'hu-x', 'fachsemester': 1, 'vvz_pfad': PFAD, 'bereich': 'Pflichtbereich',
            'module': [{'nummer': 'BioB-4', 'vvz': 'BioB 4', 'kurz': 'Chemie'}]}

    def test_lsf_katalog_wird_gelesen(self):
        kat = abruf.lade_katalog(self.katalog(self.SEM, self.PLAN))
        self.assertEqual(abruf.quelle(kat['semester']['hu-x'])['art'], 'lsf')
        self.assertEqual(abruf.angaben_je_semester(kat)['hu-x']['BioB-4'], ANGABE)

    def test_lsf_katalog_fehler(self):
        falsch = [
            (self.SEM, {**self.PLAN, 'module': [{'nummer': 'BioB 4', 'vvz': 'BioB 4'}]}),   # Leerzeichen im Schlüssel
            (self.SEM, {**self.PLAN, 'module': [{'nummer': '../x', 'vvz': 'BioB 4'}]}),
            (self.SEM, {**self.PLAN, 'module': [{'nummer': 'BioB-4'}]}),                     # ohne vvz
            (self.SEM, {k: v for k, v in self.PLAN.items() if k != 'vvz_pfad'}),
            ({**self.SEM, 'quelle': {**QUELLE, 'basis': 'http://agnes.example/rds'}}, self.PLAN),
            ({**self.SEM, 'quelle': {**QUELLE, 'art': 'campusnet'}}, self.PLAN),
            ({k: v for k, v in self.SEM.items() if k != 'quelle'}, self.PLAN),
        ]
        for sem, plan in falsch:
            with self.assertRaises(abruf.KatalogFehler, msg=json.dumps(plan)[:80]):
                abruf.lade_katalog(self.katalog(sem, plan))

    def test_der_katalog_waehlt_die_quelle(self):
        fabrik, holer = abruf.standard_quelle(self.SEM, {'BioB-4': ANGABE})
        self.assertIsInstance(fabrik(), lsf.Client)
        fabrik, holer = abruf.standard_quelle({'id': 'w', 'moses': 'WiSe 2026/27'}, {})
        self.assertIs(holer, abruf.hole_modul)

    def test_lauf_schreibt_rohstand_und_lauf_der_lsf_quelle(self):
        k = self.katalog(self.SEM, self.PLAN)
        with tempfile.TemporaryDirectory() as t:
            roh = Path(t)
            gesehen = []

            def holer(client, nummer, ziel):
                gesehen.append((type(client).__name__, nummer, ziel))
                return lsf.hole_modul(Agnes(), nummer, QUELLE, ANGABE, Agnes)
            r = abruf.lauf(katalog=k, roh=roh, holer=holer, log=lambda *a, **kw: None)
            self.assertEqual(r['hu-x']['status'], 'ok')
            self.assertEqual(gesehen, [('Client', 'BioB-4', 'WiSe 2026/27')])
            daten = json.loads((roh / 'hu-x' / 'BioB-4.json').read_text(encoding='utf-8'))
            self.assertEqual(len(daten['components']), 2)
            self.assertEqual(json.loads((roh / 'hu-x' / '_lauf.json').read_text(encoding='utf-8'))['bookings'], 40)

    def test_der_echte_hu_katalog(self):
        kat = abruf.lade_katalog()
        plan = next(p for p in kat['plaene'] if p['studiengang'] == 'hu-biologie-bsc')
        self.assertEqual([m['vvz'] for m in plan['module']], ['BioB 1', 'BioB 2', 'BioB 3', 'BioB 4'])
        self.assertEqual(abruf.quelle(kat['semester'][plan['semester']])['art'], 'lsf')


if __name__ == '__main__':
    unittest.main()
