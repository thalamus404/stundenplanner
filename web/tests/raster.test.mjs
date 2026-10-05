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

test('Sichtbar ohne Filter („Noch offen“): Formate ohne Wahl möglich, Gewähltes bleibt sichtbar', () => {
  const b = geladen({ '10001:100': { group: '11', digest: '', name: '' } });
  const s = R.sichtbar(b.groups, {});
  assert.deepEqual(s.filter((x) => x.art === 'gewaehlt').map((x) => x.g.key), ['10001:100:11']);
  assert.equal(s.filter((x) => x.art === 'moeglich').length, 6);
  assert.equal(s.filter((x) => x.art === 'kontext').length, 0);
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
  // Ohne Filter verschwinden die übrigen Gruppen eines gewählten Formats („Noch offen“).
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
  assert.equal(R.gruppenNummer('Gruppe'), 'Gruppe');
  assert.equal(R.gruppenNummer('Freitagsgruppe'), 'Freit…');
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
