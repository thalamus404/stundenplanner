// /silas — die Auswertung (V-0357): wie der Plan tatsächlich läuft und wie er genutzt wird. Silas, 12.10.2026: „alles,
// was da an Daten erhoben wird, soll in einem weiteren Tab quasi einzusehen sein als Analytics … Es sollen sowieso Daten
// erhoben werden, wie der Stundenplan tatsächlich genutzt wird, wie das eigene Lernverhalten ist und sowas.“
// Reine Funktionen über rechnen() und den Plan: das Lernverhalten aus der Ist-Erfassung (plan.ist, G6), die Nutzung aus
// plan.nutzung (je Tag Sitzungen, Änderungen, aktive Minuten, Ansichten — die Seite zählt mit, docs/SILAS.md §3).

import * as M from './modell.mjs';

/** Die Arten der Ist-Erfassung in der Reihenfolge der Balken. */
export const IST_ARTEN = [
  ['ja', 'erledigt ✓'], ['teil', 'teilweise'], ['nein', 'nicht gemacht ✗'], ['verpasst', 'Präsenz verpasst'],
  ['verschoben', 'verschoben'], ['ausgefallen', 'ausgefallen'], ['offen', 'ohne ✓/✗'],
];

const leer = () => ({ soll: 0, ja: 0, teil: 0, nein: 0, verpasst: 0, verschoben: 0, ausgefallen: 0, offen: 0, n: 0 });

/** Ein vergangenes Vorkommen in Minuten je Art: was es hätte sein sollen und was daraus wurde. */
function buchen(x, v) {
  const termin = v.quelle === 'termin';
  const soll = termin ? M.zaehltMin(v.start, v.ende, v.ct) : Math.max(0, v.ende - v.start);
  x.soll += soll; x.n += 1;
  switch (v.ist) {
    case 'ja': x.ja += soll; break;
    case 'teil': x.teil += v.erledigt_min || 0; x.nein += Math.max(0, soll - (v.erledigt_min || 0)); break;
    case 'nein': if (termin) x.verpasst += soll; else x.nein += soll; break;
    case 'verschoben': x.verschoben += soll; break;
    case 'ausgefallen': x.ausgefallen += soll; break;
    default: x.offen += soll;
  }
}

/**
 * Die Auswertung bis heute. Ergebnis:
 *  - bilanz: alles Vergangene (Termine und Blöcke) als Minuten je Art, dazu quote_erledigt (✓ und teilweise ÷ fällig ohne
 *    Ausgefallenes und Verschobenes) und quote_bestaetigt (wie viel schon ✓/✗ hat)
 *  - wochen: je vergangene Woche dasselbe; arten: je Kategorie (Präsenz, Videos, Lernen, Aufgaben, Prüfung)
 *  - tage: je Wochentag, stunden: je Anfangsstunde — wann etwas liegen bleibt
 *  - praesenz: besucht/verpasst/ausgefallen (Anzahl); nachholen: offene ✗-Zeit je Modul (M.verpasst)
 *  - pruefungen: je Prüfung zu planen, gelegt, erledigt, Vorschlag; nutzung: je Tag aus plan.nutzung, Summen, Serie
 */
