// Die Seite von /silas (V-0321): Silas plant sein Fachsemester so, dass jede Stunde der Leistungspunkte
// einen festen Platz hat. Gerechnet wird in modell.mjs (docs/SILAS.md), hier wird nur gezeigt und
// bedient. Links die Module mit allen Bestandteilen (rot, was fehlt), in der Mitte die Woche
// (Standardwoche oder eine echte Woche), rechts das Unregelmäßige als Muster über das Semester.
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
  // bereich: vorlesung (Standardwoche und Wochen W01–W16) · frei (vorlesungsfreie Zeit: Lernplan) · offen (Lücken und
  // Annahmen) · erklaerung (So wird gerechnet). freiWoche: eine Woche der vorlesungsfreien Zeit im Raster.
  ansicht: { bereich: 'vorlesung', modus: 'standard', woche: null, freiWoche: null, leiste: true, wochenende: false },
  fokus: null,          // Teil-Id, dessen Karte offen ist
  setzen: null,         // Teil-Id, für den ein Block ins Raster gezogen wird
  vorschlag: null,      // { teil, bloecke } — Lernplan in der Vorschau
  hell: null,           // Vorkommen-Id, die kurz hervorgehoben wird
  rueck: [],            // Rückgängig-Stapel (JSON der vorigen Stände)
  sync: { lage: 'ruhig', zeit: null, timer: null, laeuft: false, nochmal: false },
  konflikt: null,
};

function ansichtLaden() {
  try { Object.assign(Z.ansicht, JSON.parse(ls.get(LS.ansicht) || '{}')); } catch { /* neu */ }
}
const ansichtMerken = () => ls.set(LS.ansicht, JSON.stringify(Z.ansicht));

