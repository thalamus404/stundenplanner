"""HIS LSF (an der HU Berlin: AGNES): öffentliches Vorlesungsverzeichnis und iCalendar-Export.

Die zweite Quelle neben MOSES (docs/SYSTEM.md §6, Annahme 6). Sie schreibt denselben Rohstand
(docs/ARCHITEKTUR.md §4); welche Quelle ein Semester hat, sagt der Katalog
(`katalog/semester/<id>.json`, Feld `quelle`), kein Code nennt eine Hochschule. Wie die Quelle
gebaut ist und warum es so geht: docs/forschung/hu-biologie.md.

Woher was kommt:
- **Modulknoten** im Vorlesungsverzeichnis (`state=wtree`): die Lehrveranstaltungen eines Moduls.
  Gefunden über die TITEL aus dem Katalog (`vvz_pfad`, `vvz`), nie über Knoten-IDs: Die sind in
  jedem Semester neu.
- **Detailseite** einer Veranstaltung (`publishSubDir=veranstaltung`): Art, Nummer, Semester, SWS,
  Sprache und je Gruppe die Terminzeilen (Tag, Zeit, Rhythmus, Dauer, Raum, Status, Bemerkung,
  „fällt aus am“). Die Zeilen bleiben als `series` erhalten und dienen als Gegenprobe.
- **Termin-IDs je Gruppe** stehen auf keiner Seite. Sie stehen nur im Link „iCalendar Export“ des
  anonymen „Persönlichen Stundenplans“ (vormerken, ohne Login). Je Gruppe wird vorgemerkt und die
  Semesteransicht gelesen; die neu hinzugekommenen Termin-IDs sind die dieser Gruppe.
- **Einzeldaten** kommen allein aus dem iCalendar-Export: Einzeltermine als VEVENT ohne RRULE,
  Serien als RRULE mit EXDATE (vorlesungsfreie Tage, Ausfälle). Die Serie wird nach RFC 5545
  ausgerechnet, in dem Umfang, den LSF schreibt (`expandiere`); jede andere Regel ist ein Fehler,
  keine Schätzung. Termine werden NIE aus Freitext errechnet.

Gegenproben, die einen Fehler werfen statt zu raten:
- Das Semester der Detailseite ist das des Katalogs; der Baum zeigt dasselbe Semester.
- Je Gruppe passen die Terminzeilen der Seite und die VEVENTs des Exports eins zu eins zusammen:
  gleiche Uhrzeit, und die ausgerechneten Termine liegen in der „Dauer“ der Zeile (`_passt`). So
  fällt eine falsch ausgerechnete Serie auf, bevor sie jemand plant.
- Ein Terminstatus außer „findet statt“ ist unbekannt.

Höflichkeit: eine Sitzung je Veranstaltung ohne Login, mindestens 1 s zwischen zwei Anfragen, der
User-Agent nennt das Projekt, nur der Host aus dem Katalog, auch nach Weiterleitungen. Baumseiten
holt ein Lauf einmal (`Client.baum`). „Plan speichern“ und „belegen“ werden nie aufgerufen.

Was an LSF eigen ist (beobachtet an AGNES, 05.10.2026, und in den Tests belegt):
- EXDATE trägt eine Uhrzeit, die nicht zum Termin passt (14:00Z für eine Vorlesung um 08:15):
  verglichen wird nur das Datum.
- UNTIL ist `<letzter Tag>T235900Z`: Der letzte Tag zählt mit; verglichen wird das Datum.
- Eine Zeile ohne Tag und Zeit („nach Vereinbarung“) erscheint als VEVENT ohne DTSTART: Die Gruppe
  bleibt, ohne Termine.
- Die Semesteransicht des Stundenplans muss ausdrücklich verlangt werden (`week=-2`); die Vorgabe
  (Vorlesungszeit) lässt Termine außerhalb der Vorlesungszeit aus dem Export-Link fallen.
"""
from __future__ import annotations

import html as htmllib
import re
import time
from datetime import date, datetime, timedelta
from http.cookiejar import CookieJar
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener

from bs4 import BeautifulSoup as BS

USER_AGENT = 'Stundenplanner/1.0 (+https://github.com/thalamus404/stundenplanner)'

