// Die Seite (docs/DESIGN.md; V-0220, Bedienung nach Silas' Test am Handy V-0225): liest das
// Lesemodell (web/daten/, ARCHITEKTUR §5) und hält die Auswahl im Browser (§6). Die reine Logik steht in den .mjs (getestet mit node --test); hier wird nur gezeichnet und
// verdrahtet. Kein Text aus der Datendatei wird HTML: alles durch esc(), Links nur über link().
// Die Content-Security-Policy verbietet Inline-Stil: Lage und Größe der Kacheln setzt diese Datei
// über element.style (CSSOM), Farben über Klassen (m0 … m7).

import { esc, link, stamp, plusTage, tagMonat, abschlussLang } from './text.mjs';
import * as A from './auswahl.mjs';
import * as W from './woche.mjs';
import * as R from './raster.mjs';
import * as P from './planwahl.mjs';
// Das Modul ist verlinkt und läuft: Der Starthinweis in index.html bleibt verborgen (V-0241, stil.css).
document.documentElement.dataset.gestartet = 'ja';

const $ = (id) => document.getElementById(id);
const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const KURZ = TAGE.map((t) => t.slice(0, 2));
const ic = (n, k = 'i') => `<svg class="${k}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;
const handy = matchMedia('(max-width: 767.98px)');
const fein = matchMedia('(hover: hover) and (pointer: fine)');
const grob = matchMedia('(pointer: coarse)');

// Schon der Zugriff auf localStorage kann werfen (Website-Daten gesperrt). Kein Probeschreiben:
// Laden allein schreibt nichts (auswahl.mjs, Regel 1). Ob Schreiben geht, zeigt die erste Wahl.
const speicher = (() => { try { return window.localStorage; } catch { return null; } })();

// Was die Seite zeigt (nur im Speicher der Seite, DESIGN §4.1). Filter: modul, teil, ueber
// (raster.mjs). modus: 'tag', 'woche' oder null (Vorgabe).
const z = { ...R.KEIN_FILTER, zeitraum: 'skeleton', ab: 0, tag: R.startTag(new Date()), modus: null, fokus: '' };
// Die zuletzt geöffneten Ansichten, für Pfeil links und rechts (V-0245, raster.mjs).
let verlauf = R.verlaufNeu();
// Der Pfeiltasten-Tipp (V-0246): einmal je Besuch, nichts wird gespeichert (raster.mjs, tippFaellig).
const tipp = { erste: 0, gezeigt: false, benutzt: false, uhr: 0, weg: 0 };
let plan = null, bestand = { groups: [], parts: [] }, schluessel = '', eigene = {}, gespeichert = true;
// Der Startbildschirm (V-0234): der Baum aus index.json, seine Stufen, alle Pläne flach, das Blatt
// des offenen Plans. altSchluessel: Die Auswahl kam noch aus dem Schlüssel vor V-0234; die erste
// aktive Änderung zieht sie um (auswahl.mjs, ladeAuswahlFuer).
let baum = null, stufen = [], blaetter = [], blatt = null, altSchluessel = null;
const hallo = { wahl: {}, sicht: null };
let vorschau = null;      // ein geöffneter Teilen-Link: { link, auswahl, unbekannt }
let fort = { n: 0, k: 0 }, selected = [], missing = [], paare = [], partner = new Map(), ax = { von: 8, bis: 18 }, tageZahl = 5, wochen = [], hatAB = false;
let wocheMq = null;       // passt die ganze Woche in dieses Fenster? (DESIGN §3.3)
let navi = [];            // Kacheln je sichtbarer Spalte, für die Pfeiltasten
let frisch = '';          // das Format, in dem gerade gewählt wurde: seine Kacheln bewegen sich einmal

// ── Laden

// Nur relative Pfade unterhalb von daten/: Eine Plandatei kommt nie von woanders her.
const SICHERER_PFAD = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.json$/;

async function holeJson(pfad) {
  const r = await fetch(pfad, { cache: 'no-cache' });
  if (!r.ok) throw Error(String(r.status));
  return r.json();
}

const sgVon = (p) => (typeof p.studiengang === 'object' && p.studiengang ? p.studiengang : { id: p.studiengang, name: p.name, abschluss: p.abschluss });
const sgName = (p) => { const sg = sgVon(p); return `${sg.name || sg.id}${sg.abschluss ? ', ' + abschlussLang(sg.abschluss) : ''}`; };
// Die zweite Zeile des Reiters: Vertiefung, Fachsemester (Silas: „nach Studienverlaufsplan“), Semester, Ordnung.
const planZeile = (p) => [p.vertiefung && p.vertiefung.name, `${p.fachsemester}. Fachsemester nach Studienverlaufsplan`, p.label || p.semester, p.ordnung && p.ordnung.label].filter(Boolean).join(', ');
const planName = (p) => `${sgName(p)}, ${planZeile(p)}`;
// Im Reiter am Handy ohne „nach Studienverlaufsplan“: Die Zeile bleibt eine Zeile (feste Höhe, kein Springen, CLS).
const planZeileHtml = (p) => esc(planZeile(p)).replace(' nach Studienverlaufsplan', '<span class="nur-breit"> nach Studienverlaufsplan</span>');

function rasterText(html) {
  $('koerper').innerHTML = `<div class="raster-text">${html}</div>`;
}

/**
 * Was beim Öffnen gezeigt wird (DESIGN §4.2, Schritt 1; V-0234): ein Teilen-Link öffnet seinen Plan,
 * sonst der zuletzt aktiv gewählte (stundenplanner:v1:plan), sonst der einzige Plan mit einer
 * gespeicherten Auswahl (so kommen alle, die vor dem Startbildschirm gewählt haben, direkt in ihren
 * Plan), sonst der Startbildschirm. Nur gelesen: Laden schreibt nichts.
 */
async function start() {
  let index;
  try {
    index = await holeJson('daten/index.json');
  } catch {
    zeigeHallo(false);
    rasterText('<p>Die Termine konnten nicht geladen werden.</p><button type="button" class="knopf" data-act="start">Erneut versuchen</button>');
    return;
  }
  baum = P.wahlBaum(index, (d) => SICHERER_PFAD.test(d));
  stufen = P.stufenVon(index, baum);
  blaetter = P.blaetter(baum);
  if (!blaetter.length) { zeigeHallo(false); rasterText('<p>Es ist noch kein Stundenplan veröffentlicht.</p>'); return; }
  const verweis = A.teilenLesen(location.hash);
  let ziel = P.planZumLink(blaetter, verweis);
  if (verweis && !ziel) melde(verweis.plan ? 'Der Link gehört zu einem Studienplan, den es hier nicht mehr gibt.' : 'Der Link nennt den Studienplan nicht eindeutig. Wähle ihn hier.');
  if (!ziel) ziel = blaetter.find((b) => b.id === A.ladePlanwahl(speicher)) || null;
  if (!ziel) {
    const mit = blaetter.filter((b) => Object.keys(A.ladeAuswahlFuer(speicher, b, eindeutig(b)).auswahl).length);
    if (mit.length === 1) ziel = mit[0];
  }
  if (!ziel) { halloOeffnen({}); return; }
  await planOeffnen(ziel, verweis && Object.keys(verweis.paare).length ? verweis : null);
}

/** Gehört der alte Schlüssel (<studiengang>:<semester>:fs<n>) genau einem Plan? Nur dann gilt er. */
const eindeutig = (p) => blaetter.filter((b) => A.alterSchluessel(b) === A.alterSchluessel(p)).length === 1;

async function planLaden(eintrag, verweis) {
  let p;
  try {
    p = await holeJson('daten/' + eintrag.datei);
  } catch {
    rasterText('<p>Die Termine konnten nicht geladen werden.</p><button type="button" class="knopf" data-act="start">Erneut versuchen</button>');
    return;
  }
  if (!P.gueltigeId(p.id)) p.id = eintrag.id;
  setzePlan(p);
  vorschau = verweis ? { link: verweis, ...A.geteilteAuswahl(bestand, verweis.paare) } : null;
  // Das Raster in einer eigenen Aufgabe: halbiert die längste Aufgabe beim Laden (TBT, DESIGN §6).
  render(false);
  await new Promise((weiter) => setTimeout(weiter));
  render();
  $('seite').classList.remove('laedt');
}

function setzePlan(p) {
  const vorher = schluessel;
  plan = p;
  plan.modules = Array.isArray(plan.modules) ? plan.modules : [];
  plan.studiengang = typeof plan.studiengang === 'object' && plan.studiengang ? plan.studiengang : { id: String(plan.studiengang) };
  bestand = A.bestand(plan);
  schluessel = A.speicherSchluessel(plan);
  ({ auswahl: eigene, alt: altSchluessel } = A.ladeAuswahlFuer(speicher, plan, eindeutig(plan)));
  ax = R.achse(bestand.groups);
  tageZahl = R.tagesZahl(bestand.groups);
  wochen = W.wochen(bestand.groups);
  hatAB = W.hatAB(plan, bestand.groups);
  if (vorher !== schluessel) { Object.assign(z, R.KEIN_FILTER, { zeitraum: 'skeleton', ab: 0, fokus: '' }); verlauf = R.verlaufNeu(); }
  if (!wochen.includes(z.zeitraum)) z.zeitraum = 'skeleton';
  if (z.tag >= tageZahl) z.tag = 0;
  if (wocheMq) wocheMq.removeEventListener('change', render);
  // Ab 1024 px steht die Modulspalte (240 px und 24 px Abstand) neben der Woche und nimmt ihr Breite.
  const w = R.wochenBreite(R.dichteste(bestand.groups), tageZahl);
  wocheMq = matchMedia(`(min-width: ${w}px) and (max-width: 1023.98px), (min-width: ${Math.max(1024, w + 264)}px)`);
  wocheMq.addEventListener('change', render);
}

// ── Auswahl ändern — nur auf Handlung des Nutzers, nur hier wird geschrieben

function aendere(neu) {
  eigene = neu;
  gespeichert = A.speichereUndZiehUm(speicher, schluessel, altSchluessel, eigene);
  if (gespeichert) altSchluessel = null;
  render();
}

const finde = (key) => bestand.groups.find((g) => g.key === key);
const titel = (g) => `${g.module_short}, ${R.typLang(g.type)}`;

// Einplanen und Lösen (V-0237): Ein Vorschlag (die einzige Gruppe eines Formats, bei `gruppen: alle`
// alle Gruppen) wird mit „Einplanen“ eingeplant; „Lösen“ nimmt die Wahl heraus, und die einzige
// Gruppe ist wieder ein Vorschlag. Bei `alle` plant eine Gruppe das Format als Ganzes ein (auswahl.mjs).
function waehle(key, loesen = false) {
  const g = finde(key);
  if (!g || vorschau) return;
  const vorher = fort.k;
  if (g.selected) {
    aendere(A.loese(eigene, g.component_id));
    sage(`${titel(g)}: Auswahl gelöst.`);
    return;
  }
  if (loesen) return;
  frisch = g.component_id;
  aendere(A.waehle(eigene, g.component_id, g));
  sage(`${titel(g)}: ${g.component.gruppen === 'alle' ? 'alle Gruppen' : g.name} eingeplant.`);
  if (fort.k === fort.n && vorher < fort.n) melde(`Alle ${fort.n} Formate eingeplant. ${paare.length ? 'Bitte die Überschneidungen prüfen.' : 'Keine Überschneidung.'}`);
}

/** Nur was es im Angebot gibt, geht in den Link — eine verschwundene Gruppe hilft niemandem. */
const teilbareAuswahl = () => Object.fromEntries(selected.map((g) => [g.component_id, { group: g.id }]));

/** Die Adresse ohne Teilen-Teil: nur der Plan (#plan=<id>). So bleibt er beim Neuladen, auch wenn
 *  der Browser nichts speichert, und ein Lesezeichen führt direkt dorthin. */
function adresseOhneAuswahl() {
  const frag = plan ? A.teilenFragment(plan, {}) : '';
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
    if (altSchluessel) A.loescheAuswahl(speicher, altSchluessel);
    altSchluessel = null;
    eigene = {};
    gespeichert = true;
    render();
    sage('Auswahl zurückgesetzt.');
  });
}

/**
 * „Stundenplan speichern“ (bis V-0243 „Teilen“; Silas' zweiter Test, V-0237): Von unten schiebt sich
 * eine Fläche über die Ansicht. Sie trägt den Link zum fertigen Stundenplan (die Auswahl hinter dem #, nie an
 * einen Server) mit drei Wegen: Kopieren, Lesezeichen, Teilen (das Teilen-Menü des Systems, am iPhone
 * mit allen Apps). Ein Lesezeichen kann keine Seite selbst setzen; solange die Fläche offen ist, steht
 * der Link deshalb in der Adresse, und die Fläche sagt, welche Taste oder welcher Tipp es anlegt.
 */
function teilen() {
  const weg = A.teilenWeg({ anzahl: selected.length, vorschau: !!vorschau, share: typeof navigator.share === 'function', grob: grob.matches });
  if (weg === 'vorschau') { melde('Erst den geteilten Plan übernehmen oder verwerfen.'); return; }
  if (weg === 'leer') { melde('Plane zuerst eine Gruppe ein. Dann speichert „Stundenplan speichern“ deinen Plan als Link.'); return; }
  const frag = A.teilenFragment(plan, teilbareAuswahl());
  const url = location.href.split('#')[0] + frag;
  history.replaceState(null, '', location.pathname + location.search + frag);
  const teilenKnopf = typeof navigator.share === 'function' ? `<button type="button" class="knopf" data-act="system-teilen">${ic('teilen')}Teilen</button>` : '';
  oeffne('blatt', 'Stundenplan speichern', `<p>Der Link enthält deinen Stundenplan (${esc(mehrzahl(selected.length, 'eingeplante Gruppe', 'eingeplante Gruppen'))}). Wer ihn öffnet, sieht genau diese Auswahl. Er liegt auf keinem Server.</p><input class="feld" id="teilen-link" readonly value="${esc(url)}" aria-label="Link zu deinem Stundenplan"><div class="e-aktionen"><button type="button" class="knopf haupt" data-act="kopieren" data-fokus>${ic('kopieren')}Kopieren</button><button type="button" class="knopf" data-act="lesezeichen">${ic('lesezeichen')}Lesezeichen</button>${teilenKnopf}</div><p class="klein" id="lz-text" hidden></p>`,
    { klasse: 'speichern', zurueck: () => $('teilen'), zu: adresseOhneAuswahl });
}

async function linkKopieren() {
  const f = $('teilen-link');
  if (!f) return;
  try {
    await navigator.clipboard.writeText(f.value);
    melde('Link kopiert');
  } catch {
    // Ohne sicheren Kontext gibt es kein Clipboard-API: den Link markieren, kopieren geht von Hand.
    f.focus();
    f.select();
    melde('Kopieren ging nicht. Der Link ist markiert: Kopiere ihn von Hand.');
  }
}

/** Wie man ein Lesezeichen setzt, je Gerät (eine Seite kann es nicht selbst). */
function lesezeichenText(ua = navigator.userAgent, beruehrung = navigator.maxTouchPoints || 0) {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && beruehrung > 1)) return 'Tippe in Safari unten auf Teilen und dann auf „Lesezeichen hinzufügen“. Der Link steht schon in der Adresse.';
  if (/Android/.test(ua)) return 'Öffne das Menü des Browsers und tippe auf den Stern. Der Link steht schon in der Adresse.';
  if (/Macintosh/.test(ua)) return 'Drücke Cmd + D, solange diese Fläche offen ist: Der Link steht schon in der Adresse.';
  return 'Drücke Strg + D, solange diese Fläche offen ist: Der Link steht schon in der Adresse.';
}

async function systemTeilen() {
  const f = $('teilen-link');
  if (!f || typeof navigator.share !== 'function') return;
  try { await navigator.share({ title: 'Stundenplan', url: f.value }); } catch (e) { if (e.name !== 'AbortError') linkKopieren(); }
}

// Kalender-Export (V-0231, bordkalender): ics.mjs lädt bei der ersten Bedienung, nicht beim Laden
// (das hielte Budget und Anfragen bis zum Raster nicht). Safari gibt die Nutzergeste nicht über ein
// langes await weiter: Ist das Modul beim Klick schon da, läuft der Export ohne Warten. Fehlt die
// Datei oder scheitert sie, sagt eine Meldung das; die Seite bricht nicht. Exportiert wird die
// wirksame Auswahl, also auch die automatisch eingeplanten Formate.
let ics = null;
const icsLaden = () => (ics ? Promise.resolve(ics) : import('./ics.mjs').then((m) => (ics = m), () => null));
for (const t of ['pointerdown', 'keydown']) document.addEventListener(t, icsLaden, { once: true, capture: true });

async function kalender() {
  if (!selected.length) { melde('Plane zuerst eine Gruppe ein (Vorschläge mit „Einplanen“). Dann übernimmt der Knopf deinen Plan in den Kalender.'); return; }
  const I = ics || await icsLaden();
  try {
    const datei = I.icsHerunterladen(plan, A.wirksameAuswahl(selected));
    if (!datei.termine) { melde(I.ICS_TEXTE.leer); return; }
    melde(I.ICS_TEXTE[I.icsAnstossen(datei)] || 'Die Kalenderdatei ist erstellt.');
  } catch {
    melde('Der Kalender-Export geht gerade nicht. Versuch es später noch einmal.');
  }
}

// ── Zeichnen

// innerHTML ersetzt das Element mit dem Fokus, der Fokus fiele auf <body> und die Tastatur finge von
// vorn an (V-0224). render() merkt sich das Bedienelement und gibt den Fokus dem neuen Gegenstück.
const MERKMALE = ['data-act', 'data-set', 'data-teil', 'data-k', 'data-v', 'data-d', 'data-tag', 'data-m', 'data-ebene'];

function fokusMerken() {
  const f = document.activeElement;
  if (!f || !$('seite').contains(f)) return null;
  if (f.closest('#koerper')) return 'kachel';
  // Kopf und Fuß stehen fest im HTML und werden nicht ersetzt: Dort bleibt der Fokus von selbst.
  return f.closest('#studiengang, #module, #werkzeug, #tage, #leiste, #unter') ? MERKMALE.map((a) => f.getAttribute(a)) : null;
}

function fokusZurueck(sig) {
  if (!sig || (document.activeElement && document.activeElement !== document.body)) return;
  if (sig === 'kachel') {
    const k = $('koerper').querySelector('.k-flaeche[tabindex="0"]');
    if (k) k.focus({ preventScroll: true });
    return;
  }
  const passt = [...$('seite').querySelectorAll('button, select')].find((x) => MERKMALE.every((a, i) => x.getAttribute(a) === sig[i]));
  // Gesperrt oder weg (› in der letzten Woche, „Filter aufheben“, Tageskopf): dahin, wo es weitergeht.
  const sichtbarer = (sel) => [...$('seite').querySelectorAll(sel)].find((x) => x.offsetParent !== null);
  const ersatz = sig[0] === 'zeit' ? sichtbarer('select[data-set="zeitraum"]') : sig[0] === 'aufheben' || sig[0] === 'info' ? sichtbarer('.modul-name') : sig[0] === 'tag' ? sichtbarer('#tage .tag[aria-pressed="true"]') : null;
  const ziel = passt && !passt.disabled && passt.offsetParent !== null ? passt : ersatz;
  if (ziel) ziel.focus({ preventScroll: true });
}

function render(mitRaster = true) {
  if (!plan) return;
  const sig = fokusMerken();
  try { zeichne(mitRaster); } finally { fokusZurueck(sig); }
}

function zeichne(mitRaster) {
  ({ selected, missing } = A.auswerten(plan, bestand, vorschau ? vorschau.auswahl : eigene));
  fort = A.fortschritt(bestand.parts);
  paare = W.conflictPairs(selected);
  partner = new Map();
  for (const p of paare) {
    partner.set(p.a.key, [...(partner.get(p.a.key) || []), p.b]);
    partner.set(p.b.key, [...(partner.get(p.b.key) || []), p.a]);
  }
  renderKopf();
  renderPlanHinweise();
  renderModule();
  renderWerkzeug();
  renderLeiste();
  if (mitRaster) renderRaster();
  renderUnter();
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
  for (const el of [$('stand'), $('stand-fuss')]) {
    el.innerHTML = s.html;
    el.classList.toggle('alt', s.alt);
    el.disabled = false;
  }
  // Der Reiter nennt den offenen Plan (Silas, 05.10.2026) und öffnet den Startbildschirm zum
  // Wechseln (V-0234); dort stehen alle Pläne aus index.json. Der Code nennt keinen Studiengang.
  $('studiengang').innerHTML = `<button type="button" class="sg-reiter" data-act="wechseln" aria-label="${esc(`Studium wechseln. Offen: ${planName(plan)}`)}"><span class="sg-name">${esc(sgName(plan))}${ic('unten', 'i sg-i')}</span><span class="sg-fs">${planZeileHtml(plan)}</span></button>`;
  $('kalender').disabled = false;
  const t = $('teilen');
  // Nie gesperrt: Ohne Wahl oder in der Vorschau sagt ein Klick, was fehlt (teilenWeg in auswahl.mjs).
  t.disabled = false;
  t.title = vorschau ? 'Erst den geteilten Plan übernehmen oder verwerfen' : selected.length ? 'Deinen Stundenplan als Link speichern' : 'Erst eine Gruppe wählen';
}

/**
 * Oben im Plan (V-0234): ein deutliches Schild, wenn die Termine Ersatz aus dem Vorjahr sind
 * (`ersatz_fuer`, V-0227/V-0233), und ein ruhiger, klarer Satz, wenn es keine Wahl ohne
 * Überschneidung gibt (`kombinationen.loesbar === false`; Silas, 05.10.2026: ausdrücklich sagen).
 * Der Grund ist lang (Zeiten, Tage); er steht in einer Karte, damit die Woche ihre Höhe behält.
 */
function renderPlanHinweise() {
  const el = $('plan-hinweise');
  const teile = [];
  if (plan.ersatz_fuer) {
    teile.push(`<p class="ph gelb">${ic('hinweis')}<span><b>Termine aus dem Vorjahr, Ersatz.</b> ${esc(`Sie stehen für das ${plan.ersatz_fuer}, bis die Hochschule dessen Termine veröffentlicht. Zeiten und Räume können sich noch ändern.`)}</span></p>`);
  }
  const o = P.ohneLoesung(plan.kombinationen);
  if (o) teile.push(`<p class="ph">${ic('warn', 'i ph-warn')}<span><b>${esc(o.satz)}</b> <button type="button" class="leise" data-act="ebene" data-ebene="loesung">Warum</button></span></p>`);
  el.innerHTML = teile.join('');
  el.hidden = !teile.length;
}

function inhaltLoesung() {
  const o = P.ohneLoesung(plan.kombinationen);
  if (!o) return '<p>Es gibt eine Wahl ohne Überschneidung.</p>';
  const out = [`<p>${esc(o.satz)}</p>`];
  if (o.grund) out.push(`<p>${esc(o.grund)}</p>`);
  if (!o.sicher && o.verdacht.length) out.push(`<p class="klein">${esc(`Vermutlich, weil die Quelle nicht eindeutig sagt, wie die Gruppen gemeint sind: ${o.verdacht.join('; ')}.`)}</p>`);
  if (o.fehlen.length) out.push(`<p class="klein">${esc(`Ohne die Module ${o.fehlen.join(', ')}: Für sie fehlen die Termine.`)}</p>`);
  out.push(`<p class="klein">${esc(`Gerechnet aus allen Einzelterminen in ${quelle().name}. Ändern sich die Termine, rechnet der Stundenplanner beim nächsten Abruf neu. Planen kannst du trotzdem: Die Seite zeigt jede Überschneidung an.`)}</p>`);
  return out.join('');
}

/** Wie die Gruppen eines Bestandteils zu belegen sind, wo es nicht „wähle eine“ heißt (V-0233). */
const GRUPPEN = {
  alle: 'Alle Gruppen gehören dazu: Du besuchst alle. „Einplanen“ plant das Format als Ganzes ein.',
  unklar: 'Unklar, ob du eine oder alle Gruppen besuchst. Prüfe es in der Quelle.',
  keine: 'Offenes Angebot, keine Wahl nötig. Es zählt nicht zum Fortschritt.',
};
const gruppenSatz = (c) => (GRUPPEN[c.gruppen] ? `${GRUPPEN[c.gruppen]}${c.gruppen_grund ? ' ' + c.gruppen_grund : ''}` : '');

/** Sättigung nach Kategorie (V-0237): Vorlesung voll, Übung 70 %, Sonstiges 50 % (stil.css). */
const katKlasse = (c) => ({ uebung: ' kat-uebung', sonstige: ' kat-sonstige' }[R.kategorie(c)] || '');

/** Ein Format: umrandet offen, gestrichelt ein Vorschlag, gefüllt mit Haken eingeplant, Tinte gefiltert. */
function format(c, m) {
  const g = c.groups.find((x) => x.selected);
  const vor = !g && c.groups.some((x) => x.vorschlag);
  const n = c.groups.filter((x) => x.slots.length).length;
  const fehlt = missing.some((x) => x.component_id === c.id);
  const kon = g && partner.has(g.key);
  const hin = (g && g.changed) || fehlt;
  const sym = kon ? ic('warn') : hin ? ic(g && g.changed ? 'neu' : 'hinweis') : g || fehlt ? ic('haken') : '';
  const alle = c.gruppen === 'alle';
  const was = g ? (alle ? 'alle Gruppen eingeplant' : `eingeplant: ${g.name}`) : fehlt ? 'gewählte Gruppe nicht mehr im Angebot' : vor ? `Vorschlag, ${alle ? 'alle Gruppen' : 'einzige Gruppe'}, noch nicht eingeplant` : c.gruppen === 'keine' ? 'offenes Angebot, keine Wahl nötig' : n ? `offen, ${mehrzahl(n, 'Gruppe', 'Gruppen')}` : 'noch ohne veröffentlichte Termine';
  const tipp = `${m.short}, ${R.typLang(c.type)}, ${c.sws} SWS, ${c.required ? 'Pflichtbereich' : c.section || ''}${n ? '' : '. Noch ohne veröffentlichte Termine'}${gruppenSatz(c) ? '. ' + gruppenSatz(c) : ''}`;
  return `<button type="button" data-sicht="chip" class="format${g || fehlt ? ' gewaehlt' : ''}${vor ? ' vorschlag' : ''}${!g && c.gruppen === 'keine' ? ' frei' : ''}${katKlasse(c)}${kon ? ' konflikt' : hin ? ' hinweis' : ''}" data-act="teil" data-teil="${esc(c.id)}" aria-pressed="${z.teil === c.id}" title="${esc(tipp)}" aria-label="${esc(`${R.typLang(c.type)}, ${mehrzahl(n, 'Gruppe', 'Gruppen')}, ${was}${kon ? ', Überschneidung' : ''}${g && g.changed ? ', geändert' : ''}`)}"${n || g || fehlt ? '' : ' disabled'}><span class="f-pille">${sym}${esc(c.type)} ${n}</span></button>`;
}

function renderModule() {
  $('module').innerHTML = plan.modules.map((m, i) => {
    const warn = m.error || A.veraltet(m.success_at) ? ic('hinweis', 'i warn-i') : '';
    const an = z.modul === m.number;
    return `<div class="modul m${(i % 8) + 1}${an ? ' aktiv' : ''}" role="group" aria-label="${esc(m.title || m.short)}"><button type="button" class="modul-name" data-sicht="modul" data-act="modul" data-m="${i}" aria-pressed="${an}" title="${esc(m.title || m.short)}" aria-label="${esc(`${m.title || m.short}: alle Formate zeigen${warn ? ', mit Hinweis' : ''}`)}"><span class="punkt"></span><span class="m-kurz">${esc(m.short)}</span>${warn}</button><div class="formate">${m.components.map((c) => format(c, m)).join('')}</div></div>`;
  }).join('');
}

/** Tag oder Woche. Vorgabe: am Handy der Tag, sonst die Woche, wenn sie passt (§3.3). */
// Am Handy ist die Woche die Vorgabe (Silas, 05.10.2026, V-0247; vorher der Tag), am Tablet und Rechner
// die Woche, wenn sie passt (DESIGN §3.3).
const modus = () => z.modus || (handy.matches || (wocheMq && wocheMq.matches) ? 'woche' : 'tag');
const tagAnsicht = () => (modus() === 'tag' ? { woche: false, tag: z.tag } : { woche: true, tag: null });

/** Zeitraum und A/B: am Rechner in der Werkzeugzeile, am Handy unter dem Raster. */
function steuerung() {
  const seg = (name, wert, text, an) => `<button type="button" class="seg" data-act="setze" data-k="${name}" data-v="${wert}" aria-pressed="${an}">${text}</button>`;
  const i = wochen.indexOf(z.zeitraum);
  let html = `<div class="w-gruppe"><button type="button" class="knopf rund" data-act="zeit" data-d="-1" aria-label="Vorige Woche"${i < 0 ? ' disabled' : ''}>${ic('links')}</button><span class="wahl"><select data-set="zeitraum" aria-label="Zeitraum"><option value="skeleton">Alle Wochen</option>${wochen.map((w) => `<option value="${w}"${w === z.zeitraum ? ' selected' : ''}>Woche ab ${tagMonat(w)}</option>`).join('')}</select>${ic('unten')}</span><button type="button" class="knopf rund" data-act="zeit" data-d="1" aria-label="Nächste Woche"${i === wochen.length - 1 || !wochen.length ? ' disabled' : ''}>${ic('rechts')}</button></div>`;
  if (hatAB && z.zeitraum === 'skeleton') html += `<div class="w-gruppe"><div class="segmente" role="group" aria-label="A- oder B-Woche">${seg('ab', 0, 'Woche A', z.ab === 0)}${seg('ab', 1, 'Woche B', z.ab === 1)}</div></div>`;
  return html;
}

/** Die Lage: was gezeigt wird, wie man zurückkommt, was gewählt ist (V-0225). */
function renderWerkzeug() {
  const { n, k } = fort, h = hinweise();
  const mi = plan.modules.findIndex((x) => x.number === z.modul);
  const m = plan.modules[mi];
  const c = z.teil ? bestand.parts.find((x) => x.id === z.teil) : null;
  const gruppen = (cs) => cs.reduce((s, x) => s + x.groups.filter((g) => g.slots.length).length, 0);
  let titel, unter;
  if (m) {
    // Am Handy erklärt der volle Titel den Kurznamen, am Rechner steht der Kurzname direkt darüber.
    titel = `<span class="nur-breit">${esc(m.short)}</span><span class="nur-handy">${esc(m.title || m.short)}</span>${c ? ', ' + esc(R.typLang(c.type)) : ''}`;
    const gew = c ? c.groups.find((g) => g.selected) : null;
    unter = c ? `${mehrzahl(gruppen([c]), 'Gruppe', 'Gruppen')}, ${gew ? 'eingeplant: ' + esc(c.gruppen === 'alle' ? 'alle' : gew.name) : 'noch keine eingeplant'}`
      : `Alle Formate, ${mehrzahl(gruppen(m.components), 'Gruppe', 'Gruppen')}, ${m.components.filter((x) => x.groups.some((g) => g.selected)).length} von ${m.components.length} eingeplant`;
  } else if (vorschau) {
    titel = 'Geteilter Plan';
    unter = `${k} von ${n} Formaten im geteilten Plan`;
  } else if (n && k === n) {
    titel = `Alle ${n} Formate eingeplant`;
    unter = paare.length ? 'Bitte die Überschneidungen prüfen.' : 'Keine Überschneidung.';
  } else {
    // Die Vorgabe beim Öffnen ist immer „Mein Stundenplan“ (Silas' zweiter Test, V-0237).
    titel = 'Mein Stundenplan';
    // Ohne Wahl derselbe Satz wie im HTML: Er steht vor den Daten (größter Inhalt früh, LCP §6).
    unter = k ? `${k} von ${n} Formaten eingeplant` : 'Wähle ein Modul oder ein Format, dann zeigt der Plan dessen Gruppen.';
  }
  const knoepfe = m ? `<button type="button" class="knopf" data-act="info" data-m="${mi}">${ic('info')}Modul-Infos</button><button type="button" class="knopf" data-act="aufheben">${ic('kreuz')}Filter aufheben</button>` : '';
  const rechts = knoepfe + marken(h);
  $('lage').innerHTML = `<p class="l-text"><span class="l-titel">${titel}</span> <span class="l-unter">${unter}</span></p>${rechts ? `<span class="l-knoepfe">${rechts}</span>` : ''}`;
  $(handy.matches ? 'steuer' : 'steuer-handy').innerHTML = '';
  $(handy.matches ? 'steuer-handy' : 'steuer').innerHTML = steuerung();
  const t = tagAnsicht();
  for (const b of $('umschalter').querySelectorAll('.seg')) b.setAttribute('aria-pressed', String(b.dataset.v === (t.woche ? 'woche' : 'tag')));
}

function marken(h) {
  let html = '';
  if (paare.length) html += `<button type="button" class="marke rot" data-act="ebene" data-ebene="hinweise">${ic('warn')}${mehrzahl(paare.length, 'Überschneidung', 'Überschneidungen')}</button>`;
  if (h.zahl) html += `<button type="button" class="marke gelb" data-act="ebene" data-ebene="hinweise">${ic('hinweis')}${mehrzahl(h.zahl, 'Hinweis', 'Hinweise')}</button>`;
  else if (!paare.length && (h.ohne.length || h.regeln.length || fort.k === fort.n)) html += `<button type="button" class="marke" data-act="ebene" data-ebene="hinweise">${ic('info')}Hinweise</button>`;
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
  let text = `<b>Geteilter Plan</b>, ${fort.k} von ${fort.n} gewählt.`;
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
  const spalten = t.woche ? [...Array(tageZahl).keys()] : [t.tag];
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
  // Die Woche am Handy ist eine Übersicht (Silas: „die ganze Woche klein“): Ein Tipp auf eine
  // Kachel zeigt ihren Tag groß, statt eine Karte an einer 12 px schmalen Kachel zu öffnen.
  const mini = t.woche && handy.matches;
  r.classList.toggle('ein-tag', !t.woche);
  r.classList.toggle('mini', mini);
  r.classList.toggle('teil', !!z.teil);
  r.classList.toggle('aktionen', fein.matches && !handy.matches && !vorschau);
  r.style.setProperty('--tage', tageZahl);
  r.style.setProperty('--stunden', ax.bis - ax.von);
  k.style.setProperty('--spalten', spalten.length);
  r.setAttribute('aria-label', t.woche ? 'Woche' : TAGE[t.tag]);

  $('tage').innerHTML = [...Array(tageZahl).keys()].map((d) => {
    const unter = !t.woche && z.teil ? `<span class="zaehl">${zaehl.get(d) || 0}</span>` : week ? `<span class="datum">${tagMonat(plusTage(week.start, d))}</span>` : '';
    const name = t.woche ? `${TAGE[d]}, als Tag zeigen` : TAGE[d] + (z.teil ? `, ${mehrzahl(zaehl.get(d) || 0, 'Gruppe', 'Gruppen')}` : '');
    return `<button type="button" class="tag" data-sicht="tag" data-act="tag" data-tag="${d}" aria-pressed="${t.tag === d}" aria-label="${esc(name)}"><span class="kurz">${KURZ[d]}</span><span class="lang">${TAGE[d]}</span>${unter}</button>`;
  }).join('');

  const n = ax.bis - ax.von, von = ax.von * 60, dauer = n * 60;
  const liste = [];
  let html = '<div class="stunden">';
  for (let i = 0; i <= n; i++) html += `<div class="stunde" data-sicht="stunde"><span>${String(ax.von + i).padStart(2, '0')}</span></div>`;
  html += '</div>';
  for (const d of spalten) {
    const tag = R.spuren(jeTag.get(d).sort(R.ordnung));
    tag.sort((a, b) => a.start - b.start || a.spur - b.spur);
    html += `<div class="spalte" role="group" aria-label="${TAGE[d]}${week ? ' ' + tagMonat(plusTage(week.start, d)) : ''}"><div class="innen">${tag.map((e) => kachel(e, mini)).join('')}</div></div>`;
    liste.push(...tag);
  }
  if (!liste.length) {
    const nichts = !z.teil && !z.modul && !selected.length && !bestand.groups.some((g) => g.vorschlag);
    const leer = nichts ? 'Noch nichts eingeplant. Wähle ein Modul oder ein Format.' : !t.woche ? 'An diesem Tag liegt nichts.' : 'Keine Termine für diese Auswahl.';
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
  frisch = '';
  // Das Raster ist ein Tabulatorhalt; die Pfeiltasten wandern darin (§4.4).
  navi = [...k.querySelectorAll('.innen')].map((c) => [...c.querySelectorAll('.k-flaeche')]);
  const alle = navi.flat();
  const ziel = alle.find((b) => b.dataset.fokus === z.fokus) || alle[0];
  if (ziel) ziel.tabIndex = 0;
}

// Eine Kachel (Silas, V-0225): oben das Modul, darunter die Einheit ausgeschrieben, dann Gruppe mit
// Zeit, dann Raum; nie „Termingruppe 3“ als Titel. Die übrigen Gruppen eines schon gewählten Formats
// sind blass (zurück), ein Vorschlag ist gestrichelt (V-0237). Mit Filter steht „Mein Stundenplan“
// außerhalb als kontext: dieselbe Kachel, nur ganz zurückgenommen (stil.css).
function kachel(e, mini) {
  const { g, s, art } = e;
  // Am Handy plant ein Tipp ein, ein zweiter löst (Silas, V-0247); lange drücken öffnet die Karte.
  // Nicht in der Vorschau eines geteilten Plans und nicht auf dem durchscheinenden eigenen Plan beim Filtern.
  const tippen = handy.matches && !vorschau && art !== 'kontext';
  const week = W.wocheAus(z.zeitraum);
  const look = art === 'kontext' ? (g.selected ? 'gewaehlt' : g.vorschlag ? 'vorschlag' : 'moeglich') : art;
  const mit = look === 'gewaehlt' ? partner.get(g.key) || [] : selected.filter((x) => x.component_id !== g.component_id && W.overlap(g, x));
  const kon = look === 'gewaehlt' && mit.length;
  const neu = look === 'gewaehlt' && g.changed && !vorschau;
  const zurueck = art === 'moeglich' && !!g.component.selection;
  const sym = mit.length ? 'warn' : neu ? 'neu' : look === 'gewaehlt' ? 'haken' : '';
  const nr = R.gruppenNummer(g.name);
  const raum = raeume(g, s, week).join(', ');
  const rh = R.rhythmusHinweis(s);
  const alle = g.component.gruppen === 'alle';
  const gruppe = look === 'vorschlag' && !alle ? 'Einzige Gruppe' : nr ? 'Gruppe ' + nr : g.name;
  const zustand = art === 'kontext' ? (vorschau ? 'deine Auswahl' : `${look === 'vorschlag' ? 'Vorschlag' : 'eingeplant'}, außerhalb des Filters`)
    : look === 'moeglich' ? (zurueck ? 'nicht gewählt, das Format ist schon gewählt' : 'nicht eingeplant')
      : look === 'vorschlag' ? `Vorschlag, ${alle ? 'alle Gruppen dieses Formats' : 'einzige Gruppe'}, noch nicht eingeplant` : 'eingeplant';
  const name = `${titel(g)}, ${g.name}, ${TAGE[s.day]} ${s.start} bis ${s.end}${raum ? ', Raum ' + raum : ''}${rh ? ', ' + rh : ''}, ${zustand}${neu ? ', geändert seit deiner Wahl' : ''}${mit.length ? ', überschneidet sich mit ' + mit.map((x) => `${x.module_short} ${R.typLang(x.type)}`).join(' und ') : ''}${tippen ? (g.selected ? '. Tippen löst die Auswahl, lange drücken zeigt die Details' : '. Tippen plant ein, lange drücken zeigt die Details') : mini ? '. Zeigt den Tag groß' : ''}`;
  // Der Knopf auf der Kachel (Silas' zweiter Test, V-0237): ein abgerundetes Plus zum Einplanen
  // (auch zum Wechseln), ein Kreuz zum Lösen. Er passt auch auf schmale Kacheln (stil.css).
  const akt = g.selected ? ['kreuz', 'Auswahl lösen'] : zurueck ? ['plus', 'Wechseln zu'] : ['plus', 'Einplanen'];
  const knopf = vorschau || mini || art === 'kontext' ? '' : `<button type="button" class="k-akt ${akt[0]}" tabindex="-1" data-act="waehlen" data-key="${esc(g.key)}" aria-label="${esc(`${akt[1]}: ${titel(g)}, ${g.name}`)}">${ic(akt[0])}</button>`;
  const klasse = `m${g.farbe + 1} ${look}${art === 'kontext' ? ' kontext' : ''}${katKlasse(g.component)}${zurueck ? ' zurueck' : ''}${frisch === g.component_id ? ' frisch' : ''}${kon ? ' konflikt' : ''}${sym ? ' mit-sym' : ''}${knopf ? ' mit-akt' : ''}`;
  return `<div data-sicht="kachel" data-tag="${s.day}" data-start="${esc(s.start)}" data-ende="${esc(s.end)}" class="kachel ${klasse}" data-key="${esc(g.key)}"><button type="button" class="k-flaeche" tabindex="-1" data-act="${tippen ? 'umschalten' : mini ? 'tag' : 'kachel'}" data-key="${esc(g.key)}" data-tag="${s.day}" data-fokus="${esc(g.key + '@' + s.day + s.start)}" aria-label="${esc(name)}"><span class="k-mod">${esc(g.module_short)}</span><span class="k-titel">${esc(g.component.module.title || g.module_short)}</span><span class="k-typ">${esc(g.type)}</span><span class="k-kurz">${esc(nr ? g.type + ' ' + nr : g.type)}</span><span class="k-nr">${esc(nr || '')}</span><span class="k-lang k-2">${esc(R.typLang(g.type))}</span><span class="k-info k-2">${esc(`${gruppe}, ${s.start}–${s.end}`)}</span><span class="k-ort k-2">${esc(rh || raum)}</span>${sym ? ic(sym, 'i k-sym') : ''}</button>${knopf}</div>`;
}

/** Die Legende (Silas, 05.10.2026): am Rechner klein links unter den Modulen (V-0243), sonst unter dem
 *  Raster. Das Muster zeigt, wie es aussieht; das Wort sagt nur noch, was es heißt. Ab sechs Modulen
 *  steht sie auch am Rechner unter dem Raster, und die Modulkacheln rücken zusammen (stil.css). */
function renderUnter() {
  $('seite').classList.toggle('viele-module', plan.modules.length > 5);
  const module = plan.modules.map((m, i) => `<span class="m${(i % 8) + 1}"><span class="punkt"></span>${esc(m.short)}</span>`).join('');
  const formate = R.legende(bestand.parts).map((x) => `<span><b>${esc(x.kurz)}</b>${esc(x.lang)}</span>`).join('');
  // Immer dieselben Einträge: Die Legende ändert ihre Höhe nicht, das Raster springt nicht.
  // Die Wörter nennen die Rolle, keinen Farbton: „dunkelgrau“/„hellgrau“ stimmten nur hell (V-0236).
  const k = (art, text) => `<span><span class="lg-k ${art}"></span>${text}</span>`;
  const zustand = k('', 'wählbar') + k('gewaehlt', 'eingeplant') + k('vorschlag', 'Vorschlag') +
    k('kontext', vorschau ? 'deine Auswahl' : 'dein Plan') + k('zurueck', 'Format gewählt') + k('gewaehlt konflikt', 'Überschneidung');
  $('legende').innerHTML = `<p class="lg-zeile lg-module nur-handy">${module}</p><p class="lg-zeile lg-formate">${formate}</p><p class="lg-zeile lg-zustand">${zustand}</p>`;
}

/** Hochschule und Quelle der Termine aus der Plandatei (Punkt 8541d9f5: nicht „TU“ und „MOSES“ fest). */
function quelle() {
  const hs = (plan && plan.hochschule) || {};
  const url = hs.quelle && typeof hs.quelle.url === 'string' && /^https:\/\/[^\s"<>]+$/.test(hs.quelle.url) ? hs.quelle.url : null;
  return { kurz: hs.kurz || hs.name || 'Hochschule', name: (hs.quelle && hs.quelle.name) || 'ihr Vorlesungsverzeichnis', url };
}

function renderFuss() {
  const q = quelle();
  // Die Quelle als Link (Silas' dritter Blick, V-0243): Wer nachsehen will, ist mit einem Tipp dort.
  const name = q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.name)}</a>` : esc(q.name);
  $('inoffiziell').innerHTML = `Kein offizielles Angebot der ${esc(q.kurz)}. Verbindlich sind ${name} und die Anmeldungen dort.`;
  const s = $('speicher');
  const ohne = !speicher || !gespeichert;
  s.textContent = ohne ? 'Dein Browser speichert die Auswahl nicht. Sichere sie mit „Stundenplan speichern“.' : 'Deine Auswahl wird nur in diesem Browser gespeichert.';
  s.classList.toggle('alt', ohne);
  $('zuruecksetzen').hidden = !!vorschau || !Object.keys(eigene).length;
}