function rechnen() {
  Z.erg = M.rechnen(Z.stand.angebot, Z.stand.plan, { heute: heute() });
  const wo = Z.erg.wochen;
  const vl = wo.filter((w) => w.art === 'vorlesung');
  if (!Z.ansicht.woche || !vl.some((w) => w.id === Z.ansicht.woche)) {
    const w = M.wocheVon(vl, heute());
    Z.ansicht.woche = (w || (heute() < vl[0].von ? vl[0] : vl[vl.length - 1])).id;
  }
  if (Z.ansicht.freiWoche && !wo.some((w) => w.id === Z.ansicht.freiWoche && w.art !== 'vorlesung')) Z.ansicht.freiWoche = null;
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
  el.className = 'sync' + (['konflikt', 'fehler', 'offline'].includes(s.lage) ? ' fehler' : s.lage === 'offen' ? ' offen' : '');
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

async function start() {
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

/** Was das Raster zeigt: die Standardwoche oder eine echte Woche (aus der Vorlesungszeit oder der freien Zeit). */
function rasterLage() {
  const b = Z.ansicht.bereich;
  if (b === 'frei') return { std: false, woche: Z.ansicht.freiWoche };
  return { std: Z.ansicht.modus === 'standard', woche: Z.ansicht.woche };
}
const zeigtRaster = () => Z.ansicht.bereich === 'vorlesung' || (Z.ansicht.bereich === 'frei' && !!Z.ansicht.freiWoche);

function zeichnen() {
  kopfZeichnen();
  moduleZeichnen();
  planKopfZeichnen();
  const r = zeigtRaster();
  $('raster-rahmen').hidden = !r; $('p-fuss').hidden = !r; $('bereich').hidden = r;
  if (r) rasterZeichnen(); else bereichZeichnen();
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
  $('k-links').replaceChildren(h('b', { text: `${s.titel} · ${s.fachsemester ? `${s.fachsemester}. Fachsemester` : ''}` }), h('span', { text: s.studiengang || '' }));
  // Silas, 11.10.: „die Zahl davor muss alles zusammengerechnet sein und dahinter muss stehen minus so und so viele
  // Stunden, die zu viel eingeplant sind.“ Also: eingeplant − zu viel = gedeckt von Soll.
  const su = Z.erg.summe;
  const anteil = su.soll_min ? su.gedeckt_min / su.soll_min : 0;
  const balken = h('div', { class: 'balken', title: `${Math.round(anteil * 100)} % gedeckt` }, h('i'), h('i', { class: 'ueber' }));
  balken.children[0].style.width = `${Math.min(100, anteil * 100)}%`;
  balken.children[1].style.left = `${Math.min(100, anteil * 100)}%`;
  balken.children[1].style.width = `${Math.min(100 - Math.min(100, anteil * 100), (su.ueber_min / su.soll_min) * 100)}%`;
  const rot = M.luecken(Z.erg).filter((f) => f.stufe !== 'hinweis').length;
  $('bilanz').replaceChildren(
    h('div', { class: 'bilanz-text' },
      h('b', {}, su.ueber_min ? h('span', { class: 'gesamt', text: `${M.stunden(su.ist_min)} − ` }) : null,
        su.ueber_min ? h('span', { class: 'zuviel', text: `${M.stunden(su.ueber_min)} zu viel` }) : null,
        su.ueber_min ? ' = ' : '', `${M.stunden(su.gedeckt_min)} von ${M.stunden(su.soll_min)}`),
      h('span', { text: su.fehlt_min ? `${M.stunden(su.fehlt_min)} haben noch keinen festen Platz` : 'alle Leistungspunkte eingeplant' })),
    balken,
    rot
      ? h('button', { class: 'zaehler rot', type: 'button', 'data-act': 'bereich', 'data-bereich': 'offen', title: 'Alle Lücken und Annahmen' }, sym('warn'), `${rot} offen`)
      : h('span', { class: 'zaehler gut' }, sym('ok'), 'fertig'),
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
function lageText(z) {
  const info = z.flags.find((f) => f.stufe === 'info');
  const plan = z.flags.find((f) => f.stufe === 'plan');
  if (plan && plan.art === 'wahl_offen') return { kl: 'rot', s: 'warn', t: 'Gruppe wählen' };
  if (info && ['termine_offen', 'datum_offen'].includes(info.art)) return { kl: 'rot', s: 'info', t: info.art === 'datum_offen' ? 'Prüfungstermin fehlt' : 'Termine fehlen' };
  if (plan && plan.art === 'konflikt') return { kl: 'rot', s: 'warn', t: 'Überschneidung' };
  if (z.fehlt_min >= Z.erg.regeln.toleranz_min) return { kl: 'rot', s: 'warn', t: z.strukturell ? `${M.stunden(z.fehlt_min)} umwidmen` : z.ist_min ? `${M.stunden(z.fehlt_min)} fehlen` : 'nicht eingeplant' };
  if (info) return { kl: 'rot', s: 'info', t: 'Angabe fehlt' };
  if (plan) return { kl: 'rot', s: 'warn', t: plan.text.split(' (')[0].slice(0, 42) };
  return null;
}

function moduleZeichnen() {
  const box = $('module');
  const oben = box.scrollTop;
  box.replaceChildren(...Z.erg.module.map(modulKarte));
  box.scrollTop = oben;
}

function modulKarte(r) {
  const m = r.modul;
  const anteil = r.soll_min ? r.gedeckt_min / r.soll_min : 0;
  const balken = h('div', { class: 'balken' }, h('i'));
  balken.firstChild.style.width = `${Math.min(100, anteil * 100)}%`;
  const offen = Z.fokus === `modul:${m.id}`;
  return h('section', { class: `modul m${m.farbe || 1}${r.rot ? ' rot' : ''}`, 'data-modul': m.id },
    h('button', { class: 'm-kopf', type: 'button', 'data-act': 'modul', 'data-modul': m.id, 'aria-expanded': String(offen) },
      h('span', { class: 'm-punkt' }), h('span', { class: 'm-name', text: M.kurz(m) }), h('span', { class: 'm-titel', text: m.titel }), h('span', { class: 'm-lp', text: `${m.lp} LP` })),
    balken,
    h('p', { class: 'm-zahl' }, h('span', { text: `${M.stunden(r.gedeckt_min)} von ${M.stunden(r.soll_min)} eingeplant` }),
      r.fehlt_min ? h('span', { class: 'fehlt', text: `${M.stunden(r.fehlt_min)} fehlen` }) : h('span', { text: 'vollständig' })),
    // Die Hinweise des Moduls (Prüfungen, Fristen) stehen ausführlich unter „Offen & Annahmen“; hier nur eine Zeile.
    (() => { const rot = r.flags.filter((f) => f.stufe !== 'hinweis'); return rot.length ? h('button', { type: 'button', class: 'm-hinweis', 'data-act': 'bereich', 'data-bereich': 'offen', title: rot.map((f) => f.text).join('\n') }, sym('info'), `${rot.length === 1 ? rot[0].text.slice(0, 70) + (rot[0].text.length > 70 ? ' …' : '') : `${rot.length} Angaben zu Prüfungen und Fristen fehlen`}`) : null; })(),
    offen ? modulDetail(r) : null,
    h('ul', { class: 'm-teile' }, ...r.teile.map((z) => h('li', {}, teilZeile(z), Z.fokus === z.teil.id ? teilKarte(z) : null))),
  );
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
  const lage = lageText(z);
  const anteil = z.soll_min ? Math.min(1, z.ist_min / z.soll_min) : 1;
  const balken = h('div', { class: 'balken' }, h('i'));
  balken.firstChild.style.width = `${anteil * 100}%`;
  const hatTermin = t.art === 'praesenz';
  return h('button', {
    class: `teil${Z.fokus === t.id ? ' fokus' : ''}`, type: 'button', 'data-act': 'teil', 'data-teil': t.id, 'data-status': z.status,
    'aria-expanded': String(Z.fokus === t.id),
  },
  h('span', { class: `t-sym${hatTermin && !z.vk.length ? ' leer' : ''}`, title: { praesenz: 'Termin der Lehrveranstaltung', video: 'Video', selbst: 'Selbststudium', pruefung: 'Prüfungsvorbereitung' }[t.art] }, sym(M.istWahl(t) ? 'gruppen' : ART_SYM[t.art])),
  h('span', { class: 't-text' },
    h('span', { class: 't-name', text: t.titel }),
    h('span', { class: 't-form', text: formText(z) }),
    lage ? h('span', { class: `t-lage ${lage.kl}` }, sym(lage.s), lage.t) : null),
  h('span', { class: `t-stand${z.fehlt_min >= 15 ? ' rot' : ''}` }, h('span', { text: `${M.stunden(z.ist_min).replace(' h', '')}/${M.stunden(z.soll_min)}` }), balken),
  );
}

function teilKarte(z) {
  const t = z.teil;
  const k = h('div', { class: 't-karte' });
  k.append(h('div', { class: 't-flaggen' }, ...z.flags.map((f) => h('div', { class: `flagge f-${f.stufe}` }, sym(f.stufe === 'hinweis' ? 'info' : f.stufe === 'info' ? 'info' : 'warn'), h('span', { text: f.text })))));
  k.append(h('p', { class: 't-zahlen', text: `Soll ${M.stunden(z.soll_min)}${z.soll_min !== z.soll_orig_min ? ` (umgewidmet, vorher ${M.stunden(z.soll_orig_min)})` : ''} · eingeplant ${M.stunden(z.ist_min)}${z.ueber_min ? ` · ${M.stunden(z.ueber_min)} zu viel` : ''}` }));
  k.append(herkunftEl(z));
  if (z.einheiten && z.einheiten.length) k.append(einheitenEl(z));
  const akt = h('div', { class: 't-aktionen' });
  k.append(akt);

  if (t.art !== 'praesenz') {
    const an = Z.setzen === t.id;
    akt.append(h('button', { class: `knopf klein${an ? ' an' : ''}`, type: 'button', 'data-act': 'setzen', 'data-teil': t.id }, sym('plus'), an ? 'Block setzen: ins Raster ziehen' : 'Block setzen'));
  }
  if (M.istWahl(t) && (t.optionen || []).length) {
    akt.append(h('span', { class: 't-zahlen', text: 'Die Gruppen stehen gestrichelt im Raster — klicken zum Wählen.' }));
    const gew = Z.stand.plan.wahl?.[t.id];
    if (gew) akt.append(h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'abwaehlen', 'data-teil': t.id, text: 'Wahl aufheben' }));
  }
  if (t.art === 'pruefung' && z.pruefung) {
    const datiert = (z.pruefung.termine || []).filter((x) => M.istDatum(x.datum));
    if (datiert.length > 1) {
      const wahl = (Z.stand.plan.pruefungstermin || {})[z.pruefung.id];
      k.append(h('div', { class: 'termin-wahl' }, h('span', { class: 't-zahlen', text: 'Welchen Termin schreibst du? Die Vorbereitung zählt bis dahin.' }),
        ...datiert.map((x) => h('button', { type: 'button', class: `knopf klein${(wahl ? wahl === x.datum : x === z.pruefungstermin) ? ' an' : ''}`, 'data-act': 'pruefung-wahl', 'data-pruefung': z.pruefung.id, 'data-datum': x.datum, title: [x.ort, x.quelle].filter(Boolean).join(' · ') },
          `${x.label ? `${x.label}: ` : ''}${datumMitTag(x.datum)}${x.start ? ` ${x.start}` : ''}`))));
    }
  }
  if (t.art === 'pruefung' && z.pruefungstermin && z.fehlt_min > 0) {
    akt.append(h('button', { class: 'knopf klein', type: 'button', 'data-act': 'lernplan', 'data-teil': t.id, text: 'Lernplan vorschlagen' }));
  }
  if ((Z.stand.plan.bloecke || []).some((b) => b.teil === t.id && b.lernplan)) {
    akt.append(h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'lernplan-weg', 'data-teil': t.id, text: 'Lernplan entfernen' }));
  }
  if (Z.vorschlag && Z.vorschlag.teil === t.id) k.append(vorschlagFormular(z));
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

function vorschlagFormular(z) {
  const b = Z.vorschlag.bloecke;
  const summe = b.reduce((s, x) => s + M.min(x.ende) - M.min(x.start), 0);
  return h('div', { class: 'formular' },
    h('p', { class: 'satz', text: b.length ? `${b.length} Lerntage, zusammen ${M.stunden(summe)} — rückwärts vom Tag vor der Prüfung (der bleibt frei), je Tag die größte Lücke, Sonntage frei. Im Raster gestrichelt.` : 'Keine freie Lücke gefunden.' }),
    h('div', { class: 'vorschau-liste breit' }, ...b.map((x) => h('span', { text: `${datumMitTag(x.datum)} ${x.start}–${x.ende}` }))),
    h('div', { class: 'zeile' },
      h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'vorschlag-weg', text: 'Verwerfen' }),
      b.length ? h('button', { class: 'knopf klein haupt', type: 'button', 'data-act': 'vorschlag-ja', text: 'Übernehmen' }) : null),
  );
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
  if (t.art === 'pruefung' && z.pruefung) {
    // Je Termin der Prüfung ein Formular (Erst-, Zweit-, Alternativtermin), auch für Termine ohne Datum.
    const termine = (z.pruefung.termine || []).length ? z.pruefung.termine : [{ label: '1. Termin' }];
    const fehlt = termine.some((x) => !x.datum || !x.start || x.offen);
    const formulare = termine.map((x, i) => h('form', { class: 'formular', 'data-form': 'pruefung', 'data-teil': t.id, 'data-index': String(i) },
      h('p', { class: 'satz' }, h('b', { text: `${z.pruefung.titel}${x.label ? ` · ${x.label}` : ''}` }), x.offen ? h('span', { class: 'rot-text', text: ` — ${x.offen}` }) : null),
      h('label', {}, 'Datum', h('input', { name: 'datum', type: 'date', value: x.datum || '' })),
      h('label', {}, 'Ort', h('input', { name: 'ort', value: x.ort || '' })),
      h('label', {}, 'von', h('input', { name: 'start', type: 'time', value: x.start || '' })),
      h('label', {}, 'bis', h('input', { name: 'ende', type: 'time', value: x.ende || '' })),
      h('div', { class: 'zeile' }, h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Eintragen' }))));
    aus.push(klappe('Prüfungstermine bearbeiten', h('div', { class: 'formulare' }, ...formulare), fehlt));
  }
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

// ── Mitte: Kopf der Woche ────────────────────────────────────────────────────────────────────────

const BEREICHE = [['vorlesung', 'Vorlesungszeit'], ['frei', 'Vorlesungsfreie Zeit'], ['offen', 'Offen & Annahmen'], ['erklaerung', 'So wird gerechnet']];

function planKopfZeichnen() {
  const wo = Z.erg.wochen;
  const b = Z.ansicht.bereich;
  const rot = M.luecken(Z.erg).filter((f) => f.stufe !== 'hinweis').length;
  const reiter = h('div', { class: 'reiter', role: 'tablist', 'aria-label': 'Bereich' },
    ...BEREICHE.map(([id, text]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(b === id), 'data-act': 'bereich', 'data-bereich': id },
      text, id === 'offen' && rot ? h('span', { class: 'zahl', text: String(rot) }) : null)));
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
  if (b === 'vorlesung') {
    const std = Z.ansicht.modus === 'standard';
    const w = wo.find((x) => x.id === Z.ansicht.woche);
    if (std) titel.append(h('b', { text: 'Standardwoche' }), h('span', { text: `jede Vorlesungswoche · Soll ≈ ${M.stunden(Z.erg.summe.woche_min)}` }));
    else {
      const z = M.woche(Z.erg, w.id);
      titel.append(h('b', { text: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}` }),
        h('span', { text: `Vorlesungswoche ${w.nr} · ${M.stunden(z.belegt_min)} belegt, davon ${M.stunden(z.ects_min)} für Leistungspunkte` }));
    }
    dazu(titel, rueck,
      h('div', { class: 'umschalter', role: 'group', 'aria-label': 'Ansicht' },
        h('button', { type: 'button', 'aria-pressed': String(std), 'data-act': 'modus', 'data-modus': 'standard', text: 'Standardwoche' }),
        h('button', { type: 'button', 'aria-pressed': String(!std), 'data-act': 'modus', 'data-modus': 'woche', text: 'Echte Woche' })),
      nav(wo.filter((x) => x.art === 'vorlesung'), Z.ansicht.woche, std));
  } else if (b === 'frei') {
    const frei = wo.filter((x) => x.art !== 'vorlesung');
    if (Z.ansicht.freiWoche) {
      const w = wo.find((x) => x.id === Z.ansicht.freiWoche);
      const z = M.woche(Z.erg, w.id);
      titel.append(h('b', { text: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}` }),
        h('span', { text: `${w.art === 'frei' ? 'Vorlesungsfrei' : 'Prüfungszeit'} · ${M.stunden(z.belegt_min)} belegt, davon ${M.stunden(z.ects_min)} für Leistungspunkte` }));
      dazu(h('button', { class: 'knopf', type: 'button', 'data-act': 'frei-uebersicht' }, sym('links'), 'Übersicht'), titel, rueck, nav(frei, Z.ansicht.freiWoche, false));
    } else {
      const ps = M.phasen(Z.erg.sem).filter((p) => p.id !== 'vorlesung');
      titel.append(h('b', { text: 'Vorlesungsfreie Zeit' }), h('span', { text: `${ps.map((p) => `${M.datumKurz(p.von)}–${M.datumKurz(p.bis)}`).join(' und ')} · Platz für die Prüfungsvorbereitung` }));
      dazu(titel, rueck);
    }
  } else if (b === 'offen') {
    titel.append(h('b', { text: 'Offen & Annahmen' }), h('span', { text: 'Was fehlt, was unsicher ist und welche Werte angenommen sind — an einem Ort' }));
    dazu(titel, rueck);
  } else {
    titel.append(h('b', { text: 'So wird gerechnet' }), h('span', { text: 'Leistungspunkte, Aufwandstabellen und die Regeln dieses Planers' }));
    dazu(titel);
  }
  $('p-kopf').replaceChildren(reiter, zeile);
}

function bannerZeigen() {
  const b = $('banner');
  if (Z.konflikt) {
    b.className = 'banner warn';
    b.replaceChildren(h('span', { text: Z.konflikt.lokal
      ? 'In diesem Browser liegen ungespeicherte Änderungen, aber der Plan wurde inzwischen woanders geändert.'
      : 'Der Plan wurde auf einem anderen Gerät geändert.' }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'neu-laden', text: 'Neuesten Stand laden' }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'ueberschreiben', text: 'Meinen behalten' }));
    b.hidden = false; return;
  }
  if (Z.setzen) {
    const z = Z.erg.teile.get(Z.setzen);
    b.className = 'banner';
    b.replaceChildren(h('span', { text: `${M.kurz(z.modul)} · ${z.teil.titel}: ${Z.ansicht.bereich === 'frei' && !Z.ansicht.freiWoche ? 'Tipp einen Tag an, um einen Lerntag zu setzen' : 'Zieh im Raster einen Block auf'}${z.fehlt_min ? ` (fehlt: ${M.stunden(z.fehlt_min)})` : ''}. ${zeigtRaster() ? (rasterLage().std ? 'Er gilt jede Vorlesungswoche.' : 'Hier fragt er, ob jede Woche oder nur an diesem Tag.') : ''}` }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'setzen-aus', text: 'Fertig' }));
    b.hidden = false; return;
  }
  b.hidden = true;
}