# Kurzformen wie in MOSES, damit die Seite dieselben Kürzel zeigt. Unbekannte Arten bleiben, wie
# LSF sie nennt (die Seite schreibt unbekannte Kürzel aus, DESIGN §5.13).
ARTEN = {'Vorlesung': 'VL', 'Übung': 'UE', 'Seminar': 'SE', 'Praktikum': 'PR', 'Tutorium': 'TUT',
         'Proseminar': 'PS', 'Hauptseminar': 'HS', 'Kolloquium': 'KO', 'Projektseminar': 'PJS',
         'Vorlesung/Übung': 'VL/UE', 'Seminar/Übung': 'SE/UE', 'Exkursion': 'EX'}

RHYTHMEN = {'wöch': 'wöchentlich', '14tgl./1': '14-täglich (1. Woche)', '14tgl./2': '14-täglich (2. Woche)',
            '14tgl.': '14-täglich', 'Einzel': 'Einzeltermin'}

TAGE = {'MO': 0, 'TU': 1, 'WE': 2, 'TH': 3, 'FR': 4, 'SA': 5, 'SU': 6}
# Eine Terminzeile ohne Tag und Zeit („nach Vereinbarung“) exportiert LSF als `DTSTART:T00`.
OHNE_DATUM = re.compile(r'T?0*')
DATUM = re.compile(r'(\d{2})\.(\d{2})\.(\d{4})')


class SourceError(ValueError):
    pass


def clean(node) -> str:
    if node is None:
        return ''
    text = node if isinstance(node, str) else node.get_text(' ', strip=True)
    return ' '.join(text.replace('\xa0', ' ').split())


def _datum(text: str) -> date:
    m = DATUM.search(text)
    if not m:
        raise SourceError('Datum fehlt')
    return date(int(m[3]), int(m[2]), int(m[1]))


# --- Der Client ---------------------------------------------------------------------------------

class Client:
    """Eine LSF-Sitzung ohne Login. `basis` ist die rds-Adresse aus dem Katalog."""

    # Baumseiten eines Laufs, über alle Sitzungen: Die Module eines Plans hängen am selben Pfad,
    # und der soll je Lauf einmal geholt werden, nicht je Modul.
    baum: dict = {}
    # Die Uhr der Höflichkeit gilt für den ganzen Lauf, nicht je Sitzung: Jede Veranstaltung hat
    # eine eigene Sitzung, und eine frische Sitzung darf nicht sofort nach der letzten Anfrage der
    # vorigen fragen (Punkt aed3e76c, „Pause auch zwischen Modulen“).
    letzte: float = 0.0

    def __init__(self, basis: str, delay: float = 1.0):
        u = urlsplit(basis)
        if u.scheme != 'https' or not u.netloc or u.query:
            raise SourceError('LSF-Basis muss eine https-Adresse ohne Parameter sein')
        self.basis = basis
        self.host = u.netloc
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))
        self.delay = delay

    def url(self, params: dict) -> str:
        return self.basis + '?' + urlencode(params)

    def request(self, url: str, data=None) -> str:
        if urlsplit(url).netloc != self.host:
            raise SourceError('Unerwarteter LSF-Host')
        time.sleep(max(0.0, self.delay - (time.monotonic() - Client.letzte)))
        body = urlencode(data, doseq=True).encode() if data is not None else None
        try:
            with self.opener.open(Request(url, data=body, headers={'User-Agent': USER_AGENT}), timeout=45) as r:
                if urlsplit(r.url).netloc != self.host:
                    raise SourceError('Unerwartete Weiterleitung')
                return r.read().decode(r.headers.get_content_charset() or 'utf-8', 'replace')
        finally:
            Client.letzte = time.monotonic()

    def get(self, url: str) -> str:
        return self.request(url)

    def post(self, url: str, data: dict) -> str:
        return self.request(url, data)

    def baumseite(self, url: str) -> str:
        if url not in Client.baum:
            Client.baum[url] = self.get(url)
        return Client.baum[url]


# --- Das Vorlesungsverzeichnis: vom Titel zum Modulknoten ---------------------------------------

def baumlinks(html: str):
    """Die Links des Baums: `[(pfad, text)]` und die Semesterschlüssel ihrer Parameter.

    Ein Knoten heißt in LSF `root1<semester>=<id>|<id>|…`; der Pfad ist die Liste der IDs.
    """
    links, semester = [], set()
    for a in BS(html, 'html.parser').find_all('a', href=True):
        q = parse_qs(urlsplit(a['href']).query)
        if q.get('state') != ['wtree']:
            continue
        roots = [k for k in q if re.fullmatch(r'root1\d+', k)]
        if len(roots) != 1:
            continue
        semester.add(roots[0][len('root1'):])
        text = clean(a)
        if text:
            links.append((tuple(q[roots[0]][0].split('|')), text))
    return links, semester


