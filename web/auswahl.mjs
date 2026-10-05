// Die Auswahl — nur im Browser (docs/ARCHITEKTUR.md §6). Reine Logik ohne DOM, damit node --test
// sie prüfen kann; app.js reicht den Speicher (localStorage oder nichts) hinein.
//
// Herkunft: Im Study OS lag die Auswahl in einer Datenbank, und load()/save() in
// app/stundenplan.py rechneten selected, changed und missing auf dem Server. Hier gibt es keinen
// Server: Dieselben Regeln laufen im Browser gegen die gespeicherte Auswahl.
//
// Regeln für den Speicher (Silas' Hosting-Recherche, DSK-Orientierungshilfe zu Web Storage —
// damit es ohne Einwilligungsbanner zulässig bleibt):
//   1. Geschrieben wird erst, wenn jemand aktiv eine Gruppe wählt. Laden allein schreibt nichts.
//   2. Gespeichert wird je Bestandteil nur, was die Funktion braucht: group, digest, name.
//      Kein Zeitstempel, keine Kennung, nichts Identifizierendes.
//   3. „Auswahl zurücksetzen“ löscht den Schlüssel.
// Wer hier ein Feld hinzufügt, prüft es gegen diese drei Sätze; die Tests halten sie fest.

import { gueltigeId } from './planwahl.mjs';

export const PRAEFIX = 'stundenplanner:v1';
const STUNDEN_BIS_VERALTET = 36;

const sgId = (plan) => (typeof plan.studiengang === 'object' && plan.studiengang ? plan.studiengang.id : plan.studiengang);

/**
 * Der Schlüssel eines Plans: stundenplanner:v1:<plan.id> (V-0234). Bis dahin hieß er
 * <studiengang>:<semester>:fs<n>, und Pläne mit Vertiefung oder anderer Ordnung im selben Fachsemester
 * teilten sich einen Schlüssel (Hinweis von flugplan, V-0233). Ohne `id` (erstes Katalogformat) bleibt
 * es der alte, der dann mit plan.id übereinstimmt.
 */
export function speicherSchluessel(plan) {
  return gueltigeId(plan.id) ? `${PRAEFIX}:${plan.id}` : alterSchluessel(plan);
}

/** Der Schlüssel, unter dem die Seite bis V-0234 die Auswahl ablegte. */
export function alterSchluessel(plan) {
  return `${PRAEFIX}:${sgId(plan)}:${plan.semester}:fs${plan.fachsemester}`;
}

/** Nur die erlaubten Felder, nur Zeichenketten. Alles andere (auch ein altes `at`) fällt weg.
 *  `group: null` stammt aus V-0225 (abgewählte einzige Gruppe); seit V-0237 heißt es dasselbe wie kein Eintrag. */
function bereinigt(roh) {
  const out = {};
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return out;
  for (const [cid, e] of Object.entries(roh)) {
    if (e && e.group === null) { out[cid] = { group: null, digest: '', name: '' }; continue; }
    if (!e || typeof e !== 'object' || typeof e.group !== 'string' || !e.group) continue;
    out[cid] = { group: e.group, digest: typeof e.digest === 'string' ? e.digest : '', name: typeof e.name === 'string' ? e.name : '' };
  }
  return out;
}

/**
 * Liest die Auswahl. Ohne Speicher (privates Fenster, gesperrt) oder bei kaputtem Inhalt: leer.
 * Liest nur — schreibt nie (Regel 1), auch nicht, um Kaputtes aufzuräumen.
 */
export function ladeAuswahl(speicher, schluessel) {
  if (!speicher) return {};
  try {
    const roh = speicher.getItem(schluessel);
    return roh ? bereinigt(JSON.parse(roh)) : {};
  } catch {
    return {};
  }
}

/**
 * Schreibt die Auswahl; nur nach einer Handlung des Nutzers aufrufen (Regel 1). Eine leere Auswahl
 * entfernt den Schlüssel, statt `{}` liegen zu lassen: Was nicht gebraucht wird, liegt nicht da.
 * Gibt zurück, ob es gespeichert ist (false: kein Speicher, voll oder gesperrt).
 */
