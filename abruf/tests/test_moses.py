import csv,io,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from moses import choose_version,semester_picker,parse_export,SourceError,BS
FIXTURE=Path(__file__).parent/'fixtures'/'statistik-ws2627.csv'
class MosesTests(unittest.TestCase):
 def test_export_keeps_january_february_and_room_exceptions(self):
  out=parse_export(FIXTURE.read_text(),'WiSe 2026/27',{'364415'})
  self.assertEqual(len(out),15)
  self.assertEqual(out[-1]['start'],'2027-02-12T12:00:00')
  self.assertEqual(out[0]['room'],'Ohne Ort')
  self.assertEqual(out[1]['room'],'Charlottenburg, C 130')
  self.assertEqual(len({x['id'] for x in out}),15)
 def test_no_fallback_to_summer(self):
  with self.assertRaises(SourceError):parse_export(FIXTURE.read_text().replace('WiSe 2026/27','SoSe 2026'),'WiSe 2026/27',{'364415'})
 def test_unknown_group_rejected(self):
  with self.assertRaises(SourceError):parse_export(FIXTURE.read_text(),'WiSe 2026/27',{'111'})
 def test_html_instead_of_csv_fails(self):
  with self.assertRaises(SourceError):parse_export('<html>login</html>','WiSe 2026/27',set())
 def test_unselected_semester_is_not_accepted(self):
  page=BS('<div data-testid="semester-picker-select-one-button"><div><input type="radio" value="77">WiSe 2026/27</div></div>','html.parser')
  self.assertEqual(semester_picker(page,'WiSe 2026/27'),'77')
  with self.assertRaises(SourceError):semester_picker(page,'WiSe 2026/27',True)
 def test_disabled_semester_is_not_accepted(self):
  page=BS('<div data-testid="semester-picker-select-one-button"><div class="disabled"><input type="radio" checked value="77">WiSe 2026/27</div></div>','html.parser')
  with self.assertRaises(SourceError):semester_picker(page,'WiSe 2026/27',True)
 def test_version_requires_actual_validity(self):
  html='<table><tr><th>Gültig ab</th></tr><tr>'+''.join('<td>'+x+'</td>' for x in ['<a href="beschreibung/anzeigen.html?nummer=43&amp;version=9">Titel</a>','6','Benotet','TU','de','WiSe 2027/28','offen'])+'</tr></table>'
  with self.assertRaises(SourceError):choose_version(html,'43','WiSe 2026/27')
  self.assertEqual(choose_version(html.replace('2027/28','2026/27'),'43','WiSe 2026/27')['version'],9)
if __name__=='__main__':unittest.main()
