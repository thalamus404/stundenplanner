// Die Seite von /silas (V-0321): Silas plant sein Fachsemester so, dass jede Stunde der Leistungspunkte
// einen festen Platz hat. Gerechnet wird in modell.mjs (docs/SILAS.md), hier wird nur gezeigt und
// bedient. Seit V-0333 führt sie durch vier Schritte (Grundlage, Gruppen, Videos, EVL): Links steht, was im
// gewählten Schritt zu entscheiden ist, in der Mitte die Woche (Standardwoche oder eine echte Woche) mit den
// Schichten bis zu diesem Schritt, rechts das Semester als Minimap und das Unregelmäßige.
//
// Daten kommen nur über /silas/api mit dem Schlüssel (functions/silas/api). Der Schlüssel steht in
// localStorage dieses Browsers; die Adresse #schluessel=… legt ihn einmal ab und verschwindet sofort.

import * as M from './modell.mjs';

const API = '/silas/api';
const LS = { schluessel: 'silas:v1:schluessel', stand: 'silas:v1:stand', ansicht: 'silas:v1:ansicht' };
const RASTER_MIN = 15;          // Ziehen rastet auf Viertelstunden
const SPEICHERN_NACH_MS = 900;
const GROB = matchMedia('(pointer: coarse)');

const $ = (id) => document.getElementById(id);
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* privates Fenster: dann eben ohne */ } },
  weg(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
};

/** Ein Element bauen. Text wird immer als Text gesetzt, nie als HTML. */
function h(tag, attrs = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kinder.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
/** Kinder eines Elements ersetzen. Element.replaceChildren mit null schriebe „null“ als Text (V-0328, zweimal in V-0333) —
 *  darum geht JEDES Ersetzen hier durch und lässt null und false weg (ein Test hält replaceChildren hier allein). */
function fuellen(el, ...kinder) {
  el.replaceChildren(...kinder.flat().filter((k) => k != null && k !== false));
}
function sym(name, cls = 'i') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', `#i-${name}`); s.append(u);
  return s;
}
const neueId = (p) => p + Math.random().toString(36).slice(2, 8);
const heute = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const jetztMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const datumMitTag = (iso) => `${M.TAGE[M.wochentag(iso)]} ${M.datumKurz(iso)}`;
const uhr = (m) => M.hhmm(m).replace(/^0/, '');
const zeitspanne = (a, b) => `${uhr(a)}–${uhr(b)}`;
const dmy = (s) => { // „16.10.“ oder „16.10.2026“ → ISO im Semester
  const m = /^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/.exec(s.trim());
  if (!m) return null;
  const v = Z.stand.angebot.semester.vorlesung;
  let j = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +v.von.slice(0, 4);
  const iso = (jj) => `${jj}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  if (!m[3] && iso(j) < v.von) j += 1;
  return M.istDatum(iso(j)) ? iso(j) : null;
};

// ── Zustand ──────────────────────────────────────────────────────────────────────────────────────

const Z = {
  schluessel: null,
  stand: null,          // { version, geaendert, angebot, plan }
  erg: null,            // M.rechnen(...)
  // schritt: 1 Grundlage · 2 Gruppen · 3 Videos · 4 EVL (V-0333). bereich: plan (das Raster: Standardwoche oder eine
  // echte Woche) · frei (Prüfungsvorbereitung in der vorlesungsfreien Zeit, Schritt 4) · offen (Lücken und Annahmen) ·
  // erklaerung (So wird gerechnet).
  ansicht: { schritt: 1, bereich: 'plan', modus: 'standard', woche: null, leiste: true, wochenende: false },
  fokus: null,          // Teil-Id (oder modul:…, pruefung:…), dessen Karte offen ist
  setzen: null,         // Teil-Id der Prüfungsvorbereitung, für die man Lerntage antippt (festgelegt, Prüfungen)
  legen: null,          // { teil, dauer, alle, rest } — der Block, der am Zeiger hängt (V-0335)
  jetzt: {},            // je Schritt der Bestandteil, den Silas links gewählt hat (sonst der erste offene)
  sprung: null,         // { nach } — kurz in einen früheren Schritt zurückgesprungen (V-0336), danach zurück nach `nach`
  auf: {},              // je Schritt das Modul, das Silas trotz „fertig“ aufgeklappt hat
  hell: null,           // Vorkommen-Id, die kurz hervorgehoben wird
  rueck: [],            // Rückgängig-Stapel (JSON der vorigen Stände)
  sync: { lage: 'ruhig', zeit: null, timer: null, laeuft: false, nochmal: false },
  konflikt: null,
};

function ansichtLaden() {
  try { Object.assign(Z.ansicht, JSON.parse(ls.get(LS.ansicht) || '{}')); } catch { /* neu */ }
  // Bis V-0332 hieß das Raster „vorlesung“ und die Wochen der freien Zeit hatten ein eigenes Feld.
  if (Z.ansicht.bereich === 'vorlesung') Z.ansicht.bereich = 'plan';
  if (Z.ansicht.freiWoche) { Z.ansicht.woche = Z.ansicht.freiWoche; Z.ansicht.modus = 'woche'; }
  delete Z.ansicht.freiWoche;
  if (!(Z.ansicht.schritt >= 1 && Z.ansicht.schritt <= 4)) Z.ansicht.schritt = 1;
  if (!['plan', 'frei', 'pruefplan', 'offen', 'erklaerung'].includes(Z.ansicht.bereich)) Z.ansicht.bereich = 'plan';
  // V-0334: einmal neu bei Schritt 1 und der Standardwoche anfangen (Silas: „wenn man reinkommt, erstmal nur … die
  // Grundlage“).
  if (Z.ansicht.v !== 334) Object.assign(Z.ansicht, { v: 334, schritt: 1, bereich: 'plan', modus: 'standard' });
}
const ansichtMerken = () => ls.set(LS.ansicht, JSON.stringify(Z.ansicht));

function rechnen() {
  Z.erg = M.rechnen(Z.stand.angebot, Z.stand.plan, { heute: heute() });
  const wo = Z.erg.wochen;
  if (!Z.ansicht.woche || !wo.some((w) => w.id === Z.ansicht.woche)) {
    const w = M.wocheVon(wo, heute());
    Z.ansicht.woche = (w || (heute() < wo[0].von ? wo[0] : wo[wo.length - 1])).id;
  }
  Z.schritte = M.schritte(Z.erg);
  // Die Standardwoche zeigt je Tag das Mittel der echten Vorlesungswochen (V-0336): Vorher zählte sie Blöcke „alle n
  // Wochen“ und Reihen (7×, 5×) so, als lägen sie jede Woche — 41,75 h statt Ø 37,2 h in Silas' Plan.
  const vl = wo.filter((w) => w.art === 'vorlesung');
  const mittel = { proTag: Array(7).fill(0), belegt: 0, ects: 0 };
  for (const w of vl) { const x = M.woche(Z.erg, w.id); x.proTag.forEach((m, i) => { mittel.proTag[i] += m / vl.length; }); mittel.belegt += x.belegt_min / vl.length; mittel.ects += x.ects_min / vl.length; }
  Z.mittel = mittel;
}

/** Jede Änderung geht hier durch: merken (Rückgängig), ändern, rechnen, zeichnen, speichern. */
function aendern(fn) {
  Z.rueck.push(JSON.stringify({ angebot: Z.stand.angebot, plan: Z.stand.plan }));
  if (Z.rueck.length > 60) Z.rueck.shift();
  fn(Z.stand);
  rechnen();
  zeichnen();
  sichernLokal();
  speichernBald();
}
function rueckgaengig() {
  const alt = Z.rueck.pop();
  if (!alt) return;
  Object.assign(Z.stand, JSON.parse(alt));
  rechnen(); zeichnen(); sichernLokal(); speichernBald();
}

// ── Speicher ─────────────────────────────────────────────────────────────────────────────────────

async function api(weg, opts = {}) {
  const r = await fetch(`${API}/${weg}`, {
    ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${Z.schluessel}`, 'content-type': 'application/json' }, cache: 'no-store',
  });
  let daten = null;
  try { daten = await r.json(); } catch { /* leer */ }
  return { status: r.status, daten };
}

function sichernLokal(ungesichert = true) {
  ls.set(LS.stand, JSON.stringify({ basis: Z.stand.version, angebot: Z.stand.angebot, plan: Z.stand.plan, ungesichert, zeit: Date.now() }));
}

function speichernBald() {
  clearTimeout(Z.sync.timer);
  Z.sync.lage = 'offen'; syncZeigen();
  Z.sync.timer = setTimeout(speichern, SPEICHERN_NACH_MS);
}

async function speichern(erzwingen = false) {
  if (Z.sync.laeuft) { Z.sync.nochmal = true; return; }
  Z.sync.laeuft = true; Z.sync.lage = 'speichert'; syncZeigen();
  try {
    const { status, daten } = await api('stand', { method: 'PUT', body: JSON.stringify({ basis: Z.stand.version ?? null, angebot: Z.stand.angebot, plan: Z.stand.plan, erzwingen }) });
    if (status === 200) {
      Z.stand.version = daten.version; Z.stand.geaendert = daten.geaendert;
      Z.sync.lage = 'ok'; Z.sync.zeit = new Date(); Z.konflikt = null;
      sichernLokal(false);
    } else if (status === 409) {
      Z.sync.lage = 'konflikt'; Z.konflikt = daten;
    } else if (status === 401) {
      torZeigen('Der Schlüssel gilt nicht mehr.');
    } else {
      Z.sync.lage = 'fehler'; Z.sync.text = (daten && (daten.maengel || [daten.fehler]).join(' · ')) || `Fehler ${status}`;
    }
  } catch {
    Z.sync.lage = 'offline';
  } finally {
    Z.sync.laeuft = false;
    syncZeigen(); bannerZeigen();
    if (Z.sync.nochmal) { Z.sync.nochmal = false; speichern(); }
  }
}

function syncZeigen() {
  const el = $('sync');
  const s = Z.sync;
  const t = { ruhig: '', offen: 'nicht gespeichert …', speichert: 'speichert …', konflikt: 'auf anderem Gerät geändert', offline: 'offline — nur in diesem Browser', fehler: 'nicht gespeichert' }[s.lage];
  el.className = 'sync' + (['konflikt', 'fehler', 'offline'].includes(s.lage) ? ' fehler' : s.lage === 'offen' ? ' offen' : s.lage === 'ok' ? ' ok' : '');
  el.textContent = s.lage === 'ok' ? `gespeichert ${M.hhmm(s.zeit.getHours() * 60 + s.zeit.getMinutes())}` : t;
  if (s.lage === 'fehler' && s.text) el.title = s.text;
}

async function neuLaden() {
  const { status, daten } = await api('stand');
  if (status === 200) {
    Z.stand = daten; Z.rueck = []; Z.konflikt = null; Z.sync.lage = 'ok'; Z.sync.zeit = new Date(daten.geaendert);
    sichernLokal(false); rechnen(); zeichnen(); syncZeigen(); bannerZeigen();
  }
}

// ── Start ────────────────────────────────────────────────────────────────────────────────────────

function torZeigen(fehler) {
  $('seite').hidden = true; $('tor').hidden = false;
  const f = $('tor-fehler');
  f.hidden = !fehler; f.textContent = fehler || '';
  if (fehler) ls.weg(LS.schluessel);
  $('tor-schluessel').focus();
}

async function starten() {
  ansichtLaden();
  const frag = /(?:^#|&)schluessel=([A-Za-z0-9_-]{32,128})/.exec(location.hash);
  if (frag) { ls.set(LS.schluessel, frag[1]); history.replaceState(null, '', location.pathname + location.search); }
  Z.schluessel = ls.get(LS.schluessel);
  $('tor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const k = $('tor-schluessel').value.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(k)) { torZeigen('So sieht der Schlüssel nicht aus.'); return; }
    ls.set(LS.schluessel, k); Z.schluessel = k; laden();
  });
  if (!Z.schluessel) { torZeigen(); return; }
  laden();
}

async function laden() {
  let antwort;
  try { antwort = await api('stand'); } catch { antwort = { status: 0 }; }
  const lokal = (() => { try { return JSON.parse(ls.get(LS.stand) || 'null'); } catch { return null; } })();
  if (antwort.status === 401) { torZeigen('Der Schlüssel stimmt nicht.'); return; }
  if (antwort.status === 200) {
    Z.stand = antwort.daten;
    Z.sync.lage = 'ok'; Z.sync.zeit = new Date(Z.stand.geaendert);
    // Ungesicherte Änderungen aus diesem Browser, die auf genau diesem Stand beruhen: nachreichen.
    if (lokal && lokal.ungesichert && lokal.basis === Z.stand.version) {
      Z.stand.angebot = lokal.angebot; Z.stand.plan = lokal.plan; speichernBald();
    } else if (lokal && lokal.ungesichert && lokal.basis !== Z.stand.version) {
      Z.konflikt = { lokal: true, version: Z.stand.version, geaendert: Z.stand.geaendert };
    }
  } else if (antwort.status === 0 && lokal) {
    Z.stand = { version: lokal.basis, angebot: lokal.angebot, plan: lokal.plan };
    Z.sync.lage = 'offline';
  } else {
    torZeigen(antwort.status === 404 ? 'Noch kein Semester gespeichert. Es wird vom NAS eingespielt (docs/BETRIEB.md).'
      : antwort.status === 503 ? 'Der Speicher ist noch nicht eingerichtet.' : 'Der Plan ist gerade nicht erreichbar.');
    if (antwort.status !== 401) ls.set(LS.schluessel, Z.schluessel);
    return;
  }
  $('tor').hidden = true; $('seite').hidden = false;
  rechnen(); zeichnen(); syncZeigen(); bannerZeigen();
  verdrahten();
}

// ── Zeichnen ─────────────────────────────────────────────────────────────────────────────────────

/** Was das Raster zeigt: die Standardwoche oder eine echte Woche (jede Woche des Semesters, auch der freien Zeit). */
const rasterLage = () => ({ std: Z.ansicht.modus === 'standard', woche: Z.ansicht.woche });
const zeigtRaster = () => Z.ansicht.bereich === 'plan' || Z.ansicht.bereich === 'pruefplan';
/** Prüfungsvorbereitung in der Vorlesungszeit (V-0337): das Raster mit gesperrtem Stundenplan, nur die Lernblöcke der
 *  Prüfungen sind bunt und lassen sich legen — früh, abends, am Wochenende, auch jede Woche bis zur Prüfung. */
const pruefplan = () => fertig() && Z.ansicht.bereich === 'pruefplan';
const schritt = () => Z.ansicht.schritt;
/** Festgelegt (V-0334): Silas hat „Stundenplan festlegen“ gedrückt — erst dann ist alles farbig, die Schritte ruhen,
 *  und die Prüfungen sind dran. Bis dahin ist der Plan in Arbeit und die Seite führt Schritt für Schritt. */
const fertig = () => !!(Z.stand && Z.stand.plan.festgelegt);

function zeichnen() {
  if (!fertig() && ['frei', 'pruefplan'].includes(Z.ansicht.bereich)) Z.ansicht.bereich = 'plan'; // Prüfungen erst nach dem Festlegen
  kopfZeichnen();
  moduleZeichnen();
  planKopfZeichnen();
  const r = zeigtRaster();
  $('raster-rahmen').hidden = !r; $('p-fuss').hidden = !r; $('bereich').hidden = r;
  if (r) rasterZeichnen(); else bereichZeichnen();
  bedarfZeichnen();
  leisteZeichnen();
  fussZeichnen();
  $('buehne').classList.toggle('ohne-leiste', !Z.ansicht.leiste);
}

const farbe = (modulId) => {
  const m = (Z.stand.angebot.module || []).find((x) => x.id === modulId);
  return m ? `m${m.farbe || 1}` : '';
};
const modulVon = (id) => (Z.stand.angebot.module || []).find((x) => x.id === id);

function kopfZeichnen() {
  const s = Z.stand.angebot.semester;
  fuellen($('k-links'), h('b', { text: `${s.titel} · ${s.fachsemester ? `${s.fachsemester}. Fachsemester` : ''}` }), h('span', { text: s.studiengang || '' }));
  // Silas, 11.10.: „die Zahl davor muss alles zusammengerechnet sein und dahinter muss stehen minus so und so viele
  // Stunden, die zu viel eingeplant sind.“ Also: eingeplant − zu viel = gedeckt von Soll.
  const su = Z.erg.summe;
  const anteil = su.soll_min ? su.gedeckt_min / su.soll_min : 0;
  const balken = h('div', { class: 'balken', title: `${Math.round(anteil * 100)} % gedeckt` }, h('i'), h('i', { class: 'ueber' }));
  balken.children[0].style.width = `${Math.min(100, anteil * 100)}%`;
  balken.children[1].style.left = `${Math.min(100, anteil * 100)}%`;
  balken.children[1].style.width = `${Math.min(100 - Math.min(100, anteil * 100), (su.ueber_min / su.soll_min) * 100)}%`;
  const zl = Z.erg.summe.zaehler;
  fuellen($('bilanz'), 
    h('div', { class: 'bilanz-text' },
      h('b', {}, su.ueber_min ? h('span', { class: 'gesamt', text: `${M.stunden(su.ist_min).replace(' h', '')} − ` }) : null,
        su.ueber_min ? h('span', { class: 'zuviel', text: `${M.stunden(su.ueber_min).replace(' h', '')} zu viel` }) : null,
        su.ueber_min ? ' = ' : '', `${M.stunden(su.gedeckt_min).replace(' h', '')} von ${M.stunden(su.soll_min)}`),
      h('span', { text: su.fehlt_min ? `${M.stunden(su.fehlt_min)} haben noch keinen festen Platz` : 'alle Leistungspunkte eingeplant' })),
    balken,
    // Die Zähler nach Stufe (V-0332): rot kritisch, orange Achtung, hellblau „du bist dran“ — grau zählt hier nicht.
    h('div', { class: 'zaehler-reihe' },
      zl.kritisch ? h('button', { class: 'zaehler rot', type: 'button', 'data-act': 'bereich', 'data-bereich': 'offen', title: 'Kritisch — jetzt handeln' }, sym('warn'), `${zl.kritisch} kritisch`) : null,
      zl.dran ? h('button', { class: 'zaehler st-dran', type: 'button', 'data-act': 'bereich', 'data-bereich': 'offen', title: 'Du bist dran: eintragen, festlegen, planen' }, sym('stift'), `${zl.dran} zu tun`) : null,
      // Orange steht unter „Offen & Annahmen“, nicht im Kopf — dort wäre es nur eine weitere Zahl.
      !zl.kritisch && !zl.dran ? h('span', { class: 'zaehler gut' }, sym('ok'), 'alles klar') : null),
  );
}

// ── Links: Module ────────────────────────────────────────────────────────────────────────────────

const ART_SYM = { praesenz: 'kalender', video: 'video', selbst: 'buch', pruefung: 'ziel' };

function formText(z) {
  const t = z.teil;
  if (t.art === 'praesenz') {
    if (M.istWahl(t)) {
      const n = (t.optionen || []).length;
      const gew = (t.optionen || []).find((o) => o.id === Z.stand.plan.wahl?.[t.id]);
      if (gew) return `Gewählt: ${gew.label}`;
      return n ? `Wahl · ${n} Gruppen` : 'Wahl · Termine offen';
    }
    const mu = M.muster(t);
    if (!mu.length) return 'Termine offen';
    return mu.map((x) => x.typ === 'serie' ? `${x.tag} ${zeitspanne(M.min(x.start), M.min(x.ende))}${x.ort ? ` · ${x.ort}` : ''}` : `${(x.daten || []).length}× · ${x.ort || ''}`).join(' + ');
  }
  if (t.art === 'video') {
    const n = z.einheiten ? z.einheiten.length : null;
    return `Videos${n ? ` · ${n}×` : ''} · selbst einplanen`;
  }
  if (t.art === 'pruefung') {
    return z.pruefungstermin ? `bis ${datumMitTag(z.pruefungstermin.datum)} · ${z.pruefung.titel}` : `${z.pruefung ? z.pruefung.titel : 'Prüfung'} · Termin offen`;
  }
  const w = z.posten && z.posten.mult > 1 ? `${String(z.posten.h).replace('.', ',')} h je Woche` : 'einmalig';
  return `Lernen · ${w}`;
}

/** Die eine Zeile, die sagt, was an einem Teil fehlt — rot, wenn etwas fehlt. */
const STUFE_SYM = { kritisch: 'warn', achtung: 'warn', dran: 'stift', kommt: 'uhr', spaeter: 'uhr', info: 'info' };

/** Die eine Zeile, die sagt, was an einem Teil zu tun ist — in der Farbe seiner Stufe (V-0332): rot kritisch,
 *  orange Achtung, hellblau „du bist dran“, grau „kommt noch“ oder „später“. */
function lageText(z) {
  if (!z.stufe || z.stufe === 'ok' || z.stufe === 'info') return null;
  const f = z.flags.find((x) => x.stufe === z.stufe);
  if (!f) return null;
  const t = {
    anmelden: () => f.text.replace(`${z.teil.titel}: `, ''),
    wahl_offen: () => 'Gruppe wählen',
    termine_offen: () => 'Termine kommen noch',
    datum_offen: () => 'Prüfungstermin kommt noch',
    ungeplant: () => (f.stufe === 'spaeter' ? `später — ab ${M.datumKurz(z.kritisch_ab)}` : 'noch nicht eingeplant'),
    luecke: () => (f.stufe === 'spaeter' ? `später — ab ${M.datumKurz(z.kritisch_ab)}` : z.strukturell ? `${M.stunden(z.fehlt_min)} umwidmen` : `${M.stunden(z.fehlt_min)} fehlen`),
    einheit_ohne_block: () => 'Wochen ohne Block',
    laenge_offen: () => (f.faellig ? `${f.faellig} Videolängen eintragen` : 'Videolängen kommen noch'),
    freigabe_offen: () => 'Daten kommen noch',
    offen: () => 'Angaben kommen noch',
    konflikt: () => 'Überschneidung',
    unsicher: () => 'bitte prüfen',
    ueber: () => `${M.stunden(z.ueber_min)} zu viel`,
    zu_kurz: () => 'Block zu kurz',
    nach_pruefung: () => 'Block nach der Prüfung',
  }[f.art];
  return { kl: `st-${f.stufe}`, s: STUFE_SYM[f.stufe], t: t ? t() : f.text.split(' — ')[0].slice(0, 44) };
}

/** Welche Teile links stehen: im Ablauf die des gezeigten Schritts (M.schrittVon); festgelegt alle — unter „Woche“
 *  ohne, unter „Prüfungen“ nur die Prüfungsvorbereitung. */
const teileImSchritt = (r, n = schritt()) => r.teile.filter((z) => M.schrittVon(z.teil) === n);
const teileLinks = (r) => (!fertig() ? teileImSchritt(r)
  : r.teile.filter((z) => ['frei', 'pruefplan'].includes(Z.ansicht.bereich) === (M.schrittVon(z.teil) === M.PRUEFUNGEN)));
const gewaehltVon = (t) => (t.optionen || []).find((o) => o.id === (Z.stand.plan.wahl || {})[t.id]) || null;

/** Die Woche, auf die sich „diese Woche“ bezieht: die im Raster gezeigte (null = Standardwoche). */
const bedarfsWoche = () => (zeigtRaster() ? rasterLage().woche && !rasterLage().std ? rasterLage().woche : null : null);
let bedarf = null; // Map Teil-Id → Wochenbedarf, je Zeichnen neu

/** Was ein Schritt von Silas will — oben in der linken Spalte, damit man nie raten muss, was hier zu tun ist. */
const SCHRITT_TUN = {
  1: 'Das steht fest: deine Vorlesungen und die anderen festen Präsenztermine, dazu die Quizze. Hier wählst du nichts — prüf nur, ob es stimmt, und trag fehlende Uhrzeiten oder Räume nach.',
  2: 'Von oben nach unten, immer eine Wahl: Im Raster stehen nur die Gruppen der markierten Sache. Grau ist die Grundlage. Wo es noch keine Gruppen gibt, geht es weiter.',
  3: 'Je Video ein fester Platz jede Woche. Die Vorgabe sagt, wie lang; „Block legen“ hängt ihn an den Zeiger, grün sind freie Plätze, ein Klick legt ihn ab.',
  4: 'Eigenverantwortliches Lernen in Blöcken von 1,5–2 h. „Block legen“ hängt ihn an den Zeiger; freie Plätze sind grün, zwischen 10 und 18 Uhr kräftiger. Danach: Stundenplan festlegen.',
};

// ── Geführt: die Reihe je Schritt (V-0335) ──────────────────────────────────────────────────────
// Silas, 11.10.: „dass man von oben nach unten durchgeführt wird. Man fängt an mit dem ersten Modul … und damit der
// ersten Sache … eine Zusammenfassung, welche alle da gewählt werden und wie viele jeweils vorhanden sind … du wählst
// halt genau gerade eine einzige Sache.“ Jeder Schritt hat eine Reihe in der Reihenfolge der Module; dran ist, was
// Silas links gewählt hat, sonst die erste offene Sache. Nach jeder Wahl, nach jedem fertigen Block rückt sie weiter.

/** Die Reihe eines Schritts: in 2 jede Wahl (mit Zahl der Gruppen und der gewählten), in 3 und 4 jeder Bestandteil
 *  mit Soll und seiner Vorgabe je Woche (M.vorgabe). */
function reihe(n = schritt()) {
  const aus = [];
  const tol = Z.erg.regeln.toleranz_min;
  for (const r of Z.erg.module) {
    for (const z of r.teile) {
      if (M.schrittVon(z.teil) !== n) continue;
      if (n === 2) {
        const anzahl = (z.teil.optionen || []).length, gew = gewaehltVon(z.teil);
        aus.push({ z, anzahl, gew, fertig: !!gew, offen: anzahl > 0 && !gew });
      } else if (n >= 3 && n <= 4) {
        const vg = M.vorgabe(Z.erg, z.teil.id);
        if (!vg) continue;
        const woche = (Z.stand.plan.bloecke || []).filter((b) => b.teil === z.teil.id && !b.datum).length;
        const erledigt = z.fehlt_min < tol || woche >= vg.anzahl;
        aus.push({ z, vg, woche, fertig: erledigt, offen: !erledigt });
      }
    }
  }
  return aus;
}
function jetztIn(n = schritt()) {
  const liste = reihe(n);
  return (Z.jetzt[n] && liste.find((x) => x.z.teil.id === Z.jetzt[n])) || liste.find((x) => x.offen) || null;
}
/** Die Vorgabe als Satz: „1,5 h jede Woche — 16× = 24 h von 30 h“. */
function vorgabeText(vg, kurz = false) {
  const block = `${vg.anzahl > 1 ? `${vg.anzahl} × ` : ''}${M.stunden(vg.dauer_min)}`;
  const takt = vg.alle > 1 ? `alle ${vg.alle} Wochen` : 'jede Woche';
  if (kurz) return `${block} ${vg.alle > 1 ? `alle ${vg.alle} Wo.` : 'je Woche'}`;
  return `${block} ${takt} — ${vg.wochen}×${vg.bis ? ` (bis ${M.datumKurz(vg.bis)})` : ''} = ${M.stunden(vg.summe_min)} von ${M.stunden(vg.soll_min)}`;
}

