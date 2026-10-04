#!/usr/bin/env python3
"""Der Prüfstand der Oberfläche: misst die Abnahmekriterien aus docs/DESIGN.md §8.

Wozu: „Ohne Scrollen, auf jeder Breite, nach den Designprinzipien“ soll eine Zahl sein und keine
Behauptung (Silas, 04.10.2026). Dieses Werkzeug öffnet die Seite in jedem Fenster aus DESIGN.md §8,
hell und dunkel, am Handy mit Touch, mit leerer, halber und voller (erfundener) Auswahl, und misst,
was §8 verlangt. Exit 0 nur, wenn ALLES erfüllt ist. „Unbestimmt“ zählt nie als bestanden.

Benutzung
---------
    python3 ops/sicht.py                         # misst web/ (startet selbst einen http.server)
    python3 ops/sicht.py --web <ordner>          # ein anderer Ordner mit index.html und daten/
    python3 ops/sicht.py --url <adresse>         # eine laufende Seite (Daten unter <adresse>daten/)
    python3 ops/sicht.py --json                  # maschinenlesbar auf stdout, Fortschritt auf stderr
    python3 ops/sicht.py --bilder <ordner>       # Bildschirmfotos je Lauf, nur AUSSERHALB des Repos
    python3 ops/sicht.py --fenster 390x844,1280x720 --schnell   # Teilmessung beim Bauen

  --schnell     nur die leere Auswahl, ohne Stressfall, Zoom und Tastatur. Das Ergebnis heißt dann
                TEILMESSUNG und ist keine Abnahme.
  --fenster     nur diese Fenster (BxH, mit Komma getrennt). Ebenfalls eine Teilmessung.
  --touch-bis   bis zu welcher Fensterbreite mit Touch (pointer: coarse) gemessen wird, Vorgabe 767
                (die Handy-Fenster). --touch-bis 1024 misst auch die Tablets mit Touch.
  --parallel    wie viele Browser zugleich messen, Vorgabe 4.

Voraussetzungen: Python ≥ 3.11 und Playwright mit Chromium (`pip install playwright` und
`python3 -m playwright install chromium`). Mit --web muss `<ordner>/daten/index.json` da sein; das
Werkzeug baut keine Daten, es sagt, wie man sie erzeugt (docs/ARCHITEKTUR.md §7). Der Stressfall
(§8 #2) ist eine erfundene Datei, die das Werkzeug selbst erzeugt und der Seite statt `daten/`
unterschiebt (Playwright-Route); es schreibt nichts auf die Platte außer den Bildern mit --bilder.

Haken im Markup (die Seite setzt sie, das Werkzeug zählt danach)
----------------------------------------------------------------
Ohne Haken lässt sich nicht zählen, was ein Chip oder eine Kachel ist; dann heißen die Prüfungen
§8 #3–#6 „unbestimmt“, nicht „bestanden“.
    data-sicht="chip"                              jeder Bestandteil-Chip der Modulleiste
    data-sicht="kachel" data-tag="0…6" data-start="HH:MM" data-ende="HH:MM"
                                                   jede Kachel im Raster (eine je Slot; Tag wie `day`
                                                   im Plan, 0 = Montag)
    data-sicht="stunde"                            jede Stundenmarke der Zeitachse („08“ …)
    data-sicht="tag" data-tag="0…6"                jeder Tageskopf bzw. Tagesreiter
    data-sicht="kopf|module|werkzeug|raster|fuss"  die Zonen aus §3.1
Schwebende Ebenen (Karte, Blatt, Dialog) sind `role="dialog"` oder `<dialog>`. Die Tokens aus §5
stehen als Variablen auf :root: `--grau-1` … `--grau-10`, `--m1-hauch|rand|flaeche|tinte` …
`--m8-…`, `--konflikt`, `--konflikt-text`, `--konflikt-flaeche`, `--hinweis`, `--hinweis-text`,
`--hinweis-flaeche`. Die erfundene Auswahl kommt über den Speicherschlüssel aus ARCHITEKTUR §6.

Was gemessen wird (je Lauf = Fenster × Schema × Auswahl, Standardansicht ohne Klick)
-------------------------------------------------------------------------------------
Die Fenster (§8) und das Budget (§6) liest das Werkzeug aus docs/DESIGN.md. Ändert sich dort eine
Zahl, misst es gegen die neue; was es dort nicht lesen kann, nimmt es aus FENSTER/BUDGET unten und
sagt es in der Ausgabe. Die Token-Paare (§5.5) und die Stressfall-Fenster (§8 #2) stehen hier.
§8 #1   `scrollHeight ≤ innerHeight` und `scrollWidth ≤ innerWidth` des Dokuments; dazu: kein
        sichtbares Element ragt aus dem Fenster, kein innerer Bereich scrollt (außer in Dialogen),
        kein Chip, keine Kachel, kein Bedienelement wird von einem Vorfahren abgeschnitten.
§8 #2   der Stressfall (8 Module, 20 Bestandteile, 6 Spuren, Mo–Sa, 07–21 Uhr, A/B): kein Scrollen
        ab 1280 × 720 und bei 390 × 844, in kleineren Fenstern nichts seitlich und nichts
        abgeschnitten; die Kacheln werden wie in #4 gezählt.
§8 #3   jeder Chip liegt ganz im Fenster und ist nicht verdeckt; Zahl der Chips = Bestandteile.
§8 #4   Zahl der Kacheln je Tag = Zahl der Slots, die „Noch offen“ im Wochenskelett zeigt (aus der
        Plandatei nachgerechnet: gewählte Bestandteile mit ihrer Gruppe, offene mit allen Gruppen,
        bei A/B die Woche A). Unter 768 px ein Tag, sonst jeder Tag. Kacheln überlappen sich nicht,
        nirgends steht „+ N weitere“.
§8 #5   erste und letzte Stundenmarke ganz im Fenster, die erste nennt den frühesten Beginn; ab
        768 px jeder Tag mit Daten (Mo–Fr immer) im Fenster, darunter genau ein Tag.
§8 #6   jede Kachel ≥ 24 px breit und ≥ 20 px je Stunde ihrer Dauer hoch (Touch 22), also eine
        2-h-Kachel ≥ 40 bzw. 44 px. Die Stufen L/M/S nach Breite werden gezählt, nicht geprüft.
§8 #7   jedes sichtbare Bedienelement (außer Kacheln, siehe #6) ≥ 24 × 24 px; bei pointer: coarse
        Knöpfe, Chips, Reiter, Segmente, Felder ≥ 44 × 44 px, Links ≥ 24 × 24 px (§5.11 nennt
        Links nicht unter den 44-px-Zielen). Gesperrte Elemente zählen nicht.
§8 #8   (a) die Paare aus §5.5, nachgerechnet aus den CSS-Variablen der Seite, gegen die Spalte
        „Ziel“, ungerundet. (b) jeder sichtbare Text gegen seinen TATSÄCHLICHEN Hintergrund: Die
        Seite wird ein zweites Mal mit unsichtbarer Schrift fotografiert, je Text werden die Pixel
        hinter ihm gelesen und die Schriftfarbe (mit Deckkraft der Vorfahren) darauf gerechnet.
        Soll: WCAG 1.4.3, 4,5:1 (große Schrift 3:1). Ist der Hintergrund uneinheitlich (Verlauf,
        Bild, kein Farbton deckt 60 %) und reicht nicht schon der schlechteste Pixel, heißt der Text
        „unbestimmt“. Gesperrte Elemente sind ausgenommen (WCAG).
§8 #9   berechnete `font-size` aller sichtbaren Texte ⊆ {12, 14, 16} px, `font-weight` ⊆ {400, 600}.
§8 #10  nur ein Teil: Tab durch die ganze Seite. Jedes Bedienelement wird erreicht (Raster: eine
        Kachel genügt, Gruppen mit Pfeiltasten auch), jeder Fokus hat einen Ring ≥ 2 px mit ≥ 3:1
        gegen den Hintergrund des Elternelements, Enter auf einer Kachel öffnet einen Dialog, Esc
        schließt ihn, der Fokus steht danach wieder auf der Kachel.
§8 #12  Bytes aus dem Netz: HTML ≤ 10 KB, CSS ≤ 15 KB in einer Datei, JS ≤ 35 KB in ≤ 6 Dateien,
        Code zusammen gzip ≤ 20 KB, Plandatei ≤ 600 KB / gzip ≤ 60 KB (KB = 1000 Byte, gzip
        Stufe 6). Ein gedrosselter Lauf (390 × 844, CPU 4×, 150 ms RTT, 1,6 Mbit/s): LCP ≤ 1,5 s,
        CLS ≤ 0,02, TBT ≤ 50 ms, ≤ 6 Anfragen bis zur ersten Kachel. Keine fremde Anfrage.
§8 #13  bei prefers-reduced-motion: kein Übergang und keine Animation außer `opacity` (≤ 100 ms),
        auch nicht in der Karte nach einem Klick auf die erste Kachel.
§8 #14  Zoom 200 % (Fenster halbiert, doppelte Pixeldichte, wie der Zoom des Browsers) bei
        1280 × 800 und 1920 × 1080: keine zwei Texte überlappen, kein Text wird abgeschnitten.
§8 #15  der messbare Teil von §7: Zeichen statt Symbolen (✓ ↗ ▾ …, Emoji), Mittelpunkt-Ketten,
        Floskeln, Versalien, Laufweite ≠ 0, Monospace, Inter, Webfont, Verlauf, Glas/Unschärfe,
        Schatten außerhalb schwebender Ebenen, Pulsieren, farbiger Randstreifen, violetter Akzent
        außerhalb von Chips/Kacheln/Modulleiste, `transition: all`, Anheben beim Zeigen, nur ein
        Farbschema.
§8 #16  `localStorage` wirft: keine Ausnahme, Kacheln stehen, „… speichert die Auswahl nicht“ ist
        ohne Scrollen sichtbar.
§8 #17  Laden schreibt nichts (localStorage, sessionStorage, Cookie, IndexedDB; in JEDEM Lauf, auch
        mit vorhandener Auswahl). Nach einem Klick auf „Einplanen“ steht genau ein Schlüssel
        `stundenplanner:v1:…` mit nur `group`, `digest`, `name` je Bestandteil. Der Speicherhinweis
        ist in jedem Fenster ohne Scrollen sichtbar (§3.3).
§3.3    ohne Scrollen sichtbar: „Teilen“, „Kein offizielles Angebot“, Impressum, Datenschutz,
        Speicherhinweis, ab 768 px die Werkzeugleiste.
§6      Konsolenfehler, fehlgeschlagene Anfragen und HTTP ≥ 400: keine. DOM-Knoten mit allen
        Kacheln ≤ 1 200. Kein `style=`, kein Inline-Skript, kein `on…=` im ausgelieferten HTML.
        Keine `resize`-Hörer und kein ResizeObserver. Ohne JavaScript stehen Kopf, Raster und Fuß.
        Gemeldet (nicht geprüft): Zeit bis zur ersten Kachel, Zonenhöhen, Pixel je Stunde.

Grenzen — was dieses Werkzeug NICHT sagt
-----------------------------------------
- §8 #10 nur zum Teil (oben), §8 #11 Parität gar nicht: Das ist ein Durchlauf von Hand.
- Kein Lighthouse: LCP/CLS/TBT kommen aus PerformanceObserver unter Drosselung über das
  DevTools-Protokoll. Das ähnelt Lighthouse Mobil, ist aber nicht dieselbe Zahl.
- Kontrast: Text in Pseudo-Elementen (`::before`) und in SVG wird nicht gemessen, der Text in
  Auswahlfeldern nur über die gewählte Option. Text außerhalb des Fotos (ein Bereich, der innen
  scrollt) bleibt ungemessen und wird gezählt.
- „Abgeschnitten“ folgt nur `overflow`, `clip`, `clip-path` und `contain` der Vorfahren; ein
  absolut gesetztes Element, das einem `overflow: hidden` entkommt, wird trotzdem als abgeschnitten
  gerechnet.
- Touch heißt Chromium mit Touch-Emulation (pointer: coarse, hover: none), nicht Safari auf einem
  iPhone. Fenstermaße sind der Anzeigebereich ohne Browserleisten.
- Die AI tells aus §7 sind nur so weit geprüft wie oben genannt; Sprache, Hilfstexte und
  Kommentare im Quelltext liest kein Skript.

Selbsttest
----------
    python3 -m unittest discover -s ops/tests_sicht
Prüfseiten mit bekannten Werten (Kontrast auf durchscheinendem Grund, Verlauf, verdeckte und
teilweise verdeckte Zeilen, Scrollen, außerhalb, abgeschnitten, gekürzt, Ziele, Haken, Stressfall).
Wer meldet, das Werkzeug messe falsch, bekommt erst eine Prüfseite, die den Fall nachstellt, dann
die Behebung (so geschehen mit den Meldungen von triebwerk am 05.10.2026).

Exit: 0 alles erfüllt · 1 etwas nicht erfüllt oder unbestimmt · 2 Aufruf, Daten oder Playwright fehlen.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import functools
import gzip
import hashlib
import html.parser
import http.server
import json
import math
import os
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[1]

# DESIGN.md §8, „Fenster“. Die Reihenfolge ist die der Tabelle in §3.4.
FENSTER = [(360, 640), (375, 667), (390, 844), (430, 932), (768, 1024), (865, 1021), (1024, 768),
           (1280, 720), (1280, 800), (1366, 657), (1440, 900), (1920, 1080), (2560, 1440)]
SCHEMEN = ('light', 'dark')
AUSWAHLEN = ('leer', 'halb', 'voll')
SCHRIFTGROESSEN = (12.0, 14.0, 16.0)            # §5.7
GEWICHTE = (400, 600)                            # §5.7
KB = 1000                                        # §1.2: „407 KB“ sind 407 402 Byte
BUDGET = {                                       # §6
    'html': 10 * KB, 'css': 15 * KB, 'css_dateien': 1, 'js': 35 * KB, 'js_dateien': 6,
    'code_gz': 20 * KB, 'daten': 600 * KB, 'daten_gz': 60 * KB, 'anfragen': 6,
    'lcp_ms': 1500, 'cls': 0.02, 'tbt_ms': 50, 'dom': 1200,
}


def aus_design(pfad: Path | None = None) -> tuple[list, dict, list]:
    """Fenster (§8) und Budget (§6) aus docs/DESIGN.md — dort stehen sie, und nur dort. Ändert
    jemand eine Zahl im Brief, misst das Werkzeug ohne Zutun gegen die neue (eine Quelle statt zwei,
    Axiom 0). Was sich nicht lesen lässt, bleibt bei der Vorgabe oben und wird gemeldet."""
    import re
    fenster, budget, fehlt = list(FENSTER), dict(BUDGET), []
    try:
        text = (pfad or WURZEL / 'docs' / 'DESIGN.md').read_text('utf-8')
    except OSError:
        return fenster, budget, ['docs/DESIGN.md nicht lesbar: Fenster und Budget aus ops/sicht.py']
    m = re.search(r'\*\*Fenster:\*\*(.*?)\. Jedes', text, re.S)
    gefunden = re.findall(r'(\d{3,4})\s*×\s*(\d{3,4})', m.group(1)) if m else []
    if gefunden:
        fenster = [(int(b), int(h)) for b, h in gefunden]
    else:
        fehlt.append('§8 „Fenster:“')
    teil = text.split('\n## 6.', 1)[1].split('\n## ', 1)[0] if '\n## 6.' in text else ''
    z = r'([\d][\d \u00a0\u202f]*(?:,\d+)?)'
    regeln = {
        'html': (r'^\| HTML \| ≤ ' + z + r' KB', KB), 'css': (r'^\| CSS \| ≤ ' + z + r' KB', KB),
        'js': (r'^\| JavaScript \| ≤ ' + z + r' KB', KB), 'js_dateien': (r'^\| JavaScript \|[^|\n]*höchstens (\d+) Dateien', 1),
        'code_gz': (r'^\| Code zusammen, komprimiert \| \**≤ ' + z + r' KB', KB),
        'daten': (r'^\| Datendatei des Plans \| ≤ ' + z + r' KB', KB),
        'daten_gz': (r'^\| Datendatei des Plans \|[^|\n]*komprimiert ≤ ' + z + r' KB', KB),
        'anfragen': (r'^\| Anfragen bis zum fertigen Raster \| ≤ (\d+)', 1),
        'cls': (r'^\| Layout-Verschiebung \(CLS\) \| ≤ ' + z, 1),
        'lcp_ms': (r'^\| Größter Inhalt \(LCP\)[^|\n]*\| ≤ ' + z + r' s', 1000),
        'tbt_ms': (r'^\| Blockierzeit \(TBT\) \| ≤ ' + z + r' ms', 1),
        'dom': (r'^\| DOM-Knoten[^|\n]*\| ≤ ' + z, 1),
    }
    for k, (muster, faktor) in regeln.items():
        t = re.search(muster, teil, re.M)
        if t:
            wert = float(re.sub(r'[ \u00a0\u202f]', '', t.group(1)).replace(',', '.')) * faktor
            budget[k] = int(wert) if float(wert).is_integer() else wert
        else:
            fehlt.append(f'§6 {k}')
    return fenster, budget, fehlt


STRESS_PFLICHT = {(1280, 720), (1280, 800), (1440, 900), (1920, 1080), (2560, 1440), (390, 844)}  # §8 #2
ZOOM_FENSTER = ((1280, 800), (1920, 1080))       # §8 #14

# §5.5: Paar, Vordergrund, Hintergrund, Ziel. „mN“ steht für alle acht Modulfarben (kleinster Wert).
KONTRAST_PAARE = [
    ('Text --grau-10 auf Seite --grau-2', '--grau-10', '--grau-2', 7),
    ('Text auf Karte --grau-1', '--grau-10', '--grau-1', 7),
    ('Zweittext --grau-9 auf Seite', '--grau-9', '--grau-2', 7),
    ('Zweittext auf Karte', '--grau-9', '--grau-1', 7),
    ('Kontextkachel: --grau-9 auf --grau-3', '--grau-9', '--grau-3', 4.5),
    ('Text --grau-10 auf hauch', '--grau-10', '--mN-hauch', 7),
    ('tinte auf flaeche', '--mN-tinte', '--mN-flaeche', 7),
    ('rand auf Seite', '--mN-rand', '--grau-2', 3),
    ('rand auf Karte', '--mN-rand', '--grau-1', 3),
    ('Rand der Eingabefelder --grau-7 auf Seite', '--grau-7', '--grau-2', 3),
    ('Symbole --grau-8 auf Seite', '--grau-8', '--grau-2', 3),
    ('Fokusring --grau-10 auf Seite', '--grau-10', '--grau-2', 3),
    ('Hauptaktion: --grau-1 auf --grau-10', '--grau-1', '--grau-10', 7),
    ('Konfliktring auf Seite', '--konflikt', '--grau-2', 3),
    ('Konflikttext auf Seite', '--konflikt-text', '--grau-2', 4.5),
    ('Konflikttext auf Konfliktfläche', '--konflikt-text', '--konflikt-flaeche', 4.5),
    ('Hinweissymbol auf Seite', '--hinweis', '--grau-2', 3),
    ('Hinweistext auf Hinweisfläche', '--hinweis-text', '--hinweis-flaeche', 4.5),
]


def token_namen() -> list[str]:
    namen = set()
    for _, v, h, _ in KONTRAST_PAARE:
        for t in (v, h):
            namen.update([t.replace('mN', f'm{i}') for i in range(1, 9)] if 'mN' in t else [t])
    return sorted(namen)


# Was die Seite immer ohne Scrollen zeigen muss (§3.3, §4.2 Schritt 11). Kleinbuchstaben.
PFLICHT = [
    {'id': 'teilen', 'name': '„Teilen“', 'texte': ['teilen'], 'bedien': True},
    {'id': 'inoffiziell', 'name': '„Kein offizielles Angebot“', 'texte': ['kein offizielles angebot'], 'bedien': False},
    {'id': 'impressum', 'name': 'Impressum', 'texte': ['impressum'], 'bedien': True},
    {'id': 'datenschutz', 'name': 'Datenschutz', 'texte': ['datenschutz'], 'bedien': True},
    {'id': 'speicher', 'name': 'Speicherhinweis',
     'texte': ['nur in diesem browser gespeichert', 'speichert die auswahl nicht'], 'bedien': False},
]

# ---------------------------------------------------------------------------------------------
# JavaScript, das in der Seite läuft
# ---------------------------------------------------------------------------------------------

# Vor jedem Skript der Seite: zählt Schreibzugriffe auf Speicher, resize-Hörer, ResizeObserver,
# die letzte DOM-Änderung (für „ruhig“), die erste Kachel und die Leistungseinträge.
INSTRUMENT_JS = r"""
(() => {
  const w = window;
  const log = w.__sicht = { schreiben: [], resize: 0, ro: 0, mm: 0, letzte: 0, ersteKachel: null,
                            cls: 0, lcp: null, lang: [] };
  try {
    const S = Storage.prototype;
    for (const n of ['setItem', 'removeItem', 'clear']) {
      const o = S[n];
      S[n] = function (...a) {
        let art = 'localStorage'; try { if (this === w.sessionStorage) art = 'sessionStorage'; } catch (e) {}
        log.schreiben.push({ art, was: n, schluessel: String(a[0] ?? '') });
        return o.apply(this, a);
      };
    }
  } catch (e) {}
  try {
    const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true,
      get() { return d.get.call(this); },
      set(v) { log.schreiben.push({ art: 'cookie', was: 'set', schluessel: String(v).split('=')[0] }); return d.set.call(this, v); } });
  } catch (e) {}
  try {
    const o = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...a) { log.schreiben.push({ art: 'indexedDB', was: 'open', schluessel: String(a[0]) }); return o.apply(this, a); };
  } catch (e) {}
  const ael = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t, ...r) {
    if (t === 'resize' && (this === w || this === w.visualViewport)) log.resize++;
    if (t === 'change' && typeof MediaQueryList !== 'undefined' && this instanceof MediaQueryList) log.mm++;
    return ael.call(this, t, ...r);
  };
  try { const RO = w.ResizeObserver; w.ResizeObserver = class extends RO { constructor(...a) { super(...a); log.ro++; } }; } catch (e) {}
  new MutationObserver(() => {
    log.letzte = performance.now();
    if (log.ersteKachel === null && document.querySelector('[data-sicht="kachel"]')) log.ersteKachel = performance.now();
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) log.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { const es = l.getEntries(); if (es.length) log.lcp = es[es.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) log.lang.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
})();
"""

# §8 #16: wie ein privates Fenster mit gesperrten Website-Daten — schon der Zugriff wirft.
OHNE_SPEICHER_JS = r"""
(() => {
  for (const n of ['localStorage', 'sessionStorage']) {
    try { Object.defineProperty(window, n, { configurable: true, get() { throw new DOMException('Speicher gesperrt (sicht.py)', 'SecurityError'); } }); } catch (e) {}
  }
})();
"""

# Gemeinsame Helfer für alle Messungen in der Seite.
HELFER_JS = r"""
const W = innerWidth, H = innerHeight;
const de = document.documentElement, body = document.body;
const _cs = new Map();
const cs = (el) => { let s = _cs.get(el); if (!s) { s = getComputedStyle(el); _cs.set(el, s); } return s; };
const vis = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
const kurz = (s, n = 50) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const name = (el) => {
  let s = el.tagName.toLowerCase();
  if (el.id) s += '#' + el.id;
  else if (el.classList && el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
  if (el.dataset && el.dataset.sicht) s += '[' + el.dataset.sicht + ']';
  const t = kurz(el.getAttribute('aria-label') || el.textContent, 32);
  return t ? s + ' „' + t + '“' : s;
};
const BEDIEN = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=radio], [role=switch], [role=checkbox], [role=option], [role=menuitem], [role=menuitemradio], [role=slider], [tabindex]:not([tabindex="-1"])';
const DIALOG = 'dialog, [role=dialog], [role=alertdialog]';
const _cv = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
const _fc = new Map();
// Farbe als [r, g, b, a] (0–255, a 0–1). Berechnete Farben sind rgb()/rgba(); alles andere
// (Hex aus Variablen, oklch, color()) rechnet die Leinwand des Browsers in sRGB um.
const farbe = (s) => {
  if (!s) return null;
  s = s.trim();
  if (_fc.has(s)) return _fc.get(s);
  let r = null;
  const m = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
  if (m) r = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : (m[5] ? +m[4] / 100 : +m[4])];
  else {
    _cv.fillStyle = '#010203'; _cv.fillStyle = s;
    if (String(_cv.fillStyle) !== '#010203' || s.toLowerCase() === '#010203') {
      _cv.clearRect(0, 0, 1, 1); _cv.fillRect(0, 0, 1, 1);
      const d = _cv.getImageData(0, 0, 1, 1).data; r = [d[0], d[1], d[2], d[3] / 255];
    }
  }
  _fc.set(s, r); return r;
};
const box = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
const flaeche = (b) => b ? Math.max(0, b.r - b.l) * Math.max(0, b.b - b.t) : 0;
const KEIN = { l: 0, t: 0, r: 0, b: 0, leer: true };
const schnitt = (a, c) => {
  if (!a) return null; if (!c) return a; if (c.leer) return null;
  const l = Math.max(a.l, c.l), t = Math.max(a.t, c.t), r = Math.min(a.r, c.r), b = Math.min(a.b, c.b);
  return r > l && b > t ? { l, t, r, b } : null;
};
// Der Bereich, in dem die KINDER eines Elements sichtbar sein können: Schnitt der Boxen aller
// Vorfahren mit overflow/clip/contain. Das Fenster selbst zählt nicht (das misst „außerhalb“).
// body gibt sein overflow an das Fenster ab, wenn html es nicht setzt (CSS Overflow §3.3).
// hart = nur was wirklich abschneidet (hidden, clip, clip-path, contain), nicht ein Bereich, den
// man scrollen kann: Was dort aus dem Blick gescrollt ist, ist erreichbar und zählt als „innen
// scrollend“, nicht als „abgeschnitten“.
const _kc = new Map(), _kh = new Map();
const kinderClip = (el, hart = false) => {
  if (!el || el === de || el.nodeType !== 1) return null;
  const cache = hart ? _kh : _kc;
  if (cache.has(el)) return cache.get(el);
  const s = cs(el);
  let c = s.position === 'fixed' ? null : kinderClip(el.parentElement, hart);
  if (!(c && c.leer)) {
    const scrollt = (x) => x === 'auto' || x === 'scroll';
    const ueber = (s.overflowX !== 'visible' || s.overflowY !== 'visible') && !(hart && (scrollt(s.overflowX) || scrollt(s.overflowY)));
    const abgegeben = el === body && cs(de).overflowX === 'visible' && cs(de).overflowY === 'visible';
    const clipt = (ueber && !abgegeben) || (s.clipPath && s.clipPath !== 'none') || (s.clip && s.clip !== 'auto') || /paint|strict|content/.test(s.contain);
    if (clipt && s.display !== 'contents') c = schnitt(box(el.getBoundingClientRect()), c) || KEIN;
  }
  cache.set(el, c); return c;
};
const ganz = (b) => b.l >= -0.5 && b.t >= -0.5 && b.r <= W + 0.5 && b.b <= H + 0.5;
// Verdeckt an einem Punkt: Liegt über dem Element etwas, das dort MALT (Fläche, Bild)? Der Stapel
// aus elementsFromPoint, von oben; durchsichtige Hüllen und unsichtbare Elemente zählen nicht.
// Damit Meldungen mit pointer-events: none nicht unsichtbar bleiben, schaltet zeigbar(true) für die
// Dauer der Messung alle Elemente treffbar (gesehen am 05.10.2026: die Meldung beim ersten Laden).
const malt = (e) => {
  if (/^(IMG|SVG|VIDEO|CANVAS|IFRAME)$/i.test(e.tagName)) return true;
  const s = cs(e), c = farbe(s.backgroundColor);
  return (c && c[3] > 0.1) || s.backgroundImage !== 'none';
};
const verdecktAn = (el, x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  for (const e of document.elementsFromPoint(x, y)) {
    if (e === el || el.contains(e) || e.contains(el)) return false;
    if (!vis(e)) continue;
    if (malt(e)) return true;
  }
  return false;
};
const verdeckt = (el, b) => verdecktAn(el, (b.l + b.r) / 2, (b.t + b.b) / 2);
const zeigbar = (an) => {
  if (an) {
    try {
      const sh = new CSSStyleSheet(); sh.replaceSync('*, *::before, *::after { pointer-events: auto !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh]; window.__sichtZeig = sh;
    } catch (e) {}
  } else if (window.__sichtZeig) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== window.__sichtZeig); window.__sichtZeig = null;
  }
};
const hatText = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true; return false; };
const gesperrt = (el) => !!el.closest('[disabled], [aria-disabled="true"], [inert]') || (el.matches && el.matches(':disabled'));
const _op = new Map();
const deckkraft = (el) => {
  if (!el || el.nodeType !== 1) return 1;
  if (_op.has(el)) return _op.get(el);
  const v = parseFloat(cs(el).opacity) * deckkraft(el.parentElement); _op.set(el, v); return v;
};
const oklch = (c) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = f(c[0]), G = f(c[1]), B = f(c[2]);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  let h = Math.atan2(Bb, A) * 180 / Math.PI; if (h < 0) h += 360;
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, Math.hypot(A, Bb), h];
};
// Alle sichtbaren Texte mit ihren Zeilenboxen (beschnitten durch die Vorfahren).
const texteSammeln = () => {
  const out = [];
  const IGNOR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'OPTION', 'OPTGROUP', 'SELECT', 'TEXTAREA']);
  const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const rg = document.createRange();
  const eintrag = (el, text, roh) => {
    const c = kinderClip(el), ch = kinderClip(el, true);
    const fs = parseFloat(cs(el).fontSize) || 16;
    const rects = []; let fr = 0, fc = 0, ab = false;
    for (const b of roh) {
      if (b.r - b.l < 0.5 || b.b - b.t < 0.5) continue;
      fr += flaeche(b);
      const xh = schnitt(b, ch);
      if (xh) fc += flaeche(xh);
      // Abgeschnitten heißt: seitlich mehr als 1 px weg, oder oben/unten mehr als der Rand, den
      // die Zeilenbox über die Schriftgröße hinaus hat. Die Box eines Textes ist höher als seine
      // Buchstaben (Ober- und Unterlänge des Fonts); eine Zeilenhöhe von 16 px bei 14-px-Schrift
      // schneidet nur Luft ab (gesehen an „Noch offen“, 05.10.2026).
      const luft = Math.max(0, ((b.b - b.t) - fs) / 2) + 0.5;
      if (!xh || (b.r - b.l) - (xh.r - xh.l) > 1 || xh.t - b.t > luft || b.b - xh.b > luft) ab = true;
      const x = schnitt(b, c);
      if (x && x.r - x.l >= 1.5 && x.b - x.t >= 1.5) rects.push(x);
    }
    // „…“ durch text-overflow: Die Zeilenbox endet am Rand, der Rest des Textes fehlt trotzdem.
    const gekuerzt = [el, el.parentElement].some((e) => e && e.nodeType === 1 && cs(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 0.5);
    // Ein Clip unter 4 px² ist „nur für Screenreader“ (sr-only), kein sichtbarer Text.
    if (!rects.length || (c && !c.leer && flaeche(c) < 4)) return;
    // Verdeckt: Was ein fremdes Element (eine Meldung, ein Blatt) überdeckt, sieht man nicht; sein
    // Kontrast gegen das, was darüber liegt, wäre Unsinn (gesehen an der Meldung beim ersten Laden:
    // Kachelschrift „gegen“ die Tinte der Meldung, 1:1). Erst fünf Punkte je Zeile; ist einer davon
    // verdeckt, wird die Zeile in Zellen (bis 16 × 4) zerlegt, und gemessen wird nur der Kern der
    // freien Zellen. Auch eine TEILWEISE verdeckte Zeile mischt so keine fremden Pixel bei
    // (triebwerk, 05.10.2026: die Meldung deckte nur den Rand einer Zeile).
    const inFenster = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const frei = []; let gedeckt = false;
    for (const b of rects) {
      const pkt = [[b.l + 1, b.t + 1], [b.r - 1, b.t + 1], [(b.l + b.r) / 2, (b.t + b.b) / 2], [b.l + 1, b.b - 1], [b.r - 1, b.b - 1]];
      if (!pkt.some(([x, y]) => inFenster(x, y) && verdecktAn(el, x, y))) { frei.push(b); continue; }
      gedeckt = true;
      const n = Math.max(1, Math.min(16, Math.round((b.r - b.l) / 8))), z = 4;
      const w = (b.r - b.l) / n, h = (b.b - b.t) / z;
      for (let i = 0; i < n; i++) for (let j = 0; j < z; j++) {
        const x = b.l + (i + 0.5) * w, y = b.t + (j + 0.5) * h;
        const kern = { l: x - w / 4, t: y - h / 4, r: x + w / 4, b: y + h / 4 };
        // Mitte UND Ecken des Kerns frei: Ein Kern, dessen Mitte knapp neben der Kante der
        // Meldung liegt, ragte sonst mit einer Pixelreihe unter sie (triebwerk: „2“ bei 360 × 640).
        const ecken = [[x, y], [kern.l, kern.t], [kern.r, kern.t], [kern.l, kern.b], [kern.r, kern.b]];
        if (ecken.some(([px, py]) => inFenster(px, py) && verdecktAn(el, px, py))) continue;
        frei.push(kern);
      }
    }
    const verdeckt = frei.length === 0;
    rects.splice(0, rects.length, ...frei);
    const s = cs(el);
    out.push({ el, text: kurz(text, 60), name: name(el), groesse: parseFloat(s.fontSize),
      gewicht: parseInt(s.fontWeight, 10), familie: s.fontFamily, trans: s.textTransform,
      laufweite: s.letterSpacing,
      farbe: farbe(s.getPropertyValue('-webkit-text-fill-color')) || farbe(s.color),
      deck: deckkraft(el), gesperrt: gesperrt(el), dialog: !!el.closest(DIALOG), verdeckt, teilverdeckt: gedeckt && !verdeckt,
      rects, anteil: fr ? fc / fr : 1, abgeschnitten: ab || gekuerzt, gekuerzt });
  };
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = n.nodeValue; if (!t || !t.trim()) continue;
    const el = n.parentElement; if (!el || IGNOR.has(el.tagName) || el.closest('svg')) continue;
    if (!vis(el)) continue;
    rg.selectNodeContents(n);
    eintrag(el, t, [...rg.getClientRects()].map(box));
  }
  // Der Text in Auswahl- und Eingabefeldern liegt im Schattenbaum des Browsers: die Inhaltsbox.
  for (const el of document.querySelectorAll('select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=image])')) {
    if (!vis(el)) continue;
    const text = el.tagName === 'SELECT' ? (el.selectedOptions[0] ? el.selectedOptions[0].textContent : '') : (el.value || el.placeholder || '');
    if (!text.trim()) continue;
    const s = cs(el), r = el.getBoundingClientRect(), p = (k) => parseFloat(s[k]) || 0;
    eintrag(el, text, [{ l: r.left + p('paddingLeft') + p('borderLeftWidth'), t: r.top + p('paddingTop') + p('borderTopWidth'),
      r: r.right - p('paddingRight') - p('borderRightWidth'), b: r.bottom - p('paddingBottom') - p('borderBottomWidth') }]);
  }
  return out;
};
"""

# Die Messung eines Laufs: alles, was ohne Klick zu sehen ist.
MESSEN_JS = "(opt) => {\n" + HELFER_JS + r"""
const seite = document.scrollingElement || de;
zeigbar(true);
const texte = texteSammeln();
const alle = [...body.querySelectorAll('*')];

