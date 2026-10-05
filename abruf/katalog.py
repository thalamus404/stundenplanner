"""Der Katalog: was es zu planen gibt, von Hand gepflegt (docs/ARCHITEKTUR.md §3).

Fünf Stufen, in der Reihenfolge, in der man auf der Seite wählt (Silas, 05.10.2026): Hochschule →
Studiengang → Vertiefung → Fachsemester (in einem Semester) → Studien- und Prüfungsordnung. Am Ende
steht genau ein Plan: die Module, die in diesem Fachsemester dran sind.

    katalog/hochschulen/<id>.json     Kurzname, Name, Quelle der Termine, ob abgerufen werden darf
    katalog/semester/<id>.json        Beschriftung, Anker, optional die Hochschule
    katalog/studiengaenge/<id>.json   Ordnungen (StuPO mit Gültigkeit), Vertiefungen, Pläne

`lesen()` teilen sich abruf.py und bauen.py. Erbe, Gültigkeit und Sichtbarkeit werden hier und nur
hier aufgelöst: Läsen beide den Katalog selbst, holte der Abruf eines Tages andere Module, als das
Lesemodell zeigt.

Regeln, an denen etwas hängt:
- **Rückwärtsverträglich.** Ein Studiengang ohne `ordnungen` und `vertiefungen` (das erste Format)
  ergibt dieselben Pläne und Dateinamen wie vorher (`<studiengang>/<semester>-fs<n>.json`).
  `hochschule` darf dort noch der Kurzname sein („TU Berlin“), er wird über `kurz`/`name` gefunden.
- **Kennungen sind Dateinamen und Schlüssel im Browser**: nur a–z, 0–9 und Bindestrich, und eine
  Kennung ändert sich nicht, sonst verliert jemand seine gespeicherte Auswahl.
- **Gültigkeit einer Ordnung** (Erkenntnis 2 aus V-0228: Die gültige StuPO hängt am Studienbeginn,
  nicht am Datum der neuesten): `gilt_ab`/`gilt_bis` begrenzen die Semester, deren Anker in ihrer
  Geltung liegen muss; ein Plan außerhalb ist ein Katalogfehler. Für wen sie gilt
  (`studienbeginn`, `fuer_wen`), ist Text für die Wahl auf der Seite: Wer gewechselt hat, weiß nur
  der Mensch selbst (V-0227).
- **Erbe statt Wiederholung.** Ein Plan mit `vertiefung` erbt die Module des Grundplans derselben
  Ordnung, desselben Semesters und Fachsemesters (der Plan ohne `vertiefung`) und ergänzt nur seine
  eigenen. `"waehlbar": false` macht einen Grundplan zur reinen Grundlage, er steht dann nicht
  selbst zur Wahl. Ein Modul, das im Grundplan und in der Vertiefung steht, ist ein Fehler.
- **Sichtbarkeit**: `"sichtbar": "vorschau"` an Hochschule, Studiengang oder Plan (der nächste
  gewinnt; ohne Angabe „live“). Vorschau-Pläne baut und holt nur, wer `--mit-vorschau` sagt. So
  kommen Live-Seite und Vorschau aus demselben Katalog (Silas, 05.10.2026).
- **Abruf gesperrt**: `"abruf": "gesperrt"` mit `abruf_grund` an der Hochschule. Ihre Pläne holt
  abruf.py nie, auch nicht mit `--mit-vorschau` (Anlass: robots.txt der HU, Punkt 7411bed1).
- **Ersatzsemester**: Ein Semester mit `ersatz_fuer` zeigt die Termine eines früheren für ein
  kommendes, das die Quelle noch nicht freigibt (V-0227: den letzten Sommer für den nächsten). Die Gültigkeit
  einer Ordnung wird dann an `ersatz_anker` gemessen, dem Beginn des gemeinten Semesters.
- **Bestandteile** (`katalog/bestandteile.json`, Punkt 633ed71d): Wo die Gruppen eines Bestandteils
  nicht „wähle eine“ heißen: `alle` (Teile), `keine` (offenes Angebot), `unklar`. Gilt für die
  Kennung `<modul>:<vorlage>` in allen Plänen, auf Wunsch nur in genannten Semestern.
- **Wahlpflicht** (V-0227): Ein Plan nennt Bereiche einer Modulliste (`katalog/modullisten/`,
  erzeugt von modulliste.py), keine Module. Welche Module dazugehören, löst `lesen()` auf
  (`wahlpflicht[].kandidaten`). Eine Vertiefung erbt nur die Pflichtmodule des Grundplans.
- **Formate** (`katalog/formate.json`, V-0238): je Lehrveranstaltungsformat ein Kürzel mit Langname,
  einer von drei Kategorien (`vorlesung`, `uebung`, `sonstige`; die Seite macht daraus die
  Sättigung) und den Namen, unter denen die Quellen es schreiben (MOSES: Art „SEM“, CSV „Seminar“;
  AGNES: „SE“). `format_von()` löst einen Bestandteil auf; was dort nicht steht, ist `sonstige`
  mit `unbekannt`, und bauen.py meldet es. Ein Name, der zu zwei Formaten passt, ist ein
  Katalogfehler: Sonst entschiede die Reihenfolge der Datei, wie ein Termin aussieht.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

KENNUNG = re.compile(r'[a-z0-9][a-z0-9-]*')
# Eine Modulnummer ist Dateiname des Rohstands und Teil der Kennung eines Bestandteils. Die Quelle
# prüft enger (MOSES: nur Ziffern, abruf.NUMMER); hier nur: kein Pfad, kein Leerzeichen.
MODUL = re.compile(r'[A-Za-z0-9][A-Za-z0-9-]{0,39}')
SICHTBAR = ('live', 'vorschau')
GRUPPEN = ('eine', 'alle', 'keine', 'unklar')  # wie plan.GRUPPEN
BESTANDTEIL = re.compile(r'[A-Za-z0-9][A-Za-z0-9-]{0,39}:[A-Za-z0-9-]+')
ABRUF = ('erlaubt', 'gesperrt')
# Die drei Kategorien der Formate (Silas, 05.10.2026: Sättigung 100, 70 und 50 %). Sie sind der Vertrag
# mit der Seite, deshalb stehen sie hier und nicht nur in der Datei. `sonstige` fängt alles Unbekannte.
KATEGORIEN = ('vorlesung', 'uebung', 'sonstige')
# Ein Kürzel ist, was die Seite als Chip zeigt: kurz, ohne Leerzeichen. Die Quellen schreiben auch
# „P-PR“, „VL/UE“ und „Kolloquium-F“; Langnamen mit Leerzeichen gehören nach `namen`.
FORMAT_KUERZEL = re.compile(r'[A-Za-zÄÖÜäöü][A-Za-zÄÖÜäöü0-9/-]{0,19}')
# Die Felder einer Ordnung, die ins Lesemodell gehen (docs/ARCHITEKTUR.md §5), in dieser Reihenfolge.
ORDNUNG_FELDER = ('id', 'label', 'name', 'fundstelle', 'url', 'gilt_ab', 'gilt_bis', 'studienbeginn', 'fuer_wen')


class KatalogFehler(ValueError):
    """Der Katalog widerspricht sich (z. B. ein Plan zeigt auf ein unbekanntes Semester)."""


def _lies(pfad):
    try:
        return json.loads(Path(pfad).read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise KatalogFehler(f'{Path(pfad).name}: nicht lesbar ({type(exc).__name__})') from exc


def _kennung(wert, wo, feld='id'):
    if not isinstance(wert, str) or not KENNUNG.fullmatch(wert):
        raise KatalogFehler(f'{wo}: „{feld}“ fehlt oder ist keine Kennung (a–z, 0–9, Bindestrich): {wert!r}')
    return wert


def _text(obj, feld, wo, pflicht=True):
    wert = obj.get(feld)
    if wert is None and not pflicht:
        return None
    if not isinstance(wert, str) or not wert.strip():
        raise KatalogFehler(f'{wo}: Feld „{feld}“ fehlt')
    return wert


def _datum(obj, feld, wo, pflicht=False):
    wert = obj.get(feld)
    if wert is None and not pflicht:
        return None
    try:
        return date.fromisoformat(wert)
    except (TypeError, ValueError):
        raise KatalogFehler(f'{wo}: „{feld}“ ist kein Datum JJJJ-MM-TT: {wert!r}') from None


def _wahl(obj, feld, erlaubt, vorgabe, wo):
    wert = obj.get(feld, vorgabe)
    if wert not in erlaubt:
        raise KatalogFehler(f'{wo}: „{feld}“ ist {wert!r}, erlaubt: {", ".join(erlaubt)}')
    return wert


def _datei_passt(obj, pfad):
    _kennung(obj.get('id'), pfad.name)
    if obj['id'] != pfad.stem:
        raise KatalogFehler(f'{pfad.name}: „id“ {obj["id"]!r} passt nicht zum Dateinamen')


def _kontrast_weiss(hexwert):
    """WCAG-Kontrast von Weiß auf einer Farbe #rrggbb."""
    def kanal(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexwert[i:i + 2], 16) for i in (1, 3, 5))
    lum = 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
    return 1.05 / (lum + 0.05)


