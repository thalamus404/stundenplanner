// Die Planwahl: der Startbildschirm (Hello-Screen, V-0234). Reine Logik ohne DOM, getestet in
// tests/planwahl.test.mjs; app.js zeichnet nur.
//
// Silas, 05.10.2026: „Die Seite soll beginnen mit Hello-Screen und dort soll man 1. Uni wählen,
// 2. Studiengang, 3. Vertiefung, 4. Semester, für das geplant werden soll, 5. Studienprüfungsordnung.
// Unten soll eine dynamische Progress-Bar sein, die visuell zeigt, welche Entscheidung noch fehlt
// für eine eindeutige Zuordnung.“ Die Stufen und ihre Regeln stehen in index.json (`stufen`, `wahl`,
// docs/ARCHITEKTUR.md §5); dieser Code kennt keinen Studiengang, keine Hochschule und kein Semester.
// Er geht nur den Baum entlang:
//   ueberspringen  die einzige Option ist „keine“: die Stufe entfällt
//   automatisch    genau eine Option: sie gilt als gewählt und wird gezeigt
//   waehlen        sonst, und für Hochschule, Studiengang und Fachsemester immer, auch mit einer Option

// plan.id und datei sind Speicher- und Dateinamen (ARCHITEKTUR §3: nur a–z, 0–9, -, getrennt durch :).
const ID = /^[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)*$/;
const MAX_ID = 200;
export const gueltigeId = (id) => typeof id === 'string' && id.length <= MAX_ID && ID.test(id);

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * Der Baum aus index.json, geprüft und bereinigt. Ein Blatt zählt nur mit gültiger `plan.id` und
 * einer Datei, die `pfadOk` erlaubt (app.js: nur relative Pfade unter daten/). Optionen ohne Blatt
 * darunter fallen weg, Knoten ohne Optionen auch. Eine Regel, die nicht mehr passt (automatisch mit
 * zwei Optionen), wird `waehlen`: Lieber einmal mehr fragen, als still etwas festlegen.
 * Gibt null zurück, wenn kein Plan bleibt (oder der Index kein `wahl` hat, Schema 1).
 */