export function speichereAuswahl(speicher, schluessel, auswahl) {
  if (!speicher) return false;
  const sauber = bereinigt(auswahl);
  try {
    if (Object.keys(sauber).length) speicher.setItem(schluessel, JSON.stringify(sauber));
    else speicher.removeItem(schluessel);
    return true;
  } catch {
    return false;
  }
}

/**
 * Die Auswahl eines Plans, auch wenn sie noch unter dem alten Schlüssel liegt (V-0234): Echte Nutzer
 * haben ihre Auswahl für WI 1. FS dort. Der alte Schlüssel gilt nur, wenn unter dem neuen nichts liegt
 * und `eindeutig` ist (genau ein Plan hat diesen alten Schlüssel); sonst könnte die Auswahl eines
 * anderen Plans übernommen werden. Liest nur (Regel 1): Umgezogen wird beim ersten aktiven Speichern
 * (speichereAuswahl mit `alt`), und erst dann verschwindet der alte Schlüssel.
 * Gibt { auswahl, alt } zurück; `alt` ist der Schlüssel, aus dem gelesen wurde, sonst null.
 */
export function ladeAuswahlFuer(speicher, plan, eindeutig = true) {
  const neu = speicherSchluessel(plan);
  const auswahl = ladeAuswahl(speicher, neu);
  const alt = alterSchluessel(plan);
  if (Object.keys(auswahl).length || !eindeutig || alt === neu) return { auswahl, alt: null };
  const vorher = ladeAuswahl(speicher, alt);
  return Object.keys(vorher).length ? { auswahl: vorher, alt } : { auswahl, alt: null };
}

/** Speichert unter dem neuen Schlüssel und entfernt dann den alten, aus dem gelesen wurde (einmalig). */
export function speichereUndZiehUm(speicher, schluessel, alt, auswahl) {
  const ok = speichereAuswahl(speicher, schluessel, auswahl);
  if (ok && alt && alt !== schluessel) loescheAuswahl(speicher, alt);
  return ok;
}

// ── Die Planwahl (V-0234) ──────────────────────────────────────────────────────────────────────
// Welcher Plan zuletzt aktiv gewählt wurde: ein Schlüssel, eine Kennung. Geschrieben nur, wenn
// jemand im Startbildschirm „Stundenplan öffnen“ drückt (wie die Auswahl, Regel 1: Laden schreibt
// nichts, auch kein geöffneter Teilen-Link). Kein Zeitstempel, nur die Kennung des Plans.
export const PLAN_SCHLUESSEL = `${PRAEFIX}:plan`;

export function ladePlanwahl(speicher) {
  if (!speicher) return null;
  try {
    const v = speicher.getItem(PLAN_SCHLUESSEL);
    return gueltigeId(v) ? v : null;
  } catch {
    return null;
  }
}

export function speicherePlanwahl(speicher, id) {
  if (!speicher || !gueltigeId(id)) return false;
  try {
    speicher.setItem(PLAN_SCHLUESSEL, id);
    return true;
  } catch {
    return false;
  }
}

/** „Auswahl zurücksetzen“ (Regel 3). */
export function loescheAuswahl(speicher, schluessel) {
  if (!speicher) return false;
  try {
    speicher.removeItem(schluessel);
    return true;
  } catch {
    return false;
  }
}

/** Eine Gruppe je Bestandteil: Eine neue Wahl ersetzt die alte. */
export function waehle(auswahl, componentId, gruppe) {
  return { ...auswahl, [componentId]: { group: gruppe.id, digest: gruppe.digest || '', name: gruppe.name || '' } };
}

/** Lösen: Der Eintrag fällt weg. Hat das Format nur eine Gruppe, ist sie danach wieder ein Vorschlag
 *  (V-0237); bis dahin wurde die Abwahl als `group: null` gespeichert, weil sie sonst automatisch
 *  wieder eingeplant war. */
export function loese(auswahl, componentId) {
  const out = { ...auswahl };
  delete out[componentId];
  return out;
}

/** Der Fortschritt: Es zählen nur Formate mit Terminen in diesem Semester. Eines ohne Gruppe blieb
 *  sonst immer „offen“, und „alle eingeplant“ kam nie (querwind, Punkt db561642). */
