// Der Startbildschirm (V-0234): der Baum aus index.json, wo die Wahl steht, was die Leiste sagt,
// welcher Plan zu einem Link gehört, und was die Seite bei „keine Wahl ohne Überschneidung“ sagt.
// Der Baum ist erfunden (Hochschule A und B, Studiengänge X, Y, Z), im Format von ARCHITEKTUR §5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../planwahl.mjs';

const blatt = (id, datei, k = { loesbar: true, sicher: true }) => ({ plan: { id, datei, kombinationen: k } });
const ordnung = (regel, optionen) => ({ stufe: 'ordnung', regel, optionen });
const fs = (semester, n, zusatz, weiter) => ({ id: `${semester}:fs${n}`, label: `${n}. Fachsemester`, zusatz, semester, fachsemester: n, weiter });

function index() {
  return {
    schema: 2,
    stufen: [{ id: 'hochschule', label: 'Hochschule' }, { id: 'studiengang', label: 'Studiengang' }, { id: 'vertiefung', label: 'Vertiefung' },
      { id: 'fachsemester', label: 'Fachsemester' }, { id: 'ordnung', label: 'Studien- und Prüfungsordnung' }],
    wahl: { stufe: 'hochschule', regel: 'waehlen', optionen: [
      { id: 'hs-a', label: 'Hochschule A', zusatz: 'Erfundene Hochschule A', weiter: { stufe: 'studiengang', regel: 'waehlen', optionen: [
        { id: 'x-bsc', label: 'Studiengang X', zusatz: 'B.Sc.', weiter: { stufe: 'vertiefung', regel: 'ueberspringen', label: 'Vertiefung', optionen: [
          { id: null, label: 'Ohne Vertiefung', zusatz: null, weiter: { stufe: 'fachsemester', regel: 'waehlen', optionen: [
            fs('ws-1', 1, 'WiSe Eins', ordnung('automatisch', [{ id: 'o-neu', label: 'Ordnung Neu', zusatz: 'ab WiSe Eins', ...blatt('x-bsc:o-neu:ws-1:fs1', 'x-bsc/o-neu/ws-1-fs1.json') }])),
            fs('ws-1', 3, 'WiSe Eins', ordnung('waehlen', [
              { id: 'o-neu', label: 'Ordnung Neu', zusatz: 'ab WiSe Eins', ...blatt('x-bsc:o-neu:ws-1:fs3', 'x-bsc/o-neu/ws-1-fs3.json', { loesbar: false, sicher: true, grund: 'Erfunden: A und B überschneiden sich.' }) },
              { id: 'o-alt', label: 'Ordnung Alt', zusatz: 'bis WiSe Null', ...blatt('x-bsc:o-alt:ws-1:fs3', 'x-bsc/o-alt/ws-1-fs3.json') }])),
            fs('ss-1', 2, 'SoSe Eins', ordnung('automatisch', [{ id: 'o-neu', label: 'Ordnung Neu', zusatz: 'ab WiSe Eins', ...blatt('x-bsc:o-neu:ss-1:fs2', 'x-bsc/o-neu/ss-1-fs2.json') }])),
          ] } }] } },
        { id: 'y-bsc', label: 'Studiengang Y', zusatz: 'B.Sc.', weiter: { stufe: 'vertiefung', regel: 'waehlen', label: 'Studienrichtung', optionen: [
          { id: null, label: 'Ohne Studienrichtung', zusatz: null, weiter: { stufe: 'fachsemester', regel: 'waehlen', optionen: [
            fs('ws-1', 1, 'WiSe Eins', ordnung('automatisch', [{ id: 'o-y', label: 'Ordnung Y', zusatz: '', ...blatt('y-bsc:o-y:ws-1:fs1', 'y-bsc/o-y/ws-1-fs1.json') }]))] } },
          { id: 'v1', label: 'Richtung Eins', zusatz: 'R1', weiter: { stufe: 'fachsemester', regel: 'waehlen', optionen: [
            fs('ws-1', 1, 'WiSe Eins', ordnung('automatisch', [{ id: 'o-y', label: 'Ordnung Y', zusatz: '', ...blatt('y-bsc:o-y:ws-1:fs1:v1', 'y-bsc/o-y/v1/ws-1-fs1.json') }]))] } },
        ] } },
      ] } },
      { id: 'hs-b', label: 'Hochschule B', zusatz: 'Erfundene Hochschule B', weiter: { stufe: 'studiengang', regel: 'waehlen', optionen: [
        { id: 'z-bsc', label: 'Studiengang Z', zusatz: 'B.Sc.', weiter: { stufe: 'vertiefung', regel: 'ueberspringen', optionen: [
          { id: null, label: 'Ohne Vertiefung', zusatz: null, weiter: { stufe: 'fachsemester', regel: 'waehlen', optionen: [
            fs('ws-b', 1, 'WiSe B', ordnung('ueberspringen', [{ id: null, label: 'Ohne Ordnung', zusatz: null, ...blatt('z-bsc:ws-b:fs1', 'z-bsc/ws-b-fs1.json') }]))] } }] } }] } },
    ] },
  };
}

