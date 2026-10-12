// Das Kontingent-Modell von /silas (V-0349, Fassung 4 vom 12.10.2026, docs/SILAS.md §2).
//
// Silas, 12.10.: „Die gesamte Rechnung ergibt keinen Sinn … fang nochmal bei Null an.“ Das Modell, das daraus wurde:
//  G1  Ein Modul sind LP × 30 h (AllgStuPO § 45), fest.
//  G2  Topf nach Zweck: Was einer Prüfung dient (Vorbereitung, Lernzielkontrollen, Probeklausur, Fragestunde), gehört
//      in den Prüfungs-Topf und wird unter „Prüfungen“ geplant; alles andere in den Semester-Topf („Woche“).
//  G3  Woche nach Fenster: Jedes Element liegt, wo sein Termin oder Fenster liegt — die Woche zeigt alles.
//  G4  Termine zuerst: Was ISIS an Terminen nennt, ist die erste Wahrheit. Verteilt wird nur Selbststudium.
//  G5  Liegt ein Präsenz-Posten jenseits der Toleranz unter seinem Kontingent, geht der Rest in die Vorbereitung der
//      Hauptprüfung des Moduls („aus der Übung“). Reste innerhalb der Toleranz bleiben und zählen im Modul-Abgleich.
//  G6  Unbestätigt ist nicht erledigt: Vergangenes bekommt ✓ oder ✗ (plan.ist); abgebucht wird erst nach ✓.
//  G7  Verweise statt Daten: Was an einer offenen Wahl hängt, rechnet mit dem frühesten Termin als Arbeitsannahme.
//  G8  Kapazität 45 h je Woche, 9 h je Tag, alles eingerechnet (Silas' Grenze).
//  G9  Horizont bis zum spätesten Rückfalltermin; eine Wiederholung hat ein eigenes Kontingent außerhalb der 180 h.
//  G10 Ist etwas zugleich Termin und Prüfungselement, gelten die Zustände der Prüfung.
//
// Der Baum je Veranstaltung (Element = ein Teil des Angebots): Gehört es zu einem Posten? → Zeitbindung (Termin,
// Fenster, unbekannt) → Alternativen (fest, Info fehlt, Wahl offen, Zuteilung offen, gewählt, gescheitert) →
// Lebenslauf (besucht/verpasst/ausgefallen, ✓/✗/teilweise/verschoben, Prüfungsstatus nach § 63). Jedes „Info fehlt“
// trägt Frage und Stichtag.
//
// Diese Datei rechnet auf dem, was modell.mjs rechnen() schon gebaut hat (Vorkommen, Zählen, Stoff) — Schritte 7 bis 12.
// Sie ist rein: kein DOM, kein Netz, die Uhr kommt als `heute` (und `jetzt_min`).

import {
  TAGE, plusTage, wochentag, montagVon, tageZwischen, istDatum, datumKurz, datumTag, stunden, stunden1,
  feiertage, istVorlesungstag, istFrei, wocheVon, videoBlockMin, pruefungsTermin, pruefungsArt, istPortfolio,
} from './grund.mjs';

export const STUFEN = ['kritisch', 'achtung', 'dran', 'kommt', 'spaeter', 'info'];
export const STUFE_TEXT = { kritisch: 'kritisch', achtung: 'Achtung', dran: 'du bist dran', kommt: 'kommt noch', spaeter: 'später', info: 'Hinweis' };
const RANG = Object.fromEntries(STUFEN.map((s, i) => [s, i]));
export const hoechste = (flags) => flags.reduce((b, f) => (f.stufe && (b === 'ok' || RANG[f.stufe] < RANG[b]) ? f.stufe : b), 'ok');

/** Die Zustände des Baums als Wort (die Seite zeigt sie als Chip). */
export const ZUSTAND = {
  fest: 'fest', info_fehlt: 'Info fehlt', wahl_offen: 'Wahl offen', zuteilung_offen: 'Zuteilung offen',
  gewaehlt: 'gewählt', gescheitert: 'gescheitert', frist_vorbei: 'Frist vorbei — angemeldet?', fenster: 'im Fenster', wartet: 'wartet',
};
/** Der Lebenslauf einer Prüfung (AllgStuPO § 63). */
export const PRUEFSTATUS = [
  ['offen', 'nicht angemeldet'],
  ['vorbehalt', 'angemeldet unter Vorbehalt'],
  ['angemeldet', 'angemeldet'],
  ['abgemeldet', 'abgemeldet'],
  ['ruecktritt_anerkannt', 'Rücktritt anerkannt'],
  ['ruecktritt_abgelehnt', 'Rücktritt abgelehnt'],
  ['bestanden', 'bestanden'],
  ['nicht_bestanden', 'nicht bestanden'],
];
export const PRUEFSTATUS_TEXT = Object.fromEntries(PRUEFSTATUS);
const LV_WORT = { IV: 'aus der IV', VL: 'aus der Vorlesung', UE: 'aus der Übung', TUT: 'aus dem Tutorium' };

/** Toleranz eines Postens (Audit): 10 %, mindestens 1 h. */
export const toleranz = (k, r) => Math.max(r.toleranz_mind_min, Math.round(k * r.toleranz_anteil));

/** plan.ist[id] als { s, min? }: 'ja' (✓ erledigt / besucht), 'nein' (✗ nicht gemacht / verpasst), 'teil' (nur ein
 *  Teil, min Minuten), 'verschoben' (liegt jetzt als eigener Block an einem anderen Tag), 'ausgefallen' (Termin). */
export function istEintrag(x) {
  if (!x) return null;
  if (typeof x === 'string') return ['ja', 'nein', 'verschoben', 'ausgefallen'].includes(x) ? { s: x } : null;
  if (typeof x === 'object' && ['ja', 'nein', 'teil', 'verschoben', 'ausgefallen'].includes(x.s)) return x;
  return null;
}

/** Die Art eines Elements: termin (Präsenz mit Terminen oder Gruppen), einheiten (Videos, Quizze mit Dauer: eigenes
 *  Fenster je Einheit), rest (Selbststudium, das auf die Wochen verteilt wird), vorbereitung (Prüfungs-Topf, Fenster
 *  bis zur Prüfung), pruefungstermin (Termin im Prüfungs-Topf: Probeklausur, Fragestunde). */