// ── Mitte: das Raster ────────────────────────────────────────────────────────────────────────────

/** Was das Raster gerade zeigt: Kacheln mit Tag (0–6), Start, Ende. */
function kachelnJetzt() {
  const lage = rasterLage();
  const std = lage.std;
  const out = [];
  if (std) {
    for (const k of M.standardwoche(Z.stand.angebot, Z.stand.plan, Z.erg)) out.push(k);
  } else {
    const w = Z.erg.wochen.find((x) => x.id === lage.woche);
    for (const v of Z.erg.vorkommen) {
      if (v.datum < w.von || v.datum > w.bis || v.ganztag || v.start == null || v.ende == null) continue;
      out.push({ art: v.quelle === 'block' ? 'block' : v.quelle === 'pruefung' ? 'pruefung' : v.quelle === 'termin' ? 'termin' : 'einzel', vk: [v], v, tag: M.wochentag(v.datum), start: v.start, ende: v.ende, teil: v.teil, modul: v.modul, block: v.block, schicht: v.schicht, ort: v.ort, datum: v.datum });
    }
  }
  // Gruppen des fokussierten Wahl-Teils zum Wählen (in der echten Woche nur, was in dieser Woche liegt).
  const fz = Z.fokus && Z.erg.teile.get(Z.fokus);
  if (fz && M.istWahl(fz.teil)) {
    for (const o of M.optionsKacheln(Z.stand.angebot, Z.erg, fz.teil.id)) {
      if (o.option === Z.stand.plan.wahl?.[fz.teil.id]) continue;
      if (std) out.push(o);
      else {
        const w = Z.erg.wochen.find((x) => x.id === lage.woche);
        for (const x of o.termine) if (x.datum >= w.von && x.datum <= w.bis) out.push({ ...o, tag: M.wochentag(x.datum), start: x.start, ende: x.ende, datum: x.datum });
      }
    }
  }
  if (Z.vorschlag) {
    const w = Z.erg.wochen.find((x) => x.id === lage.woche);
    for (const b of Z.vorschlag.bloecke) {
      if (std || b.datum < w.von || b.datum > w.bis) continue;
      out.push({ art: 'option', vorschlag: true, teil: b.teil, modul: Z.erg.teile.get(b.teil).modul.id, tag: M.wochentag(b.datum), start: M.min(b.start), ende: M.min(b.ende), label: 'Lernplan (Vorschlag)' });
    }
  }
  return out;
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
  const wochenende = Z.ansicht.wochenende || kacheln.some((k) => k.tag >= 5) || (!std && w.art !== 'vorlesung');
  const tage = wochenende ? 7 : 5;
  let h0 = 8, h1 = 20;
  for (const k of kacheln) { h0 = Math.min(h0, Math.floor(k.start / 60)); h1 = Math.max(h1, Math.ceil(k.ende / 60)); }
  h0 = Math.max(6, h0); h1 = Math.min(23, h1);
  geo = { h0, h1, tage, std, woche: w };
  for (const id of ['raster', 'r-kopf', 'ganztag']) $(id).style.setProperty('--tage', String(tage));
  const raster = $('raster');
  raster.style.setProperty('--stunde', `calc(100% / ${h1 - h0})`);
  raster.classList.toggle('setzen', !!Z.setzen);

  // Kopf: Tage, in der echten Woche mit Datum und Last des Tages
  const zahlen = std ? null : M.woche(Z.erg, w.id);
  const kopf = [h('div')];
  for (let d = 0; d < tage; d++) {
    const datum = std ? null : M.plusTage(w.von, d);
    const last = zahlen ? zahlen.proTag[d] : kacheln.filter((k) => k.tag === d && k.art !== 'option').reduce((s, k) => s + k.ende - k.start, 0);
    kopf.push(h('div', { class: datum === heute() ? 'heute' : '' }, M.TAGE_LANG[d],
      h('span', { class: `last${last > 10 * 60 ? ' voll' : ''}`, text: `${datum ? `${M.datumKurz(datum)} · ` : ''}${last ? M.stunden(last) : '—'}` })));
  }
  $('r-kopf').replaceChildren(...kopf);

  // Ganztägiges: Fristen, Freigaben, Rahmen, Einzeltermine ohne Ende (nur in der echten Woche)
  const gt = $('ganztag');
  if (std) gt.replaceChildren();
  else {
    const zellen = [h('div')];
    for (let d = 0; d < tage; d++) zellen.push(h('div', { class: 'gt-tag' }));
    for (const v of Z.erg.vorkommen) {
      if (!(v.ganztag || v.start == null)) continue;
      const von = v.datum < w.von ? w.von : v.datum;
      if (von > w.bis || (v.bis ? v.bis < w.von : v.datum < w.von)) continue;
      const d = M.wochentag(von);
      if (d >= tage) continue;
      const kl = v.quelle === 'pruefung' ? 'pruefung' : v.quelle === 'frist' ? `frist${v.wichtig ? ' wichtig' : ''}` : v.quelle === 'rahmen' ? 'rahmen' : '';
      const m = modulVon(v.modul);
      zellen[d + 1].append(h('span', { class: `chip ${kl}`, title: M.titelVon(v, Z.erg, Z.stand.angebot) },
        `${v.punkt != null ? `${uhr(v.punkt)} ` : ''}${m ? `${M.kurz(m)} · ` : ''}${v.titel}${v.unsicher ? ' ?' : ''}`));
    }
    // Freigaben der Videos und Einheiten in dieser Woche
    for (const z of Z.erg.teile.values()) {
      for (const e of z.einheiten || []) {
        if (e.ab < w.von || e.ab > w.bis) continue;
        const d = M.wochentag(e.ab);
        if (d < tage) zellen[d + 1].append(h('span', { class: `chip freigabe m${z.modul.farbe || 1}`, title: e.titel || '' }, `${M.kurz(z.modul)} · ${z.teil.art === 'video' ? 'Video' : 'Einheit'} ${e.nr} erscheint${e.block ? '' : ' · ohne Block'}`));
      }
    }
    gt.replaceChildren(...(zellen.slice(1).some((z) => z.childElementCount) ? zellen : []));
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
  raster.replaceChildren(zeiten, ...spaltenEl);
}

function kachelEl(k) {
  const z = k.teil ? Z.erg.teile.get(k.teil) : null;
  const m = modulVon(k.modul) || (z && z.modul);
  const fz = Z.fokus && Z.erg.teile.get(Z.fokus);
  const kl = ['kachel', m ? `m${m.farbe || 1}` : ''];
  const flags = new Set(k.vk ? k.vk.flatMap((v) => v.flags) : []);
  let titel = z ? `${M.kurz(m)} · ${z.teil.titel}` : (k.v && k.v.titel) || '';
  let zeile2 = `${zeitspanne(k.start, k.ende)}${k.ort ? ` · ${k.ort}` : ''}`;
  let marke = null, act = null;
  if (k.art === 'termin') {
    if (k.reihe && geo.std) {
      kl.push('reihe');
      const naechster = k.vk.find((v) => v.datum >= heute());
      marke = `${k.anzahl}×`;
      zeile2 = `nur ${k.anzahl}×${naechster ? ` — nächster ${M.datumKurz(naechster.datum)}` : ''}`;
    }
    if (k.v && k.v.titel) zeile2 = `${zeitspanne(k.start, k.ende)} · ${k.v.titel}`;
    if (k.schicht === 'B') { const o = z && (z.teil.optionen || []).find((x) => x.id === (k.option || (k.v && k.v.option))); if (o) zeile2 = o.label; }
    if (k.unsicher) kl.push('unsicher');
    act = 'kachel-teil';
  } else if (k.art === 'block') {
    const b = (Z.stand.plan.bloecke || []).find((x) => x.id === k.block);
    kl.push('block');
    if (!z) { kl.push('puffer'); titel = (b && b.titel) || 'Puffer'; }
    else if (b && b.titel) zeile2 = `${b.titel} · ${zeitspanne(k.start, k.ende)}`;
    if (geo.std && k.vk) {
      const zaehlt = k.vk.filter((v) => v.zaehlt_min > 0).length;
      if (z && zaehlt < k.vk.length) marke = `${zaehlt}/${k.vk.length}`;
    } else if (k.v) {
      if (k.v.flags.includes('leer')) { kl.push('zaehlt-nicht'); zeile2 = 'zählt nicht: kein Video/keine Einheit'; }
      if (k.v.flags.includes('nach_pruefung')) { kl.push('zaehlt-nicht'); zeile2 = 'zählt nicht: nach der Prüfung'; }
      if (k.v.einheit) zeile2 = `${z.teil.art === 'video' ? 'Video' : 'Einheit'} ${k.v.einheit} · ${zeile2}`;
    }
    act = 'block';
  } else if (k.art === 'option') {
    kl.push('option');
    titel = k.vorschlag ? `${M.kurz(m)} · ${z.teil.titel}` : k.label;
    zeile2 = k.vorschlag ? `Vorschlag · ${zeitspanne(k.start, k.ende)}` : `${k.reihe ? `${k.anzahl}× · ` : ''}${zeitspanne(k.start, k.ende)}`;
    if (k.kollision) marke = `${k.kollision}× belegt`;
    act = k.vorschlag ? null : 'option';
  } else if (k.art === 'pruefung') {
    kl.push('pruefung'); titel = `${M.kurz(m)} · ${k.v.titel}`;
  } else {
    kl.push('einzel'); titel = `${m ? `${M.kurz(m)} · ` : ''}${k.v.titel}`;
  }
  // In der Standardwoche färbt nur ein echter Konflikt; dass ein Wochenblock an einem Tag einem Termin
  // weicht, steht in seiner Marke (12/16) und im Hinweis am Teil — sonst wäre er für 1 von 16 Wochen rot.
  if (flags.has('konflikt')) kl.push('konflikt');
  if (flags.has('weicht') && k.art === 'block' && !geo.std) kl.push('weicht');
  // Fokus: Was nicht zum fokussierten Teil (oder Modul) gehört, tritt zurück.
  // Die Prüfung, auf die ein fokussierter Lernblock zielt, bleibt sichtbar.
  const zielPruefung = fz && k.art === 'pruefung' && k.v && fz.teil.pruefung === k.v.pruefung;
  if (fz && k.teil !== fz.teil.id && k.art !== 'option' && !zielPruefung) kl.push('blass');
  if (Z.fokus && Z.fokus.startsWith('modul:') && k.modul !== Z.fokus.slice(6)) kl.push('blass');
  if (Z.hell && k.vk && k.vk.some((v) => v.id === Z.hell)) kl.push('hell');
  const el = h(act === 'block' ? 'div' : 'button', {
    class: kl.join(' '), type: act === 'block' ? null : 'button', 'data-act': act, 'data-teil': k.teil || null,
    'data-block': k.block || null, 'data-option': k.option || null, 'data-datum': k.datum || null,
    title: [titel, zeile2, ...(k.vk || []).flatMap((v) => v.flags).filter((x, i, a) => a.indexOf(x) === i).map((f) => ({ konflikt: 'Überschneidung', weicht: 'weicht einem Termin', leer: 'kein Video in dieser Woche', nach_pruefung: 'nach der Prüfung' }[f]))].filter(Boolean).join('\n'),
    tabindex: act === 'block' ? '0' : null,
  }, h('b', { text: titel }), h('span', { text: zeile2 }), marke ? h('span', { class: `k-marke${k.kollision ? ' rot' : ''}`, text: marke }) : null);
  if (act === 'block') el.append(h('span', { class: 'k-griff', 'data-griff': '1' }));
  return el;
}

function fussZeichnen() {
  $('p-fuss').replaceChildren(
    h('span', { class: 'legende' }, h('i', { class: 'lg-a' }), 'Termin (Pflicht oder gewählt)'),
    h('span', { class: 'legende' }, h('i', { class: 'lg-r' }), 'Termin nur an einzelnen Tagen'),
    h('span', { class: 'legende' }, h('i', { class: 'lg-d' }), 'eigener Block'),
    h('span', { class: 'legende' }, h('i', { class: 'lg-o' }), 'zur Wahl'),
    h('span', { text: 'Ziehen im Raster setzt einen Block · ← → wechselt die Woche · ⌘Z macht rückgängig' }),
  );
}

// ── Mitte: die Bereiche ohne Raster ──────────────────────────────────────────────────────────────

function bereichZeichnen() {
  const b = Z.ansicht.bereich;
  const box = $('bereich');
  const oben = box.scrollTop;
  box.replaceChildren(...(b === 'frei' ? freiBoard() : b === 'offen' ? offenAnsicht() : erklaerung()));
  box.scrollTop = oben;
}

/** Die vorlesungsfreie Zeit (Silas, 11.10.: „da fallen viele Präsenztermine raus, da hat man Platz, um zu planen,
 *  wann man welche Klausurvorbereitung macht“): oben jede Prüfung mit ihrer Vorbereitung, darunter die Tage der
 *  Weihnachtspause und der Zeit nach der Vorlesung. Prüfung wählen, dann Tage antippen: jeder Tipp ein Lerntag. */
function freiBoard() {
  const aus = [];
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
        balken),
      x && z.fehlt_min ? h('button', { type: 'button', class: 'knopf klein', 'data-act': 'lernplan', 'data-teil': t.id, text: 'Vorschlagen' }) : null);
  })));
  aus.push(h('p', { class: 'satz', text: Z.setzen && Z.erg.teile.get(Z.setzen)?.teil.art === 'pruefung'
    ? 'Tipp einen Tag an: Er bekommt einen Lerntag (bis zu 6 h in der größten freien Lücke). Ein Tipp auf einen Lernblock bearbeitet ihn, ein Tipp auf die Woche öffnet sie im Raster.'
    : 'Wähle oben eine Prüfung und tipp dann die Tage an, an denen du dafür lernst. „Vorschlagen“ verteilt die fehlenden Stunden rückwärts vor die Prüfung.' }));
  const wo = Z.erg.wochen;
  for (const p of M.phasen(Z.erg.sem).filter((x) => x.id !== 'vorlesung')) {
    const wochen = wo.filter((w) => w.bis >= p.von && w.von <= p.bis);
    const kal = h('div', { class: 'kal' }, h('div', { class: 'kal-kopf' }, h('span'), ...M.TAGE.map((t) => h('span', { text: t }))));
    for (const w of wochen) {
      const zeile = h('div', { class: 'kal-zeile' },
        h('button', { type: 'button', class: 'kal-woche', 'data-act': 'frei-woche', 'data-woche': w.id, title: 'Diese Woche im Raster' }, h('b', { text: w.kurz }), h('span', { text: M.datumKurz(w.von) })));
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
          zelle.append(h('button', { type: 'button', class: `kal-block m${z ? z.modul.farbe || 1 : ''}${v.zaehlt_min ? '' : ' zaehlt-nicht'}`, 'data-act': 'frei-block', 'data-block': v.block, 'data-datum': datum, title: `${z ? `${M.kurz(z.modul)} · ${z.teil.titel}` : 'Puffer'} ${zeitspanne(v.start, v.ende)}` },
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
    aus.push(h('section', { class: 'phase' }, h('h3', {}, p.titel, h('span', { text: ` ${datumMitTag(p.von)} – ${datumMitTag(p.bis)}` })), kal));
  }
  return aus;
}

/** Einen Lerntag setzen: die größte freie Lücke des Tages im Lernfenster, höchstens ein Lerntag lang. */
function lerntagSetzen(teil, datum) {
  const l = M.freieLuecke(Z.erg, datum);
  if (!l) { alert('An diesem Tag ist im Lernfenster keine Stunde mehr frei.'); return; }
  const dauer = Math.min(Math.round(Z.erg.regeln.lerntag_h * 60), l[1] - l[0]);
  aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), { id: neueId('l'), teil, datum, start: M.hhmm(l[0]), ende: M.hhmm(l[0] + dauer), lernplan: true }]; });
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
  const gruppe = (titel, satz, eintraege, kl) => {
    const sec = h('section', { class: `offen-gruppe ${kl}` }, h('h3', {}, titel, h('span', { class: 'zahl', text: String(eintraege.length) })), h('p', { class: 'satz', text: satz }));
    if (!eintraege.length) sec.append(h('p', { class: 'satz', text: 'Nichts.' }));
    const nachModul = new Map();
    for (const f of eintraege) nachModul.set(f.modul, [...(nachModul.get(f.modul) || []), f]);
    for (const [mid, fs] of nachModul) {
      const m = modulVon(mid);
      sec.append(h('div', { class: `offen-modul m${m.farbe || 1}` }, h('h4', {}, h('span', { class: 'm-punkt' }), `${M.kurz(m)} · ${m.titel}`),
        ...fs.map((f) => {
          // Eine Angabe zur Prüfung (am Modul) führt zum Lernteil dieser Prüfung, dort stehen die Formulare.
          const ziel = f.teil || (f.pruefung && [...Z.erg.teile.values()].find((x) => x.teil.pruefung === f.pruefung)?.teil.id) || null;
          const z = ziel ? Z.erg.teile.get(ziel) : null;
          const knoepfe = [];
          if (z) knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'zum-teil', 'data-teil': ziel, text: f.stufe === 'hinweis' ? 'Ansehen' : 'Eintragen' }));
          if (!f.teil) { /* nur zum Ansehen: die Knöpfe unten ändern den Bestandteil selbst */ } else if (z && f.art === 'unsicher') knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'erledigt', 'data-teil': f.teil, 'data-feld': 'unsicher', text: 'Geprüft, stimmt' }));
          if (z && f.art === 'offen') knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'erledigt', 'data-teil': f.teil, 'data-feld': 'offen', text: 'Erledigt' }));
          if (z && f.art === 'annahme') knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'bestaetigen', 'data-id': `soll:${f.teil}`, text: 'Stimmt so' }));
          return h('div', { class: 'offen-zeile' }, h('span', { class: 'offen-wo', text: f.teil && z ? z.teil.titel : f.pruefung ? 'Prüfung' : 'Modul' }), h('span', { class: 'offen-text', text: f.text }), h('span', { class: 'offen-knoepfe' }, ...knoepfe));
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
  return [
    gruppe('Information fehlt', 'Angaben, die es noch nicht gibt oder die noch niemand eingetragen hat. „Eintragen“ öffnet den Bestandteil links mit dem Formular.', l.filter((f) => f.stufe === 'info'), 'rot'),
    gruppe('Nicht im Plan', 'Stunden ohne festen Platz, Gruppen ohne Wahl, Überschneidungen.', l.filter((f) => f.stufe === 'plan'), 'rot'),
    annahmen,
    gruppe('Unsicher und Hinweise', 'Was da ist, aber geprüft werden sollte, und was der Planer bemerkt.', l.filter((f) => f.stufe === 'hinweis' && f.art !== 'annahme'), 'gelb'),
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
    absatz('Was „eingeplant“ heißt',
      p('Eine Stunde ist eingeplant, wenn sie einen festen Platz im Kalender hat. Gezählt wird so:'),
      h('ul', { class: 'erkl-liste' },
        h('li', { text: 'Präsenz zählt über die Termine der Lehrstühle; ein c.t.-Termin (16:15–17:45) belegt die Doppelstunde = 2 h.' }),
        h('li', { text: 'Gruppen (Tutorium, Übung) zählen, sobald du eine gewählt hast.' }),
        h('li', { text: `Videos zählen über deine Blöcke, aber erst ab ihrer Freigabe; eine Woche braucht die Länge ihrer Videos plus ${Z.erg.regeln.video_puffer_min} min Puffer, aufgerundet auf ${Z.erg.regeln.raster_min} min (1:45 → 2 h).` }),
        h('li', { text: 'Nachbereitung, Labs, Quizze zählen über deine Blöcke (Wochenblöcke nur in Vorlesungswochen).' }),
        h('li', { text: 'Prüfungsvorbereitung zählt nur vor der Prüfung.' }),
        h('li', { text: 'Überlappt ein Block einen Termin, zählt nur der freie Teil. Zu viel bei einem Bestandteil gleicht zu wenig bei einem anderen nicht aus.' }),
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
  box.replaceChildren(kopf,
    h('p', { class: 'l-satz t-zahlen', text: 'Jede Spalte eine Woche, jede Zeile ein Bestandteil — Termine gefüllt, eigene Blöcke schraffiert. Ein Klick auf eine Zelle zeigt die Woche, einer auf den Namen wählt den Bestandteil.' }),
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
      const name = t.art === 'teil' ? t.z.teil.titel : t.offen ? `${t.name} · offen` : t.name;
      const zeile = h('div', { class: `mu-zeile m${m.farbe || 1}${gewaehlt ? ' gewaehlt' : ''}${blass ? ' blass' : ''}${t.art === 'teil' && t.z.rot ? ' rot' : ''}` },
        t.art === 'teil'
          ? h('button', { type: 'button', class: 'mu-name', 'data-act': 'teil', 'data-teil': t.z.teil.id, title: `${t.z.teil.titel} — ${M.stunden(t.z.ist_min)} von ${M.stunden(t.z.soll_min)}` }, name)
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
  k.replaceChildren(...inhalt);
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

/** Wofür ist dieser neue Block? Die Teile, die noch Stunden brauchen, zuerst. */
function wofuerKarte(entwurf, nahe) {
  const kandidaten = [...Z.erg.teile.values()].filter((z) => z.teil.art !== 'praesenz').sort((a, b) => b.fehlt_min - a.fehlt_min);
  const liste = h('div', { class: 'wahl-liste' },
    ...kandidaten.map((z) => h('button', { type: 'button', class: `m${z.modul.farbe || 1}`, onclick: () => { karteSchliessen(false); blockAnlegen({ ...entwurf, teil: z.teil.id }); } },
      h('span', { class: 'm-punkt' }), h('span', { text: `${M.kurz(z.modul)} · ${z.teil.titel}` }), h('span', { class: z.fehlt_min ? '' : 'grau', text: z.fehlt_min ? `fehlt ${M.stunden(z.fehlt_min)}` : 'gedeckt' }))),
    h('button', { type: 'button', onclick: () => { karteSchliessen(false); blockAnlegen({ ...entwurf, teil: null, titel: 'Puffer' }); } },
      h('span', { class: 'm-punkt' }), h('span', { text: 'Puffer / Organisation (zählt nicht für LP)' }), h('span')));
  karteOeffnen([h('h3', {}, `Block ${datumOderTag(entwurf)} ${zeitspanne(entwurf.start, entwurf.ende)}`), h('p', { class: 'satz', text: 'Wofür ist diese Zeit?' }), liste], nahe, () => rasterZeichnen());
}
const datumOderTag = (e) => e.datum ? datumMitTag(e.datum) : M.TAGE_LANG[e.tag];

/** Einen Block anlegen. In der echten Vorlesungswoche fragt er: jede Woche oder nur an diesem Tag. */
function blockAnlegen(e, nahe) {
  const w = geo.woche;
  const z = e.teil ? Z.erg.teile.get(e.teil) : null;
  const machen = (woechentlich) => {
    const b = { id: neueId('b'), teil: e.teil || null, start: M.hhmm(e.start), ende: M.hhmm(e.ende) };
    if (e.titel) b.titel = e.titel;
    if (woechentlich) b.tag = M.TAGE[e.tag]; else b.datum = e.datum;
    aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), b]; });
  };
  if (geo.std) return machen(true);
  if (w.art !== 'vorlesung' || (z && z.teil.art === 'pruefung')) return machen(false);
  karteOeffnen([
    h('h3', { text: `${z ? `${M.kurz(z.modul)} · ${z.teil.titel}` : 'Puffer'} · ${zeitspanne(e.start, e.ende)}` }),
    h('div', { class: 'zeile' },
      h('button', { class: 'knopf', type: 'button', onclick: () => { karteSchliessen(false); machen(false); }, text: `Nur ${datumMitTag(e.datum)}` }),
      h('button', { class: 'knopf haupt', type: 'button', onclick: () => { karteSchliessen(false); machen(true); }, text: `Jeden ${M.TAGE_LANG[e.tag]}` })),
  ], nahe, () => rasterZeichnen());
}

function blockKarte(blockId, nahe, datum) {
  const b = (Z.stand.plan.bloecke || []).find((x) => x.id === blockId);
  if (!b) return;
  const z = b.teil ? Z.erg.teile.get(b.teil) : null;
  const vk = Z.erg.vorkommen.filter((v) => v.block === b.id);
  const zaehlt = vk.reduce((s, v) => s + v.zaehlt_min, 0);
  const diese = datum ? vk.find((v) => v.datum === datum) : null;
  const teile = [...Z.erg.teile.values()].filter((x) => x.teil.art !== 'praesenz');
  const form = h('form', { class: 'formular' },
    h('label', { class: 'breit' }, 'Wofür', h('select', { name: 'teil' },
      h('option', { value: '', text: 'Puffer / Organisation', selected: !b.teil }),
      ...teile.map((x) => h('option', { value: x.teil.id, selected: x.teil.id === b.teil, text: `${M.kurz(x.modul)} · ${x.teil.titel}` })))),
    !b.teil ? h('label', { class: 'breit' }, 'Titel', h('input', { name: 'titel', value: b.titel || '' })) : null,
    b.datum
      ? h('label', { class: 'breit' }, 'Datum', h('input', { name: 'datum', type: 'date', value: b.datum }))
      : h('label', {}, 'Wochentag', h('select', { name: 'tag' }, ...M.TAGE.map((x) => h('option', { value: x, selected: x === b.tag, text: M.TAGE_LANG[M.TAGE.indexOf(x)] })))),
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
      }
    });
  });
  karteOeffnen([h('h3', {}, z ? `${M.kurz(z.modul)} · ${z.teil.titel}` : (b.titel || 'Puffer'), h('span', { class: 't-zahlen', text: b.datum ? 'einmal' : 'jede Vorlesungswoche' })), form], nahe);
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

