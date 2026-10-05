// Das Bild des fertigen Plans (Silas, 05.10.2026, V-0253): Vor dem Kalender-Export und beim Speichern
// zeigt die Seite den Plan so, wie er exportiert und geteilt wird: nur die eingeplanten Gruppen, ohne
// Knöpfe, ohne Filter, ohne Vorschläge. „Wirklich nur der finale fertige Stundenplan, … nochmal in schön
// als quasi Picture-in-Picture.“ Die Kacheln sind dieselben wie im Raster (Klassen kachel, k-flaeche
// mit Container-Abfragen, Modulfarben, eingeplant), nur ohne Bedienung; so sehen beide gleich aus.
// Lädt erst bei der ersten Bedienung, wie ics.mjs (DESIGN §6: zählt nicht zum Budget beim Laden).
// Kein style-Attribut im HTML (CSP): Lage und Größe trägt das HTML als data-*, legen() setzt sie über das CSSOM.

import { esc, tagMonat } from './text.mjs';
import * as R from './raster.mjs';

const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const KAT = { uebung: ' kat-uebung', sonstige: ' kat-sonstige' };

/**
 * Das Bild als HTML. `gruppen`: die eingeplanten Gruppen (bestand mit selected), `konflikt`: die Schlüssel
 * der Gruppen in einer Überschneidung (sie behalten ihren roten Ring), `titel`: eine Zeile über dem Bild.
 * Die Zeitachse reicht nur über diese Gruppen, mindestens Mo–Fr: Das Bild ist so ruhig wie möglich.
 */
export function planBildHtml({ gruppen, konflikt = new Set(), titel = '', module = [] }) {
  const ax = R.achse(gruppen);
  const tage = Math.max(5, R.tagesZahl(gruppen));
  const von = ax.von * 60, dauer = (ax.bis - ax.von) * 60;
  const modulNr = (g) => (module.length ? module.indexOf(g.component.module) : 0);
  const jeTag = [...Array(tage)].map(() => []);
  for (const g of gruppen) {
    for (const s of g.slots) {
      if (s.day >= tage) continue;
      jeTag[s.day].push({ g, s, start: R.minuten(s.start), end: R.minuten(s.end), gewaehlt: 1, modul: modulNr(g), name: g.name });
    }
  }
  let html = '<div class="stunden">';
  for (let i = 0; i <= ax.bis - ax.von; i++) html += `<div class="stunde" data-o="${(i / (ax.bis - ax.von)) * 100}"><span>${String(ax.von + i).padStart(2, '0')}</span></div>`;
  html += '</div>';
  let n = 0;
  for (let d = 0; d < tage; d++) {
    const liste = R.spuren(jeTag[d].sort(R.ordnung));
    liste.sort((a, b) => a.start - b.start || a.spur - b.spur);
    html += `<div class="spalte"><div class="innen">${liste.map((e) => kachel(e, von, dauer, konflikt)).join('')}</div></div>`;
    n += liste.length;
  }
  const kopf = [...Array(tage).keys()].map((d) => `<span class="tag"><span class="kurz">${TAGE[d].slice(0, 2)}</span><span class="lang">${TAGE[d]}</span></span>`).join('');
  const satz = `Wochenplan, ${gruppen.length === 1 ? 'eine Termingruppe' : `${gruppen.length} Termingruppen`}, ${n === 1 ? 'eine Kachel' : `${n} Kacheln`} von ${String(ax.von).padStart(2, '0')} bis ${String(ax.bis).padStart(2, '0')} Uhr`;
  return `<figure class="pb-bild">${titel ? `<figcaption class="pb-titel">${esc(titel)}</figcaption>` : ''}<div class="raster bild" role="img" aria-label="${esc(satz)}" data-tage="${tage}" data-stunden="${ax.bis - ax.von}"><div class="tage" aria-hidden="true">${kopf}</div><div class="koerper" aria-hidden="true">${html}</div></div></figure>`;
}

function kachel({ g, s, start, end, spur, spuren }, von, dauer, konflikt) {
  const nr = R.gruppenNummer(g.name);
  const raum = (s.rooms || []).join(', ');
  const rh = R.rhythmusHinweis(s);
  const kat = KAT[R.kategorie(g.component)] || '';
  const kon = konflikt.has(g.key) ? ' konflikt' : '';
  const gruppe = nr ? 'Gruppe ' + nr : g.name;
  const lage = `data-o="${((start - von) / dauer) * 100}" data-h="${((end - start) / dauer) * 100}" data-s="${spur}" data-n="${spuren}"`;
  return `<div class="kachel m${g.farbe + 1} gewaehlt${kat}${kon}" ${lage}><div class="k-flaeche"><span class="k-mod">${esc(g.module_short)}</span><span class="k-titel">${esc(g.component.module.title || g.module_short)}</span><span class="k-typ">${esc(g.type)}</span><span class="k-kurz">${esc(nr ? g.type + ' ' + nr : g.type)}</span><span class="k-nr">${esc(nr || '')}</span><span class="k-lang k-2">${esc(R.typLang(g.type))}</span><span class="k-info k-2">${esc(`${gruppe}, ${s.start}–${s.end}`)}</span><span class="k-ort k-2">${esc(rh || raum)}</span></div></div>`;
}

/** Lage und Größe aus den data-* über das CSSOM (wie renderRaster in app.js; 1 px Luft oben, 2 px zwischen Spuren). */
export function planBildLegen(wurzel) {
  const r = wurzel && wurzel.querySelector('.raster.bild');
  if (!r) return;
  r.style.setProperty('--tage', r.dataset.tage);
  r.style.setProperty('--stunden', r.dataset.stunden);
  r.querySelector('.koerper').style.setProperty('--spalten', r.dataset.tage);
  for (const el of r.querySelectorAll('.stunde')) el.style.top = el.dataset.o + '%';
  for (const el of r.querySelectorAll('.kachel')) {
    const st = el.style, d = el.dataset;
    st.top = `calc(${d.o}% + 1px)`;
    st.height = `calc(${d.h}% - 1px)`;
    st.left = `calc(${d.s} * (100% + 2px) / ${d.n})`;
    st.width = `calc((100% + 2px) / ${d.n} - 2px)`;
  }
}

/**
 * Der Satz unter dem Bild für den Kalender: „8 Termingruppen, 112 Termine vom 13.10. bis 12.02.“
 * `termine` aus ics.mjs (icsTermine), jeder mit termin.start als „JJJJ-MM-TTTHH:MM“.
 */
export function kalenderSatz(gruppen, termine) {
  const tage = termine.map((t) => String(t.termin && t.termin.start || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const g = gruppen.length === 1 ? 'Eine Termingruppe' : `${gruppen.length} Termingruppen`;
  const t = termine.length === 1 ? 'ein Termin' : `${termine.length} Termine`;
  return tage.length ? `${g}, ${t} vom ${tagMonat(tage[0])} bis ${tagMonat(tage[tage.length - 1])}` : `${g}, ${t}`;
}
