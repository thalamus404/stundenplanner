// /silas (V-0321): das Planungsmodell nach Leistungspunkten, der Kalender und der private Speicher.
// Alle Daten hier sind ERFUNDEN (ein Beispielmodul im Wintersemester 2030/31) — Silas' echtes Semester
// liegt nur im KV-Speicher, nie im Repo (AGENTS.md §2 ①, docs/SILAS.md §7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as M from '../silas/modell.mjs';
import * as K from '../silas/kalender.mjs';
import { silasApi } from '../../functions/silas/api/[[pfad]].js';

const SEM = {
  id: 'test', titel: 'WiSe 2030/31', vorlesung: { von: '2030-10-14', bis: '2031-02-15' },
  frei: [{ von: '2030-12-23', bis: '2031-01-04', titel: 'Vorlesungsfrei' }], ende: '2031-03-28',
};

function angebot() {
  return {
    semester: structuredClone(SEM),
    module: [{
      id: 'BSP', nr: 99999, titel: 'Beispielmodul', lp: 6, farbe: 1,
      posten: [
        { id: 'vl', lv: 'VL', titel: 'VL · Präsenzzeit', mult: 15, h: 2 },
        { id: 'vn', lv: 'VL', titel: 'Vor-/Nachbereitung', mult: 15, h: 2 },
        { id: 'ue', lv: 'UE', titel: 'Übung · Präsenzzeit', mult: 15, h: 2 },
        { id: 'pv', lv: null, titel: 'Prüfungsvorbereitung', mult: 1, h: 90 },
      ],
      teile: [
        { id: 'bsp-vl', titel: 'VL', art: 'praesenz', posten: 'vl', termine: { typ: 'serie', tag: 'Di', start: '10:15', ende: '11:45', von: '2030-10-15', bis: '2031-02-11', ort: 'X 1' } },
        { id: 'bsp-video', titel: 'Videos', art: 'video', posten: 'vn', soll_h: 10, einheiten: { liste: [{ nr: 1, ab: '2030-10-21' }, { nr: 2, ab: '2030-10-28' }], laenge_min: 105 } },
        { id: 'bsp-vn', titel: 'Nachbereitung', art: 'selbst', posten: 'vn' },
        { id: 'bsp-ue', titel: 'Übung', art: 'praesenz', posten: 'ue', optionen: [
          { id: 'g1', label: 'G1', termine: { typ: 'reihe', start: '14:15', ende: '15:45', ort: 'Y 2', daten: [{ datum: '2030-11-04' }, { datum: '2030-12-02' }, { datum: '2031-01-13' }] } },
          { id: 'g2', label: 'G2', termine: { typ: 'serie', tag: 'Mi', start: '08:15', ende: '09:45', von: '2030-10-16', bis: '2031-02-12' } },
        ] },
        { id: 'bsp-pv', titel: 'Klausurvorbereitung', art: 'pruefung', posten: 'pv', pruefung: 'bsp-klausur' },
      ],
      pruefungen: [{ id: 'bsp-klausur', titel: 'Klausur', dauer_min: 90, termine: [{ datum: '2031-03-03', start: '10:00', ende: '11:30' }] }],
    }],
    termine: [{ id: 'f1', modul: 'BSP', art: 'frist', datum: '2030-11-30', start: '23:59', titel: 'Anmeldung endet', wichtig: true }],
  };
}

// ── Zeit und Semester ────────────────────────────────────────────────────────────────────────────

test('Wochen: Vorlesungswochen zählen W01…, die Pause und die Prüfungszeit nicht', () => {
  const wo = M.wochen(SEM);
  assert.equal(wo[0].id, '2030-10-14');
  assert.equal(wo.filter((w) => w.art === 'frei').length, 2);
  assert.equal(wo.filter((w) => w.art === 'vorlesung').length, 16);
  assert.deepEqual(wo.filter((w) => w.art === 'pruefung').map((w) => w.kurz).slice(0, 2), ['P1', 'P2']);
  assert.equal(wo.at(-1).id, M.montagVon('2031-03-28'));
});

