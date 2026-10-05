// Die Auswahl im Browser (docs/ARCHITEKTUR.md §6) und die Regeln für den Speicher aus Silas'
// Hosting-Recherche: kein Schreiben beim Laden, nur group/digest/name, Zurücksetzen löscht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../auswahl.mjs';
import { plan, Speicher, gesperrt } from './hilfe.mjs';

const KEY = 'stundenplanner:v1:test-bsc:wise-2026-27:fs1';

function geladen(auswahl = {}) {
  const p = plan();
  const b = A.bestand(p);
  const gruppe = (key) => b.groups.find((g) => g.key === key);
  return { p, b, gruppe, ...A.auswerten(p, b, auswahl) };
}

test('Schlüssel: aus Plandatei und aus index.json derselbe', () => {
  assert.equal(A.speicherSchluessel(plan()), KEY);
  assert.equal(A.speicherSchluessel({ studiengang: 'test-bsc', semester: 'wise-2026-27', fachsemester: 1 }), KEY);
});

test('Laden schreibt nichts — auch nicht bei leerem, kaputtem oder altem Inhalt', () => {
  for (const anfang of [{}, { [KEY]: '{kaputt' }, { [KEY]: JSON.stringify({ 'x:1': { group: '2', digest: 'd', name: 'n', at: '2026-10-05' } }) }]) {
    const s = new Speicher(anfang);
    const { p, b } = geladen();
    A.auswerten(p, b, A.ladeAuswahl(s, A.speicherSchluessel(p)));
    assert.deepEqual(s.schreibvorgaenge, [], 'Laden hat geschrieben: ' + JSON.stringify(anfang));
  }
});

test('Laden ohne Speicher, mit gesperrtem Speicher oder kaputtem Inhalt: leere Auswahl', () => {
  assert.deepEqual(A.ladeAuswahl(null, KEY), {});
  assert.deepEqual(A.ladeAuswahl(gesperrt, KEY), {});
  assert.deepEqual(A.ladeAuswahl(new Speicher({ [KEY]: '{kaputt' }), KEY), {});
  assert.deepEqual(A.ladeAuswahl(new Speicher({ [KEY]: '[1,2]' }), KEY), {});
  assert.deepEqual(A.ladeAuswahl(new Speicher({ [KEY]: '"text"' }), KEY), {});
});

test('Laden behält nur group, digest, name — ein altes `at` und fremde Felder fallen weg', () => {
  const s = new Speicher({ [KEY]: JSON.stringify({
    '10001:100': { group: '11', digest: 'abc', name: 'Termingruppe 1', at: '2026-10-05T10:00:00Z', nutzer: 'x' },
    '10001:200': { digest: 'ohne Gruppe' },
    '10002:500': { group: 52 },
  }) });
  assert.deepEqual(A.ladeAuswahl(s, KEY), { '10001:100': { group: '11', digest: 'abc', name: 'Termingruppe 1' } });
});

test('Speichern schreibt nur group, digest, name — kein Zeitstempel, keine Kennung', () => {
  const s = new Speicher();
  const { gruppe } = geladen();
  let a = A.waehle({}, '10001:100', gruppe('10001:100:11'));
  a = { ...a, '10001:200': { ...A.waehle({}, '10001:200', gruppe('10001:200:21'))['10001:200'], at: 'jetzt', id: 'x' } };
  assert.equal(A.speichereAuswahl(s, KEY, a), true);
  const gespeichert = JSON.parse(s.getItem(KEY));
  for (const e of Object.values(gespeichert)) assert.deepEqual(Object.keys(e).sort(), ['digest', 'group', 'name']);
  assert.equal(gespeichert['10001:100'].group, '11');
  assert.equal(gespeichert['10001:100'].digest, gruppe('10001:100:11').digest);
  assert.equal(gespeichert['10001:100'].name, 'Termingruppe 1');
  assert.doesNotMatch(s.getItem(KEY), /"at"|\d{4}-\d{2}-\d{2}T/);
});

test('Speichern und wieder Laden ergibt dieselbe Auswahl', () => {
  const s = new Speicher();
  const { gruppe } = geladen();
  const a = A.waehle(A.waehle({}, '10001:100', gruppe('10001:100:11')), '10002:500', gruppe('10002:500:52'));
  A.speichereAuswahl(s, KEY, a);
  assert.deepEqual(A.ladeAuswahl(s, KEY), a);
});

test('Eine leere Auswahl entfernt den Schlüssel, statt {} liegen zu lassen', () => {
  const s = new Speicher({ [KEY]: '{}' });
  assert.equal(A.speichereAuswahl(s, KEY, {}), true);
  assert.equal(s.getItem(KEY), null);
});

