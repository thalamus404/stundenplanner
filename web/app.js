// Die Seite: liest das Lesemodell (web/daten/, ARCHITEKTUR §5), hält die Auswahl im Browser (§6)
// und zeichnet den Wochenbaukasten. Getreuer Nachbau von app/static/stundenplan.js und
// app/templates/stundenplan.html des Study OS; was dort der Server tat (Auswahl speichern,
// selected/changed/missing rechnen), tut hier auswahl.mjs im Browser.
//
// Kein Text aus der Datendatei wird als HTML gerendert: Alles geht durch esc() (text.mjs), Links
// nur zu MOSES/ISIS (link()). Dazu verbietet die Content-Security-Policy in index.html Inline-Skript
// und Inline-Stil — deshalb tragen die Modulfarben Klassen (sp-c0 … sp-c4), keine style-Attribute.

import { esc, link, dateLabel, datumLang, stamp, plusTage } from './text.mjs';
import * as A from './auswahl.mjs';
import * as W from './woche.mjs';

const root = document.getElementById('stundenplan');
const $ = (id) => document.getElementById('sp-' + id);
const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const shortDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Schon der Zugriff auf localStorage kann werfen (Website-Daten gesperrt). Kein Probeschreiben:
// Laden allein schreibt nichts (auswahl.mjs, Regel 1). Ob Schreiben geht, zeigt die erste Wahl.
const speicher = (() => { try { return window.localStorage; } catch { return null; } })();

let plaene = [];
let plan = null;
let bestand = { groups: [], parts: [] };
let schluessel = '';
let eigene = {};          // die eigene Auswahl, wie sie im Speicher steht (oder nur im Speicher der Seite)
let gespeichert = true;   // ging das letzte Schreiben durch?
let vorschau = null;      // ein geöffneter Teilen-Link: { link, auswahl, unbekannt }
let selected = [];
let missing = [];
let activePart = '';

// ── Laden ──────────────────────────────────────────────────────────────────────────────────────

// Nur relative Pfade unterhalb von daten/: Eine Plandatei kommt nie von woanders her.
const SICHERER_PFAD = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.json$/;

async function holeJson(pfad) {
  const r = await fetch(pfad, { cache: 'no-cache' });
  if (!r.ok) throw Error('Stundenplandaten konnten nicht geladen werden (' + r.status + ').');
  return r.json();
}

function planText(p) {
  return `${p.name || p.studiengang} ${p.abschluss || ''} · ${p.label || p.semester} · ${p.fachsemester}. Fachsemester`.replace(/ +·/g, ' ·');
}

async function start() {
  zeigeFehler('');
  let index;
  try {
    index = await holeJson('daten/index.json');
  } catch (e) {
    zeigeFehler(e.message);
    $('status').textContent = 'Keine Daten.';
    return;
  }
  plaene = (Array.isArray(index.plaene) ? index.plaene : []).filter((p) => p && typeof p.datei === 'string' && SICHERER_PFAD.test(p.datei));
  if (!plaene.length) {
    zeigeFehler('Es ist noch kein Stundenplan veröffentlicht.');
    $('status').textContent = 'Keine Daten.';
    return;
  }
  const link = A.teilenLesen(location.hash);
  let wahl = null;
  if (link) {
    wahl = plaene.find((p) => A.passtZuPlan(link, p)) || null;
    if (!wahl) zeigeFehler('Der Link gehört zu einem Studienplan, den es hier nicht (mehr) gibt.');
  }
  if (!wahl && plaene.length === 1) wahl = plaene[0];
  if (!wahl) {
    // Mehrere Pläne: Hat genau einer eine gespeicherte Auswahl, ist er gemeint. (Nur lesen.)
    const mit = plaene.filter((p) => Object.keys(A.ladeAuswahl(speicher, A.speicherSchluessel(p))).length);
    if (mit.length === 1) wahl = mit[0];
  }
  planWahlZeigen(wahl);
  if (!wahl) {
    leer('Wähle oben deinen Studiengang und dein Fachsemester.');
    return;
  }
  await planLaden(wahl, link && A.passtZuPlan(link, wahl) && Object.keys(link.paare).length ? link : null);
}

function planWahlZeigen(wahl) {
  $('plan').hidden = plaene.length < 2;
  $('plan-select').innerHTML = (wahl ? '' : '<option value="">Plan wählen …</option>') +
    plaene.map((p, i) => `<option value="${i}" ${p === wahl ? 'selected' : ''}>${esc(planText(p))}</option>`).join('');
}

