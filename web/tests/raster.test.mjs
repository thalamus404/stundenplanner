// Das Raster des One-Pagers: Zeitachse, Spuren paralleler Gruppen, was sichtbar ist (DESIGN §3.2, §4.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../auswahl.mjs';
import * as R from '../raster.mjs';
import { plan } from './hilfe.mjs';

function geladen(auswahl = {}) {
  const p = plan();
  const b = A.bestand(p);
  A.auswerten(p, b, auswahl);
  return b;
}

const e = (start, end, extra = {}) => ({ start: R.minuten(start), end: R.minuten(end), gewaehlt: 0, modul: 0, name: '', ...extra });

test('Minuten: auch 24:00 für einen Termin bis Mitternacht', () => {
  assert.equal(R.minuten('08:00'), 480);
  assert.equal(R.minuten('15:30'), 930);
  assert.equal(R.minuten('24:00'), 1440);
});

test('Zeitachse aus allen Gruppen, auf volle Stunden; ohne Termine 08–18', () => {
  const b = geladen();
  // Fixture: 10:00 bis 24:00 und ein Nachttermin 00:00–02:00 am Samstag.
  assert.deepEqual(R.achse(b.groups), { von: 0, bis: 24 });
  assert.deepEqual(R.achse([{ slots: [{ start: '08:15', end: '09:45' }, { start: '15:30', end: '17:30' }] }]), { von: 8, bis: 18 });
  assert.deepEqual(R.achse([]), { von: 8, bis: 18 });
});

test('Tagesspalten: Mo–Fr immer, Sa/So nur mit Daten', () => {
  assert.equal(R.tagesZahl([{ slots: [{ day: 1 }] }]), 5);
  assert.equal(R.tagesZahl(geladen().groups), 6);   // der Nachttermin reicht in den Samstag
});

test('Spuren: Überschneidende teilen sich die Breite, direkt anschließende nicht', () => {
  const l = R.spuren([e('10:00', '12:00'), e('10:00', '12:00'), e('12:00', '14:00')]);
  assert.deepEqual(l.map((x) => [x.spur, x.spuren]), [[0, 2], [1, 2], [0, 1]]);
});

test('Spuren: ein verketteter Block (14–16, 15:30–17:30, 16–18) braucht zwei Spuren, alle teilen sie', () => {
  const l = R.spuren([e('14:00', '16:00'), e('15:30', '17:30'), e('16:00', '18:00')]);
  assert.deepEqual(l.map((x) => x.spur), [0, 1, 0]);
  assert.deepEqual(l.map((x) => x.spuren), [2, 2, 2]);
});

test('Spuren: Reihenfolge — gewählte zuerst, dann Beginn, Modul, Gruppenname mit Zahlen als Zahlen', () => {
  const l = [e('10:00', '12:00', { name: 'Termingruppe 10' }), e('10:00', '12:00', { name: 'Termingruppe 9' }),
    e('11:00', '13:00', { gewaehlt: 1, name: 'x' }), e('08:00', '12:00', { modul: 1, name: 'a' })];
  l.sort(R.ordnung);
  assert.deepEqual(l.map((x) => x.name), ['x', 'a', 'Termingruppe 9', 'Termingruppe 10']);
  assert.deepEqual(R.spuren(l).map((x) => x.spur), [0, 1, 2, 3]);
});

test('Dichteste Stelle des Plans und die Breite, ab der die Woche passt', () => {
  const g = (day, start, end) => ({ slots: [{ day, start, end }] });
  const gruppen = [g(4, '14:00', '16:00'), g(4, '14:00', '16:00'), g(4, '15:30', '17:30'), g(4, '16:00', '18:00'), g(0, '08:00', '10:00')];
  assert.equal(R.dichteste(gruppen), 3);
  assert.equal(R.dichteste([]), 1);
  // Fünf Spuren an fünf Tagen passen in 768 px (WI 1. FS, DESIGN §3.4), sechs an sechs Tagen nicht.
  assert.ok(R.wochenBreite(5, 5) <= 768);
  assert.ok(R.wochenBreite(6, 6) > 768);
});