function reiheEl(n) {
  const liste = reihe(n);
  if (!liste.length) return null;
  const j = jetztIn(n);
  return h('ol', { class: 'reihe' }, ...liste.map((x) => {
    const m = x.z.modul, t = x.z.teil, dran = j && j.z === x.z;
    const stand = n === 2
      ? (x.gew ? `✓ ${x.gew.label.split(' · ').slice(0, 2).join(' · ')}` : x.anzahl ? `${x.anzahl} Gruppen` : '0 vorhanden')
      : (x.fertig ? `✓ ${M.stunden(x.z.ist_min)}` : vorgabeText(x.vg, true));
    const li = h('li', { class: `m${m.farbe || 1}${dran ? ' dran' : ''}${x.fertig ? ' fertig' : ''}${!x.offen && !x.fertig ? ' kommt' : ''}` },
      h('button', { type: 'button', class: 'r-zeile', 'data-act': 'jetzt', 'data-teil': t.id, 'aria-current': dran ? 'true' : null },
        h('span', { class: 'm-punkt' }), h('span', { class: 'r-name', text: `${M.kurz(m)} · ${t.titel}` }), h('span', { class: 'r-stand', text: stand })));
    if (dran && n === 2) {
      li.append(h('p', { class: 'r-satz', text: x.gew ? 'Gewählt. Eine andere Gruppe im Raster anklicken, um umzuwählen.' : `Wähl im Raster eine der ${x.anzahl} Gruppen (gestrichelt).` }));
    }
    if (dran && n >= 3) {
      const an = Z.legen && Z.legen.teil === t.id;
      li.append(h('p', { class: 'r-satz', text: `Vorgabe: ${vorgabeText(x.vg)}${x.vg.video_min ? ` (die Videos brauchen ${M.stunden(x.vg.video_min)})` : ''}. Gelegt: ${M.stunden(x.z.ist_min)}.` }),
        h('button', { type: 'button', class: `knopf klein${an ? ' an' : ' haupt'}`, 'data-act': an ? 'legen-aus' : 'legen', 'data-teil': t.id }, sym(an ? 'zu' : 'plus'),
          an ? 'Block hängt am Zeiger — abbrechen' : `Block legen · ${M.stunden(x.vg.dauer_min)}${x.vg.alle > 1 ? `, alle ${x.vg.alle} Wochen` : ''}`));
    }
    return li;
  }));
}

/** Im Prüfplan: jede Prüfungsvorbereitung nach Datum der Prüfung, mit Länge und „Block legen“. */
function pruefReiheEl() {
  const pz = [...Z.erg.teile.values()].filter((z) => z.teil.art === 'pruefung')
    .sort((a, b) => ((a.pruefungstermin && a.pruefungstermin.datum) || '9') < ((b.pruefungstermin && b.pruefungstermin.datum) || '9') ? -1 : 1);
  return h('ol', { class: 'reihe' }, ...pz.map((z) => {
    const m = z.modul, x = z.pruefungstermin, an = Z.legen && Z.legen.teil === z.teil.id;
    return h('li', { class: `m${m.farbe || 1}${an ? ' dran' : ''}${z.fehlt_min < Z.erg.regeln.toleranz_min ? ' fertig' : ''}` },
      h('div', { class: 'r-zeile' }, h('span', { class: 'm-punkt' }), h('span', { class: 'r-name', text: `${M.kurz(m)} · ${z.pruefung ? z.pruefung.titel : z.teil.titel}` }),
        h('span', { class: 'r-stand', text: `${x ? M.datumKurz(x.datum) : 'offen'} · ${M.stunden(z.ist_min).replace(' h', '')}/${M.stunden(z.soll_min)}` })),
      h('div', { class: 'r-legen' },
        h('select', { 'aria-label': 'Länge des Blocks' }, ...[60, 90, 120, 180, 240].map((d) => h('option', { value: String(d), selected: d === 120, text: M.stunden(d) }))),
        h('button', { type: 'button', class: `knopf klein${an ? ' an' : ''}`, 'data-act': an ? 'legen-aus' : 'legen-pruefung', 'data-teil': z.teil.id }, sym(an ? 'zu' : 'plus'), an ? 'abbrechen' : 'Block legen')));
  }));
}

function moduleZeichnen() {
  const box = $('module');
  const oben = box.scrollTop;
  const woche = Z.ansicht.links === 'woche' && (fertig() || schritt() > 2);
  const wid = bedarfsWoche();
  bedarf = new Map(M.wochenBedarf(Z.stand.angebot, Z.stand.plan, Z.erg, wid).map((b) => [b.z.teil.id, b]));
  const w = wid && Z.erg.wochen.find((x) => x.id === wid);
  const n = schritt();
  const sch = M.SCHRITTE[n - 1];
  // Im Ablauf: was der Schritt will und der Weg weiter (V-0334, Silas: „und dann, wenn man alles gewählt hat, dann kann
  // man sagen, Stundenplan festlegen“). Festgelegt: woran man ist.
  const tun = !fertig()
    ? h('div', { class: 'schritt-tun' }, h('b', { text: `Schritt ${sch.nr} · ${sch.titel}` }), h('span', { text: SCHRITT_TUN[sch.nr] }), n >= 2 ? reiheEl(n) : null,
      n < 4 ? h('button', { type: 'button', class: 'knopf haupt', 'data-act': 'schritt', 'data-schritt': String(n + 1) }, `Weiter: ${n + 1} · ${M.SCHRITTE[n].titel}`, sym('rechts'))
        : h('button', { type: 'button', class: 'knopf haupt', 'data-act': 'festlegen' }, sym('ok'), 'Stundenplan festlegen'))
    : Z.ansicht.bereich === 'pruefplan'
      ? h('div', { class: 'schritt-tun' }, h('b', { text: 'Vorbereitung in der Vorlesungszeit' }), h('span', { text: 'Wähl die Länge und „Block legen“: Er hängt am Zeiger, grün ist frei (7–22 Uhr, auch am Wochenende). In der Standardwoche liegt er jede Woche bis zum Tag vor der Prüfung, in einer echten Woche nur dort.' }), pruefReiheEl())
    : Z.ansicht.bereich === 'frei'
      ? h('div', { class: 'schritt-tun' }, h('b', { text: 'Prüfungen' }), h('span', { text: 'Termine, Anmeldungen und die Vorbereitung. Die planst du ab Mitte des Semesters: Prüfung wählen, dann im Kalender die Tage antippen — oder „Vorlesungszeit öffnen“.' }))
      : h('div', { class: 'schritt-tun' }, h('b', { text: 'Dein Stundenplan' }), h('span', { text: 'Festgelegt — alles in Farbe. Ändern: oben „Stundenplan bearbeiten“ oder bei einem Bestandteil „In Schritt … bearbeiten“.' }));
  const kopf = h('div', { class: 'links-kopf' }, tun,
    fertig() || n > 2 ? h('div', { class: 'umschalter', role: 'group', 'aria-label': 'Zeitraum der Module' },
      h('button', { type: 'button', 'aria-pressed': String(!woche), 'data-act': 'links', 'data-wert': 'semester', text: 'Ganzes Semester' }),
      h('button', { type: 'button', 'aria-pressed': String(woche), 'data-act': 'links', 'data-wert': 'woche', text: 'Diese Woche' })) : null,
    woche ? h('span', { class: 'links-satz', text: w ? `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}: was dran wäre und was davon im Plan ist` : 'Eine typische Vorlesungswoche: was dran wäre und was davon im Plan ist' }) : null);
  // Blöcke ohne Modul (Puffer, Wochenstart), die auf einem Termin liegen, gehören in Schritt 4.
  const plan = (fertig() ? Z.ansicht.bereich === 'plan' : n === 4) && Z.erg.planFlags.length
    ? h('section', { class: 'modul plan-flaggen' }, h('div', { class: 't-flaggen' }, ...Z.erg.planFlags.map(flaggeEl))) : null;
  fuellen(box, kopf, plan, ...Z.erg.module.map(modulKarte));
  box.scrollTop = oben;
}

/** Schritt 2: je Modul, was gewählt ist und was noch fehlt (Silas: „bei den Modulen an der Seite klar zu erkennen, wie
 *  viel man noch wählen muss und was schon gewählt wurde“). */
function wahlStand(zs) {
  const waehlbar = zs.filter((z) => (z.teil.optionen || []).length);
  const gew = waehlbar.filter((z) => gewaehltVon(z.teil));
  const kommt = zs.length - waehlbar.length;
  return { gew: gew.length, waehlbar: waehlbar.length, kommt, alle: zs.length };
}

function modulKarte(r) {
  const m = r.modul;
  const woche = Z.ansicht.links === 'woche' && (fertig() || schritt() > 2);
  const n = schritt();
  const zs = teileLinks(r);
  const pruefungen = (m.pruefungen || []);
  // Schritt 1 zeigt dazu die Quizze (ihre Fristen sind Grundlage, ihre Bearbeitung ist EVL); die Prüfungen stehen
  // erst nach dem Festlegen unter „Prüfungen“.
  const quizze = !fertig() && n === 1 ? r.teile.filter((z) => M.kategorie(z.teil) === 'quiz' && z.teil.art !== 'pruefung') : [];
  const pListe = fertig() && Z.ansicht.bereich === 'frei' ? pruefungen : [];
  const filter = Z.fokus === `modul:${m.id}`;
  const leer = !zs.length && !quizze.length && !pListe.length;
  // Kopfzahl: in Schritt 2 gewählt/zu wählen, sonst Stunden.
  let zahl = null, anteil = 1;
  if (!fertig() && n === 2 && zs.length) {
    const st = wahlStand(zs);
    anteil = st.alle ? st.gew / st.alle : 1;
    const fehlt = st.waehlbar - st.gew;
    zahl = h('p', { class: 'm-zahl' }, h('span', { text: st.waehlbar ? `${st.gew} von ${st.alle} gewählt` : 'noch nichts zu wählen' }),
      h('span', { class: fehlt ? 'fehlt' : '', text: fehlt ? `${fehlt} noch wählen` : st.kommt ? `${st.kommt} ${st.kommt > 1 ? 'kommen' : 'kommt'} noch` : 'alles gewählt' }));
  } else if (zs.length && !(!fertig() && n === 1)) {
    const soll = woche ? zs.reduce((s, z) => s + (bedarf.get(z.teil.id)?.soll_min || 0), 0) : zs.reduce((s, z) => s + z.soll_min, 0);
    const ist = woche ? zs.reduce((s, z) => s + Math.min(bedarf.get(z.teil.id)?.ist_min || 0, bedarf.get(z.teil.id)?.soll_min || 0), 0) : zs.reduce((s, z) => s + z.gedeckt_min, 0);
    const fehlt = Math.max(0, soll - ist);
    anteil = soll ? ist / soll : 1;
    zahl = h('p', { class: 'm-zahl' }, h('span', { text: `${M.stunden(ist)} von ${M.stunden(soll)}${woche ? ' diese Woche' : fertig() ? '' : ` in Schritt ${n}`}` }),
      fehlt >= (woche ? 15 : Z.erg.regeln.toleranz_min) ? h('span', { class: 'fehlt', text: `${M.stunden(fehlt)} offen` }) : h('span', { text: soll ? 'gedeckt' : '' }));
  } else if (zs.length) {
    zahl = h('p', { class: 'm-zahl' }, h('span', { text: `${zs.reduce((s, z) => s + z.vk.length, 0)} feste Termine` }), h('span', { text: 'steht fest' }));
  }
  const balken = zahl ? h('div', { class: 'balken' }, h('i')) : null;
  if (balken) balken.firstChild.style.width = `${Math.min(100, anteil * 100)}%`;
  // Hinweise am Modul: was in diesem Schritt (oder festgelegt: unter diesem Reiter) kritisch ist.
  const hier = (f) => (fertig() ? (Z.ansicht.bereich === 'frei') === (M.schrittVonFlagge(f, null) === M.PRUEFUNGEN) : M.schrittVonFlagge(f, null) === n);
  const wichtig = r.flags.filter((f) => hier(f) && (f.stufe === 'kritisch' || ((n === 1 || Z.ansicht.bereich === 'frei') && f.stufe === 'achtung' && !(fertig() && pListe.length))));
  const st = M.hoechste(wichtig);
  const kritisch = zs.some((z) => z.stufe === 'kritisch') || wichtig.some((f) => f.stufe === 'kritisch');
  const unterPruefung = zs.filter((z) => z.teil.art === 'pruefung');
  const oben = zs.filter((z) => z.teil.art !== 'pruefung');
  // Eingeklappt (V-0336, Silas: „sobald man für ein Modul in dem jeweiligen Schritt alles gewählt hat, soll sich das
  // ganze Ding einklappen und da soll einfach nur ein grüner Haken hinter sein … und ein kleiner Button, … dass man das
  // wieder aufklappt“): im Ablauf ab Schritt 2, wenn keine Sache des Moduls mehr offen ist — außer Silas hat es
  // aufgeklappt oder die Sache, die dran ist, gehört zu ihm.
  if (!fertig() && n >= 2 && zs.length) {
    const r2 = reihe(n).filter((x) => x.z.modul === m);
    const dran = jetztIn(n);
    const offenBleibt = r2.some((x) => x.offen) || Z.auf[n] === m.id || (dran && dran.z.modul === m);
    if (r2.length && !offenBleibt) {
      const alle = r2.every((x) => x.fertig);
      return h('section', { class: `modul m${m.farbe || 1} zu${kritisch ? ' rot' : ''}`, 'data-modul': m.id },
        h('button', { class: 'm-kopf', type: 'button', 'data-act': 'aufklappen', 'data-modul': m.id, title: 'Aufklappen und ändern' },
          h('span', { class: 'm-punkt' }), h('span', { class: 'm-name', text: M.kurz(m) }), h('span', { class: 'm-titel', text: m.titel }), h('span', { class: 'm-lp', text: `${m.lp} LP` })),
        h('div', { class: 'm-fertig' },
          alle ? h('span', { class: 'ok' }, sym('ok'), n === 2 ? 'alles gewählt' : 'alles gelegt') : h('span', { text: 'nichts wählbar — kommt noch' }),
          h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'aufklappen', 'data-modul': m.id }, sym('stift'), n === 2 ? 'Wahl ändern' : 'Termine ändern')),
        wichtig.length ? h('button', { type: 'button', class: `m-hinweis st-${st}`, 'data-act': 'bereich', 'data-bereich': 'offen', title: wichtig.map((f) => f.text).join('\n') }, sym(STUFE_SYM[st]),
          wichtig.length === 1 ? wichtig[0].text.slice(0, 70) + (wichtig[0].text.length > 70 ? ' …' : '') : `${wichtig.length} Punkte`) : null);
    }
  }
  return h('section', { class: `modul m${m.farbe || 1}${kritisch ? ' rot' : ''}${leer ? ' leer' : ''}${filter ? ' filter' : ''}`, 'data-modul': m.id },
    h('button', { class: 'm-kopf', type: 'button', 'data-act': 'modul', 'data-modul': m.id, 'aria-pressed': String(filter), title: !fertig() && n === 2 ? 'Nur die Gruppen dieses Moduls im Raster' : 'Dieses Modul hervorheben' },
      h('span', { class: 'm-punkt' }), h('span', { class: 'm-name', text: M.kurz(m) }), h('span', { class: 'm-titel', text: m.titel }), h('span', { class: 'm-lp', text: `${m.lp} LP` })),
    balken, zahl,
    leer ? h('p', { class: 'm-zahl', text: fertig() ? '' : 'In diesem Schritt nichts zu entscheiden' }) : null,
    wichtig.length ? h('button', { type: 'button', class: `m-hinweis st-${st}`, 'data-act': 'bereich', 'data-bereich': 'offen', title: wichtig.map((f) => f.text).join('\n') }, sym(STUFE_SYM[st]),
      wichtig.length === 1 ? wichtig[0].text.slice(0, 70) + (wichtig[0].text.length > 70 ? ' …' : '') : `${wichtig.length} Punkte`) : null,
    fertig() && filter ? modulDetail(r) : null,
    oben.length || quizze.length ? h('ul', { class: 'm-teile' },
      ...oben.map((z) => h('li', {}, teilZeile(z), Z.fokus === z.teil.id ? teilKarte(z) : null)),
      ...quizze.map((z) => h('li', {}, quizZeile(z), Z.fokus === `quiz:${z.teil.id}` ? teilKarte(z) : null))) : null,
    pListe.length ? h('ul', { class: 'm-teile' }, ...pListe.map((p) => h('li', {}, pruefungZeile(r, p), Z.fokus === `pruefung:${p.id}` ? pruefungKarte(r, p) : null))) : null,
    unterPruefung.length ? h('p', { class: 'm-unter', text: 'Vorbereitung' }) : null,
    unterPruefung.length ? h('ul', { class: 'm-teile' }, ...unterPruefung.map((z) => h('li', {}, teilZeile(z), Z.fokus === z.teil.id ? teilKarte(z) : null))) : null,
  );
}

/** Eine Meldung als Zeile, in der Farbe ihrer Stufe (mit „Angemeldet ✓“, wo es eine Anmeldung ist). */
function flaggeEl(f) {
  return h('div', { class: `flagge st-${f.stufe}`, title: M.STUFE_TEXT[f.stufe] }, sym(STUFE_SYM[f.stufe]),
    h('span', {}, f.text, f.art === 'anmelden' && f.stufe !== 'info' ? h('button', { type: 'button', class: 'knopf klein', 'data-act': 'angemeldet', 'data-id': f.anmeldung, text: 'Angemeldet ✓' }) : null));
}

/** Schritt 1: ein Quiz mit seinen Fristen (die Bearbeitung plant Silas in Schritt 4). */
function quizZeile(z) {
  const es = z.einheiten || [];
  const fristen = es.filter((e) => e.bis).sort((a, b) => (a.bis < b.bis ? -1 : 1));
  const naechste = fristen.find((e) => e.bis >= heute());
  const text = fristen.length ? `${fristen.length} Fristen${naechste ? ` · nächste ${datumMitTag(naechste.bis)}${naechste.bis_zeit ? ` ${naechste.bis_zeit}` : ''}` : ' · alle vorbei'}`
    : 'Fristen kommen noch';
  return h('button', { class: `teil${Z.fokus === `quiz:${z.teil.id}` ? ' fokus' : ''}`, type: 'button', 'data-act': 'quiz', 'data-teil': z.teil.id, 'aria-expanded': String(Z.fokus === `quiz:${z.teil.id}`) },
    h('span', { class: 't-sym k-quiz', title: 'Quiz' }, sym('buch')),
    h('span', { class: 't-text' }, h('span', { class: 't-name', text: z.teil.titel }), h('span', { class: 't-form', text: 'Quiz · bearbeiten in Schritt 4' }),
      h('span', { class: `t-lage ${fristen.length ? '' : 'st-kommt'}` }, sym(fristen.length ? 'kalender' : 'uhr'), text)),
    h('span', { class: 't-stand' }, h('span', { text: es.length ? `${es.length}×` : '' })));
}

/** Schritt 1 und 2: eine Prüfung mit ihren Terminen und der Anmeldung. */
function pruefungZeile(r, p) {
  const datiert = (p.termine || []).filter((x) => M.istDatum(x.datum));
  const fs = r.flags.filter((f) => f.pruefung === p.id);
  const st = M.hoechste(fs);
  const gilt = M.pruefungsTermin(r.modul, p.id, Z.stand.plan).termin;
  const text = datiert.length ? datiert.map((x) => `${x === gilt ? '' : '('}${datumMitTag(x.datum)}${x.start ? ` ${x.start}` : ''}${x === gilt ? '' : ')'}`).join(' · ') : 'Termin kommt noch';
  const lage = fs.length && st !== 'ok' && st !== 'info' ? fs.find((f) => f.stufe === st) : null;
  return h('button', { class: `teil${Z.fokus === `pruefung:${p.id}` ? ' fokus' : ''}`, type: 'button', 'data-act': 'pruefung', 'data-pruefung': p.id, 'aria-expanded': String(Z.fokus === `pruefung:${p.id}`) },
    h('span', { class: 't-sym k-pruefung', title: 'Prüfung' }, sym('ziel')),
    h('span', { class: 't-text' }, h('span', { class: 't-name', text: p.titel }), h('span', { class: 't-form', text }),
      lage ? h('span', { class: `t-lage st-${lage.stufe}` }, sym(STUFE_SYM[lage.stufe]), lage.text.replace(`${p.titel}: `, '').replace(`${p.titel}, `, '').slice(0, 60)) : null),
    h('span', { class: 't-stand' }, h('span', { text: datiert.length ? `${datiert.length}×` : '' })));
}

/** Die Karte einer Prüfung: Meldungen, in Schritt 2 die Wahl des Termins, die Formulare für Datum, Zeit und Raum. */
function pruefungKarte(r, p) {
  const k = h('div', { class: 't-karte' });
  const fs = r.flags.filter((f) => f.pruefung === p.id).sort((a, b) => M.STUFEN.indexOf(a.stufe) - M.STUFEN.indexOf(b.stufe));
  if (fs.length) k.append(h('div', { class: 't-flaggen' }, ...fs.map(flaggeEl)));
  const datiert = (p.termine || []).filter((x) => M.istDatum(x.datum));
  if (datiert.length > 1) {
    const wahl = (Z.stand.plan.pruefungstermin || {})[p.id];
    const gilt = M.pruefungsTermin(r.modul, p.id, Z.stand.plan).termin;
    k.append(h('div', { class: 'termin-wahl' }, h('span', { class: 't-zahlen', text: 'Welchen Termin schreibst du? Ohne Wahl gilt der erste reguläre; die Vorbereitung zählt bis dahin.' }),
      ...datiert.map((x) => h('button', { type: 'button', class: `knopf klein${(wahl ? wahl === x.datum : x === gilt) ? ' an' : ''}`, 'data-act': 'pruefung-wahl', 'data-pruefung': p.id, 'data-datum': x.datum, title: [x.ort, x.quelle].filter(Boolean).join(' · ') },
        `${x.label ? `${x.label}: ` : ''}${datumMitTag(x.datum)}${x.start ? ` ${x.start}` : ''}`))));
  }
  const z = r.teile.find((x) => x.teil.pruefung === p.id);
  if (z) k.append(...pruefungFormulare(z, true));
  return k;
}
/** Die Aufwandstabelle des Moduls (amtlich) neben dem, was davon eingeplant ist — so sieht man die
 *  Logik: Posten → Bestandteile → Stunden im Kalender. */
function modulDetail(r) {
  const m = r.modul;
  const zeilen = (m.posten || []).map((p) => {
    const zs = r.teile.filter((z) => z.teil.posten === p.id);
    const soll = zs.reduce((s, z) => s + z.soll_min, 0), ged = zs.reduce((s, z) => s + z.gedeckt_min, 0);
    return h('div', { class: 'flagge' }, h('span', { text: ged >= soll - 15 ? '✓' : '·' }),
      h('span', { text: `${p.titel}: ${p.mult > 1 ? `${p.mult} × ${String(p.h).replace('.', ',')} h = ` : ''}${M.stunden(M.postenGesamt(p))} · eingeplant ${M.stunden(ged)}` }));
  });
  return h('div', { class: 't-karte' },
    h('p', { class: 't-zahlen', text: `Modulbeschreibung #${m.nr} · ${m.lp} LP × ${Z.erg.regeln.lp_h} h = ${M.stunden(r.soll_min)}${m.verantwortlich ? ` · ${m.verantwortlich}` : ''}` }),
    h('div', { class: 't-flaggen' }, ...zeilen),
    ...(m.pruefungen || []).map((p) => h('p', { class: 't-zahlen', text: `${p.titel}: ${(p.termine || []).filter((x) => x.datum).map((x) => `${datumMitTag(x.datum)}${x.start ? ` ${x.start}` : ''}${x.label ? ` (${x.label})` : ''}`).join(', ') || 'Termin offen'}` })),
    ...(m.notizen || []).map((n) => h('p', { class: 't-zahlen', text: n })),
    m.links && m.links.isis ? h('p', { class: 't-zahlen' }, h('a', { href: m.links.isis, target: '_blank', rel: 'noopener noreferrer', text: 'ISIS-Kurs öffnen' })) : null,
  );
}

function teilZeile(z) {
  const t = z.teil;
  const woche = Z.ansicht.links === 'woche' && (fertig() || schritt() > 2);
  const bw = woche ? bedarf.get(t.id) : null;
  let lage = lageText(z);
  // In der Wochensicht sagt die Zeile, was in dieser Woche fehlt (Silas: „was wäre theoretisch dran und was ist davon
  // tatsächlich eingeplant“); kritische und orange Meldungen des Semesters bleiben trotzdem sichtbar.
  if (bw && (!lage || !['st-kritisch', 'st-achtung'].includes(lage.kl))) {
    lage = bw.grund === 'kommt' ? { kl: 'st-kommt', s: 'uhr', t: 'Termine kommen noch' }
      : bw.grund === 'waehlen' ? { kl: 'st-dran', s: 'stift', t: 'Gruppe wählen' }
      : bw.grund === 'planen' ? { kl: 'st-dran', s: 'stift', t: `${M.stunden(bw.offen_min)} diese Woche offen` } : null;
  }
  const soll = bw ? bw.soll_min : z.soll_min, ist = bw ? bw.ist_min : z.ist_min;
  const anteil = soll ? Math.min(1, ist / soll) : 1;
  const balken = h('div', { class: 'balken' }, h('i'));
  balken.firstChild.style.width = `${anteil * 100}%`;
  const hatTermin = t.art === 'praesenz';
  // In Schritt 2 zählt die Wahl, nicht die Stunden: gewählt ✓, wählen, kommt noch.
  const wahl = !fertig() && schritt() === 2 && M.schrittVon(t) === 2;
  const gew = wahl && gewaehltVon(t);
  const standEl = wahl
    ? h('span', { class: `t-stand t-wahl ${gew ? 'gut' : (t.optionen || []).length ? 'st-dran' : 'st-kommt'}`, text: gew ? 'gewählt ✓' : (t.optionen || []).length ? 'wählen' : 'kommt noch' })
    : h('span', { class: `t-stand ${lage ? lage.kl : ''}` }, h('span', { text: `${M.stunden(ist).replace(' h', '')}/${M.stunden(soll)}` }), balken);
  return h('button', {
    class: `teil${Z.fokus === t.id ? ' fokus' : ''}`, type: 'button', 'data-act': 'teil', 'data-teil': t.id, 'data-status': z.status,
    'aria-expanded': String(Z.fokus === t.id),
  },
  h('span', { class: `t-sym k-${M.kategorie(t)}${hatTermin && !z.vk.length ? ' leer' : ''}`, title: { praesenz: 'Termin der Lehrveranstaltung', video: 'Video', selbst: 'Selbststudium', pruefung: 'Prüfungsvorbereitung' }[t.art] }, sym(M.istWahl(t) ? 'gruppen' : ART_SYM[t.art])),
  h('span', { class: 't-text' },
    h('span', { class: 't-name', text: t.titel }),
    h('span', { class: 't-form', text: formText(z) }),
    lage ? h('span', { class: `t-lage ${lage.kl}` }, sym(lage.s), lage.t) : null),
  standEl,
  );
}

