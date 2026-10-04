// Text, Links und Datumsangaben — alles, was aus der Datendatei in die Seite geschrieben wird,
// geht hier durch. Herkunft: app/static/stundenplan.js des Study OS (esc, link, dateLabel, stamp).
// Die Datendatei kommt aus MOSES; kein Text daraus wird je als HTML gerendert.

const ZEICHEN = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escaped jeden Wert für HTML-Text und Attributwerte in doppelten Anführungszeichen. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ZEICHEN[c]);
}

// Links nur zu MOSES und ISIS der TU Berlin, nur https. Eine Datendatei, die (aus welchem Grund
// auch immer) eine andere Adresse trägt, bekommt keinen Link, sondern nichts.
const ERLAUBT = /^https:\/\/(moseskonto|isis)\.tu-berlin\.de\//;

export function sichereUrl(url) {
  return typeof url === 'string' && ERLAUBT.test(url) ? url : null;
}

export function link(url, text) {
  const u = sichereUrl(url);
  return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>` : '';
}

/** "2026-10-12" → "12.10.26" (Mittag, damit keine Zeitzone den Tag verschiebt). */
export function dateLabel(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** "2026-10-12" → "12.10.2026". */
export function datumLang(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** ISO-Zeitpunkt →"04.10., 05:21" in Berliner Zeit; ohne Wert: "noch kein Lauf". */
export function stamp(d) {
  return d
    ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
    : 'noch kein Lauf';
}

/** Tage auf einen ISO-Tag rechnen, in UTC, damit keine Sommerzeit dazwischenfunkt. */
export function plusTage(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
