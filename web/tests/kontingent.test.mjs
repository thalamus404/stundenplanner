// /silas (V-0349): das Kontingent-Modell (Fassung 4 vom 12.10.2026) — je Regel ein Test, entlang der Testfälle der
// Fassung (in Klammern ihre Nummer). Alle Daten hier sind ERFUNDEN (drei Beispielmodule im Wintersemester 2030/31);
// Silas' echtes Semester liegt nur im KV, nie im Repo (AGENTS.md §2 ①). Die Testfälle mit seinen Zahlen prüft ein
// Skript außerhalb des Repos gegen seinen Stand (docs/SILAS.md §8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../silas/modell.mjs';

const SEM = {
  id: 'test', titel: 'WiSe 2030/31', vorlesung: { von: '2030-10-14', bis: '2031-02-15' },
  frei: [{ von: '2030-12-23', bis: '2031-01-04', titel: 'Weihnachtspause' }], ende: '2031-04-11',
  geschlossen: [{ von: '2030-12-20', bis: '2031-01-06', titel: 'Gebäude geschlossen' }],
};

function angebot() {
  return {
    semester: structuredClone(SEM),
    module: [
      {
        id: 'ANA', nr: 11111, titel: 'Analysis A', lp: 6, farbe: 1,
        posten: [
          { id: 'iv-p', lv: 'IV', titel: 'IV · Präsenzzeit', mult: 15, h: 4 },
          { id: 'iv-vn', lv: 'IV', titel: 'IV · Vor-/Nachbereitung', mult: 15, h: 2 },
          { id: 'tut-p', lv: 'TUT', titel: 'Tutorium · Präsenzzeit', mult: 15, h: 2 },
          { id: 'pv', lv: null, titel: 'Prüfungsvorbereitung', mult: 1, h: 60 },
        ],
        teile: [
          { id: 'ana-iv', titel: 'IV', art: 'praesenz', posten: 'iv-p', termine: { typ: 'serie', tag: 'Fr', start: '10:15', ende: '11:45', von: '2030-10-18', bis: '2031-02-14', ort: 'Z 1' } },
          { id: 'ana-sc', titel: 'Screencasts', art: 'video', posten: 'iv-p', einheiten: { liste: [
            { nr: 1, ab: '2030-10-14', laenge_min: 44 }, { nr: 2, ab: '2030-10-21', laenge_min: 40 }, { nr: 3, ab: '2030-10-21', laenge_min: 40 },
          ] } },
          { id: 'ana-vn', titel: 'Vor-/Nachbereitung', art: 'selbst', posten: 'iv-vn' },
          { id: 'ana-tut', titel: 'Tutorium', art: 'praesenz', posten: 'tut-p', wahl: true, optionen: [], erwartet: { anzahl: 12 }, stichtag: '2030-10-18', offen: 'Tutorientermine kommen in der 1. VL' },
          { id: 'ana-pv', titel: 'Klausurvorbereitung', art: 'pruefung', posten: 'pv', pruefung: 'ana-k' },
        ],
        pruefungen: [{ id: 'ana-k', titel: 'Klausur', form: 'schriftlich', termine: [] }],
      },
      {
        id: 'SYS', nr: 22222, titel: 'Systeme S', lp: 6, farbe: 2,
        posten: [
          { id: 'vl-p', lv: 'VL', titel: 'VL · Präsenzzeit', mult: 15, h: 2 },
          { id: 'vl-vn', lv: 'VL', titel: 'VL · Vor-/Nachbereitung', mult: 15, h: 2 },
          { id: 'ue-p', lv: 'UE', titel: 'Übung · Präsenzzeit', mult: 15, h: 2 },
          { id: 'ue-vn', lv: 'UE', titel: 'Übung · Vor-/Nachbereitung', mult: 15, h: 1 },
          { id: 'quiz', lv: 'UE', titel: 'Bearbeitung der Quizze', mult: 15, h: 1 },
          { id: 'klausur', lv: null, titel: 'Klausur (inkl. Vorbereitung)', mult: 1, h: 60 },
        ],
        teile: [
          { id: 'sys-vl', titel: 'VL', art: 'praesenz', posten: 'vl-p', termine: { typ: 'serie', tag: 'Mi', start: '14:15', ende: '15:45', von: '2030-10-16', bis: '2031-02-12', ort: 'Y 2' } },
          { id: 'sys-vl-vn', titel: 'VL · Nachbereitung', art: 'selbst', posten: 'vl-vn' },
          { id: 'sys-ue', titel: 'Übung', art: 'praesenz', posten: 'ue-p', optionen: [
            { id: 'sys-g1', label: 'G1 · Do 8–10', termine: { typ: 'serie', tag: 'Do', start: '08:15', ende: '09:45', von: '2030-10-31', bis: '2031-02-13', ort: 'X 3' } },
          ] },
          { id: 'sys-ue-vn', titel: 'Übung · Nachbereitung', art: 'selbst', posten: 'ue-vn' },
          { id: 'sys-quiz', titel: 'Quiz', art: 'selbst', posten: 'quiz', quote: { anteil: 0.8, pruefung: 'sys-k' },
            einheiten: { dauer_min: 60, liste: Array.from({ length: 15 }, (_, i) => ({ nr: i + 1, ab: M.plusTage('2030-10-21', 7 * i + (i >= 10 ? 14 : 0)) })) } },
          { id: 'sys-pv', titel: 'Klausurvorbereitung', art: 'pruefung', posten: 'klausur', pruefung: 'sys-k' },
        ],
        pruefungen: [{ id: 'sys-k', titel: 'Klausur', form: 'schriftlich', zulassung: 'Übungsschein: 80 % der Quizpunkte — Voraussetzung für die Prüfungsanmeldung',
          termine: [{ datum: '2031-02-26', start: '10:00', ende: '12:00', label: '1. Termin' }, { datum: '2031-04-09', start: '10:00', ende: '12:00', label: '2. Termin', wichtig: false }] }],
      },
      {
        id: 'POR', nr: 33333, titel: 'Portfolio P', lp: 6, farbe: 3, portfolio: { bestehen: 50, gesamt: 100 },
        posten: [
          { id: 'vl-p', lv: 'VL', titel: 'VL · Präsenzzeit', mult: 15, h: 2 },
          { id: 'vl-vn', lv: 'VL', titel: 'VL · Vor-/Nachbereitung', mult: 15, h: 2 },
          { id: 'ue-p', lv: 'UE', titel: 'Übung · Präsenzzeit', mult: 15, h: 2 },
          { id: 'pv-k', lv: null, titel: 'Prüfungsvorbereitung (Klausur)', mult: 1, h: 50 },
          { id: 'pv-t', lv: null, titel: 'Prüfungsvorbereitung (Test)', mult: 1, h: 40 },
        ],
        teile: [
          { id: 'por-ko', titel: 'Kick-off', art: 'praesenz', posten: 'vl-p', termine: { typ: 'reihe', start: '10:15', ende: '11:45', ort: 'W 4', daten: [{ datum: '2030-10-21' }] } },
          { id: 'por-vid', titel: 'Lehrvideos', art: 'video', posten: 'vl-p', einheiten: { annahme_min: 90, liste: Array.from({ length: 12 }, (_, i) => ({ nr: i + 1, ab: M.plusTage('2030-10-28', 7 * i + (i >= 8 ? 14 : 0)) })) } },
          { id: 'por-vn', titel: 'VL · Vor-/Nachbereitung', art: 'selbst', posten: 'vl-vn' },
          { id: 'por-ue', titel: 'Übung (Fallstudien)', art: 'praesenz', posten: 'ue-p', zuteilung: true, anmeldung: { von: '2030-10-01', bis: '2030-10-16', wo: 'MOSES' }, optionen: [
            { id: 'por-g1', label: 'G1 · Mo 14–16', termine: { typ: 'reihe', start: '14:15', ende: '15:45', ort: 'V 5', daten: ['2030-11-04', '2030-12-02', '2031-01-13', '2031-01-27', '2031-02-10'].map((datum) => ({ datum })) } },
          ] },
          { id: 'por-ue-vb', titel: 'Vorbereitung auf die Übungen', art: 'selbst', posten: 'vl-vn', vorbereitung_auf: 'por-ue', einheiten: { dauer_min: 120 } },
          { id: 'por-fs', titel: 'Klausur-Fragestunde', art: 'praesenz', topf: 'pruefung', pruefung: 'por-k', termine: { typ: 'reihe', start: '10:15', ende: '11:45', ort: 'online (Zoom)', daten: [{ datum: '2031-02-24' }] } },
          { id: 'por-pv-t', titel: 'Testvorbereitung', art: 'pruefung', posten: 'pv-t', pruefung: 'por-t' },
          { id: 'por-pv-k', titel: 'Klausurvorbereitung', art: 'pruefung', posten: 'pv-k', pruefung: 'por-k' },
        ],
        pruefungen: [
          { id: 'por-t', titel: 'Online-Test (20 P)', form: 'Portfolio', punkte: 20, anmeldung: { von: '2030-10-21', bis: '2030-11-30', wo: 'MTS' },
            termine: [{ datum: '2030-12-16', start: '10:15', ende: '10:45', ort: 'online (ISIS)' }, { datum: '2031-02-17', start: '10:15', ende: '10:45', nachholen: true }] },
          { id: 'por-k', titel: 'Präsenzklausur (80 P)', form: 'Portfolio', punkte: 80,
            termine: [{ datum: '2031-03-06', start: '08:30', ende: '10:30' }, { datum: '2031-03-31', start: '09:30', ende: '11:30', wichtig: false }] },
        ],
      },
    ],
    termine: [],
  };
}
const heute = '2030-10-14';
const rechne = (plan = {}, opt = {}) => M.rechnen(angebot(), plan, { heute, ...opt });
const h = (m) => Math.round(m / 6) / 10;