// ── Hinweise, Karten und Blätter

function hinweise() {
  const geaendert = vorschau ? [] : selected.filter((g) => g.changed);
  const fehler = plan.modules.filter((m) => m.error);
  const alt = plan.modules.filter((m) => !m.error && A.veraltet(m.success_at));
  const standAlt = A.veraltet(plan.last_run && plan.last_run.finished_at);
  const fehlt = vorschau ? [] : missing;
  return { geaendert, fehlt, fehler, alt, standAlt, ohne: W.ohneTermine(bestand.parts), regeln: bestand.parts.filter((x) => GRUPPEN[x.gruppen]), zahl: geaendert.length + fehlt.length + fehler.length + alt.length + (standAlt ? 1 : 0) };
}

function inhaltHinweise() {
  const h = hinweise(), n = fort.n;
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
  for (const c of h.regeln) out.push(`<p class="zeile">${ic('info')}<span><b>${esc(`${c.module.short} ${R.typLang(c.type)}:`)}</b> ${esc(gruppenSatz(c))}</span></p>`);
  if (n && fort.k === n && !vorschau) out.push(`<p class="zeile">${ic('haken')}<span>Alle ${n} Formate eingeplant. ${paare.length ? 'Die Überschneidungen oben sind noch zu prüfen.' : 'Keine Überschneidung.'} Anmeldung und Kursvorgaben bitte in MOSES und ISIS prüfen.</span></p>`);
  return out.join('') || '<p>Keine Hinweise.</p>';
}

