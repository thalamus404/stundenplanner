"""Public MOSES pages + the UI's CSV export. No ISIS code, cookies or tables.

The export's individual bookings are authoritative for dates and room exceptions.
Never infer semester IDs, dates from CSS, or retain only the first date range.
JSF IDs and checkbox values are discovered from each response, not hardcoded.
"""
from __future__ import annotations
import csv
import io
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from http.cookiejar import CookieJar
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit, parse_qs
from urllib.request import build_opener, HTTPCookieProcessor, Request
from bs4 import BeautifulSoup as BS

ORIGIN = 'https://moseskonto.tu-berlin.de'
MTS = ORIGIN + '/moses/modultransfersystem/bolognamodule/'
COLUMNS = ['Veranstaltung ID', 'Veranstaltungsname', 'Veranstaltungsformat',
           'Gruppe/ Planungsgruppe', 'LV-Nummer', 'Veranstaltung Semester',
           'Buchung ID', 'Ort', 'ISO Beginn (Studierende)', 'ISO Ende (Studierende)',
           'Buchungsnotiz', 'Veranstaltung Zusatzinformationen']

USER_AGENT = 'Stundenplanner/1.0 (+https://github.com/thalamus404/stundenplanner)'

class SourceError(ValueError):
    pass

def clean(node):
    return ' '.join(node.get_text(' ', strip=True).split()) if node else ''

def public_url(url):
    return re.sub(r';jsessionid=[^?&#/]+', '', url)

def semester_key(label):
    m = re.fullmatch(r'(WiSe|SoSe|WS|SS)\s+(\d{4})(?:/\d{2,4})?', label.strip())
    if not m:
        raise SourceError('Unbekanntes Semester: ' + label)
    return int(m[2]) * 2 + (m[1] in ('WiSe', 'WS'))

def choose_version(html, number, target):
    soup = BS(html, 'html.parser')
    versions = []
    for table in soup.find_all('table'):
        if 'Gültig ab' not in clean(table):
            continue
        for row in table.find_all('tr'):
            a = row.select_one('a[href*="version="]')
            cells = [clean(c) for c in row.find_all('td', recursive=False)]
            if not a or len(cells) < 7:
                continue
            q = parse_qs(urlsplit(a['href']).query)
            if q.get('nummer', [number])[0] != number:
                raise SourceError('Modulnummer der Version stimmt nicht')
            start = semester_key(cells[5])
            end = 10**9 if cells[6] == 'offen' else semester_key(cells[6])
            if start <= semester_key(target) <= end:
                versions.append({'version': int(q['version'][0]), 'title': cells[0],
                                 'valid_from': cells[5], 'valid_to': cells[6],
                                 'url': public_url(urljoin(MTS, a['href']))})
    if not versions:
        raise SourceError(f'Modul {number}: keine gültige Version für {target}')
    # MOSES can publish overlapping legacy ranges. The highest valid version wins;
    # all valid versions remain evidence and the UI warns if there was ambiguity.
    versions.sort(key=lambda v: v['version'], reverse=True)
    return {**versions[0], 'valid_versions': [v['version'] for v in versions]}

def module_parts(html, number, version):
    soup = BS(html, 'html.parser')
    fields = form_groups(soup)
    if fields.get('Modul / Version') != f'#{number} / #{version}':
        raise SourceError('Modulbeschreibung bestätigt Nummer/Version nicht')
    parts = []
    for table in soup.find_all('table'):
        headers = [clean(c) for c in table.select('thead th')]
        if 'SWS' not in headers or 'VVZ' not in headers:
            continue
        heading = table.find_previous(['h3','h4'])
        context = clean(heading)
        for row in table.select('tbody tr'):
            cells = row.find_all('td', recursive=False)
            if len(cells) != len(headers):
                raise SourceError('Unbekanntes Modulbestandteile-Layout')
            d = {k: clean(v) for k,v in zip(headers,cells)}
            vvz = row.select_one('a[href*="veranstaltungsvorlage="]')
            isis = row.select_one('a[href*="isis.tu-berlin.de/"]')
            if not vvz:
                raise SourceError('Lehrveranstaltung ohne VVZ-Link: ' + d.get('Lehrveranstaltungen',''))
            url = public_url(urljoin(ORIGIN, vvz['href']))
            lvvid = parse_qs(urlsplit(url).query)['veranstaltungsvorlage'][0]
            parts.append({'id': f'{number}:{lvvid}', 'lvvid': lvvid,
                          'title': d['Lehrveranstaltungen'], 'type': d['Art'],
                          'number': d['Nummer'], 'sws': float(d['SWS'].replace(',','.')),
                          'cycle': d['Turnus'], 'language': d['Sprache'],
                          'section': context, 'required': context == 'Pflichtbereich',
                          'vvz_url': url, 'isis_url': isis['href'] if isis else None})
    if not parts:
        raise SourceError('Keine Modulbestandteile erkannt')
    search = soup.select_one(f'a[href*="modulenumber={number}"]')
    if not search:
        raise SourceError('ISIS-Modulsuchlink fehlt')
    notes = {}
    for name in ['Beschreibung der Lehr- und Lernformen','Anmeldeformalitäten','Sonstiges']:
        h = soup.find(['h3','h4'],string=lambda s: bool(s and s.strip()==name))
        if h:
            block=h.find_parent(class_='row') or h.parent
            text=clean(block)
            notes[name]=text[len(name):].strip() if text.startswith(name) else text
    return parts, search['href'], notes

