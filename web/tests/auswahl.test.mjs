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
  // 10001:100 hat nur eine Gruppe: ohne Eintrag ein Vorschlag, nicht eingeplant (V-0237).
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
  assert.deepEqual(link, { plan: null, studiengang: 'test-bsc', semester: 'wise-2026-27', fachsemester: 1, paare: { '10001:100': '11', '10002:500': '52' } });
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

test('Teilen ist nie stumm: ohne Wahl und in der Vorschau sagt der Knopf, was fehlt', () => {
  // Silas, erster Live-Test am Handy: Der gesperrte Knopf tat nichts, der Grund stand nur im Tooltip.
  assert.equal(A.teilenWeg({ anzahl: 0 }), 'leer');
  assert.equal(A.teilenWeg({ anzahl: 0, share: true, grob: true }), 'leer');
  assert.equal(A.teilenWeg({ anzahl: 3, vorschau: true, share: true, grob: true }), 'vorschau');
  assert.equal(A.teilenWeg({ anzahl: 3, share: true, grob: true }), 'system');
  // Teilen-Menü nur am Handy; am Rechner und ohne navigator.share (Firefox) wird kopiert.
  assert.equal(A.teilenWeg({ anzahl: 3, share: true, grob: false }), 'kopieren');
  assert.equal(A.teilenWeg({ anzahl: 3, share: false, grob: true }), 'kopieren');
});

test('Einzige Gruppe: ein Vorschlag, nicht eingeplant, berechnet und nie gespeichert (Silas, V-0237)', () => {
  const s = new Speicher();
  const auswahl = A.ladeAuswahl(s, KEY);
  const r = geladen(auswahl);
  assert.deepEqual(r.selected, []);                                       // zählt nicht als eingeplant
  assert.equal(r.gruppe('10001:100:11').vorschlag, true);
  assert.equal(r.gruppe('10001:100:11').selected, false);
  assert.equal(r.gruppe('10001:100:11').component.selection, null);
  assert.deepEqual(s.schreibvorgaenge, []);                              // Laden schreibt nichts
  // Formate mit mehreren Gruppen schlagen nichts vor; eine Gruppe ohne Termine zählt nicht mit.
  assert.equal(r.gruppe('10001:200:21').vorschlag, false);
  assert.equal(A.einzige(r.gruppe('10001:200:21').component), null);
  assert.equal(A.einzige({ groups: [{ slots: [1] }, { slots: [] }] }).slots.length, 1);
  // „Einplanen“: eingeplant, kein Vorschlag mehr
  const fest = geladen(A.waehle({}, '10001:100', r.gruppe('10001:100:11')));
  assert.equal(fest.gruppe('10001:100:11').vorschlag, false);
  assert.equal(fest.gruppe('10001:100:11').selected, true);
});

test('Lösen: der Eintrag fällt weg, die einzige Gruppe ist wieder ein Vorschlag; group: null aus V-0225 gilt wie keiner', () => {
  const { gruppe } = geladen();
  const a = A.waehle({}, '10001:100', gruppe('10001:100:11'));
  assert.deepEqual(A.loese(a, '10001:100'), {});
  const r = geladen({ '10001:100': { group: null, digest: '', name: '' } });
  assert.deepEqual(r.selected, []);
  assert.equal(r.gruppe('10001:100:11').vorschlag, true);
  assert.deepEqual(r.missing, []);                                        // eine alte Abwahl fehlt nicht
  assert.deepEqual(A.loese({ '10001:200': { group: '21' } }, '10001:200'), {});
});

test('Einzige Gruppe bekommt eine zweite: kein Vorschlag mehr, das Format ist offen', () => {
  const p = plan();
  const c = p.modules[0].components[0];
  c.groups.push({ ...structuredClone(c.groups[0]), id: '12', key: undefined, name: 'Termingruppe 2' });
  const b = A.bestand(p);
  const { selected } = A.auswerten(p, b, {});
  assert.deepEqual(selected.map((g) => g.key), []);
  assert.ok(c.groups.every((g) => !g.vorschlag));
  assert.equal(c.selection, null);
});

test('Wirksame Auswahl für den Export: nur Eingeplantes, Vorschläge erst nach „Einplanen“ (V-0237)', () => {
  const { gruppe } = geladen();
  const a = A.waehle({}, '10001:200', gruppe('10001:200:22'));
  const r = geladen(a);
  assert.deepEqual(A.wirksameAuswahl(r.selected), {
    '10001:200': { group: '22', digest: r.gruppe('10001:200:22').digest, name: r.gruppe('10001:200:22').name },
  });
  const mit = geladen(A.waehle(a, '10001:100', gruppe('10001:100:11')));
  assert.deepEqual(Object.keys(A.wirksameAuswahl(mit.selected)).sort(), ['10001:100', '10001:200']);
});