// Außerhalb, innen scrollend, abgeschnitten, AI tells — ein Durchgang über alle Elemente.
let aussen = 0; const aussenBsp = [];
const innen = []; const abgeschnitten = [];
const tells = []; const tellSchon = new Set();
const tell = (art, el, mehr) => { const k = art + '|' + (el ? name(el) : ''); if (tellSchon.has(k)) return; tellSchon.add(k); tells.push({ art, el: el ? name(el) : '', mehr: mehr || '' }); };
const _sw = new Map();
const schwebend = (el) => {
  if (!el || el === body || el === de) return false;
  if (_sw.has(el)) return _sw.get(el);
  const v = cs(el).position === 'fixed' || el.matches(DIALOG + ', [popover]') || schwebend(el.parentElement);
  _sw.set(el, v); return v;
};
const MODULFARBE_OK = '[data-sicht="chip"], [data-sicht="kachel"], [data-sicht="module"]';
const STOPP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'TITLE', 'BR', 'WBR']);
for (const el of [de, body]) {
  const s = cs(el);
  if (/gradient\(|url\(/.test(s.backgroundImage)) tell('Verlauf oder Muster im Seitengrund', el, s.backgroundImage.slice(0, 60));
}
for (const el of alle) {
  if (STOPP.has(el.tagName)) continue;
  const inSvg = el.closest('svg'); if (inSvg && inSvg !== el) continue;
  if (!vis(el)) continue;
  const s = cs(el);
  const text = hatText(el);
  const bedien = el.matches(BEDIEN);
  const roh = box(el.getBoundingClientRect());
  if (roh.r - roh.l < 0.5 && roh.b - roh.t < 0.5) continue;
  const clip = kinderClip(el.parentElement);
  const sicht = schnitt(roh, clip);
  // außerhalb: Blätter (Text, Bedienelement, Bild, Symbol), deren SICHTBARER Teil aus dem Fenster ragt
  if ((text || bedien || /^(IMG|SVG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName)) && sicht && !(clip && flaeche(clip) < 4)) {
    if (sicht.l < -0.5 || sicht.t < -0.5 || sicht.r > W + 0.5 || sicht.b > H + 0.5) {
      aussen++;
      if (aussenBsp.length < 6) aussenBsp.push(name(el) + ' bei ' + Math.round(sicht.l) + ',' + Math.round(sicht.t));
    }
  }
  // innen scrollend (außer in Dialogen, Karten, Blättern)
  const sy = (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
  const sx = (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  if ((sx || sy) && el !== body && el !== de && !el.closest(DIALOG)) innen.push({ el: name(el), x: sx ? el.scrollWidth - el.clientWidth : 0, y: sy ? el.scrollHeight - el.clientHeight : 0 });
  // abgeschnitten: Chips, Kacheln, Stundenmarken, Tage, Bedienelemente, die ein Vorfahr beschneidet
  const wichtig = bedien || (el.dataset && /^(chip|kachel|stunde|tag)$/.test(el.dataset.sicht || ''));
  if (wichtig && !(clip && flaeche(clip) < 4) && !gesperrt(el)) {
    const f = flaeche(roh), hart = schnitt(roh, kinderClip(el.parentElement, true));
    if (f > 4 && flaeche(hart) < 0.98 * f && !el.closest(DIALOG)) abgeschnitten.push(name(el) + ' (' + Math.round(100 * flaeche(hart) / f) + ' % sichtbar)');
  }
  // AI tells (§7), soweit sie im berechneten Stil stehen
  if (s.boxShadow !== 'none' && !schwebend(el) && !el.matches(':focus')) tell('Schatten auf der flachen Seite', el, s.boxShadow);
  if (/gradient\(/.test(s.backgroundImage)) tell('Verlauf', el);
  if ((s.backdropFilter && s.backdropFilter !== 'none') || /blur\(/.test(s.filter)) tell('Glas oder Unschärfe', el);
  if (text && s.textTransform === 'uppercase') tell('Versalien', el);
  if (text && s.letterSpacing !== 'normal' && parseFloat(s.letterSpacing) !== 0) tell('Laufweite ≠ 0', el, s.letterSpacing);
  if (text && /mono|courier|consolas|menlo|monaco/i.test(s.fontFamily)) tell('Monospace', el, s.fontFamily);
  if (text && /^["']?inter["']?$/i.test(s.fontFamily.split(',')[0].trim())) tell('Inter', el);
  if (s.animationName !== 'none' && /infinite/.test(s.animationIterationCount)) tell('dauernde Animation (Pulsieren)', el, s.animationName);
  const tp = s.transitionProperty.split(',').map((x) => x.trim()), td = s.transitionDuration.split(',').map((x) => parseFloat(x) || 0);
  if (tp.some((p, i) => p === 'all' && (td[i % td.length] || 0) > 0)) tell('transition: all', el);
  const bw = ['Top', 'Right', 'Bottom', 'Left'].map((k) => (s['border' + k + 'Style'] === 'none' ? 0 : parseFloat(s['border' + k + 'Width']) || 0));
  const breitest = Math.max(...bw), seiten = bw.filter((x) => x === breitest).length, zweit = [...bw].sort((a, b) => b - a)[1];
  if (breitest >= 2 && seiten === 1 && breitest >= 2 * Math.max(zweit, 0.5)) {
    const k = ['Top', 'Right', 'Bottom', 'Left'][bw.indexOf(breitest)];
    const c = farbe(s['border' + k + 'Color']);
    if (c && c[3] > 0.2 && oklch(c)[1] >= 0.05) tell('farbiger Streifen am Rand', el, k.toLowerCase() + ' ' + breitest + ' px');
  }
  if (!el.closest(MODULFARBE_OK)) {
    const pruef = [];
    if (text) pruef.push(['Schrift', s.color]);
    pruef.push(['Fläche', s.backgroundColor]);
    if (bw.some((x) => x > 0)) pruef.push(['Rand', s.borderTopColor]);
    for (const [wo, wert] of pruef) {
      const c = farbe(wert);
      if (!c || c[3] < 0.2) continue;
      const [, C, h] = oklch(c);
      if (C >= 0.06 && h >= 265 && h <= 330) { tell('violetter Akzent', el, wo + ' ' + wert); break; }
    }
  }
}
// Zeichen statt Symbole, Mittelpunkt-Ketten, Floskeln: im sichtbaren Text
const SYMBOL = /[←-⇿⌀-⏿■-◿☀-➿⬀-⯿‹›]|(?![©®™])\p{Extended_Pictographic}/u;
const FLOSKEL = /\b(nahtlos|entdecke|mühelos|willkommen|revolution\w*|im handumdrehen|kinderleicht)\b|deine woche\. dein plan/i;
for (const t of texte) {
  if (SYMBOL.test(t.text)) tell('Zeichen als Symbol', t.el, t.text.match(SYMBOL)[0]);
  if (/\s[·•]\s/.test(t.el.textContent || '')) tell('Mittelpunkt-Kette', t.el);
  if (FLOSKEL.test(t.text)) tell('Floskel', t.el, t.text);
}
for (const el of document.querySelectorAll('button, a[href], [role=button]')) {
  if (!vis(el)) continue;
  let eigen = ''; for (const n of el.childNodes) if (n.nodeType === 3) eigen += n.nodeValue;
  eigen = eigen.trim();
  if (eigen.length === 1 && !/[\p{L}\p{N}]/u.test(eigen)) tell('Zeichen als Symbol', el, eigen);
}
for (const el of document.querySelectorAll('[aria-label], button, a')) {
  if (!vis(el)) continue;
  const t = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '');
  if (/[←-⇿]/.test(t) && (el.matches('button, a') || el.getAttribute('role') === 'button')) tell('Pfeil an Knopf oder Link', el);
}
// Statisch in den Stilregeln: transition: all, Anheben beim Zeigen, Webfonts
const statisch = { transitionAll: [], hoverHeben: [], webfont: [], unlesbar: 0 };
const regeln = (rs) => {
  for (const r of rs) {
    if (r.constructor.name === 'CSSFontFaceRule') statisch.webfont.push(kurz(r.cssText, 90));
    if (r.constructor.name === 'CSSStyleRule') {
      const st = r.style;
      const tp = (st.transitionProperty || '').split(',').map((x) => x.trim());
      const td = (st.transitionDuration || '').split(',').map((x) => parseFloat(x) || 0);
      if (tp.some((p, i) => p === 'all' && (td[i % td.length] || 0) > 0)) statisch.transitionAll.push(r.selectorText);
      if (/:hover/.test(r.selectorText) && /scale|translate/.test([st.transform, st.scale, st.translate].join(' '))) statisch.hoverHeben.push(r.selectorText);
    }
    if (r.cssRules) regeln(r.cssRules);
  }
};
for (const sh of document.styleSheets) { try { regeln(sh.cssRules); } catch (e) { statisch.unlesbar++; } }

// Ziele (§8 #7) — ohne Kacheln, die misst #6
const ziele = [];
for (const el of document.querySelectorAll(BEDIEN)) {
  if (el.closest('[data-sicht="kachel"]') || !vis(el)) continue;
  let r = box(el.getBoundingClientRect());
  const lab = el.tagName === 'INPUT' && el.closest('label');
  if (lab) { const q = box(lab.getBoundingClientRect()); r = { l: Math.min(r.l, q.l), t: Math.min(r.t, q.t), r: Math.max(r.r, q.r), b: Math.max(r.b, q.b) }; }
  const c = kinderClip(el.parentElement);
  if (r.r - r.l < 1.5 || r.b - r.t < 1.5 || (c && flaeche(c) < 4) || !schnitt(r, c)) continue;
  ziele.push({ name: name(el), b: r.r - r.l, h: r.b - r.t, link: el.matches('a[href], [role=link]'), gesperrt: gesperrt(el), dialog: !!el.closest(DIALOG) });
}

// Haken
const haken = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((el) => {
  const roh = box(el.getBoundingClientRect());
  const sicht = schnitt(roh, kinderClip(el.parentElement));
  return { name: name(el), tag: el.dataset.tag ?? null, start: el.dataset.start ?? null, ende: el.dataset.ende ?? null,
    text: kurz(el.textContent, 12), l: roh.l, t: roh.t, b: roh.r - roh.l, h: roh.b - roh.t,
    ganz: !!sicht && ganz(roh) && flaeche(sicht) >= 0.98 * flaeche(roh), frei: !!sicht && !verdeckt(el, sicht) };
}).filter((x) => x.b > 0 && x.h > 0);
const zonen = {};
for (const z of ['kopf', 'module', 'werkzeug', 'raster', 'fuss']) {
  const el = [...document.querySelectorAll('[data-sicht="' + z + '"]')].find(vis);
  if (el) { const r = box(el.getBoundingClientRect()); zonen[z] = { t: r.t, h: r.b - r.t, ganz: ganz(r) }; }
}

// Pflicht ohne Scrollen (§3.3)
const kandidaten = [];
for (const t of texte) kandidaten.push([t.el, (t.el.textContent || '').toLowerCase()]);
for (const el of document.querySelectorAll('[aria-label], [title]')) kandidaten.push([el, ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase()]);
const pflicht = {};
for (const nd of opt.pflicht) {
  let bestes = null;
  for (let [el, t] of kandidaten) {
    if (!nd.texte.some((x) => t.includes(x))) continue;
    if (nd.bedien) { el = el.closest('a[href], button, [role=button], [role=link]'); if (!el) continue; }
    if (!vis(el)) continue;
    const r = box(el.getBoundingClientRect()), c = schnitt(r, kinderClip(el.parentElement));
    if (c && ganz(r) && !verdeckt(el, c)) { bestes = { ok: true, el: name(el) }; break; }
    if (!bestes) bestes = { ok: false, el: name(el), wo: [Math.round(r.l), Math.round(r.t)] };
  }
  pflicht[nd.id] = bestes || { ok: false, fehlt: true };
}

const tok = {};
for (const n of opt.tokens) { const v = getComputedStyle(de).getPropertyValue(n).trim(); tok[n] = v ? farbe(v) : null; }
const log = window.__sicht || null;
zeigbar(false);
return {
  W, H, seite: { h: seite.scrollHeight, b: seite.scrollWidth }, scroll: [scrollX, scrollY],
  coarse: matchMedia('(pointer: coarse)').matches, dunkel: matchMedia('(prefers-color-scheme: dark)').matches,
  aussen, aussenBsp, innen, abgeschnitten, tells, statisch, ziele,
  texte: texte.map(({ el, ...x }) => x),
  chips: haken('[data-sicht="chip"]'), kacheln: haken('[data-sicht="kachel"]'),
  stunden: haken('[data-sicht="stunde"]'), tage: haken('[data-sicht="tag"]'), zonen,
  weitere: /\+\s*\d+\s*weitere/i.test(body.innerText),
  pflicht, tokens: tok, grund: [farbe(cs(de).backgroundColor), farbe(cs(body).backgroundColor)],
  dom: document.getElementsByTagName('*').length,
  log: log ? { schreiben: log.schreiben, resize: log.resize, ro: log.ro, mm: log.mm, letzte: log.letzte, ersteKachel: log.ersteKachel } : null,
};
}"""

# Schrift unsichtbar machen, ohne currentColor (Ränder, SVG) zu ändern: -webkit-text-fill-color.
# Erst über eine konstruierte Stilvorlage (die CSP der Seite verbietet <style>), sonst je Element
# über das CSSOM (erlaubt).
VERSTECKEN_JS = r"""
(an) => {
  const regel = ['-webkit-text-fill-color', 'transparent'], weitere = [['text-shadow', 'none'], ['text-decoration-color', 'transparent'], ['caret-color', 'transparent']];
  if (an) {
    try {
      const sh = new CSSStyleSheet();
      sh.replaceSync('*, *::before, *::after, *::placeholder, *::marker { -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh]; window.__sichtBlatt = sh;
    } catch (e) {}
    const probe = getComputedStyle(document.body).getPropertyValue('-webkit-text-fill-color');
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(probe)) {
      window.__sichtInline = true;
      for (const el of document.querySelectorAll('*')) { el.style.setProperty(regel[0], regel[1], 'important'); for (const [k, v] of weitere) el.style.setProperty(k, v, 'important'); }
      return 'inline';
    }
    return 'blatt';
  }
  if (window.__sichtBlatt) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== window.__sichtBlatt);
  if (window.__sichtInline) for (const el of document.querySelectorAll('*')) { el.style.removeProperty(regel[0]); for (const [k] of weitere) el.style.removeProperty(k); }
  return 'aus';
}
"""

# Läuft in einer leeren Hilfsseite (ohne die CSP der Seite): liest die Pixel hinter jedem Text
# aus dem Foto ohne Schrift und rechnet den WCAG-Kontrast der Schriftfarbe darauf.
PIXEL_JS = r"""
async ({ png, items }) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const cx = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, W, H).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const q = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return items.map((it) => {
    const [fr, fg, fb, fa] = it.f;
    // Der „Grund“ ist die häufigste Kontraststufe (Schritt 0,05), nicht die häufigste Farbe: Ein
    // Muster aus fast gleichen Farben (1 Stufe Unterschied) ist für das Auge ein Grund.
    const ks = []; const zahl = new Map();
    for (const [x, y, w, h] of it.r) {
      // Nur Pixel, die GANZ in der Box liegen: Eine angeschnittene Randreihe gehört schon zum
      // Nachbarn (einer Meldung, einer Kante). Ist die Box schmaler als ein Pixel, das mittlere.
      let x0 = Math.max(0, Math.ceil(x - 0.01)), y0 = Math.max(0, Math.ceil(y - 0.01));
      let x1 = Math.min(W, Math.floor(x + w + 0.01)), y1 = Math.min(H, Math.floor(y + h + 0.01));
      if (x1 <= x0) { x0 = Math.min(W - 1, Math.max(0, Math.floor(x + w / 2))); x1 = x0 + 1; }
      if (y1 <= y0) { y0 = Math.min(H - 1, Math.max(0, Math.floor(y + h / 2))); y1 = y0 + 1; }
      // Jedes Pixel (bis 40 000 je Zeile): Ein Raster mit Schritt trifft Linien im Hintergrund
      // (Stundenlinien, Musterlinien) über- oder unterproportional und verzerrt den Grund.
      const st = Math.max(1, Math.ceil(Math.sqrt((x1 - x0) * (y1 - y0) / 40000)));
      for (let yy = y0; yy < y1; yy += st) for (let xx = x0; xx < x1; xx += st) {
        const i = (yy * W + xx) * 4, br = d[i], bg = d[i + 1], bb = d[i + 2];
        const v = q(L(fr * fa + br * (1 - fa), fg * fa + bg * (1 - fa), fb * fa + bb * (1 - fa)), L(br, bg, bb));
        ks.push(v);
        const k = Math.round(v * 20), z = zahl.get(k);
        if (z) { z[0]++; z[1] += v; } else zahl.set(k, [1, v, br, bg, bb]);
      }
    }
    if (!ks.length) return null;
    ks.sort((a, b) => a - b);
    let mz = null; for (const z of zahl.values()) if (!mz || z[0] > mz[0]) mz = z;
    const mn = mz[0];
    const gruende = [...zahl.values()].filter((z) => z[0] >= 0.15 * ks.length).map((z) => [z[0] / ks.length, z[1] / z[0], [z[2], z[3], z[4]]]);
    let unter = 0; for (const k of ks) { if (k < it.soll) unter++; else break; }
    return { n: ks.length, p02: ks[Math.floor(ks.length * 0.02)], min: ks[0], anteil: mn / ks.length, unter: unter / ks.length,
      modus: mz[1] / mz[0], grund: [mz[2], mz[3], mz[4]], gruende };
  });
}
"""

# §8 #13: Übergänge und Animationen unter prefers-reduced-motion (Elemente und Pseudo-Elemente).
BEWEGUNG_JS = "() => {\n" + HELFER_JS + r"""
const out = []; const schon = new Set();
const keyframes = new Map();
const lies = (rs) => { for (const r of rs) { if (r.constructor.name === 'CSSKeyframesRule') { const p = new Set(); for (const k of r.cssRules) for (let i = 0; i < k.style.length; i++) p.add(k.style[i]); keyframes.set(r.name, [...p]); } if (r.cssRules) lies(r.cssRules); } };
for (const sh of document.styleSheets) { try { lies(sh.cssRules); } catch (e) {} }
const melde = (wer, was) => { const k = wer + was; if (!schon.has(k)) { schon.add(k); out.push(wer + ': ' + was); } };
const OK = new Set(['opacity', 'visibility', 'display', 'overlay', 'content-visibility']);
for (const el of document.querySelectorAll('*')) {
  for (const pseudo of [null, '::before', '::after']) {
    const s = pseudo ? getComputedStyle(el, pseudo) : cs(el);
    if (pseudo && (s.content === 'none' || s.content === 'normal')) continue;
    const tp = s.transitionProperty.split(',').map((x) => x.trim()), td = s.transitionDuration.split(',').map((x) => parseFloat(x) * (/ms/.test(x) ? 1 : 1000) || 0);
    tp.forEach((p, i) => {
      const dauer = td[i % td.length] || 0; if (dauer <= 0) return;
      if (!OK.has(p)) melde(name(el) + (pseudo || ''), 'Übergang auf ' + p + ' (' + dauer + ' ms)');
      else if (p === 'opacity' && dauer > 100) melde(name(el) + (pseudo || ''), 'Deckkraft ' + dauer + ' ms statt ≤ 100 ms');
    });
    if (s.animationName && s.animationName !== 'none' && parseFloat(s.animationDuration) > 0) {
      for (const a of s.animationName.split(',').map((x) => x.trim())) {
        const props = keyframes.get(a) || ['(unbekannt)'];
        const weg = props.filter((p) => !OK.has(p));
        if (weg.length) melde(name(el) + (pseudo || ''), 'Animation ' + a + ' bewegt ' + weg.join(', '));
      }
    }
  }
}
for (const a of document.getAnimations()) {
  const p = a.transitionProperty ? [a.transitionProperty] : (a.effect && a.effect.getKeyframes ? [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))] : []);
  const weg = p.filter((x) => !OK.has(x.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())));
  if (weg.length) melde('laufend ' + (a.effect && a.effect.target ? name(a.effect.target) : '?'), 'bewegt ' + weg.join(', '));
}
return out;
}"""

# §8 #14: Zoom 200 % — überlappende und abgeschnittene Texte.
ZOOM_JS = "() => {\n" + HELFER_JS + r"""
const texte = texteSammeln().filter((t) => !t.dialog);
const ab = [];
for (const t of texte) if (t.abgeschnitten) ab.push(t.name + (t.gekuerzt ? ' (mit … gekürzt)' : ' (' + Math.round(100 * t.anteil) + ' % sichtbar)'));
const boxen = [];
texte.forEach((t, i) => { for (const r of t.rects) boxen.push([i, r]); });
const ueber = [];
const N = Math.min(boxen.length, 5000);
for (let a = 0; a < N && ueber.length < 50; a++) for (let b = a + 1; b < N; b++) {
  const [i, x] = boxen[a], [j, y] = boxen[b]; if (i === j) continue;
  const s = schnitt(x, y); if (!s) continue;
  const f = flaeche(s), klein = Math.min(flaeche(x), flaeche(y));
  if (f > 4 && f > 0.25 * klein) { ueber.push(texte[i].name + ' / ' + texte[j].name); if (ueber.length >= 50) break; }
}
return { abgeschnitten: ab.slice(0, 50), abgeschnittenZahl: ab.length, ueberlappt: ueber, texte: texte.length, gekappt: boxen.length > N };
}"""

# §8 #10: wer hat den Fokus, und ist er sichtbar?
FOKUS_JS = "() => {\n" + HELFER_JS + r"""
const el = document.activeElement;
if (!el || el === body || el === de) return null;
window.__sichtZ = window.__sichtZ || 0;
if (!el.__sichtId) el.__sichtId = ++window.__sichtZ;
window.__sichtFokus = el;
const r = el.getBoundingClientRect();
return { id: el.__sichtId, name: name(el), kachel: !!el.closest('[data-sicht="kachel"]'), dialog: !!el.closest(DIALOG),
  l: r.left, t: r.top, b: r.width, h: r.height, W, H };
}"""

# Fokus sichtbar (WCAG 2.4.13, DESIGN §8 #10 „≥ 2 px, ≥ 3:1“): dieselbe Stelle mit und ohne Fokus
# fotografiert. Gezählt werden die Pixel, die sich mindestens 3:1 ändern. Ihre Fläche muss mindestens
# so groß sein wie ein 2 px breiter Rahmen um das Element, 4 × (Breite + Höhe). Das misst Umriss,
# Schatten und Flächenwechsel gleich, ohne zu raten, wie die Seite den Fokus zeichnet.
FOKUSRING_JS = r"""
async ({ a, b }) => {
  const lade = async (png) => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight).getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0); return c.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data; };
  const A = await lade(a), B = await lade(b);
  if (A.length !== B.length) return null;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (i, d) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  let geaendert = 0, stark = 0;
  for (let i = 0; i < A.length; i += 4) {
    if (A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2]) continue;
    geaendert++;
    const x = L(i, A), y = L(i, B);
    if ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) >= 3) stark++;
  }
  return { geaendert, stark };
}
"""

ZIELLISTE_JS = "() => {\n" + HELFER_JS + r"""
window.__sichtZ = window.__sichtZ || 0;
const GRUPPE = '[role=radiogroup], [role=tablist], [role=toolbar], [role=grid], [role=listbox], [role=menu], [role=menubar], [role=tree]';
const out = [];
for (const el of document.querySelectorAll(BEDIEN + ', button, a[href], [tabindex="-1"]')) {
  if (!vis(el) || gesperrt(el) || el.closest(DIALOG) || el.closest('[data-sicht="kachel"]')) continue;
  const r = el.getBoundingClientRect(); if (r.width < 1.5 || r.height < 1.5) continue;
  const c = kinderClip(el.parentElement); if (c && flaeche(c) < 4) continue;
  if (el.getAttribute('tabindex') === '-1' && (el.closest(GRUPPE) || !el.matches('button, a[href], input, select, textarea'))) continue;
  if (!el.__sichtId) el.__sichtId = ++window.__sichtZ;
  const radio = el.matches('input[type=radio]') ? 'radio:' + el.name : (el.getAttribute('role') === 'radio' && el.closest('[role=radiogroup]') ? 'rg:' + name(el.closest('[role=radiogroup]')) : null);
  out.push({ id: el.__sichtId, name: name(el), gruppe: radio });
}
return out;
}"""

DIALOG_OFFEN_JS = r"""() => [...document.querySelectorAll('dialog[open], [role=dialog], [role=alertdialog]')].some((d) => d.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && d.getBoundingClientRect().height > 0)"""

OHNE_JS_JS = r"""() => {
  const z = {};
  for (const n of ['kopf', 'module', 'werkzeug', 'raster', 'fuss']) {
    const el = document.querySelector('[data-sicht="' + n + '"]');
    if (el) { const r = el.getBoundingClientRect(); z[n] = { h: r.height, b: r.width, sichtbar: el.checkVisibility() }; }
  }
  const s = document.scrollingElement || document.documentElement;
  return { zonen: z, seite: { h: s.scrollHeight, b: s.scrollWidth }, W: innerWidth, H: innerHeight };
}"""

# ---------------------------------------------------------------------------------------------
# Plan, Erwartung, Stressfall
# ---------------------------------------------------------------------------------------------


def stunde(hhmm: str) -> float:
    h, m = hhmm.split(':')[:2]
    return int(h) + int(m) / 60


def bestandteile(plan: dict) -> list[dict]:
    return [c for m in plan.get('modules', []) for c in m.get('components', [])]


def auswahl_bauen(plan: dict, art: str) -> dict:
    """Erfunden (§8 „Auswahl“): je Bestandteil die erste Gruppe mit Terminen; „halb“ die erste Hälfte."""
    waehlbar = [c for c in bestandteile(plan) if any(g.get('slots') for g in c.get('groups', []))]
    if art == 'leer':
        return {}
    if art == 'halb':
        waehlbar = waehlbar[:math.ceil(len(waehlbar) / 2)]
    out = {}
    for c in waehlbar:
        g = next(g for g in c['groups'] if g.get('slots'))
        out[c['id']] = g
    return out


def speicher_schluessel(plan: dict) -> str:
    """ARCHITEKTUR §6."""
    return f"stundenplanner:v1:{plan['studiengang']['id']}:{plan['semester']}:fs{plan['fachsemester']}"


def speicher_wert(auswahl: dict) -> str:
    return json.dumps({cid: {'group': g['id'], 'digest': g['digest'], 'name': g['name']} for cid, g in auswahl.items()})


def erwartung(plan: dict, auswahl: dict) -> dict:
    """Was „Noch offen“ im Wochenskelett ohne Filter zeigen muss (DESIGN §4.1), aus der Plandatei."""
    ab = bool(plan.get('has_fortnightly'))
    je_tag: dict[int, int] = {}
    starts, enden, tage = [], [], set()
    for c in bestandteile(plan):
        for g in c.get('groups', []):
            for s in g.get('slots', []):
                starts.append(stunde(s['start']))
                enden.append(stunde(s['end']))
                tage.add(int(s['day']))
        gruppen = [auswahl[c['id']]] if c['id'] in auswahl else c.get('groups', [])
        for g in gruppen:
            for s in g.get('slots', []):
                if ab and 0 not in (s.get('parity') or [0, 1]):
                    continue                     # §4.1: im Wochenskelett mit A/B steht Woche A
                je_tag[int(s['day'])] = je_tag.get(int(s['day']), 0) + 1
    return {
        'je_tag': je_tag, 'gesamt': sum(je_tag.values()),
        'achse': [math.floor(min(starts)), math.ceil(max(enden))] if starts else None,
        'tage': sorted(tage | {0, 1, 2, 3, 4}),   # §1.2: Mo–Fr immer, Sa/So nur mit Daten
        'bestandteile': len(bestandteile(plan)),
    }


def stressplan() -> tuple[dict, dict]:
    """§8 „Stressfall“: erkennbar erfunden. 8 Module, 20 Bestandteile, 6 parallele Spuren (Mi 11–13),
    Mo–Sa, 07–21 Uhr, A/B-Rhythmus, eine 15:30-Gruppe, eine Gruppe mit zwei Wochenterminen."""
    anker = date(2030, 10, 14)
    jetzt = datetime.now(timezone.utc).isoformat(timespec='seconds')
    zellen = [(d, h) for h in (7, 9, 11, 13, 15, 17, 19) for d in range(6) if (d, h) != (2, 11)]
    belegt: dict[tuple, int] = {}
    zeiger = [0]
    buchung = [0]

    def naechste_zelle():
        while True:
            z = zellen[zeiger[0] % len(zellen)]
            zeiger[0] += 5                      # Schritt 5: Nachbarn landen an verschiedenen Tagen
            if belegt.get(z, 0) < 3:
                belegt[z] = belegt.get(z, 0) + 1
                return z

    def slot(tag, beginn, ende, paritaet, raum, titel):
        wochen = [w for w in range(14) if w % 2 in paritaet]
        datum = [anker + timedelta(days=7 * w + tag) for w in wochen]
        occ, books = [], []
        for d in datum:
            buchung[0] += 1
            occ.append({'id': str(800000 + buchung[0]), 'date': d.isoformat(), 'start': beginn, 'end': ende,
                        'room': raum, 'note': '', 'info': ''})
            books.append({'id': str(800000 + buchung[0]), 'start': f'{d.isoformat()}T{beginn}:00',
                          'end': f'{d.isoformat()}T{ende}:00', 'room': raum, 'title': titel, 'format': '',
                          'number': '', 'note': '', 'info': ''})
        zwei = len(paritaet) == 1
        return ({'day': tag, 'start': beginn, 'end': ende, 'dates': [d.isoformat() for d in datum], 'rooms': [raum],
                 'occurrences': occ, 'fortnightly': zwei, 'parity': sorted(paritaet),
                 'rhythm': ('14-täglich, Woche ' + 'AB'[paritaet[0]]) if zwei else 'wöchentlich'}, books)

    module = []
    nr = 0
    for mi in range(8):
        kurz = 'Modul ' + 'ABCDEFGH'[mi]
        typen = ['VL', 'UE', 'TUT'] if mi < 4 else ['VL', 'UE']
        comps = []
        for ci, typ in enumerate(typen):
            cid = f'9{mi:03d}:{ci + 1}'
            gruppen = []
            anzahl = {'VL': 1, 'UE': 3, 'TUT': 6}[typ]
            for gi in range(anzahl):
                nr += 1
                titel = f'{kurz} ({typ}, erfunden)'
                raum = f'Erfundener Raum {100 + nr}'
                slots, books = [], []
                if mi == 0 and typ == 'TUT':
                    plaene = [(2, '11:00', '13:00', [0, 1])]                 # die sechs Spuren
                elif mi == 1 and typ == 'TUT':
                    d, h = naechste_zelle()
                    plaene = [(d, f'{h:02d}:00', f'{h + 2:02d}:00', [gi % 2])]  # A/B
                elif mi == 2 and typ == 'UE' and gi == 0:
                    plaene = [(1, '15:30', '17:30', [0, 1])]
                elif mi == 3 and typ == 'VL':
                    plaene = [(0, '09:00', '11:00', [0, 1]), (3, '09:00', '11:00', [0, 1])]
                elif mi == 4 and typ == 'VL':
                    plaene = [(0, '07:00', '09:00', [0, 1])]                 # frühester Beginn
                elif mi == 5 and typ == 'VL':
                    plaene = [(5, '19:00', '21:00', [0, 1])]                 # spätestes Ende, Samstag
                else:
                    d, h = naechste_zelle()
                    plaene = [(d, f'{h:02d}:00', f'{h + 2:02d}:00', [0, 1])]
                for p in plaene:
                    s, b = slot(*p, raum, titel)
                    slots.append(s)
                    books.extend(b)
                gid = str(700000 + nr)
                gruppen.append({'id': gid, 'name': f'Termingruppe {gi + 1}', 'url': '', 'key': f'{cid}:{gid}',
                                'digest': hashlib.sha256(gid.encode()).hexdigest(), 'series': [],
                                'bookings': books, 'slots': slots})
            comps.append({'id': cid, 'lvvid': str(ci + 1), 'title': f'{kurz}, {typ} (erfunden)', 'type': typ,
                          'number': '', 'sws': 2.0, 'cycle': 'WiSe', 'language': 'de', 'section': 'Pflichtbereich',
                          'required': True, 'vvz_url': '', 'isis_url': '', 'semester_id': '0', 'status': 'ok',
                          'groups': gruppen})
        module.append({'number': f'9{mi:04d}', 'short': kurz, 'title': f'Erfundenes {kurz} (Stressfall)',
                       'version': 1, 'valid_from': 'WiSe 2030/31', 'valid_to': 'offen', 'valid_versions': [1],
                       'url': '', 'isis_url': '', 'notes': {}, 'checked_at': jetzt, 'success_at': jetzt,
                       'error': None, 'components': comps})
    plan = {'schema': 1, 'erzeugt_am': jetzt,
            'studiengang': {'id': 'stress-bsc', 'name': 'Stressfall (erfunden)', 'abschluss': 'B.Sc.'},
            'semester': 'ws-2030-31', 'label': 'WiSe 2030/31', 'anchor': anker.isoformat(), 'fachsemester': 1,
            'modules': module, 'has_fortnightly': True, 'group_count': nr, 'booking_count': buchung[0],
            'last_run': {'finished_at': jetzt, 'status': 'ok', 'modules': 8, 'bookings': buchung[0], 'errors': []}}
    index = {'schema': 1, 'erzeugt_am': jetzt, 'plaene': [{
        'studiengang': 'stress-bsc', 'name': 'Stressfall (erfunden)', 'abschluss': 'B.Sc.', 'semester': 'ws-2030-31',
        'label': 'WiSe 2030/31', 'fachsemester': 1, 'datei': 'stress/ws-2030-31-fs1.json'}]}
    return index, plan


# ---------------------------------------------------------------------------------------------
# Browser: ein Lauf je Spezifikation, in einem Arbeiterprozess
# ---------------------------------------------------------------------------------------------

_PW = {}


def _arbeiter_start():
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    browser = pw.chromium.launch(args=['--font-render-hinting=none'])
    helfer_ctx = browser.new_context()
    helfer = helfer_ctx.new_page()
    helfer.goto('about:blank')
    _PW.update(pw=pw, browser=browser, helfer=helfer)


def _warten(page, offen, frist=12.0, ruhe_ms=300, mindest_ms=1500, kachel=False):
    """Bis keine Anfrage mehr läuft und das DOM ruhe_ms still ist — frühestens mindest_ms nach dem
    Start der Navigation, außer es steht schon eine Kachel. Ohne die Mindestzeit galt eine Seite
    als „ruhig“, bevor ihr Skript die Daten überhaupt anfragte (gedrosselt gesehen, 05.10.2026).
    kachel=True wartet, bis eine Kachel da ist (oder die Frist um ist)."""
    ende = time.monotonic() + frist
    ruhig = False
    while time.monotonic() < ende:
        if offen[0] <= 0:
            try:
                z = page.evaluate("""() => [performance.now(), performance.now() - (window.__sicht ? window.__sicht.letzte : 0),
                                           !!document.querySelector('[data-sicht="kachel"]')]""")
            except Exception:
                z = [1e9, 1e9, False]
            jetzt, ruhe, hat = z
            if ruhe >= ruhe_ms and (hat or (not kachel and jetzt >= mindest_ms)):
                ruhig = True
                break
        page.wait_for_timeout(50)
    try:
        page.evaluate('() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
    except Exception:
        pass
    return ruhig


def _kontext(spec):
    b = _PW['browser']
    w, h = spec['fenster']
    zoom = spec.get('zoom', 1)
    opts = dict(viewport={'width': int(w / zoom), 'height': int(h / zoom)}, device_scale_factor=zoom,
                is_mobile=spec['touch'], has_touch=spec['touch'], color_scheme=spec['schema'],
                reduced_motion=spec.get('bewegung', 'no-preference'), locale='de-DE', timezone_id='Europe/Berlin',
                java_script_enabled=not spec.get('ohne_js'))
    if spec.get('speicher'):
        o = urllib.parse.urlsplit(spec['url'])
        opts['storage_state'] = {'cookies': [], 'origins': [{'origin': f'{o.scheme}://{o.netloc}',
                                                             'localStorage': [spec['speicher']]}]}
    ctx = b.new_context(**opts)
    ctx.add_init_script(INSTRUMENT_JS)
    if spec.get('ohne_speicher'):
        ctx.add_init_script(OHNE_SPEICHER_JS)
    if spec.get('stress'):
        idx, plan = spec['stress']

        def route(r):
            p = urllib.parse.urlsplit(r.request.url).path
            if p.endswith('/daten/index.json'):
                return r.fulfill(status=200, content_type='application/json', body=idx)
            if p.endswith('/daten/stress/ws-2030-31-fs1.json'):
                return r.fulfill(status=200, content_type='application/json', body=plan)
            return r.continue_()
        ctx.route('**/daten/**', route)
    return ctx


def _seite(ctx, spec):
    page = ctx.new_page()
    ereignis = {'fehler': [], 'anfragen': [], 'antworten': []}
    offen = [0]
    origin = urllib.parse.urlsplit(spec['url'])
    eigen = f'{origin.scheme}://{origin.netloc}'

    def anfrage(r):
        offen[0] += 1
        ereignis['anfragen'].append({'url': r.url, 'typ': r.resource_type})

    def fertig(r):
        offen[0] -= 1

    def gescheitert(r):
        offen[0] -= 1
        if not r.url.startswith('data:'):
            ereignis['fehler'].append(f'Anfrage gescheitert: {kuerzen(r.url)} ({r.failure})')

    def antwort(r):
        if r.status >= 400:
            ereignis['fehler'].append(f'HTTP {r.status}: {kuerzen(r.url)}')
        ereignis['antworten'].append(r)

    page.on('request', anfrage)
    page.on('requestfinished', fertig)
    page.on('requestfailed', gescheitert)
    page.on('response', antwort)
    page.on('console', lambda m: m.type == 'error' and ereignis['fehler'].append('Konsole: ' + m.text[:200]))
    page.on('pageerror', lambda e: ereignis['fehler'].append('Ausnahme: ' + str(e)[:200]))
    return page, ereignis, offen, eigen


def kuerzen(url: str) -> str:
    p = urllib.parse.urlsplit(url)
    return (p.path or '/') if p.scheme in ('http', 'https') and p.hostname in ('127.0.0.1', 'localhost') else url[:120]


def _kontrast(page, mess, zoom_ok=True):
    """Fotografiert die Seite ohne Schrift und misst jeden Text gegen die Pixel dahinter."""
    W, H = mess['W'], mess['H']
    voll = mess['seite']['h'] > H or mess['seite']['b'] > W
    page.evaluate(VERSTECKEN_JS, True)
    try:
        png = page.screenshot(full_page=voll, scale='css', animations='disabled', caret='hide')
    finally:
        page.evaluate(VERSTECKEN_JS, False)
    gw, gh = (mess['seite']['b'], mess['seite']['h']) if voll else (W, H)
    sx, sy = mess['scroll']
    items, zu = [], []
    for t in mess['texte']:
        rects = []
        for r in t['rects']:
            l, tt, rr, b = r['l'] + sx, r['t'] + sy, r['r'] + sx, r['b'] + sy
            l, tt, rr, b = max(l, 0), max(tt, 0), min(rr, gw), min(b, gh)
            if rr - l >= 1 and b - tt >= 1:
                rects.append([l, tt, rr - l, b - tt])
        f = t['farbe'] or [0, 0, 0, 1]
        gross = t['groesse'] >= 24 or (t['groesse'] >= 18.66 and t['gewicht'] >= 700)
        items.append({'f': [f[0], f[1], f[2], f[3] * t['deck']], 'r': rects, 'soll': 3.0 if gross else 4.5})
        zu.append(t)
    erg = _PW['helfer'].evaluate(PIXEL_JS, {'png': base64.b64encode(png).decode(), 'items': items}) if items else []
    gemessen, fehler, unbestimmt, ausgenommen, ungemessen, verdeckt = 0, [], [], 0, 0, []
    werte = []
    for t, e in zip(zu, erg):
        if t['dialog']:
            continue
        if t.get('verdeckt'):
            verdeckt.append(t['name'])
            continue
        if not e:
            ungemessen += 1
            continue
        if t['gesperrt']:
            ausgenommen += 1
            continue
        soll = it_soll = 3.0 if (t['groesse'] >= 24 or (t['groesse'] >= 18.66 and t['gewicht'] >= 700)) else 4.5
        gemessen += 1
        eintrag = {'text': t['text'], 'el': t['name'], 'soll': it_soll, 'grund': e['grund'],
                   'anteil_grund': round(e['anteil'], 2), 'anteil_unter_soll': round(e['unter'], 3)}
        # Entscheidung (Pixel hinter dem Text, Kontrast je Pixel). Ein „Grund“ ist eine
        # Kontraststufe (0,05), die mindestens 15 % der Pixel deckt; dünne Linien sind keiner.
        # 1. Ein Grund reicht nicht → Fehler (Wert dieses Grunds).
        # 2. Höchstens 2 % der Pixel unter Soll → erfüllt (Kantenglättung, Rauschen).
        # 3. Die Gründe decken ≥ 75 % und höchstens 25 % liegen unter Soll (eine Linie oder Kante
        #    kreuzt die Zeile) → erfüllt, Wert des schlechtesten Grunds.
        # 4. Mindestens 25 % der Pixel unter Soll → Fehler (WCAG: die schlechteste Stelle zählt).
        # 5. Sonst (Verlauf, Bild, kein klarer Grund) → unbestimmt. Nie „bestanden“ geraten.
        gr = e['gruende']
        schlecht = [g for g in gr if g[1] < soll]
        deckung = sum(g[0] for g in gr)
        if schlecht:
            w = min(g[1] for g in schlecht)
            werte.append(w)
            fehler.append({**eintrag, 'wert': round(w, 2), 'grund': schlecht[0][2]})
        elif e['unter'] <= 0.02:
            werte.append(e['p02'])
        elif gr and deckung >= 0.75 and e['unter'] <= 0.25:
            werte.append(min(g[1] for g in gr))
        elif e['unter'] >= 0.25:
            werte.append(e['p02'])
            fehler.append({**eintrag, 'wert': round(e['p02'], 2)})
        else:
            unbestimmt.append({**eintrag, 'wert': None, 'p02': round(e['p02'], 2)})
    return {'gemessen': gemessen, 'min': round(min(werte), 2) if werte else None, 'fehler': fehler,
            'unbestimmt': unbestimmt, 'gesperrt': ausgenommen, 'ungemessen': ungemessen,
            'verdeckt': len(verdeckt), 'verdeckt_bsp': verdeckt[:5]}


def lauf(spec: dict) -> dict:
    """Ein Lauf der Standardansicht: laden, warten, messen, Kontrast, Bild."""
    ctx = _kontext(spec)
    try:
        page, ereignis, offen, eigen = _seite(ctx, spec)
        t0 = time.monotonic()
        page.goto(spec['url'], wait_until='load', timeout=30000)
        ruhig = _warten(page, offen)
        mess = page.evaluate(MESSEN_JS, {'pflicht': PFLICHT, 'tokens': token_namen()})
        mess['ruhig'] = ruhig
        mess['dauer_s'] = round(time.monotonic() - t0, 2)
        mess['kontrast'] = _kontrast(page, mess)
        mess['fehler'] = list(ereignis['fehler'])
        mess['fremd'] = sorted({a['url'][:120] for a in ereignis['anfragen']
                                if not a['url'].startswith(('data:', 'blob:', eigen))})
        if spec.get('bilder'):
            page.screenshot(path=spec['bilder'], scale='css', animations='disabled', caret='hide')
        return mess
    finally:
        ctx.close()


def lauf_leistung(spec: dict) -> dict:
    """§8 #12: gedrosselt wie ein Mittelklasse-Handy, Bytes aus dem Netz, Anfragen, Inline-HTML."""
    ctx = _kontext(spec)
    try:
        page, ereignis, offen, eigen = _seite(ctx, spec)
        cdp = ctx.new_cdp_session(page)
        cdp.send('Network.enable')
        cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150,
                                                      'downloadThroughput': 1.6e6 / 8, 'uploadThroughput': 750e3 / 8})
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        page.goto(spec['url'], wait_until='load', timeout=60000)
        _warten(page, offen, frist=45, ruhe_ms=1000, kachel=bool(spec.get('kachel')))
        page.wait_for_timeout(1000)
        perf = page.evaluate("""() => {
          const s = window.__sicht || {};
          const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime ?? null;
          const res = performance.getEntriesByType('resource').map((e) => [e.name, e.startTime]);
          return { lcp: s.lcp ?? null, cls: s.cls ?? null, lang: s.lang || [], fcp, kachel: s.ersteKachel ?? null,
                   ruhig: s.letzte ?? null, res, dom: document.getElementsByTagName('*').length };
        }""")
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        dateien = []
        for r in ereignis['antworten']:
            typ = r.request.resource_type
            if r.url.startswith('data:') or typ not in ('document', 'stylesheet', 'script', 'fetch', 'xhr'):
                continue
            try:
                inhalt = r.body()
            except Exception:
                continue
            dateien.append({'url': kuerzen(r.url), 'typ': typ, 'roh': len(inhalt),
                            'gz': len(gzip.compress(inhalt, compresslevel=6)),
                            'html': inhalt.decode('utf-8', 'replace') if typ == 'document' else None})
        fcp = perf['fcp'] or 0
        tbt = sum(max(0, d - 50) for s, d in perf['lang'] if s + d > fcp)
        bis = perf['kachel']
        bis_liste = [kuerzen(u) for u, s in perf['res'] if bis is not None and s <= bis]
        anfragen_bis = None if bis is None else 1 + len(bis_liste)
        return {'lcp': perf['lcp'], 'cls': perf['cls'], 'tbt': tbt, 'fcp': perf['fcp'], 'kachel': bis,
                'ruhig': perf['ruhig'], 'anfragen_bis_kachel': anfragen_bis, 'anfragen': len(ereignis['anfragen']),
                'anfragen_liste': ['(Dokument)'] + bis_liste if bis is not None else [kuerzen(a['url']) for a in ereignis['anfragen']],
                'fremd': sorted({a['url'][:120] for a in ereignis['anfragen'] if not a['url'].startswith(('data:', 'blob:', eigen))}),
                'dateien': dateien, 'fehler': ereignis['fehler']}
    finally:
        ctx.close()