def form_groups(soup):
    out = {}
    for g in soup.select('div.form-group'):
        label=g.find('label')
        if label:
            k=clean(label); text=clean(g)
            out.setdefault(k, text[len(k):].strip() if text.startswith(k) else text)
    return out

def semester_picker(soup, target, require_active=False):
    picker = soup.select_one('[data-testid="semester-picker-select-one-button"]')
    if not picker:
        raise SourceError('Semesterwahl fehlt')
    for inp in picker.select('input[type="radio"]'):
        if clean(inp.parent) == target:
            if inp.has_attr('disabled') or 'disabled' in inp.parent.get('class',[]):
                raise SourceError(target + ' ist im VVZ noch gesperrt')
            if require_active and not inp.has_attr('checked'):
                raise SourceError('VVZ zeigt trotz Auswahl ein anderes Semester')
            return inp['value']
    raise SourceError(target + ' fehlt in der Semesterwahl')

def controls(form):
    out={}
    for x in form.select('input[name],select[name],textarea[name]'):
        if x.has_attr('disabled'): continue
        if x.name=='select':
            opt=x.find('option',selected=True) or x.find('option')
            out[x['name']]=opt.get('value','') if opt else ''
        elif x.name=='textarea': out[x['name']]=x.get_text()
        elif x.get('type') in ('checkbox','radio'):
            if x.has_attr('checked'): out[x['name']]=x.get('value','on')
        elif x.get('type') not in ('submit','button'):
            out[x['name']]=x.get('value','')
    return out

