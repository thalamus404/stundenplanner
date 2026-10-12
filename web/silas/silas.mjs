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
// Probepläne (V-0345, Silas: „verschiedene Stundenpläne … unter stundenplanner.de/silas/1, 2, 3 … nur fürs Testen“):
// /silas/<n> liest und schreibt `stand?plan=<n>` und hat seinen eigenen Zwischenspeicher und seine eigene Ansicht — sonst
// landete ein Probeplan beim nächsten Laden im echten. Der Schlüssel gilt für alle.
const PLAN_NR = (/^\/silas\/([1-9])\/?$/.exec(location.pathname) || [])[1] || null;
const LS = { schluessel: 'silas:v1:schluessel', stand: `silas:v1:stand${PLAN_NR ? `:${PLAN_NR}` : ''}`, ansicht: `silas:v1:ansicht${PLAN_NR ? `:${PLAN_NR}` : ''}` };
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
  setzen: null,         // Prüfungs-Id (oder u:<Teil> für Unregelmäßiges), die unter „Prüfungen“ gewählt ist: für sie legt ein Tipp im Kalender Lernzeit
  legen: null,          // { teil, dauer, alle, rest } — der Block, der am Zeiger hängt (V-0335)
  jetzt: {},            // je Schritt der Bestandteil, den Silas links gewählt hat (sonst der erste offene)
  sprung: null,         // { nach } — kurz in einen früheren Schritt zurückgesprungen (V-0336), danach zurück nach `nach`
  auf: {},              // je Schritt das Modul, das Silas trotz „fertig“ aufgeklappt hat
  zrAuf: new Set(['zr-pause-0', 'zr-frei']), // Prüfungen: die aufgeklappten Zeiträume (anfangs die vorlesungsfreien)
  hell: null,           // Vorkommen-Id, die kurz hervorgehoben wird
  leuchten: null,       // Teil-Id, deren Blöcke im Raster kurz aufleuchten („Block verschieben“, V-0354)
  wahlAuf: null,        // Prüfungs-Id, deren Terminwahl nach „Wahl ändern“ wieder offen steht (V-0354)
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
  if (!['plan', 'frei', 'pruefplan', 'offen', 'abgleich', 'erklaerung'].includes(Z.ansicht.bereich)) Z.ansicht.bereich = 'plan';
  // V-0334: einmal neu bei Schritt 1 und der Standardwoche anfangen (Silas: „wenn man reinkommt, erstmal nur … die
  // Grundlage“).
  if (Z.ansicht.v !== 334) Object.assign(Z.ansicht, { v: 334, schritt: 1, bereich: 'plan', modus: 'standard' });
}
const ansichtMerken = () => ls.set(LS.ansicht, JSON.stringify(Z.ansicht));

function rechnen() {
  Z.erg = M.rechnen(Z.stand.angebot, Z.stand.plan, { heute: heute(), jetzt_min: jetztMin() });
  const wo = Z.erg.wochen;
  if (!Z.ansicht.woche || !wo.some((w) => w.id === Z.ansicht.woche)) {
    const w = M.wocheVon(wo, heute());
    Z.ansicht.woche = (w || (heute() < wo[0].von ? wo[0] : wo[wo.length - 1])).id;
  }
  Z.schritte = M.schritte(Z.erg);
  // Unregelmäßiges (V-0354) und der Fortschritt je Element (grün geplant · gelb bekannt, offen · grau unbekannt).
  Z.U = M.unregelmaessige(Z.erg);
  Z.fort = new Map([...Z.erg.teile.values()].map((z) => [z.teil.id, M.fortschritt(Z.erg, z, Z.U)]));
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

async function api(weg, opts = {}, plan = PLAN_NR) {
  const r = await fetch(`${API}/${weg}${weg === 'stand' && plan ? `?plan=${plan}` : ''}`, {
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
  } else if (antwort.status === 404 && PLAN_NR) {
    probeplanAnlegen(); return;
  } else {
    torZeigen(antwort.status === 404 ? 'Noch kein Semester gespeichert. Es wird vom NAS eingespielt (docs/BETRIEB.md).'
      : antwort.status === 503 ? 'Der Speicher ist noch nicht eingerichtet.' : 'Der Plan ist gerade nicht erreichbar.');
    if (antwort.status !== 401) ls.set(LS.schluessel, Z.schluessel);
    return;
  }
  $('tor').hidden = true; $('seite').hidden = false;
  if (PLAN_NR) { document.querySelector('.kopf [data-act="kalender"]').hidden = true; document.querySelector('.marke-zusatz').textContent = `silas · Probeplan ${PLAN_NR}`; document.querySelector('.marke-zusatz').classList.add('probe'); }
  rechnen(); zeichnen(); syncZeigen(); bannerZeigen();
  verdrahten();
  api('plaene').then(({ status, daten }) => { if (status === 200) { Z.plaene = daten.plaene; kopfZeichnen(); } }).catch(() => {});
}

/** Ein Probeplan, den es noch nicht gibt (V-0345): leer beginnen — die Module des echten Plans, ohne Wahl und Blöcke, also
 *  ab Schritt 1 — oder als Kopie des echten Plans. Der echte Plan wird dabei nur gelesen. */
function probeplanAnlegen(fehler = null) {
  $('seite').hidden = true; $('tor').hidden = false;
  const anlegen = async (kopie) => {
    const echt = await api('stand', {}, null);
    if (echt.status !== 200) { probeplanAnlegen('Der echte Plan ist gerade nicht erreichbar.'); return; }
    const plan = kopie ? structuredClone(echt.daten.plan) : {};
    if (kopie) delete plan.festgelegt; // eine Kopie beginnt im Ablauf, damit man ihn durchgehen kann
    const r = await api('stand', { method: 'PUT', body: JSON.stringify({ basis: null, angebot: echt.daten.angebot, plan }) });
    if (r.status === 200) laden(); else probeplanAnlegen((r.daten && r.daten.fehler) || `Fehler ${r.status}`);
  };
  fuellen($('tor').querySelector('.tor-karte'),
    h('h1', { text: `Probeplan ${PLAN_NR}` }),
    h('p', { text: 'Hier kannst du einen Stundenplan zum Ausprobieren bauen — dein echter Plan bleibt, wie er ist. Ereignisse und Kalender-Abo kommen immer aus dem echten.' }),
    h('div', { class: 'tor-wahl' },
      h('button', { class: 'knopf haupt', type: 'button', onclick: () => anlegen(false), text: 'Leer beginnen' }),
      h('button', { class: 'knopf', type: 'button', onclick: () => anlegen(true), text: 'Kopie meines Plans' })),
    h('p', { class: 'satz', text: 'Leer: deine Module mit allen Terminen, aber ohne gewählte Gruppen und ohne Blöcke — von Schritt 1 an.' }),
    fehler ? h('p', { class: 'tor-fehler', text: fehler }) : null,
    h('p', {}, h('a', { href: '/silas/', text: 'Zum echten Plan' })));
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
  // Der Plan, der gerade offen ist, und die Probepläne (V-0345): echter Plan, die angelegten und bis 3 leere.
  const da = new Map((Z.plaene || []).map((p) => [p.nr, p]));
  const nrn = [...new Set([1, 2, 3, ...da.keys(), ...(PLAN_NR ? [Number(PLAN_NR)] : [])])].sort((a, b) => a - b);
  const planwahl = h('select', { class: 'planwahl', 'aria-label': 'Plan', 'data-act': 'plan' },
    h('option', { value: '', text: 'Echter Plan', selected: !PLAN_NR }),
    ...nrn.map((n) => h('option', { value: String(n), selected: String(n) === PLAN_NR, text: `Probeplan ${n}${da.has(n) ? ` · ${M.datumKurz(da.get(n).geaendert.slice(0, 10))}` : ' (leer)'}` })));
  fuellen($('k-links'), h('b', { text: `${s.titel} · ${s.fachsemester ? `${s.fachsemester}. Fachsemester` : ''}` }), h('span', { class: 'k-unter' }, h('span', { text: s.studiengang || '' }), planwahl));
  // Die Bilanz (V-0349, Kontingent-Modell G1/G2): Die Leistungspunkte sind fest (5 × 180 h); sie teilen sich in den
  // Semester-Topf („Woche“) und den Prüfungs-Topf („Prüfungen“). Abgebucht wird erst, was ✓ hat (G6).
  const su = Z.erg.summe;
  const balken = h('div', { class: 'balken zwei', title: `Semester ${M.stunden(su.semester_min)} · Prüfungen ${M.stunden(su.pruefung_min)} · erledigt ${M.stunden(su.erledigt_min)}` }, h('i', { class: 'sem' }), h('i', { class: 'erl' }));
  balken.children[0].style.width = `${(su.semester_min / su.soll_min) * 100}%`;
  balken.children[1].style.width = `${Math.min(100, (su.erledigt_min / su.soll_min) * 100)}%`;
  const zl = su.zaehler;
  fuellen($('bilanz'),
    h('div', { class: 'bilanz-text' },
      h('b', { text: `${M.stunden(su.soll_min)} = ${M.stunden(su.semester_min).replace(' h', '')} Semester + ${M.stunden(su.pruefung_min).replace(' h', '')} Prüfungen` }),
      h('span', { text: su.erledigt_min ? `davon erledigt ${M.stunden(su.erledigt_min)} (✓)` : 'erledigt zählt erst mit ✓' })),
    balken,
    // Die Zähler nach Stufe (V-0332): rot kritisch, hellblau „du bist dran“ — grau zählt hier nicht.
    h('div', { class: 'zaehler-reihe' },
      zl.kritisch ? h('button', { class: 'zaehler rot', type: 'button', 'data-act': 'bereich', 'data-bereich': 'offen', title: 'Kritisch — jetzt handeln' }, sym('warn'), `${zl.kritisch} kritisch`) : null,
      zl.dran ? h('button', { class: 'zaehler st-dran', type: 'button', 'data-act': 'bereich', 'data-bereich': 'offen', title: 'Du bist dran: eintragen, anmelden, abhaken' }, sym('stift'), `${zl.dran} zu tun`) : null,
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
      const gew = gewaehltVon(t);
      if (gew) return gew.label;
      return n ? `${n} Gruppen zur Wahl` : 'Gruppen kommen noch';
    }
    const mu = M.muster(t);
    if (!mu.length) return 'Termine kommen noch';
    return mu.map((x) => x.typ === 'serie' ? `${x.tag} ${zeitspanne(M.min(x.start), M.min(x.ende))}${x.ort ? ` · ${x.ort}` : ''}` : `${(x.daten || []).length}× · ${x.ort || ''}`).join(' + ');
  }
  if (t.art === 'video') return `Videos${z.einheiten ? ` · ${z.einheiten.length}×` : ''} · selbst legen`;
  if (t.art === 'pruefung') return z.pruefungstermin ? `bis ${datumMitTag(M.plusTage(z.pruefungstermin.datum, -1))} · ${z.pruefung.titel}` : `${z.pruefung ? z.pruefung.titel : 'Prüfung'} · Termin offen`;
  if (t.vorbereitung_auf) return `je Termin ${M.stunden(t.einheiten.dauer_min || 0)}, bis zum Termin`;
  if (z.einzeln) return `einmalig ${M.stunden(z.kontingent_min)} · einzelne Blöcke`;
  if (z.el === 'einheiten') return `${M.stunden(t.einheiten.dauer_min)} je Einheit · eigenes Fenster`;
  return 'Selbststudium · im Fenster';
}

const STUFE_SYM = { kritisch: 'warn', achtung: 'warn', dran: 'stift', kommt: 'uhr', spaeter: 'uhr', info: 'info' };

/** Der Weg eines Elements durch den Baum (Kontingent-Modell) als ein Chip: fest · Info fehlt · Wahl offen · Zuteilung
 *  offen · gewählt · gescheitert · im Fenster (mit Wochenwert) · wartet. */
function zustand(z) {
  const t = z.teil;
  const bis = (x) => (x && x.stichtag ? ` · bis ${M.datumKurz(x.stichtag)}` : '');
  if (z.el === 'termin' || z.el === 'pruefungstermin') {
    const ts = z.vk.filter((v) => v.quelle === 'termin');
    const aus = ts.filter((v) => v.ausgefallen).length;
    const n = `${ts.length - aus}×${aus ? `, ${aus} fällt aus` : ''}`;
    switch (z.alternativen) {
      case 'fest': return { kl: 'z-fest', text: `fest · ${n}`, titel: 'Termine stehen fest — sie gehen vor (G4)' };
      case 'gewaehlt': return { kl: 'z-fest', text: `gewählt · ${n}`, titel: 'Gruppe gewählt' };
      case 'info_fehlt': return { kl: 'z-info', text: `Info fehlt${bis(z.info)}`, titel: `Info fehlt: ${z.info.frage} — Stichtag ${datumMitTag(z.info.stichtag)}` };
      case 'wahl_offen': return { kl: 'z-wahl', text: gewaehltVon(t) ? 'Wunsch · anmelden' : 'Wahl offen', titel: 'Noch nicht gewählt oder noch nicht angemeldet' };
      case 'zuteilung_offen': return { kl: 'z-wahl', text: 'Zuteilung offen', titel: 'Angemeldet — die Zuteilung steht noch aus' };
      case 'gescheitert': return { kl: 'z-rot', text: 'gescheitert', titel: 'Kein Platz oder nicht angemeldet' };
      default: return { kl: '', text: '' };
    }
  }
  if (z.el === 'vorbereitung') return { kl: 'z-pruef', text: 'unter Prüfungen', titel: 'Prüfungs-Topf: wird unter „Prüfungen“ geplant (G2)' };
  if (z.wartet) return { kl: 'z-info', text: `wartet auf ${z.wartet_auf.teil.titel}`, titel: 'Das Fenster beginnt mit dem ersten Termin' };
  if (z.zeitbindung === 'unbekannt') return { kl: 'z-info', text: `Info fehlt${bis(z.info)} · ${M.stunden1(z.wochenwert_min)}/W`, titel: `Zeitbindung unbekannt: ${z.info.frage}` };
  if (z.el === 'einheiten') {
    const n = z.einheiten ? z.einheiten.length : (t.einheiten && t.einheiten.anzahl) || 0;
    return z.einheiten
      ? { kl: z.info ? 'z-info' : 'z-fenster', text: `${n} Fenster${z.info ? bis(z.info) : ''}`, titel: z.info ? `Info fehlt: ${z.info.frage}` : 'Je Einheit ein eigenes Fenster' }
      : { kl: 'z-info', text: `${n} erwartet${bis(z.info)}`, titel: z.info ? `Info fehlt: ${z.info.frage}` : '' };
  }
  if (z.el === 'rest') return z.einzeln ? { kl: 'z-fenster', text: 'einzeln', titel: 'Einmaliger Posten: einzelne Blöcke, keine Wochenrate' }
    : { kl: z.info ? 'z-info' : 'z-fenster', text: `${M.stunden1(z.wochenwert_min)} je Woche`, titel: `Wochenwert: (Kontingent − erledigt) ÷ ${z.restwochen} Vorlesungswochen im Fenster` };
  return { kl: '', text: '' };
}

/** Die eine Zeile, die sagt, was an einem Element zu tun ist — in der Farbe seiner Stufe (V-0332): rot kritisch,
 *  orange Achtung, hellblau „du bist dran“, grau „kommt noch“. */
function lageText(z) {
  if (!z.stufe || z.stufe === 'ok' || z.stufe === 'info') return null;
  const f = z.flags.find((x) => x.stufe === z.stufe);
  if (!f) return null;
  const t = {
    wahl_offen: () => (gewaehltVon(z.teil) ? 'anmelden, dann „Angemeldet“' : 'Gruppe wählen'),
    zuteilung_offen: () => 'Zuteilung bestätigen',
    gescheitert: () => 'gescheitert — Folge ansehen',
    info_fehlt: () => (f.stufe === 'achtung' ? 'Stichtag vorbei — nachfragen' : `Augen offen bis ${M.datumKurz(f.stichtag)}`),
    wartet: () => 'wartet',
    unbestaetigt: () => `${f.anzahl} ohne ✓/✗`,
    nacharbeit: () => 'Nacharbeit',
    verfehlt: () => 'Fenster vorbei — entscheiden',
    laenge: () => (f.faellig ? `${f.faellig} Videolängen eintragen` : 'Videolängen kommen noch'),
    konflikt: () => 'Überschneidung',
    gesperrt: () => 'Block auf einem Termin',
    unsicher: () => 'bitte prüfen',
    nach_pruefung: () => 'Block nach der Prüfung',
  }[f.art];
  return { kl: `st-${f.stufe}`, s: STUFE_SYM[f.stufe], t: t ? t() : f.text.split(' — ')[0].slice(0, 44) };
}

/** Welche Teile links stehen: im Ablauf die des gezeigten Schritts (M.schrittVon); festgelegt alle des Semester-Topfs. */
const teileImSchritt = (r, n = schritt()) => r.teile.filter((z) => M.schrittVon(z.teil) === n);
const gewaehltVon = (t) => (t.optionen || []).find((o) => o.id === (Z.stand.plan.wahl || {})[t.id]) || null;

/** Die Woche, auf die sich „diese Woche“ bezieht: die im Raster gezeigte (null = Standardwoche). */
const bedarfsWoche = () => (zeigtRaster() ? rasterLage().woche && !rasterLage().std ? rasterLage().woche : null : null);
let bedarf = null; // Map Teil-Id → Wochenbedarf, je Zeichnen neu

/** Was ein Schritt von Silas will — oben in der linken Spalte, damit man nie raten muss, was hier zu tun ist. */
const SCHRITT_TUN = {
  1: 'Das steht fest: deine Vorlesungen und die anderen festen Präsenztermine. Hier wählst du nichts — prüf nur, ob es stimmt, und trag fehlende Uhrzeiten oder Räume nach.',
  2: 'Von oben nach unten, immer eine Wahl: Im Raster stehen nur die Gruppen der markierten Sache. Eine anklicken wählt sie, die anderen werden blass und lassen sich weiter wählen; die gewählte noch einmal anklicken wählt ab. Mit MOSES-Zuteilung ist die Wahl erst ein Wunsch.',
  3: 'Je Woche ein Platz für die Videos. Die Vorgabe sagt, wie lang; „Block legen“ hängt ihn an den Zeiger, grün sind freie Plätze, ein Klick legt ihn ab.',
  4: 'Eigenverantwortliches Lernen in Blöcken von 1,5–2 h, so viel wie der Wochenwert. „Block legen“ hängt ihn an den Zeiger; freie Plätze sind grün, zwischen 10 und 18 Uhr kräftiger. Danach: Stundenplan festlegen.',
};

// ── Fortschritt (V-0354) ─────────────────────────────────────────────────────────────────────────
// Silas, 12.10.: „ganz oben bei Grundlage eine Progress Bar, die von 0 % bis 100 % geht … Progress Bar pro Modul (in dem
// jeweiligen Schritt) und wenn der Plan fertig ist, für das gesamte Modul. Grün = geplant, Grau = nicht geplant, weil nicht
// bekannt, Gelb = nicht geplant, obwohl bekannt.“ Je Element rechnet M.fortschritt (in rechnen(): Z.fort), hier wird summiert.

/** Summe über Elemente: { k, gruen, gelb, grau, anteil, status (fertig · unbekannt · offen), je: [{ z, f }] }. */
function fortVon(zs) {
  const s = { k: 0, gruen: 0, gelb: 0, grau: 0, je: [] };
  for (const z of zs) {
    const f = Z.fort.get(z.teil.id);
    s.je.push({ z, f }); s.k += f.k; s.gruen += f.gruen; s.gelb += f.gelb; s.grau += f.grau;
  }
  s.anteil = s.k ? s.gruen / s.k : 1;
  s.status = s.gelb > 0 ? 'offen' : s.grau > 0 ? 'unbekannt' : 'fertig';
  return s;
}
const schrittFort = (n) => fortVon([...Z.erg.teile.values()].filter((z) => M.schrittVon(z.teil) === n));
// Abgerundet: 99,6 % ist noch nicht 100 % (grün und der volle Haken erst, wenn wirklich alles liegt).
const prozent = (f) => `${f.status === 'fertig' ? 100 : Math.min(99, Math.floor(f.anteil * 100))} %`;

/** Der Balken: grün geplant, gelb bekannt und noch offen, grau noch nicht bekannt. */
function fBalken(f, gross = false) {
  const b = h('div', { class: `fbalken${gross ? ' gross' : ''}`, role: 'img', 'aria-label': `${prozent(f)} geplant`,
    title: `geplant ${M.stunden(f.gruen)} · bekannt, noch nicht geplant ${M.stunden(f.gelb)} · noch nicht bekannt ${M.stunden(f.grau)}` });
  for (const [kl, w] of [['gruen', f.gruen], ['gelb', f.gelb], ['grau', f.grau]]) {
    if (w <= 0) continue;
    const i = h('i', { class: kl }); i.style.flexGrow = String(w); b.append(i);
  }
  return b;
}
/** Balken mit Prozent in einer Zeile (Modulkarte). */
const fZeile = (f) => h('div', { class: 'm-fort' }, fBalken(f), h('span', { class: `m-proz f-${f.status}`, text: prozent(f) }));

// ── Geführt: die Reihe je Schritt (V-0335) ──────────────────────────────────────────────────────
// Silas, 11.10.: „dass man von oben nach unten durchgeführt wird … du wählst halt genau gerade eine einzige Sache.“ Jeder
// Schritt hat eine Reihe in der Reihenfolge der Module; dran ist, was Silas links gewählt hat, sonst die erste offene.
// Offen heißt (V-0354): bekannt, aber noch nicht gewählt oder gelegt (gelb). Was fertig ist (grün) oder nicht bekannt
// (grau: Gruppen ohne Termine, ein Fenster, das auf die Übung wartet), klappt ein.

/** Die Reihe eines Schritts: in 2 jede Wahl (mit Zahl der Gruppen und der gewählten), in 3 und 4 jeder Bestandteil mit
 *  Kontingent und seiner Vorgabe je Woche (M.vorgabe). Wartet ein Fenster noch (Übungs-Nachbereitung ohne Übung),
 *  steht es da, lässt sich aber noch nicht legen. */
function reihe(n = schritt()) {
  const aus = [];
  for (const r of Z.erg.module) {
    for (const z of r.teile) {
      if (M.schrittVon(z.teil) !== n) continue;
      const f = Z.fort.get(z.teil.id);
      const offen = f.status === 'offen';
      if (n === 2) {
        const anzahl = (z.teil.optionen || []).length, gew = gewaehltVon(z.teil);
        aus.push({ z, f, anzahl, gew, fertig: !offen, offen });
      } else if (n >= 3 && n <= 4) {
        if (z.wartet) { aus.push({ z, f, wartet: true, fertig: true, offen: false }); continue; }
        const vg = M.vorgabe(Z.erg, z.teil.id);
        if (!vg) continue;
        const woche = (Z.stand.plan.bloecke || []).filter((b) => b.teil === z.teil.id && !b.datum).length;
        const tage = (Z.stand.plan.bloecke || []).filter((b) => b.teil === z.teil.id && b.datum).length;
        aus.push({ z, f, vg, woche, tage, fertig: !offen, offen });
      }
    }
  }
  return aus;
}
function jetztIn(n = schritt()) {
  const liste = reihe(n);
  return (Z.jetzt[n] && liste.find((x) => x.z.teil.id === Z.jetzt[n])) || liste.find((x) => x.offen) || null;
}
/** Die Vorgabe als Satz: „1,5 h jede Woche — 16× = 24 h von 30 h“; einzeln: „3 Blöcke à 2 h in echten Wochen“. */
function vorgabeText(vg, kurz = false) {
  if (vg.einzeln) return kurz ? `${vg.wochen} × ${M.stunden(vg.dauer_min)} einzeln` : `${vg.wochen} Blöcke à ${M.stunden(vg.dauer_min)} = ${M.stunden(vg.summe_min)} von ${M.stunden(vg.soll_min)}, je einer an einem Tag, an dem er gebraucht wird`;
  const block = `${vg.anzahl > 1 ? `${vg.anzahl} × ` : ''}${M.stunden(vg.dauer_min)}`;
  const takt = vg.alle > 1 ? `alle ${vg.alle} Wochen` : 'jede Woche';
  if (kurz) return `${block} ${vg.alle > 1 ? `alle ${vg.alle} Wo.` : 'je Woche'}`;
  return `${block} ${takt} — ${vg.wochen}×${vg.bis ? ` (bis ${M.datumKurz(vg.bis)})` : ''} = ${M.stunden(vg.summe_min)} von ${M.stunden(vg.soll_min)} Kontingent`;
}

/** Was eine eingeklappte Sache rechts sagt: gewählt, gelegt — oder warum sie grau ist. */
function zuText(z, f, n) {
  if (f.status === 'unbekannt') {
    if (z.wartet) return `wartet auf ${z.wartet_auf.teil.titel}`;
    if (z.teil.art === 'praesenz') return M.istWahl(z.teil) || !M.muster(z.teil).length ? 'Gruppen kommen noch' : 'Termine kommen noch';
    return 'kommt noch';
  }
  if (n === 2) {
    const gew = gewaehltVon(z.teil);
    return gew ? `${z.alternativen === 'gewaehlt' ? '' : 'Wunsch '}${gew.label.split(' · ').slice(0, 2).join(' · ')}` : 'gewählt';
  }
  if (n === 1) return `${z.vk.filter((v) => v.quelle === 'termin' && !v.ausgefallen).length}× fest`;
  return M.stunden(z.plan_min);
}

/** Eine eingeklappte Sache (V-0354, Silas: „Sobald alles von einem Format in dem Modul gelegt ist, soll es sich einklappen
 *  und einen grünen Haken zeigen. Wenn die Termine zum Wählen fehlen, dann ein grauer Haken, aber auch eingeklappt.“)
 *  Ein Klick macht sie zur Sache, die dran ist (Schritt 1: öffnet ihre Karte). */
function zuZeile(z, f, n) {
  const t = z.teil, m = z.modul;
  return h('li', { class: `m${m.farbe || 1} zu-zeile f-${f.status}` },
    h('button', { type: 'button', class: 'r-zeile', 'data-act': n >= 2 ? 'jetzt' : 'teil', 'data-teil': t.id, title: f.status === 'fertig' ? 'Erledigt — Klick: ansehen und ändern' : 'Noch nicht bekannt — kommt als Folgeentscheidung' },
      h('span', { class: `f-haken ${f.status === 'fertig' ? 'gruen' : 'grau'}` }, sym('ok')), h('span', { class: 'r-name', text: t.titel }), h('span', { class: 'r-stand', text: zuText(z, f, n) })),
    Z.fokus === t.id ? teilKarte(z) : null);
}

/** Die Knöpfe einer Sache, die dran ist (Schritt 3 und 4): Liegt schon ein Block, heißt es „Block verschieben“ — er
 *  leuchtet im Raster auf (V-0354, Silas: „dann soll da nicht mehr stehen ‚Block legen‘, sondern ‚Block verschieben‘, und
 *  wenn man das anklickt, sollen der Block / die Blöcke, die zum Format gehören, aufleuchten“). */
function legenKnoepfe(z, vg, f) {
  const t = z.teil;
  const an = Z.legen && Z.legen.teil === t.id;
  const hat = (Z.stand.plan.bloecke || []).some((b) => b.teil === t.id);
  const legen = (haupt) => h('button', { type: 'button', class: `knopf klein${haupt ? ' haupt' : ' leise'}`, 'data-act': 'legen', 'data-teil': t.id }, sym('plus'),
    hat ? `Noch einen Block legen · ${M.stunden(vg.dauer_min)}` : vg.einzeln ? `Block legen · ${M.stunden(vg.dauer_min)}, in einer echten Woche` : `Block legen · ${M.stunden(vg.dauer_min)}${vg.alle > 1 ? `, alle ${vg.alle} Wochen` : ''}`);
  const schieben = (haupt) => h('button', { type: 'button', class: `knopf klein${haupt ? ' haupt' : ' leise'}`, 'data-act': 'verschieben', 'data-teil': t.id }, sym('stift'),
    (Z.stand.plan.bloecke || []).filter((b) => b.teil === t.id).length > 1 ? 'Blöcke verschieben' : 'Block verschieben');
  if (an) return [h('button', { type: 'button', class: 'knopf klein an', 'data-act': 'legen-aus', 'data-teil': t.id }, sym('zu'), 'Block hängt am Zeiger — abbrechen')];
  if (!hat) return [legen(true)];
  return f.status === 'offen' ? [legen(true), schieben(false)] : [schieben(true), legen(false)];
}

/** Die Reihe eines Schritts als Liste — mit `modul` nur seine Sachen, unter seiner Kachel (V-0345). Die Sache, die dran
 *  ist, trägt ihren Satz und ihre Knöpfe; fertige und unbekannte sind eingeklappt (zuZeile). */
function reiheEl(n, modul = null) {
  const alle = reihe(n);
  const liste = modul ? alle.filter((x) => x.z.modul === modul) : alle;
  if (!liste.length) return null;
  const j = jetztIn(n);
  return h('ol', { class: 'reihe' }, ...liste.map((x) => {
    const m = x.z.modul, t = x.z.teil, dran = j && j.z === x.z;
    if (!dran && !x.offen) return zuZeile(x.z, x.f, n);
    const stand = n === 2
      ? (x.gew ? `${x.z.alternativen === 'gewaehlt' ? '✓' : 'Wunsch'} ${x.gew.label.split(' · ').slice(0, 2).join(' · ')}` : x.anzahl ? `${x.anzahl} Gruppen` : '0 vorhanden')
      : x.wartet ? 'wartet' : (x.fertig ? `✓ ${M.stunden(x.z.plan_min)}` : vorgabeText(x.vg, true));
    const li = h('li', { class: `m${m.farbe || 1}${dran ? ' dran' : ''}${x.fertig ? ' fertig' : ''}` },
      h('button', { type: 'button', class: 'r-zeile', 'data-act': x.wartet ? 'teil' : 'jetzt', 'data-teil': t.id, 'aria-current': dran ? 'true' : null },
        h('span', { class: 'm-punkt' }), h('span', { class: 'r-name', text: modul ? t.titel : `${M.kurz(m)} · ${t.titel}` }), h('span', { class: 'r-stand', text: stand })));
    if (dran && n === 2) {
      const naechste = x.gew ? alle.find((y) => y.offen && y !== x) : null;
      const lage = lageText(x.z);
      li.append(h('p', { class: 'r-satz', text: x.gew ? (t.zuteilung ? 'Gewünscht. Zählt erst als verplant, wenn die Zuteilung bestätigt ist — anmelden, dann „Angemeldet“, nach der Zuteilung „Zugeteilt“ (unter Details).' : 'Gewählt. Die anderen Gruppen stehen blass daneben — anklicken wählt um; die gewählte noch einmal anklicken wählt ab.') : x.anzahl ? `Wähl im Raster eine der ${x.anzahl} Gruppen (gestrichelt).` : 'Die Gruppen stehen noch nicht fest.' }),
        lage ? h('p', { class: `r-satz t-lage ${lage.kl}` }, sym(lage.s), lage.t) : null,
        h('div', { class: 'r-knoepfe' },
          naechste ? h('button', { type: 'button', class: 'knopf klein haupt', 'data-act': 'jetzt', 'data-teil': naechste.z.teil.id }, `Nächste Wahl: ${M.kurz(naechste.z.modul)} · ${naechste.z.teil.titel}`, sym('rechts')) : null,
          h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'teil', 'data-teil': t.id, 'aria-expanded': String(Z.fokus === t.id) }, 'Details')));
    }
    if (dran && n >= 3 && x.vg) {
      const gelegt = x.vg.einzeln ? ` (${x.tage} von ${x.vg.wochen} Blöcken)` : '';
      li.append(h('p', { class: 'r-satz', text: `Vorgabe: ${vorgabeText(x.vg)}${x.z.el === 'rest' && !x.z.einzeln ? ` — Wochenwert ${M.stunden1(x.z.wochenwert_min)}` : ''}. Gelegt: ${M.stunden(x.z.plan_min)}${gelegt}.` }),
        h('div', { class: 'r-knoepfe' }, ...legenKnoepfe(x.z, x.vg, x.f),
          h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'teil', 'data-teil': t.id, 'aria-expanded': String(Z.fokus === t.id) }, 'Details')));
    }
    if (modul && Z.fokus === t.id) li.append(teilKarte(x.z));
    return li;
  }));
}