function leer(text) {
  plan = null;
  $('status').textContent = text;
  $('modules').innerHTML = '';
  $('feedback').innerHTML = '';
  $('shared').innerHTML = '';
  $('calendar').hidden = true;
  $('share').disabled = true;
  $('reset').disabled = true;
}

async function planLaden(eintrag, link) {
  let p;
  try {
    p = await holeJson('daten/' + eintrag.datei);
  } catch (e) {
    zeigeFehler(e.message);
    leer('Keine Daten.');
    return;
  }
  setzePlan(p);
  vorschau = link ? { link, ...A.geteilteAuswahl(bestand, link.paare) } : null;
  render();
}

function setzePlan(p) {
  const vorher = plan && A.speicherSchluessel(plan);
  plan = p;
  plan.modules = Array.isArray(plan.modules) ? plan.modules : [];
  bestand = A.bestand(plan);
  schluessel = A.speicherSchluessel(plan);
  eigene = A.ladeAuswahl(speicher, schluessel);
  if (vorher !== schluessel) activePart = '';
  const f = $('filter').value, per = $('period').value;
  $('filter').innerHTML = '<option value="">Alle Module</option>' +
    plan.modules.map((m) => `<option value="${esc(m.number)}">${esc(m.short)}</option>`).join('');
  $('period').innerHTML = '<option value="skeleton">Wochenskelett</option>' +
    W.wochen(bestand.groups).map((v) => `<option value="${v}">Woche ab ${dateLabel(v)}</option>`).join('');
  // Nach „Daten neu laden“ bleibt stehen, was man eingestellt hatte, wenn es das noch gibt.
  if ([...$('filter').options].some((o) => o.value === f)) $('filter').value = f;
  if ([...$('period').options].some((o) => o.value === per)) $('period').value = per;
  $('calendar').hidden = false;
  const sg = plan.studiengang || {};
  $('eyebrow').textContent = planText({ name: sg.name, abschluss: sg.abschluss, studiengang: sg.id, label: plan.label, semester: plan.semester, fachsemester: plan.fachsemester });
}

function zeigeFehler(text) {
  $('error').hidden = !text;
  $('error').textContent = text;
}

// ── Auswahl ändern — nur auf Handlung des Nutzers, nur hier wird geschrieben ───────────────────

function aendere(neu) {
  eigene = neu;
  gespeichert = A.speichereAuswahl(speicher, schluessel, eigene);
  render();
}

function choose(g, select) {
  if (!g || vorschau) return;
  aendere(select ? A.waehle(eigene, g.component_id, g) : A.loese(eigene, g.component_id));
}

/** Nur was es im Angebot gibt, geht in den Link — eine verschwundene Gruppe hilft niemandem. */
function teilbareAuswahl() {
  return Object.fromEntries(selected.map((g) => [g.component_id, { group: g.id }]));
}

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
  if (n && !A.gleicheAuswahl(eigene, vorschau.auswahl) &&
      !confirm(`Deine bisherige Auswahl (${n} ${n === 1 ? 'Gruppe' : 'Gruppen'}) wird durch den geteilten Plan ersetzt.`)) return;
  const neu = vorschau.auswahl;
  vorschau = null;
  adresseOhneAuswahl();
  aendere(neu);
}

function zuruecksetzen() {
  const n = Object.keys(eigene).length;
  if (!n) return;
  if (!confirm(`Deine Auswahl (${n} ${n === 1 ? 'Gruppe' : 'Gruppen'}) in diesem Browser löschen? Das lässt sich nicht rückgängig machen.`)) return;
  A.loescheAuswahl(speicher, schluessel);
  eigene = {};
  gespeichert = true;
  render();
}

// ── Zeichnen ───────────────────────────────────────────────────────────────────────────────────

function options(g) {
  return g.name + ' · ' + g.slots.map((s) => shortDays[s.day] + ' ' + s.start + '–' + s.end).join(', ');
}