export function wahlBaum(index, pfadOk = () => true) {
  const knoten = (k, tiefe) => {
    if (!k || typeof k !== 'object' || tiefe > 12 || !Array.isArray(k.optionen)) return null;
    const optionen = [];
    for (const o of k.optionen) {
      if (!o || typeof o !== 'object') continue;
      const opt = { id: o.id == null ? null : text(o.id), label: text(o.label) || text(o.id) || 'ohne Namen', zusatz: text(o.zusatz) };
      if (o.semester != null) opt.semester = text(o.semester);
      if (o.fachsemester != null) opt.fachsemester = Number(o.fachsemester);
      // Die Farbe einer Hochschule (V-0243): nur #rrggbb, sonst keine. Sie landet im CSSOM, nie im HTML.
      if (typeof o.farbe === 'string' && /^#[0-9a-f]{6}$/i.test(o.farbe)) opt.farbe = o.farbe;
      if (o.plan) {
        const p = o.plan;
        if (!p || !gueltigeId(p.id) || typeof p.datei !== 'string' || !pfadOk(p.datei)) continue;
        opt.plan = { id: p.id, datei: p.datei, kombinationen: p.kombinationen && typeof p.kombinationen === 'object' ? p.kombinationen : null };
      } else {
        opt.weiter = knoten(o.weiter, tiefe + 1);
        if (!opt.weiter) continue;
      }
      optionen.push(opt);
    }
    if (!optionen.length) return null;
    let regel = ['ueberspringen', 'automatisch', 'waehlen'].includes(k.regel) ? k.regel : 'waehlen';
    if (regel !== 'waehlen' && optionen.length !== 1) regel = 'waehlen';
    return { stufe: text(k.stufe), regel, label: text(k.label), optionen };
  };
  return index && typeof index === 'object' ? knoten(index.wahl, 0) : null;
}

/** Die Stufen in ihrer Reihenfolge, aus index.json; fehlen sie, in der Reihenfolge des Baums. */
export function stufenVon(index, baum) {
  const aus = Array.isArray(index && index.stufen) ? index.stufen.filter((s) => s && s.id).map((s) => ({ id: text(s.id), label: text(s.label) || text(s.id) })) : [];
  const da = new Set(aus.map((s) => s.id));
  const geh = (k) => {
    if (!k) return;
    if (!da.has(k.stufe)) { da.add(k.stufe); aus.push({ id: k.stufe, label: k.label || k.stufe }); }
    for (const o of k.optionen) geh(o.weiter);
  };
  geh(baum);
  return aus;
}

/**
 * Alle Pläne des Baums, flach: je Blatt die Kennung, die Datei, `kombinationen`, der Pfad (Stufe →
 * Option) und, aus der Option des Fachsemesters, `semester` und `fachsemester`; `studiengang` ist die
 * Kennung der Option auf dieser Stufe. Damit lassen sich alte Teilen-Links und alte Speicherschlüssel
 * (<studiengang>:<semester>:fs<n>) einem Plan zuordnen.
 */
export function blaetter(baum) {
  const out = [];
  const geh = (k, pfad, optionen) => {
    if (!k) return;
    for (const o of k.optionen) {
      const p = { ...pfad, [k.stufe]: o.id };
      const os = { ...optionen, [k.stufe]: o };
      if (o.plan) {
        const fs = Object.values(os).find((x) => x.semester != null) || {};
        out.push({ ...o.plan, pfad: p, optionen: os, studiengang: p.studiengang ?? null, semester: fs.semester ?? null, fachsemester: fs.fachsemester ?? null });
      } else geh(o.weiter, p, os);
    }
  };
  geh(baum, {}, {});
  return out;
}

const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Alle Knoten unterhalb (ohne den Knoten selbst). */
function nachfahren(k) {
  const out = [];
  const geh = (x) => { for (const o of x.optionen) if (o.weiter) { out.push(o.weiter); geh(o.weiter); } };
  if (k) geh(k);
  return out;
}

/**
 * Wo die Wahl steht. `wahl` ist { <stufe>: <Kennung der Option> } (null ist eine Kennung: „Ohne
 * Vertiefung“). Ergebnis je Stufe in der Reihenfolge von `stufen`:
 *   art  'gewaehlt'     eine Option, die jemand gewählt hat
 *        'automatisch'  die einzige Option (regel automatisch), oder vorausgesagt: In jedem Zweig
 *                       darunter muss hier niemand wählen
 *        'entfaellt'    regel ueberspringen, oder vorausgesagt: In jedem Zweig entfällt sie
 *        'offen'        hier fehlt noch eine Entscheidung
 *   option, knoten (wo bekannt), label (die Bezeichnung am Knoten, etwa „Studienrichtung“), wert
 * `aktuell` ist die erste offene Stufe (dort fragt die Seite), `plan` das Blatt, wenn alles steht,
 * `offen` die Zahl der Stufen, an denen noch jemand entscheiden muss.
 * Die Voraussage ist, was die Leiste „dynamisch“ macht (Silas): Wer TU Berlin gewählt hat, sieht
 * sofort, dass die Vertiefung bei keinem Studiengang dort gefragt wird, wenn das so ist.
 */
export function wahlStand(baum, stufen, wahl = {}) {
  const bekannt = new Map();
  let k = baum, aktuell = null, aktKnoten = null, plan = null;
  while (k) {
    let opt = null, art = 'gewaehlt';
    if (k.regel === 'ueberspringen') { opt = k.optionen[0]; art = 'entfaellt'; }
    else if (k.regel === 'automatisch') { opt = k.optionen[0]; art = 'automatisch'; }
    else if (hat(wahl, k.stufe)) opt = k.optionen.find((o) => o.id === wahl[k.stufe]) || null;
    if (!opt) { aktuell = k.stufe; aktKnoten = k; break; }
    bekannt.set(k.stufe, { art, option: opt, knoten: k });
    if (opt.plan) { plan = opt.plan; break; }
    k = opt.weiter;
  }
  const rest = aktKnoten ? nachfahren(aktKnoten) : [];
  const schritte = stufen.map((s) => {
    const b = bekannt.get(s.id);
    if (b) return { id: s.id, label: b.knoten.label || s.label, art: b.art, option: b.option, knoten: b.knoten, wert: b.art === 'entfaellt' ? null : b.option.label };
    if (aktKnoten && s.id === aktuell) return { id: s.id, label: aktKnoten.label || s.label, art: 'offen', option: null, knoten: aktKnoten, wert: null };
    const da = rest.filter((x) => x.stufe === s.id);
    const labels = [...new Set(da.map((x) => x.label).filter(Boolean))];
    const label = labels.length === 1 ? labels[0] : s.label;
    if (!da.length || da.every((x) => x.regel === 'ueberspringen')) return { id: s.id, label, art: 'entfaellt', option: null, knoten: null, wert: null };
    if (da.every((x) => x.regel !== 'waehlen')) {
      const werte = [...new Set(da.filter((x) => x.regel === 'automatisch').map((x) => x.optionen[0].label))];
      return { id: s.id, label, art: 'automatisch', option: null, knoten: null, wert: werte.length === 1 ? werte[0] : null };
    }
    return { id: s.id, label, art: 'offen', option: null, knoten: null, wert: null };
  });
  return { schritte, aktuell, plan, offen: schritte.filter((x) => x.art === 'offen').length };
}

/** Eine Option wählen. Ändert sich die Wahl, fallen die Wahlen der späteren Stufen weg. */
export function waehleOption(stufen, wahl, stufe, id) {
  const neu = { ...wahl };
  const gleich = hat(wahl, stufe) && wahl[stufe] === id;
  neu[stufe] = id;
  if (!gleich) {
    const i = stufen.findIndex((s) => s.id === stufe);
    for (const s of stufen.slice(i + 1)) delete neu[s.id];
  }
  return neu;
}

/**
 * Welche Stufe die Seite nach einer Wahl zeigt: die nächste offene, sonst 'fertig' (die
 * Zusammenfassung; seit V-0251 öffnet app.js dann gleich den Plan). Eine automatische Stufe wird nicht eigens gezeigt,
 * sie steht in der Zusammenfassung und in der Leiste („nur eine gültige: …“).
 */
export const naechsteSicht = (stand) => stand.aktuell || (stand.plan ? 'fertig' : null);

/** Der Schritt zurück: die letzte Stufe vor `sicht`, an der jemand gewählt hat; sonst null. */
export function vorige(stand, sicht) {
  const i = sicht === 'fertig' ? stand.schritte.length : stand.schritte.findIndex((s) => s.id === sicht);
  for (let j = i - 1; j >= 0; j--) if (stand.schritte[j].art === 'gewaehlt') return stand.schritte[j].id;
  return null;
}

/** Die Wahl, die zu einem Plan führt (zum Wechseln aus dem Plan heraus, alles vorbelegt). */
export function wahlFuer(liste, planId) {
  const b = liste.find((x) => x.id === planId);
  return b ? { ...b.pfad } : {};
}

/**
 * Welcher Plan zu einem Teilen-Link gehört. Neu (V-0234) nennt der Link `plan` (die Kennung), alte
 * Links Studiengang, Semester und Fachsemester. Passt ein alter Link auf mehrere Pläne (Vertiefungen,
 * Ordnungen), ist er nicht eindeutig: null, dann fragt der Startbildschirm.
 */
export function planZumLink(liste, link) {
  if (!link) return null;
  if (link.plan) return liste.find((b) => b.id === link.plan) || null;
  const passt = liste.filter((b) => b.studiengang === link.studiengang && b.semester === link.semester && Number(b.fachsemester) === Number(link.fachsemester));
  return passt.length === 1 ? passt[0] : null;
}

/** Gruppen von Optionen mit gleichem Zusatz („WiSe 2026/27“): Nur wenn sich mindestens zwei einen teilen. */
export function gruppiert(optionen) {
  const n = new Map();
  for (const o of optionen) n.set(o.zusatz, (n.get(o.zusatz) || 0) + 1);
  if (optionen.length < 2 || !optionen.every((o) => o.zusatz) || ![...n.values()].some((x) => x > 1)) return null;
  const out = [];
  for (const o of optionen) {
    const g = out.find((x) => x.zusatz === o.zusatz);
    if (g) g.optionen.push(o); else out.push({ zusatz: o.zusatz, optionen: [o] });
  }
  return out;
}

/**
 * Was die Leiste über sich sagt. `zahl`: wie viele Entscheidungen bis zum Stundenplan fehlen (am
 * Rechner, wo unter jedem Balken die Stufe steht); `namen`: welche (am Handy stehen nur die Balken).
 */
export function leistenText(stand) {
  if (stand.plan) return { zahl: 'Alles gewählt. Dein Plan ist eindeutig.', namen: 'Alles gewählt. Dein Plan ist eindeutig.' };
  const n = stand.offen;
  const offen = stand.schritte.filter((x) => x.art === 'offen').map((x) => x.label);
  const liste = offen.length > 1 ? `${offen.slice(0, -1).join(', ')} und ${offen[offen.length - 1]}` : offen[0] || '';
  return { zahl: n === 1 ? 'Noch 1 Angabe bis zum Stundenplan' : `Noch ${n} Angaben bis zum Stundenplan`, namen: `Noch offen: ${liste}` };
}

// ── Ohne Lösung (V-0233 rechnet, die Seite sagt es; Silas, 05.10.2026) ──────────────────────────

/**
 * Was die Seite oben im Plan über `kombinationen` sagt, oder null. Nur `loesbar === false` ist eine
 * Aussage für die Seite: Mit den veröffentlichten Terminen gibt es keine Wahl ohne Überschneidung.
 * `sicher === false` heißt „vermutlich“, mit dem Verdacht. `loesbar` true oder null: nichts.
 */
export function ohneLoesung(k) {
  if (!k || k.loesbar !== false) return null;
  const sicher = k.sicher !== false;
  return {
    sicher,
    satz: sicher ? 'Mit den veröffentlichten Terminen gibt es keine Wahl ohne Überschneidung.'
      : 'Mit den veröffentlichten Terminen gibt es vermutlich keine Wahl ohne Überschneidung.',
    grund: text(k.grund),
    verdacht: (Array.isArray(k.verdacht) ? k.verdacht : []).map((v) => text(v && v.grund)).filter(Boolean),
    fehlen: (Array.isArray(k.fehlen) ? k.fehlen : []).map(text).filter(Boolean),
  };
}