function moduleZeichnen() {
  const box = $('module');
  const oben = box.scrollTop;
  const woche = Z.ansicht.links === 'woche' && (fertig() || schritt() > 2);
  const wid = bedarfsWoche();
  bedarf = new Map(M.wochenBedarf(Z.stand.angebot, Z.stand.plan, Z.erg, wid).map((b) => [b.z.teil.id, b]));
  const n = schritt();
  const sch = M.SCHRITTE[n - 1];
  const b = Z.ansicht.bereich;
  // Oben der Fortschritt (V-0354) statt des erklärenden Satzes (Silas: „Die Hinweise unter ‚Woche‘ und ‚Prüfungen‘ bitte
  // wegmachen, die nehmen nur wertvollen Platz weg“) — der Satz steht noch im Tooltip.
  const kasten = (titel, f, satz, knopf = null) => h('div', { class: `schritt-tun f-${f.status}`, title: satz },
    h('div', { class: 'st-zeile' }, h('b', { text: titel }), h('span', { class: 'st-proz', text: prozent(f) })), fBalken(f, true), knopf);
  const tun = !fertig()
    ? kasten(`Schritt ${sch.nr} · ${sch.titel}`, schrittFort(n), SCHRITT_TUN[sch.nr],
      n < 4 ? h('button', { type: 'button', class: 'knopf haupt', 'data-act': 'schritt', 'data-schritt': String(n + 1) }, `Weiter: ${n + 1} · ${M.SCHRITTE[n].titel}`, sym('rechts'))
        : h('button', { type: 'button', class: 'knopf haupt', 'data-act': 'festlegen' }, sym('ok'), 'Stundenplan festlegen'))
    : b === 'frei' || b === 'pruefplan'
      ? kasten('Prüfungen und Unregelmäßiges', schrittFort(M.PRUEFUNGEN), 'Je Prüfung ihr Kontingent (Prüfungs-Topf), dazu was an einzelne Termine gebunden ist (Quicktests, Vorbereitung auf die Übungen, Literatur). Eine wählen, dann im Kalender: ein Tipp legt einen Lernblock, Ziehen nach unten wählt die Stunden.')
      : kasten('Dein Semester', fortVon([...Z.erg.teile.values()]), 'Festgelegt — alles in Farbe. Vergangenes bekommt ✓ oder ✗ (Klick auf die Kachel). Ändern: oben „Stundenplan bearbeiten“.');
  // Die zwei Hauptansichten (V-0338). Prüfungen gibt es erst, wenn der Stundenplan festgelegt ist.
  const haupt = h('div', { class: 'hauptreiter', role: 'tablist', 'aria-label': 'Ansicht' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(!['frei', 'pruefplan'].includes(b)), 'data-act': 'bereich', 'data-bereich': 'plan' }, sym('kalender'), h('span', {}, h('b', { text: 'Woche' }), h('small', { text: fertig() ? 'Semester-Topf' : `Schritt ${n} von 4` }))),
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(['frei', 'pruefplan'].includes(b)), 'data-act': 'bereich', 'data-bereich': 'frei', disabled: !fertig(), title: fertig() ? null : 'Erst nach „Stundenplan festlegen“' },
      sym('ziel'), h('span', {}, h('b', { text: 'Prüfungen' }), h('small', { text: fertig() ? `Prüfungs-Topf ${M.stunden(Z.erg.summe.pruefung_min)}` : 'nach dem Festlegen' }))));
  const kopf = h('div', { class: 'links-kopf' }, haupt, tun,
    (fertig() || n > 2) && b !== 'frei' && b !== 'pruefplan' ? h('div', { class: 'umschalter', role: 'group', 'aria-label': 'Zeitraum der Module' },
      h('button', { type: 'button', 'aria-pressed': String(!woche), 'data-act': 'links', 'data-wert': 'semester', text: 'Ganzes Semester' }),
      h('button', { type: 'button', 'aria-pressed': String(woche), 'data-act': 'links', 'data-wert': 'woche', text: 'Diese Woche' })) : null);
  // Blöcke ohne Modul, die auf einem Termin liegen (Schritt 4). Die Befunde des Abgleichs (Last, zwei Prüfungen an einem
  // Tag) stehen unter „Offen“ und „Abgleich“, nicht hier.
  const gesperrt = Z.erg.planFlags.filter((f) => f.art === 'gesperrt');
  const planFl = (fertig() ? b === 'plan' : n === 4) && gesperrt.length
    ? h('section', { class: 'modul plan-flaggen' }, h('div', { class: 't-flaggen' }, ...gesperrt.map(flaggeEl))) : null;
  if (fertig() && (b === 'frei' || b === 'pruefplan')) fuellen(box, kopf, pruefListe());
  else fuellen(box, kopf, planFl, ...Z.erg.module.map(modulKarte));
  box.scrollTop = oben;
}

/** Die zwei Töpfe eines Moduls als Zeile (Kontingent-Modell, G1/G2): Semester + Prüfungen = LP × 30 h. */
function toepfeEl(r) {
  return h('p', { class: 'm-zahl' },
    h('span', { text: `Semester ${M.stunden(r.semester_min)} · Prüfungen ${M.stunden(r.pruefung_min)}` }),
    h('span', { text: r.erledigt_min ? `${M.stunden(r.erledigt_min)} ✓` : '' }));
}

/** Diese Woche (Umschalter links): was dran wäre und was davon im Plan ist. */
function dieseWocheEl(zs) {
  const bs = zs.map((z) => bedarf.get(z.teil.id)).filter(Boolean);
  const soll = bs.reduce((s, x) => s + x.soll_min, 0), ist = bs.reduce((s, x) => s + Math.min(x.ist_min, x.soll_min), 0);
  const fehlt = Math.max(0, soll - ist);
  return h('p', { class: 'm-zahl' }, h('span', { text: `${M.stunden(ist)} von ${M.stunden(soll)} diese Woche` }), fehlt >= 15 ? h('span', { class: 'fehlt', text: `${M.stunden(fehlt)} offen` }) : h('span', { text: soll ? 'gedeckt' : '' }));
}

/** Ein Modul links (V-0354, Silas: „Sobald alle Formate von einem Modul eingeklappt sind, soll sich das Modul selbst
 *  einklappen und nur noch Namen, Progress Bar und ‚Blöcke ändern‘ anzeigen“). Im Ablauf: die Sachen des Schritts mit dem
 *  Fortschritt des Schritts; festgelegt: das ganze Modul mit seinen Posten. Aufgeklappt hält es Z.auf (je Schritt, „fest“). */
function modulKarte(r) {
  const m = r.modul;
  const n = schritt();
  const woche = Z.ansicht.links === 'woche' && (fertig() || n > 2);
  const filter = Z.fokus === `modul:${m.id}`;
  const zs = fertig() ? r.teile.filter((z) => M.schrittVon(z.teil) <= 4) : teileImSchritt(r);
  const kopf = (act, titel, lp = `${m.lp} LP`) => h('button', { class: 'm-kopf', type: 'button', 'data-act': act, 'data-modul': m.id, 'aria-pressed': act === 'modul' ? String(filter) : null, title: titel },
    h('span', { class: 'm-punkt' }), h('span', { class: 'm-name', text: M.kurz(m) }), h('span', { class: 'm-titel', text: m.titel }), h('span', { class: 'm-lp', text: lp }));
  if (!zs.length) {
    return h('section', { class: `modul m${m.farbe || 1} zu leer`, 'data-modul': m.id }, kopf('modul', 'In diesem Schritt nichts zu tun'), h('p', { class: 'm-zahl', text: 'In diesem Schritt nichts' }));
  }
  // Der Balken: im Ablauf der Schritt, festgelegt das ganze Modul (auch die Prüfungen und das Unregelmäßige).
  const f = fortVon(fertig() ? r.teile : zs);
  const fSchritt = fertig() ? fortVon(zs) : f;
  const kritisch = zs.some((z) => z.stufe === 'kritisch');
  const schluessel = fertig() ? 'fest' : n;
  const auf = Z.auf[schluessel] === m.id;
  const dran = !fertig() && n >= 2 ? jetztIn(n) : null;
  const offenHier = fSchritt.je.some((x) => x.f.status === 'offen') || (dran && dran.z.modul === m) || (filter && fertig());
  if (!offenHier && !auf) {
    // Nur Graues (Gruppen kommen noch): nichts zu ändern, nur anzusehen.
    const wort = fertig() || n === 1 || !f.gruen ? 'Ansehen' : n === 2 ? 'Wahl ändern' : 'Blöcke ändern';
    return h('section', { class: `modul m${m.farbe || 1} zu${kritisch ? ' rot' : ''}`, 'data-modul': m.id },
      kopf('aufklappen', 'Aufklappen'),
      h('div', { class: 'm-fertig' }, fZeile(f),
        h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'aufklappen', 'data-modul': m.id }, sym(wort === 'Ansehen' ? 'rechts' : 'stift'), wort)));
  }
  let liste;
  if (fertig()) {
    // Festgelegt: die Elemente nach Posten der Aufwandstabelle (Kontingent je Posten), der Prüfungs-Topf als eine Zeile.
    const gruppen = r.posten.filter((P) => P.topf === 'semester').map((P) => {
      const els = P.elemente.filter((z) => z.topf !== 'pruefung');
      if (!els.length) return null;
      return h('li', { class: 'm-posten' },
        h('div', { class: 'mp-kopf', title: `${P.posten.mult} × ${String(P.posten.h).replace('.', ',')} h laut Aufwandstabelle` }, h('span', { text: P.titel }), h('span', { class: 'mp-k', text: M.stunden(P.K) }), auditChip(P)),
        h('ul', { class: 'm-teile' }, ...els.map((z) => h('li', {}, teilZeile(z), Z.fokus === z.teil.id ? teilKarte(z) : null))));
    }).filter(Boolean);
    const x = r.pruefungen.find((X) => X.haupt) || r.pruefungen[0];
    liste = h('ul', { class: 'm-postenliste' }, ...gruppen,
      h('li', { class: 'm-posten m-pruef' }, h('button', { type: 'button', class: 'mp-kopf', 'data-act': 'zu-pruefung', 'data-pruefung': x ? x.id : '' },
        h('span', { text: `Prüfungs-Topf · ${r.pruefungen.map((X) => X.p.titel.replace(/\s*\(.*\)\s*/, '')).join(', ')}` }), h('span', { class: 'mp-k', text: M.stunden(r.pruefung_min) }), sym('rechts'))));
  } else if (n >= 2) liste = reiheEl(n, m);
  else {
    liste = h('ol', { class: 'reihe' }, ...fSchritt.je.map(({ z, f: fz }) => (fz.status === 'offen'
      ? h('li', {}, teilZeile(z), Z.fokus === z.teil.id ? teilKarte(z) : null) : zuZeile(z, fz, 1))));
  }
  // Was im Abgleich kritisch ist oder eine Entscheidung braucht — nur festgelegt (im Ablauf steht es unter „Offen“).
  const wichtig = fertig() ? r.flags.filter((x) => !x.pruefung && ['kritisch', 'achtung'].includes(x.stufe)) : [];
  const st = M.hoechste(wichtig);
  return h('section', { class: `modul m${m.farbe || 1}${kritisch ? ' rot' : ''}${filter ? ' filter' : ''}`, 'data-modul': m.id },
    kopf(auf ? 'zuklappen' : 'modul', auf ? 'Wieder einklappen' : !fertig() && n === 2 ? 'Nur die Gruppen dieses Moduls im Raster' : 'Dieses Modul hervorheben', fertig() ? `${m.lp} LP = ${M.stunden(r.soll_min)}` : `${m.lp} LP`),
    fZeile(f),
    fertig() ? toepfeEl(r) : null,
    woche ? dieseWocheEl(zs) : null,
    wichtig.length ? h('button', { type: 'button', class: `m-hinweis st-${st}`, 'data-act': 'bereich', 'data-bereich': 'offen', title: wichtig.map((x) => x.text).join('\n') }, sym(STUFE_SYM[st]),
      wichtig.length === 1 ? wichtig[0].text.slice(0, 80) + (wichtig[0].text.length > 80 ? ' …' : '') : `${wichtig.length} Punkte prüfen`) : null,
    fertig() && filter ? modulDetail(r) : null,
    liste);
}

/** Das Ergebnis des Abgleichs eines Postens als kleiner Chip (passt, mehr, weniger, offen). */
function auditChip(P) {
  if (!P.audit) return null;
  const a = P.audit, d = M.stunden(Math.abs(a.diff_min));
  const text = { passt: a.diff_min ? `passt (${a.diff_min > 0 ? '+' : '−'}${d})` : 'passt', mehr: `+${d}`, weniger: `−${d}`, offen: 'offen', ungeplant: 'ungeplant' }[a.ergebnis];
  const titel = { passt: `Abweichung innerhalb der Toleranz (${M.stunden(a.tol_min)})`, mehr: `${d} mehr als die Aufwandstabelle — Entscheidung offen`, weniger: P.g5_min ? `${d} finden nicht statt → Prüfungsvorbereitung (G5)` : `${d} weniger geplant als das Kontingent`, offen: 'Offen, bis Termine oder Videolängen bekannt sind', ungeplant: 'Noch keine Blöcke' }[a.ergebnis];
  return h('span', { class: `a-chip a-${a.ergebnis}`, title: titel, text });
}

/** Eine Meldung als Zeile, in der Farbe ihrer Stufe — mit dem Knopf, der sie erledigt. */
function flaggeEl(f) {
  const knopf = f.art === 'wahl_offen' && f.anmeldung ? h('button', { type: 'button', class: 'knopf klein', 'data-act': 'angemeldet', 'data-id': f.anmeldung, text: 'Angemeldet ✓' })
    : f.art === 'zuteilung_offen' ? h('button', { type: 'button', class: 'knopf klein', 'data-act': 'zugeteilt', 'data-teil': f.zuteilung, text: 'Zugeteilt ✓' })
    : f.art === 'nacharbeit' ? h('button', { type: 'button', class: 'knopf klein', 'data-act': 'nachgeholt', 'data-vk': f.vk, text: 'Nachgeholt ✓' })
    : null;
  return h('div', { class: `flagge st-${f.stufe}`, title: M.STUFE_TEXT[f.stufe] }, sym(STUFE_SYM[f.stufe]), h('span', {}, f.text, knopf));
}

/** Die Aufwandstabelle des Moduls (amtlich, aber geschätzt) neben dem, was daraus wird: Topf, Elemente, Abgleich. */
function modulDetail(r) {
  const m = r.modul;
  return h('div', { class: 't-karte' },
    h('p', { class: 't-zahlen', text: `Modulbeschreibung #${m.nr} · ${m.lp} LP × ${Z.erg.regeln.lp_h} h = ${M.stunden(r.soll_min)}${m.verantwortlich ? ` · ${m.verantwortlich}` : ''}` }),
    kontingentTabelle(r),
    ...(m.notizen || []).map((x) => h('p', { class: 't-zahlen', text: x })),
    m.links && m.links.isis ? h('p', { class: 't-zahlen' }, h('a', { href: m.links.isis, target: '_blank', rel: 'noopener noreferrer', text: 'ISIS-Kurs öffnen' })) : null);
}

/** Posten → Kontingent → Topf → Elemente → Wirklichkeit → Abgleich, als Tabelle (Modulkarte, „So wird gerechnet“). */
function kontingentTabelle(r) {
  return h('table', { class: 'erkl-tabelle' },
    h('thead', {}, h('tr', {}, h('th', { text: 'Posten' }), h('th', { text: 'Kontingent' }), h('th', { text: 'Topf' }), h('th', { text: 'Elemente' }), h('th', { text: 'Abgleich' }))),
    h('tbody', {}, ...r.posten.map((P) => h('tr', {},
      h('td', { text: P.titel }), h('td', { text: `${P.posten.mult} × ${String(P.posten.h).replace('.', ',')} h = ${M.stunden(P.K)}` }),
      h('td', { text: P.topf === 'pruefung' ? 'Prüfungen' : 'Semester' }),
      h('td', { text: (P.topf === 'pruefung' ? r.teile.filter((z) => z.teil.posten === P.posten.id) : P.elemente).map((z) => `${z.teil.titel} ${M.stunden(z.kontingent_min)}`).join(', ') || '—' }),
      h('td', {}, auditChip(P) || (P.topf === 'pruefung' ? 'unter Prüfungen' : ''), P.g5_min ? ` → ${M.stunden(P.g5_min)} in die Vorbereitung` : ''))),
    h('tr', { class: 'summe' }, h('td', { text: 'Summe' }), h('td', { text: `${M.stunden(r.tabelle_min)}` }), h('td', { text: `Semester ${M.stunden(r.semester_min)} · Prüfungen ${M.stunden(r.pruefung_min)}` }), h('td'), h('td'))));
}

function teilZeile(z) {
  const t = z.teil;
  const woche = Z.ansicht.links === 'woche' && (fertig() || schritt() > 2);
  const bw = woche ? bedarf.get(t.id) : null;
  let lage = lageText(z);
  if (bw && (!lage || !['st-kritisch', 'st-achtung'].includes(lage.kl))) {
    lage = bw.grund === 'kommt' ? { kl: 'st-kommt', s: 'uhr', t: 'Info fehlt — angenommen' }
      : bw.grund === 'wartet' ? { kl: 'st-kommt', s: 'uhr', t: 'wartet' }
      : bw.grund === 'waehlen' ? { kl: 'st-dran', s: 'stift', t: 'Gruppe wählen' }
      : bw.grund === 'planen' ? { kl: 'st-dran', s: 'stift', t: `${M.stunden(bw.offen_min)} diese Woche offen` } : null;
  }
  const soll = bw ? bw.soll_min : z.kontingent_min, ist = bw ? bw.ist_min : z.plan_min;
  const anteil = soll ? Math.min(1, ist / soll) : 1;
  const balken = h('div', { class: 'balken' }, h('i'));
  balken.firstChild.style.width = `${anteil * 100}%`;
  const wahl = !fertig() && schritt() === 2 && M.schrittVon(t) === 2;
  const gew = wahl && gewaehltVon(t);
  const zs = zustand(z);
  const standEl = wahl
    ? h('span', { class: `t-stand t-wahl ${gew ? 'gut' : (t.optionen || []).length ? 'st-dran' : 'st-kommt'}`, text: gew ? (z.alternativen === 'gewaehlt' ? 'gewählt ✓' : 'Wunsch') : (t.optionen || []).length ? 'wählen' : 'kommt noch' })
    : h('span', { class: `t-stand ${lage ? lage.kl : ''}`, title: bw ? 'diese Woche: im Plan / dran' : `im Plan ${M.stunden(z.plan_min)} von ${M.stunden(z.kontingent_min)} Kontingent${z.erledigt_min ? ` · erledigt ${M.stunden(z.erledigt_min)}` : ''}` },
      h('span', { text: `${M.stunden(ist).replace(' h', '')}/${M.stunden(soll)}` }), balken);
  return h('button', {
    class: `teil${Z.fokus === t.id ? ' fokus' : ''}`, type: 'button', 'data-act': 'teil', 'data-teil': t.id, 'data-status': z.status,
    'aria-expanded': String(Z.fokus === t.id),
  },
  h('span', { class: `t-sym k-${M.kategorie(t)}${t.art === 'praesenz' && !z.vk.length ? ' leer' : ''}`, title: { praesenz: 'Termin der Lehrveranstaltung', video: 'Video', selbst: 'Selbststudium', pruefung: 'Prüfungsvorbereitung' }[t.art] }, sym(M.istWahl(t) ? 'gruppen' : ART_SYM[t.art])),
  h('span', { class: 't-text' },
    h('span', { class: 't-name', text: t.titel }),
    h('span', { class: 't-form' }, zs.text ? h('span', { class: `t-zustand ${zs.kl}`, title: zs.titel || null, text: zs.text }) : null, formText(z)),
    lage ? h('span', { class: `t-lage ${lage.kl}` }, sym(lage.s), lage.t) : null),
  standEl,
  );
}