// ── Kontingent, Töpfe, Termine zuerst ───────────────────────────────────────────────────────────

test('G1/G2: je Modul 180 h = Semester-Topf + Prüfungs-Topf; zusammen 540 h', () => {
  const e = rechne();
  for (const r of e.module) assert.equal(r.semester_min + r.pruefung_min, 180 * 60, r.modul.id);
  assert.equal(e.summe.soll_min, 540 * 60);
});

test('Videos (1, 28): eine Woche braucht ihre Längen + 15 min auf 30 min; der Wochenbedarf ist nur, was erschienen ist', () => {
  const e = rechne();
  const z = e.teile.get('ana-sc');
  assert.deepEqual(z.gruppen.map((g) => g.bedarf_min), [60, 120], '44 + 15 → 1 h; 40 + 40 + 15 → 2 h');
  assert.equal(z.kontingent_min, 180);
  const w = (id) => M.bedarfIn(e, z, e.wochen.find((x) => x.id === id));
  assert.deepEqual([w('2030-10-14'), w('2030-10-21'), w('2030-10-28')], [60, 120, 0]);
});

test('Termine zuerst (2, 7, 24): eine Serie zählt jede Doppelstunde, eine Reihe ihre Daten; geprüft wird gegen höchstens 15', () => {
  const e = rechne({ wahl: { 'por-ue': 'por-g1' } });
  const vl = e.teile.get('sys-vl');
  const n = vl.vk.filter((v) => !v.ausgefallen).length;
  assert.equal(n, 16);
  assert.equal(vl.termine_min, 16 * 120);
  assert.equal(vl.audit_min, 15 * 120, 'die 16. Woche ist Luft');
  const P = e.posten.find((x) => x.id === 'SYS/vl-p');
  assert.equal(P.audit.ergebnis, 'passt');
  assert.equal(e.teile.get('por-ue').annahme_min, 5 * 120, 'Reihe: 5 Termine = 10 h (gewünscht)');
});