def lauf_bewegung(spec: dict) -> dict:
    """§8 #13: unter reduced-motion, vor und nach dem Klick auf die erste Kachel."""
    ctx = _kontext(spec)
    try:
        page, ereignis, offen, _ = _seite(ctx, spec)
        page.goto(spec['url'], wait_until='load', timeout=30000)
        _warten(page, offen)
        befunde = page.evaluate(BEWEGUNG_JS)
        kachel = page.locator('[data-sicht="kachel"]:visible').first
        geklickt = False
        if kachel.count():
            try:
                kachel.click(timeout=3000)
                geklickt = True
                page.wait_for_timeout(40)
                befunde += page.evaluate(BEWEGUNG_JS)
                page.wait_for_timeout(400)
                befunde += page.evaluate(BEWEGUNG_JS)
            except Exception as e:
                ereignis['fehler'].append(f'Klick auf Kachel: {str(e)[:120]}')
        return {'befunde': sorted(set(befunde)), 'geklickt': geklickt, 'dialog': page.evaluate(DIALOG_OFFEN_JS) if geklickt else False,
                'fehler': ereignis['fehler']}
    finally:
        ctx.close()


def lauf_zoom(spec: dict) -> dict:
    ctx = _kontext(spec)
    try:
        page, ereignis, offen, _ = _seite(ctx, spec)
        page.goto(spec['url'], wait_until='load', timeout=30000)
        _warten(page, offen)
        erg = page.evaluate(ZOOM_JS)
        erg['fehler'] = ereignis['fehler']
        if spec.get('bilder'):
            page.screenshot(path=spec['bilder'], full_page=True, scale='css')
        return erg
    finally:
        ctx.close()