class Client:
    def __init__(self, delay=0.7):
        self.opener=build_opener(HTTPCookieProcessor(CookieJar()))
        self.delay=delay
        self.last=0
    def request(self,url,data=None,ajax=False):
        if urlsplit(url).netloc != 'moseskonto.tu-berlin.de':
            raise SourceError('Unerwarteter MOSES-Host')
        time.sleep(max(0,self.delay-(time.monotonic()-self.last)))
        # Ein öffentliches Werkzeug sagt, wer fragt, und wo man es findet: MOSES soll einen
        # auffälligen Abruf einem Projekt zuordnen und es erreichen können, statt ihn zu sperren.
        headers={'User-Agent':USER_AGENT}
        if ajax: headers['Faces-Request']='partial/ajax'
        try:
            with self.opener.open(Request(url,data=urlencode(data).encode() if data is not None else None,headers=headers),timeout=45) as r:
                if urlsplit(r.url).netloc != 'moseskonto.tu-berlin.de':
                    raise SourceError('Unerwartete Weiterleitung')
                return r.read().decode('utf-8-sig'), r.headers.get('Content-Type','')
        finally: self.last=time.monotonic()
    def get(self,url): return self.request(url)[0]
    def ajax(self,url,page,source,render=None,event=None,extra=None):
        form=page.find('form',id='main-form')
        if not form: raise SourceError('VVZ-Formular fehlt')
        data=controls(form)
        data.update({'main-form':'main-form','jakarta.faces.partial.ajax':'true',
                     'jakarta.faces.source':source,'jakarta.faces.partial.execute':source,source:source})
        if render: data['jakarta.faces.partial.render']=render
        if event: data.update({'jakarta.faces.behavior.event':event,'jakarta.faces.partial.event':event})
        data.update(extra or {})
        body,_=self.request(url,data,True)
        if 'validationFailed' in body or '<error>' in body or '<redirect' in body:
            raise SourceError('VVZ-Exportformular wurde nicht verarbeitet')
        root=ET.fromstring(body)
        for e in root.iter('update'):
            eid=e.get('id','')
            if 'ViewState' in eid or 'ClientWindow' in eid:
                name='jakarta.faces.ViewState' if 'ViewState' in eid else 'jakarta.faces.ClientWindow'
                for inp in page.find_all('input',attrs={'name':name}): inp['value']=e.text or ''
            else:
                old=page.find(id=eid)
                if old: old.replace_with(BS(e.text or '', 'html.parser'))
        return page
    def export(self,url,page):
        link=next((a for a in page.find_all('a') if 'Liste als Excel-Datei exportieren' in clean(a)),None)
        if not link: raise SourceError('VVZ-Export fehlt')
        self.ajax(url,page,link['id'],'main-form:view-base:view-base-cal-export-modal')
        fields={}
        found=set()
        for inp in page.select('input[type="checkbox"]'):
            label=clean(inp.parent)
            if label in COLUMNS:
                fields[inp['name']]=inp.get('value','on');found.add(label)
            # Fresh independent session: all export aggregation options stay off.
        if found != set(COLUMNS): raise SourceError('Exportspalten fehlen: '+str(set(COLUMNS)-found))
        picker=next(iter(fields)).rsplit(':',1)[0]
        self.ajax(url,page,picker,event='change',extra=fields)
        link=next((a for a in page.find_all('a') if 'Als CSV-Datei exportieren' in clean(a)),None)
        if not link or not link.get('id'): raise SourceError('CSV-Export fehlt')
        data=controls(page.find('form',id='main-form'))|fields|{link['id']:link['id'],'main-form':'main-form'}
        body,ctype=self.request(url,data)
        if 'csv' not in ctype: raise SourceError('VVZ lieferte keinen CSV-Export')
        return body
    def component(self,part,target):
        first=BS(self.get(part['vvz_url']),'html.parser')
        sid=semester_picker(first,target)
        u=urlsplit(part['vvz_url']);q=parse_qs(u.query);q['semester']=[sid]
        url=urlunsplit((u.scheme,u.netloc,u.path,urlencode(q,doseq=True),''))
        page=BS(self.get(url),'html.parser');semester_picker(page,target,True)
        group_ids={parse_qs(urlsplit(a['href']).query)['veranstaltung'][0]
                   for a in page.select('a[href*="veranstaltung.html?veranstaltung="]')}
        # Retain recurrence labels as source evidence; exact dates always from CSV.
        series={}
        for wrap in page.select('.moses-calendar-event-wrapper'):
            a=wrap.select_one('a[href*="veranstaltung.html?veranstaltung="]')
            if a:
                gid=parse_qs(urlsplit(a['href']).query)['veranstaltung'][0]
                series.setdefault(gid,[]).append(form_groups(wrap))
        if not group_ids and not any('Liste als Excel-Datei exportieren' in clean(a) for a in page.find_all('a')):
            # Keine Termingruppe und kein Listenexport: Der Bestandteil hat in diesem Semester keine
            # Termine (V-0227). Wahlpflichtmodule werden oft nur im WiSe oder nur im SoSe angeboten;
            # ohne diese Ausnahme meldete der Abruf „VVZ-Export fehlt“ wie bei einem Layoutwechsel.
            # Beides muss fehlen: Fände der Parser nur die Gruppenlinks nicht mehr, gäbe es den
            # Exportlink noch, und der Abruf scheiterte weiter laut statt still „keine Termine“.
            return {**part,'vvz_url':url,'semester_id':sid,'groups':[],'status':'unplanned'},''
        raw=self.export(url,page)
        # Gruppen, deren Buchungen alle ein anderes Semester tragen, fallen heraus (parse_export).
        foreign={}
        bookings=parse_export(raw,target,group_ids,foreign)
        groups={}
        for b in bookings:
            gid=b.pop('group_id')
            group=groups.setdefault(gid,{'id':gid,'name':b.pop('group_name'),
                         'url':ORIGIN+'/moses/verzeichnis/veranstaltungen/veranstaltung.html?veranstaltung='+gid,
                         'series':series.get(gid,[]),'bookings':[]})
            b.pop('group_name',None)
            group['bookings'].append(b)
        for gid in group_ids-groups.keys()-foreign.keys():
            # The source has a group but no bookings: show it as unplanned, never erase it.
            a=page.select_one(f'a[href*="veranstaltung={gid}"]')
            groups[gid]={'id':gid,'name':clean(a),'url':public_url(a['href']),
                         'series':series.get(gid,[]),'bookings':[]}
        result={**part,'vvz_url':url,'semester_id':sid,'groups':list(groups.values()),
                'status':'ok' if bookings else 'unplanned'}
        if foreign:
            # Ausgelassen, aber nicht still: Der Rohstand nennt jede Gruppe mit ihrem Semester.
            result['ausgelassen']=sorted(foreign.values(),key=lambda g:g['id'])
        return result,raw