test('Selbststudium (4, 8, 25): Wochenwert = (Kontingent − Einheiten − erledigt) ÷ Vorlesungswochen im Fenster', () => {
  const e = rechne({ wahl: { 'por-ue': 'por-g1' } });
  const vn = e.teile.get('ana-vn');
  assert.equal(vn.fenster.ab, '2030-10-14', 'ab dem ersten Stoff (Screencast 1 am 14.10.)');
  assert.equal(vn.restwochen, 16);
  assert.equal(vn.wochenwert_min, 30 * 60 / 16);
  // Mit Einheiten im selben Posten: 30 h − 5 × 2 h Vorbereitung auf die Übungen = 20 h, ab dem Kick-off (21.10., W02).
  const por = e.teile.get('por-vn');
  assert.equal(e.teile.get('por-ue-vb').kontingent_min, 5 * 120);
  assert.equal(por.kontingent_min, 20 * 60);
  assert.equal(por.restwochen, 15);
  assert.equal(por.wochenwert_min, 20 * 60 / 15);
});

test('„Vorbereitung auf …“ (unregelmäßige Termine): je Termin eine Einheit mit Fenster bis zu diesem Termin', () => {
  const z = rechne({ wahl: { 'por-ue': 'por-g1' } }).teile.get('por-ue-vb');
  assert.equal(z.einheiten.length, 5);
  assert.deepEqual([z.einheiten[1].ab, z.einheiten[1].bis], ['2030-11-04', '2030-12-02']);
  assert.ok(M.blockTagErlaubt(rechne({ wahl: { 'por-ue': 'por-g1' } }), 'por-ue-vb')('2030-11-20'));
});