function moduleHTML(m, i) {
  const gesperrt = vorschau ? 'disabled' : '';
  return `<article class="sp-module sp-c${i % 5}"><h2>${esc(m.short)}</h2><p class="sp-module-title">${esc(m.title)}</p><div class="sp-meta">#${esc(m.number)} · ${m.version ? 'Version ' + esc(m.version) : 'Version ungeprüft'}</div>
${m.error ? `<p class="sp-notice">Abruf fehlgeschlagen. ${m.success_at ? 'Letzter erfolgreicher Stand: ' + stamp(m.success_at) + '.' : 'Noch kein gesicherter Stundenplan.'}<br>${esc(m.error)}</p>` : ''}
${A.veraltet(m.success_at) && !m.error ? '<p class="sp-notice">Daten älter als 36 Stunden oder noch nicht geladen.</p>' : ''}
<ul class="sp-parts">${m.components.map((c) => {
    const g = c.groups.find((x) => x.selected);
    return `<li class="sp-part ${g ? 'done' : ''}"><div class="sp-part-top"><button type="button" data-part="${esc(c.id)}" title="Diese Lehrveranstaltung im Kalender anzeigen"><span class="sp-check">${g ? '✓' : '○'}</span><span class="sp-part-label">${esc(c.type)} · ${c.required ? 'Pflichtbereich' : esc(c.section)}</span></button><span class="sp-sws">${esc(c.sws)} SWS</span></div><select data-component="${esc(c.id)}" aria-label="${esc(m.short + ' ' + c.type + ' Termingruppe')}" ${gesperrt}><option value="">${g ? 'Auswahl lösen' : 'Gruppe wählen …'}</option>${c.groups.map((x) => `<option value="${esc(x.id)}" ${x.selected ? 'selected' : ''} ${!x.bookings.length ? 'disabled' : ''}>${esc(options(x) || x.name)}${!x.bookings.length ? ' · ohne Termine' : ''}</option>`).join('')}</select></li>`;
  }).join('')}</ul>
<div class="sp-links">${link(m.url, 'MOSES')}${link(m.isis_url, 'ISIS-Kurssuche')}</div>
${m.version ? `<details class="sp-source" data-open="source-${esc(m.number)}"><summary>Gültigkeit & Hinweise</summary><p>Gültig ab ${esc(m.valid_from)}, bis ${esc(m.valid_to)}. Geprüft: ${stamp(m.checked_at)}.</p>${(m.valid_versions || []).length > 1 ? '<p>Mehrere gültige Versionen: ' + esc(m.valid_versions.join(', ')) + '. Höchste gültige Version verwendet.</p>' : ''}${Object.entries(m.notes || {}).map(([k, v]) => `<p><b>${esc(k)}</b><br>${esc(v || 'Keine Angabe')}</p>`).join('')}${m.components.map((c) => `<p>${esc(c.type)} · ${esc(c.title)} · ${esc(c.sws)} SWS<br>${link(c.vvz_url, 'VVZ')}${link(c.isis_url, 'ISIS')}</p>`).join('')}</details>` : ''}</article>`;
}

function renderStatus() {
  const run = plan.last_run;
  const lauf = !run ? 'noch nicht abgerufen' : run.status === 'ok' ? 'vollständig abgerufen' : run.status === 'running' ? 'Abruf läuft' : 'Abruf mit Fehlern';
  const n = bestand.parts.length;
  $('status').innerHTML = `<span><b>${plan.modules.length}</b> Module · <b>${n}</b> Lehrveranstaltungen · <b>${esc(plan.group_count ?? bestand.groups.length)}</b> Termingruppen</span><span><b>${selected.length}/${n}</b> ${vorschau ? 'im geteilten Plan' : 'eingeplant'}</span><span>MOSES · ${esc(plan.booking_count ?? '')} Einzeltermine: ${stamp(run?.finished_at)} · ${lauf}</span>`;
}

function renderLokal() {
  $('local-text').textContent = speicher && gespeichert
    ? 'Deine Auswahl wird nur in diesem Browser gespeichert.'
    : 'Dieser Browser speichert gerade nichts: Deine Auswahl gilt nur, bis du die Seite neu lädst.';
  $('reset').disabled = !!vorschau || !Object.keys(eigene).length;
  $('share').disabled = !!vorschau || !selected.length;
  if ($('share').disabled) $('sharebox').hidden = true;
}