const PFAD = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.json$/;
const laden = () => {
  const i = index();
  const baum = P.wahlBaum(i, (d) => PFAD.test(d));
  return { i, baum, stufen: P.stufenVon(i, baum), liste: P.blaetter(baum) };
};
const arten = (st) => Object.fromEntries(st.schritte.map((x) => [x.id, x.art]));

test('Baum: Blätter ohne gültige Kennung oder mit fremdem Pfad fallen weg, leere Zweige auch', () => {
  const i = index();
  const z = i.wahl.optionen[1].weiter.optionen[0].weiter.optionen[0].weiter.optionen[0].weiter.optionen[0];
  z.plan.datei = '../geheim.json';
  const baum = P.wahlBaum(i, (d) => PFAD.test(d));
  assert.deepEqual(baum.optionen.map((o) => o.id), ['hs-a'], 'Hochschule B hat keinen Plan mehr');
  const j = index();
  j.wahl.optionen[0].weiter.optionen[0].weiter.optionen[0].weiter.optionen[0].weiter.optionen[0].plan.id = 'X:Gross';
  assert.equal(P.blaetter(P.wahlBaum(j, (d) => PFAD.test(d))).length, 6);
  assert.equal(P.wahlBaum({ schema: 1, plaene: [] }), null);
  assert.equal(P.wahlBaum(null), null);
});

test('Baum: „automatisch“ mit zwei Optionen wird „waehlen“ — lieber fragen als still festlegen', () => {
  const i = index();
  const knoten = i.wahl.optionen[0].weiter.optionen[0].weiter.optionen[0].weiter.optionen[1].weiter;
  knoten.regel = 'automatisch';
  const baum = P.wahlBaum(i);
  const stufen = P.stufenVon(i, baum);
  const st = P.wahlStand(baum, stufen, { hochschule: 'hs-a', studiengang: 'x-bsc', fachsemester: 'ws-1:fs3' });
  assert.equal(st.aktuell, 'ordnung');
  assert.equal(st.schritte.find((x) => x.id === 'ordnung').knoten.regel, 'waehlen');
});

test('Pläne flach: Kennung, Datei, Pfad, Semester und Fachsemester aus der Option des Fachsemesters', () => {
  const { liste } = laden();
  assert.equal(liste.length, 7);
  const b = liste.find((x) => x.id === 'x-bsc:o-alt:ws-1:fs3');
  assert.deepEqual(b.pfad, { hochschule: 'hs-a', studiengang: 'x-bsc', vertiefung: null, fachsemester: 'ws-1:fs3', ordnung: 'o-alt' });
  assert.equal(b.semester, 'ws-1');
  assert.equal(b.fachsemester, 3);
  assert.equal(b.studiengang, 'x-bsc');
  assert.equal(b.datei, 'x-bsc/o-alt/ws-1-fs3.json');
});

test('Am Anfang: Hochschule offen; was in jedem Zweig entfällt oder automatisch ist, sagt die Leiste schon', () => {
  const { baum, stufen } = laden();
  const st = P.wahlStand(baum, stufen, {});
  assert.equal(st.aktuell, 'hochschule');
  assert.equal(st.plan, null);
  // Vertiefung: bei Y gewählt, also offen. Ordnung: bei X 3. FS gewählt, also offen.
  assert.deepEqual(arten(st), { hochschule: 'offen', studiengang: 'offen', vertiefung: 'offen', fachsemester: 'offen', ordnung: 'offen' });
  assert.equal(st.offen, 5);
});

