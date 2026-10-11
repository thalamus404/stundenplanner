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
  assert.ok(M.rechnen(a, {}).teile.get('bsp-ue').flags.some((f) => f.art === 'wahl_offen' && f.stufe === 'dran'));
  const g1 = M.rechnen(a, { wahl: { 'bsp-ue': 'g1' } }).teile.get('bsp-ue');
  assert.equal(g1.ist_min, 3 * 120);
  assert.ok(g1.strukturell, 'nur drei Termine: strukturelle Lücke');
  a.module[0].teile[3].optionen = [];
  a.module[0].teile[3].wahl = true;
  assert.ok(M.rechnen(a, {}).teile.get('bsp-ue').flags.some((f) => f.art === 'termine_offen' && f.stufe === 'kommt'));
});

test('Wochenblock: zählt in Vorlesungswochen, in der Pause nur mit pause: true', () => {
  const plan = { bloecke: [{ id: 'b1', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] };
  assert.equal(M.rechnen(angebot(), plan).teile.get('bsp-vn').ist_min, 16 * 120);
  plan.bloecke[0].pause = true;
  assert.equal(M.rechnen(angebot(), plan).teile.get('bsp-vn').ist_min, 18 * 120);
  plan.bloecke[0].ab = '2030-11-01'; // ein Freitag: die Donnerstage 17.10., 24.10. und 31.10. fallen weg
  assert.equal(M.rechnen(angebot(), plan).teile.get('bsp-vn').ist_min, (18 - 3) * 120);
});

test('Block auf einem Termin: gesperrt — der Block verliert die Überlappung, der Termin bleibt grün', () => {
  const e = M.rechnen(angebot(), { bloecke: [{ id: 'b1', teil: 'bsp-vn', datum: '2030-10-15', start: '10:00', ende: '12:00' }] });
  const vl = e.teile.get('bsp-vl'), vn = e.teile.get('bsp-vn');
  assert.equal(vn.ist_min, 120 - 90);
  assert.ok(vn.vk[0].flags.includes('gesperrt'));
  assert.ok(!vl.flags.some((f) => f.art === 'konflikt'));
  // Ein Datumsblock auf einem Termin muss weg: „du bist dran“, mit dem Namen dessen, was ihn sperrt.
  const f = vn.flags.find((x) => x.art === 'gesperrt');
  assert.equal(f.stufe, 'dran');
  assert.match(f.text, /BSP · VL/);
});

test('Gesperrt: ein Wochenblock, der nur an einzelnen Tagen auf einen Termin trifft, ist ein Hinweis; jede Woche ist „verschieben“', () => {
  // G1 findet an drei Montagen statt: Ein Montagsblock darauf trifft drei Tage → dauernd. Zwei Tage → Hinweis.
  const a = angebot();
  a.module[0].teile[3].optionen[0].termine.daten.pop();
  const e = M.rechnen(a, { wahl: { 'bsp-ue': 'g1' }, bloecke: [{ id: 'b1', teil: 'bsp-vn', tag: 'Mo', start: '14:00', ende: '16:00' }] });
  const f = e.teile.get('bsp-vn').flags.find((x) => x.art === 'gesperrt');
  assert.equal(f.stufe, 'info');
  assert.match(f.text, /fällt am 04\.11\., 02\.12\. teilweise weg/);
  const e2 = M.rechnen(angebot(), { bloecke: [{ id: 'b2', teil: null, tag: 'Di', start: '10:00', ende: '11:00', titel: 'Puffer' }] });
  assert.equal(e2.planFlags.length, 1, 'ein Puffer ohne Teil meldet sich am Plan');
  assert.equal(e2.planFlags[0].stufe, 'dran');
  assert.ok(e2.summe.zaehler.dran >= 1);
  assert.ok(M.luecken(e2).some((x) => x.art === 'gesperrt' && x.modul === null));
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
  assert.ok(e.teile.get('bsp-pv').flags.some((f) => f.art === 'datum_offen' && f.stufe === 'kommt'));
  assert.ok(e.module[0].flags.some((f) => f.art === 'posten_summe'));
});

// ── Die vier Schritte (V-0333) ───────────────────────────────────────────────────────────────────

test('Schritte: feste Präsenz 1, Gruppen 2, Videos 3, Selbststudium 4, Prüfungsvorbereitung 5 — Blöcke folgen ihrem Teil', () => {
  const a = angebot();
  const t = Object.fromEntries(a.module[0].teile.map((x) => [x.id, M.schrittVon(x)]));
  assert.deepEqual(t, { 'bsp-vl': 1, 'bsp-video': 3, 'bsp-vn': 4, 'bsp-ue': 2, 'bsp-pv': M.PRUEFUNGEN });
  // Präsenz ohne Termine und ohne Gruppen (die Gruppen kommen noch) gehört zu den Gruppen.
  assert.equal(M.schrittVon({ id: 'x', art: 'praesenz' }), 2);
  assert.equal(M.schrittVonBlock(null), 4);
  const e = M.rechnen(a, { wahl: { 'bsp-ue': 'g2' }, bloecke: [{ id: 'v', teil: 'bsp-video', tag: 'Mo', start: '09:00', ende: '11:00' }] });
  const s = M.schritte(e);
  assert.deepEqual(s.map((x) => x.titel), ['Grundlage', 'Gruppen', 'Videos', 'EVL', 'Prüfungen']);
  assert.equal(s.reduce((n, x) => n + x.soll_min, 0), 180 * 60, 'jeder Teil in genau einem Schritt');
  assert.ok(e.vorkommen.filter((v) => v.quelle === 'termin' && v.teil === 'bsp-ue').every((v) => v.schritt === 2 && v.hart));
  assert.ok(e.vorkommen.filter((v) => v.block === 'v').every((v) => v.schritt === 3));
  assert.ok(e.vorkommen.filter((v) => v.quelle === 'frist').every((v) => v.schritt === 1 && !v.hart));
  // Prüfungen sind nicht im Ablauf (V-0334): die Klausur, ihre Anmeldung und ihre Vorbereitung gehören zu Schritt 5.
  assert.ok(e.vorkommen.filter((v) => v.quelle === 'pruefung').every((v) => v.schritt === M.PRUEFUNGEN && v.hart));
  assert.equal(M.schrittVonBlock(a.module[0].teile.find((x) => x.id === 'bsp-pv')), M.PRUEFUNGEN);
  // Anmeldungen: die einer Gruppe gehört zu Schritt 2, die einer Prüfung zu den Prüfungen.
  const b = angebot();
  b.module[0].teile[3].anmeldung = { von: '2030-10-14', bis: '2030-10-16', wo: 'MOSES' };
  b.module[0].pruefungen[0].anmeldung = { von: '2030-11-01', bis: '2030-11-20', wo: 'MOSES' };
  const fr = M.rechnen(b, {}).vorkommen.filter((v) => v.quelle === 'frist' && /anmeldung/.test(v.id));
  assert.deepEqual(fr.map((v) => [v.id, v.schritt]), [['bsp-ue-anmeldung-von', 2], ['bsp-ue-anmeldung-bis', 2], ['bsp-klausur-anmeldung-von', M.PRUEFUNGEN], ['bsp-klausur-anmeldung-bis', M.PRUEFUNGEN]]);
  assert.equal(s[3].offen, s[3].zaehler.kritisch + s[3].zaehler.dran);
});

test('Zurücksetzen: ab 2 fallen Gruppen und alle Blöcke heraus, ab 3 nur Blöcke, ab 4 nur Lernblöcke — Prüfungen bleiben', () => {
  const a = angebot();
  const plan = {
    wahl: { 'bsp-ue': 'g1' }, pruefungstermin: { 'bsp-klausur': '2031-03-03' }, angemeldet: { 'bsp-klausur': true },
    bestaetigt: { 'soll:bsp-video': true }, umwidmungen: [{ id: 'u', von: 'bsp-ue', nach: 'bsp-pv', h: 2 }],
    festgelegt: '2030-10-20T10:00:00.000Z',
    bloecke: [{ id: 'v', teil: 'bsp-video', tag: 'Mo', start: '09:00', ende: '11:00' }, { id: 'n', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }, { id: 'p', teil: null, tag: 'Fr', start: '08:00', ende: '08:30' },
      { id: 'l', teil: 'bsp-pv', datum: '2031-02-20', start: '09:00', ende: '15:00' }],
  };
  const r2 = M.zuruecksetzen(plan, a, 2, { am: '2030-10-21T08:00:00.000Z' });
  assert.equal(r2.wahl, undefined);
  assert.deepEqual(r2.pruefungstermin, plan.pruefungstermin, 'die Prüfungswahl gehört nicht zum Ablauf');
  assert.deepEqual(r2.bloecke.map((b) => b.id), ['l'], 'die Lerntage vor der Prüfung bleiben');
  assert.equal(r2.festgelegt, undefined, 'zurückgesetzt ist der Plan wieder in Arbeit');
  // Nichts wird gelöscht: Was herausfällt, liegt beiseite und kommt mit wiederherstellen() zurück.
  assert.deepEqual(r2.zurueckgesetzt.wahl, plan.wahl);
  assert.deepEqual(r2.zurueckgesetzt.bloecke.map((b) => b.id), ['v', 'n', 'p']);
  const zurueck = M.wiederherstellen(r2);
  assert.deepEqual(zurueck.wahl, plan.wahl);
  assert.deepEqual(zurueck.bloecke.map((b) => b.id).sort(), ['l', 'n', 'p', 'v']);
  assert.equal(zurueck.zurueckgesetzt, undefined);
  // Ein zweites Zurücksetzen legt dazu, statt zu überschreiben; Wiederherstellen überschreibt keine neue Wahl.
  const zweimal = M.zuruecksetzen({ ...r2, wahl: { 'bsp-ue': 'g2' } }, a, 2);
  assert.deepEqual(zweimal.zurueckgesetzt.wahl, { 'bsp-ue': 'g2' });
  assert.equal(zweimal.zurueckgesetzt.bloecke.length, 3);
  assert.deepEqual(M.wiederherstellen({ ...r2, wahl: { 'bsp-ue': 'g2' } }).wahl, { 'bsp-ue': 'g2' });
  assert.deepEqual(r2.angemeldet, plan.angemeldet, 'was Silas weiß, bleibt');
  assert.deepEqual(r2.bestaetigt, plan.bestaetigt);
  assert.deepEqual(r2.umwidmungen, plan.umwidmungen);
  const r3 = M.zuruecksetzen(plan, a, 3);
  assert.deepEqual(r3.wahl, plan.wahl);
  assert.deepEqual(r3.bloecke.map((b) => b.id), ['l']);
  assert.deepEqual(M.zuruecksetzen(plan, a, 4).bloecke.map((b) => b.id), ['v', 'l']);
  assert.equal(plan.bloecke.length, 4, 'der alte Plan bleibt unverändert (Rückgängig)');
  // Nach dem Zurücksetzen steht die Grundlage: alle festen Termine, nichts aus den Schritten 2–4.
  const e = M.rechnen(a, r2);
  assert.ok(e.vorkommen.every((v) => v.schritt === 1 || v.schritt === M.PRUEFUNGEN));
  assert.equal(e.teile.get('bsp-vl').vk.length, 16);
});

test('Gesperrt beim Planen: Wochenblock auf einer Serie oder gewählten Gruppe nein, an einem Tag nur auf dessen Termine', () => {
  const a = angebot();
  const plan = { wahl: { 'bsp-ue': 'g2' } };
  const e = M.rechnen(a, plan);
  const m = M.min;
  assert.deepEqual(M.gesperrtDurch(a, plan, e, { tag: 1, start: m('09:00'), ende: m('10:30'), woechentlich: true }), ['BSP · VL']);
  assert.deepEqual(M.gesperrtDurch(a, plan, e, { tag: 2, start: m('08:00'), ende: m('09:00'), woechentlich: true }), ['BSP · Übung'], 'gewählte Gruppe ist gesperrt');
  assert.deepEqual(M.gesperrtDurch(a, plan, e, { tag: 1, start: m('12:00'), ende: m('14:00'), woechentlich: true }), []);
  assert.deepEqual(M.gesperrtDurch(a, {}, M.rechnen(a, {}), { tag: 2, start: m('08:00'), ende: m('09:00'), woechentlich: true }), [], 'ungewählte Gruppen sperren nichts');
  // Ein Datum: die Klausur sperrt ihren Tag, eine Frist (ganztägig) nichts.
  assert.deepEqual(M.gesperrtDurch(a, plan, e, { tag: 0, datum: '2031-03-03', start: m('09:00'), ende: m('10:30'), woechentlich: false }), ['BSP · Klausur']);
  assert.deepEqual(M.gesperrtDurch(a, plan, e, { tag: 5, datum: '2030-11-30', start: m('09:00'), ende: m('23:59'), woechentlich: false }), []);
});

test('Wiederholungen: je Eintrag das wievielte, wie viele insgesamt und wie viele ab ihm noch kommen', () => {
  const plan = { wahl: { 'bsp-ue': 'g1' }, bloecke: [{ id: 'b1', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] };
  const e = M.rechnen(angebot(), plan);
  const vl = e.vorkommen.filter((v) => v.teil === 'bsp-vl');
  assert.deepEqual([vl[0].nr, vl[0].gesamt, vl[0].rest], [1, 16, 16]);
  assert.deepEqual([vl[15].nr, vl[15].rest], [16, 1]);
  const ue = e.vorkommen.filter((v) => v.teil === 'bsp-ue');
  assert.deepEqual(ue.map((v) => v.rest), [3, 2, 1]);
  assert.ok(e.vorkommen.filter((v) => v.block === 'b1').every((v) => v.gesamt === 16));
  const k = e.vorkommen.find((v) => v.quelle === 'pruefung');
  assert.deepEqual([k.gesamt, k.rest], [1, 1], 'die Klausur wiederholt sich nicht');
});

test('Seite: Kinder werden nur über fuellen() ersetzt — replaceChildren(null) schriebe „null“ als Text', () => {
  const seite = readFileSync(new URL('../silas/silas.mjs', import.meta.url), 'utf8');
  assert.equal((seite.match(/\.replaceChildren\(/g) || []).length, 1, 'replaceChildren nur in fuellen()');
});

test('Seite: kein inneres const/let mit dem Namen eines Helfers der obersten Ebene (fertig, schritt …)', () => {
  // V-0334: Ein „const fertig = () => …“ im Zeiger-Handler verdeckte fertig() — jeder Zeigerdruck im Raster brach mit
  // „Cannot access 'fertig' before initialization“ ab, Silas konnte auf keinem Gerät mehr Blöcke legen.
  const seite = readFileSync(new URL('../silas/silas.mjs', import.meta.url), 'utf8');
  const oben = new Set([...seite.matchAll(/^(?:const|let|function|async function) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  const innen = [...seite.matchAll(/^[ \t]+(?:const|let) ([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]).filter((n) => oben.has(n));
  assert.deepEqual([...new Set(innen)], [], `verdeckt: ${innen.join(', ')}`);
});

test('Vorgabe je Woche: Video so lang wie Soll ÷ Videowochen, höchstens der Videobedarf; EVL 1,5–2 h, k je Woche oder alle n Wochen', () => {
  const e = M.rechnen(angebot(), {});
  const v = M.vorgabe(e, 'bsp-video');
  // Zwei Videos à 105 min ab W02 (je Woche 2 h mit Puffer = 4 h Bedarf) — das Soll 10 h ist mehr als die Videos
  // brauchen; die Vorgabe deckt den Bedarf in den 15 Wochen ab der ersten Freigabe: 4 h ÷ 15 → 30 min.
  assert.deepEqual([v.anzahl, v.alle, v.wochen, v.dauer_min], [1, 1, 15, 30]);
  assert.equal(v.video_min, 240);
  // 20 h Nachbereitung in 16 Vorlesungswochen: am nächsten liegt 1,5 h jede Woche, eine Woche vor Schluss endend
  // (15 × 1,5 h = 22,5 h); 2 h alle zwei Wochen (16 h) läge weiter weg.
  const n = M.vorgabe(e, 'bsp-vn');
  assert.deepEqual([n.dauer_min, n.anzahl, n.alle, n.wochen, n.summe_min], [90, 1, 1, 15, 15 * 90]);
  const vl = e.wochen.filter((w) => w.art === 'vorlesung');
  assert.equal(n.bis, vl[14].bis, 'endet mit der 15. Vorlesungswoche');
  // 30 h: 2 h jede Woche, 15 Wochen — genau das Soll (V-0336: vorher 16 × 2 h = 32 h).
  const a = angebot(); a.module[0].teile[1].soll_h = 0; // die Videos geben ihren Anteil ab: Nachbereitung 30 h
  const n30 = M.vorgabe(M.rechnen(a, {}), 'bsp-vn');
  assert.deepEqual([n30.dauer_min, n30.anzahl, n30.alle, n30.wochen, n30.summe_min], [120, 1, 1, 15, 30 * 60]);
  const mitBis = M.rechnen(a, { bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00', bis: n30.bis }] });
  assert.equal(mitBis.teile.get('bsp-vn').ist_min, 30 * 60, 'der gelegte Block trägt genau das Soll');
  assert.equal(M.vorgabe(e, 'bsp-vl'), null, 'Präsenz hat keine Vorgabe');
  assert.equal(M.vorgabe(e, 'bsp-pv'), null, 'die Prüfungsvorbereitung kommt nach dem Festlegen');
});

test('Wochenblock alle n Wochen: liegt in jeder n-ten Vorlesungswoche, versatz verschiebt', () => {
  const plan = { bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00', alle: 2 }] };
  const tage = M.rechnen(angebot(), plan).vorkommen.filter((v) => v.block === 'b').map((v) => v.datum);
  assert.equal(tage.length, 8);
  assert.equal(tage[0], '2030-10-17');
  assert.equal(tage[1], '2030-10-31');
  plan.bloecke[0].versatz = 1;
  assert.equal(M.rechnen(angebot(), plan).vorkommen.find((v) => v.block === 'b').datum, '2030-10-24');
});

test('Freie Fenster: wo ein Block der Länge passt, ohne etwas zu überdecken', () => {
  const m = M.min;
  assert.deepEqual(M.freieFenster([[m('10:00'), m('12:00')], [m('14:00'), m('15:00')]], 120, m('08:00'), m('20:00')),
    [[m('08:00'), m('10:00')], [m('12:00'), m('14:00')], [m('15:00'), m('20:00')]]);
  assert.deepEqual(M.freieFenster([[m('09:00'), m('10:30')]], 120, m('08:00'), m('12:00')), []);
});

test('Prüfungsarten für die Zeitleiste: Klausur, E-Test, Online- und schriftliche Tests', () => {
  assert.equal(M.pruefungsArt({ id: 'x-klausur', titel: 'Präsenzklausur (80 P)' }), 'klausur');
  assert.equal(M.pruefungsArt({ id: 'x-etest1', titel: 'E-Test 1 (10 P, 20 min)' }), 'etest');
  assert.equal(M.pruefungsArt({ id: 'x-test', titel: 'Online-Test (20 P)' }), 'test', '„Online-Test“ ist kein E-Test');
  assert.equal(M.pruefungsArt({ id: 'x-test', titel: 'Schriftlicher Test (80 P, 60 min)' }), 'test');
  assert.equal(M.pruefungsArt({ id: 'x', titel: 'Portfolio', art: 'klausur' }), 'klausur', 'art im Angebot gilt');
});

test('Prüfungsvorbereitung in der Vorlesungszeit: Wochenblock am Samstag bis zum Tag vor der Prüfung zählt', () => {
  const plan = { bloecke: [{ id: 'p', teil: 'bsp-pv', tag: 'Sa', start: '09:00', ende: '12:00', bis: '2031-03-02' }] };
  const z = M.rechnen(angebot(), plan).teile.get('bsp-pv');
  assert.equal(z.vk.length, 16, 'jede Vorlesungswoche einmal');
  assert.equal(z.ist_min, 16 * 180);
  assert.equal(M.wochentag(z.vk[0].datum), 5);
});

test('Keine Vorschläge mehr: der Lernplan-Vorschlag ist aus Modell und Seite entfernt', () => {
  assert.equal(M.lernplanVorschlag, undefined);
  const seite = readFileSync(new URL('../silas/silas.mjs', import.meta.url), 'utf8');
  assert.ok(!/lernplanVorschlag|Lernplan vorschlagen|data-act': 'lernplan'/.test(seite));
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

// ── V-0328: Videos je Woche, Fenster, Fristen, Prüfungswahl, Phasen, Annahmen ───────────────────

test('Videos: Länge je Video, eine Woche braucht die Summe plus Puffer; ein Block deckt die früheste offene Woche', () => {
  const a = angebot();
  a.module[0].teile[1].einheiten = { liste: [
    { nr: 1, ab: '2030-10-21', laenge_min: 40 }, { nr: 2, ab: '2030-10-21', laenge_min: 40 }, // Woche 2: 80 + 15 → 2 h
    { nr: 3, ab: '2030-10-28', laenge_min: 21 }, // Woche 3: 21 + 15 → 1 h
  ] };
  const plan = { bloecke: [{ id: 'v', teil: 'bsp-video', tag: 'Mo', start: '09:00', ende: '10:30' }] }; // 1,5 h je Woche
  const z = M.rechnen(a, plan).teile.get('bsp-video');
  assert.deepEqual(z.gruppen.map((g) => g.bedarf_min), [120, 60]);
  // 21.10. 1,5 h < 2 h → die Woche bleibt offen, der Block am 28.10. füllt sie auf; der 04.11. deckt Woche 3.
  assert.deepEqual(z.vk.filter((v) => v.zaehlt_min > 0).map((v) => v.datum), ['2030-10-21', '2030-10-28', '2030-11-04']);
  assert.ok(!z.flags.some((f) => f.art === 'laenge_offen'));
  a.module[0].teile[1].einheiten.liste[2].laenge_min = null;
  assert.ok(M.rechnen(a, plan).teile.get('bsp-video').flags.some((f) => f.art === 'laenge_offen' && /1 von 3/.test(f.text)));
});

test('Abgaben ohne Dauer: ein Fenster — jeder Block zählt, solange eine Einheit offen ist', () => {
  const a = angebot();
  a.module[0].teile[2].einheiten = { liste: [{ nr: 1, ab: '2030-10-21', bis: '2030-11-01' }, { nr: 2, ab: '2030-11-02' }] };
  const plan = { bloecke: [{ id: 'l1', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }, { id: 'l2', teil: 'bsp-vn', tag: 'Fr', start: '09:00', ende: '11:00' }] };
  const e = M.rechnen(a, plan);
  const z = e.teile.get('bsp-vn');
  assert.ok(z.vk.filter((v) => v.datum < '2030-10-21').every((v) => v.flags.includes('leer')), 'vor der ersten Freigabe zählt nichts');
  assert.ok(z.vk.filter((v) => v.datum >= '2030-10-21').every((v) => v.zaehlt_min > 0), 'zwei Blöcke je Woche zählen beide');
  assert.ok(e.vorkommen.some((v) => v.quelle === 'frist' && v.datum === '2030-11-01' && /fällig/.test(v.titel)));
});

test('Einheiten ohne Datum: jeder Block zählt, die Lücke ist rot', () => {
  const a = angebot();
  a.module[0].teile[2].einheiten = { anzahl: 12 };
  const z = M.rechnen(a, { bloecke: [{ id: 'l', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] }).teile.get('bsp-vn');
  assert.equal(z.ist_min, 16 * 120);
  assert.ok(z.flags.some((f) => f.art === 'freigabe_offen' && f.stufe === 'kommt'));
});

test('Anmeldungen werden Fristen — an Prüfungen, einzelnen Prüfungsterminen und Gruppen', () => {
  const a = angebot();
  a.module[0].pruefungen[0].anmeldung = { von: '2030-10-19', von_zeit: '18:00', bis: '2030-11-30', bis_zeit: '23:59', wo: 'MTS (über MOSES)' };
  a.module[0].teile[3].anmeldung = { bis: '2030-10-16', wo: 'MOSES' };
  const f = M.rechnen(a, {}).vorkommen.filter((v) => v.quelle === 'frist');
  const bis = f.find((v) => v.id === 'bsp-klausur-anmeldung-bis');
  assert.equal(bis.punkt, M.min('23:59'));
  assert.ok(bis.wichtig);
  assert.match(bis.titel, /Anmeldung endet \(MTS\)$/);
  assert.ok(f.some((v) => v.id === 'bsp-ue-anmeldung-bis' && v.teil === 'bsp-ue'));
});

test('Prüfungswahl: der gewählte Termin bindet die Vorbereitung, bei echter Wahl verschwindet der andere', () => {
  const a = angebot();
  a.module[0].pruefungen[0].wahl = true;
  a.module[0].pruefungen[0].termine.push({ datum: '2031-03-10', start: '10:00', ende: '11:30', wichtig: false });
  const ohne = M.rechnen(a, {});
  assert.ok(ohne.module[0].flags.some((f) => f.art === 'pruefung_wahl'));
  assert.equal(ohne.teile.get('bsp-pv').pruefungstermin.datum, '2031-03-03');
  const mit = M.rechnen(a, { pruefungstermin: { 'bsp-klausur': '2031-03-10' } });
  assert.equal(mit.teile.get('bsp-pv').pruefungstermin.datum, '2031-03-10');
  assert.deepEqual(mit.vorkommen.filter((v) => v.quelle === 'pruefung').map((v) => v.datum), ['2031-03-10']);
});

test('Prüfungen überschneiden sich: am Modul, orange sobald Termine bekannt sind', () => {
  const a = angebot();
  a.module[0].pruefungen.push({ id: 'bsp-b', titel: 'Zweite', termine: [{ datum: '2031-03-03', start: '11:00', ende: '12:00' }] });
  assert.ok(M.rechnen(a, {}).module[0].flags.some((f) => f.art === 'pruefung_konflikt' && f.stufe === 'achtung'));
});

test('Bilanz: eingeplant − zu viel = gedeckt', () => {
  const e = M.rechnen(angebot(), { wahl: { 'bsp-ue': 'g2' }, bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '08:00', ende: '12:00' }] });
  assert.equal(e.summe.ist_min - e.summe.ueber_min, e.summe.gedeckt_min);
  assert.ok(e.summe.ueber_min > 0);
});

test('Phasen: Vorlesungszeit, Pause, vorlesungsfreie Zeit', () => {
  const ps = M.phasen(SEM);
  assert.deepEqual(ps.map((p) => p.id), ['vorlesung', 'pause', 'frei']);
  assert.equal(ps[2].von, '2031-02-16');
  assert.equal(M.phaseVon(SEM, '2030-12-28').id, 'pause');
  assert.equal(M.phaseVon(SEM, '2031-03-01').id, 'frei');
});

test('Annahmen an einem Ort: Regeln, Aufteilungen, Videolängen; eine bestätigte Annahme ist nicht mehr gelb', () => {
  const a = angebot();
  a.module[0].teile[1].annahme = '10 h für Videos, weil …';
  const e = M.rechnen(a, {});
  const liste = M.annahmen(a, e);
  assert.ok(liste.some((x) => x.id === 'regel:lp_h' && x.fest));
  assert.ok(liste.some((x) => x.id === 'soll:bsp-video' && x.feld === 'soll_h' && x.wert === 10));
  assert.ok(e.teile.get('bsp-video').flags.some((f) => f.art === 'annahme'));
  assert.ok(!M.rechnen(a, { bestaetigt: { 'soll:bsp-video': true } }).teile.get('bsp-video').flags.some((f) => f.art === 'annahme'));
  assert.ok(M.luecken(e).every((f, i, l) => i === 0 || M.STUFEN.indexOf(l[i - 1].stufe) <= M.STUFEN.indexOf(f.stufe)));
});

test('Serie mit Angaben je Tag und Posten, den die Teile nicht ganz tragen', () => {
  const a = angebot();
  a.module[0].teile[0].termine.tage = { '2030-10-22': { titel: 'Übung statt VL' } };
  a.module[0].teile[2].soll_h = 10; // Video 10 + Nachbereitung 10 = 20 von 30 h
  const e = M.rechnen(a, {});
  assert.equal(e.teile.get('bsp-vl').vk.find((v) => v.datum === '2030-10-22').titel, 'Übung statt VL');
  assert.ok(e.module[0].flags.some((f) => f.art === 'posten_teile'));
});

// ── V-0332: Stufen nach Datum, Phase und Stand der Prüfung; Wochenbedarf ───────────────────────

test('Stufen: Prüfungsthemen grau ohne Termin, orange mit Termin, rot sobald die Anmeldung läuft; Raum fehlt bleibt orange', () => {
  const a = angebot();
  const p = a.module[0].pruefungen[0];
  p.offen = 'Bestehensgrenze kommt in der 1. VL';
  p.termine[0].offen = 'Raum steht noch nicht fest';
  p.anmeldung = { von: '2030-11-01', bis: '2030-11-30', wo: 'MOSES' };
  const stufe = (heute, art) => M.rechnen(a, {}, { heute }).module[0].flags.filter((f) => f.art === art).map((f) => f.stufe);
  assert.deepEqual(stufe('2030-10-20', 'pruefung_offen'), ['achtung', 'achtung']); // Termin bekannt
  assert.deepEqual(stufe('2030-11-05', 'pruefung_offen'), ['kritisch', 'achtung']); // Anmeldung läuft, Raum bleibt orange
  assert.deepEqual(stufe('2030-10-20', 'anmelden'), ['info']);
  assert.deepEqual(stufe('2030-11-05', 'anmelden'), ['kritisch']);
  assert.deepEqual(M.rechnen(a, { angemeldet: { 'bsp-klausur': true } }, { heute: '2030-11-05' }).module[0].flags.filter((f) => f.art === 'anmelden'), []);
  p.termine = [];
  delete p.anmeldung;
  assert.deepEqual(stufe('2030-10-20', 'pruefung_offen'), ['kommt']); // kein Termin: grau
});

test('Stufen: Prüfungsvorbereitung erst ab der vorlesungsfreien Zeit kritisch, vorher „später“', () => {
  const a = angebot();
  const st = (heute) => M.rechnen(a, {}, { heute }).teile.get('bsp-pv').flags.find((f) => f.art === 'ungeplant').stufe;
  assert.equal(st('2030-12-01'), 'spaeter');
  assert.equal(st('2031-02-16'), 'kritisch');
  a.module[0].pruefungen[0].termine[0].datum = '2030-12-15'; // Prüfung in der Vorlesungszeit: drei Wochen vorher
  assert.equal(st('2030-11-20'), 'spaeter');
  assert.equal(st('2030-11-25'), 'kritisch');
});

test('Stufen: selbst zu Planendes ist „du bist dran“, ausstehende Termine „kommt noch“, ±2 h werden nicht gemeldet', () => {
  const a = angebot();
  a.module[0].teile[3].optionen = []; a.module[0].teile[3].wahl = true;
  const e = M.rechnen(a, { bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '10:15' }] }, { heute: '2030-10-20' });
  assert.equal(e.teile.get('bsp-ue').stufe, 'kommt');
  assert.ok(!e.teile.get('bsp-vn').flags.some((f) => f.art === 'luecke'), '20 h Soll, 16 × 1:15 = 20 h');
  const e2 = M.rechnen(a, {}, { heute: '2030-10-20' });
  assert.equal(e2.teile.get('bsp-vn').flags.find((f) => f.art === 'ungeplant').stufe, 'dran');
});

test('Gruppenanmeldung: „du bist dran“, in der letzten Woche kritisch; Ausweichtermine verdrängen nichts', () => {
  const a = angebot();
  a.module[0].teile[3].anmeldung = { von: '2030-10-01', bis: '2030-10-20', wo: 'MOSES' };
  const st = (heute) => M.rechnen(a, {}, { heute }).teile.get('bsp-ue').flags.find((f) => f.art === 'anmelden').stufe;
  assert.equal(st('2030-10-05'), 'dran');
  assert.equal(st('2030-10-15'), 'kritisch');
  a.module[0].pruefungen[0].termine.push({ datum: '2030-10-15', start: '10:00', ende: '11:00', wichtig: false });
  const e = M.rechnen(a, {});
  assert.ok(!e.teile.get('bsp-vl').flags.some((f) => f.art === 'konflikt'), 'Zweittermin auf der VL ist kein Konflikt');
});

test('Wochenbedarf: was dran wäre, was eingeplant ist, was fehlt — und warum', () => {
  const a = angebot();
  a.module[0].teile[3].optionen = []; a.module[0].teile[3].wahl = true;
  const plan = { bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '10:00' }] };
  const e = M.rechnen(a, plan);
  const std = Object.fromEntries(M.wochenBedarf(a, plan, e).map((b) => [b.z.teil.id, b]));
  assert.equal(std['bsp-vl'].grund, 'ok');
  assert.equal(std['bsp-ue'].grund, 'kommt');
  assert.equal(std['bsp-ue'].offen_min, Math.round((30 * 60) / 16)); // der Posten auf 16 Vorlesungswochen
  assert.equal(std['bsp-vn'].grund, 'planen');
  assert.ok(!('bsp-pv' in std), 'Prüfungsvorbereitung gehört in die vorlesungsfreie Zeit');
  const w = Object.fromEntries(M.wochenBedarf(a, plan, e, '2030-10-21').map((b) => [b.z.teil.id, b]));
  assert.equal(w['bsp-video'].soll_min, M.videoBlockMin(105)); // Video 1 erscheint in dieser Woche
  assert.equal(w['bsp-vl'].ist_min, 120);
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