test('Sichtbar ohne Filter („Mein Stundenplan“, V-0237): nur Eingeplantes und Vorschläge', () => {
  let b = geladen({ '10001:200': { group: '21', digest: '', name: '' } });
  assert.deepEqual(R.sichtbar(b.groups, {}).map((x) => [x.g.key, x.art]), [['10001:100:11', 'vorschlag'], ['10001:200:21', 'gewaehlt']]);
  b = geladen({ '10001:100': { group: '11', digest: '', name: '' } });
  assert.deepEqual(R.sichtbar(b.groups, {}).map((x) => [x.g.key, x.art]), [['10001:100:11', 'gewaehlt']]);
});

test('Sichtbar mit Filter: Mein Stundenplan außerhalb (auch Vorschläge) wird Kontext, ein Vorschlag im Filter bleibt Vorschlag', () => {
  const b = geladen({ '10002:500': { group: '51', digest: '', name: '' } });
  assert.deepEqual(R.sichtbar(b.groups, { modul: '10002', teil: '10002:500' }).map((x) => [x.g.key, x.art]), [
    ['10001:100:11', 'kontext'], ['10002:500:51', 'gewaehlt'], ['10002:500:52', 'moeglich'], ['10002:500:53', 'moeglich']]);
  assert.equal(R.sichtbar(b.groups, { modul: '10001' }).find((x) => x.g.key === '10001:100:11').art, 'vorschlag');
});

test('Sichtbar mit Filter: ein Format zeigt alle seine Gruppen, Gewähltes außerhalb ist Kontext', () => {
  const b = geladen({ '10001:100': { group: '11', digest: '', name: '' }, '10002:500': { group: '51', digest: '', name: '' } });
  const s = R.sichtbar(b.groups, { modul: '10002', teil: '10002:500' });
  assert.deepEqual(s.map((x) => [x.g.key, x.art]), [
    ['10001:100:11', 'kontext'], ['10002:500:51', 'gewaehlt'], ['10002:500:52', 'moeglich'], ['10002:500:53', 'moeglich']]);
});

test('Sichtbar mit Modulfilter: ALLE Gruppen des Moduls, auch die eines schon gewählten Formats (Silas, V-0225)', () => {
  const b = geladen({ '10001:100': { group: '11', digest: '', name: '' }, '10002:500': { group: '51', digest: '', name: '' } });
  const m = R.sichtbar(b.groups, { modul: '10001' });
  assert.deepEqual(m.map((x) => [x.g.key, x.art]), [
    ['10001:100:11', 'gewaehlt'], ['10001:200:21', 'moeglich'], ['10001:200:22', 'moeglich'], ['10001:200:23', 'moeglich'],
    ['10002:500:51', 'kontext']]);
  // Ohne Filter steht nur Mein Stundenplan: vom Format nur die gewählte Gruppe.
  assert.equal(R.sichtbar(b.groups, {}).filter((x) => x.g.component_id === '10002:500').length, 1);
});