function teilKarte(z) {
  const t = z.teil;
  const k = h('div', { class: 't-karte' });
  const geordnet = [...z.flags].sort((a, b) => M.STUFEN.indexOf(a.stufe) - M.STUFEN.indexOf(b.stufe));
  if (geordnet.length) k.append(h('div', { class: 't-flaggen' }, ...geordnet.map(flaggeEl)));
  k.append(baumEl(z));
  if (z.einheiten && z.einheiten.length) k.append(einheitenEl(z));
  const akt = h('div', { class: 't-aktionen' });
  k.append(akt);
  const hier = M.schrittVon(t) === schritt();
  if (fertig() && z.topf === 'pruefung') {
    const X = Z.erg.pruefungen.get(t.pruefung);
    if (X) akt.append(h('button', { class: 'knopf klein', type: 'button', 'data-act': 'zu-pruefung', 'data-pruefung': X.id }, sym('ziel'), 'Unter Prüfungen planen'));
  } else if (fertig() && z.unregel) {
    akt.append(h('button', { class: 'knopf klein', type: 'button', 'data-act': 'zu-unregel', 'data-u': `u:${t.id}` }, sym('ziel'), 'Unter Prüfungen planen'));
  } else if (fertig()) {
    if (M.schrittVon(t) > 1 && M.schrittVon(t) <= 4) akt.append(h('button', { class: 'knopf klein', type: 'button', 'data-act': 'bearbeiten', 'data-schritt': String(M.schrittVon(t)), 'data-teil': t.id }, sym('stift'), `In Schritt ${M.schrittVon(t)} bearbeiten`));
  } else if (t.art !== 'praesenz' && hier && !z.wartet) {
    const vg = M.vorgabe(Z.erg, t.id);
    if (vg) akt.append(h('span', { class: 't-zahlen', text: `Vorgabe: ${vorgabeText(vg)}` }), ...legenKnoepfe(z, vg, Z.fort.get(t.id)));
  } else if (t.art !== 'praesenz' && !z.wartet && M.schrittVon(t) <= 4) {
    akt.append(h('button', { class: 'knopf klein', type: 'button', 'data-act': 'schritt', 'data-schritt': String(M.schrittVon(t)), 'data-teil': t.id, text: `In Schritt ${M.schrittVon(t)} planen` }));
  }
  // Zuteilung (MOSES, Tutorienanmeldung): erst gewünscht, dann angemeldet, dann zugeteilt — oder kein Platz.
  if (t.zuteilung && gewaehltVon(t)) {
    const a = !!(Z.stand.plan.angemeldet || {})[t.id], zu = (Z.stand.plan.zugeteilt || {})[t.id];
    akt.append(
      h('button', { class: `knopf klein${a ? ' an' : ''}`, type: 'button', 'data-act': 'angemeldet', 'data-id': t.id, text: a ? 'Angemeldet ✓' : 'Angemeldet?' }),
      h('button', { class: `knopf klein${zu === gewaehltVon(t).id ? ' an' : ''}`, type: 'button', 'data-act': 'zugeteilt', 'data-teil': t.id, text: zu === gewaehltVon(t).id ? `Zugeteilt: ${gewaehltVon(t).label.split(' · ')[0]} ✓` : `Zugeteilt: ${gewaehltVon(t).label.split(' · ')[0]}` }),
      h('button', { class: `knopf klein leise${zu === 'keine' ? ' an' : ''}`, type: 'button', 'data-act': 'kein-platz', 'data-teil': t.id, text: 'Kein Platz bekommen' }));
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
  k.append(...angabeFormulare(z));
  return k;
}

/** Der Weg eines Elements durch das Modell (Silas, 12.10.: „wie ist ein Modul strukturiert, was braucht ein Modul … was
 *  sind die Kontingente“): Posten und Topf, Zeitbindung, Alternativen, Info fehlt, Kontingent und Wochenwert, Lebenslauf,
 *  und woher die Angaben kommen. */
function baumEl(z) {
  const t = z.teil, m = z.modul, P = z.P, r = Z.erg.regeln;
  const box = h('div', { class: 'herkunft baum' }, h('b', { text: 'So wird gerechnet' }));
  const zeile = (k, v) => box.append(h('p', {}, h('span', { class: 'b-k', text: `${k}: ` }), v));
  if (P) zeile('Posten', `„${P.titel}“ ${P.posten.mult} × ${String(P.posten.h).replace('.', ',')} h = ${M.stunden(P.K)} (${m.quelle || `Modulbeschreibung #${m.nr}`}) · Topf ${P.topf === 'pruefung' ? 'Prüfungen' : 'Semester'}`);
  else if (z.topf === 'pruefung') zeile('Topf', `Prüfungen — ${t.art === 'pruefung' ? 'Vorbereitung' : 'Termin, der der Prüfung dient'}${t.pruefung ? ` (${Z.erg.pruefungen.get(t.pruefung)?.p.titel || t.pruefung})` : ''}`);
  const zb = { termin: 'Termin', fenster: 'im Fenster', unbekannt: 'unbekannt' }[z.zeitbindung] || '—';
  zeile('Zeitbindung', `${zb}${z.fenster && z.fenster.ab && z.zeitbindung !== 'termin' ? ` · ${datumMitTag(z.fenster.ab)} – ${datumMitTag(z.fenster.bis)}` : ''}`);
  if (z.alternativen) zeile('Alternativen', M.ZUSTAND[z.alternativen] || z.alternativen);
  if (z.info) zeile(z.info.wartet ? 'Wartet' : 'Info fehlt', `${z.info.frage}${z.info.quelle ? ` — nachsehen: ${z.info.quelle}` : ''} · Stichtag ${datumMitTag(z.info.stichtag)}`);
  // Das Kontingent dieses Elements und wie es entsteht.
  if (z.el === 'termin' || z.el === 'pruefungstermin') {
    const teile = [];
    if (z.termine_min) teile.push(`${M.stunden(z.termine_min)} Termine`);
    if (z.annahme_min) teile.push(`${M.stunden(z.annahme_min)} gewünscht (zählt erst nach der Zuteilung als verplant)`);
    if (z.erwartet_min) teile.push(`${M.stunden(z.erwartet_min)} erwartet (${t.erwartet.anzahl} × ${M.stunden(t.erwartet.dauer_min || r.erwartet_min)}, Annahme)`);
    const aus = z.vk.filter((v) => v.ausgefallen);
    zeile('Zeit', `${teile.join(' + ') || '—'}${aus.length ? ` · fällt aus: ${aus.map((v) => M.datumKurz(v.datum)).join(', ')}${aus.some((v) => v.ausgefallen === 'geschlossen') ? ' (TU geschlossen)' : ''}` : ''}`);
  } else if (z.el === 'einheiten') {
    zeile('Kontingent', `${M.stunden(z.einheiten_min)} = ${t.art === 'video' ? 'je Woche die Videolängen + Puffer' : `${z.einheiten ? z.einheiten.length : t.einheiten.anzahl} × ${M.stunden(t.einheiten.dauer_min)}`}${z.geschaetzt ? ' (Längen teils angenommen)' : ''}`);
  } else if (z.el === 'rest' && P) {
    const andere = P.elemente.filter((x) => x !== z && x.el !== 'rest');
    zeile('Kontingent', `${M.stunden(z.kontingent_min)}${andere.length ? ` = ${M.stunden(P.K)} − ${andere.map((x) => `${x.teil.titel} ${M.stunden(x.kontingent_min)}`).join(' − ')}` : ''}`);
    if (z.wartet) zeile('Wochenwert', 'noch keiner — das Fenster beginnt mit dem ersten Termin');
    else if (z.einzeln) zeile('Wochenwert', 'keiner — ein einmaliger Posten: einzelne Blöcke');
    else zeile('Wochenwert', `(${M.stunden(z.kontingent_min)} − ${M.stunden(z.erledigt_min)} erledigt) ÷ ${z.restwochen} Vorlesungswochen = ${M.stunden1(z.wochenwert_min)} je Woche`);
  } else if (z.el === 'vorbereitung') {
    zeile('Kontingent', `${M.stunden(z.kontingent_min)} — geplant wird unter „Prüfungen“`);
  }
  if (z.el !== 'vorbereitung') {
    const unb = z.vk.filter((v) => v.ist === 'offen').length;
    zeile('Lebenslauf', `im Plan ${M.stunden(z.plan_min)} · erledigt ${M.stunden(z.erledigt_min)} (✓)${unb ? ` · ${unb} vorbei ohne ✓/✗` : ''}`);
  }
  if (P && P.audit) zeile('Abgleich', h('span', {}, auditChip(P), ` ${P.art === 'praesenz' ? `Termine und Videos ${M.stunden(P.audit.basis_min)}` : `geplant ${M.stunden(P.audit.basis_min)}`} gegen ${M.stunden(P.K)} (Toleranz ${M.stunden(P.audit.tol_min)})${P.g5_min ? ` — ${M.stunden(P.g5_min)} gehen in die Vorbereitung (G5)` : ''}`));
  if (t.annahme) box.append(h('p', { class: 'gelb', text: `Annahme: ${t.annahme}` }));
  if (t.quelle) box.append(h('p', { class: 'quelle', text: `Quelle: ${t.quelle}` }));
  const opt = gewaehltVon(t);
  if (opt && opt.quelle && opt.quelle !== t.quelle) box.append(h('p', { class: 'quelle', text: `Gewählte Gruppe: ${opt.quelle}` }));
  return box;
}

/** Jedes Video (jede Einheit) mit Woche, Freigabe und — bei Videos — der Länge zum Eintragen. Mit Quote (TECHGI-Quiz)
 *  je Einheit ✓/✗: Jede verpasste zählt gegen die 80 %. */
function einheitenEl(z) {
  const t = z.teil, video = t.art === 'video';
  const quote = !!t.quote;
  const ist = Z.stand.plan.ist || {};
  const tabelle = h('div', { class: 'einheiten' });
  for (const g of z.gruppen || []) {
    const w = M.wocheVon(Z.erg.wochen, g.ab);
    tabelle.append(h('div', { class: 'eh-woche' }, h('b', { text: w ? w.kurz : M.datumKurz(g.ab) }), h('span', { text: ` ab ${datumMitTag(g.ab)}${g.bis ? ` bis ${datumMitTag(g.bis)}` : ''}` }),
      g.bedarf_min ? h('span', { text: ` · braucht ${M.stunden(g.bedarf_min)}${g.geschaetzt ? ' (geschätzt)' : ''}` }) : null,
      h('span', { class: g.bloecke.length ? (g.bedarf_min && g.belegt_min < g.bedarf_min ? 'gelb' : 'gut') : 'rot', text: g.bloecke.length ? ` · ${M.stunden(g.belegt_min)} eingeplant` : ' · ohne Block' })));
    for (const e of g.einheiten) {
      const i = (z.einheiten || []).indexOf(e);
      const key = `${t.id}#${e.nr}`;
      const s = (M.istEintrag(ist[key]) || {}).s;
      tabelle.append(h('div', { class: `eh-zeile${e.unsicher ? ' unsicher' : ''}`, title: [e.quelle, e.unsicher, e.offen].filter(Boolean).join('\n') },
        h('span', { class: 'eh-nr', text: String(e.nr) }),
        h('span', { class: 'eh-titel', text: `${e.titel || (video ? 'Video' : 'Einheit')}${e.bis ? ` · bis ${datumMitTag(e.bis)}${e.bis_zeit ? ` ${e.bis_zeit}` : ''}` : ''}` }),
        video ? h('label', { class: 'eh-laenge' }, h('input', { type: 'number', min: '1', step: '1', inputmode: 'numeric', value: e.laenge_min ?? '', placeholder: '?', 'data-einheit': `${t.id}:${i}`, 'aria-label': `Länge von ${e.titel || `Video ${e.nr}`} in Minuten` }), 'min')
          : quote ? h('span', { class: 'eh-ist' },
            h('button', { type: 'button', class: `knopf klein${s === 'ja' ? ' an' : ''}`, 'data-act': 'einheit-ist', 'data-id': key, 'data-wert': 'ja', title: 'gemacht', text: '✓' }),
            h('button', { type: 'button', class: `knopf klein${s === 'nein' ? ' an rot' : ''}`, 'data-act': 'einheit-ist', 'data-id': key, 'data-wert': 'nein', title: 'verpasst — zählt gegen die Quote', text: '✗' }))
            : h('span')));
    }
  }
  const q = quote ? Z.erg.quoten.find((x) => x.z === z) : null;
  return h('details', { class: 'klappe', open: quote && q && q.verpasst ? true : null },
    h('summary', { text: `${z.einheiten.length} ${video ? 'Videos' : 'Einheiten'} in ${(z.gruppen || []).length} Wochen${video ? ` — Längen ${z.einheiten.filter((e) => e.laenge_min != null).length}/${z.einheiten.length} bekannt` : ''}${q ? ` — ${q.verpasst} verpasst, höchstens ${Math.round(q.hoechstens * 100)} % (nötig ${Math.round(q.anteil * 100)} %)` : ''}` }),
    tabelle);
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

/** Der Stand eines Schritts für den Schrittknopf (V-0354, Silas: „wenn ich bei einem Schritt alles gewählt habe, was ich
 *  wählen kann, aber es sind noch Wahlen offen, dann soll … ein gestrichelter Kreis mit Haken kommen in grün“): eine Zahl,
 *  solange Bekanntes offen ist (rot, wenn darunter etwas kritisch ist), der gestrichelte Haken, wenn nur noch Unbekanntes
 *  fehlt (grau im Balken), und der volle grüne Haken erst bei 100 %. */
function schrittStand(s) {
  const f = schrittFort(s.nr);
  const offen = f.je.filter((x) => x.f.status === 'offen').length;
  const wort = s.nr === 2 ? 'zu wählen' : s.nr >= 3 ? 'zu legen' : 'zu tun';
  if (offen) return { kl: s.zaehler.kritisch ? 'st-kritisch' : 'st-dran', text: String(offen), titel: `${prozent(f)} — ${offen} ${wort}${s.zaehler.kritisch ? `, ${s.zaehler.kritisch} kritisch` : ''}` };
  if (f.status === 'unbekannt') return { kl: 'fertig-teil', text: '✓', titel: `${prozent(f)} — alles, was du jetzt wählen oder legen kannst, ist erledigt; ${M.stunden(f.grau)} kommen noch (grau)` };
  return { kl: 'fertig', text: '✓', titel: '100 % — alles erledigt' };
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
    // Woche und Prüfungen stehen als Hauptreiter oben links (V-0338).
    h('button', { type: 'button', class: `knopf leise${b === 'offen' ? ' an' : ''}`, 'data-act': 'bereich', 'data-bereich': 'offen' }, 'Offen', rot ? h('span', { class: 'zahl', text: String(rot) }) : null),
    h('button', { type: 'button', class: `knopf leise${b === 'abgleich' ? ' an' : ''}`, 'data-act': 'bereich', 'data-bereich': 'abgleich', text: 'Abgleich' }),
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
    if (std) titel.append(h('b', { text: 'Standardwoche' }), h('span', { title: 'Mittel der 16 Vorlesungswochen; die Aufwandstabellen nennen je Woche die Posten mit Multiplikator 15', text: `Ø ${M.stunden(Math.round(Z.mittel.belegt / 15) * 15)} belegt je Vorlesungswoche · laut Tabellen ${M.stunden(Z.erg.summe.woche_min)} · Grenze ${Z.erg.regeln.woche_h} h` }));
    else {
      const art = w.art === 'vorlesung' ? `Vorlesungswoche ${w.nr}` : w.art === 'frei' ? 'Vorlesungsfrei' : 'Prüfungszeit';
      // Die Last der Woche (G8): was liegt — Termine, Blöcke, Prüfungen — und der Bedarf, den noch kein Block deckt.
      const l = Z.erg.last.wochen.get(w.id) || { termine: 0, bloecke: 0, pbloecke: 0, pruefung: 0, bedarf: 0, summe: 0 };
      const ueber = l.summe > Z.erg.regeln.woche_h * 60;
      titel.append(h('b', { text: `${w.kurz} · ${M.datumKurz(w.von)}–${M.datumKurz(w.bis)}` }),
        h('span', { class: ueber ? 'rot' : null, title: `Termine ${M.stunden(l.termine + l.pruefung)} · Blöcke ${M.stunden(l.bloecke + l.pbloecke)} · noch ohne Block ${M.stunden(l.bedarf)}`, text: `${art} · ${M.stunden(l.summe)} von ${Z.erg.regeln.woche_h} h${l.bedarf >= 30 ? ` (davon ${M.stunden(l.bedarf)} noch ohne Block)` : ''}` }));
    }
    if (b === 'pruefplan') {
      fuellen(titel, h('b', { text: std ? 'Vorlesungszeit · Prüfungsvorbereitung' : titel.firstChild.textContent }),
        h('span', { text: std ? 'Dein Stundenplan ist gesperrt (grau) — leg Vorbereitung davor, danach, am Wochenende; in der Standardwoche jede Woche bis zur Prüfung' : `Prüfungsvorbereitung · ${titel.lastChild.textContent}` }));
      dazu(h('button', { class: 'knopf', type: 'button', 'data-act': 'bereich', 'data-bereich': 'frei' }, sym('links'), 'Prüfungen'), titel, rueck, ansicht(std), nav(wo.filter((x) => x.art === 'vorlesung'), Z.ansicht.woche, std));
    } else {
      // Woche bestätigen (G6): alles Vergangene dieser Woche ohne ✓/✗ auf einmal abhaken.
      const w = wo.find((x) => x.id === Z.ansicht.woche);
      const offen = !std && w ? Z.erg.vorkommen.filter((v) => v.ist === 'offen' && v.datum >= w.von && v.datum <= w.bis) : [];
      dazu(titel, rueck, offen.length ? h('button', { class: 'knopf', type: 'button', 'data-act': 'woche-bestaetigen', 'data-woche': w.id, title: 'Alles Vergangene dieser Woche ohne ✓ oder ✗ als erledigt abhaken — einzeln: Klick auf die Kachel' }, sym('ok'), `${offen.length}× ✓`) : null, ansicht(std), nav(wo, Z.ansicht.woche, std));
    }
  } else if (b === 'frei') {
    const ps = M.phasen(Z.erg.sem).filter((p) => p.id !== 'vorlesung');
    const xs = [...Z.erg.pruefungen.values()];
    const vor = xs.reduce((s, X) => s + X.vorschlag.reduce((a, v) => a + v.min, 0), 0);
    titel.append(h('b', { text: 'Prüfungen und Prüfungsvorbereitung' }), h('span', { text: `Prüfungs-Topf ${M.stunden(Z.erg.summe.pruefung_min)} · Vorschlag ${M.stunden(vor)} · ${ps.map((p) => `${M.datumKurz(p.von)}–${M.datumKurz(p.bis)}`).join(' und ')} vorlesungsfrei` }));
    dazu(titel, rueck);
  } else if (b === 'offen') {
    titel.append(h('b', { text: 'Offen' }), h('span', { text: 'Was zu tun ist, was zu entscheiden ist, und wo die Augen offen bleiben — mit Stichtag' }));
    dazu(titel, rueck);
  } else if (b === 'abgleich') {
    titel.append(h('b', { text: 'Abgleich' }), h('span', { text: 'Die Aufwandstabellen gegen die Wirklichkeit — nur prüfend, es rechnet nichts um außer G5' }));
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
    const wo = Z.legen.einzeln
      ? (rasterLage().std ? 'liegen soll — einzeln, also in einer echten Woche (oben die Woche wählen)' : 'an diesem Tag liegen soll — einzeln, dann die nächste Woche wählen')
      : Z.legen.pruefung
      ? (rasterLage().std ? `jede Woche${Z.legen.bis ? ` bis zur Prüfung (${M.datumKurz(Z.legen.bis)})` : ''} liegen soll — in einer echten Woche nur an dem Tag` : 'an diesem Tag liegen soll — in der Standardwoche jede Woche')
      : `${Z.legen.alle > 1 ? `alle ${Z.legen.alle} Wochen` : 'jede Woche'} liegen soll`;
    fuellen(b, h('span', { text: `${M.kurz(z.modul)} · ${z.teil.titel}: Der Block (${M.stunden(Z.legen.dauer)}) hängt am Zeiger — klick, wo er ${wo}${Z.legen.rest > 1 ? ` (noch ${Z.legen.rest})` : ''}. Grün ist frei${!fertig() && schritt() === 4 ? ', kräftig zwischen 10 und 18 Uhr' : ''}${(geo && geo.thema || []).some((t) => t && t.length) ? '; gerahmt: direkt beim Stoff, dort bleibt am meisten hängen' : ''}.${geo && !(geo.thema || []).some((t) => t && t.length) && (geo.themaZu || []).length ? ` ${geo.themaZu[0]} — verschieb das, oder leg den Block so nah wie möglich danach.` : ''}${Z.legen.ab ? ` Er beginnt ${datumMitTag(Z.legen.ab)} — vorher gibt es ${z.teil.art === 'video' ? 'kein Video' : 'noch keinen Stoff'}.` : ''} Esc bricht ab.` }),
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
  const X = gewaehlteX();
  if (X && ['frei', 'pruefplan'].includes(Z.ansicht.bereich)) {
    b.className = 'banner';
    fuellen(b, h('span', { text: `${M.kurz(X.modul)} · ${X.p.titel}: ${M.stunden(X.erledigt_min + X.geplant_min)} von ${M.stunden(X.zu_planen_min)} gelegt${X.offen_min >= 30 ? `, ${M.stunden(X.offen_min)} offen` : ''}. ${Z.ansicht.bereich === 'pruefplan' ? 'Klick ins Raster legt hier einen Block.' : 'Im Kalender: Tipp legt einen Lernblock (noch ein Tipp nimmt ihn heraus), Ziehen nach unten wählt die Stunden.'}` }),
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
      const k = { ...o, schritt: 2, lage: 'jetzt', alternative: !!gewaehlt };
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
  // Die Fahrzeit vor dem ersten Termin (8:15 − 40 min) soll noch im Raster stehen.
  const fahrt = (k) => (['termin', 'pruefung', 'einzel'].includes(k.art) ? Z.erg.regeln.pendeln_min : 0);
  for (const k of kacheln) { h0 = Math.min(h0, Math.floor((k.start - fahrt(k)) / 60)); h1 = Math.max(h1, Math.ceil((k.ende + fahrt(k)) / 60)); }
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
      if (z.teil.vorbereitung_auf) continue; // ihr „ab“ ist die Übung davor, keine Freigabe (V-0354)
      // Freigaben dort, wo sie etwas entscheiden: Videos in Schritt 3, Quizze und Blätter in Schritt 4 (V-0345: nicht
      // mehr in Schritt 1 — dort steht nur, was fest ist).
      const sch = M.schrittVon(z.teil);
      if (!fertig() && sch !== schritt()) continue;
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
  // Fahrzeit (V-0338): 40 min vor dem ersten und nach dem letzten Termin vor Ort, nur zum Sehen — grau gestrichelt,
  // ohne Klick, sie sperrt nichts (M.fahrzeiten).
  const fahrten = [];
  for (let d = 0; d < tage; d++) {
    const vorOrt = kacheln.filter((k) => k.tag === d && ['termin', 'pruefung', 'einzel'].includes(k.art))
      .map((k) => ({ start: k.start, ende: k.ende, ort: k.ort, online: k.v && k.v.online }));
    for (const [a, b] of M.fahrzeiten(vorOrt, Z.erg.regeln)) fahrten.push({ tag: d, start: Math.max(a, h0 * 60), ende: Math.min(b, h1 * 60) });
  }
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
  // Fahrzeit und Mittagspause liegen ÜBER den Kacheln (durchsichtig, ohne Klick): Die Fahrt nach Hause lag sonst unter
  // dem Block, der direkt nach der letzten Vorlesung beginnt, und war nicht zu sehen (V-0340, Silas: „nach den
  // Präsenzmodulen kommt keine mehr“).
  const zeigen = (d, a, b, kl, text, titel, attrs = {}) => {
    if (b - a < 10) return;
    const el = h('div', { class: kl, title: titel, 'aria-hidden': 'true', ...attrs }, h('span', { text }));
    el.style.top = `${((a - h0 * 60) / ((h1 - h0) * 60)) * 100}%`;
    el.style.height = `${((b - a) / ((h1 - h0) * 60)) * 100}%`;
    spaltenEl[d].append(el);
  };
  for (const f of fahrten) zeigen(f.tag, f.start, f.ende, 'fahrt', 'Fahrzeit', `Fahrzeit ${Z.erg.regeln.pendeln_min} min`);
  // Mittagspause (V-0340): Mo–Fr 45 min im ersten freien Fenster 11:30–14:30, sonst um 12:30 — nur zum Erinnern. Nicht
  // in der Fahrzeit und nur in echten Wochen; dort lässt sie sich am Schild ziehen, je Tag, auch festgelegt (V-0345,
  // Silas: „leicht verschieben, auch wenn man gerade nicht den Stundenplan bearbeitet … pro Woche einzeln … in der
  // Standardwoche gar nicht“). Gezogen steht sie in plan.mittag[datum]; ein Doppelklick aufs Schild lässt sie wieder frei.
  for (let d = 0; d < Math.min(5, tage) && !std; d++) {
    const datum = M.plusTage(w.von, d);
    const belegt = [...kacheln.filter((k) => k.tag === d && k.art !== 'option').map((k) => [k.start, k.ende]),
      ...fahrten.filter((f) => f.tag === d).map((f) => [f.start, f.ende])];
    const fest = (Z.stand.plan.mittag || {})[datum];
    const [a, b] = M.mittagspause(belegt, Z.erg.regeln, fest ? M.min(fest) : null);
    if (a >= h0 * 60 && b <= h1 * 60) zeigen(d, a, b, `mittag${fest ? ' fest' : ''}`, 'Mittag', `Mittagspause ${Z.erg.regeln.mittag_min} min — am Schild ziehen zum Verschieben${fest ? ', Doppelklick: wieder automatisch' : ''}; darf überplant werden`, { 'data-datum': datum, 'data-start': String(a) });
  }
  if (!std && heute() >= w.von && heute() <= w.bis) {
    const d = M.wochentag(heute()), m = jetztMin();
    if (d < tage && m > h0 * 60 && m < h1 * 60) { const l = h('div', { class: 'r-jetzt' }); l.style.top = `${((m - h0 * 60) / ((h1 - h0) * 60)) * 100}%`; spaltenEl[d].append(l); }
  }
  // Hängt ein Block am Zeiger: freie Plätze je Tag (M.freieFenster) grün; in Schritt 4 kräftiger, was zwischen 10 und
  // 18 Uhr liegt (Silas: „automatisch geguckt, wo freie Plätze sind … zwischen 10 und 18 Uhr immer preferred“).
  geo.frei = [];
  geo.thema = [];
  geo.themaZu = [];
  if (Z.legen) {
    const [fa, fe] = (pruefplan() ? Z.erg.regeln.pruef_fenster : Z.erg.regeln.tag_fenster).map(M.min);
    const [pa, pe] = Z.erg.regeln.evl_fenster.map(M.min);
    // Beim Stoff (V-0342, Silas: „eine Logik …, die einem beim Erstellen hilft, dass man thematisch die Dinge gut
    // zusammen gruppiert“): Für einen Lernblock sind die freien Plätze direkt nach einem Termin oder Videoblock seines
    // Stoffs (M.rechnen 6b, stoff_teile) — und direkt vor einer Präsenz — gerahmt und beschriftet; der Block rastet dort
    // ein. Nur, wo der Stoff derselben Lehrveranstaltung Termine hat (sonst sagt der Bezug nichts).
    const zl = Z.erg.teile.get(Z.legen.teil);
    const stoff = zl && zl.teil.art === 'selbst' && !Z.legen.pruefung ? new Set(zl.stoff_teile || []) : new Set();
    const eigen = stoff.size > 0 && zl.stoff_eigen;
    // Einzelne Blöcke (V-0345) nur an Tagen, an denen es etwas zu tun gibt: mit Einheiten, solange eine offen ist.
    const erlaubt = Z.legen.einzeln && !std ? legenErlaubt() : null;
    for (let d = 0; d < tage; d++) {
      const band = (x, y, kl, text) => {
        const el = h('div', { class: kl }, text ? h('span', { text }) : null);
        el.style.top = `${((x - h0 * 60) / ((h1 - h0) * 60)) * 100}%`; el.style.height = `${((y - x) / ((h1 - h0) * 60)) * 100}%`;
        spaltenEl[d].prepend(el);
      };
      if (erlaubt && !erlaubt(M.plusTage(w.von, d))) {
        geo.frei[d] = [];
        band(h0 * 60, h1 * 60, 'tag-zu', zl.einheiten ? 'nichts offen' : 'noch kein Stoff');
        continue;
      }
      const belegt = kacheln.filter((k) => k.tag === d && k.art !== 'option').map((k) => [k.start, k.ende]);
      const fenster = M.freieFenster(belegt, Z.legen.dauer, Math.max(fa, h0 * 60), Math.min(fe, h1 * 60));
      geo.frei[d] = fenster;
      for (const [a, b] of fenster) {
        band(a, b, 'frei-fenster');
        const x = Math.max(a, pa), y = Math.min(b, pe);
        if (!fertig() && schritt() === 4 && y - x >= Z.legen.dauer) band(x, y, 'frei-fenster bevorzugt');
      }
      if (!eigen) continue;
      const passt = (x, y) => fenster.some(([a, b]) => x >= a && y <= b);
      const dauer = Z.legen.dauer;
      const thema = [];
      for (const k of kacheln) {
        if (k.tag !== d || !stoff.has(k.teil)) continue;
        const z = Z.erg.teile.get(k.teil);
        const istVideo = k.art === 'block' && z.teil.art === 'video' && (geo.std || (k.v && k.v.zaehlt_min > 0));
        if (k.art !== 'termin' && !istVideo) continue;
        const name = `${M.kurz(z.modul)} · ${z.teil.titel}`;
        const nach = Math.ceil(k.ende / RASTER_MIN) * RASTER_MIN;
        if (passt(nach, nach + dauer)) thema.push([nach, nach + dauer, `direkt nach ${name}`]);
        else {
          // Belegt: sagen, was dort liegt — vielleicht ist das das Verschiebbare (Silas' EINFWI-Video Di 12–14, danach Labs).
          const im = kacheln.filter((x) => x.tag === d && x !== k && x.art !== 'option' && x.start < nach + dauer && nach < x.ende);
          const wer = [...new Set(im.map((x) => { const zz = x.teil && Z.erg.teile.get(x.teil); return zz ? `${M.kurz(zz.modul)} · ${zz.teil.titel}` : (x.v && x.v.titel) || 'ein Termin'; }))];
          if (wer.length) geo.themaZu.push(`Direkt nach ${name} (${M.TAGE[d]} ${uhr(nach)}) liegt schon ${wer.join(', ')}`);
        }
        const vor = Math.floor(k.start / RASTER_MIN) * RASTER_MIN - dauer;
        if (k.art === 'termin' && passt(vor, vor + dauer)) thema.push([vor, vor + dauer, `direkt vor ${name}`]);
      }
      geo.thema[d] = thema.filter((t, i) => !thema.slice(0, i).some((u) => u[0] < t[1] && t[0] < u[1]));
      for (const [x, y, text] of geo.thema[d]) band(x, y, 'frei-fenster thema', text);
    }
  }
  fuellen(raster, zeiten, ...spaltenEl);
}

/** Wo ein Block meistens zu seinem Stoff liegt (V-0342, M.rechnen 6b): die häufigste Lage seiner zählenden
 *  Vorkommen, mit dem Satz einer Woche in dieser Lage. null, wenn nichts zählt oder der Bezug offen ist (die Übung,
 *  die er nachbereitet, hat noch keine Zeiten). */
function bezugVon(vks) {
  const mit = vks.filter((v) => v.zaehlt_min > 0 && v.bezug && v.bezug.lage !== 'offen');
  if (!mit.length) return null;
  const zahl = new Map();
  for (const v of mit) zahl.set(v.bezug.lage, (zahl.get(v.bezug.lage) || 0) + 1);
  const lage = [...zahl].sort((a, b) => b[1] - a[1])[0][0];
  return { lage, text: mit.find((x) => x.bezug.lage === lage).bezug.text, weit: lage === 'fern' || lage === 'ohne' };
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
  // Unregelmäßiges (V-0354) liegt unter „Prüfungen“ (Schritt 5), ist aber Lernen oder Video, keine Prüfung.
  const zu = k.art === 'block' && k.teil ? Z.erg.teile.get(k.teil) : null;
  const etikett = k.art === 'block' ? (zu && zu.unregel ? (zu.teil.art === 'video' ? 'Video' : 'EVL') : M.ETIKETT[k.schritt]) : 'Präsenz';
  const online = k.art !== 'block' && /online|zoom|webex/i.test(`${k.ort || ''} ${(k.v && k.v.online) || ''}`);
  const n = geo.std ? k.anzahl : k.v ? k.v.rest : k.rest;
  const gesamt = geo.std ? k.anzahl : k.v ? k.v.gesamt : null;
  const titel = n == null ? '' : gesamt === 1 ? 'einmalig — wiederholt sich nicht' : geo.std ? `${n}× im Semester` : `noch ${n}× bis Semesterende (dieser eingeschlossen)${gesamt ? `, insgesamt ${gesamt}×` : ''}`;
  // Das Etikett steht senkrecht an der rechten Kante — es nimmt dem Titel keinen Platz. Kurze Kacheln (unter 75 min)
  // tragen nur den Anfangsbuchstaben.
  const lang = k.ende - k.start >= 75;
  return {
    etikett: h('i', { class: `k-etikett e-${{ Präsenz: 'praesenz', Video: 'video', Prüfung: 'pruefung' }[etikett] || 'evl'}`, title: `${etikett}${online ? ' (online)' : ''}`, text: lang ? etikett : etikett[0] }),
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
  let marke = null, markeKl = 'rot', act = null, bezug = null;
  if (k.art === 'termin') {
    // Präsenz mit leicht roter Umrandung (Silas, 12.10.: „Präsenztermine sollen im Planner eine leicht rote Outline bekommen,
    // sodass man sie besser erkennt“). Eigene Klasse t-praesenz, nicht k-praesenz: Eine Klasse an .kachel darf keine Regel
    // ohne .kachel haben (Test, V-0345) — .k-praesenz trägt die Farbtokens auch links.
    if (z && z.topf !== 'pruefung') kl.push('t-praesenz');
    if (k.reihe && geo.std) {
      // t-reihe, nicht „reihe“: Die Klasse hatte schon die geführte Liste links (margin-top 8 px) — die Kachel rutschte
      // dadurch 10 min unter ihre Zeit, weg von der Fahrzeit (V-0345). Ein Test hält Kachel-Klassen frei von anderen Regeln.
      kl.push('t-reihe');
      const naechster = k.vk.find((v) => v.datum >= heute());
      zeile2 = `${zeitspanne(k.start, k.ende)}${naechster ? ` · nächster ${M.datumKurz(naechster.datum)}` : ''}`;
    }
    if (k.v && k.v.titel) zeile2 = `${zeitspanne(k.start, k.ende)} · ${k.v.titel}`;
    if (k.schicht === 'B') { kl.push('gewaehlt'); const o = z && (z.teil.optionen || []).find((x) => x.id === (k.option || (k.v && k.v.option))); if (o) zeile2 = o.label; }
    // Unregelmäßig (V-0354): seltener als jede zweite Vorlesungswoche (BuK-VL 6×) gehört nicht zum Gerüst der Standardwoche —
    // es steht nur als Umriss da, weil es den Platz an seinen Tagen sperrt. Die Gruppe, die in Schritt 2 gerade gewählt
    // wird, bleibt voll sichtbar.
    if (k.unregel && geo.std && !(schritt() === 2 && !fertig() && k.lage === 'jetzt')) { kl.push('t-unregel'); zeile2 = `${zeitspanne(k.start, k.ende)} · unregelmäßig`; }
    if (k.unsicher) kl.push('unsicher');
    // Gewünscht, aber noch nicht zugeteilt (MOSES): steht als Arbeitsannahme da, zählt nicht als verplant (V-0349).
    if ((k.v && k.v.annahme) || (geo.std && k.annahme)) { kl.push('wunsch'); marke = 'Wunsch'; markeKl = 'hinweis'; }
    // Fällt aus (TU geschlossen, abgesagt): durchgestrichen, sperrt nichts.
    if (k.v && k.v.ausgefallen) { kl.push('ausgefallen'); zeile2 = k.v.ausgefallen === 'geschlossen' ? 'fällt aus — TU geschlossen' : 'fällt aus'; }
    // Eine gewählte Gruppe aus einem früheren Schritt: Klick springt kurz zurück; hellgrau im selben Schritt: wird dran.
    act = k.lage === 'frueher' && k.schicht === 'B' && !fertig() ? 'kurz-zurueck' : k.lage === 'erledigt' ? 'jetzt' : 'kachel-teil';
    // Schritt 2: Die gewählte Gruppe der Sache, die dran ist, wählt ein Klick wieder ab (V-0345).
    if (!fertig() && schritt() === 2 && k.schicht === 'B' && k.lage === 'jetzt') { act = 'abwaehlen'; marke = null; }
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
      if (k.v.flags.includes('vor_stoff')) { kl.push('zaehlt-nicht'); zeile2 = 'zählt nicht: vor dem ersten Stoff'; }
      if (k.v.flags.includes('nach_pruefung')) { kl.push('zaehlt-nicht'); zeile2 = 'zählt nicht: nach der Prüfung'; }
      if (k.v.einheit && !kl.includes('gesperrt')) zeile2 = `${z.teil.art === 'video' ? 'Video' : 'Einheit'} ${k.v.einheit} · ${zeile2}`;
    }
    // Bezug zum Stoff (V-0342): weit weg → eine kleine Marke; der Satz steht im Tooltip.
    bezug = z && z.teil.art === 'selbst' ? bezugVon(k.vk || []) : null;
    if (bezug && bezug.weit && !kl.includes('zaehlt-nicht') && !kl.includes('gesperrt')) { marke = 'weit vom Stoff'; markeKl = 'hinweis'; }
    // Nur Blöcke des gezeigten Schritts lassen sich ziehen; ein früherer springt in seinen Schritt zurück, festgelegt
    // zeigt ein Klick den Bestandteil.
    act = k.lage === 'jetzt' ? 'block' : k.lage === 'frueher' ? (fertig() ? 'kachel-teil' : 'kurz-zurueck') : k.lage === 'erledigt' ? 'jetzt' : 'kachel-teil';
  } else if (k.art === 'option') {
    kl.push('option');
    // Ist schon eine Gruppe gewählt, stehen die anderen blass daneben (V-0345, Silas: „die anderen sollen nur verblassen
    // und grauer werden, aber in einem anderen Farbton als die im vorherigen Schritt gewählten“).
    if (k.alternative) kl.push('alternative');
    titel = `${M.kurz(m)} · ${z.teil.titel} ${k.alternative ? 'umwählen' : 'wählen'}`;
    zeile2 = k.label;
    if (k.kollision) marke = `trifft ${k.kollision}× einen Termin`;
    act = 'option';
  } else if (k.art === 'pruefung') {
    kl.push('pruefung'); titel = `${M.kurz(m)} · ${k.v.titel}`;
  } else {
    kl.push('einzel'); titel = `${m ? `${M.kurz(m)} · ` : ''}${k.v.titel}`;
  }
  if (flags.has('konflikt')) kl.push('konflikt');
  // Lebenslauf (G6, Silas, 12.10.: „bei den Sachen, die in der Vergangenheit liegen, soll einfach ein Haken kommen … oder
  // ein X … und daneben drei Punkte: verschieben, Hälfte gemacht“): Vergangenes zeigt ✓, ✗, ½ oder „?“ (noch offen), und
  // ein Klick öffnet die Karte dazu.
  const ist = !geo.std && k.v && (k.art === 'termin' || k.art === 'block') && k.v.ist && k.v.ist !== 'ausgefallen' ? k.v.ist : null;
  if (ist) {
    kl.push(`ist-${ist}`);
    if (k.lage !== 'jetzt' || k.v.vergangen) act = 'ist';
  }
  // Fokus: Was nicht zum fokussierten Teil (oder Modul) gehört, tritt zurück.
  // Die Prüfung, auf die ein fokussierter Lernblock zielt, bleibt sichtbar.
  // Das Graue früherer Schritte bleibt, wie es ist (Silas: „die Grundlagen sollen weiterhin ausgegraut sein“).
  const zielPruefung = fz && k.art === 'pruefung' && k.v && fz.teil && fz.teil.pruefung === k.v.pruefung;
  if (k.lage !== 'frueher' && fz && k.teil !== fz.teil.id && !zielPruefung) kl.push('blass');
  if (k.lage !== 'frueher' && Z.fokus && Z.fokus.startsWith('modul:') && k.modul !== Z.fokus.slice(6)) kl.push('blass');
  if (Z.hell && k.vk && k.vk.some((v) => v.id === Z.hell)) kl.push('hell');
  if (Z.leuchten && k.art === 'block' && k.teil === Z.leuchten) kl.push('leuchten');
  const tip = [titel, zeile2,
    act === 'abwaehlen' ? 'gewählt — ein Klick wählt ab, dann stehen alle Gruppen wieder da' : null,
    k.lage === 'frueher' ? `steht schon (Schritt ${k.schritt})${(k.art === 'block' || k.schicht === 'B') && !fertig() ? ' — Klick: kurz dorthin zurück' : ''}` : k.lage === 'erledigt' ? 'schon gewählt — Klick: ändern' : null,
    bezug ? `${geo.std ? 'meist ' : ''}${bezug.text}${bezug.weit ? ' — weit weg vom Stoff, direkt danach bleibt mehr hängen' : ''}` : null,
    ...(k.vk || []).flatMap((v) => v.flags).filter((x, i, a) => a.indexOf(x) === i).map((f) => ({ konflikt: 'Überschneidung', gesperrt: 'liegt auf einem Termin (gesperrt)', leer: 'kein Video in dieser Woche', vor_stoff: 'vor dem ersten Stoff des Moduls — zählt nicht', nach_pruefung: 'nach der Prüfung' }[f]))].filter(Boolean).join('\n');
  const tags = kachelTags(k);
  const el = h(act === 'block' ? 'div' : act ? 'button' : 'div', {
    class: kl.join(' '), type: act && act !== 'block' ? 'button' : null, 'data-act': act, 'data-teil': k.teil || null,
    'data-block': k.block || null, 'data-option': k.option || null, 'data-datum': k.datum || null, 'data-schritt': act === 'kurz-zurueck' ? String(k.schritt) : null,
    'data-vk': act === 'ist' ? k.v.id : null,
    title: ist ? `${tip}\n${{ ja: '✓ erledigt', nein: '✗ nicht gemacht', teil: 'teilweise', verschoben: 'verschoben', offen: 'vorbei — noch ohne ✓ oder ✗' }[ist]} — Klick: ✓, ✗ oder …` : tip, tabindex: act === 'block' ? '0' : null,
  }, h('b', { text: titel }), h('span', { class: 'k-zwei' }, tags.anzahl, zeile2), tags.etikett, marke ? h('span', { class: `k-marke ${markeKl}`, text: marke }) : null,
  ist ? h('span', { class: `k-ist i-${ist}`, text: { ja: '✓', nein: '✗', teil: '½', verschoben: '→', offen: '?' }[ist] }) : null);
  if (act === 'block') el.append(h('span', { class: 'k-griff', 'data-griff': '1' }));
  return el;
}

function fussZeichnen() {
  // Die Legende (V-0332, V-0333): Etikett und Wiederholungen, die Arten (eine Farbe je Art, das Modul als Streifen
  // links) und nur die Formen, die im gezeigten Schritt vorkommen.
  const n = schritt();
  const form = (kl, text) => h('span', { class: 'legende' }, h('i', { class: kl }), text);
  fuellen($('p-fuss'), [
    h('span', { class: 'legende' }, h('i', { class: 'k-etikett e-praesenz', text: 'Präsenz' }), h('i', { class: 'k-etikett e-video', text: 'Video' }), h('i', { class: 'k-etikett e-evl', text: 'EVL' }), fertig() ? h('i', { class: 'k-etikett e-pruefung', text: 'Prüfung' }) : null),
    fertig() ? h('span', { class: 'legende' }, h('i', { class: 'k-ist i-ja', text: '✓' }), 'erledigt', h('i', { class: 'k-ist i-nein', text: '✗' }), 'nicht gemacht', h('i', { class: 'k-ist i-offen', text: '?' }), 'vorbei, noch offen') : null,
    h('span', { class: 'legende' }, h('i', { class: 'k-anzahl', text: '12×' }), 'so oft noch bis Semesterende', h('i', { class: 'k-anzahl einmal', text: '1×' }), 'einmalig'),
    ...M.KATEGORIEN.map(([k, text]) => h('span', { class: `legende k-${k}` }, h('i', { class: 'lg-k' }), text)),
    form('lg-a', 'fester Termin'),
    rasterLage().std && zeigtRaster() ? form('lg-u', 'unregelmäßig (seltener als jede 2. Woche)') : null,
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
    .sort((a, b) => (['kommt', 'wartet'].includes(a.grund)) - (['kommt', 'wartet'].includes(b.grund)) || b.offen_min - a.offen_min);
  const wer = fertig() ? '' : `Schritt ${schritt()}: `;
  if (!liste.length) { fuellen(box, h('b', { text: rasterLage().std ? `${wer}Jede Woche ist alles im Plan.` : `${wer}Alles, was diese Woche dran ist, ist im Plan.` })); return; }
  fuellen(box, h('b', { text: rasterLage().std ? 'Jede Woche dran, noch nicht im Plan:' : 'Diese Woche dran, noch nicht im Plan:' }),
    ...liste.map((b) => {
      const z = b.z, m = z.modul;
      const st = ['kommt', 'wartet'].includes(b.grund) ? 'st-kommt' : 'st-dran';
      const tun = b.grund === 'kommt' ? h('span', { text: 'Info fehlt — angenommen' }) : b.grund === 'wartet' ? h('span', { text: 'wartet' })
        : fertig() ? null
          : b.grund === 'waehlen' ? h('button', { type: 'button', 'data-act': 'teil', 'data-teil': z.teil.id, text: 'Gruppe wählen' })
            : h('button', { type: 'button', 'data-act': 'legen', 'data-teil': z.teil.id, text: 'Block legen' });
      return h('span', { class: `bd ${st} m${m.farbe || 1}`, title: `${M.kurz(m)} · ${z.teil.titel}: ${M.stunden(b.ist_min)} von ${M.stunden(b.soll_min)} im Plan${z.el === 'rest' ? ` (Wochenwert ${M.stunden1(z.wochenwert_min)})` : ''}` },
        h('span', { class: 'm-punkt' }), `${M.kurz(m)} · ${z.teil.titel} · ${M.stunden(b.offen_min)}`, tun);
    }));
}

// ── Mitte: die Bereiche ohne Raster ──────────────────────────────────────────────────────────────

function bereichZeichnen() {
  const b = Z.ansicht.bereich;
  const box = $('bereich');
  const oben = box.scrollTop;
  fuellen(box, ...(b === 'frei' ? freiBoard() : b === 'offen' ? offenAnsicht() : b === 'abgleich' ? abgleichAnsicht() : erklaerung()));
  if (b === 'frei') zeitleisteAnordnen();
  box.scrollTop = oben;
}

// ── Prüfungen (V-0337, umgebaut V-0338, seit V-0349 das Kontingent-Modell) ───────────────────────
// Silas, 12.10.: „Prüfungslernen soll man eben nochmal separat ganz manuell verteilen können. Da soll … eine Art
// Kontingent mitlaufen … man kann diese als Vorschlag vom System in Weihnachtspause und Januarwochenenden verteilen …
// an den zwei Wochenenden vor einer Prüfung … zehn Stunden … man soll aber auch draufklicken und ziehen … auf einen Tag
// raufklicken und dann runterziehen.“ Links je Prüfung ihr Kontingent (erledigt, geplant, Vorschlag, passt nicht), in der
// Mitte die Zeitleiste und die Zeiträume als Kalender; ein Tipp auf einen Tag legt Lernzeit, Ziehen wählt die Stunden.

const gewaehlteX = () => (Z.setzen && Z.erg.pruefungen.get(Z.setzen)) || null;
const kurzTitel = (p) => p.titel.replace(/\s*\(.*\)\s*/, '').replace(/^Präsenzklausur$/, 'Klausur');
const nachDatum = (a, b) => ((a.termin && a.termin.datum) || '9') < ((b.termin && b.termin.datum) || '9') ? -1 : 1;
const vorschlagSumme = (X) => X.vorschlag.reduce((s, v) => s + v.min, 0);

/** Die Zeiträume des Semesters in ihrer Reihenfolge: Vorlesungszeit, Pause, Vorlesungszeit, vorlesungsfreie Zeit. */
function zeitraeume() {
  const sem = Z.erg.sem;
  const aus = [];
  let cur = sem.vorlesung.von, n = 0;
  (sem.frei || []).slice().sort((x, y) => (x.von < y.von ? -1 : 1)).forEach((f, i) => {
    aus.push({ id: `zr-vl-${n++}`, art: 'vl', titel: 'Vorlesungszeit', von: cur, bis: M.plusTage(f.von, -1) });
    aus.push({ id: `zr-pause-${i}`, art: 'pause', titel: f.titel || 'Vorlesungsfrei', von: f.von, bis: f.bis });
    cur = M.plusTage(f.bis, 1);
  });
  aus.push({ id: `zr-vl-${n}`, art: 'vl', titel: 'Vorlesungszeit', von: cur, bis: sem.vorlesung.bis });
  if (sem.ende && sem.ende > sem.vorlesung.bis) aus.push({ id: 'zr-frei', art: 'frei', titel: 'Vorlesungsfreie Zeit', von: M.plusTage(sem.vorlesung.bis, 1), bis: sem.ende });
  return aus;
}

/** Eine Prüfung wählen: ihre Tage und ihr Vorschlag leuchten im Kalender, die Zeiträume mit ihrem Fenster gehen auf.
 *  Noch einmal wählen hebt die Wahl auf. */
function pruefungWaehlen(pid) {
  Z.setzen = Z.setzen === pid ? null : pid;
  const X = gewaehlteX();
  let ziel = null;
  if (X && X.termin) {
    const von = X.vorschlag.length ? X.vorschlag[0].datum : M.plusTage(X.termin.datum, -21);
    for (const zr of zeitraeume()) if (zr.bis >= von && zr.von <= X.termin.datum) Z.zrAuf.add(zr.id);
    ziel = X.vorschlag.length ? X.vorschlag[X.vorschlag.length - 1].datum : X.termin.datum;
  }
  zeichnen(); bannerZeigen();
  if (ziel) document.querySelector(`.kal-tag:not(.aus)[data-datum="${ziel}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Links unter „Prüfungen“: jede Prüfung nach Datum mit ihrem Kontingent als Balken — erledigt, geplant, Vorschlag,
 *  passt nicht —, die gewählte mit allem, was zu ihr gehört; darunter das Unregelmäßige (V-0354). */
function pruefListe() {
  const xs = [...Z.erg.pruefungen.values()].sort(nachDatum);
  const su = Z.erg.summe;
  const zuPlanen = xs.reduce((s, X) => s + (X.zaehlt ? X.zu_planen_min : 0), 0);
  const gelegt = xs.reduce((s, X) => s + X.erledigt_min + X.geplant_min, 0);
  const vor = xs.reduce((s, X) => s + vorschlagSumme(X), 0);
  const pn = xs.reduce((s, X) => s + X.passt_nicht_min, 0);
  return h('section', { class: 'modul pruef-liste' },
    h('p', { class: 'm-zahl' }, h('span', { text: `Prüfungs-Topf ${M.stunden(su.pruefung_min)} · gelegt ${M.stunden(gelegt)} von ${M.stunden(zuPlanen)}` }),
      pn >= 30 ? h('span', { class: 'fehlt', text: `passt nicht ${M.stunden(pn)}` }) : h('span', { text: vor ? `Vorschlag ${M.stunden(vor)}` : '' })),
    h('ol', { class: 'reihe pruef-reihe' }, ...xs.map(pruefZeileEl)),
    Z.U.length ? h('h3', { class: 'pl-titel', title: 'Seltener als jede zweite Woche oder an einzelne Termine gebunden — gehört zum Semester-Topf, wird aber hier geplant', text: 'Unregelmäßig — an Termine gebunden' }) : null,
    Z.U.length ? h('ol', { class: 'reihe pruef-reihe' }, ...Z.U.map(unregelZeileEl)) : null);
}

function pruefZeileEl(X) {
  const m = X.modul, sel = Z.setzen === X.id;
  const k = Math.max(1, X.zu_planen_min);
  const seg = (w, kl) => { const i = h('i', { class: kl }); i.style.width = `${Math.min(100, (w / k) * 100)}%`; return i; };
  const balken = h('div', { class: 'balken stapel', title: `erledigt ${M.stunden(X.erledigt_min)} · geplant ${M.stunden(X.geplant_min)} · Vorschlag ${M.stunden(vorschlagSumme(X))} · passt nicht ${M.stunden(X.passt_nicht_min)}` },
    seg(X.erledigt_min, 'erl'), seg(X.geplant_min, 'gepl'), seg(vorschlagSumme(X), 'vor'), seg(X.passt_nicht_min, 'pn'));
  const wann = X.termin ? `${datumMitTag(X.termin.datum)}${X.termin.start ? ` ${X.termin.start}` : ''}${X.annahme ? ' · Annahme' : ''}` : 'Termin offen';
  const st = { offen: '', vorbehalt: 'unter Vorbehalt', angemeldet: 'angemeldet', abgemeldet: 'abgemeldet', ruecktritt_anerkannt: 'Rücktritt', ruecktritt_abgelehnt: 'Rücktritt abgelehnt', bestanden: 'bestanden', nicht_bestanden: 'nicht bestanden' }[X.status];
  return h('li', { class: `m${m.farbe || 1}${sel ? ' dran' : ''}${!X.zaehlt ? ' fertig' : ''}` },
    h('button', { type: 'button', class: 'r-zeile', 'data-act': 'pruefung-waehlen', 'data-pruefung': X.id, 'aria-current': sel ? 'true' : null },
      h('span', { class: `zl-marke a-${X.art} gilt r-art` }, h('i')), h('span', { class: 'r-name', text: `${M.kurz(m)} · ${kurzTitel(X.p)}` }),
      h('span', { class: 'r-stand', text: `${M.stunden(X.erledigt_min + X.geplant_min).replace(' h', '')}/${M.stunden(X.zu_planen_min)}` })),
    h('p', { class: 'r-satz' }, wann, st ? h('span', { class: `p-status s-${X.status}`, text: ` · ${st}` }) : null),
    h('div', { class: 'r-satz' }, balken),
    X.passt_nicht_min >= 30 ? h('p', { class: 'r-satz r-warn', text: `${M.stunden(X.passt_nicht_min)} passen nicht — Entscheidung offen` }) : null,
    sel ? pruefDetail(X) : null);
}

/** Alles zu einer Prüfung: Termin, Stand (§ 63), Punkte, Vorschlag — und zugeklappt (V-0354, Silas: „Auch hier sollen
 *  standardmäßig zugeklappt sein: Details (Kontingent-Rechnung) und Hinweise (Meldungen bzw. Fehler)“) Kontingent und
 *  Herkunft, Fenster, Fristen. */
function pruefDetail(X) {
  const box = h('div', { class: 't-karte pruef-detail' });
  const herk = X.herkunft.map((x) => `${x.text} ${M.stunden(x.min)}`).join(' + ');
  const tname = (x) => `${x.label ? `${x.label}: ` : ''}${datumMitTag(x.datum)}${x.start ? ` ${x.start}` : ''}${x.nachholen ? ' (nur Nachholen)' : ''}`;
  if (X.datiert.length > 1) {
    // Gewählt ist gewählt (V-0354, Silas: „Wenn man einen Testtermin wählt, soll der Auswahlknopf verschwinden und dann soll
    // man nur noch sagen können ‚Wahl ändern‘“): Erst „Wahl ändern“ zeigt die Termine wieder.
    const wahl = (Z.stand.plan.pruefungstermin || {})[X.id];
    const gew = wahl && X.datiert.find((x) => x.datum === wahl);
    if (gew && Z.wahlAuf !== X.id) {
      box.append(h('div', { class: 'termin-wahl' }, h('span', { class: 't-zahlen' }, 'Gewählt: ', h('b', { text: tname(gew) })),
        h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'wahl-aendern', 'data-pruefung': X.id }, sym('stift'), 'Wahl ändern')));
    } else {
      box.append(h('div', { class: 'termin-wahl' }, h('span', { class: 't-zahlen', text: gew ? 'Anderen Termin wählen (der gewählte noch einmal: Wahl aufheben):' : 'Welchen Termin schreibst du? Bis du wählst, gilt der früheste (Arbeitsannahme):' }),
        ...X.datiert.map((x) => h('button', { type: 'button', class: `knopf klein${x === X.termin ? ' an' : ''}`, 'data-act': 'pruefung-wahl', 'data-pruefung': X.id, 'data-datum': x.datum, title: [x.ort, x.quelle].filter(Boolean).join(' · ') }, tname(x)))));
    }
  }
  const status = h('select', { 'data-act': 'pruef-status', 'data-pruefung': X.id, 'aria-label': 'Stand der Prüfung' }, ...M.PRUEFSTATUS.map(([id, t]) => h('option', { value: id, selected: X.status === id, text: t })));
  box.append(h('div', { class: 'formular' },
    h('label', {}, 'Stand (§ 63 AllgStuPO)', status),
    X.portfolio && X.punkte ? h('label', {}, `Punkte (von ${X.punkte})`, h('input', { type: 'number', min: '0', max: String(X.punkte), step: '0.25', value: X.erreicht ?? '', 'data-act': 'pruef-punkte', 'data-pruefung': X.id })) : h('span'),
    X.portfolio_rest ? h('p', { class: 'satz', text: `Für die 4,0 (${X.modul.portfolio.bestehen} von ${X.modul.portfolio.gesamt} Punkten) brauchst du in den offenen Teilen noch ${X.portfolio_rest.noetig} von ${X.portfolio_rest.von} Punkten.` }) : null,
    X.status === 'nicht_bestanden' ? h('p', { class: 'satz', text: X.wiederholung ? `Wiederholung am ${datumMitTag(X.termin.datum)} — eigenes Kontingent, außerhalb der 180 h.` : 'Kein weiterer Termin in diesem Semester.' } ) : null));
  box.append(h('details', { class: 'p-mehr' }, h('summary', {}, 'Details · Kontingent'),
    h('div', { class: 'herkunft baum' },
      h('p', { text: `${M.stunden(X.kontingent_min)} = ${herk}${X.wiederholung ? ' — Wiederholung: eigenes Kontingent, außerhalb der 180 h' : ''}` }),
      X.termine_p.length ? h('p', { text: `davon als Termin: ${X.termine_p.map((z) => `${z.teil.titel} ${M.stunden(z.termine_min)}`).join(', ')} — selbst zu planen ${M.stunden(X.zu_planen_min)}` }) : null,
      h('p', { text: `Fenster: ${datumMitTag(X.fenster.ab)} – ${X.fenster.bis ? `${datumMitTag(X.fenster.bis)} (Termin − 1 Tag)` : 'offen, solange der Termin fehlt'}` }),
      h('p', { text: `erledigt ${M.stunden(X.erledigt_min)} (✓) · geplant ${M.stunden(X.geplant_min)} · offen ${M.stunden(X.offen_min)}` }))));
  const hinweise = [
    ...(X.info ? [h('div', { class: 'flagge st-kommt' }, sym('info'), h('span', { text: `Info fehlt: ${X.info.frage} — Stichtag ${datumMitTag(X.info.stichtag)}` }))] : []),
    ...X.fristen.map((f) => h('div', { class: `flagge ${heute() > f.datum ? 'st-info' : M.tageZwischen(heute(), f.datum) <= 7 ? 'st-dran' : 'st-kommt'}` }, sym('uhr'),
      h('span', { text: `${datumMitTag(f.datum)} · ${f.text}${f.verweis ? ` (${f.verweis})` : ''} — ${f.quelle}` }))),
  ];
  // Eine Frist in den nächsten 7 Tagen steht in der Zusammenfassung, damit sie zugeklappt nicht untergeht.
  const bald = X.fristen.filter((f) => f.datum >= heute() && M.tageZwischen(heute(), f.datum) <= 7);
  if (hinweise.length) {
    box.append(h('details', { class: 'p-mehr' }, h('summary', {}, `Hinweise · ${hinweise.length}`, bald.length ? h('span', { class: 'p-bald', text: ` · ${bald[0].text} ${datumMitTag(bald[0].datum)}` }) : null),
      h('div', { class: 't-flaggen' }, ...hinweise)));
  }
  if (X.vorschlag.length) {
    box.append(h('div', { class: 'vorschlag' }, h('b', { text: `Vorschlag: ${M.stunden(vorschlagSumme(X))} an ${X.vorschlag.length} ${X.vorschlag.length > 1 ? 'Tagen' : 'Tag'}` }),
      h('p', { class: 't-zahlen', text: X.vorschlag.map((v) => `${datumMitTag(v.datum)} ${M.stunden(v.min)}`).join(' · ') }),
      h('p', { class: 't-zahlen', text: 'Zwei Wochenenden davor je höchstens 10 h, dann rückwärts — in der Vorlesungszeit nur Sa/So, nie an Feiertagen, höchstens 9 h je Tag und 45 h je Woche nach allem, was schon liegt.' }),
      h('div', { class: 't-aktionen' }, h('button', { class: 'knopf klein haupt', type: 'button', 'data-act': 'vorschlag-uebernehmen', 'data-pruefung': X.id }, sym('plus'), 'Vorschlag übernehmen'))));
  } else if (X.offen_min >= 30 && X.termin && X.zaehlt) box.append(h('p', { class: 't-zahlen', text: 'Kein Vorschlag: Bis zur Prüfung ist nach allem schon Geplanten kein Platz frei.' }));
  else if (!X.termin) box.append(h('p', { class: 't-zahlen', text: 'Kein Vorschlag, solange der Termin fehlt.' }));
  const kuenftig = X.bloecke.filter((v) => !v.vergangen);
  if (kuenftig.length) box.append(h('div', { class: 't-aktionen' }, h('button', { class: 'knopf klein leise', type: 'button', 'data-act': 'vorbereitung-leeren', 'data-pruefung': X.id }, sym('zu'), `Künftige Lernblöcke entfernen (${kuenftig.length})`)));
  if (Z.ansicht.bereich === 'pruefplan' && X.vorbereitung[0] && X.zaehlt) {
    box.append(h('div', { class: 't-aktionen' }, h('select', { 'aria-label': 'Länge des Blocks' }, ...[60, 90, 120, 180, 240].map((d) => h('option', { value: String(d), selected: d === 120, text: M.stunden(d) }))),
      h('button', { type: 'button', class: 'knopf klein haupt', 'data-act': 'legen-pruefung', 'data-pruefung': X.id }, sym('plus'), 'Block legen')));
  }
  if (X.vorbereitung[0]) box.append(...pruefungFormulare(X.vorbereitung[0], true));
  return box;
}

// ── Unregelmäßiges (V-0354) ──────────────────────────────────────────────────────────────────────
// Silas, 12.10.: „Alle Blöcke, die in einer echten Woche gelegt werden sollen … kommen … auf die Prüfungen-Seite … Ist
// das [Datum] schon bekannt, kann man Lerneinheiten schon planen, wenn das nicht bekannt ist, soll das als offen
// dastehen“ — und zu den Quicktests: „falls schon bekannt ist, wann die stattfinden, dann sollte mein Zeiger sofort in die
// Woche springen, wo das ist … und wenn es noch nicht bekannt ist, soll es erst, sobald ich weiß, wann der Quicktest ist,
// als Folgeentscheidung kommen.“ Je Element (M.unregelmaessige) seine Bezugstermine; „In W05 legen“ öffnet die Woche des
// Termins mit gesperrtem Stundenplan und hängt den Block an den Zeiger.

const gewaehltesU = () => (Z.setzen && Z.setzen.startsWith('u:') && Z.U.find((U) => U.id === Z.setzen)) || null;
/** Der Tag, an dem eine Einheit hängt: ihr Termin (Übung, Schluss des Quicktests), bei einem freien Fenster heute oder
 *  sein Anfang. */
const einheitZiel = (e) => e.ziel || (e.frei ? (heute() > e.ab && heute() <= e.bis ? heute() : e.ab) : e.bis);
/** In welcher Woche eine Einheit gelegt wird: die des letzten Tages VOR ihrem Termin (eine Übung am Montag → die Woche
 *  davor, mit dem Wochenende), nie vor ihrem Fenster. */
const einheitWoche = (e) => {
  const offen = heute() > e.ab && heute() <= e.bis ? heute() : e.ab; // ohne Termin: ab heute bzw. ab Öffnen
  const vorher = e.ziel ? M.plusTage(e.ziel, -1) : null;
  return M.wocheVon(Z.erg.wochen, vorher && vorher >= offen ? vorher : offen);
};
const einheitName = (U, e) => (e.frei ? `frei bis ${datumMitTag(e.bis)}` : e.titel || `${U.teil.titel} ${e.nr}`);

function unregelZeileEl(U) {
  const m = U.modul, sel = Z.setzen === U.id;
  const f = Z.fort.get(U.teil.id);
  const wann = !U.bekannt ? `${U.einheiten.length} Termine offen${U.info ? ` · Info fehlt bis ${M.datumKurz(U.info.stichtag)}` : ''}`
    : U.einmalig ? `frei in der Vorlesungszeit · bis ${datumMitTag(U.einheiten[0].bis)}`
      : U.naechstes ? `nächster ${datumMitTag(einheitZiel(U.naechstes))} · ${U.fertig} von ${U.bekannt} gelegt` : `${U.fertig} von ${U.bekannt} gelegt`;
  return h('li', { class: `m${m.farbe || 1}${sel ? ' dran' : ''}${f.status !== 'offen' ? ' fertig' : ''}` },
    h('button', { type: 'button', class: 'r-zeile', 'data-act': 'unregel-waehlen', 'data-u': U.id, 'aria-current': sel ? 'true' : null },
      h('span', { class: 'm-punkt' }), h('span', { class: 'r-name', text: `${M.kurz(m)} · ${U.teil.titel}` }),
      h('span', { class: 'r-stand', text: `${M.stunden(U.plan_min).replace(' h', '')}/${M.stunden(U.kontingent_min)}` })),
    h('p', { class: `r-satz${U.bekannt ? '' : ' grau'}`, text: wann }),
    h('div', { class: 'r-satz' }, fBalken(f)),
    sel ? unregelDetail(U) : null);
}

function unregelDetail(U) {
  const box = h('div', { class: 't-karte pruef-detail' });
  if (!U.bekannt) {
    box.append(h('p', { class: 't-zahlen', text: `${U.einheiten.length} × ${M.stunden(U.dauer_min)} — die Termine fehlen noch. Sobald sie bekannt sind, planst du hier (Folgeentscheidung).` }));
  } else {
    box.append(h('ol', { class: 'u-liste' }, ...U.einheiten.map((e) => {
      if (!e.bekannt) return h('li', { class: 'u-zeile grau' }, h('span', { class: 'u-name', text: `${e.nr} · Termin offen` }));
      const vorbei = heute() > e.bis;
      const w = einheitWoche(e);
      return h('li', { class: `u-zeile${e.fertig ? ' fertig' : ''}${vorbei ? ' vorbei' : ''}` },
        h('span', { class: 'u-name', title: e.unsicher || null, text: einheitName(U, e) }),
        h('span', { class: 'u-stand', text: `${M.stunden(e.plan_min).replace(' h', '')}/${M.stunden(e.soll_min)}` }),
        e.fertig ? h('span', { class: 'f-haken gruen', title: 'gelegt' }, sym('ok')) : vorbei ? h('span', { class: 'u-vorbei', text: 'vorbei' })
          : h('button', { type: 'button', class: 'knopf klein', 'data-act': 'unregel-legen', 'data-u': U.id, 'data-nr': String(e.nr), title: 'Die Woche öffnen, der Block hängt am Zeiger' }, sym('plus'), `In ${w ? w.kurz : 'der Woche'} legen`));
    })));
    box.append(h('p', { class: 't-zahlen', text: 'Oder im Kalender: ein Tipp auf einen markierten Tag legt einen Block, noch ein Tipp nimmt ihn heraus.' }));
  }
  const z = U.z;
  const hinweise = [...(U.info ? [`Info fehlt: ${U.info.frage} — Stichtag ${datumMitTag(U.info.stichtag)}`] : []), ...z.flags.map((x) => x.text)];
  box.append(h('details', { class: 'p-mehr' }, h('summary', {}, 'Details · Kontingent'),
    h('div', { class: 'herkunft baum' },
      h('p', { text: `${M.stunden(U.kontingent_min)}${z.P ? ` aus „${z.P.titel}“ (Semester-Topf)` : ''} · ${U.einheiten.length > 1 ? `${U.einheiten.length} × ${M.stunden(U.dauer_min)}` : `Blöcke à ${M.stunden(U.dauer_min)}`}` }),
      h('p', { text: `gelegt ${M.stunden(U.plan_min)} · erledigt ${M.stunden(U.erledigt_min)} (✓)` }),
      z.teil.quelle ? h('p', { class: 'grau', text: z.teil.quelle }) : null)));
  if (hinweise.length) {
    box.append(h('details', { class: 'p-mehr' }, h('summary', {}, `Hinweise · ${hinweise.length}`),
      h('div', { class: 't-flaggen' }, ...hinweise.map((t) => h('div', { class: 'flagge st-kommt' }, sym('info'), h('span', { text: t }))))));
  }
  return box;
}

/** Unregelmäßiges wählen: seine Tage leuchten im Kalender, der Zeitraum mit dem nächsten Termin geht auf. */
function unregelWaehlen(uid) {
  Z.setzen = Z.setzen === uid ? null : uid;
  const U = gewaehltesU();
  const e = U && (U.naechstes || U.einheiten.find((x) => x.bekannt));
  if (e) for (const zr of zeitraeume()) if (zr.bis >= e.ab && zr.von <= e.bis) { Z.zrAuf.add(zr.id); break; }
  zeichnen(); bannerZeigen();
  if (e) document.querySelector(`.kal-tag:not(.aus)[data-datum="${einheitZiel(e)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** „In W05 legen“: die Woche des Termins mit gesperrtem Stundenplan; der Block hängt am Zeiger (einzeln, nur an Tagen,
 *  an denen die Einheit offen ist — M.blockTagErlaubt), und der Termin, auf den er sich bezieht, leuchtet kurz. */
function unregelLegen(uid, nr) {
  const U = Z.U.find((x) => x.id === uid);
  const e = U && U.einheiten.find((x) => x.nr === nr && x.bekannt);
  if (!e) return;
  const ziel = einheitZiel(e);
  const w = einheitWoche(e);
  if (!w) return;
  Z.setzen = uid;
  Object.assign(Z.ansicht, { bereich: 'pruefplan', modus: 'woche', woche: w.id });
  ansichtMerken();
  Z.legen = { teil: U.teil.id, dauer: U.dauer_min, einzeln: true, pruefung: true, rest: 1, fenster: [e.frei ? (heute() > e.ab ? heute() : e.ab) : e.ab, e.bis] };
  const bezug = U.teil.vorbereitung_auf ? Z.erg.vorkommen.find((v) => v.quelle === 'termin' && v.teil === U.teil.vorbereitung_auf && v.datum === ziel) : null;
  Z.hell = bezug ? bezug.id : null;
  zeichnen(); bannerZeigen();
  if (bezug) setTimeout(() => { if (Z.hell === bezug.id) { Z.hell = null; if (zeigtRaster()) rasterZeichnen(); } }, 2400);
  melden(`${M.kurz(U.modul)} · ${einheitName(U, e)}: Block (${M.stunden(U.dauer_min)}) hängt am Zeiger — leg ihn ${e.frei ? 'in diese oder eine andere Woche' : `vor ${datumMitTag(ziel)}`}. Andere Woche: oben ← →.`);
}

/** Ein Tipp im Prüfungskalender, wenn Unregelmäßiges gewählt ist: legt einen Block (Dauer der Einheit) in die freien
 *  Strecken des Tages, wenn an ihm eine Einheit offen ist — liegt dort schon einer, nimmt der Tipp ihn heraus. */
function unregelTag(U, datum) {
  const da = (Z.stand.plan.bloecke || []).filter((b) => b.teil === U.teil.id && b.datum === datum);
  if (da.length) {
    aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((b) => !(b.teil === U.teil.id && b.datum === datum)); });
    melden(`${M.kurz(U.modul)}: ${datumMitTag(datum)} wieder frei.`);
    return;
  }
  if (!U.einheiten.some((x) => x.bekannt && x.ab <= datum && datum <= x.bis)) { melden(`Am ${datumMitTag(datum)} ist für ${U.teil.titel} nichts offen — die markierten Tage gehen.`); return; }
  const strecken = M.lernStrecken(Z.erg, datum, U.dauer_min);
  if (!strecken.length) { melden(`Am ${datumMitTag(datum)} ist nichts mehr frei.`); return; }
  const neu = strecken.map(([a, b]) => ({ id: neueId('l'), teil: U.teil.id, datum, start: M.hhmm(a), ende: M.hhmm(b) }));
  aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), ...neu]; });
  melden(`${M.kurz(U.modul)} · ${U.teil.titel}: ${datumMitTag(datum)} ${neu.map((b) => `${b.start}–${b.ende}`).join(', ')}. Noch einmal tippen nimmt es heraus.`);
}

/** Die Zeitleiste: die Zeiträume (ein Klick klappt ihren Kalender auf), darunter EINE Spur mit jeder Prüfung — Farbe und
 *  Form nach Art, gefüllt der Termin, der gilt, hohl die Rückfall- und Nachholtermine; vor jedem geltenden Termin die
 *  Strecke seiner Vorbereitung (vom ersten gelegten oder vorgeschlagenen Tag an). */
function zeitleisteEl() {
  const zr = zeitraeume();
  const von = zr[0].von, bis = zr[zr.length - 1].bis;
  const tage = M.tageZwischen(von, bis) + 1;
  const pct = (d) => Math.max(0, Math.min(100, (M.tageZwischen(von, d) / tage) * 100));
  const lage = (el, a, b) => { el.style.left = `${pct(a)}%`; el.style.width = `${((M.tageZwischen(a, b) + 1) / tage) * 100}%`; return el; };
  const phasen = h('div', { class: 'zl-phasen' }, ...zr.map((g) => lage(h('button', {
    type: 'button', class: `zl-phase ${g.art}${Z.zrAuf.has(g.id) ? ' auf' : ''}`, 'data-act': 'zeitraum', 'data-ziel': g.id,
    title: `${g.titel} · ${datumMitTag(g.von)} – ${datumMitTag(g.bis)} — aufklappen`,
  }, h('span', { text: g.art === 'vl' ? 'Vorlesungszeit' : g.art === 'pause' ? 'Pause' : 'vorlesungsfrei' })), g.von, g.bis)));
  const skala = h('div', { class: 'zl-skala' });
  const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  for (let d = `${von.slice(0, 7)}-01`; d <= bis; d = M.plusTage(d, 32).slice(0, 7) + '-01') {
    if (d < von) continue;
    const t = h('span', { text: MONATE[+d.slice(5, 7) - 1] }); t.style.left = `${pct(d)}%`; skala.append(t);
  }
  const heuteEl = heute() >= von && heute() <= bis ? h('i', { class: 'zl-heute', title: `heute, ${datumMitTag(heute())}` }) : null;
  if (heuteEl) heuteEl.style.left = `${pct(heute())}%`;
  const sel = gewaehlteX();
  const spur = h('div', { class: 'zl-spur' });
  const offen = [];
  const marken = [];
  for (const X of Z.erg.pruefungen.values()) {
    if (!X.datiert.length) offen.push(`${M.kurz(X.modul)} ${kurzTitel(X.p)}`);
    for (const x of X.datiert) marken.push({ X, x, gilt: x === X.termin, at: pct(x.datum) });
  }
  marken.sort((a, b) => a.at - b.at);
  for (const k of marken) {
    const dieser = sel && sel === k.X;
    const el = h('button', { type: 'button', class: `zl-marke a-${k.X.art}${k.gilt ? ' gilt' : ''}${!k.gilt ? ' ausweich' : ''}${dieser ? ' gewaehlt' : sel ? ' blass' : ''}`,
      'data-act': 'pruefung-waehlen', 'data-pruefung': k.X.id,
      title: `${M.kurz(k.X.modul)} · ${k.X.p.titel}${k.x.label ? ` (${k.x.label})` : ''} — ${datumMitTag(k.x.datum)}${k.x.start ? ` ${k.x.start}` : ''}${k.x.ort ? ` · ${k.x.ort}` : ''}${k.gilt && k.X.annahme ? ' — Arbeitsannahme (Wahl offen)' : ''}` },
      h('i'), h('span', { class: 'zl-text' }, h('b', { text: `${M.kurz(k.X.modul)} ${kurzTitel(k.X.p)}` }), ` ${M.datumKurz(k.x.datum)}`));
    el.style.left = `${k.at}%`;
    if (k.gilt) {
      const erste = [...k.X.bloecke.map((v) => v.datum), ...k.X.vorschlag.map((v) => v.datum)].sort()[0];
      if (erste && erste < k.x.datum) {
        const a = erste < von ? 0 : pct(erste);
        const linie = h('i', { class: `zl-vorlauf a-${k.X.art}`, title: `Vorbereitung ab ${datumMitTag(erste)} — ${M.stunden(k.X.erledigt_min + k.X.geplant_min)} gelegt, ${M.stunden(vorschlagSumme(k.X))} vorgeschlagen` });
        linie.style.left = `${a}%`; linie.style.width = `${Math.max(0, k.at - a)}%`;
        el.dataset.vorlauf = String(a);
        spur.append(linie);
        el.zlLinie = linie;
      }
    }
    spur.append(el);
  }
  return h('section', { class: 'zeitleiste' },
    h('div', { class: 'zl-kopf' }, h('b', { text: 'Das Semester' }), h('span', { class: 'zl-satz', text: ` ${datumMitTag(von)} – ${datumMitTag(bis)}` }),
      h('button', { type: 'button', class: 'knopf klein', 'data-act': 'pruefplan' }, sym('kalender'), 'Vorlesungszeit öffnen')),
    h('div', { class: 'zl-oben' }, skala, phasen, heuteEl),
    spur,
    h('p', { class: 'zl-legende' }, ...M.PRUEFUNGSARTEN.map(([a, name]) => h('span', { class: `zl-marke a-${a} gilt` }, h('i'), name)),
      h('span', { class: 'zl-marke ausweich a-klausur' }, h('i'), 'Rückfall- oder Nachholtermin'),
      h('span', {}, h('i', { class: 'zl-vorlauf-muster' }), 'Vorbereitung'),
      offen.length ? h('span', { class: 'zl-offen', text: `Termin noch offen: ${offen.join(', ')}` }) : null));
}

/** Die Beschriftungen und Vorbereitungs-Strecken der Zeitleiste nach dem Zeichnen ordnen: Was sich mit Früherem
 *  überlappte, rutscht eine Zeile tiefer; was rechts hinausragte, steht links vom Punkt (V-0337). */
function zeitleisteAnordnen() {
  for (const spur of document.querySelectorAll('.zeitleiste .zl-spur')) {
    const W = spur.clientWidth;
    const enden = [];
    for (const m of spur.querySelectorAll('.zl-marke')) {
      m.classList.remove('links');
      const x = (parseFloat(m.style.left) / 100) * W;
      let w = m.offsetWidth;
      let a = x - 6, b = x - 6 + w;
      if (b > W) { m.classList.add('links'); w = m.offsetWidth; a = x + 6 - w; b = x + 6; }
      if (m.dataset.vorlauf != null) a = Math.min(a, (parseFloat(m.dataset.vorlauf) / 100) * W);
      let e = enden.findIndex((ende) => ende < a - 6);
      if (e < 0) { e = enden.length; enden.push(0); }
      enden[e] = b;
      m.style.top = `${4 + e * 20}px`;
      if (m.zlLinie) m.zlLinie.style.top = `${4 + e * 20 + 5}px`;
    }
    spur.style.minHeight = `${Math.max(1, enden.length) * 20 + 8}px`;
  }
}

/** Ein Kalender je Zeitraum: Wochen × Tage. Jede Tageskachel ist eine Säule (V-0340: 9 h = voll) aus dem, was liegt, und
 *  hell darüber dem Vorschlag; darin die Prüfungen, Fristen und Lernblöcke. Die gewählte Prüfung zeigt ihr Fenster und
 *  ihren Vorschlag je Tag. */
function zeitraumKalender(p, X, U = null) {
  const wo = Z.erg.wochen;
  const voll = Z.erg.regeln.tag_h * 60;
  const vorlesung = p.art === 'vl';
  const wochen = wo.filter((w) => w.bis >= p.von && w.von <= p.bis);
  const kal = h('div', { class: 'kal' }, h('div', { class: 'kal-kopf' }, h('span'), ...M.TAGE.map((t) => h('span', { text: t }))));
  const fei = M.feiertage(Z.erg.sem);
  for (const w of wochen) {
    const zeile = h('div', { class: 'kal-zeile' },
      h('button', { type: 'button', class: 'kal-woche', 'data-act': vorlesung ? 'pruefplan-woche' : 'zur-woche', 'data-woche': w.id, title: vorlesung ? 'Diese Woche öffnen (Stundenplan gesperrt)' : 'Diese Woche im Raster' }, h('b', { text: w.kurz }), h('span', { text: M.datumKurz(w.von) })));
    for (let d = 0; d < 7; d++) {
      const datum = M.plusTage(w.von, d);
      const drin = datum >= p.von && datum <= p.bis;
      const vk = Z.erg.vorkommen.filter((v) => v.datum === datum);
      const last = drin ? M.tagesLast(Z.erg, datum) : 0;
      const vorAlle = drin ? Z.erg.vorschlag_tag.get(datum) || 0 : 0;
      const vorX = drin && X ? X.vorschlag.find((v) => v.datum === datum) : null;
      // Unregelmäßiges (V-0354): die Fenster seiner offenen Einheiten, Ziel ist ihr Termin.
      const imFenster = drin && ((X && X.fenster.bis && datum >= X.fenster.ab && datum <= X.fenster.bis)
        || (U && U.einheiten.some((e) => e.bekannt && !e.fertig && datum >= e.ab && datum <= e.bis)));
      const ziel = drin && ((X && X.termin && datum === X.termin.datum) || (U && U.einheiten.some((e) => e.bekannt && e.ziel === datum)));
      const zelle = h('div', { class: `kal-tag${drin ? '' : ' aus'}${datum === heute() ? ' heute' : ''}${d >= 5 ? ' we' : ''}${ziel ? ' ziel' : ''}${imFenster ? ' fenster' : ''}${vorX ? ' vorschlag' : ''}${last > voll ? ' uebervoll' : ''}${fei.has(datum) ? ' feiertag' : ''}`,
        'data-act': drin ? 'frei-tag' : null, 'data-datum': datum,
        title: drin ? `${datumMitTag(datum)}: ${M.stunden(last)} verplant von ${M.stunden(voll)}${vorAlle ? ` · Vorschlag ${M.stunden(vorAlle)}` : ''}${fei.has(datum) ? ' · Feiertag (kein Vorschlag)' : ''}${X ? ' — Tipp: Lernblock, Ziehen nach unten: Stunden wählen' : U ? ' — Tipp: Block legen oder herausnehmen' : ''}` : null },
        h('span', { class: 'kal-datum' }, M.datumKurz(datum), drin && last ? h('small', { text: M.stunden(Math.round(last / 15) * 15) }) : null));
      if (drin) {
        zelle.style.setProperty('--fuell', `${Math.min(100, (last / voll) * 100)}%`);
        zelle.style.setProperty('--vor', `${Math.min(100, ((last + vorAlle) / voll) * 100)}%`);
      }
      for (const v of vk.filter((x) => x.quelle === 'pruefung')) {
        const m = modulVon(v.modul);
        const pr = (m.pruefungen || []).find((x) => x.id === v.pruefung);
        zelle.append(h('span', { class: `kal-pruefung a-${pr ? M.pruefungsArt(pr) : 'klausur'}${v.wichtig ? '' : ' ausweich'}`, title: M.titelVon(v, Z.erg, Z.stand.angebot) },
          `${M.kurz(m)} ${kurzTitel(pr || { titel: v.titel })}${v.start != null ? ` ${uhr(v.start)}` : ''}`));
      }
      for (const v of vk.filter((x) => x.quelle === 'frist' && (!X || x.modul === X.modul.id || x.wichtig))) {
        const m = modulVon(v.modul);
        zelle.append(h('span', { class: `kal-frist${v.wichtig ? ' wichtig' : ''}`, title: v.titel }, `${m ? M.kurz(m) : ''} Frist`));
      }
      for (const v of vk.filter((x) => x.quelle === 'block' && x.schritt === M.PRUEFUNGEN)) {
        const z = Z.erg.teile.get(v.teil);
        const dieser = X ? z.teil.pruefung === X.id : U ? z.teil.id === U.teil.id : false;
        zelle.append(h('button', { type: 'button', class: `kal-block m${z.modul.farbe || 1} k-pruefung${v.zaehlt_min ? '' : ' zaehlt-nicht'}${dieser ? ' dieser' : ''}${v.ist === 'ja' ? ' erledigt' : ''}`, 'data-act': 'frei-block', 'data-block': v.block, 'data-datum': datum, title: `${M.kurz(z.modul)} · ${z.teil.titel} ${zeitspanne(v.start, v.ende)}${v.ist === 'ja' ? ' ✓' : ''}` },
          `${v.ist === 'ja' ? '✓ ' : ''}${M.kurz(z.modul)} ${M.stunden(v.ende - v.start)}`));
      }
      if (vorX) zelle.append(h('button', { type: 'button', class: 'kal-vorschlag', 'data-act': 'vorschlag-tag', 'data-datum': datum, 'data-pruefung': X.id, title: 'Diesen Vorschlag übernehmen' }, `+ ${M.stunden(vorX.min)}`));
      zeile.append(zelle);
    }
    kal.append(zeile);
  }
  return kal;
}

function freiBoard() {
  const X = gewaehlteX(), U = gewaehltesU();
  const aus = [zeitleisteEl(), pruefTopfEl()];
  for (const p of zeitraeume()) {
    const auf = Z.zrAuf.has(p.id);
    const n = Z.erg.vorkommen.filter((v) => v.quelle === 'pruefung' && v.wichtig && v.datum >= p.von && v.datum <= p.bis).length;
    const vor = [...Z.erg.vorschlag_tag].filter(([d]) => d >= p.von && d <= p.bis).reduce((s, [, m]) => s + m, 0);
    aus.push(h('details', { class: `zeitraum ${p.art}`, id: p.id, open: auf, 'data-zr': p.id },
      h('summary', {}, h('b', { text: p.titel }), h('span', { text: ` ${datumMitTag(p.von)} – ${datumMitTag(p.bis)}` }),
        h('span', { class: 'zr-zahl', text: `${n ? `${n} Prüfung${n > 1 ? 'en' : ''}` : 'keine Prüfung'}${vor ? ` · Vorschlag ${M.stunden(vor)}` : ''}` })),
      auf ? zeitraumKalender(p, X, U) : null));
  }
  return aus;
}

/** Der Prüfungs-Topf als Tabelle: je Prüfung Kontingent, gelegt, Vorschlag, was nicht passt — und die Summe. */
function pruefTopfEl() {
  const xs = [...Z.erg.pruefungen.values()].sort(nachDatum);
  const zeile = (X) => h('tr', { class: Z.setzen === X.id ? 'gewaehlt' : null },
    h('td', {}, h('button', { type: 'button', class: 'link', 'data-act': 'pruefung-waehlen', 'data-pruefung': X.id, text: `${M.kurz(X.modul)} ${kurzTitel(X.p)}` })),
    h('td', { text: X.termin ? `${M.datumKurz(X.termin.datum)}${X.annahme ? '*' : ''}` : 'offen' }),
    h('td', { text: M.stunden(X.kontingent_min) }), h('td', { text: M.stunden(X.erledigt_min + X.geplant_min) }),
    h('td', { text: M.stunden(vorschlagSumme(X)) }), h('td', { class: X.passt_nicht_min >= 30 ? 'rot-text' : null, text: X.passt_nicht_min ? M.stunden(X.passt_nicht_min) : '—' }));
  const summe = (f) => M.stunden(xs.reduce((s, X) => s + f(X), 0));
  const pause = (Z.erg.sem.frei || [])[0];
  const inPause = pause ? [...Z.erg.vorschlag_tag].filter(([d]) => d >= pause.von && d <= pause.bis).reduce((s, [, m]) => s + m, 0) : 0;
  return h('section', { class: 'pruef-topf' },
    h('table', { class: 'erkl-tabelle' },
      h('thead', {}, h('tr', {}, ...['Prüfung', 'Termin', 'Kontingent', 'gelegt', 'Vorschlag', 'passt nicht'].map((t) => h('th', { text: t })))),
      h('tbody', {}, ...xs.map(zeile),
        h('tr', { class: 'summe' }, h('td', { text: 'Prüfungs-Topf' }), h('td'), h('td', { text: summe((X) => X.kontingent_min) }), h('td', { text: summe((X) => X.erledigt_min + X.geplant_min) }), h('td', { text: summe(vorschlagSumme) }), h('td', { text: summe((X) => X.passt_nicht_min) })))),
    h('p', { class: 'satz', text: `* Arbeitsannahme: Die Wahl ist offen, es gilt der früheste Termin (G7).${pause ? ` In der ${pause.titel || 'Pause'} schlägt der Vorschlag ${M.stunden(inPause)} vor.` : ''} Vorgeschlagen wird nach allem, was schon liegt: In den Vorlesungswochen ist mit deinen Blöcken und den erwarteten Gruppen wenig frei.` }));
}

/** Einen Tag antippen (V-0340): Liegt an dem Tag schon ein Lernblock dieser Prüfung, nimmt der Tipp ihn heraus; sonst legt
 *  er so viel, wie noch offen ist — höchstens einen Lerntag (6 h) und nie mehr, als der Tag frei hat. */
function lerntagSetzen(X, datum) {
  const z = X.vorbereitung[0];
  if (!z) { melden(`${X.p.titel}: Zu dieser Prüfung gehört kein Vorbereitungs-Element.`); return; }
  const da = (Z.stand.plan.bloecke || []).filter((b) => b.teil === z.teil.id && b.datum === datum);
  if (da.length) {
    aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((b) => !(b.teil === z.teil.id && b.datum === datum)); });
    melden(`${M.kurz(X.modul)}: ${datumMitTag(datum)} wieder frei.`);
    return;
  }
  const r = Z.erg.regeln;
  if (X.termin && datum >= X.termin.datum) { melden(`Am ${datumMitTag(datum)} ist die Prüfung schon vorbei — Vorbereitung zählt nur davor.`); return; }
  const offen = Math.max(r.raster_min, X.offen_min);
  lernzeitLegen(X, datum, Math.min(r.lerntag_h * 60, M.aufRaster(offen, r.raster_min)));
}

/** Lernzeit für eine Prüfung an einen Tag legen (Tipp, Ziehen, Vorschlag): in die freien Strecken des Tages. */
function lernzeitLegen(X, datum, minuten, still = false) {
  const z = X.vorbereitung[0];
  const strecken = M.lernStrecken(Z.erg, datum, minuten);
  if (!strecken.length) { if (!still) melden(`Am ${datumMitTag(datum)} ist nichts mehr frei.`); return 0; }
  const neu = strecken.map(([a, b]) => ({ id: neueId('l'), teil: z.teil.id, datum, start: M.hhmm(a), ende: M.hhmm(b) }));
  aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), ...neu]; });
  const gelegt = neu.reduce((s, b) => s + M.min(b.ende) - M.min(b.start), 0);
  if (!still) melden(`${M.kurz(X.modul)} · ${kurzTitel(X.p)}: ${datumMitTag(datum)} ${neu.map((b) => `${b.start}–${b.ende}`).join(', ')} — ${M.stunden(gelegt)}. Noch einmal tippen nimmt es heraus.`);
  return gelegt;
}