function inhaltStand() {
  const run = plan.last_run;
  const lauf = !run ? 'noch kein Abruf' : run.status === 'ok' ? 'vollständig' : run.status === 'partial' ? 'mit Fehlern bei einzelnen Modulen' : 'fehlgeschlagen';
  return `<p>${esc(planName(plan))}</p><p>Quelle: ${esc(quelle().name)} der ${esc(quelle().kurz)}, öffentliche Seiten. Abgerufen ${run ? stamp(run.finished_at) : 'noch nie'}, ${lauf}.</p><p class="klein">${mehrzahl(plan.modules.length, 'Modul', 'Module')}, ${mehrzahl(bestand.parts.length, 'Format', 'Formate')}, ${mehrzahl(plan.group_count ?? bestand.groups.length, 'Termingruppe', 'Termingruppen')}, ${esc(plan.booking_count ?? '')} Einzeltermine.</p><div class="e-aktionen"><button type="button" class="knopf" data-act="neu-laden">Neu laden</button></div>`;
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
  const alle = g.component.gruppen === 'alle';
  if (gruppenSatz(g.component)) teile.push(`<p class="klein">${esc(gruppenSatz(g.component))}</p>`);
  else if (g.vorschlag) teile.push('<p class="klein">Vorschlag: die einzige Gruppe dieses Formats, gestrichelt. Sie ist noch nicht eingeplant; „Einplanen“ übernimmt sie in deinen Plan.</p>');
  const verb = g.selected ? 'Auswahl lösen' : alle ? 'Alle einplanen' : g.component.selection ? 'Gruppe wechseln' : 'Einplanen';
  teile.push(`<div class="e-aktionen">${vorschau ? '<button type="button" class="knopf" disabled>Erst den Plan übernehmen</button>' : `<button type="button" class="knopf haupt" data-act="waehlen" data-key="${esc(g.key)}" data-fokus>${verb}</button>`}${link(g.url, 'In MOSES ansehen')}</div>`);
  const termine = g.slots.flatMap((x) => W.termineDerKarte(g, x, week, par, plan.anchor)).sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  teile.push(`<details><summary>${mehrzahl(termine.length, 'Termin', 'Termine')}</summary><ul class="termine">${termine.map((b) => `<li>${KURZ[(new Date(b.date + 'T12:00:00Z').getUTCDay() + 6) % 7]} ${tagMonat(b.date)}, ${esc(b.start)}–${esc(b.end)}, ${esc(b.room)}${b.note ? `<br>${esc(b.note)}` : ''}${b.info ? `<br>${esc(b.info)}` : ''}</li>`).join('')}</ul></details>`);
  teile.push(`<p><button type="button" class="leise" data-act="modul" data-m="${plan.modules.indexOf(g.component.module)}">Zum Modul</button></p>`);
  return teile.join('');
}