test('Hochschule B: Vertiefung und Ordnung entfallen in jedem Zweig — die Leiste zeigt es vorab', () => {
  const { baum, stufen } = laden();
  const st = P.wahlStand(baum, stufen, { hochschule: 'hs-b' });
  assert.equal(st.aktuell, 'studiengang');
  assert.deepEqual(arten(st), { hochschule: 'gewaehlt', studiengang: 'offen', vertiefung: 'entfaellt', fachsemester: 'offen', ordnung: 'entfaellt' });
  assert.equal(st.offen, 2);
  assert.equal(st.schritte[0].wert, 'Hochschule B');
});

test('Studiengang X: Vertiefung entfällt (Regel), das 1. FS hat nur eine Ordnung (automatisch, mit Wert)', () => {
  const { baum, stufen } = laden();
  let st = P.wahlStand(baum, stufen, { hochschule: 'hs-a', studiengang: 'x-bsc' });
  assert.equal(st.aktuell, 'fachsemester');
  assert.equal(arten(st).vertiefung, 'entfaellt');
  assert.equal(arten(st).ordnung, 'offen', 'im 3. FS gibt es zwei Ordnungen');
  st = P.wahlStand(baum, stufen, { hochschule: 'hs-a', studiengang: 'x-bsc', fachsemester: 'ws-1:fs1' });
  assert.equal(st.aktuell, null);
  assert.equal(st.plan.id, 'x-bsc:o-neu:ws-1:fs1');
  const o = st.schritte.find((x) => x.id === 'ordnung');
  assert.equal(o.art, 'automatisch');
  assert.equal(o.wert, 'Ordnung Neu');
  assert.equal(st.offen, 0);
  assert.equal(P.naechsteSicht(st), 'fertig');
});

test('Die Bezeichnung der Vertiefung kommt vom Knoten („Studienrichtung“); „Ohne …“ (id null) ist eine Wahl', () => {
  const { baum, stufen } = laden();
  let st = P.wahlStand(baum, stufen, { hochschule: 'hs-a', studiengang: 'y-bsc' });
  assert.equal(st.aktuell, 'vertiefung');
  assert.equal(st.schritte.find((x) => x.id === 'vertiefung').label, 'Studienrichtung');
  st = P.wahlStand(baum, stufen, { hochschule: 'hs-a', studiengang: 'y-bsc', vertiefung: null });
  assert.equal(st.aktuell, 'fachsemester');
  assert.equal(st.schritte.find((x) => x.id === 'vertiefung').wert, 'Ohne Studienrichtung');
});

test('Wählen: eine andere Option verwirft die späteren Stufen, dieselbe behält sie', () => {
  const { stufen } = laden();
  const w = { hochschule: 'hs-a', studiengang: 'x-bsc', fachsemester: 'ws-1:fs3', ordnung: 'o-alt' };
  assert.deepEqual(P.waehleOption(stufen, w, 'studiengang', 'x-bsc'), w);
  assert.deepEqual(P.waehleOption(stufen, w, 'studiengang', 'y-bsc'), { hochschule: 'hs-a', studiengang: 'y-bsc' });
  assert.deepEqual(P.waehleOption(stufen, w, 'fachsemester', 'ws-1:fs1'), { hochschule: 'hs-a', studiengang: 'x-bsc', fachsemester: 'ws-1:fs1' });
});

test('Zurück: zur letzten Stufe, an der jemand gewählt hat; Automatisches und Entfallenes zählen nicht', () => {
  const { baum, stufen } = laden();
  const st = P.wahlStand(baum, stufen, { hochschule: 'hs-a', studiengang: 'x-bsc', fachsemester: 'ws-1:fs1' });
  assert.equal(P.vorige(st, 'fertig'), 'fachsemester');
  assert.equal(P.vorige(st, 'ordnung'), 'fachsemester');
  assert.equal(P.vorige(st, 'fachsemester'), 'studiengang');
  assert.equal(P.vorige(st, 'hochschule'), null);
});

test('Vorbelegt aus einem Plan (der Reiter öffnet den Startbildschirm zum Wechseln)', () => {
  const { baum, stufen, liste } = laden();
  const w = P.wahlFuer(liste, 'y-bsc:o-y:ws-1:fs1:v1');
  const st = P.wahlStand(baum, stufen, w);
  assert.equal(st.plan.id, 'y-bsc:o-y:ws-1:fs1:v1');
  assert.deepEqual(P.wahlFuer(liste, 'gibt-es:nicht:fs1'), {});
});