/** Den Vorschlag übernehmen: je vorgeschlagenem Tag Lernblöcke in die freien Strecken (ein Rückgängig für alles). */
function vorschlagUebernehmen(X, nurDatum = null) {
  const z = X.vorbereitung[0];
  if (!z) return;
  const tage = X.vorschlag.filter((v) => !nurDatum || v.datum === nurDatum);
  const neu = [];
  for (const v of tage) {
    const extra = neu.filter((b) => b.datum === v.datum).map((b) => [M.min(b.start), M.min(b.ende)]);
    for (const [a, b] of M.lernStrecken(Z.erg, v.datum, v.min, extra)) neu.push({ id: neueId('v'), teil: z.teil.id, datum: v.datum, start: M.hhmm(a), ende: M.hhmm(b), vorschlag: true });
  }
  if (!neu.length) { melden('Nichts zu übernehmen.'); return; }
  aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), ...neu]; });
  melden(`${M.kurz(X.modul)} · ${kurzTitel(X.p)}: ${neu.length} Lernblöcke an ${tage.length} ${tage.length > 1 ? 'Tagen' : 'Tag'} gelegt — ${M.stunden(neu.reduce((s, b) => s + M.min(b.ende) - M.min(b.start), 0))}. Rückgängig mit ⌘Z.`);
}

