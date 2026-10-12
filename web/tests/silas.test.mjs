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

test('Kontingent: das Modul sind LP × 30 h; je Posten gehen Termine und Einheiten vor, der Rest ist Selbststudium (G1, G4)', () => {
  const e = M.rechnen(angebot(), {});
  const r = e.module[0];
  assert.equal(r.soll_min, 6 * 30 * 60);
  assert.equal(r.tabelle_min, r.soll_min);
  // Zwei Videos à 105 min in zwei Wochen: je Woche 105 + 15 min → 2 h, zusammen 4 h; der Rest des Postens (30 h) ist
  // Nachbereitung (26 h) — die soll_h am Video zählt nicht mehr, gemessen wird.
  assert.equal(e.teile.get('bsp-video').kontingent_min, 240);
  assert.equal(e.teile.get('bsp-vn').kontingent_min, 30 * 60 - 240);
  // Zwei Töpfe (G2): die Prüfungsvorbereitung (90 h) ist Prüfungs-Topf; die Übung ohne Wahl ist offen, also kein G5.
  assert.equal(r.pruefung_min, 90 * 60);
  assert.equal(r.semester_min + r.pruefung_min, r.soll_min);
  assert.equal(e.summe.semester_min + e.summe.pruefung_min, e.summe.soll_min);
});

test('Präsenz: jeder Termin zählt seine Doppelstunde', () => {
  const z = M.rechnen(angebot(), {}).teile.get('bsp-vl');
  assert.equal(z.vk.length, 16);
  assert.equal(z.ist_min, 16 * 120);
  assert.equal(z.status, 'ok');
});