function teilKarte(z) {
  const t = z.teil;
  const k = h('div', { class: 't-karte' });
  const geordnet = [...z.flags].sort((a, b) => M.STUFEN.indexOf(a.stufe) - M.STUFEN.indexOf(b.stufe));
  k.append(h('div', { class: 't-flaggen' }, ...geordnet.map(flaggeEl)));
  k.append(h('p', { class: 't-zahlen', text: `Soll ${M.stunden(z.soll_min)}${z.soll_min !== z.soll_orig_min ? ` (umgewidmet, vorher ${M.stunden(z.soll_orig_min)})` : ''} · eingeplant ${M.stunden(z.ist_min)}${z.ueber_min ? ` · ${M.stunden(z.ueber_min)} zu viel` : ''}` }));
  k.append(herkunftEl(z));
  if (z.einheiten && z.einheiten.length) k.append(einheitenEl(z));
  const akt = h('div', { class: 't-aktionen' });
  k.append(akt);
  const hier = M.schrittVon(t) === schritt();

  // Festgelegt: Ändern heißt bearbeiten, im Schritt dieses Teils (Silas: „dann kann man wieder in eine dieser Gruppen
  // zurückspringen … nur dass diesmal die Auswahl dahinter auch gespeichert wird“). Die Prüfungsvorbereitung wird
  // festgelegt geplant, ohne Bearbeiten.
  if (fertig() && M.schrittVon(t) !== M.PRUEFUNGEN) {
    if (M.schrittVon(t) > 1) akt.append(h('button', { class: 'knopf klein', type: 'button', 'data-act': 'bearbeiten', 'data-schritt': String(M.schrittVon(t)), 'data-teil': t.id }, sym('stift'), `In Schritt ${M.schrittVon(t)} bearbeiten`));
  } else if (fertig() && t.art === 'pruefung') {
    const an = Z.setzen === t.id;
    akt.append(h('button', { class: `knopf klein${an ? ' an' : ''}`, type: 'button', 'data-act': 'setzen', 'data-teil': t.id }, sym('plus'), an ? 'Lerntage setzen: Tage antippen' : 'Lerntage setzen'));
  } else if (t.art !== 'praesenz' && hier) {
    // Blöcke nur im eigenen Schritt (Videos in 3, alles andere in 4): Wer hier ist, entscheidet genau das.
    const vg = M.vorgabe(Z.erg, t.id);
    if (vg) akt.append(h('span', { class: 't-zahlen', text: `Vorgabe: ${vorgabeText(vg)}` }),
      h('button', { class: 'knopf klein', type: 'button', 'data-act': 'legen', 'data-teil': t.id }, sym('plus'), 'Block legen'));
  } else if (t.art !== 'praesenz') {
    akt.append(h('button', { class: 'knopf klein', type: 'button', 'data-act': 'schritt', 'data-schritt': String(M.schrittVon(t)), 'data-teil': t.id, text: `In Schritt ${M.schrittVon(t)} planen` }));
  }
  // Gruppen: jede als Knopf (dazu gestrichelt im Raster), mit der Zahl ihrer Termine und dem, was sie träfe.
  if (M.istWahl(t) && (t.optionen || []).length && !fertig()) {
    const gew = Z.stand.plan.wahl?.[t.id];
    const ok = new Map(M.optionsKacheln(Z.stand.angebot, Z.erg, t.id).map((o) => [o.option, o]));
    k.append(h('div', { class: 'gruppen-wahl' }, h('span', { class: 't-zahlen', text: gew ? 'Gewählt — eine andere Gruppe wählen:' : 'Welche Gruppe? (Auch im Raster: gestrichelt, anklicken.)' }),
      ...(t.optionen || []).map((o) => {
        const x = ok.get(o.id);
        return h('button', { type: 'button', class: `knopf klein${o.id === gew ? ' an' : ''}`, 'data-act': 'option', 'data-teil': t.id, 'data-option': o.id, title: [o.notiz, o.quelle].filter(Boolean).join(' · ') },
          o.label, x ? h('span', { class: 'gw-zahl', text: ` · ${x.anzahl}×${x.kollision ? ` · trifft ${x.kollision}× einen Termin` : ''}` }) : null);
      })));
    if (gew) akt.append(h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'abwaehlen', 'data-teil': t.id, text: 'Wahl aufheben' }));
  }
  if (z.strukturell || z.flags.some((f) => f.art === 'luecke') || (z.umgewidmet || []).length) k.append(umwidmenFormular(z));
  k.append(...angabeFormulare(z));
  return k;
}

