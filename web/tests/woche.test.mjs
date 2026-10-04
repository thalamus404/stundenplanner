// Konflikte gegen echte Termine, Ansichtsfilter, Wochen und A/B — die Fälle des Vorbilds
// (SCOPE §7, Schritt 3): direkt anschließend, A/B versetzt, über Nacht, Jahreswechsel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../auswahl.mjs';
import * as W from '../woche.mjs';
import { plan } from './hilfe.mjs';

function geladen(auswahl = {}) {
  const p = plan();
  const b = A.bestand(p);
  const r = A.auswerten(p, b, auswahl);
  return { p, b, g: (key) => b.groups.find((x) => x.key === key), ...r };
}

const gruppe = (key, component_id, termine) => ({
  key, component_id, bookings: termine.map(([start, end], i) => ({ id: String(i), start, end, room: 'R' })),
});

test('Überschneidung: dieselbe Zeit an denselben Tagen ist ein Konflikt, mit allen gemeinsamen Tagen', () => {
  const { g } = geladen();
  const pairs = W.conflictPairs([g('10001:100:11'), g('10001:200:22')]);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].dates, ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
});

test('Direkt anschließend (12:00 Ende, 12:00 Beginn) ist kein Konflikt', () => {
  const { g } = geladen();
  assert.equal(W.overlap(g('10001:100:11'), g('10002:500:51')), false);
  assert.deepEqual(W.conflictPairs([g('10001:100:11'), g('10002:500:51')]), []);
});

test('A/B versetzt: dieselbe Wochenzeit, nur gemeinsame Daten zählen', () => {
  const { g } = geladen();
  // VL jeden Montag in vier Wochen, Tutorium 14-tägig ab der zweiten Woche.
  const pairs = W.conflictPairs([g('10001:100:11'), g('10002:500:52')]);
  assert.deepEqual(pairs[0].dates, ['2026-10-19', '2026-11-02']);
  // Zwei 14-tägige Gruppen in A- und B-Woche stören sich nie.
  const a = gruppe('a', 'x', [['2026-10-12T10:00:00', '2026-10-12T12:00:00'], ['2026-10-26T10:00:00', '2026-10-26T12:00:00']]);
  const b = gruppe('b', 'y', [['2026-10-19T10:00:00', '2026-10-19T12:00:00'], ['2026-11-02T10:00:00', '2026-11-02T12:00:00']]);
  assert.equal(W.overlap(a, b), false);
});

test('Über Nacht: ein Termin bis 02:00 kollidiert mit einem um 01:00 am Folgetag', () => {
  const { g } = geladen();
  const nacht = g('10002:500:53');
  const frueh = gruppe('f', 'z', [['2026-10-17T01:00:00', '2026-10-17T03:00:00']]);
  const vorher = gruppe('v', 'z', [['2026-10-16T20:00:00', '2026-10-16T22:00:00']]);
  assert.deepEqual(W.conflictPairs([nacht, frueh])[0].dates, ['2026-10-17']);
  assert.equal(W.overlap(nacht, vorher), false);
});

test('Jahreswechsel: Silvester bis 01:00 gegen Neujahr 00:30', () => {
  const a = gruppe('a', 'x', [['2026-12-31T23:00:00', '2027-01-01T01:00:00']]);
  const b = gruppe('b', 'y', [['2027-01-01T00:30:00', '2027-01-01T01:30:00']]);
  assert.deepEqual(W.conflictPairs([a, b])[0].dates, ['2027-01-01']);
});

test('Eine Gruppe kollidiert nicht mit sich selbst, kollidiert() zählt nur andere Bestandteile', () => {
  const { g } = geladen({ '10001:100': { group: '11', digest: '', name: '' } });
  assert.equal(W.overlap(g('10001:100:11'), g('10001:100:11')), false);
  const sel = [g('10001:100:11')];
  assert.equal(W.kollidiert(g('10001:200:22'), sel), true);   // anderer Bestandteil, gleiche Zeit
  assert.equal(W.kollidiert(g('10001:200:21'), sel), false);  // Dienstag
  assert.equal(W.kollidiert(g('10001:100:11'), sel), false);  // derselbe Bestandteil
});

test('Ansicht: alle, noch offen, mein Stundenplan; Modulfilter; Klick auf einen Bestandteil', () => {
  const r = geladen({ '10001:100': { group: '11', digest: '', name: '' } });
  const keys = (opts) => W.kandidaten(r.b.groups, opts).map((g) => g.key);
  assert.equal(keys({ view: 'all' }).length, 7);
  assert.deepEqual(keys({ view: 'selected' }), ['10001:100:11']);
  assert.deepEqual(keys({ view: 'open' }), ['10001:200:21', '10001:200:22', '10001:200:23', '10002:500:51', '10002:500:52', '10002:500:53']);
  assert.deepEqual(keys({ view: 'all', filter: '10002' }), ['10002:500:51', '10002:500:52', '10002:500:53']);
  assert.deepEqual(keys({ view: 'all', activePart: '10001:200' }), ['10001:200:21', '10001:200:22', '10001:200:23']);
  assert.deepEqual(keys({ view: 'open', filter: '10001' }), ['10001:200:21', '10001:200:22', '10001:200:23']);
});

