// Das Raster ohne DOM: Zeitachse, Spuren paralleler Gruppen, was sichtbar ist, Beschriftung.
// Neu mit dem One-Pager (docs/DESIGN.md §3.2, §4.1; V-0220). Das Vorbild hatte eine Tabelle mit
// Zeilen je Beginnzeit und versteckte Gruppen hinter „+ N weitere“; hier bekommt jede Gruppe eine
// Kachel auf einer echten Zeitachse, und parallele Gruppen liegen in Spuren nebeneinander.

/** "15:30" → 930, "24:00" → 1440 (slots() teilt Nachttermine an Mitternacht). */
export function minuten(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Die Zeitachse in vollen Stunden, aus ALLEN Gruppen des Plans, nicht nur den sichtbaren: So
 * springt das Raster nicht, wenn man Ansicht, Filter oder Woche wechselt.
 */
export function achse(groups) {
  let von = Infinity, bis = -Infinity;
  for (const g of groups) for (const s of g.slots) {
    von = Math.min(von, minuten(s.start));
    bis = Math.max(bis, minuten(s.end));
  }
  if (von === Infinity) return { von: 8, bis: 18 };
  const v = Math.floor(von / 60);
  return { von: v, bis: Math.max(v + 1, Math.ceil(bis / 60)) };
}

/** Wie viele Tagesspalten: Mo–Fr immer, Sa/So nur, wenn dort Daten liegen. */
export function tagesZahl(groups) {
  let max = 4;
  for (const g of groups) for (const s of g.slots) max = Math.max(max, s.day);
  return max + 1;
}

// Gruppennamen mit Zahlen als Zahlen ("Termingruppe 9" vor "Termingruppe 10"), ohne Intl: Schon das
// Anlegen eines Intl.Collator kostete auf gedrosselter CPU 57 ms im längsten Block beim Laden
// (TBT, DESIGN §6; gemessen V-0220), und localeCompare mit Optionen legt ihn bei jedem Aufruf neu an.
function NAMEN(a, b) {
  const x = a.match(/\d+|\D+/g) || [], y = b.match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    return /^\d/.test(x[i]) && /^\d/.test(y[i]) ? x[i] - y[i] : x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}

/** Reihenfolge der Spuren: gewählte zuerst, dann Beginn, Modul, Gruppenname (Zahlen als Zahlen). */
export function ordnung(a, b) {
  return (b.gewaehlt - a.gewaehlt) || (a.start - b.start) || (a.modul - b.modul) || NAMEN(String(a.name), String(b.name));
}

const schneiden = (a, b) => a.start < b.end && b.start < a.end;

/**
 * Spuren eines Tages. Jeder Eintrag ({start, end} in Minuten, schon nach ordnung() sortiert)
 * bekommt die erste freie Spur. Einträge, die über Überschneidungen verkettet sind, bilden einen
 * Block und teilen sich die Tagesbreite gleichmäßig: `spuren` ist die Spurzahl des Blocks. Direkt
 * anschließend (10–12, 12–14) ist keine Überschneidung. Setzt `spur` und `spuren`, gibt die Liste zurück.
 */
export function spuren(eintraege) {
  const belegt = [];
  for (const e of eintraege) {
    let i = 0;
    while (belegt[i] && belegt[i].some((x) => schneiden(x, e))) i++;
    (belegt[i] = belegt[i] || []).push(e);
    e.spur = i;
  }
  const eltern = eintraege.map((_, i) => i);
  const wurzel = (i) => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
  for (let i = 0; i < eintraege.length; i++) {
    for (let j = i + 1; j < eintraege.length; j++) {
      if (schneiden(eintraege[i], eintraege[j])) eltern[wurzel(i)] = wurzel(j);
    }
  }
  const breite = new Map();
  eintraege.forEach((e, i) => breite.set(wurzel(i), Math.max(breite.get(wurzel(i)) || 0, e.spur + 1)));
  eintraege.forEach((e, i) => { e.spuren = breite.get(wurzel(i)); });
  return eintraege;
}

/**
 * Die meisten Spuren, die ein Block des Plans braucht, wenn alles offen ist (Wochenskelett, A und
 * B zusammen). Daran entscheidet die Seite, ob die Woche in ein Fenster passt (DESIGN §3.3).
 */
export function dichteste(groups) {
  const jeTag = new Map();
  for (const g of groups) for (const s of g.slots) {
    if (!jeTag.has(s.day)) jeTag.set(s.day, []);
    jeTag.get(s.day).push({ start: minuten(s.start), end: minuten(s.end), gewaehlt: 0, modul: 0, name: '' });
  }
  let max = 1;
  for (const liste of jeTag.values()) {
    for (const e of spuren(liste.sort(ordnung))) max = Math.max(max, e.spuren);
  }
  return max;
}

/** Die Mindestbreite, ab der die ganze Woche passt: jede Spur des dichtesten Blocks ≥ 24 px. */
export function wochenBreite(spurZahl, tage, rand = 48, achsenBreite = 32) {
  return rand + achsenBreite + tage * (spurZahl * 24 + (spurZahl - 1) * 2 + 5);
}

/**
 * Was das Raster zeigt (DESIGN §4.1, Silas' zweiter Test, V-0237).
 * - Ohne Filter „Mein Stundenplan“: jede eingeplante Gruppe (gewaehlt) und jeder Vorschlag
 *   (vorschlag, gestrichelt). Offene Formate stehen dort nicht; man schlägt sie über Modul oder Format auf.
 * - Mit Filter: ALLE Gruppen des Moduls bzw. Formats (gewählt, Vorschlag, möglich; das Zurückgenommene
 *   eines schon gewählten Formats rechnet app.js), dazu „Mein Stundenplan“ außerhalb des Filters als
 *   kontext: dieselben Kacheln, nur ganz zurückgenommen (etwa 20 % Deckkraft). So sieht man, wo die
 *   Woche belegt ist, ohne dass es mit der Wahl verwechselt wird.
 * Bis V-0237 zeigte die Vorgabe „Noch offen“ (alle Gruppen offener Formate) und Eingeplantes anderswo grau.
 */
export function sichtbar(groups, { modul = '', teil = '' } = {}) {
  const out = [];
  const filter = !!(modul || teil);
  for (const g of groups) {
    const passt = (!modul || g.component.module.number === modul) && (!teil || g.component_id === teil);
    const imPlan = g.selected || g.vorschlag;
    if (!filter) {
      if (imPlan) out.push({ g, art: g.selected ? 'gewaehlt' : 'vorschlag' });
    } else if (passt) {
      out.push({ g, art: g.selected ? 'gewaehlt' : g.vorschlag ? 'vorschlag' : 'moeglich' });
    } else if (imPlan) {
      out.push({ g, art: 'kontext' });
    }
  }
  return out;
}

// Die Navigation durch Module und Formate (DESIGN §4.2, V-0225). Filter { modul, teil, ueber }: die
// Modulnummer, die ID des Formats, ob man über das Modul zum Format kam. Nochmals tippen hebt auf, was
// man zuletzt gesetzt hat: kam man über das Modul, steht wieder das Modul, sonst kein Filter.
export const KEIN_FILTER = Object.freeze({ modul: '', teil: '', ueber: false });

/** Tipp auf ein Modul: alle seine Gruppen; ist es schon gefiltert (auch mit einem Format darin), aus. */
export function tippeModul(f, nummer) {
  return f.modul === nummer ? { ...KEIN_FILTER } : { modul: nummer, teil: '', ueber: false };
}

/** Tipp auf ein Format: nur seine Gruppen; nochmals getippt, eine Stufe zurück (Modul oder nichts). */
export function tippeFormat(f, teil, nummer) {
  if (f.teil === teil) return stufeZurueck(f);
  return { modul: nummer, teil, ueber: f.modul === nummer && (!f.teil || f.ueber) };
}

/** Esc und „nochmals tippen“: vom Format zurück zum Modul (wenn man darüber kam), sonst kein Filter. */
export function stufeZurueck(f) {
  return f.teil && f.ueber ? { modul: f.modul, teil: '', ueber: false } : { ...KEIN_FILTER };
}

/**
 * Die Legende unter dem Raster: jedes Format, das im Plan vorkommt, einmal, in der Reihenfolge, in
 * der es zuerst auftaucht, mit Kürzel und ausgeschrieben („nur was vorkommt“, Silas, 05.10.2026).
 */
export function legende(parts) {
  const out = [], schon = new Set();
  for (const c of parts) {
    const t = String(c.type || '');
    if (!t || schon.has(t)) continue;
    schon.add(t);
    out.push({ kurz: t, lang: typLang(t) });
  }
  return out;
}

/**
 * Die Gruppennummer, nur aus „Termingruppe 12“, „1. Termingruppe“ oder „Gruppe 3“; sonst null, und
 * die Kachel zeigt den Namen. Vorher galt jede Zahl im Namen: „AnaLinA Space im E-N 004, Mo. 8-10
 * Uhr“ wurde „Gruppe 004“, die Raumnummer (querwind, Punkt 16a7b0e5).
 */
export function gruppenNummer(name) {
  const t = String(name || '').trim();
  const m = t.match(/^(?:termin)?gruppe\s+(\d+)\b/i) || t.match(/^(\d+)\.?\s*(?:termin)?gruppe\b/i);
  return m ? m[1] : null;
}

const TYPEN = { VL: 'Vorlesung', UE: 'Übung', TUT: 'Tutorium', IV: 'Integrierte Veranstaltung' };

/** Typkürzel ausgeschrieben; unbekannte Kürzel bleiben, wie MOSES sie liefert (DESIGN §5.13). */
export function typLang(t) {
  return TYPEN[t] || String(t || '');
}

// Die Kategorie eines Formats (Silas, 05.10.2026, V-0237): `vorlesung` (Präsenz im Stil einer
// Vorlesung: VL, IV), `uebung` (gemeinsam Aufgaben: UE), `sonstige` (alles andere). Sie steuert die
// Sättigung der Kachel (100 / 70 / 50 %). Die Quelle ist das Lesemodell (`format.kategorie`, V-0238);
// fehlt es, das Kürzel, damit die Seite auch mit älteren Daten richtig aussieht.
const KATEGORIE = { VL: 'vorlesung', IV: 'vorlesung', UE: 'uebung' };
const KATEGORIEN = new Set(['vorlesung', 'uebung', 'sonstige']);

export function kategorie(c) {
  const k = c && c.format && c.format.kategorie;
  return KATEGORIEN.has(k) ? k : KATEGORIE[c && c.type] || 'sonstige';
}

/** Der Rhythmus auf der Kachel, nur wenn er von „wöchentlich“ abweicht; 14-tägig als A/B-Woche. */
export function rhythmusHinweis(s) {
  if (s.fortnightly && (s.parity || []).length === 1) return s.parity[0] === 0 ? 'A-Woche' : 'B-Woche';
  return /^wöchentlich/.test(s.rhythm || '') ? '' : String(s.rhythm || '');
}

/** Der Wochentag, den die Tagansicht zuerst zeigt: heute, am Wochenende Montag. */
export function startTag(datum, tage = 5) {
  const t = (datum.getDay() + 6) % 7;
  return t < Math.min(tage, 5) ? t : 0;
}