function renderGeteilt() {
  if (!vorschau) { $('shared').innerHTML = ''; return; }
  const n = Object.keys(vorschau.auswahl).length;
  const k = Object.keys(eigene).length;
  const gleich = A.gleicheAuswahl(eigene, vorschau.auswahl);
  let html = `<div class="sp-notice sp-shared"><b>Geteilter Plan</b> · ${n} von ${bestand.parts.length} Bestandteilen eingeplant. Du siehst ihn nur an; gespeichert ist er erst, wenn du ihn übernimmst.`;
  if (k && gleich) html += '<p>Er entspricht deiner Auswahl.</p>';
  else if (k) {
    const v = A.vergleiche(eigene, vorschau.auswahl);
    html += `<p>Im Vergleich zu deiner Auswahl: ${v.gleich} gleich, ${v.anders} mit anderer Gruppe, ${v.nurEigene} nur bei dir, ${v.nurAndere} nur im geteilten Plan.</p>`;
  }
  if (vorschau.unbekannt.length) {
    const u = vorschau.unbekannt.length;
    html += `<p>${u} ${u === 1 ? 'Gruppe' : 'Gruppen'} aus dem Link gibt es im aktuellen Angebot nicht; ${u === 1 ? 'sie wird' : 'sie werden'} nicht übernommen.</p>`;
  }
  html += '<p class="sp-shared-actions">';
  if (gleich && k) html += '<button type="button" data-geteilt="zurueck">Schließen</button>';
  else html += `<button type="button" data-geteilt="uebernehmen" ${n ? '' : 'disabled'}>Übernehmen</button><button type="button" data-geteilt="zurueck">${k ? 'Meine Auswahl zeigen' : 'Verwerfen'}</button>`;
  $('shared').innerHTML = html + '</p></div>';
}

function renderFeedback() {
  const pairs = W.conflictPairs(selected);
  const label = (g) => g.module_short + ' ' + g.type;
  let html = '';
  if (pairs.length) html += `<div class="sp-notice"><b>${pairs.length} Zeitkonflikt${pairs.length > 1 ? 'e' : ''} in deiner Auswahl</b><ul>${pairs.map((p) => `<li>${esc(label(p.a))} und ${esc(label(p.b))} · ${p.dates.length === 1 ? '1 gemeinsamer Termin, am' : p.dates.length + ' gemeinsame Termine, zuerst'} ${dateLabel(p.dates[0])}</li>`).join('')}</ul></div>`;
  const changed = selected.filter((g) => g.changed);
  if (changed.length) html += `<div class="sp-notice"><b>Termine seit deiner Auswahl geändert</b>${changed.map((g) => `<p>${esc(label(g) + ' · ' + g.name)} <button type="button" data-review="${esc(g.key)}">Änderung geprüft</button></p>`).join('')}</div>`;
  if (missing.length) html += `<div class="sp-notice"><b>Gespeicherte Auswahl nicht mehr im aktuellen Angebot</b>${missing.map((x) => `<p>${esc((x.module_short + ' ' + x.type).trim() + ' · ' + (x.name || 'Gruppe ' + x.group_id))} <button type="button" data-missing="${esc(x.component_id)}">Auswahl lösen</button></p>`).join('')}</div>`;
  const n = bestand.parts.length;
  if (selected.length === n && n) html += `<div class="sp-notice">Alle ${n} Modulbestandteile eingeplant. ${pairs.length ? 'Die angezeigten Überschneidungen sind noch zu prüfen.' : 'Keine zeitlichen Überschneidungen im veröffentlichten Angebot.'} Anmeldung und Kursvorgaben bitte in ISIS prüfen.</div>`;
  $('feedback').innerHTML = html;
}

function card(g, s, week, parity) {
  const clash = W.kollidiert(g, selected);
  const bookings = W.termineDerKarte(g, s, week, parity, plan.anchor);
  const raeume = week ? [...new Set(bookings.map((b) => b.room))] : (s.rooms || []);
  const knopf = g.selected ? 'Auswahl lösen' : g.component.selection ? 'Gruppe wechseln' : 'Einplanen';
  return `<article class="sp-event sp-c${g.farbe} ${g.selected ? 'selected' : ''} ${clash ? 'sp-conflict' : ''}"><h3>${esc(g.module_short)} · ${esc(g.type)}</h3><div>${esc(g.name)}</div><div class="sp-time">${esc(s.start)}–${esc(s.end)}</div><div class="sp-room">${esc(raeume.join(' / '))}</div><span class="sp-badge">${g.selected ? '✓ Eingeplant · ' : ''}${esc(s.rhythm)}${clash ? ' · Überschneidung' : ''}</span>
<button type="button" class="sp-select" data-select="${esc(g.key)}" ${vorschau ? 'disabled' : ''}>${knopf}</button>
<details data-open="dates-${esc(g.key + '-' + s.day + '-' + s.start)}"><summary>${bookings.length} genaue Termine & Quelle</summary><ul class="sp-date-list">${bookings.map((b) => `<li>${dateLabel(b.date)} · ${esc(b.start)}–${esc(b.end)}<br>${esc(b.room)}${b.note ? '<br>' + esc(b.note) : ''}${b.info ? '<br>' + esc(b.info) : ''}</li>`).join('')}</ul>${link(g.url, 'MOSES-Termingruppe')}</details></article>`;
}