def knoten_url(client, semester: str, pfad) -> str:
    return client.url({'state': 'wtree', 'search': '1', 'trex': 'step',
                       'root1' + semester: '|'.join(pfad), 'P.vx': 'kurz'})


def _kind(links, eltern, passt, was: str):
    kinder = {p for p, t in links if len(p) == len(eltern) + 1 and p[:-1] == eltern and passt(t)}
    if len(kinder) != 1:
        raise SourceError(f'Vorlesungsverzeichnis: „{was}“ {"fehlt" if not kinder else "ist mehrdeutig"}')
    return kinder.pop()


def _baumseite(client, url: str, semester: str):
    links, sem = baumlinks(client.baumseite(url))
    if sem != {semester}:
        raise SourceError('Vorlesungsverzeichnis zeigt ein anderes Semester')
    return links


def modulknoten(client, semester: str, pfad, bezeichnung: str):
    """Der Knoten `[<bezeichnung>] <Titel>` unter dem Pfad aus Titeln. Gibt (url, titel, html)."""
    start = client.url({'state': 'wtree', 'search': '1', 'category': 'veranstaltung.browse'})
    links = _baumseite(client, start, semester)
    wurzeln = {p for p, _ in links if len(p) == 1}
    if len(wurzeln) != 1:
        raise SourceError('Wurzel des Vorlesungsverzeichnisses nicht erkannt')
    knoten = wurzeln.pop()
    for titel in pfad:
        knoten = _kind(links, knoten, lambda t, s=titel: t == s, titel)
        links = _baumseite(client, knoten_url(client, semester, knoten), semester)
    marke = f'[{bezeichnung}]'
    knoten = _kind(links, knoten, lambda t: t.startswith(marke), marke)
    titel = next(t for p, t in links if p == knoten)[len(marke):].strip()
    url = knoten_url(client, semester, knoten)
    return url, titel, client.baumseite(url)


def veranstaltungen(html: str):
    """Die Veranstaltungen eines Modulknotens: `[{publishid, nummer, titel, art, format}]`."""
    out = []
    for table in BS(html, 'html.parser').find_all('table'):
        kopf = [clean(th) for th in table.find_all('th')]
        if kopf[:3] != ['Vst.-Nr.', 'Veranstaltung', 'Vst.-Art']:
            continue
        for tr in table.find_all('tr'):
            tds = tr.find_all('td', recursive=False)
            if not tds:
                continue
            a = tds[1].find('a', href=re.compile(r'publishSubDir=veranstaltung')) if len(tds) > 3 else None
            if not a:
                raise SourceError('Unbekanntes Layout der Veranstaltungsliste')
            pid = parse_qs(urlsplit(a['href']).query).get('publishid', [''])[0]
            if not pid.isdigit():
                raise SourceError('Veranstaltung ohne publishid')
            out.append({'publishid': pid, 'nummer': clean(tds[0]), 'titel': clean(a),
                        'art': clean(tds[2]), 'format': clean(tds[3])})
    if not out:
        raise SourceError('Modulknoten ohne Veranstaltungen')
    return out


# --- Die Detailseite einer Veranstaltung -------------------------------------------------------

def detail_url(client, publishid: str) -> str:
    return client.url({'state': 'verpublish', 'status': 'init', 'vmfile': 'no', 'publishid': publishid,
                       'moduleCall': 'webInfo', 'publishConfFile': 'webInfo', 'publishSubDir': 'veranstaltung'})


def _grunddaten(table) -> dict:
    """th → Text der folgenden td. Ein th mit rowspan nimmt die td der folgenden Zeilen mit
    (so steht in AGNES die Belegungsfrist unter ihrer Überschrift)."""
    out, rows = {}, table.find_all('tr')
    for i, tr in enumerate(rows):
        for th in tr.find_all('th'):
            teile = []
            for sib in th.find_next_siblings():
                if sib.name == 'th':
                    break
                teile.append(clean(sib))
            for extra in rows[i + 1:i + int(th.get('rowspan', 1) or 1)]:
                teile += [clean(td) for td in extra.find_all('td')]
            out.setdefault(clean(th), ' '.join(t for t in teile if t))
    return out