test('Eine Serie überspringt Ausnahmen und die vorlesungsfreie Zeit', () => {
  const t = M.termineAus({ typ: 'serie', tag: 'Mo', start: '10:15', ende: '11:45', von: '2030-10-14', bis: '2031-01-12', ausser: ['2030-11-04'] }, SEM);
  assert.ok(!t.some((x) => x.datum === '2030-11-04'));
  assert.ok(!t.some((x) => x.datum === '2030-12-23' || x.datum === '2030-12-30'));
  assert.ok(t.every((x) => M.wochentag(x.datum) === 0));
});

test('c.t.: 16:15–17:45 belegt die Doppelstunde (2 h), s.t. zählt die echte Dauer', () => {
  assert.equal(M.zaehltMin(M.min('16:15'), M.min('17:45')), 120);
  assert.equal(M.zaehltMin(M.min('16:00'), M.min('17:00')), 60);
  assert.equal(M.zaehltMin(M.min('16:15'), M.min('17:45'), false), 90);
});

test('Videoblock: Länge + Puffer, auf 30 min aufgerundet (Silas: 1:45 → 2 h)', () => {
  assert.equal(M.videoBlockMin(105), 120);
  assert.equal(M.videoBlockMin(90), 120);
  assert.equal(M.videoBlockMin(60), 90);
});

test('Zeitzone: Sommerzeit endet am letzten Oktobersonntag, beginnt am letzten Märzsonntag', () => {
  assert.equal(M.isoZeit('2030-10-26', 600), '2030-10-26T10:00:00+02:00');
  assert.equal(M.isoZeit('2030-10-28', 600), '2030-10-28T10:00:00+01:00');
  assert.equal(M.berlinVersatz('2031-03-30', 60), '+01:00');
  assert.equal(M.berlinVersatz('2031-03-30', 180), '+02:00');
});

// ── Die Rechnung ─────────────────────────────────────────────────────────────────────────────────

test('Soll: das Modul sind LP × 30 h, die Teile teilen sich die Posten', () => {
  const e = M.rechnen(angebot(), {});
  const r = e.module[0];
  assert.equal(r.soll_min, 6 * 30 * 60);
  assert.equal(r.posten_min, r.soll_min);
  assert.equal(e.teile.get('bsp-video').soll_min, 600);
  assert.equal(e.teile.get('bsp-vn').soll_min, 30 * 60 - 600); // der Rest des Postens
  assert.equal(r.teile.reduce((s, z) => s + z.soll_min, 0), r.soll_min);
});

test('Präsenz: jeder Termin zählt seine Doppelstunde', () => {
  const z = M.rechnen(angebot(), {}).teile.get('bsp-vl');
  assert.equal(z.vk.length, 16);
  assert.equal(z.ist_min, 16 * 120);
  assert.equal(z.status, 'ok');
});

test('Wahl: ohne Gruppen fehlt eine Angabe, ohne Wahl fehlt die Wahl, gewählt zählt die Gruppe', () => {
  const a = angebot();
  assert.ok(M.rechnen(a, {}).teile.get('bsp-ue').flags.some((f) => f.art === 'wahl_offen' && f.stufe === 'plan'));
  const g1 = M.rechnen(a, { wahl: { 'bsp-ue': 'g1' } }).teile.get('bsp-ue');
  assert.equal(g1.ist_min, 3 * 120);
  assert.ok(g1.strukturell, 'nur drei Termine: strukturelle Lücke');
  a.module[0].teile[3].optionen = [];
  a.module[0].teile[3].wahl = true;
  assert.ok(M.rechnen(a, {}).teile.get('bsp-ue').flags.some((f) => f.art === 'termine_offen' && f.stufe === 'info'));
});

