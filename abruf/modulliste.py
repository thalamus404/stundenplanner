"""Die Modulliste eines Studiengangs aus dem Modultransfersystem (MTS) von MOSES, öffentlich.

    python3 abruf/modulliste.py --studiengang 121 --stupo 24980 --liste 77 --aus <datei.json>

Warum (V-0227, 05.10.2026): Für das 1. Fachsemester reicht eine Liste von Hand (fünf Pflichtmodule).
Ab dem 3. Fachsemester kommen Wahlpflichtbereiche dazu, und die Vertiefungen allein haben über 100
Module. Die schreibt niemand fehlerfrei ab. MOSES zeigt sie auf der Studiengangsseite
(`modultransfersystem/studiengaenge/anzeigen.html?studiengang=<id>&mkg=<stupo>&semester=<liste>`)
als Baum der Studiengangsbereiche; wählt man einen Bereich, liefert ein JSF-Ajax-Aufruf seine
Modulzuordnungen (Name, Modulnummer, Version, LP, benotet, Prüfungsform, Turnus, Gewicht) und
seine „Regeln zum Bestehen“ (z. B. „mindestens 6 Leistungspunkte“). Diese Datei liest beides.

Was MOSES dort NICHT sagt: in welchem Fachsemester ein Modul empfohlen ist. Das steht nur im
exemplarischen Studienverlaufsplan (Anlage 2 der StuPO, oft als Bild). Der Katalog
(`katalog/studiengaenge/`) bleibt deshalb die Stelle, an der ein Mensch Pflichtmodule und
Wahlpflichtbereiche einem Fachsemester zuordnet; die Modullisten der Bereiche kommen von hier.

Wie der Baum gelesen wird: Die Seite rendert nur die erste Ebene; das Aufklappen per Ajax
(`<baum>_expand`) antwortet in dieser PrimeFaces-Fassung mit dem unveränderten Baum. Die Auswahl
eines Knotens per Zeilenschlüssel (`0_1_4`) funktioniert dagegen auf jeder Tiefe, auch ungerendert.
Deshalb geht der Abruf den Baum der Tiefe nach ab und probiert je Knoten die Kinder `<rk>_0`,
`<rk>_1`, … bis eine Auswahl leer zurückkommt. Kosten: je Bereich zwei Anfragen.

Höflich wie `moses.py`: eine Sitzung ohne Login, Abstand zwischen Anfragen (Vorgabe 1 s), nur der
MOSES-Host, keine Sitzungskennung in der Ausgabe.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moses  # noqa: E402
from bs4 import BeautifulSoup as BS  # noqa: E402

SEITE = moses.ORIGIN + '/moses/modultransfersystem/studiengaenge/anzeigen.html'
# Die Spalten der Modulzuordnungen, wie MOSES sie am 05.10.2026 beschriftet. Fehlt eine, hat sich
# das Layout geändert: dann aufhören, nicht raten (wie module_parts in moses.py).
SPALTEN = {'Name:': 'titel', '#M': 'nummer', '#V': 'version', 'LP': 'lp', 'benotet': 'benotet',
           'Prüfungsform': 'pruefungsform', 'Turnus': 'turnus', 'Gewicht*': 'gewicht'}
TIEFE = 6        # tiefer verschachtelt ist kein Studiengang; schützt vor einer Endlosschleife
KINDER = 40      # höchstens so viele Unterbereiche je Bereich


def adresse(studiengang, stupo, liste):
    return f'{SEITE}?studiengang={int(studiengang)}&mkg={int(stupo)}&semester={int(liste)}'


def _text(node):
    return moses.clean(node)


def kopf(html):
    """Studiengang, StuPO und Modulliste der Seite, dazu die Zeilen der ersten Baumebene."""
    soup = BS(html, 'html.parser')
    felder = moses.form_groups(soup)
    auswahl = {}
    for sel in soup.find_all('select'):
        label = sel.find_previous('label')
        opt = sel.find('option', selected=True)
        if label and opt is not None and opt.has_attr('value'):
            auswahl[_text(label)] = {'moses_id': int(opt['value']), 'label': _text(opt)}
    if 'Studien- und Prüfungsordnung' not in auswahl or 'Modulliste' not in auswahl:
        raise moses.SourceError('Studiengangsseite ohne gewählte StuPO oder Modulliste')
    baum = soup.select_one('div.ui-treetable')
    if not baum or not baum.get('id'):
        raise moses.SourceError('Studiengangsaufbau fehlt')
    h2 = soup.select_one(f'form#{baum["id"].split(":")[0]} h2') or soup.find('h2')
    name = None
    if h2:
        h2 = BS(str(h2), 'html.parser')
        for small in h2.find_all('small'):
            small.extract()
        name = _text(h2) or None
    return soup, baum['id'], {
        'name': name, 'kurz': felder.get('Kurzname'),
        'abschluss': felder.get('Abschlussart'), 'turnus': felder.get('Turnus'),
        'stupo': auswahl['Studien- und Prüfungsordnung'], 'liste': auswahl['Modulliste']}


def bereich(fragment):
    """Ein gewählter Studiengangsbereich: Name, Module, Regeln, LP-Grenzen. None, wenn leer."""
    soup = BS(fragment, 'html.parser')
    h3 = soup.find('h3')
    if not h3:
        return None
    small = h3.find('small')
    liste = _text(small) if small else None
    if small:
        small.extract()
    out = {'name': _text(h3), 'liste': liste, 'module': [], 'regeln': [],
           'lp_min': None, 'lp_max': None}
    for table in soup.select('table'):
        heads = [_text(th) for th in table.select('thead th')]
        if '#M' not in heads:
            continue
        if set(SPALTEN) - set(heads):
            raise moses.SourceError('Unbekanntes Layout der Modulzuordnungen')
        for row in table.select('tbody tr'):
            cells = row.find_all('td', recursive=False)
            if len(cells) == 1 and not row.select_one('a'):
                continue  # „Keine Einträge“
            if len(cells) != len(heads):
                raise moses.SourceError('Unbekanntes Layout der Modulzuordnungen')
            d = {SPALTEN[h]: _text(c) for h, c in zip(heads, cells) if h in SPALTEN}
            if not re.fullmatch(r'\d{3,8}', d['nummer']) or not d['version'].isdigit():
                raise moses.SourceError('Modulzuordnung ohne Modulnummer/Version')
            link = cells[0].select_one('a[href]')
            out['module'].append({
                'nummer': d['nummer'], 'version': int(d['version']), 'titel': d['titel'],
                'lp': _zahl(d['lp']), 'benotet': d['benotet'], 'pruefungsform': d['pruefungsform'],
                'turnus': d['turnus'], 'gewicht': d['gewicht'],
                'url': moses.public_url(urljoin(moses.ORIGIN, link['href'])) if link else None})
    kopfzeile = soup.find(string=re.compile('Regeln zum Bestehen'))
    if kopfzeile:
        block = kopfzeile.find_parent(class_='row') or kopfzeile.parent
        for li in block.select('li'):
            satz = _text(li)
            out['regeln'].append(satz)
            m = re.search(r'(mindestens|höchstens) (\d+(?:,\d+)?) Leistungspunkte', satz)
            if m:
                out['lp_min' if m[1] == 'mindestens' else 'lp_max'] = _zahl(m[2])
    return out


def _zahl(text):
    try:
        f = float(str(text).replace(',', '.'))
    except ValueError:
        return None
    return int(f) if f.is_integer() else f


class Seite:
    """Eine Studiengangsseite in einer MOSES-Sitzung: wählt Knoten per Ajax aus."""

    def __init__(self, client, url):
        self.client = client
        html = client.get(url)
        self.soup, self.baum, self.kopf = kopf(html)
        self.form_id = self.baum.split(':')[0]
        form = self.soup.find('form', id=self.form_id)
        if not form or not form.get('action'):
            raise moses.SourceError('Formular des Studiengangsaufbaus fehlt')
        self.action = urljoin(moses.ORIGIN, form['action'])
        if urlsplit(self.action).netloc != urlsplit(moses.ORIGIN).netloc:
            raise moses.SourceError('Unerwarteter MOSES-Host')

    def waehle(self, rk):
        """Den Bereich mit Zeilenschlüssel `rk` (z. B. "0_1_4") auswählen; None, wenn es ihn nicht gibt."""
        data = moses.controls(self.soup.find('form', id=self.form_id))
        ziel = self.form_id + ':studiengangsbereich'
        data.update({self.form_id: self.form_id, 'jakarta.faces.partial.ajax': 'true',
                     'jakarta.faces.source': self.baum, 'jakarta.faces.partial.execute': self.baum,
                     'jakarta.faces.partial.render': ziel, 'jakarta.faces.behavior.event': 'select',
                     'jakarta.faces.partial.event': 'select',
                     self.baum + '_instantSelection': rk, self.baum + '_selection': rk})
        body, _ = self.client.request(self.action, data, True)
        if '<error>' in body or '<redirect' in body:
            raise moses.SourceError('Studiengangsaufbau: Auswahl wurde nicht verarbeitet')
        root = ET.fromstring(body)
        fragment = ''
        for e in root.iter('update'):
            eid = e.get('id', '')
            if 'ViewState' in eid:
                for inp in self.soup.find_all('input', attrs={'name': 'jakarta.faces.ViewState'}):
                    inp['value'] = e.text or ''
            elif eid == ziel:
                fragment = e.text or ''
        return bereich(fragment)


def lies_baum(seite, rk='0', tiefe=0, log=None):
    """Der Bereich `rk` mit allen Unterbereichen, der Tiefe nach."""
    b = seite.waehle(rk)
    if b is None:
        return None
    b['schluessel'] = rk
    b['bereiche'] = []
    if log:
        log(f'  {"  " * tiefe}{b["name"]}: {len(b["module"])} Module'
            + (f', {b["lp_min"]}–{b["lp_max"]} LP' if b['lp_min'] or b['lp_max'] else ''))
    if tiefe < TIEFE:
        for i in range(KINDER):
            kind = lies_baum(seite, f'{rk}_{i}', tiefe + 1, log)
            if kind is None:
                break
            b['bereiche'].append(kind)
    return b


def hole(client, studiengang, stupo, liste, log=None, uhr=None):
    url = adresse(studiengang, stupo, liste)
    seite = Seite(client, url)
    k = seite.kopf
    if k['stupo']['moses_id'] != int(stupo) or k['liste']['moses_id'] != int(liste):
        raise moses.SourceError('Studiengangsseite zeigt eine andere StuPO oder Modulliste')
    wurzel = lies_baum(seite, '0', 0, log)
    if wurzel is None or not wurzel['bereiche']:
        raise moses.SourceError('Studiengangsaufbau ohne Bereiche')
    return {'quelle': url, 'abgerufen_am': (uhr or _jetzt)(),
            'studiengang': {'moses_id': int(studiengang), 'name': k['name'], 'kurz': k['kurz'],
                            'abschluss': k['abschluss'], 'turnus': k['turnus']},
            'stupo': k['stupo'], 'liste': k['liste'], 'bereiche': wurzel['bereiche']}


def _jetzt():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds')


# --- Lesen einer gespeicherten Modulliste (für abruf.py und bauen.py) -------------------------

def finde(liste, pfad):
    """Den Bereich `pfad` ("Wahlpflichtbereich/Vertiefung Informatik") in einer Modulliste."""
    teile = [t for t in pfad.split('/') if t]
    knoten = {'bereiche': liste['bereiche']}
    for teil in teile:
        treffer = [b for b in knoten['bereiche'] if b['name'] == teil]
        if len(treffer) != 1:
            raise KeyError(f'Bereich „{pfad}“ steht nicht (eindeutig) in der Modulliste')
        knoten = treffer[0]
    return knoten


def module_von(b):
    """Alle Module eines Bereichs und seiner Unterbereiche, je Nummer einmal (erste Fundstelle),
    jedes mit dem Namen des Unterbereichs, in dem es steht."""
    out, gesehen = [], set()

    def gehe(k, unter):
        for m in k.get('module', []):
            if m['nummer'] not in gesehen:
                gesehen.add(m['nummer'])
                out.append({**m, 'unterbereich': unter})
        for kind in k.get('bereiche', []):
            gehe(kind, kind['name'])
    gehe(b, None)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description='Modulliste eines Studiengangs aus dem MTS (öffentlich).')
    ap.add_argument('--studiengang', type=int, required=True, help='MOSES-ID des Studiengangs (WI B.Sc.: 121)')
    ap.add_argument('--stupo', type=int, required=True, help='MOSES-ID der StuPO (Parameter mkg)')
    ap.add_argument('--liste', type=int, required=True, help='MOSES-ID der Modulliste (Parameter semester)')
    ap.add_argument('--aus', type=Path, help='Zieldatei (Vorgabe: stdout)')
    ap.add_argument('--abstand', type=float, default=1.0, help='Sekunden zwischen Anfragen (mind. 0,7)')
    a = ap.parse_args(argv)
    client = moses.Client(delay=max(0.7, a.abstand))
    try:
        daten = hole(client, a.studiengang, a.stupo, a.liste,
                     log=lambda s: print(s, file=sys.stderr))
    except (moses.SourceError, OSError) as exc:
        print(f'  ✗ modulliste: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    text = json.dumps(daten, ensure_ascii=False, indent=1) + '\n'
    if a.aus:
        a.aus.parent.mkdir(parents=True, exist_ok=True)
        a.aus.write_text(text, encoding='utf-8')
    else:
        sys.stdout.write(text)
    n = len(module_von({'bereiche': daten['bereiche']}))
    print(f'  ✓ {daten["studiengang"]["name"]} · {daten["stupo"]["label"]} · Modulliste '
          f'{daten["liste"]["label"]}: {n} Module', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
