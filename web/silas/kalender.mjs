// Die Ereignisse von /silas als iCalendar (V-0321) — für ein Kalender-Abo in Apple Kalender, Google
// oder Outlook. Zwei Kalender, wie in Silas' Semesterplan (§3 „Generalstruktur“): „TU · Termine“
// (Fixtermine, gewählte Gruppen, Fristen und Prüfungen: Schichten A, B, C) und „TU · Lernen“ (die
// eigenen Blöcke, Schicht D) — so lassen sich die Lernblöcke ausblenden, ohne Pflichttermine anzufassen.
// Eine eigene kleine Datei statt web/ics.mjs: Silas wollte für /silas nichts aus der alten Logik.

const NAMEN = { termine: 'TU · Termine', lernen: 'TU · Lernen', alles: 'TU · Semesterplan' };
const SCHICHTEN = { termine: ['A', 'B', 'C', 'R'], lernen: ['D'], alles: ['A', 'B', 'C', 'D', 'R'] };
export const KALENDER = Object.keys(NAMEN);

// Die Zeitzone als Block, damit DTSTART;TZID=Europe/Berlin überall gleich gelesen wird (RFC 5545 §3.6.5).
const ZEITZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

const text = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const tagWert = (d) => d.replace(/-/g, '');
const ortszeit = (iso) => iso.slice(0, 19).replace(/[-:]/g, ''); // 2026-10-29T12:15:00+01:00 → 20261029T121500
const naechsterTag = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1)).toISOString().slice(0, 10);

/** Faltet eine Zeile nach 75 Oktetten (RFC 5545 §3.1), ohne ein UTF-8-Zeichen zu zerteilen. */
export function falten(zeile) {
  const enc = new TextEncoder();
  if (enc.encode(zeile).length <= 75) return zeile;
  const teile = [];
  let rest = zeile, grenze = 75;
  while (enc.encode(rest).length > grenze) {
    let n = grenze;
    while (enc.encode(rest.slice(0, n)).length > grenze) n -= 1;
    teile.push(rest.slice(0, n));
    rest = rest.slice(n);
    grenze = 74; // Folgezeilen beginnen mit einem Leerzeichen
  }
  teile.push(rest);
  return teile.join('\r\n ');
}

export function ics(ereignisse, { kalender = 'termine', jetzt = new Date() } = {}) {
  const schichten = SCHICHTEN[kalender] || SCHICHTEN.termine;
  const stempel = jetzt.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const z = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//stundenplanner.de//silas//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(NAMEN[kalender] || NAMEN.termine)}`, 'X-WR-TIMEZONE:Europe/Berlin',
    // Wie oft ein Abo nachsieht: stündlich — der Plan ändert sich, wenn Silas plant.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...ZEITZONE,
  ];
  for (const e of ereignisse) {
    if (!schichten.includes(e.schicht)) continue;
    if (e.ausgefallen) continue; // fällt aus (TU geschlossen, abgesagt): nicht im Kalender (V-0349)
    const beschreibung = [];
    if (e.online) beschreibung.push(e.online);
    if (e.unsicher) beschreibung.push('Angabe unsicher — prüfen');
    // Woanders nur in dieser Woche: ein Block (SP-0416), eine andere Gruppe (SP-0421) oder ein verlegter Termin (SP-0423).
    if (e.einzeln) beschreibung.push(e.sonst ? `Nur in dieser Woche ${e.verlegt ? 'verlegt' : 'bei einer anderen Gruppe'} — sonst am ${e.sonst.datum.split('-').reverse().join('.')} um ${e.sonst.start.slice(11, 16)}` : 'Nur in dieser Woche verschoben — sonst liegt der Block an seinem Platz in der Woche');
    if (e.zaehlt_min === 0 && e.quelle === 'block' && e.teil) beschreibung.push('Zählt nicht für die Leistungspunkte (siehe stundenplanner.de/silas)');
    z.push('BEGIN:VEVENT', `UID:${text(e.id)}@stundenplanner.de`, `DTSTAMP:${stempel}`);
    if (e.ganztag) {
      z.push(`DTSTART;VALUE=DATE:${tagWert(e.datum)}`, `DTEND;VALUE=DATE:${tagWert(naechsterTag(e.bis || e.datum))}`, 'TRANSP:TRANSPARENT');
    } else {
      z.push(`DTSTART;TZID=Europe/Berlin:${ortszeit(e.start)}`, `DTEND;TZID=Europe/Berlin:${ortszeit(e.ende)}`);
    }
    z.push(`SUMMARY:${text((e.uhrzeit ? `${e.uhrzeit} ` : '') + e.titel)}`);
    if (e.ort) z.push(`LOCATION:${text(e.ort)}`);
    if (beschreibung.length) z.push(`DESCRIPTION:${text(beschreibung.join('\n'))}`);
    z.push(`CATEGORIES:${text(e.art)}`, 'END:VEVENT');
  }
  z.push('END:VCALENDAR');
  return z.map(falten).join('\r\n') + '\r\n';
}