def parse_export(raw,target,group_ids,foreign=None):
    """Die Buchungen des Zielsemesters. Jede Zeile wird geprüft; es gibt keinen Rückgriff auf ein
    anderes Semester.

    Genau eine Ausnahme, und nur mit `foreign` (ein dict): Eine Gruppe, die die Seite des
    Zielsemesters listet, deren Zeilen aber ALLE ein anderes Semester tragen, wird ausgelassen und
    in `foreign` vermerkt (id, name, semester, bookings). Anlass: Seit dem 29.09.2026 listet MOSES
    im Tutorium von 70450 (WiSe 2026/27) eine Gruppe mit einer einzigen Buchung des SoSe 2026, und
    die alte Regel kippte deshalb das ganze Modul. Freigegeben vom Leit-Agenten am 05.10.2026.
    Weiter ein Fehler: eine Gruppe, die Semester mischt, und ein Export ohne eine einzige Zeile
    des Zielsemesters. Ohne `foreign` gilt die alte, strenge Regel.
    """
    reader=csv.DictReader(io.StringIO(raw),delimiter=';')
    if not reader.fieldnames or set(COLUMNS)-set(reader.fieldnames):
        raise SourceError('CSV-Header unvollständig')
    out=[];seen={};other={}
    for row in reader:
        # Die Semesterprüfung je Zeile. Fremde Zeilen werden mit `foreign` erst gesammelt und am
        # Ende entschieden: nur ganze Gruppen eines fremden Semesters fallen heraus (Docstring).
        if row['Veranstaltung Semester'] != target and foreign is None:
            raise SourceError('Falsches Semester im Export')
        gid=row['Veranstaltung ID'];bid=row['Buchung ID']
        if gid not in group_ids or not gid.isdigit() or not bid.isdigit():
            raise SourceError('Export enthält unbekannte Gruppe/Buchung')
        if row['Veranstaltung Semester'] != target:
            g=other.setdefault(gid,{'id':gid,'name':row['Gruppe/ Planungsgruppe'],'semester':set(),'bookings':set()})
            g['semester'].add(row['Veranstaltung Semester']);g['bookings'].add(bid)
            continue
        try:
            start=datetime.fromisoformat(row['ISO Beginn (Studierende)'])
            end=datetime.fromisoformat(row['ISO Ende (Studierende)'])
        except ValueError as e: raise SourceError('Ungültige ISO-Zeit') from e
        if start>=end: raise SourceError('Terminende liegt vor dem Beginn')
        b={'id':bid,'group_id':gid,'group_name':row['Gruppe/ Planungsgruppe'],
           'start':start.isoformat(),'end':end.isoformat(),'room':row['Ort'],
           'title':row['Veranstaltungsname'],'format':row['Veranstaltungsformat'],
           'number':row['LV-Nummer'],'note':row['Buchungsnotiz'],
           'info':row['Veranstaltung Zusatzinformationen']}
        if bid in seen:
            if seen[bid] != b: raise SourceError('Widersprüchliche doppelte Buchung')
            continue
        seen[bid]=b;out.append(b)
    if other:
        # Kein Zielsemester im ganzen Export, oder eine Gruppe mit Zeilen beider Semester: Fehler.
        if not out or other.keys() & {b['group_id'] for b in out}:
            raise SourceError('Falsches Semester im Export')
        for gid,g in other.items():
            foreign[gid]={'id':gid,'name':g['name'],'semester':', '.join(sorted(g['semester'])),
                          'bookings':len(g['bookings'])}
    return sorted(out,key=lambda b:(b['start'],b['group_id'],b['id']))