def detail(html: str, publishid: str) -> dict:
    """Grunddaten, Gruppen mit Terminzeilen, die Werte der Vormerk-Kästchen und die Freitexte."""
    soup = BS(html, 'html.parser')
    grund = next((_grunddaten(t) for t in soup.find_all('table')
                  if clean(t.find('caption')) == 'Grunddaten'), None)
    if not grund or 'Veranstaltungsart' not in grund or 'Semester' not in grund:
        raise SourceError('Grunddaten fehlen')
    gruppen = []
    for table in soup.find_all('table'):
        cap = clean(table.find('caption'))
        m = re.fullmatch(r'Gruppe (\d+)', cap)
        if not m:
            continue
        kopf = [clean(th) for th in table.find_all('th')]
        if kopf[:4] != ['Tag', 'Zeit', 'Rhythmus', 'Dauer'] or 'Status' not in kopf:
            raise SourceError('Unbekanntes Layout der Terminzeilen')
        zeilen = []
        for tr in table.find_all('tr'):
            tds = tr.find_all('td', recursive=False)
            if not tds:
                continue
            if len(tds) != len(kopf):
                raise SourceError('Unbekanntes Layout der Terminzeilen')
            zeilen.append({k: clean(td) for k, td in zip(kopf, tds)})
        gruppen.append({'nummer': m[1], 'zeilen': zeilen})
    werte = sorted({i.get('value') for i in soup.find_all('input', attrs={'name': f'add.{publishid}'})},
                   key=lambda v: int(v) if str(v).isdigit() else 0)
    if [g['nummer'] for g in gruppen] != werte:
        raise SourceError('Gruppen und Vormerk-Kästchen passen nicht zusammen')
    inhalt = next((t for t in soup.find_all('table') if clean(t.find('caption')) == 'Inhalt'), None)
    texte = {}
    if inhalt:
        for tr in inhalt.find_all('tr'):
            th, td = tr.find('th'), tr.find('td')
            if th and td:
                # Zeilen bleiben getrennt: schwaerzen() soll je Zeile entscheiden, nicht einen
                # ganzen Kommentar wegen eines Passworts in seiner letzten Zeile verlieren.
                texte[clean(th)] = td.get_text('\n', strip=True)
    return {'grund': grund, 'gruppen': gruppen, 'texte': texte}


# --- Freitext: nur geschwärzt ins öffentliche Lesemodell --------------------------------------

GEHEIM = re.compile(r'passw|kennw|schlüssel|schluessel|\bpw\b|password|passphrase|zugangscode|'
                    r'enrol?ment|\bkey\b|\bcode\s*:|\btoken\b', re.I)
MAIL = re.compile(r'[\w.+-]+@[\w-]+(\.[\w-]+)+')


def schwaerzen(text: str, laenge: int = 1500) -> str:
    """Freitext aus LSF für eine öffentliche Seite.

    Anlass (05.10.2026): AGNES veröffentlicht in Kommentaren Moodle-Einschreibeschlüssel und
    Kurspasswörter. Wir tragen sie nicht weiter: Jeder Satz, der nach Zugangsdaten klingt, wird
    ersetzt, jede E-Mail-Adresse auch. Lieber ein Satz zu viel geschwärzt als ein Schlüssel
    veröffentlicht. Was fehlt, steht in AGNES; die Seite verlinkt die Veranstaltung.
    """
    out = []
    for s in re.split(r'\n+|(?<=[.!?])\s+', text or ''):
        s = clean(s)
        if not s:
            continue
        if GEHEIM.search(s):
            if not out or out[-1] != '[Zugangsdaten nur in AGNES]':
                out.append('[Zugangsdaten nur in AGNES]')
            continue
        out.append(MAIL.sub('[E-Mail in AGNES]', s))
    text = ' '.join(out)
    return text if len(text) <= laenge else text[:laenge - 1].rstrip() + '…'


def hat_eigene_termine(text: str) -> bool:
    """Nennt ein Freitext selbst mehrere Daten? Dann warnt die Seite, dass er vom Plan abweichen
    kann. Gerechnet wird damit nichts (Termine nie aus Freitext)."""
    return len(re.findall(r'\b\d{1,2}\.\d{1,2}\.(?:\d{2,4})?', text)) >= 3


# --- Der Stundenplan: Termin-IDs je Gruppe -----------------------------------------------------

