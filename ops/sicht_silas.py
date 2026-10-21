#!/usr/bin/env python3
"""/silas am Telefon und am Rechner messen (V-0391, SP-0424). Öffnet web/silas/ in Chromium. Die API ist eine Attrappe
mit einem ERFUNDENEN Stand (Beispielmodule im WiSe 2030/31) — Silas' Semester liegt nur im KV und nie im Repo
(docs/SILAS.md §7); nichts geht ins Netz außer an 127.0.0.1.

Am Telefon (V-0391, Silas, 16.10.2026: „die app bitte einmal für jeden schritt auch für mobile optimieren“): 390 × 844
und 360 × 740, hell und dunkel, mit Touch, in jedem Schritt (1–4), festgelegt (Woche, Prüfungen) und unter Offen und
Abgleich. Geprüft wird, was bis V-0391 schiefging (Sichtung 390 × 844: Raster 640 px breit und seitlich zu schieben,
die Seite 9 000 px lang, was dran war, stand unter Raster und Legende):
  · die Seite scrollt nie seitlich, und das Raster ist nicht breiter als das Fenster
  · in den Schritten 1–4 steht #dran (was dran ist, mit Knöpfen) direkt über dem Raster
  · die Semester-Übersicht ist zugeklappt, die Seite bleibt unter 4 000 px (Schritte 1–4)
  · kein Fehler auf der Seite

Am Rechner (SP-0424, Silas, 21.10.2026: „nochmal aufs surface (zusätzlich zu macbook) screen optimieren“): das
Surface im größten Fenster (1440 × 830), das MacBook im halben (865 × 1021) und im ganzen (1728 × 1000), hell und
dunkel, festgelegt in einer echten Woche mit vier Fristen an einem Tag, unter Prüfungen und mit eingeklappter linker
Spalte. Geprüft wird:
  · nichts scrollt seitlich; ab 1101 px auch nicht nach unten, und das Raster hat dort ≥ 38 px je Stunde
  · über dem Raster je Tag höchstens EIN Ganztägiges, darunter „+n“; Darüberfahren zeigt die übrigen der Woche
  · „Festgelegt am … / Offen / Abgleich …“ ist zugeklappt, „✓ Festgelegt“ steht neben dem Titel
  · eingeklappt ist die linke Spalte eine Schiene (≤ 44 px) mit „Woche“ und „Prüfungen“

  python3 ops/sicht_silas.py [--web web] [--bilder <ordner>]      (braucht Playwright, wie ops/sicht.py)
"""
import argparse, functools, http.server, json, os, socketserver, sys, threading

SEM = {'id': 'test', 'titel': 'WiSe 2030/31', 'vorlesung': {'von': '2030-10-14', 'bis': '2031-02-15'},
       'frei': [{'von': '2030-12-23', 'bis': '2031-01-04', 'titel': 'Vorlesungsfrei'}], 'ende': '2031-03-28',
       'studiengang': 'Beispiel B.Sc.', 'fachsemester': 1}


def modul(kurz, nr, farbe, tag, gruppen_tage):
    k = kurz.lower()
    serie = lambda t, a, e, ort: {'typ': 'serie', 'tag': t, 'start': a, 'ende': e, 'von': '2030-10-14', 'bis': '2031-02-14', 'ort': ort}
    return {
        'id': kurz, 'nr': nr, 'titel': f'Beispielmodul {kurz}', 'kurz': kurz, 'lp': 6, 'farbe': farbe,
        'posten': [{'id': 'vl', 'lv': 'VL', 'titel': 'VL · Präsenzzeit', 'mult': 15, 'h': 2},
                   {'id': 'vn', 'lv': 'VL', 'titel': 'Vor-/Nachbereitung', 'mult': 15, 'h': 2},
                   {'id': 'ue', 'lv': 'UE', 'titel': 'Übung · Präsenzzeit', 'mult': 15, 'h': 2},
                   {'id': 'pv', 'lv': None, 'titel': 'Prüfungsvorbereitung', 'mult': 1, 'h': 60}],
        'teile': [
            {'id': f'{k}-vl', 'titel': 'VL', 'art': 'praesenz', 'posten': 'vl', 'termine': serie(tag, '10:15', '11:45', 'X 101')},
            {'id': f'{k}-video', 'titel': 'Videos', 'art': 'video', 'posten': 'vn', 'soll_h': 10,
             'einheiten': {'liste': [{'nr': i + 1, 'ab': d} for i, d in enumerate(['2030-10-21', '2030-10-28', '2030-11-04'])], 'laenge_min': 90}},
            {'id': f'{k}-vn', 'titel': 'Nachbereitung', 'art': 'selbst', 'posten': 'vn'},
            {'id': f'{k}-ue', 'titel': 'Übung', 'art': 'praesenz', 'posten': 'ue', 'wahl': True,
             'optionen': [{'id': f'{k}-g{i + 1}', 'label': f'{t} {h}–{h + 2} · Tutor {i + 1}, Y {i + 1}', 'termine': serie(t, f'{h:02d}:15', f'{h + 1:02d}:45', f'Y {i + 1}')}
                          for i, (t, h) in enumerate(gruppen_tage)]},
            {'id': f'{k}-pv', 'titel': 'Klausurvorbereitung', 'art': 'pruefung', 'posten': 'pv', 'pruefung': f'{k}-klausur'},
        ],
        'pruefungen': [{'id': f'{k}-klausur', 'titel': 'Klausur', 'dauer_min': 90, 'termine': [{'datum': '2031-03-03', 'start': '10:00', 'ende': '11:30'}]}],
    }