// ── Bedienung ────────────────────────────────────────────────────────────────────────────────────

function fokussieren(teilId) {
  Z.fokus = Z.fokus === teilId ? null : teilId;
  Z.vorschlag = null;
  const z = Z.fokus && Z.erg.teile.get(Z.fokus);
  Z.setzen = null;
  // Gruppen zeigt die Standardwoche am besten; Lernpläne vor einer Prüfung die echte Woche.
  if (z && M.istWahl(z.teil) && (z.teil.optionen || []).length && Z.ansicht.bereich === 'vorlesung' && Z.ansicht.modus !== 'standard' && !(z.teil.optionen || []).some((o) => M.muster(o).some((x) => x.typ === 'reihe'))) Z.ansicht.modus = 'standard';
  zeichnen(); bannerZeigen();
}

/** Eine echte Woche zeigen — eine Vorlesungswoche im Bereich Vorlesungszeit, sonst in der vorlesungsfreien Zeit. */
function zurWoche(id, hell) {
  const w = Z.erg.wochen.find((x) => x.id === id);
  if (!w) return;
  if (w.art === 'vorlesung') { Z.ansicht.bereich = 'vorlesung'; Z.ansicht.modus = 'woche'; Z.ansicht.woche = id; }
  else { Z.ansicht.bereich = 'frei'; Z.ansicht.freiWoche = id; }
  ansichtMerken();
  Z.hell = hell || null;
  zeichnen();
  if (hell) setTimeout(() => { if (Z.hell === hell) { Z.hell = null; if (zeigtRaster()) rasterZeichnen(); } }, 2400);
}