test('Einheiten ohne Fenster (5, 10, 17): Info fehlt mit Stichtag; Zeitbindung unbekannt rechnet trotzdem einen Wochenwert', () => {
  const a = angebot();
  a.module[1].teile[4].einheiten = { anzahl: 15, dauer_min: 60, stichtag: '2030-10-21' };
  const e = M.rechnen(a, {}, { heute });
  const q = e.teile.get('sys-quiz');
  assert.equal(q.kontingent_min, 15 * 60);
  assert.equal(q.info.stichtag, '2030-10-21');
  assert.equal(q.zeitbindung, 'fenster');
  a.module[1].teile[1].zeitbindung = 'unbekannt'; a.module[1].teile[1].stichtag = '2030-10-17';
  const vn = M.rechnen(a, {}, { heute }).teile.get('sys-vl-vn');
  assert.equal(vn.zeitbindung, 'unbekannt');
  assert.equal(vn.info.stichtag, '2030-10-17');
  assert.ok(vn.wochenwert_min > 0);
});

test('Übungs-Nachbereitung wartet auf die Übung (26): erst mit Terminen ein Fenster — dann ab der ersten Übung', () => {
  const a = angebot();
  const ohne = M.rechnen(a, {}, { heute }).teile.get('sys-ue-vn');
  assert.equal(ohne.wartet, true);
  assert.equal(M.vorgabe(M.rechnen(a, {}, { heute }), 'sys-ue-vn'), null, 'noch nicht zu legen');
  const mit = M.rechnen(a, { wahl: { 'sys-ue': 'sys-g1' } }, { heute }).teile.get('sys-ue-vn');
  assert.equal(mit.wartet, false);
  assert.equal(mit.fenster.ab, '2030-10-31');
  assert.equal(mit.restwochen, 14, 'Übung ab W03: 14 Wochen');
});

test('Einmaliger Posten (42): keine Wochenrate, einzelne Blöcke', () => {
  const a = angebot();
  a.module[0].posten.push({ id: 'lit', lv: null, titel: 'Literatur', mult: 1, h: 5 });
  a.module[0].posten[3].h = 55;
  a.module[0].teile.push({ id: 'ana-lit', titel: 'Literatur', art: 'selbst', posten: 'lit' });
  const e = M.rechnen(a, {}, { heute });
  const z = e.teile.get('ana-lit');
  assert.equal(z.einzeln, true);
  assert.equal(z.wochenwert_min, 0);
  const v = M.vorgabe(e, 'ana-lit');
  assert.equal(v.einzeln, true);
  assert.ok(v.wochen >= 2 && v.wochen <= 4);
});

// ── G5 und Abgleich ──────────────────────────────────────────────────────────────────────────────

test('G5 (9): zu wenige Präsenztermine jenseits der Toleranz gehen in die Vorbereitung der Hauptprüfung', () => {
  const e = rechne({ wahl: { 'por-ue': 'por-g1' } });
  const P = e.posten.find((x) => x.id === 'POR/ue-p');
  assert.equal(P.g5_min, 20 * 60);
  assert.equal(P.g5_nach, 'por-k', 'die Klausur (später als der Test) ist die Hauptprüfung');
  const X = e.pruefungen.get('por-k');
  assert.deepEqual(X.herkunft.map((x) => [x.text, x.min / 60]), [['Prüfungsvorbereitung (Klausur)', 50], ['aus der Übung', 20]]);
  assert.equal(e.module[2].pruefung_min, (50 + 40 + 20) * 60);
});