test('Speichern ohne oder mit gesperrtem Speicher meldet false und wirft nicht', () => {
  assert.equal(A.speichereAuswahl(null, KEY, { a: { group: '1' } }), false);
  assert.equal(A.speichereAuswahl(gesperrt, KEY, { a: { group: '1' } }), false);
  assert.equal(A.loescheAuswahl(gesperrt, KEY), false);
});

test('Zurücksetzen löscht den Schlüssel — und nur ihn', () => {
  const anderer = 'stundenplanner:v1:test-bsc:wise-2026-27:fs2';
  const s = new Speicher({ [KEY]: JSON.stringify({ 'x:1': { group: '2' } }), [anderer]: '{"y:1":{"group":"3"}}' });
  assert.equal(A.loescheAuswahl(s, KEY), true);
  assert.equal(s.getItem(KEY), null);
  assert.notEqual(s.getItem(anderer), null);
  assert.deepEqual(A.ladeAuswahl(s, KEY), {});
});

test('Eine Gruppe je Bestandteil: eine neue Wahl ersetzt die alte', () => {
  const { gruppe } = geladen();
  let a = A.waehle({}, '10001:200', gruppe('10001:200:21'));
  a = A.waehle(a, '10001:200', gruppe('10001:200:22'));
  assert.deepEqual(Object.keys(a), ['10001:200']);
  assert.equal(a['10001:200'].group, '22');
  const r = geladen(a);
  assert.deepEqual(r.selected.map((g) => g.key), ['10001:200:22']);
  assert.equal(r.gruppe('10001:200:21').selected, false);
  assert.equal(r.gruppe('10001:200:22').component.selection, '22');
  assert.deepEqual(A.loese(a, '10001:200'), {});
});

test('changed: gewählt, aber der Fingerabdruck hat sich geändert — „Änderung geprüft“ übernimmt ihn', () => {
  const { gruppe } = geladen();
  const g = gruppe('10001:100:11');
  const alt = { '10001:100': { group: '11', digest: 'alter-fingerabdruck', name: 'Termingruppe 1' } };
  let r = geladen(alt);
  assert.equal(r.gruppe('10001:100:11').changed, true);
  assert.equal(r.selected.length, 1);
  const neu = A.bestaetige(alt, '10001:100', g);
  assert.equal(neu['10001:100'].digest, g.digest);
  r = geladen(neu);
  assert.equal(r.gruppe('10001:100:11').changed, false);
  // Bestätigen einer anderen als der gewählten Gruppe ändert nichts.
  assert.equal(A.bestaetige(alt, '10001:100', { id: '99', digest: 'x', name: 'y' }), alt);
});

test('missing: Gruppe weg oder Bestandteil weg — bleibt mit gespeichertem Namen sichtbar', () => {
  const a = {
    '10001:200': { group: '29', digest: 'd', name: 'Termingruppe 9' },        // Gruppe gibt es nicht mehr
    '99999:1': { group: '7', digest: 'd', name: 'Alte Übung' },               // Bestandteil gibt es nicht mehr
    '10001:100': { group: '11', digest: 'd', name: 'Termingruppe 1' },        // da
  };
  const r = geladen(a);
  assert.deepEqual(r.missing, [
    { component_id: '10001:200', module_short: 'Mod A', type: 'UE', group_id: '29', name: 'Termingruppe 9' },
    { component_id: '99999:1', module_short: '99999', type: '', group_id: '7', name: 'Alte Übung' },
  ]);
  assert.deepEqual(r.selected.map((g) => g.key), ['10001:100:11']);
  // Der Bestandteil zählt als „gewählt“ (Knopf heißt „Gruppe wechseln“), bis man löst.
  assert.equal(r.gruppe('10001:200:21').component.selection, '29');
  const gelöst = A.loese(A.loese(a, '10001:200'), '99999:1');
  assert.deepEqual(geladen(gelöst).missing, []);
});

test('stale: älter als 36 Stunden oder nie erfolgreich', () => {
  const jetzt = Date.parse('2026-10-07T12:00:00Z');
  assert.equal(A.veraltet(null, jetzt), true);
  assert.equal(A.veraltet('', jetzt), true);
  assert.equal(A.veraltet('kein Datum', jetzt), true);
  assert.equal(A.veraltet('2026-10-06T01:00:00Z', jetzt), false);   // 35 h
  assert.equal(A.veraltet('2026-10-06T00:00:00Z', jetzt), false);   // genau 36 h
  assert.equal(A.veraltet('2026-10-05T23:00:00Z', jetzt), true);    // 37 h
  assert.equal(A.veraltet('2026-10-07T13:00:00+02:00', jetzt), false); // Zeitzone zählt
});

