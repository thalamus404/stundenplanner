// Text, Links und Datumsangaben — alles, was aus der Datendatei in die Seite geschrieben wird,
// geht hier durch. Herkunft: app/static/stundenplan.js des Study OS (esc, link, stamp).
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

// Das Zeichen des externen Links ist ein Symbol aus dem SVG-Satz in index.html, kein „↗“: Zeichen
// als Symbole sind einer der „AI tells“ (docs/DESIGN.md §5.12, §7).
export function link(url, text) {
  const u = sichereUrl(url);
  return u ? `<a class="extern" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}<svg class="i" aria-hidden="true"><use href="#i-extern"/></svg></a>` : '';
}

/** "2026-10-19" → "19.10." (so nennt die Seite Tage, DESIGN §5.13). */
export function tagMonat(d) {
  return `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
}

// Berliner Zeit ohne Intl: Ein Intl.DateTimeFormat mit Zeitzone kostet beim ersten Aufruf auf
// gedrosselter CPU 35 ms und lag damit im längsten Block beim Laden (TBT, DESIGN §6; gemessen
// V-0220). Die Regel der EU seit 1996: MEZ (UTC+1), Sommerzeit (UTC+2) vom letzten Sonntag im März
// 01:00 UTC bis zum letzten Sonntag im Oktober 01:00 UTC.
function berlin(ms) {
  const jahr = new Date(ms).getUTCFullYear();
  const letzterSonntag = (monat) => {
    const t = new Date(Date.UTC(jahr, monat + 1, 0, 1));
    t.setUTCDate(t.getUTCDate() - t.getUTCDay());
    return t.getTime();
  };
  const sommer = ms >= letzterSonntag(2) && ms < letzterSonntag(9);
  return new Date(ms + (sommer ? 2 : 1) * 3600000);
}

/** ISO-Zeitpunkt → "04.10., 05:21" in Berliner Zeit; ohne Wert: "noch kein Lauf". */
export function stamp(d) {
  const ms = d ? Date.parse(d) : NaN;
  if (Number.isNaN(ms)) return d ? 'unbekannt' : 'noch kein Lauf';
  const b = berlin(ms), z = (n) => String(n).padStart(2, '0');
  return `${z(b.getUTCDate())}.${z(b.getUTCMonth() + 1)}., ${z(b.getUTCHours())}:${z(b.getUTCMinutes())}`;
}

/** Tage auf einen ISO-Tag rechnen, in UTC, damit keine Sommerzeit dazwischenfunkt. */
export function plusTage(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Der Abschluss ausgeschrieben, wie Silas ihn im Studiengang-Reiter lesen will („Wirtschaftsinformatik,
// Bachelor of Science“, V-0225). Nur die Kürzel der Abschlüsse, kein Studiengang: Welche Studiengänge
// es gibt, sagt allein web/daten/index.json. Unbekannte Kürzel bleiben, wie die Daten sie liefern.
const ABSCHLUESSE = {
  'B.Sc.': 'Bachelor of Science', 'M.Sc.': 'Master of Science', 'B.A.': 'Bachelor of Arts', 'M.A.': 'Master of Arts',
  'B.Eng.': 'Bachelor of Engineering', 'M.Eng.': 'Master of Engineering', 'B.Ed.': 'Bachelor of Education', 'M.Ed.': 'Master of Education',
};

export function abschlussLang(k) {
  const t = String(k || '').trim();
  return ABSCHLUESSE[t] || t;
}