function renderGrid() {
  if (!plan) return;
  const view = $('view').value, filter = $('filter').value, period = $('period').value, day = $('day').value;
  const candidates = W.kandidaten(bestand.groups, { view, filter, activePart });
  const week = W.wocheAus(period);
  const skeleton = !week;
  const ab = W.hatAB(plan, bestand.groups);
  // Tagesansicht: eine Spalte statt sieben. Auf dem Handy ist die Wochentabelle sieben Spalten
  // breit und damit unlesbar; die Frage „was habe ich heute“ beantwortet ein einzelner Tag.
  // Nur in einer konkreten Woche — ein Wochenskelett hat kein Datum.
  $('day').closest('label').hidden = skeleton;
  if (skeleton && day !== '') $('day').value = '';
  const tag = skeleton || day === '' ? null : Number(day);
  const tagDatum = week && tag !== null ? plusTage(week.start, tag) : null;
  const panels = skeleton && ab ? [0, 1] : [null];
  $('cycle').textContent = skeleton
    ? (ab ? 'A/B-Wochen · Kalenderwochen ab ' + datumLang(plan.anchor) : 'Eine Woche · kein zweiwöchiger Rhythmus erkannt')
    : 'Konkrete Woche · ' + dateLabel(week.start) + '–' + dateLabel(week.end);
  $('grid').innerHTML = panels.map((parity) => {
    const events = W.ereignisse(candidates, week, parity);
    if (!events.length) return '<p class="sp-empty">' + (view === 'selected' ? 'Noch keine passenden Termine eingeplant.' : 'Keine Termine für diese Ansicht. Prüfe Zeitraum und Filter.') + '</p>';
    const nurTag = tag !== null;
    const gefiltert = nurTag ? events.filter((e) => e.s.day === tag) : events;
    const times = [...new Set(gefiltert.map((e) => e.s.start))].sort();
    const lastDay = Math.max(4, ...events.map((e) => e.s.day));
    const spalten = nurTag ? [tag] : days.slice(0, lastDay + 1).map((_, i) => i);
    const caption = nurTag ? days[tag] + ', ' + dateLabel(tagDatum)
      : parity === null ? (skeleton ? 'Wochenskelett' : dateLabel(week.start) + ' – ' + dateLabel(week.end))
      : 'Woche ' + (parity === 0 ? 'A' : 'B') + ' · ab ' + datumLang(plusTage(plan.anchor, parity * 7));
    const zeilen = times.length ? times.map((t) => `<tr><th scope="row">${esc(t)}</th>${spalten.map((d) => {
      const matches = events.filter((e) => e.s.start === t && e.s.day === d).sort(W.zellenOrdnung);
      const top = matches.slice(0, 2), more = matches.slice(2);
      return `<td>${top.map((e) => card(e.g, e.s, week, parity)).join('')}${more.length ? `<details class="sp-more" data-open="cell-${parity}-${d}-${esc(t)}"><summary>+ ${more.length} weitere Möglichkeiten</summary>${more.map((e) => card(e.g, e.s, week, parity)).join('')}</details>` : ''}</td>`;
    }).join('')}</tr>`).join('') : '<tr><td class="sp-leer" colspan="2">An diesem Tag steht nichts an.</td></tr>';
    return `<div class="sp-table-wrap${nurTag ? ' sp-tag' : ''}" tabindex="0" role="region" aria-label="${nurTag ? 'Tagesplan' : 'Wochenkalender horizontal scrollbar'}"><table class="sp-table"><caption>${esc(caption)}</caption><thead><tr><th scope="col">Beginn</th>${spalten.map((i) => `<th scope="col">${days[i]}</th>`).join('')}</tr></thead><tbody>${zeilen}</tbody></table></div>`;
  }).join('');
  const unplanned = W.ohneTermine(bestand.parts);
  $('unplanned').innerHTML = unplanned.length ? `<p class="sp-notice">Noch ohne veröffentlichte Termine: ${unplanned.map((c) => esc(c.module.short + ' ' + c.type)).join(', ')}. Diese Bestandteile bleiben offen.</p>` : '';
}