def termine_im_plan(html: str):
    """Termin-IDs aus dem iCalendar-Link des Stundenplans; prüft, dass die Semesteransicht gilt."""
    soup = BS(html, 'html.parser')
    woche = soup.find('select', attrs={'name': 'week'})
    gewaehlt = woche.find('option', selected=True) if woche else None
    if not gewaehlt or gewaehlt.get('value') != '-2':
        raise SourceError('Stundenplan zeigt nicht die Semesteransicht')
    ids = set()
    for a in soup.find_all('a', href=True):
        q = parse_qs(urlsplit(a['href']).query)
        if q.get('moduleCall') == ['iCalendarPlan']:
            for t in q.get('termine', [''])[0].split(','):
                if t:
                    if not t.isdigit():
                        raise SourceError('Ungültige Termin-ID')
                    ids.add(t)
    return ids


def termine_je_gruppe(client, publishid: str, gruppen) -> dict:
    """Je Gruppennummer die Termin-IDs: nacheinander vormerken, die neuen IDs gehören zur Gruppe."""
    plan = client.url({'state': 'wplan', 'week': '-2', 'act': 'show', 'pool': '', 'show': 'plan',
                       'P.vx': 'kurz', 'vx': 'kurz', 'fil': 'plu', 'P.subc': 'plan'})
    vormerken = client.url({'state': 'wplan', 'search': 'ver', 'act': 'add'})
    bisher, out = set(), {}
    for nummer in gruppen:
        client.post(vormerken, {f'add.{publishid}': nummer})
        jetzt = termine_im_plan(client.get(plan))
        if not bisher <= jetzt:
            raise SourceError('Stundenplan hat vorgemerkte Termine verloren')
        out[nummer] = jetzt - bisher
        bisher = jetzt
    return out


def ical_url(client, termine) -> str:
    return client.url({'state': 'verpublish', 'status': 'transform', 'vmfile': 'no',
                       'termine': ','.join(sorted(termine, key=int)), 'moduleCall': 'iCalendarPlan',
                       'publishConfFile': 'reports', 'publishSubDir': 'veranstaltung'})


# --- iCalendar ---------------------------------------------------------------------------------

def _ical_text(value: str) -> str:
    return re.sub(r'\\([\\;,nN])', lambda m: '\n' if m[1] in 'nN' else m[1], value)


def ereignisse(text: str):
    """Die VEVENTs eines iCalendar-Texts: je Eigenschaft `(parameter, wert)`."""
    if 'BEGIN:VCALENDAR' not in text:
        raise SourceError('iCalendar-Export fehlt')
    zeilen = []
    for raw in text.replace('\r\n', '\n').split('\n'):
        if raw[:1] in (' ', '\t') and zeilen:
            zeilen[-1] += raw[1:]
        else:
            zeilen.append(raw)
    out, cur = [], None
    for z in zeilen:
        if z == 'BEGIN:VEVENT':
            cur = {}
        elif z == 'END:VEVENT':
            out.append(cur)
            cur = None
        elif cur is not None and ':' in z:
            name, wert = z.split(':', 1)
            key, *params = name.split(';')
            cur[key.upper()] = (dict(p.split('=', 1) for p in params if '=' in p), wert)
    return out


def _zeit(eigenschaft):
    params, wert = eigenschaft
    if params.get('TZID', 'Europe/Berlin') != 'Europe/Berlin' or wert.endswith('Z'):
        raise SourceError('Unerwartete Zeitzone im iCalendar-Export')
    try:
        return datetime.strptime(wert, '%Y%m%dT%H%M%S')
    except ValueError as exc:
        raise SourceError('Ungültige Zeit im iCalendar-Export') from exc


def _tag(wert: str) -> date:
    """Nur das Datum eines DATE- oder DATE-TIME-Werts (UNTIL, EXDATE; Begründung im Modulkopf)."""
    m = re.fullmatch(r'(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?', wert.strip())
    if not m:
        raise SourceError('Ungültiges Datum im iCalendar-Export')
    return date(int(m[1]), int(m[2]), int(m[3]))