def _farbe(h, wo):
    """Die Farbe einer Hochschule (V-0243): Ihre Karte im Startbildschirm ist damit gefüllt, die Schrift
    darauf weiß. Silas, 05.10.2026: „gerne das Rot benutzen, was die TU Berlin benutzt“, ohne Logo und
    ohne Nachahmung. Eine Farbe, auf der Weiß unter 4,5:1 fällt (WCAG AA), lässt der Katalog nicht zu."""
    f = h.get('farbe')
    if f is None:
        return None
    if not (isinstance(f, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', f)):
        raise KatalogFehler(f'{wo}: „farbe“ muss #rrggbb sein')
    if _kontrast_weiss(f) < 4.5:
        raise KatalogFehler(f'{wo}: weiße Schrift auf „farbe“ {f} hat nur {_kontrast_weiss(f):.2f}:1 (mindestens 4,5:1)')
    return f.lower()


def _hochschulen(ordner):
    out = {}
    for pfad in sorted((ordner / 'hochschulen').glob('*.json')):
        h = _lies(pfad)
        _datei_passt(h, pfad)
        quelle = h.get('quelle')
        if quelle is not None and not (isinstance(quelle, dict) and isinstance(quelle.get('name'), str)):
            raise KatalogFehler(f'{pfad.name}: „quelle“ braucht mindestens „name“')
        abruf = _wahl(h, 'abruf', ABRUF, 'erlaubt', pfad.name)
        # Eine Sperre ohne Grund wird eines Tages aufgehoben, ohne dass jemand weiß, warum es sie gab.
        grund = _text(h, 'abruf_grund', pfad.name) if abruf == 'gesperrt' else None
        out[h['id']] = {'id': h['id'], 'kurz': _text(h, 'kurz', pfad.name), 'name': _text(h, 'name', pfad.name),
                        'quelle': quelle, 'abruf': abruf, 'abruf_grund': grund, 'farbe': _farbe(h, pfad.name),
                        'sichtbar': _wahl(h, 'sichtbar', SICHTBAR, 'live', pfad.name)}
    return out


def _hochschule_von(wert, hochschulen, wo):
    """Die Hochschule zu einer Kennung; im ersten Format auch zum Kurznamen oder Namen."""
    if wert in hochschulen:
        return hochschulen[wert]
    treffer = [h for h in hochschulen.values() if wert in (h['kurz'], h['name'])]
    if len(treffer) == 1:
        return treffer[0]
    raise KatalogFehler(f'{wo}: Hochschule {wert!r} steht nicht (eindeutig) in katalog/hochschulen/')


def _semester(ordner, hochschulen):
    out = {}
    for pfad in sorted((ordner / 'semester').glob('*.json')):
        s = _lies(pfad)
        _datei_passt(s, pfad)
        _text(s, 'label', pfad.name)
        _datum(s, 'anker', pfad.name, pflicht=True)  # ein unlesbarer Anker fällt hier auf, nicht in der Rechnung
        if s.get('ersatz_fuer') is not None:
            _text(s, 'ersatz_fuer', pfad.name)
            # Ohne den Beginn des gemeinten Semesters ließe sich nicht prüfen, welche Ordnung gilt.
            _datum(s, 'ersatz_anker', pfad.name, pflicht=True)
        if s.get('hochschule') is not None:
            _hochschule_von(s['hochschule'], hochschulen, pfad.name)
        out[s['id']] = s
    return out


def _ordnungen(g, wo):
    out = []
    for i, o in enumerate(g.get('ordnungen') or []):
        w = f'{wo}, Ordnung {i + 1}'
        _kennung(o.get('id'), w)
        _text(o, 'label', w)
        ab, bis = _datum(o, 'gilt_ab', w), _datum(o, 'gilt_bis', w)
        if ab and bis and bis < ab:
            raise KatalogFehler(f'{w}: „gilt_bis“ liegt vor „gilt_ab“')
        sb = o.get('studienbeginn')
        if sb is not None and not (isinstance(sb, dict) and set(sb) <= {'ab', 'bis'}):
            raise KatalogFehler(f'{w}: „studienbeginn“ ist {{"ab": …, "bis": …}}')
        out.append({k: o.get(k) for k in ORDNUNG_FELDER} | {'_ab': ab, '_bis': bis})
    if len({o['id'] for o in out}) != len(out):
        raise KatalogFehler(f'{wo}: eine Ordnung steht doppelt')
    return out


def _vertiefungen(g, wo):
    out = []
    for i, v in enumerate(g.get('vertiefungen') or []):
        w = f'{wo}, Vertiefung {i + 1}'
        out.append({'id': _kennung(v.get('id'), w), 'name': _text(v, 'name', w), 'kurz': v.get('kurz')})
    if len({v['id'] for v in out}) != len(out):
        raise KatalogFehler(f'{wo}: eine Vertiefung steht doppelt')
    return out


def _module(p, wo):
    module = p.get('module', [])
    if not isinstance(module, list):
        raise KatalogFehler(f'{wo}: „module“ ist keine Liste')
    for m in module:
        if not isinstance(m, dict) or not isinstance(m.get('nummer'), str) or not MODUL.fullmatch(m['nummer']):
            raise KatalogFehler(f'{wo}: ungültige Modulnummer {m.get("nummer") if isinstance(m, dict) else m!r}')
    if len({m['nummer'] for m in module}) != len(module):
        raise KatalogFehler(f'{wo}: ein Modul steht doppelt im Plan')
    return module


def _wahlpflicht(p, ordner, listen, wo):
    """Die Wahlpflichtbereiche eines Plans, aufgelöst: je Bereich die Modulliste, der Bereich darin
    und seine Module (`kandidaten`). Abgeschrieben wird nichts: Kandidaten sind genau die Module,
    die MOSES dem Bereich zuordnet (V-0227)."""
    bereiche = p.get('wahlpflicht') or []
    if not bereiche:
        return []
    import modulliste  # erst hier: braucht beautifulsoup4, das Lesemodell ohne Wahlpflicht nicht
    out = []
    for i, wp in enumerate(bereiche):
        w = f'{wo}, Wahlpflicht {i + 1}'
        _kennung(wp.get('id'), w)
        lid = _kennung(wp.get('modulliste'), w, 'modulliste')
        if lid not in listen:
            listen[lid] = _lies(ordner / 'modullisten' / f'{lid}.json')
        try:
            bereich = modulliste.finde(listen[lid], wp.get('bereich') or '')
        except KeyError as exc:
            raise KatalogFehler(f'{w}: {exc.args[0]} ({lid})') from None
        kandidaten = modulliste.module_von(bereich)
        for k in kandidaten:
            if not isinstance(k.get('nummer'), str) or not MODUL.fullmatch(k['nummer']):
                raise KatalogFehler(f'{lid}: ungültige Modulnummer {k.get("nummer")!r}')
        out.append({**wp, 'liste': listen[lid], 'bereich_daten': bereich, 'kandidaten': kandidaten})
    return out


def _bestandteile(ordner, semester):
    """Die Regeln je Bestandteil aus `katalog/bestandteile.json` (fehlt die Datei: keine)."""
    pfad = ordner / 'bestandteile.json'
    if not pfad.exists():
        return []
    roh = _lies(pfad)
    out, gesehen = [], set()
    for i, b in enumerate(roh.get('bestandteile') or []):
        w = f'bestandteile.json, Eintrag {i + 1}'
        if not isinstance(b.get('id'), str) or not BESTANDTEIL.fullmatch(b['id']):
            raise KatalogFehler(f'{w}: „id“ ist keine Kennung <modul>:<vorlage>: {b.get("id")!r}')
        _wahl(b, 'gruppen', GRUPPEN, None, w)
        _text(b, 'grund', w)
        sem = b.get('semester')
        if sem is not None and (not isinstance(sem, list) or not all(s in semester for s in sem)):
            raise KatalogFehler(f'{w}: „semester“ ist null oder eine Liste bekannter Semester')
        for s in (sem or [None]):
            if (b['id'], s) in gesehen or (b['id'], None) in gesehen or (s is None and any(x == b['id'] for x, _ in gesehen)):
                raise KatalogFehler(f'{w}: {b["id"]} steht doppelt')
            gesehen.add((b['id'], s))
        out.append({'id': b['id'], 'gruppen': b['gruppen'], 'semester': sem, 'grund': b['grund']})
    return out


def bestandteile_im_semester(kat, sid):
    """{component_id: {gruppen, grund}} für ein Semester."""
    return {b['id']: {'gruppen': b['gruppen'], 'grund': b['grund']}
            for b in kat['bestandteile'] if b['semester'] is None or sid in b['semester']}


def _name(text):
    # Verglichen wird ohne Groß- und Kleinschreibung und mit einfachen Leerzeichen: MOSES schreibt
    # „Integrierte Veranstaltung“, ein anderes System vielleicht „integrierte  Veranstaltung“.
    return ' '.join(str(text).split()).casefold()


def _formate(ordner):
    """Die Formate aus `katalog/formate.json`: `{'formate': {kuerzel: eintrag}, 'namen': {name: kuerzel}}`.
    Fehlt die Datei, gibt es keine: Jedes Format ist dann unbekannt und zählt als `sonstige`."""
    pfad = ordner / 'formate.json'
    if not pfad.exists():
        return {'formate': {}, 'namen': {}}
    roh = _lies(pfad)
    kat = roh.get('kategorien')
    if kat is not None and (not isinstance(kat, dict) or set(kat) != set(KATEGORIEN)):
        raise KatalogFehler(f'formate.json: „kategorien“ nennt genau {", ".join(KATEGORIEN)}')
    eintraege = roh.get('formate')
    if not isinstance(eintraege, dict) or not eintraege:
        raise KatalogFehler('formate.json: „formate“ fehlt oder ist leer')
    formate, namen = {}, {}
    for kuerzel, f in eintraege.items():
        w = f'formate.json, {kuerzel}'
        if not FORMAT_KUERZEL.fullmatch(kuerzel):
            raise KatalogFehler(f'{w}: kein Kürzel (ein Wort, höchstens 20 Zeichen)')
        if not isinstance(f, dict):
            raise KatalogFehler(f'{w}: kein Objekt')
        for feld in ('lang', 'quelle', 'grund'):
            _text(f, feld, w)
        _text(f, 'vermutung', w, pflicht=False)
        _wahl(f, 'kategorie', KATEGORIEN, None, w)
        hs = f.get('hochschulen')
        if not isinstance(hs, list) or not hs:
            raise KatalogFehler(f'{w}: „hochschulen“ ist eine nicht leere Liste')
        for h in hs:
            _kennung(h, w, 'hochschulen')
        andere = f.get('namen', [])
        if not isinstance(andere, list) or not all(isinstance(n, str) and n.strip() for n in andere):
            raise KatalogFehler(f'{w}: „namen“ ist eine Liste von Texten')
        if not isinstance(f.get('kuerzel_eigen', False), bool):
            raise KatalogFehler(f'{w}: „kuerzel_eigen“ ist true oder false')
        for n in {_name(x) for x in [kuerzel, f['lang'], *andere]}:
            if n in namen:
                raise KatalogFehler(f'{w}: „{n}“ gehört schon zu {namen[n]}')
            namen[n] = kuerzel
        formate[kuerzel] = {'kuerzel': kuerzel, 'lang': f['lang'], 'kategorie': f['kategorie']}
    return {'formate': formate, 'namen': namen}


def format_von(formate, typ, buchungsformate=()):
    """Das Format eines Bestandteils fürs Lesemodell: `{kuerzel, lang, kategorie}`.

    `typ` ist die Art des Bestandteils im Rohstand (MOSES: Spalte „Art“, AGNES: Kurzform aus
    lsf.ARTEN), `buchungsformate` die `format`-Angaben seiner Buchungen (MOSES-CSV
    „Veranstaltungsformat“). Erst zählt die Art; kennt der Katalog sie nicht, die Buchungen, wenn sie
    alle dasselbe bekannte Format nennen. Sonst ist das Format unbekannt: Kürzel und Langname, wie
    die Quelle sie schreibt, Kategorie `sonstige` und `unbekannt: true`. So erscheint ein neues
    Format nicht stumm als Vorlesung, und bauen.py kann es melden."""
    formate = formate or {'formate': {}, 'namen': {}}
    buchungen = sorted({str(b).strip() for b in buchungsformate if b and str(b).strip()})
    kandidaten = [typ] if typ else []
    treffer = {formate['namen'].get(_name(b)) for b in buchungen}
    if len(treffer) == 1 and None not in treffer:
        kandidaten.append(buchungen[0])
    for k in kandidaten:
        kuerzel = formate['namen'].get(_name(k))
        if kuerzel:
            return dict(formate['formate'][kuerzel])
    return {'kuerzel': typ or (buchungen[0] if len(buchungen) == 1 else None),
            'lang': buchungen[0] if len(buchungen) == 1 else (typ or None),
            'kategorie': 'sonstige', 'unbekannt': True}


def plan_id(g, o, v, sem, fs):
    """Die Kennung eines Plans, eindeutig über alle fünf Stufen und stabil (Schlüssel im Browser)."""
    return ':'.join([g] + ([o] if o else []) + [sem, f'fs{fs}'] + ([v] if v else []))


def plan_datei(g, o, v, sem, fs):
    """Der Pfad der Plandatei unter web/daten/. Ohne Ordnung und Vertiefung wie im ersten Format."""
    return '/'.join([g] + ([o] if o else []) + ([v] if v else []) + [f'{sem}-fs{fs}.json'])


def lesen(ordner):
    """Liest und prüft den Katalog. Gibt ein dict mit `hochschulen`, `semester`, `studiengaenge`,
    `plaene`, `bestandteile` und `formate` zurück; jeder Plan ist aufgelöst (Erbe, Sichtbarkeit) und sortiert nach Studiengang,
    Semesterbeginn, Fachsemester, Ordnung und Vertiefung (in der Reihenfolge des Katalogs)."""
    ordner = Path(ordner)
    hochschulen = _hochschulen(ordner)
    semester = _semester(ordner, hochschulen)
    studiengaenge, plaene, listen = [], [], {}
    for pfad in sorted((ordner / 'studiengaenge').glob('*.json')):
        roh = _lies(pfad)
        wo = pfad.name
        _datei_passt(roh, pfad)
        hs = _hochschule_von(roh.get('hochschule'), hochschulen, wo)
        heisst = roh.get('vertiefung_heisst') or 'Vertiefung'
        g = {'id': roh['id'], 'name': _text(roh, 'name', wo), 'abschluss': roh.get('abschluss'), 'hochschule': hs,
             'ordnungen': _ordnungen(roh, wo), 'vertiefungen': _vertiefungen(roh, wo),
             'vertiefung_heisst': heisst, 'ohne_vertiefung': roh.get('ohne_vertiefung') or f'Ohne {heisst}',
             'sichtbar': _wahl(roh, 'sichtbar', SICHTBAR, hs['sichtbar'], wo), 'roh': roh}
        ordnungen = {o['id']: o for o in g['ordnungen']}
        vertiefungen = {v['id']: v for v in g['vertiefungen']}
        eigene = {}
        for i, p in enumerate(roh.get('plaene') or []):
            w = f'{wo}, Plan {i + 1}'
            sem = semester.get(p.get('semester'))
            if sem is None:
                raise KatalogFehler(f'{w}: Plan zeigt auf unbekanntes Semester „{p.get("semester")}“')
            fs = p.get('fachsemester')
            if not isinstance(fs, int) or isinstance(fs, bool) or fs < 1:
                raise KatalogFehler(f'{w}: Plan ohne ganzzahliges „fachsemester“ ≥ 1')
            if sem.get('hochschule') is not None and _hochschule_von(sem['hochschule'], hochschulen, w) is not hs:
                raise KatalogFehler(f'{w}: Semester {sem["id"]} gehört zu einer anderen Hochschule')
            o = p.get('ordnung')
            if ordnungen and o not in ordnungen:
                raise KatalogFehler(f'{w}: „ordnung“ {o!r} steht nicht unter „ordnungen“')
            if not ordnungen and o is not None:
                raise KatalogFehler(f'{w}: „ordnung“ ohne „ordnungen“ im Studiengang')
            v = p.get('vertiefung')
            if v is not None and v not in vertiefungen:
                raise KatalogFehler(f'{w}: „vertiefung“ {v!r} steht nicht unter „vertiefungen“')
            ordnung = ordnungen.get(o)
            if ordnung:
                anker = date.fromisoformat(sem.get('ersatz_anker') or sem['anker'])
                if ordnung['_ab'] and anker < ordnung['_ab']:
                    raise KatalogFehler(f'{w}: {ordnung["label"]} gilt erst ab {ordnung["gilt_ab"]}, '
                                        f'Semester {sem["id"]} beginnt am {anker}')
                if ordnung['_bis'] and anker > ordnung['_bis']:
                    raise KatalogFehler(f'{w}: {ordnung["label"]} gilt nur bis {ordnung["gilt_bis"]}, '
                                        f'Semester {sem["id"]} beginnt am {anker}')
            waehlbar = p.get('waehlbar', True)
            if not isinstance(waehlbar, bool) or (v is not None and not waehlbar):
                raise KatalogFehler(f'{w}: „waehlbar“ ist true oder false, und false nur für einen Grundplan')
            schluessel = (o, v, sem['id'], fs)
            if schluessel in eigene:
                raise KatalogFehler(f'{w}: Plan {sem["id"]} FS {fs}'
                                    + (f' {o}' if o else '') + (f' {v}' if v else '') + ' steht doppelt im Katalog')
            eigene[schluessel] = {
                'id': plan_id(g['id'], o, v, sem['id'], fs), 'datei': plan_datei(g['id'], o, v, sem['id'], fs),
                'hochschule': hs, 'studiengang': g, 'ordnung': ordnung,
                'vertiefung': vertiefungen.get(v), 'semester': sem, 'fachsemester': fs,
                'module': _module(p, w), 'wahlpflicht': _wahlpflicht(p, ordner, listen, w), 'waehlbar': waehlbar,
                'sichtbar': _wahl(p, 'sichtbar', SICHTBAR, g['sichtbar'], w), 'quelle': p.get('quelle'), 'roh': p}
        erben = set()
        for (o, v, sid, fs), plan in eigene.items():
            if v is None:
                continue
            grund = eigene.get((o, None, sid, fs))
            if grund is None:
                continue
            erben.add((o, None, sid, fs))
            doppelt = {m['nummer'] for m in grund['module']} & {m['nummer'] for m in plan['module']}
            if doppelt:
                raise KatalogFehler(f'{wo}: {", ".join(sorted(doppelt))} steht im Grundplan und in der Vertiefung '
                                    f'{v} ({sid}, FS {fs})')
            plan['module'] = grund['module'] + plan['module']
        for schluessel, plan in eigene.items():
            if not plan['waehlbar'] and schluessel not in erben:
                raise KatalogFehler(f'{wo}: Grundplan {plan["id"]} ist nicht wählbar, und keine Vertiefung erbt von ihm')
        studiengaenge.append(g)
        plaene.extend(eigene.values())
    reihe = {g['id']: ({o['id']: i for i, o in enumerate(g['ordnungen'])},
                       {v['id']: i for i, v in enumerate(g['vertiefungen'])}) for g in studiengaenge}

    def ordnung_der_plaene(p):
        ro, rv = reihe[p['studiengang']['id']]
        return (p['studiengang']['id'], p['semester']['anker'], p['fachsemester'],
                ro.get((p['ordnung'] or {}).get('id'), -1), rv.get((p['vertiefung'] or {}).get('id'), -1))
    plaene.sort(key=ordnung_der_plaene)
    return {'hochschulen': hochschulen, 'semester': semester, 'studiengaenge': studiengaenge, 'plaene': plaene,
            'bestandteile': _bestandteile(ordner, semester), 'formate': _formate(ordner)}


def sichtbar(plan, mit_vorschau):
    return mit_vorschau or plan['sichtbar'] == 'live'


def zur_wahl(kat, mit_vorschau=False):
    """Die Pläne, die die Seite zur Wahl stellt: wählbar und sichtbar."""
    return [p for p in kat['plaene'] if p['waehlbar'] and sichtbar(p, mit_vorschau)]
