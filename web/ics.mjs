// Kalender-Export: die Auswahl als iCalendar-Datei (RFC 5545), die Apple-, Google- und
// Outlook-Kalender übernehmen (V-0231). Silas, 05.10.2026: „Den Kalender exportieren und wirklich
// mit einem Klick möglich machen, dass man ihn als iCal-Datei sofort geöffnet in seinen privaten
// Kalender auf dem Handy oder Laptop übernehmen kann.“
//
// Die Datei entsteht nur im Browser, aus dem Plan, den die Seite schon geladen hat. Nichts geht an
// einen Server: kein Abo (webcal://), denn dafür müsste ein Server die Auswahl kennen (SCOPE §5).
//
// Ein VEVENT je ECHTEM Einzeltermin (`bookings`), keine Serie mit RRULE: So stimmen Ferien,
// Ausfälle und Raumwechsel, ohne dass hier jemand Regeln aus `slots` zurückrät.
//
// Reine Logik bis auf icsAnstossen() am Ende, das den Download auslöst; node --test prüft den Rest.

import { sichereUrl } from './text.mjs';
import { typLang } from './raster.mjs';

const DOMAIN = 'stundenplanner.de';
const TZID = 'Europe/Berlin';
export const PRODID = `-//${DOMAIN}//Stundenplanner//DE`;
export const MIME = 'text/calendar;charset=utf-8';

// Wie der Fuß der Seite (index.html, SCOPE §3 „kein offizielles Angebot“), damit es in jedem
// Termin steht, auch Monate später, wenn niemand mehr weiß, woher er kam.
const INOFFIZIELL = 'Kein offizielles Angebot der TU Berlin. Verbindlich sind MOSES und die Anmeldungen dort.';