export function elementArt(z) {
  const t = z.teil;
  if (z.topf === 'pruefung') return t.art === 'pruefung' ? 'vorbereitung' : 'pruefungstermin';
  if (t.art === 'praesenz') return 'termin';
  if (t.art === 'video') return 'einheiten';
  if (t.art === 'selbst' && t.einheiten && Number.isFinite(t.einheiten.dauer_min)) return 'einheiten';
  return 'rest';
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════

export function kontingentRechnen(erg, angebot, plan, optionen = {}) {
  erg.jetzt_min = optionen.jetzt_min ?? null;
  lebenslauf(erg, plan);
  posten(erg, angebot, plan);
  pruefungen(erg, angebot, plan);
  last(erg);
  vorschlag(erg);
  audit(erg);
  meldungen(erg, angebot, plan);
  summen(erg, angebot);
  return erg;
}

// ── 7 · Lebenslauf ───────────────────────────────────────────────────────────────────────────────
// Ein Vorkommen ist vergangen, wenn sein Tag vorbei ist (heute: wenn sein Ende vor jetzt_min liegt). Ohne Eintrag ist es
// „offen“ (unbestätigt, G6). erledigt_min ist, was abgebucht wird: ✓ die gezählte Zeit, „teil“ die eingetragene.

function lebenslauf(erg, plan) {
  const ist = plan.ist || {};
  const heute = erg.heute, jetzt = erg.jetzt_min;
  for (const v of erg.vorkommen) {
    if (v.quelle !== 'termin' && v.quelle !== 'block') continue;
    v.vergangen = !!heute && (v.datum < heute || (v.datum === heute && jetzt != null && v.ende <= jetzt));
    const e = istEintrag(ist[v.id]);
    const dauer = v.quelle === 'termin' ? zaehlt(v) : Math.max(0, v.ende - v.start);
    if (v.ausgefallen) { v.ist = 'ausgefallen'; v.erledigt_min = 0; continue; }
    v.ist = e ? e.s : v.vergangen ? 'offen' : null;
    v.erledigt_min = !e ? 0 : e.s === 'ja' ? (v.quelle === 'block' ? v.zaehlt_min : dauer) : e.s === 'teil' ? Math.max(0, Math.min(dauer, Math.round(e.min || 0))) : 0;
    if (e && e.s === 'verschoben') v.zaehlt_min = 0; // er liegt jetzt als eigener Block woanders
    // Ein verpasster Termin (✗) wird Nacharbeit im selben Posten, mit Fenster bis zum nächsten Termin (Testfall 16).
    if (v.quelle === 'termin' && e && e.s === 'nein') v.nacharbeit = { min: dauer, erledigt: !!e.nachgeholt };
  }
  // Ein Vorkommen „zählt als Plan“: vergangen nur, was erledigt ist (✓ oder teilweise) oder noch unbestätigt; ✗ nicht.
  for (const v of erg.vorkommen) {
    if (v.quelle !== 'termin' && v.quelle !== 'block') continue;
    // Eine gewünschte Gruppe ohne Zuteilung (annahme) steht im Plan, ist aber nicht verplant.
    v.plan_min = v.annahme || v.ist === 'nein' || v.ist === 'ausgefallen' || v.ist === 'verschoben' ? 0 : v.ist === 'teil' || v.ist === 'ja' ? v.erledigt_min : v.zaehlt_min;
  }
}
const zaehlt = (v) => v.zaehlt_min;

// ── 8 · Posten, Elemente, Wochenwert ─────────────────────────────────────────────────────────────

function postenArt(m, p, zs) {
  if (p.topf === 'pruefung' || p.art === 'pruefung') return 'pruefung';
  const eig = zs.filter((z) => z.teil.posten === p.id);
  if (eig.length && eig.every((z) => z.teil.art === 'pruefung')) return 'pruefung';
  if (!eig.length && p.mult === 1 && /prüfung|klausur|lernziel/i.test(p.titel)) return 'pruefung';
  if (p.art === 'praesenz' || eig.some((z) => z.topf !== 'pruefung' && (z.teil.art === 'praesenz' || z.teil.art === 'video'))) return 'praesenz';
  return 'selbst';
}

/** Die Wochen der Vorlesungszeit, die in [ab, bis] liegen (die Weihnachtspause zählt nicht). */
const vlWochenIn = (erg, ab, bis) => erg.wochen.filter((w) => w.art === 'vorlesung' && w.bis >= ab && w.von <= bis);

function posten(erg, angebot, plan) {
  const r = erg.regeln, sem = erg.sem;
  erg.posten = [];
  for (const m of angebot.module || []) {
    const zs = (m.teile || []).map((t) => erg.teile.get(t.id));
    for (const z of zs) {
      z.el = elementArt(z);
      z.termine_min = 0; z.annahme_min = 0; z.erwartet_min = 0; z.audit_min = 0; z.einheiten_min = 0;
      z.kontingent_min = 0; z.geschaetzt = false; z.wartet = false; z.info = null;
      z.erledigt_min = z.vk.reduce((s, v) => s + (v.erledigt_min || 0), 0);
      z.plan_min = z.vk.reduce((s, v) => s + (v.plan_min ?? v.zaehlt_min ?? 0), 0);
    }
    // Termine: was stattfindet (ohne Ausfälle), was nur gewünscht ist (Zuteilung offen), was erwartet wird.
    for (const z of zs.filter((x) => x.el === 'termin' || x.el === 'pruefungstermin')) {
      const ts = z.vk.filter((v) => v.quelle === 'termin' && !v.ausgefallen);
      z.termine_min = ts.filter((v) => !v.annahme).reduce((s, v) => s + zaehlt(v), 0);
      z.annahme_min = ts.filter((v) => v.annahme).reduce((s, v) => s + zaehlt(v), 0);
      const e = z.teil.erwartet;
      if (!ts.length && e && e.anzahl > 0) z.erwartet_min = Math.round(e.anzahl * (e.dauer_min || r.erwartet_min));
      // Eine wöchentliche Serie wird gegen höchstens 15 Termine geprüft (die 16. Woche ist Luft).
      const gruppen = new Map();
      for (const v of ts) gruppen.set(`${v.option || ''}|${v.muster ?? 0}`, [...(gruppen.get(`${v.option || ''}|${v.muster ?? 0}`) || []), v]);
      let geprueft = 0;
      for (const [k, vs] of gruppen) {
        const mi = Number(k.split('|')[1]);
        const quelle = vs[0].option ? (z.teil.optionen || []).find((o) => o.id === vs[0].option) : z.teil;
        const mu = quelle ? [].concat(quelle.termine || [])[mi] : null;
        const summe = vs.reduce((s, v) => s + zaehlt(v), 0);
        geprueft += mu && mu.typ === 'serie' && vs.length > r.katalog_wochen ? Math.round((summe / vs.length) * r.katalog_wochen) : summe;
      }
      const erw = e && e.anzahl > 0 && !ts.length ? Math.round(Math.min(e.anzahl, r.katalog_wochen) * (e.dauer_min || r.erwartet_min)) : 0;
      z.audit_min = geprueft + erw;
      z.kontingent_min = z.termine_min + z.annahme_min + z.erwartet_min;
    }
    // Einheiten: Videos (Länge + Puffer), Quizze und Tests mit Dauer.
    for (const z of zs.filter((x) => x.el === 'einheiten')) {
      const t = z.teil, video = t.art === 'video';
      const annahme = (t.einheiten && (t.einheiten.laenge_min || t.einheiten.annahme_min)) || 90;
      const dauer = (e) => (video ? videoBlockMin(e && e.laenge_min != null ? e.laenge_min : annahme, r) : t.einheiten.dauer_min);
      if (z.einheiten && z.einheiten.length) {
        // Videos einer Woche schaut man zusammen: je Woche Summe der Längen + Puffer, aufs Raster (rechnen() Schritt 6,
        // Testfall 1: Screencast 2, 44 min → 1 h). So hat STAT1 23,5 h Screencasts, nicht 29 einzeln gerundete Blöcke.
        z.einheiten_min = video && z.gruppen ? z.gruppen.reduce((s, g) => s + g.bedarf_min, 0) : z.einheiten.reduce((s, e) => s + dauer(e), 0);
        z.geschaetzt = video && z.einheiten.some((e) => e.laenge_min == null);
      } else {
        const n = (t.einheiten && (t.einheiten.anzahl || (t.einheiten.liste || []).length)) || 0;
        z.einheiten_min = n * dauer(null);
        z.geschaetzt = video;
      }
      z.einheit_dauer = dauer;
      z.kontingent_min = z.einheiten_min;
    }
    for (const p of m.posten || []) {
      const els = zs.filter((z) => z.teil.posten === p.id && z.topf !== 'pruefung');
      const K = Math.round(p.mult * p.h * 60);
      const P = {
        id: `${m.id}/${p.id}`, modul: m, posten: p, titel: p.titel, lv: p.lv || null, K,
        art: postenArt(m, p, zs), elemente: els, g5_min: 0,
      };
      P.topf = P.art === 'pruefung' ? 'pruefung' : 'semester';
      for (const z of els) z.P = P;
      // Der Rest des Postens geht an das Selbststudium (rest-Elemente), bei mehreren nach soll_h, sonst gleich.
      const fest = els.filter((z) => z.el !== 'rest').reduce((s, z) => s + z.kontingent_min, 0);
      const reste = els.filter((z) => z.el === 'rest');
      const vergeben = reste.filter((z) => z.teil.soll_h != null).reduce((s, z) => s + Math.round(z.teil.soll_h * 60), 0);
      const frei = Math.max(0, K - fest - vergeben);
      const ohne = reste.filter((z) => z.teil.soll_h == null);
      for (const z of reste) z.kontingent_min = z.teil.soll_h != null ? Math.round(z.teil.soll_h * 60) : Math.round(frei / Math.max(1, ohne.length));
      P.aufgeteilt = ohne.length > 1;
      P.struktur_min = els.reduce((s, z) => s + (z.el === 'termin' ? z.audit_min : z.kontingent_min), 0);
      P.plan_min = els.reduce((s, z) => s + z.plan_min, 0);
      P.erledigt_min = els.reduce((s, z) => s + z.erledigt_min, 0);
      P.geschaetzt = els.some((z) => z.geschaetzt);
      P.vermutlich = els.some((z) => z.annahme_min > 0 || z.erwartet_min > 0);
      P.ohne_termine = els.some((z) => z.el === 'termin' && !z.vk.some((v) => v.quelle === 'termin') && !z.erwartet_min);
      // Abgleich (nur prüfend): Präsenz gegen die Struktur des Semesters (Termine, Videos), Selbststudium gegen den Plan.
      if (P.art !== 'pruefung') {
        const basis = P.art === 'praesenz' ? P.struktur_min : P.plan_min;
        const diff = basis - K, tol = toleranz(K, r);
        let ergebnis = Math.abs(diff) <= tol ? 'passt' : diff > 0 ? 'mehr' : 'weniger';
        if (P.art === 'praesenz' && (P.geschaetzt || P.ohne_termine)) ergebnis = 'offen';
        if (P.art === 'selbst' && ergebnis === 'weniger' && P.plan_min === 0) ergebnis = 'ungeplant';
        P.audit = { basis_min: basis, diff_min: diff, tol_min: tol, ergebnis };
        // G5: Präsenz jenseits der Toleranz darunter → der Rest geht in die Prüfungsvorbereitung (Ziel: pruefungen()).
        if (P.art === 'praesenz' && ergebnis === 'weniger') P.g5_min = K - basis;
      }
      erg.posten.push(P);
    }
    for (const z of zs) {
      z.fehlt_min = Math.max(0, z.kontingent_min - z.plan_min);
      z.offen_min = Math.max(0, z.kontingent_min - z.erledigt_min);
      z.soll_min = z.kontingent_min; // für die Teile der Seite, die eine Vorgabe brauchen (M.vorgabe)
      z.ist_min = z.plan_min;
    }
  }
  // Wochenwert (nur Selbststudium im Semester): (Kontingent − erledigt) ÷ Vorlesungswochen, die im Fenster bleiben —
  // gezählt ab der Woche von heute (Testfall 15: W01–W02 ✓, W03–W04 ohne ✓ → ab W05 (82,5 − 10,3) ÷ 12).
  const heute = erg.heute;
  for (const z of erg.teile.values()) {
    if (z.topf === 'pruefung' || !z.P) continue;
    if (z.el === 'rest') {
      // Die Nachbereitung einer Übung beginnt mit der ersten Übung (Silas, 12.10.: „Nachbereitung für eine Übung erst
      // eintragen können, wenn der tatsächliche Übungstermin bekannt ist“). Labs und Aufgaben warten nicht.
      const eigeneLv = z.P.lv ? [...erg.teile.values()].filter((x) => x.modul === z.modul && x.P && x.P.lv === z.P.lv && x.el === 'termin') : [];
      const nachbereitung = /vor-|nachbereitung/i.test(`${z.P.titel} ${z.teil.titel}`);
      if (nachbereitung && eigeneLv.length && eigeneLv.every((x) => !x.vk.some((v) => v.quelle === 'termin'))) {
        z.wartet = true; z.wartet_auf = eigeneLv[0];
      }
      const ab = z.wartet ? null : (z.stoff_ab || sem.vorlesung.von);
      const bis = istDatum(z.teil.bis) ? z.teil.bis : sem.vorlesung.bis;
      z.fenster = { ab, bis };
      const alle = ab ? vlWochenIn(erg, ab, bis) : [];
      const rest = alle.filter((w) => !heute || w.bis >= heute);
      z.wochen_im_fenster = alle.length;
      z.restwochen = rest.length;
      z.einzeln = z.P.posten.mult === 1; // ein einmaliger Posten (BuK-Literatur 5 h): einzelne Blöcke, keine Rate
      z.wochenwert_min = !z.einzeln && rest.length ? Math.max(0, (z.kontingent_min - z.erledigt_min) / rest.length) : 0;
      // Fensterende vorbei und Kontingent nicht erreicht: „verfehlt“ — du entscheidest (Testfall 27).
      z.verfehlt_min = heute && bis < heute ? Math.max(0, z.kontingent_min - z.erledigt_min) : 0;
    } else if (z.el === 'einheiten') {
      const ab = z.einheiten && z.einheiten.length ? z.einheiten.map((e) => e.ab).sort()[0] : null;
      z.fenster = { ab, bis: sem.vorlesung.bis };
    } else if (z.el === 'termin') {
      const ts = z.vk.filter((v) => v.quelle === 'termin');
      z.fenster = ts.length ? { ab: ts[0].datum, bis: ts[ts.length - 1].datum } : null;
    }
  }
  // Der Baum je Element: Zeitbindung, Alternativen, Info fehlt (Frage, Stichtag).
  for (const m of angebot.module || []) {
    const zs = (m.teile || []).map((t) => erg.teile.get(t.id));
    const modulStart = zs.flatMap((z) => z.vk.filter((v) => v.quelle === 'termin')).map((v) => v.datum).sort()[0] || sem.vorlesung.von;
    for (const z of zs) baum(erg, z, plan, modulStart);
  }
}

/** Der Baum für ein Element (Kontingent-Modell, „Der Baum“). Setzt z.zeitbindung, z.alternativen, z.info. */
function baum(erg, z, plan, modulStart) {
  const t = z.teil, heute = erg.heute;
  const wahl = plan.wahl || {}, angemeldet = plan.angemeldet || {}, zugeteilt = plan.zugeteilt || {};
  const stichtag = (x) => (istDatum(x) ? x : null);
  const info = (frage, std) => ({ frage, quelle: t.quelle_suchen || null, stichtag: stichtag(t.stichtag) || std || stichtag(t.einheiten && t.einheiten.stichtag) || modulStart });
  if (z.el === 'termin' || z.el === 'pruefungstermin') {
    z.zeitbindung = 'termin';
    const opts = t.optionen || [];
    if (t.wahl || opts.length) {
      if (!opts.length) { z.alternativen = 'info_fehlt'; z.info = info(t.offen || 'Welche Gruppen gibt es, wann?'); return; }
      const gew = opts.find((o) => o.id === wahl[t.id]) || null;
      const frist = t.anmeldung && istDatum(t.anmeldung.bis) ? t.anmeldung.bis : null;
      const vorbei = frist && heute && heute > frist;
      // Frist vorbei, aber nichts bestätigt (V-0357, Prüfung W01/W02): Vielleicht hat Silas sich in MOSES angemeldet und
      // nur hier nicht geklickt — dann fragt die Seite (frist_vorbei, mit „Angemeldet“ und „Kein Platz“), statt sofort
      // „gescheitert“ zu sagen und den Knopf zu verstecken. Gescheitert ist erst „Kein Platz“.
      if (!gew) { z.alternativen = vorbei && t.zuteilung && !angemeldet[t.id] ? 'frist_vorbei' : 'wahl_offen'; return; }
      if (t.zuteilung) {
        if (zugeteilt[t.id] === gew.id) z.alternativen = 'gewaehlt';
        else if (zugeteilt[t.id] === 'keine') z.alternativen = 'gescheitert';
        else if (angemeldet[t.id]) z.alternativen = 'zuteilung_offen';
        else z.alternativen = vorbei ? 'frist_vorbei' : 'wahl_offen';
        return;
      }
      z.alternativen = 'gewaehlt';
      return;
    }
    if (!z.vk.some((v) => v.quelle === 'termin')) { z.alternativen = 'info_fehlt'; z.info = info(t.offen || 'Wann finden die Termine statt?'); return; }
    z.alternativen = 'fest';
    if (t.offen) z.info = info(t.offen);
    return;
  }
  z.alternativen = null;
  if (t.zeitbindung === 'unbekannt') { z.zeitbindung = 'unbekannt'; z.info = info(t.offen || 'Gibt es feste Termine oder nur Fristen?'); return; }
  z.zeitbindung = 'fenster';
  if (z.wartet) { z.info = { frage: `wartet auf ${z.wartet_auf.teil.titel}`, quelle: null, stichtag: (z.wartet_auf.info && z.wartet_auf.info.stichtag) || stichtag(z.wartet_auf.teil.stichtag) || modulStart, wartet: true }; return; }
  const e = t.einheiten;
  // Einheiten ohne ein einziges Datum (Quicktests: nur die Anzahl ist bekannt): das Fenster fehlt.
  if (e && (!z.einheiten || !z.einheiten.length) && !t.vorbereitung_auf) { z.info = info(e.offen || t.offen || 'Wann erscheinen die Einheiten, bis wann sind sie fällig?', stichtag(e.stichtag)); return; }
  if (e && e.offen) { z.info = info(e.offen, stichtag(e.stichtag)); return; }
  if (t.offen) z.info = info(t.offen);
}

// ── 9 · Prüfungen ────────────────────────────────────────────────────────────────────────────────

function pruefungen(erg, angebot, plan) {
  const r = erg.regeln, sem = erg.sem, heute = erg.heute;
  erg.pruefungen = new Map();
  const status = plan.pruefung || {};
  for (const m of angebot.module || []) {
    const zs = (m.teile || []).map((t) => erg.teile.get(t.id));
    const modulStart = zs.flatMap((z) => z.vk.filter((v) => v.quelle === 'termin')).map((v) => v.datum).sort()[0] || sem.vorlesung.von;
    const stoffStart = [modulStart, ...zs.map((z) => z.stoff_ab).filter(Boolean), ...zs.flatMap((z) => (z.einheiten || []).map((e) => e.ab))].sort()[0];
    const xs = [];
    for (const p of m.pruefungen || []) {
      const pt = pruefungsTermin(m, p.id, plan);
      const portfolio = istPortfolio(p);
      const st = status[p.id] || {};
      const X = {
        id: p.id, p, modul: m, art: pruefungsArt(p), portfolio, termin: pt.termin, gewaehlt: pt.gewaehlt, annahme: pt.annahme,
        weiter: pt.weiter, datiert: pt.datiert, punkte: Number.isFinite(p.punkte) ? p.punkte : null,
        erreicht: Number.isFinite(st.punkte) ? st.punkte : null, status: st.status || null,
      };
      // Alternativen (der Baum für Prüfungen): Termin fehlt · Wahl unklar · Wahl offen · gewählt · fest.
      if (!pt.datiert.length) {
        X.alternativen = 'info_fehlt';
        X.info = { frage: p.offen || 'Wann ist der Termin?', stichtag: istDatum(p.stichtag) ? p.stichtag : plusTage(portfolio ? sem.vorlesung.von : modulStart, r.stichtag_tage), quelle: p.quelle_suchen || null };
      } else if (p.alternativen === 'info_fehlt' && !pt.gewaehlt) {
        X.alternativen = 'info_fehlt';
        X.info = { frage: p.offen || p.unsicher || 'Welchen Termin schreibst du — und wie wählt man?', stichtag: istDatum(p.stichtag) ? p.stichtag : plusTage(sem.vorlesung.von, r.stichtag_tage), quelle: p.quelle_suchen || null };
      } else if (pt.kandidaten.length > 1) X.alternativen = pt.gewaehlt ? 'gewaehlt' : 'wahl_offen';
      else X.alternativen = 'fest';
      // Vorbereitung (Prüfungs-Topf): die Vorbereitungs-Elemente, ein geteilter Posten nach soll_h, sonst zu gleichen Teilen.
      const vb = zs.filter((z) => z.el === 'vorbereitung' && z.teil.pruefung === p.id);
      const pt_ = zs.filter((z) => z.el === 'pruefungstermin' && z.teil.pruefung === p.id);
      X.vorbereitung = vb; X.termine_p = pt_;
      X.herkunft = [];
      for (const z of vb) {
        const po = (m.posten || []).find((x) => x.id === z.teil.posten);
        const K = po ? Math.round(po.mult * po.h * 60) : 0;
        const teilen = zs.filter((x) => x.el === 'vorbereitung' && x.teil.posten === z.teil.posten);
        z.kontingent_min = z.teil.soll_h != null ? Math.round(z.teil.soll_h * 60) : Math.round(K / Math.max(1, teilen.length));
        X.herkunft.push({ art: 'posten', text: po ? `${po.titel}${teilen.length > 1 ? ` (Anteil)` : ''}` : z.teil.titel, min: z.kontingent_min });
      }
      X.termine_p_min = pt_.reduce((s, z) => s + z.termine_min, 0);
      xs.push(X);
      erg.pruefungen.set(p.id, X);
    }
    // Die Hauptprüfung des Moduls bekommt die Reste nach G5: die mit dem spätesten geltenden Termin, sonst die letzte.
    const mitTermin = xs.filter((x) => x.termin);
    const haupt = mitTermin.length ? mitTermin.sort((a, b) => (a.termin.datum < b.termin.datum ? 1 : -1))[0] : xs[xs.length - 1];
    for (const P of erg.posten.filter((q) => q.modul === m && q.g5_min > 0)) {
      if (!haupt) continue;
      P.g5_nach = haupt.id;
      haupt.herkunft.push({ art: 'g5', text: LV_WORT[P.lv] || `aus ${P.titel}`, min: P.g5_min, posten: P.id });
    }
    for (const X of xs) {
      const st = status[X.id] || {};
      X.haupt = X === haupt;
      X.kontingent_min = X.herkunft.reduce((s, h) => s + h.min, 0);
      // Wiederholung (G9): eigenes Kontingent außerhalb der 180 h, Vorschlag = die Vorbereitung des ersten Versuchs.
      if (X.weiter && X.status === 'nicht_bestanden') {
        X.wiederholung = true;
        X.kontingent_min = Number.isFinite(st.kontingent_h) ? Math.round(st.kontingent_h * 60) : X.kontingent_min;
      }
      // Was der Prüfung dient und als Termin stattfindet (Fragestunde, Probeklausur), ist Teil des Kontingents — der
      // Vorschlag verteilt nur den Rest.
      X.zu_planen_min = Math.max(0, X.kontingent_min - X.termine_p_min);
      const bloecke = X.vorbereitung.flatMap((z) => z.vk.filter((v) => v.quelle === 'block'));
      X.bloecke = bloecke;
      const ab = X.wiederholung ? (istDatum(st.note_am) ? st.note_am : plusTage(st.termin || (X.datiert[0] && X.datiert[0].datum) || stoffStart, 1)) : stoffStart;
      X.fenster = { ab, bis: X.termin ? plusTage(X.termin.datum, -1) : null };
      // Vor dem Fenster zählt keine Vorbereitung (V-0357, Prüfung W01/W02: ein Block am 13.10. zählte voll für den
      // EINFWI-Test) — wie nach der Prüfung (nach_pruefung): Er steht da, zählt aber nicht.
      for (const v of bloecke) {
        if (v.datum >= ab || !(v.zaehlt_min > 0)) continue;
        const z = erg.teile.get(v.teil);
        z.plan_min -= v.plan_min || 0; z.erledigt_min -= v.erledigt_min || 0;
        z.fehlt_min = Math.max(0, z.kontingent_min - z.plan_min); z.offen_min = Math.max(0, z.kontingent_min - z.erledigt_min); z.ist_min = z.plan_min;
        v.zaehlt_min = 0; v.plan_min = 0; v.erledigt_min = 0; v.flags.push('vor_fenster');
      }
      const vor = bloecke.filter((v) => v.flags.includes('vor_fenster'));
      if (vor.length) X.vorbereitung[0].flags.push({ art: 'vor_fenster', text: `${vor.length} Lernblock${vor.length > 1 ? 'e liegen' : ' liegt'} vor dem Fenster (ab ${datumTag(ab)}) und ${vor.length > 1 ? 'zählen' : 'zählt'} nicht` });
      X.erledigt_min = bloecke.reduce((s, v) => s + (v.erledigt_min || 0), 0);
      X.geplant_min = bloecke.filter((v) => !v.vergangen || v.ist === 'offen').reduce((s, v) => s + (v.ist === 'offen' || !v.vergangen ? v.zaehlt_min : 0), 0);
      X.offen_min = Math.max(0, X.zu_planen_min - X.erledigt_min - X.geplant_min);
      // Fenster vorbei, Vorbereitung nicht erledigt (Testfall 27): „verfehlt“ — nichts wird verschoben, du entscheidest.
      X.verfehlt_min = heute && X.fenster.bis && heute > X.fenster.bis ? Math.max(0, X.zu_planen_min - X.erledigt_min) : 0;
      X.fristen = fristen(erg, X, xs);
      // Portfolio: wie viele Punkte die übrigen Teile für das Bestehen (die 4,0) brauchen (Testfall 39).
      if (X.portfolio && m.portfolio && Number.isFinite(m.portfolio.bestehen)) {
        const teile = xs.filter((x) => x.portfolio);
        const erreicht = teile.reduce((s, x) => s + (Number.isFinite(x.erreicht) ? x.erreicht : 0), 0);
        const offen = teile.filter((x) => !Number.isFinite(x.erreicht));
        X.portfolio_rest = { noetig: Math.max(0, m.portfolio.bestehen - erreicht), in: offen.map((x) => x.id), von: offen.reduce((s, x) => s + (x.punkte || 0), 0) };
      }
    }
    // Portfolio: eine Anmeldung gilt für alle Teile (BuK, EINFWI) — ein Teil ohne eigenen Status erbt sie.
    const pf = xs.filter((x) => x.portfolio);
    const pfStatus = pf.map((x) => x.status).find((s) => ['angemeldet', 'vorbehalt', 'abgemeldet'].includes(s)) || (pf.some((x) => (plan.angemeldet || {})[x.id]) ? 'angemeldet' : null);
    for (const X of xs) {
      if (!X.status) X.status = X.portfolio ? pfStatus : ((plan.angemeldet || {})[X.id] ? 'angemeldet' : null);
      if (!X.status) X.status = 'offen';
      X.zaehlt = !['abgemeldet', 'bestanden'].includes(X.status) && !(X.status === 'nicht_bestanden' && !X.wiederholung);
    }
  }
  // Die Vorbereitungs-Elemente tragen jetzt ihren Anteil (ohne G5 — der steht an der Prüfung).
  for (const z of erg.teile.values()) {
    if (z.el !== 'vorbereitung') continue;
    z.soll_min = z.kontingent_min;
    z.fehlt_min = Math.max(0, z.kontingent_min - z.plan_min);
    z.offen_min = Math.max(0, z.kontingent_min - z.erledigt_min);
  }
  // Quoten (Zulassung): TECHGI 80 % der Quizpunkte (Testfall 36). Jede ✗-Einheit zählt als verpasst.
  erg.quoten = [];
  for (const z of erg.teile.values()) {
    const q = z.teil.quote;
    if (!q || !(q.anteil > 0)) continue;
    const n = (z.einheiten && z.einheiten.length) || (z.teil.einheiten && z.teil.einheiten.anzahl) || 0;
    if (!n) continue;
    const ist = plan.ist || {};
    const nrn = z.einheiten ? z.einheiten.map((e) => e.nr) : Array.from({ length: n }, (_, i) => i + 1);
    const verpasst = nrn.filter((nr) => (istEintrag(ist[`${z.teil.id}#${nr}`]) || {}).s === 'nein').length;
    const erlaubt = Math.floor(n * (1 - q.anteil) + 1e-9);
    erg.quoten.push({ z, pruefung: q.pruefung || null, n, verpasst, hoechstens: (n - verpasst) / n, puffer: erlaubt - verpasst, anteil: q.anteil, text: q.text || null });
  }
}

/** Die Fristen einer Prüfung als Verweise (G7, § 63 AllgStuPO; ISIS geht vor). */
function fristen(erg, X, xs) {
  const r = erg.regeln, sem = erg.sem;
  const p = X.p, aus = [];
  const t = X.termin;
  const add = (art, datum, text, quelle, verweis, zeit = null, regel = false) => { if (istDatum(datum)) aus.push({ art, datum, zeit, text, quelle, verweis: verweis || null, regel, pruefung: X.id, modul: X.modul.id }); };
  // Bei einem Portfolio zählt der erste Teil (der früheste geltende Termin aller Teile).
  const erster = X.portfolio ? xs.filter((x) => x.portfolio && x.termin).map((x) => x.termin.datum).sort()[0] : null;
  const a = p.anmeldung || (X.portfolio ? (xs.find((x) => x.portfolio && x.p.anmeldung) || {}).p?.anmeldung : null);
  if (a && istDatum(a.von)) add('anmeldung_ab', a.von, `Anmeldung öffnet${a.wo ? ` (${String(a.wo).split(' (')[0]})` : ''}`, a.quelle || 'ISIS', null, a.von_zeit || null);
  else if (t && !X.portfolio) add('anmeldung_ab', plusTage(sem.vorlesung.von, r.anmeldung_ab_tage), 'Anmeldung öffnet (in der Regel)', '§ 63 Abs. 4 AllgStuPO', null, null, true);
  if (a && istDatum(a.bis)) add('anmeldung', a.bis, `Anmeldung endet${a.wo ? ` (${String(a.wo).split(' (')[0]})` : ''}`, a.quelle || 'ISIS', null, a.bis_zeit || null);
  else if (X.portfolio && erster) add('anmeldung', plusTage(erster, -r.portfolio_tage), 'Anmeldung zum Portfolio spätestens', '§ 63 Abs. 4 AllgStuPO', `${r.portfolio_tage} Tag vor dem ersten Teil`);
  else if (t) add('anmeldung', plusTage(t.datum, -r.anmeldung_tage), 'Anmeldung spätestens', '§ 63 Abs. 4 AllgStuPO', `gewählter Termin − ${r.anmeldung_tage} Tage`);
  if (X.portfolio && erster) add('abmeldung', plusTage(erster, -r.portfolio_tage), 'Abmeldung vom Portfolio spätestens', '§ 63 Abs. 5 AllgStuPO', `${r.portfolio_tage} Tag vor dem ersten Teil`);
  else if (t) add('abmeldung', plusTage(t.datum, -r.abmeldung_tage), 'Abmeldung spätestens', '§ 63 Abs. 5 AllgStuPO', `gewählter Termin − ${r.abmeldung_tage} Tage`);
  // Zulassung (Übungsschein, Prog1WINF): der Vorbehalt lässt sich bis zwei Wochen vorher aufheben.
  if (t && p.zulassung && /voraussetzung für|übungsschein|leistungsnachweis|prog1winf/i.test(p.zulassung)) {
    add('vorbehalt', plusTage(t.datum, -r.vorbehalt_tage), 'Zulassung nachweisen (Vorbehalt aufheben)', '§ 63 Abs. 2 AllgStuPO', `gewählter Termin − ${r.vorbehalt_tage} Tage`);
  }
  return aus.sort((x, y) => (x.datum < y.datum ? -1 : 1));
}

// ── 10 · Last ────────────────────────────────────────────────────────────────────────────────────
// Was an einem Tag und in einer Woche schon liegt: Termine (ohne Ausfälle, mit gewünschten Gruppen), geltende
// Prüfungen, alle Blöcke — und der Bedarf des Semester-Topfs, den noch kein Block deckt (Wochenwert, Einheiten der
// Woche, erwartete Termine): ihn verteilt die Last auf Mo–Fr. Danach richtet sich der Vorschlag (G8).

/** Was ein Element in einer Woche braucht (Bedarf) — die Grundlage für „Diese Woche“ und für die Last. */
export function bedarfIn(erg, z, w) {
  if (!z.P || z.topf === 'pruefung') return 0;
  if (w.art !== 'vorlesung') return 0;
  if (z.el === 'rest') {
    if (z.wartet || z.einzeln || !z.fenster || !z.fenster.ab) return 0;
    if (w.bis < z.fenster.ab || w.von > z.fenster.bis) return 0;
    if (erg.heute && w.bis < erg.heute) return 0; // vergangene Wochen: nur, was dort liegt
    // Beginnt der Stoff mitten in der Woche (PROG1 am Do 15.10.), ist nur der Rest der Woche dran (V-0357: W01 verlangte
    // die ganze Wochenrate Labs, obwohl der Stoff erst Donnerstag beginnt).
    if (z.fenster.ab > w.von) {
      const werktage = [0, 1, 2, 3, 4].map((i) => plusTage(w.von, i)).filter((d) => d >= z.fenster.ab).length;
      return Math.round(z.wochenwert_min * werktage / 5);
    }
    return Math.round(z.wochenwert_min);
  }
  if (z.el === 'einheiten') {
    // Was ein Block deckt, ist in der Woche dran, in der er liegt (V-0357, §3: „Videos zählen in der Woche, in der ein
    // Block sie deckt“ — vorher in der Woche der Freigabe: BuK-Video 1 vom Fr 16.10. stand in W01 als offen, obwohl der
    // Block am Mi 21.10. es deckt); was keiner deckt, in der Woche seiner Freigabe.
    // Genauer: je Woche die Minuten, die ihre Blöcke decken, und in der Woche der Freigabe, was keiner deckt — so steht
    // ein Video, das der Block der Folgewoche nachholt, nicht als offen da.
    if (z.gruppen && z.gruppen.some((g) => g.bedarf_min)) {
      return z.gruppen.filter((g) => g.bedarf_min).reduce((s, g) => s
        + (g.deckung || []).filter((d) => d.datum >= w.von && d.datum <= w.bis).reduce((x, d) => x + d.min, 0)
        + (montagVon(g.ab) === w.von ? Math.max(0, g.bedarf_min - g.belegt_min) : 0), 0);
    }
    if (z.einheiten && z.einheiten.length) return z.einheiten.filter((e) => e.ab >= w.von && e.ab <= w.bis).reduce((s, e) => s + z.einheit_dauer(e), 0);
    const vl = erg.wochen.filter((x) => x.art === 'vorlesung');
    return Math.round(z.einheiten_min / Math.max(1, vl.length - 1)) * (w.nr > 1 ? 1 : 0);
  }
  if (z.el === 'termin' && z.erwartet_min) {
    const e = z.teil.erwartet;
    const ab = e.ab_woche || 2;
    return w.nr >= ab && w.nr < ab + e.anzahl ? (e.dauer_min || erg.regeln.erwartet_min) : 0;
  }
  return 0;
}

function last(erg) {
  const tage = new Map(), wochen = new Map();
  const tag = (d) => {
    if (!tage.has(d)) tage.set(d, { termine: 0, pruefung: 0, bloecke: 0, pbloecke: 0, bedarf: 0 });
    return tage.get(d);
  };
  for (const v of erg.vorkommen) {
    if (v.ganztag || v.start == null || v.ende == null) continue;
    if (v.quelle === 'termin') { if (!v.ausgefallen) tag(v.datum).termine += zaehlt(v); }
    else if (v.quelle === 'pruefung') { if (v.wichtig) tag(v.datum).pruefung += v.ende - v.start; }
    else if (v.quelle === 'einzel') tag(v.datum).termine += v.ende - v.start;
    else if (v.quelle === 'block') {
      if (v.ist === 'verschoben' || v.ist === 'nein') continue;
      const z = v.teil ? erg.teile.get(v.teil) : null;
      // Ohne die Zeit, die er auf einem Termin liegt — die zählt der Termin schon (V-0357: „Mo 19.10. 9,25 h über 9 h“
      // war ein Lab-Block auf dem Kick-off, doppelt gezählt).
      const dauer = Math.max(0, v.ende - v.start - (v.ueberlappt || 0));
      if (z && z.topf === 'pruefung') tag(v.datum).pbloecke += dauer;
      else tag(v.datum).bloecke += dauer;
    }
  }
  // Ungedeckter Bedarf je Vorlesungswoche, verteilt auf Mo–Fr.
  for (const w of erg.wochen) {
    let bedarf = 0;
    for (const z of erg.teile.values()) {
      const b = bedarfIn(erg, z, w);
      if (!b) continue;
      // Gedeckt ist, was dort an Zeit liegt — auch ein Block, der (noch) nicht zählt (vor dem Stoff), belegt die Zeit schon.
      const gelegt = z.vk.filter((v) => v.datum >= w.von && v.datum <= w.bis && v.quelle === 'block' && v.ist !== 'nein' && v.ist !== 'verschoben').reduce((s, v) => s + v.ende - v.start, 0);
      bedarf += Math.max(0, b - gelegt);
    }
    if (bedarf) for (let i = 0; i < 5; i++) tag(plusTage(w.von, i)).bedarf += bedarf / 5;
    wochen.set(w.id, { woche: w, bedarf });
  }
  for (const [d, x] of tage) x.summe = x.termine + x.pruefung + x.bloecke + x.pbloecke + x.bedarf;
  for (const w of erg.wochen) {
    const x = wochen.get(w.id);
    x.termine = 0; x.pruefung = 0; x.bloecke = 0; x.pbloecke = 0; x.summe = 0;
    for (let i = 0; i < 7; i++) {
      const t = tage.get(plusTage(w.von, i));
      if (!t) continue;
      x.termine += t.termine; x.pruefung += t.pruefung; x.bloecke += t.bloecke; x.pbloecke += t.pbloecke; x.summe += t.summe;
    }
  }
  erg.last = { tage, wochen };
}
export const tagLast = (erg, d) => (erg.last.tage.get(d) || { summe: 0 }).summe;
export const wochenLast = (erg, d) => (erg.last.wochen.get(montagVon(d)) || { summe: 0 }).summe;

// ── 10b · Vorschlag für die Prüfungsvorbereitung — alle Prüfungen gemeinsam (V-0357) ──────────────
// Silas, 12.10. abends: „pro Prüfung … zehn Stunden sollen möglichst, wenn es geht, ans Wochenende davor, und nochmal zehn
// Stunden ans Wochenende davor, und dann der Rest auf vier Stunden pro Wochenende, jedes Wochenende davor … eine Logik,
// die einmal alle Vorschläge von allen Klausurterminen in einen Topf wirft … dass alle von denen ihre eigene Zeit zum
// Lernen brauchen … an einem Tag für mehrere Klausuren lernen können.“ (Vorher rechnete jede Prüfung für sich, nach
// Datum: Die frühere nahm sich die Wochenenden, die spätere bekam Reste — PROG1 am 17.02. 4 h hier, 4 h dort.)
//  - Je Prüfung Perioden rückwärts: P1 = vom Samstag vor der Prüfung bis zum Tag davor, dann je sieben Tage (Sa–Fr).
//    In der Vorlesungszeit sind das genau Sa und So; in der vorlesungsfreien Zeit gehören die freien Wochentage dazu.
//  - Ziel je Periode: we_h (10 h), we2_h (10 h), dann je we_rest_h (4 h), bis das Kontingent gedeckt ist; was dort
//    schon liegt, zählt mit.
//  - Alle Prüfungen zusammen, Periode für Periode (erst alle P1, dann alle P2 …), in halben Stunden reihum: So teilen
//    sich zwei Prüfungen ein Wochenende, die nahe Prüfung geht der fernen vor, und an einem Tag lernt man auch für zwei.
//    Je Prüfung bekommt Sa/So vor den Wochentagen, dann der Tag mit dem wenigsten (bei Gleichstand der spätere):
//    2,5 h → Sa 1 h, So 1,5 h; freie Wochentage erst, wenn das Wochenende voll ist.
//  - Was eine Periode nicht fasst (9 h je Tag nach allem schon Geplanten), wandert in die Periode davor.
//  - Nie an Feiertagen, nie vor heute, nie vor dem Fenster der Prüfung. 45 h je Woche gelten hier nicht (G10, V-0356) —
//    volle Wochen zeigt der Abgleich.
function vorschlag(erg) {
  const r = erg.regeln, sem = erg.sem, heute = erg.heute;
  const fei = feiertage(sem);
  const vt = new Map(); // vorgeschlagene Minuten je Tag (alle Prüfungen)
  const frei = (d) => Math.max(0, r.tag_h * 60 - tagLast(erg, d) - (vt.get(d) || 0));
  const erlaubt = (d) => !fei.has(d) && (wochentag(d) >= 5 || !istVorlesungstag(sem, d));
  // Nach Datum, am selben Tag nach Uhrzeit (BuK 9 Uhr vor PROG1 14 Uhr am 17.02.) — die Reihenfolge innerhalb einer Runde.
  const xs = [...erg.pruefungen.values()].filter((X) => X.termin && X.zaehlt && X.fenster.bis)
    .sort((a, b) => (a.termin.datum < b.termin.datum ? -1 : a.termin.datum > b.termin.datum ? 1 : String(a.termin.start || '').localeCompare(String(b.termin.start || ''))));
  for (const X of erg.pruefungen.values()) { X.vorschlag = []; X.passt_nicht_min = 0; }
  const st = xs.map((X) => {
    const ab = heute && heute > X.fenster.ab ? heute : X.fenster.ab;
    const tagX = X.termin.datum;
    const zurueck = ((wochentag(tagX) - 5 + 7) % 7) || 7; // bis zum Samstag davor (eine Prüfung am Samstag: der vorige)
    const perioden = [];
    for (let von = plusTage(tagX, -zurueck), bis = plusTage(tagX, -1); bis >= ab; bis = plusTage(von, -1), von = plusTage(von, -7)) {
      const tage = [];
      for (let d = von; d <= bis; d = plusTage(d, 1)) if (d >= ab && erlaubt(d)) tage.push(d);
      perioden.push(tage);
    }
    const schon = new Map();
    for (const v of X.bloecke || []) schon.set(v.datum, (schon.get(v.datum) || 0) + (v.zaehlt_min || 0));
    return { X, perioden, schon, rest: X.offen_min, uebertrag: 0, wohin: new Map() };
  });
  const ziel = (i) => (i === 0 ? r.we_h : i === 1 ? r.we2_h : r.we_rest_h) * 60;
  const runden = Math.max(0, ...st.map((s) => s.perioden.length));
  for (let i = 0; i < runden; i++) {
    const anfragen = [];
    for (const s of st) {
      if (i >= s.perioden.length) continue;
      const tage = s.perioden[i];
      const da = tage.reduce((x, d) => x + (s.schon.get(d) || 0), 0);
      const will = Math.min(Math.max(0, s.rest), Math.max(0, ziel(i) + s.uebertrag - da));
      if (will > 0) anfragen.push({ s, tage, will, got: 0, je: new Map() });
      else s.uebertrag = 0;
    }
    for (let weiter = true; weiter;) {
      weiter = false;
      for (const q of anfragen) {
        if (q.got >= q.will) continue;
        const hat = (d) => (q.je.get(d) || 0) + (q.s.schon.get(d) || 0);
        // Sa und So zuerst (Silas: „ans Wochenende davor“), freie Wochentage nur, wenn das Wochenende voll ist.
        const we = (d) => (wochentag(d) >= 5 ? 0 : 1);
        const kand = q.tage.filter((d) => frei(d) >= 30).sort((a, b) => we(a) - we(b) || hat(a) - hat(b) || (a < b ? 1 : -1));
        if (!kand.length) continue;
        const d = kand[0];
        q.je.set(d, (q.je.get(d) || 0) + 30); vt.set(d, (vt.get(d) || 0) + 30);
        q.got += 30; weiter = true;
      }
    }
    for (const q of anfragen) {
      for (const [d, m] of q.je) q.s.wohin.set(d, (q.s.wohin.get(d) || 0) + m);
      q.s.rest -= q.got;
      q.s.uebertrag = Math.max(0, q.will - q.got); // was diese Periode nicht fasste, will die davor zusätzlich
    }
  }
  for (const s of st) {
    s.X.vorschlag = [...s.wohin].map(([datum, min]) => ({ datum, min })).sort((a, b) => (a.datum < b.datum ? -1 : 1));
    s.X.passt_nicht_min = Math.max(0, s.rest);
  }
  erg.vorschlag_tag = vt;
}

// ── 11 · Abgleich (Audit): nur prüfend ───────────────────────────────────────────────────────────

function audit(erg) {
  const r = erg.regeln;
  const aus = { module: [], wochen: [], tage: [], pruefungstage: [], rueckfall: [] };
  // Je Modul: „mehr“ und „weniger“ getrennt, nur über die Reste innerhalb der Toleranz (Präsenz-Posten).
  const mods = new Map();
  for (const P of erg.posten) {
    if (!mods.has(P.modul.id)) mods.set(P.modul.id, { modul: P.modul, mehr_min: 0, weniger_min: 0, posten: [] });
    const x = mods.get(P.modul.id);
    x.posten.push(P);
    if (P.art === 'praesenz' && P.audit && P.audit.ergebnis === 'passt') {
      if (P.audit.diff_min > 0) x.mehr_min += P.audit.diff_min; else x.weniger_min -= P.audit.diff_min;
    }
  }
  for (const x of mods.values()) { x.meldung = x.mehr_min > r.modul_meldung_min || x.weniger_min > r.modul_meldung_min; aus.module.push(x); }
  // Je Woche und Tag: Last gegen 45 h und 9 h — gezählt, was wirklich liegt (Termine, Prüfungen, Blöcke).
  for (const [id, x] of erg.last.wochen) {
    const gelegt = x.termine + x.pruefung + x.bloecke + x.pbloecke;
    if (gelegt > r.woche_h * 60) aus.wochen.push({ woche: x.woche, last_min: gelegt });
  }
  for (const [d, x] of erg.last.tage) {
    const gelegt = x.termine + x.pruefung + x.bloecke + x.pbloecke;
    if (gelegt > r.tag_h * 60) aus.tage.push({ datum: d, last_min: gelegt });
  }
  aus.tage.sort((a, b) => (a.datum < b.datum ? -1 : 1));
  // Zwei Prüfungen an einem Tag (Testfall 31) und Rückfalltermine, die sich überschneiden (Testfall 32).
  const proTag = new Map();
  for (const X of erg.pruefungen.values()) if (X.termin && X.zaehlt) proTag.set(X.termin.datum, [...(proTag.get(X.termin.datum) || []), X]);
  for (const [d, xs] of proTag) if (xs.length > 1) aus.pruefungstage.push({ datum: d, pruefungen: xs });
  const rueck = [];
  for (const X of erg.pruefungen.values()) for (const t of X.datiert) if (t !== X.termin && t.start && t.ende) rueck.push({ X, t });
  for (let i = 0; i < rueck.length; i++) {
    for (let j = i + 1; j < rueck.length; j++) {
      const a = rueck[i], b = rueck[j];
      if (a.X === b.X || a.t.datum !== b.t.datum) continue;
      const u = Math.min(timeMin(a.t.ende), timeMin(b.t.ende)) - Math.max(timeMin(a.t.start), timeMin(b.t.start));
      if (u > 0) aus.rueckfall.push({ datum: a.t.datum, a: a.X, b: b.X, ueber_min: u });
    }
  }
  erg.audit = aus;
}
const timeMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

// ── 12 · Meldungen und das Offene ────────────────────────────────────────────────────────────────
// Jede Meldung trägt ihre Stufe: kritisch (rot: jetzt handeln) · achtung (orange: prüfen, entscheiden) · dran
// (hellblau: du bist dran) · kommt (grau: kommt noch — Augen offen) · spaeter · info. Sie hängen am Element (z.flags),
// am Modul (r.flags: Prüfungen, Abgleich) oder am Plan (erg.planFlags); erg.offen ist die Liste fürs „Offen“.

function meldungen(erg, angebot, plan) {
  const heute = erg.heute, r = erg.regeln;
  const tage = (d) => (heute ? tageZwischen(heute, d) : null);
  const offen = [];
  const neu = (ziel, f) => { ziel.push(f); offen.push(f); return f; };
  erg.modulFlags = new Map((angebot.module || []).map((m) => [m.id, []]));
  const am = (mid) => erg.modulFlags.get(mid);
  for (const z of erg.teile.values()) {
    const t = z.teil, mid = z.modul.id;
    const f = (art, stufe, text, extra = {}) => neu(z.flags, { art, stufe, text, modul: mid, teil: t.id, ...extra });
    // Info fehlt: Augen offen bis zum Stichtag, danach nachfragen (kein Fehler).
    if (z.info && !z.info.wartet) {
      const st = z.info.stichtag;
      const vorbei = st && heute && heute > st;
      f('info_fehlt', vorbei ? 'achtung' : 'kommt', `${vorbei ? 'Stichtag vorbei — nachfragen: ' : ''}${z.info.frage}`, { stichtag: st, frage: z.info.frage });
    }
    if (z.info && z.info.wartet) f('wartet', 'kommt', `Wartet auf ${z.wartet_auf.teil.titel}: erst mit ihren Terminen beginnt das Fenster`, { stichtag: z.info.stichtag });
    if (z.alternativen === 'wahl_offen') {
      const a = t.anmeldung, frist = a && istDatum(a.bis) ? a.bis : null;
      const n = frist ? tage(frist) : null;
      const gew = (t.optionen || []).find((o) => o.id === (plan.wahl || {})[t.id]);
      const text = gew ? `Wunsch ${gew.label.split(' · ')[0]} — anmelden${frist ? ` bis ${datumTag(frist)}${a.bis_zeit ? ` ${a.bis_zeit}` : ''}` : ''}${a && a.wo ? ` (${String(a.wo).split(' (')[0]})` : ''}, dann „Angemeldet“`
        : `Gruppe wählen (${(t.optionen || []).length} zur Auswahl)${frist ? ` — Anmeldung bis ${datumTag(frist)}` : ''}`;
      f('wahl_offen', n != null && n <= 7 ? 'kritisch' : 'dran', text, { anmeldung: frist ? t.id : null, datum: frist });
    }
    if (z.alternativen === 'zuteilung_offen') f('zuteilung_offen', 'dran', 'Angemeldet — die Zuteilung steht noch aus. In MOSES nachsehen und bestätigen', { zuteilung: t.id });
    if (z.alternativen === 'frist_vorbei') {
      const a = t.anmeldung, frist = a && istDatum(a.bis) ? a.bis : null;
      f('frist_vorbei', 'achtung', `Anmeldung${frist ? ` bis ${datumTag(frist)}` : ''} vorbei — warst du angemeldet? Dann „Angemeldet“ (und nach der Zuteilung „Zugeteilt“), sonst „Kein Platz“`, { anmeldung: t.id, zuteilung: t.id, datum: frist });
    }
    if (z.alternativen === 'gescheitert') {
      const folge = t.folge || (/prog1|tutorial/i.test(`${t.id} ${t.titel}`) ? 'Ohne Tutorial kein Prog1WINF — ohne Prog1WINF keine Klausur. Beim Fachgebiet nach einem Platz fragen.' : 'Ohne Gruppe fehlt diese Präsenz: beim Fachgebiet nach einem Platz fragen, sonst geht die Zeit nach G5 in die Prüfungsvorbereitung.');
      f('gescheitert', 'kritisch', `Gescheitert: ${(plan.zugeteilt || {})[t.id] === 'keine' ? 'kein Platz zugeteilt' : 'nicht rechtzeitig angemeldet'}. ${folge}`);
    }
    // Lebenslauf: Unbestätigtes (G6), Nacharbeit nach einem verpassten Termin, verfehlte Reste (Testfall 27).
    const unbest = z.vk.filter((v) => v.ist === 'offen');
    if (unbest.length) f('unbestaetigt', 'dran', `${unbest.length} ${unbest.length > 1 ? 'Vorkommen' : 'Vorkommen'} vorbei, noch ohne ✓ oder ✗ (zuerst ${datumKurz(unbest[0].datum)})`, { anzahl: unbest.length });
    for (const v of z.vk.filter((x) => x.nacharbeit && !x.nacharbeit.erledigt)) {
      const naechster = z.vk.find((x) => x.quelle === 'termin' && x.datum > v.datum && !x.ausgefallen);
      const bis = naechster ? naechster.datum : erg.sem.vorlesung.bis;
      f('nacharbeit', heute && heute > bis ? 'achtung' : 'dran', `Nacharbeit ${stunden(v.nacharbeit.min)} für ${datumTag(v.datum)} (verpasst) — bis ${datumTag(bis)}`, { vk: v.id, datum: bis });
    }
    if (z.verfehlt_min >= 30) f('verfehlt', 'achtung', `Fenster vorbei, ${stunden(z.verfehlt_min)} nicht erledigt — verfallen lassen oder umbuchen: du entscheidest`);
    // Videolängen: erst ablesbar, wenn das Video erschienen ist.
    if (t.art === 'video' && z.einheiten) {
      const faellig = z.einheiten.filter((e) => e.laenge_min == null && heute && e.ab <= heute).length;
      const ohne = z.einheiten.filter((e) => e.laenge_min == null).length;
      if (faellig) f('laenge', 'dran', `${faellig} ${faellig > 1 ? 'Videos sind' : 'Video ist'} erschienen — Länge eintragen`, { faellig });
      else if (ohne) f('laenge', 'kommt', `${ohne} Videolängen kommen noch — angenommen je ${(t.einheiten && (t.einheiten.laenge_min || t.einheiten.annahme_min)) || 90} min`);
    }
    // Was das Angebot sonst als unsicher oder Hinweis trägt.
    if (t.unsicher) f('unsicher', z.info ? 'info' : 'achtung', t.unsicher);
    if (t.hinweis) f('hinweis', 'info', t.hinweis);
    // Die Rohmeldungen aus rechnen() (Konflikt, gesperrt, Bezug, leer, vor_stoff …) bekommen ihre Stufe hier; was zu tun
    // ist (verschieben, Überschneidung), steht auch im Offenen.
    // Rohmeldungen tragen noch kein Modul; eine, die ihre Stufe schon mitbringt (ungedeckt, gesperrt an einem Tag), kommt
    // genauso ins Offene (V-0357: vorher nur die ohne Stufe).
    for (const x of z.flags) if (!x.modul) {
      if (!x.stufe) x.stufe = rohStufe(x, z);
      x.modul = mid; x.teil = t.id;
      if (['kritisch', 'achtung', 'dran'].includes(x.stufe)) offen.push(x);
    }
  }
  // Posten: Abgleich-Ergebnisse, die eine Entscheidung brauchen (PROG1-Mehr wartet).
  for (const P of erg.posten) {
    if (!P.audit) continue;
    const mid = P.modul.id;
    if (P.audit.ergebnis === 'mehr' && P.art === 'praesenz') neu(am(mid), { art: 'entscheidung', stufe: 'achtung', modul: mid, posten: P.id, text: `${P.titel}: ${stunden(P.audit.diff_min)} mehr als die Aufwandstabelle — Entscheidung offen (Mehr behalten oder gegen ein anderes Kontingent buchen)` });
    if (P.g5_min > 0) neu(am(mid), { art: 'g5', stufe: 'info', modul: mid, posten: P.id, text: `${P.titel}: ${stunden(P.g5_min)} finden nicht statt — sie gehen ${P.g5_nach ? `in die Vorbereitung auf ${titelX(erg, P.g5_nach)}` : 'in die Prüfungsvorbereitung'} (G5, vorläufig)` });
  }
  for (const x of erg.audit.module) {
    if (x.mehr_min > r.modul_meldung_min) neu(am(x.modul.id), { art: 'modul_mehr', stufe: 'achtung', modul: x.modul.id, text: `Innerhalb der Toleranz zusammen ${stunden(x.mehr_min)} mehr als die Aufwandstabellen` });
    if (x.weniger_min > r.modul_meldung_min) neu(am(x.modul.id), { art: 'modul_weniger', stufe: 'achtung', modul: x.modul.id, text: `Innerhalb der Toleranz zusammen ${stunden(x.weniger_min)} weniger als die Aufwandstabellen` });
  }
  // Prüfungen: Termin fehlt, Wahl offen, Fristen, Vorbehalt, Vorschlag passt nicht, Quoten.
  for (const X of erg.pruefungen.values()) {
    const mid = X.modul.id;
    const f = (art, stufe, text, extra = {}) => neu(am(mid), { art, stufe, text, modul: mid, pruefung: X.id, ...extra });
    if (X.info) {
      const vorbei = heute && heute > X.info.stichtag;
      f('pruefung_info', vorbei ? 'achtung' : 'kommt', `${X.p.titel}: ${vorbei ? 'Stichtag vorbei — nachfragen: ' : ''}${X.info.frage}`, { stichtag: X.info.stichtag, frage: X.info.frage });
    }
    const anm = X.fristen.find((x) => x.art === 'anmeldung');
    if (X.alternativen === 'wahl_offen') {
      const n = anm ? tage(anm.datum) : null;
      f('pruefung_wahl', n != null && n <= 14 ? 'dran' : 'info', `${X.p.titel}: Termin wählen (${X.datiert.filter((x) => !x.nachholen).map((x) => datumKurz(x.datum)).join(' oder ')}) — bis dahin gilt der ${datumKurz(X.termin.datum)}`);
    }
    if (!X.zaehlt) continue;
    // Ein Portfolio hat eine Anmeldung für alle Teile (BuK: E-Tests und Test): einmal melden, am Teil mit der Anmeldung.
    const pfErster = X.portfolio ? [...erg.pruefungen.values()].filter((Y) => Y.modul === X.modul && Y.portfolio).find((Y) => Y.p.anmeldung) : null;
    const meldeAnmeldung = !X.portfolio || !pfErster || pfErster === X;
    if (['offen'].includes(X.status) && anm && meldeAnmeldung) {
      const n = tage(anm.datum);
      const ab = X.fristen.find((x) => x.art === 'anmeldung_ab');
      const laeuft = !ab || !heute || heute >= ab.datum;
      const was = X.portfolio ? `Portfolio (${[...erg.pruefungen.values()].filter((Y) => Y.modul === X.modul && Y.portfolio).map((Y) => Y.p.titel.replace(/\s*\(.*\)\s*/, '')).join(', ')})` : X.p.titel;
      if (n != null && n < 0) f('anmeldung', 'kritisch', `${was}: Anmeldefrist war am ${datumTag(anm.datum)} — angemeldet? Dann Stand setzen`, { datum: anm.datum });
      else if (laeuft && n != null) f('anmeldung', n <= 7 ? 'kritisch' : 'dran', `${was}: anmelden bis ${datumTag(anm.datum)}`, { datum: anm.datum });
      else if (ab) f('anmeldung', 'info', `${was}: Anmeldung ab ${datumTag(ab.datum)}, bis ${datumTag(anm.datum)}`, { datum: anm.datum });
    }
    const vb = X.fristen.find((x) => x.art === 'vorbehalt');
    if (X.status === 'vorbehalt' && vb) {
      const n = tage(vb.datum);
      f('vorbehalt', n != null && n <= 7 ? 'kritisch' : 'dran', `${X.p.titel}: angemeldet unter Vorbehalt — Zulassung bis ${datumTag(vb.datum)} nachweisen, sonst zählt die Prüfung nicht (§ 63 Abs. 2)`, { datum: vb.datum });
    }
    if (X.passt_nicht_min >= 30) f('passt_nicht', 'achtung', `${X.p.titel}: ${stunden(X.passt_nicht_min)} der Vorbereitung passen nicht mehr bis zum ${datumKurz(X.termin.datum)} — Entscheidung offen`, { passt_nicht: X.passt_nicht_min });
    if (X.verfehlt_min >= 30 && !['bestanden', 'nicht_bestanden'].includes(X.status)) f('verfehlt', 'achtung', `${X.p.titel}: ${stunden(X.verfehlt_min)} der Vorbereitung sind nicht erledigt (✓) — sie verfallen oder du buchst sie um: du entscheidest`);
    if (X.wiederholung) f('wiederholung', 'info', `${X.p.titel}: Wiederholung am ${datumTag(X.termin.datum)} — eigenes Kontingent ${stunden(X.kontingent_min)}, außerhalb der 180 h`);
  }
  for (const q of erg.quoten) {
    const mid = q.z.modul.id;
    if (q.verpasst && q.puffer <= 1) neu(am(mid), { art: 'quote', stufe: q.puffer < 0 ? 'kritisch' : 'achtung', modul: mid, teil: q.z.teil.id, text: `${q.z.teil.titel}: ${q.verpasst} verpasst — höchstens ${Math.round(q.hoechstens * 1000) / 10} % erreichbar, Puffer noch ${Math.max(0, q.puffer)} (nötig ${Math.round(q.anteil * 100)} %)` });
  }
  // Abgleich: Last, zwei Prüfungen an einem Tag, Rückfalltermine übereinander.
  erg.planFlags = erg.planFlags || [];
  const plf = (art, stufe, text, extra = {}) => neu(erg.planFlags, { art, stufe, text, modul: null, ...extra });
  // Je eine Meldung für alle zu vollen Wochen und Tage — sonst stünden elf Zeilen „mehr als 9 h“ untereinander.
  const liste = (xs, f) => (xs.length > 4 ? `${xs.slice(0, 4).map(f).join(', ')} und ${xs.length - 4} weitere` : xs.map(f).join(', '));
  if (erg.audit.wochen.length) plf('woche_voll', 'achtung', `${erg.audit.wochen.length === 1 ? 'Eine Woche' : `${erg.audit.wochen.length} Wochen`} über ${r.woche_h} h: ${liste(erg.audit.wochen, (x) => `ab ${datumKurz(x.woche.von)} ${stunden(x.last_min)}`)}`, { wochen: erg.audit.wochen.map((x) => x.woche.id) });
  if (erg.audit.tage.length) plf('tag_voll', 'achtung', `${erg.audit.tage.length === 1 ? 'Ein Tag' : `${erg.audit.tage.length} Tage`} über ${r.tag_h} h: ${liste(erg.audit.tage, (x) => `${datumTag(x.datum)} ${stunden(x.last_min)}`)}`, { tage: erg.audit.tage.map((x) => x.datum) });
  for (const x of erg.audit.pruefungstage) plf('zwei_pruefungen', 'achtung', `${datumTag(x.datum)}: ${x.pruefungen.length} Prüfungen an einem Tag (${x.pruefungen.map((X) => `${X.modul.kurz || X.modul.id} ${X.termin.start || ''}`.trim()).join(', ')})`, { datum: x.datum });
  for (const x of erg.audit.rueckfall) plf('rueckfall', 'info', `${datumTag(x.datum)}: die Rückfalltermine ${x.a.modul.kurz || x.a.modul.id} und ${x.b.modul.kurz || x.b.modul.id} überschneiden sich ${stunden(x.ueber_min)} — wichtig nur, wenn beide nötig werden`, { datum: x.datum });
  for (const x of erg.planFlags) if (x.modul === undefined) { if (!x.stufe) x.stufe = rohStufe(x, null); x.modul = null; offen.push(x); }
  erg.offen = offen.sort((a, b) => RANG[a.stufe] - RANG[b.stufe] || String(a.stichtag || a.datum || '9').localeCompare(String(b.stichtag || b.datum || '9')));
}
const titelX = (erg, pid) => { const X = erg.pruefungen.get(pid); return X ? `${X.modul.kurz || X.modul.id} ${X.p.titel}` : pid; };

/** Die Stufe einer Rohmeldung aus rechnen() (Überschneidung, Sperre, Bezug, Block ohne Inhalt). */
function rohStufe(f, z) {
  switch (f.art) {
    case 'konflikt': return z && z.teil.art === 'praesenz' ? 'kritisch' : 'achtung';
    case 'gesperrt': return f.dauernd ? 'dran' : 'info';
    case 'nach_pruefung': case 'vor_fenster': return 'achtung';
    default: return 'info'; // leer, vor_stoff, bezug, zu_kurz, einheit_unsicher …
  }
}

// ── Summen ───────────────────────────────────────────────────────────────────────────────────────

function summen(erg, angebot) {
  const r = erg.regeln;
  erg.module = (angebot.module || []).map((m) => {
    const zs = (m.teile || []).map((t) => erg.teile.get(t.id));
    const ps = erg.posten.filter((P) => P.modul === m);
    const xs = [...erg.pruefungen.values()].filter((X) => X.modul === m);
    const gesamt = m.lp * r.lp_h * 60;
    const tabelle = ps.reduce((s, P) => s + P.K, 0);
    const pruefung = ps.filter((P) => P.topf === 'pruefung').reduce((s, P) => s + P.K, 0);
    const g5 = ps.reduce((s, P) => s + P.g5_min, 0);
    const res = {
      modul: m, teile: zs, posten: ps, pruefungen: xs, flags: erg.modulFlags.get(m.id) || [],
      soll_min: gesamt, tabelle_min: tabelle,
      semester_min: tabelle - pruefung - g5, pruefung_min: pruefung + g5, g5_min: g5,
      erledigt_min: zs.reduce((s, z) => s + z.erledigt_min, 0),
      plan_min: zs.reduce((s, z) => s + z.plan_min, 0),
    };
    if (Math.abs(tabelle - gesamt) > 1) res.flags.push({ art: 'posten_summe', stufe: 'achtung', modul: m.id, text: `Die Aufwandstabelle ergibt ${stunden(tabelle)}, ${m.lp} LP sind ${stunden(gesamt)}` });
    res.stufe = hoechste([...res.flags, ...zs.map((z) => ({ stufe: hoechste(z.flags) }))]);
    for (const z of zs) { z.stufe = hoechste(z.flags); z.rot = z.stufe === 'kritisch'; z.status = z.stufe; }
    res.rot = res.stufe === 'kritisch';
    res.offen = zs.filter((z) => z.rot).length;
    return res;
  });
  const s = {
    soll_min: erg.module.reduce((a, x) => a + x.soll_min, 0),
    semester_min: erg.module.reduce((a, x) => a + x.semester_min, 0),
    pruefung_min: erg.module.reduce((a, x) => a + x.pruefung_min, 0),
    erledigt_min: erg.module.reduce((a, x) => a + x.erledigt_min, 0),
    plan_min: erg.module.reduce((a, x) => a + x.plan_min, 0),
  };
  s.zaehler = Object.fromEntries(STUFEN.map((st) => [st, 0]));
  for (const f of erg.offen) s.zaehler[f.stufe] += 1;
  // Das Wochensoll laut Tabellen: alle wöchentlichen Posten (Multiplikator 15) einer Woche.
  s.woche_min = (angebot.module || []).reduce((a, m) => a + (m.posten || []).filter((p) => p.mult > 1).reduce((b, p) => b + p.h * 60, 0), 0);
  erg.summe = s;
}

// ── Für die Seite ────────────────────────────────────────────────────────────────────────────────

/** Was ein Element in einer Woche braucht und was davon liegt (Silas, 11.10.: „für diese Woche: was wäre theoretisch
 *  dran und was ist davon tatsächlich eingeplant“). Ohne Woche: die Standardwoche (der Wochenwert). grund: ok · kommt
 *  (Info fehlt) · wartet · waehlen · planen. */
export function wochenBedarf(erg, wocheId = null, std = null) {
  const w = wocheId ? erg.wochen.find((x) => x.id === wocheId) : null;
  const aus = [];
  for (const z of erg.teile.values()) {
    if (z.topf === 'pruefung' || !z.P) continue;
    let soll = 0, ist = 0, grund = 'ok';
    const inW = (v) => w && v.datum >= w.von && v.datum <= w.bis;
    if (w) ist = z.vk.filter((v) => inW(v) && (v.quelle === 'block' || v.quelle === 'termin')).reduce((s, v) => s + (v.plan_min ?? v.zaehlt_min), 0);
    else ist = Math.round((std && std.get(z.teil.id)) || 0);
    if (z.el === 'termin') {
      if (z.alternativen === 'info_fehlt') { soll = w ? bedarfIn(erg, z, w) : (z.erwartet_min ? (z.teil.erwartet.dauer_min || erg.regeln.erwartet_min) : 0); grund = 'kommt'; }
      else if (z.alternativen === 'wahl_offen' && !((erg.plan || {}).wahl || {})[z.teil.id]) { grund = 'waehlen'; soll = 0; }
      else soll = w ? ist : 0;
    } else if (z.el === 'rest') {
      if (z.wartet) { grund = 'wartet'; soll = 0; }
      else if (z.einzeln) soll = 0;
      else {
        soll = w ? bedarfIn(erg, z, w) : Math.round(z.wochenwert_min);
      }
    } else if (z.el === 'einheiten') {
      if (!z.einheiten || !z.einheiten.length) { grund = 'kommt'; soll = w ? bedarfIn(erg, z, w) : 0; }
      else soll = w ? bedarfIn(erg, z, w) : Math.round(z.einheiten_min / Math.max(1, erg.wochen.filter((x) => x.art === 'vorlesung').length));
    }
    const offen = Math.max(0, soll - ist);
    // „Planen“ erst jenseits einer kleinen Toleranz (V-0357: „Labs 0,25 h“ jede Woche, obwohl der Abgleich „passt“ sagt).
    if (grund === 'ok' && offen >= Math.max(30, Math.round(soll * 0.1))) grund = 'planen';
    aus.push({ z, soll_min: soll, ist_min: ist, offen_min: grund === 'ok' ? 0 : offen, grund });
  }
  return aus;
}