/** Ziehen im Prüfungskalender (Silas, 12.10.: „auf einen Tag raufklicken und dann runterziehen“): je 14 px eine halbe
 *  Stunde, höchstens so viel, wie der Tag frei hat; loslassen legt die Lernzeit. Ohne Bewegung ist es ein Tipp. */
let gezogen = false;
function kalenderZiehen(e, zelle) {
  const X = gewaehlteX();
  if (!X || e.button !== 0 || e.target.closest('button')) return;
  const datum = zelle.dataset.datum;
  const voll = Z.erg.regeln.tag_h * 60;
  const frei = Math.max(0, voll - M.tagesLast(Z.erg, datum));
  const y0 = e.clientY;
  let min_ = 0;
  const anzeige = h('span', { class: 'kal-zieh' });
  let gezogenHier = false;
  const bewegen = (ev) => {
    const dy = ev.clientY - y0;
    if (Math.abs(dy) < 6 && !gezogenHier) return;
    gezogenHier = true;
    // Höchstens, was der Tag frei hat (9 h minus das, was liegt); ist er voll, sagt die Anzeige es.
    min_ = frei < 30 ? 0 : Math.max(30, Math.min(Math.floor(frei / 30) * 30, Math.round(dy / 14) * 30));
    if (!anzeige.parentElement) zelle.append(anzeige);
    anzeige.textContent = min_ ? `+ ${M.stunden(min_)}` : 'Tag voll';
  };
  const los = () => {
    removeEventListener('pointermove', bewegen); removeEventListener('pointerup', los); removeEventListener('pointercancel', los);
    anzeige.remove();
    if (!gezogenHier) return;
    gezogen = true; setTimeout(() => { gezogen = false; }, 0);
    if (!min_) { melden(`${datumMitTag(datum)} ist voll (${M.stunden(voll)}).`); return; }
    if (X.termin && datum >= X.termin.datum) { melden('Nach der Prüfung zählt keine Vorbereitung.'); return; }
    lernzeitLegen(X, datum, min_);
  };
  addEventListener('pointermove', bewegen); addEventListener('pointerup', los); addEventListener('pointercancel', los);
}