def expandiere(ev) -> list:
    """Die Beginnzeiten eines VEVENT nach RFC 5545, ohne EXDATE. Ohne DTSTART: keine.

    Unterstützt ist, was LSF schreibt: FREQ=WEEKLY oder DAILY, INTERVAL, UNTIL oder COUNT,
    BYDAY als einfache Wochentage, WKST=MO. Alles andere wirft: lieber kein Modul als ein Plan mit
    falsch geratenen Terminen.
    """
    if 'DTSTART' not in ev or OHNE_DATUM.fullmatch(ev['DTSTART'][1]):
        return []
    start = _zeit(ev['DTSTART'])
    if 'RRULE' not in ev:
        return [start]
    teile = dict(p.split('=', 1) for p in ev['RRULE'][1].split(';') if '=' in p)
    if set(teile) - {'FREQ', 'UNTIL', 'INTERVAL', 'BYDAY', 'COUNT', 'WKST'} or teile.get('WKST', 'MO') != 'MO':
        raise SourceError('Unbekannte Wiederholungsregel')
    try:
        schritt = int(teile.get('INTERVAL') or 1)
        anzahl = int(teile['COUNT']) if teile.get('COUNT') else None
    except ValueError as exc:
        raise SourceError('Unbekannte Wiederholungsregel') from exc
    bis = _tag(teile['UNTIL']) if teile.get('UNTIL') else None
    if schritt < 1 or (bis is None and anzahl is None):
        raise SourceError('Wiederholungsregel ohne Ende')
    tage = [d for d in teile.get('BYDAY', '').split(',') if d]
    if any(d not in TAGE for d in tage):
        raise SourceError('Unbekannte Wiederholungsregel')
    freq = teile.get('FREQ')
    if freq == 'WEEKLY':
        wochentage = sorted({TAGE[d] for d in tage} or {start.weekday()})
        montag = start.date() - timedelta(days=start.weekday())
        kandidaten = (montag + timedelta(weeks=k * schritt, days=d) for k in range(600) for d in wochentage)
    elif freq == 'DAILY' and not tage:
        kandidaten = (start.date() + timedelta(days=k * schritt) for k in range(4000))
    else:
        raise SourceError('Unbekannte Wiederholungsregel')
    out = []
    for tag in kandidaten:
        if tag < start.date():
            continue
        if (bis and tag > bis) or (anzahl is not None and len(out) >= anzahl):
            return out
        out.append(datetime.combine(tag, start.time()))
    raise SourceError('Wiederholungsregel ohne Ende')


def ausfaelle(ev) -> set:
    """Die Tage aus EXDATE (nur das Datum; LSF hängt ein Komma an und eine unpassende Uhrzeit)."""
    if 'EXDATE' not in ev:
        return set()
    return {_tag(w) for w in ev['EXDATE'][1].split(',') if w.strip()}


# --- Zusammensetzen ----------------------------------------------------------------------------

def _zeilen_schluessel(z: dict):
    """(Beginn der Dauer, Ende der Dauer, Beginn, Ende) einer Terminzeile, (None, …) ohne Zeit."""
    zeit = re.fullmatch(r'(\d{2}:\d{2}) bis (\d{2}:\d{2})', z.get('Zeit', ''))
    daten = DATUM.findall(z.get('Dauer', ''))
    if not zeit and not daten:
        return (None, None, None, None)
    if not zeit or not daten or len(daten) > 2:
        raise SourceError('Unlesbare Terminzeile')
    tage = [date(int(j), int(m), int(t)) for t, m, j in daten]
    return (tage[0], tage[-1], zeit[1], zeit[2])


def _abstand(ev) -> int:
    """Tage zwischen zwei Terminen einer Serie (1 für einen Einzeltermin)."""
    if 'RRULE' not in ev:
        return 1
    teile = dict(p.split('=', 1) for p in ev['RRULE'][1].split(';') if '=' in p)
    schritt = int(teile.get('INTERVAL') or 1)
    return schritt * 7 if teile.get('FREQ') == 'WEEKLY' else schritt


def _passt(zeile, ev, beginne) -> bool:
    """Gehört dieses VEVENT zu dieser Terminzeile der Seite?

    Gleiche Uhrzeit, und die Termine liegen in der „Dauer“ der Zeile: der erste innerhalb eines
    Abstands nach ihrem Beginn, der letzte innerhalb eines Abstands vor ihrem Ende. Genauer geht
    es nicht, denn LSF zeigt bei „14tgl./2“ den Beginn des Zeitraums, nicht den ersten Termin
    (BioB 4 SE: Dauer ab 13.10.2026, erster Termin 20.10.2026; BioB 1 SE Gruppe 4: Dauer ab
    16.11.2026, erster Termin 16.11.2026).
    """
    if not beginne:
        return zeile == (None, None, None, None)
    if zeile[0] is None:
        return False
    ende = _zeit(ev['DTEND']) if 'DTEND' in ev else None
    if ende is None or ende <= beginne[0]:
        raise SourceError('Terminende liegt vor dem Beginn')
    fenster = timedelta(days=_abstand(ev))
    erster, letzter = beginne[0].date(), beginne[-1].date()
    return (zeile[2] == beginne[0].strftime('%H:%M') and zeile[3] == ende.strftime('%H:%M')
            and zeile[0] <= erster < zeile[0] + fenster and zeile[1] - fenster < letzter <= zeile[1])


