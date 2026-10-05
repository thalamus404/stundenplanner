// Wahlpflicht auf der Seite (V-0227, Demo-Strang „höhere Fachsemester“). Reine Logik ohne DOM,
// getestet in tests/wahl.test.mjs; app.js zeichnet nur.
//
// Das Lesemodell nennt je Plan unter `wahlpflicht[]` die Bereiche (aus der MTS-Modulliste) und ihr
// `angebot`: die Module mit Terminen im Semester, je Modul eine eigene Datei
// (`daten/module/<semester>/<nummer>.json`). Geladen wird eine Datei erst, wenn jemand das Modul
// wählt; sonst wöge der Plan des 5. Fachsemesters viele Megabyte.
//
// Welche Wahlpflichtmodule „aktiv“ sind, wird NICHT eigens gespeichert. Aktiv ist ein Modul, wenn
// die Auswahl eine Gruppe darin hat (die Kennung eines Bestandteils beginnt mit der Modulnummer:
// `<nummer>:<lvvid>`), oder wenn man es in dieser Sitzung dazugenommen hat. So bleibt der Speicher
// derselbe eine Schlüssel je Plan (docs/ARCHITEKTUR.md §6), und ein Teilen-Link bringt die
// Wahlpflichtmodule seiner Gruppen von selbst mit.

/** Die Modulnummer einer Bestandteil-Kennung `<nummer>:<lvvid>`. */
export const modulVon = (componentId) => String(componentId).split(':')[0];

/** Alle Kandidaten eines Plans: Nummer → { eintrag aus `angebot`, bereiche: [id, …] }. */
export function angebot(plan) {
  const out = new Map();
  for (const wp of (plan && plan.wahlpflicht) || []) {
    for (const e of wp.angebot || []) {
      const x = out.get(e.number) || { eintrag: e, bereiche: [] };
      x.bereiche.push(wp.id);
      out.set(e.number, x);
    }
  }
  return out;
}

/** Welche Kandidaten aktiv sind: aus der Auswahl (Kennungen der Bestandteile) und `extra`. */
export function aktiv(plan, kennungen = [], extra = []) {
  const alle = angebot(plan);
  const pflicht = new Set(((plan && plan.modules) || []).map((m) => m.number));
  const out = new Set();
  for (const n of [...[...kennungen].map(modulVon), ...extra]) {
    if (alle.has(n) && !pflicht.has(n)) out.add(n);
  }
  return out;
}

/** Die Dateien, die für `nummern` noch fehlen (nur relative Pfade unter daten/, wie der Index). */
export function fehlendeDateien(plan, nummern, geladen) {
  const alle = angebot(plan);
  return [...nummern].filter((n) => alle.has(n) && !geladen.has(n)).map((n) => ({ nummer: n, datei: alle.get(n).eintrag.datei }));
}

/**
 * Der Plan, wie die Seite ihn zeichnet: die Pflichtmodule, dahinter die aktiven Wahlpflichtmodule,
 * deren Datei geladen ist, in der Reihenfolge des Angebots. Jedes trägt `wahl` (Kurzname der
 * Bereiche), damit die Seite es kennzeichnen kann. Der volle Plan bleibt unverändert.
 */
export function sicht(vollplan, geladen, aktive) {
  const pflicht = Array.isArray(vollplan.modules) ? vollplan.modules : [];
  if (!vollplan.wahlpflicht || !aktive.size) return { ...vollplan, modules: pflicht };
  const namen = new Map((vollplan.wahlpflicht || []).map((wp) => [wp.id, wp.kurz || wp.name || wp.id]));
  const dazu = [];
  for (const [n, x] of angebot(vollplan)) {
    if (!aktive.has(n) || !geladen.has(n)) continue;
    dazu.push({ ...geladen.get(n), short: x.eintrag.short || geladen.get(n).short, wahl: x.bereiche.map((b) => namen.get(b)) });
  }
  return { ...vollplan, modules: [...pflicht, ...dazu] };
}

/** LP der aktiven Module eines Bereichs, gegen seine Grenzen aus der Modulliste. */
export function lpStand(wp, aktive) {
  const lp = (wp.angebot || []).filter((e) => aktive.has(e.number)).reduce((s, e) => s + (Number(e.lp) || 0), 0);
  const min = wp.lp_min ?? null, max = wp.lp_max ?? null;
  return { lp, min, max, ueber: max !== null && lp > max };
}

/** Das Angebot eines Bereichs zum Anzeigen: aktive zuerst, dann nach Unterbereich und Titel. */
export function sortiert(wp, aktive) {
  return [...(wp.angebot || [])].sort((a, b) =>
    (aktive.has(b.number) - aktive.has(a.number))
    || String(a.unterbereich || '').localeCompare(String(b.unterbereich || ''), 'de')
    || String(a.title).localeCompare(String(b.title), 'de'));
}

const TAG = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
/** „Mo, Mi · 3 Gruppen“ — was man vor dem Laden über die Lage eines Moduls weiß. */
export function lageText(e) {
  const tage = (e.tage || []).map((d) => TAG[d]).filter(Boolean).join(', ');
  return `${tage || 'ohne Wochentag'} · ${e.groups} ${e.groups === 1 ? 'Gruppe' : 'Gruppen'}`;
}
