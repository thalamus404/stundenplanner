// Die Seite als One-Pager (docs/DESIGN.md, V-0220): liest das Lesemodell (web/daten/,
// ARCHITEKTUR §5), hält die Auswahl im Browser (§6) und zeichnet fünf Zonen, die genau das Fenster
// füllen. Die reine Logik steht in den .mjs (getestet mit node --test); hier wird nur gezeichnet und
// verdrahtet. Kein Text aus der Datendatei wird HTML: alles durch esc(), Links nur über link().
// Die Content-Security-Policy verbietet Inline-Stil: Lage und Größe der Kacheln setzt diese Datei
// über element.style (CSSOM), Farben über Klassen (m0 … m7).

import { esc, link, stamp, plusTage, tagMonat } from './text.mjs';
import * as A from './auswahl.mjs';
import * as W from './woche.mjs';
import * as R from './raster.mjs';

const $ = (id) => document.getElementById(id);
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const KURZ = TAGE.map((t) => t.slice(0, 2));
const ANSICHTEN = [['all', 'Alle'], ['open', 'Noch offen'], ['selected', 'Mein Plan']];
const ic = (n, k = 'i') => `<svg class="${k}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
const handy = matchMedia('(max-width: 767.98px)');
const fein = matchMedia('(hover: hover) and (pointer: fine)');
const grob = matchMedia('(pointer: coarse)');

// Schon der Zugriff auf localStorage kann werfen (Website-Daten gesperrt). Kein Probeschreiben:
// Laden allein schreibt nichts (auswahl.mjs, Regel 1). Ob Schreiben geht, zeigt die erste Wahl.
const speicher = (() => { try { return window.localStorage; } catch { return null; } })();

// Was die Seite zeigt (Zustand der Bedienung, nur im Speicher der Seite, DESIGN §4.1).
const z = { ansicht: 'open', modul: '', teil: '', zeitraum: 'skeleton', ab: 0, tag: null, handyTag: R.startTag(new Date()), fokus: '' };
let plaene = [], plan = null, bestand = { groups: [], parts: [] }, schluessel = '', eigene = {}, gespeichert = true;
let vorschau = null;      // ein geöffneter Teilen-Link: { link, auswahl, unbekannt }
let selected = [], missing = [], paare = [], partner = new Map(), ax = { von: 8, bis: 18 }, tageZahl = 5, wochen = [], hatAB = false;
let wocheMq = null;       // passt die ganze Woche in dieses Fenster? (DESIGN §3.3)
let navi = [];            // Kacheln je sichtbarer Spalte, für die Pfeiltasten

// ── Laden ──────────────────────────────────────────────────────────────────────────────────────

// Nur relative Pfade unterhalb von daten/: Eine Plandatei kommt nie von woanders her.
const SICHERER_PFAD = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.json$/;

async function holeJson(pfad) {
  const r = await fetch(pfad, { cache: 'no-cache' });
  if (!r.ok) throw Error(String(r.status));
  return r.json();
}

const planName = (p) => {
  const sg = typeof p.studiengang === 'object' && p.studiengang ? p.studiengang : { id: p.studiengang, name: p.name, abschluss: p.abschluss };
  return `${sg.name || sg.id}${sg.abschluss ? ' ' + sg.abschluss : ''}, ${p.fachsemester}. Fachsemester, ${p.label || p.semester}`;
};

function rasterText(html) {
  $('koerper').innerHTML = `<div class="raster-text">${html}</div>`;
}

async function start() {
  let index;
  try {
    index = await holeJson('daten/index.json');
  } catch {
    rasterText('<p>Die Termine konnten nicht geladen werden.</p><button type="button" class="knopf" data-act="start">Erneut versuchen</button>');
    return;
  }
  plaene = (Array.isArray(index.plaene) ? index.plaene : []).filter((p) => p && typeof p.datei === 'string' && SICHERER_PFAD.test(p.datei));
  if (!plaene.length) { rasterText('<p>Es ist noch kein Stundenplan veröffentlicht.</p>'); return; }
  const verweis = A.teilenLesen(location.hash);
  let wahl = verweis ? plaene.find((p) => A.passtZuPlan(verweis, p)) : null;
  if (verweis && !wahl) melde('Der Link gehört zu einem Studienplan, den es hier nicht mehr gibt.');
  if (!wahl && plaene.length === 1) wahl = plaene[0];
  if (!wahl) {
    // Mehrere Pläne: Hat genau einer eine gespeicherte Auswahl, ist er gemeint. (Nur lesen.)
    const mit = plaene.filter((p) => Object.keys(A.ladeAuswahl(speicher, A.speicherSchluessel(p))).length);
    if (mit.length === 1) wahl = mit[0];
  }
  if (!wahl) { rasterText(`<p>Wähle deinen Studiengang und dein Fachsemester.</p>${planWahl()}`); return; }
  await planLaden(wahl, verweis && A.passtZuPlan(verweis, wahl) && Object.keys(verweis.paare).length ? verweis : null);
}

function planWahl() {
  if (plaene.length < 2) return '';
  const i = plan ? plaene.findIndex((p) => A.passtZuPlan({ studiengang: plan.studiengang.id, semester: plan.semester, fachsemester: plan.fachsemester }, p)) : -1;
  return `<span class="wahl"><select data-set="plan" aria-label="Studiengang und Fachsemester">${i < 0 ? '<option value="">Plan wählen …</option>' : ''}${plaene.map((p, j) => `<option value="${j}"${j === i ? ' selected' : ''}>${esc(planName(p))}</option>`).join('')}</select>${ic('unten')}</span>`;
}

async function planLaden(eintrag, verweis) {
  let p;
  try {
    p = await holeJson('daten/' + eintrag.datei);
  } catch {
    rasterText('<p>Die Termine konnten nicht geladen werden.</p><button type="button" class="knopf" data-act="start">Erneut versuchen</button>');
    return;
  }
  setzePlan(p);
  vorschau = verweis ? { link: verweis, ...A.geteilteAuswahl(bestand, verweis.paare) } : null;
  // Erst Kopf, Module und Werkzeug, das Raster in einer eigenen Aufgabe danach: So blockiert keine
  // einzelne Aufgabe den Browser lange (TBT, DESIGN §6); gemessen halbiert das die längste Aufgabe.
  render(false);
  await new Promise((weiter) => setTimeout(weiter));
  render();
  $('seite').classList.remove('laedt');
  if (!selected.length && !vorschau && grob.matches) melde('Tippe auf eine Gruppe, um sie einzuplanen.');
}

function setzePlan(p) {
  const vorher = schluessel;
  plan = p;
  plan.modules = Array.isArray(plan.modules) ? plan.modules : [];
  plan.studiengang = typeof plan.studiengang === 'object' && plan.studiengang ? plan.studiengang : { id: String(plan.studiengang) };
  bestand = A.bestand(plan);
  schluessel = A.speicherSchluessel(plan);
  eigene = A.ladeAuswahl(speicher, schluessel);
  ax = R.achse(bestand.groups);
  tageZahl = R.tagesZahl(bestand.groups);
  wochen = W.wochen(bestand.groups);
  hatAB = W.hatAB(plan, bestand.groups);
  if (vorher !== schluessel) Object.assign(z, { modul: '', teil: '', zeitraum: 'skeleton', ab: 0, fokus: '' });
  if (!wochen.includes(z.zeitraum)) z.zeitraum = 'skeleton';
  if (z.handyTag >= tageZahl) z.handyTag = 0;
  if (wocheMq) wocheMq.removeEventListener('change', render);
  wocheMq = matchMedia(`(min-width: ${R.wochenBreite(R.dichteste(bestand.groups), tageZahl)}px)`);
  wocheMq.addEventListener('change', render);
}

// ── Auswahl ändern — nur auf Handlung des Nutzers, nur hier wird geschrieben ───────────────────

function aendere(neu) {
  eigene = neu;
  gespeichert = A.speichereAuswahl(speicher, schluessel, eigene);
  render();
}

const finde = (key) => bestand.groups.find((g) => g.key === key);
const titel = (g) => `${g.module_short}, ${R.typLang(g.type)}`;

function waehle(key) {
  const g = finde(key);
  if (!g || vorschau) return;
  const vorher = selected.length, n = bestand.parts.length;
  if (g.selected) {
    aendere(A.loese(eigene, g.component_id));
    sage(`${titel(g)}: Auswahl gelöst.`);
    return;
  }
  aendere(A.waehle(eigene, g.component_id, g));
  sage(`${titel(g)}: ${g.name} eingeplant.`);
  if (selected.length === n && vorher < n) melde(`Alle ${n} Bestandteile eingeplant. ${paare.length ? 'Bitte die Überschneidungen prüfen.' : 'Keine Überschneidung.'}`);
}

/** Nur was es im Angebot gibt, geht in den Link — eine verschwundene Gruppe hilft niemandem. */
const teilbareAuswahl = () => Object.fromEntries(selected.map((g) => [g.component_id, { group: g.id }]));

/** Die Adresse ohne Teilen-Teil: bei mehreren Plänen der Plan, sonst nichts hinter dem #. */
function adresseOhneAuswahl() {
  const frag = plaene.length > 1 && plan ? A.teilenFragment(plan, {}) : '';
  history.replaceState(null, '', location.pathname + location.search + frag);
}

function vorschauEnde() {
  vorschau = null;
  adresseOhneAuswahl();
  render();
}

function uebernehmen() {
  if (!vorschau) return;
  const n = Object.keys(eigene).length;
  const tun = () => { const neu = vorschau.auswahl; vorschau = null; adresseOhneAuswahl(); aendere(neu); melde('Plan übernommen'); };
  if (n && !A.gleicheAuswahl(eigene, vorschau.auswahl)) {
    frage('Geteilten Plan übernehmen?', `Deine Auswahl (${mehrzahl(n, 'Gruppe', 'Gruppen')}) wird durch den geteilten Plan ersetzt.`, 'Ersetzen', tun);
  } else tun();
}

function zuruecksetzen() {
  const n = Object.keys(eigene).length;
  if (!n) return;
  frage('Auswahl zurücksetzen?', `Deine Auswahl (${mehrzahl(n, 'Gruppe', 'Gruppen')}) wird in diesem Browser gelöscht.`, 'Zurücksetzen', () => {
    A.loescheAuswahl(speicher, schluessel);
    eigene = {};
    gespeichert = true;
    render();
    sage('Auswahl zurückgesetzt.');
  });
}

async function teilen() {
  const url = location.href.split('#')[0] + A.teilenFragment(plan, teilbareAuswahl());
  if (navigator.share && grob.matches) {
    try { await navigator.share({ title: 'Stundenplan', url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    melde('Link kopiert');
  } catch {
    // Ohne sicheren Kontext gibt es kein Clipboard-API: den Link zum Kopieren von Hand zeigen.
    oeffne('karte', 'Teilen-Link', `<input class="feld" readonly value="${esc(url)}" data-fokus aria-label="Teilen-Link"><p class="klein">Kopieren ging nicht. Markiere den Link und kopiere ihn von Hand.</p>`, { anker: $('teilen') });
    const f = document.querySelector('.feld');
    if (f) f.select();
  }
}

// ── Zeichnen ───────────────────────────────────────────────────────────────────────────────────

function render(mitRaster = true) {
  if (!plan) return;
  ({ selected, missing } = A.auswerten(plan, bestand, vorschau ? vorschau.auswahl : eigene));
  paare = W.conflictPairs(selected);
  partner = new Map();
  for (const p of paare) {
    partner.set(p.a.key, [...(partner.get(p.a.key) || []), p.b]);
    partner.set(p.b.key, [...(partner.get(p.b.key) || []), p.a]);
  }
  renderKopf();
  renderModule();
  renderWerkzeug();
  renderLeiste();
  if (mitRaster) renderRaster();
  renderFuss();
  auffrischen();
}

function standText() {
  const t = plan.last_run && plan.last_run.finished_at;
  const alt = A.veraltet(t);
  return { alt, html: `${alt ? ic('hinweis') : ''}Stand ${t ? stamp(t) : 'unbekannt'}${alt ? ', veraltet' : ''}` };
}

function renderKopf() {
  const s = standText();
  $('plan').textContent = planName(plan);
  $('plan').disabled = false;
  $('stand').innerHTML = s.html;
  $('stand').classList.toggle('alt', s.alt);
  $('stand').disabled = false;
  $('stand-fuss').innerHTML = s.html;
  $('stand-fuss').classList.toggle('alt', s.alt);
  const t = $('teilen');
  t.disabled = !!vorschau || !selected.length;
  t.title = t.disabled ? (vorschau ? 'Erst den geteilten Plan übernehmen oder verwerfen' : 'Erst eine Gruppe wählen') : 'Link zu deiner Auswahl teilen';
  const zahl = hinweise().zahl + paare.length;
  $('mehr-zahl').hidden = !zahl;
  $('mehr-zahl').textContent = zahl;
  $('mehr-zahl').classList.toggle('rot', !!paare.length);
  $('mehr').setAttribute('aria-label', zahl ? `Mehr, ${mehrzahl(zahl, 'Hinweis', 'Hinweise')}` : 'Mehr');
}

function chip(c, m) {
  const g = c.groups.find((x) => x.selected);
  const n = c.groups.filter((x) => x.slots.length).length;
  const fehlt = missing.some((x) => x.component_id === c.id);
  const kon = g && partner.has(g.key);
  const hin = (g && g.changed) || fehlt;
  const s = g && g.slots[0];
  const sym = kon ? ic('warn') : hin ? ic(g && g.changed ? 'neu' : 'hinweis') : g || fehlt ? ic('haken') : '';
  const zahl = !g && !fehlt && n > 1 ? `<span class="c-zahl">${n}</span>` : '';
  const mehr = s ? `<span class="c-mehr">${KURZ[s.day]} ${esc(s.start)}</span>` : n > 1 && !fehlt ? '<span class="c-mehr">Gruppen</span>' : '';
  const was = g ? `gewählt: ${g.name}` : fehlt ? 'gewählte Gruppe nicht mehr im Angebot' : n ? mehrzahl(n, 'Gruppe', 'Gruppen') : 'noch ohne veröffentlichte Termine';
  const tipp = `${m.short}, ${R.typLang(c.type)}, ${c.sws} SWS, ${c.required ? 'Pflichtbereich' : c.section || ''}${n ? '' : '. Noch ohne veröffentlichte Termine'}`;
  return `<button type="button" class="chip${g || fehlt ? ' gewaehlt' : ''}${kon ? ' konflikt' : hin ? ' hinweis' : ''}" data-act="teil" data-teil="${esc(c.id)}" aria-pressed="${z.teil === c.id}" title="${esc(tipp)}" aria-label="${esc(`${m.short}, ${R.typLang(c.type)}, ${was}${kon ? ', Überschneidung' : ''}${g && g.changed ? ', geändert' : ''}`)}"${n || g || fehlt ? '' : ' disabled'}>${sym}<span class="c-modul">${esc(m.short)}</span>${esc(c.type)}${zahl}${mehr}</button>`;
}

function renderModule() {
  $('module').innerHTML = plan.modules.map((m, i) => {
    const warn = m.error || A.veraltet(m.success_at) ? ic('hinweis', 'i warn-i') : '';
    return `<div class="modul m${i % 8}"><button type="button" class="modul-name" data-act="modul" data-m="${i}" aria-label="${esc(m.short)}: Modul-Infos${warn ? ', mit Hinweis' : ''}"><span class="punkt"></span>${esc(m.short)}${warn}</button>${m.components.map((c) => chip(c, m)).join('')}</div>`;
  }).join('');
}

const filterModul = () => z.modul || (z.teil ? (bestand.parts.find((c) => c.id === z.teil) || { module: {} }).module.number || '' : '');
const tagAnsicht = () => (handy.matches || !(wocheMq && wocheMq.matches) ? { woche: false, tag: z.handyTag } : { woche: true, tag: z.tag });

/** Die Steuerung der Ansicht: in der Werkzeugleiste und (am Handy) im Blatt „Ansicht“. */
function steuerung(s) {
  const seg = (name, wert, text, an) => `<label class="seg"><input type="radio" name="${name}${s}" value="${wert}" data-set="${name}"${an ? ' checked' : ''}><span>${text}</span></label>`;
  const i = wochen.indexOf(z.zeitraum);
  const fm = filterModul();
  let html = `<div class="w-gruppe"><div class="segmente" role="radiogroup" aria-label="Ansicht">${ANSICHTEN.map(([w, t]) => seg('ansicht', w, t, z.ansicht === w)).join('')}</div></div>`;
  html += `<div class="w-gruppe"><span class="wahl"><select data-set="modul" aria-label="Modul"><option value="">Alle Module</option>${plan.modules.map((m) => `<option value="${esc(m.number)}"${fm === m.number ? ' selected' : ''}>${esc(m.short)}</option>`).join('')}</select>${ic('unten')}</span></div>`;
  html += `<div class="w-gruppe"><button type="button" class="knopf rund" data-act="zeit" data-d="-1" aria-label="Vorige Woche"${i < 0 ? ' disabled' : ''}>${ic('links')}</button><span class="wahl"><select data-set="zeitraum" aria-label="Zeitraum"><option value="skeleton">Wochenskelett</option>${wochen.map((w) => `<option value="${w}"${w === z.zeitraum ? ' selected' : ''}>Woche ab ${tagMonat(w)}</option>`).join('')}</select>${ic('unten')}</span><button type="button" class="knopf rund" data-act="zeit" data-d="1" aria-label="Nächste Woche"${i === wochen.length - 1 || !wochen.length ? ' disabled' : ''}>${ic('rechts')}</button></div>`;
  if (hatAB && z.zeitraum === 'skeleton') html += `<div class="w-gruppe"><div class="segmente" role="radiogroup" aria-label="A- oder B-Woche">${seg('ab', 0, 'Woche A', z.ab === 0)}${seg('ab', 1, 'Woche B', z.ab === 1)}</div></div>`;
  return html;
}

function renderWerkzeug() {
  const n = bestand.parts.length, k = selected.length, h = hinweise();
  const t = tagAnsicht();
  let stand = k === n && n ? `<span class="marke gut">${ic('haken')}Alle ${n} eingeplant</span>` : `<span>${k} von ${n} ${vorschau ? 'im geteilten Plan' : 'gewählt'}</span>`;
  if (!k && !vorschau) stand += `<span class="tipp">${grob.matches ? 'Tippe' : 'Klicke'} auf eine Gruppe, um sie einzuplanen.</span>`;
  stand += marken(h);
  $('werkzeug').innerHTML = steuerung('') + (t.woche && t.tag !== null ? '<div class="w-gruppe"><button type="button" class="knopf" data-act="woche">Ganze Woche</button></div>' : '') + `<div class="w-stand">${stand}</div>`;
  // Am Handy steht die Steuerung im Blatt; der Knopf nennt die Ansicht und was davon abweicht.
  const ab = [];
  const c = bestand.parts.find((x) => x.id === z.teil);
  if (c) ab.push(`${c.module.short} ${c.type}`);
  else if (z.modul) ab.push((plan.modules.find((m) => m.number === z.modul) || {}).short);
  if (z.zeitraum !== 'skeleton') ab.push(`Woche ab ${tagMonat(z.zeitraum)}`);
  else if (hatAB) ab.push(z.ab ? 'Woche B' : 'Woche A');
  $('ansicht-a').textContent = ANSICHTEN.find(([w]) => w === z.ansicht)[1];
  $('ansicht-b').textContent = ab.join(', ');
  $('ansicht').disabled = false;
  $('ansicht').setAttribute('aria-label', `Ansicht: ${$('ansicht-a').textContent}${ab.length ? ', ' + ab.join(', ') : ''}`);
}

function marken(h) {
  let html = '';
  if (paare.length) html += `<button type="button" class="marke rot" data-act="ebene" data-ebene="hinweise">${ic('warn')}${mehrzahl(paare.length, 'Überschneidung', 'Überschneidungen')}</button>`;
  if (h.zahl) html += `<button type="button" class="marke gelb" data-act="ebene" data-ebene="hinweise">${ic('hinweis')}${mehrzahl(h.zahl, 'Hinweis', 'Hinweise')}</button>`;
  else if (!paare.length && (h.ohne.length || selected.length === bestand.parts.length)) html += `<button type="button" class="marke" data-act="ebene" data-ebene="hinweise">${ic('info')}Hinweise</button>`;
  return html;
}

function renderLeiste() {
  const l = $('leiste');
  l.hidden = !vorschau;
  if (!vorschau) { l.innerHTML = ''; return; }
  const n = Object.keys(vorschau.auswahl).length, k = Object.keys(eigene).length;
  const gleich = k && A.gleicheAuswahl(eigene, vorschau.auswahl);
  const v = A.vergleiche(eigene, vorschau.auswahl);
  const ab = v.anders + v.nurEigene;
  let text = `<b>Geteilter Plan</b>, ${n} von ${bestand.parts.length} gewählt.`;
  if (gleich) text += ' Er entspricht deiner Auswahl.';
  else if (ab) text += ` ${mehrzahl(ab, 'Gruppe weicht', 'Gruppen weichen')} von deiner Auswahl ab (grau).`;
  const u = vorschau.unbekannt.length;
  if (u) text += ` ${mehrzahl(u, 'Gruppe', 'Gruppen')} aus dem Link gibt es nicht mehr.`;
  l.innerHTML = `<p>${text}</p><span class="knoepfe">${gleich ? '<button type="button" class="knopf" data-act="verwerfen">Schließen</button>' : `<button type="button" class="knopf haupt" data-act="uebernehmen"${n ? '' : ' disabled'}>Übernehmen</button><button type="button" class="knopf" data-act="verwerfen">Verwerfen</button>`}</span>`;
}

function raeume(g, s, week) {
  if (!week) return s.rooms || [];
  return [...new Set(W.termineDerKarte(g, s, week, null, plan.anchor).map((b) => b.room))];
}

function renderRaster() {
  const r = $('raster'), k = $('koerper');
  const week = W.wocheAus(z.zeitraum);
  const par = !week && hatAB ? z.ab : null;
  const t = tagAnsicht();
  const spalten = t.tag === null ? [...Array(tageZahl).keys()] : [t.tag];
  const modIndex = new Map(plan.modules.map((m, i) => [m, i]));
  let eintraege = R.sichtbar(bestand.groups, z);
  // Vorschau eines geteilten Plans: Wo die eigene Auswahl abweicht, steht sie grau daneben (§4.2, 10).
  if (vorschau) {
    const im = new Set(selected.map((g) => g.key));
    for (const [cid, e] of Object.entries(eigene)) {
      const g = finde(cid + ':' + e.group);
      if (g && !im.has(g.key)) eintraege.push({ g, art: 'kontext' });
    }
  }
  const jeTag = new Map(spalten.map((d) => [d, []]));
  const zaehl = new Map();
  for (const e of eintraege) {
    for (const s of e.g.slots) {
      if (week && !s.dates.some((d) => d >= week.start && d <= week.end)) continue;
      if (par !== null && !(s.parity || []).includes(par)) continue;
      if (z.teil && e.g.component_id === z.teil) zaehl.set(s.day, (zaehl.get(s.day) || 0) + 1);
      if (!jeTag.has(s.day)) continue;
      jeTag.get(s.day).push({ ...e, s, start: R.minuten(s.start), end: R.minuten(s.end), gewaehlt: e.art === 'moeglich' ? 0 : 1, modul: modIndex.get(e.g.component.module), name: e.g.name });
    }
  }
  r.classList.toggle('ein-tag', t.tag !== null);
  r.classList.toggle('teil', !!z.teil);
  r.classList.toggle('aktionen', fein.matches && !handy.matches && !vorschau);
  r.style.setProperty('--tage', tageZahl);
  r.style.setProperty('--stunden', ax.bis - ax.von);
  k.style.setProperty('--spalten', spalten.length);
  r.setAttribute('aria-label', t.tag === null ? 'Woche' : TAGE[t.tag]);

  $('tage').innerHTML = [...Array(tageZahl).keys()].map((d) => {
    const unter = t.tag !== null && z.teil ? `<span class="zaehl">${zaehl.get(d) || 0}</span>` : week ? `<span class="datum">${tagMonat(plusTage(week.start, d))}</span>` : '';
    const name = t.woche && t.tag === null ? `${TAGE[d]}, nur diesen Tag zeigen` : TAGE[d] + (z.teil && t.tag !== null ? `, ${mehrzahl(zaehl.get(d) || 0, 'Gruppe', 'Gruppen')}` : '');
    return `<button type="button" class="tag" data-act="tag" data-tag="${d}" aria-pressed="${t.tag === d}" aria-label="${esc(name)}"><span class="kurz">${KURZ[d]}</span><span class="lang">${TAGE[d]}</span>${unter}</button>`;
  }).join('');

  const n = ax.bis - ax.von, von = ax.von * 60, dauer = n * 60;
  const liste = [];
  let html = '<div class="stunden">';
  for (let i = 0; i <= n; i++) html += `<div class="stunde"><span>${String(ax.von + i).padStart(2, '0')}</span></div>`;
  html += '</div>';
  for (const d of spalten) {
    const tag = R.spuren(jeTag.get(d).sort(R.ordnung));
    tag.sort((a, b) => a.start - b.start || a.spur - b.spur);
    html += `<div class="spalte" role="group" aria-label="${TAGE[d]}${week ? ' ' + tagMonat(plusTage(week.start, d)) : ''}"><div class="innen">${tag.map(kachel).join('')}</div></div>`;
    liste.push(...tag);
  }
  if (!liste.length) {
    const leer = z.ansicht === 'selected' ? 'Noch keine Gruppe eingeplant.' : z.ansicht === 'open' && !z.teil && !z.modul && selected.length === bestand.parts.length ? 'Alles eingeplant.' : t.tag !== null ? 'An diesem Tag liegt nichts.' : 'Keine Termine für diese Auswahl.';
    html += `<p class="raster-text">${leer}</p>`;
  }
  k.innerHTML = html;
  k.querySelectorAll('.stunde').forEach((el, i) => { el.style.top = (i / n) * 100 + '%'; });
  const els = k.querySelectorAll('.kachel');
  els.forEach((el, i) => {
    const e = liste[i], st = el.style;
    // 1 px Luft oben trennt direkt anschließende Kacheln (10–12, 12–14); nur oben, damit eine
    // 2-h-Kachel am kleinsten Handy die 44 px Zielgröße behält (DESIGN §3.4).
    st.top = `calc(${((e.start - von) / dauer) * 100}% + 1px)`;
    st.height = `calc(${((e.end - e.start) / dauer) * 100}% - 1px)`;
    st.left = `calc(${e.spur} * (100% + 2px) / ${e.spuren})`;
    st.width = `calc((100% + 2px) / ${e.spuren} - 2px)`;
  });
  // Das Raster ist ein Tabulatorhalt; die Pfeiltasten wandern darin (§4.4).
  navi = [...k.querySelectorAll('.innen')].map((c) => [...c.querySelectorAll('.k-flaeche')]);
  const alle = navi.flat();
  const ziel = alle.find((b) => b.dataset.fokus === z.fokus) || alle[0];
  if (ziel) ziel.tabIndex = 0;
}

function kachel(e) {
  const { g, s, art } = e;
  const week = W.wocheAus(z.zeitraum);
  const mit = art === 'moeglich' ? selected.filter((x) => x.component_id !== g.component_id && W.overlap(g, x)) : partner.get(g.key) || [];
  const kon = art !== 'moeglich' && mit.length;
  const neu = art !== 'moeglich' && g.changed && !vorschau;
  const sym = mit.length ? 'warn' : neu ? 'neu' : art === 'gewaehlt' ? 'haken' : '';
  const nr = R.gruppenNummer(g.name);
  const raum = raeume(g, s, week).join(', ');
  const rh = R.rhythmusHinweis(s);
  const zeit = s.start.endsWith(':00') ? '' : s.start + ' ';
  const zustand = art === 'moeglich' ? 'nicht gewählt' : vorschau && art === 'kontext' ? 'deine Auswahl' : 'gewählt';
  const name = `${titel(g)}, ${g.name}, ${TAGE[s.day]} ${s.start} bis ${s.end}${raum ? ', Raum ' + raum : ''}${rh ? ', ' + rh : ''}, ${zustand}${neu ? ', geändert seit deiner Wahl' : ''}${mit.length ? ', überschneidet sich mit ' + mit.map((x) => `${x.module_short} ${R.typLang(x.type)}`).join(' und ') : ''}`;
  const akt = g.selected ? ['Lösen', 'Auswahl lösen'] : g.component.selection ? ['Wechseln', 'Gruppe wechseln'] : ['Einplanen', 'Einplanen'];
  const knopf = vorschau || art === 'kontext' && !g.selected ? '' : `<button type="button" class="k-akt" tabindex="-1" data-act="waehlen" data-key="${esc(g.key)}" aria-label="${esc(`${akt[1]}: ${titel(g)}, ${g.name}`)}">${akt[0]}</button>`;
  return `<div class="kachel ${art === 'kontext' ? '' : 'm' + g.farbe} ${art}${kon ? ' konflikt' : ''}${sym ? ' mit-sym' : ''}" data-key="${esc(g.key)}"><button type="button" class="k-flaeche" tabindex="-1" data-act="kachel" data-key="${esc(g.key)}" data-tag="${s.day}" data-fokus="${esc(g.key + '@' + s.day + s.start)}" aria-label="${esc(name)}"><span class="k-mod">${esc(g.module_short)}</span><span class="k-typ">${esc(g.type)}</span><span class="k-lang">${esc(zeit + g.type + ', ' + (/\d/.test(g.name) ? 'Gruppe ' + nr : g.name))}</span><span class="k-name">${esc(zeit + g.name)}</span><span class="k-nr">${esc(nr)}</span><span class="k-ort">${esc(rh || raum)}</span>${sym ? ic(sym, 'i k-sym') : ''}</button>${knopf}</div>`;
}

function renderFuss() {
  const s = $('speicher');
  const ohne = !speicher || !gespeichert;
  s.textContent = ohne ? 'Dein Browser speichert die Auswahl nicht. Nimm den Teilen-Link mit.' : 'Deine Auswahl wird nur in diesem Browser gespeichert.';
  s.classList.toggle('alt', ohne);
  $('zuruecksetzen').hidden = !!vorschau || !Object.keys(eigene).length;
}

// ── Hinweise, Karten und Blätter ───────────────────────────────────────────────────────────────

function hinweise() {
  const geaendert = vorschau ? [] : selected.filter((g) => g.changed);
  const fehler = plan.modules.filter((m) => m.error);
  const alt = plan.modules.filter((m) => !m.error && A.veraltet(m.success_at));
  const standAlt = A.veraltet(plan.last_run && plan.last_run.finished_at);
  const fehlt = vorschau ? [] : missing;
  return { geaendert, fehlt, fehler, alt, standAlt, ohne: W.ohneTermine(bestand.parts), zahl: geaendert.length + fehlt.length + fehler.length + alt.length + (standAlt ? 1 : 0) };
}

function inhaltHinweise() {
  const h = hinweise(), n = bestand.parts.length;
  const out = [];
  for (const p of paare) {
    out.push(`<div class="signal rot"><p class="zeile">${ic('warn')}<span><b>Überschneidung:</b> ${esc(titel(p.a))} und ${esc(titel(p.b))}, ${p.dates.length === 1 ? '1 gemeinsamer Termin am' : p.dates.length + ' gemeinsame Termine, zuerst am'} ${tagMonat(p.dates[0])}</span></p></div>`);
  }
  for (const g of h.geaendert) {
    out.push(`<div class="signal gelb"><p class="zeile">${ic('neu')}<span><b>Geändert seit deiner Wahl:</b> ${esc(titel(g))}, ${esc(g.name)}. Zeit oder Raum sind anders.</span></p><button type="button" class="knopf" data-act="geprueft" data-key="${esc(g.key)}">Änderung geprüft</button></div>`);
  }
  for (const x of h.fehlt) {
    out.push(`<div class="signal gelb"><p class="zeile">${ic('hinweis')}<span><b>Nicht mehr im Angebot:</b> ${esc(`${x.module_short} ${R.typLang(x.type)}`.trim())}, ${esc(x.name || 'Gruppe ' + x.group_id)}</span></p><button type="button" class="knopf" data-act="loesen" data-teil="${esc(x.component_id)}">Auswahl lösen</button></div>`);
  }
  for (const m of h.fehler) out.push(`<div class="signal gelb"><p class="zeile">${ic('hinweis')}<span><b>Abruf fehlgeschlagen:</b> ${esc(m.short)}. ${m.success_at ? 'Es gilt der Stand vom ' + stamp(m.success_at) + '.' : 'Noch kein gesicherter Stand.'}</span></p></div>`);
  if (h.alt.length) out.push(`<div class="signal gelb"><p class="zeile">${ic('hinweis')}<span>Älter als 36 Stunden: ${esc(h.alt.map((m) => m.short).join(', '))}.</span></p></div>`);
  if (h.standAlt) out.push(`<div class="signal gelb"><p class="zeile">${ic('hinweis')}<span>Der letzte Abruf ist älter als 36 Stunden. Prüfe die Termine in MOSES.</span></p></div>`);
  if (h.ohne.length) out.push(`<p class="zeile">${ic('info')}<span>Noch ohne veröffentlichte Termine: ${esc(h.ohne.map((c) => `${c.module.short} ${c.type}`).join(', '))}.</span></p>`);
  if (n && selected.length === n && !vorschau) out.push(`<p class="zeile">${ic('haken')}<span>Alle ${n} Bestandteile eingeplant. ${paare.length ? 'Die Überschneidungen oben sind noch zu prüfen.' : 'Keine Überschneidung.'} Anmeldung und Kursvorgaben bitte in MOSES und ISIS prüfen.</span></p>`);
  return out.join('') || '<p>Keine Hinweise.</p>';
}

function inhaltStand() {
  const run = plan.last_run;
  const lauf = !run ? 'noch kein Abruf' : run.status === 'ok' ? 'vollständig' : run.status === 'partial' ? 'mit Fehlern bei einzelnen Modulen' : 'fehlgeschlagen';
  return `<p>${esc(planName(plan))}</p>${planWahl()}<p>Quelle: MOSES der TU Berlin, öffentliche Seiten. Abgerufen ${run ? stamp(run.finished_at) : 'noch nie'}, ${lauf}.</p><p class="klein">${mehrzahl(plan.modules.length, 'Modul', 'Module')}, ${mehrzahl(bestand.parts.length, 'Bestandteil', 'Bestandteile')}, ${mehrzahl(plan.group_count ?? bestand.groups.length, 'Termingruppe', 'Termingruppen')}, ${esc(plan.booking_count ?? '')} Einzeltermine.</p>${handy.matches ? '' : '<p class="klein">Kein offizielles Angebot der TU Berlin. Verbindlich sind MOSES und die Anmeldungen dort.</p>'}<div class="e-aktionen"><button type="button" class="knopf" data-act="neu-laden">Neu laden</button></div>`;
}

function inhaltModul(m) {
  const teile = [];
  teile.push(`<p class="klein">${m.number ? 'Modul ' + esc(m.number) : ''}${m.version ? ', Version ' + esc(m.version) : ''}${m.valid_from ? `, gültig ab ${esc(m.valid_from)} bis ${esc(m.valid_to)}` : ''}${m.checked_at ? `. Geprüft ${stamp(m.checked_at)}` : ''}.</p>`);
  if ((m.valid_versions || []).length > 1) teile.push(`<p class="klein">Mehrere gültige Versionen: ${esc(m.valid_versions.join(', '))}. Verwendet wird die höchste.</p>`);
  if (m.error) teile.push(`<div class="signal gelb"><p class="zeile">${ic('hinweis')}<span>Abruf fehlgeschlagen. ${m.success_at ? 'Es gilt der Stand vom ' + stamp(m.success_at) + '.' : 'Noch kein gesicherter Stundenplan.'}</span></p><p class="klein">${esc(m.error)}</p></div>`);
  else if (A.veraltet(m.success_at)) teile.push(`<div class="signal gelb"><p class="zeile">${ic('hinweis')}<span>Die Daten sind älter als 36 Stunden.</span></p></div>`);
  teile.push(`<p class="links">${link(m.url, 'MOSES')}${link(m.isis_url, 'ISIS-Kurssuche')}</p>`);
  for (const c of m.components) {
    const n = c.groups.filter((g) => g.slots.length).length;
    // Gruppen eines fremden Semesters lässt der Abruf aus und vermerkt sie (abruf/README.md): nur leise nennen.
    const aus = (c.ausgelassen || []).map((x) => `„${x.name || x.id}“ hat nur Termine im ${x.semester || 'anderen Semester'}`).join('; ');
    teile.push(`<div><p><b>${esc(R.typLang(c.type))}</b> ${esc(c.title || '')}</p><p class="klein">${esc(c.sws)} SWS, ${c.required ? 'Pflichtbereich' : esc(c.section || '')}, ${n ? mehrzahl(n, 'Termingruppe', 'Termingruppen') : 'noch ohne veröffentlichte Termine'}${aus ? `. Nicht übernommen: ${esc(aus)}` : ''}</p><p class="links">${link(c.vvz_url, 'Vorlesungsverzeichnis')}${link(c.isis_url, 'ISIS')}</p></div>`);
  }
  const notes = Object.entries(m.notes || {});
  if (notes.length) teile.push(notes.map(([k, v]) => `<details><summary>${esc(k)}</summary><p class="notiz">${esc(v || 'Keine Angabe')}</p></details>`).join(''));
  return teile.join('');
}

function inhaltGruppe(g, s) {
  const week = W.wocheAus(z.zeitraum), par = !week && hatAB ? z.ab : null;
  const teile = [`<p><b>${esc(g.name)}</b></p>`];
  teile.push(`<div>${g.slots.map((x) => `<p>${TAGE[x.day]}, ${esc(x.start)}–${esc(x.end)}</p>`).join('')}${g.slots.length > 1 ? '<p class="klein">Gewählt wird die ganze Gruppe, mit allen Wochenterminen.</p>' : ''}<p class="klein">${esc([...new Set(g.slots.map((x) => x.rhythm))].join(', '))}</p></div>`);
  const raum = raeume(g, s, week).join(', ');
  if (raum) teile.push(`<p>${esc(raum)}</p>`);
  const andere = selected.filter((x) => x.component_id !== g.component_id);
  for (const x of andere) {
    const p = W.conflictPairs([g, x])[0];
    if (p) teile.push(`<div class="signal rot"><p class="zeile">${ic('warn')}<span>Überschneidung mit ${esc(titel(x))}: ${p.dates.length === 1 ? '1 gemeinsamer Termin am' : p.dates.length + ' gemeinsame Termine, zuerst am'} ${tagMonat(p.dates[0])}</span></p></div>`);
  }
  if (g.selected && g.changed && !vorschau) teile.push(`<div class="signal gelb"><p class="zeile">${ic('neu')}<span>Zeit oder Raum haben sich seit deiner Wahl geändert.</span></p><button type="button" class="knopf" data-act="geprueft" data-key="${esc(g.key)}">Änderung geprüft</button></div>`);
  const verb = g.selected ? 'Auswahl lösen' : g.component.selection ? 'Gruppe wechseln' : 'Einplanen';
  teile.push(`<div class="e-aktionen">${vorschau ? '<button type="button" class="knopf" disabled>Erst den Plan übernehmen</button>' : `<button type="button" class="knopf haupt" data-act="waehlen" data-key="${esc(g.key)}" data-fokus>${verb}</button>`}${link(g.url, 'In MOSES ansehen')}</div>`);
  const termine = g.slots.flatMap((x) => W.termineDerKarte(g, x, week, par, plan.anchor)).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  teile.push(`<details><summary>${mehrzahl(termine.length, 'Termin', 'Termine')}</summary><ul class="termine">${termine.map((b) => `<li>${KURZ[(new Date(b.date + 'T12:00:00Z').getUTCDay() + 6) % 7]} ${tagMonat(b.date)}, ${esc(b.start)}–${esc(b.end)}, ${esc(b.room)}${b.note ? `<br>${esc(b.note)}` : ''}${b.info ? `<br>${esc(b.info)}` : ''}</li>`).join('')}</ul></details>`);
  teile.push(`<p><button type="button" class="leise" data-act="modul" data-m="${plan.modules.indexOf(g.component.module)}">Zum Modul</button></p>`);
  return teile.join('');
}

function inhaltMehr() {
  return `<p class="klein">Kein offizielles Angebot der TU Berlin. Verbindlich sind MOSES und die Anmeldungen dort.</p>
