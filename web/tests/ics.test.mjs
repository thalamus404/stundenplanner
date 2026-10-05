// Kalender-Export (V-0231): Aufbau nach RFC 5545, Escaping, Faltung bei 75 Oktetten mit Umlauten,
// Zeitzone, Termine über Mitternacht, ein VEVENT je Einzeltermin, stabile UIDs, leere Auswahl und
// die wirksame Auswahl der Seite (automatisch eingeplante Gruppen, Abwahl als group: null).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../ics.mjs';
import * as A from '../auswahl.mjs';
import { plan } from './hilfe.mjs';

const JETZT = new Date(Date.UTC(2026, 9, 5, 6, 30, 0));
const ALLES = { '10001:100': { group: '11' }, '10001:200': { group: '22' }, '10002:500': { group: '53' } };

/** Entfaltet (RFC 5545 §3.1) und liefert die logischen Zeilen. */
function zeilen(text) {
  return text.replace(/\r\n[ \t]/g, '').split('\r\n').filter((z, i, a) => z !== '' || i < a.length - 1);
}

/** Die VEVENTs als Listen ihrer Zeilen. */
function ereignisse(text) {
  const out = [];
  let akt = null;
  for (const z of zeilen(text)) {
    if (z === 'BEGIN:VEVENT') akt = [];
    else if (z === 'END:VEVENT') { out.push(akt); akt = null; }
    else if (akt) akt.push(z);
  }
  return out;
}

const wert = (ev, name) => {
  const z = ev.find((x) => x.startsWith(name + ':') || x.startsWith(name + ';'));
  return z === undefined ? undefined : z.slice(z.indexOf(':') + 1);
};

/** Umkehrung von icsText(), für den Rückweg im Test. */
const lies = (s) => s.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