test('Teilen-Link hin und zurück: Studiengang, Semester, Fachsemester, Paare', () => {
  const { p, gruppe } = geladen();
  const a = A.waehle(A.waehle({}, '10001:100', gruppe('10001:100:11')), '10002:500', gruppe('10002:500:52'));
  const frag = A.teilenFragment(p, a);
  // Lesbar und kurz: `:` und `~` bleiben im Fragment unkodiert.
  assert.equal(frag, '#studiengang=test-bsc&semester=wise-2026-27&fs=1&w=10001:100~11&w=10002:500~52');
  // Nur Paare, kein Fingerabdruck, kein Name im Link.
  assert.doesNotMatch(frag, new RegExp(gruppe('10001:100:11').digest));
  assert.doesNotMatch(frag, /Termingruppe/);
  const link = A.teilenLesen(frag);
  assert.deepEqual(link, { studiengang: 'test-bsc', semester: 'wise-2026-27', fachsemester: 1, paare: { '10001:100': '11', '10002:500': '52' } });
  assert.equal(A.passtZuPlan(link, p), true);
  assert.equal(A.passtZuPlan(link, { studiengang: 'test-bsc', semester: 'wise-2026-27', fachsemester: 2 }), false);
  // Übernommen ergibt er dieselbe Auswahl (Fingerabdruck und Name aus dem aktuellen Plan).
  const r = A.geteilteAuswahl(geladen().b, link.paare);
  assert.deepEqual(r.auswahl, a);
  assert.deepEqual(r.unbekannt, []);
  assert.equal(A.gleicheAuswahl(r.auswahl, a), true);
});

test('Teilen-Link: Paare ohne passende Gruppe werden genannt, nicht übernommen', () => {
  const link = A.teilenLesen('#studiengang=test-bsc&semester=wise-2026-27&fs=1&w=10001%3A100~11&w=10001%3A200~29&w=88888%3A1~1');
  const r = A.geteilteAuswahl(geladen().b, link.paare);
  assert.deepEqual(Object.keys(r.auswahl), ['10001:100']);
  assert.deepEqual(r.unbekannt, [{ component_id: '10001:200', group_id: '29' }, { component_id: '88888:1', group_id: '1' }]);
});

test('Teilen-Link lesen: kein Link ohne Plan, kaputte Paare fallen weg', () => {
  assert.equal(A.teilenLesen(''), null);
  assert.equal(A.teilenLesen('#'), null);
  assert.equal(A.teilenLesen('#oben'), null);
  assert.equal(A.teilenLesen('#studiengang=test-bsc&semester=wise-2026-27'), null);
  assert.equal(A.teilenLesen('#studiengang=test-bsc&semester=wise-2026-27&fs=0'), null);
  assert.equal(A.teilenLesen('#studiengang=test-bsc&semester=wise-2026-27&fs=eins'), null);
  const l = A.teilenLesen('#studiengang=test-bsc&semester=wise-2026-27&fs=1&w=ohne-trenner&w=~1&w=1~&w=10001:100~11');
  assert.deepEqual(l.paare, { '10001:100': '11' });
  // Ein Plan-Link ohne Auswahl ist ein Link auf den Plan (für mehrere Pläne), keine Vorschau.
  assert.deepEqual(A.teilenLesen(A.teilenFragment(plan(), {})).paare, {});
});

test('Vergleichen zweier Auswahlen', () => {
  const eigene = { a: { group: '1' }, b: { group: '2' }, c: { group: '3' } };
  const andere = { a: { group: '1' }, b: { group: '9' }, d: { group: '4' } };
  assert.deepEqual(A.vergleiche(eigene, andere), { gleich: 1, anders: 1, nurEigene: 1, nurAndere: 1 });
  assert.equal(A.gleicheAuswahl(eigene, andere), false);
  assert.equal(A.gleicheAuswahl({ a: { group: '1', digest: 'x' } }, { a: { group: '1', digest: 'y' } }), true);
});

test('bestand(): Bestandteile und Gruppen flach, mit Modul, Typ und Farbe', () => {
  const { b } = geladen();
  assert.equal(b.parts.length, 3);
  assert.equal(b.groups.length, 7);
  const g = b.groups.find((x) => x.key === '10002:500:52');
  assert.equal(g.module_short, 'Mod B');
  assert.equal(g.type, 'TUT');
  assert.equal(g.component_id, '10002:500');
  assert.equal(g.component.module.number, '10002');
  assert.equal(g.farbe, 1);
});