// Die Zeitzone als eigener Block: Ohne VTIMEZONE muss sich ein Kalender die TZID selbst denken,
// und Outlook liest dann alle Termine als UTC. Regel der EU seit 1996: Sommerzeit vom letzten
// Sonntag im März 02:00 bis zum letzten Sonntag im Oktober 03:00 Ortszeit.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  `X-LIC-LOCATION:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/**
 * TEXT nach RFC 5545 §3.3.11: `\` `;` `,` maskiert, Zeilenumbrüche als `\n`. Andere Steuerzeichen
 * sind in TEXT nicht erlaubt und fallen weg (aus MOSES kommt mitunter ein Tab oder ein \r).
 */
export function icsText(v) {
  return String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\\;,]/g, (c) => '\\' + c)
    .replace(/\n/g, '\\n')
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

const oktette = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/**
 * Faltet eine Inhaltszeile bei 75 OKTETTEN (RFC 5545 §3.1), nicht bei 75 Zeichen: „Übung“ ist in
 * UTF-8 länger, als es aussieht. Geteilt wird nur zwischen ganzen Zeichen, nie mitten in einem
 * Mehrbyte-Zeichen (sonst zeigt der Kalender � statt ü). Folgezeilen beginnen mit einem Leerzeichen,
 * das zu ihren 75 Oktetten zählt.
 */
export function falte(zeile) {
  const teile = [];
  let aktuell = '', laenge = 0, grenze = 75;
  for (const z of zeile) {
    const n = oktette(z.codePointAt(0));
    if (laenge + n > grenze) {
      teile.push(aktuell);
      aktuell = ' ';
      laenge = 1;
      grenze = 75;
    }
    aktuell += z;
    laenge += n;
  }
  teile.push(aktuell);
  return teile.join('\r\n');
}

// Das Lesemodell trägt Berliner Ortszeit ohne Versatz ("2026-10-19T08:00:00", aus dem CSV-Export
// von MOSES; ARCHITEKTUR §4). Genau das ist DTSTART;TZID=Europe/Berlin. Was anders aussieht, wird
// nicht geraten, sondern übersprungen.
const ORTSZEIT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function ortszeit(s) {
  const m = ORTSZEIT.exec(String(s || ''));
  return m ? `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] || '00'}` : null;
}

function utc(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const studiengangId = (plan) => (typeof plan.studiengang === 'object' && plan.studiengang ? plan.studiengang.id : plan.studiengang);

/** Der Name des Kalenders: „Stundenplan WiSe 2026/27“. */
export function kalenderName(plan) {
  return `Stundenplan ${plan.label || plan.semester || ''}`.trim();
}

/** stundenplan-<studiengang>-<semester>.ics, nur Kleinbuchstaben, Ziffern und Bindestriche. */
export function dateiName(plan) {
  const teil = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return ['stundenplan', teil(studiengangId(plan)), teil(plan.semester)].filter(Boolean).join('-') + '.ics';
}

/**
 * Die Einzeltermine der gewählten Gruppen, in der Reihenfolge des Plans, jeder Termin einmal.
 * `auswahl` ist die WIRKSAME Auswahl der Seite: ausdrücklich gewählte Gruppen und die, die von
 * selbst eingeplant sind, weil ihr Bestandteil nur eine Gruppe hat (Silas, 05.10.2026). Eine
 * bewusste Abwahl steht dort als `group: null` und liefert nichts, ebenso eine Gruppe ohne Termine
 * und eine gespeicherte Gruppe, die es im Plan nicht mehr gibt (die Seite nennt sie schon als
 * „nicht mehr im Angebot“). Liest den Plan nur, auch nach bestand() (mit Rückverweisen).
 */
export function icsTermine(plan, auswahl) {
  const out = [];
  const gesehen = new Set();
  for (const m of (plan && Array.isArray(plan.modules) ? plan.modules : [])) {
    for (const c of (Array.isArray(m.components) ? m.components : [])) {
      const wahl = auswahl && auswahl[c.id];
      if (!wahl || wahl.group == null || wahl.group === '') continue;
      // Eine Liste, wenn alle Gruppen eines Bestandteils gelten (`gruppen: alle`, V-0234).
      const ids = [].concat(wahl.group);
      for (const g of (Array.isArray(c.groups) ? c.groups : []).filter((x) => ids.includes(x.id))) {
        for (const b of (Array.isArray(g.bookings) ? g.bookings : [])) {
          const uid = uidVon(b, c, g);
          if (gesehen.has(uid)) continue;
          gesehen.add(uid);
          out.push({ modul: m, teil: c, gruppe: g, termin: b, uid });
        }
      }
    }
  }
  return out;
}

// UID = Buchungs-ID@stundenplanner.de. Die ID kommt aus MOSES und bleibt über Abrufe gleich: Ein
// zweiter Import desselben Plans ersetzt die Termine, statt sie zu verdoppeln, soweit der Kalender
// das kann. Ohne ID (sollte es nicht geben) eine aus Bestandteil, Gruppe und Beginn.
function uidVon(b, c, g) {
  const id = b && b.id != null && String(b.id).trim() ? String(b.id).trim() : `${c.id}-${g.id}-${b && b.start}`;
  return `${id.replace(/[^A-Za-z0-9._-]+/g, '-')}@${DOMAIN}`;
}

function veranstaltung({ modul: m, teil: c, gruppe: g, termin: b, uid }, dtstamp) {
  const beginn = ortszeit(b.start);
  if (!beginn) return null;
  const ende = ortszeit(b.end);
  const art = String(b.format || '').trim() || typLang(c.type);
  const modulName = String(m.short || m.title || m.number || '').trim();
  const lv = String(b.number || c.number || '').trim();
  const url = sichereUrl(g.url) || sichereUrl(c.vvz_url) || sichereUrl(m.url);
  const beschreibung = [
    m.title || modulName,
    [art, g.name].filter(Boolean).join(', '),
    lv && `LV-Nummer ${lv}`,
    b.note,
    b.info,
    url && `MOSES: ${url}`,
    INOFFIZIELL,
  ].map((x) => String(x || '').trim()).filter(Boolean).join('\n');

  const z = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${TZID}:${beginn}`,
  ];
  // DTEND muss nach DTSTART liegen (RFC 5545 §3.6.1); ein Termin über Mitternacht endet am
  // Folgetag und steht so auch im Lesemodell. Ein kaputtes Ende lässt DTEND weg, statt zu raten.
  if (ende && ende > beginn) z.push(`DTEND;TZID=${TZID}:${ende}`);
  z.push(`SUMMARY:${icsText([modulName, art].filter(Boolean).join(' · '))}`);
  if (String(b.room || '').trim()) z.push(`LOCATION:${icsText(String(b.room).trim())}`);
  z.push(`DESCRIPTION:${icsText(beschreibung)}`);
  if (url) z.push(`URL:${url}`);
  // CATEGORIES übernehmen Outlook und Thunderbird (dort mit Farbe, wenn es die Kategorie gibt);
  // Apple und Google lassen sie still liegen. COLOR (RFC 7986) übernimmt beim Import keiner der
  // drei, deshalb steht es nicht drin.
  if (art) z.push(`CATEGORIES:${icsText(art)}`);
  z.push('TRANSP:OPAQUE', 'END:VEVENT');
  return z;
}