test('Link → Plan: neu über die Kennung, alt über Studiengang/Semester/FS nur, wenn eindeutig', () => {
  const { liste } = laden();
  assert.equal(P.planZumLink(liste, { plan: 'x-bsc:o-alt:ws-1:fs3' }).id, 'x-bsc:o-alt:ws-1:fs3');
  assert.equal(P.planZumLink(liste, { plan: 'weg:ws-1:fs1' }), null);
  assert.equal(P.planZumLink(liste, { plan: null, studiengang: 'x-bsc', semester: 'ws-1', fachsemester: 1 }).id, 'x-bsc:o-neu:ws-1:fs1');
  // X im 3. FS hat zwei Ordnungen, Y im 1. FS zwei Richtungen: nicht eindeutig.
  assert.equal(P.planZumLink(liste, { plan: null, studiengang: 'x-bsc', semester: 'ws-1', fachsemester: 3 }), null);
  assert.equal(P.planZumLink(liste, { plan: null, studiengang: 'y-bsc', semester: 'ws-1', fachsemester: 1 }), null);
  assert.equal(P.planZumLink(liste, null), null);
});

test('Gruppen nach Zusatz nur, wenn sich mindestens zwei einen teilen', () => {
  const { baum } = laden();
  const fsKnoten = baum.optionen[0].weiter.optionen[0].weiter.optionen[0].weiter;
  assert.deepEqual(P.gruppiert(fsKnoten.optionen).map((g) => [g.zusatz, g.optionen.map((o) => o.fachsemester)]), [['WiSe Eins', [1, 3]], ['SoSe Eins', [2]]]);
  assert.equal(P.gruppiert(baum.optionen), null, 'verschiedene Zusätze: keine Gruppen');
  assert.equal(P.gruppiert([baum.optionen[0]]), null, 'eine Option: keine Gruppe');
});

test('Die Leiste sagt, wie viele Angaben fehlen, und am Handy, welche', () => {
  const { baum, stufen } = laden();
  let t = P.leistenText(P.wahlStand(baum, stufen, { hochschule: 'hs-b' }));
  assert.equal(t.zahl, 'Noch 2 Angaben bis zum Stundenplan');
  assert.equal(t.namen, 'Noch offen: Studiengang und Fachsemester');
  t = P.leistenText(P.wahlStand(baum, stufen, { hochschule: 'hs-b', studiengang: 'z-bsc' }));
  assert.equal(t.zahl, 'Noch 1 Angabe bis zum Stundenplan');
  assert.equal(t.namen, 'Noch offen: Fachsemester');
  t = P.leistenText(P.wahlStand(baum, stufen, { hochschule: 'hs-b', studiengang: 'z-bsc', fachsemester: 'ws-b:fs1' }));
  assert.match(t.zahl, /^Alles gewählt/);
});

test('Ohne Lösung: nur loesbar === false ist eine Aussage; unsicher heißt „vermutlich“ mit Verdacht', () => {
  assert.equal(P.ohneLoesung({ loesbar: true, sicher: true }), null);
  assert.equal(P.ohneLoesung({ loesbar: null, sicher: false, grund: 'nur Wahlpflicht' }), null);
  assert.equal(P.ohneLoesung(null), null);
  const s = P.ohneLoesung({ loesbar: false, sicher: true, grund: 'Erfunden: A und B.' });
  assert.equal(s.satz, 'Mit den veröffentlichten Terminen gibt es keine Wahl ohne Überschneidung.');
  assert.equal(s.grund, 'Erfunden: A und B.');
  const v = P.ohneLoesung({ loesbar: false, sicher: false, grund: 'g', verdacht: [{ component: '1:2', grund: 'Gruppen liegen nacheinander' }], fehlen: ['70123'] });
  assert.match(v.satz, /vermutlich/);
  assert.deepEqual(v.verdacht, ['Gruppen liegen nacheinander']);
  assert.deepEqual(v.fehlen, ['70123']);
});

test('Farbe der Hochschule (V-0243): nur #rrggbb kommt in den Baum, alles andere fällt weg', () => {
  const i = index();
  i.wahl.optionen[0].farbe = '#C50E1F';
  if (i.wahl.optionen[1]) i.wahl.optionen[1].farbe = 'red; background:url(x)';
  const baum = P.wahlBaum(i, (d) => PFAD.test(d));
  assert.equal(baum.optionen[0].farbe, '#C50E1F');
  if (baum.optionen[1]) assert.equal(baum.optionen[1].farbe, undefined);
});