test('Erwartete Termine (Tutorium 12 statt 15): weniger 6 h (20 %) → G5; ein Rest innerhalb der Toleranz bleibt (47)', () => {
  const e = rechne();
  const P = e.posten.find((x) => x.id === 'ANA/tut-p');
  assert.equal(P.struktur_min, 12 * 120);
  assert.equal(P.g5_min, 6 * 60);
  const a = angebot(); a.module[0].teile[3].erwartet.anzahl = 14;
  const Q = M.rechnen(a, {}, { heute }).posten.find((x) => x.id === 'ANA/tut-p');
  assert.equal(Q.audit.ergebnis, 'passt', '−2 h sind 6,7 %: bleibt stehen');
  assert.equal(Q.g5_min, 0);
});

test('TU geschlossen (20, 44): Präsenz vor Ort fällt aus, online nicht; die fehlenden Stunden zählen für G5', () => {
  const e = rechne();
  const iv = e.teile.get('ana-iv');
  const aus = iv.vk.filter((v) => v.ausgefallen);
  assert.deepEqual(aus.map((v) => [v.datum, v.ausgefallen]), [['2030-12-20', 'geschlossen']]);
  assert.ok(!aus[0].hart, 'sperrt nichts');
  assert.equal(iv.termine_min, iv.vk.filter((v) => !v.ausgefallen).length * 120);
  // IV-Präsenz: 15 Freitage = 30 h + Screencasts 3 h = 33 h von 60 h → G5 27 h.
  const P = e.posten.find((x) => x.id === 'ANA/iv-p');
  assert.equal(P.struktur_min, (15 * 2 + 3) * 60);
  assert.equal(P.g5_min, 27 * 60);
  // Online (Zoom) fällt nicht aus.
  assert.ok(M.nurOnline('online (Zoom)'));
  assert.ok(!M.nurOnline('A 151'));
});

test('Mehr als die Tabelle (24): eine zweite Serie im selben Posten → „mehr“, Entscheidung offen (kein G5)', () => {
  const a = angebot();
  a.module[1].teile[0].termine = [a.module[1].teile[0].termine, { typ: 'serie', tag: 'Fr', start: '14:15', ende: '15:45', von: '2030-10-18', bis: '2031-02-14', ort: 'Y 2' }];
  const e = M.rechnen(a, {}, { heute });
  const P = e.posten.find((x) => x.id === 'SYS/vl-p');
  assert.equal(P.audit.ergebnis, 'mehr');
  assert.equal(P.audit.diff_min, 30 * 60, 'je Serie höchstens 15: Mi 16 → 15, Fr 15 (20.12. geschlossen) = 60 h statt 30 h');
  assert.ok(e.module[1].flags.some((f) => f.art === 'entscheidung' && f.stufe === 'achtung'));
});

test('Modul-Abgleich (29): „weniger“ innerhalb der Toleranz wird zusammengezählt, ab 2 h gemeldet', () => {
  const a = angebot();
  // Zwei Präsenz-Posten je 2 h unter dem Kontingent (innerhalb der Toleranz): zusammen 4 h → Meldung.
  // Übung ab W03 (31.10.): 14 Donnerstage = 28 h; VL ohne zwei Mittwoche: 14 = 28 h.
  a.module[1].teile[0].termine.ausser = ['2030-10-16', '2030-10-23'];
  const e = M.rechnen(a, { wahl: { 'sys-ue': 'sys-g1' } }, { heute });
  const x = e.audit.module.find((y) => y.modul.id === 'SYS');
  assert.equal(x.weniger_min, 4 * 60);
  assert.ok(x.meldung);
  assert.ok(e.module[1].flags.some((f) => f.art === 'modul_weniger'));
});

// ── Lebenslauf ───────────────────────────────────────────────────────────────────────────────────