/** Woher die Zahl kommt (Silas, 11.10.: „wo kommt die Information 30 Stunden IV-Präsenz … her?“). */
function herkunftEl(z) {
  const t = z.teil, m = z.modul, p = z.posten;
  const box = h('div', { class: 'herkunft' }, h('b', { text: 'Woher' }));
  if (p) {
    const gesamt = M.postenGesamt(p);
    box.append(h('p', { text: `${m.quelle || `Modulbeschreibung #${m.nr}`}, Aufwandstabelle: „${p.titel}“ ${p.mult} × ${String(p.h).replace('.', ',')} h = ${M.stunden(gesamt)}.` }));
    if (z.soll_orig_min === gesamt) box.append(h('p', { text: 'Dieser Bestandteil trägt den ganzen Posten.' }));
    else {
      const andere = z.modul.teile.filter((x) => x.posten === t.posten && x.id !== t.id).map((x) => `${x.titel} ${M.stunden(Z.erg.teile.get(x.id).soll_orig_min)}`);
      box.append(h('p', {}, `Davon trägt dieser Bestandteil ${M.stunden(z.soll_orig_min)}${andere.length ? ` (der Rest: ${andere.join(', ')})` : ''}. `,
        t.annahme ? h('span', { class: 'gelb', text: `Annahme: ${t.annahme}` }) : h('span', { text: 'Aufteilung aus dem Angebot.' })));
    }
  }
  for (const u of z.umgewidmet || []) {
    const ander = Z.erg.teile.get(u.richtung === 'weg' ? u.nach : u.von);
    box.append(h('p', { text: `${u.richtung === 'weg' ? 'Umgewidmet an' : 'Umgewidmet von'} ${ander ? ander.teil.titel : '?'}: ${M.stunden(u.h * 60)}.` }));
  }
  if (t.quelle) box.append(h('p', { class: 'quelle', text: `Termine und Angaben: ${t.quelle}` }));
  const opt = (t.optionen || []).find((o) => o.id === (Z.stand.plan.wahl || {})[t.id]);
  if (opt && opt.quelle && opt.quelle !== t.quelle) box.append(h('p', { class: 'quelle', text: `Gewählte Gruppe: ${opt.quelle}` }));
  return box;
}

/** Jedes Video (jede Einheit) mit Woche, Freigabe und — bei Videos — der Länge zum Eintragen. Silas, 11.10.:
 *  „Vorlesungswoche 2 … zwei Screencasts. Screencast 3, 40 Minuten. Und Screencast 4, auch 40 Minuten.“ */
function einheitenEl(z) {
  const t = z.teil, video = t.art === 'video';
  const tabelle = h('div', { class: 'einheiten' });
  for (const g of z.gruppen || []) {
    const w = M.wocheVon(Z.erg.wochen, g.ab);
    const kopf = h('div', { class: 'eh-woche' }, h('b', { text: w ? w.kurz : M.datumKurz(g.ab) }), h('span', { text: ` ab ${datumMitTag(g.ab)}` }),
      g.bedarf_min ? h('span', { text: ` · braucht ${M.stunden(g.bedarf_min)}${g.geschaetzt ? ' (geschätzt)' : ''}` }) : null,
      h('span', { class: g.bloecke.length ? (g.bedarf_min && g.belegt_min < g.bedarf_min ? 'gelb' : 'gut') : 'rot', text: g.bloecke.length ? ` · ${M.stunden(g.belegt_min)} eingeplant` : ' · ohne Block' }));
    tabelle.append(kopf);
    for (const e of g.einheiten) {
      const i = (z.einheiten || []).indexOf(e);
      tabelle.append(h('div', { class: `eh-zeile${e.unsicher ? ' unsicher' : ''}`, title: [e.quelle, e.unsicher, e.offen].filter(Boolean).join('\n') },
        h('span', { class: 'eh-nr', text: String(e.nr) }),
        h('span', { class: 'eh-titel', text: `${e.titel || (video ? 'Video' : 'Einheit')}${e.bis ? ` · fällig ${datumMitTag(e.bis)}${e.bis_zeit ? ` ${e.bis_zeit}` : ''}` : ''}` }),
        video ? h('label', { class: 'eh-laenge' }, h('input', { type: 'number', min: '1', step: '1', inputmode: 'numeric', value: e.laenge_min ?? '', placeholder: '?', 'data-einheit': `${t.id}:${i}`, 'aria-label': `Länge von ${e.titel || `Video ${e.nr}`} in Minuten` }), 'min') : h('span')));
    }
  }
  return h('details', { class: 'klappe' },
    h('summary', { text: `${z.einheiten.length} ${video ? 'Videos' : 'Einheiten'} in ${(z.gruppen || []).length} Wochen${video ? ` — Längen ${z.einheiten.filter((e) => e.laenge_min != null).length}/${z.einheiten.length} bekannt` : ''}` }),
    tabelle);
}

function umwidmenFormular(z) {
  const ziele = M.umwidmungsZiele(Z.erg, z.teil.id);
  const f = h('form', { class: 'formular', 'data-form': 'umwidmen', 'data-teil': z.teil.id });
  f.append(h('p', { class: 'satz', text: z.strukturell
    ? `Diese Stunden können hier nicht stattfinden. Sie gehören trotzdem zum Modul — gib sie einem Teil, den du selbst planst.`
    : 'Stunden dieses Teils einem anderen Teil desselben Moduls geben (die Summe des Moduls bleibt).' }));
  for (const u of z.umgewidmet || []) {
    const ander = Z.erg.teile.get(u.richtung === 'weg' ? u.nach : u.von);
    f.append(h('p', { class: 'satz' }, `${u.richtung === 'weg' ? '→' : '←'} ${M.stunden(u.h * 60)} ${u.richtung === 'weg' ? 'an' : 'von'} ${ander ? ander.teil.titel : '?'} `,
      h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'umwidmung-weg', 'data-id': u.id, text: 'zurücknehmen' })));
  }
  if (z.fehlt_min >= 15 && ziele.length) {
    f.append(
      h('label', {}, 'Nach', h('select', { name: 'nach' }, ...ziele.map((x) => h('option', { value: x.teil.id, text: x.teil.titel })))),
      h('label', {}, 'Stunden', h('input', { name: 'h', type: 'number', min: '0.25', step: '0.25', value: String(Math.round(z.fehlt_min / 15) / 4) })),
      h('div', { class: 'zeile' }, h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Umwidmen' })),
    );
  }
  return f;
}

/** Die Eingaben für fehlende Angaben: Termine, Gruppen, Prüfungstermin, Videolänge, Ausfälle. */
function angabeFormulare(z) {
  const t = z.teil, aus = [];
  const sem = Z.stand.angebot.semester;
  const wt = (name, wert) => h('select', { name }, ...M.TAGE.map((x) => h('option', { value: x, text: x, selected: x === wert })));
  // Fehlt die Angabe, steht das Formular offen da; sonst klappt es erst auf Wunsch auf (weitere Gruppe, Ausfälle).
  const klappe = (titel, form, offen) => offen ? form : h('details', { class: 'klappe' }, h('summary', { text: titel }), form);
  if (t.art === 'praesenz' && (M.istWahl(t) || !M.muster(t).length)) {
    const fehlt = !(t.optionen || []).length && !M.muster(t).length;
    aus.push(klappe(M.istWahl(t) ? 'Weitere Gruppe eintragen' : 'Termin eintragen', h('form', { class: 'formular', 'data-form': 'termin', 'data-teil': t.id },
      h('p', { class: 'satz', text: M.istWahl(t) ? 'Gruppe eintragen (aus ISIS). Ohne „nur an“ gilt sie jede Woche im Zeitraum.' : 'Termin eintragen. Ohne „nur an“ gilt er jede Woche im Zeitraum.' }),
      h('label', { class: 'breit' }, 'Bezeichnung', h('input', { name: 'label', placeholder: 'z. B. Mi 16–18 · Raum oder online' })),
      h('label', {}, 'Wochentag', wt('tag', 'Mo')),
      h('label', {}, 'Ort', h('input', { name: 'ort', placeholder: 'Raum / online' })),
      h('label', {}, 'von', h('input', { name: 'start', type: 'time', value: '16:15', step: '300' })),
      h('label', {}, 'bis', h('input', { name: 'ende', type: 'time', value: '17:45', step: '300' })),
      h('label', {}, 'ab', h('input', { name: 'von', type: 'date', value: sem.vorlesung.von })),
      h('label', {}, 'bis Datum', h('input', { name: 'bis', type: 'date', value: sem.vorlesung.bis })),
      h('label', { class: 'breit' }, 'nur an (optional)', h('input', { name: 'daten', placeholder: 'z. B. 3.11., 1.12., 19.1.' })),
      h('div', { class: 'zeile' }, h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Eintragen' }))), fehlt));
  }
  if (t.art === 'praesenz' && !M.istWahl(t) && M.muster(t).some((x) => x.typ === 'serie')) {
    aus.push(klappe('Ausfälle eintragen', h('form', { class: 'formular', 'data-form': 'ausfall', 'data-teil': t.id },
      h('label', { class: 'breit' }, 'Fällt aus am', h('input', { name: 'daten', placeholder: 'z. B. 23.10., 6.11.' })),
      h('div', { class: 'zeile' },
        t.unsicher ? h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'erledigt', 'data-teil': t.id, 'data-feld': 'unsicher', text: 'Hinweis erledigt' }) : null,
        h('button', { class: 'knopf klein', type: 'submit', text: 'Ausfälle eintragen' }))), !!t.unsicher));
  }
  if (t.art === 'pruefung' && z.pruefung) aus.push(...pruefungFormulare(z));
  if (t.art === 'video') {
    const e = t.einheiten || {};
    aus.push(h('form', { class: 'formular', 'data-form': 'video', 'data-teil': t.id },
      h('p', { class: 'satz', text: `Ein Block ist Videolänge + ${Z.erg.regeln.video_puffer_min} min, auf ${Z.erg.regeln.raster_min} min aufgerundet (1:45 → 2 h).` }),
      h('label', {}, 'Länge je Video (min)', h('input', { name: 'laenge', type: 'number', min: '5', step: '5', value: e.laenge_min || e.annahme_min || '' })),
      !e.liste ? h('label', {}, 'erscheint am', wt('tag', e.takt?.tag || 'Mo')) : h('span'),
      h('div', { class: 'zeile' }, h('button', { class: 'knopf klein', type: 'submit', text: 'Übernehmen' }))));
  }
  if (t.art === 'selbst' && t.einheiten && t.einheiten.offen) {
    aus.push(h('form', { class: 'formular', 'data-form': 'takt', 'data-teil': t.id },
      h('p', { class: 'satz', text: 'Wann erscheint eine Einheit (Quiz, Blatt)? Ein Block zählt erst ab ihrer Freigabe.' }),
      h('label', {}, 'erscheint am', wt('tag', 'Mo')),
      h('label', {}, 'ab', h('input', { name: 'von', type: 'date', value: sem.vorlesung.von })),
      h('div', { class: 'zeile' }, h('button', { class: 'knopf klein', type: 'submit', text: 'Übernehmen' }))));
  }
  if (t.offen) aus.push(h('div', { class: 'zeile' }, h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'erledigt', 'data-teil': t.id, 'data-feld': 'offen', text: 'Angabe ist erledigt' })));
  return aus;
}

/** Je Termin einer Prüfung ein Formular (Erst-, Zweit-, Alternativtermin), auch für Termine ohne Datum. Fehlt eine
 *  Angabe, steht es offen da; sonst klappt es auf Wunsch auf. */
function pruefungFormulare(z, nurPruefung = false) {
  const t = z.teil;
  const termine = (z.pruefung.termine || []).length ? z.pruefung.termine : [{ label: '1. Termin' }];
  const fehlt = termine.some((x) => !x.datum || !x.start || x.offen);
  const formulare = termine.map((x, i) => h('form', { class: 'formular', 'data-form': 'pruefung', 'data-teil': t.id, 'data-index': String(i) },
    h('p', { class: 'satz' }, h('b', { text: `${z.pruefung.titel}${x.label ? ` · ${x.label}` : ''}` }), x.offen ? h('span', { class: 'rot-text', text: ` — ${x.offen}` }) : null),
    h('label', {}, 'Datum', h('input', { name: 'datum', type: 'date', value: x.datum || '' })),
    h('label', {}, 'Ort', h('input', { name: 'ort', value: x.ort || '' })),
    h('label', {}, 'von', h('input', { name: 'start', type: 'time', value: x.start || '' })),
    h('label', {}, 'bis', h('input', { name: 'ende', type: 'time', value: x.ende || '' })),
    h('div', { class: 'zeile' }, h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Eintragen' }))));
  const box = h('div', { class: 'formulare' }, ...formulare);
  return [fehlt ? box : h('details', { class: 'klappe' }, h('summary', { text: nurPruefung ? 'Termine, Zeiten und Räume bearbeiten' : 'Prüfungstermine bearbeiten' }), box)];
}

// ── Mitte: Kopf der Woche ────────────────────────────────────────────────────────────────────────

/** Der Stand eines Schritts für den Schrittknopf: rot, wenn etwas kritisch ist, hellblau mit Zahl, wenn Silas dran
 *  ist, sonst ein Haken (was noch kommt, liefert der Lehrstuhl). */
function schrittStand(s) {
  // Ab Schritt 2 zählt, was in der Reihe noch offen ist (zu wählen, zu legen) — der grüne Haken heißt: alles erledigt
  // (V-0336). Rot bleibt, was kritisch ist (die laufende MOSES-Anmeldung einer Gruppe).
  const offen = s.nr >= 2 && s.nr <= 4 ? reihe(s.nr).filter((x) => x.offen).length : s.zaehler.dran;
  const wort = s.nr === 2 ? 'zu wählen' : s.nr >= 3 ? 'zu legen' : 'zu tun';
  if (s.zaehler.kritisch) return { kl: 'st-kritisch', text: offen ? String(offen) : '!', titel: `${s.zaehler.kritisch} kritisch${offen ? `, ${offen} ${wort}` : ''}` };
  if (offen) return { kl: 'st-dran', text: String(offen), titel: `${offen} ${wort}` };
  return { kl: 'fertig', text: '✓', titel: s.zaehler.kommt ? `alles erledigt — ${s.zaehler.kommt} Angaben kommen noch` : 'alles erledigt' };
}

function planKopfZeichnen() {
  const wo = Z.erg.wochen;
  const b = Z.ansicht.bereich;
  const rot = Z.erg.summe.zaehler.kritisch + Z.erg.summe.zaehler.dran;
  // Die vier Schritte (V-0333): ein Knopf je Schritt, mit seinem Stand. Man springt frei vor und zurück. Festgelegt
  // (V-0334) ruhen sie: Dann steht da, seit wann, und „Stundenplan bearbeiten“ führt in einen Schritt zurück.
  const schritteEl = fertig() ? h('div', { class: 'fertig-leiste' },
    h('span', { class: 'fertig-text' }, sym('ok'), h('b', { text: 'Stundenplan festgelegt' }), h('span', { text: ` am ${datumMitTag(Z.stand.plan.festgelegt.slice(0, 10))}` })),
    h('button', { type: 'button', class: 'knopf haupt', 'data-act': 'bearbeiten' }, sym('stift'), 'Stundenplan bearbeiten'))
  : h('nav', { class: 'schritte', 'aria-label': 'Schritte' },
    ...Z.schritte.slice(0, 4).map((sc) => {
      const st = schrittStand(sc);
      const jetzt = (b === 'plan' || b === 'frei') && schritt() === sc.nr;
      return h('button', { type: 'button', class: `schritt${jetzt ? ' jetzt' : ''}`, 'aria-current': jetzt ? 'step' : null, 'data-act': 'schritt', 'data-schritt': String(sc.nr), title: `${sc.satz} — ${st.titel}` },
        h('span', { class: 's-nr', text: String(sc.nr) }),
        h('span', { class: 's-text' }, h('b', { text: sc.titel }), h('small', { text: sc.nr === 1 ? 'feste Termine' : sc.nr === 2 ? 'wählen' : sc.nr === 3 ? 'legen' : 'Lernen' })),
        h('span', { class: `s-stand ${st.kl}`, text: st.text }));
    }));
  const weitere = h('div', { class: 'p-weitere' },
    fertig() ? h('button', { type: 'button', class: `knopf leise${b === 'plan' ? ' an' : ''}`, 'data-act': 'bereich', 'data-bereich': 'plan', text: 'Woche' }) : null,
    // Die Prüfungen erst nach dem Festlegen (Silas: „ab Mitte des Semesters“).
    fertig() ? h('button', { type: 'button', class: `knopf leise${b === 'frei' || b === 'pruefplan' ? ' an' : ''}`, 'data-act': 'bereich', 'data-bereich': 'frei' }, 'Prüfungen', Z.schritte[4].offen ? h('span', { class: 'zahl', text: String(Z.schritte[4].offen) }) : null) : null,
    h('button', { type: 'button', class: `knopf leise${b === 'offen' ? ' an' : ''}`, 'data-act': 'bereich', 'data-bereich': 'offen' }, 'Offen & Annahmen', rot ? h('span', { class: 'zahl', text: String(rot) }) : null),
    h('button', { type: 'button', class: `knopf leise${b === 'erklaerung' ? ' an' : ''}`, 'data-act': 'bereich', 'data-bereich': 'erklaerung', text: 'So wird gerechnet' }),
    h('button', { type: 'button', class: 'knopf leise', 'data-act': 'zuruecksetzen', title: 'Zurück auf die Grundlage' }, sym('zurueck'), 'Zurücksetzen'));
  const zeile = h('div', { class: 'p-zeile' });
  // Element.append schriebe null als Text „null“ (kein Rückgängig) — darum gefiltert.
  const dazu = (...k) => zeile.append(...k.filter(Boolean));
  const titel = h('div', { class: 'p-titel' });
  const rueck = Z.rueck.length ? h('button', { class: 'knopf leise', type: 'button', 'data-act': 'rueck', title: 'Rückgängig (⌘Z)' }, sym('zurueck'), 'Rückgängig') : null;
  const nav = (liste, aktuell, std) => {
    const sel = h('select', { 'aria-label': 'Woche', 'data-act': 'woche-waehlen' },
      ...liste.map((x) => h('option', { value: x.id, selected: x.id === aktuell && !std, text: `${x.kurz} · ${M.datumKurz(x.von)}` })));
    if (std) sel.prepend(h('option', { value: '', selected: true, text: 'Woche …' }));
    const i = liste.findIndex((x) => x.id === aktuell);
    return h('div', { class: 'p-nav' },
      h('button', { class: 'knopf rund', type: 'button', 'data-act': 'woche-vor', 'data-schritt': '-1', 'aria-label': 'Vorige Woche', disabled: !std && i <= 0 }, sym('links')),
      sel,
      h('button', { class: 'knopf rund', type: 'button', 'data-act': 'woche-vor', 'data-schritt': '1', 'aria-label': 'Nächste Woche', disabled: !std && i >= liste.length - 1 }, sym('rechts')));
  };
  // Die Ansicht: Standardwoche oder eine echte Woche.
  const ansicht = (std) => h('div', { class: 'umschalter', role: 'group', 'aria-label': 'Ansicht' },
    h('button', { type: 'button', 'aria-pressed': String(b === 'plan' && std), 'data-act': 'modus', 'data-modus': 'standard', text: 'Standardwoche' }),
    h('button', { type: 'button', 'aria-pressed': String(b === 'plan' && !std), 'data-act': 'modus', 'data-modus': 'woche', text: 'Echte Woche' }));
  if (b === 'plan' || b === 'pruefplan') {
    const std = Z.ansicht.modus === 'standard';
    const w = wo.find((x) => x.id === Z.ansicht.woche);
    if (std) titel.append(h('b', { text: 'Standardwoche' }), h('span', { title: 'Mittel der 16 Vorlesungswochen; Soll = die Wochenposten der Modulbeschreibungen', text: `Ø ${M.stunden(Math.round(Z.mittel.belegt / 15) * 15)} belegt je Vorlesungswoche · Soll ${M.stunden(Z.erg.summe.woche_min)}` }));
    else {
      const z = M.woche(Z.erg, w.id);
      const art = w.art === 'vorlesung' ? `Vorlesungswoche ${w.nr}` : w.art === 'frei' ? 'Vorlesungsfrei' : 'Prüfungszeit';
      titel.append(h('b', { text: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}` }),
        h('span', { text: `${art} · ${M.stunden(z.belegt_min)} belegt, davon ${M.stunden(z.ects_min)} für Leistungspunkte` }));
    }
    if (b === 'pruefplan') {
      fuellen(titel, h('b', { text: std ? 'Vorlesungszeit · Prüfungsvorbereitung' : titel.firstChild.textContent }),
        h('span', { text: std ? 'Dein Stundenplan ist gesperrt (grau) — leg Vorbereitung davor, danach, am Wochenende; in der Standardwoche jede Woche bis zur Prüfung' : `Prüfungsvorbereitung · ${titel.lastChild.textContent}` }));
      dazu(h('button', { class: 'knopf', type: 'button', 'data-act': 'bereich', 'data-bereich': 'frei' }, sym('links'), 'Prüfungen'), titel, rueck, ansicht(std), nav(wo.filter((x) => x.art === 'vorlesung'), Z.ansicht.woche, std));
    } else dazu(titel, rueck, ansicht(std), nav(wo, Z.ansicht.woche, std));
  } else if (b === 'frei') {
    const ps = M.phasen(Z.erg.sem).filter((p) => p.id !== 'vorlesung');
    titel.append(h('b', { text: 'Prüfungen und Prüfungsvorbereitung' }), h('span', { text: `${ps.map((p) => `${M.datumKurz(p.von)}–${M.datumKurz(p.bis)}`).join(' und ')} vorlesungsfrei · planst du ab Mitte des Semesters` }));
    dazu(titel, rueck);
  } else if (b === 'offen') {
    titel.append(h('b', { text: 'Offen & Annahmen' }), h('span', { text: 'Was fehlt, was unsicher ist und welche Werte angenommen sind — an einem Ort' }));
    dazu(titel, rueck);
  } else {
    titel.append(h('b', { text: 'So wird gerechnet' }), h('span', { text: 'Leistungspunkte, Aufwandstabellen und die Regeln dieses Planers' }));
    dazu(titel);
  }
  fuellen($('p-kopf'), h('div', { class: 'p-schritte' }, schritteEl, weitere), zeile);
}

function bannerZeigen() {
  const b = $('banner');
  if (Z.konflikt) {
    b.className = 'banner warn';
    fuellen(b, h('span', { text: Z.konflikt.lokal
      ? 'In diesem Browser liegen ungespeicherte Änderungen, aber der Plan wurde inzwischen woanders geändert.'
      : 'Der Plan wurde auf einem anderen Gerät geändert.' }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'neu-laden', text: 'Neuesten Stand laden' }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'ueberschreiben', text: 'Meinen behalten' }));
    b.hidden = false; return;
  }
  if (Z.legen) {
    const z = Z.erg.teile.get(Z.legen.teil);
    b.className = 'banner';
    const wo = Z.legen.pruefung
      ? (rasterLage().std ? `jede Woche${Z.legen.bis ? ` bis zur Prüfung (${M.datumKurz(Z.legen.bis)})` : ''} liegen soll — in einer echten Woche nur an dem Tag` : 'an diesem Tag liegen soll — in der Standardwoche jede Woche')
      : `${Z.legen.alle > 1 ? `alle ${Z.legen.alle} Wochen` : 'jede Woche'} liegen soll`;
    fuellen(b, h('span', { text: `${M.kurz(z.modul)} · ${z.teil.titel}: Der Block (${M.stunden(Z.legen.dauer)}) hängt am Zeiger — klick, wo er ${wo}${Z.legen.rest > 1 ? ` (noch ${Z.legen.rest})` : ''}. Grün ist frei${!fertig() && schritt() === 4 ? ', kräftig zwischen 10 und 18 Uhr' : ''}. Esc bricht ab.` }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'legen-aus', text: 'Abbrechen' }));
    b.hidden = false; return;
  }
  if (Z.sprung) {
    const j = jetztIn(schritt());
    const was = j ? `${M.kurz(j.z.modul)} · ${j.z.teil.titel}` : '';
    b.className = 'banner';
    fuellen(b, h('span', { text: `Kurz zurück in Schritt ${schritt()}${was ? ` für ${was}` : ''}: ${schritt() === 2 ? 'wähl die Gruppe' : 'verschieb oder leg den Block'} — alles andere ist grau. Danach geht es von selbst zurück zu Schritt ${Z.sprung.nach}.` }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'sprung-ende', text: `Zurück zu Schritt ${Z.sprung.nach}` }));
    b.hidden = false; return;
  }
  if (Z.setzen) {
    const z = Z.erg.teile.get(Z.setzen);
    b.className = 'banner';
    fuellen(b, h('span', { text: `${M.kurz(z.modul)} · ${z.teil.titel}: Tipp einen Tag an, um einen Lerntag zu setzen${z.fehlt_min ? ` (fehlt: ${M.stunden(z.fehlt_min)})` : ''}.` }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'setzen-aus', text: 'Fertig' }));
    b.hidden = false; return;
  }
  b.hidden = true;
}

// ── Mitte: das Raster ────────────────────────────────────────────────────────────────────────────

/** Was das Raster gerade zeigt: Kacheln mit Tag (0–6), Start, Ende — und je Kachel ihr Schritt und ihre Lage.
 *  Im Ablauf (V-0334, Silas: „immer beim nächsten Schritt ist alles aus den vorherigen Schritten dunkelgrau … und
 *  wirklich keine von den anderen Sachen soll eingetragen oder angezeigt werden“): Früheres ist grau (frueher), der
 *  gezeigte Schritt farbig (jetzt), Späteres und die Prüfungen fehlen ganz. Festgelegt ist alles farbig (fest); nur die
 *  Lernblöcke der Prüfungsvorbereitung lassen sich dann noch ziehen. */
function kachelnJetzt() {
  const lage = rasterLage();
  const std = lage.std;
  const n = schritt();
  const out = [];
  const w = Z.erg.wochen.find((x) => x.id === lage.woche);
  const teilVon = (id) => (id ? Z.erg.teile.get(id)?.teil : null);
  if (std) {
    for (const k of M.standardwoche(Z.stand.angebot, Z.stand.plan, Z.erg)) {
      out.push({ ...k, schritt: k.art === 'block' ? M.schrittVonBlock(teilVon(k.teil)) : M.schrittVon(teilVon(k.teil)) });
    }
  } else {
    for (const v of Z.erg.vorkommen) {
      if (v.datum < w.von || v.datum > w.bis || v.ganztag || v.start == null || v.ende == null) continue;
      if (v.quelle === 'pruefung' && !v.wichtig) continue; // Ausweich-/Zweittermin: als Hinweis über dem Raster
      out.push({ art: v.quelle === 'block' ? 'block' : v.quelle === 'pruefung' ? 'pruefung' : v.quelle === 'termin' ? 'termin' : 'einzel', vk: [v], v, tag: M.wochentag(v.datum), start: v.start, ende: v.ende, teil: v.teil, modul: v.modul, block: v.block, schicht: v.schicht, ort: v.ort, datum: v.datum, schritt: v.schritt || 1 });
    }
  }
  if (fertig()) {
    // Im Prüfplan ist der Stundenplan gesperrt (Silas: „der Stundenplan muss in der Ansicht auf jeden Fall gelockt
    // sein“): alles dunkelgrau, nur die Prüfungen selbst (das Ziel) farbig und die Lernblöcke der Vorbereitung bunt.
    for (const k of out) {
      const vorbereitung = k.art === 'block' && k.schritt === M.PRUEFUNGEN;
      k.lage = vorbereitung ? 'jetzt' : pruefplan() && k.art !== 'pruefung' ? 'frueher' : 'fest';
    }
    return out;
  }
  // Was dran ist, ist farbig; was im selben Schritt schon gewählt oder gelegt ist, aber zu einer anderen Sache gehört,
  // hellgrau (erledigt — V-0336, Silas: „die im gleichen Schritt aber zu einer anderen Gruppe gehörenden und schon
  // gewählten, die sollen dann hellgrau werden“); frühere Schritte dunkelgrau. Kurz zurückgesprungen (Z.sprung) ist ALLES
  // außer der Sache, die dran ist, dunkelgrau — auch was aus späteren Schritten schon liegt („alle Wahlen, die man bis
  // dahin getroffen hat, aus allen anderen Schritten, sollen auch dunkelgrau dort angezeigt werden“). (Nicht Z.rueck —
  // das ist der Rückgängig-Stapel, und data-act="rueck" macht rückgängig.)
  const dran = n >= 2 ? jetztIn(n) : null;
  const dranId = dran && dran.z.teil.id;
  const im = out.filter((k) => (Z.sprung ? k.schritt <= 4 : k.schritt <= n));
  for (const k of im) {
    if (k.schritt === n && (!dranId || k.teil === dranId)) k.lage = 'jetzt';
    else if (k.schritt === n && !Z.sprung) k.lage = 'erledigt';
    else k.lage = 'frueher';
  }
  if (n !== 2) return im;
  // Schritt 2: nur die Gruppen der Wahl, die dran ist (V-0335, Silas: „du wählst halt genau gerade eine einzige Sache“).
  // Ist sie schon gewählt (umwählen, oder kurz zurückgesprungen), stehen alle ihre Gruppen da — die gewählte mit weißer
  // Linie (Silas: „mit dem, der jetzt gerade ausgewählt ist, der soll dann weiß markiert sein“).
  if (dran && dran.anzahl) {
    const t = dran.z.teil, gewaehlt = Z.stand.plan.wahl?.[t.id];
    for (const o of M.optionsKacheln(Z.stand.angebot, Z.erg, t.id)) {
      if (o.option === gewaehlt) continue;
      const k = { ...o, schritt: 2, lage: 'jetzt' };
      if (std) { if (!o.reihe || o.anzahl >= 3) im.push(k); }
      else {
        for (const x of o.termine) if (x.datum >= w.von && x.datum <= w.bis) im.push({ ...k, tag: M.wochentag(x.datum), start: x.start, ende: x.ende, datum: x.datum, rest: o.termine.filter((y) => y.datum >= x.datum).length });
      }
    }
  }
  return im;
}

/** Spalten für Kacheln, die sich am selben Tag überlappen. */
function spalten(kacheln) {
  const proTag = new Map();
  for (const k of kacheln) proTag.set(k.tag, [...(proTag.get(k.tag) || []), k]);
  for (const liste of proTag.values()) {
    liste.sort((a, b) => a.start - b.start || b.ende - a.ende);
    let gruppe = [], ende = -1;
    const schliessen = () => { const n = Math.max(...gruppe.map((k) => k.spalte)) + 1; for (const k of gruppe) k.spalten = n; };
    for (const k of liste) {
      if (k.start >= ende && gruppe.length) { schliessen(); gruppe = []; }
      const belegt = new Set(gruppe.filter((g) => g.ende > k.start).map((g) => g.spalte));
      let s = 0; while (belegt.has(s)) s += 1;
      k.spalte = s; gruppe.push(k); ende = Math.max(ende, k.ende);
    }
    if (gruppe.length) schliessen();
  }
}

let geo = null; // die Geometrie des gezeichneten Rasters (für das Ziehen)

function rasterZeichnen() {
  const lage = rasterLage();
  const std = lage.std;
  const w = Z.erg.wochen.find((x) => x.id === lage.woche);
  const kacheln = kachelnJetzt();
  const wochenende = Z.ansicht.wochenende || pruefplan() || kacheln.some((k) => k.tag >= 5) || (!std && w.art !== 'vorlesung');
  const tage = wochenende ? 7 : 5;
  let h0 = 8, h1 = 20;
  for (const k of kacheln) { h0 = Math.min(h0, Math.floor(k.start / 60)); h1 = Math.max(h1, Math.ceil(k.ende / 60)); }
  if (pruefplan()) { h0 = Math.min(h0, 7); h1 = Math.max(h1, 22); } // auch früh und abends
  h0 = Math.max(6, h0); h1 = Math.min(23, h1);
  geo = { h0, h1, tage, std, woche: w };
  for (const id of ['raster', 'r-kopf', 'ganztag']) $(id).style.setProperty('--tage', String(tage));
  const raster = $('raster');
  raster.style.setProperty('--stunde', `calc(100% / ${h1 - h0})`);
  raster.classList.toggle('legen', !!Z.legen);
  // In Schritt 1 und 2 legt man keine Blöcke: kein Fadenkreuz, ein Klick erklärt sich (zeigerRunter).
  raster.classList.toggle('ohne-bloecke', !fertig() && schritt() < 3);

  // Kopf: Tage, in der echten Woche mit Datum und Last des Tages
  const zahlen = std ? null : M.woche(Z.erg, w.id);
  const kopf = [h('div')];
  for (let d = 0; d < tage; d++) {
    const datum = std ? null : M.plusTage(w.von, d);
    const last = zahlen ? zahlen.proTag[d] : Z.mittel.proTag[d];
    kopf.push(h('div', { class: datum === heute() ? 'heute' : '' }, M.TAGE_LANG[d],
      h('span', { class: `last${last > 10 * 60 ? ' voll' : ''}`, title: std ? 'Mittel der Vorlesungswochen (belegt, c.t. als Doppelstunde)' : null, text: `${datum ? `${M.datumKurz(datum)} · ` : 'Ø '}${last ? M.stunden(Math.round(last / 15) * 15) : '—'}` })));
  }
  fuellen($('r-kopf'), ...kopf);

  // Ganztägiges: Fristen, Freigaben, Rahmen, Einzeltermine ohne Ende (nur in der echten Woche)
  const gt = $('ganztag');
  if (std) fuellen(gt);
  else {
    const zellen = [h('div')];
    for (let d = 0; d < tage; d++) zellen.push(h('div', { class: 'gt-tag' }));
    for (const v of Z.erg.vorkommen) {
      const ausweich = v.quelle === 'pruefung' && !v.wichtig && !v.ganztag && v.start != null;
      if (!(v.ganztag || v.start == null || ausweich)) continue;
      // Im Ablauf nur, was bis zum gezeigten Schritt gehört — keine Prüfungen, keine Prüfungsanmeldungen (V-0334).
      if (!fertig() && (v.schritt || 1) > schritt() && v.quelle !== 'rahmen') continue;
      const von = v.datum < w.von ? w.von : v.datum;
      if (von > w.bis || (v.bis ? v.bis < w.von : v.datum < w.von)) continue;
      const d = M.wochentag(von);
      if (d >= tage) continue;
      if (ausweich) {
        const m = modulVon(v.modul);
        zellen[d + 1].append(h('span', { class: 'chip rahmen', title: `${M.titelVon(v, Z.erg, Z.stand.angebot)} — Ausweich- oder Zweittermin, nicht gewählt` }, `${uhr(v.start)} ${M.kurz(m)} · ${v.titel} (Ausweich)`));
        continue;
      }
      const kl = v.quelle === 'pruefung' ? 'pruefung' : v.quelle === 'frist' ? `frist${v.wichtig ? ' wichtig' : ''}` : v.quelle === 'rahmen' ? 'rahmen' : '';
      const m = modulVon(v.modul);
      // Ein Termin mit Datum, aber ohne Uhrzeit (Silas: „soll über dem Plan erscheinen, und wenn man draufklickt, soll
      // man dort eine Uhrzeit eintragen können“): Prüfungen und Einzeltermine lassen sich hier ergänzen.
      const zeitlos = v.punkt == null && (v.quelle === 'pruefung' || v.quelle === 'einzel' || v.quelle === 'frist');
      zellen[d + 1].append(h(zeitlos ? 'button' : 'span', { type: zeitlos ? 'button' : null, class: `chip ${kl}${zeitlos ? ' zeitlos' : ''}`, 'data-act': zeitlos ? 'zeit' : null, 'data-vk': zeitlos ? v.id : null,
        title: `${M.titelVon(v, Z.erg, Z.stand.angebot)}${zeitlos ? ' — Uhrzeit eintragen' : ''}` },
        `${v.punkt != null ? `${uhr(v.punkt)} ` : ''}${m ? `${M.kurz(m)} · ` : ''}${v.titel}${v.unsicher ? ' ?' : ''}`));
    }
    // Freigaben der Videos und Einheiten in dieser Woche — je Teil und Tag EIN Hinweis („STAT1 · Videos 7–10“)
    for (const z of Z.erg.teile.values()) {
      // Freigaben dort, wo sie etwas entscheiden: Videos in Schritt 3, Quizze und Blätter in Schritt 4 (Quizze auch in 1).
      const sch = M.schrittVon(z.teil);
      if (!fertig() && !(sch === schritt() || (schritt() === 1 && M.kategorie(z.teil) === 'quiz'))) continue;
      const proTag = new Map();
      for (const e of z.einheiten || []) if (e.ab >= w.von && e.ab <= w.bis) proTag.set(e.ab, [...(proTag.get(e.ab) || []), e]);
      for (const [ab, es] of proTag) {
        const d = M.wochentag(ab);
        if (d >= tage) continue;
        const wort = z.teil.art === 'video' ? (es.length > 1 ? 'Videos' : 'Video') : (es.length > 1 ? 'Einheiten' : 'Einheit');
        const nr = es.length > 1 ? `${es[0].nr}–${es[es.length - 1].nr}` : es[0].nr;
        zellen[d + 1].append(h('button', { type: 'button', class: `chip freigabe k-${M.kategorie(z.teil)}`, 'data-act': 'teil', 'data-teil': z.teil.id, title: es.map((e) => `${e.nr}: ${e.titel || ''}${e.laenge_min ? ` (${e.laenge_min} min)` : ''}`).join('\n') },
          `${M.kurz(z.modul)} · ${wort} ${nr}${es.some((e) => !e.block) ? ' · ohne Block' : ''}`));
      }
    }
    fuellen(gt, ...(zellen.slice(1).some((z) => z.childElementCount) ? zellen : []));
  }

  // Raster
  const zeiten = h('div', { class: 'r-zeiten' });
  for (let s = h0 + 1; s < h1; s++) { const sp = h('span', { text: String(s).padStart(2, '0') }); sp.style.top = `${((s - h0) / (h1 - h0)) * 100}%`; zeiten.append(sp); }
  const spaltenEl = [];
  for (let d = 0; d < tage; d++) {
    const datum = std ? null : M.plusTage(w.von, d);
    const frei = datum && (M.istFrei(Z.erg.sem, datum) || datum > Z.erg.sem.vorlesung.bis);
    spaltenEl.push(h('div', { class: `r-tag${frei ? ' frei' : ''}${d >= 5 ? ' wochenende' : ''}`, 'data-tag': String(d) }));
  }
  spalten(kacheln);
  const pos = (el, k) => {
    el.style.top = `${((k.start - h0 * 60) / ((h1 - h0) * 60)) * 100}%`;
    el.style.height = `calc(${((k.ende - k.start) / ((h1 - h0) * 60)) * 100}% - 1px)`;
    if (k.spalten > 1) { el.style.left = `calc(${(k.spalte / k.spalten) * 100}% + 2px)`; el.style.right = 'auto'; el.style.width = `calc(${100 / k.spalten}% - 4px)`; }
  };
  for (const k of kacheln) {
    if (k.tag >= tage) continue;
    const el = kachelEl(k);
    pos(el, k);
    spaltenEl[k.tag].append(el);
  }
  if (!std && heute() >= w.von && heute() <= w.bis) {
    const d = M.wochentag(heute()), m = jetztMin();
    if (d < tage && m > h0 * 60 && m < h1 * 60) { const l = h('div', { class: 'r-jetzt' }); l.style.top = `${((m - h0 * 60) / ((h1 - h0) * 60)) * 100}%`; spaltenEl[d].append(l); }
  }
  // Hängt ein Block am Zeiger: freie Plätze je Tag (M.freieFenster) grün; in Schritt 4 kräftiger, was zwischen 10 und
  // 18 Uhr liegt (Silas: „automatisch geguckt, wo freie Plätze sind … zwischen 10 und 18 Uhr immer preferred“).
  geo.frei = [];
  if (Z.legen) {
    const [fa, fe] = (pruefplan() ? Z.erg.regeln.pruef_fenster : Z.erg.regeln.tag_fenster).map(M.min);
    const [pa, pe] = Z.erg.regeln.evl_fenster.map(M.min);
    for (let d = 0; d < tage; d++) {
      const belegt = kacheln.filter((k) => k.tag === d && k.art !== 'option').map((k) => [k.start, k.ende]);
      const fenster = M.freieFenster(belegt, Z.legen.dauer, Math.max(fa, h0 * 60), Math.min(fe, h1 * 60));
      geo.frei[d] = fenster;
      for (const [a, b] of fenster) {
        const band = (x, y, kl) => { const el = h('div', { class: kl }); el.style.top = `${((x - h0 * 60) / ((h1 - h0) * 60)) * 100}%`; el.style.height = `${((y - x) / ((h1 - h0) * 60)) * 100}%`; spaltenEl[d].prepend(el); };
        band(a, b, 'frei-fenster');
        const x = Math.max(a, pa), y = Math.min(b, pe);
        if (!fertig() && schritt() === 4 && y - x >= Z.legen.dauer) band(x, y, 'frei-fenster bevorzugt');
      }
    }
  }
  fuellen(raster, zeiten, ...spaltenEl);
}

/** Die Meldung „gesperrt“ eines Blocks: liegt er dauernd auf einem Termin (verschieben) oder nur an einzelnen Tagen? */
function sperrFlagge(blockId) {
  for (const z of Z.erg.teile.values()) { const f = z.flags.find((x) => x.art === 'gesperrt' && x.block === blockId); if (f) return f; }
  return Z.erg.planFlags.find((x) => x.block === blockId) || null;
}

/** Etikett und Wiederholungen einer Kachel (Silas, 11.10.: „in jeder Kachel … als Tag an der Seite: ist es Präsenz,
 *  ist es Video oder ist es EVL … und pro Eintrag, wie oft er sich bis zum Ende des Semesters wiederholt“). In der
 *  Standardwoche zählt die Zahl alle Termine des Eintrags, in einer echten Woche die ab diesem Tag (er eingeschlossen). */
function kachelTags(k) {
  const etikett = k.art === 'block' ? M.ETIKETT[k.schritt] : 'Präsenz';
  const online = k.art !== 'block' && /online|zoom|webex/i.test(`${k.ort || ''} ${(k.v && k.v.online) || ''}`);
  const n = geo.std ? k.anzahl : k.v ? k.v.rest : k.rest;
  const gesamt = geo.std ? k.anzahl : k.v ? k.v.gesamt : null;
  const titel = n == null ? '' : gesamt === 1 ? 'einmalig — wiederholt sich nicht' : geo.std ? `${n}× im Semester` : `noch ${n}× bis Semesterende (dieser eingeschlossen)${gesamt ? `, insgesamt ${gesamt}×` : ''}`;
  // Das Etikett steht senkrecht an der rechten Kante — es nimmt dem Titel keinen Platz. Kurze Kacheln (unter 75 min)
  // tragen nur den Anfangsbuchstaben.
  const lang = k.ende - k.start >= 75;
  return {
    etikett: h('i', { class: `k-etikett e-${etikett === 'Präsenz' ? 'praesenz' : etikett === 'Video' ? 'video' : 'evl'}`, title: `${etikett}${online ? ' (online)' : ''}`, text: lang ? etikett : etikett[0] }),
    anzahl: n != null ? h('i', { class: `k-anzahl${gesamt === 1 ? ' einmal' : ''}`, title: titel, text: `${n}×` }) : null,
  };
}

function kachelEl(k) {
  const z = k.teil ? Z.erg.teile.get(k.teil) : null;
  const m = modulVon(k.modul) || (z && z.modul);
  const fz = Z.fokus && Z.erg.teile.get(Z.fokus);
  const kl = ['kachel', m ? `m${m.farbe || 1}` : '', z ? `k-${M.kategorie(z.teil)}` : k.art === 'pruefung' ? 'k-pruefung' : '', `lage-${k.lage || 'jetzt'}`];
  const flags = new Set(k.vk ? k.vk.flatMap((v) => v.flags) : []);
  let titel = z ? `${M.kurz(m)} · ${z.teil.titel}` : (k.v && k.v.titel) || '';
  let zeile2 = `${zeitspanne(k.start, k.ende)}${k.ort ? ` · ${k.ort}` : ''}`;
  let marke = null, act = null;
  if (k.art === 'termin') {
    if (k.reihe && geo.std) {
      kl.push('reihe');
      const naechster = k.vk.find((v) => v.datum >= heute());
      zeile2 = `${zeitspanne(k.start, k.ende)}${naechster ? ` · nächster ${M.datumKurz(naechster.datum)}` : ''}`;
    }
    if (k.v && k.v.titel) zeile2 = `${zeitspanne(k.start, k.ende)} · ${k.v.titel}`;
    if (k.schicht === 'B') { kl.push('gewaehlt'); const o = z && (z.teil.optionen || []).find((x) => x.id === (k.option || (k.v && k.v.option))); if (o) zeile2 = o.label; }
    if (k.unsicher) kl.push('unsicher');
    // Eine gewählte Gruppe aus einem früheren Schritt: Klick springt kurz zurück; hellgrau im selben Schritt: wird dran.
    act = k.lage === 'frueher' && k.schicht === 'B' && !fertig() ? 'kurz-zurueck' : k.lage === 'erledigt' ? 'jetzt' : 'kachel-teil';
  } else if (k.art === 'block') {
    const b = (Z.stand.plan.bloecke || []).find((x) => x.id === k.block);
    kl.push('block');
    if (!z) { kl.push('puffer'); titel = (b && b.titel) || 'Puffer'; }
    else if (b && b.titel) zeile2 = `${b.titel} · ${zeitspanne(k.start, k.ende)}`;
    // Liegt der Block auf einem Termin (gesperrt): dauernd → verschieben (hellblau), an einzelnen Tagen → fällt dort weg.
    const sf = flags.has('gesperrt') ? sperrFlagge(k.block) : null;
    if (sf && sf.dauernd) { kl.push('gesperrt'); zeile2 = 'liegt auf einem Termin — verschieben'; }
    else if (sf && !geo.std) { kl.push('gekuerzt'); zeile2 = `fällt hier teilweise weg · ${zeitspanne(k.start, k.ende)}`; }
    if (geo.std && k.vk && !kl.includes('gesperrt')) {
      const zaehlt = k.vk.filter((v) => v.zaehlt_min > 0).length;
      if (b && b.alle > 1) zeile2 = `${zeitspanne(k.start, k.ende)} · alle ${b.alle} Wochen`;
      if (z && zaehlt < k.vk.length) zeile2 = `${zeitspanne(k.start, k.ende)} · zählt ${zaehlt} von ${k.vk.length}`;
    } else if (k.v) {
      if (k.v.flags.includes('leer')) { kl.push('zaehlt-nicht'); zeile2 = 'zählt nicht: kein Video/keine Einheit'; }
      if (k.v.flags.includes('nach_pruefung')) { kl.push('zaehlt-nicht'); zeile2 = 'zählt nicht: nach der Prüfung'; }
      if (k.v.einheit && !kl.includes('gesperrt')) zeile2 = `${z.teil.art === 'video' ? 'Video' : 'Einheit'} ${k.v.einheit} · ${zeile2}`;
    }
    // Nur Blöcke des gezeigten Schritts lassen sich ziehen; ein früherer springt in seinen Schritt zurück, festgelegt
    // zeigt ein Klick den Bestandteil.
    act = k.lage === 'jetzt' ? 'block' : k.lage === 'frueher' ? (fertig() ? 'kachel-teil' : 'kurz-zurueck') : k.lage === 'erledigt' ? 'jetzt' : 'kachel-teil';
  } else if (k.art === 'option') {
    kl.push('option');
    titel = `${M.kurz(m)} · ${z.teil.titel} wählen`;
    zeile2 = k.label;
    if (k.kollision) marke = `trifft ${k.kollision}× einen Termin`;
    act = 'option';
  } else if (k.art === 'pruefung') {
    kl.push('pruefung'); titel = `${M.kurz(m)} · ${k.v.titel}`;
  } else {
    kl.push('einzel'); titel = `${m ? `${M.kurz(m)} · ` : ''}${k.v.titel}`;
  }
  if (flags.has('konflikt')) kl.push('konflikt');
  // Fokus: Was nicht zum fokussierten Teil (oder Modul) gehört, tritt zurück.
  // Die Prüfung, auf die ein fokussierter Lernblock zielt, bleibt sichtbar.
  // Das Graue früherer Schritte bleibt, wie es ist (Silas: „die Grundlagen sollen weiterhin ausgegraut sein“).
  const zielPruefung = fz && k.art === 'pruefung' && k.v && fz.teil.pruefung === k.v.pruefung;
  if (k.lage !== 'frueher' && fz && k.teil !== fz.teil.id && !zielPruefung) kl.push('blass');
  if (k.lage !== 'frueher' && Z.fokus && Z.fokus.startsWith('modul:') && k.modul !== Z.fokus.slice(6)) kl.push('blass');
  if (Z.hell && k.vk && k.vk.some((v) => v.id === Z.hell)) kl.push('hell');
  const tip = [titel, zeile2,
    k.lage === 'frueher' ? `steht schon (Schritt ${k.schritt})${(k.art === 'block' || k.schicht === 'B') && !fertig() ? ' — Klick: kurz dorthin zurück' : ''}` : k.lage === 'erledigt' ? 'schon gewählt — Klick: ändern' : null,
    ...(k.vk || []).flatMap((v) => v.flags).filter((x, i, a) => a.indexOf(x) === i).map((f) => ({ konflikt: 'Überschneidung', gesperrt: 'liegt auf einem Termin (gesperrt)', leer: 'kein Video in dieser Woche', nach_pruefung: 'nach der Prüfung' }[f]))].filter(Boolean).join('\n');
  const tags = kachelTags(k);
  const el = h(act === 'block' ? 'div' : act ? 'button' : 'div', {
    class: kl.join(' '), type: act && act !== 'block' ? 'button' : null, 'data-act': act, 'data-teil': k.teil || null,
    'data-block': k.block || null, 'data-option': k.option || null, 'data-datum': k.datum || null, 'data-schritt': act === 'kurz-zurueck' ? String(k.schritt) : null,
    title: tip, tabindex: act === 'block' ? '0' : null,
  }, h('b', { text: titel }), h('span', { class: 'k-zwei' }, tags.anzahl, zeile2), tags.etikett, marke ? h('span', { class: 'k-marke rot', text: marke }) : null);
  if (act === 'block') el.append(h('span', { class: 'k-griff', 'data-griff': '1' }));
  return el;
}

function fussZeichnen() {
  // Die Legende (V-0332, V-0333): Etikett und Wiederholungen, die Arten (eine Farbe je Art, das Modul als Streifen
  // links) und nur die Formen, die im gezeigten Schritt vorkommen.
  const n = schritt();
  const form = (kl, text) => h('span', { class: 'legende' }, h('i', { class: kl }), text);
  fuellen($('p-fuss'), [
    h('span', { class: 'legende' }, h('i', { class: 'k-etikett e-praesenz', text: 'Präsenz' }), h('i', { class: 'k-etikett e-video', text: 'Video' }), h('i', { class: 'k-etikett e-evl', text: 'EVL' })),
    h('span', { class: 'legende' }, h('i', { class: 'k-anzahl', text: '12×' }), 'so oft noch bis Semesterende', h('i', { class: 'k-anzahl einmal', text: '1×' }), 'einmalig'),
    ...M.KATEGORIEN.map(([k, text]) => h('span', { class: `legende k-${k}` }, h('i', { class: 'lg-k' }), text)),
    form('lg-a', 'fester Termin'),
    !fertig() && n === 2 ? form('lg-w', 'zur Wahl') : null,
    fertig() || n >= 2 ? form('lg-g', 'gewählt') : null,
    n >= 3 || fertig() ? form('lg-d', 'dein Block') : null,
    !fertig() && n > 1 ? form('lg-s', 'frühere Schritte') : null,
    !fertig() && n > 1 ? form('lg-e', 'schon gewählt/gelegt, nicht dran') : null,
  ]);
}

/** Unter dem Raster: was in dieser Woche (oder jede Woche) dran wäre, aber noch nicht im Plan ist (Silas, 11.10.:
 *  „diese Dinge finden angenommen in jeder Woche noch statt, sind aber noch nicht im Plan drin — dass man damit
 *  rechnen kann“). Grau: kommt noch; hellblau: du bist dran. */
function bedarfZeichnen() {
  const box = $('bedarf');
  if (!zeigtRaster() || (!fertig() && schritt() === 1)) { fuellen(box); return; }
  // Schritt 2 (V-0334, Silas: „darunter aufgelistet, welche Gruppen ich noch nicht wählen kann“): was noch zu wählen
  // ist und was noch nicht wählbar ist, weil der Lehrstuhl die Gruppen noch nicht veröffentlicht hat.
  if (!fertig() && schritt() === 2) {
    const zs = [...Z.erg.teile.values()].filter((z) => M.schrittVon(z.teil) === 2);
    const chip = (z, tun) => h('span', { class: `bd ${tun ? 'st-dran' : 'st-kommt'} m${z.modul.farbe || 1}` }, h('span', { class: 'm-punkt' }), `${M.kurz(z.modul)} · ${z.teil.titel}`,
      tun ? h('button', { type: 'button', 'data-act': 'teil', 'data-teil': z.teil.id, text: 'Gruppen zeigen' }) : null);
    const zuWaehlen = zs.filter((z) => (z.teil.optionen || []).length && !gewaehltVon(z.teil));
    const nicht = zs.filter((z) => !(z.teil.optionen || []).length);
    fuellen(box,
      zuWaehlen.length ? [h('b', { text: 'Noch zu wählen:' }), ...zuWaehlen.map((z) => chip(z, true))] : h('b', { text: 'Alle wählbaren Gruppen sind gewählt.' }),
      nicht.length ? [h('b', { class: 'bd-zwischen', text: 'Noch nicht wählbar — Termine kommen noch:' }), ...nicht.map((z) => chip(z, false))] : null);
    return;
  }
  // Sonst: was diese Woche (Standardwoche: jede Woche) dran wäre, aber noch nicht im Plan ist — im Ablauf nur der
  // gezeigte Schritt, festgelegt alles außer den Prüfungen.
  const passt = (z) => (fertig() ? M.schrittVon(z.teil) <= 4 : M.schrittVon(z.teil) === schritt());
  const liste = [...bedarf.values()].filter((b) => b.grund !== 'ok' && b.offen_min >= 15 && passt(b.z))
    .sort((a, b) => (a.grund === 'kommt') - (b.grund === 'kommt') || b.offen_min - a.offen_min);
  const wer = fertig() ? '' : `Schritt ${schritt()}: `;
  if (!liste.length) { fuellen(box, h('b', { text: rasterLage().std ? `${wer}Jede Woche ist alles im Plan.` : `${wer}Alles, was diese Woche dran ist, ist im Plan.` })); return; }
  fuellen(box, h('b', { text: rasterLage().std ? 'Jede Woche dran, noch nicht im Plan:' : 'Diese Woche dran, noch nicht im Plan:' }),
    ...liste.map((b) => {
      const z = b.z, m = z.modul;
      const st = b.grund === 'kommt' ? 'st-kommt' : 'st-dran';
      const tun = b.grund === 'kommt' ? h('span', { text: 'Termine kommen noch' })
        : fertig() ? null
          : b.grund === 'waehlen' ? h('button', { type: 'button', 'data-act': 'teil', 'data-teil': z.teil.id, text: 'Gruppe wählen' })
            : h('button', { type: 'button', 'data-act': 'legen', 'data-teil': z.teil.id, text: 'Block legen' });
      return h('span', { class: `bd ${st} m${m.farbe || 1}`, title: `${M.kurz(m)} · ${z.teil.titel}: ${M.stunden(b.ist_min)} von ${M.stunden(b.soll_min)} im Plan` },
        h('span', { class: 'm-punkt' }), `${M.kurz(m)} · ${z.teil.titel} · ${M.stunden(b.offen_min)}`, tun);
    }));
}

// ── Mitte: die Bereiche ohne Raster ──────────────────────────────────────────────────────────────

function bereichZeichnen() {
  const b = Z.ansicht.bereich;
  const box = $('bereich');
  const oben = box.scrollTop;
  fuellen(box, ...(b === 'frei' ? freiBoard() : b === 'offen' ? offenAnsicht() : erklaerung()));
  if (b === 'frei') zeitleisteAnordnen();
  box.scrollTop = oben;
}

/** Die vorlesungsfreie Zeit (Silas, 11.10.: „da fallen viele Präsenztermine raus, da hat man Platz, um zu planen,
 *  wann man welche Klausurvorbereitung macht“): oben jede Prüfung mit ihrer Vorbereitung, darunter die Tage der
 *  Weihnachtspause und der Zeit nach der Vorlesung. Prüfung wählen, dann Tage antippen: jeder Tipp ein Lerntag. */
/** Die Zeitleiste des Semesters über dem Reiter Prüfungen (V-0337, Silas: „ganz oben nochmal so eine Master-Timeline,
 *  wo man das ganze Semester sieht, die Vorlesungszeit und die vorlesungsfreie Zeit … dass einem sofort klar wird, dass
 *  diese zwei Ausschnitte vorlesungsfreier Zeit das sind, was man unten als Zeiträume sieht, und auf dieser Skala A die
 *  Klausuren, B die E-Tests, C die Online-Tests und die schriftlichen Prüfungen“). Oben die Phasen (ein Klick auf eine
 *  vorlesungsfreie springt zu ihrem Kalender, einer auf die Vorlesungszeit öffnet sie), darunter je Art eine Spur mit
 *  jedem Termin; Ausweich- und Zweittermine hohl, der Termin, der gilt, gefüllt. */
function zeitleisteEl() {
  const sem = Z.erg.sem;
  const von = sem.vorlesung.von, bis = sem.ende && sem.ende > sem.vorlesung.bis ? sem.ende : sem.vorlesung.bis;
  const tage = M.tageZwischen(von, bis) + 1;
  const pct = (d) => Math.max(0, Math.min(100, (M.tageZwischen(von, d) / tage) * 100));
  const lage = (el, a, b) => { el.style.left = `${pct(a)}%`; el.style.width = `${((M.tageZwischen(a, b) + 1) / tage) * 100}%`; return el; };
  // Phasen: Vorlesungszeit, ihre Pausen, danach vorlesungsfrei
  const segs = [];
  let cur = sem.vorlesung.von;
  (sem.frei || []).slice().sort((a, b) => (a.von < b.von ? -1 : 1)).forEach((f, i) => {
    segs.push({ art: 'vl', von: cur, bis: M.plusTage(f.von, -1) });
    segs.push({ art: 'pause', von: f.von, bis: f.bis, ziel: `phase-pause-${i}`, titel: f.titel || 'Vorlesungsfrei' });
    cur = M.plusTage(f.bis, 1);
  });
  segs.push({ art: 'vl', von: cur, bis: sem.vorlesung.bis });
  if (bis > sem.vorlesung.bis) segs.push({ art: 'frei', von: M.plusTage(sem.vorlesung.bis, 1), bis, ziel: 'phase-frei', titel: 'Vorlesungsfreie Zeit' });
  const phasen = h('div', { class: 'zl-phasen' }, ...segs.map((g) => lage(h('button', {
    type: 'button', class: `zl-phase ${g.art}`, 'data-act': g.art === 'vl' ? 'pruefplan' : 'zur-phase', 'data-ziel': g.ziel || null,
    title: `${g.art === 'vl' ? 'Vorlesungszeit — öffnen: Vorbereitung um den Stundenplan herum' : `${g.titel} — zum Kalender unten`} · ${datumMitTag(g.von)} – ${datumMitTag(g.bis)}`,
  }, h('span', { text: g.art === 'vl' ? 'Vorlesungszeit' : g.art === 'pause' ? 'Pause' : 'vorlesungsfrei' })), g.von, g.bis)));
  // Monate
  const skala = h('div', { class: 'zl-skala' });
  const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  for (let d = `${von.slice(0, 7)}-01`; d <= bis; d = M.plusTage(d, 32).slice(0, 7) + '-01') {
    if (d < von) continue;
    const t = h('span', { text: MONATE[+d.slice(5, 7) - 1] }); t.style.left = `${pct(d)}%`; skala.append(t);
  }
  const heuteEl = heute() >= von && heute() <= bis ? h('i', { class: 'zl-heute', title: `heute, ${datumMitTag(heute())}` }) : null;
  if (heuteEl) heuteEl.style.left = `${pct(heute())}%`;
  // Spuren je Art
  const spuren = [];
  const offen = [];
  M.PRUEFUNGSARTEN.forEach(([art, name], i) => {
    const marken = [];
    for (const r of Z.erg.module) {
      for (const p of r.modul.pruefungen || []) {
        if (M.pruefungsArt(p) !== art) continue;
        const gilt = M.pruefungsTermin(r.modul, p.id, Z.stand.plan).termin;
        const datiert = (p.termine || []).filter((x) => M.istDatum(x.datum));
        if (!datiert.length) offen.push(`${M.kurz(r.modul)} ${p.titel}`);
        for (const x of datiert) marken.push({ r, p, x, gilt: x === gilt, at: pct(x.datum) });
      }
    }
    marken.sort((a, b) => a.at - b.at);
    const spur = h('div', { class: 'zl-spur' });
    for (const k of marken) {
      const kurzTitel = k.p.titel.replace(/\s*\(.*\)\s*/, '').replace(/^Präsenzklausur$/, 'Klausur');
      const el = h('button', { type: 'button', class: `zl-marke a-${art}${k.gilt ? ' gilt' : ''}${k.x.wichtig === false && !k.gilt ? ' ausweich' : ''}`, 'data-act': 'pruefung', 'data-pruefung': k.p.id,
        title: `${M.kurz(k.r.modul)} · ${k.p.titel}${k.x.label ? ` (${k.x.label})` : ''} — ${datumMitTag(k.x.datum)}${k.x.start ? ` ${k.x.start}` : ''}${k.x.ort ? ` · ${k.x.ort}` : ''}` },
        h('i'), h('span', { class: 'zl-text' }, h('b', { text: `${M.kurz(k.r.modul)} ${kurzTitel}` }), ` ${M.datumKurz(k.x.datum)}`));
      el.style.left = `${k.at}%`;
      spur.append(el);
    }
    spuren.push(h('div', { class: 'zl-reihe' }, h('span', { class: 'zl-name' }, h('b', { text: 'ABC'[i] }), ` ${name}`), spur));
  });
  return h('section', { class: 'zeitleiste' },
    h('div', { class: 'zl-kopf' }, h('b', { text: 'Das Semester' }), h('span', { text: ` ${datumMitTag(von)} – ${datumMitTag(bis)} · ein Klick auf „vorlesungsfrei“ springt zum Kalender unten` }),
      h('button', { type: 'button', class: 'knopf klein haupt', 'data-act': 'pruefplan' }, sym('kalender'), 'Vorlesungszeit öffnen')),
    h('div', { class: 'zl-reihe' }, h('span', { class: 'zl-name' }), h('div', { class: 'zl-spur zl-oben' }, skala, phasen, heuteEl)),
    ...spuren,
    offen.length ? h('p', { class: 'zl-offen', text: `Termin noch offen: ${offen.join(', ')}` }) : null);
}

/** Die Beschriftungen der Zeitleiste nach dem Zeichnen ordnen: Wer sich mit einer früheren überlappte, rutscht eine
 *  Zeile tiefer; wer rechts hinausragte, steht links vom Punkt. Gemessen an der echten Breite — geschätzt überlappten
 *  sie (V-0337, erster Entwurf). */
function zeitleisteAnordnen() {
  for (const spur of document.querySelectorAll('.zeitleiste .zl-spur:not(.zl-oben)')) {
    const W = spur.clientWidth;
    const enden = [];
    for (const m of spur.querySelectorAll('.zl-marke')) {
      m.classList.remove('links');
      const x = (parseFloat(m.style.left) / 100) * W;
      let w = m.offsetWidth;
      let a = x - 6, b = x - 6 + w;
      if (b > W) { m.classList.add('links'); w = m.offsetWidth; a = x + 6 - w; b = x + 6; }
      let e = enden.findIndex((ende) => ende < a - 6);
      if (e < 0) { e = enden.length; enden.push(0); }
      enden[e] = b;
      m.style.top = `${4 + e * 19}px`;
    }
    spur.style.minHeight = `${Math.max(1, enden.length) * 19 + 10}px`;
  }
}

function freiBoard() {
  const aus = [zeitleisteEl()];
  const pz = [...Z.erg.teile.values()].filter((z) => z.teil.art === 'pruefung')
    .sort((a, b) => ((a.pruefungstermin && a.pruefungstermin.datum) || '9') < ((b.pruefungstermin && b.pruefungstermin.datum) || '9') ? -1 : 1);
  aus.push(h('div', { class: 'pk-reihe' }, ...pz.map((z) => {
    const m = z.modul, t = z.teil, x = z.pruefungstermin;
    const anteil = z.soll_min ? Math.min(1, z.ist_min / z.soll_min) : 1;
    const balken = h('div', { class: 'balken' }, h('i')); balken.firstChild.style.width = `${anteil * 100}%`;
    return h('div', { class: `pk m${m.farbe || 1}${Z.setzen === t.id ? ' an' : ''}${z.rot ? ' rot' : ''}` },
      h('button', { type: 'button', class: 'pk-wahl', 'data-act': 'setzen', 'data-teil': t.id, 'aria-pressed': String(Z.setzen === t.id), title: 'Wählen, dann Tage antippen' },
        h('span', { class: 'pk-titel' }, h('span', { class: 'm-punkt' }), `${M.kurz(m)} · ${z.pruefung ? z.pruefung.titel : t.titel}`),
        h('span', { class: `pk-wann${x ? '' : ' rot'}`, text: x ? `${datumMitTag(x.datum)}${x.start ? ` ${x.start}` : ' · Uhrzeit offen'}` : 'Prüfungstermin offen' }),
        h('span', { class: 'pk-zahl' }, `${M.stunden(z.ist_min)} von ${M.stunden(z.soll_min)} vorbereitet`, z.fehlt_min ? h('b', { text: ` · fehlen ${M.stunden(z.fehlt_min)}` }) : null),
        balken));
  })));
  aus.push(h('p', { class: 'satz', text: Z.setzen && Z.erg.teile.get(Z.setzen)?.teil.art === 'pruefung'
    ? 'Tipp einen Tag an: Er bekommt einen Lerntag (bis zu 6 h in der größten freien Lücke). Ein Tipp auf einen Lernblock bearbeitet ihn, ein Tipp auf die Woche öffnet sie im Raster.'
    : 'Wähle oben eine Prüfung und tipp dann die Tage an, an denen du dafür lernst. Ein Tipp auf eine Woche öffnet sie im Raster — dort legst du Blöcke genau.' }));
  const wo = Z.erg.wochen;
  let pause = 0;
  for (const p of M.phasen(Z.erg.sem).filter((x) => x.id !== 'vorlesung')) {
    const anker = p.id === 'pause' ? `phase-pause-${pause++}` : 'phase-frei';
    const wochen = wo.filter((w) => w.bis >= p.von && w.von <= p.bis);
    const kal = h('div', { class: 'kal' }, h('div', { class: 'kal-kopf' }, h('span'), ...M.TAGE.map((t) => h('span', { text: t }))));
    for (const w of wochen) {
      const zeile = h('div', { class: 'kal-zeile' },
        h('button', { type: 'button', class: 'kal-woche', 'data-act': 'zur-woche', 'data-woche': w.id, title: 'Diese Woche im Raster' }, h('b', { text: w.kurz }), h('span', { text: M.datumKurz(w.von) })));
      for (let d = 0; d < 7; d++) {
        const datum = M.plusTage(w.von, d);
        const drin = datum >= p.von && datum <= p.bis;
        const vk = Z.erg.vorkommen.filter((v) => v.datum === datum);
        const zelle = h('div', { class: `kal-tag${drin ? '' : ' aus'}${datum === heute() ? ' heute' : ''}${d >= 5 ? ' we' : ''}`, 'data-act': drin ? 'frei-tag' : null, 'data-datum': datum },
          h('span', { class: 'kal-datum', text: M.datumKurz(datum) }));
        for (const v of vk.filter((x) => x.quelle === 'pruefung')) {
          const m = modulVon(v.modul);
          zelle.append(h('span', { class: 'kal-pruefung', title: M.titelVon(v, Z.erg, Z.stand.angebot) }, `${M.kurz(m)} ${v.start != null ? uhr(v.start) : ''}`));
        }
        for (const v of vk.filter((x) => x.quelle === 'frist')) {
          const m = modulVon(v.modul);
          zelle.append(h('span', { class: `kal-frist${v.wichtig ? ' wichtig' : ''}`, title: v.titel }, `${m ? M.kurz(m) : ''} Frist`));
        }
        for (const v of vk.filter((x) => x.quelle === 'block')) {
          const z = v.teil ? Z.erg.teile.get(v.teil) : null;
          zelle.append(h('button', { type: 'button', class: `kal-block m${z ? z.modul.farbe || 1 : ''} ${z ? `k-${M.kategorie(z.teil)}` : ''}${v.zaehlt_min ? '' : ' zaehlt-nicht'}`, 'data-act': 'frei-block', 'data-block': v.block, 'data-datum': datum, title: `${z ? `${M.kurz(z.modul)} · ${z.teil.titel}` : 'Puffer'} ${zeitspanne(v.start, v.ende)}` },
            `${z ? M.kurz(z.modul) : 'Puffer'} ${M.stunden(v.ende - v.start)}`));
        }
        const termine = vk.filter((x) => x.quelle === 'termin' || x.quelle === 'einzel').length;
        if (termine) zelle.append(h('span', { class: 'kal-termine', text: `${termine} Termin${termine > 1 ? 'e' : ''}` }));
        if (drin) {
          const l = M.freieLuecke(Z.erg, datum);
          zelle.append(h('span', { class: 'kal-frei', text: l ? `frei ${M.stunden(l[1] - l[0])}` : 'voll' }));
        }
        zeile.append(zelle);
      }
      kal.append(zeile);
    }
    aus.push(h('section', { class: 'phase', id: anker }, h('h3', {}, p.titel, h('span', { text: ` ${datumMitTag(p.von)} – ${datumMitTag(p.bis)}` })), kal));
  }
  return aus;
}

/** Einen Lerntag setzen: die größte freie Lücke des Tages im Lernfenster, höchstens ein Lerntag lang. */
function lerntagSetzen(teil, datum) {
  const l = M.freieLuecke(Z.erg, datum);
  if (!l) { alert('An diesem Tag ist im Lernfenster keine Stunde mehr frei.'); return; }
  const dauer = Math.min(Math.round(Z.erg.regeln.lerntag_h * 60), l[1] - l[0]);
  aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), { id: neueId('l'), teil, datum, start: M.hhmm(l[0]), ende: M.hhmm(l[0] + dauer) }]; });
}

function lerntagKarte(datum, nahe) {
  const kandidaten = [...Z.erg.teile.values()].filter((z) => z.teil.art === 'pruefung' && (!z.pruefungstermin || z.pruefungstermin.datum > datum))
    .sort((a, b) => b.fehlt_min - a.fehlt_min);
  karteOeffnen([
    h('h3', { text: `Lerntag am ${datumMitTag(datum)}` }),
    h('p', { class: 'satz', text: 'Für welche Prüfung? (Nur Prüfungen nach diesem Tag.)' }),
    h('div', { class: 'wahl-liste' }, ...kandidaten.map((z) => h('button', { type: 'button', class: `m${z.modul.farbe || 1}`, onclick: () => { karteSchliessen(false); lerntagSetzen(z.teil.id, datum); } },
      h('span', { class: 'm-punkt' }), h('span', { text: `${M.kurz(z.modul)} · ${z.pruefung ? z.pruefung.titel : z.teil.titel}` }),
      h('span', { class: z.fehlt_min ? '' : 'grau', text: z.fehlt_min ? `fehlt ${M.stunden(z.fehlt_min)}` : 'gedeckt' })))),
  ], nahe);
}

/** Alles, was fehlt oder angenommen ist, an einem Ort (Silas, 11.10.: „Gibt es einen Ort, an dem ich einmal alle
 *  Annahmen als Liste sehe und auf diese antworten kann …? Und genau das Gleiche mit den Warnungen“). Jede Zeile
 *  führt dorthin, wo man es einträgt; Annahmen lassen sich hier direkt ändern oder bestätigen. */
function offenAnsicht() {
  const l = M.luecken(Z.erg);
  const gruppe = (titel, satz, eintraege, kl, zu = false) => {
    const sec = h(zu ? 'details' : 'section', { class: `offen-gruppe ${kl}` }, h(zu ? 'summary' : 'h3', {}, titel, h('span', { class: 'zahl', text: String(eintraege.length) })), h('p', { class: 'satz', text: satz }));
    if (!eintraege.length) sec.append(h('p', { class: 'satz', text: 'Nichts.' }));
    const nachModul = new Map();
    for (const f of eintraege) nachModul.set(f.modul, [...(nachModul.get(f.modul) || []), f]);
    for (const [mid, fs] of nachModul) {
      const m = modulVon(mid) || { kurz: 'Plan', titel: 'Puffer und Organisation (ohne Modul)', farbe: 0 };
      sec.append(h('div', { class: `offen-modul m${m.farbe || 1}` }, h('h4', {}, h('span', { class: 'm-punkt' }), `${M.kurz(m)} · ${m.titel}`),
        ...fs.map((f) => {
          // Eine Angabe zur Prüfung (am Modul) führt zum Lernteil dieser Prüfung, dort stehen die Formulare.
          const ziel = f.teil || (f.pruefung && [...Z.erg.teile.values()].find((x) => x.teil.pruefung === f.pruefung)?.teil.id) || null;
          const z = ziel ? Z.erg.teile.get(ziel) : null;
          const knoepfe = [];
          if (z) knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'zum-teil', 'data-teil': ziel, text: ['kritisch', 'dran'].includes(f.stufe) ? 'Eintragen' : 'Ansehen' }));
          if (!f.teil) { /* nur zum Ansehen: die Knöpfe unten ändern den Bestandteil selbst */ } else if (z && f.art === 'unsicher') knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'erledigt', 'data-teil': f.teil, 'data-feld': 'unsicher', text: 'Geprüft, stimmt' }));
          if (z && f.art === 'offen') knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'erledigt', 'data-teil': f.teil, 'data-feld': 'offen', text: 'Erledigt' }));
          if (f.art === 'anmelden' && f.stufe !== 'info') knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'angemeldet', 'data-id': f.anmeldung, text: 'Angemeldet ✓' }));
          if (z && f.art === 'annahme') knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'bestaetigen', 'data-id': `soll:${f.teil}`, text: 'Stimmt so' }));
          if (f.art === 'gesperrt') knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'schritt', 'data-schritt': String(z ? M.schrittVon(z.teil) : 4), text: 'Verschieben' }));
          return h('div', { class: 'offen-zeile' }, h('span', { class: 'offen-wo', text: f.teil && z ? z.teil.titel : f.pruefung ? 'Prüfung' : mid ? 'Modul' : 'Block' }), h('span', { class: 'offen-text', text: f.text }), h('span', { class: 'offen-knoepfe' }, ...knoepfe));
        })));
    }
    return sec;
  };
  const a = M.annahmen(Z.stand.angebot, Z.erg);
  const best = Z.stand.plan.bestaetigt || {};
  const annahmen = h('section', { class: 'offen-gruppe gelb' }, h('h3', {}, 'Annahmen und Regeln', h('span', { class: 'zahl', text: String(a.filter((x) => !x.fest).length) })),
    h('p', { class: 'satz', text: 'Werte, mit denen der Planer rechnet, wo es keine Angabe gibt. Ändern wirkt sofort; „Stimmt so“ nimmt die gelbe Markierung weg.' }),
    h('div', { class: 'annahmen' }, ...a.map((x) => {
      const z = x.teil ? Z.erg.teile.get(x.teil) : null;
      const m = x.modul ? modulVon(x.modul) : null;
      return h('div', { class: `annahme${x.fest ? ' fest' : ''}${best[x.id] ? ' bestaetigt' : ''}${m ? ` m${m.farbe || 1}` : ''}` },
        h('span', { class: 'annahme-wo' }, m ? h('span', { class: 'm-punkt' }) : null, m ? `${M.kurz(m)} · ${z ? z.teil.titel : ''}` : (x.fest ? 'Regel' : 'Stellschraube')),
        h('span', { class: 'annahme-text' }, h('b', { text: x.titel }), x.satz ? h('span', { text: ` ${x.satz}` }) : null, x.quelle ? h('span', { class: 'quelle', text: ` · ${x.quelle}` }) : null),
        x.feld ? h('label', { class: 'annahme-wert' }, h('input', { type: 'number', min: '0', step: x.einheit === 'h' ? '0.25' : '5', value: String(x.wert), 'data-annahme': x.id, 'aria-label': x.titel }), x.einheit || '') : h('span', { class: 'annahme-wert', text: x.fest ? 'fest' : '' }),
        !x.fest && x.art !== 'regel' ? h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'bestaetigen', 'data-id': x.id, text: best[x.id] ? 'bestätigt ✓' : 'Stimmt so' }) : h('span'));
    })));
  const nach = (st) => l.filter((f) => f.stufe === st);
  return [
    h('p', { class: 'stufen-legende' }, ...M.STUFEN.slice(0, 4).map((st) => h('span', { class: `legende st st-${st}` }, h('i'), { kritisch: 'kritisch — jetzt handeln', achtung: 'Achtung — prüfen', dran: 'du bist dran — eintragen, festlegen, planen', kommt: 'kommt noch — der Lehrstuhl liefert es' }[st]))),
    gruppe('Kritisch', 'Jetzt handeln: Anmeldungen, die laufen, Überschneidungen fester Termine, und alles zur Prüfung, sobald ihre Anmeldung läuft.', nach('kritisch'), 'st-kritisch'),
    gruppe('Du bist dran', 'Eintragen, festlegen, planen: Gruppen wählen, Blöcke setzen oder verschieben, Videolängen ablesen, Stunden umwidmen.', nach('dran'), 'st-dran'),
    gruppe('Achtung', 'Prüfen: Unsicheres, fehlende Räume oder Uhrzeiten bei bekanntem Datum, Zuviel über 2 h, Blöcke nach der Prüfung.', nach('achtung'), 'st-achtung'),
    annahmen,
    gruppe('Kommt noch', 'Was der Lehrstuhl noch nicht veröffentlicht hat (Termine, Fristen, Gruppen) — eintragen, sobald es da ist.', nach('kommt'), 'st-kommt', true),
    gruppe('Später', 'Prüfungsvorbereitung, deren Zeit noch nicht da ist — kritisch wird sie mit der vorlesungsfreien Zeit (oder drei Wochen vor einer Prüfung in der Vorlesungszeit).', nach('spaeter'), 'st-spaeter', true),
    gruppe('Hinweise', 'Zum Wissen: Hinweise aus ISIS, Annahmen, Blöcke ohne Video, Blöcke, die an einzelnen Tagen einem Termin weichen.', nach('info'), 'st-info', true),
  ];
}

/** Die Rechnung erklärt (Silas, 11.10.: „was genau macht die Bologna-Reform? … Wie ist das Rechenmuster?“). */
function erklaerung() {
  const su = Z.erg.summe;
  const fz = Z.fokus && Z.fokus.startsWith('modul:') ? Z.erg.module.find((r) => r.modul.id === Z.fokus.slice(6)) : Z.erg.module[0];
  const absatz = (titel, ...inhalt) => h('section', { class: 'erkl' }, h('h3', { text: titel }), ...inhalt);
  const p = (...k) => h('p', {}, ...k);
  const beispiel = fz ? h('table', { class: 'erkl-tabelle' },
    h('thead', {}, h('tr', {}, h('th', { text: 'Posten (Modulbeschreibung)' }), h('th', { text: 'Rechnung' }), h('th', { text: 'Soll' }), h('th', { text: 'Bestandteile hier' }), h('th', { text: 'eingeplant' }))),
    h('tbody', {}, ...(fz.modul.posten || []).map((po) => {
      const zs = fz.teile.filter((z) => z.teil.posten === po.id);
      return h('tr', {}, h('td', { text: po.titel }), h('td', { text: `${po.mult} × ${String(po.h).replace('.', ',')} h` }), h('td', { text: M.stunden(M.postenGesamt(po)) }),
        h('td', { text: zs.map((z) => `${z.teil.titel} (${M.stunden(z.soll_min)})`).join(', ') }), h('td', { text: M.stunden(zs.reduce((s, z) => s + z.gedeckt_min, 0)) }));
    }), h('tr', { class: 'summe' }, h('td', { text: 'Summe' }), h('td', { text: `${fz.modul.lp} LP × 30 h` }), h('td', { text: M.stunden(fz.soll_min) }), h('td'), h('td', { text: M.stunden(fz.gedeckt_min) })))) : null;
  return [
    absatz('Was die Bologna-Reform festlegt',
      p('Seit der Bologna-Reform (1999, umgesetzt mit den Bachelor- und Masterstudiengängen) misst ein Studium nicht mehr die Zeit im Hörsaal, sondern den ', h('b', { text: 'gesamten Arbeitsaufwand' }), ': Präsenz, Vor- und Nachbereitung, Übungsblätter, Prüfungsvorbereitung. Die Einheit ist der Leistungspunkt nach dem European Credit Transfer and Accumulation System (ECTS).'),
      p('Die Länder haben es in der Musterrechtsverordnung (§ 8) festgelegt: Ein Leistungspunkt sind 25 bis 30 Stunden Arbeit, ein Semester in der Regel 30 Leistungspunkte, ein Jahr 60. Die TU Berlin rechnet mit genau ', h('b', { text: '30 Stunden je Leistungspunkt' }), ' (AllgStuPO § 45 Abs. 2: „Ein Leistungspunkt entspricht einem Gesamtarbeitsaufwand von 30 Zeitstunden.“).'),
      p(`Dein 1. Fachsemester: 5 Module × 6 LP = 30 LP = ${M.stunden(su.soll_min)}. Das sind 15 Wochen à rund ${M.stunden(su.woche_min)} plus die einmalige Prüfungsvorbereitung — ein Vollzeitjob. Die SWS (Semesterwochenstunden) sagen nur noch, wie lange eine Veranstaltung je Woche läuft: 2 SWS = 2 h Präsenz.`)),
    absatz('Woher jede Zahl kommt',
      p('Jede Modulbeschreibung hat eine Tabelle „Arbeitsaufwand und Leistungspunkte“. Sie zerlegt die 180 h eines 6-LP-Moduls in Posten, jeder mit einem Multiplikator (15 = je Vorlesungswoche, 1 = einmal) und Stunden. Diese Tabelle ist amtlich; der Planer übernimmt sie unverändert. Ein Posten kann auf mehrere Bestandteile verteilt sein (die Vorlesungszeit von BuK findet als 7 Präsenztermine und als Videos statt) — dann ist die Aufteilung eine Angabe aus ISIS oder eine Annahme, und sie steht unter „Offen & Annahmen“.'),
      fz ? p(h('b', { text: `Beispiel ${M.kurz(fz.modul)} · ${fz.modul.titel} (Modulbeschreibung #${fz.modul.nr}):` }), ' (ein Klick auf einen Modulnamen links wählt ein anderes)') : null,
      beispiel),
    absatz('Die vier Schritte',
      p('Geplant wird in Schichten, in dieser Reihenfolge, und du triffst jede Entscheidung selbst — der Planer schlägt nichts vor:'),
      h('ol', { class: 'erkl-liste' },
        h('li', {}, h('b', { text: 'Grundlage' }), ': alle festen Präsenztermine, Prüfungen, Quizze und Fristen. Sie stehen, ohne dass du etwas tust; „Zurücksetzen“ führt genau hierher zurück.'),
        h('li', {}, h('b', { text: 'Gruppen' }), ': Tutorien und Übungen mit Gruppen — du wählst eine; gibt es noch keine, trägst du sie ein, sobald sie bekannt sind. Dazu, welchen Prüfungstermin du schreibst.'),
        h('li', {}, h('b', { text: 'Videos' }), ': Screencasts und Lehrvideos, also Präsenz, die als Video stattfindet. Du legst die Blöcke selbst.'),
        h('li', {}, h('b', { text: 'EVL' }), ': eigenverantwortliches Lernen — Vor- und Nachbereitung, Labs, Quizze, Prüfungsvorbereitung.')),
      p('Du kannst jederzeit in einen früheren Schritt zurück: Ein Klick auf einen Block aus einem früheren Schritt führt dorthin. Was zu einem späteren Schritt gehört, steht zart im Raster. Jede Kachel trägt ihr Etikett (Präsenz, Video, EVL) und wie oft sie bis zum Semesterende noch vorkommt.')),
    absatz('Was „eingeplant“ heißt',
      p('Eine Stunde ist eingeplant, wenn sie einen festen Platz im Kalender hat. Gezählt wird so:'),
      h('ul', { class: 'erkl-liste' },
        h('li', { text: 'Präsenz zählt über die Termine der Lehrstühle; ein c.t.-Termin (16:15–17:45) belegt die Doppelstunde = 2 h.' }),
        h('li', { text: 'Gruppen (Tutorium, Übung) zählen, sobald du eine gewählt hast.' }),
        h('li', { text: `Videos zählen über deine Blöcke, aber erst ab ihrer Freigabe; eine Woche braucht die Länge ihrer Videos plus ${Z.erg.regeln.video_puffer_min} min Puffer, aufgerundet auf ${Z.erg.regeln.raster_min} min (1:45 → 2 h).` }),
        h('li', { text: 'Nachbereitung, Labs, Quizze zählen über deine Blöcke (Wochenblöcke nur in Vorlesungswochen).' }),
        h('li', { text: 'Prüfungsvorbereitung zählt nur vor der Prüfung.' }),
        h('li', { text: 'Präsenz ist gesperrt: Auf einen Termin oder eine gewählte Gruppe lässt sich kein Block legen. Trifft ein Wochenblock nur an einzelnen Tagen einen Termin (Kick-off, E-Test), fällt er dort weg und zählt nur der freie Teil. Zu viel bei einem Bestandteil gleicht zu wenig bei einem anderen nicht aus.' }),
        h('li', { text: 'Stunden, die strukturell nicht stattfinden können (die EINFWI-Übung hat 30 h, findet aber nur 5× statt), widmest du einem anderen Bestandteil desselben Moduls zu — das Modul bleibt bei 180 h.' })),
      p(`Die Bilanz oben: alles Eingeplante (${M.stunden(su.ist_min)}) minus das, was über das Soll eines Bestandteils hinausgeht (${M.stunden(su.ueber_min)}), ergibt die gedeckten Stunden (${M.stunden(su.gedeckt_min)} von ${M.stunden(su.soll_min)}).`)),
    absatz('Quellen',
      h('ul', { class: 'erkl-liste' },
        h('li', {}, 'Musterrechtsverordnung gemäß Art. 4 Studienakkreditierungsstaatsvertrag, § 8 (KMK, ', h('a', { href: 'https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2024/2024_11_21-Musterrechtsverordnung.pdf', target: '_blank', rel: 'noopener noreferrer', text: 'Fassung 2024' }), ')'),
        h('li', { text: 'Allgemeine Studien- und Prüfungsordnung der TU Berlin (gültig ab 30.10.2024), § 45 Abs. 2 — in deinem Studienordner unter 02_Regelwerke' }),
        h('li', { text: 'Die Modulbeschreibungen (#70450, #40271, #41077, #70123; BuK #70112 im Modulkatalog der StuPO 2025) — in deinem Studienordner' }),
        h('li', { text: 'Termine, Gruppen, Fristen: deine ISIS-Kurse (Export vom 11.10.2026) und dein Semesterplan — jede Angabe trägt ihre Quelle am Bestandteil' }))),
  ];
}

// ── Rechts: das Unregelmäßige ────────────────────────────────────────────────────────────────────

function leisteZeichnen() {
  const box = $('leiste');
  const oben = box.scrollTop;
  const kopf = h('div', { class: 'l-kopf' },
    h('h2', { text: 'Semester' }),
    h('button', { class: 'knopf rund leise l-zu', type: 'button', 'data-act': 'leiste', 'aria-label': Z.ansicht.leiste ? 'Leiste einklappen' : 'Leiste ausklappen', title: 'Leiste ein-/ausklappen' }, sym('leiste')));
  fuellen(box, kopf,
    h('p', { class: 'l-satz t-zahlen', text: 'Jede Spalte eine Woche, jede Zeile ein Bestandteil — Termine gefüllt, eigene Blöcke schraffiert, andere Schritte blass. Ein Klick auf eine Zelle zeigt die Woche, einer auf den Namen wählt den Bestandteil.' }),
    minimapEl(),
    h('h3', { class: 'l-zwischen', text: 'Unregelmäßig, ab heute' }),
    chronikEl());
  box.scrollTop = oben;
}

/** Die Minimap (Silas, 11.10.: „wie die Minimap, die die Semesterübersicht einmal in Wochenansicht gibt, sodass
 *  man schnell durchnavigieren kann“): je Modul eine Summenzeile, darunter jeder Bestandteil, seine Prüfungen und
 *  Fristen — regelmäßig wie unregelmäßig. Der gewählte Bestandteil leuchtet, die anderen treten zurück. */
function minimapZeilen() {
  const wo = Z.erg.wochen;
  const idx = (d) => wo.findIndex((w) => d >= w.von && d <= w.bis);
  const zeilen = [];
  for (const r of Z.erg.module) {
    const m = r.modul;
    const summe = new Map();
    const teile = [];
    for (const z of r.teile) {
      const proWoche = new Map();
      for (const v of z.vk) {
        const i = idx(v.datum);
        if (i < 0) continue;
        const c = proWoche.get(i) || { min: 0, termin: false, block: false, leer: false, v };
        if (v.quelle === 'termin') c.termin = true; else c.block = true;
        if (v.quelle === 'block' && !v.zaehlt_min) c.leer = true;
        c.min += v.ende - v.start;
        proWoche.set(i, c);
        summe.set(i, (summe.get(i) || 0) + (v.ende - v.start));
      }
      for (const e of z.einheiten || []) { const i = idx(e.ab); if (i >= 0) { const c = proWoche.get(i) || { min: 0 }; c.freigabe = true; proWoche.set(i, c); } }
      teile.push({ art: 'teil', z, proWoche });
    }
    for (const p of m.pruefungen || []) {
      const proWoche = new Map();
      for (const x of p.termine || []) if (x.datum) { const i = idx(x.datum); if (i >= 0) proWoche.set(i, { pruefung: true, titel: `${p.titel} ${datumMitTag(x.datum)}` }); }
      teile.push({ art: 'pruefung', name: p.titel, proWoche, offen: !(p.termine || []).some((x) => x.datum) });
    }
    const fristen = new Map();
    for (const v of Z.erg.vorkommen) if (v.modul === m.id && (v.quelle === 'frist' || v.quelle === 'einzel')) {
      const i = idx(v.datum); if (i >= 0) { const c = fristen.get(i) || { frist: true, titel: [] }; c.titel.push(`${datumMitTag(v.datum)} ${v.titel}`); fristen.set(i, c); }
    }
    if (fristen.size) teile.push({ art: 'frist', name: 'Fristen und Termine', proWoche: fristen });
    zeilen.push({ modul: m, summe, teile });
  }
  return zeilen;
}

function minimapEl() {
  const wo = Z.erg.wochen;
  const box = h('div', { class: 'muster' });
  box.style.setProperty('--wochen', String(wo.length));
  const jetzt = M.wocheVon(wo, heute());
  const lage = zeigtRaster() ? rasterLage() : { std: true };
  const zeigt = lage.std ? null : lage.woche;
  const fz = Z.fokus && Z.erg.teile.get(Z.fokus);
  const fm = Z.fokus && Z.fokus.startsWith('modul:') ? Z.fokus.slice(6) : null;
  const treffer = new Set();
  if (fz) for (const v of fz.vk) treffer.add(wo.findIndex((w) => v.datum >= w.von && v.datum <= w.bis));
  box.append(h('div', { class: 'mu-zeile mu-kopf' }, h('span', { text: 'Woche' }),
    ...wo.map((w, i) => h('button', {
      type: 'button', class: [w.art !== 'vorlesung' ? 'pause' : '', w.id === zeigt ? 'zeigt' : '', jetzt && w.id === jetzt.id ? 'jetzt' : '', treffer.has(i) ? 'treffer' : ''].join(' '),
      'data-act': 'zur-woche', 'data-woche': w.id, title: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}`,
      // Nur jede fünfte Nummer und der Beginn der Prüfungszeit: 26 Spalten zweistelliger Zahlen passen nicht.
      text: w.nr && (w.nr === 1 || w.nr % 5 === 0) ? String(w.nr) : w.kurz === 'P1' ? 'P' : '',
    }))));
  box.append(h('div', { class: 'mu-zeile mu-phasen' }, h('span'),
    ...wo.map((w) => h('i', { class: `mu-phase ${w.art}`, title: w.art === 'vorlesung' ? 'Vorlesungszeit' : w.art === 'frei' ? 'vorlesungsfrei' : 'vorlesungsfreie Zeit' }))));
  const stufe = (min) => (min <= 90 ? 's1' : min <= 240 ? 's2' : 's3');
  for (const { modul: m, summe, teile } of minimapZeilen()) {
    const mBlass = (fz && fz.modul.id !== m.id) || (fm && fm !== m.id);
    const kopf = h('div', { class: `mu-zeile mu-modul m${m.farbe || 1}${mBlass ? ' blass' : ''}` },
      h('button', { type: 'button', class: 'mu-name', 'data-act': 'modul', 'data-modul': m.id, title: m.titel }, h('span', { class: 'm-punkt' }), M.kurz(m)));
    wo.forEach((w, i) => {
      const min = summe.get(i) || 0;
      kopf.append(min ? h('button', { type: 'button', class: `mu-z summe ${stufe(min / 2)}`, 'data-act': 'zur-woche', 'data-woche': w.id, title: `${M.kurz(m)} · ${w.kurz}: ${M.stunden(min)} im Kalender` }) : h('i', { class: `mu-z${w.art === 'frei' ? ' pause' : ''}` }));
    });
    box.append(kopf);
    for (const t of teile) {
      const gewaehlt = t.art === 'teil' && fz && fz.teil.id === t.z.teil.id;
      const blass = (fz && !gewaehlt) || mBlass;
      // Zeilen anderer Schritte treten zurück (Prüfungen und Fristen gehören zu Schritt 1).
      // Im Ablauf auch die Prüfungen (Schritt 5): Sie kommen erst nach dem Festlegen.
      const anders = !fertig() && !fz && !fm && (t.art === 'teil' ? M.schrittVon(t.z.teil) : t.art === 'pruefung' ? M.PRUEFUNGEN : 1) !== schritt();
      const name = t.art === 'teil' ? t.z.teil.titel : t.offen ? `${t.name} · offen` : t.name;
      const zeile = h('div', { class: `mu-zeile m${m.farbe || 1} ${t.art === 'teil' ? `k-${M.kategorie(t.z.teil)}` : 'k-pruefung'}${gewaehlt ? ' gewaehlt' : ''}${blass ? ' blass' : ''}${anders ? ' anders' : ''}` },
        t.art === 'teil'
          ? h('button', { type: 'button', class: `mu-name st-${t.z.stufe}`, 'data-act': 'teil', 'data-teil': t.z.teil.id, title: `${t.z.teil.titel} — ${M.stunden(t.z.ist_min)} von ${M.stunden(t.z.soll_min)}` }, name)
          : h('span', { class: 'mu-name', title: name, text: name }));
      wo.forEach((w, i) => {
        const c = t.proWoche.get(i);
        const kl = ['mu-z', w.art === 'frei' ? 'pause' : '', w.id === zeigt ? 'zeigt' : ''];
        if (c && c.pruefung) kl.push('pruefung');
        else if (c && c.frist) kl.push('frist');
        else if (c && c.termin) kl.push('an', stufe(c.min));
        else if (c && c.block) kl.push('lern', c.leer ? 'leer' : stufe(c.min));
        if (c && c.freigabe) kl.push('freigabe');
        const tip = c ? (c.titel ? [].concat(c.titel).join('\n') : `${w.kurz}: ${c.min ? M.stunden(c.min) : ''}${c.freigabe ? ' · Freigabe' : ''}${c.leer ? ' · zählt nicht' : ''}`) : '';
        zeile.append(c ? h('button', { type: 'button', class: kl.filter(Boolean).join(' '), 'data-act': 'zur-woche', 'data-woche': w.id, 'data-hell': c.v ? c.v.id : null, title: `${name} · ${tip}` }) : h('i', { class: kl.filter(Boolean).join(' ') }));
      });
      box.append(zeile);
    }
  }
  return box;
}

function chronikEl() {
  const wo = Z.erg.wochen;
  const box = h('div', { class: 'chronik' });
  const ab = heute();
  const eintraege = [];
  for (const v of Z.erg.vorkommen) {
    const z = v.teil ? Z.erg.teile.get(v.teil) : null;
    if (v.quelle === 'termin') {
      const t = z.teil;
      const quelle = M.istWahl(t) ? (t.optionen || []).find((o) => o.id === Z.stand.plan.wahl?.[t.id]) : t;
      if (quelle && M.muster(quelle).every((x) => x.typ === 'serie')) continue; // Serien stehen in der Standardwoche
    } else if (v.quelle === 'block') {
      if (v.woechentlich) continue;
    } else if (v.quelle === 'rahmen' && !v.bis && v.datum !== Z.erg.sem.vorlesung.von && v.datum !== Z.erg.sem.vorlesung.bis) continue;
    eintraege.push(v);
  }
  // Lernplan-Blöcke je Woche zusammenfassen, sonst stehen 10 Zeilen „Lernen“ untereinander.
  let gezeigt = 0;
  for (const w of wo) {
    if (w.bis < ab && w !== M.wocheVon(wo, ab)) continue;
    const drin = eintraege.filter((v) => v.datum >= w.von && v.datum <= w.bis);
    const einheiten = [];
    for (const z of Z.erg.teile.values()) for (const e of z.einheiten || []) if (e.ab >= w.von && e.ab <= w.bis && z.teil.art === 'video') einheiten.push({ z, e });
    if (!drin.length && !einheiten.length) continue;
    const liste = h('div', { class: `ch-woche${M.wocheVon(wo, ab) === w ? ' jetzt' : ''}` },
      h('h3', {}, h('span', { text: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}` }), h('span', { text: w.art === 'frei' ? 'vorlesungsfrei' : w.art === 'pruefung' ? 'Prüfungszeit' : '' })));
    const lern = new Map();
    for (const v of drin) {
      if (v.quelle === 'block') { lern.set(v.teil, [...(lern.get(v.teil) || []), v]); continue; }
      const m = modulVon(v.modul);
      const z = v.teil ? Z.erg.teile.get(v.teil) : null;
      const was = z ? z.teil.titel + (v.titel ? `: ${v.titel}` : '') : v.titel;
      const kl = ['ch-eintrag', v.quelle === 'frist' ? 'frist' : '', v.wichtig && v.quelle !== 'termin' ? 'wichtig' : '', v.quelle === 'pruefung' ? 'pruefung' : ''].filter(Boolean).join(' ');
      liste.append(h('button', { type: 'button', class: kl, 'data-act': 'zur-woche', 'data-woche': w.id, 'data-hell': v.id },
        h('span', { class: 'ch-wann', text: `${datumMitTag(v.datum)}${v.bis ? ` – ${M.datumKurz(v.bis)}` : ''}` }),
        h('span', { class: 'ch-was' }, m ? h('span', { class: `m-punkt m${m.farbe || 1}` }) : null, h('b', { text: `${m ? `${M.kurz(m)} · ` : ''}${was}${v.unsicher ? ' (unsicher)' : ''}` }),
          h('span', { text: ` ${v.start != null && v.ende != null ? zeitspanne(v.start, v.ende) : v.punkt != null ? uhr(v.punkt) : 'ganztägig'}${v.ort ? ` · ${v.ort}` : ''}` }))));
    }
    for (const { z, e } of einheiten) {
      const m = z.modul;
      liste.append(h('button', { type: 'button', class: 'ch-eintrag', 'data-act': 'zur-woche', 'data-woche': w.id },
        h('span', { class: 'ch-wann', text: datumMitTag(e.ab) }),
        h('span', { class: 'ch-was' }, h('span', { class: `m-punkt m${m.farbe || 1}` }), h('b', { text: `${M.kurz(m)} · Video ${e.nr}` }), h('span', { text: ` ${e.titel || ''}${e.block ? '' : ' · noch ohne Block'}` }))));
    }
    for (const [teil, vs] of lern) {
      const z = Z.erg.teile.get(teil);
      const m = z ? z.modul : null;
      liste.append(h('button', { type: 'button', class: 'ch-eintrag', 'data-act': 'zur-woche', 'data-woche': w.id },
        h('span', { class: 'ch-wann', text: `${vs.length} Tag${vs.length > 1 ? 'e' : ''}` }),
        h('span', { class: 'ch-was' }, m ? h('span', { class: `m-punkt m${m.farbe || 1}` }) : null, h('b', { text: `${m ? `${M.kurz(m)} · ` : ''}${z ? z.teil.titel : 'Lernen'}` }), h('span', { text: ` ${M.stunden(vs.reduce((s, v) => s + v.ende - v.start, 0))}` }))));
    }
    box.append(liste);
    gezeigt += 1;
  }
  if (!gezeigt) box.append(h('p', { class: 'ch-leer', text: 'Nichts Unregelmäßiges mehr in diesem Semester.' }));
  return box;
}

// ── Karte (schwebend) ────────────────────────────────────────────────────────────────────────────

let karteZu = null;
function karteOeffnen(inhalt, nahe, beimSchliessen) {
  const k = $('karte');
  fuellen(k, ...inhalt);
  k.hidden = false; $('schleier').hidden = false;
  karteZu = beimSchliessen || null;
  const r = nahe && nahe.getBoundingClientRect ? nahe.getBoundingClientRect() : nahe || { left: innerWidth / 2 - 170, top: 120, right: innerWidth / 2 + 170, bottom: 120 };
  const kb = k.getBoundingClientRect();
  let x = r.right + 8, y = r.top;
  if (x + kb.width > innerWidth - 12) x = Math.max(12, r.left - kb.width - 8);
  if (y + kb.height > innerHeight - 12) y = Math.max(12, innerHeight - kb.height - 12);
  k.style.left = `${x}px`; k.style.top = `${y}px`;
  const erstes = k.querySelector('input, select, button.haupt');
  if (erstes && !GROB.matches) erstes.focus();
}
function karteSchliessen(abbruch = true) {
  if ($('karte').hidden) return;
  $('karte').hidden = true; $('schleier').hidden = true;
  const f = karteZu; karteZu = null;
  if (f) f(abbruch);
}

function blockKarte(blockId, nahe, datum) {
  const b = (Z.stand.plan.bloecke || []).find((x) => x.id === blockId);
  if (!b) return;
  const z = b.teil ? Z.erg.teile.get(b.teil) : null;
  const vk = Z.erg.vorkommen.filter((v) => v.block === b.id);
  const zaehlt = vk.reduce((s, v) => s + v.zaehlt_min, 0);
  const diese = datum ? vk.find((v) => v.datum === datum) : null;
  // Ein Block wechselt seinen Schritt nicht: Ein Video-Block bleibt ein Video-Block (sonst spränge er zwischen den Schichten).
  const sch = M.schrittVonBlock(z && z.teil);
  const teile = [...Z.erg.teile.values()].filter((x) => x.teil.art !== 'praesenz' && M.schrittVonBlock(x.teil) === sch);
  const form = h('form', { class: 'formular' },
    h('label', { class: 'breit' }, 'Wofür', h('select', { name: 'teil' },
      sch === 4 ? h('option', { value: '', text: 'Puffer / Organisation', selected: !b.teil }) : null,
      ...teile.map((x) => h('option', { value: x.teil.id, selected: x.teil.id === b.teil, text: `${M.kurz(x.modul)} · ${x.teil.titel}` })))),
    !b.teil ? h('label', { class: 'breit' }, 'Titel', h('input', { name: 'titel', value: b.titel || '' })) : null,
    b.datum
      ? h('label', { class: 'breit' }, 'Datum', h('input', { name: 'datum', type: 'date', value: b.datum }))
      : h('label', {}, 'Wochentag', h('select', { name: 'tag' }, ...M.TAGE.map((x) => h('option', { value: x, selected: x === b.tag, text: M.TAGE_LANG[M.TAGE.indexOf(x)] })))),
    !b.datum ? h('label', {}, 'Takt', h('select', { name: 'alle' }, ...[1, 2, 3, 4, 6, 8].map((n) => h('option', { value: String(n), text: n === 1 ? 'jede Woche' : `alle ${n} Wochen`, selected: (b.alle || 1) === n })))) : null,
    !b.datum ? h('label', {}, 'Auch in der Pause', h('select', { name: 'pause' }, h('option', { value: '', text: 'nein', selected: !b.pause }), h('option', { value: '1', text: 'ja', selected: !!b.pause }))) : null,
    h('label', {}, 'von', h('input', { name: 'start', type: 'time', step: '300', value: b.start })),
    h('label', {}, 'bis', h('input', { name: 'ende', type: 'time', step: '300', value: b.ende })),
    !b.datum ? h('label', {}, 'ab (optional)', h('input', { name: 'ab', type: 'date', value: b.ab || '' })) : null,
    !b.datum ? h('label', {}, 'bis (optional)', h('input', { name: 'bis', type: 'date', value: b.bis || '' })) : null,
    h('p', { class: 'satz', text: b.datum
      ? `Zählt ${M.stunden(zaehlt)}${diese && diese.zaehlt_min === 0 ? ' — an diesem Tag nicht (siehe Hinweis am Teil)' : ''}.`
      : `${vk.length} Wochen, davon zählen ${vk.filter((v) => v.zaehlt_min > 0).length} — zusammen ${M.stunden(zaehlt)}.${diese && diese.zaehlt_min < diese.ende - diese.start ? ` Am ${datumMitTag(diese.datum)} zählt er ${M.stunden(diese.zaehlt_min)}.` : ''}` }),
    h('div', { class: 'zeile' },
      h('button', { class: 'knopf klein rot', type: 'button', onclick: () => { karteSchliessen(false); aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((x) => x.id !== b.id); }); }, text: 'Löschen' }),
      h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Fertig' })),
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const start = f.get('start'), ende = f.get('ende');
    if (!start || !ende || M.min(ende) <= M.min(start)) { alert('„bis“ muss nach „von“ liegen.'); return; }
    const neuTeil = f.get('teil') ? Z.erg.teile.get(f.get('teil'))?.teil : null;
    if (M.schrittVonBlock(neuTeil) === 4 && M.min(ende) - M.min(start) < Z.erg.regeln.evl_min_min) { alert(`Ein EVL-Block ist mindestens ${M.stunden(Z.erg.regeln.evl_min_min)} lang.`); return; }
    const tag = b.datum ? M.wochentag(f.get('datum') || b.datum) : M.TAGE.indexOf(f.get('tag') || b.tag);
    if (gesperrtMelden({ tag, datum: b.datum ? (f.get('datum') || b.datum) : null, start: M.min(start), ende: M.min(ende), woechentlich: !b.datum })) return;
    karteSchliessen(false);
    aendern((s) => {
      const x = s.plan.bloecke.find((y) => y.id === b.id);
      x.teil = f.get('teil') || null; x.start = start; x.ende = ende;
      if (!x.teil) x.titel = (f.get('titel') || x.titel || 'Puffer').toString().slice(0, 80); else delete x.titel;
      if (x.datum) x.datum = f.get('datum') || x.datum;
      else {
        x.tag = f.get('tag') || x.tag;
        const ab = f.get('ab'), bis = f.get('bis');
        if (ab) x.ab = ab; else delete x.ab;
        if (bis) x.bis = bis; else delete x.bis;
        if (f.get('pause')) x.pause = true; else delete x.pause;
        const alle = Number(f.get('alle') || 1);
        if (alle > 1) x.alle = alle; else delete x.alle;
      }
    });
  });
  karteOeffnen([h('h3', {}, z ? `${M.kurz(z.modul)} · ${z.teil.titel}` : (b.titel || 'Puffer'), h('span', { class: 't-zahlen', text: b.datum ? 'einmal' : 'jede Vorlesungswoche' })), form], nahe);
}

/** Uhrzeit (und Ort) für einen Termin, der nur ein Datum hat: Prüfungstermin oder Einzeltermin. */
function zeitKarte(vkId, nahe) {
  const v = Z.erg.vorkommen.find((x) => x.id === vkId);
  if (!v) return;
  const form = h('form', { class: 'formular' },
    h('label', {}, 'von', h('input', { name: 'start', type: 'time', step: '300', required: true })),
    h('label', {}, 'bis', h('input', { name: 'ende', type: 'time', step: '300' })),
    h('label', { class: 'breit' }, 'Ort (optional)', h('input', { name: 'ort', value: v.ort || '' })),
    h('div', { class: 'zeile' }, h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Eintragen' })));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const start = f.get('start'), ende = f.get('ende'), ort = String(f.get('ort') || '').trim();
    if (!start) return;
    if (ende && M.min(ende) <= M.min(start)) { alert('„bis“ muss nach „von“ liegen.'); return; }
    karteSchliessen(false);
    aendern((s) => {
      let ziel = null;
      if (v.quelle === 'pruefung') {
        const p = s.angebot.module.find((m) => m.id === v.modul).pruefungen.find((x) => x.id === v.pruefung);
        ziel = p.termine.find((x) => x.datum === v.datum);
      } else if (v.quelle === 'frist' && /-anmeldung-bis$/.test(v.id)) {
        // Anmeldefrist aus `anmeldung`: die Uhrzeit ist bis_zeit
        for (const m of s.angebot.module) for (const x of [...(m.pruefungen || []), ...(m.teile || [])]) if (x.anmeldung && v.id.startsWith(`${x.id}-anmeldung`)) x.anmeldung.bis_zeit = start;
        return;
      } else ziel = (s.angebot.termine || []).find((x) => x.id === v.id);
      if (!ziel) return;
      ziel.start = start;
      if (ende) ziel.ende = ende; else delete ziel.ende;
      if (ort) ziel.ort = ort;
      if (ziel.offen && /uhrzeit|zeit/i.test(ziel.offen) && (!/raum|ort/i.test(ziel.offen) || ort)) delete ziel.offen;
      ziel.quelle = [ziel.quelle, 'Uhrzeit: Silas'].filter(Boolean).join('; ');
    });
  });
  karteOeffnen([h('h3', { text: `${datumMitTag(v.datum)} · ${M.titelVon(v, Z.erg, Z.stand.angebot)}` }), h('p', { class: 'satz', text: 'Uhrzeit eintragen — dann steht der Termin im Raster.' }), form], nahe);
}

function kalenderKarte(nahe) {
  const basis = `${location.host}${API}/kalender`;
  const k = encodeURIComponent(Z.schluessel);
  const zeile = (name, datei, satz) => h('div', { class: 'formular' },
    h('p', { class: 'satz breit' }, h('b', { text: name }), ` — ${satz}`),
    h('div', { class: 'zeile' },
      h('button', { class: 'knopf klein', type: 'button', onclick: () => navigator.clipboard && navigator.clipboard.writeText(`https://${basis}/${datei}.ics?k=${k}`), text: 'Adresse kopieren' }),
      h('a', { class: 'knopf klein haupt', href: `webcal://${basis}/${datei}.ics?k=${k}`, text: 'Abonnieren' })));
  karteOeffnen([
    h('h3', {}, 'In den Kalender', h('button', { class: 'knopf rund leise', type: 'button', 'aria-label': 'Schließen', onclick: () => karteSchliessen() }, sym('zu'))),
    h('p', { class: 'satz', text: 'Ein Abo legt einen eigenen Kalender an und holt jede Stunde den neuesten Plan. Die Adresse enthält deinen Schlüssel — gib sie nicht weiter.' }),
    zeile('TU · Termine', 'termine', 'Präsenz, gewählte Gruppen, Prüfungen und Fristen'),
    zeile('TU · Lernen', 'lernen', 'deine Blöcke (Videos, Labs, Lernen) — getrennt, damit du sie ausblenden kannst'),
    h('p', { class: 'satz', text: 'Für das Study OS: GET /silas/api/ereignisse mit dem Schlüssel als „Authorization: Bearer …“ liefert jedes Vorkommen mit Id, Zeitzone und Schicht (docs/SILAS.md §6).' }),
  ], nahe);
}

// ── Sperren und Zurücksetzen (V-0333) ────────────────────────────────────────────────────────────

/** Eine kurze Meldung unten im Plan, die von selbst verschwindet. */
let meldungZu = null;
function melden(text) {
  const t = $('meldung');
  t.textContent = text; t.hidden = false;
  clearTimeout(meldungZu);
  meldungZu = setTimeout(() => { t.hidden = true; }, 4200);
}

/** Liegt ein Block-Entwurf auf einem Termin? Dann sagt es die Seite und gibt true zurück (Silas, 11.10.: „während ein
 *  Präsenztermin stattfindet, darf es nicht möglich sein, dass man irgendetwas anderes macht … und bei
 *  Tutoriumsterminen, wenn man eine Gruppe gewählt hat, müssen die danach auch geblockt sein“). */
function gesperrtMelden(entwurf) {
  const im = M.gesperrtDurch(Z.stand.angebot, Z.stand.plan, Z.erg, entwurf);
  if (!im.length) return false;
  melden(`Gesperrt: Da liegt ${im.join(' und ')}. Präsenz und gewählte Gruppen bleiben frei — leg den Block daneben.`);
  return true;
}

/** Zurücksetzen (Silas: „wenn man auf Zurücksetzen drückt, die absolute Foundation muss sein …“): ab welchem Schritt.
 *  Rückgängig macht es wieder gut; auf dem Server liegt zudem stündlich eine Sicherung (functions/silas/api). */
function zuruecksetzenKarte(nahe) {
  const plan = Z.stand.plan;
  const teil = (id) => (id ? Z.erg.teile.get(id)?.teil : null);
  const bl = (n) => (plan.bloecke || []).filter((b) => M.schrittVonBlock(teil(b.teil)) === n).length;
  const was = { 2: [Object.keys(plan.wahl || {}).length, 'Gruppen'], 3: [bl(3), 'Video-Blöcke'], 4: [bl(4), 'Lern-Blöcke'] };
  const satz = (ab) => [2, 3, 4].filter((n) => n >= ab).map((n) => `${was[n][0]} ${was[n][1]}`).join(', ');
  const knopf = (ab, text) => h('button', { type: 'button', class: `knopf${ab === 2 ? ' haupt' : ''}`, onclick: () => {
    karteSchliessen(false);
    aendern((s) => { s.plan = M.zuruecksetzen(s.plan, s.angebot, ab, { am: new Date().toISOString() }); });
    Z.ansicht.schritt = ab === 2 ? 1 : ab; Z.ansicht.bereich = 'plan'; Z.fokus = null; Z.setzen = null; ansichtMerken(); zeichnen(); bannerZeigen();
    melden(`Zurückgesetzt. Was weg ist, liegt beiseite — „Wiederherstellen“ unter Zurücksetzen holt es zurück.`);
  } }, h('b', { text }), h('small', { text: ` — nimmt ${satz(ab)} heraus` }));
  const z = plan.zurueckgesetzt;
  karteOeffnen([
    h('h3', {}, 'Zurücksetzen', h('button', { class: 'knopf rund leise', type: 'button', 'aria-label': 'Schließen', onclick: () => karteSchliessen() }, sym('zu'))),
    h('p', { class: 'satz', text: 'Zurück auf die Grundlage: Es bleiben alle festen Präsenztermine und Quizze — und was du über das Semester weißt (Videolängen, Uhrzeiten, Anmeldungen, bestätigte Annahmen) und alles zu den Prüfungen. Nichts wird gelöscht: Was herausfällt, liegt beiseite.' }),
    h('div', { class: 'zurueck-wahl' },
      knopf(2, 'Alles ab Schritt 2'),
      knopf(3, 'Ab Schritt 3 — Gruppen bleiben'),
      knopf(4, 'Nur Schritt 4 — Gruppen und Videos bleiben')),
    z ? h('div', { class: 'zurueck-wahl' }, h('p', { class: 'satz', text: `Beiseite liegt${z.am ? ` seit ${datumMitTag(z.am.slice(0, 10))}` : ''}: ${Object.keys(z.wahl || {}).length} Gruppen, ${z.bloecke.length} Blöcke.` }),
      h('button', { type: 'button', class: 'knopf', onclick: () => { karteSchliessen(false); aendern((s) => { s.plan = M.wiederherstellen(s.plan); }); melden('Wiederhergestellt.'); } }, sym('zurueck'), 'Wiederherstellen')) : null,
  ], nahe);
}

/** Stundenplan festlegen (V-0334, Silas: „wenn man alles gewählt hat, dann kann man sagen, Stundenplan festlegen. Und
 *  dann ist erst das erste Mal, dass man alles in voller Farbe sieht“). Was noch offen ist, steht vorher da. */
function festlegenKarte(nahe) {
  const offen = Z.schritte.slice(0, 4).flatMap((s) => s.teile.flatMap((z) => z.flags.filter((f) => ['kritisch', 'dran'].includes(f.stufe)).map((f) => ({ s, z, f }))));
  const kommt = Z.schritte.slice(0, 4).reduce((n, s) => n + s.zaehler.kommt, 0);
  karteOeffnen([
    h('h3', {}, 'Stundenplan festlegen', h('button', { class: 'knopf rund leise', type: 'button', 'aria-label': 'Schließen', onclick: () => karteSchliessen() }, sym('zu'))),
    h('p', { class: 'satz', text: offen.length ? `Noch offen — du kannst trotzdem festlegen und später bearbeiten:` : `Alles gewählt und gelegt.${kommt ? ` ${kommt} Angaben liefern die Lehrstühle noch.` : ''}` }),
    offen.length ? h('div', { class: 'vorschau-liste breit' }, ...offen.slice(0, 8).map(({ s, z, f }) => h('span', { text: `${s.nr} · ${M.kurz(z.modul)} ${z.teil.titel}: ${f.text}` }))) : null,
    h('div', { class: 'zeile' },
      h('button', { type: 'button', class: 'knopf', onclick: () => karteSchliessen(), text: 'Weiter planen' }),
      h('button', { type: 'button', class: 'knopf haupt', onclick: () => {
        karteSchliessen(false);
        aendern((s) => { s.plan.festgelegt = new Date().toISOString(); });
        Z.ansicht.bereich = 'plan'; Z.fokus = null; Z.setzen = null; ansichtMerken(); zeichnen(); bannerZeigen();
        melden('Festgelegt. Ändern: „Stundenplan bearbeiten“.');
      } }, sym('ok'), 'Festlegen')),
  ], nahe);
}

/** Bearbeiten: zurück in einen Schritt; die Auswahl bleibt (Silas: „nur dass diesmal die Auswahl dahinter auch
 *  gespeichert wird“). Danach wieder festlegen. */
function bearbeiten(n, teilId) {
  aendern((s) => { delete s.plan.festgelegt; });
  zumSchritt(n, teilId);
}
function bearbeitenKarte(nahe) {
  karteOeffnen([
    h('h3', {}, 'Welchen Schritt bearbeiten?', h('button', { class: 'knopf rund leise', type: 'button', 'aria-label': 'Schließen', onclick: () => karteSchliessen() }, sym('zu'))),
    h('p', { class: 'satz', text: 'Deine Auswahl bleibt, wie sie ist. Was davor kommt, ist grau, was danach kommt, ausgeblendet — bis du wieder festlegst.' }),
    h('div', { class: 'zurueck-wahl' }, ...M.SCHRITTE.map((sc) => h('button', { type: 'button', class: 'knopf', onclick: () => { karteSchliessen(false); bearbeiten(sc.nr); } },
      h('b', { text: `${sc.nr} · ${sc.titel}` }), h('small', { text: ` — ${sc.satz}` })))),
  ], nahe);
}

// ── Bedienung ────────────────────────────────────────────────────────────────────────────────────

/** Einen Bestandteil wählen. In seinem Schritt heißt das zugleich: Blöcke für ihn setzen (Videos in 3, Lernen in 4) —
 *  Silas wird durch genau diese Entscheidung geführt. Ein Bestandteil aus einem anderen Schritt holt diesen Schritt. */
function fokussieren(teilId) {
  Z.fokus = Z.fokus === teilId ? null : teilId;
  const z = Z.fokus && Z.erg.teile.get(Z.fokus);
  Z.setzen = null;
  if (z && fertig()) {
    if (z.teil.art === 'pruefung') Z.setzen = z.teil.id; // Prüfungsvorbereitung: Lerntage setzen
  } else if (z) {
    const n = M.schrittVon(z.teil);
    if (n !== schritt() && Z.ansicht.bereich !== 'offen') { Z.ansicht.schritt = n; if (Z.ansicht.bereich === 'erklaerung' || (Z.ansicht.bereich === 'frei' && n !== 4)) Z.ansicht.bereich = 'plan'; ansichtMerken(); }
    if (n >= 2 && n <= 4) Z.jetzt[n] = z.teil.id;
    Z.legen = null;
  }
  // Gruppen zeigt die Standardwoche am besten.
  if (z && M.istWahl(z.teil) && (z.teil.optionen || []).length && Z.ansicht.bereich === 'plan' && Z.ansicht.modus !== 'standard' && !(z.teil.optionen || []).some((o) => M.muster(o).some((x) => x.typ === 'reihe'))) Z.ansicht.modus = 'standard';
  zeichnen(); bannerZeigen();
}

/** Kurz zurück (V-0336, Silas: „wenn man in einem weiteren Schritt ist und man klickt auf ein Event, das in einem
 *  Schritt vorher war, dann soll man temporär in den vorherigen Schritt zurückspringen und wieder die
 *  Auswahlmöglichkeiten haben“): Der frühere Schritt mit genau dieser Sache dran; nach der Änderung (eine Gruppe
 *  gewählt, ein Block verschoben oder gelegt) geht es von selbst zurück. */
function kurzZurueck(n, teilId) {
  if (fertig() || !(n >= 2 && n <= 4) || !teilId) return;
  Z.sprung = Z.sprung || { nach: schritt() };
  Z.ansicht.schritt = n; Z.ansicht.bereich = 'plan';
  Z.jetzt[n] = teilId; Z.legen = null; Z.fokus = null;
  ansichtMerken(); zeichnen(); bannerZeigen();
}
function sprungEnde() {
  if (!Z.sprung) return;
  const nach = Z.sprung.nach;
  Z.jetzt[schritt()] = null;
  Z.sprung = null; Z.legen = null;
  Z.ansicht.schritt = nach; ansichtMerken(); zeichnen(); bannerZeigen();
}

/** In einen Schritt springen (vor oder zurück). */
function zumSchritt(n, teilId) {
  Z.sprung = null;
  Z.ansicht.schritt = n;
  Z.ansicht.bereich = 'plan';
  Z.legen = null;
  $('module').scrollTop = 0; // ein neuer Schritt beginnt oben
  Z.setzen = null;
  if (!teilId) Z.fokus = null;
  ansichtMerken();
  if (teilId) { Z.fokus = null; fokussieren(teilId); } else { zeichnen(); bannerZeigen(); }
}

/** Eine echte Woche im Raster zeigen (jede Woche des Semesters, auch der vorlesungsfreien Zeit). */
function zurWoche(id, hell) {
  const w = Z.erg.wochen.find((x) => x.id === id);
  if (!w) return;
  Z.ansicht.bereich = 'plan'; Z.ansicht.modus = 'woche'; Z.ansicht.woche = id;
  ansichtMerken();
  Z.hell = hell || null;
  zeichnen();
  if (hell) setTimeout(() => { if (Z.hell === hell) { Z.hell = null; if (zeigtRaster()) rasterZeichnen(); } }, 2400);
}

function wocheSchritt(n) {
  if (Z.ansicht.bereich !== 'plan') return;
  const wo = Z.erg.wochen;
  if (Z.ansicht.modus === 'standard') Z.ansicht.modus = 'woche';
  else {
    const i = wo.findIndex((w) => w.id === Z.ansicht.woche);
    Z.ansicht.woche = wo[Math.max(0, Math.min(wo.length - 1, i + n))].id;
  }
  ansichtMerken(); zeichnen();
}

let verdrahtet = false;
function verdrahten() {
  if (verdrahtet) return;
  verdrahtet = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.closest('#karte') && !el.dataset.act) return;
    const a = el.dataset.act, teil = el.dataset.teil;
    switch (a) {
      case 'teil': {
        fokussieren(teil);
        if (el.closest('#leiste')) document.querySelector(`[data-teil="${teil}"].teil`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        break;
      }
      case 'modul': {
        // Im Ablauf heißt ein Modul anklicken: seine erste offene Sache ist dran (Schritt 2: seine Gruppen im Raster).
        const n = schritt();
        const erste = !fertig() && n >= 2 && (reihe(n).find((x) => x.z.modul.id === el.dataset.modul && x.offen) || reihe(n).find((x) => x.z.modul.id === el.dataset.modul));
        if (erste) { Z.jetzt[n] = erste.z.teil.id; Z.legen = null; zeichnen(); bannerZeigen(); break; }
        Z.fokus = Z.fokus === `modul:${el.dataset.modul}` ? null : `modul:${el.dataset.modul}`; zeichnen(); break;
      }
      case 'jetzt': Z.jetzt[schritt()] = teil; Z.legen = null; zeichnen(); bannerZeigen(); break;
      case 'legen': {
        const vg = M.vorgabe(Z.erg, teil);
        if (!vg) break;
        const da = (Z.stand.plan.bloecke || []).filter((b) => b.teil === teil && !b.datum).length;
        Z.jetzt[schritt()] = teil;
        Z.legen = { teil, dauer: vg.dauer_min, alle: vg.alle, bis: vg.bis, rest: Math.max(1, vg.anzahl - da) };
        if (Z.ansicht.bereich !== 'plan') Z.ansicht.bereich = 'plan';
        zeichnen(); bannerZeigen();
        break;
      }
      case 'legen-aus': Z.legen = null; zeichnen(); bannerZeigen(); break;
      case 'legen-pruefung': {
        const z = Z.erg.teile.get(teil);
        const dauer = Number(el.closest('li')?.querySelector('select')?.value || 120);
        const x = z && z.pruefungstermin;
        Z.legen = { teil, dauer, alle: 1, rest: 1, bis: x ? M.plusTage(x.datum, -1) : null, pruefung: true };
        zeichnen(); bannerZeigen();
        break;
      }
      case 'pruefplan': Z.ansicht.bereich = 'pruefplan'; Z.ansicht.modus = 'standard'; Z.fokus = null; Z.setzen = null; ansichtMerken(); zeichnen(); bannerZeigen(); break;
      case 'zur-phase': $(el.dataset.ziel)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'modus': if (Z.ansicht.bereich !== 'pruefplan') Z.ansicht.bereich = 'plan'; Z.ansicht.modus = el.dataset.modus; ansichtMerken(); zeichnen(); break;
      case 'bereich': Z.ansicht.bereich = el.dataset.bereich; Z.fokus = null; Z.setzen = null; ansichtMerken(); zeichnen(); bannerZeigen(); $('bereich').scrollTop = 0; break;
      case 'schritt': zumSchritt(Number(el.dataset.schritt), el.dataset.teil || null); break;
      case 'festlegen': festlegenKarte(el); break;
      case 'bearbeiten': if (el.dataset.schritt) bearbeiten(Number(el.dataset.schritt), teil || null); else bearbeitenKarte(el); break;
      case 'kurz-zurueck': kurzZurueck(Number(el.dataset.schritt), teil || null); break;
      case 'sprung-ende': sprungEnde(); break;
      case 'aufklappen': {
        const n = schritt();
        Z.auf[n] = el.dataset.modul;
        const erste = reihe(n).find((x) => x.z.modul.id === el.dataset.modul);
        if (erste) Z.jetzt[n] = erste.z.teil.id;
        Z.legen = null; zeichnen(); bannerZeigen();
        break;
      }
      case 'quiz': Z.fokus = Z.fokus === `quiz:${teil}` ? null : `quiz:${teil}`; zeichnen(); break;
      case 'pruefung': Z.fokus = Z.fokus === `pruefung:${el.dataset.pruefung}` ? null : `pruefung:${el.dataset.pruefung}`; zeichnen(); break;
      case 'zuruecksetzen': zuruecksetzenKarte(el); break;
      case 'frei-tag': {
        const z = Z.setzen && Z.erg.teile.get(Z.setzen);
        if (z && z.teil.art === 'pruefung') lerntagSetzen(z.teil.id, el.dataset.datum);
        else lerntagKarte(el.dataset.datum, el);
        break;
      }
      case 'frei-block': blockKarte(el.dataset.block, el, el.dataset.datum); break;
      case 'zum-teil': {
        Z.fokus = teil; zeichnen();
        const ziel = document.querySelector(`[data-teil="${teil}"].teil`);
        if (ziel) { ziel.scrollIntoView({ block: 'center', behavior: 'smooth' }); ziel.focus({ preventScroll: true }); }
        break;
      }
      case 'pruefung-wahl': aendern((s) => { const w = { ...(s.plan.pruefungstermin || {}) }; if (w[el.dataset.pruefung] === el.dataset.datum) delete w[el.dataset.pruefung]; else w[el.dataset.pruefung] = el.dataset.datum; s.plan.pruefungstermin = w; }); break;
      case 'links': Z.ansicht.links = el.dataset.wert; ansichtMerken(); zeichnen(); break;
      case 'angemeldet': aendern((s) => { const a = { ...(s.plan.angemeldet || {}) }; if (a[el.dataset.id]) delete a[el.dataset.id]; else a[el.dataset.id] = true; s.plan.angemeldet = a; }); break;
      case 'zeit': zeitKarte(el.dataset.vk, el); break;
      case 'bestaetigen': aendern((s) => { const b = { ...(s.plan.bestaetigt || {}) }; if (b[el.dataset.id]) delete b[el.dataset.id]; else b[el.dataset.id] = true; s.plan.bestaetigt = b; }); break;
      case 'woche-vor': wocheSchritt(Number(el.dataset.schritt)); break;
      case 'zur-woche': zurWoche(el.dataset.woche, el.dataset.hell); break;
      case 'leiste': Z.ansicht.leiste = !Z.ansicht.leiste; ansichtMerken(); zeichnen(); break;
      case 'rueck': rueckgaengig(); break;
      case 'kalender': kalenderKarte(el); break;
      case 'setzen': Z.setzen = Z.setzen === teil ? null : teil; zeichnen(); bannerZeigen(); break;
      case 'setzen-aus': Z.setzen = null; zeichnen(); bannerZeigen(); break;
      case 'neu-laden': neuLaden(); break;
      case 'ueberschreiben': if (confirm('Den Stand auf dem Server mit dem aus diesem Browser überschreiben?')) { Z.konflikt = null; speichern(true); } break;
      case 'erste-luecke': {
        const z = [...Z.erg.teile.values()].find((x) => x.rot);
        if (z) { Z.fokus = z.teil.id; zeichnen(); document.querySelector(`[data-teil="${z.teil.id}"].teil`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        break;
      }
      case 'option': {
        const t = Z.erg.teile.get(teil);
        const o = M.optionsKacheln(Z.stand.angebot, Z.erg, teil).find((x) => x.option === el.dataset.option);
        const vorher = new Set(Z.erg.vorkommen.filter((v) => v.flags.includes('gesperrt')).map((v) => v.block));
        Z.jetzt[2] = null; // weiter zur nächsten offenen Wahl
        aendern((s) => { s.plan.wahl = { ...(s.plan.wahl || {}), [teil]: el.dataset.option }; });
        if (t) { Z.fokus = null; zeichnen(); }
        // Die Gruppe ist ab jetzt gesperrt. Lag dort schon ein Block, muss er in seinem Schritt weichen.
        const neu = [...new Set(Z.erg.vorkommen.filter((v) => v.flags.includes('gesperrt') && !vorher.has(v.block)).map((v) => v.block))];
        if (Z.sprung) sprungEnde();
        if (o && o.kollision) melden(`Achtung: Diese Gruppe trifft ${o.kollision}× einen festen Termin.`);
        else if (neu.length) melden(`Gewählt. ${neu.length} ${neu.length > 1 ? 'Blöcke liegen' : 'Block liegt'} jetzt auf dieser Gruppe — in Schritt 3 oder 4 verschieben (hellblau markiert).`);
        break;
      }
      case 'abwaehlen': aendern((s) => { const w = { ...(s.plan.wahl || {}) }; delete w[teil]; s.plan.wahl = w; }); break;
      case 'kachel-teil': if (teil) { Z.fokus = teil; zeichnen(); document.querySelector(`[data-teil="${teil}"].teil`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } break;
      case 'umwidmung-weg': aendern((s) => { s.plan.umwidmungen = (s.plan.umwidmungen || []).filter((u) => u.id !== el.dataset.id); }); break;
      case 'erledigt': aendern((s) => { const t = teilIn(s, teil); delete t[el.dataset.feld]; if (el.dataset.feld === 'offen' && t.einheiten) delete t.einheiten.offen; }); break;
      default: break;
    }
  });
  $('schleier').addEventListener('click', () => karteSchliessen());
  document.addEventListener('change', (e) => {
    const d = e.target.dataset || {};
    if (d.act === 'woche-waehlen' && e.target.value) zurWoche(e.target.value);
    if (d.einheit) videoLaenge(d.einheit, e.target.value);
    if (d.annahme) annahmeAendern(d.annahme, e.target.value);
  });
  document.addEventListener('submit', formularAbschicken);
  document.addEventListener('keydown', (e) => {
    const inFeld = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') { if (!$('karte').hidden) karteSchliessen(); else if (Z.sprung && !Z.legen) sprungEnde(); else if (Z.legen || Z.setzen || Z.fokus) { Z.legen = null; Z.setzen = null; Z.fokus = null; zeichnen(); bannerZeigen(); } return; }
    if (inFeld) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); rueckgaengig(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (!$('karte').hidden || !zeigtRaster()) return; e.preventDefault(); wocheSchritt(e.key === 'ArrowLeft' ? -1 : 1); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement?.dataset?.act === 'block') {
      const id = document.activeElement.dataset.block;
      aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((x) => x.id !== id); });
    }
  });
  $('raster').addEventListener('pointerdown', zeigerRunter);
  $('raster').addEventListener('pointermove', legenZeigen);
  $('raster').addEventListener('pointerleave', () => { const g = $('raster').querySelector('.entwurf.legen'); if (g) g.remove(); });
  setInterval(() => { if (zeigtRaster() && !rasterLage().std) rasterZeichnen(); }, 60_000);
  addEventListener('resize', () => { if (Z.ansicht.bereich === 'frei') zeitleisteAnordnen(); });
}

/** Länge eines Videos eintragen. Kommt die Liste aus einem Takt (jeden Freitag), wird sie dabei zur echten Liste. */
function videoLaenge(schluessel, wert) {
  const [teil, i] = schluessel.split(':');
  const n = wert === '' ? null : Math.round(Number(wert));
  if (n != null && !(n > 0 && n < 600)) return;
  const z = Z.erg.teile.get(teil);
  aendern((s) => {
    const t = teilIn(s, teil);
    t.einheiten = { ...(t.einheiten || {}) };
    if (!Array.isArray(t.einheiten.liste) || !t.einheiten.liste.length) {
      t.einheiten.liste = z.einheiten.map((e) => ({ nr: e.nr, ab: e.ab, titel: e.titel }));
      delete t.einheiten.takt;
    }
    const e = t.einheiten.liste.find((x) => istGleich(x, z.einheiten[Number(i)]));
    if (!e) return;
    if (n == null) delete e.laenge_min; else e.laenge_min = n;
    if (n != null && e.offen && /länge/i.test(e.offen)) delete e.offen;
    e.quelle = e.quelle && /Silas/.test(e.quelle) ? e.quelle : [e.quelle, 'Länge: Silas'].filter(Boolean).join('; ');
  });
}
const istGleich = (a, b) => b && a.nr === b.nr && a.ab === b.ab;

/** Eine Annahme ändern (Bereich „Offen & Annahmen“). Ein geteilter Posten bleibt ganz: Teilen sich genau zwei
 *  Bestandteile einen Posten, bekommt der andere den Rest. */
function annahmeAendern(id, wert) {
  const n = Number(String(wert).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return;
  const [art, ziel] = id.split(':');
  aendern((s) => {
    if (art === 'regel') { s.angebot.regeln = { ...(s.angebot.regeln || {}), [ziel]: n }; return; }
    const t = teilIn(s, ziel), m = modulVonTeil(s, ziel);
    if (art === 'video') { t.einheiten = { ...(t.einheiten || {}), annahme_min: Math.round(n) }; return; }
    if (art === 'soll') {
      const p = (m.posten || []).find((x) => x.id === t.posten);
      const geschwister = m.teile.filter((x) => x.posten === t.posten && x.id !== t.id);
      t.soll_h = n;
      if (p && geschwister.length === 1) geschwister[0].soll_h = Math.max(0, Math.round((p.mult * p.h - n) * 4) / 4);
      s.plan.bestaetigt = { ...(s.plan.bestaetigt || {}), [id]: true };
    }
  });
}

const teilIn = (stand, id) => {
  for (const m of stand.angebot.module) for (const t of m.teile) if (t.id === id) return t;
  return null;
};
const modulVonTeil = (stand, id) => stand.angebot.module.find((m) => m.teile.some((t) => t.id === id));

function formularAbschicken(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const teil = form.dataset.teil;
  const art = form.dataset.form;
  const daten = (s) => String(s || '').split(/[,;\s]+/).filter(Boolean).map(dmy);
  if (art === 'termin') {
    const start = f.get('start'), ende = f.get('ende');
    if (!start || !ende || M.min(ende) <= M.min(start)) { alert('„bis“ muss nach „von“ liegen.'); return; }
    const nur = daten(f.get('daten'));
    if (nur.some((x) => !x)) { alert('„nur an“ bitte als Daten wie 3.11., 1.12.'); return; }
    const ort = String(f.get('ort') || '').trim() || null;
    const muster = nur.length
      ? { typ: 'reihe', start, ende, ort, daten: nur.map((d) => ({ datum: d })) }
      : { typ: 'serie', tag: f.get('tag'), start, ende, von: f.get('von'), bis: f.get('bis'), ort };
    aendern((s) => {
      const t = teilIn(s, teil);
      if (M.istWahl(t)) {
        const label = String(f.get('label') || '').trim() || `${nur.length ? `${nur.length}×` : f.get('tag')} ${start}–${ende}${ort ? ` · ${ort}` : ''}`;
        const id = neueId(`${teil}-`);
        t.optionen = [...(t.optionen || []), { id, label, termine: muster, quelle: 'eingetragen' }];
        if (t.optionen.length === 1) s.plan.wahl = { ...(s.plan.wahl || {}), [teil]: id };
      } else t.termine = muster;
      delete t.offen;
    });
  } else if (art === 'ausfall') {
    const d = daten(f.get('daten'));
    if (!d.length || d.some((x) => !x)) { alert('Bitte Daten wie 23.10., 6.11.'); return; }
    aendern((s) => { const t = teilIn(s, teil); for (const m of M.muster(t)) if (m.typ === 'serie') m.ausser = [...new Set([...(m.ausser || []), ...d])].sort(); });
  } else if (art === 'pruefung') {
    const datum = f.get('datum');
    if (!M.istDatum(datum)) { alert('Bitte ein Datum.'); return; }
    const index = Number(form.dataset.index || 0);
    aendern((s) => {
      const t = teilIn(s, teil), m = modulVonTeil(s, teil);
      const p = m.pruefungen.find((x) => x.id === t.pruefung);
      p.termine = p.termine && p.termine.length ? p.termine : [{ label: '1. Termin' }];
      const x = { ...p.termine[index], datum };
      for (const feld of ['start', 'ende', 'ort']) { const v = String(f.get(feld) || '').trim(); if (v) x[feld] = v; else delete x[feld]; }
      // Die rote Angabe am Termin ist erledigt, wenn Datum und Zeit stehen und — falls sie den Raum meinte — auch der Ort.
      if (x.offen && x.start && (x.ort || !/raum/i.test(x.offen))) delete x.offen;
      x.quelle = [x.quelle, 'eingetragen von Silas'].filter(Boolean).join('; ');
      p.termine[index] = x;
    });
  } else if (art === 'video') {
    const laenge = Number(f.get('laenge'));
    aendern((s) => {
      const t = teilIn(s, teil);
      t.einheiten = { ...(t.einheiten || {}) };
      if (laenge > 0) t.einheiten.laenge_min = laenge;
      if (f.get('tag') && !t.einheiten.liste) {
        const sem = s.angebot.semester;
        t.einheiten.takt = { tag: f.get('tag'), von: sem.vorlesung.von, bis: sem.vorlesung.bis };
        delete t.einheiten.offen;
      }
    });
  } else if (art === 'takt') {
    aendern((s) => {
      const t = teilIn(s, teil);
      t.einheiten = { ...(t.einheiten || {}), takt: { tag: f.get('tag'), von: f.get('von') || s.angebot.semester.vorlesung.von, bis: s.angebot.semester.vorlesung.bis } };
      delete t.einheiten.offen;
    });
  } else if (art === 'umwidmen') {
    const stunden = Number(f.get('h'));
    if (!(stunden > 0)) return;
    aendern((s) => { s.plan.umwidmungen = [...(s.plan.umwidmungen || []), { id: neueId('u'), von: teil, nach: f.get('nach'), h: stunden }]; });
  }
}

// ── Ziehen im Raster: Block aufziehen, verschieben, länger machen ────────────────────────────────

function minutenBei(y, rect) {
  const anteil = Math.max(0, Math.min(1, (y - rect.top) / rect.height));
  return geo.h0 * 60 + Math.round((anteil * (geo.h1 - geo.h0) * 60) / RASTER_MIN) * RASTER_MIN;
}
function tagBei(x, rect) {
  const zeit = parseFloat(getComputedStyle($('raster')).gridTemplateColumns) || 44;
  const breite = (rect.width - zeit) / geo.tage;
  return Math.max(0, Math.min(geo.tage - 1, Math.floor((x - rect.left - zeit) / breite)));
}

// Blöcke werden nicht mehr gezeichnet, sondern abgelegt (V-0335, Silas: „dann soll einfach bei Block setzen quasi
// an dem Mauszeiger rangeheftet dieser Block sein und man kann den einfach irgendwo hinlegen, anstatt dass man den
// zeichnet“). „Block legen“ hängt ihn in der Länge der Vorgabe an den Zeiger (Z.legen); ein Klick legt ihn als
// Wochenblock ab, am Telefon ein Tipp. Freie Plätze stehen grün im Raster, und der Block rastet in sie ein.

/** Wo der hängende Block läge, wenn man jetzt klickte: Tag, Start, Ende — eingerastet in einen freien Platz, wenn der
 *  Zeiger in einem steht — und was ihn sperrt. */
function legenLage(tag, y, rect) {
  const d = Z.legen.dauer;
  let start = Math.round((minutenBei(y, rect) - d / 2) / RASTER_MIN) * RASTER_MIN;
  start = Math.max(geo.h0 * 60, Math.min(geo.h1 * 60 - d, start));
  const mitte = minutenBei(y, rect);
  const fenster = ((geo.frei || [])[tag] || []).find(([a, b]) => mitte >= a && mitte <= b);
  if (fenster) start = Math.max(fenster[0], Math.min(fenster[1] - d, start));
  const datum = geo.std ? null : M.plusTage(geo.woche.von, tag);
  const woechentlich = !(Z.legen.pruefung && !geo.std);
  const im = M.gesperrtDurch(Z.stand.angebot, Z.stand.plan, Z.erg, { tag, datum, start, ende: start + d, woechentlich });
  return { tag, start, ende: start + d, im, frei: !!fenster, woechentlich };
}

function legenZeigen(e) {
  if (!Z.legen || !geo) return;
  const rect = $('raster').getBoundingClientRect();
  const tag = tagBei(e.clientX, rect);
  const l = legenLage(tag, e.clientY, rect);
  const spalte = $('raster').querySelector(`.r-tag[data-tag="${tag}"]`);
  let g = $('raster').querySelector('.entwurf.legen');
  if (!g) g = h('div', { class: 'entwurf legen' });
  if (g.parentElement !== spalte) spalte.append(g);
  g.style.top = `${((l.start - geo.h0 * 60) / ((geo.h1 - geo.h0) * 60)) * 100}%`;
  g.style.height = `${((l.ende - l.start) / ((geo.h1 - geo.h0) * 60)) * 100}%`;
  g.classList.toggle('gesperrt', l.im.length > 0);
  g.textContent = l.im.length ? `gesperrt: ${l.im[0]}` : `${M.kurz(Z.erg.teile.get(Z.legen.teil).modul)} · ${zeitspanne(l.start, l.ende)}`;
}

function ablegen(tag, y, rect) {
  const l = legenLage(tag, y, rect);
  if (l.im.length) { gesperrtMelden({ tag, datum: geo.std ? null : M.plusTage(geo.woche.von, tag), start: l.start, ende: l.ende, woechentlich: l.woechentlich }); return; }
  const { teil, alle, bis } = Z.legen;
  // Prüfungsvorbereitung in einer echten Woche: genau an diesem Tag; sonst ein Wochenblock.
  const b = l.woechentlich ? { id: neueId('b'), teil, tag: M.TAGE[tag], start: M.hhmm(l.start), ende: M.hhmm(l.ende) }
    : { id: neueId('l'), teil, datum: M.plusTage(geo.woche.von, tag), start: M.hhmm(l.start), ende: M.hhmm(l.ende) };
  if (l.woechentlich && alle > 1) b.alle = alle;
  // eine Woche vor dem Ende (die Modulbeschreibung rechnet 15 Wochen, M.vorgabe) — oder der Tag vor der Prüfung
  if (l.woechentlich && bis) b.bis = bis;
  Z.legen.rest -= 1;
  const weiter = Z.legen.rest > 0;
  if (!weiter) { Z.legen = null; Z.jetzt[schritt()] = null; }
  aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), b]; });
  if (!weiter && Z.sprung) sprungEnde();
  bannerZeigen();
  const z = Z.erg.teile.get(teil);
  melden(`${M.kurz(z.modul)} · ${z.teil.titel}: ${l.woechentlich ? M.TAGE[tag] : datumMitTag(b.datum)} ${zeitspanne(l.start, l.ende)}${!l.woechentlich ? '' : alle > 1 ? `, alle ${alle} Wochen` : `, jede Woche${bis && z.teil.art === 'pruefung' ? ` bis ${M.datumKurz(bis)}` : ''}`} — damit ${M.stunden(z.ist_min)} von ${M.stunden(z.soll_min)}.${weiter ? ` Noch ${Z.legen.rest} Block${Z.legen.rest > 1 ? 'e' : ''} legen.` : ''}`);
}