const EBENEN = {
  hinweise: () => ['karte', 'Hinweise', inhaltHinweise],
  stand: () => ['karte', 'Datenstand', inhaltStand],
  hilfe: () => ['dialog', 'So funktioniert die Planung', () => $('hilfe-text').innerHTML, 'lesen'],
  loesung: () => ['karte', P.ohneLoesung(plan.kombinationen) && !P.ohneLoesung(plan.kombinationen).sicher ? 'Vermutlich keine Wahl ohne Überschneidung' : 'Keine Wahl ohne Überschneidung', inhaltLoesung],
};

// Eine Ebene zur Zeit (§3.5). Ab 768 px Karte an ihrem Anker oder Dialog, darunter ein Blatt von unten.
let offen = null, ebeneNr = 0;

function oeffne(art, kopf, inhalt, { anker = null, wo = 'unten', klasse = '', zurueck = null, neu = null, zu = null } = {}) {
  schliesse(true);
  const nr = ++ebeneNr;
  // Eine Karte ohne Anker (etwa „Zum Modul“ aus einer anderen Karte) wird ein Dialog in der Mitte.
  const typ = handy.matches ? 'blatt' : art === 'karte' && !anker ? 'dialog' : art;
  $('ebenen').innerHTML = `<div class="hinter${typ === 'karte' ? ' leer' : ''}"${typ === 'karte' ? ' hidden' : ''}></div><section class="ebene ${typ} ${klasse}" role="dialog" aria-modal="${typ !== 'karte'}" aria-labelledby="e-titel"><div class="e-kopf"><h2 class="e-titel" id="e-titel">${esc(kopf)}</h2><button type="button" class="e-zu" data-act="zu" aria-label="Schließen">${ic('kreuz')}</button></div><div class="e-inhalt${klasse.includes('lesen') ? ' lesen' : ''}">${inhalt}</div></section>`;
  const el = $('ebenen').querySelector('.ebene');
  offen = { el, typ, anker, wo, zurueck: zurueck || (anker ? () => anker : null), neu, nr, zu };
  if (typ === 'karte' && anker) platziere();
  requestAnimationFrame(() => { if (offen && offen.nr === nr) { el.classList.add('da'); $('ebenen').firstChild.classList.add('da'); } });
  (el.querySelector('[data-fokus]') || el.querySelector('.e-zu')).focus({ preventScroll: true });
}