def lauf_tastatur(spec: dict) -> dict:
    """§8 #10, der messbare Teil: Tab-Durchlauf, Fokus sichtbar (Pixelvergleich), Enter/Esc an einer Kachel."""
    ctx = _kontext(spec)
    try:
        page, ereignis, offen, _ = _seite(ctx, spec)
        page.goto(spec['url'], wait_until='load', timeout=30000)
        _warten(page, offen)
        ziele = page.evaluate(ZIELLISTE_JS)
        besucht, stopps, karte = {}, [], None
        erster, leer = None, 0
        for _ in range(300):
            page.keyboard.press('Tab')
            f = page.evaluate(FOKUS_JS)
            if f is None:
                leer += 1
                if leer >= 2 and besucht:
                    break
                continue
            if f['id'] == erster:
                break
            erster = erster or f['id']
            if f['id'] in besucht:
                continue
            besucht[f['id']] = f
            l, t = max(0, f['l'] - 10), max(0, f['t'] - 10)
            r, b = min(f['W'], f['l'] + f['b'] + 10), min(f['H'], f['t'] + f['h'] + 10)
            f['ring'] = None
            if r - l >= 4 and b - t >= 4:
                clip = {'x': l, 'y': t, 'width': r - l, 'height': b - t}
                mit = page.screenshot(clip=clip, scale='css', animations='disabled', caret='hide')
                page.evaluate('() => document.activeElement && document.activeElement.blur()')
                ohne = page.screenshot(clip=clip, scale='css', animations='disabled', caret='hide')
                page.evaluate('() => window.__sichtFokus && window.__sichtFokus.focus({ preventScroll: true })')
                ring = _PW['helfer'].evaluate(FOKUSRING_JS, {'a': base64.b64encode(mit).decode(), 'b': base64.b64encode(ohne).decode()})
                bw, bh = min(f['b'], f['W']), min(f['h'], f['H'])
                f['ring'] = ring and {**ring, 'soll': round(4 * (bw + bh))}
            stopps.append(f)
            if f['kachel'] and karte is None:
                karte = {'kachel': f['name']}
                page.keyboard.press('Enter')
                page.wait_for_timeout(350)
                karte['offen'] = page.evaluate(DIALOG_OFFEN_JS)
                g = page.evaluate(FOKUS_JS)
                karte['fokus_in_karte'] = bool(g and g['dialog'])
                if karte['offen']:
                    page.keyboard.press('Escape')
                    page.wait_for_timeout(350)
                    karte['zu'] = not page.evaluate(DIALOG_OFFEN_JS)
                    g = page.evaluate(FOKUS_JS)
                    karte['zurueck'] = bool(g and g['id'] == f['id'])
        return {'ziele': ziele, 'stopps': stopps, 'karte': karte, 'fehler': ereignis['fehler']}
    finally:
        ctx.close()