def _zuordnung(zeilen, evs):
    """Je VEVENT die passende Terminzeile, so dass jede Zeile genau ein VEVENT hat (bipartites
    Matching, Kuhn). Gibt es keine solche Zuordnung, passt der Export nicht zur Seite."""
    kanten = [[j for j, z in enumerate(zeilen) if _passt(z, ev, b)] for ev, b in evs]
    belegt = {}

    def suche(i, gesehen):
        for j in kanten[i]:
            if j not in gesehen:
                gesehen.add(j)
                if j not in belegt or suche(belegt[j], gesehen):
                    belegt[j] = i
                    return True
        return False

    if len(zeilen) != len(evs) or not all(suche(i, set()) for i in range(len(evs))):
        raise SourceError('iCalendar-Export passt nicht zur Seite')
    return {i: j for j, i in belegt.items()}


def _serie(z: dict) -> dict:
    rh = z.get('Rhythmus', '')
    text = ', '.join(t for t in (f"{z.get('Tag', '')} {z.get('Zeit', '')}".strip(' -.'),
                                 RHYTHMEN.get(rh, rh), z.get('Dauer', '')) if t and t != 'bis')
    out = {'Datum/Uhrzeit': text}
    for k in ('Rhythmus', 'Raum', 'Status', 'Bemerkung', 'fällt aus am', 'Max. Teilnehmer/-innen'):
        if z.get(k):
            out[k] = schwaerzen(z[k], 300) if k == 'Bemerkung' else z[k]
    return out


def gruppen_buchungen(gruppen, je_gruppe: dict, evs: dict, publishid: str, titel: str, nummer: str):
    """Die Gruppen des Rohstands mit ihren Buchungen; prüft Seite gegen Export (Modulkopf).

    Die Daten kommen aus dem Export (Einzeltermine, Serie minus EXDATE). Die Seite liefert die
    Gegenprobe und „fällt aus am“, das zusätzlich zu EXDATE gilt.
    """
    out = []
    for g in gruppen:
        ids = sorted(je_gruppe.get(g['nummer'], set()), key=int)
        for z in g['zeilen']:
            if z.get('Status') not in ('findet statt', ''):
                raise SourceError('Unbekannter Terminstatus')
        if any(i not in evs for i in ids):
            raise SourceError('iCalendar-Export passt nicht zur Seite')
        reihe = [(evs[i], expandiere(evs[i])) for i in ids]
        zu = _zuordnung([_zeilen_schluessel(z) for z in g['zeilen']], reihe)
        buchungen = []
        for n, (tid, (ev, beginne)) in enumerate(zip(ids, reihe)):
            if not beginne:
                continue
            zeile = g['zeilen'][zu[n]]
            dauer = _zeit(ev['DTEND']) - _zeit(ev['DTSTART'])
            weg = ausfaelle(ev) | {date(int(j), int(m), int(t))
                                   for t, m, j in DATUM.findall(zeile.get('fällt aus am', ''))}
            beschreibung = BS(_ical_text(ev.get('DESCRIPTION', ({}, ''))[1]), 'html.parser').get_text(' ')
            teile = [clean(t) for t in beschreibung.split(' | ')]
            info = '; '.join(t for t in teile if t.startswith('Format:'))
            notiz = schwaerzen(' '.join(t for t in teile if t and not t.startswith('Format:')), 300)
            raum = clean(_ical_text(ev.get('LOCATION', ({}, ''))[1]))
            for b in beginne:
                if b.date() in weg:
                    continue
                buchungen.append({'id': f'{tid}-{b:%Y%m%d}', 'start': b.isoformat(),
                                  'end': (b + dauer).isoformat(), 'room': raum, 'title': titel,
                                  'format': clean(_ical_text(ev.get('CATEGORIES', ({}, ''))[1])),
                                  'number': nummer, 'note': notiz, 'info': info})
        buchungen.sort(key=lambda b: (b['start'], b['id']))
        out.append({'id': g['nummer'], 'name': f"Gruppe {g['nummer']}", 'url': None,
                    'series': [_serie(z) for z in g['zeilen']], 'bookings': buchungen})
    return out


