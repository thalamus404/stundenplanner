// Der Wochenbaukasten ohne DOM: Konflikte, Ansichtsfilter, Wochen, A/B und welche Termine eine
// Karte zeigt. Herkunft: app/static/stundenplan.js (overlap, conflictPairs, renderGrid, card) und
// conflicts() in app/stundenplan.py des Study OS.
//
// Konflikte zählen gegen ALLE Einzeltermine des Semesters, nicht gegen ein Wochenraster: Zwei
// Gruppen am selben Wochentag zur selben Zeit stören sich nicht, wenn sie nie am selben Datum
// liegen (A/B-Woche, Blockkurs). Die Termine sind lokale Zeiten ohne Zone ("2026-10-13T10:00:00"),
// gleich lang formatiert — deshalb vergleicht der Text richtig, auch über Nacht und Jahreswechsel.
// Direkt anschließend (12:00 Ende, 12:00 Beginn) ist kein Konflikt: Die Grenzen sind offen.

import { plusTage } from './text.mjs';

const WOCHE_MS = 7 * 24 * 3600 * 1000;

const schneiden = (x, y) => x.start < y.end && y.start < x.end;

/** Überschneiden sich zwei Gruppen an irgendeinem Termin? (Dieselbe Gruppe nie mit sich selbst.) */
export function overlap(a, b) {
  return a.key !== b.key && a.bookings.some((x) => b.bookings.some((y) => schneiden(x, y)));
}

/** Alle Paare der Auswahl, die sich überschneiden, mit den gemeinsamen Tagen (sortiert). */
export function conflictPairs(selected) {
  const out = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i], b = selected[j];
      const dates = new Set();
      for (const x of a.bookings) for (const y of b.bookings) {
        if (schneiden(x, y)) dates.add((x.start > y.start ? x.start : y.start).slice(0, 10));
      }
      if (dates.size) out.push({ a, b, dates: [...dates].sort() });
    }
  }
  return out;
}

/** Würde diese Gruppe mit einer gewählten Gruppe eines ANDEREN Bestandteils kollidieren? */
export function kollidiert(g, selected) {
  return selected.some((x) => x.component_id !== g.component_id && overlap(g, x));
}

/**
 * Die Kandidaten der Ansicht (renderGrid im Vorbild):
 * - view 'all' alle, 'open' nur Bestandteile ohne Auswahl, 'selected' nur gewählte Gruppen
 * - filter: Modulnummer; activePart: ein Bestandteil (Klick auf ihn oben in der Modulkarte)
 */
export function kandidaten(groups, { view = 'all', filter = '', activePart = '' } = {}) {
  return groups.filter((g) =>
    (!filter || g.component.module.number === filter) &&
    (!activePart || g.component_id === activePart) &&
    (view !== 'selected' || g.selected) &&
    (view !== 'open' || !g.component.selection));
}

/** Die Montage aller Wochen von der ersten bis zur letzten Buchung — für „Woche ab …“. */
export function wochen(groups) {
  const tage = groups.flatMap((g) => g.bookings.map((b) => b.start.slice(0, 10))).sort();
  if (!tage.length) return [];
  const erster = new Date(tage[0] + 'T12:00:00Z');
  let montag = plusTage(tage[0], -((erster.getUTCDay() + 6) % 7));
  const out = [];
  while (montag <= tage[tage.length - 1]) {
    out.push(montag);
    montag = plusTage(montag, 7);
  }
  return out;
}

/** 'skeleton' → null, sonst die Woche ab diesem Montag (Montag bis Sonntag). */
export function wocheAus(period) {
  return !period || period === 'skeleton' ? null : { start: period, end: plusTage(period, 6) };
}

/**
 * A (0) oder B (1): echte Kalenderwochen ab dem Anker, wie ((d - anchor).days // 7) % 2 in
 * slots() des Vorbilds. Das JS des Vorbilds rechnete Math.floor(…) % 2 und bekam vor dem Anker
 * (Einführungswoche) -1 — solche Termine fielen aus der A/B-Liste. Hier wie in Python: 0 oder 1.
 */
export function paritaet(datum, anchor) {
  const n = Math.floor((Date.parse(datum) - Date.parse(anchor)) / WOCHE_MS);
  return ((n % 2) + 2) % 2;
}

/** Die Einträge eines Paneels: je Gruppe und Slot einer, gefiltert nach Woche und A/B. */
export function ereignisse(candidates, week, parity) {
  const out = [];
  for (const g of candidates) for (const s of g.slots) {
    if (week && !s.dates.some((d) => d >= week.start && d <= week.end)) continue;
    if (parity !== null && !(s.parity || []).includes(parity)) continue;
    out.push({ g, s });
  }
  return out;
}

/** Die genauen Termine einer Karte: aus dem Slot, eingeschränkt auf Woche bzw. A/B. */
export function termineDerKarte(g, s, week, parity, anchor) {
  let list = s.occurrences || g.bookings
    .filter((b) => s.dates.includes(b.start.slice(0, 10)) && b.start.slice(11, 16) === s.start)
    .map((b) => ({ ...b, date: b.start.slice(0, 10), start: b.start.slice(11, 16), end: b.end.slice(11, 16) }));
  if (week) list = list.filter((b) => b.date >= week.start && b.date <= week.end);
  if (parity !== null) list = list.filter((b) => paritaet(b.date, anchor) === parity);
  return list;
}

/** Reihenfolge in einer Zelle: Gewähltes zuerst, dann nach Modul. */
export function zellenOrdnung(a, b) {
  return Number(b.g.selected) - Number(a.g.selected) || String(a.g.module_short).localeCompare(String(b.g.module_short));
}

/** Bestandteile, für die (noch) Termine fehlen: ohne Gruppe oder mit einer Gruppe ohne Buchung. */
export function ohneTermine(parts) {
  return parts.filter((c) => !c.groups.length || c.groups.some((g) => !g.bookings.length));
}

/** Gibt es irgendwo einen erkannten 14-Tage-Rhythmus? (has_fortnightly, falls es fehlt.) */
export function hatAB(plan, groups) {
  if (typeof plan.has_fortnightly === 'boolean') return plan.has_fortnightly;
  return groups.some((g) => g.slots.some((s) => s.fortnightly));
}