def lauf_ohne_js(spec: dict) -> dict:
    ctx = _kontext(spec)
    try:
        page = ctx.new_page()
        page.goto(spec['url'], wait_until='load', timeout=30000)
        page.wait_for_timeout(200)
        try:
            return page.evaluate(OHNE_JS_JS)
        except Exception as e:
            return {'unmessbar': str(e)[:200]}
    finally:
        ctx.close()


def lauf_wahl(spec: dict) -> dict:
    """§8 #17, zweiter Teil: „Einplanen“ — was steht danach im Speicher?"""
    ctx = _kontext(spec)
    try:
        page, ereignis, offen, _ = _seite(ctx, spec)
        page.goto(spec['url'], wait_until='load', timeout=30000)
        _warten(page, offen)
        vorher = page.evaluate('() => (window.__sicht ? window.__sicht.schreiben.length : 0)')
        knopf = page.get_by_role('button', name='Einplanen', exact=True)
        weg = []
        if not knopf.locator('visible=true').count():
            k = page.locator('[data-sicht="kachel"]:visible').first
            if k.count():
                k.click(timeout=3000)
                weg.append('Kachel')
                page.wait_for_timeout(300)
        geklickt = False
        sichtbar = knopf.locator('visible=true')
        if sichtbar.count():
            sichtbar.first.click(timeout=3000)
            weg.append('Einplanen')
            geklickt = True
            page.wait_for_timeout(400)
        inhalt = page.evaluate("""() => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } } catch (e) {} return o; }""")
        return {'geklickt': geklickt, 'weg': weg, 'vorher': vorher, 'speicher': inhalt, 'fehler': ereignis['fehler']}
    finally:
        ctx.close()


def ausfuehren(aufgabe):
    art, spec = aufgabe
    if not _PW:
        _arbeiter_start()
    fn = {'lauf': lauf, 'leistung': lauf_leistung, 'bewegung': lauf_bewegung, 'zoom': lauf_zoom,
          'tastatur': lauf_tastatur, 'ohne_js': lauf_ohne_js, 'wahl': lauf_wahl}[art]
    fehler = None
    for _ in range(2):                         # einmal wiederholen: ein hängender Browser ist kein Befund
        try:
            return fn(spec)
        except Exception as e:
            fehler = f'{type(e).__name__}: {str(e)[:300]}'
    return {'absturz': fehler}                 # zweimal abgestürzt: unbestimmt, nie bestanden