test('Unbestätigt ist nicht erledigt (G6, 15): erst ✓ bucht ab; der Wochenwert verteilt den Rest auf die Wochen ab heute', () => {
  const plan = { bloecke: [{ id: 'b', teil: 'ana-vn', tag: 'Di', start: '09:00', ende: '11:00' }] };
  const e = M.rechnen(angebot(), plan, { heute: '2030-11-11' }); // W05
  const vn = e.teile.get('ana-vn');
  assert.equal(vn.erledigt_min, 0);
  assert.equal(vn.vk.filter((v) => v.ist === 'offen').length, 4, 'W01–W04 vorbei, ohne ✓');
  assert.equal(vn.restwochen, 12);
  assert.equal(vn.wochenwert_min, 30 * 60 / 12);
  const ist = { 'b@2030-10-15': 'ja', 'b@2030-10-22': 'ja' };
  const f = M.rechnen(angebot(), { ...plan, ist }, { heute: '2030-11-11' }).teile.get('ana-vn');
  assert.equal(f.erledigt_min, 240);
  assert.equal(f.wochenwert_min, (30 * 60 - 240) / 12);
  assert.ok(f.flags.some((x) => x.art === 'unbestaetigt' && x.anzahl === 2 && x.stufe === 'dran'));
});

test('Teilweise, nicht gemacht, verschoben (G6): „teil“ bucht die Minuten, ✗ nichts, verschoben zählt am neuen Tag', () => {
  const plan = { bloecke: [{ id: 'b', teil: 'ana-vn', tag: 'Di', start: '09:00', ende: '11:00' }, { id: 'n', teil: 'ana-vn', datum: '2030-10-24', start: '09:00', ende: '11:00', aus: 'b@2030-10-22' }],
    ist: { 'b@2030-10-15': { s: 'teil', min: 60 }, 'b@2030-10-22': 'verschoben', 'b@2030-10-29': 'nein' } };
  const e = M.rechnen(angebot(), plan, { heute: '2030-11-01' });
  const vk = (id) => e.vorkommen.find((v) => v.id === id);
  assert.equal(vk('b@2030-10-15').erledigt_min, 60);
  assert.equal(vk('b@2030-10-22').zaehlt_min, 0, 'verschoben: zählt hier nicht mehr');
  assert.equal(vk('b@2030-10-29').plan_min, 0);
  assert.equal(vk('n@2030-10-24').ist, 'offen', 'der neue Block ist vorbei und wartet auf ✓');
  assert.equal(e.teile.get('ana-vn').erledigt_min, 60);
});

test('Verpasster Termin (16): ✗ wird Nacharbeit im selben Posten, Fenster bis zum nächsten Termin', () => {
  const e = M.rechnen(angebot(), { ist: { 'sys-vl@2030-11-13@14:15': 'nein' } }, { heute: '2030-11-14' });
  const f = e.teile.get('sys-vl').flags.find((x) => x.art === 'nacharbeit');
  assert.match(f.text, /Nacharbeit 2 h für Mi 13\.11\. \(verpasst\) — bis Mi 20\.11\./);
  assert.equal(f.stufe, 'dran');
  const ok = M.rechnen(angebot(), { ist: { 'sys-vl@2030-11-13@14:15': { s: 'nein', nachgeholt: true } } }, { heute: '2030-11-14' });
  assert.ok(!ok.teile.get('sys-vl').flags.some((x) => x.art === 'nacharbeit'));
});

test('Fenster vorbei (27): ein nicht erreichtes Kontingent ist „verfehlt“ — nichts wird still verschoben', () => {
  const e = M.rechnen(angebot(), {}, { heute: '2031-02-20' });
  const vn = e.teile.get('ana-vn');
  assert.equal(vn.verfehlt_min, 30 * 60);
  assert.ok(vn.flags.some((f) => f.art === 'verfehlt' && f.stufe === 'achtung'));
  assert.equal(vn.wochenwert_min, 0);
});

// ── Prüfungen ────────────────────────────────────────────────────────────────────────────────────

test('Prüfung ohne Termin (18, 43): Info fehlt, Stichtag 14 Tage nach Modulbeginn; kein Fenster, kein Vorschlag', () => {
  const e = rechne();
  const X = e.pruefungen.get('ana-k');
  assert.equal(X.alternativen, 'info_fehlt');
  assert.equal(X.info.stichtag, '2030-11-01', 'erste IV Fr 18.10. + 14 Tage');
  assert.equal(X.fenster.bis, null);
  assert.deepEqual(X.vorschlag, []);
  assert.equal(X.kontingent_min, (60 + 6 + 27) * 60, '60 h + G5 aus Tutorium und IV');
});