def bestandteil(client, modul: str, v: dict, ziel: str, quelle: dict, bereich):
    """Ein Bestandteil des Rohstands aus einer Veranstaltung (eigene Sitzung, `client`)."""
    url = detail_url(client, v['publishid'])
    d = detail(client.get(url), v['publishid'])
    grund = d['grund']
    if grund['Semester'] != ziel:
        raise SourceError('Falsches Semester auf der Detailseite')
    je_gruppe = termine_je_gruppe(client, v['publishid'], [g['nummer'] for g in d['gruppen']])
    alle = set().union(*je_gruppe.values()) if je_gruppe else set()
    evs = {}
    if alle:
        for ev in ereignisse(client.get(ical_url(client, alle))):
            uid = ev.get('UID', ({}, ''))[1]
            if not uid.startswith(v['publishid']) or uid[len(v['publishid']):] not in alle:
                raise SourceError('iCalendar-Export enthält einen fremden Termin')
            if uid[len(v['publishid']):] in evs:
                raise SourceError('iCalendar-Export enthält einen Termin doppelt')
            evs[uid[len(v['publishid']):]] = ev
    nummer = grund.get('Veranstaltungsnummer') or v['nummer']
    gruppen = gruppen_buchungen(d['gruppen'], je_gruppe, evs, v['publishid'], v['titel'], nummer)
    for g in gruppen:
        g['url'] = url
    art = grund['Veranstaltungsart']
    try:
        sws = float(grund.get('SWS', '').replace(',', '.'))
    except ValueError:
        sws = None
    teil = {'id': f"{modul}:{v['publishid']}", 'lvvid': v['publishid'], 'title': v['titel'],
            'type': ARTEN.get(art, art), 'number': nummer, 'sws': sws, 'cycle': grund.get('Rhythmus', ''),
            'language': grund.get('Sprache', ''), 'section': bereich, 'required': bereich == 'Pflichtbereich',
            'vvz_url': url, 'isis_url': None, 'semester_id': quelle.get('semester'),
            'status': 'ok' if any(g['bookings'] for g in gruppen) else 'unplanned', 'groups': gruppen}
    return teil, hinweis(art, nummer, grund, d['texte'])


def hinweis(art: str, nummer: str, grund: dict, texte: dict):
    """Ein Eintrag für `notes` des Moduls: Belegung und Freitexte, geschwärzt (`schwaerzen`)."""
    teile = []
    for k, v in grund.items():
        if k.startswith('Belegungsfrist') and v:
            teile.append(clean(f'{k}: {v}').replace(' aktuell', ''))
    for k in ('Wichtige Änderungen',):
        if grund.get(k):
            teile.append(f'{k}: {grund[k]}')
    for k, v in texte.items():
        if v:
            teile.append(f'{k}: {v}')
    if not teile:
        return None
    warnung = ('Achtung: Der Freitext in AGNES nennt eigene Termine. Sie können von den Terminen '
               'im Plan abweichen. ') if any(hat_eigene_termine(t) for t in teile) else ''
    text = schwaerzen(' · '.join(schwaerzen(t, 100000) for t in teile), 1500 - len(warnung))
    return f'{art} {nummer}', warnung + text


def hole_modul(client, nummer: str, quelle: dict, angabe: dict, neue_sitzung=None) -> dict:
    """Ein Modul aus LSF. `client` sucht den Modulknoten; jede Veranstaltung bekommt eine eigene
    Sitzung (`neue_sitzung()`), denn der vorgemerkte Stundenplan hängt an der Sitzung. Wirft, wenn
    eine Veranstaltung scheitert: Ein halbes Modul wird nie geschrieben (wie bei MOSES)."""
    ziel = quelle['label']
    neue_sitzung = neue_sitzung or (lambda: Client(quelle['basis']))
    url, titel, html = modulknoten(client, quelle['semester'], angabe['vvz_pfad'], angabe['vvz'])
    teile, gleich = [], {}
    for v in veranstaltungen(html):
        teil, h = bestandteil(neue_sitzung(), nummer, v, ziel, quelle, angabe.get('bereich'))
        teile.append(teil)
        if h:
            # Derselbe Kommentar steht in AGNES oft an jeder Veranstaltung des Moduls: einmal zeigen.
            gleich.setdefault(h[1], []).append(h[0])
    notes = {', '.join(namen): text for text, namen in gleich.items()}
    return {'number': nummer, 'title': titel, 'version': None, 'valid_from': None, 'valid_to': None,
            'valid_versions': [], 'url': url, 'isis_url': None, 'notes': notes,
            'components': teile, 'semester': ziel}
