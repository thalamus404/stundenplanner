// Wahlpflicht auf der Seite (wahl.mjs, V-0227): welche Module aktiv sind, was nachzuladen ist,
// wie der gezeichnete Plan aussieht. Erfundene Daten im Format des Lesemodells (bauen.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as WP from '../wahl.mjs';
import * as A from '../auswahl.mjs';

const pflichtModul = { number: '90001', short: 'Pflicht A', components: [{ id: '90001:1', type: 'VL', groups: [{ id: '11', slots: [] }] }] };
const modul = (nr) => ({ number: nr, short: 'aus Datei', title: 'Modul ' + nr, components: [{ id: `${nr}:5`, type: 'SEM', groups: [{ id: '51', slots: [] }] }] });

function vollplan() {
  return {
    studiengang: { id: 'test-bsc', name: 'Testlehre' }, semester: 'ws-2030-31', fachsemester: 5,
    modules: [pflichtModul],
    wahlpflicht: [
      { id: 'inf', kurz: 'WP Inf', lp_min: 12, lp_max: 21, angebot: [
        { number: '90010', title: 'Zehn', short: 'Zehn', lp: 6, unterbereich: 'Seminare', datei: 'module/ws-2030-31/90010.json', groups: 2, tage: [0, 2] },
        { number: '90011', title: 'Elf', short: 'Elf', lp: 9, unterbereich: 'Projekte', datei: 'module/ws-2030-31/90011.json', groups: 1, tage: [] },
        { number: '90001', title: 'Pflicht A', short: 'Pflicht A', lp: 6, datei: 'module/ws-2030-31/90001.json', groups: 1, tage: [1] } ] },
      { id: 'wiwi', kurz: 'WP WiWi', lp_min: 12, lp_max: null, angebot: [
        { number: '90011', title: 'Elf', short: 'Elf', lp: 9, datei: 'module/ws-2030-31/90011.json', groups: 1, tage: [] },
        { number: '90020', title: 'Zwanzig', short: 'Zwanzig', lp: 6, datei: 'module/ws-2030-31/90020.json', groups: 3, tage: [4] } ] },
    ],
  };
}

test('modulVon: die Modulnummer steht vor dem ersten Doppelpunkt der Bestandteil-Kennung', () => {
  assert.equal(WP.modulVon('90010:12345'), '90010');
});

test('angebot: jedes Modul einmal, mit allen Bereichen, in denen es steht', () => {
  const a = WP.angebot(vollplan());
  assert.deepEqual([...a.keys()], ['90010', '90011', '90001', '90020']);
  assert.deepEqual(a.get('90011').bereiche, ['inf', 'wiwi']);
});

test('aktiv: aus der Auswahl und den dazugenommenen, nie ein Pflichtmodul, nie etwas außerhalb des Angebots', () => {
  const p = vollplan();
  const aktiv = WP.aktiv(p, ['90010:5', '90001:1', '77777:1'], ['90020', '88888']);
  assert.deepEqual([...aktiv].sort(), ['90010', '90020']);
  assert.equal(WP.aktiv({ modules: [] }, ['90010:5']).size, 0, 'ein Plan ohne Wahlpflicht hat keine aktiven');
});

test('fehlendeDateien: nur aktive, nur ungeladene', () => {
  const p = vollplan();
  const geladen = new Map([['90010', modul('90010')]]);
  assert.deepEqual(WP.fehlendeDateien(p, new Set(['90010', '90020']), geladen), [{ nummer: '90020', datei: 'module/ws-2030-31/90020.json' }]);
});

test('sicht: Pflicht zuerst, dahinter geladene aktive Module mit Kurzname des Angebots und Bereichen', () => {
  const p = vollplan();
  const geladen = new Map([['90011', modul('90011')], ['90020', modul('90020')]]);
  const s = WP.sicht(p, geladen, new Set(['90011', '90020', '90010']));
  assert.deepEqual(s.modules.map((m) => m.number), ['90001', '90011', '90020'], '90010 ist aktiv, aber nicht geladen');
  assert.deepEqual(s.modules[1].wahl, ['WP Inf', 'WP WiWi']);
  assert.equal(s.modules[1].short, 'Elf');
  assert.equal(p.modules.length, 1, 'der volle Plan bleibt unverändert');
  // Die Seite rechnet damit wie mit jedem Plan: Bestandteile der Wahlmodule sind wählbar.
  assert.deepEqual(A.bestand(s).parts.map((c) => c.id), ['90001:1', '90011:5', '90020:5']);
});

test('sicht ohne Wahlpflicht oder ohne aktive: derselbe Plan', () => {
  const p = vollplan();
  assert.deepEqual(WP.sicht(p, new Map(), new Set()).modules, p.modules);
  const ohne = { modules: [pflichtModul] };
  assert.deepEqual(WP.sicht(ohne, new Map(), new Set(['90010'])).modules, [pflichtModul]);
});

test('lpStand: Summe der aktiven gegen die Grenzen des Bereichs', () => {
  const [inf, wiwi] = vollplan().wahlpflicht;
  assert.deepEqual(WP.lpStand(inf, new Set(['90010', '90011'])), { lp: 15, min: 12, max: 21, ueber: false });
  assert.deepEqual(WP.lpStand(inf, new Set(['90010', '90011', '90001'])).ueber, false);
  assert.deepEqual(WP.lpStand(wiwi, new Set(['90011', '90020'])), { lp: 15, min: 12, max: null, ueber: false });
  assert.equal(WP.lpStand({ lp_max: 6, angebot: [{ number: '1', lp: 9 }] }, new Set(['1'])).ueber, true);
});

test('sortiert: aktive zuerst, dann Unterbereich, dann Titel', () => {
  const [inf] = vollplan().wahlpflicht;
  assert.deepEqual(WP.sortiert(inf, new Set(['90011'])).map((e) => e.number), ['90011', '90001', '90010']);
});

test('lageText: Wochentage und Zahl der Gruppen', () => {
  assert.equal(WP.lageText({ tage: [0, 2], groups: 2 }), 'Mo, Mi · 2 Gruppen');
  assert.equal(WP.lageText({ tage: [], groups: 1 }), 'ohne Wochentag · 1 Gruppe');
});