test('Wahl offen (11, 12): früheste als Arbeitsannahme; gewählt wandern Fenster und Fristen mit (§ 63 Abs. 2, 4, 5)', () => {
  const X = rechne().pruefungen.get('sys-k');
  assert.equal(X.alternativen, 'wahl_offen', 'zwei Termine: eine Wahl');
  assert.equal(X.annahme, true);
  assert.equal(X.termin.datum, '2031-02-26', 'Arbeitsannahme: der früheste');
  assert.equal(X.fenster.bis, '2031-02-25');
  const f = (Y) => Object.fromEntries(Y.fristen.filter((x) => !x.regel).map((x) => [x.art, x.datum]));
  assert.deepEqual(f(X), { vorbehalt: '2031-02-12', anmeldung: '2031-02-19', abmeldung: '2031-02-23' });
  const Y = rechne({ pruefungstermin: { 'sys-k': '2031-04-09' } }).pruefungen.get('sys-k');
  assert.equal(Y.fenster.bis, '2031-04-08');
  assert.deepEqual(f(Y), { vorbehalt: '2031-03-26', anmeldung: '2031-04-02', abmeldung: '2031-04-06' });
});

test('Portfolio: An- und Abmeldung bis einen Tag vor dem ersten Teil, ISIS geht vor; eine Anmeldung für alle Teile', () => {
  const e = rechne();
  const T = e.pruefungen.get('por-t'), K = e.pruefungen.get('por-k');
  assert.deepEqual(T.fristen.filter((x) => x.art === 'anmeldung').map((x) => x.datum), ['2030-11-30'], 'ISIS');
  assert.deepEqual(K.fristen.filter((x) => x.art === 'abmeldung').map((x) => x.datum), ['2030-12-15'], 'einen Tag vor dem Test');
  assert.equal(M.rechnen(angebot(), { pruefung: { 'por-t': { status: 'angemeldet' } } }, { heute }).pruefungen.get('por-k').status, 'angemeldet');
  // Die Anmeldung wird einmal gemeldet, nicht je Teil.
  const an = M.rechnen(angebot(), {}, { heute: '2030-11-02' }).module[2].flags.filter((x) => x.art === 'anmeldung');
  assert.equal(an.length, 1);
  assert.match(an[0].text, /^Portfolio \(Online-Test, Präsenzklausur\): anmelden bis Sa 30\.11\./);
});

test('Termine im Prüfungs-Topf (14): die Fragestunde gehört zur Klausur und zum Kontingent — der Vorschlag plant den Rest', () => {
  const e = rechne({ wahl: { 'por-ue': 'por-g1' } });
  const K = e.pruefungen.get('por-k');
  assert.deepEqual(K.termine_p.map((z) => z.teil.id), ['por-fs']);
  assert.equal(K.termine_p_min, 120);
  assert.equal(K.zu_planen_min, K.kontingent_min - 120);
  assert.equal(M.schrittVon(e.teile.get('por-fs').teil), M.PRUEFUNGEN, 'unter „Prüfungen“, nicht in der Woche');
  assert.equal(e.teile.get('por-fs').vk[0].ausgefallen, null, 'online: nicht geschlossen');
});

test('Rücktritt anerkannt (35): der Nachholtermin gilt, das Fenster wandert; nicht bestanden (34): Wiederholung außerhalb der 180 h', () => {
  const r = M.rechnen(angebot(), { pruefung: { 'por-t': { status: 'ruecktritt_anerkannt', termin: '2030-12-16' } } }, { heute: '2030-12-17' });
  const T = r.pruefungen.get('por-t');
  assert.equal(T.termin.datum, '2031-02-17');
  assert.equal(T.fenster.bis, '2031-02-16');
  const n = M.rechnen(angebot(), { pruefung: { 'sys-k': { status: 'nicht_bestanden', termin: '2031-02-26', note_am: '2031-03-10' } } }, { heute: '2031-03-11' });
  const X = n.pruefungen.get('sys-k');
  assert.equal(X.wiederholung, true);
  assert.equal(X.termin.datum, '2031-04-09');
  assert.deepEqual([X.fenster.ab, X.fenster.bis], ['2031-03-10', '2031-04-08']);
  assert.equal(X.kontingent_min, 60 * 60, 'Vorschlag: so viel wie beim ersten Versuch');
  assert.ok(n.module[1].flags.some((f) => f.art === 'wiederholung'));
  const eigen = M.rechnen(angebot(), { pruefung: { 'sys-k': { status: 'nicht_bestanden', termin: '2031-02-26', kontingent_h: 18 } } }, { heute: '2031-03-11' });
  assert.equal(eigen.pruefungen.get('sys-k').kontingent_min, 18 * 60);
});

