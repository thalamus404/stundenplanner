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

test('Sichtbar „Noch offen“: offene Bestandteile möglich, Gewähltes bleibt sichtbar', () => {
  const b = geladen({ '10001:100': { group: '11', digest: '', name: '' } });
  const s = R.sichtbar(b.groups, { ansicht: 'open' });
  assert.deepEqual(s.filter((x) => x.art === 'gewaehlt').map((x) => x.g.key), ['10001:100:11']);
  assert.equal(s.filter((x) => x.art === 'moeglich').length, 6);
  assert.equal(R.sichtbar(b.groups, { ansicht: 'all' }).length, 7);
  assert.deepEqual(R.sichtbar(b.groups, { ansicht: 'selected' }).map((x) => x.g.key), ['10001:100:11']);
});

test('Sichtbar mit Filter: Gewähltes außerhalb ist Kontext, ein gefilterter Bestandteil zeigt alle seine Gruppen', () => {
  const b = geladen({ '10001:100': { group: '11', digest: '', name: '' }, '10002:500': { group: '51', digest: '', name: '' } });
  const s = R.sichtbar(b.groups, { ansicht: 'open', teil: '10002:500' });
  assert.deepEqual(s.map((x) => [x.g.key, x.art]), [
    ['10001:100:11', 'kontext'], ['10002:500:51', 'gewaehlt'], ['10002:500:52', 'moeglich'], ['10002:500:53', 'moeglich']]);
  // Auch in „Mein Plan“: Wer den Bestandteil aufschlägt, will wechseln.
  assert.equal(R.sichtbar(b.groups, { ansicht: 'selected', teil: '10002:500' }).length, 4);
  const m = R.sichtbar(b.groups, { ansicht: 'all', modul: '10001' });
  assert.deepEqual(m.filter((x) => x.art === 'kontext').map((x) => x.g.key), ['10002:500:51']);
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

test('Handy: heute zuerst, am Wochenende Montag', () => {
  assert.equal(R.startTag(new Date('2026-10-14T12:00:00')), 2);   // Mittwoch
  assert.equal(R.startTag(new Date('2026-10-17T12:00:00')), 0);   // Samstag
});