test('Aufbau: VCALENDAR mit Kopf, einer VTIMEZONE, CRLF und ausgeglichenen BEGIN/END', () => {
  const t = I.icsAusAuswahl(plan(), ALLES, { jetzt: JETZT });
  assert.ok(t.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(t.endsWith('END:VCALENDAR\r\n'));
  assert.equal(t.replace(/\r\n/g, '').includes('\n'), false, 'nacktes LF');
  assert.equal(t.replace(/\r\n/g, '').includes('\r'), false, 'nacktes CR');
  const z = zeilen(t);
  for (const muss of ['PRODID:' + I.PRODID, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Stundenplan WiSe 2026/27', 'X-WR-TIMEZONE:Europe/Berlin']) {
    assert.ok(z.includes(muss), muss);
  }
  assert.equal(z.filter((x) => x === 'BEGIN:VTIMEZONE').length, 1);
  const stapel = [];
  for (const x of z) {
    if (x.startsWith('BEGIN:')) stapel.push(x.slice(6));
    if (x.startsWith('END:')) assert.equal(stapel.pop(), x.slice(4));
  }
  assert.deepEqual(stapel, []);
  for (const ev of ereignisse(t)) {
    for (const p of ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'DESCRIPTION']) assert.ok(wert(ev, p) !== undefined, p);
  }
});

test('ein VEVENT je echtem Einzeltermin der gewählten Gruppen', () => {
  // 11: 4 Termine, 22: 4, 53: 1
  const d = I.icsHerunterladen(plan(), ALLES, { jetzt: JETZT });
  assert.equal(d.termine, 9);
  assert.equal(ereignisse(d.text).length, 9);
  assert.equal(I.icsTermine(plan(), ALLES).length, 9);
  assert.equal(I.icsHerunterladen(plan(), { '10001:100': { group: '11' } }).termine, 4);
});

test('wirksame Auswahl: group: null (Abwahl), Gruppe ohne Termine, unbekannte Gruppe und Bestandteil liefern nichts', () => {
  const w = {
    '10001:100': { group: '11', digest: '', name: 'Termingruppe 1' }, // von selbst eingeplant (einzige Gruppe)
    '10001:200': { group: '23', digest: '', name: 'Termingruppe 3' }, // ohne Termine
    '10002:500': { group: null, digest: '', name: '' },               // bewusst abgewählt
    '10003:900': { group: '1', digest: '', name: 'weg' },              // Bestandteil gibt es nicht
  };
  assert.equal(I.icsHerunterladen(plan(), w, { jetzt: JETZT }).termine, 4);
  assert.equal(I.icsHerunterladen(plan(), { '10001:200': { group: '99' } }).termine, 0);
  assert.equal(I.icsHerunterladen(plan(), { '10001:200': { group: '' } }).termine, 0);
  assert.equal(I.icsHerunterladen(plan(), { '10001:200': null }).termine, 0);
});

test('leere Auswahl: gültiger Kalender ohne Termine; termine = 0', () => {
  for (const a of [{}, null, undefined]) {
    const d = I.icsHerunterladen(plan(), a, { jetzt: JETZT });
    assert.equal(d.termine, 0);
    assert.ok(d.text.startsWith('BEGIN:VCALENDAR\r\n') && d.text.endsWith('END:VCALENDAR\r\n'));
    assert.ok(d.text.includes('BEGIN:VTIMEZONE'), 'RFC 5545 verlangt mindestens eine Komponente');
  }
  assert.ok(I.ICS_TEXTE.leer.length > 10);
});

test('UIDs: Buchungs-ID@stundenplanner.de, eindeutig und über Exporte stabil', () => {
  const a = ereignisse(I.icsAusAuswahl(plan(), ALLES, { jetzt: JETZT })).map((e) => wert(e, 'UID'));
  const b = ereignisse(I.icsAusAuswahl(plan(), ALLES, { jetzt: new Date(Date.UTC(2026, 10, 1)) })).map((e) => wert(e, 'UID'));
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
  assert.ok(a.includes('1@stundenplanner.de') && a.includes('20@stundenplanner.de'));
  // Derselbe Termin in zwei Gruppen (sollte MOSES nicht liefern) steht nur einmal drin.
  const p = plan();
  p.modules[0].components[1].groups[1].bookings[0].id = '1';
  assert.equal(I.icsHerunterladen(p, ALLES).termine, 8);
});

test('Zeitzone: DTSTART/DTEND in Berliner Ortszeit mit TZID, VTIMEZONE mit EU-Regel, DTSTAMP in UTC', () => {
  const t = I.icsAusAuswahl(plan(), { '10001:100': { group: '11' } }, { jetzt: JETZT });
  const ev = ereignisse(t)[0];
  assert.ok(ev.includes('DTSTART;TZID=Europe/Berlin:20261012T100000'));
  assert.ok(ev.includes('DTEND;TZID=Europe/Berlin:20261012T120000'));
  assert.equal(wert(ev, 'DTSTAMP'), '20261005T063000Z');
  const z = zeilen(t);
  for (const muss of ['TZID:Europe/Berlin', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'DTSTART:19701025T030000']) {
    assert.ok(z.includes(muss), muss);
  }
  // Ein Termin nach der Umstellung (25.10.2026) bleibt Ortszeit: 10:00 ist 10:00, kein Versatz im Text.
  assert.ok(ereignisse(t).some((e) => e.includes('DTSTART;TZID=Europe/Berlin:20261102T100000')));
});

test('über Mitternacht: DTEND am Folgetag; kaputtes Ende ohne DTEND; unlesbarer Beginn fällt weg', () => {
  const p = plan();
  const g = p.modules[0].components[0].groups[0];
  g.bookings[0].start = '2026-10-16T22:00:00';
  g.bookings[0].end = '2026-10-17T01:30:00';
  g.bookings[1].end = g.bookings[1].start;          // Ende = Beginn
  g.bookings[2].start = '2026-10-26T10:00:00+01:00'; // nicht das Format des Lesemodells
  const evs = ereignisse(I.icsAusAuswahl(p, { '10001:100': { group: '11' } }, { jetzt: JETZT }));
  assert.equal(evs.length, 3);
  assert.equal(wert(evs[0], 'DTSTART'), '20261016T220000');
  assert.equal(wert(evs[0], 'DTEND'), '20261017T013000');
  assert.equal(wert(evs[1], 'DTEND'), undefined);
});

test('Inhalt: SUMMARY Modul · Art, LOCATION Raum, DESCRIPTION mit Titel, Gruppe, LV-Nummer, MOSES, Hinweis', () => {
  const p = plan();
  const b = p.modules[0].components[0].groups[0].bookings[0];
  b.format = '';
  b.note = 'Erster Termin online';
  const ev = ereignisse(I.icsAusAuswahl(p, { '10001:100': { group: '11' } }, { jetzt: JETZT }))[0];
  assert.equal(wert(ev, 'SUMMARY'), 'Mod A · Vorlesung', 'ohne Format der Buchung: Typ ausgeschrieben');
  assert.equal(wert(ev, 'LOCATION'), 'Hörsaal 1');
  const text = lies(wert(ev, 'DESCRIPTION'));
  for (const muss of ['Beispielmodul A', 'Vorlesung, Termingruppe 1', 'LV-Nummer 0000 L 000', 'Erster Termin online', 'MOSES: https://moseskonto.tu-berlin.de/', 'Kein offizielles Angebot der TU Berlin']) {
    assert.ok(text.includes(muss), muss);
  }
  assert.ok(wert(ev, 'URL').startsWith('https://moseskonto.tu-berlin.de/'));
  assert.equal(wert(ev, 'CATEGORIES'), 'Vorlesung');
  // Mit Format der Buchung zählt es (z. B. eine Klausur im Termin einer Vorlesung).
  const ev2 = ereignisse(I.icsAusAuswahl(plan(), { '10001:100': { group: '11' } }))[0];
  assert.equal(wert(ev2, 'SUMMARY'), 'Mod A · Übung');
});

test('Links nur zu MOSES und ISIS: eine fremde Adresse fällt auf die nächste sichere zurück', () => {
  const p = plan();
  p.modules[0].components[0].groups[0].url = 'https://boese.example/moses';
  const ev = ereignisse(I.icsAusAuswahl(p, { '10001:100': { group: '11' } }))[0];
  assert.ok(wert(ev, 'URL').startsWith('https://moseskonto.tu-berlin.de/moses/verzeichnis/veranstaltungen/veranstaltung.html'));
  assert.ok(!ereignisse(I.icsAusAuswahl(p, { '10001:100': { group: '11' } })).flat().join('\n').includes('boese'));
});

test('Escaping: Komma, Semikolon, Backslash und Zeilenumbrüche', () => {
  assert.equal(I.icsText('a,b;c\\d\ne\r\nf\rg'), 'a\\,b\\;c\\\\d\\ne\\nf\\ng');
  assert.equal(I.icsText('Tab\tund\u0007Glocke'), 'TabundGlocke');
  assert.equal(I.icsText(null), '');
  const p = plan();
  const b = p.modules[0].components[0].groups[0].bookings[0];
  b.room = 'Charlottenburg, H 0104; Audimax \\ Nord';
  b.info = 'Zeile eins\nZeile zwei, mit Komma';
  const ev = ereignisse(I.icsAusAuswahl(p, { '10001:100': { group: '11' } }))[0];
  assert.equal(wert(ev, 'LOCATION'), 'Charlottenburg\\, H 0104\\; Audimax \\\\ Nord');
  assert.equal(lies(wert(ev, 'LOCATION')), b.room);
  assert.ok(lies(wert(ev, 'DESCRIPTION')).includes('Zeile eins\nZeile zwei, mit Komma'));
});

test('Faltung: höchstens 75 Oktette je Zeile, nie mitten in einem Umlaut, entfaltet wie vorher', () => {
  const lang = 'DESCRIPTION:' + 'Übungsgruppe für Größenordnungen ÄÖÜ äöü ß '.repeat(8) + '😀 Ende';
  const f = I.falte(lang);
  const teile = f.split('\r\n');
  assert.ok(teile.length > 1);
  for (const [i, t] of teile.entries()) {
    const roh = Buffer.from(t, 'utf8');
    assert.ok(roh.length <= 75, `Zeile ${i}: ${roh.length} Oktette`);
    assert.equal(roh.toString('utf8'), t, 'ein Zeichen wurde geteilt');
    if (i) assert.equal(t[0], ' ');
  }
  assert.equal(f.replace(/\r\n /g, ''), lang);
  // Kurze Zeilen bleiben, wie sie sind.
  assert.equal(I.falte('SUMMARY:Mod A · Übung'), 'SUMMARY:Mod A · Übung');
  // Grenzfall: genau 75 Oktette werden nicht gefaltet, 76 schon.
  assert.equal(I.falte('X'.repeat(75)), 'X'.repeat(75));
  assert.equal(I.falte('X'.repeat(76)), 'X'.repeat(75) + '\r\n X');
  // Die ganze Datei: keine physische Zeile über 75 Oktette.
  const p = plan();
  p.modules[0].title = 'Größere Übungen zur Ökonomie der Äquivalenzklassen mit überlangen Titeln und Umlauten';
  const t = I.icsAusAuswahl(p, ALLES, { jetzt: JETZT });
  for (const z of t.split('\r\n')) assert.ok(Buffer.byteLength(z, 'utf8') <= 75, z);
});

test('nach bestand(): Rückverweise im Plan stören nicht', () => {
  const p = plan();
  A.bestand(p);
  assert.equal(I.icsHerunterladen(p, ALLES).termine, 9);
});

test('Datei: Blob text/calendar;charset=utf-8, Name stundenplan-<studiengang>-<semester>.ics', async () => {
  const d = I.icsHerunterladen(plan(), ALLES, { jetzt: JETZT });
  assert.equal(d.name, 'stundenplan-test-bsc-wise-2026-27.ics');
  assert.equal(d.blob.type, 'text/calendar;charset=utf-8');
  assert.equal(await d.blob.text(), d.text);
  assert.equal(I.dateiName({ studiengang: 'X Y/Z', semester: 'SoSe 2027' }), 'stundenplan-x-y-z-sose-2027.ics');
});

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0',
  ipadAlsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
};