def stand(festgelegt=False):
    angebot = {'semester': SEM, 'module': [modul('AAA', 90001, 1, 'Mo', [('Di', 8), ('Mi', 12), ('Fr', 10)]),
                                           modul('BBB', 90002, 3, 'Do', [('Mo', 14), ('Di', 16), ('Do', 8), ('Fr', 12)])],
               # Vier Fristen am Fr 29.11. (SP-0424): über dem Raster steht eine, darunter „+3“.
               'termine': [{'id': 'f1', 'modul': 'AAA', 'art': 'frist', 'datum': '2030-11-29', 'start': '23:59', 'titel': 'Anmeldung endet', 'wichtig': True},
                           {'id': 'f2', 'modul': 'BBB', 'art': 'frist', 'datum': '2030-11-29', 'start': '12:00', 'titel': 'Abgabe Blatt 3'},
                           {'id': 'f3', 'modul': 'AAA', 'art': 'frist', 'datum': '2030-11-29', 'start': '18:00', 'titel': 'Quiz 4 schließt'},
                           {'id': 'f4', 'modul': 'BBB', 'art': 'rahmen', 'datum': '2030-11-29', 'titel': 'Tag der Lehre'},
                           {'id': 'f5', 'modul': 'BBB', 'art': 'frist', 'datum': '2030-11-25', 'start': '10:00', 'titel': 'Rückmeldung'}]}
    plan = {'wahl': {'aaa-ue': 'aaa-g2'}, 'bloecke': [{'id': 'b1', 'teil': 'aaa-video', 'tag': 'Mi', 'start': '14:00', 'ende': '15:30'}]}
    if festgelegt:
        plan['festgelegt'] = '2030-10-12T08:00:00.000Z'
    return {'schema': 1, 'version': 1, 'geaendert': '2030-10-12T08:00:00.000Z', 'angebot': angebot, 'plan': plan}


def attrappe(st):
    """Die API als Attrappe: GET stand liefert den erfundenen Stand, PUT bestätigt nur. (Ein Handler mit zwei Parametern
    bekäme von Playwright (route, request) — darum ein Abschluss statt eines Standardwerts.)"""
    def api(route):
        if route.request.method == 'PUT':
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'version': 2, 'geaendert': '2030-10-12T09:00:00Z'}))
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(st) if '/stand' in route.request.url else '{}')
    return api


ANSICHTEN = [('schritt-1', {'schritt': 1}, False), ('schritt-2', {'schritt': 2}, False), ('schritt-3', {'schritt': 3}, False),
             ('schritt-4', {'schritt': 4}, False), ('offen', {'bereich': 'offen'}, False), ('abgleich', {'bereich': 'abgleich'}, False),
             ('fest-woche', {}, True), ('fest-pruefungen', {'bereich': 'frei'}, True)]