function lerntagKarte(datum, nahe) {
  const kandidaten = [...Z.erg.pruefungen.values()].filter((X) => X.zaehlt && X.vorbereitung.length && (!X.termin || X.termin.datum > datum)).sort((a, b) => b.offen_min - a.offen_min);
  karteOeffnen([
    h('h3', { text: `Lernen am ${datumMitTag(datum)}` }),
    h('p', { class: 'satz', text: 'Für welche Prüfung? (Nur Prüfungen nach diesem Tag.) Links eine Prüfung wählen spart diese Frage.' }),
    h('div', { class: 'wahl-liste' }, ...kandidaten.map((X) => h('button', { type: 'button', class: `m${X.modul.farbe || 1}`, onclick: () => { karteSchliessen(false); Z.setzen = X.id; lerntagSetzen(X, datum); } },
      h('span', { class: 'm-punkt' }), h('span', { text: `${M.kurz(X.modul)} · ${X.p.titel}` }),
      h('span', { class: X.offen_min ? '' : 'grau', text: X.offen_min ? `offen ${M.stunden(X.offen_min)}` : 'gelegt' })))),
  ], nahe);
}

/** Den Stand einer Prüfung setzen (§ 63 AllgStuPO). Bei Rücktritt, Bestehen oder Nichtbestehen merkt er sich den
 *  Termin, um den es ging — danach gilt der nächste (Nachholtermin, Wiederholung), und die Vorbereitung wandert mit. */
function pruefStatus(pid, status) {
  const X = Z.erg.pruefungen.get(pid);
  if (!X) return;
  const fest = ['ruecktritt_anerkannt', 'ruecktritt_abgelehnt', 'bestanden', 'nicht_bestanden'];
  aendern((s) => {
    const p = { ...(s.plan.pruefung || {}) };
    const x = { ...(p[pid] || {}) };
    if (status === 'offen') delete x.status; else x.status = status;
    if (fest.includes(status)) { if (!x.termin && X.termin) x.termin = X.termin.datum; } else delete x.termin;
    // Rücktritt abgelehnt: der Teil gilt als nicht bestanden — in einem Portfolio null Punkte.
    if (status === 'ruecktritt_abgelehnt' && X.portfolio && x.punkte == null) x.punkte = 0;
    if (Object.keys(x).length) p[pid] = x; else delete p[pid];
    s.plan.pruefung = p;
  });
  const Y = Z.erg.pruefungen.get(pid);
  melden(`${X.p.titel}: ${M.PRUEFSTATUS_TEXT[status]}${Y && Y.termin && Y.weiter ? ` — es gilt jetzt der ${datumMitTag(Y.termin.datum)}` : ''}.`);
}

// ── Abgleich (Audit) ─────────────────────────────────────────────────────────────────────────────
// Silas, 12.10.: das Audit als eigene Schicht, nicht als Logik. Es prüft nur: Präsenz-Posten gegen Termine und Videos,
// Selbststudium gegen den Plan, die Last gegen 45 h und 9 h, Prüfungen an einem Tag, Rückfalltermine, Quoten.

/** Was ein Posten in Wirklichkeit ist — als Satz („15 Termine = 30 h, Videos mit Puffer 23,5 h“). */
function wirklichText(P) {
  if (P.topf === 'pruefung') return 'unter Prüfungen';
  if (P.art === 'selbst') return `geplant ${M.stunden(P.plan_min)}${P.erledigt_min ? `, erledigt ${M.stunden(P.erledigt_min)}` : ''}`;
  return P.elemente.map((z) => {
    if (z.el === 'termin') {
      const ts = z.vk.filter((v) => v.quelle === 'termin' && !v.ausgefallen);
      const aus = z.vk.filter((v) => v.ausgefallen).length;
      if (z.erwartet_min) return `vermutlich ${z.teil.erwartet.anzahl} Termine = ${M.stunden(z.audit_min)}`;
      if (!ts.length) return `${z.teil.titel}: Termine fehlen`;
      return `${ts.length} Termine${z.annahme_min ? ' (gewünscht)' : ''} = ${M.stunden(z.termine_min + z.annahme_min)}${z.audit_min < z.termine_min + z.annahme_min ? `, geprüft gegen ${Z.erg.regeln.katalog_wochen} je Serie: ${M.stunden(z.audit_min)}` : ''}${aus ? ` (${aus} fällt aus)` : ''}`;
    }
    if (z.el === 'einheiten') return `${z.teil.titel} ${M.stunden(z.einheiten_min)}${z.geschaetzt ? ' (Längen teils angenommen)' : ''}`;
    return `${z.teil.titel} ${M.stunden(z.kontingent_min)}`;
  }).join(' + ');
}

function abgleichAnsicht() {
  const a = Z.erg.audit, r = Z.erg.regeln;
  const aus = [h('p', { class: 'satz', text: `Die Aufwandstabellen sind Schätzungen der Lehrstühle (KMK 2004: „angenommen“). Hier steht, was die Wirklichkeit daraus macht. Präsenz-Posten werden gegen ihre Termine und Videos geprüft (eine wöchentliche Serie gegen höchstens ${r.katalog_wochen} Termine), Selbststudium gegen deinen Plan. „passt“ heißt: höchstens 10 % daneben, mindestens ${M.stunden(r.toleranz_mind_min)}. Was bei Präsenz darunter liegt, geht in die Prüfungsvorbereitung (G5); alles andere ist nur ein Befund.` })];
  for (const x of a.module) {
    const res = Z.erg.module.find((y) => y.modul === x.modul);
    const m = x.modul;
    aus.push(h('section', { class: `abgleich-modul m${m.farbe || 1}` },
      h('h3', {}, h('span', { class: 'm-punkt' }), `${M.kurz(m)} · ${m.titel}`, h('span', { class: 'a-summe', text: `${M.stunden(res.soll_min)} = Semester ${M.stunden(res.semester_min)} + Prüfungen ${M.stunden(res.pruefung_min)}` })),
      h('table', { class: 'erkl-tabelle' },
        h('thead', {}, h('tr', {}, ...['Posten', 'Tabelle', 'Wirklichkeit', 'Ergebnis', 'Folge'].map((t) => h('th', { text: t })))),
        h('tbody', {}, ...x.posten.map((P) => h('tr', {},
          h('td', { text: P.titel }), h('td', { text: M.stunden(P.K) }), h('td', { text: wirklichText(P) }),
          h('td', {}, auditChip(P) || (P.topf === 'pruefung' ? 'Prüfungs-Topf' : '')),
          h('td', { text: P.g5_min ? `${M.stunden(P.g5_min)} → ${(Z.erg.pruefungen.get(P.g5_nach) || { p: { titel: 'Prüfung' } }).p.titel} (G5)` : P.audit && P.audit.ergebnis === 'mehr' && P.art === 'praesenz' ? 'Entscheidung offen' : P.audit && P.audit.ergebnis === 'offen' ? 'wartet auf Termine oder Videolängen' : '' }))))),
      h('p', { class: `satz${x.meldung ? ' rot-text' : ''}`, text: `Innerhalb der Toleranz: mehr ${M.stunden(x.mehr_min)}, weniger ${M.stunden(x.weniger_min)} — getrennt gezählt, nichts wird verrechnet${x.meldung ? `; über ${M.stunden(r.modul_meldung_min)}, bitte ansehen` : ''}.` })));
  }
  // Last je Woche: Säulen aus Terminen, Blöcken, Prüfungslernen und dem Bedarf ohne Block; die Linie ist die Grenze.
  const wo = Z.erg.wochen.filter((w) => w.von <= (Z.erg.sem.ende || Z.erg.sem.vorlesung.bis));
  const max = Math.max(r.woche_h * 60, ...wo.map((w) => (Z.erg.last.wochen.get(w.id) || { summe: 0 }).summe + (([...Z.erg.vorschlag_tag].filter(([d]) => d >= w.von && d <= w.bis).reduce((s, [, m]) => s + m, 0)))));
  const saeulen = h('div', { class: 'last-saeulen' });
  saeulen.style.setProperty('--grenze', `${(r.woche_h * 60 / max) * 100}%`);
  for (const w of wo) {
    const l = Z.erg.last.wochen.get(w.id) || { termine: 0, pruefung: 0, bloecke: 0, pbloecke: 0, bedarf: 0, summe: 0 };
    const vor = [...Z.erg.vorschlag_tag].filter(([d]) => d >= w.von && d <= w.bis).reduce((s, [, m]) => s + m, 0);
    const seg = (m, kl) => { const i = h('i', { class: kl }); i.style.height = `${(m / max) * 100}%`; return i; };
    saeulen.append(h('button', { type: 'button', class: `last-saeule${l.summe > r.woche_h * 60 ? ' ueber' : ''}`, 'data-act': 'zur-woche', 'data-woche': w.id,
      title: `${w.kurz} ab ${M.datumKurz(w.von)}: Termine ${M.stunden(l.termine + l.pruefung)} · Blöcke ${M.stunden(l.bloecke)} · Prüfungslernen ${M.stunden(l.pbloecke)} · ohne Block ${M.stunden(l.bedarf)}${vor ? ` · Vorschlag ${M.stunden(vor)}` : ''} = ${M.stunden(l.summe + vor)}` },
      h('span', { class: 'ls-stapel' }, seg(l.termine + l.pruefung, 'ls-t'), seg(l.bloecke, 'ls-b'), seg(l.pbloecke, 'ls-p'), seg(l.bedarf, 'ls-o'), seg(vor, 'ls-v')),
      h('span', { class: 'ls-name', text: w.nr ? String(w.nr) : w.art === 'frei' ? '·' : w.kurz })));
  }
  aus.push(h('section', { class: 'abgleich-last' }, h('h3', { text: `Last je Woche — Grenze ${r.woche_h} h (G8)` }), saeulen,
    h('p', { class: 'last-legende' }, ...[['ls-t', 'Termine und Prüfungen'], ['ls-b', 'deine Blöcke'], ['ls-p', 'Prüfungslernen'], ['ls-o', 'Bedarf ohne Block (Wochenwert, erwartete Gruppen)'], ['ls-v', 'Vorschlag']].map(([k, t]) => h('span', { class: 'legende' }, h('i', { class: k }), t))),
    a.tage.length ? h('p', { class: 'satz', text: `Über ${r.tag_h} h: ${a.tage.map((x) => `${datumMitTag(x.datum)} ${M.stunden(x.last_min)}`).join(', ')}` }) : h('p', { class: 'satz', text: `Kein Tag über ${r.tag_h} h.` })));
  const pr = [];
  for (const x of a.pruefungstage) pr.push(`${datumTagLang(x.datum)}: ${x.pruefungen.map((X) => `${M.kurz(X.modul)} ${kurzTitel(X.p)} ${X.termin.start || ''}`.trim()).join(' und ')} an einem Tag`);
  for (const x of a.rueckfall) pr.push(`${datumTagLang(x.datum)}: Rückfalltermine ${M.kurz(x.a.modul)} und ${M.kurz(x.b.modul)} überschneiden sich ${M.stunden(x.ueber_min)} — wichtig nur, wenn beide nötig werden`);
  for (const q of Z.erg.quoten) pr.push(`${M.kurz(q.z.modul)} ${q.z.teil.titel}: ${q.verpasst} von ${q.n} verpasst — höchstens ${Math.round(q.hoechstens * 1000) / 10} % erreichbar, nötig ${Math.round(q.anteil * 100)} %, Puffer ${Math.max(0, q.puffer)}`);
  aus.push(h('section', {}, h('h3', { text: 'Prüfungen' }), ...(pr.length ? pr.map((t) => h('p', { class: 'satz', text: t })) : [h('p', { class: 'satz', text: 'Nichts aufgefallen.' })])));
  return aus;
}
const datumTagLang = (iso) => `${M.TAGE_LANG[M.wochentag(iso)]}, ${M.datumKurz(iso)}`;