test('Ansicht „noch offen“ zählt auch eine verschwundene Wahl als gewählt (wie im Vorbild)', () => {
  const r = geladen({ '10001:200': { group: '29', digest: '', name: 'weg' } });
  const offen = W.kandidaten(r.b.groups, { view: 'open' }).map((g) => g.component_id);
  assert.equal(offen.includes('10001:200'), false);
});

test('Wochen: Montage von der ersten bis zur letzten Buchung', () => {
  const { b } = geladen();
  assert.deepEqual(W.wochen(b.groups), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(W.wochen([]), []);
  // Beginnt das Semester an einem Mittwoch, beginnt die erste Woche am Montag davor.
  assert.deepEqual(W.wochen([gruppe('a', 'x', [['2026-10-14T10:00:00', '2026-10-14T12:00:00']])]), ['2026-10-12']);
  assert.deepEqual(W.wocheAus('skeleton'), null);
  assert.deepEqual(W.wocheAus('2026-10-26'), { start: '2026-10-26', end: '2026-11-01' });
});

test('A/B: Kalenderwochen ab dem Anker, auch vor ihm 0 oder 1 (wie in Python)', () => {
  const anker = '2026-10-12';
  assert.equal(W.paritaet('2026-10-12', anker), 0);
  assert.equal(W.paritaet('2026-10-18', anker), 0);
  assert.equal(W.paritaet('2026-10-19', anker), 1);
  assert.equal(W.paritaet('2026-10-26', anker), 0);
  assert.equal(W.paritaet('2026-10-05', anker), 1);   // Einführungswoche: -1 // 2 in Python ist 1
  assert.equal(W.paritaet('2026-09-28', anker), 0);
  assert.equal(W.paritaet('2027-01-04', anker), 0);   // über den Jahreswechsel (12 Wochen)
});

test('Paneele: 14-tägige Gruppe nur in der B-Woche; konkrete Woche filtert die Slots', () => {
  const { b, p } = geladen();
  const alle = W.kandidaten(b.groups, {});
  const inA = W.ereignisse(alle, null, 0).map((e) => e.g.key);
  const inB = W.ereignisse(alle, null, 1).map((e) => e.g.key);
  assert.equal(inA.includes('10002:500:52'), false);
  assert.equal(inB.includes('10002:500:52'), true);
  assert.equal(W.hatAB(p, b.groups), true);
  const woche = W.wocheAus('2026-10-26');
  const inWoche = W.ereignisse(alle, woche, null).map((e) => e.g.key);
  assert.equal(inWoche.includes('10002:500:52'), false);   // 14-tägig: nicht in dieser Woche
  assert.equal(inWoche.includes('10001:100:11'), true);
  assert.equal(inWoche.includes('10002:500:53'), false);   // Einzeltermin am 16./17.10.
});

test('Termine einer Karte: aus dem Slot, nach Woche und A/B gefiltert', () => {
  const { g, p } = geladen();
  const vl = g('10001:100:11');
  assert.equal(W.termineDerKarte(vl, vl.slots[0], null, null, p.anchor).length, 4);
  assert.deepEqual(W.termineDerKarte(vl, vl.slots[0], null, 1, p.anchor).map((t) => t.date), ['2026-10-19', '2026-11-02']);
  assert.deepEqual(W.termineDerKarte(vl, vl.slots[0], W.wocheAus('2026-10-26'), null, p.anchor).map((t) => t.date), ['2026-10-26']);
  // Ohne occurrences (älteres Lesemodell) aus den Buchungen.
  const ohne = { ...vl.slots[0], occurrences: undefined };
  assert.deepEqual(W.termineDerKarte(vl, ohne, null, null, p.anchor).map((t) => [t.date, t.start, t.end]),
    [['2026-10-12', '10:00', '12:00'], ['2026-10-19', '10:00', '12:00'], ['2026-10-26', '10:00', '12:00'], ['2026-11-02', '10:00', '12:00']]);
});

test('Zelle: Gewähltes zuerst, dann nach Modul', () => {
  const e = (short, selected) => ({ g: { module_short: short, selected } });
  const sortiert = [e('B', false), e('A', false), e('C', true)].sort(W.zellenOrdnung).map((x) => x.g.module_short);
  assert.deepEqual(sortiert, ['C', 'A', 'B']);
});

test('Bestandteile ohne Termine werden genannt', () => {
  const { b } = geladen();
  assert.deepEqual(W.ohneTermine(b.parts).map((c) => c.id), ['10001:200']);
});