/**
 * Die Auswahl als VCALENDAR (RFC 5545), Zeilen mit CRLF und gefaltet.
 * optionen.jetzt: Zeitpunkt für DTSTAMP (Date; für Tests fest, sonst jetzt).
 * Eine leere Auswahl ergibt einen gültigen Kalender ohne Termine (mit VTIMEZONE).
 */
export function icsAusAuswahl(plan, auswahl, optionen = {}) {
  const jetzt = optionen.jetzt instanceof Date ? optionen.jetzt : new Date();
  const dtstamp = utc(jetzt);
  const name = kalenderName(plan || {});
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    `NAME:${icsText(name)}`,
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE,
  ];
  for (const t of icsTermine(plan, auswahl)) {
    const v = veranstaltung(t, dtstamp);
    if (v) zeilen.push(...v);
  }
  zeilen.push('END:VCALENDAR');
  return zeilen.map(falte).join('\r\n') + '\r\n';
}

/** Wie viele VEVENTs die Datei trägt (für die Meldung „N Termine“). */
export function anzahlTermine(text) {
  return (String(text).match(/^BEGIN:VEVENT\r?$/gm) || []).length;
}

/**
 * Die Datei zum Herunterladen: { blob, name, termine, text }. `termine` ist 0, wenn nichts gewählt
 * ist; dann sagt die Seite ICS_TEXTE.leer, statt eine leere Datei anzubieten.
 */
export function icsHerunterladen(plan, auswahl, optionen = {}) {
  const text = icsAusAuswahl(plan, auswahl, optionen);
  return { blob: new Blob([text], { type: MIME }), name: dateiName(plan || {}), termine: anzahlTermine(text), text };
}

// ── Mit einem Klick: was jedes Gerät mit der Datei tut ─────────────────────────────────────────
// Recherche V-0231 (05.10.2026), Quellen in web/README.md, „Kalender-Export“:
// - iPhone/iPad, Safari: Eine .ics aus Safari öffnet die Kalender-Vorschau mit „Alle hinzufügen“;
//   danach wählt man den Kalender. Das ist der eine Klick.
// - iPhone, Chrome/Firefox/Edge und eingebettete Browser (Instagram …): geben die Datei nicht an den
//   Kalender weiter. Nur der Weg über Safari geht; die Auswahl nimmt der Teilen-Link mit.
// - Android: Chrome lädt die Datei herunter; öffnen übernimmt sie in Kalender-Apps, die .ics
//   annehmen (z. B. Samsung Kalender). Die Google-Kalender-App importiert keine Dateien, das geht
//   laut Google nur am Computer.
// - Mac: Kalender öffnet die Datei und fragt, in welchen Kalender die Termine kommen.
// - Windows: Outlook (klassisch) öffnet sie; im neuen Outlook über „Kalender hinzufügen“, „Aus Datei
//   hochladen“. Google Kalender im Web: nur Einstellungen, „Importieren & exportieren“.
// - Web Share mit der Datei geht nicht: Chromium lässt .ics/text/calendar nicht teilen.
// Ein Abo (webcal://), das sich selbst aktualisiert, bräuchte einen Server mit der Auswahl: gibt es
// hier absichtlich nicht.