function wocheSchritt(n) {
  const b = Z.ansicht.bereich;
  if (b === 'vorlesung') {
    const wo = Z.erg.wochen.filter((w) => w.art === 'vorlesung');
    if (Z.ansicht.modus === 'standard') Z.ansicht.modus = 'woche';
    else {
      const i = wo.findIndex((w) => w.id === Z.ansicht.woche);
      Z.ansicht.woche = wo[Math.max(0, Math.min(wo.length - 1, i + n))].id;
    }
  } else if (b === 'frei' && Z.ansicht.freiWoche) {
    const wo = Z.erg.wochen.filter((w) => w.art !== 'vorlesung');
    const i = wo.findIndex((w) => w.id === Z.ansicht.freiWoche);
    Z.ansicht.freiWoche = wo[Math.max(0, Math.min(wo.length - 1, i + n))].id;
  } else return;
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
      case 'modul': Z.fokus = Z.fokus === `modul:${el.dataset.modul}` ? null : `modul:${el.dataset.modul}`; zeichnen(); break;
      case 'modus': Z.ansicht.bereich = 'vorlesung'; Z.ansicht.modus = el.dataset.modus; ansichtMerken(); zeichnen(); break;
      case 'bereich': Z.ansicht.bereich = el.dataset.bereich; ansichtMerken(); zeichnen(); bannerZeigen(); $('bereich').scrollTop = 0; break;
      case 'frei-uebersicht': Z.ansicht.freiWoche = null; ansichtMerken(); zeichnen(); break;
      case 'frei-woche': Z.ansicht.freiWoche = el.dataset.woche; ansichtMerken(); zeichnen(); break;
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
        aendern((s) => { s.plan.wahl = { ...(s.plan.wahl || {}), [teil]: el.dataset.option }; });
        if (t) { Z.fokus = null; zeichnen(); }
        break;
      }
      case 'abwaehlen': aendern((s) => { const w = { ...(s.plan.wahl || {}) }; delete w[teil]; s.plan.wahl = w; }); break;
      case 'kachel-teil': if (teil) { Z.fokus = teil; zeichnen(); document.querySelector(`[data-teil="${teil}"].teil`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } break;
      case 'lernplan': {
        Z.fokus = teil;
        Z.vorschlag = { teil, bloecke: M.lernplanVorschlag(Z.erg, teil) };
        if (Z.vorschlag.bloecke.length) zurWoche(M.montagVon(Z.vorschlag.bloecke[Z.vorschlag.bloecke.length - 1].datum)); else zeichnen();
        break;
      }
      case 'vorschlag-weg': Z.vorschlag = null; zeichnen(); break;
      case 'vorschlag-ja': {
        const v = Z.vorschlag; Z.vorschlag = null;
        aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), ...v.bloecke.map((b) => ({ id: neueId('l'), teil: b.teil, datum: b.datum, start: b.start, ende: b.ende, lernplan: true }))]; });
        break;
      }
      case 'lernplan-weg': aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((b) => !(b.teil === teil && b.lernplan)); }); break;
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
    if (e.key === 'Escape') { if (!$('karte').hidden) karteSchliessen(); else if (Z.setzen || Z.fokus || Z.vorschlag) { Z.setzen = null; Z.fokus = null; Z.vorschlag = null; zeichnen(); bannerZeigen(); } return; }
    if (inFeld) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); rueckgaengig(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (!$('karte').hidden || !zeigtRaster()) return; e.preventDefault(); wocheSchritt(e.key === 'ArrowLeft' ? -1 : 1); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement?.dataset?.block) {
      const id = document.activeElement.dataset.block;
      aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((x) => x.id !== id); });
    }
  });
  $('raster').addEventListener('pointerdown', zeigerRunter);
  setInterval(() => { if (zeigtRaster() && !rasterLage().std) rasterZeichnen(); }, 60_000);
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