test('Wahl: ohne Wahl „Wahl offen“, gewählt zählt die Gruppe, ohne Gruppen „Info fehlt“ — und zu wenige Termine gehen nach G5', () => {
  const a = angebot();
  const ohne = M.rechnen(a, {}).teile.get('bsp-ue');
  assert.equal(ohne.alternativen, 'wahl_offen');
  assert.ok(ohne.flags.some((f) => f.art === 'wahl_offen' && f.stufe === 'dran'));
  const e = M.rechnen(a, { wahl: { 'bsp-ue': 'g1' } });
  const g1 = e.teile.get('bsp-ue');
  assert.equal(g1.alternativen, 'gewaehlt');
  assert.equal(g1.ist_min, 3 * 120);
  // Nur drei Termine (6 h) statt 30 h: 24 h finden nicht statt und gehen in die Vorbereitung der Klausur (G5).
  const P = e.posten.find((x) => x.id === 'BSP/ue');
  assert.equal(P.audit.ergebnis, 'weniger');
  assert.equal(P.g5_min, 24 * 60);
  assert.equal(e.pruefungen.get('bsp-klausur').kontingent_min, (90 + 24) * 60);
  assert.equal(e.module[0].pruefung_min, (90 + 24) * 60);
  a.module[0].teile[3].optionen = [];
  a.module[0].teile[3].wahl = true;
  const leer = M.rechnen(a, {}).teile.get('bsp-ue');
  assert.equal(leer.alternativen, 'info_fehlt');
  assert.ok(leer.flags.some((f) => f.art === 'info_fehlt' && f.stufe === 'kommt'));
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
  // Die zweite VL (22.10.): Am Tag der ersten läge die Nachbereitung vor dem ersten Stoff und zählte gar nicht (V-0342).
  const e = M.rechnen(angebot(), { bloecke: [{ id: 'b1', teil: 'bsp-vn', datum: '2030-10-22', start: '10:00', ende: '12:00' }] });
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


test('Ohne Prüfungstermin „Info fehlt“ mit Stichtag 14 Tage nach Modulbeginn, und eine falsche Aufwandstabelle fällt auf', () => {
  const a = angebot();
  a.module[0].pruefungen[0].termine = [];
  a.module[0].posten[3].h = 80;
  const e = M.rechnen(a, {});
  const X = e.pruefungen.get('bsp-klausur');
  assert.equal(X.alternativen, 'info_fehlt');
  assert.equal(X.info.stichtag, '2030-10-29', 'erste VL Di 15.10. + 14 Tage (§ 65 Abs. 3)');
  assert.ok(e.module[0].flags.some((f) => f.art === 'pruefung_info' && f.stufe === 'kommt'));
  assert.equal(M.rechnen(a, {}, { heute: '2030-10-30' }).module[0].flags.find((f) => f.art === 'pruefung_info').stufe, 'achtung', 'nach dem Stichtag: nachfragen');
  assert.ok(e.module[0].flags.some((f) => f.art === 'posten_summe'));
});

// ── Die vier Schritte (V-0333) ───────────────────────────────────────────────────────────────────

test('Schritte: feste Präsenz 1, Gruppen 2, Videos 3, Selbststudium 4, Prüfungs-Topf 5 — Blöcke folgen ihrem Teil', () => {
  const a = angebot();
  const t = Object.fromEntries(a.module[0].teile.map((x) => [x.id, M.schrittVon(x)]));
  assert.deepEqual(t, { 'bsp-vl': 1, 'bsp-video': 3, 'bsp-vn': 4, 'bsp-ue': 2, 'bsp-pv': M.PRUEFUNGEN });
  assert.equal(M.schrittVon({ id: 'x', art: 'praesenz' }), 2);
  assert.equal(M.schrittVon({ id: 'x', art: 'praesenz', topf: 'pruefung', termine: { typ: 'reihe', daten: [] } }), M.PRUEFUNGEN, 'Fragestunde, Probeklausur: Prüfungs-Topf');
  assert.equal(M.schrittVonBlock(null), 4);
  const e = M.rechnen(a, { wahl: { 'bsp-ue': 'g2' }, bloecke: [{ id: 'v', teil: 'bsp-video', tag: 'Mo', start: '09:00', ende: '11:00' }] });
  const s = M.schritte(e);
  assert.deepEqual(s.map((x) => x.titel), ['Grundlage', 'Gruppen', 'Videos', 'EVL', 'Prüfungen']);
  assert.equal(s.reduce((n, x) => n + x.teile.length, 0), a.module[0].teile.length, 'jeder Teil in genau einem Schritt');
  assert.ok(e.vorkommen.filter((v) => v.quelle === 'termin' && v.teil === 'bsp-ue').every((v) => v.schritt === 2 && v.hart));
  assert.ok(e.vorkommen.filter((v) => v.block === 'v').every((v) => v.schritt === 3));
  assert.ok(e.vorkommen.filter((v) => v.quelle === 'frist' && !v.pruefung).every((v) => v.schritt === 1 && !v.hart));
  // Prüfungen, ihre Fristen (Verweise nach § 63) und ihre Vorbereitung gehören zu Schritt 5.
  assert.ok(e.vorkommen.filter((v) => v.quelle === 'pruefung').every((v) => v.schritt === M.PRUEFUNGEN && v.hart));
  assert.deepEqual(e.vorkommen.filter((v) => v.quelle === 'frist' && v.pruefung).map((v) => [v.id, v.datum, v.schritt]),
    [['bsp-klausur-anmeldung', '2031-02-24', M.PRUEFUNGEN], ['bsp-klausur-abmeldung', '2031-02-28', M.PRUEFUNGEN]]);
  // Die Anmeldung einer Gruppe gehört zu Schritt 2.
  const b = angebot();
  b.module[0].teile[3].anmeldung = { von: '2030-10-14', bis: '2030-10-16', wo: 'MOSES' };
  const fr = M.rechnen(b, {}).vorkommen.filter((v) => v.quelle === 'frist' && v.teil === 'bsp-ue');
  assert.deepEqual(fr.map((v) => [v.id, v.schritt]), [['bsp-ue-anmeldung-von', 2], ['bsp-ue-anmeldung-bis', 2]]);
  assert.equal(s[3].offen, s[3].zaehler.kritisch + s[3].zaehler.dran);
});

test('Zurücksetzen: ab 2 fallen Gruppen und alle Blöcke heraus, ab 3 nur Blöcke, ab 4 nur Lernblöcke — Prüfungen bleiben', () => {
  const a = angebot();
  const plan = {
    wahl: { 'bsp-ue': 'g1' }, pruefungstermin: { 'bsp-klausur': '2031-03-03' }, angemeldet: { 'bsp-klausur': true },
    bestaetigt: { 'video:bsp-video': true }, ist: { 'b@2030-10-14': 'ja' },
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
  assert.deepEqual(r2.ist, plan.ist, 'die Ist-Erfassung bleibt');
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

test('Vorgabe je Woche: Video so lang wie seine Einheiten ÷ Videowochen; EVL 1,5–2 h, k je Woche oder alle n Wochen — Vor-/Nachbereitung halbiert (V-0356)', () => {
  const e = M.rechnen(angebot(), {});
  const v = M.vorgabe(e, 'bsp-video');
  // Zwei Videos ab W02 brauchen 4 h; verteilt auf die 15 Wochen ab der ersten Freigabe: 30 min je Woche.
  assert.deepEqual([v.anzahl, v.alle, v.wochen, v.dauer_min], [1, 1, 15, 30]);
  assert.equal(v.video_min, 240);
  // 26 h Nachbereitung (30 − 4 h Videos) in 16 Vorlesungswochen: 1:45 h jede Woche, 15 Wochen (26,25 h) — als Vor- und
  // Nachbereitung halbiert (V-0356): zweimal 45 min (22,5 h liegt näher an 26 h als zweimal 1 h = 30 h).
  const n = M.vorgabe(e, 'bsp-vn');
  assert.deepEqual([n.dauer_min, n.anzahl, n.alle, n.wochen, n.summe_min], [45, 2, 1, 15, 15 * 90]);
  const vl = e.wochen.filter((w) => w.art === 'vorlesung');
  assert.equal(n.bis, vl[14].bis, 'endet mit der 15. Vorlesungswoche');
  // Ohne Videos ist die ganze Nachbereitung 30 h: 2 h jede Woche, 15 Wochen — halbiert: zweimal 1 h (Silas: „eine Stunde als
  // Vorbereitung, eine Stunde als Nachbereitung“).
  const a = angebot(); a.module[0].teile.splice(1, 1);
  const n30 = M.vorgabe(M.rechnen(a, {}), 'bsp-vn');
  assert.deepEqual([n30.dauer_min, n30.anzahl, n30.alle, n30.wochen, n30.summe_min], [60, 2, 1, 15, 30 * 60]);
  const mitBis = M.rechnen(a, { bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00', bis: n30.bis }] });
  assert.equal(mitBis.teile.get('bsp-vn').ist_min, 30 * 60, 'der gelegte Block trägt genau das Kontingent');
  assert.equal(M.vorgabe(e, 'bsp-vl'), null, 'Präsenz hat keine Vorgabe');
  assert.equal(M.vorgabe(e, 'bsp-pv'), null, 'den Prüfungs-Topf planst du unter „Prüfungen“');
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

test('Fahrzeit: 45 min vor dem ersten und nach dem letzten Termin vor Ort, online zählt nicht', () => {
  const m = M.min;
  assert.equal(M.REGELN.pendeln_min, 45, 'Silas, 12.10.: 45 Minuten (V-0338: 40)');
  assert.deepEqual(M.fahrzeiten([{ start: m('10:15'), ende: m('11:45'), ort: 'H 104' }, { start: m('16:15'), ende: m('17:45') }]),
    [[m('09:30'), m('10:15')], [m('17:45'), m('18:30')]]);
  assert.deepEqual(M.fahrzeiten([{ start: m('10:15'), ende: m('11:45'), ort: 'online (Zoom)' }]), [], 'nur online: keine Fahrt');
  assert.deepEqual(M.fahrzeiten([]), []);
});

test('Freie Lücke in einem eigenen Fenster (Prüfungsvorbereitung in der Vorlesungszeit: 7–22 Uhr)', () => {
  const e = M.rechnen(angebot(), {});
  // Di 15.10.2030: VL 10:15–11:45. Im Lernfenster 9–19 ist 11:45–19:00 die größte Lücke, in 7–22 Uhr 11:45–22:00.
  assert.deepEqual(M.freieLuecke(e, '2030-10-15'), [M.min('11:45'), M.min('19:00')]);
  assert.deepEqual(M.freieLuecke(e, '2030-10-15', [], ['07:00', '22:00']), [M.min('11:45'), M.min('22:00')]);
});

test('Vorschlag: die zwei Wochenenden vor der Prüfung je 10 h, dann 4 h je Wochenende — nie über die Kapazität, nie an Feiertagen', () => {
  // Klausur Mo 03.03.2031, 90 h Vorbereitung, vorlesungsfrei ab 16.02.: erst Sa/So 01./02.03. und 22./23.02. (je 10 h, 9 h
  // je Tag), dann je Wochenende 4 h rückwärts (V-0357).
  const e = M.rechnen(angebot(), {}, { heute: '2030-10-14' });
  const X = e.pruefungen.get('bsp-klausur');
  const tag = Object.fromEntries(X.vorschlag.map((v) => [v.datum, v.min / 60]));
  assert.equal(tag['2031-03-01'] + tag['2031-03-02'], 10);
  assert.equal(tag['2031-02-22'] + tag['2031-02-23'], 10);
  assert.ok(Object.values(tag).every((x) => x <= 9));
  assert.equal(tag['2031-02-15'] + tag['2031-02-16'], 4, 'das dritte Wochenende davor: 4 h');
  assert.equal(X.vorschlag.reduce((s, v) => s + v.min, 0), 90 * 60);
  assert.equal(X.passt_nicht_min, 0);
  // In der Vorlesungszeit nur Sa/So; nie vor heute, nie an Feiertagen (24.–26.12., 31.12., 01.01.).
  assert.ok(X.vorschlag.every((v) => v.datum >= '2030-10-14'));
  assert.ok(X.vorschlag.filter((v) => v.datum <= '2031-02-15' && !M.istFrei(SEM, v.datum)).every((v) => M.wochentag(v.datum) >= 5));
  assert.ok(!X.vorschlag.some((v) => ['2030-12-24', '2030-12-25', '2030-12-26', '2030-12-31', '2031-01-01'].includes(v.datum)));
  // Was schon liegt, zählt zum Wochenende (V-0356): 6 h am Sa 01.03. → Sa nichts mehr, So 02.03. 4 h (10 h je Wochenende).
  const mit = M.rechnen(angebot(), { bloecke: [{ id: 'a', teil: 'bsp-pv', datum: '2031-03-01', start: '09:00', ende: '15:00' }] }, { heute: '2030-10-14' });
  const Y = mit.pruefungen.get('bsp-klausur');
  assert.equal(Y.geplant_min, 360);
  assert.equal((Y.vorschlag.find((v) => v.datum === '2031-03-01') || { min: 0 }).min, 0);
  assert.equal((Y.vorschlag.find((v) => v.datum === '2031-03-02') || { min: 0 }).min, 240);
  assert.equal(Y.vorschlag.reduce((s, v) => s + v.min, 0), 84 * 60);
});

test('Mittagspause: 45 min im ersten freien Fenster 11:30–14:30, sonst um 12:30', () => {
  const m = M.min;
  assert.deepEqual(M.mittagspause([[m('10:00'), m('12:00')]]), [m('12:00'), m('12:45')]);
  assert.deepEqual(M.mittagspause([[m('11:00'), m('15:00')]]), [m('12:30'), m('13:15')], 'kein Platz: trotzdem zeigen');
  assert.deepEqual(M.mittagspause([]), [m('11:30'), m('12:15')]);
  // Nicht in der Fahrt zu einem Termin um 12:15 (V-0345): die Fahrzeit 11:30–12:15 ist belegt.
  assert.deepEqual(M.mittagspause([[m('11:30'), m('12:15')], [m('12:15'), m('13:45')]]), [m('13:45'), m('14:30')]);
  // Kein ganzes Fenster: in die längste Lücke (Fr: Fahrt 11:30, BuK 12:15–13:45, PROG1 ab 14:15 → 13:45).
  assert.deepEqual(M.mittagspause([[m('11:30'), m('12:15')], [m('12:15'), m('13:45')], [m('14:15'), m('15:45')]]), [m('13:45'), m('14:30')]);
  // Gezogen gilt sie, wo Silas sie hingelegt hat — auch über Belegtem.
  assert.deepEqual(M.mittagspause([[m('12:00'), m('14:00')]], M.REGELN, m('13:00')), [m('13:00'), m('13:45')]);
});

test('Tageslast: Termine als Doppelstunde, Blöcke mit ihrer Dauer, Ausweichtermine nicht', () => {
  const e = M.rechnen(angebot(), { bloecke: [{ id: 'b', teil: 'bsp-vn', datum: '2030-10-15', start: '13:00', ende: '15:00' }] });
  assert.equal(M.tagesLast(e, '2030-10-15'), 120 + 120);
});

test('Keine Vorschläge für die Woche: der Lernplan-Vorschlag bleibt entfernt (V-0333) — nur die Prüfungsvorbereitung hat einen (V-0349)', () => {
  // Silas, 11.10.: „Es sollen nicht so wie jetzt Vorschläge zu den ganzen Sachen kommen.“ Am 12.10. wollte er für die
  // Prüfungsvorbereitung ausdrücklich einen: „als Vorschlag vom System in Weihnachtspause und Januarwochenenden verteilen“.
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
  assert.equal(z.kontingent_min, 180, 'Kontingent der Videos = Summe der Wochen');
  // In Minuten (V-0357): 21.10. deckt 1,5 von 2 h der Woche 2, 28.10. den Rest (0,5 h) und Woche 3 (1 h) — danach ist
  // nichts mehr zu schauen, der Block am 04.11. zählt nicht.
  assert.deepEqual(z.vk.filter((v) => v.zaehlt_min > 0).map((v) => [v.datum, v.zaehlt_min]), [['2030-10-21', 90], ['2030-10-28', 90]]);
  assert.ok(z.vk.find((v) => v.datum === '2030-11-04').flags.includes('leer'));
  // Ein ✗ deckt nichts (V-0357): Dann holt der nächste Block nach, und der am 04.11. zählt wieder.
  const blk = M.rechnen(a, plan).vorkommen.find((v) => v.block === 'v' && v.datum === '2030-10-21');
  const mitX = M.rechnen(a, { ...plan, ist: { [blk.id]: 'nein' } }).teile.get('bsp-video');
  assert.deepEqual(mitX.vk.filter((v) => v.zaehlt_min > 0 && !v.deckt_nicht).map((v) => v.datum), ['2030-10-28', '2030-11-04']);
  assert.ok(!z.flags.some((f) => f.art === 'laenge'));
  a.module[0].teile[1].einheiten.liste[2].laenge_min = null;
  const ohne = M.rechnen(a, plan).teile.get('bsp-video');
  assert.ok(ohne.flags.some((f) => f.art === 'laenge' && f.stufe === 'kommt' && /1 Videolängen kommen noch/.test(f.text)));
  assert.ok(M.rechnen(a, plan, { heute: '2030-10-29' }).teile.get('bsp-video').flags.some((f) => f.art === 'laenge' && f.stufe === 'dran'), 'erschienen: Länge eintragen');
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

test('Einheiten ohne Datum: jeder Block zählt, das Fenster ist „Info fehlt“ (Augen offen)', () => {
  const a = angebot();
  a.module[0].teile[2].einheiten = { anzahl: 12 };
  const z = M.rechnen(a, { bloecke: [{ id: 'l', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '11:00' }] }).teile.get('bsp-vn');
  assert.equal(z.ist_min, 16 * 120);
  assert.ok(z.flags.some((f) => f.art === 'info_fehlt' && f.stufe === 'kommt'));
});

test('Fristen: ISIS geht vor, sonst § 63 als Verweis — Anmeldung, Abmeldung; an Gruppen die Anmeldung', () => {
  const a = angebot();
  a.module[0].pruefungen[0].anmeldung = { von: '2030-10-19', von_zeit: '18:00', bis: '2030-11-30', bis_zeit: '23:59', wo: 'MTS (über MOSES)' };
  a.module[0].teile[3].anmeldung = { bis: '2030-10-16', wo: 'MOSES' };
  const e = M.rechnen(a, {});
  const f = e.vorkommen.filter((v) => v.quelle === 'frist');
  const bis = f.find((v) => v.id === 'bsp-klausur-anmeldung');
  assert.equal(bis.datum, '2030-11-30');
  assert.equal(bis.punkt, M.min('23:59'));
  assert.ok(bis.wichtig);
  assert.match(bis.titel, /Anmeldung endet \(MTS\)$/);
  assert.ok(f.some((v) => v.id === 'bsp-klausur-anmeldung_ab' && v.datum === '2030-10-19'));
  assert.ok(f.some((v) => v.id === 'bsp-ue-anmeldung-bis' && v.teil === 'bsp-ue'));
  // Ohne ISIS-Frist: Anmeldung bis eine Woche, Abmeldung bis drei Tage vor der Klausur (Mo 03.03.).
  const r = M.rechnen(angebot(), {}).pruefungen.get('bsp-klausur').fristen;
  assert.deepEqual(r.filter((x) => !x.regel).map((x) => [x.art, x.datum]), [['anmeldung', '2031-02-24'], ['abmeldung', '2031-02-28']]);
});

test('Prüfungswahl: offen gilt der früheste Termin (G7), gewählt der gewählte — der andere bleibt als Rückfall stehen', () => {
  const a = angebot();
  a.module[0].pruefungen[0].termine.push({ datum: '2031-03-10', start: '10:00', ende: '11:30' });
  const ohne = M.rechnen(a, {});
  const X = ohne.pruefungen.get('bsp-klausur');
  assert.equal(X.alternativen, 'wahl_offen');
  assert.equal(X.annahme, true);
  assert.ok(ohne.module[0].flags.some((f) => f.art === 'pruefung_wahl'));
  assert.equal(ohne.teile.get('bsp-pv').pruefungstermin.datum, '2031-03-03');
  const mit = M.rechnen(a, { pruefungstermin: { 'bsp-klausur': '2031-03-10' } });
  assert.equal(mit.pruefungen.get('bsp-klausur').alternativen, 'gewaehlt');
  assert.equal(mit.teile.get('bsp-pv').pruefungstermin.datum, '2031-03-10');
  assert.deepEqual(mit.vorkommen.filter((v) => v.quelle === 'pruefung').map((v) => [v.datum, v.wichtig]), [['2031-03-03', false], ['2031-03-10', true]]);
  // Die Fristen wandern mit (Verweise): Anmeldung bis 03.03., Abmeldung bis 07.03.
  assert.deepEqual(mit.pruefungen.get('bsp-klausur').fristen.filter((x) => !x.regel).map((x) => x.datum), ['2031-03-03', '2031-03-07']);
});

test('Abgleich: zwei Prüfungen an einem Tag melden sich (Achtung)', () => {
  const a = angebot();
  a.module[0].pruefungen.push({ id: 'bsp-b', titel: 'Zweite', termine: [{ datum: '2031-03-03', start: '13:00', ende: '14:00' }] });
  const e = M.rechnen(a, {});
  assert.deepEqual(e.audit.pruefungstage.map((x) => [x.datum, x.pruefungen.length]), [['2031-03-03', 2]]);
  assert.ok(e.planFlags.some((f) => f.art === 'zwei_pruefungen' && f.stufe === 'achtung'));
});

test('Bilanz: LP × 30 h = Semester-Topf + Prüfungs-Topf; erledigt zählt erst mit ✓ (G6)', () => {
  const plan = { wahl: { 'bsp-ue': 'g2' }, bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '08:00', ende: '10:00' }] };
  const e = M.rechnen(angebot(), plan, { heute: '2030-10-25' });
  assert.equal(e.summe.semester_min + e.summe.pruefung_min, e.summe.soll_min);
  assert.equal(e.summe.erledigt_min, 0, 'nichts abgehakt');
  const vk = e.vorkommen.filter((v) => v.vergangen);
  assert.ok(vk.length > 0 && vk.every((v) => v.ist === 'offen'));
  const ist = Object.fromEntries(vk.map((v) => [v.id, 'ja']));
  const f = M.rechnen(angebot(), { ...plan, ist }, { heute: '2030-10-25' });
  assert.equal(f.summe.erledigt_min, vk.reduce((s, v) => s + v.zaehlt_min, 0));
});

test('Phasen: Vorlesungszeit, Pause, vorlesungsfreie Zeit', () => {
  const ps = M.phasen(SEM);
  assert.deepEqual(ps.map((p) => p.id), ['vorlesung', 'pause', 'frei']);
  assert.equal(ps[2].von, '2031-02-16');
  assert.equal(M.phaseVon(SEM, '2030-12-28').id, 'pause');
  assert.equal(M.phaseVon(SEM, '2031-03-01').id, 'frei');
});

test('Annahmen an einem Ort: Regeln, Texte, Videolängen, erwartete Termine', () => {
  const a = angebot();
  a.module[0].teile[1].annahme = 'zwei Videos angenommen';
  a.module[0].teile[1].einheiten.laenge_min = null;
  a.module[0].teile[3].optionen = []; a.module[0].teile[3].wahl = true; a.module[0].teile[3].erwartet = { anzahl: 12 };
  const e = M.rechnen(a, {});
  const liste = M.annahmen(a, e);
  assert.ok(liste.some((x) => x.id === 'regel:lp_h' && x.fest));
  assert.ok(liste.some((x) => x.id === 'regel:woche_h' && x.wert === 45));
  assert.ok(liste.some((x) => x.id === 'text:bsp-video'));
  assert.ok(liste.some((x) => x.id === 'video:bsp-video' && x.feld === 'annahme_min'));
  assert.ok(liste.some((x) => x.id === 'erwartet:bsp-ue' && x.wert === 12));
  assert.ok(M.luecken(e).every((f, i, l) => i === 0 || M.STUFEN.indexOf(l[i - 1].stufe) <= M.STUFEN.indexOf(f.stufe)));
});

test('Serie mit Angaben je Tag', () => {
  const a = angebot();
  a.module[0].teile[0].termine.tage = { '2030-10-22': { titel: 'Übung statt VL' } };
  const e = M.rechnen(a, {});
  assert.equal(e.teile.get('bsp-vl').vk.find((v) => v.datum === '2030-10-22').titel, 'Übung statt VL');
});

// ── V-0332: Stufen nach Datum, Phase und Stand der Prüfung; Wochenbedarf ───────────────────────

test('Stufen: Prüfungsanmeldung „du bist dran“, solange sie läuft, in der letzten Woche kritisch, vorbei kritisch; angemeldet nichts', () => {
  const a = angebot();
  a.module[0].pruefungen[0].anmeldung = { von: '2030-11-01', bis: '2030-11-30', wo: 'MOSES' };
  const stufe = (heute, plan = {}) => M.rechnen(a, plan, { heute }).module[0].flags.filter((f) => f.art === 'anmeldung').map((f) => f.stufe);
  assert.deepEqual(stufe('2030-10-20'), ['info']);
  assert.deepEqual(stufe('2030-11-05'), ['dran']);
  assert.deepEqual(stufe('2030-11-25'), ['kritisch']);
  assert.deepEqual(stufe('2030-12-02'), ['kritisch'], 'vorbei: angemeldet? Dann Stand setzen');
  assert.deepEqual(stufe('2030-11-25', { pruefung: { 'bsp-klausur': { status: 'angemeldet' } } }), []);
});


test('Stufen: „Info fehlt“ ist bis zum Stichtag grau (Augen offen), danach orange (nachfragen) — kein Fehler', () => {
  const a = angebot();
  a.module[0].teile[3].optionen = []; a.module[0].teile[3].wahl = true; a.module[0].teile[3].stichtag = '2030-10-17';
  const st = (heute) => M.rechnen(a, {}, { heute }).teile.get('bsp-ue').flags.find((f) => f.art === 'info_fehlt').stufe;
  assert.equal(st('2030-10-15'), 'kommt');
  assert.equal(st('2030-10-18'), 'achtung');
  assert.equal(M.rechnen(a, {}, { heute: '2030-10-15' }).teile.get('bsp-ue').info.stichtag, '2030-10-17');
});

test('Gruppe mit Zuteilung: Wunsch → angemeldet → Zuteilung offen → zugeteilt; nach der Frist ohne Bestätigung nachfragen, kein Platz gescheitert', () => {
  const a = angebot();
  a.module[0].teile[3].zuteilung = true;
  a.module[0].teile[3].anmeldung = { von: '2030-10-01', bis: '2030-10-20', wo: 'MOSES' };
  const z = (plan, heute = '2030-10-10') => M.rechnen(a, plan, { heute }).teile.get('bsp-ue');
  assert.equal(z({}).alternativen, 'wahl_offen');
  assert.equal(z({}, '2030-10-15').flags.find((f) => f.art === 'wahl_offen').stufe, 'kritisch', 'letzte Woche der Anmeldung');
  const wunsch = z({ wahl: { 'bsp-ue': 'g1' } });
  assert.equal(wunsch.alternativen, 'wahl_offen');
  assert.equal(wunsch.plan_min, 0, 'ein Wunsch ist nicht verplant');
  assert.ok(wunsch.vk.every((v) => v.annahme && v.hart), 'steht als Arbeitsannahme da und sperrt');
  assert.equal(z({ wahl: { 'bsp-ue': 'g1' }, angemeldet: { 'bsp-ue': true } }).alternativen, 'zuteilung_offen');
  const zu = z({ wahl: { 'bsp-ue': 'g1' }, angemeldet: { 'bsp-ue': true }, zugeteilt: { 'bsp-ue': 'g1' } });
  assert.equal(zu.alternativen, 'gewaehlt');
  assert.equal(zu.plan_min, 3 * 120);
  // Nach der Frist ohne Bestätigung fragt die Seite (V-0357), statt „gescheitert“ zu sagen — mit beiden Knöpfen.
  const vorbei = z({ wahl: { 'bsp-ue': 'g1' } }, '2030-10-21');
  assert.equal(vorbei.alternativen, 'frist_vorbei', 'nach der Frist ohne Anmeldung: nachfragen');
  assert.ok(vorbei.flags.some((f) => f.art === 'frist_vorbei' && f.stufe === 'achtung' && f.anmeldung === 'bsp-ue'));
  assert.equal(z({ wahl: { 'bsp-ue': 'g1' }, angemeldet: { 'bsp-ue': true }, zugeteilt: { 'bsp-ue': 'keine' } }).alternativen, 'gescheitert', 'kein Platz');
  // Ein Rückfalltermin einer Prüfung auf der VL ist kein Konflikt.
  a.module[0].pruefungen[0].termine.push({ datum: '2030-10-15', start: '10:00', ende: '11:00', wichtig: false });
  assert.ok(!M.rechnen(a, {}).teile.get('bsp-vl').flags.some((f) => f.art === 'konflikt'));
});

test('Wochenbedarf: was dran wäre, was eingeplant ist, was fehlt — und warum', () => {
  const a = angebot();
  a.module[0].teile[3].optionen = []; a.module[0].teile[3].wahl = true; a.module[0].teile[3].erwartet = { anzahl: 14 };
  const plan = { bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Do', start: '09:00', ende: '10:00' }] };
  const e = M.rechnen(a, plan);
  const std = Object.fromEntries(M.wochenBedarf(a, plan, e).map((b) => [b.z.teil.id, b]));
  assert.equal(std['bsp-vl'].grund, 'ok');
  assert.equal(std['bsp-ue'].grund, 'kommt');
  assert.equal(std['bsp-ue'].soll_min, 120, 'eine erwartete Doppelstunde je Woche');
  assert.equal(std['bsp-vn'].grund, 'planen');
  assert.equal(std['bsp-vn'].soll_min, Math.round(e.teile.get('bsp-vn').wochenwert_min), 'die Standardwoche will den Wochenwert');
  assert.equal(std['bsp-vn'].ist_min, 60);
  assert.ok(!('bsp-pv' in std), 'der Prüfungs-Topf steht unter „Prüfungen“');
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

// ── Stoff und Bezug (V-0342) ─────────────────────────────────────────────────────────────────────

test('Vor dem ersten Stoff zählt ein Lernblock nicht (Silas: „morgen steht bei mir Programmieren 1 Quick Tests“)', () => {
  // Die erste VL ist Di 15.10.: Der Montagsblock der ersten Woche hat nichts nachzubereiten, ab W02 zählt er.
  const e = M.rechnen(angebot(), { bloecke: [{ id: 'b', teil: 'bsp-vn', tag: 'Mo', start: '14:00', ende: '16:00' }] });
  const vn = e.teile.get('bsp-vn');
  const vk = vn.vk.filter((v) => v.block === 'b');
  assert.equal(vk[0].datum, '2030-10-14');
  assert.equal(vk[0].zaehlt_min, 0);
  assert.ok(vk[0].flags.includes('vor_stoff'));
  assert.equal(vk[1].zaehlt_min, 120);
  assert.equal(vn.ist_min, (vk.length - 1) * 120);
  assert.equal(vn.stoff_ab, '2030-10-15');
  const f = vn.flags.find((x) => x.art === 'vor_stoff');
  assert.match(f.text, /1 Block liegt vor dem ersten Stoff \(VL Di 15\.10\.\)/);
  assert.equal(f.stufe, 'info');
  // Am Tag der ersten VL zählt erst, was nach ihrem Ende beginnt.
  const am = M.rechnen(angebot(), { bloecke: [{ id: 'f', teil: 'bsp-vn', datum: '2030-10-15', start: '09:00', ende: '10:00' }, { id: 's', teil: 'bsp-vn', datum: '2030-10-15', start: '12:00', ende: '14:00' }] });
  assert.deepEqual(am.teile.get('bsp-vn').vk.map((v) => v.zaehlt_min), [0, 120]);
  // Teile mit Einheiten (Quizze) regeln das über ihre Freigaben, nicht über den Stoff.
  const a = angebot();
  a.module[0].teile.push({ id: 'bsp-quiz', titel: 'Quiz', art: 'selbst', posten: 'vn', soll_h: 2, einheiten: { liste: [{ nr: 1, ab: '2030-10-14' }] } });
  const q = M.rechnen(a, { bloecke: [{ id: 'q', teil: 'bsp-quiz', datum: '2030-10-14', start: '14:00', ende: '15:00' }] }).teile.get('bsp-quiz');
  assert.equal(q.ist_min, 60);
  // Was eine Woche vor dem Stoff „dran“ wäre: nichts (beginnt die VL erst in W02, kommt das erste Video am 21.10.).
  const spaet = angebot(); spaet.module[0].teile[0].termine.von = '2030-10-22';
  const es = M.rechnen(spaet, {});
  const bedarf = (w) => M.wochenBedarf(spaet, {}, es, w).find((x) => x.z.teil.id === 'bsp-vn');
  assert.equal(es.teile.get('bsp-vn').stoff_ab, '2030-10-21');
  assert.equal(bedarf('2030-10-14').soll_min, 0);
  assert.equal(bedarf('2030-10-21').soll_min, Math.round(es.teile.get('bsp-vn').soll_min / 15));
});

test('Ein Block beginnt mit dem Stoff: vorgabe().ab, und mit ab liegt er davor gar nicht erst', () => {
  const e = M.rechnen(angebot(), {});
  assert.equal(M.vorgabe(e, 'bsp-video').ab, '2030-10-21', 'Video: ab der ersten Freigabe');
  assert.equal(M.vorgabe(e, 'bsp-vn').ab, '2030-10-15', 'Lernblock: ab dem ersten Stoff');
  const mit = M.rechnen(angebot(), { bloecke: [{ id: 'b', teil: 'bsp-video', tag: 'Mo', start: '14:00', ende: '16:00', ab: '2030-10-21' }] });
  const vk = mit.vorkommen.filter((v) => v.block === 'b');
  assert.equal(vk[0].datum, '2030-10-21');
  assert.ok(!vk.some((v) => v.flags.includes('leer') && v.datum < '2030-10-28'), 'keine durchgestrichene Woche vor der Freigabe');
});

test('Bezug: direkt nach dem Stoff, direkt vor einer Präsenz, nah, weit weg — und ein Hinweis, wenn er meist weit weg liegt', () => {
  const plan = { bloecke: [
    { id: 'nach', teil: 'bsp-vn', tag: 'Di', start: '12:00', ende: '13:30' }, // VL Di bis 11:45
    { id: 'vor', teil: 'bsp-vn', tag: 'Di', start: '08:00', ende: '09:30' },  // vor der VL um 10:15
    { id: 'nah', teil: 'bsp-vn', tag: 'Do', start: '14:00', ende: '15:30' },  // zwei Tage danach
    { id: 'weit', teil: 'bsp-vn', tag: 'Mo', start: '14:00', ende: '15:30' }, // sechs Tage danach
  ] };
  const e = M.rechnen(angebot(), plan);
  const am = (id, datum) => e.vorkommen.find((v) => v.block === id && v.datum === datum).bezug;
  assert.equal(am('nach', '2030-10-22').lage, 'direkt');
  assert.match(am('nach', '2030-10-22').text, /^direkt nach VL \(Di 10:15\)/);
  assert.equal(am('vor', '2030-10-22').lage, 'direkt');
  assert.match(am('vor', '2030-10-22').text, /^direkt vor VL/);
  assert.equal(am('nah', '2030-10-24').lage, 'nah');
  assert.match(am('nah', '2030-10-24').text, /^2 Tage nach VL/);
  assert.equal(am('weit', '2030-10-28').lage, 'fern');
  const hinweise = e.teile.get('bsp-vn').flags.filter((f) => f.art === 'bezug');
  assert.deepEqual(hinweise.map((f) => f.block), ['weit']);
  assert.match(hinweise[0].text, /Block Mo 14:00 liegt meist weit weg vom Stoff \(\d\d\.\d\d\.: 6 Tage nach VL/);
  // Ein geschautes Video ist Stoff: die Nachbereitung direkt nach dem Videoblock liegt direkt daran.
  const v = M.rechnen(angebot(), { bloecke: [{ id: 'v', teil: 'bsp-video', tag: 'Mo', start: '08:00', ende: '10:00', ab: '2030-10-21' }, { id: 'n', teil: 'bsp-vn', tag: 'Mo', start: '10:00', ende: '11:30' }] });
  const n = v.vorkommen.find((x) => x.block === 'n' && x.datum === '2030-10-21').bezug;
  assert.equal(n.lage, 'direkt');
  assert.match(n.text, /^direkt nach Videos \(Mo 08:00\)/);
});

test('Bezug offen: hat die eigene Lehrveranstaltung noch keine Termine (Übung ohne Gruppe), urteilt er nicht', () => {
  const a = angebot();
  a.module[0].teile.push({ id: 'bsp-ue-vn', titel: 'Übung · Nachbereitung', art: 'selbst', posten: 'ue', soll_h: 5 });
  const e = M.rechnen(a, { bloecke: [{ id: 'u', teil: 'bsp-ue-vn', tag: 'Mo', start: '14:00', ende: '15:30' }] });
  const z = e.teile.get('bsp-ue-vn');
  assert.equal(z.stoff_eigen, false);
  assert.ok(z.vk.filter((v) => v.zaehlt_min > 0).every((v) => v.bezug.lage === 'offen'));
  assert.ok(!z.flags.some((f) => f.art === 'bezug'));
  // Der Beginn kommt trotzdem vom Stoff des Moduls: die erste Woche zählt nicht.
  assert.ok(z.vk[0].flags.includes('vor_stoff'));
  // Mit gewählter Gruppe ist der Bezug die Übung.
  const g = M.rechnen(a, { wahl: { 'bsp-ue': 'g2' }, bloecke: [{ id: 'u', teil: 'bsp-ue-vn', tag: 'Mi', start: '10:00', ende: '11:30' }] }).teile.get('bsp-ue-vn');
  assert.equal(g.stoff_eigen, true);
  assert.match(g.vk[1].bezug.text, /^direkt nach Übung \(Mi 08:15\)/);
});

// ── V-0345 ──────────────────────────────────────────────────────────────────────────────────────

test('Seltener als alle zwei Wochen: einzeln in echte Wochen; mit Einheiten nur an Tagen, an denen eine offen ist', () => {
  const a = angebot();
  a.module[0].teile.push({ id: 'bsp-lit', titel: 'Literatur', art: 'selbst', posten: 'vn', soll_h: 6 });
  a.module[0].teile.push({ id: 'bsp-quiz', titel: 'Quiz', art: 'selbst', posten: 'vn', soll_h: 2,
    einheiten: { liste: [{ nr: 1, ab: '2030-10-21', bis: '2030-10-23' }, { nr: 2, ab: '2030-11-04' }] } });
  const e = M.rechnen(a, {});
  const v = M.vorgabe(e, 'bsp-lit');
  assert.equal(v.einzeln, true, '6 h: 2 h alle fünf Wochen wäre ein Wochenmuster seltener als alle zwei Wochen');
  assert.equal(v.alle, 1);
  assert.equal(v.wochen * v.dauer_min, v.summe_min);
  assert.ok(Math.abs(v.summe_min - 6 * 60) <= 60);
  assert.ok(!M.vorgabe(M.rechnen(angebot(), {}), 'bsp-vn').einzeln, 'jede Woche bleibt ein Wochenmuster');
  // Ohne Einheiten: jeder Tag der Vorlesungszeit ab dem ersten Stoff (VL Di 15.10.), nicht in der Pause.
  const lit = M.blockTagErlaubt(e, 'bsp-lit');
  assert.equal(lit('2030-10-14'), false);
  assert.equal(lit('2030-10-16'), true);
  assert.equal(lit('2030-12-27'), false);
  // Mit Einheiten: von der Freigabe bis zur Frist, ohne Frist bis zur nächsten Freigabe.
  const q = M.blockTagErlaubt(e, 'bsp-quiz');
  assert.deepEqual(['2030-10-20', '2030-10-21', '2030-10-23', '2030-10-24', '2030-11-04', '2030-11-20'].map(q), [false, true, true, false, true, true]);
});

test('Probepläne: stand?plan=n liegt getrennt vom echten Plan, ohne Sicherung; plaene listet sie', async () => {
  const kv = new Map();
  const env = { SILAS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) }, SILAS_SCHLUESSEL: '' };
  const k = 'a'.repeat(40);
  env.SILAS_SCHLUESSEL = createHash('sha256').update(k).digest('hex');
  const rufe = (weg, opts = {}) => silasApi(new Request(`https://x/silas/api/${weg}`, { ...opts, headers: { authorization: `Bearer ${k}` } }), env, new Date('2030-10-01T10:00:00Z'));
  const stand = JSON.stringify({ basis: null, angebot: angebot(), plan: {} });
  assert.equal((await rufe('stand?plan=2', { method: 'PUT', body: stand })).status, 200);
  assert.equal((await rufe('stand')).status, 404, 'der echte Plan bleibt leer');
  assert.equal((await rufe('stand?plan=2')).status, 200);
  assert.ok(![...kv.keys()].some((x) => x.startsWith('verlauf:')), 'Probepläne haben keine Sicherung');
  assert.equal((await rufe('stand?plan=0')).status, 400);
  assert.equal((await rufe('stand?plan=10')).status, 400);
  assert.deepEqual((await (await rufe('plaene')).json()).plaene.map((p) => p.nr), [2]);
  assert.equal((await rufe('stand', { method: 'PUT', body: stand })).status, 200);
  assert.ok([...kv.keys()].some((x) => x.startsWith('verlauf:')), 'der echte schon');
});

test('Kachel-Klassen haben keine eigenen Regeln: eine Klasse an .kachel ist nirgends allein ein Selektor (V-0345)', () => {
  // „reihe“ war Kachel-Klasse UND die geführte Liste links (.reihe { margin: 8px 0 0 }): Die Kachel rutschte 10 min
  // unter ihre Zeit, weg von der Fahrzeit. Eine Klasse, die an .kachel hängt, darf keine Regel ohne .kachel haben.
  const css = readFileSync(new URL('../silas/silas.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const anKachel = new Set([...css.matchAll(/\.kachel((?:\.[a-z][\w-]*)+)/g)].flatMap((m) => m[1].split('.').filter(Boolean)));
  const selektoren = [...css.matchAll(/(^|[},])\s*([^{}@]+?)\s*\{/g)].flatMap((m) => m[2].split(',').map((x) => x.trim()));
  const allein = [];
  for (const sel of selektoren) {
    const m = /^\.([a-z][\w-]*)(?=[\s.:>\[]|$)/.exec(sel);
    if (m && anKachel.has(m[1]) && !['kachel'].includes(m[1])) allein.push(sel);
  }
  assert.deepEqual(allein, []);
});