export function fortschritt(parts) {
  const mit = parts.filter((c) => c.gruppen !== 'keine' && c.groups.some((g) => (g.slots || []).length));
  return { n: mit.length, k: mit.filter((c) => c.groups.some((g) => g.selected)).length };
}

/** Die einzige Gruppe mit Terminen eines Formats, sonst null: ein Vorschlag (V-0237). Ein offenes
 *  Angebot (`gruppen: keine`, V-0233) ist keine Wahl und wird auch mit einer Gruppe nicht vorgeschlagen. */
export function einzige(c) {
  if (c.gruppen === 'keine') return null;
  const mit = (c.groups || []).filter((g) => (g.slots || []).length);
  return mit.length === 1 ? mit[0] : null;
}

/** Die wirksame Auswahl, im Speicherformat: für den Export. Nur Eingeplantes; Vorschläge zählen
 *  erst nach „Einplanen“ (Silas, 05.10.2026, V-0237). Bei `gruppen: alle` gelten mehrere Gruppen
 *  eines Bestandteils: `group` ist dann eine Liste. */
export function wirksameAuswahl(selected) {
  const out = {};
  for (const g of selected) {
    const e = out[g.component_id];
    if (!e) out[g.component_id] = { group: g.id, digest: g.digest || '', name: g.name || '' };
    else e.group = [].concat(e.group, g.id);
  }
  return out;
}

/** „Änderung geprüft“: übernimmt den neuen Fingerabdruck (und den aktuellen Namen). */
export function bestaetige(auswahl, componentId, gruppe) {
  if (!auswahl[componentId] || auswahl[componentId].group !== gruppe.id) return auswahl;
  return waehle(auswahl, componentId, gruppe);
}

/**
 * Hängt jedem Bestandteil und jeder Gruppe an, was die Seite zum Zeichnen braucht (wie flatten()
 * im Vorbild), und gibt die flachen Listen zurück. Verändert die Objekte des Plans, damit
 * g.component.module ohne Suche geht. `farbe` ist die Stelle des Moduls im Plan, reihum über die acht
 * Modulfarben (Index 0 … 7 für die CSS-Klassen m1 … m8, docs/DESIGN.md §5.3): das neunte Modul hat wieder die erste.
 */
export function bestand(plan) {
  const groups = [];
  const parts = [];
  plan.modules.forEach((m, i) => {
    m.components = Array.isArray(m.components) ? m.components : [];
    m.components.forEach((c) => {
      c.module = m;
      c.farbe = i % 8;
      c.groups = Array.isArray(c.groups) ? c.groups : [];
      parts.push(c);
      c.groups.forEach((g) => {
        g.component = c;
        g.farbe = c.farbe;
        g.key = g.key || c.id + ':' + g.id;
        g.module_short = m.short;
        g.component_id = c.id;
        g.type = c.type;
        g.bookings = Array.isArray(g.bookings) ? g.bookings : [];
        g.slots = Array.isArray(g.slots) ? g.slots : [];
        groups.push(g);
      });
    });
  });
  return { groups, parts };
}

/**
 * Wendet eine Auswahl auf den Bestand an: selected, changed, selection, vorschlag und missing, mit
 * den Regeln von load() im Vorbild. Berechnet, nie gespeichert: Laden schreibt nichts.
 * - selected: eingeplant, also ausdrücklich gewählt. Nur das zählt im Fortschritt, in den
 *   Überschneidungen und im Export.
 * - vorschlag (Silas, 05.10.2026, V-0237; ersetzt „automatisch eingeplant“ aus V-0225): Ein Format
 *   mit genau einer Gruppe ohne Eintrag schlägt sie vor; bei `gruppen: alle` alle Gruppen mit
 *   Terminen. Gestrichelt, nicht eingeplant, bis jemand „Einplanen“ drückt.
 * - changed: gewählt, aber der Fingerabdruck der Auswahl ≠ dem der Gruppe
 * - missing: eine gespeicherte Gruppe, die es nicht mehr gibt (Bestandteil da, Gruppe weg) oder
 *   deren Bestandteil ganz fehlt. Sie bleibt mit ihrem gespeicherten Namen sichtbar, bis man sie löst.
 */