test('Fortschritt: Formate ohne Termine in diesem Semester zählen nicht (querwind, db561642)', () => {
  const p = plan();
  p.modules[2].components = [{ id: '10003:1', type: 'SE', groups: [] }, { id: '10003:2', type: 'PJ', groups: [{ id: '1', slots: [], bookings: [] }] }];
  const b = A.bestand(p);
  A.auswerten(p, b, {});
  // drei Formate mit Terminen; 10001:100 ist nur ein Vorschlag und zählt nicht (V-0237)
  assert.deepEqual(A.fortschritt(b.parts), { n: 3, k: 0 });
  const g = (key) => b.groups.find((x) => x.key === key);
  A.auswerten(p, b, { '10001:100': { group: '11', digest: '', name: '' }, '10001:200': { group: '21', digest: '', name: '' }, '10002:500': { group: '51', digest: '', name: '' } });
  assert.deepEqual(A.fortschritt(b.parts), { n: 3, k: 3 });               // alle eingeplant, trotz zweier Formate ohne Termine
  assert.equal(g('10001:200:21').selected, true);
});

// ── V-0234: Schlüssel je plan.id, Umzug des alten Schlüssels, Planwahl, Teilen-Link mit plan.id ──

const ID = 'test-bsc:stupo-test:wise-2026-27:fs1';
const NEU = 'stundenplanner:v1:' + ID;
const mitId = () => ({ ...plan(), id: ID });

test('Schlüssel je plan.id; ohne id (erstes Katalogformat) bleibt der alte', () => {
  assert.equal(A.speicherSchluessel(mitId()), NEU);
  assert.equal(A.alterSchluessel(mitId()), KEY);
  assert.equal(A.speicherSchluessel(plan()), KEY);
  // Eine Kennung, die kein Dateiname sein darf, gilt nicht als Kennung.
  assert.equal(A.speicherSchluessel({ ...plan(), id: '../x' }), KEY);
  // Die Planwahl hat einen eigenen Schlüssel, den kein Plan haben kann (Kennungen haben ≥ 3 Teile).
  assert.equal(A.PLAN_SCHLUESSEL, 'stundenplanner:v1:plan');
});

test('Umzug: die alte Auswahl gilt, solange unter dem neuen Schlüssel nichts liegt — Laden schreibt dabei nichts', () => {
  const alt = JSON.stringify({ '10001:200': { group: '22', digest: 'd', name: 'Termingruppe 2' } });
  const s = new Speicher({ [KEY]: alt });
  const r = A.ladeAuswahlFuer(s, mitId(), true);
  assert.deepEqual(r, { auswahl: { '10001:200': { group: '22', digest: 'd', name: 'Termingruppe 2' } }, alt: KEY });
  assert.deepEqual(s.schreibvorgaenge, []);
  // Nicht eindeutig (mehrere Pläne teilen sich den alten Schlüssel): nicht übernehmen.
  assert.deepEqual(A.ladeAuswahlFuer(s, mitId(), false), { auswahl: {}, alt: null });
  // Unter dem neuen Schlüssel liegt etwas: Das gilt, der alte bleibt unberührt.
  const s2 = new Speicher({ [KEY]: alt, [NEU]: JSON.stringify({ '10001:200': { group: '23', digest: 'e', name: 'Termingruppe 3' } }) });
  assert.equal(A.ladeAuswahlFuer(s2, mitId(), true).auswahl['10001:200'].group, '23');
  assert.equal(A.ladeAuswahlFuer(s2, mitId(), true).alt, null);
});

test('Umzug: die erste aktive Änderung schreibt unter den neuen Schlüssel und entfernt den alten', () => {
  const s = new Speicher({ [KEY]: JSON.stringify({ '10001:200': { group: '22', digest: 'd', name: 'Termingruppe 2' } }), andere: 'x' });
  const { auswahl, alt } = A.ladeAuswahlFuer(s, mitId(), true);
  const neu = A.waehle(auswahl, '10002:500', { id: '52', digest: 'f', name: 'Termingruppe 2' });
  assert.equal(A.speichereUndZiehUm(s, NEU, alt, neu), true);
  assert.equal(s.getItem(KEY), null);
  assert.deepEqual(Object.keys(JSON.parse(s.getItem(NEU))).sort(), ['10001:200', '10002:500']);
  assert.equal(s.getItem('andere'), 'x');
  assert.deepEqual(s.schreibvorgaenge.map(([art, k]) => [art, k]), [['set', NEU], ['remove', KEY]]);
  // Ohne Speicher: false, nichts wirft.
  assert.equal(A.speichereUndZiehUm(gesperrt, NEU, KEY, neu), false);
});