export function auswertung(erg, plan, heute) {
  const vergangen = erg.vorkommen.filter((v) => (v.quelle === 'termin' || v.quelle === 'block') && v.vergangen && !v.annahme);
  const bilanz = leer();
  const wochen = new Map(), arten = new Map(), tage = M.TAGE.map((t) => ({ tag: t, ...leer() })), stunden = new Map();
  for (const v of vergangen) {
    const z = v.teil ? erg.teile.get(v.teil) : null;
    buchen(bilanz, v);
    const w = M.wocheVon(erg.wochen, v.datum);
    if (w) { if (!wochen.has(w.id)) wochen.set(w.id, { woche: w, ...leer() }); buchen(wochen.get(w.id), v); }
    const k = z ? M.kategorie(z.teil) : 'lernen';
    if (!arten.has(k)) arten.set(k, { art: k, ...leer() });
    buchen(arten.get(k), v);
    buchen(tage[M.wochentag(v.datum)], v);
    const st = Math.floor(v.start / 60);
    if (!stunden.has(st)) stunden.set(st, { stunde: st, ...leer() });
    buchen(stunden.get(st), v);
  }
  const quote = (x) => {
    const faellig = x.soll - x.ausgefallen - x.verschoben;
    return { erledigt: faellig > 0 ? (x.ja + x.teil) / faellig : null, bestaetigt: x.soll > 0 ? 1 - x.offen / x.soll : null };
  };
  const praesenz = { besucht: 0, verpasst: 0, ausgefallen: 0, offen: 0 };
  for (const v of vergangen.filter((x) => x.quelle === 'termin')) {
    if (v.ist === 'ja' || v.ist === 'teil') praesenz.besucht += 1;
    else if (v.ist === 'nein') praesenz.verpasst += 1;
    else if (v.ist === 'ausgefallen') praesenz.ausgefallen += 1;
    else praesenz.offen += 1;
  }
  const nachholen = [];
  for (const r of erg.module) {
    const liste = r.teile.flatMap((z) => M.verpasst(erg, z));
    const offen = liste.filter((x) => x.art === 'nachholen' && !x.nachgeholt).reduce((s, x) => s + x.min, 0);
    const schwarz = liste.filter((x) => x.art === 'verpasst').reduce((s, x) => s + x.min, 0);
    if (liste.length) nachholen.push({ modul: r.modul, liste, offen_min: offen, verpasst_min: schwarz });
  }
  const pruefungen = [...erg.pruefungen.values()].filter((X) => X.zaehlt).map((X) => ({
    X, k: X.zu_planen_min, gelegt: Math.min(X.zu_planen_min, X.erledigt_min + X.geplant_min), erledigt: X.erledigt_min,
    vorschlag: X.vorschlag.reduce((s, v) => s + v.min, 0), passt_nicht: X.passt_nicht_min,
  })).sort((a, b) => ((a.X.termin && a.X.termin.datum) || '9') < ((b.X.termin && b.X.termin.datum) || '9') ? -1 : 1);
  // Nutzung: je Tag (plan.nutzung), die letzten 28 Tage als Reihe, und wie viele Tage am Stück bis heute.
  const n = (plan && plan.nutzung) || {};
  const tageN = Object.keys(n).filter(M.istDatum).sort();
  const reihe = [];
  for (let i = 27; i >= 0; i--) {
    const d = M.plusTage(heute, -i);
    const x = n[d] || {};
    reihe.push({ datum: d, sitzungen: x.sitzungen || 0, aenderungen: x.aenderungen || 0, aktiv_min: x.aktiv_min || 0 });
  }
  let serie = 0;
  for (let d = heute; n[d] && (n[d].sitzungen || n[d].aenderungen || n[d].aktiv_min); d = M.plusTage(d, -1)) serie += 1;
  const summe = (f) => tageN.reduce((s, d) => s + (n[d][f] || 0), 0);
  const ansichten = {};
  for (const d of tageN) for (const [k, c] of Object.entries(n[d].ansichten || {})) ansichten[k] = (ansichten[k] || 0) + c;
  return {
    bilanz: { ...bilanz, ...quote(bilanz) },
    wochen: [...wochen.values()].sort((a, b) => (a.woche.von < b.woche.von ? -1 : 1)).map((x) => ({ ...x, ...quote(x) })),
    arten: M.KATEGORIEN.map(([k, titel]) => ({ titel, ...(arten.get(k) || { art: k, ...leer() }) })).map((x) => ({ ...x, ...quote(x) })),
    tage: tage.map((x) => ({ ...x, ...quote(x) })),
    stunden: [...stunden.values()].sort((a, b) => a.stunde - b.stunde).map((x) => ({ ...x, ...quote(x) })),
    praesenz, nachholen, pruefungen,
    nutzung: {
      tage: tageN.length, erster: tageN[0] || null, serie, reihe, ansichten,
      sitzungen: summe('sitzungen'), aenderungen: summe('aenderungen'), aktiv_min: summe('aktiv_min'),
    },
  };
}