export function auswerten(plan, { groups, parts }, auswahl) {
  const missing = [];
  const ids = new Set();
  for (const c of parts) {
    ids.add(c.id);
    // `group: null` (V-0225, abgewählte einzige Gruppe) gilt wie kein Eintrag: wieder ein Vorschlag.
    const e = auswahl[c.id] && auswahl[c.id].group !== null ? auswahl[c.id] : null;
    const mit = c.groups.filter((g) => g.slots.length);
    // `gruppen: alle` (V-0233): Die Gruppen sind Teile, man besucht alle. Eingeplant wird das Format
    // als Ganzes: Steht irgendeine seiner Gruppen in der Auswahl, gelten alle.
    if (c.gruppen === 'alle') {
      c.selection = e && mit.length ? mit[0].id : null;
      for (const g of c.groups) {
        g.selected = !!e && mit.includes(g);
        g.vorschlag = !e && mit.includes(g);
        g.changed = false;
      }
      continue;
    }
    const vor = e ? null : einzige(c);
    c.selection = e ? e.group : null;
    for (const g of c.groups) {
      g.selected = !!e && e.group === g.id;
      g.vorschlag = g === vor;
      g.changed = g.selected && e.digest !== g.digest;
    }
    if (e && !c.groups.some((g) => g.selected)) {
      missing.push({ component_id: c.id, module_short: c.module.short, type: c.type, group_id: e.group, name: e.name });
    }
  }
  for (const [cid, e] of Object.entries(auswahl)) {
    if (!ids.has(cid) && e.group !== null) missing.push({ component_id: cid, module_short: cid.split(':')[0], type: '', group_id: e.group, name: e.name });
  }
  return { selected: groups.filter((g) => g.selected), missing };
}

/** Älter als 36 Stunden oder nie erfolgreich (wie `stale` im Vorbild). */
export function veraltet(successAt, jetzt = Date.now()) {
  if (!successAt) return true;
  const t = Date.parse(successAt);
  return Number.isNaN(t) || jetzt - t > STUNDEN_BIS_VERALTET * 3600 * 1000;
}

// ── Teilen-Link ────────────────────────────────────────────────────────────────────────────────
// Die Auswahl steht im FRAGMENT der Adresse (hinter #), nicht in der Abfrage (hinter ?): Das
// Fragment schickt der Browser nie an den Server. Wer einen Link öffnet, verrät die Auswahl darin
// also auch nicht dem Hoster (ARCHITEKTUR §6, SCOPE §5 „keine persönlichen Daten auf einem Server“).
// Form: #plan=<plan.id>&w=<component_id>~<group_id>&w=… (seit V-0234); alte Links
// #studiengang=wi-bsc&semester=wise-2026-27&fs=1&w=… gelten weiter, wenn sie eindeutig sind.
// `~` trennt, weil component_id selbst einen Doppelpunkt trägt (Modulnummer:LV-ID); getrennt wird
// am LETZTEN `~` (Gruppen-IDs aus MOSES sind Zahlen und tragen keins).

const MAX_PAARE = 200;
const MAX_LAENGE = 120;

// Von Hand statt URLSearchParams.toString(): Das kodiert `:` und `~` als %3A/%7E und macht den
// Link doppelt so lang und unlesbar. Im Fragment sind beide erlaubt (RFC 3986, pchar); gelesen
// wird mit URLSearchParams, das beide Formen versteht.
const kodiere = (s) => encodeURIComponent(String(s)).replace(/%3A/gi, ':');

export function teilenFragment(plan, auswahl) {
  // Seit V-0234 nennt der Link den Plan mit seiner Kennung: Studiengang, Semester und Fachsemester
  // allein sind nicht eindeutig, wenn es Vertiefungen oder mehrere Ordnungen gibt.
  const teile = gueltigeId(plan.id) ? [`plan=${kodiere(plan.id)}`]
    : [`studiengang=${kodiere(sgId(plan))}`, `semester=${kodiere(plan.semester)}`, `fs=${kodiere(plan.fachsemester)}`];
  for (const cid of Object.keys(auswahl).sort()) teile.push(`w=${kodiere(cid)}~${kodiere(auswahl[cid].group)}`);
  return '#' + teile.join('&');
}

