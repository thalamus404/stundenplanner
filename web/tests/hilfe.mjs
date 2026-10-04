// Gemeinsames der Tests: das Fixture frisch laden (bestand() verändert die Objekte) und ein
// Speicher, der mitschreibt, was geschrieben wurde — so lässt sich „Laden schreibt nichts“ prüfen.
import { readFileSync } from 'node:fs';

const PFAD = new URL('./fixtures/plan.json', import.meta.url);

export function plan() {
  return JSON.parse(readFileSync(PFAD, 'utf8'));
}

export class Speicher {
  constructor(anfang = {}) {
    this.daten = new Map(Object.entries(anfang));
    this.schreibvorgaenge = [];
  }
  getItem(k) { return this.daten.has(k) ? this.daten.get(k) : null; }
  setItem(k, v) { this.schreibvorgaenge.push(['set', k, v]); this.daten.set(k, String(v)); }
  removeItem(k) { this.schreibvorgaenge.push(['remove', k]); this.daten.delete(k); }
}

/** Wie localStorage in einem Fenster mit gesperrten Website-Daten: Jeder Zugriff wirft. */
export const gesperrt = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};