function render() {
  if (!plan) return;
  const open = new Set([...root.querySelectorAll('details[open][data-open]')].map((x) => x.dataset.open));
  ({ selected, missing } = A.auswerten(plan, bestand, vorschau ? vorschau.auswahl : eigene));
  renderStatus();
  renderLokal();
  renderGeteilt();
  $('modules').innerHTML = plan.modules.map(moduleHTML).join('');
  renderFeedback();
  renderGrid();
  root.querySelectorAll('details[data-open]').forEach((x) => { if (open.has(x.dataset.open)) x.open = true; });
}

// ── Bedienung ──────────────────────────────────────────────────────────────────────────────────

root.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const finde = (key) => bestand.groups.find((x) => x.key === key);
  if (b.dataset.select) { const g = finde(b.dataset.select); if (g) choose(g, !g.selected); }
  if (b.dataset.review && !vorschau) { const g = finde(b.dataset.review); if (g) aendere(A.bestaetige(eigene, g.component_id, g)); }
  if (b.dataset.missing && !vorschau) aendere(A.loese(eigene, b.dataset.missing));
  if (b.dataset.geteilt === 'uebernehmen') uebernehmen();
  if (b.dataset.geteilt === 'zurueck') vorschauEnde();
  if (b.dataset.part) {
    activePart = activePart === b.dataset.part ? '' : b.dataset.part;
    const c = bestand.parts.find((x) => x.id === activePart);
    $('filter').value = c ? c.module.number : '';
    $('view').value = 'all';
    renderGrid();
    $('grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

root.addEventListener('change', (e) => {
  const cid = e.target.dataset.component;
  if (!cid) return;
  const c = bestand.parts.find((x) => x.id === cid);
  if (!c) return;
  const g = c.groups.find((x) => x.id === e.target.value) || c.groups.find((x) => x.selected);
  if (g) choose(g, !!e.target.value);
});

['view', 'filter', 'period', 'day'].forEach((id) => $(id).addEventListener('change', () => { activePart = ''; renderGrid(); }));

$('plan-select').addEventListener('change', async (e) => {
  const p = plaene[Number(e.target.value)];
  if (!p) return;
  vorschau = null;
  zeigeFehler('');
  planWahlZeigen(p);
  history.replaceState(null, '', location.pathname + location.search + A.teilenFragment(p, {}));
  await planLaden(p, null);
});

$('reload').addEventListener('click', async () => {
  if (!plan) { start(); return; }
  zeigeFehler('');
  const eintrag = plaene.find((p) => A.passtZuPlan({ studiengang: plan.studiengang.id, semester: plan.semester, fachsemester: plan.fachsemester }, p));
  if (!eintrag) { start(); return; }
  try {
    setzePlan(await holeJson('daten/' + eintrag.datei));
  } catch (err) {
    zeigeFehler(err.message);
    return;
  }
  if (vorschau) vorschau = { link: vorschau.link, ...A.geteilteAuswahl(bestand, vorschau.link.paare) };
  render();
});

$('reset').addEventListener('click', zuruecksetzen);

$('share').addEventListener('click', () => {
  const box = $('sharebox');
  if (!box.hidden) { box.hidden = true; return; }
  $('share-url').value = location.href.split('#')[0] + A.teilenFragment(plan, teilbareAuswahl());
  $('share-done').hidden = true;
  box.hidden = false;
  $('share-url').focus();
  $('share-url').select();
});

$('share-copy').addEventListener('click', async () => {
  const feld = $('share-url');
  let ok = false;
  try { await navigator.clipboard.writeText(feld.value); ok = true; } catch { /* ohne sicheren Kontext kein Clipboard-API */ }
  if (!ok) {
    feld.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
  }
  $('share-done').textContent = ok ? 'Kopiert.' : 'Kopieren ging nicht. Markiere den Link und kopiere ihn von Hand.';
  $('share-done').hidden = false;
});

// Eine zweite Registerkarte ändert die Auswahl: hier nachziehen, statt sie beim nächsten Klick
// zu überschreiben (im Vorbild verhinderte das eine Revision mit 409 auf dem Server).
window.addEventListener('storage', (e) => {
  if (!plan || (e.key !== null && e.key !== schluessel)) return;
  eigene = A.ladeAuswahl(speicher, schluessel);
  render();
});

// Ein Teilen-Link, in diese offene Seite eingefügt.
window.addEventListener('hashchange', () => { if (A.teilenLesen(location.hash)) start(); });

start();