// ── Offen ────────────────────────────────────────────────────────────────────────────────────────
// Silas, 12.10.: „Die müssen weiterhin offen sein, aber nicht als ein Fehler, sondern als: hey, übrigens, halt die Augen
// und Ohren offen.“ Jedes „Info fehlt“ trägt seinen Stichtag; danach heißt es „nachfragen“.

function offenAnsicht() {
  const l = Z.erg.offen;
  const zeile = (f) => {
    const z = f.teil ? Z.erg.teile.get(f.teil) : null;
    const X = f.pruefung ? Z.erg.pruefungen.get(f.pruefung) : null;
    const m = modulVon(f.modul);
    const knoepfe = [];
    if (f.art === 'wahl_offen' && f.anmeldung) knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'angemeldet', 'data-id': f.anmeldung, text: 'Angemeldet ✓' }));
    if (f.art === 'zuteilung_offen') knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'zugeteilt', 'data-teil': f.zuteilung, text: 'Zugeteilt ✓' }));
    if (f.art === 'nacharbeit') knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'nachgeholt', 'data-vk': f.vk, text: 'Nachgeholt ✓' }));
    if (f.art === 'anmeldung' && X) knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'pruef-status-setzen', 'data-pruefung': X.id, 'data-status': 'angemeldet', text: 'Angemeldet ✓' }));
    if (f.art === 'unbestaetigt' && z) { const v = z.vk.find((x) => x.ist === 'offen'); if (v) knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'zur-woche', 'data-woche': M.montagVon(v.datum), text: 'Woche ansehen' })); }
    if (f.art === 'info_fehlt' && z && z.teil.offen) knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'erledigt', 'data-teil': z.teil.id, 'data-feld': 'offen', text: 'Erledigt' }));
    if (f.art === 'gesperrt') knoepfe.push(h('button', { type: 'button', class: 'knopf klein', 'data-act': 'schritt', 'data-schritt': String(z ? M.schrittVon(z.teil) : 4), text: 'Verschieben' }));
    if (['woche_voll', 'tag_voll', 'zwei_pruefungen', 'rueckfall', 'entscheidung', 'modul_mehr', 'modul_weniger', 'g5'].includes(f.art)) knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'bereich', 'data-bereich': 'abgleich', text: 'Abgleich' }));
    if (X && fertig()) knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'zu-pruefung', 'data-pruefung': X.id, text: 'Prüfung' }));
    else if (z) knoepfe.push(h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'zum-teil', 'data-teil': z.teil.id, text: 'Ansehen' }));
    const wann = f.stichtag; // Fristen nennen ihr Datum schon im Satz
    return h('div', { class: `offen-zeile${m ? ` m${m.farbe || 1}` : ''}` },
      h('span', { class: 'offen-wo' }, m ? h('span', { class: 'm-punkt' }) : null, `${m ? `${M.kurz(m)} · ` : ''}${z ? z.teil.titel : X ? kurzTitel(X.p) : 'Plan'}`),
      h('span', { class: 'offen-text' }, f.text, wann ? h('span', { class: 'offen-wann', text: ` · ${f.stichtag ? 'Stichtag' : 'bis'} ${datumMitTag(wann)}` }) : null),
      h('span', { class: 'offen-knoepfe' }, ...knoepfe));
  };
  const gruppe = (titel, satz, eintraege, kl, zu = false) => h(zu ? 'details' : 'section', { class: `offen-gruppe ${kl}` },
    h(zu ? 'summary' : 'h3', {}, titel, h('span', { class: 'zahl', text: String(eintraege.length) })),
    h('p', { class: 'satz', text: satz }),
    ...(eintraege.length ? eintraege.map(zeile) : [h('p', { class: 'satz', text: 'Nichts.' })]));
  const nach = (...st) => l.filter((f) => st.includes(f.stufe));
  const kommt = nach('kommt').sort((a, b) => String(a.stichtag || '9').localeCompare(String(b.stichtag || '9')));
  // Annahmen und Stellschrauben (änderbar).
  const a = M.annahmen(Z.stand.angebot, Z.erg);
  const best = Z.stand.plan.bestaetigt || {};
  const annahmen = h('details', { class: 'offen-gruppe gelb' }, h('summary', {}, 'Annahmen und Regeln', h('span', { class: 'zahl', text: String(a.filter((x) => !x.fest).length) })),
    h('p', { class: 'satz', text: 'Werte, mit denen der Planer rechnet, wo es keine Angabe gibt. Ändern wirkt sofort; „Stimmt so“ merkt sich, dass du sie gesehen hast.' }),
    h('div', { class: 'annahmen' }, ...a.map((x) => {
      const z = x.teil ? Z.erg.teile.get(x.teil) : null;
      const m = x.modul ? modulVon(x.modul) : null;
      return h('div', { class: `annahme${x.fest ? ' fest' : ''}${best[x.id] ? ' bestaetigt' : ''}${m ? ` m${m.farbe || 1}` : ''}` },
        h('span', { class: 'annahme-wo' }, m ? h('span', { class: 'm-punkt' }) : null, m ? `${M.kurz(m)} · ${z ? z.teil.titel : ''}` : (x.fest ? 'Regel' : 'Stellschraube')),
        h('span', { class: 'annahme-text' }, h('b', { text: x.titel }), x.quelle ? h('span', { class: 'quelle', text: ` · ${x.quelle}` }) : null),
        x.feld ? h('label', { class: 'annahme-wert' }, h('input', { type: 'number', min: '0', step: x.einheit === 'h' ? '0.5' : '1', value: String(x.wert ?? ''), 'data-annahme': x.id, 'aria-label': x.titel }), x.einheit || '') : h('span', { class: 'annahme-wert', text: x.fest ? 'fest' : '' }),
        !x.fest && x.art !== 'regel' ? h('button', { type: 'button', class: 'knopf klein leise', 'data-act': 'bestaetigen', 'data-id': x.id, text: best[x.id] ? 'gesehen ✓' : 'Stimmt so' }) : h('span'));
    })));
  return [
    h('p', { class: 'stufen-legende' }, ...['kritisch', 'achtung', 'dran', 'kommt'].map((st) => h('span', { class: `legende st st-${st}` }, h('i'), { kritisch: 'kritisch — jetzt handeln', achtung: 'prüfen oder entscheiden', dran: 'du bist dran', kommt: 'Augen offen — Info fehlt, bis zum Stichtag kein Fehler' }[st]))),
    gruppe('Jetzt', 'Anmelden, abhaken, eintragen: was eine Frist hat oder auf dich wartet.', nach('kritisch', 'dran'), 'st-dran'),
    gruppe('Prüfen und entscheiden', 'Stichtag vorbei (nachfragen), Abweichungen von den Tabellen, Entscheidungen, die offen sind, zu volle Tage und Wochen.', nach('achtung'), 'st-achtung'),
    gruppe('Augen offen', 'Was der Lehrstuhl noch liefert — mit dem Stichtag, an dem die Antwort kommen sollte. Bis dahin rechnet der Planer mit Annahmen.', kommt, 'st-kommt'),
    annahmen,
    gruppe('Hinweise', 'Zum Wissen: Hinweise aus ISIS, Bezug zum Stoff, Blöcke ohne Inhalt, Reste nach G5.', nach('info', 'spaeter'), 'st-info', true),
  ];
}

// ── So wird gerechnet ────────────────────────────────────────────────────────────────────────────

function erklaerung() {
  const su = Z.erg.summe;
  const fz = Z.fokus && Z.fokus.startsWith('modul:') ? Z.erg.module.find((r) => r.modul.id === Z.fokus.slice(6)) : Z.erg.module[0];
  const absatz = (titel, ...inhalt) => h('section', { class: 'erkl' }, h('h3', { text: titel }), ...inhalt);
  const p = (...k) => h('p', {}, ...k);
  const li = (b, t) => h('li', {}, h('b', { text: b }), t);
  return [
    absatz('Was fest ist und was geschätzt',
      p('Seit der Bologna-Reform zählt ein Studium nicht die Zeit im Hörsaal, sondern den ', h('b', { text: 'gesamten Arbeitsaufwand' }), '. Ein Leistungspunkt sind an der TU Berlin 30 Stunden (AllgStuPO § 45 Abs. 2), dein Modul mit 6 LP also 180 h — das ist fest. Ob du sie wirklich arbeitest, prüft niemand; verbindlich sind die Fristen (§ 63).'),
      p('Wie sich die 180 h verteilen, schätzt jeder Lehrstuhl in seiner Aufwandstabelle. Sie ist eine Annahme (KMK 2004: „angenommen“; Berlin: Workload wird „validiert“, BlnStudAkkV § 12) — hier der Prüfmaßstab, keine Regel. ', `Dein Semester: ${M.stunden(su.soll_min)} = ${M.stunden(su.semester_min)} Semester-Topf + ${M.stunden(su.pruefung_min)} Prüfungs-Topf.`)),
    absatz('Die Grundsätze',
      h('ol', { class: 'erkl-liste' },
        li('Kontingent je Posten', ': Jeder Posten der Aufwandstabelle ist ein Kontingent. Die Elemente (Vorlesung, Videos, Quizze, Nachbereitung …) zählen zu einem Posten.'),
        li('Topf nach Zweck', ': Was einer Prüfung dient (Vorbereitung, Lernzielkontrollen, Probeklausur, Fragestunde), ist Prüfungs-Topf und wird unter „Prüfungen“ geplant; alles andere unter „Woche“.'),
        li('Termine zuerst', ': Was ISIS an Terminen nennt, gilt. Verteilt wird nur Selbststudium — und zwar, was nach Terminen und Einheiten übrig ist.'),
        li('Reste umbuchen (G5)', ': Liegt ein Präsenz-Posten mehr als 10 % unter seinem Kontingent (die EINFWI-Übung findet 5× statt, nicht 15×), geht der Rest in die Vorbereitung der Hauptprüfung des Moduls. Kleinere Reste bleiben und stehen im Abgleich.'),
        li('Unbestätigt ist nicht erledigt', ': Vergangenes bekommt ✓ oder ✗ (Klick auf die Kachel, oder „✓“ für die ganze Woche). Erst ✓ bucht ab.'),
        li('Verweise statt Daten', ': Was an einer offenen Wahl hängt (Fristen, Fenster), rechnet mit dem frühesten Termin — wählst du einen anderen, wandert alles mit.'),
        li('Kapazität', `: ${Z.erg.regeln.woche_h} h je Woche, ${Z.erg.regeln.tag_h} h je Tag, alles eingerechnet (deine Grenze).`),
        li('Vorrang der Prüfung', ': Ist etwas zugleich Termin und Prüfung, gelten die Regeln der Prüfung: Eine verpasste Klausur ist „nicht bestanden“ (§ 63 Abs. 8), keine Nacharbeit.'))),
    absatz('Der Baum je Veranstaltung',
      h('ol', { class: 'erkl-liste' },
        li('Posten', ' — zu welchem Kontingent gehört es? (Sprechstunden ohne Posten stehen nur im Kalender.)'),
        li('Zeitbindung', ' — ein Termin (Serie, Reihe, einmal), ein Fenster [ab, bis], in dem du es selbst legst, oder unbekannt.'),
        li('Alternativen', ' — fest · Info fehlt (mit Frage und Stichtag) · Wahl offen · Zuteilung offen · gewählt · gescheitert.'),
        li('Lebenslauf', ' — besucht, verpasst (wird Nacharbeit), ausgefallen; ✓, ✗, teilweise, verschoben; bei Prüfungen der Stand nach § 63.')),
      p('Der Stichtag eines „Info fehlt“ ist der Tag, an dem die Antwort kommen sollte — meist die erste Vorlesung; Prüfungstermine 14 Tage nach Modulbeginn (§ 65 Abs. 3). Bis dahin ist es kein Fehler, danach heißt es nachfragen.')),
    absatz('Wochenwert und Vorschlag',
      p(h('b', { text: 'Wochenwert' }), ' (nur Selbststudium): (Kontingent − erledigt) ÷ Vorlesungswochen, die im Fenster bleiben. Die Weihnachtspause zählt nicht mit. Was du nicht abhakst, bleibt offen und erhöht den Wert der kommenden Wochen.'),
      p(h('b', { text: 'Vorschlag für die Prüfungsvorbereitung' }), ': Prüfungen nach Datum; zuerst die zwei Wochenenden davor (je höchstens 10 h), dann rückwärts vom Tag vor der Prüfung — in der Vorlesungszeit nur Samstag und Sonntag, sonst jeder Tag, nie an Feiertagen. Grenzen: das Kontingent, das Fenster und die Kapazität, die nach allem schon Geplanten frei ist. Was nicht passt, steht als „passt nicht“ da und wartet auf deine Entscheidung.')),
    absatz('Abgleich',
      p('Je Posten: passt (höchstens 10 % daneben, mindestens 1 h), mehr, weniger. Je Modul werden „mehr“ und „weniger“ getrennt gezählt und ab 2 h gemeldet. Dazu die Last je Woche und Tag, zwei Prüfungen an einem Tag, sich überschneidende Rückfalltermine und Quoten (TECHGI: 80 % der Quizpunkte).')),
    fz ? absatz(`Beispiel ${M.kurz(fz.modul)} · ${fz.modul.titel}`, p('Ein Klick auf einen Modulnamen links wählt ein anderes.'), kontingentTabelle(fz)) : null,
    absatz('Quellen',
      h('ul', { class: 'erkl-liste' },
        h('li', { text: 'Allgemeine Studien- und Prüfungsordnung der TU Berlin (AllgStuPO): § 45 Abs. 2 (1 LP = 30 h), § 63 (An- und Abmeldung, Vorbehalt, Rücktritt), § 65 Abs. 3 (Termine 14 Tage nach Modulbeginn)' }),
        h('li', { text: 'KMK, Ländergemeinsame Strukturvorgaben 2004 (Arbeitsaufwand „angenommen“); Berliner Studienakkreditierungsverordnung § 8 (25–30 h je LP), § 12 Abs. 5 (Workload validiert)' }),
        h('li', { text: 'Die Modulbeschreibungen (#70450, #40271, #41077, #70123; BuK #70112) und deine ISIS-Kurse — jede Angabe trägt ihre Quelle am Element' }),
        h('li', { text: 'Das Kontingent-Modell, Fassung 4 vom 12.10.2026' }))),
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
    h('p', { class: 'l-satz t-zahlen', text: 'Jede Spalte eine Woche, jede Zeile ein Bestandteil — Termine kräftig, eigene Blöcke heller, andere Schritte blass. Ein Klick auf eine Zelle zeigt die Woche, einer auf den Namen wählt den Bestandteil.' }),
    minimapEl(),
    h('h3', { class: 'l-zwischen', text: 'Unregelmäßig, ab heute' }),
    chronikEl());
  box.scrollTop = oben;
}

/** Die Minimap (Silas, 11.10.: „wie die Minimap, die die Semesterübersicht einmal in Wochenansicht gibt, sodass
 *  man schnell durchnavigieren kann“): je Modul eine Summenzeile, darunter jeder Bestandteil, seine Prüfungen und
 *  Fristen — regelmäßig wie unregelmäßig. Der gewählte Bestandteil leuchtet, die anderen treten zurück. */
/** Die Wochen der Minimap (V-0340, Silas: „nur die Vorlesungszeit bis zur letzten Vorlesungswoche … erst wenn man auf
 *  Prüfungen klickt, den gesamten Zeitraum“). */
function minimapWochen() {
  if (['frei', 'pruefplan'].includes(Z.ansicht.bereich)) return Z.erg.wochen;
  const letzte = Z.erg.wochen.filter((w) => w.art === 'vorlesung').pop();
  return Z.erg.wochen.filter((w) => w.von <= letzte.von);
}

function minimapZeilen() {
  const wo = minimapWochen();
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
  const wo = minimapWochen();
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

/** Der Lebenslauf eines Vorkommens (G6, Silas, 12.10.: „entweder ein Haken oder halt so ein X … und dann daneben vielleicht
 *  noch drei Punkte, … verschieben, irgendwo hin, oder Hälfte davon gemacht“). Ein Termin: besucht, verpasst (wird
 *  Nacharbeit), ausgefallen. Ein Block: erledigt, nicht gemacht, teilweise, verschoben (er liegt dann als eigener Block an
 *  einem anderen Tag). Abgebucht wird erst, was ✓ hat. */
function istKarte(vkId, nahe) {
  const v = Z.erg.vorkommen.find((x) => x.id === vkId);
  if (!v) return;
  const termin = v.quelle === 'termin';
  const z = v.teil ? Z.erg.teile.get(v.teil) : null;
  const dauer = termin ? M.zaehltMin(v.start, v.ende, v.ct) : v.ende - v.start;
  const e = M.istEintrag((Z.stand.plan.ist || {})[v.id]);
  const setze = (wert, satz) => {
    karteSchliessen(false);
    aendern((s) => { const i = { ...(s.plan.ist || {}) }; if (wert == null) delete i[v.id]; else i[v.id] = wert; s.plan.ist = i; });
    if (satz) melden(satz);
  };
  const titel = M.titelVon(v, Z.erg, Z.stand.angebot);
  const knopf = (text, wert, an, satz) => h('button', { type: 'button', class: `knopf${an ? ' an' : ''}`, onclick: () => setze(an ? null : wert, an ? 'Eintrag zurückgenommen.' : satz) }, text);
  const teilForm = h('form', { class: 'formular' },
    h('label', {}, 'Gemacht (Minuten)', h('input', { name: 'min', type: 'number', min: '0', max: String(dauer), step: '15', value: String(e && e.s === 'teil' ? e.min : Math.round(dauer / 2 / 15) * 15) })),
    h('div', { class: 'zeile' }, h('button', { type: 'button', class: 'knopf klein', onclick: () => setze({ s: 'teil', min: Math.round(dauer / 2 / 15) * 15 }, 'Hälfte abgehakt.'), text: 'Hälfte' }), h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Teilweise' })));
  teilForm.addEventListener('submit', (ev) => { ev.preventDefault(); const n = Math.round(Number(new FormData(teilForm).get('min')) || 0); setze(n > 0 ? { s: 'teil', min: Math.min(dauer, n) } : { s: 'nein' }, `${M.stunden(Math.min(dauer, n))} abgehakt.`); });
  const schiebForm = !termin && z ? h('form', { class: 'formular' },
    h('label', {}, 'Neuer Tag', h('input', { name: 'datum', type: 'date', value: M.plusTage(heute(), 1) > v.datum ? M.plusTage(heute(), 1) : v.datum, required: true })),
    h('label', {}, 'ab', h('input', { name: 'start', type: 'time', step: '300', value: M.hhmm(v.start), required: true })),
    h('div', { class: 'zeile' }, h('button', { class: 'knopf klein haupt', type: 'submit', text: 'Verschieben' }))) : null;
  if (schiebForm) schiebForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(schiebForm);
    const datum = f.get('datum'), start = M.min(f.get('start'));
    if (!M.istDatum(datum)) return;
    const neu = { id: neueId('l'), teil: v.teil, datum, start: M.hhmm(start), ende: M.hhmm(start + (v.ende - v.start)), aus: v.id };
    karteSchliessen(false);
    aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), neu]; s.plan.ist = { ...(s.plan.ist || {}), [v.id]: 'verschoben' }; });
    melden(`Verschoben auf ${datumMitTag(datum)} ${neu.start}–${neu.ende}.`);
  });
  karteOeffnen([
    h('h3', {}, h('span', { text: titel }), h('button', { class: 'knopf rund leise', type: 'button', 'aria-label': 'Schließen', onclick: () => karteSchliessen() }, sym('zu'))),
    h('p', { class: 'satz', text: `${datumMitTag(v.datum)} ${zeitspanne(v.start, v.ende)}${v.ausgefallen ? ' — fällt aus' : ''}. ${termin ? 'Warst du da?' : 'Hast du es gemacht?'} Abgebucht wird erst mit ✓.` }),
    v.ausgefallen === 'geschlossen' ? h('p', { class: 'satz', text: 'Die TU ist an diesem Tag geschlossen — der Termin fällt aus.' }) : h('div', { class: 'zeile ist-wahl' },
      knopf(termin ? '✓ besucht' : '✓ erledigt', 'ja', e && e.s === 'ja', `${termin ? 'Besucht' : 'Erledigt'}: ${M.stunden(termin ? dauer : v.zaehlt_min || dauer)} abgebucht.`),
      knopf(termin ? '✗ verpasst' : '✗ nicht gemacht', 'nein', e && e.s === 'nein', termin ? 'Verpasst — die Zeit steht als Nacharbeit bis zum nächsten Termin unter „Offen“.' : 'Nicht gemacht — die Zeit bleibt offen und geht in die Wochenwerte der kommenden Wochen.'),
      termin ? knopf('fiel aus', 'ausgefallen', e && e.s === 'ausgefallen', 'Als ausgefallen eingetragen.') : null),
    !termin && !v.ausgefallen ? h('details', { class: 'klappe' }, h('summary', { text: '… teilweise' }), teilForm) : null,
    schiebForm ? h('details', { class: 'klappe' }, h('summary', { text: '… verschieben' }), schiebForm) : null,
    v.quelle === 'block' && v.block ? h('div', { class: 'zeile' }, h('button', { type: 'button', class: 'knopf klein leise', onclick: () => { karteSchliessen(false); blockKarte(v.block, nahe, v.datum); }, text: 'Block bearbeiten' })) : null,
  ], nahe);
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
  // V-0342: Bezug zum Stoff, und — liegt der Block schon vor der ersten Freigabe bzw. dem ersten Stoff — ein Knopf,
  // der ihn erst dort beginnen lässt (statt durchgestrichener Wochen).
  const bz = z && z.teil.art === 'selbst' ? bezugVon(vk) : null;
  const vg = z && !b.datum ? M.vorgabe(Z.erg, z.teil.id) : null;
  const abVorschlag = vg && vg.ab && (!b.ab || b.ab < vg.ab) && vk.some((v) => v.datum < vg.ab) ? vg.ab : null;
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
    bz ? h('p', { class: `satz${bz.weit ? ' hinweis' : ''}`, text: `Zum Stoff: meist ${bz.text}.${bz.weit ? ' Das ist weit weg — direkt nach dem Stoff bleibt mehr hängen.' : ''}` }) : null,
    abVorschlag ? h('p', { class: 'satz' }, `Vor ${datumMitTag(abVorschlag)} gibt es ${z.teil.art === 'video' ? 'kein Video' : 'noch keinen Stoff'} — dort zählt er nicht. `,
      h('button', { class: 'knopf klein', type: 'button', onclick: () => { karteSchliessen(false); aendern((s) => { const x = s.plan.bloecke.find((y) => y.id === b.id); if (x) x.ab = abVorschlag; }); melden(`Der Block beginnt jetzt am ${datumMitTag(abVorschlag)}`); }, text: `Erst ab ${datumMitTag(abVorschlag)}` })) : null,
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
/** Festlegen (V-0354, Silas: „Wenn man am Ende ‚Stundenplan festlegen‘ drückt, soll nochmal aufgelistet werden, was
 *  eigentlich bekannt ist, aber nicht platziert wurde — man soll es aber trotzdem abschließen können“): je Sache mit Gelb
 *  im Fortschritt eine Zeile (Klick: dorthin), das Graue als Zahl. */