test('Navigation: Modul, Format darin, nochmals tippen hebt auf, was man zuletzt gesetzt hat', () => {
  const leer = { ...R.KEIN_FILTER };
  // Modul an, Modul aus
  const m = R.tippeModul(leer, '10001');
  assert.deepEqual(m, { modul: '10001', teil: '', ueber: false });
  assert.deepEqual(R.tippeModul(m, '10001'), leer);
  // ein anderes Modul ersetzt das erste
  assert.deepEqual(R.tippeModul(m, '10002'), { modul: '10002', teil: '', ueber: false });
  // über das Modul ins Format: nochmals tippen führt zurück aufs Modul
  const f = R.tippeFormat(m, '10001:200', '10001');
  assert.deepEqual(f, { modul: '10001', teil: '10001:200', ueber: true });
  assert.deepEqual(R.tippeFormat(f, '10001:200', '10001'), m);
  // ein Nachbarformat im selben Modul behält den Weg übers Modul
  assert.deepEqual(R.tippeFormat(f, '10001:100', '10001'), { modul: '10001', teil: '10001:100', ueber: true });
  // direkt aufs Format: nochmals tippen, und der Filter ist ganz weg
  const d = R.tippeFormat(leer, '10002:500', '10002');
  assert.deepEqual(d, { modul: '10002', teil: '10002:500', ueber: false });
  assert.deepEqual(R.tippeFormat(d, '10002:500', '10002'), leer);
  // ein Format eines anderen Moduls: nicht „über“ dessen Modul gekommen
  assert.equal(R.tippeFormat(f, '10002:500', '10002').ueber, false);
  // der Modulname hebt auch einen Formatfilter darin auf
  assert.deepEqual(R.tippeModul(f, '10001'), leer);
  // Esc: eine Stufe zurück
  assert.deepEqual(R.stufeZurueck(f), m);
  assert.deepEqual(R.stufeZurueck(d), leer);
  assert.deepEqual(R.stufeZurueck(m), leer);
});

test('Legende: jedes Format einmal, in der Reihenfolge des ersten Auftretens, ausgeschrieben', () => {
  const b = geladen();
  assert.deepEqual(R.legende(b.parts), [
    { kurz: 'VL', lang: 'Vorlesung' }, { kurz: 'UE', lang: 'Übung' }, { kurz: 'TUT', lang: 'Tutorium' }]);
  assert.deepEqual(R.legende([{ type: 'IV' }, { type: 'SE' }, { type: 'IV' }, { type: '' }]), [
    { kurz: 'IV', lang: 'Integrierte Veranstaltung' }, { kurz: 'SE', lang: 'SE' }]);
  assert.deepEqual(R.legende([]), []);
});

test('Gruppennummer, Typ ausgeschrieben, Rhythmus nur wenn nicht wöchentlich', () => {
  assert.equal(R.gruppenNummer('Termingruppe 12'), '12');
  assert.equal(R.gruppenNummer('1. Termingruppe'), '1');
  assert.equal(R.gruppenNummer('Termingruppe 2 Keiper'), '2');
  assert.equal(R.gruppenNummer('Gruppe 3'), '3');
  // Eine Zahl im Namen ist nicht die Gruppennummer: Hier ist es der Raum (querwind, 16a7b0e5).
  assert.equal(R.gruppenNummer('AnaLinA Space im E-N 004, Mo. 8-10 Uhr'), null);
  assert.equal(R.gruppenNummer('Gruppe'), null);
  assert.equal(R.gruppenNummer('Freitagsgruppe'), null);
  assert.equal(R.typLang('TUT'), 'Tutorium');
  assert.equal(R.typLang('SE'), 'SE');
  assert.equal(R.rhythmusHinweis({ rhythm: 'wöchentlich mit Ausnahmen' }), '');
  assert.equal(R.rhythmusHinweis({ rhythm: '4 Einzeltermine' }), '4 Einzeltermine');
  assert.equal(R.rhythmusHinweis({ rhythm: '14-tägig', fortnightly: true, parity: [1] }), 'B-Woche');
});

test('Tagansicht: heute zuerst, am Wochenende Montag', () => {
  assert.equal(R.startTag(new Date('2026-10-14T12:00:00')), 2);   // Mittwoch
  assert.equal(R.startTag(new Date('2026-10-17T12:00:00')), 0);   // Samstag
});