# ---------------------------------------------------------------------------------------------
# Bewerten
# ---------------------------------------------------------------------------------------------

PRUEFUNGEN = {
    '1': ('§8 #1', 'Kein Scrollen der Standardansicht (leere, halbe, volle Auswahl)'),
    '1a': ('§8 #1', 'Nichts ragt aus dem Fenster, nichts scrollt innen, nichts abgeschnitten'),
    '2': ('§8 #2', 'Stressfall: ohne Scrollen ab 1280 × 720 und bei 390 × 844, sonst nichts abgeschnitten'),
    '3': ('§8 #3', 'Alle Bestandteile (Chips) ganz im Fenster'),
    '4': ('§8 #4', 'Jede sichtbare Gruppe hat eine Kachel'),
    '5': ('§8 #5', 'Ganze Zeitachse, ab 768 px alle Tage'),
    '6': ('§8 #6', 'Kacheln ≥ 24 px breit, 2-h-Kachel ≥ 40 px (Touch 44 px)'),
    '7': ('§8 #7', 'Ziele ≥ 24 × 24 px, bei Touch ≥ 44 × 44 px'),
    '8a': ('§8 #8', 'Kontraste der Token-Paare aus §5.5'),
    '8b': ('§8 #8', 'Kontrast jedes sichtbaren Textes gegen seinen Hintergrund'),
    '9': ('§8 #9', 'Schriftgrößen nur 12/14/16 px, Gewichte nur 400/600'),
    '10': ('§8 #10', 'Tastatur (Teil): alles erreichbar, Fokus sichtbar, Esc schließt, Fokus kehrt zurück'),
    '12a': ('§8 #12', 'Budget §6: Bytes und Dateien'),
    '12b': ('§8 #12', 'Gedrosselt: LCP, CLS, TBT, Anfragen bis zur ersten Kachel'),
    '12c': ('§8 #12', 'Keine fremde Anfrage'),
    '13': ('§8 #13', 'Bewegung bei prefers-reduced-motion: nur Deckkraft'),
    '14': ('§8 #14', 'Zoom 200 %: nichts überlappt, nichts abgeschnitten'),
    '15': ('§8 #15', 'AI tells (messbarer Teil von §7)'),
    '16': ('§8 #16', 'Ohne Speicher: Seite geht, Hinweis sichtbar'),
    '17': ('§8 #17', 'Speicherregeln: Laden schreibt nichts, Wahl schreibt nur group/digest/name'),
    '33': ('§3.3', 'Ohne Scrollen sichtbar: Teilen, Hinweis, Impressum, Datenschutz, Speicherhinweis'),
    'f': ('§8', 'Keine Konsolenfehler, keine gescheiterte Anfrage'),
    'dom': ('§6', 'DOM-Knoten mit allen Kacheln ≤ 1 200'),
    'inline': ('§6', 'Kein Inline-Stil, kein Inline-Skript im HTML'),
    'resize': ('§6', 'Größe ändern ohne Skript (kein resize-Hörer, kein ResizeObserver)'),
    'nojs': ('§6', 'Erstes Bild ohne JS: Kopf, Raster und Fuß stehen'),
}
OK, FEHLER, UNBESTIMMT = 'ok', 'fehler', 'unbestimmt'


class Befund:
    def __init__(self):
        self.liste: list[dict] = []

    def add(self, k, status, detail, wo=None, wert=None):
        self.liste.append({'pruefung': k, 'status': status, 'detail': detail, 'wo': wo, 'wert': wert})

    def status(self, k):
        s = [b['status'] for b in self.liste if b['pruefung'] == k]
        if not s:
            return None
        return FEHLER if FEHLER in s else UNBESTIMMT if UNBESTIMMT in s else OK


def kontrast(a, b) -> float:
    def lum(c):
        def f(v):
            v /= 255
            return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def zahl(x, n=1):
    if x is None:
        return '—'
    return f'{x:,.{n}f}'.replace(',', ' ').replace('.', ',')


def bewerten_lauf(bf: Befund, spec: dict, m: dict, erw: dict):
    w, h = spec['fenster']
    wo = f"{w}×{h} {'hell' if spec['schema'] == 'light' else 'dunkel'} {spec.get('auswahl', '')}".strip()
    stress = bool(spec.get('stress'))
    if 'absturz' in m:
        bf.add('2' if stress else '1', UNBESTIMMT, 'Lauf abgestürzt: ' + m['absturz'], wo)
        return
    W, H = m['W'], m['H']
    sh, sb = m['seite']['h'], m['seite']['b']
    scrollt = sh > H or sb > W
    touch = spec['touch']
    hat_haken = bool(m['kacheln'] or m['chips'])

    if touch and not m['coarse']:
        bf.add('7', UNBESTIMMT, 'Touch verlangt, aber pointer: coarse greift nicht', wo)
    if stress:
        pflicht = (w, h) in STRESS_PFLICHT
        if pflicht:
            bf.add('2', FEHLER if scrollt else OK, f'Seite {sh} px hoch ({zahl(sh / H)} Bildschirme), {sb} px breit, Fenster {W} × {H}', wo, round(sh / H, 2))
        else:
            schnitt = [x for x in m['abgeschnitten'] if '[kachel]' in x or '[chip]' in x]
            if sb > W or schnitt:
                bf.add('2', FEHLER, f'seitlich {sb - W} px zu breit, abgeschnitten: {len(schnitt)}', wo)
            else:
                bf.add('2', OK, f'scrollt {zahl(sh / H)}× (erlaubt), nichts seitlich, nichts abgeschnitten', wo)
        if hat_haken:
            kacheln_pruefen(bf, m, erw, w, wo, stress=True)
        return

    # §8 #1
    bf.add('1', FEHLER if scrollt else OK,
           f'Seite {sh} px hoch ({zahl(sh / H)} Bildschirme), {sb} px breit, Fenster {W} × {H}', wo, round(sh / H, 2))
    teile = []
    if m['aussen']:
        teile.append(f"{m['aussen']} Elemente außerhalb (z. B. {'; '.join(m['aussenBsp'][:2])})")
    if m['innen']:
        teile.append(f"{len(m['innen'])} Bereiche scrollen innen (z. B. {m['innen'][0]['el']})")
    if m['abgeschnitten']:
        teile.append(f"{len(m['abgeschnitten'])} abgeschnitten (z. B. {m['abgeschnitten'][0]})")
    bf.add('1a', FEHLER if teile else OK, '; '.join(teile) or 'nichts außerhalb, nichts innen scrollend', wo, m['aussen'])

    # §3.3 und Speicherhinweis
    fehlt = [p['name'] for p in PFLICHT if not m['pflicht'].get(p['id'], {}).get('ok')]
    if w >= 768 and m['zonen'].get('werkzeug') is not None and not m['zonen']['werkzeug']['ganz']:
        fehlt.append('Werkzeugleiste')
    bf.add('33', FEHLER if fehlt else OK, ('nicht ohne Scrollen sichtbar: ' + ', '.join(fehlt)) if fehlt else 'alles sichtbar', wo)

    # §8 #3–#6
    if not hat_haken:
        for k in ('3', '4', '5', '6'):
            bf.add(k, UNBESTIMMT, 'keine Haken data-sicht im Markup, nichts zu zählen', wo)
    else:
        chips = m['chips']
        schlecht = [c['name'] for c in chips if not (c['ganz'] and c['frei'])]
        n_ok = len(chips) == erw['bestandteile']
        bf.add('3', FEHLER if schlecht or not n_ok else OK,
               f"{len(chips)} Chips (Soll {erw['bestandteile']}), nicht ganz sichtbar: {len(schlecht)}"
               + (f" (z. B. {schlecht[0]})" if schlecht else ''), wo, len(chips))
        kacheln_pruefen(bf, m, erw, w, wo)
        achse_pruefen(bf, m, erw, w, wo)
        k = m['kacheln']
        if k:
            mh = 22 if touch else 20
            zu = []
            for x in k:
                try:
                    dauer = stunde(x['ende']) - stunde(x['start'])
                except Exception:
                    dauer = None
                if x['b'] < 24 or (dauer and x['h'] < mh * dauer - 0.01):
                    zu.append(f"{x['name']} {zahl(x['b'], 0)} × {zahl(x['h'], 0)}")
            ohne = sum(1 for x in k if not x['start'] or not x['ende'])
            stufen = {'L': sum(x['b'] >= 112 for x in k), 'M': sum(44 <= x['b'] < 112 for x in k),
                      'S': sum(24 <= x['b'] < 44 for x in k)}
            je_h = [x['h'] / (stunde(x['ende']) - stunde(x['start'])) for x in k if x['start'] and x['ende'] and stunde(x['ende']) > stunde(x['start'])]
            text = (f"schmalste {zahl(min(x['b'] for x in k), 0)} px, {zahl(min(je_h), 1) if je_h else '—'} px je Stunde, "
                    f"Stufen L {stufen['L']} / M {stufen['M']} / S {stufen['S']}")
            if zu:
                bf.add('6', FEHLER, f'{len(zu)} zu klein (z. B. {zu[0]}); ' + text, wo)
            elif ohne:
                bf.add('6', UNBESTIMMT, f'{ohne} Kacheln ohne data-start/data-ende; ' + text, wo)
            else:
                bf.add('6', OK, text, wo, round(min(je_h), 1) if je_h else None)
        else:
            bf.add('6', UNBESTIMMT, 'keine Kachel sichtbar', wo)

    # §8 #7
    zu, info = [], []
    for z in m['ziele']:
        if z['dialog']:
            continue
        soll = 44 if (touch and not z['link']) else 24
        if z['b'] < soll - 0.01 or z['h'] < soll - 0.01:
            (info if z['gesperrt'] else zu).append(f"{z['name']} {zahl(z['b'], 0)} × {zahl(z['h'], 0)} (Soll {soll})")
    kl = min((min(z['b'], z['h']) for z in m['ziele'] if not z['gesperrt']), default=None)
    bf.add('7', FEHLER if zu else OK,
           (f'{len(zu)} von {len(m["ziele"])} zu klein, z. B. ' + '; '.join(zu[:2])) if zu else f'{len(m["ziele"])} Ziele, kleinste Seite {zahl(kl, 0)} px',
           wo, len(zu))

    # §8 #8 (b)
    kt = m['kontrast']
    if kt['fehler']:
        f0 = kt['fehler'][0]
        bf.add('8b', FEHLER, f"{len(kt['fehler'])} von {kt['gemessen']} Texten unter Soll, z. B. „{f0['text']}“ {zahl(f0['wert'], 2)}:1 (Soll {zahl(f0['soll'], 1)})", wo, kt['min'])
    elif kt['unbestimmt']:
        u0 = kt['unbestimmt'][0]
        bf.add('8b', UNBESTIMMT, f"{len(kt['unbestimmt'])} Texte auf uneinheitlichem Grund, z. B. „{u0['text']}“", wo, kt['min'])
    elif not kt['gemessen']:
        bf.add('8b', UNBESTIMMT, 'kein Text gemessen', wo)
    else:
        bf.add('8b', OK, f"{kt['gemessen']} Texte, kleinster Kontrast {zahl(kt['min'], 2)}:1"
               + (f", {kt['ungemessen']} außerhalb des Fotos" if kt['ungemessen'] else '')
               + (f", {kt['verdeckt']} verdeckt (z. B. {kt['verdeckt_bsp'][0]})" if kt.get('verdeckt') else ''), wo, kt['min'])

    # §8 #9
    gr = sorted({round(t['groesse'], 2) for t in m['texte']})
    ge = sorted({t['gewicht'] for t in m['texte']})
    falsch_g = [g for g in gr if g not in SCHRIFTGROESSEN]
    falsch_w = [g for g in ge if g not in GEWICHTE]
    bf.add('9', FEHLER if falsch_g or falsch_w else OK,
           f"{len(gr)} Größen ({', '.join(zahl(g, 0 if g == int(g) else 2) for g in gr)} px), Gewichte {', '.join(map(str, ge))}", wo, len(gr))

    # §8 #17, erster Teil: Laden schreibt nichts
    log = m.get('log') or {}
    sch = log.get('schreiben') or []
    bf.add('17', FEHLER if sch else OK,
           ('Laden schreibt: ' + ', '.join(f"{s['art']}.{s['was']}({s['schluessel']})" for s in sch[:3])) if sch else 'Laden schreibt nichts', wo)

    # Konsolenfehler, Größe ändern, DOM
    bf.add('f', FEHLER if m['fehler'] else OK, '; '.join(m['fehler'][:2]) or 'keine', wo, len(m['fehler']))
    if log:
        rz = log.get('resize', 0) + log.get('ro', 0)
        bf.add('resize', FEHLER if rz else OK, f"resize-Hörer {log.get('resize', 0)}, ResizeObserver {log.get('ro', 0)}, matchMedia-Hörer {log.get('mm', 0)}", wo)
    if spec.get('auswahl') == 'leer' and w >= 768:
        bf.add('dom', FEHLER if m['dom'] > BUDGET['dom'] else OK, f"{m['dom']} Knoten bei {len(m['kacheln'])} Kacheln", wo, m['dom'])
    if m['fremd']:
        bf.add('12c', FEHLER, 'fremd: ' + ', '.join(m['fremd'][:3]), wo)


def kacheln_pruefen(bf, m, erw, w, wo, stress=False):
    k = m['kacheln']
    je: dict[int, int] = {}
    ohne_tag = 0
    for x in k:
        try:
            je[int(x['tag'])] = je.get(int(x['tag']), 0) + 1
        except (TypeError, ValueError):
            ohne_tag += 1
    soll = erw['je_tag']
    if ohne_tag:
        bf.add('4', UNBESTIMMT, f'{ohne_tag} Kacheln ohne data-tag', wo)
        return
    ein_tag = len(je) == 1 and len([t for t, n in soll.items() if n]) > 1
    if w < 768 and not stress and len(je) > 1:
        bf.add('4', FEHLER, f'unter 768 px {len(je)} Tage zugleich sichtbar (Soll: ein Tag)', wo)
        return
    if ein_tag or (w < 768 and len(je) == 1):
        tag = next(iter(je))
        fehl = [] if je[tag] == soll.get(tag, 0) else [f'Tag {tag}: {je[tag]} statt {soll.get(tag, 0)}']
        text = f"ein Tag ({tag}): {je[tag]} Kacheln (Soll {soll.get(tag, 0)})"
    elif not je:
        fehl = ['keine Kachel sichtbar'] if erw['gesamt'] else []
        text = f"0 Kacheln (Soll {erw['gesamt']})"
    else:
        fehl = [f'Tag {t}: {je.get(t, 0)} statt {n}' for t, n in sorted(soll.items()) if je.get(t, 0) != n]
        fehl += [f'Tag {t}: {n} Kacheln ohne Slot' for t, n in sorted(je.items()) if t not in soll]
        text = f"{sum(je.values())} Kacheln (Soll {erw['gesamt']})"
    # Überlappung: zwei Kacheln teilen sich mehr als 1 px² — dann ist eine verdeckt.
    ueber = 0
    for i, a in enumerate(k):
        for b in k[i + 1:]:
            dx = min(a['l'] + a['b'], b['l'] + b['b']) - max(a['l'], b['l'])
            dy = min(a['t'] + a['h'], b['t'] + b['h']) - max(a['t'], b['t'])
            if dx > 1 and dy > 1:
                ueber += 1
    if ueber:
        fehl.append(f'{ueber} Paare überlappen')
    if m['weitere']:
        fehl.append('„+ N weitere“ steht auf der Seite')
    bf.add('4', FEHLER if fehl else OK, text + ('; ' + '; '.join(fehl[:3]) if fehl else ''), wo, sum(je.values()))


def achse_pruefen(bf, m, erw, w, wo):
    st = m['stunden']
    fehl = []
    if not st:
        bf.add('5', UNBESTIMMT, 'keine Stundenmarke data-sicht="stunde"', wo)
        return
    st = sorted(st, key=lambda x: x['t'])
    erste, letzte = st[0], st[-1]
    if not (erste['ganz'] and letzte['ganz']):
        fehl.append(f"Stundenmarke außerhalb: „{erste['text']}“ {'ok' if erste['ganz'] else 'fehlt'}, „{letzte['text']}“ {'ok' if letzte['ganz'] else 'fehlt'}")

    def ziffer(t):
        d = ''.join(ch for ch in t if ch.isdigit())[:2]
        return int(d) if d else None
    if erw['achse']:
        a, e = erw['achse']
        if ziffer(erste['text']) != a:
            fehl.append(f"erste Marke „{erste['text']}“, Soll {a:02d}")
        if ziffer(letzte['text']) not in (e - 1, e):
            fehl.append(f"letzte Marke „{letzte['text']}“, Soll {e - 1:02d} oder {e:02d}")
    tage = m['tage']
    if w >= 768:
        da = {int(t['tag']) for t in tage if t['tag'] is not None and t['ganz']}
        fehlt = [t for t in erw['tage'] if t not in da]
        if not tage:
            fehl.append('kein Tageskopf data-sicht="tag"')
        elif fehlt:
            fehl.append('Tage nicht sichtbar: ' + ', '.join('Mo Di Mi Do Fr Sa So'.split()[t] for t in fehlt))
    else:
        tags = {x['tag'] for x in m['kacheln']}
        if len(tags) > 1:
            fehl.append(f'{len(tags)} Tage zugleich (Soll einer)')
    bf.add('5', FEHLER if fehl else OK, '; '.join(fehl) or f"„{erste['text']}“ bis „{letzte['text']}“ sichtbar", wo)