<section><h3>Hinweise</h3>${inhaltHinweise()}</section>
<section><h3>Module</h3>${plan.modules.map((m, i) => `<button type="button" class="zeile-knopf m${i % 8}" data-act="modul" data-m="${i}"><span class="punkt"></span>${esc(m.title || m.short)}${m.error || A.veraltet(m.success_at) ? ic('hinweis', 'i warn-i') : ''}</button>`).join('')}</section>
<section><h3>Datenstand</h3>${inhaltStand()}</section>
<div class="e-aktionen">${Object.keys(eigene).length && !vorschau ? '<button type="button" class="knopf" data-act="zuruecksetzen">Auswahl zurücksetzen</button>' : ''}<button type="button" class="knopf" data-act="ebene" data-ebene="hilfe">Hilfe</button></div>
<p class="links"><a href="impressum.html">Impressum</a><a href="datenschutz.html">Datenschutz</a></p>`;
}

const EBENEN = {
  hinweise: () => ['karte', 'Hinweise', inhaltHinweise],
  stand: () => ['karte', 'Datenstand', inhaltStand],
  mehr: () => ['karte', 'Mehr', inhaltMehr],
  ansicht: () => ['karte', 'Ansicht', () => `<div class="ansicht-blatt">${steuerung('-b')}</div>`],
  hilfe: () => ['dialog', 'So funktioniert die Planung', () => $('hilfe-text').innerHTML, 'lesen'],
};

// Eine Ebene zur Zeit (§3.5). Ab 768 px Karte an ihrem Anker oder Dialog, darunter ein Blatt von unten.
let offen = null, ebeneNr = 0;

function oeffne(art, kopf, inhalt, { anker = null, wo = 'unten', klasse = '', zurueck = null, neu = null } = {}) {
  schliesse(true);
  const nr = ++ebeneNr;
  const typ = handy.matches ? 'blatt' : art;
  $('ebenen').innerHTML = `<div class="hinter${typ === 'karte' ? ' leer' : ''}"${typ === 'karte' ? ' hidden' : ''}></div><section class="ebene ${typ} ${klasse}" role="dialog" aria-modal="${typ !== 'karte'}" aria-labelledby="e-titel"><div class="e-kopf"><h2 class="e-titel" id="e-titel">${esc(kopf)}</h2><button type="button" class="e-zu" data-act="zu" aria-label="Schließen">${ic('kreuz')}</button></div><div class="e-inhalt${klasse.includes('lesen') ? ' lesen' : ''}">${inhalt}</div></section>`;
  const el = $('ebenen').querySelector('.ebene');
  offen = { el, typ, anker, wo, zurueck: zurueck || (anker ? () => anker : null), neu, nr };
  if (typ === 'karte' && anker) platziere();
  requestAnimationFrame(() => { if (offen && offen.nr === nr) { el.classList.add('da'); $('ebenen').firstChild.classList.add('da'); } });
  (el.querySelector('[data-fokus]') || el.querySelector('.e-zu')).focus({ preventScroll: true });
}

function schliesse(sofort = false) {
  if (!offen) return;
  const { el, zurueck } = offen;
  offen = null;
  const nr = ebeneNr;
  el.classList.remove('da');
  const h = $('ebenen').querySelector('.hinter');
  if (h) h.classList.remove('da');
  if (sofort) $('ebenen').innerHTML = '';
  else setTimeout(() => { if (ebeneNr === nr && !offen) $('ebenen').innerHTML = ''; }, 200);
  if (!sofort && zurueck) {
    const a = zurueck();
    if (a && a.isConnected) a.focus({ preventScroll: true });
  }
}

/** Karte neben ihrem Anker: bei einer Kachel rechts, sonst links, nie über ihr; im Fenster gehalten. */
function platziere() {
  const { el, wo } = offen;
  const a = offen.zurueck && offen.zurueck();
  if (!a || !a.isConnected) return;
  const r = a.getBoundingClientRect(), b = el.offsetWidth, h = el.offsetHeight, m = 8, B = innerWidth, H = innerHeight;
  let x, y;
  if (wo === 'seite' && r.right + m + b <= B - m) x = r.right + m;
  else if (wo === 'seite' && r.left - m - b >= m) x = r.left - m - b;
  if (x !== undefined) y = Math.min(Math.max(r.top, m), H - m - h);
  else {
    x = Math.min(Math.max(r.left, m), B - m - b);
    y = r.bottom + m + h <= H - m ? r.bottom + m : r.top - m - h >= m ? r.top - m - h : H - m - h;
  }
  el.style.left = x + 'px';
  el.style.top = Math.max(m, y) + 'px';
}

/** Nach jeder Änderung: eine offene Ebene, die vom Zustand abhängt, neu füllen, Fokus behalten. */
function auffrischen() {
  if (!offen || !offen.neu) return;
  const f = document.activeElement;
  const sig = f && offen.el.contains(f) ? ['data-set', 'data-act', 'data-key', 'data-d'].map((a) => f.getAttribute(a)) : null;
  offen.el.querySelector('.e-inhalt').innerHTML = offen.neu();
  if (sig) {
    const ziel = [...offen.el.querySelectorAll('button, select, input')].find((x) => ['data-set', 'data-act', 'data-key', 'data-d'].every((a, i) => x.getAttribute(a) === sig[i]) && (x.type !== 'radio' || x.checked));
    (ziel || offen.el.querySelector('.e-zu')).focus({ preventScroll: true });
  }
  if (offen.typ === 'karte') platziere();
}

function ebene(name, anker) {
  const [art, kopf, inhalt, klasse = ''] = EBENEN[name]();
  oeffne(art, kopf, inhalt(), { anker, klasse, neu: inhalt });
}

function karteGruppe(b) {
  const g = finde(b.dataset.key);
  if (!g) return;
  const s = g.slots.find((x) => String(x.day) === b.dataset.tag) || g.slots[0];
  const fokus = b.dataset.fokus;
  z.fokus = fokus;
  const zurueck = () => $('koerper').querySelector(`.k-flaeche[data-fokus="${CSS.escape(fokus)}"]`);
  oeffne('karte', titel(g), inhaltGruppe(g, s), { anker: b, wo: 'seite', klasse: 'karte-g', zurueck, neu: () => inhaltGruppe(finde(g.key) || g, s) });
}

function karteModul(i, anker) {
  const m = plan.modules[i];
  if (m) oeffne('karte', m.title || m.short, inhaltModul(m), { anker: anker && anker.closest('#module') ? anker : null, zurueck: offen ? offen.zurueck : () => anker });
}

function frage(kopf, text, verb, weiter) {
  const zurueck = offen ? offen.zurueck : null;
  oeffne('dialog', kopf, `<p>${esc(text)}</p><div class="e-aktionen"><button type="button" class="knopf haupt" data-act="ja" data-fokus>${esc(verb)}</button><button type="button" class="knopf" data-act="zu">Abbrechen</button></div>`, { zurueck });
  offen.ja = weiter;
}

let meldungUhr = 0;
function melde(text) {
  const el = $('meldung');
  el.textContent = text;
  el.classList.add('da');
  clearTimeout(meldungUhr);
  meldungUhr = setTimeout(() => el.classList.remove('da'), 3000);
}

function sage(text) {
  const el = $('ansage');
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
}

// ── Bedienung ──────────────────────────────────────────────────────────────────────────────────

function filterTeil(id) {
  z.teil = z.teil === id ? '' : id;
  z.modul = '';
  const c = bestand.parts.find((x) => x.id === z.teil);
  render();
  sage(c ? `Nur ${c.module.short} ${R.typLang(c.type)}: ${mehrzahl(c.groups.length, 'Gruppe', 'Gruppen')}.` : 'Filter aufgehoben.');
}

const AKTIONEN = {
  start: () => start(),
  teil: (b) => filterTeil(b.dataset.teil),
  modul: (b) => karteModul(Number(b.dataset.m), b),
  kachel: (b) => karteGruppe(b),
  waehlen: (b) => {
    const key = b.dataset.key;
    const zurueck = offen && offen.zurueck;
    if (offen) schliesse(true);
    waehle(key);
    const ziel = zurueck && zurueck();
    if (ziel && b.closest('.ebene')) ziel.focus({ preventScroll: true });
  },
  geprueft: (b) => { const g = finde(b.dataset.key); if (g && !vorschau) aendere(A.bestaetige(eigene, g.component_id, g)); },
  loesen: (b) => { if (!vorschau) aendere(A.loese(eigene, b.dataset.teil)); },
  tag: (b) => {
    const d = Number(b.dataset.tag), t = tagAnsicht();
    if (t.woche) z.tag = z.tag === d ? null : d;
    else z.handyTag = d;
    render();
  },
  woche: () => { z.tag = null; render(); },
  zeit: (b) => {
    const i = wochen.indexOf(z.zeitraum) + Number(b.dataset.d);
    z.zeitraum = i < 0 ? 'skeleton' : wochen[Math.min(i, wochen.length - 1)] || 'skeleton';
    render();
  },
  ebene: (b) => ebene(b.dataset.ebene, b),
  zu: () => schliesse(),
  ja: () => { const f = offen && offen.ja; schliesse(); if (f) f(); },
  teilen: () => teilen(),
  zuruecksetzen: () => zuruecksetzen(),
  uebernehmen: () => uebernehmen(),
  verwerfen: () => vorschauEnde(),
  'neu-laden': async () => {
    const eintrag = plaene.find((p) => A.passtZuPlan({ studiengang: plan.studiengang.id, semester: plan.semester, fachsemester: plan.fachsemester }, p));
    if (!eintrag) { start(); return; }
    try {
      setzePlan(await holeJson('daten/' + eintrag.datei));
    } catch {
      melde('Die Termine konnten nicht geladen werden.');
      return;
    }
    if (vorschau) vorschau = { link: vorschau.link, ...A.geteilteAuswahl(bestand, vorschau.link.paare) };
    render();
    melde('Daten neu geladen');
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled || !AKTIONEN[b.dataset.act]) return;
  if (b.closest('.kachel')) z.fokus = b.closest('.kachel').querySelector('.k-flaeche').dataset.fokus;
  AKTIONEN[b.dataset.act](b);
});

// Ein Klick neben eine Karte schließt sie und darf trotzdem wirken (eine andere Kachel öffnen).
document.addEventListener('pointerdown', (e) => {
  if (offen && offen.typ === 'karte' && !offen.el.contains(e.target)) {
    const a = offen.zurueck && offen.zurueck();
    if (!(a && a.contains(e.target))) schliesse(true);
  }
});
$('ebenen').addEventListener('click', (e) => { if (e.target.classList.contains('hinter')) schliesse(); });

document.addEventListener('change', (e) => {
  const t = e.target, k = t.dataset.set;
  if (!k) return;
  if (k === 'plan') { planWechseln(Number(t.value)); return; }
  if (k === 'ansicht') z.ansicht = t.value;
  if (k === 'modul') { z.modul = t.value; z.teil = ''; }
  if (k === 'zeitraum') z.zeitraum = t.value;
  if (k === 'ab') z.ab = Number(t.value);
  render();
});

async function planWechseln(i) {
  const p = plaene[i];
  if (!p) return;
  schliesse(true);
  vorschau = null;
  history.replaceState(null, '', location.pathname + location.search + A.teilenFragment(p, {}));
  await planLaden(p, null);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (offen) { e.preventDefault(); schliesse(); } else if (z.teil) filterTeil(z.teil);
    return;
  }
  if (e.key === 'Tab' && offen) {
    // Der Fokus bleibt in der offenen Ebene; Esc führt hinaus.
    const f = [...offen.el.querySelectorAll('button:not(:disabled), a[href], select, input, summary')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
});

// Pfeiltasten im Raster: ↑ ↓ im Tag, ← → zur zeitlich nächsten Kachel im Nachbartag, Pos1/Ende (§4.4).
$('koerper').addEventListener('keydown', (e) => {
  const b = e.target.closest('.k-flaeche');
  if (!b) return;
  const ci = navi.findIndex((l) => l.includes(b)), ti = navi[ci].indexOf(b);
  let ziel = null;
  if (e.key === 'ArrowDown') ziel = navi[ci][ti + 1];
  else if (e.key === 'ArrowUp') ziel = navi[ci][ti - 1];
  else if (e.key === 'Home') ziel = navi[ci][0];
  else if (e.key === 'End') ziel = navi[ci][navi[ci].length - 1];
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const top = b.parentElement.offsetTop;
    for (let c = ci + (e.key === 'ArrowRight' ? 1 : -1); c >= 0 && c < navi.length && !ziel; c += e.key === 'ArrowRight' ? 1 : -1) {
      if (navi[c].length) ziel = navi[c].reduce((x, y) => (Math.abs(y.parentElement.offsetTop - top) < Math.abs(x.parentElement.offsetTop - top) ? y : x));
    }
  }
  if (!ziel) return;
  e.preventDefault();
  b.tabIndex = -1;
  ziel.tabIndex = 0;
  z.fokus = ziel.dataset.fokus;
  ziel.focus();
});

// Zeigt man auf eine Kachel, bekommen alle Kacheln derselben Gruppe einen Ring: gewählt wird die ganze Gruppe.
$('koerper').addEventListener('pointerover', (e) => {
  const k = e.target.closest('.kachel');
  $('koerper').querySelectorAll('.zeigen').forEach((x) => { if (!k || x.dataset.key !== k.dataset.key) x.classList.remove('zeigen'); });
  if (!k) return;
  const alle = $('koerper').querySelectorAll(`.kachel[data-key="${CSS.escape(k.dataset.key)}"]`);
  if (alle.length > 1) alle.forEach((x) => x.classList.add('zeigen'));
});
$('koerper').addEventListener('pointerleave', () => $('koerper').querySelectorAll('.zeigen').forEach((x) => x.classList.remove('zeigen')));

handy.addEventListener('change', () => { schliesse(true); render(); });
fein.addEventListener('change', render);
addEventListener('resize', () => { if (offen && offen.typ === 'karte') platziere(); });

// Eine zweite Registerkarte ändert die Auswahl: hier nachziehen, statt sie beim nächsten Klick
// zu überschreiben (im Vorbild verhinderte das eine Revision mit 409 auf dem Server).
addEventListener('storage', (e) => {
  if (!plan || (e.key !== null && e.key !== schluessel)) return;
  eigene = A.ladeAuswahl(speicher, schluessel);
  render();
});

// Ein Teilen-Link, in diese offene Seite eingefügt.
addEventListener('hashchange', () => { if (A.teilenLesen(location.hash)) { schliesse(true); start(); } });

start();