test('Ein offenes Angebot (`gruppen: keine`, V-0234) steht nicht unter „Noch offen“, aber mit Filter', () => {
  const p = plan();
  for (const c of p.modules[0].components) if (c.id === '10001:200') c.gruppen = 'keine';
  const b = A.bestand(p);
  A.auswerten(p, b, {});
  assert.ok(!R.sichtbar(b.groups, {}).some((e) => e.g.component_id === '10001:200'));
  assert.ok(R.sichtbar(b.groups, { modul: '10001' }).some((e) => e.g.component_id === '10001:200' && e.art === 'moeglich'));
  const moeglich = R.sichtbar(b.groups, { modul: '10001', teil: '10001:200' }).filter((e) => e.art === 'moeglich');
  assert.equal(moeglich.length, 3);
  assert.ok(moeglich.every((e) => e.g.component_id === '10001:200'));
});

// ── Verlauf der Ansichten (V-0245): Pfeil links/rechts wie Zurück/Vor im Browser ──
test('Verlauf: Vorlesung, Übung, zurück, vor; Neues hinter einem Schritt zurück schneidet ab', () => {
  let v = R.verlaufNeu();
  const vl = { modul: '10001', teil: '10001:vl', ueber: false };
  const ue = { modul: '10001', teil: '10001:ue', ueber: false };
  v = R.verlaufMerken(v, vl);
  v = R.verlaufMerken(v, ue);
  assert.equal(v.liste.length, 3);
  let s = R.verlaufSchritt(v, -1);
  assert.equal(s.filter.teil, '10001:vl');
  s = R.verlaufSchritt(s.v, 1);
  assert.equal(s.filter.teil, '10001:ue');
  assert.equal(R.verlaufSchritt(s.v, 1), null, 'vorne ist Schluss');
  // zweimal zurück: „Mein Stundenplan“; dann ein anderes Modul: Vorlesung und Übung fallen weg
  s = R.verlaufSchritt(R.verlaufSchritt(s.v, -1).v, -1);
  assert.deepEqual([s.filter.modul, s.filter.teil], ['', '']);
  assert.equal(R.verlaufSchritt(s.v, -1), null, 'hinten ist Schluss');
  v = R.verlaufMerken(s.v, { modul: '10002', teil: '', ueber: false });
  assert.deepEqual(v.liste.map((x) => x.teil || x.modul || '-'), ['-', '10002']);
});

test('Verlauf: dieselbe Ansicht zählt nicht doppelt, höchstens 50 Einträge, nur der Filter wird gemerkt', () => {
  let v = R.verlaufNeu();
  v = R.verlaufMerken(v, { modul: '', teil: '', ueber: false, zeitraum: 'x', fokus: 'y' });
  assert.equal(v.liste.length, 1);
  for (let i = 0; i < 80; i++) v = R.verlaufMerken(v, { modul: String(i), teil: '' });
  assert.equal(v.liste.length, 50);
  assert.equal(v.i, 49);
  assert.deepEqual(Object.keys(v.liste[0]).sort(), ['modul', 'teil', 'ueber']);
});

test('Pfeiltasten-Tipp (V-0246): nach 90 s, mit zwei Ansichten, nur mit Tastatur, nur einmal, nie nach Benutzung', () => {
  const lage = { seit: R.TIPP_NACH_MS, schritte: 2, gezeigt: false, benutzt: false, tastatur: true, frei: true };
  assert.equal(R.tippFaellig(lage), true);
  assert.equal(R.tippFaellig({ ...lage, seit: R.TIPP_NACH_MS - 1 }), false, 'zu früh');
  assert.equal(R.tippFaellig({ ...lage, schritte: 1 }), false, '← täte noch nichts');
  assert.equal(R.tippFaellig({ ...lage, gezeigt: true }), false, 'nur einmal');
  assert.equal(R.tippFaellig({ ...lage, benutzt: true }), false, 'schon benutzt');
  assert.equal(R.tippFaellig({ ...lage, tastatur: false }), false, 'Touch ohne Tastatur');
  assert.equal(R.tippFaellig({ ...lage, frei: false }), false, 'eine Karte ist offen');
});