def bewerten_tokens(bf: Befund, laeufe: list):
    gesehen = set()
    for spec, m in laeufe:
        if spec.get('stress') or 'tokens' not in m or spec['schema'] in gesehen:
            continue
        gesehen.add(spec['schema'])
        tok = m['tokens']
        wo = 'hell' if spec['schema'] == 'light' else 'dunkel'
        for name, v, h, ziel in KONTRAST_PAARE:
            paare = [(v.replace('mN', f'm{i}'), h.replace('mN', f'm{i}')) for i in range(1, 9)] if 'mN' in v + h else [(v, h)]
            fehlt = sorted({t for p in paare for t in p if not tok.get(t)})
            if fehlt:
                bf.add('8a', UNBESTIMMT, f'{name}: Variable fehlt ({", ".join(fehlt[:3])})', wo)
                continue
            werte = [kontrast(tok[a], tok[b]) for a, b in paare]
            wert = min(werte)
            bf.add('8a', OK if wert >= ziel else FEHLER, f'{name}: {wert:.2f}:1 (Ziel {zahl(ziel, 1)})', wo, round(wert, 4))
    # §7 B „nur dunkel“: hell und dunkel müssen sich unterscheiden
    gr = {}
    for spec, m in laeufe:
        if 'grund' in m and not spec.get('stress'):
            g = next((c for c in m['grund'] if c and c[3] > 0), [255, 255, 255, 1])
            gr.setdefault(spec['fenster'], {})[spec['schema']] = tuple(g[:3])
    gleich = [f for f, s in gr.items() if len(s) == 2 and s['light'] == s['dark']]
    if gleich:
        bf.add('15', FEHLER, f'nur ein Farbschema: hell und dunkel haben denselben Seitengrund {gr[gleich[0]]["light"]}', 'alle')


def bewerten_tells(bf: Befund, laeufe: list):
    arten: dict[str, list] = {}
    statisch = {'transitionAll': set(), 'hoverHeben': set(), 'webfont': set()}
    for spec, m in laeufe:
        for t in m.get('tells', []):
            arten.setdefault(t['art'], [])
            eintrag = t['el'] + (f" ({t['mehr']})" if t['mehr'] else '')
            if eintrag not in arten[t['art']]:
                arten[t['art']].append(eintrag)
        for k in statisch:
            statisch[k].update(m.get('statisch', {}).get(k, []))
    for k, art in (('transitionAll', 'transition: all (Stilregel)'), ('hoverHeben', 'Anheben beim Zeigen'), ('webfont', 'Webfont (@font-face)')):
        if statisch[k]:
            arten[art] = sorted(statisch[k])
    if not arten:
        bf.add('15', OK, 'keiner der messbaren Tells gefunden', 'alle')
    for art, wo in sorted(arten.items()):
        bf.add('15', FEHLER, f'{art}: {len(wo)}× (z. B. {wo[0]})', 'alle', len(wo))


def bewerten_leistung(bf: Befund, p: dict):
    if 'absturz' in p:
        for k in ('12a', '12b', 'inline'):
            bf.add(k, UNBESTIMMT, 'Lauf abgestürzt: ' + p['absturz'], '390×844 gedrosselt')
        return
    d = p['dateien']
    summe = lambda typ, k: sum(x[k] for x in d if x['typ'] == typ)
    html = [x for x in d if x['typ'] == 'document']
    css = [x for x in d if x['typ'] == 'stylesheet']
    js = [x for x in d if x['typ'] == 'script']
    daten = [x for x in d if x['typ'] in ('fetch', 'xhr') and '/daten/' in x['url'] and not x['url'].endswith('index.json')]
    werte = {
        'HTML': (summe('document', 'roh'), BUDGET['html']),
        'CSS': (summe('stylesheet', 'roh'), BUDGET['css']),
        'JS': (summe('script', 'roh'), BUDGET['js']),
        'Code gzip': (sum(x['gz'] for x in html + css + js), BUDGET['code_gz']),
    }
    if daten:
        werte['Plandatei'] = (max(x['roh'] for x in daten), BUDGET['daten'])
        werte['Plandatei gzip'] = (max(x['gz'] for x in daten), BUDGET['daten_gz'])
    for name, (ist, soll) in werte.items():
        bf.add('12a', OK if ist <= soll else FEHLER, f'{name} {zahl(ist / KB, 1)} KB (Budget {zahl(soll / KB, 0)} KB)', '§6', ist)
    bf.add('12a', OK if len(css) <= BUDGET['css_dateien'] else FEHLER, f'{len(css)} CSS-Datei(en) (Budget 1)', '§6', len(css))
    bf.add('12a', OK if len(js) <= BUDGET['js_dateien'] else FEHLER, f'{len(js)} JS-Datei(en) (Budget 6)', '§6', len(js))
    wo = '390×844 Touch, CPU 4×, 150 ms, 1,6 Mbit/s'
    for name, ist, soll, fmt in (('LCP', p['lcp'], BUDGET['lcp_ms'], lambda x: f'{zahl(x, 0)} ms'),
                                 ('CLS', p['cls'], BUDGET['cls'], lambda x: zahl(x, 3)),
                                 ('TBT', p['tbt'], BUDGET['tbt_ms'], lambda x: f'{zahl(x, 0)} ms')):
        if ist is None:
            bf.add('12b', UNBESTIMMT, f'{name} nicht gemessen', wo)
        else:
            bf.add('12b', OK if ist <= soll else FEHLER, f'{name} {fmt(ist)} (Budget {fmt(soll)})', wo, round(ist, 4))
    if p['anfragen_bis_kachel'] is None:
        bf.add('12b', UNBESTIMMT, f"Anfragen bis zur ersten Kachel: keine Kachel (Haken fehlt); bis ruhig {p['anfragen']}", wo)
    else:
        zu_viel = p['anfragen_bis_kachel'] > BUDGET['anfragen']
        bf.add('12b', FEHLER if zu_viel else OK,
               f"{p['anfragen_bis_kachel']} Anfragen bis zur ersten Kachel nach {zahl(p['kachel'], 0)} ms (Budget 6)"
               + (': ' + ', '.join(p.get('anfragen_liste', [])) if zu_viel else ''), wo, p['anfragen_bis_kachel'])
    bf.add('12c', FEHLER if p['fremd'] else OK, ('fremd: ' + ', '.join(p['fremd'][:3])) if p['fremd'] else 'nur eigene Anfragen', wo)
    # Inline-Stil und -Skript im ausgelieferten HTML (§6, CSP)
    funde = []
    for x in html:
        z = _Inline()
        z.feed(x['html'] or '')
        funde += z.funde
    bf.add('inline', FEHLER if funde else OK, ('; '.join(funde[:3])) if funde else 'kein style=, kein Inline-Skript, kein on…=', 'index.html', len(funde))


class _Inline(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.funde = []
        self._skript = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'style' in a:
            self.funde.append(f'<{tag} style=…>')
        for k in a:
            if k.startswith('on'):
                self.funde.append(f'<{tag} {k}=…>')
        if tag == 'style':
            self.funde.append('<style>')
        if tag == 'script' and not a.get('src') and a.get('type', '') != 'application/json':
            self._skript = True

    def handle_data(self, data):
        if self._skript and data.strip():
            self.funde.append('<script> mit Inhalt')
        self._skript = False

    def handle_endtag(self, tag):
        self._skript = False


def bewerten_rest(bf: Befund, extra: dict, erw: dict):
    for wo, b in extra.get('bewegung', []):
        if 'absturz' in b:
            bf.add('13', UNBESTIMMT, 'Lauf abgestürzt: ' + b['absturz'], wo)
        elif b['befunde']:
            bf.add('13', FEHLER, f"{len(b['befunde'])} Bewegungen, z. B. {b['befunde'][0]}", wo, len(b['befunde']))
        elif not b['geklickt']:
            bf.add('13', UNBESTIMMT, 'ohne Befund, aber keine Kachel zum Öffnen der Karte (Haken fehlt)', wo)
        else:
            bf.add('13', OK, 'nur Deckkraft, auch mit offener Karte' + ('' if b['dialog'] else ' (kein Dialog erschienen)'), wo)
    for wo, z in extra.get('zoom', []):
        if 'absturz' in z:
            bf.add('14', UNBESTIMMT, 'Lauf abgestürzt: ' + z['absturz'], wo)
            continue
        teile = []
        if z['ueberlappt']:
            teile.append(f"{len(z['ueberlappt'])}{'+' if len(z['ueberlappt']) >= 50 else ''} Textpaare überlappen, z. B. {z['ueberlappt'][0]}")
        if z['abgeschnittenZahl']:
            teile.append(f"{z['abgeschnittenZahl']} Texte abgeschnitten, z. B. {z['abgeschnitten'][0]}")
        bf.add('14', FEHLER if teile else (UNBESTIMMT if z.get('gekappt') else OK),
               '; '.join(teile) or f"{z['texte']} Texte, nichts überlappt, nichts abgeschnitten", wo)
    t = extra.get('tastatur')
    if t:
        wo = '1280×800 hell'
        if 'absturz' in t:
            bf.add('10', UNBESTIMMT, 'Lauf abgestürzt: ' + t['absturz'], wo)
        else:
            besucht = {s['id'] for s in t['stopps']}
            gruppen_ok = {z['gruppe'] for z in t['ziele'] if z['gruppe'] and z['id'] in besucht}
            fehlt = [z['name'] for z in t['ziele'] if z['id'] not in besucht and not (z['gruppe'] and z['gruppe'] in gruppen_ok)]
            unsichtbar, unklar = [], []
            for s in t['stopps']:
                r = s.get('ring')
                if not r:
                    unklar.append(s['name'])
                elif r['stark'] < 0.95 * r['soll']:
                    unsichtbar.append(f"{s['name']} ({r['stark']} px² mit ≥ 3:1, Soll {r['soll']})")
            teile = []
            if fehlt:
                teile.append(f'{len(fehlt)} Bedienelemente per Tab nicht erreicht, z. B. {fehlt[0]}')
            if unsichtbar:
                teile.append(f'{len(unsichtbar)} ohne sichtbaren Fokus (≥ 2 px, ≥ 3:1), z. B. {unsichtbar[0]}')
            k = t['karte']
            hat_kacheln = extra.get('hat_kacheln')
            if hat_kacheln and not k:
                teile.append('keine Kachel per Tab erreicht')
            elif k:
                if not k.get('offen'):
                    teile.append('Enter auf der Kachel öffnet keinen Dialog')
                elif not k.get('zu'):
                    teile.append('Esc schließt die Karte nicht')
                elif not k.get('zurueck'):
                    teile.append('Fokus kehrt nach Esc nicht auf die Kachel zurück')
            if teile:
                bf.add('10', FEHLER, '; '.join(teile), wo)
            elif unklar or not hat_kacheln:
                bf.add('10', UNBESTIMMT, (f'{len(unklar)} Fokusringe nicht fotografierbar (außerhalb des Fensters), z. B. {unklar[0]}' if unklar else 'keine Kachel: Enter/Esc nicht prüfbar'), wo)
            else:
                bf.add('10', OK, f"{len(t['stopps'])} Tab-Halte, alle Ziele erreicht, Fokus sichtbar, Enter/Esc an „{k['kachel']}“", wo)
    for wo, s in extra.get('ohne_speicher', []):
        if 'absturz' in s:
            bf.add('16', UNBESTIMMT, 'Lauf abgestürzt: ' + s['absturz'], wo)
            continue
        teile = []
        if not s['pflicht'].get('speicher', {}).get('ok'):
            teile.append('„… speichert die Auswahl nicht“ nicht ohne Scrollen sichtbar')
        if any(f.startswith('Ausnahme') for f in s['fehler']):
            teile.append('Ausnahme: ' + next(f for f in s['fehler'] if f.startswith('Ausnahme')))
        if teile:
            bf.add('16', FEHLER, '; '.join(teile), wo)
        elif not s['kacheln']:
            bf.add('16', UNBESTIMMT, 'Hinweis sichtbar, aber keine Kachel zu sehen (oder Haken fehlt)', wo)
        else:
            bf.add('16', OK, f"Hinweis sichtbar, {len(s['kacheln'])} Kacheln", wo)
    w = extra.get('wahl')
    if w:
        wo = '1280×800 hell'
        if 'absturz' in w:
            bf.add('17', UNBESTIMMT, 'Lauf abgestürzt: ' + w['absturz'], wo)
        elif not w['geklickt']:
            bf.add('17', UNBESTIMMT, 'kein Knopf „Einplanen“ gefunden (auch nicht nach Klick auf eine Kachel)', wo)
        else:
            sp = w['speicher']
            eigene = {k: v for k, v in sp.items() if k.startswith('stundenplanner:v1:')}
            fremde = [k for k in sp if k not in eigene]
            teile = []
            if len(eigene) != 1:
                teile.append(f'{len(eigene)} Schlüssel stundenplanner:v1:… (Soll 1)')
            for v in eigene.values():
                try:
                    d = json.loads(v)
                    extra_f = sorted({f for e in d.values() for f in e if f not in ('group', 'digest', 'name')})
                    if not d:
                        teile.append('leere Auswahl gespeichert')
                    if extra_f:
                        teile.append('gespeichert wird mehr als group/digest/name: ' + ', '.join(extra_f))
                except Exception:
                    teile.append('Wert ist kein JSON')
            if fremde:
                teile.append('weitere Schlüssel: ' + ', '.join(fremde[:3]))
            bf.add('17', FEHLER if teile else OK, '; '.join(teile) or f"nach {' → '.join(w['weg'])}: ein Schlüssel, nur group/digest/name", wo)
    nj = extra.get('ohne_js')
    if nj is not None:
        wo = '1280×800 ohne JS'
        if 'absturz' in nj or 'unmessbar' in nj:
            bf.add('nojs', UNBESTIMMT, nj.get('absturz') or nj.get('unmessbar'), wo)
        else:
            z = nj['zonen']
            fehlt = [n for n in ('kopf', 'raster', 'fuss') if n not in z or not z[n]['sichtbar'] or z[n]['h'] < 1]
            if not z:
                bf.add('nojs', UNBESTIMMT, 'keine Zonen data-sicht im HTML', wo)
            elif fehlt or z.get('raster', {}).get('h', 0) < 100 or nj['seite']['h'] > nj['H']:
                bf.add('nojs', FEHLER, f"ohne JS fehlt: {', '.join(fehlt) or '—'}; Raster {zahl(z.get('raster', {}).get('h'), 0)} px hoch; Seite {nj['seite']['h']} px", wo)
            else:
                bf.add('nojs', OK, f"Kopf, Raster ({zahl(z['raster']['h'], 0)} px) und Fuß stehen ohne JS", wo)


# ---------------------------------------------------------------------------------------------
# Rahmen: Server, Plan, Läufe, Ausgabe
# ---------------------------------------------------------------------------------------------


class _Stiller(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
                      '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'}

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def server_starten(ordner: Path):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_Stiller, directory=str(ordner)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'


def json_holen(url: str):
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


def im_repo(p: Path) -> bool:
    """Bilder nie ins Repo — auch nicht in einen Arbeitsbaum unter .arbeit/ des Klons."""
    wurzeln = {WURZEL}
    try:
        common = subprocess.run(['git', '-C', str(WURZEL), 'rev-parse', '--git-common-dir'], capture_output=True,
                                text=True, timeout=5).stdout.strip()
        if common:
            wurzeln.add((WURZEL / common).resolve().parent)
    except Exception:
        pass
    p = p.resolve()
    return any(p == w or w in p.parents for w in wurzeln)


def fortschritt(text: str, still: bool):
    if not still:
        print(text, file=sys.stderr, flush=True)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='Misst die Abnahmekriterien der Oberfläche (docs/DESIGN.md §8).')
    quelle = ap.add_mutually_exclusive_group()
    quelle.add_argument('--web', help='Ordner mit index.html und daten/ (Vorgabe: web/ im Repo)')
    quelle.add_argument('--url', help='Adresse einer laufenden Seite')
    ap.add_argument('--bilder', help='Ordner für Bildschirmfotos, nur außerhalb des Repos')
    ap.add_argument('--json', action='store_true', help='maschinenlesbar auf stdout')
    ap.add_argument('--fenster', help='nur diese Fenster, z. B. 390x844,1280x720 (Teilmessung)')
    ap.add_argument('--schnell', action='store_true', help='nur leere Auswahl, ohne Stressfall, Zoom, Tastatur (Teilmessung)')
    ap.add_argument('--touch-bis', type=int, default=767, help='Fenster bis zu dieser Breite mit Touch messen (Vorgabe 767)')
    ap.add_argument('--parallel', type=int, default=4, help='Browser zugleich (Vorgabe 4)')
    a = ap.parse_args(argv)
    still = False

    try:
        import playwright  # noqa: F401
    except ImportError:
        print('Playwright fehlt: pip install playwright && python3 -m playwright install chromium', file=sys.stderr)
        return 2

    alle_fenster, budget, nicht_gelesen = aus_design()
    BUDGET.update(budget)
    fenster = alle_fenster
    if a.fenster:
        try:
            fenster = [tuple(int(x) for x in f.lower().split('x')) for f in a.fenster.split(',')]
        except ValueError:
            print('--fenster: Form BxH,BxH, z. B. 390x844,1280x720', file=sys.stderr)
            return 2
    bilder = None
    if a.bilder:
        bilder = Path(a.bilder).expanduser()
        if im_repo(bilder):
            print(f'--bilder {bilder}: liegt im Repo. Bildschirmfotos gehören nie ins Repo, nimm einen Ordner außerhalb.', file=sys.stderr)
            return 2
        bilder.mkdir(parents=True, exist_ok=True)

    srv = None
    if a.url:
        url = a.url if a.url.endswith('/') or a.url.endswith('.html') else a.url + '/'
        ziel = url
        try:
            index = json_holen(urllib.parse.urljoin(url, 'daten/index.json'))
            plan = json_holen(urllib.parse.urljoin(url, 'daten/' + index['plaene'][0]['datei']))
        except Exception as e:
            print(f'Die Daten unter {urllib.parse.urljoin(url, "daten/index.json")} sind nicht lesbar: {e}', file=sys.stderr)
            return 2
    else:
        ordner = Path(a.web) if a.web else WURZEL / 'web'
        if not (ordner / 'index.html').is_file():
            print(f'{ordner}/index.html fehlt.', file=sys.stderr)
            return 2
        idx = ordner / 'daten' / 'index.json'
        if not idx.is_file():
            print(f'{idx} fehlt. Das Werkzeug baut keine Daten. Erzeugen (docs/ARCHITEKTUR.md §7):\n'
                  f'  python3 abruf/abruf.py            # Rohstände von MOSES nach daten/roh/ (dauert, höflich)\n'
                  f'  python3 abruf/bauen.py            # Lesemodell nach web/daten/\n'
                  f'oder aus vorhandenen Rohständen:  python3 abruf/bauen.py --roh <ordner>', file=sys.stderr)
            return 2
        index = json.loads(idx.read_text('utf-8'))
        if not index.get('plaene'):
            print(f'{idx} nennt keinen Plan.', file=sys.stderr)
            return 2
        plan = json.loads((ordner / 'daten' / index['plaene'][0]['datei']).read_text('utf-8'))
        srv, url = server_starten(ordner.resolve())
        ziel = str(ordner)

    seite = url
    if len(index.get('plaene', [])) > 1:          # §4.2: bei mehreren Plänen fragt die Seite zuerst
        seite = url + f"#studiengang={plan['studiengang']['id']}&semester={plan['semester']}&fs={plan['fachsemester']}"
    auswahlen = ('leer',) if a.schnell else AUSWAHLEN
    s_index, s_plan = stressplan()
    stress_daten = (json.dumps(s_index), json.dumps(s_plan))
    erw_stress = erwartung(s_plan, {})

    def bildpfad(name):
        return str(bilder / f'{name}.png') if bilder else None

    aufgaben, specs = [], []
    for (w, h) in fenster:
        touch = w <= a.touch_bis
        for schema in SCHEMEN:
            for aw in auswahlen:
                sel = auswahl_bauen(plan, aw)
                spec = {'fenster': (w, h), 'touch': touch, 'schema': schema, 'auswahl': aw, 'url': seite,
                        'speicher': {'name': speicher_schluessel(plan), 'value': speicher_wert(sel)} if sel else None,
                        'bilder': bildpfad(f'{w}x{h}-{schema}-{aw}')}
                specs.append(('lauf', spec, erwartung(plan, sel)))
        if not a.schnell:
            spec = {'fenster': (w, h), 'touch': touch, 'schema': 'light', 'auswahl': 'stress', 'url': url,
                    'stress': stress_daten, 'bilder': bildpfad(f'{w}x{h}-stress')}
            specs.append(('lauf', spec, erw_stress))
    gross = (1280, 800) if (1280, 800) in fenster or not a.fenster else fenster[-1]
    klein = (390, 844) if (390, 844) in fenster or not a.fenster else fenster[0]
    basis = {'schema': 'light', 'url': seite, 'speicher': None}
    extra_specs = [
        ('bewegung', {**basis, 'fenster': gross, 'touch': gross[0] <= a.touch_bis, 'bewegung': 'reduce'}, 'bewegung'),
        ('bewegung', {**basis, 'fenster': klein, 'touch': klein[0] <= a.touch_bis, 'bewegung': 'reduce'}, 'bewegung'),
        ('lauf', {**basis, 'fenster': klein, 'touch': klein[0] <= a.touch_bis, 'ohne_speicher': True}, 'ohne_speicher'),
        ('lauf', {**basis, 'fenster': gross, 'touch': gross[0] <= a.touch_bis, 'ohne_speicher': True}, 'ohne_speicher'),
        ('ohne_js', {**basis, 'fenster': (1280, 800), 'touch': False, 'ohne_js': True}, 'ohne_js'),
        ('wahl', {**basis, 'fenster': (1280, 800), 'touch': False}, 'wahl'),
    ]
    if not a.schnell:
        extra_specs.append(('tastatur', {**basis, 'fenster': (1280, 800), 'touch': False}, 'tastatur'))
        for (w, h) in ZOOM_FENSTER:
            extra_specs.append(('zoom', {**basis, 'fenster': (w, h), 'touch': False, 'zoom': 2,
                                         'bilder': bildpfad(f'{w}x{h}-zoom200')}, 'zoom'))

    alle = [(art, spec) for art, spec, _ in specs] + [(art, spec) for art, spec, _ in extra_specs]
    fortschritt(f'  sicht.py: {len(specs)} Läufe der Standardansicht, {len(extra_specs) + 1} Sonderläufe, {a.parallel} Browser …', still)
    t0 = time.monotonic()
    ergebnisse = [None] * len(alle)
    with cf.ProcessPoolExecutor(max_workers=max(1, a.parallel)) as ex:
        zukunft = {ex.submit(ausfuehren, auf): i for i, auf in enumerate(alle)}
        fertig = 0
        for fu in cf.as_completed(zukunft):
            i = zukunft[fu]
            try:
                ergebnisse[i] = fu.result()
            except Exception as e:
                ergebnisse[i] = {'absturz': f'{type(e).__name__}: {str(e)[:300]}'}
            fertig += 1
            if fertig % 10 == 0 or fertig == len(alle):
                fortschritt(f'  … {fertig}/{len(alle)} ({int(time.monotonic() - t0)} s)', still)
    # Die Leistung misst ein Browser ALLEIN, nachdem die anderen fertig sind: Parallele Browser
    # teilen sich die CPU und machen TBT und LCP schlechter, als die Seite ist.
    fortschritt('  … Leistung gedrosselt, allein', still)
    hat_kacheln = any(isinstance(m, dict) and m.get('kacheln') for m in ergebnisse[:len(specs)])
    with cf.ProcessPoolExecutor(max_workers=1) as ex:
        leistung = ex.submit(ausfuehren, ('leistung', {**basis, 'fenster': (390, 844), 'touch': True,
                                                       'kachel': hat_kacheln})).result()
    if srv:
        srv.shutdown()

    bf = Befund()
    laeufe = []
    for (art, spec, erw), m in zip(specs, ergebnisse[:len(specs)]):
        bewerten_lauf(bf, spec, m, erw)
        laeufe.append((spec, m))
    bewerten_tokens(bf, laeufe)
    bewerten_tells(bf, laeufe)
    extra = {'bewegung': [], 'zoom': [], 'ohne_speicher': []}
    for (art, spec, rolle), m in zip(extra_specs, ergebnisse[len(specs):]):
        w, h = spec['fenster']
        wo = f'{w}×{h}' + (' Touch' if spec['touch'] else '')
        if rolle in ('bewegung', 'zoom', 'ohne_speicher'):
            extra[rolle].append((wo + (' Zoom 200 %' if rolle == 'zoom' else ''), m))
        else:
            extra[rolle] = m
    bewerten_leistung(bf, leistung)
    extra['leistung'] = leistung
    extra['hat_kacheln'] = any(m.get('kacheln') for _, m in laeufe if 'kacheln' in m)
    bewerten_rest(bf, extra, erwartung(plan, {}))

    teil = bool(a.schnell or a.fenster)
    stati = {k: bf.status(k) for k in PRUEFUNGEN}
    gemessen = {k: s for k, s in stati.items() if s}
    gruen = all(s == OK for s in gemessen.values())
    erw0 = erwartung(plan, {})
    ausgabe = {
        'werkzeug': 'ops/sicht.py', 'ziel': ziel, 'zeit': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'dauer_s': round(time.monotonic() - t0, 1), 'teilmessung': teil,
        'plan': {'studiengang': plan['studiengang']['id'], 'semester': plan['semester'], 'fachsemester': plan['fachsemester'],
                 'bestandteile': erw0['bestandteile'], 'kacheln_leer': erw0['gesamt'], 'achse': erw0['achse'], 'tage': erw0['tage']},
        'fenster': [f'{w}×{h}' for w, h in fenster],
        'budget': dict(BUDGET), 'aus_design_nicht_gelesen': nicht_gelesen,
        'ergebnis': {'gruen': gruen, 'erfuellt': sum(s == OK for s in gemessen.values()),
                     'nicht_erfuellt': sum(s == FEHLER for s in gemessen.values()),
                     'unbestimmt': sum(s == UNBESTIMMT for s in gemessen.values())},
        'pruefungen': [{'id': k, 'abschnitt': PRUEFUNGEN[k][0], 'name': PRUEFUNGEN[k][1], 'status': s,
                        'befunde': [b for b in bf.liste if b['pruefung'] == k]} for k, s in gemessen.items()],
        'laeufe': [lauf_kurz(spec, m) for spec, m in laeufe],
        'leistung': {k: v for k, v in (extra.get('leistung') or {}).items() if k != 'dateien'} | {
            'dateien': [{k: v for k, v in d.items() if k != 'html'} for d in (extra.get('leistung') or {}).get('dateien', [])]},
        'nicht_gemessen': ['§8 #10 außer Tab-Durchlauf, Fokusring und Enter/Esc an einer Kachel',
                           '§8 #11 Parität (Durchlauf von Hand)', '§8 #15 außer den gelisteten Tells',
                           'Lighthouse (LCP/CLS/TBT sind eine Näherung unter Drosselung)'],
    }
    if a.json:
        print(json.dumps(ausgabe, ensure_ascii=False, indent=1))
    else:
        menschlich(ausgabe, laeufe, bf)
    return 0 if gruen else 1