function schliesse(sofort = false) {
  if (!offen) return;
  const { el, zurueck, zu } = offen;
  offen = null;
  if (zu) zu();
  const nr = ebeneNr;
  el.classList.remove('da');
  const h = $('ebenen').querySelector('.hinter');
  if (h) h.classList.remove('da');
  if (sofort) $('ebenen').innerHTML = '';
  else setTimeout(() => { if (ebeneNr === nr && !offen) $('ebenen').innerHTML = ''; }, 200);
  if (!sofort) {
    // Zurück zum Auslöser, ist er weg oder versteckt, an den Tabulatorhalt des Rasters (V-0224).
    const a = zurueck && zurueck();
    const ziel = a && a.isConnected && a.offsetParent !== null ? a : $('koerper').querySelector('.k-flaeche[tabindex="0"]');
    if (ziel) ziel.focus({ preventScroll: true });
  }
}

/** Karte neben ihrem Anker: bei einer Kachel rechts, sonst links, nie über ihr; im Fenster gehalten. */
function platziere() {
  const { el, wo } = offen;
  // Der Anker, solange es ihn gibt; nach neuem Zeichnen findet zurueck() die neue Kachel.
  const a = offen.anker && offen.anker.isConnected ? offen.anker : offen.zurueck && offen.zurueck();
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
  const merkmale = ['data-set', 'data-act', 'data-key', 'data-d', 'data-v'];
  const sig = f && offen.el.contains(f) ? merkmale.map((a) => f.getAttribute(a)) : null;
  offen.el.querySelector('.e-inhalt').innerHTML = offen.neu();
  if (sig) {
    const ziel = [...offen.el.querySelectorAll('button, select, input')].find((x) => merkmale.every((a, i) => x.getAttribute(a) === sig[i]));
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
  // Tag UND Beginn: Eine Gruppe kann an einem Tag zwei Termine haben, und Raum und Termine der
  // Karte gehören zu dem, der angeklickt wurde.
  const k = b.closest('.kachel');
  const s = g.slots.find((x) => String(x.day) === b.dataset.tag && (!k || x.start === k.dataset.start)) || g.slots.find((x) => String(x.day) === b.dataset.tag) || g.slots[0];
  const fokus = b.dataset.fokus;
  z.fokus = fokus;
  const zurueck = () => $('koerper').querySelector(`.k-flaeche[data-fokus="${CSS.escape(fokus)}"]`);
  oeffne('karte', titel(g), inhaltGruppe(g, s), { anker: b, wo: 'seite', klasse: 'karte-g', zurueck, neu: () => inhaltGruppe(finde(g.key) || g, s) });
}

function karteModul(i, anker) {
  const m = plan.modules[i];
  const name = $('module').querySelector(`.modul-name[data-m="${i}"]`);
  const sichtbar = name && name.offsetParent !== null ? name : null;
  if (m) oeffne('karte', m.title || m.short, inhaltModul(m), { anker: sichtbar, zurueck: offen ? offen.zurueck : () => anker });
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

$('meldung').addEventListener('click', () => { clearTimeout(meldungUhr); $('meldung').classList.remove('da'); });

function sage(text) {
  const el = $('ansage');
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
}

// ── Der Startbildschirm (Hello-Screen, V-0234; DESIGN §3.6, §4.5)
// Je Stufe eine Frage mit großen Optionen, unten die Leiste mit allen Stufen: erledigt, automatisch,
// entfällt, offen. Die Logik steht in planwahl.mjs; hier wird nur gezeichnet.

function zeigeHallo(an) {
  $('hallo').hidden = !an;
  $('seite').hidden = an;
  document.documentElement.classList.toggle('im-hallo', an);
  scrollTo(0, 0);
}

function halloOeffnen(wahl, sicht = null) {
  if (!baum) return;
  schliesse(true);
  hallo.wahl = wahl || {};
  hallo.sicht = sicht || P.naechsteSicht(P.wahlStand(baum, stufen, hallo.wahl));
  zeigeHallo(true);
  renderHallo(true);
}

function halloWaehlen(stufe, i) {
  const st = P.wahlStand(baum, stufen, hallo.wahl);
  const sch = st.schritte.find((x) => x.id === stufe);
  const o = sch && sch.knoten && sch.knoten.optionen[i];
  if (!o) return;
  hallo.wahl = P.waehleOption(stufen, hallo.wahl, stufe, o.id);
  const neu = P.wahlStand(baum, stufen, hallo.wahl);
  hallo.sicht = P.naechsteSicht(neu);
  renderHallo(true);
  const weiter = neu.schritte.find((x) => x.id === hallo.sicht);
  sage(`${sch.label}: ${o.label}. ${weiter ? `Weiter mit ${weiter.label}.` : 'Alles gewählt.'}`);
}

/** Esc: eine Stufe zurück; auf der ersten zurück zum offenen Plan, wenn es einen gibt. */
function halloEsc() {
  const v = P.vorige(P.wahlStand(baum, stufen, hallo.wahl), hallo.sicht);
  if (v) { hallo.sicht = v; renderHallo(true); } else if (plan) AKTIONEN['hallo-zu']();
}

function renderHallo(fokus = false) {
  const st = P.wahlStand(baum, stufen, hallo.wahl);
  const sch = st.schritte.find((x) => x.id === hallo.sicht);
  if (hallo.sicht === 'fertig' ? !st.plan : !(sch && sch.knoten)) hallo.sicht = P.naechsteSicht(st);
  $('h-inhalt').innerHTML = halloAbschnitte(st);
  $('h-leiste').innerHTML = halloLeiste(st);
  $('h-zum-plan').hidden = !plan;
  // Die Farbe einer Hochschule (katalog, V-0243) kommt über das CSSOM: Die CSP verbietet style-Attribute.
  for (const b of $('h-inhalt').querySelectorAll('[data-farbe]')) b.style.setProperty('--h-farbe', b.dataset.farbe);
  if (fokus) {
    const ziel = (hallo.sicht === 'fertig' && $('h-inhalt').querySelector('[data-act="h-oeffnen"]')) || $('h-titel');
    if (ziel) ziel.focus({ preventScroll: true });
  }
}

/** Was eine gewählte Option sagt: „1. Fachsemester, WiSe 2026/27“. Beim Fachsemester (die Option trägt
 *  `semester`) gehört das Semester dazu: Erst beides ist der Plan. */
const optionText = (o) => (o.semester != null && o.zusatz ? `${o.label}, ${o.zusatz}` : o.label);

/**
 * Der Startbildschirm (Silas' dritter Blick, V-0243): eine ruhige Spalte. Je Stufe, an der jemand
 * wählt, ein Abschnitt; gewählte Stufen stehen als eine Karte mit Haken (ein Tipp öffnet sie wieder),
 * die Stufe, an der man gerade ist, zeigt alle Optionen, spätere noch nichts. Stufen, die entfallen
 * oder nur eine gültige Option haben (Vertiefung, Ordnung), erscheinen nicht: Silas wollte nur
 * Hochschule, Studiengang und Fachsemester sehen. Ist alles gewählt, kommt „Stundenplan öffnen“.
 */
function halloAbschnitte(st) {
  let html = '';
  for (const x of st.schritte) {
    if (!x.knoten || (x.art !== 'gewaehlt' && x.art !== 'offen')) continue;
    const hier = x.id === hallo.sicht;
    html += hier ? halloOptionen(x) : halloGewaehlt(x);
    if (hier) break;
  }
  if (hallo.sicht === 'fertig' && st.plan) html += '<div class="h-aktionen"><button type="button" class="knopf haupt" data-act="h-oeffnen">Stundenplan öffnen</button></div>';
  return html;
}

const farbeVon = (o) => (o.farbe ? ` data-farbe="${esc(o.farbe)}"` : '');

/** Eine Stufe mit allen Optionen. Die gewählte (beim Ändern) trägt den Haken. */
function halloOptionen(x) {
  const k = x.knoten;
  const gruppen = P.gruppiert(k.optionen);
  const knopf = (o) => {
    const j = k.optionen.indexOf(o), an = x.option === o;
    return `<button type="button" class="h-option${o.farbe ? ' farbig' : ''}" data-sicht="option" data-act="h-option" data-s="${esc(x.id)}" data-i="${j}"${farbeVon(o)}${an ? ' aria-current="true"' : ''}${gruppen ? ` aria-label="${esc(`${o.label}, ${o.zusatz}`)}"` : ''}><span class="h-o-label">${esc(o.label)}</span>${o.zusatz && !gruppen ? `<span class="h-o-zusatz">${esc(o.zusatz)}</span>` : ''}${an ? ic('haken', 'i h-o-i') : ''}</button>`;
  };
  const optionen = gruppen
    ? gruppen.map((g) => `<div class="h-gruppe" role="group" aria-label="${esc(g.zusatz)}"><p class="h-g-titel">${esc(g.zusatz)}</p><div class="h-optionen">${g.optionen.map(knopf).join('')}</div></div>`).join('')
    : `<div class="h-optionen" role="group" aria-labelledby="h-titel">${k.optionen.map(knopf).join('')}</div>`;
  return `<section class="h-abschnitt hier"><h2 class="h-titel" id="h-titel" tabindex="-1">${esc(x.label)}</h2>${optionen}</section>`;
}

/** Eine gewählte Stufe: ihre Karte mit Haken. Ein Tipp öffnet die Stufe wieder (data-act h-stufe). */
function halloGewaehlt(x) {
  const o = x.option;
  return `<section class="h-abschnitt"><h2 class="h-titel">${esc(x.label)}</h2><button type="button" class="h-option gewaehlt${o.farbe ? ' farbig' : ''}" data-sicht="gewaehlt" data-act="h-stufe" data-s="${esc(x.id)}"${farbeVon(o)} aria-label="${esc(`${x.label}: ${optionText(o)}. Ändern`)}"><span class="h-o-label">${esc(o.label)}</span>${o.zusatz ? `<span class="h-o-zusatz">${esc(o.zusatz)}</span>` : ''}${ic('haken', 'i h-o-i')}</button></section>`;
}

/** Die Fortschrittslinie unter dem Schriftzug: ein Strich je Stufe, an der jemand wählt (Silas, V-0234),
 *  ohne Beschriftung (V-0243: „alles Unnötige entfernen“); was sie sagt, steht für Screenreader daneben. */
function halloLeiste(st) {
  const teile = st.schritte.filter((x) => x.art === 'gewaehlt' || x.art === 'offen');
  const striche = teile.map((x) => `<span class="h-strich${x.art === 'gewaehlt' ? ' voll' : ''}${x.id === hallo.sicht ? ' hier' : ''}"></span>`).join('');
  return `<span class="h-striche" aria-hidden="true">${striche}</span><span class="nur-sr">${esc(P.leistenText(st).zahl)}</span>`;
}

// ── Bedienung

/** Den Filter setzen (raster.mjs) und ansagen, was zu sehen ist. */
function filtern(neu, ausVerlauf = false) {
  Object.assign(z, neu);
  if (!ausVerlauf) { verlauf = R.verlaufMerken(verlauf, z); tippPlanen(); }
  const c = bestand.parts.find((x) => x.id === z.teil);
  const m = plan.modules.find((x) => x.number === z.modul);
  render();
  sage(c ? `Nur ${c.module.short} ${R.typLang(c.type)}: ${mehrzahl(c.groups.length, 'Gruppe', 'Gruppen')}.` : m ? `${m.title || m.short}: alle Formate.` : 'Filter aufgehoben. Zu sehen ist, was noch offen ist.');
}

const AKTIONEN = {
  start: () => start(),
  teil: (b) => {
    const c = bestand.parts.find((x) => x.id === b.dataset.teil);
    if (c) filtern(R.tippeFormat(z, c.id, c.module.number));
  },
  modul: (b) => { const m = plan.modules[Number(b.dataset.m)]; if (m) filtern(R.tippeModul(z, m.number)); },
  aufheben: () => filtern(R.KEIN_FILTER),
  info: (b) => karteModul(Number(b.dataset.m), b),
  wechseln: () => halloOeffnen(blatt ? P.wahlFuer(blaetter, blatt.id) : {}, blatt ? 'fertig' : null),
  'h-option': (b) => halloWaehlen(b.dataset.s, Number(b.dataset.i)),
  'h-stufe': (b) => { hallo.sicht = b.dataset.s; renderHallo(true); },
  'h-oeffnen': () => {
    const st = P.wahlStand(baum, stufen, hallo.wahl);
    const b = st.plan && blaetter.find((x) => x.id === st.plan.id);
    if (!b) return;
    // Die aktive Wahl: erst jetzt kommt der Plan in den Speicher (wie die Auswahl, ARCHITEKTUR §6).
    A.speicherePlanwahl(speicher, b.id);
    planOeffnen(b);
  },
  'hallo-zu': () => { zeigeHallo(false); const r = $('studiengang').querySelector('button'); if (r) r.focus({ preventScroll: true }); },
  kachel: (b) => karteGruppe(b),
  umschalten: (b) => {
    // Nach langem Drücken kommt noch ein click; der gehört zur Karte, nicht zum Einplanen.
    if (lang.gedrueckt) { lang.gedrueckt = false; return; }
    const g = finde(b.dataset.key);
    if (!g) return;
    const war = g.selected;
    waehle(b.dataset.key);
    if (navigator.vibrate) navigator.vibrate(8);
    if (!lang.erklaert) { lang.erklaert = true; melde(war ? 'Herausgenommen. Nochmal tippen plant wieder ein.' : 'Eingeplant. Nochmal tippen nimmt es heraus, lange drücken zeigt die Details.'); }
  },
  waehlen: (b) => {
    const key = b.dataset.key;
    const zurueck = offen && offen.zurueck;
    if (offen) schliesse(true);
    waehle(key);
    // Aus der Karte zurück zur Kachel, gibt es sie nicht mehr, an den Tabulatorhalt des Rasters.
    const ziel = (zurueck && zurueck()) || $('koerper').querySelector('.k-flaeche[tabindex="0"]');
    if (ziel && b.closest('.ebene')) ziel.focus({ preventScroll: true });
  },
  kalender: () => kalender(),
  geprueft: (b) => { const g = finde(b.dataset.key); if (g && !vorschau) aendere(A.bestaetige(eigene, g.component_id, g)); },
  loesen: (b) => { if (!vorschau) aendere(A.loese(eigene, b.dataset.teil)); },
  // Reiter, Tageskopf der Woche oder Kachel der Wochenübersicht: zeigt den Tag groß.
  tag: (b) => {
    z.tag = Number(b.dataset.tag);
    if (modus() === 'woche') z.modus = 'tag';
    render();
  },
  modus: (b) => { z.modus = b.dataset.v; render(); sage(b.dataset.v === 'woche' ? 'Die ganze Woche.' : `${TAGE[z.tag]}.`); },
  setze: (b) => { if (b.dataset.k === 'ab') z.ab = Number(b.dataset.v); render(); },
  zeit: (b) => {
    const i = wochen.indexOf(z.zeitraum) + Number(b.dataset.d);
    z.zeitraum = i < 0 ? 'skeleton' : wochen[Math.min(i, wochen.length - 1)] || 'skeleton';
    render();
  },
  ebene: (b) => ebene(b.dataset.ebene, b),
  zu: () => schliesse(),
  // Erst handeln, dann schließen: schliesse() sucht den Fokus im neuen Zustand.
  ja: () => { const o = offen, f = o && o.ja; if (f) f(); if (offen === o) schliesse(); },
  teilen: () => teilen(),
  kopieren: () => linkKopieren(),
  lesezeichen: () => { const t = $('lz-text'); if (t) { t.textContent = lesezeichenText(); t.hidden = false; } },
  'system-teilen': () => systemTeilen(),
  zuruecksetzen: () => zuruecksetzen(),
  'tipp-zu': () => tippZu(),
  uebernehmen: () => uebernehmen(),
  verwerfen: () => vorschauEnde(),
  'neu-laden': async () => {
    const eintrag = blatt;
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
  if (k === 'zeitraum') z.zeitraum = t.value;
  render();
});

/** Einen Plan öffnen (aus dem Startbildschirm, einem Link oder dem Speicher). Ist er schon offen
 *  und kein Link im Spiel, bleibt alles, wie es ist: Filter, Tag, Auswahl. */
async function planOeffnen(b, verweis = null) {
  schliesse(true);
  zeigeHallo(false);
  // Beim Öffnen immer „Mein Stundenplan“, ohne Filter, auch nach dem Startbildschirm (V-0237).
  Object.assign(z, R.KEIN_FILTER);
  verlauf = R.verlaufNeu();
  if (plan && blatt && blatt.id === b.id && !verweis) { vorschau = null; adresseOhneAuswahl(); render(); return; }
  blatt = b;
  vorschau = null;
  await planLaden(b, verweis);
  if (!verweis) adresseOhneAuswahl();
}

/** Die Uhr des Tipps beginnt mit der ersten Wahl eines Filters; danach wird alle 15 s nachgesehen, ob er
 *  fällig ist und gerade nichts im Weg steht (eine offene Karte, der Startbildschirm). */
function tippPlanen() {
  if (tipp.gezeigt || tipp.benutzt || !fein.matches) return;
  if (!tipp.erste) tipp.erste = Date.now();
  if (!tipp.uhr) tipp.uhr = setTimeout(tippPruefen, Math.max(1000, R.TIPP_NACH_MS - (Date.now() - tipp.erste)));
}

function tippPruefen() {
  tipp.uhr = 0;
  const lage = { seit: Date.now() - tipp.erste, schritte: verlauf.liste.length, gezeigt: tipp.gezeigt, benutzt: tipp.benutzt, tastatur: fein.matches, frei: !offen && $('hallo').hidden && !!plan };
  if (R.tippFaellig(lage)) { tippZeigen(); return; }
  if (!tipp.gezeigt && !tipp.benutzt && fein.matches) tipp.uhr = setTimeout(tippPruefen, 15000);
}

function tippZeigen() {
  tipp.gezeigt = true;
  const t = $('tipp');
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('da'));
  tipp.weg = setTimeout(tippZu, 12000);
}

function tippZu() {
  clearTimeout(tipp.weg);
  const t = $('tipp');
  if (t.hidden) return;
  t.classList.remove('da');
  setTimeout(() => { t.hidden = true; }, 200);
}

/**
 * Wo Pfeil links und rechts durch den Verlauf gehen (V-0245): überall auf der Seite, nur nicht dort, wo
 * die Pfeile schon etwas tun: in Feldern und Auswahllisten, im Raster (Kachel zu Kachel, §4.4), in einer
 * offenen Karte oder einem Blatt und im Startbildschirm.
 */
function pfeileFuerVerlauf(e) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || offen || !plan || !$('hallo').hidden) return false;
  const t = e.target instanceof Element ? e.target : null;
  return !(t && (t.closest('input, select, textarea, [contenteditable], #koerper, [role="tablist"]')));
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && pfeileFuerVerlauf(e)) {
    // Wer die Pfeile benutzt, kennt sie: Der Tipp kommt nicht mehr, ein offener geht.
    tipp.benutzt = true;
    tippZu();
    const s = R.verlaufSchritt(verlauf, e.key === 'ArrowLeft' ? -1 : 1);
    if (s) { e.preventDefault(); verlauf = s.v; filtern(s.filter, true); }
    return;
  }
  if (e.key === 'Escape' && !$('tipp').hidden) { tippZu(); return; }
  if (e.key === 'Escape') {
    if (offen) { e.preventDefault(); schliesse(); } else if (!$('hallo').hidden) halloEsc(); else if (z.teil || z.modul) filtern(R.stufeZurueck(z));
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

// Am Handy (V-0247): Ein Tipp plant ein oder löst, lange drücken (500 ms ohne zu wischen) öffnet die
// Karte mit Zeit, Raum und allen Terminen. Der click danach wird verschluckt (Aktion umschalten).
const lang = { uhr: 0, x: 0, y: 0, gedrueckt: false, erklaert: false };
$('koerper').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.k-flaeche[data-act="umschalten"]');
  if (!b || e.pointerType === 'mouse') return;
  lang.gedrueckt = false;
  lang.x = e.clientX; lang.y = e.clientY;
  clearTimeout(lang.uhr);
  lang.uhr = setTimeout(() => {
    lang.gedrueckt = true;
    if (navigator.vibrate) navigator.vibrate(15);
    // Der click beim Loslassen träfe sonst die Fläche hinter dem Blatt und schlösse es gleich wieder
    // (so gemessen am 05.10.2026). Er wird einmal verschluckt, egal wo er landet.
    const schlucken = (ev) => { ev.preventDefault(); ev.stopPropagation(); lang.gedrueckt = false; };
    document.addEventListener('click', schlucken, { capture: true, once: true });
    setTimeout(() => { document.removeEventListener('click', schlucken, { capture: true }); lang.gedrueckt = false; }, 1000);
    karteGruppe(b);
  }, 500);
});
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) $('koerper').addEventListener(t, () => clearTimeout(lang.uhr));
$('koerper').addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - lang.x, e.clientY - lang.y) > 10) clearTimeout(lang.uhr); });
// Android meldet langes Drücken auch als Kontextmenü; das Menü des Browsers soll dann nicht kommen.
$('koerper').addEventListener('contextmenu', (e) => { if (e.target.closest('.k-flaeche[data-act="umschalten"]')) e.preventDefault(); });

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

// Eine zweite Registerkarte ändert die Auswahl: nachziehen, statt sie beim nächsten Klick zu überschreiben.
addEventListener('storage', (e) => {
  if (!plan || (e.key !== null && e.key !== schluessel && e.key !== altSchluessel)) return;
  ({ auswahl: eigene, alt: altSchluessel } = A.ladeAuswahlFuer(speicher, plan, eindeutig(plan)));
  render();
});

// Ein Teilen-Link, in diese offene Seite eingefügt.
addEventListener('hashchange', () => { if (A.teilenLesen(location.hash)) { schliesse(true); start(); } });

start();