/**
 * Was „Teilen“ tut. Der Knopf ist nie stumm gesperrt: Im ersten Live-Test tippte Silas am Handy auf
 * den grauen Knopf, bevor er etwas gewählt hatte, und es geschah nichts (der Grund stand nur im
 * Tooltip, den es auf Touch nicht gibt; V-0224). Jetzt sagt ein Tipp, was fehlt.
 * - 'vorschau': ein geteilter Plan wird gerade angesehen, erst übernehmen oder verwerfen
 * - 'leer': noch keine Gruppe gewählt
 * - 'system': das Teilen-Menü des Systems (grober Zeiger und navigator.share vorhanden)
 * - 'kopieren': den Link in die Zwischenablage, ohne sie eine Karte zum Kopieren von Hand
 */
export function teilenWeg({ anzahl = 0, vorschau = false, share = false, grob = false } = {}) {
  if (vorschau) return 'vorschau';
  if (!anzahl) return 'leer';
  return share && grob ? 'system' : 'kopieren';
}

/** Liest ein Fragment; null, wenn es kein Teilen-Link ist. Kaputte Paare fallen still weg. */
export function teilenLesen(fragment) {
  const roh = String(fragment || '').replace(/^#/, '');
  if (!roh) return null;
  let p;
  try {
    p = new URLSearchParams(roh);
  } catch {
    return null;
  }
  const plan = p.get('plan');
  const studiengang = p.get('studiengang');
  const semester = p.get('semester');
  const fs = Number(p.get('fs'));
  if (plan !== null) {
    if (!gueltigeId(plan)) return null;
  } else if (!studiengang || !semester || !Number.isInteger(fs) || fs < 1 || studiengang.length > MAX_LAENGE || semester.length > MAX_LAENGE) {
    return null;
  }
  const paare = {};
  for (const w of p.getAll('w').slice(0, MAX_PAARE)) {
    const i = w.lastIndexOf('~');
    if (i <= 0 || i === w.length - 1 || w.length > MAX_LAENGE) continue;
    paare[w.slice(0, i)] = w.slice(i + 1);
  }
  if (plan !== null) return { plan, studiengang: null, semester: null, fachsemester: null, paare };
  return { plan: null, studiengang, semester, fachsemester: fs, paare };
}

/** Passt ein gelesener Link zu diesem Plan (Blatt aus index.json oder Plandatei)? Ein neuer Link
 *  über die Kennung, ein alter über Studiengang, Semester und Fachsemester. */
export function passtZuPlan(link, plan) {
  if (!link || !plan) return false;
  if (link.plan) return link.plan === plan.id;
  return link.studiengang === sgId(plan) && link.semester === plan.semester && link.fachsemester === Number(plan.fachsemester);
}

/**
 * Macht aus den Paaren des Links eine Auswahl gegen den aktuellen Bestand: Fingerabdruck und Name
 * kommen aus dem Plan, nicht aus dem Link (der trägt sie nicht). Paare ohne passende Gruppe
 * landen in `unbekannt`, damit die Seite sie nennen kann, statt sie zu verschlucken.
 */
export function geteilteAuswahl({ parts }, paare) {
  let auswahl = {};
  const unbekannt = [];
  for (const [cid, gid] of Object.entries(paare)) {
    const c = parts.find((x) => x.id === cid);
    const g = c && c.groups.find((x) => x.id === gid);
    if (g) auswahl = waehle(auswahl, cid, g);
    else unbekannt.push({ component_id: cid, group_id: gid });
  }
  return { auswahl, unbekannt };
}

/** Vergleich zweier Auswahlen je Bestandteil: zum Vergleichen mit anderen (SCOPE §3, 6). */
export function vergleiche(eigene, andere) {
  let gleich = 0, anders = 0, nurEigene = 0, nurAndere = 0;
  for (const cid of new Set([...Object.keys(eigene), ...Object.keys(andere)])) {
    const a = eigene[cid], b = andere[cid];
    if (a && b) a.group === b.group ? gleich++ : anders++;
    else if (a) nurEigene++;
    else nurAndere++;
  }
  return { gleich, anders, nurEigene, nurAndere };
}

/** Gleich im Sinn der Gruppen (Fingerabdruck und Name zählen nicht). */
export function gleicheAuswahl(a, b) {
  const v = vergleiche(a, b);
  return v.anders === 0 && v.nurEigene === 0 && v.nurAndere === 0;
}