def lauf_kurz(spec, m):
    w, h = spec['fenster']
    if 'absturz' in m:
        return {'fenster': f'{w}×{h}', 'schema': spec['schema'], 'auswahl': spec.get('auswahl'), 'absturz': m['absturz']}
    log = m.get('log') or {}
    return {
        'fenster': f'{w}×{h}', 'touch': spec['touch'], 'coarse': m['coarse'], 'schema': spec['schema'],
        'auswahl': spec.get('auswahl'), 'stress': bool(spec.get('stress')),
        'seite_h': m['seite']['h'], 'seite_b': m['seite']['b'], 'bildschirme': round(m['seite']['h'] / m['H'], 2),
        'aussen': m['aussen'], 'innen_scroll': len(m['innen']), 'abgeschnitten': len(m['abgeschnitten']),
        'ziele': len(m['ziele']), 'ziele_zu_klein': [z['name'] for z in m['ziele']
                                                     if not z['gesperrt'] and not z['dialog'] and min(z['b'], z['h']) < (44 if spec['touch'] and not z['link'] else 24) - 0.01][:20],
        'kontrast_min': m['kontrast']['min'], 'kontrast_fehler': m['kontrast']['fehler'][:20],
        'kontrast_unbestimmt': m['kontrast']['unbestimmt'][:10], 'texte': m['kontrast']['gemessen'],
        'texte_verdeckt': m['kontrast'].get('verdeckt_bsp', []),
        'schriftgroessen': sorted({round(t['groesse'], 2) for t in m['texte']}),
        'gewichte': sorted({t['gewicht'] for t in m['texte']}),
        'chips': len(m['chips']), 'kacheln': len(m['kacheln']), 'stunden': len(m['stunden']), 'tage': len(m['tage']),
        'zonen': {k: round(v['h'], 1) for k, v in m['zonen'].items()},
        'fehler': m['fehler'][:10], 'dom': m['dom'], 'ruhig': m['ruhig'],
        'erste_kachel_ms': round(log['ersteKachel']) if log.get('ersteKachel') is not None else None,
        'ruhig_ms': round(log['letzte']) if log.get('letzte') else None,
        'pflicht': {k: v.get('ok', False) for k, v in m['pflicht'].items()},
    }


def menschlich(aus, laeufe, bf: Befund):
    z = aus['plan']
    print()
    print('  sicht.py — Prüfstand der Oberfläche (docs/DESIGN.md §8)')
    achse = f", Achse {z['achse'][0]:02d}–{z['achse'][1]:02d} Uhr" if z['achse'] else ''
    print(f"  Ziel: {aus['ziel']}")
    print(f"  Plan: {z['studiengang']} {z['semester']} FS {z['fachsemester']}, {z['bestandteile']} Bestandteile, "
          f"{z['kacheln_leer']} Kacheln ohne Auswahl{achse}")
    print()
    kopf = f"  {'Fenster':<11}{'Gerät':<7}{'Seite':>15}  {'außen':>6}  {'Ziele klein':>11}  {'Kontrast':>9}  {'Schrift':>9}  {'Chips':>5}  {'Kacheln':>7}  {'Fehler':>6}  {'Raster':>8}"
    print(kopf)
    print('  ' + '─' * (len(kopf) - 2))
    gruppen: dict = {}
    for spec, m in laeufe:
        if spec.get('stress'):
            continue
        gruppen.setdefault(spec['fenster'], []).append((spec, m))
    for (w, h), liste in gruppen.items():
        ms = [m for _, m in liste if 'absturz' not in m]
        if not ms:
            print(f"  {f'{w}×{h}':<11}abgestürzt")
            continue
        touch = liste[0][0]['touch']
        bs = max(m['seite']['h'] / m['H'] for m in ms)
        breit = any(m['seite']['b'] > m['W'] for m in ms)
        seite = f"{zahl(bs, 1)}×" + (' +breit' if breit else '')
        ok_seite = '✓' if bs <= 1 and not breit else '✗'
        aussen = max(m['aussen'] for m in ms)
        klein = max(len([zz for zz in m['ziele'] if not zz['gesperrt'] and not zz['dialog'] and min(zz['b'], zz['h']) < (44 if touch and not zz['link'] else 24) - 0.01]) for m in ms)
        kmin = min((m['kontrast']['min'] for m in ms if m['kontrast']['min'] is not None), default=None)
        kfehl = max(len(m['kontrast']['fehler']) for m in ms)
        kun = max(len(m['kontrast']['unbestimmt']) for m in ms)
        gr = max(len({round(t['groesse'], 2) for t in m['texte']}) for m in ms)
        gr_falsch = any(round(t['groesse'], 2) not in SCHRIFTGROESSEN for m in ms for t in m['texte'])
        chips = {len(m['chips']) for m in ms}
        kach = {len(m['kacheln']) for m in ms}
        fehler = max(len(m['fehler']) for m in ms)
        zeiten = [m['log']['ersteKachel'] if m['log'].get('ersteKachel') is not None else m['log'].get('letzte') for m in ms if m.get('log')]
        zeiten.sort()
        raster = f"{zahl(zeiten[len(zeiten) // 2], 0)} ms" if zeiten else '—'
        kont = f"{zahl(kmin, 2)}" + (' ✗' if kfehl else (' ?' if kun else ' ✓'))
        print(f"  {f'{w}×{h}':<11}{'Touch' if touch else 'Maus':<7}{seite + ' ' + ok_seite:>15}  {aussen:>6}  {klein:>11}  {kont:>9}  "
              f"{str(gr) + (' ✗' if gr_falsch else ' ✓'):>9}  {'/'.join(map(str, sorted(chips))):>5}  {'/'.join(map(str, sorted(kach))):>7}  {fehler:>6}  {raster:>8}")
    print()
    print('  Seite = höchste Seite durch Fensterhöhe über hell/dunkel und leer/halb/voll (1,0× heißt: scrollt nicht).')
    print('  außen = sichtbare Elemente außerhalb des Fensters · Ziele klein = unter 24 px (Touch: 44 px)')
    print('  Kontrast = kleinster gemessener Text · Schrift = Zahl der Schriftgrößen · Raster = Median bis zur ersten Kachel, sonst bis ruhig')
    print()
    zeichen = {OK: '✓', FEHLER: '✗', UNBESTIMMT: '?'}
    for p in aus['pruefungen']:
        bef = p['befunde']
        schlecht = [b for b in bef if b['status'] != OK]
        n_ok = sum(b['status'] == OK for b in bef)
        detail = ''
        if schlecht:
            b0 = schlecht[0]
            detail = f"{len(schlecht)} von {len(bef)} nicht erfüllt · {b0['wo'] or ''}: {b0['detail']}" if len(bef) > 1 else f"{b0['wo'] or ''}: {b0['detail']}"
        elif bef:
            detail = f"{n_ok} von {len(bef)} erfüllt" + (f" · {bef[0]['detail']}" if len(bef) <= 2 or p['id'] in ('12a', '12b', '10', '15') else '')
        print(f"  {zeichen[p['status']]} {p['abschnitt']:<8}{p['name']}")
        if detail:
            print(f"      {detail[:220]}")
        if p['id'] in ('12a', '12b', '8a', '15') and len(bef) > 1:
            zeilen = [b for b in bef if b['status'] != OK or p['id'] in ('12a', '12b')]
            for b in zeilen[:12]:
                print(f"        {zeichen[b['status']]} {(b['wo'] + ': ') if p['id'] == '8a' else ''}{b['detail'][:200]}")
            if len(zeilen) > 12:
                print(f"        … {len(zeilen) - 12} weitere (--json)")
    print()
    print('  Nicht gemessen (von Hand): ' + '; '.join(aus['nicht_gemessen']))
    if aus['aus_design_nicht_gelesen']:
        print('  Aus docs/DESIGN.md nicht lesbar, Vorgabe aus ops/sicht.py benutzt: ' + ', '.join(aus['aus_design_nicht_gelesen']))
    e = aus['ergebnis']
    farbe = 'GRÜN' if e['gruen'] else 'ROT'
    print(f"  Ergebnis: {farbe}{' (TEILMESSUNG, keine Abnahme)' if aus['teilmessung'] else ''} — "
          f"{e['erfuellt']} erfüllt, {e['nicht_erfuellt']} nicht erfüllt, {e['unbestimmt']} unbestimmt · {zahl(aus['dauer_s'], 0)} s")
    print()


if __name__ == '__main__':
    sys.exit(main())