test('Planwahl: nur eine Kennung, geschrieben nur auf Aufruf, gelesen ohne zu schreiben', () => {
  const s = new Speicher();
  assert.equal(A.ladePlanwahl(s), null);
  assert.equal(A.ladePlanwahl(null), null);
  assert.equal(A.ladePlanwahl(gesperrt), null);
  assert.deepEqual(s.schreibvorgaenge, []);
  assert.equal(A.speicherePlanwahl(s, ID), true);
  assert.deepEqual(s.schreibvorgaenge, [['set', 'stundenplanner:v1:plan', ID]]);
  assert.equal(A.ladePlanwahl(s), ID);
  // Keine Kennung, kein Schreiben: was kein Dateiname sein darf, kommt nicht in den Speicher.
  assert.equal(A.speicherePlanwahl(s, 'x y'), false);
  assert.equal(A.speicherePlanwahl(s, '<script>'), false);
  assert.equal(A.speicherePlanwahl(gesperrt, ID), false);
  assert.equal(A.ladePlanwahl(new Speicher({ 'stundenplanner:v1:plan': '../../etc' })), null);
});

test('Teilen-Link mit plan.id: #plan=<id>&w=…; alte Links bleiben lesbar', () => {
  const { gruppe } = geladen();
  const p = mitId();
  const a = A.waehle({}, '10001:200', gruppe('10001:200:21'));
  const frag = A.teilenFragment(p, a);
  assert.equal(frag, `#plan=${ID}&w=10001:200~21`);
  const link = A.teilenLesen(frag);
  assert.deepEqual(link, { plan: ID, studiengang: null, semester: null, fachsemester: null, paare: { '10001:200': '21' } });
  assert.equal(A.passtZuPlan(link, p), true);
  assert.equal(A.passtZuPlan(link, { ...p, id: 'test-bsc:andere:wise-2026-27:fs1' }), false);
  // Der alte Link passt über Studiengang, Semester und Fachsemester.
  assert.equal(A.passtZuPlan(A.teilenLesen('#studiengang=test-bsc&semester=wise-2026-27&fs=1'), p), true);
  // Eine Kennung mit fremden Zeichen ist kein Link.
  assert.equal(A.teilenLesen('#plan=a%20b'), null);
  assert.equal(A.teilenLesen('#plan='), null);
  assert.equal(A.teilenFragment(p, {}), `#plan=${ID}`);
});

// ── V-0234: Regeln der Gruppen aus katalog/bestandteile.json (V-0233) ──────────────────────────

function mitGruppen(regel, cid = '10001:200') {
  const p = plan();
  for (const m of p.modules) for (const c of m.components) if (c.id === cid) { c.gruppen = regel; c.gruppen_grund = 'erfunden'; }
  return p;
}

test('gruppen: alle — alle Gruppen sind ein Vorschlag; eingeplant wird das Format als Ganzes (V-0237)', () => {
  const p = mitGruppen('alle');
  const b = A.bestand(p);
  const c = b.parts.find((x) => x.id === '10001:200');
  const mit = c.groups.filter((g) => g.slots.length);
  let r = A.auswerten(p, b, {});
  assert.ok(mit.length > 1);
  assert.ok(mit.every((g) => g.vorschlag && !g.selected));
  assert.equal(r.selected.filter((g) => g.component_id === c.id).length, 0);
  // „Einplanen“ auf einer Gruppe plant alle ein; im Fortschritt eins, im Export eine Liste.
  r = A.auswerten(p, b, A.waehle({}, c.id, mit[0]));
  assert.ok(mit.every((g) => g.selected && !g.vorschlag));
  assert.deepEqual(A.wirksameAuswahl(r.selected)['10001:200'].group, mit.map((g) => g.id));
  assert.equal(A.fortschritt(b.parts).k, 1);
  // Lösen: wieder ein Vorschlag.
  r = A.auswerten(p, b, A.loese(A.waehle({}, c.id, mit[0]), c.id));
  assert.ok(mit.every((g) => g.vorschlag && !g.selected));
  assert.deepEqual(r.missing, []);
});

test('gruppen: keine — nie vorgeschlagen, zählt nicht zum Fortschritt', () => {
  const p = mitGruppen('keine', '10001:100');   // VL mit genau einer Gruppe: wäre sonst ein Vorschlag
  const b = A.bestand(p);
  const c = b.parts.find((x) => x.id === '10001:100');
  assert.equal(A.einzige(c), null);
  A.auswerten(p, b, {});
  assert.ok(c.groups.every((g) => !g.selected && !g.vorschlag));
  const ohne = A.fortschritt(A.bestand(plan()).parts).n;
  assert.equal(A.fortschritt(b.parts).n, ohne - 1);
});