FENSTER = [(390, 844), (360, 740)]
# Am Rechner (SP-0424): festgelegt in der echten Woche der vier Fristen, unter Prüfungen, und links eingeklappt.
RECHNER = [(1440, 830), (865, 1021), (1728, 1000)]
WOCHE_FRISTEN = '2030-11-25'
ANSICHTEN_RECHNER = [('fest-echt', {'modus': 'woche', 'woche': WOCHE_FRISTEN}), ('fest-pruefungen', {'bereich': 'frei'}),
                     ('links-zu', {'modus': 'woche', 'woche': WOCHE_FRISTEN, 'linksZu': True})]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--web', default=os.path.join(os.path.dirname(__file__), '..', 'web'))
    ap.add_argument('--bilder', help='Bildschirmfotos je Ansicht hierhin (nur zum Ansehen)')
    a = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('  ✗ Playwright fehlt (pip install playwright) — wie ops/sicht.py'); return 2

    class Still(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_): pass
    srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Still, directory=os.path.abspath(a.web)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    basis = f'http://127.0.0.1:{srv.server_address[1]}/silas/'
    fehler = []

    def pruefe(name, bed, text):
        if not bed: fehler.append(f'{name}: {text}')
        return bed

    with sync_playwright() as p:
        b = p.chromium.launch()
        for (breite, hoehe) in FENSTER:
            for schema in ('light', 'dark'):
                for name, ansicht, fest in ANSICHTEN:
                    st = stand(fest)
                    ctx = b.new_context(viewport={'width': breite, 'height': hoehe}, device_scale_factor=1, is_mobile=True, has_touch=True, color_scheme=schema)

                    ctx.route('**/silas/api/**', attrappe(st))
                    a_ = {'v': 334, 'modus': 'standard', 'leiste': True, 'bereich': 'plan', 'schritt': 1, **ansicht}
                    ctx.add_init_script(f"localStorage.setItem('silas:v1:schluessel','x'); localStorage.setItem('silas:v1:ansicht', {json.dumps(json.dumps(a_))});")
                    pg = ctx.new_page()
                    seitenfehler = []
                    pg.on('pageerror', lambda e: seitenfehler.append(str(e)))
                    wo = f'{breite}×{hoehe} {schema} {name}'
                    pg.goto(basis)
                    try:
                        pg.wait_for_selector('#seite:not([hidden])', timeout=8000)
                    except Exception:
                        pruefe(wo, False, f'die Seite erscheint nicht {seitenfehler[:1]}')
                        ctx.close()
                        continue
                    pg.wait_for_timeout(300)
                    m = pg.evaluate('''() => {
                      const r = (id) => { const e = document.getElementById(id); if (!e || e.hidden || !e.offsetHeight) return null; const b = e.getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY, width: b.width, right: b.right }; };
                      return { breit: document.documentElement.scrollWidth, hoch: document.documentElement.scrollHeight,
                               raster: r('raster'), rahmen: r('raster-rahmen'), dran: r('dran'), leiste: r('leiste') };
                    }''')
                    pruefe(wo, m['breit'] <= breite, f'die Seite scrollt seitlich ({m["breit"]} px)')
                    pruefe(wo, not seitenfehler, f'Fehler auf der Seite: {seitenfehler[:1]}')
                    if m['raster']:
                        pruefe(wo, m['raster']['right'] <= breite + 0.5, f'das Raster ist breiter als das Fenster (rechts {m["raster"]["right"]:.0f} px)')
                    if name.startswith('schritt-'):
                        if pruefe(wo, m['dran'] is not None, '#dran fehlt über dem Raster'):
                            pruefe(wo, m['rahmen'] and 0 <= m['rahmen']['top'] - m['dran']['bottom'] <= 24, '#dran steht nicht direkt über dem Raster')
                        pruefe(wo, m['leiste'] and m['leiste']['bottom'] - m['leiste']['top'] < 200, 'die Semester-Übersicht ist nicht zugeklappt')
                        pruefe(wo, m['hoch'] < 4000, f'die Seite ist {m["hoch"]} px lang')
                    if a.bilder:
                        os.makedirs(a.bilder, exist_ok=True)
                        pg.screenshot(path=os.path.join(a.bilder, f'{breite}-{schema}-{name}.png'), full_page=True)
                    ctx.close()
        for (breite, hoehe) in RECHNER:
            for schema in ('light', 'dark'):
                for name, ansicht in ANSICHTEN_RECHNER:
                    ctx = b.new_context(viewport={'width': breite, 'height': hoehe}, device_scale_factor=1, color_scheme=schema)
                    ctx.route('**/silas/api/**', attrappe(stand(True)))
                    a_ = {'v': 334, 'modus': 'standard', 'leiste': True, 'bereich': 'plan', 'schritt': 1, **ansicht}
                    ctx.add_init_script(f"localStorage.setItem('silas:v1:schluessel','x'); localStorage.setItem('silas:v1:ansicht', {json.dumps(json.dumps(a_))});")
                    pg = ctx.new_page()
                    seitenfehler = []
                    pg.on('pageerror', lambda e: seitenfehler.append(str(e)))
                    wo = f'{breite}×{hoehe} {schema} {name}'
                    pg.goto(basis)
                    try:
                        pg.wait_for_selector('#seite:not([hidden])', timeout=8000)
                    except Exception:
                        pruefe(wo, False, f'die Seite erscheint nicht {seitenfehler[:1]}')
                        ctx.close()
                        continue
                    pg.wait_for_timeout(300)
                    m = pg.evaluate('''() => {
                      const r = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden || !e.offsetHeight) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
                      const zeiten = [...document.querySelectorAll('#raster .r-zeiten span')].length + 1;
                      return { breit: document.documentElement.scrollWidth, hoch: document.documentElement.scrollHeight, raster: r('#raster'), stunden: zeiten,
                               jeTag: [...document.querySelectorAll('#ganztag .gt-zeile .gt-tag')].map((t) => t.querySelectorAll('.chip').length),
                               mehr: [...document.querySelectorAll('#ganztag .gt-zeile .gt-mehr')].map((x) => x.textContent),
                               schritte: !!document.querySelector('#p-kopf .p-schritte'), pille: !!document.querySelector('#p-kopf .fest-pille'),
                               module: r('#module'), schiene: [...document.querySelectorAll('#module .ls-reiter')].map((x) => x.textContent) };
                    }''')
                    pruefe(wo, not seitenfehler, f'Fehler auf der Seite: {seitenfehler[:1]}')
                    pruefe(wo, m['breit'] <= breite, f'die Seite scrollt seitlich ({m["breit"]} px)')
                    if breite > 1100:
                        pruefe(wo, m['hoch'] <= hoehe, f'die Seite scrollt nach unten ({m["hoch"]} px)')
                        if m['raster']:
                            pruefe(wo, m['raster']['height'] / m['stunden'] >= 38, f'das Raster hat nur {m["raster"]["height"] / m["stunden"]:.0f} px je Stunde')
                    pruefe(wo, not m['schritte'] and m['pille'], 'die Zeile „Festgelegt am … / Offen / Abgleich …“ ist nicht zugeklappt')
                    if name != 'fest-pruefungen':
                        pruefe(wo, m['jeTag'] and max(m['jeTag']) == 1, f'über dem Raster stehen je Tag {m["jeTag"]} Ganztägige statt höchstens einem')
                        if pruefe(wo, '+3' in m['mehr'], f'„+3“ fehlt unter den vier Fristen des Freitags ({m["mehr"]})'):
                            pg.hover('#ganztag .gt-mehr')
                            pg.wait_for_timeout(100)
                            pruefe(wo, pg.is_visible('#gt-weitere') and pg.locator('#gt-weitere .chip').count() >= 3, 'Darüberfahren über „+3“ zeigt die übrigen nicht')
                    if name == 'links-zu':
                        pruefe(wo, m['module'] and m['module']['width'] <= 44, f'die linke Spalte ist eingeklappt {m["module"] and round(m["module"]["width"])} px breit')
                        pruefe(wo, m['schiene'] == ['Woche', 'Prüfungen'], f'die Schiene zeigt {m["schiene"]} statt Woche und Prüfungen')
                    if a.bilder:
                        os.makedirs(a.bilder, exist_ok=True)
                        pg.screenshot(path=os.path.join(a.bilder, f'{breite}-{schema}-{name}.png'))
                    ctx.close()
        b.close()
    srv.shutdown()
    gesamt = len(FENSTER) * 2 * len(ANSICHTEN) + len(RECHNER) * 2 * len(ANSICHTEN_RECHNER)
    if fehler:
        print(f'  ✗ /silas: {len(fehler)} Befund(e) in {gesamt} Ansichten')
        for f in fehler: print(f'    · {f}')
        return 1
    print(f'  ✓ /silas: {gesamt} Ansichten — am Telefon (390×844, 360×740) nichts seitlich, #dran über dem Raster; am Rechner '
          f'(1440×830, 865×1021, 1728×1000) ein Ganztägiges je Tag mit „+n“, Festgelegt zugeklappt, links einklappbar')
    return 0


if __name__ == '__main__':
    sys.exit(main())
