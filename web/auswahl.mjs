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

export const PRAEFIX = 'stundenplanner:v1';
const FELDER = ['group', 'digest', 'name'];
const STUNDEN_BIS_VERALTET = 36;

/** Der Schlüssel eines Plans: stundenplanner:v1:<studiengang>:<semester>:fs<n>. */
export function speicherSchluessel(plan) {
  const sg = typeof plan.studiengang === 'object' && plan.studiengang ? plan.studiengang.id : plan.studiengang;
  return `${PRAEFIX}:${sg}:${plan.semester}:fs${plan.fachsemester}`;
}

/** Nur die erlaubten Felder, nur Zeichenketten. Alles andere (auch ein altes `at`) fällt weg. */
function bereinigt(roh) {
  const out = {};
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return out;
  for (const [cid, e] of Object.entries(roh)) {
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

export function loese(auswahl, componentId) {
  const out = { ...auswahl };
  delete out[componentId];
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
 * g.component.module ohne Suche geht. `farbe` ist der Index des Moduls (CSS-Klasse sp-c0 … sp-c4).
 */
export function bestand(plan) {
  const groups = [];
  const parts = [];
  plan.modules.forEach((m, i) => {
    m.components = Array.isArray(m.components) ? m.components : [];
    m.components.forEach((c) => {
      c.module = m;
      c.farbe = i % 5;
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
 * Wendet eine Auswahl auf den Bestand an: selected, changed, selection und missing, mit den
 * Regeln von load() im Vorbild.
 * - changed: gewählt, aber der Fingerabdruck der Auswahl ≠ dem der Gruppe
 * - missing: eine gespeicherte Gruppe, die es nicht mehr gibt (Bestandteil da, Gruppe weg) oder
 *   deren Bestandteil ganz fehlt. Sie bleibt mit ihrem gespeicherten Namen sichtbar, bis man sie löst.
 */
export function auswerten(plan, { groups, parts }, auswahl) {
  const missing = [];
  const ids = new Set();
  for (const c of parts) {
    ids.add(c.id);
    const e = auswahl[c.id];
    c.selection = e ? e.group : null;
    for (const g of c.groups) {
      g.selected = !!e && e.group === g.id;
      g.changed = g.selected && e.digest !== g.digest;
    }
    if (e && !c.groups.some((g) => g.selected)) {
      missing.push({ component_id: c.id, module_short: c.module.short, type: c.type, group_id: e.group, name: e.name });
    }
  }
  for (const [cid, e] of Object.entries(auswahl)) {
    if (!ids.has(cid)) missing.push({ component_id: cid, module_short: cid.split(':')[0], type: '', group_id: e.group, name: e.name });
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
// Form: #studiengang=wi-bsc&semester=wise-2026-27&fs=1&w=<component_id>~<group_id>&w=…
// `~` trennt, weil component_id selbst einen Doppelpunkt trägt (Modulnummer:LV-ID); getrennt wird
// am LETZTEN `~` (Gruppen-IDs aus MOSES sind Zahlen und tragen keins).

const MAX_PAARE = 200;
const MAX_LAENGE = 120;

// Von Hand statt URLSearchParams.toString(): Das kodiert `:` und `~` als %3A/%7E und macht den
// Link doppelt so lang und unlesbar. Im Fragment sind beide erlaubt (RFC 3986, pchar); gelesen
// wird mit URLSearchParams, das beide Formen versteht.
const kodiere = (s) => encodeURIComponent(String(s)).replace(/%3A/gi, ':');

export function teilenFragment(plan, auswahl) {
  const sg = typeof plan.studiengang === 'object' && plan.studiengang ? plan.studiengang.id : plan.studiengang;
  const teile = [`studiengang=${kodiere(sg)}`, `semester=${kodiere(plan.semester)}`, `fs=${kodiere(plan.fachsemester)}`];
  for (const cid of Object.keys(auswahl).sort()) teile.push(`w=${kodiere(cid)}~${kodiere(auswahl[cid].group)}`);
  return '#' + teile.join('&');
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
  const studiengang = p.get('studiengang');
  const semester = p.get('semester');
  const fs = Number(p.get('fs'));
  if (!studiengang || !semester || !Number.isInteger(fs) || fs < 1) return null;
  if (studiengang.length > MAX_LAENGE || semester.length > MAX_LAENGE) return null;
  const paare = {};
  for (const w of p.getAll('w').slice(0, MAX_PAARE)) {
    const i = w.lastIndexOf('~');
    if (i <= 0 || i === w.length - 1 || w.length > MAX_LAENGE) continue;
    paare[w.slice(0, i)] = w.slice(i + 1);
  }
  return { studiengang, semester, fachsemester: fs, paare };
}

/** Passt ein gelesener Link zu diesem Plan (Eintrag aus index.json oder Plandatei)? */
export function passtZuPlan(link, plan) {
  const sg = typeof plan.studiengang === 'object' && plan.studiengang ? plan.studiengang.id : plan.studiengang;
  return !!link && link.studiengang === sg && link.semester === plan.semester && link.fachsemester === Number(plan.fachsemester);
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
