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
  ansicht: { modus: 'standard', woche: null, leiste: true, wochenende: false },
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
  if (!Z.ansicht.woche || !wo.some((w) => w.id === Z.ansicht.woche)) {
    const w = M.wocheVon(wo, heute());
    Z.ansicht.woche = (w || (heute() < wo[0].von ? wo[0] : wo[wo.length - 1])).id;
  }
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

function zeichnen() {
  kopfZeichnen();
  moduleZeichnen();
  planKopfZeichnen();
  rasterZeichnen();
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
  const su = Z.erg.summe;
  const anteil = su.soll_min ? su.gedeckt_min / su.soll_min : 0;
  const balken = h('div', { class: 'balken', title: `${Math.round(anteil * 100)} %` }, h('i'));
  balken.firstChild.style.width = `${Math.min(100, anteil * 100)}%`;
  $('bilanz').replaceChildren(
    h('div', { class: 'bilanz-text' },
      h('b', { text: `${M.stunden(su.gedeckt_min)} von ${M.stunden(su.soll_min)}` }),
      h('span', { text: su.fehlt_min ? `${M.stunden(su.fehlt_min)} ohne festen Platz` : 'alle Leistungspunkte eingeplant' })),
    balken,
    su.offen
      ? h('button', { class: 'zaehler rot', type: 'button', 'data-act': 'erste-luecke', title: 'Zum ersten roten Bestandteil' }, sym('warn'), `${su.offen} offen`)
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
    ...r.flags.filter((f) => f.stufe !== 'hinweis').map((f) => h('p', { class: 'm-hinweis' }, f.text)),
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
  const posten = z.posten ? `${z.posten.titel}${z.posten.mult > 1 ? ` (${z.posten.mult} × ${String(z.posten.h).replace('.', ',')} h)` : ''}` : '';
  k.append(h('p', { class: 't-zahlen', text: `Soll ${M.stunden(z.soll_min)}${z.soll_min !== z.soll_orig_min ? ` (umgewidmet, vorher ${M.stunden(z.soll_orig_min)})` : ''} · eingeplant ${M.stunden(z.ist_min)} · ${posten}` }));
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
  if (t.art === 'pruefung' && z.pruefung && (!z.pruefungstermin || !z.pruefungstermin.start)) {
    const x = z.pruefungstermin || {};
    aus.push(h('form', { class: 'formular', 'data-form': 'pruefung', 'data-teil': t.id },
      h('p', { class: 'satz', text: `${z.pruefung.titel}: Termin eintragen` }),
      h('label', {}, 'Datum', h('input', { name: 'datum', type: 'date', value: x.datum || '' })),
      h('label', {}, 'Ort', h('input', { name: 'ort', value: x.ort || '' })),
      h('label', {}, 'von', h('input', { name: 'start', type: 'time', value: x.start || '' })),
      h('label', {}, 'bis', h('input', { name: 'ende', type: 'time', value: x.ende || '' })),
      h('div', { class: 'zeile' }, h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Eintragen' }))));
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

function planKopfZeichnen() {
  const wo = Z.erg.wochen;
  const w = wo.find((x) => x.id === Z.ansicht.woche);
  const std = Z.ansicht.modus === 'standard';
  const titel = h('div', { class: 'p-titel' });
  if (std) {
    titel.append(h('b', { text: 'Standardwoche' }), h('span', { text: `jede Vorlesungswoche · Soll ≈ ${M.stunden(Z.erg.summe.woche_min)}` }));
  } else {
    const z = M.woche(Z.erg, w.id);
    const art = { vorlesung: `Vorlesungswoche ${w.nr}`, frei: 'Vorlesungsfrei', pruefung: 'Prüfungszeit' }[w.art];
    titel.append(h('b', { text: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}` }),
      h('span', { text: `${art} · ${M.stunden(z.belegt_min)} belegt, davon ${M.stunden(z.ects_min)} für Leistungspunkte` }));
  }
  const sel = h('select', { 'aria-label': 'Woche', 'data-act': 'woche-waehlen' },
    ...wo.map((x) => h('option', { value: x.id, selected: x.id === Z.ansicht.woche && !std, text: `${x.kurz} · ${M.datumKurz(x.von)}` })));
  if (std) sel.prepend(h('option', { value: '', selected: true, text: 'Woche …' }));
  const kn = [
    titel,
    Z.rueck.length ? h('button', { class: 'knopf leise', type: 'button', 'data-act': 'rueck', title: 'Rückgängig (⌘Z)' }, sym('zurueck'), 'Rückgängig') : null,
    h('div', { class: 'umschalter', role: 'group', 'aria-label': 'Ansicht' },
      h('button', { type: 'button', 'aria-pressed': String(std), 'data-act': 'modus', 'data-modus': 'standard', text: 'Standardwoche' }),
      h('button', { type: 'button', 'aria-pressed': String(!std), 'data-act': 'modus', 'data-modus': 'woche', text: 'Echte Woche' })),
    h('div', { class: 'p-nav' },
      h('button', { class: 'knopf rund', type: 'button', 'data-act': 'woche-vor', 'data-schritt': '-1', 'aria-label': 'Vorige Woche', disabled: !std && wo[0].id === w.id }, sym('links')),
      sel,
      h('button', { class: 'knopf rund', type: 'button', 'data-act': 'woche-vor', 'data-schritt': '1', 'aria-label': 'Nächste Woche', disabled: !std && wo[wo.length - 1].id === w.id }, sym('rechts'))),
  ];
  $('p-kopf').replaceChildren(...kn.filter(Boolean));
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
    b.replaceChildren(h('span', { text: `${M.kurz(z.modul)} · ${z.teil.titel}: Zieh im Raster einen Block auf${z.fehlt_min ? ` (fehlt: ${M.stunden(z.fehlt_min)})` : ''}. ${Z.ansicht.modus === 'standard' ? 'Er gilt jede Vorlesungswoche.' : 'Hier fragt er, ob jede Woche oder nur an diesem Tag.'}` }),
    h('button', { class: 'knopf', type: 'button', 'data-act': 'setzen-aus', text: 'Fertig' }));
    b.hidden = false; return;
  }
  b.hidden = true;
}

// ── Mitte: das Raster ────────────────────────────────────────────────────────────────────────────

/** Was das Raster gerade zeigt: Kacheln mit Tag (0–6), Start, Ende. */
function kachelnJetzt() {
  const std = Z.ansicht.modus === 'standard';
  const out = [];
  if (std) {
    for (const k of M.standardwoche(Z.stand.angebot, Z.stand.plan, Z.erg)) out.push(k);
  } else {
    const w = Z.erg.wochen.find((x) => x.id === Z.ansicht.woche);
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
        const w = Z.erg.wochen.find((x) => x.id === Z.ansicht.woche);
        for (const x of o.termine) if (x.datum >= w.von && x.datum <= w.bis) out.push({ ...o, tag: M.wochentag(x.datum), start: x.start, ende: x.ende, datum: x.datum });
      }
    }
  }
  if (Z.vorschlag) {
    const w = Z.erg.wochen.find((x) => x.id === Z.ansicht.woche);
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
  const std = Z.ansicht.modus === 'standard';
  const w = Z.erg.wochen.find((x) => x.id === Z.ansicht.woche);
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
    if (k.reihe && Z.ansicht.modus === 'standard') {
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
    if (Z.ansicht.modus === 'standard' && k.vk) {
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
  if (flags.has('weicht') && k.art === 'block' && Z.ansicht.modus !== 'standard') kl.push('weicht');
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

// ── Rechts: das Unregelmäßige ────────────────────────────────────────────────────────────────────

function leisteZeichnen() {
  const box = $('leiste');
  const oben = box.scrollTop;
  const kopf = h('div', { class: 'l-kopf' },
    h('h2', { text: 'Unregelmäßig' }),
    h('button', { class: 'knopf rund leise l-zu', type: 'button', 'data-act': 'leiste', 'aria-label': Z.ansicht.leiste ? 'Leiste einklappen' : 'Leiste ausklappen', title: 'Leiste ein-/ausklappen' }, sym('leiste')));
  box.replaceChildren(kopf, h('p', { class: 'l-satz t-zahlen', text: 'Termine ohne festen Wochentakt, Prüfungen, Fristen und Freigaben — über das ganze Semester. Ein Klick auf eine Woche zeigt sie.' }), musterEl(), chronikEl());
  box.scrollTop = oben;
}

/** Zeilen der Muster-Matrix: je Modul die Dinge, die nicht jede Woche gleich sind. */
function musterZeilen() {
  const zeilen = [];
  const wo = Z.erg.wochen;
  const idx = (d) => wo.findIndex((w) => d >= w.von && d <= w.bis);
  for (const r of Z.erg.module) {
    const m = r.modul, gruppe = [];
    for (const z of r.teile) {
      const t = z.teil;
      if (t.art === 'praesenz') {
        const vk = z.vk.filter((v) => v.quelle === 'termin');
        const regelmaessig = M.muster(M.istWahl(t) ? ((t.optionen || []).find((o) => o.id === Z.stand.plan.wahl?.[t.id]) || {}) : t).every((x) => x.typ === 'serie');
        if (vk.length && (!regelmaessig || t.unsicher)) gruppe.push({ name: t.titel, zellen: vk.map((v) => ({ i: idx(v.datum), kl: t.unsicher ? 'an unsicher' : 'an', v })) });
      }
      if (z.einheiten && z.einheiten.length) gruppe.push({ name: t.art === 'video' ? 'Video erscheint' : 'Einheit erscheint', zellen: z.einheiten.map((e) => ({ i: idx(e.ab), kl: 'an zwei', titel: e.titel })) });
      const datumsBloecke = z.vk.filter((v) => v.quelle === 'block' && !v.woechentlich);
      if (datumsBloecke.length) gruppe.push({ name: `Lernen: ${t.titel}`, zellen: datumsBloecke.map((v) => ({ i: idx(v.datum), kl: 'an', v })) });
    }
    for (const p of m.pruefungen || []) {
      const t = (p.termine || []).filter((x) => x.datum);
      gruppe.push({ name: t.length ? p.titel : `${p.titel} · Termin offen`, zellen: t.map((x) => ({ i: idx(x.datum), kl: 'pruefung', datum: x.datum })) });
    }
    const fristen = Z.erg.vorkommen.filter((v) => v.modul === m.id && (v.quelle === 'frist' || v.quelle === 'einzel'));
    if (fristen.length) gruppe.push({ name: 'Fristen und Termine', zellen: fristen.map((v) => ({ i: idx(v.datum), kl: v.quelle === 'frist' ? 'frist' : 'an', v })) });
    zeilen.push({ modul: m, gruppe });
  }
  const allg = Z.erg.vorkommen.filter((v) => !v.modul && (v.quelle === 'frist' || v.quelle === 'einzel'));
  if (allg.length) zeilen.push({ modul: null, gruppe: [{ name: 'Allgemein', zellen: allg.map((v) => ({ i: idx(v.datum), kl: 'frist', v })) }] });
  return zeilen;
}

function musterEl() {
  const wo = Z.erg.wochen;
  const box = h('div', { class: 'muster' });
  box.style.setProperty('--wochen', String(wo.length));
  const jetzt = M.wocheVon(wo, heute());
  const zeigt = Z.ansicht.modus === 'woche' ? Z.ansicht.woche : null;
  box.append(h('div', { class: 'mu-zeile mu-kopf' }, h('span', { text: 'Woche' }),
    ...wo.map((w) => h('button', {
      type: 'button', class: [w.art !== 'vorlesung' ? 'pause' : '', w.id === zeigt ? 'zeigt' : '', jetzt && w.id === jetzt.id ? 'jetzt' : ''].join(' '),
      // Nur jede fünfte Nummer und der Beginn der Prüfungszeit: 26 Spalten zweistelliger Zahlen passen nicht.
      'data-act': 'zur-woche', 'data-woche': w.id, title: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}`,
      text: w.nr && (w.nr === 1 || w.nr % 5 === 0) ? String(w.nr) : w.kurz === 'P1' ? 'P' : '',
    }))));
  for (const { modul: m, gruppe } of musterZeilen()) {
    if (!gruppe.length) continue;
    box.append(h('div', { class: `mu-gruppe${m ? ` m${m.farbe || 1}` : ''}` }, m ? `${M.kurz(m)}` : 'Semester'));
    for (const g of gruppe) {
      const zeile = h('div', { class: `mu-zeile${m ? ` m${m.farbe || 1}` : ''}` }, h('span', { text: g.name, title: g.name }));
      const proWoche = new Map();
      for (const c of g.zellen) if (c.i >= 0) proWoche.set(c.i, [...(proWoche.get(c.i) || []), c]);
      wo.forEach((w, i) => {
        const cs = proWoche.get(i) || [];
        const kl = ['mu-z', w.art === 'frei' ? 'pause' : '', w.id === zeigt ? 'zeigt' : '', ...(cs.length ? cs[0].kl.split(' ') : [])].filter(Boolean);
        const tip = cs.map((c) => c.v ? `${datumMitTag(c.v.datum)} ${c.v.titel || ''}` : c.datum ? datumMitTag(c.datum) : (c.titel || '')).join('\n');
        zeile.append(cs.length ? h('button', { type: 'button', class: kl.join(' '), 'data-act': 'zur-woche', 'data-woche': w.id, 'data-hell': cs[0].v ? cs[0].v.id : null, title: tip || g.name }) : h('i', { class: kl.join(' ') }));
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
  if (z && M.istWahl(z.teil) && (z.teil.optionen || []).length && Z.ansicht.modus !== 'standard' && !(z.teil.optionen || []).some((o) => M.muster(o).some((x) => x.typ === 'reihe'))) Z.ansicht.modus = 'standard';
  zeichnen(); bannerZeigen();
}

function zurWoche(id, hell) {
  Z.ansicht.modus = 'woche'; Z.ansicht.woche = id; ansichtMerken();
  Z.hell = hell || null;
  zeichnen();
  if (hell) setTimeout(() => { if (Z.hell === hell) { Z.hell = null; rasterZeichnen(); } }, 2400);
}

function wocheSchritt(n) {
  const wo = Z.erg.wochen;
  if (Z.ansicht.modus === 'standard') { Z.ansicht.modus = 'woche'; }
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
      case 'teil': fokussieren(teil); break;
      case 'modul': Z.fokus = Z.fokus === `modul:${el.dataset.modul}` ? null : `modul:${el.dataset.modul}`; zeichnen(); break;
      case 'modus': Z.ansicht.modus = el.dataset.modus; ansichtMerken(); zeichnen(); break;
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
    if (e.target.dataset && e.target.dataset.act === 'woche-waehlen' && e.target.value) zurWoche(e.target.value);
  });
  document.addEventListener('submit', formularAbschicken);
  document.addEventListener('keydown', (e) => {
    const inFeld = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') { if (!$('karte').hidden) karteSchliessen(); else if (Z.setzen || Z.fokus || Z.vorschlag) { Z.setzen = null; Z.fokus = null; Z.vorschlag = null; zeichnen(); bannerZeigen(); } return; }
    if (inFeld) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); rueckgaengig(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (!$('karte').hidden) return; e.preventDefault(); wocheSchritt(e.key === 'ArrowLeft' ? -1 : 1); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement?.dataset?.block) {
      const id = document.activeElement.dataset.block;
      aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((x) => x.id !== id); });
    }
  });
  $('raster').addEventListener('pointerdown', zeigerRunter);
  setInterval(() => { if (Z.ansicht.modus === 'woche') rasterZeichnen(); }, 60_000);
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
    aendern((s) => {
      const t = teilIn(s, teil), m = modulVonTeil(s, teil);
      const p = m.pruefungen.find((x) => x.id === t.pruefung);
      const x = { datum, label: '1. Termin' };
      if (f.get('start')) x.start = f.get('start');
      if (f.get('ende')) x.ende = f.get('ende');
      if (f.get('ort')) x.ort = String(f.get('ort')).trim();
      const alt = (p.termine || []).findIndex((y) => M.istDatum(y.datum));
      if (alt >= 0) p.termine[alt] = { ...p.termine[alt], ...x, label: p.termine[alt].label || x.label }; else p.termine = [x, ...(p.termine || [])];
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