function zeigerRunter(e) {
  if (e.button !== 0) return;
  const raster = $('raster');
  const rect = raster.getBoundingClientRect();
  const kachel = e.target.closest('.kachel');
  if (kachel && kachel.dataset.act === 'block') return blockZiehen(e, kachel, rect);
  if (kachel) return; // Termine und Gruppen sind Knöpfe (click)
  const spalte = e.target.closest('.r-tag');
  if (!spalte) return;
  const tag = Number(spalte.dataset.tag);
  const start0 = minutenBei(e.clientY, rect);
  const datum = geo.std ? null : M.plusTage(geo.woche.von, tag);
  const standardDauer = () => {
    const z = Z.setzen && Z.erg.teile.get(Z.setzen);
    if (z && z.teil.art === 'video') { const e2 = z.teil.einheiten || {}; return M.videoBlockMin(e2.laenge_min || e2.annahme_min || 90, Z.erg.regeln); }
    return 90;
  };
  // Am Telefon wird nicht gezogen (das Raster scrollt); ein Tipp legt einen Block mit Standardlänge an.
  if (e.pointerType === 'touch') {
    const s = Math.floor(start0 / 30) * 30;
    const entwurf = { tag, datum, start: s, ende: Math.min(geo.h1 * 60, s + standardDauer()) };
    if (Z.setzen) blockAnlegen({ ...entwurf, teil: Z.setzen }, { left: e.clientX, right: e.clientX, top: e.clientY });
    else wofuerKarte(entwurf, { left: e.clientX, right: e.clientX, top: e.clientY });
    return;
  }
  e.preventDefault();
  const ent = h('div', { class: 'entwurf' });
  spalte.append(ent);
  let ende = start0 + RASTER_MIN;
  const malen = () => {
    const a = Math.min(start0, ende), b = Math.max(start0, ende);
    ent.style.top = `${((a - geo.h0 * 60) / ((geo.h1 - geo.h0) * 60)) * 100}%`;
    ent.style.height = `${((b - a) / ((geo.h1 - geo.h0) * 60)) * 100}%`;
    ent.textContent = zeitspanne(a, b);
  };
  malen();
  let bewegt = false;
  const weiter = (ev) => { const m = minutenBei(ev.clientY, rect); if (m !== ende) { bewegt = true; ende = m; malen(); } };
  const fertig = (ev) => {
    removeEventListener('pointermove', weiter); removeEventListener('pointerup', fertig);
    let a = Math.min(start0, ende), b = Math.max(start0, ende);
    if (!bewegt || b - a < RASTER_MIN * 2) { a = Math.floor(start0 / 30) * 30; b = Math.min(geo.h1 * 60, a + standardDauer()); }
    const entwurf = { tag, datum, start: a, ende: b };
    const nahe = { left: ev.clientX, right: ev.clientX + 4, top: ev.clientY, bottom: ev.clientY };
    if (Z.setzen) { ent.remove(); blockAnlegen({ ...entwurf, teil: Z.setzen }, nahe); }
    else wofuerKarte(entwurf, nahe);
  };
  addEventListener('pointermove', weiter);
  addEventListener('pointerup', fertig);
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
  const x0 = e.clientX, yy0 = e.clientY;
  const weiter = (ev) => {
    if (!bewegt && Math.hypot(ev.clientX - x0, ev.clientY - yy0) < 4) return;
    bewegt = true; kachel.classList.add('zieht');
    const d = minutenBei(ev.clientY, rect) - y0;
    if (griff) neu = { ...neu, ende: Math.max(s0 + RASTER_MIN * 2, Math.min(geo.h1 * 60, e0 + d)) };
    else {
      const dauer = e0 - s0;
      const s = Math.max(geo.h0 * 60, Math.min(geo.h1 * 60 - dauer, s0 + d));
      neu = { start: s, ende: s + dauer, tag: tagBei(ev.clientX, rect) };
    }
    kachel.style.top = `${((neu.start - geo.h0 * 60) / ((geo.h1 - geo.h0) * 60)) * 100}%`;
    kachel.style.height = `calc(${((neu.ende - neu.start) / ((geo.h1 - geo.h0) * 60)) * 100}% - 1px)`;
    const ziel = $('raster').querySelector(`.r-tag[data-tag="${neu.tag ?? tag0}"]`);
    if (ziel && kachel.parentElement !== ziel) ziel.append(kachel);
    kachel.querySelector('span').textContent = zeitspanne(neu.start, neu.ende);
  };
  const fertig = () => {
    removeEventListener('pointermove', weiter); removeEventListener('pointerup', fertig);
    if (!bewegt) { blockKarte(b.id, kachel, kachel.dataset.datum); return; }
    aendern((s) => {
      const x = s.plan.bloecke.find((y) => y.id === b.id);
      x.start = M.hhmm(neu.start); x.ende = M.hhmm(neu.ende);
      if (neu.tag != null && neu.tag !== tag0) {
        if (x.datum) x.datum = M.plusTage(x.datum, neu.tag - tag0); else x.tag = M.TAGE[neu.tag];
      }
    });
  };
  addEventListener('pointermove', weiter);
  addEventListener('pointerup', fertig);
}

start();