test('Gerät aus dem User-Agent, und zu jedem Gerät ein Satz', () => {
  assert.equal(I.kalenderGeraet(UA.iphoneSafari, 5), 'ios');
  assert.equal(I.kalenderGeraet(UA.iphoneChrome, 5), 'iosAndere');
  assert.equal(I.kalenderGeraet(UA.iphoneInstagram, 5), 'iosAndere');
  assert.equal(I.kalenderGeraet(UA.ipadAlsMac, 5), 'ios', 'iPadOS meldet sich als Mac, hat aber Touch');
  assert.equal(I.kalenderGeraet(UA.ipadAlsMac, 0), 'mac');
  assert.equal(I.kalenderGeraet(UA.android, 5), 'android');
  assert.equal(I.kalenderGeraet(UA.windows, 0), 'windows');
  assert.equal(I.kalenderGeraet(UA.linux, 0), 'andere');
  assert.equal(I.kalenderGeraet(undefined), 'andere');
  for (const g of ['ios', 'iosAndere', 'android', 'mac', 'windows', 'andere', 'leer', 'abzug']) {
    assert.ok(typeof I.ICS_TEXTE[g] === 'string' && I.ICS_TEXTE[g].endsWith('.'), g);
  }
});

/** Ein document, das nur festhält, welcher Link geklickt wurde. */
function attrappe() {
  const geklickt = [];
  const dok = {
    body: { appendChild() {} },
    createElement() {
      return { remove() {}, click() { geklickt.push({ href: this.href, download: this.download, target: this.target }); } };
    },
  };
  return { dok, geklickt };
}