function zeigerRunter(e) {
  if (e.button !== 0) return;
  const raster = $('raster');
  const rect = raster.getBoundingClientRect();
  const kachel = e.target.closest('.kachel');
  if (Z.legen) {
    // Hängt ein Block am Zeiger, legt jeder Klick ins Raster ihn ab (die Kacheln lassen den Klick durch, CSS .legen).
    if (!e.target.closest('.r-tag')) return;
    e.preventDefault();
    ablegen(tagBei(e.clientX, rect), e.clientY, rect);
    return;
  }
  if (kachel && kachel.dataset.act === 'block') return blockZiehen(e, kachel, rect);
  if (kachel && kachel.dataset.act) return; // Termine, Gruppen und Blöcke früherer Schritte sind Knöpfe (click)
  if (!e.target.closest('.r-tag')) return;
  melden(fertig() ? 'Der Stundenplan ist festgelegt. Zum Ändern oben „Stundenplan bearbeiten“.'
    : schritt() === 1 ? 'Schritt 1 ist die Grundlage — hier legst du nichts.'
      : schritt() === 2 ? 'In Schritt 2 wählst du Gruppen: links oben steht, was dran ist; die Gruppen sind im Raster gestrichelt.'
        : 'Links oben „Block legen“: Dann hängt der Block am Zeiger, und ein Klick legt ihn ab.');
}