test('Wochenblock: zählt in Vorlesungswochen, in der Pause nur mit pause: true', () => {
  const plan = { bloecke: [{ id: 'b1', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] };
  assert.equal(M.rechnen(angebot(), plan).teile.get('bsp-vn').ist_min, 16 * 120);
  plan.bloecke[0].pause = true;
  assert.equal(M.rechnen(angebot(), plan).teile.get('bsp-vn').ist_min, 18 * 120);
  plan.bloecke[0].ab = '2030-11-01'; // ein Freitag: die Donnerstage 17.10., 24.10. und 31.10. fallen weg
  assert.equal(M.rechnen(angebot(), plan).teile.get('bsp-vn').ist_min, (18 - 3) * 120);
});

test('Block auf einem Termin: der Block verliert die Überlappung, der Termin bleibt grün', () => {
  const e = M.rechnen(angebot(), { bloecke: [{ id: 'b1', teil: 'bsp-vn', datum: '2030-10-15', start: '10:00', ende: '12:00' }] });
  const vl = e.teile.get('bsp-vl'), vn = e.teile.get('bsp-vn');
  assert.equal(vn.ist_min, 120 - 90);
  assert.ok(vn.vk[0].flags.includes('weicht'));
  assert.ok(!vl.flags.some((f) => f.art === 'konflikt'));
});

test('Zwei Termine übereinander sind ein Konflikt für beide', () => {
  const a = angebot();
  a.module[0].teile[3].optionen[1].termine = { typ: 'serie', tag: 'Di', start: '10:15', ende: '11:45', von: '2030-10-15', bis: '2031-02-11' };
  const e = M.rechnen(a, { wahl: { 'bsp-ue': 'g2' } });
  assert.ok(e.teile.get('bsp-vl').flags.some((f) => f.art === 'konflikt'));
  assert.ok(e.teile.get('bsp-ue').flags.some((f) => f.art === 'konflikt'));
});

test('Video: ein Block zählt erst ab der Freigabe und nur, solange es Videos gibt', () => {
  const plan = { bloecke: [{ id: 'v', teil: 'bsp-video', tag: 'Mo', start: '09:00', ende: '11:00' }] };
  const z = M.rechnen(angebot(), plan).teile.get('bsp-video');
  const zaehlen = z.vk.filter((v) => v.zaehlt_min > 0);
  assert.deepEqual(zaehlen.map((v) => v.datum), ['2030-10-21', '2030-10-28']);
  assert.ok(z.vk.find((v) => v.datum === '2030-10-14').flags.includes('leer'));
  assert.equal(z.ist_min, 240);
});

test('Prüfungsvorbereitung zählt nur vor der Prüfung', () => {
  const plan = { bloecke: [
    { id: 'l1', teil: 'bsp-pv', datum: '2031-03-01', start: '09:00', ende: '15:00' },
    { id: 'l2', teil: 'bsp-pv', datum: '2031-03-03', start: '13:00', ende: '15:00' },
  ] };
  const z = M.rechnen(angebot(), plan).teile.get('bsp-pv');
  assert.equal(z.ist_min, 360);
  assert.ok(z.flags.some((f) => f.art === 'nach_pruefung'));
});

test('Umwidmung verschiebt Soll innerhalb des Moduls, die Summe bleibt', () => {
  const plan = { wahl: { 'bsp-ue': 'g1' }, umwidmungen: [{ id: 'u', von: 'bsp-ue', nach: 'bsp-pv', h: 24 }] };
  const e = M.rechnen(angebot(), plan);
  assert.equal(e.teile.get('bsp-ue').soll_min, 6 * 60);
  assert.equal(e.teile.get('bsp-pv').soll_min, (90 + 24) * 60);
  assert.equal(e.teile.get('bsp-ue').fehlt_min, 0);
  assert.equal(e.module[0].teile.reduce((s, z) => s + z.soll_min, 0), 180 * 60);
});

test('Ohne Prüfungstermin fehlt eine Angabe, und eine falsche Aufwandstabelle fällt auf', () => {
  const a = angebot();
  a.module[0].pruefungen[0].termine = [];
  a.module[0].posten[3].h = 80;
  const e = M.rechnen(a, {});
  assert.ok(e.teile.get('bsp-pv').flags.some((f) => f.art === 'datum_offen' && f.stufe === 'info'));
  assert.ok(e.module[0].flags.some((f) => f.art === 'posten_summe'));
});

test('Lernplan: rückwärts vor der Prüfung, Tag davor frei, sonntags nie, deckt die Lücke', () => {
  const e = M.rechnen(angebot(), {});
  const b = M.lernplanVorschlag(e, 'bsp-pv');
  const summe = b.reduce((s, x) => s + M.min(x.ende) - M.min(x.start), 0);
  assert.ok(summe >= 90 * 60);
  assert.ok(b.every((x) => x.datum < '2031-03-02'), 'der Tag vor der Prüfung bleibt frei');
  assert.ok(b.every((x) => M.wochentag(x.datum) !== 6), 'kein Sonntag');
  assert.ok(b.every((x) => M.min(x.ende) - M.min(x.start) <= 6 * 60));
});

test('Standardwoche: Serien und Wochenblöcke, eine Reihe mit Anzahl, Einzeltermine nicht', () => {
  const a = angebot();
  const plan = { wahl: { 'bsp-ue': 'g1' }, bloecke: [{ id: 'b1', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] };
  const k = M.standardwoche(a, plan, M.rechnen(a, plan));
  assert.ok(k.some((x) => x.teil === 'bsp-vl' && x.tag === 1 && !x.reihe));
  assert.ok(k.some((x) => x.teil === 'bsp-ue' && x.reihe && x.anzahl === 3));
  assert.ok(k.some((x) => x.block === 'b1' && x.modul === 'BSP'));
});

test('Ereignisse: eindeutige Ids, Schichten, Zeitzone je Datum', () => {
  const ev = M.ereignisse(angebot(), { wahl: { 'bsp-ue': 'g1' }, bloecke: [{ id: 'b1', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] });
  assert.equal(new Set(ev.map((e) => e.id)).size, ev.length);
  assert.deepEqual([...new Set(ev.map((e) => e.schicht))].sort(), ['A', 'B', 'C', 'D']);
  const vl = ev.filter((e) => e.teil === 'bsp-vl');
  assert.equal(vl[0].start, '2030-10-15T10:15:00+02:00');
  assert.equal(vl[2].start, '2030-10-29T10:15:00+01:00');
  assert.equal(vl[0].modulnummer, '99999');
  const frist = ev.find((e) => e.id === 'f1');
  assert.equal(frist.ganztag, true);
  assert.equal(frist.uhrzeit, '23:59');
});

test('pruefeAngebot: findet doppelte Ids und kaputte Muster', () => {
  const a = angebot();
  a.module[0].teile[1].id = 'bsp-vl';
  a.module[0].teile[0].termine.tag = 'Xx';
  const f = M.pruefeAngebot(a);
  assert.ok(f.some((x) => x.includes('doppelt')));
  assert.ok(f.some((x) => x.includes('Wochentag')));
  assert.deepEqual(M.pruefeAngebot(angebot()), []);
});

// ── Kalender ─────────────────────────────────────────────────────────────────────────────────────

test('ICS: zwei Kalender getrennt nach Schicht, Zeitzone, gefaltete Zeilen mit CRLF', () => {
  const ev = M.ereignisse(angebot(), { wahl: { 'bsp-ue': 'g1' }, bloecke: [{ id: 'b1', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] });
  const termine = K.ics(ev, { kalender: 'termine', jetzt: new Date('2030-10-01T00:00:00Z') });
  const lernen = K.ics(ev, { kalender: 'lernen', jetzt: new Date('2030-10-01T00:00:00Z') });
  assert.match(termine, /X-WR-CALNAME:TU · Termine\r\n/);
  assert.match(termine, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Berlin/);
  assert.match(termine, /DTSTART;TZID=Europe\/Berlin:20301015T101500/);
  assert.ok(!lernen.includes('bsp-vl@'));
  assert.equal((lernen.match(/BEGIN:VEVENT/g) || []).length, 16);
  for (const z of termine.split('\r\n')) assert.ok(new TextEncoder().encode(z).length <= 75, z);
  assert.equal(K.falten('x'.repeat(80)).split('\r\n ')[0].length, 75);
});

// ── Der private Speicher (functions/silas/api) ───────────────────────────────────────────────────

const SCHLUESSEL = 'testschluessel-nur-fuer-diese-datei-0123456789abcdef';
function env() {
  const kv = new Map();
  return {
    SILAS_SCHLUESSEL: createHash('sha256').update(SCHLUESSEL).digest('hex'),
    SILAS: {
      get: async (k) => kv.get(k) ?? null,
      put: async (k, v) => { kv.set(k, v); },
      list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
    },
  };
}
const anfrage = (weg, { methode = 'GET', schluessel = SCHLUESSEL, body } = {}) => new Request(`https://www.stundenplanner.de/silas/api/${weg}`, {
  method: methode, body: body ? JSON.stringify(body) : undefined,
  headers: schluessel ? { authorization: `Bearer ${schluessel}` } : {},
});

test('API: ohne oder mit falschem Schlüssel 401, ohne Einrichtung 503', async () => {
  const e = env();
  assert.equal((await silasApi(anfrage('stand', { schluessel: null }), e)).status, 401);
  assert.equal((await silasApi(anfrage('stand', { schluessel: 'x'.repeat(40) }), e)).status, 401);
  assert.equal((await silasApi(anfrage('stand'), {})).status, 503);
});

test('API: speichern, lesen, Konflikt bei veralteter Basis, Sicherung je Stunde', async () => {
  const e = env();
  assert.equal((await silasApi(anfrage('stand'), e)).status, 404);
  const r1 = await silasApi(anfrage('stand', { methode: 'PUT', body: { basis: null, angebot: angebot(), plan: {} } }), e, new Date('2030-10-01T10:00:00Z'));
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).version, 1);
  const alt = await silasApi(anfrage('stand', { methode: 'PUT', body: { basis: null, angebot: angebot(), plan: {} } }), e);
  assert.equal(alt.status, 409);
  const r2 = await silasApi(anfrage('stand', { methode: 'PUT', body: { basis: 1, angebot: angebot(), plan: { wahl: { 'bsp-ue': 'g1' } } } }), e, new Date('2030-10-01T10:30:00Z'));
  assert.equal((await r2.json()).version, 2);
  const s = await (await silasApi(anfrage('stand'), e)).json();
  assert.deepEqual(s.plan, { wahl: { 'bsp-ue': 'g1' } });
  const v = await (await silasApi(anfrage('verlauf'), e)).json();
  assert.deepEqual(v.verlauf, ['2030100110']);
});

test('API: ein kaputtes Angebot wird abgelehnt, nicht gespeichert', async () => {
  const e = env();
  const a = angebot(); a.module[0].teile[0].termine.tag = 'Xx';
  const r = await silasApi(anfrage('stand', { methode: 'PUT', body: { basis: null, angebot: a, plan: {} } }), e);
  assert.equal(r.status, 422);
  assert.equal((await silasApi(anfrage('stand'), e)).status, 404);
});

test('API: Ereignisse für das Study OS und das Kalender-Abo (Schlüssel in der Adresse nur dort)', async () => {
  const e = env();
  await silasApi(anfrage('stand', { methode: 'PUT', body: { basis: null, angebot: angebot(), plan: {} } }), e);
  const ev = await (await silasApi(anfrage('ereignisse'), e)).json();
  assert.ok(ev.ereignisse.length > 10);
  const abo = await silasApi(new Request(`https://www.stundenplanner.de/silas/api/kalender/termine.ics?k=${SCHLUESSEL}`), e);
  assert.equal(abo.status, 200);
  assert.match(abo.headers.get('content-type'), /text\/calendar/);
  assert.equal((await silasApi(new Request(`https://www.stundenplanner.de/silas/api/stand?k=${SCHLUESSEL}`), e)).status, 401);
  assert.equal((await silasApi(new Request(`https://www.stundenplanner.de/silas/api/kalender/fremd.ics?k=${SCHLUESSEL}`), e)).status, 404);
});

// ── Was nicht ins Repo darf, und was gleich bleiben muss ─────────────────────────────────────────

test('web/silas enthält nur Werkzeug, keine Daten (Silas’ Semester liegt nur im KV)', () => {
  const dateien = readdirSync(new URL('../silas/', import.meta.url));
  assert.deepEqual(dateien.filter((d) => !/\.(html|css|mjs)$/.test(d)), []);
});

test('silas.css trägt dieselben Farb-Tokens wie stil.css (hell und dunkel)', () => {
  const lies = (d) => readFileSync(new URL(`../${d}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = (css) => Object.fromEntries([...css.matchAll(/(--(?:grau|m\d|konflikt|hinweis|lg)[\w-]*)\s*:\s*([^;]+);/g)].map((t) => [t[1], t[2].trim()]));
  const teile = (css) => { const i = css.indexOf('@media (prefers-color-scheme: dark)'); return [css.slice(0, i), css.slice(i, css.indexOf('\n}\n', i))]; };
  const [hellS, dunkelS] = teile(lies('stil.css')).map(tokens);
  const [hellX, dunkelX] = teile(lies('silas/silas.css')).map(tokens);
  for (const [k, v] of Object.entries(hellS)) assert.equal(hellX[k], v, `hell ${k}`);
  for (const [k, v] of Object.entries(dunkelS)) assert.equal(dunkelX[k], v, `dunkel ${k}`);
});