test('icsAnstossen: iPhone über data:, sonst über blob:, immer mit Dateinamen', () => {
  const d = I.icsHerunterladen(plan(), ALLES, { jetzt: JETZT });
  const a = attrappe();
  assert.equal(I.icsAnstossen(d, { dok: a.dok, ua: UA.iphoneSafari, beruehrung: 5 }), 'ios');
  assert.ok(a.geklickt[0].href.startsWith('data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR'));
  assert.equal(decodeURIComponent(a.geklickt[0].href.slice(a.geklickt[0].href.indexOf(',') + 1)), d.text);
  assert.equal(a.geklickt[0].download, 'stundenplan-test-bsc-wise-2026-27.ics');
  const b = attrappe();
  assert.equal(I.icsAnstossen(d, { dok: b.dok, ua: UA.android, beruehrung: 5 }), 'android');
  assert.ok(b.geklickt[0].href.startsWith('blob:'));
  assert.equal(b.geklickt[0].download, d.name);
});

test('alle Gruppen eines Bestandteils (`gruppen: alle`, V-0234): group als Liste liefert die Termine aller', () => {
  const p = plan();
  const c = p.modules[0].components.find((x) => x.id === '10001:200');
  const ids = c.groups.filter((g) => (g.bookings || []).length).map((g) => g.id);
  assert.ok(ids.length > 1);
  const einzeln = ids.map((id) => I.icsTermine(plan(), { '10001:200': { group: id } }).length);
  const alle = I.icsTermine(p, { '10001:200': { group: ids } });
  assert.equal(alle.length, einzeln.reduce((a, b) => a + b, 0));
  assert.deepEqual([...new Set(alle.map((t) => t.gruppe.id))], ids);
});
