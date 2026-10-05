import csv,io,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from moses import choose_version,semester_picker,parse_export,SourceError,BS,Client
FIXTURE=Path(__file__).parent/'fixtures'/'statistik-ws2627.csv'
# Erfunden nach dem Muster der echten Zeile (Gruppe 367131 am 29.09.2026): eine Gruppe, die die
# WiSe-Seite listet, deren einzige Buchung aber das SoSe trägt.
FOREIGN='999001;Erfundenes Tutorium;Tutorium;(Tutorium);00 000 L 00;;SoSe 2026;9000001;Erfundener Raum;2026-10-06T13:30:00;2026-10-06T16:30:00;\n'
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
 def test_group_entirely_from_another_semester_is_left_out_and_named(self):
  # Seit dem 29.09.2026 listet MOSES im WiSe-Tutorium von 70450 eine Gruppe mit einer Buchung
  # des SoSe 2026. Sie fällt heraus, statt das ganze Modul zu kippen, und bleibt benannt.
  raw=FIXTURE.read_text()+FOREIGN
  with self.assertRaises(SourceError):parse_export(raw,'WiSe 2026/27',{'364415','999001'})
  foreign={}
  out=parse_export(raw,'WiSe 2026/27',{'364415','999001'},foreign)
  self.assertEqual(len(out),15)
  self.assertEqual({b['group_id'] for b in out},{'364415'})
  self.assertEqual(foreign,{'999001':{'id':'999001','name':'(Tutorium)','semester':'SoSe 2026','bookings':1}})
 def test_group_mixing_semesters_still_fails(self):
  raw=FIXTURE.read_text()+FOREIGN.replace('999001','364415')
  with self.assertRaises(SourceError):parse_export(raw,'WiSe 2026/27',{'364415'},{})
 def test_export_without_target_semester_still_fails(self):
  with self.assertRaises(SourceError):parse_export(FIXTURE.read_text().replace('WiSe 2026/27','SoSe 2026'),'WiSe 2026/27',{'364415'},{})
 def test_foreign_group_must_still_be_listed_on_the_page(self):
  with self.assertRaises(SourceError):parse_export(FIXTURE.read_text()+FOREIGN,'WiSe 2026/27',{'364415'},{})
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
# Erfunden nach dem Muster der echten VVZ-Seiten (V-0228, 05.10.2026): Semesterwahl, Kalender, und
# je nach Fall Gruppenlinks, Kalenderereignisse und der Listen-Export.
PICKER='<div data-testid="semester-picker-select-one-button"><div><input type="radio" {c} value="77">WiSe 2026/27</div></div>'
def vvz(kalender=True,gruppe=False,ereignis=False,export=False):
 h=PICKER.format(c='checked')+'<form id="main-form">'
 if kalender:h+='<div id="main-form:tab-calendar:calendar">'+('<div class="moses-calendar-event-wrapper"></div>' if ereignis else '')+'</div>'
 if gruppe:h+='<a href="veranstaltung.html?veranstaltung=999002">Gruppe 1</a>'
 if export:h+='<a id="x">Liste als Excel-Datei exportieren</a>'
 return h+'</form>'
class Seiten(Client):
 """Ein Client ohne Netz: liefert die erste Seite (Semesterwahl) und dann die Seite des Semesters."""
 def __init__(self,seite):super().__init__(delay=0);self.seiten=[PICKER.format(c=''),seite]
 def get(self,url):return self.seiten.pop(0)
 def request(self,*a,**k):raise AssertionError('kein Netz: der Export darf hier nichts anfragen')
TEIL={'id':'99901:5675','lvvid':'5675','title':'Erfundene Übung','type':'UE','vvz_url':'https://moseskonto.tu-berlin.de/moses/verzeichnis/veranstaltungen/vorlage.html?veranstaltungsvorlage=5675'}
class LeererBestandteilTests(unittest.TestCase):
 def test_bestandteil_ohne_gruppe_im_semester_ist_leer_statt_fehler(self):
  # Anlass: Übung 20122/40013 und Labor 40774 im WiSe 2026/27 ohne Gruppe; MOSES zeigt nur den
  # leeren Kalender und keinen Listen-Export. Früher fiel das ganze Modul.
  r,raw=Seiten(vvz()).component(TEIL,'WiSe 2026/27')
  self.assertEqual((r['groups'],r['status'],r['semester_id'],raw),([],'unplanned','77',''))
  self.assertIn('semester=77',r['vvz_url'])
 def test_ohne_gruppe_aber_mit_ereignis_bleibt_fehler(self):
  with self.assertRaises(SourceError):Seiten(vvz(ereignis=True)).component(TEIL,'WiSe 2026/27')
 def test_ohne_gruppe_und_ohne_kalender_bleibt_fehler(self):
  with self.assertRaises(SourceError):Seiten(vvz(kalender=False)).component(TEIL,'WiSe 2026/27')
 def test_ohne_gruppe_aber_mit_listenexport_bleibt_fehler(self):
  # Strengere Regel aus V-0227 (steigflug): Gibt es den Listenexport, gibt es etwas zu listen.
  # Fehlen dann nur die Gruppenlinks, hat sich eher der Parser geändert als das Angebot.
  with self.assertRaisesRegex(SourceError,'unbekanntem Layout'):Seiten(vvz(export=True)).component(TEIL,'WiSe 2026/27')
 def test_gruppen_ohne_export_bleibt_fehler(self):
  # Die alte Regel gilt weiter, wo die Seite Gruppen listet: ohne Export kein Modul.
  with self.assertRaisesRegex(SourceError,'VVZ-Export fehlt'):Seiten(vvz(gruppe=True)).component(TEIL,'WiSe 2026/27')
if __name__=='__main__':unittest.main()