test('Vorbehalt (38): angemeldet unter Vorbehalt meldet die Frist für den Nachweis', () => {
  const e = M.rechnen(angebot(), { pruefung: { 'sys-k': { status: 'vorbehalt' } } }, { heute: '2031-02-08' });
  const f = e.module[1].flags.find((x) => x.art === 'vorbehalt');
  assert.match(f.text, /bis Mi 12\.02\. nachweisen/);
  assert.equal(f.stufe, 'kritisch', 'weniger als eine Woche');
});

test('Portfolio-Punkte (39): 8 von 20 im Test → für die 4,0 (50) braucht die Klausur 42 von 80', () => {
  const X = rechne({ pruefung: { 'por-t': { punkte: 8 } } }).pruefungen.get('por-k');
  assert.deepEqual(X.portfolio_rest, { noetig: 42, in: ['por-k'], von: 80 });
});

test('Quote (36): zwei Quizze verpasst → höchstens 86,7 %, Puffer 1 → Warnung', () => {
  const ist = { 'sys-quiz#3': 'nein', 'sys-quiz#7': 'nein' };
  const e = rechne({ ist });
  const q = e.quoten[0];
  assert.equal(q.verpasst, 2);
  assert.equal(Math.round(q.hoechstens * 1000) / 10, 86.7);
  assert.equal(q.puffer, 1);
  assert.ok(e.module[1].flags.some((f) => f.art === 'quote' && f.stufe === 'achtung'));
});

test('Vorschlag passt nicht (13): ist die Woche voll, legt er nichts und sagt, wie viel fehlt', () => {
  // Jeden Samstag und Sonntag der Vorlesungszeit 9 h Puffer: der Online-Test (40 h, Mo 16.12.) findet keinen Platz.
  const bloecke = ['Sa', 'So'].map((tag, i) => ({ id: `p${i}`, teil: null, tag, start: '08:00', ende: '17:00', titel: 'voll' }));
  const e = rechne({ bloecke });
  const T = e.pruefungen.get('por-t');
  assert.equal(T.vorschlag.reduce((s, v) => s + v.min, 0), 0);
  assert.equal(T.passt_nicht_min, 40 * 60);
  assert.ok(e.module[2].flags.some((f) => f.art === 'passt_nicht' && f.stufe === 'achtung'));
});

test('Kapazität (30): die Last einer Woche zählt Termine, Blöcke und den Bedarf ohne Block; über 45 h meldet der Abgleich', () => {
  const bloecke = ['Mo', 'Di', 'Do', 'Fr'].map((tag, i) => ({ id: `x${i}`, teil: null, tag, start: '07:00', ende: '18:00', titel: 'Arbeit' }));
  const e = rechne({ bloecke });
  const w = e.last.wochen.get('2030-11-04');
  assert.ok(w.bloecke >= 40 * 60);
  assert.ok(e.audit.wochen.some((x) => x.woche.id === '2030-11-04'));
  assert.ok(e.planFlags.some((f) => f.art === 'woche_voll'));
});

test('Rückfalltermine, die sich überschneiden (32), sind ein Hinweis', () => {
  const a = angebot();
  a.module[2].pruefungen[1].termine[1] = { datum: '2031-04-09', start: '11:00', ende: '13:00', wichtig: false };
  const e = M.rechnen(a, {}, { heute });
  assert.deepEqual(e.audit.rueckfall.map((x) => [x.datum, x.ueber_min]), [['2031-04-09', 60]]);
  assert.ok(e.planFlags.some((f) => f.art === 'rueckfall' && f.stufe === 'info'));
});