function festlegenKarte(nahe) {
  const zs = [...Z.erg.teile.values()].filter((z) => M.schrittVon(z.teil) <= 4);
  const offen = zs.map((z) => ({ z, f: Z.fort.get(z.teil.id), n: M.schrittVon(z.teil) })).filter((x) => x.f.gelb > 0).sort((a, b) => a.n - b.n);
  const kommt = zs.filter((z) => Z.fort.get(z.teil.id).grau > 0);
  const hin = (x) => () => { karteSchliessen(false); zumSchritt(x.n, x.z.teil.id); };
  karteOeffnen([
    h('h3', {}, 'Stundenplan festlegen', h('button', { class: 'knopf rund leise', type: 'button', 'aria-label': 'Schließen', onclick: () => karteSchliessen() }, sym('zu'))),
    h('p', { class: 'satz', text: offen.length ? 'Bekannt, aber noch nicht gewählt oder gelegt — du kannst trotzdem festlegen und später bearbeiten:' : 'Alles, was bekannt ist, ist gewählt und gelegt.' }),
    offen.length ? h('div', { class: 'wahl-liste' }, ...offen.map((x) => h('button', { type: 'button', class: `m${x.z.modul.farbe || 1}`, onclick: hin(x) },
      h('span', { class: 'm-punkt' }), h('span', { text: `${x.n} · ${M.kurz(x.z.modul)} · ${x.z.teil.titel}` }),
      h('span', { class: 'gelb', text: x.n === 2 ? 'Gruppe nicht gewählt' : `${M.stunden(x.f.gelb)} nicht gelegt` })))) : null,
    kommt.length ? h('p', { class: 'satz grau', text: `Noch nicht bekannt (grau): ${kommt.map((z) => `${M.kurz(z.modul)} ${z.teil.titel}`).join(', ')} — kommt als Folgeentscheidung.` }) : null,
    h('p', { class: 'satz grau', text: 'Danach unter „Prüfungen“: die Prüfungsvorbereitung und was an einzelne Termine gebunden ist (Quicktests, Vorbereitung auf die Übungen, Literatur).' }),
    h('div', { class: 'zeile' },
      h('button', { type: 'button', class: 'knopf', onclick: () => karteSchliessen(), text: 'Weiter planen' }),
      h('button', { type: 'button', class: 'knopf haupt', onclick: () => {
        karteSchliessen(false);
        aendern((s) => { s.plan.festgelegt = new Date().toISOString(); });
        Z.ansicht.bereich = 'plan'; Z.fokus = null; Z.setzen = null; ansichtMerken(); zeichnen(); bannerZeigen();
        melden('Festgelegt. Ändern: „Stundenplan bearbeiten“.');
      } }, sym('ok'), offen.length ? 'Trotzdem festlegen' : 'Festlegen')),
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
    if (z.topf === 'pruefung' && z.teil.pruefung) Z.setzen = z.teil.pruefung; // Prüfungs-Topf: unter „Prüfungen“ wählen
    else if (z.unregel) Z.setzen = `u:${z.teil.id}`;
  } else if (z) {
    const n = M.schrittVon(z.teil);
    // Prüfungen und Unregelmäßiges (Schritt 5) gibt es im Ablauf nicht — erst nach dem Festlegen.
    if (n > 4) { Z.fokus = null; melden(`${M.kurz(z.modul)} · ${z.teil.titel}: unter „Prüfungen“ — nach „Stundenplan festlegen“.`); zeichnen(); return; }
    if (n !== schritt() && Z.ansicht.bereich !== 'offen') { Z.ansicht.schritt = n; if (Z.ansicht.bereich === 'erklaerung' || (Z.ansicht.bereich === 'frei' && n !== 4)) Z.ansicht.bereich = 'plan'; ansichtMerken(); }
    if (n >= 2 && n <= 4) Z.jetzt[n] = z.teil.id;
    Z.legen = null;
  }
  // Gruppen zeigt die Standardwoche am besten.
  if (z && M.istWahl(z.teil) && (z.teil.optionen || []).length && Z.ansicht.bereich === 'plan' && Z.ansicht.modus !== 'standard' && !(z.teil.optionen || []).some((o) => M.muster(o).some((x) => x.typ === 'reihe'))) Z.ansicht.modus = 'standard';
  zeichnen(); bannerZeigen();
}

/** „Block verschieben“ (V-0354): Die Sache wird dran, ihre Blöcke leuchten im Raster auf und lassen sich ziehen —
 *  Wochenblöcke in der Standardwoche, einzelne in der Woche ihres ersten künftigen Blocks. */
function verschieben(teilId) {
  const bl = (Z.stand.plan.bloecke || []).filter((b) => b.teil === teilId);
  if (!bl.length) return;
  const n = schritt();
  if (!fertig() && n >= 2 && n <= 4) Z.jetzt[n] = teilId;
  Z.legen = null;
  if (Z.ansicht.bereich !== 'pruefplan') Z.ansicht.bereich = 'plan';
  if (bl.some((b) => !b.datum)) Z.ansicht.modus = 'standard';
  else {
    const d = bl.map((b) => b.datum).sort();
    const w = M.wocheVon(Z.erg.wochen, d.find((x) => x >= heute()) || d[d.length - 1]);
    if (w) { Z.ansicht.modus = 'woche'; Z.ansicht.woche = w.id; }
  }
  ansichtMerken();
  Z.leuchten = teilId;
  zeichnen(); bannerZeigen();
  setTimeout(() => { if (Z.leuchten === teilId) { Z.leuchten = null; if (zeigtRaster()) rasterZeichnen(); } }, 3200);
  melden(bl.length > 1 ? 'Die Blöcke leuchten — zieh einen an seinen neuen Platz.' : 'Der Block leuchtet — zieh ihn an seinen neuen Platz.');
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
        if (Z.ansicht.bereich !== 'plan') Z.ansicht.bereich = 'plan';
        if (vg.einzeln) {
          // Seltener als alle zwei Wochen (V-0345): einzeln in echte Wochen — aus der Standardwoche geht es in die Woche,
          // die gerade läuft, frühestens in die erste, in der er liegen darf.
          const tage = (Z.stand.plan.bloecke || []).filter((b) => b.teil === teil && b.datum).length;
          Z.legen = { teil, dauer: vg.dauer_min, einzeln: true, rest: Math.max(1, vg.wochen - tage) };
          if (rasterLage().std) {
            const erlaubt = M.blockTagErlaubt(Z.erg, teil);
            const vl = Z.erg.wochen.filter((w) => w.art === 'vorlesung');
            const ziel = vl.find((w) => w.bis >= heute() && [0, 1, 2, 3, 4, 5, 6].some((d) => erlaubt(M.plusTage(w.von, d)))) || vl[0];
            Z.ansicht.modus = 'woche'; Z.ansicht.woche = ziel.id; ansichtMerken();
          }
        } else Z.legen = { teil, dauer: vg.dauer_min, alle: vg.alle, bis: vg.bis, ab: vg.ab, rest: Math.max(1, vg.anzahl - da) };
        zeichnen(); bannerZeigen();
        break;
      }
      case 'legen-aus': Z.legen = null; zeichnen(); bannerZeigen(); break;
      case 'legen-pruefung': {
        // Im Prüfplan (Vorlesungszeit, V-0337): ein Block für die gewählte Prüfung hängt am Zeiger.
        const X = Z.erg.pruefungen.get(el.dataset.pruefung);
        const z = X && X.vorbereitung[0];
        if (!z) break;
        const dauer = Number(el.closest('div')?.querySelector('select')?.value || 120);
        Z.legen = { teil: z.teil.id, dauer, alle: 1, rest: 1, bis: X.termin ? M.plusTage(X.termin.datum, -1) : null, pruefung: true };
        zeichnen(); bannerZeigen();
        break;
      }
      case 'pruefplan': Z.ansicht.bereich = 'pruefplan'; Z.ansicht.modus = 'standard'; Z.fokus = null; Z.setzen = null; ansichtMerken(); zeichnen(); bannerZeigen(); break;
      case 'zeitraum': {
        const id = el.dataset.ziel;
        if (Z.zrAuf.has(id)) Z.zrAuf.delete(id); else Z.zrAuf.add(id);
        bereichZeichnen();
        if (Z.zrAuf.has(id)) $(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'pruefung-waehlen': pruefungWaehlen(el.dataset.pruefung); break;
      case 'zu-pruefung': {
        if (!fertig()) { melden('Prüfungen planst du nach „Stundenplan festlegen“.'); break; }
        Z.ansicht.bereich = 'frei'; Z.fokus = null; ansichtMerken();
        Z.setzen = null; pruefungWaehlen(el.dataset.pruefung);
        break;
      }
      case 'vorschlag-uebernehmen': { const X = Z.erg.pruefungen.get(el.dataset.pruefung); if (X) vorschlagUebernehmen(X); break; }
      case 'vorschlag-tag': { const X = Z.erg.pruefungen.get(el.dataset.pruefung); if (X) vorschlagUebernehmen(X, el.dataset.datum); break; }
      case 'vorbereitung-leeren': {
        const X = Z.erg.pruefungen.get(el.dataset.pruefung);
        if (!X) break;
        const weg = new Set(X.bloecke.filter((v) => !v.vergangen).map((v) => v.block));
        if (!confirm(`${weg.size} künftige Lernblöcke für ${X.p.titel} entfernen? (Rückgängig mit ⌘Z)`)) break;
        aendern((s) => { s.plan.bloecke = s.plan.bloecke.filter((b) => !weg.has(b.id)); });
        break;
      }
      case 'pruef-status-setzen': pruefStatus(el.dataset.pruefung, el.dataset.status); break;
      case 'ist': istKarte(el.dataset.vk, el); break;
      case 'woche-bestaetigen': {
        const w = Z.erg.wochen.find((x) => x.id === el.dataset.woche);
        const offen = Z.erg.vorkommen.filter((v) => v.ist === 'offen' && v.datum >= w.von && v.datum <= w.bis);
        aendern((s) => { const i = { ...(s.plan.ist || {}) }; for (const v of offen) i[v.id] = 'ja'; s.plan.ist = i; });
        melden(`${offen.length}× abgehakt (✓). Einzeln ändern: Klick auf die Kachel.`);
        break;
      }
      case 'einheit-ist': aendern((s) => { const i = { ...(s.plan.ist || {}) }; if (i[el.dataset.id] === el.dataset.wert) delete i[el.dataset.id]; else i[el.dataset.id] = el.dataset.wert; s.plan.ist = i; }); break;
      case 'zugeteilt': {
        const t = teilIn(Z.stand, teil);
        const gew = (Z.stand.plan.wahl || {})[teil];
        if (!gew) break;
        aendern((s) => { const z_ = { ...(s.plan.zugeteilt || {}) }; if (z_[teil] === gew) delete z_[teil]; else z_[teil] = gew; s.plan.zugeteilt = z_; s.plan.angemeldet = { ...(s.plan.angemeldet || {}), [teil]: true }; });
        melden(`${t.titel}: ${(Z.stand.plan.zugeteilt || {})[teil] ? 'Zuteilung bestätigt — die Termine zählen jetzt als verplant.' : 'Zuteilung zurückgenommen.'}`);
        break;
      }
      case 'kein-platz': aendern((s) => { const z_ = { ...(s.plan.zugeteilt || {}) }; if (z_[teil] === 'keine') delete z_[teil]; else z_[teil] = 'keine'; s.plan.zugeteilt = z_; }); break;
      case 'nachgeholt': aendern((s) => { const i = { ...(s.plan.ist || {}) }; const e = M.istEintrag(i[el.dataset.vk]) || { s: 'nein' }; i[el.dataset.vk] = { ...e, nachgeholt: !e.nachgeholt }; s.plan.ist = i; }); break;
      case 'pruefplan-woche': Z.ansicht.bereich = 'pruefplan'; Z.ansicht.modus = 'woche'; Z.ansicht.woche = el.dataset.woche; ansichtMerken(); zeichnen(); bannerZeigen(); break;
      case 'modus': if (Z.ansicht.bereich !== 'pruefplan') Z.ansicht.bereich = 'plan'; Z.ansicht.modus = el.dataset.modus; ansichtMerken(); zeichnen(); break;
      case 'bereich': Z.ansicht.bereich = el.dataset.bereich; Z.fokus = null; Z.setzen = null; ansichtMerken(); zeichnen(); bannerZeigen(); $('bereich').scrollTop = 0; break;
      case 'schritt': zumSchritt(Number(el.dataset.schritt), el.dataset.teil || null); break;
      case 'festlegen': festlegenKarte(el); break;
      case 'bearbeiten': if (el.dataset.schritt) bearbeiten(Number(el.dataset.schritt), teil || null); else bearbeitenKarte(el); break;
      case 'kurz-zurueck': kurzZurueck(Number(el.dataset.schritt), teil || null); break;
      case 'sprung-ende': sprungEnde(); break;
      case 'aufklappen': {
        const n = schritt();
        Z.auf[fertig() ? 'fest' : n] = el.dataset.modul;
        const erste = !fertig() && n >= 2 && reihe(n).find((x) => x.z.modul.id === el.dataset.modul);
        if (erste) Z.jetzt[n] = erste.z.teil.id;
        Z.legen = null; zeichnen(); bannerZeigen();
        break;
      }
      case 'zuklappen': {
        // Ein aufgeklapptes Modul wieder zu (V-0354); was dran war, geht an die nächste offene Sache.
        const n = schritt();
        Z.auf[fertig() ? 'fest' : n] = null;
        if (!fertig() && Z.jetzt[n] && Z.erg.teile.get(Z.jetzt[n])?.modul.id === el.dataset.modul) Z.jetzt[n] = null;
        if (Z.fokus && (Z.fokus === `modul:${el.dataset.modul}` || Z.erg.teile.get(Z.fokus)?.modul.id === el.dataset.modul)) Z.fokus = null;
        Z.legen = null; zeichnen(); bannerZeigen();
        break;
      }
      case 'verschieben': verschieben(teil); break;
      case 'pruefung': Z.fokus = Z.fokus === `pruefung:${el.dataset.pruefung}` ? null : `pruefung:${el.dataset.pruefung}`; zeichnen(); break;
      case 'zuruecksetzen': zuruecksetzenKarte(el); break;
      case 'frei-tag': {
        if (gezogen) break; // das Ziehen hat schon gelegt
        const X = gewaehlteX(), U = gewaehltesU();
        if (X) lerntagSetzen(X, el.dataset.datum);
        else if (U) unregelTag(U, el.dataset.datum);
        else lerntagKarte(el.dataset.datum, el);
        break;
      }
      case 'frei-block': {
        // Gehört der Block zur gewählten Prüfung, nimmt ein Tipp ihn heraus wie ein Tipp auf den Tag (V-0340); ist er vorbei,
        // fragt die Karte nach ✓ oder ✗; sonst öffnet er seine Karte zum Bearbeiten.
        const b = (Z.stand.plan.bloecke || []).find((x) => x.id === el.dataset.block);
        const X = gewaehlteX();
        const v = Z.erg.vorkommen.find((x) => x.block === el.dataset.block && x.datum === el.dataset.datum);
        if (v && v.vergangen) istKarte(v.id, el);
        else if (b && X && X.vorbereitung.some((z) => z.teil.id === b.teil)) lerntagSetzen(X, el.dataset.datum);
        else if (b && gewaehltesU() && gewaehltesU().teil.id === b.teil) unregelTag(gewaehltesU(), el.dataset.datum);
        else blockKarte(el.dataset.block, el, el.dataset.datum);
        break;
      }
      case 'zum-teil': {
        Z.fokus = teil; zeichnen();
        const ziel = document.querySelector(`[data-teil="${teil}"].teil`);
        if (ziel) { ziel.scrollIntoView({ block: 'center', behavior: 'smooth' }); ziel.focus({ preventScroll: true }); }
        break;
      }
      case 'wahl-aendern': Z.wahlAuf = el.dataset.pruefung; zeichnen(); break;
      case 'unregel-waehlen': unregelWaehlen(el.dataset.u); break;
      case 'zu-unregel': Z.ansicht.bereich = 'frei'; Z.fokus = null; Z.setzen = null; ansichtMerken(); unregelWaehlen(el.dataset.u); break;
      case 'unregel-legen': unregelLegen(el.dataset.u, Number(el.dataset.nr)); break;
      case 'pruefung-wahl': Z.wahlAuf = null; aendern((s) => { const w = { ...(s.plan.pruefungstermin || {}) }; if (w[el.dataset.pruefung] === el.dataset.datum) delete w[el.dataset.pruefung]; else w[el.dataset.pruefung] = el.dataset.datum; s.plan.pruefungstermin = w; }); break;
      case 'links': Z.ansicht.links = el.dataset.wert; ansichtMerken(); zeichnen(); break;
      case 'angemeldet': aendern((s) => { const a = { ...(s.plan.angemeldet || {}) }; if (a[el.dataset.id]) delete a[el.dataset.id]; else a[el.dataset.id] = true; s.plan.angemeldet = a; }); break;
      case 'zeit': zeitKarte(el.dataset.vk, el); break;
      case 'bestaetigen': aendern((s) => { const b = { ...(s.plan.bestaetigt || {}) }; if (b[el.dataset.id]) delete b[el.dataset.id]; else b[el.dataset.id] = true; s.plan.bestaetigt = b; }); break;
      case 'woche-vor': wocheSchritt(Number(el.dataset.schritt)); break;
      case 'zur-woche': zurWoche(el.dataset.woche, el.dataset.hell); break;
      case 'leiste': Z.ansicht.leiste = !Z.ansicht.leiste; ansichtMerken(); zeichnen(); break;
      case 'rueck': rueckgaengig(); break;
      case 'kalender': kalenderKarte(el); break;
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
        // Die Wahl bleibt dran (V-0345, Silas: „man soll ja ein bisschen auch hin und her schieben können“): die anderen
        // Gruppen stehen blass daneben; weiter geht es links mit „Nächste Wahl“.
        if (!fertig()) Z.jetzt[2] = teil;
        aendern((s) => { s.plan.wahl = { ...(s.plan.wahl || {}), [teil]: el.dataset.option }; });
        if (t) { Z.fokus = null; zeichnen(); }
        // Die Gruppe ist ab jetzt gesperrt. Lag dort schon ein Block, muss er in seinem Schritt weichen.
        const neu = [...new Set(Z.erg.vorkommen.filter((v) => v.flags.includes('gesperrt') && !vorher.has(v.block)).map((v) => v.block))];
        if (Z.sprung) sprungEnde();
        if (o && o.kollision) melden(`Achtung: Diese Gruppe trifft ${o.kollision}× einen festen Termin.`);
        else if (neu.length) melden(`Gewählt. ${neu.length} ${neu.length > 1 ? 'Blöcke liegen' : 'Block liegt'} jetzt auf dieser Gruppe — in Schritt 3 oder 4 verschieben (hellblau markiert).`);
        break;
      }
      // Abwählen — auch mit einem Klick auf die gewählte Gruppe im Raster (V-0345, Silas: „ein Select und gleichzeitig ein
      // Deselect, wenn sie vorher selected war“): Dann stehen alle Gruppen wieder in Farbe da.
      case 'abwaehlen': if (!fertig()) Z.jetzt[2] = teil; aendern((s) => { const w = { ...(s.plan.wahl || {}) }; delete w[teil]; s.plan.wahl = w; }); break;
      case 'kachel-teil': if (teil) { Z.fokus = teil; zeichnen(); document.querySelector(`[data-teil="${teil}"].teil`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } break;
      case 'erledigt': aendern((s) => { const t = teilIn(s, teil); delete t[el.dataset.feld]; if (el.dataset.feld === 'offen' && t.einheiten) delete t.einheiten.offen; }); break;
      default: break;
    }
  });
  $('schleier').addEventListener('click', () => karteSchliessen());
  document.addEventListener('change', (e) => {
    const d = e.target.dataset || {};
    if (d.act === 'woche-waehlen' && e.target.value) zurWoche(e.target.value);
    if (d.act === 'plan') location.assign(e.target.value ? `/silas/${e.target.value}` : '/silas/');
    if (d.einheit) videoLaenge(d.einheit, e.target.value);
    if (d.annahme) annahmeAendern(d.annahme, e.target.value);
    if (d.act === 'pruef-status') pruefStatus(d.pruefung, e.target.value);
    if (d.act === 'pruef-punkte') {
      const n = e.target.value === '' ? null : Number(String(e.target.value).replace(',', '.'));
      aendern((s) => { const p = { ...(s.plan.pruefung || {}) }; const x = { ...(p[d.pruefung] || {}) }; if (n == null || !Number.isFinite(n)) delete x.punkte; else x.punkte = n; p[d.pruefung] = x; s.plan.pruefung = p; });
    }
  });
  document.addEventListener('submit', formularAbschicken);
  // Ein Zeitraum (details) auf- oder zugeklappt: merken und beim Öffnen den Kalender zeichnen.
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.zr) return;
    const war = Z.zrAuf.has(d.dataset.zr);
    if (d.open === war) return;
    if (d.open) Z.zrAuf.add(d.dataset.zr); else Z.zrAuf.delete(d.dataset.zr);
    bereichZeichnen();
  }, true);
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
  // Ziehen im Prüfungskalender (V-0349): auf einem Tag drücken und nach unten ziehen wählt die Stunden.
  $('bereich').addEventListener('pointerdown', (e) => { const zelle = e.target.closest('.kal-tag[data-act="frei-tag"]'); if (zelle) kalenderZiehen(e, zelle); });
  // Doppelklick aufs Schild einer gezogenen Mittagspause: wieder automatisch (V-0345).
  $('raster').addEventListener('dblclick', (e) => {
    const el = e.target.closest('.mittag.fest > span')?.parentElement;
    if (!el) return;
    const datum = el.dataset.datum;
    aendern((s) => { const m = { ...(s.plan.mittag || {}) }; delete m[datum]; s.plan.mittag = m; });
    melden(`Mittag am ${datumMitTag(datum)} liegt wieder automatisch.`);
  });
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
    const t = teilIn(s, ziel);
    if (!t) return;
    if (art === 'video') t.einheiten = { ...(t.einheiten || {}), annahme_min: Math.round(n) };
    if (art === 'erwartet') t.erwartet = { ...(t.erwartet || {}), anzahl: Math.round(n) };
    if (art === 'dauer') t.einheiten = { ...(t.einheiten || {}), dauer_min: Math.round(n) };
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
  // Ein Platz beim Stoff (V-0342) zieht den Block ganz hinein.
  const thema = ((geo.thema || [])[tag] || []).find(([a, b]) => mitte >= a && mitte <= b);
  if (thema) start = thema[0];
  const datum = geo.std ? null : M.plusTage(geo.woche.von, tag);
  const woechentlich = !((Z.legen.pruefung || Z.legen.einzeln) && !geo.std);
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

/** Wo ein einzelner Block am Zeiger liegen darf: im Fenster der Einheit, für die er gelegt wird (Unregelmäßiges, V-0354:
 *  Vorbereitung auf die Übung am 30.11. von der Übung davor bis zu ihr), sonst wo das Element etwas zu tun hat. */
const legenErlaubt = () => (Z.legen.fenster ? (d) => d >= Z.legen.fenster[0] && d <= Z.legen.fenster[1] : M.blockTagErlaubt(Z.erg, Z.legen.teil));

function ablegen(tag, y, rect) {
  const l = legenLage(tag, y, rect);
  if (Z.legen.einzeln) {
    // Einzeln (V-0345): nur in echten Wochen, und nur an Tagen, an denen es etwas zu tun gibt (M.blockTagErlaubt).
    if (geo.std) { melden('Diesen Block legst du einzeln — wähl oben eine echte Woche.'); return; }
    const datum = M.plusTage(geo.woche.von, tag);
    if (!legenErlaubt()(datum)) { melden(`Am ${datumMitTag(datum)} gibt es dafür nichts zu tun — die grünen Tage gehen.`); return; }
  }
  if (l.im.length) { gesperrtMelden({ tag, datum: geo.std ? null : M.plusTage(geo.woche.von, tag), start: l.start, ende: l.ende, woechentlich: l.woechentlich }); return; }
  const { teil, alle, bis, ab } = Z.legen;
  // Prüfungsvorbereitung in einer echten Woche: genau an diesem Tag; sonst ein Wochenblock.
  const b = l.woechentlich ? { id: neueId('b'), teil, tag: M.TAGE[tag], start: M.hhmm(l.start), ende: M.hhmm(l.ende) }
    : { id: neueId('l'), teil, datum: M.plusTage(geo.woche.von, tag), start: M.hhmm(l.start), ende: M.hhmm(l.ende) };
  if (l.woechentlich && alle > 1) b.alle = alle;
  // eine Woche vor dem Ende (die Modulbeschreibung rechnet 15 Wochen, M.vorgabe) — oder der Tag vor der Prüfung
  if (l.woechentlich && bis) b.bis = bis;
  // erst ab der ersten Freigabe bzw. dem ersten Stoff des Moduls (M.vorgabe, V-0342) — davor gäbe es nichts zu tun
  if (l.woechentlich && ab) b.ab = ab;
  Z.legen.rest -= 1;
  const weiter = Z.legen.rest > 0;
  if (!weiter) { Z.legen = null; Z.jetzt[schritt()] = null; }
  aendern((s) => { s.plan.bloecke = [...(s.plan.bloecke || []), b]; });
  if (!weiter && Z.sprung) sprungEnde();
  bannerZeigen();
  const z = Z.erg.teile.get(teil);
  const bz = bezugVon(Z.erg.vorkommen.filter((v) => v.block === b.id));
  melden(`${M.kurz(z.modul)} · ${z.teil.titel}: ${l.woechentlich ? M.TAGE[tag] : datumMitTag(b.datum)} ${zeitspanne(l.start, l.ende)}${!l.woechentlich ? '' : alle > 1 ? `, alle ${alle} Wochen` : `, jede Woche${bis && z.teil.art === 'pruefung' ? ` bis ${M.datumKurz(bis)}` : ''}`}${b.ab ? ` ab ${datumMitTag(b.ab)}` : ''} — damit ${M.stunden(z.ist_min)} von ${M.stunden(z.soll_min)}.${bz ? ` Meist ${bz.text}${bz.weit ? ' — weit weg vom Stoff' : ''}.` : ''}${weiter ? ` Noch ${Z.legen.rest} ${Z.legen.rest > 1 ? 'Blöcke' : 'Block'} legen.` : ''}`);
}

/** Die Mittagspause eines Tages am Schild ziehen (V-0345): auf Viertelstunden, innerhalb des Rasters; beim Loslassen steht
 *  sie in plan.mittag[datum]. Geht auch festgelegt — sie plant nichts, sie erinnert nur. */
function mittagZiehen(e, el) {
  e.preventDefault(); e.stopPropagation();
  const rect = $('raster').getBoundingClientRect();
  const datum = el.dataset.datum, start = Number(el.dataset.start), dauer = Z.erg.regeln.mittag_min;
  const m0 = minutenBei(e.clientY, rect);
  let neu = start;
  el.classList.add('zieht');
  const bewegen = (ev) => {
    neu = Math.max(geo.h0 * 60, Math.min(geo.h1 * 60 - dauer, start + minutenBei(ev.clientY, rect) - m0));
    el.style.top = `${((neu - geo.h0 * 60) / ((geo.h1 - geo.h0) * 60)) * 100}%`;
  };
  const los = () => {
    removeEventListener('pointermove', bewegen); removeEventListener('pointerup', los); removeEventListener('pointercancel', los);
    el.classList.remove('zieht');
    if (neu === start) return;
    aendern((s) => { s.plan.mittag = { ...(s.plan.mittag || {}), [datum]: M.hhmm(neu) }; });
    melden(`Mittag am ${datumMitTag(datum)}: ${zeitspanne(neu, neu + dauer)}`);
  };
  addEventListener('pointermove', bewegen); addEventListener('pointerup', los); addEventListener('pointercancel', los);
}

function zeigerRunter(e) {
  if (e.button !== 0) return;
  const schild = !Z.legen && e.target.closest('.mittag > span');
  if (schild) return mittagZiehen(e, schild.parentElement);
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
  // Ein Klick auf eine leere Stelle hebt die Auswahl auf (V-0338, Silas: „wenn man rausklickt, einfach auf irgendeinen
  // Blankspot im Stundenplan, … soll das wieder deselected werden“) — ein gewähltes Modul, einen Bestandteil, die Sache,
  // die Silas links nach vorn geholt hat. Nur wenn nichts gewählt ist, erklärt der Klick, wie man legt.
  const n = schritt();
  if (Z.fokus || Z.setzen || (!fertig() && Z.jetzt[n])) {
    Z.fokus = null; Z.setzen = null; if (!fertig()) Z.jetzt[n] = null; Z.auf[n] = null;
    zeichnen(); bannerZeigen();
    return;
  }
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