function blockZiehen(e, kachel, rect) {
  const b = (Z.stand.plan.bloecke || []).find((x) => x.id === kachel.dataset.block);
  if (!b) return;
  if (e.pointerType === 'touch') { blockKarte(b.id, kachel, kachel.dataset.datum); return; }
  e.preventDefault();
  const griff = !!e.target.closest('[data-griff]');
  const s0 = M.min(b.start), e0 = M.min(b.ende);
  const tag0 = b.datum ? M.wochentag(b.datum) : M.TAGE.indexOf(b.tag);
  const y0 = minutenBei(e.clientY, rect);
  let neu = { start: s0, ende: e0, tag: tag0 }, bewegt = false;
  // Wohin der Block fiele — und ob dort ein Termin liegt (V-0333: dann springt er zurück).
  const ziel = (x) => ({ tag: x.tag ?? tag0, start: x.start, ende: x.ende, woechentlich: !b.datum,
    datum: b.datum ? M.plusTage(b.datum, (x.tag ?? tag0) - tag0) : geo.std ? null : M.plusTage(geo.woche.von, x.tag ?? tag0) });
  const sperre = (x) => M.gesperrtDurch(Z.stand.angebot, Z.stand.plan, Z.erg, ziel(x));
  const x0 = e.clientX, yy0 = e.clientY;
  // Ein EVL-Block ist mindestens 1,5 h lang (Silas, V-0335), alles andere mindestens eine halbe Stunde.
  const mindest = M.schrittVonBlock(b.teil ? Z.erg.teile.get(b.teil)?.teil : null) === 4 ? Z.erg.regeln.evl_min_min : RASTER_MIN * 2;
  const weiter = (ev) => {
    if (!bewegt && Math.hypot(ev.clientX - x0, ev.clientY - yy0) < 4) return;
    bewegt = true; kachel.classList.add('zieht');
    const d = minutenBei(ev.clientY, rect) - y0;
    if (griff) neu = { ...neu, ende: Math.max(s0 + mindest, Math.min(geo.h1 * 60, e0 + d)) };
    else {
      const dauer = e0 - s0;
      const s = Math.max(geo.h0 * 60, Math.min(geo.h1 * 60 - dauer, s0 + d));
      neu = { start: s, ende: s + dauer, tag: tagBei(ev.clientX, rect) };
    }
    kachel.style.top = `${((neu.start - geo.h0 * 60) / ((geo.h1 - geo.h0) * 60)) * 100}%`;
    kachel.style.height = `calc(${((neu.ende - neu.start) / ((geo.h1 - geo.h0) * 60)) * 100}% - 1px)`;
    const spalte = $('raster').querySelector(`.r-tag[data-tag="${neu.tag ?? tag0}"]`);
    if (spalte && kachel.parentElement !== spalte) spalte.append(kachel);
    const im = sperre(neu);
    kachel.classList.toggle('ziel-gesperrt', im.length > 0);
    kachel.querySelector('.k-zwei').textContent = im.length ? `gesperrt: ${im[0]}` : zeitspanne(neu.start, neu.ende);
  };
  // Nicht „fertig“ nennen: Das ist der Name von fertig() (festgelegt?) — ein gleichnamiges const hier ließ in V-0334
  // jeden Zeigerdruck mit „Cannot access 'fertig' before initialization“ abbrechen (Test „keine Schatten“).
  const loslassen = () => {
    removeEventListener('pointermove', weiter); removeEventListener('pointerup', loslassen);
    if (!bewegt) { blockKarte(b.id, kachel, kachel.dataset.datum); return; }
    if (gesperrtMelden(ziel(neu))) { rasterZeichnen(); return; }
    aendern((s) => {
      const x = s.plan.bloecke.find((y) => y.id === b.id);
      x.start = M.hhmm(neu.start); x.ende = M.hhmm(neu.ende);
      if (neu.tag != null && neu.tag !== tag0) {
        if (x.datum) x.datum = M.plusTage(x.datum, neu.tag - tag0); else x.tag = M.TAGE[neu.tag];
      }
    });
    if (Z.sprung) sprungEnde();
  };
  addEventListener('pointermove', weiter);
  addEventListener('pointerup', loslassen);
}

starten();