export const ICS_TEXTE = {
  ios: 'Tippe auf „Alle hinzufügen“ und wähle den Kalender, in den die Termine kommen.',
  iosAndere: 'Am iPhone gibt nur Safari die Datei an den Kalender weiter: Öffne deinen Teilen-Link in Safari und übernimm den Plan dort.',
  android: 'Öffne die Datei aus den Downloads; die Google-Kalender-App nimmt keine Datei an, dort importierst du sie am Computer unter calendar.google.com.',
  mac: 'Öffne die Datei aus den Downloads, dann fragt Kalender, wohin die Termine kommen; im Google Kalender: Einstellungen, „Importieren & exportieren“.',
  windows: 'Öffne die Datei aus den Downloads mit Outlook; im neuen Outlook und im Google Kalender geht es über „Kalender hinzufügen“ bzw. „Importieren & exportieren“.',
  andere: 'Öffne die Datei mit deinem Kalender; im Google Kalender: Einstellungen, „Importieren & exportieren“.',
  leer: 'Wähle zuerst eine Gruppe. Dann kommen ihre Termine in den Kalender.',
  abzug: 'Die Datei ist ein Abzug von heute: Ändert MOSES einen Termin, übernimm den Plan neu, am besten in einen eigenen Kalender, den du dann ersetzt.',
};

/**
 * Welches Gerät, aus dem User-Agent: 'ios' (Safari), 'iosAndere', 'android', 'mac', 'windows',
 * 'andere'. `beruehrung` = navigator.maxTouchPoints: Ein iPad meldet sich seit iPadOS 13 als Mac.
 */
export function kalenderGeraet(ua = '', beruehrung = 0) {
  const s = String(ua);
  const ios = /iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && beruehrung > 1);
  if (ios) {
    // Andere Browser und eingebettete Ansichten tragen ihr Kürzel; Safari trägt „Safari/“ ohne sie.
    const andere = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|TikTok|musical_ly|Twitter/.test(s);
    return andere || !/Safari\//.test(s) ? 'iosAndere' : 'ios';
  }
  if (/Android/.test(s)) return 'android';
  if (/Macintosh|Mac OS X/.test(s)) return 'mac';
  if (/Windows/.test(s)) return 'windows';
  return 'andere';
}

/**
 * Löst den Download aus, so, wie ihn das Gerät am ehesten an den Kalender gibt. Die einzige
 * Funktion hier mit DOM; `dok` ist das document (für Tests ein Ersatz).
 * - iPhone/iPad: data:-Adresse mit download und target=_self. Mit blob: und download landete die
 *   Datei in WebKit-Ansichten nicht beim Kalender (WebKit Bug 216918); data: geht dort, und so
 *   macht es auch add-to-calendar-button, das auf vielen Seiten läuft.
 * - sonst: blob:-Adresse mit download. Die Adresse wird erst nach einer Minute freigegeben: Firefox
 *   bricht den Download ab, wenn sie im selben Takt verschwindet.
 * Gibt den Gerätetyp zurück, damit die Seite den passenden Satz aus ICS_TEXTE zeigt.
 */
export function icsAnstossen(datei, { dok = globalThis.document, ua = globalThis.navigator?.userAgent, beruehrung = globalThis.navigator?.maxTouchPoints } = {}) {
  const geraet = kalenderGeraet(ua, beruehrung);
  const a = dok.createElement('a');
  a.download = datei.name;
  a.rel = 'noopener';
  let freigeben = null;
  if (geraet === 'ios' || geraet === 'iosAndere') {
    a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(datei.text);
    a.target = '_self';
  } else {
    a.href = URL.createObjectURL(datei.blob);
    freigeben = a.href;
  }
  a.hidden = true;
  dok.body.appendChild(a);
  a.click();
  a.remove();
  // unref(): Unter Node (Tests) hielte der Zeitgeber den Prozess eine Minute offen; im Browser fehlt es.
  if (freigeben) setTimeout(() => URL.revokeObjectURL(freigeben), 60000)?.unref?.();
  return geraet;
}
