// Das Planungsmodell von /silas (V-0321, seit V-0349 das Kontingent-Modell): Aufwand nach Leistungspunkten, nicht
// nach SWS.
//
// Silas, 11.10.2026: Seit Bologna zählt nicht die Kontaktzeit, sondern der ganze Aufwand. 1 LP sind 30 Zeitstunden
// (AllgStuPO § 45 Abs. 2), ein 6-LP-Modul also 180 h. Jede Modulbeschreibung schätzt in einer Aufwandstabelle, wie sie
// sich auf Posten verteilen (Präsenzzeit, Vor-/Nachbereitung, Prüfungsvorbereitung …) — eine Schätzung, kein Gesetz
// (KMK 2004: „angenommen“). Silas, 12.10.: „Ganz allgemein muss man das, glaube ich, mit einer Art Kontingent rechnen.“
// Seit V-0349 ist jeder Posten ein Kontingent; die Termine gehen vor, verteilt wird nur Selbststudium, und was der
// Prüfung dient, wird unter „Prüfungen“ geplant (kontingent.mjs, docs/SILAS.md §2).
//
// Diese Datei baut die Vorkommen — jeden Termin, Block, jede Prüfung und Frist mit Datum — und zählt sie; danach rechnet
// kontingent.mjs das Modell. Der Vertrag ist docs/SILAS.md. Nichts hier kommt aus der Logik des öffentlichen Planers
// (auswahl.mjs, planwahl.mjs …): Silas wollte ausdrücklich eine neue. Rein — kein DOM, kein Netz, keine Uhr außer der
// übergebenen —, damit die Seite (web/silas/silas.mjs) und die Pages Function (functions/silas/api) dieselbe Rechnung haben.

import {
  REGELN, TAGE, min, hhmm, plusTage, wochentag, montagVon, tageZwischen, istDatum, datumKurz, aufRaster, stunden,
  istFrei, istGeschlossen, wochen, muster, termineAus, zaehltMin, nurOnline, einheiten, videoBlockMin, pruefungsTermin,
  freieFenster, naechsterPlatz, isoZeit, vorOrt, phasen,
} from './grund.mjs';
import { kontingentRechnen, istEintrag, wochenBedarf as bedarfJeWoche, STUFEN, toleranz } from './kontingent.mjs';

export * from './grund.mjs';
export * from './kontingent.mjs';

// ── Bausteine ────────────────────────────────────────────────────────────────────────────────────

export function teileVon(angebot) {
  const aus = [];
  for (const m of angebot.module || []) for (const t of m.teile || []) aus.push({ teil: t, modul: m });
  return aus;
}

/** Der Stoff eines Lernblocks (V-0342): die Präsenz- und Videoteile seines Moduls, die Termine oder Freigaben haben —
 *  die derselben Lehrveranstaltung (lv des Postens: VL-Nachbereitung → VL, STAT1-IV → IV-Präsenz und Screencasts).
 *  Hat die eigene Lehrveranstaltung noch keine Termine (eine Übung ohne Zeiten), gilt für den Beginn der Stoff des
 *  ganzen Moduls, aber kein Bezug (eigen: false). Posten ohne lv (BuK: Vor-/Nachbereitung) gehören zum ganzen Modul.
 *  teile: die Map aus rechnen(). */
function stoffTeile(teile, z) {
  const lv = z.posten && z.posten.lv;
  const datiert = [...teile.values()].filter((x) => x.modul === z.modul && x.topf !== 'pruefung' && ['praesenz', 'video'].includes(x.teil.art)
    && (x.vk.some((v) => v.quelle === 'termin' && !v.ausgefallen) || (x.einheiten && x.einheiten.length)));
  if (!lv) return { teile: datiert, eigen: true };
  const gleich = datiert.filter((x) => x.posten && x.posten.lv === lv);
  return gleich.length ? { teile: gleich, eigen: true } : { teile: datiert, eigen: false };
}
/** Die Art eines Bestandteils für Farbe und Legende (Silas, 11.10.: „Präsenzveranstaltung sollte das gleiche
 *  Farbschema haben bei allen Modulen … Klausurvorbereitung, Klausur, Fristen …“). Quizze sind Lernen (Silas, 12.10.:
 *  „Außerdem sollte ISIS Quiz lernen auch als Lernen markiert sein“). Im Angebot überschreibt `kategorie` die Herleitung. */
export const KATEGORIEN = [
  ['praesenz', 'Präsenz'], ['video', 'Videos'], ['lernen', 'Vor- und Nachbereitung, Quizze'], ['aufgaben', 'Aufgaben und Labs'],
  ['pruefung', 'Prüfung'],
];
export function kategorie(t) {
  if (t.kategorie) return t.kategorie;
  if (t.topf === 'pruefung' || t.art === 'pruefung') return 'pruefung';
  if (t.art === 'praesenz') return 'praesenz';
  if (t.art === 'video') return 'video';
  const text = `${t.id} ${t.titel}`;
  if (/lab|aufgab|übungsbl|blatt|abgabe/i.test(text)) return 'aufgaben';
  return 'lernen';
}

export const istWahl = (t) => t.art === 'praesenz' && (t.wahl || (t.optionen && t.optionen.length > 0));
export const kurz = (m) => m.kurz || m.id;

// ── Die vier Schritte (V-0333) ───────────────────────────────────────────────────────────────────
// Silas, 11.10.2026: „Die absolute Foundation muss sein: alle bestätigten Pflichtpräsenztermine … Dann der zweite
// Layer, das sind Optionstermine … dann die dritte Schicht, Screencasts … und dann als letzte Sache für alle Sachen eine
// Vor- und Nachbereitung. Das Tool soll einen durch genau diese Entscheidungen durchführen.“ Jeder Bestandteil und jedes
// Vorkommen gehört zu genau einem Schritt; Zurücksetzen nimmt die Schritte ab 2 weg, Schritt 1 bleibt.
// Alles im Prüfungs-Topf (G2: Prüfungsvorbereitung, Probeklausur, Fragestunde, die Prüfungen und ihre Fristen) ist
// Schritt 5 (PRUEFUNGEN): nicht im Ablauf, erst nach „Stundenplan festlegen“ (V-0334, und V-0349, Silas: „Klausur-
// vorbereitung soll unter Prüfungen auftauchen und nicht unter Woche“).
export const PRUEFUNGEN = 5;
export const SCHRITTE = [
  { nr: 1, id: 'grundlage', titel: 'Grundlage', satz: 'Feste Präsenztermine und Fristen — steht fest' },
  { nr: 2, id: 'gruppen', titel: 'Gruppen', satz: 'Tutorien und Übungen mit Gruppen — du wählst' },
  { nr: 3, id: 'videos', titel: 'Videos', satz: 'Screencasts und Lehrvideos — du legst sie selbst' },
  { nr: 4, id: 'evl', titel: 'EVL', satz: 'Eigenverantwortliches Lernen: Vor- und Nachbereitung, Labs, Quizze' },
];
/** Präsenz mit eigenen Terminen ist Schritt 1, Präsenz mit Gruppen (oder ohne Termine — die Gruppen kommen noch)
 *  Schritt 2, Videos Schritt 3, Selbststudium Schritt 4, der Prüfungs-Topf 5 (nach dem Festlegen). */
export function schrittVon(t) {
  if (t.schritt) return t.schritt;
  if (t.topf === 'pruefung' || t.art === 'pruefung') return PRUEFUNGEN;
  if (t.art === 'praesenz') return istWahl(t) || !muster(t).length ? 2 : 1;
  return t.art === 'video' ? 3 : 4;
}
/** Ein Block gehört zum Schritt seines Bestandteils: Videos 3, Prüfungs-Topf 5, alles andere (auch Puffer ohne Teil) 4. */
export const schrittVonBlock = (teil) => (teil ? Math.max(3, schrittVon(teil)) : 4);
/** Das Etikett an jeder Kachel (Silas: „ist es Präsenz, ist es Video oder ist es EVL“). */
export const ETIKETT = { 1: 'Präsenz', 2: 'Präsenz', 3: 'Video', 4: 'EVL', 5: 'Prüfung' };
export const postenGesamt = (p) => Math.round(p.mult * p.h * 60); // in Minuten

/** „Vorbereitung auf …“ (Kontingent-Modell, unregelmäßige Termine): ein Element mit `vorbereitung_auf: <teil-id>` hat
 *  je Termin dieses Teils eine Einheit — Fenster vom vorigen Termin bis zu diesem, Dauer aus einheiten.dauer_min. Die
 *  Daten kommen aus dem gewählten (oder gewünschten) Termin, sonst aus der ersten Gruppe: ein Verweis, kein Datum (G7). */
function mitVorbereitung(t, m, wahl, sem) {
  const ziel = (m.teile || []).find((x) => x.id === t.vorbereitung_auf);
  if (!ziel) return t;
  const quelle = istWahl(ziel) ? ((ziel.optionen || []).find((o) => o.id === wahl[ziel.id]) || (ziel.optionen || [])[0]) : ziel;
  if (!quelle) return t;
  const daten = muster(quelle).flatMap((mu) => termineAus(mu, sem)).sort((a, b) => (a.datum < b.datum ? -1 : 1));
  if (!daten.length) return t;
  const liste = daten.map((x, i) => ({
    nr: i + 1, ab: i ? daten[i - 1].datum : plusTage(x.datum, -14), bis: x.datum,
    titel: `für ${x.titel ? x.titel.split(':')[0] : ziel.titel} am ${datumKurz(x.datum)}`, auf: `${ziel.id}@${x.datum}`,
  }));
  return { ...t, einheiten: { ...(t.einheiten || {}), liste } };
}

// ── Die Rechnung ─────────────────────────────────────────────────────────────────────────────────

/**
 * Rechnet einen Stand durch. Ergebnis (docs/SILAS.md §2):
 *  - wochen, vorkommen (jeder Termin, Block, jede Prüfung, Frist und Freigabe mit Datum, ihr Lebenslauf)
 *  - teile: je Element sein Posten, Topf, Baum (Zeitbindung, Alternativen, Info fehlt), Kontingent, Wochenwert, Meldungen
 *  - posten: je Posten der Aufwandstabelle Kontingent, Struktur, Plan, Abgleich, G5
 *  - pruefungen: je Prüfung Termin, Status, Fristen, Kontingent, Vorschlag
 *  - last, audit, offen; module und summe
 * optionen: { heute: 'JJJJ-MM-TT', jetzt_min }
 */
export function rechnen(angebot, plan = {}, optionen = {}) {
  const sem = angebot.semester;
  const regeln = { ...REGELN, ...(angebot.regeln || {}) };
  const wo = wochen(sem);
  const wahl = plan.wahl || {};
  const ist = plan.ist || {};
  const tausch = plan.tausch || {};
  const verlegt = plan.verlegt || {};
  const vorkommen = [];
  const teile = new Map();
  const heute = optionen.heute || null;
  const flagge = (z, art, text, extra) => z.flags.push({ art, text, ...(extra || {}) });

  // 1 · Elemente: je Teil sein Posten und sein Topf (G2: was einer Prüfung dient, ist Prüfungs-Topf).
  for (const m of angebot.module || []) {
    const posten = new Map((m.posten || []).map((p) => [p.id, p]));
    for (const t0 of m.teile || []) {
      const t = t0.vorbereitung_auf ? mitVorbereitung(t0, m, wahl, sem) : t0;
      const p = posten.get(t.posten) || null;
      const topf = t.topf === 'pruefung' || t.art === 'pruefung' || (p && p.topf === 'pruefung') ? 'pruefung' : 'semester';
      const z = { teil: t, modul: m, posten: p, topf, vk: [], flags: [], einheiten: null };
      if (t.posten && !p) flagge(z, 'posten', `Posten „${t.posten}“ fehlt in der Aufwandstabelle`);
      teile.set(t.id, z);
    }
  }

  // 2 · Termine der Lehrstühle (Schicht A) und gewählte Gruppen (Schicht B). Eine Gruppe mit Zuteilung (MOSES,
  //     Tutorienanmeldung) ist bis zur bestätigten Zuteilung (plan.zugeteilt) ein Wunsch: Ihre Termine stehen als
  //     Arbeitsannahme im Plan und sperren, zählen aber nicht als verplant (Silas, 12.10.: „Wieso sind 10 h Übung
  //     schon verplant? Ich habe doch noch gar keinen Termin zugewiesen bekommen.“). Während die Gebäude zu sind
  //     (semester.geschlossen) fällt Präsenz vor Ort aus, ebenso, was Silas als ausgefallen meldet (plan.ist).
  for (const z of teile.values()) {
    const t = z.teil;
    if (t.art !== 'praesenz') continue;
    let quelle = t, schicht = 'A', option = null, annahme = false;
    if (istWahl(t)) {
      option = (t.optionen || []).find((o) => o.id === wahl[t.id]) || null;
      if (!option) continue;
      quelle = option; schicht = 'B';
      annahme = !!t.zuteilung && (plan.zugeteilt || {})[t.id] !== option.id;
    }
    // Nur in dieser Woche verlegt (SP-0423, plan.verlegt, verlegen()): Die Plätze, die das Element ohnehin hat, und die
    // schon vergebenen — ein verlegter Termin darf keinen davon treffen, sonst gäbe es seine Id zweimal.
    const verlegtHier = Object.keys(verlegt).some((k) => k.startsWith(`${t.id}@`));
    const basis = verlegtHier ? new Set(muster(quelle).flatMap((mu) => termineAus(mu, sem).map((x) => `${t.id}@${x.datum}@${hhmm(x.start)}`))) : null;
    const vergeben = new Set();
    for (const [mi, mu] of muster(quelle).entries()) {
      for (const x0 of termineAus(mu, sem)) {
        const id0 = `${t.id}@${x0.datum}@${hhmm(x0.start)}`;
        // Nur in dieser Woche verlegt (SP-0423, Silas, 21.10.: „dass man einen Präsenztermin in der Wochenansicht für
        // eine bestimmte Woche auch verschieben kann“): Das Vorkommen liegt an dem Platz, an den Silas es gezogen hat,
        // und bleibt ein Termin seiner Reihe. Trifft der Platz einen anderen Termin desselben Elements, gilt er nicht.
        const vl = verlegtGueltig(verlegt[id0]) ? verlegt[id0] : null;
        const vid = vl ? `${t.id}@${vl.datum}@${vl.start}` : null;
        const vlFrei = !!vl && vid !== id0 && !basis.has(vid) && !vergeben.has(vid);
        if (vl && vid !== id0 && !vlFrei) flagge(z, 'verlegt_fehlt', `${t.titel}: Der Termin vom ${datumKurz(x0.datum)} ist auf einen anderen Termin desselben Elements verlegt — er liegt wieder an seinem Platz`, { stufe: 'achtung', datum: x0.datum });
        // Nur in dieser Woche bei einer anderen Gruppe (SP-0421, plan.tausch, tauschen()): Das Vorkommen der gewählten
        // Gruppe liegt dann am Termin der anderen. Gibt es den Termin nicht mehr (Angebot geändert), bleibt es an
        // seinem Platz, und eine Meldung sagt es. Verlegt geht vor (verlegen() nimmt den Tausch ohnehin heraus).
        const ts = option && !vlFrei ? tausch[id0] : null;
        const ziel = ts ? tauschZiel(t, ts, sem) : null;
        if (ts && !ziel) flagge(z, 'tausch_fehlt', `${t.titel}: Der Tausch am ${datumKurz(x0.datum)} passt zu keinem Termin mehr — der Termin liegt wieder an seinem Platz`, { stufe: 'achtung', datum: x0.datum });
        const x = vlFrei ? { ...x0, datum: vl.datum, start: min(vl.start), ende: min(vl.ende) } : ziel ? ziel.x : x0;
        const q = ziel ? ziel.option : quelle;
        const id = vlFrei ? vid : ziel ? `${t.id}@${x.datum}@${hhmm(x.start)}` : id0;
        vergeben.add(id);
        const ort = x.ort || q.ort || t.ort || null;
        const ausgefallen = istGeschlossen(sem, x.datum) && !nurOnline(ort) ? 'geschlossen' : (istEintrag(ist[id]) || {}).s === 'ausgefallen' ? 'gemeldet' : null;
        // hart: Auf einem Termin kann kein Block liegen (Silas, 11.10.: „die Sachen sind ganz sicher geblockt“).
        const v = {
          id, quelle: 'termin', schicht, schritt: schrittVon(t), hart: !ausgefallen, muster: mi,
          teil: t.id, modul: z.modul.id, option: ziel ? ziel.option.id : option && option.id, datum: x.datum, start: x.start, ende: x.ende,
          ort, online: q.online || t.online || null, ausgefallen, annahme,
          titel: x.titel, ct: t.ct !== false, zaehlt_min: 0, flags: [], mit: [],
          herkunft: x.quelle || q.quelle || t.quelle || null, unsicher: !!x.unsicher,
          tausch: ziel ? { von: id0, option: option.id, datum: x0.datum, start: x0.start, ende: x0.ende } : null,
          verlegt: vlFrei ? { von: id0, datum: x0.datum, start: x0.start, ende: x0.ende } : null,
        };
        vorkommen.push(v); z.vk.push(v);
      }
    }
  }

  // 3 · Silas' Blöcke (Schicht D). Ein Wochenblock gilt in jeder Vorlesungswoche (in der Pause nur mit pause: true), mit
  //     `alle: n` nur in jeder n-ten (ab der ersten, `versatz` verschiebt), ein Datumsblock genau an seinem Tag.
  for (const b of plan.bloecke || []) {
    const z = b.teil ? teile.get(b.teil) : null;
    let tage = [];
    if (b.datum) tage.push(b.datum);
    else {
      const ziel = TAGE.indexOf(b.tag);
      for (const w of wo) {
        if (!(w.art === 'vorlesung' || (b.pause && w.art === 'frei'))) continue;
        const d = plusTage(w.von, ziel);
        if ((b.ab && d < b.ab) || (b.bis && d > b.bis)) continue;
        if (istFrei(sem, d) && !b.pause) continue;
        if (d < sem.vorlesung.von || d > sem.vorlesung.bis) continue;
        tage.push(d);
      }
      const alle = Math.max(1, Math.round(b.alle || 1));
      if (alle > 1) tage = tage.filter((_, i) => i % alle === (b.versatz || 0) % alle);
      // Wochen, aus denen ein Vorkommen einzeln verschoben wurde (SP-0414, einzelnVerschieben): erst nach dem Takt
      // streichen, sonst rückte `alle: n` jede spätere Woche um eins. Nach Montag, damit es auch nach einem neuen
      // Wochentag der Reihe dieselbe Woche bleibt.
      if (b.ohne && b.ohne.length) tage = tage.filter((d) => !b.ohne.includes(montagVon(d)));
    }
    for (const d of tage) {
      const v = {
        id: `${b.id}@${d}`, quelle: 'block', schicht: 'D', schritt: schrittVonBlock(z && z.teil), block: b.id, teil: z ? z.teil.id : null,
        modul: z ? z.modul.id : null, datum: d, start: min(b.start), ende: min(b.ende),
        titel: b.titel || null, zaehlt_min: 0, flags: [], mit: [], woechentlich: !b.datum, aus: b.aus || null,
        serie: b.serie || null, // nur in dieser Woche verschoben (SP-0414), gekennzeichnet (SP-0416)
      };
      vorkommen.push(v);
      if (z) z.vk.push(v);
    }
  }

  // 4 · Prüfungen (Schicht A), Einzeltermine und Fristen (Schicht C). Es gilt der gewählte Termin, sonst als
  //     Arbeitsannahme der früheste (G7); die anderen stehen als Rückfall da und sperren nichts. Die Fristen der
  //     Prüfungen (An-, Abmeldung, Vorbehalt) rechnet kontingent.mjs als Verweise und hängt sie unten an.
  function frist(id, modul, datum, zeit, titel, wichtig, herkunft, teil = null, schritt = 1) {
    vorkommen.push({
      id, quelle: 'frist', schicht: 'C', schritt, modul, teil, datum, ganztag: true, punkt: zeit ? min(zeit) : undefined,
      titel, wichtig: !!wichtig, unsicher: !!(herkunft && herkunft.unsicher), herkunft: (herkunft && herkunft.quelle) || null,
      zaehlt_min: 0, flags: [], mit: [],
    });
  }
  for (const m of angebot.module || []) {
    for (const p of m.pruefungen || []) {
      const { termin: gilt } = pruefungsTermin(m, p.id, plan);
      for (const x of p.termine || []) {
        if (!istDatum(x.datum)) continue;
        const zeit = x.start ? { start: min(x.start), ende: x.ende ? min(x.ende) : min(x.start) + (p.dauer_min || 60) } : { ganztag: true };
        const wichtig = x === gilt;
        vorkommen.push({
          id: `${p.id}@${x.datum}`, quelle: 'pruefung', schicht: 'A', schritt: PRUEFUNGEN, hart: wichtig, modul: m.id, pruefung: p.id,
          datum: x.datum, ...zeit, titel: [p.titel, x.label].filter(Boolean).join(' · '), ort: x.ort || null,
          wichtig, unsicher: !!x.unsicher, zaehlt_min: 0, flags: [], mit: [], herkunft: x.quelle || p.quelle || null,
        });
      }
    }
    // Die Anmeldung einer Gruppe (EINFWI-Übung über MOSES bis 14.10.) ist eine Frist ihres Schritts (2).
    for (const t of m.teile || []) {
      const a = t.anmeldung;
      if (!a) continue;
      const wo_ = a.wo ? ` (${String(a.wo).split(' (')[0]})` : '';
      const sch = schrittVon(t);
      if (istDatum(a.von)) frist(`${t.id}-anmeldung-von`, m.id, a.von, a.von_zeit, `${t.titel}: Anmeldung öffnet${wo_}`, false, a, t.id, sch);
      if (istDatum(a.bis)) frist(`${t.id}-anmeldung-bis`, m.id, a.bis, a.bis_zeit, `${t.titel}: Anmeldung endet${wo_}${a.nur ? ` — nur ${a.nur}` : ''}`, true, a, t.id, sch);
    }
    // Abgaben und Schlusszeiten der Einheiten (Quiz, Blatt): Fristen der Schicht C.
    for (const t of m.teile || []) {
      for (const e of einheiten(teile.get(t.id).teil, sem) || []) {
        if (e.bis && !e.auf) frist(`${t.id}#${e.nr}@bis`, m.id, e.bis, e.bis_zeit, `${t.titel} ${e.nr}${e.titel ? ` (${e.titel})` : ''} fällig`, false, e, t.id, schrittVon(t));
      }
    }
  }
  for (const e of angebot.termine || []) {
    if (!istDatum(e.datum)) continue;
    const zeit = e.start && e.ende ? { start: min(e.start), ende: min(e.ende) } : e.start ? { punkt: min(e.start), ganztag: true } : { ganztag: true };
    vorkommen.push({
      id: e.id, quelle: e.art === 'frist' ? 'frist' : e.art === 'rahmen' ? 'rahmen' : 'einzel',
      schicht: e.art === 'rahmen' ? 'R' : 'C', schritt: 1, hart: !zeit.ganztag && e.art !== 'frist' && e.art !== 'rahmen',
      modul: e.modul || null, datum: e.datum, bis: e.bis || null, ...zeit,
      titel: e.titel, ort: e.ort || null, wichtig: !!e.wichtig, unsicher: !!e.unsicher, art: e.art,
      zaehlt_min: 0, flags: [], mit: [], herkunft: e.quelle || null, notiz: e.notiz || null,
    });
  }

  // 5 · Überschneidungen — an den konkreten Tagen. Ein Block, der einen Termin überlappt, zählt nur mit dem Teil, der
  //     frei bleibt. Ausgefallenes überschneidet nichts.
  const konflikte = [];
  const marke = (v, f) => { if (!v.flags.includes(f)) v.flags.push(f); };
  const proTag = new Map();
  for (const v of vorkommen) if (v.start != null && v.ende != null && !v.ganztag && !v.ausgefallen) proTag.set(v.datum, [...(proTag.get(v.datum) || []), v]);
  for (const liste of proTag.values()) {
    liste.sort((a, b) => a.start - b.start || a.ende - b.ende);
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length && liste[j].start < liste[i].ende; j++) {
        const a = liste[i], b = liste[j];
        const ueber = Math.min(a.ende, b.ende) - Math.max(a.start, b.start);
        if (ueber <= 0) continue;
        // Ein Rückfalltermin einer Prüfung (wichtig: false) verdrängt weder einen Termin noch einen Block.
        const neben = (v) => v.quelle === 'pruefung' && !v.wichtig;
        if ((neben(a) && b.quelle !== 'pruefung') || (neben(b) && a.quelle !== 'pruefung')) continue;
        a.mit.push(b.id); b.mit.push(a.id);
        konflikte.push({ datum: a.datum, a: a.id, b: b.id, minuten: ueber });
        // Ein Termin ist gesperrt (V-0333): Ein Block auf ihm verliert die überlappte Zeit, der Termin bleibt.
        const blockA = a.quelle === 'block', blockB = b.quelle === 'block';
        if (blockA && !blockB) { a.ueberlappt = (a.ueberlappt || 0) + ueber; marke(a, 'gesperrt'); }
        else if (blockB && !blockA) { b.ueberlappt = (b.ueberlappt || 0) + ueber; marke(b, 'gesperrt'); }
        else { marke(a, 'konflikt'); marke(b, 'konflikt'); }
      }
    }
  }

  // 6 · Zählen. Termine mit ihrer Doppelstunde (ausgefallene nicht), Blöcke mit ihrer Dauer — aber ein Video-Block nur,
  //     wenn es ein Video gibt, das er schauen kann (erst ab der Freigabe), und ein Lernblock für eine Prüfung nur vor ihr.
  for (const z of teile.values()) {
    const t = z.teil;
    for (const v of z.vk) {
      if (v.quelle === 'termin') v.zaehlt_min = v.ausgefallen ? 0 : zaehltMin(v.start, v.ende, v.ct);
      else v.zaehlt_min = Math.max(0, v.ende - v.start - (v.ueberlappt || 0));
    }
    const bloecke = z.vk.filter((v) => v.quelle === 'block').sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.start - b.start));
    if (t.art === 'video' || t.art === 'selbst') {
      const liste = einheiten(t, sem);
      z.einheiten = liste;
      const video = t.art === 'video';
      const annahme = (t.einheiten && (t.einheiten.laenge_min || t.einheiten.annahme_min)) || 90;
      if (liste) {
        // Die Einheiten einer Woche gehören zusammen (zwei Screencasts in Woche 2 schaut man in einem Block). Blöcke füllen
        // die Wochen der Reihe nach: Ein Block deckt die früheste freigegebene Woche, die noch Zeit braucht — so holt ein
        // späterer Block eine verpasste Woche nach. Ein Block, für den es (noch) nichts zu tun gibt, zählt nicht.
        const gruppen = [];
        for (const e of [...liste].sort((a, b) => (a.ab < b.ab ? -1 : a.ab > b.ab ? 1 : 0))) {
          const mo = montagVon(e.ab);
          let g = gruppen.find((x) => x.montag === mo);
          if (!g) { g = { montag: mo, ab: e.ab, einheiten: [], bedarf_min: null, belegt_min: 0, bloecke: [] }; gruppen.push(g); }
          g.einheiten.push(e);
        }
        const dauer = t.einheiten && Number.isFinite(t.einheiten.dauer_min) ? t.einheiten.dauer_min : null;
        if (!video && dauer) for (const g of gruppen) g.bedarf_min = aufRaster(g.einheiten.length * dauer, regeln.raster_min);
        if (video) {
          for (const g of gruppen) {
            g.laenge_min = g.einheiten.reduce((s, e) => s + (e.laenge_min ?? annahme), 0);
            g.bedarf_min = videoBlockMin(g.laenge_min, regeln);
            g.geschaetzt = g.einheiten.some((e) => e.laenge_min == null);
          }
        }
        // Das Fenster je Woche: bis zur spätesten Frist ihrer Einheiten, sonst bis zur nächsten Freigabe.
        gruppen.forEach((g, n) => {
          const bisListe = g.einheiten.map((e) => e.bis).filter(Boolean).sort();
          g.bis = bisListe.length ? bisListe[bisListe.length - 1] : (gruppen[n + 1] ? plusTage(gruppen[n + 1].ab, -1) : sem.vorlesung.bis);
        });
        // Abgaben ohne Dauer (Prog1WINF-Aufgaben, Blätter): ein Fenster statt einer Menge.
        const fenster = !video && !gruppen.some((g) => g.bedarf_min);
        // Zuordnung in Minuten (V-0357, Prüfung W01/W02): Ein Block deckt der Reihe nach die früheste freigegebene Woche, die
        // noch Zeit braucht, und mit seinem Rest die nächste — ein Video lässt sich nachholen, eine Abgabe (Quiz) nur in
        // ihrem Fenster (vorher deckte der 2-h-Block alle zwei Wochen ein Quiz nach dessen Frist, und der Rest verfiel). Was
        // der Block nicht deckt, zählt nicht. ✗ und verschoben decken nichts, „teilweise“ nur seine Minuten — darum liest
        // die Zuordnung plan.ist selbst (lebenslauf() rechnet erst danach): Sonst blieb ein ✗-Video „gedeckt“, und der
        // Nachholblock zählte als „Block ohne Video“.
        for (const v of bloecke) {
          const e_ = istEintrag(ist[v.id]);
          if (e_ && (e_.s === 'nein' || e_.s === 'verschoben')) { v.deckt_nicht = true; continue; }
          let rest = Math.max(0, v.ende - v.start - (v.ueberlappt || 0));
          if (e_ && e_.s === 'teil') rest = Math.min(rest, Math.max(0, Math.round(e_.min || 0)));
          if (fenster) {
            const g = gruppen.find((x) => x.ab <= v.datum && v.datum <= x.bis);
            if (!g) { v.zaehlt_min = 0; v.flags.push('leer'); continue; }
            g.bloecke.push(v.id); g.belegt_min += rest; g.gedeckt_am = g.gedeckt_am || v.datum; (g.deckung = g.deckung || []).push({ datum: v.datum, min: rest });
            v.einheit = g.einheiten.map((e) => e.nr).join(' + ');
            for (const e of g.einheiten) if (!e.block) e.block = v.id;
            continue;
          }
          let gedeckt = 0;
          const nrn = [];
          while (rest > 0) {
            const g = gruppen.find((x) => x.ab <= v.datum && (video || v.datum <= x.bis) && (x.bedarf_min == null ? !x.bloecke.length : x.belegt_min < x.bedarf_min));
            if (!g) break;
            const nimm = g.bedarf_min == null ? rest : Math.min(rest, g.bedarf_min - g.belegt_min);
            g.belegt_min += nimm; g.gedeckt_am = g.gedeckt_am || v.datum; (g.deckung = g.deckung || []).push({ datum: v.datum, min: nimm });
            if (!g.bloecke.includes(v.id)) g.bloecke.push(v.id);
            rest -= nimm; gedeckt += nimm;
            nrn.push(...g.einheiten.map((e) => e.nr));
            for (const e of g.einheiten) if (!e.block) e.block = v.id;
          }
          if (!gedeckt) { v.zaehlt_min = 0; v.flags.push('leer'); continue; }
          v.zaehlt_min = Math.min(v.zaehlt_min, gedeckt);
          v.einheit = nrn.join(' + ');
        }
        z.gruppen = gruppen;
        // Was kein Block deckt (V-0357): STAT1-Videos 31–34 bekamen nie einen Block, weil die Vorgabe das Mittel je Woche
        // ist und der Rückstand wuchs — ohne Meldung, der Fortschritt sagte „fertig“. Jetzt eine Meldung (dran, wenn das
        // Erste davon in drei Wochen ansteht), und fortschritt() misst Abdeckung statt Minuten je Woche.
        const ungedeckt = gruppen.filter((g) => g.bedarf_min && g.belegt_min < g.bedarf_min - 15 && (!heute || (video ? true : g.bis >= heute)));
        if (ungedeckt.length && bloecke.length) {
          const fehlt = ungedeckt.reduce((s, g) => s + g.bedarf_min - g.belegt_min, 0);
          const nrn = ungedeckt.flatMap((g) => g.einheiten.map((e) => e.nr));
          const erst = ungedeckt[0].ab;
          flagge(z, 'ungedeckt', `${video ? 'Videos' : 'Einheiten'} ${nrn.length > 3 ? `${nrn.slice(0, 3).join(', ')} … (${nrn.length})` : nrn.join(', ')} ohne Block — ${stunden(fehlt)} fehlen (zuerst ab ${datumKurz(erst)})${video ? '; ein Block muss länger werden oder ein Nachholblock her' : ''}`,
            { stufe: heute && tageZwischen(heute, erst) <= 21 ? 'dran' : 'kommt', datum: erst });
        }
        const frei = bloecke.filter((v) => v.flags.includes('leer'));
        if (frei.length) flagge(z, 'leer', `${frei.length} ${frei.length > 1 ? 'Blöcke' : 'Block'} ohne ${video ? 'Video' : 'Einheit'} (zuerst ${datumKurz(frei[0].datum)}) — die Zeit zählt nicht`);
        const kurz_ = gruppen.filter((g) => g.bedarf_min && g.belegt_min > 0 && g.belegt_min < g.bedarf_min);
        if (kurz_.length) flagge(z, 'zu_kurz', `${kurz_.length} ${kurz_.length > 1 ? 'Wochen' : 'Woche'}: Block kürzer als ${video ? 'die Videos' : 'die Einheiten'} (ab ${datumKurz(kurz_[0].ab)}: ${stunden(kurz_[0].belegt_min)} eingeplant, ${stunden(kurz_[0].bedarf_min)} nötig)`);
        if (video) z.video_bedarf_min = gruppen.reduce((s, g) => s + g.bedarf_min, 0);
      }
    }
    if (t.art === 'pruefung') {
      const { pruefung, termin } = pruefungsTermin(z.modul, t.pruefung, plan);
      z.pruefung = pruefung; z.pruefungstermin = termin;
      if (!pruefung) flagge(z, 'pruefung_fehlt', 'Zu diesem Lernblock gehört keine Prüfung');
      else if (termin) {
        let nach = 0;
        for (const v of bloecke) if (v.datum >= termin.datum) { v.zaehlt_min = 0; v.flags.push('nach_pruefung'); nach += 1; }
        if (nach) flagge(z, 'nach_pruefung', `${nach} Lernblock${nach > 1 ? 'e liegen' : ' liegt'} am oder nach dem Prüfungstag und ${nach > 1 ? 'zählen' : 'zählt'} nicht`);
      }
    }
  }

  // 6b · Stoff und Bezug (V-0342, Silas: „morgen steht bei mir Programmieren 1 Quick Tests, 16 bis 18 Uhr“ — PROG1 beginnt
  //      erst am Donnerstag; „eine Logik …, dass man thematisch die Dinge gut zusammen gruppiert“). Ein Lernblock (art
  //      selbst) gehört zum Stoff seines Moduls (stoffTeile). Vor dem ersten Stoff zählt er nicht (vor_stoff); danach sagt
  //      `bezug` am Vorkommen, wie nah er am Stoff liegt: direkt, nah, fern oder ohne.
  const absMin = (datum, m) => tageZwischen(sem.vorlesung.von, datum) * 1440 + m;
  for (const z of teile.values()) {
    // „Vorbereitung auf …“ bezieht sich auf ihren Termin, nicht auf den Stoff davor (V-0354) — kein Bezug.
    if (z.teil.art !== 'selbst' || z.topf === 'pruefung' || z.teil.vorbereitung_auf) continue;
    const { teile: stoff, eigen } = stoffTeile(teile, z);
    z.stoff_teile = stoff.map((x) => x.teil.id);
    z.stoff_eigen = eigen;
    if (!stoff.length) continue;
    let erst = null;
    for (const x of stoff) {
      for (const v of x.vk) if (v.quelle === 'termin' && !v.ausgefallen && (!erst || absMin(v.datum, v.ende) < erst.abs)) erst = { abs: absMin(v.datum, v.ende), datum: v.datum, teil: x };
      for (const e of x.einheiten || []) if (!erst || absMin(e.ab, 0) < erst.abs) erst = { abs: absMin(e.ab, 0), datum: e.ab, teil: x };
    }
    if (!erst) continue;
    z.stoff_ab = erst.datum;
    const bloecke = z.vk.filter((v) => v.quelle === 'block');
    if (!z.einheiten) {
      const vor = bloecke.filter((v) => absMin(v.datum, v.start) < erst.abs);
      for (const v of vor) { v.zaehlt_min = 0; v.flags.push('vor_stoff'); }
      if (vor.length) {
        const wer = `${erst.teil.teil.art === 'video' ? 'erstes Video' : erst.teil.teil.titel} ${TAGE[wochentag(erst.datum)]} ${datumKurz(erst.datum)}`;
        flagge(z, 'vor_stoff', `${vor.length} ${vor.length > 1 ? 'Blöcke liegen' : 'Block liegt'} vor dem ersten Stoff (${wer}) — davor gibt es nichts vor- oder nachzubereiten, die Zeit zählt nicht`);
      }
    }
    const ereignisse_ = stoff.flatMap((x) => x.vk.filter((v) => (v.quelle === 'termin' && !v.ausgefallen) || (v.quelle === 'block' && x.teil.art === 'video' && v.zaehlt_min > 0 && !v.deckt_nicht))
      .map((v) => ({ v, x, a: absMin(v.datum, v.start), e: absMin(v.datum, v.ende) })));
    const name = (o) => `${o.x.teil.titel} (${TAGE[wochentag(o.v.datum)]} ${hhmm(o.v.start)})`;
    for (const v of bloecke) {
      if (!(v.zaehlt_min > 0)) continue;
      if (!eigen) { v.bezug = { lage: 'offen' }; continue; }
      const a = absMin(v.datum, v.start), e = absMin(v.datum, v.ende);
      let nach = null, vor = null, spaeter = null;
      for (const o of ereignisse_) {
        if (o.e <= a && o.e >= a - 7 * 1440 && (!nach || o.e > nach.e)) nach = o;
        if (o.v.quelle === 'termin' && o.v.datum === v.datum && o.a >= e && (!vor || o.a < vor.a)) vor = o;
        if (o.a >= e && o.a <= a + 7 * 1440 && (!spaeter || o.a < spaeter.a)) spaeter = o;
      }
      const tage = nach ? tageZwischen(nach.v.datum, v.datum) : null;
      const direktNach = !!nach && tage === 0 && a - nach.e <= regeln.bezug_direkt_min;
      const direktVor = !!vor && vor.a - e <= regeln.bezug_direkt_min;
      const lage = direktNach || direktVor ? 'direkt' : nach && tage <= regeln.bezug_nah_tage ? 'nah' : nach ? 'fern' : 'ohne';
      const text = direktVor && !direktNach ? `direkt vor ${name(vor)}`
        : nach ? `${direktNach ? 'direkt' : tage === 0 ? 'am selben Tag' : tage === 1 ? 'einen Tag' : `${tage} Tage`} nach ${name(nach)}`
        : spaeter ? `vor dem Stoff (${name(spaeter)}) — davor gibt es nichts nachzubereiten` : 'in den sieben Tagen davor kein Stoff';
      v.bezug = { lage, text, nach: nach ? nach.v.id : null, vor: vor ? vor.v.id : null };
    }
  }

  // 6c · Überschneidung und Sperre je Element. Ein Block auf einem Termin: je Block eine Meldung mit dem Namen dessen, was
  //      ihn sperrt — trifft er in mindestens drei Wochen (oder an jedem seiner Tage) einen Termin, muss er weg.
  const vkNach = new Map(vorkommen.map((v) => [v.id, v]));
  const kurzVon = (id) => { const m = (angebot.module || []).find((x) => x.id === id); return m ? kurz(m) : null; };
  const nameVon = (v) => (v.quelle === 'termin' ? `${kurzVon(v.modul)} · ${teile.get(v.teil).teil.titel}` : [kurzVon(v.modul), v.titel].filter(Boolean).join(' · '));
  function sperren(vks) {
    const proBlock = new Map();
    for (const v of vks) if (v.quelle === 'block' && v.flags.includes('gesperrt')) proBlock.set(v.block, [...(proBlock.get(v.block) || []), v]);
    const aus = [];
    for (const [id, vs] of proBlock) {
      const b = (plan.bloecke || []).find((x) => x.id === id);
      const alle = vks.filter((v) => v.block === id).length;
      const namen = [...new Set(vs.flatMap((v) => v.mit.map((x) => vkNach.get(x)).filter((o) => o && o.quelle !== 'block').map(nameVon)))].join(', ');
      const wann = b.datum ? `am ${datumKurz(b.datum)}` : `${b.tag} ${b.start}–${b.ende}`;
      const dauernd = vs.length >= 3 || vs.length === alle;
      // Ein einzelner Tag, der bald kommt (der Wochenblock auf dem EINFWI-Kick-off), ist eine Aufgabe dieser Woche, kein
      // Hinweis (V-0357): dran, wenn er in den nächsten 14 Tagen liegt.
      const bald = vs.find((v) => !heute || v.datum >= heute);
      const stufe = dauernd ? 'dran' : bald && heute && tageZwischen(heute, bald.datum) <= 14 ? 'dran' : 'info';
      aus.push({
        art: 'gesperrt', dauernd, block: id, stufe, datum: bald ? bald.datum : null,
        text: dauernd ? `Block ${wann} liegt ${alle > 1 ? `an ${vs.length} Tagen ` : ''}auf ${namen} — dort ist gesperrt, verschieben`
          : `Block ${wann} fällt am ${vs.map((v) => datumKurz(v.datum)).join(', ')} teilweise weg (${namen})`,
      });
    }
    return aus;
  }
  for (const z of teile.values()) {
    const k = z.vk.filter((v) => v.flags.includes('konflikt'));
    if (k.length) flagge(z, 'konflikt', `Überschneidung an ${k.length} Termin${k.length > 1 ? 'en' : ''} (erster: ${datumKurz(k[0].datum)})`);
    z.flags.push(...sperren(z.vk));
  }
  const planFlags = sperren(vorkommen.filter((v) => v.quelle === 'block' && !v.teil));

  // 7–12 · Das Kontingent-Modell: Lebenslauf, Posten und Töpfe, Wochenwert, Prüfungen, Last, Vorschlag, Abgleich, Offenes.
  const erg = { sem, regeln, wochen: wo, vorkommen, teile, konflikte, planFlags, heute, plan };
  kontingentRechnen(erg, angebot, plan, optionen);

  // 7b · Unregelmäßiges (V-0354, Silas, 12.10.: „Alle Blöcke, die in einer echten Woche gelegt werden sollen, sollen nicht
  //      in der ursprünglichen Planung auftauchen. Diese kommen mit zu den irregulären Terminen … auf die Prüfungen-Seite
  //      (Literatur und Praxis, Vorbereitung auf die Übungen, Quicktests)“): Was seltener als jede zweite Woche einen Block
  //      braucht (vorgabe() einzeln) oder sich auf einzelne Termine bezieht (vorbereitung_auf), gehört nicht in die Schritte
  //      1–4, sondern unter „Prüfungen“ (Schritt 5) — gekoppelt an seine Bezugstermine (unregelmaessige()). Der Topf bleibt,
  //      wie die Aufwandstabelle ihn sagt (Semester). `unregelmaessig: false|true` im Angebot entscheidet von Hand.
  //      Das Element bekommt eine Kopie seines Teils mit schritt: 5 — das Angebot selbst bleibt unberührt (es wird gespeichert).
  for (const z of teile.values()) {
    if (z.topf === 'pruefung' || !['selbst', 'video'].includes(z.teil.art) || z.teil.unregelmaessig === false) continue;
    const vg = vorgabe(erg, z.teil.id);
    if (!z.teil.vorbereitung_auf && !z.teil.unregelmaessig && !(vg && vg.einzeln)) continue;
    z.unregel = true;
    z.teil = { ...z.teil, schritt: PRUEFUNGEN };
  }
  for (const v of vorkommen) if (v.teil && (v.quelle === 'block' || v.quelle === 'frist') && teile.get(v.teil)?.unregel) v.schritt = PRUEFUNGEN;

  // Die Fristen der Prüfungen (Verweise: An- und Abmeldung, Vorbehalt) stehen auch im Kalender.
  const schonFrist = new Set();
  for (const X of erg.pruefungen.values()) {
    if (!X.zaehlt) continue;
    for (const f of X.fristen) {
      if (f.art === 'anmeldung_ab' && f.regel) continue; // „in der Regel zwei Wochen nach Beginn“ ist kein Datum für den Kalender
      const id = `${X.id}-${f.art}`;
      if (vorkommen.some((v) => v.id === id)) continue;
      // Ein Portfolio hat EINE Anmeldung für alle Teile (§2.6) — im Kalender einmal je Modul, Art und Tag (V-0357: BuK
      // stand dreimal „Anmeldung öffnet“ am selben Tag).
      const k = `${X.modul.id}|${f.art}|${f.datum}`;
      if (X.portfolio && schonFrist.has(k)) continue;
      schonFrist.add(k);
      vorkommen.push({
        id, quelle: 'frist', schicht: 'C', schritt: PRUEFUNGEN, modul: X.modul.id, pruefung: X.id, datum: f.datum, ganztag: true,
        punkt: f.zeit ? min(f.zeit) : undefined, titel: `${X.p.titel}: ${f.text}`, wichtig: !['abmeldung', 'anmeldung_ab'].includes(f.art),
        verweis: f.verweis, herkunft: f.quelle, zaehlt_min: 0, flags: [], mit: [],
      });
    }
  }
  vorkommen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : (a.start ?? -1) - (b.start ?? -1)));
  // Wiederholungen (Silas, 11.10.: „pro Eintrag, wie oft sich dieser Eintrag … bis zum Ende des Semesters wiederholt“): je
  // Vorkommen das wievielte (nr), wie viele insgesamt (gesamt) und wie viele ab ihm noch kommen (rest).
  const reihen = new Map();
  for (const v of vorkommen) {
    // Ein getauschtes Vorkommen (SP-0421) zählt in der Reihe seiner gewählten Gruppe, nicht als „1×“ der anderen.
    const k = v.quelle === 'termin' ? `t|${v.teil}|${(v.tausch ? v.tausch.option : v.option) || ''}|${v.muster ?? 0}` : v.quelle === 'block' ? `b|${v.block}` : `e|${v.id}`;
    reihen.set(k, [...(reihen.get(k) || []), v]);
  }
  for (const vs of reihen.values()) vs.forEach((v, i) => { v.nr = i + 1; v.gesamt = vs.length; v.rest = vs.length - i; });
  return erg;
}

/** Je Schritt: wie viele Meldungen welcher Stufe, und das Kontingent seiner Bestandteile. Meldungen an einem Modul
 *  gehören zu den Prüfungen (5), wenn sie eine Prüfung betreffen, sonst zu Schritt 1. Ergebnis: die vier Schritte und
 *  dahinter (Index 4) die Prüfungen. */
export function schrittVonFlagge(f, z) {
  if (z) return schrittVon(z.teil);
  if (f.art === 'gesperrt') return 4;
  return f.pruefung ? PRUEFUNGEN : 1;
}
export function schritte(erg) {
  const aus = [...SCHRITTE, { nr: PRUEFUNGEN, id: 'pruefungen', titel: 'Prüfungen', satz: 'Prüfungen, Fristen und Prüfungsvorbereitung — nach dem Festlegen' }]
    .map((s) => ({ ...s, zaehler: Object.fromEntries(STUFEN.map((st) => [st, 0])), soll_min: 0, gedeckt_min: 0, teile: [] }));
  for (const r of erg.module) {
    for (const f of r.flags) aus[schrittVonFlagge(f, null) - 1].zaehler[f.stufe] += 1;
    for (const z of r.teile) {
      const s = aus[schrittVon(z.teil) - 1];
      for (const f of z.flags) s.zaehler[f.stufe] += 1;
      s.soll_min += z.kontingent_min; s.gedeckt_min += Math.min(z.plan_min, z.kontingent_min); s.teile.push(z);
    }
  }
  for (const f of erg.planFlags || []) aus[3].zaehler[f.stufe] += 1;
  for (const s of aus) s.offen = s.zaehler.kritisch + s.zaehler.dran;
  return aus;
}

/** Zurück auf die Grundlage (Silas: „wenn man auf Zurücksetzen drückt, die absolute Foundation muss sein …“): nimmt
 *  alles aus den Schritten `ab` bis 4 weg — ab 2 die Gruppenwahl, ab 3 die Video-Blöcke, ab 4 die übrigen Blöcke —
 *  und hebt es in `zurueckgesetzt` auf (Silas' Daten werden nie gelöscht; wiederherstellen() holt es zurück). Was
 *  Silas über das Angebot weiß, seine Ist-Erfassung und alles zu den Prüfungen bleibt; ein festgelegter Plan ist danach
 *  wieder in Arbeit. */
export function zuruecksetzen(plan, angebot, ab = 2, { am = null, erg = null } = {}) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  // Der Schritt eines Teils aus der Rechnung: Unregelmäßiges (7b) gehört zu den Prüfungen und bleibt wie sie liegen.
  const teil = new Map([...(erg || rechnen(angebot, plan || {})).teile.values()].map((z) => [z.teil.id, z.teil]));
  const weg = (b) => { const s = schrittVonBlock(b.teil ? teil.get(b.teil) : null); return s >= ab && s <= 4; };
  const fort = { am, ab, wahl: ab <= 2 ? neu.wahl || {} : {}, bloecke: (neu.bloecke || []).filter(weg) };
  // Die Täusche einer Woche (SP-0421) hängen an der Wahl: Sie gehen mit ihr beiseite und kommen mit ihr zurück.
  if (ab <= 2 && neu.tausch) fort.tausch = neu.tausch;
  if (ab <= 2) { delete neu.wahl; delete neu.tausch; }
  neu.bloecke = (neu.bloecke || []).filter((b) => !weg(b));
  delete neu.festgelegt;
  const alt = neu.zurueckgesetzt;
  if (Object.keys(fort.wahl).length || fort.bloecke.length) {
    neu.zurueckgesetzt = alt ? { ...fort, wahl: { ...alt.wahl, ...fort.wahl }, bloecke: [...alt.bloecke, ...fort.bloecke.filter((b) => !alt.bloecke.some((x) => x.id === b.id))] } : fort;
    if (alt && (alt.tausch || fort.tausch)) neu.zurueckgesetzt.tausch = { ...(alt.tausch || {}), ...(fort.tausch || {}) };
  }
  return neu;
}

/** Was zurückgesetzt wurde, wieder einsetzen: Gruppen, wo noch keine gewählt ist, Blöcke, deren Id es nicht gibt. */
export function wiederherstellen(plan) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const z = neu.zurueckgesetzt;
  if (!z) return neu;
  neu.wahl = { ...z.wahl, ...(neu.wahl || {}) };
  // Ein Tausch nur, wo die Gruppe wieder dieselbe ist, für die er galt (SP-0421).
  const tausch = Object.fromEntries(Object.entries(z.tausch || {}).filter(([id]) => { const teil = id.split('@')[0]; return (z.wahl || {})[teil] && neu.wahl[teil] === z.wahl[teil]; }));
  if (Object.keys(tausch).length) neu.tausch = { ...tausch, ...(neu.tausch || {}) };
  const ids = new Set((neu.bloecke || []).map((b) => b.id));
  neu.bloecke = [...(neu.bloecke || []), ...z.bloecke.filter((b) => !ids.has(b.id))];
  delete neu.zurueckgesetzt;
  return neu;
}

/** Ein Vorkommen eines Wochenblocks einzeln verschieben (SP-0414, Silas, 17.10.: „wenn man nicht auf Standardwoche,
 *  sondern auf echte Woche … etwas verschiebt, dann soll das für diese Woche halt verschoben werden … es gilt nur für
 *  diese eine Instanz“). Die Reihe lässt diese Woche aus (`ohne`, ihr Montag), und das Vorkommen wird ein Datumsblock mit
 *  `serie` (von welcher Reihe) — `ziel` {datum, start, ende, teil?, titel?}, Zeiten als "HH:MM". Ein Eintrag im
 *  Lebenslauf (plan.ist) zieht mit. Ist der Block schon ein Datumsblock, ändert sich nur er. Rein: gibt den neuen Plan
 *  und die Id des Blocks zurück, der das Vorkommen jetzt trägt. */
export function einzelnVerschieben(plan, blockId, datum, ziel) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const b = (neu.bloecke || []).find((x) => x.id === blockId);
  if (!b) return { plan: neu, id: null };
  const setzen = (x) => {
    x.datum = ziel.datum; x.start = ziel.start; x.ende = ziel.ende;
    if ('teil' in ziel) x.teil = ziel.teil || null;
    if (ziel.titel) x.titel = ziel.titel; else if ('teil' in ziel && ziel.teil) delete x.titel;
  };
  const ist = { ...(neu.ist || {}) };
  if (b.datum) {
    const alt = `${b.id}@${b.datum}`;
    setzen(b);
    if (alt in ist && ziel.datum !== datum) { ist[`${b.id}@${ziel.datum}`] = ist[alt]; delete ist[alt]; neu.ist = ist; }
    return { plan: neu, id: b.id };
  }
  const montag = montagVon(datum);
  b.ohne = [...new Set([...(b.ohne || []), montag])].sort();
  const ids = new Set(neu.bloecke.map((x) => x.id));
  let id = `${b.id}-${montag.replaceAll('-', '')}`;
  for (let i = 2; ids.has(id); i += 1) id = `${b.id}-${montag.replaceAll('-', '')}-${i}`;
  const x = { id, teil: b.teil || null, serie: b.id };
  if (b.titel) x.titel = b.titel;
  setzen(x);
  neu.bloecke.push(x);
  const alt = `${b.id}@${datum}`;
  if (alt in ist) { ist[`${id}@${ziel.datum}`] = ist[alt]; delete ist[alt]; neu.ist = ist; }
  return { plan: neu, id };
}

/** Ein einzeln verschobenes Vorkommen zurück in seine Reihe (SP-0421, Silas, 19.10.: „wenn man auf dieses kleine
 *  Schildchen ‚nur diese Woche‘ rauftippt … zurücksetzen. Und dann wird das quasi wieder dahin zurückgeschoben, wo es
 *  ursprünglich war“): das Gegenstück zu einzelnVerschieben(). Der Datumsblock geht, die Reihe nimmt ihre Woche wieder
 *  (`ohne`), ein Eintrag im Lebenslauf zieht mit zurück. Liegt die Reihe inzwischen an einem anderen Wochentag, kommt
 *  das Vorkommen dorthin. Rein: { plan, ok } — ok false, wenn der Block keiner Reihe (mehr) gehört. */
export function einzelnZuruecksetzen(plan, blockId) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const bl = neu.bloecke || [];
  const b = bl.find((x) => x.id === blockId);
  const r = b && b.serie ? bl.find((x) => x.id === b.serie && !x.datum) : null;
  if (!r) return { plan: neu, ok: false };
  // Welche Woche die Reihe ausließ: die des Blocks — oder, wenn er seitdem in eine andere Woche gezogen wurde, die aus
  // seiner Id (einzelnVerschieben: <reihe>-JJJJMMTT).
  const ohne = r.ohne || [];
  const ausId = (blockId.slice(r.id.length).match(/^-(\d{4})(\d{2})(\d{2})/) || []).slice(1).join('-');
  const montag = ohne.includes(montagVon(b.datum)) ? montagVon(b.datum) : ohne.includes(ausId) ? ausId : montagVon(b.datum);
  r.ohne = ohne.filter((d) => d !== montag);
  if (!r.ohne.length) delete r.ohne;
  neu.bloecke = bl.filter((x) => x.id !== blockId);
  const alt = `${b.id}@${b.datum}`;
  if (neu.ist && alt in neu.ist) {
    const ist = { ...neu.ist };
    ist[`${r.id}@${plusTage(montag, TAGE.indexOf(r.tag))}`] = ist[alt]; delete ist[alt]; neu.ist = ist;
  }
  return { plan: neu, ok: true };
}

/** Der Termin einer anderen Gruppe, auf den ein Tausch zeigt (plan.tausch, SP-0421): { option, x } oder null. */
function tauschZiel(t, ts, sem) {
  const o = (t.optionen || []).find((y) => y.id === ts.option);
  if (!o) return null;
  for (const mu of muster(o)) for (const x of termineAus(mu, sem)) if (x.datum === ts.datum && hhmm(x.start) === ts.start) return { option: o, x };
  return null;
}

/** Wohin ein Termin einer gewählten Gruppe in seiner Woche ausweichen kann (SP-0421, Silas, 19.10.: „wenn ich auf
 *  Statistik 1 Tutorium am Montag raufklicke, dass dann in dunkelgrau alle anderen Termine diese Woche angezeigt werden,
 *  die es dazu noch gibt“): die Termine der anderen Gruppen von Montag bis Sonntag — und, ist das Vorkommen schon
 *  getauscht, sein ursprünglicher Platz (`zurueck`). Was das Element dort schon hat, und was ausfällt, nicht.
 *  Ergebnis: [{ teil, modul, option, label, datum, start, ende, ort, zurueck, trifft: [Vorkommen-Ids] }]. */
export function ausweichTermine(erg, vkId) {
  const v = erg.vorkommen.find((x) => x.id === vkId);
  const z = v && v.quelle === 'termin' && v.schicht === 'B' ? erg.teile.get(v.teil) : null;
  if (!z || !istWahl(z.teil)) return [];
  const von = montagVon(v.datum), bis = plusTage(von, 6);
  const eigen = v.tausch ? v.tausch.option : v.option;
  const da = new Set(z.vk.filter((x) => x.quelle === 'termin').map((x) => `${x.datum}@${x.start}`));
  const aus = [];
  for (const o of z.teil.optionen || []) {
    for (const mu of muster(o)) {
      for (const x of termineAus(mu, erg.sem)) {
        if (x.datum < von || x.datum > bis || da.has(`${x.datum}@${x.start}`)) continue;
        // Getauscht oder verlegt (SP-0423): Der eigene Platz steht als „zurück“ da.
        const her = v.tausch || v.verlegt;
        const zurueck = !!her && o.id === eigen && x.datum === her.datum && x.start === her.start;
        if (o.id === eigen && !zurueck) continue;
        const ort = x.ort || o.ort || z.teil.ort || null;
        if (istGeschlossen(erg.sem, x.datum) && !nurOnline(ort)) continue;
        const trifft = erg.vorkommen.filter((y) => y.hart && y.id !== v.id && y.datum === x.datum && !y.ganztag && y.start != null && y.start < x.ende && x.start < y.ende).map((y) => y.id);
        aus.push({ teil: z.teil.id, modul: z.modul.id, option: o.id, label: o.label, datum: x.datum, start: x.start, ende: x.ende, ort, zurueck, trifft });
      }
    }
  }
  return aus.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.start - b.start));
}

/** Ein Vorkommen einer gewählten Gruppe nur in dieser Woche zu einer anderen Gruppe legen (SP-0421) — oder mit
 *  ziel null zurück an seinen Platz. `von` ist die Id des ursprünglichen Vorkommens (der gewählten Gruppe), `ziel`
 *  { option, datum, start: "HH:MM" }. Ein Eintrag im Lebenslauf zieht mit, wie beim einzelnen Verschieben eines Blocks.
 *  Rein: der neue Plan. */
export function tauschen(plan, teil, von, ziel) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const t = { ...(neu.tausch || {}) }, vl = { ...(neu.verlegt || {}) };
  const jetzt = vl[von] ? `${teil}@${vl[von].datum}@${vl[von].start}` : t[von] ? `${teil}@${t[von].datum}@${t[von].start}` : von;
  const dann = ziel ? `${teil}@${ziel.datum}@${ziel.start}` : von;
  if (ziel) t[von] = { option: ziel.option, datum: ziel.datum, start: ziel.start }; else delete t[von];
  // Ein verlegter Termin (SP-0423) ist danach getauscht oder wieder an seinem Platz — nie beides.
  delete vl[von];
  if (Object.keys(t).length) neu.tausch = t; else delete neu.tausch;
  if (Object.keys(vl).length) neu.verlegt = vl; else delete neu.verlegt;
  if (neu.ist && jetzt in neu.ist && jetzt !== dann) {
    const ist = { ...neu.ist };
    ist[dann] = ist[jetzt]; delete ist[jetzt]; neu.ist = ist;
  }
  return neu;
}

/** Ein Eintrag in plan.verlegt (SP-0423), der sich rechnen lässt: { datum, start: "HH:MM", ende: "HH:MM" }. */
function verlegtGueltig(vl) {
  const zeit = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
  return !!vl && istDatum(vl.datum) && zeit(vl.start) && zeit(vl.ende) && min(vl.start) < min(vl.ende);
}

/** Einen Termin nur in dieser Woche an einen anderen Platz legen (SP-0423, Silas, 21.10.: „dass man einen
 *  Präsenztermin in der Wochenansicht für eine bestimmte Woche auch verschieben kann“) — oder mit ziel null, oder dem
 *  ursprünglichen Platz als Ziel, zurück. `von` ist die Id des ursprünglichen Vorkommens (`v.verlegt.von`,
 *  `v.tausch.von` oder `v.id`), `ziel` { datum, start: "HH:MM", ende: "HH:MM" }. Ein Tausch derselben Woche (SP-0421)
 *  weicht. Ein Eintrag im Lebenslauf zieht mit, auch „fällt aus“ (ausfallen() nimmt es weg). Rein: der neue Plan. */
export function verlegen(plan, von, ziel) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const teil = von.split('@')[0];
  const vl = { ...(neu.verlegt || {}) }, ts = { ...(neu.tausch || {}) };
  const jetzt = vl[von] ? `${teil}@${vl[von].datum}@${vl[von].start}` : ts[von] ? `${teil}@${ts[von].datum}@${ts[von].start}` : von;
  const dann = ziel ? `${teil}@${ziel.datum}@${ziel.start}` : von;
  if (ziel && dann !== von) vl[von] = { datum: ziel.datum, start: ziel.start, ende: ziel.ende }; else delete vl[von];
  delete ts[von];
  if (Object.keys(vl).length) neu.verlegt = vl; else delete neu.verlegt;
  if (Object.keys(ts).length) neu.tausch = ts; else delete neu.tausch;
  if (neu.ist && jetzt in neu.ist && jetzt !== dann) {
    const ist = { ...neu.ist };
    ist[dann] = ist[jetzt]; delete ist[jetzt]; neu.ist = ist;
  }
  return neu;
}

/** Fällt aus, nur in dieser Woche (SP-0423, Silas, 21.10.: „wenn man das, was man grad verschiebt, dorthin schiebt und
 *  loslässt, dann wird die Veranstaltung in der Woche als ‚Fällt aus‘ rot markiert“): der Lebenslauf eines Termins,
 *  `{ s: 'ausgefallen' }` (mit Grund, wenn einer genannt ist) — derselbe Eintrag wie „… ausgefallen“ in der Ist-Karte
 *  (V-0357), nur auch vorab. Er zählt nicht, sperrt nichts und fehlt im Kalender-Abo. Mit an false findet der Termin
 *  doch statt: Ein „ausgefallen“ geht, jeder andere Eintrag bleibt. Rein: der neue Plan. */
export function ausfallen(plan, vkId, an = true, grund = null) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const ist = { ...(neu.ist || {}) };
  if (an) ist[vkId] = grund ? { s: 'ausgefallen', grund } : { s: 'ausgefallen' };
  else if ((istEintrag(ist[vkId]) || {}).s === 'ausgefallen') delete ist[vkId];
  if (Object.keys(ist).length) neu.ist = ist; else delete neu.ist;
  return neu;
}

/** Was in einem Teil nur in einer Woche gilt (SP-0421, SP-0423): die Täusche und die verlegten Termine. Beide hängen an
 *  den Terminen der gewählten Gruppe; wer umwählt, verliert sie. */
export function nurDieseWocheVon(plan, teil) {
  const von = (x) => Object.keys((plan && plan[x]) || {}).filter((id) => id.startsWith(`${teil}@`));
  return { tausch: von('tausch'), verlegt: von('verlegt') };
}


/** Einen Block löschen — eine Reihe mit allem, was einzeln aus ihr verschoben wurde (`serie`, SP-0414): Es sind ihre
 *  Vorkommen, nur an anderer Stelle. */
export function blockLoeschen(plan, blockId) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  neu.bloecke = (neu.bloecke || []).filter((x) => x.id !== blockId && x.serie !== blockId);
  return neu;
}

/** Was einen neuen oder verschobenen Block verbietet (V-0333): Gesperrt ist, was im Raster als Termin steht — in der
 *  Standardwoche die wiederkehrenden Termine, an einem Datum die Termine und Prüfungen dieses Tages (ausgefallene nicht).
 *  entwurf: { tag (0 = Mo), datum?, start, ende (Minuten), woechentlich }. Ergebnis: die Namen dessen, was im Weg ist. */
export function gesperrtDurch(angebot, plan, erg, { tag, datum = null, start, ende, woechentlich }) {
  const trifft = (s, e) => s < ende && start < e;
  const kurzVon = (id) => { const m = (angebot.module || []).find((x) => x.id === id); return m ? kurz(m) : ''; };
  const aus = [];
  if (woechentlich) {
    for (const k of standardwoche(angebot, plan, erg)) {
      if (k.art !== 'termin' || k.tag !== tag || !trifft(k.start, k.ende)) continue;
      aus.push(`${kurzVon(k.modul)} · ${erg.teile.get(k.teil).teil.titel}`);
    }
  }
  if (datum) {
    for (const v of erg.vorkommen) {
      if (!v.hart || v.datum !== datum || v.ganztag || v.start == null || !trifft(v.start, v.ende)) continue;
      aus.push(v.quelle === 'termin' ? `${kurzVon(v.modul)} · ${erg.teile.get(v.teil).teil.titel}` : [kurzVon(v.modul), v.titel].filter(Boolean).join(' · '));
    }
  }
  return [...new Set(aus)];
}

/** Die Vorgabe je Woche (V-0335, seit V-0349 aus dem Kontingent): Videos EIN Block je Woche, so lang, dass er die
 *  Einheiten deckt; Selbststudium Blöcke von evl_min_min bis evl_block_min (1,5–2 h), k je Woche oder einer alle n
 *  Wochen — was dem Kontingent im Fenster am nächsten kommt. Seltener als jede zweite Woche, oder ein einmaliger Posten
 *  (BuK-Literatur 5 h): `einzeln` — so viele Blöcke dieser Länge, je einer an einem Tag in einer echten Woche.
 *  Ergebnis: { dauer_min, anzahl, alle, wochen, summe_min, soll_min, bis, ab, einzeln } oder null (Präsenz, Prüfungs-
 *  Topf, kein Kontingent — oder das Fenster wartet noch: Übungs-Nachbereitung ohne Übungstermin). */
export function vorgabe(erg, teilId) {
  const z = erg.teile.get(teilId);
  if (!z || z.topf === 'pruefung' || !(z.kontingent_min > 0) || !['video', 'selbst'].includes(z.teil.art) || z.wartet) return null;
  const r = erg.regeln;
  const alleWochen = erg.wochen.filter((w) => w.art === 'vorlesung');
  const erstes = z.gruppen && z.gruppen.length ? z.gruppen[0].ab : z.fenster && z.fenster.ab ? z.fenster.ab : z.stoff_ab;
  const ab = erstes && alleWochen.length && erstes > alleWochen[0].von ? erstes : null;
  const vlWochen = ab ? alleWochen.filter((w) => w.bis >= ab) : alleWochen;
  const vl = vlWochen.length || 15;
  const soll = z.kontingent_min;
  if (z.teil.art === 'video') {
    const dauer = Math.max(r.raster_min, aufRaster(soll / vl, r.raster_min));
    return { dauer_min: dauer, anzahl: 1, alle: 1, wochen: vl, summe_min: dauer * vl, soll_min: soll, video_min: z.video_bedarf_min || null, bis: null, ab };
  }
  let beste = null;
  for (let L = r.evl_block_min; L >= r.evl_min_min; L -= 15) {
    for (let k = 1; k <= 4; k++) {
      for (let alle = 1; alle <= (k === 1 ? 8 : 1); alle++) {
        const moeglich = Math.ceil(vl / alle);
        for (const wochen_ of [moeglich, moeglich - 1]) {
          if (wochen_ < 1) continue;
          const summe = k * L * wochen_;
          const abstand = Math.abs(summe - soll);
          if (!beste || abstand < beste.abstand - 1) {
            beste = { dauer_min: L, anzahl: k, alle, wochen: wochen_, summe_min: summe, soll_min: soll, abstand,
              bis: wochen_ < moeglich ? vlWochen[(wochen_ - 1) * alle].bis : null, ab };
          }
        }
      }
    }
  }
  delete beste.abstand;
  // Seltener als jede zweite Woche ist kein Wochenmuster (V-0345, Silas: „alles, was weniger häufig als jede zweite
  // Woche stattfindet, das soll man dann manuell in die echten Wochen reinlegen“) — ein einmaliger Posten auch nicht.
  if (beste.alle > 2 || z.einzeln) {
    const n = Math.max(1, Math.round(soll / beste.dauer_min));
    Object.assign(beste, { einzeln: true, anzahl: 1, alle: 1, bis: null, wochen: z.einzeln ? n : beste.wochen, summe_min: z.einzeln ? n * beste.dauer_min : beste.summe_min });
    return beste;
  }
  // Vor- und Nachbereitung und Quizze in halben Blöcken (V-0356, Silas, 12.10.: „dass man eine Stunde als Vorbereitung,
  // eine Stunde als Nachbereitung nach jedem Screencast eintragen kann … alles, was jetzt zwei Stunden ist, auf eine Stunde
  // runtersetzt und dafür doppelte Anzahl. Und gleiches für ISIS-Quiz“; EINFWI 1,5 h → „45-Minuten-Blöcke“; BuK „zweimal
  // 1,5 Stunden ist auch gut“): Ein einzelner Block je Takt wird halbiert — alle zwei Wochen wird jede Woche, jede Woche
  // zweimal. Labs und Aufgaben (kategorie aufgaben) und was schon mehrere Blöcke hat, bleiben.
  if (beste.anzahl === 1 && kategorie(z.teil) === 'lernen' && beste.dauer_min / 2 >= r.lern_min_min) {
    // Auf Viertelstunden wie das Ziehen (1,5 h → 45 min); bei 1:45 h die Hälfte, die dem Kontingent näher kommt.
    const roh = beste.dauer_min / 2;
    const zwei = beste.alle % 2 === 0 ? 1 : 2;
    const wochenNeu = beste.alle % 2 === 0 ? Math.ceil(vlWochen.length / (beste.alle / 2)) : beste.wochen;
    const halb = [Math.floor(roh / 15) * 15, Math.ceil(roh / 15) * 15].filter((x) => x >= r.lern_min_min)
      .sort((x, y) => Math.abs(zwei * x * wochenNeu - soll) - Math.abs(zwei * y * wochenNeu - soll) || y - x)[0] || r.lern_min_min;
    if (beste.alle % 2 === 0) {
      beste.alle /= 2;
      const moeglich = Math.ceil(vlWochen.length / beste.alle);
      beste.wochen = beste.bis ? Math.min(moeglich, beste.wochen * 2) : moeglich;
      beste.bis = beste.wochen < moeglich ? vlWochen[(beste.wochen - 1) * beste.alle].bis : null;
    } else beste.anzahl = 2;
    beste.dauer_min = halb;
    beste.summe_min = beste.anzahl * halb * beste.wochen;
  }
  return beste;
}

/** Wo ein einzelner Block liegen darf (V-0345): mit Einheiten (Quiz, Abgabe, „Vorbereitung auf …“) die Tage, an denen
 *  eine offen ist — von ihrer Freigabe bis zu ihrer Frist —, sonst jeder Tag der Vorlesungszeit ab dem ersten Stoff. */
export function blockTagErlaubt(erg, teilId) {
  const z = erg.teile.get(teilId);
  if (!z) return () => false;
  const sem = erg.sem;
  const ab = (z.fenster && z.fenster.ab) || z.stoff_ab || sem.vorlesung.von;
  if (z.gruppen && z.gruppen.length) {
    const fenster = z.gruppen.map((g, i) => [g.ab, g.bis || (z.gruppen[i + 1] ? plusTage(z.gruppen[i + 1].ab, -1) : sem.vorlesung.bis)]);
    return (d) => fenster.some(([a, b]) => d >= a && d <= b);
  }
  return (d) => d >= ab && d <= sem.vorlesung.bis && !istFrei(sem, d);
}

/** Ab wie vielen Terminen eine Reihe regelmäßig ist: mindestens jede zweite Vorlesungswoche (V-0354, wie bei den Blöcken
 *  V-0345). Bei 16 Vorlesungswochen 8. */
export const regelmaessigAb = (erg) => Math.ceil(erg.wochen.filter((w) => w.art === 'vorlesung').length / 2);

/** Unregelmäßiges unter „Prüfungen“ (V-0354, Silas: „Alles, was Vorbereitung zu Prüfung, Quiz, Test, Online-Test etc. ist,
 *  kommt zum Prüfungs-Tab und wird an ein Prüfungsdatum gekoppelt. Ist das schon bekannt, kann man Lerneinheiten schon
 *  planen; wenn das nicht bekannt ist, soll das als offen dastehen“). Je Element (z.unregel, rechnen() 7b) seine
 *  Bezugstermine als Einheiten mit Fenster ab–bis und Ziel (der Termin, auf den es sich bezieht):
 *   - Einheiten mit Daten (Quicktests mit Öffnen/Schließen, „Vorbereitung auf …“ je Übung): bekannt;
 *   - Einheiten ohne Daten (`einheiten.anzahl`, die Zeiten fehlen noch): offen (bekannt: false) — eine Folgeentscheidung;
 *   - ein einmaliger Posten ohne Termin (BuK-Literatur): ein Fenster über die Vorlesungszeit.
 *  Die Blöcke gehen der Reihe nach in das früheste Fenster, das ihren Tag enthält und noch Zeit braucht. */
export function unregelmaessige(erg) {
  const aus = [];
  const sem = erg.sem;
  for (const z of erg.teile.values()) {
    if (!z.unregel) continue;
    const t = z.teil;
    const vg = vorgabe(erg, t.id);
    const dauer = (t.einheiten && Number.isFinite(t.einheiten.dauer_min) && t.einheiten.dauer_min) || (vg && vg.dauer_min) || erg.regeln.evl_block_min;
    let einh;
    if (z.einheiten && z.einheiten.length) {
      const l = [...z.einheiten].sort((a, b) => (a.ab < b.ab ? -1 : 1));
      einh = l.map((e, i) => ({
        nr: e.nr, titel: e.titel, ab: e.ab, bis: e.bis || (l[i + 1] ? plusTage(l[i + 1].ab, -1) : sem.vorlesung.bis),
        ziel: e.bis || null, auf: e.auf || null, bekannt: true, soll_min: dauer, unsicher: e.unsicher || null,
      }));
    } else if (t.einheiten && t.einheiten.anzahl > 0) {
      einh = Array.from({ length: t.einheiten.anzahl }, (_, i) => ({ nr: i + 1, titel: null, ab: null, bis: null, ziel: null, bekannt: false, soll_min: dauer }));
    } else {
      const ab = (z.fenster && z.fenster.ab) || z.stoff_ab || sem.vorlesung.von;
      einh = [{ nr: 1, titel: null, ab, bis: (z.fenster && z.fenster.bis) || sem.vorlesung.bis, ziel: null, bekannt: !z.wartet, frei: true, soll_min: z.kontingent_min }];
    }
    for (const e of einh) { e.plan_min = 0; e.erledigt_min = 0; e.bloecke = []; }
    const bloecke = z.vk.filter((v) => v.quelle === 'block').sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.start - b.start));
    for (const v of bloecke) {
      const passt = einh.filter((e) => e.bekannt && e.ab <= v.datum && v.datum <= e.bis);
      const e = passt.find((x) => x.plan_min < x.soll_min) || passt[passt.length - 1];
      if (!e) continue;
      e.plan_min += v.plan_min ?? v.zaehlt_min; e.erledigt_min += v.erledigt_min || 0; e.bloecke.push(v);
    }
    for (const e of einh) e.fertig = e.bekannt && e.plan_min >= e.soll_min - toleranz(e.soll_min, { ...erg.regeln, toleranz_mind_min: 0 });
    const bekannt = einh.filter((e) => e.bekannt);
    aus.push({
      id: `u:${t.id}`, z, modul: z.modul, teil: t, einheiten: einh, dauer_min: dauer, einmalig: einh.length === 1 && !!einh[0].frei,
      bekannt: bekannt.length, fertig: bekannt.filter((e) => e.fertig).length, kontingent_min: z.kontingent_min,
      plan_min: z.plan_min, erledigt_min: z.erledigt_min, info: z.info || null,
      naechstes: bekannt.find((e) => !e.fertig && (!erg.heute || e.bis >= erg.heute)) || null,
    });
  }
  return aus.sort((a, b) => ((a.naechstes && a.naechstes.ab) || '9') < ((b.naechstes && b.naechstes.ab) || '9') ? -1 : 1);
}

/** Was an einem Element verpasst ist (V-0357, Silas, 12.10.: „in der Progress Bar von Statistik 1 soll genau der Anteil,
 *  den ich nicht gemacht habe, als rot markiert dort auftauchen … wenn ich eine Präsenzvorlesung auf nicht gemacht geklickt
 *  habe, soll die schwarz markiert sein, weil die kann man nicht einfach nachholen … bzw. ein dritter Button ‚ausgefallen‘,
 *  und da muss man einen Grund hinschreiben“). Je Vorkommen mit Eintrag: art
 *   - nachholen: ein Block oder Video ✗ (oder der fehlende Teil von „teilweise“) — die Zeit fehlt noch (rot), bis „nachgeholt“;
 *   - verpasst:  ein Präsenztermin ✗ — vorbei, nicht nachzuholen (schwarz); den Stoff meldet „Nacharbeit“ (Testfall 16);
 *   - ausgefallen: ein Termin, der nicht stattfand (gemeldet, mit Grund) — kein Verlust, nur zur Liste.
 *  Ergebnis nach Datum: [{ v, art, min, nachgeholt, grund }]. */
export function verpasst(erg, z) {
  const ist = (erg.plan && erg.plan.ist) || {};
  const aus = [];
  // Ein Video oder Quiz holt der nächste Block von selbst nach (die Zuordnung, rechnen() 6): Ist alles, was bis zum Tag
  // des ✗ erschienen war, inzwischen gedeckt, ist es nachgeholt — ohne Klick.
  const gedecktBis = (d) => !!z.gruppen && z.gruppen.filter((g) => g.bedarf_min && g.ab <= d).every((g) => g.belegt_min >= g.bedarf_min - 15);
  for (const v of z.vk) {
    if (v.quelle !== 'termin' && v.quelle !== 'block') continue;
    const e = istEintrag(ist[v.id]);
    const dauer = v.quelle === 'termin' ? zaehltMin(v.start, v.ende, v.ct) : v.zaehlt_min || 0;
    if (v.ausgefallen === 'gemeldet') { aus.push({ v, art: 'ausgefallen', min: dauer, nachgeholt: false, grund: (e && e.grund) || null }); continue; }
    if (!e) continue;
    if (e.s === 'nein') aus.push({ v, art: v.quelle === 'termin' ? 'verpasst' : 'nachholen', min: dauer, nachgeholt: !!e.nachgeholt || (v.quelle === 'block' && z.el === 'einheiten' && gedecktBis(v.datum)), grund: e.grund || null });
    else if (e.s === 'teil' && v.quelle === 'block') {
      const rest = Math.max(0, dauer - (v.erledigt_min || 0));
      if (rest >= 15) aus.push({ v, art: 'nachholen', min: rest, nachgeholt: !!e.nachgeholt, teil: true, grund: null });
    }
  }
  return aus.sort((a, b) => (a.v.datum < b.v.datum ? -1 : a.v.datum > b.v.datum ? 1 : a.v.start - b.v.start));
}

/** Der Fortschritt eines Elements (V-0354, Silas: „Grün = geplant, Grau = nicht geplant, weil nicht bekannt, Gelb = nicht
 *  geplant, obwohl bekannt“), in Minuten seines Kontingents: { k, gruen, gelb, grau, status } mit status fertig (alles
 *  grün), unbekannt (nichts gelb, aber grau — „alles, was ich jetzt wählen kann, ist gewählt, es kommt noch was“) oder offen.
 *  Präsenz: fest oder gewählt (auch als Wunsch vor der Zuteilung) ist grün, Gruppen ohne Termine grau, eine offene Wahl
 *  gelb. Selbststudium und Videos: gelegt grün — innerhalb der Toleranz oder mit allen Wochenblöcken der Vorgabe ganz —,
 *  der Rest gelb; ein wartendes Fenster grau. Unregelmäßiges je Bezugstermin, offene Termine grau. Prüfungsvorbereitung:
 *  ohne Prüfungstermin grau. */
export function fortschritt(erg, z, uListe = null) {
  const f = fortschrittRoh(erg, z, uListe);
  // Verpasstes (V-0357): Was ✗ ist, steht nicht mehr im Plan — es kommt als „geplant“ zurück (der Balken bleibt so lang,
  // wie er war, Silas: „die Gesamtbar soll sich nicht ändern, es soll nur das Rote dazukommen“), und daraus wird rot,
  // was nachzuholen ist, und schwarz, was als Präsenz verpasst ist. Der Status bleibt (gelb/grau entscheiden ihn).
  const vp = verpasst(erg, z);
  const nach = vp.filter((x) => x.art === 'nachholen').reduce((s, x) => s + x.min, 0);
  const offen = vp.filter((x) => x.art === 'nachholen' && !x.nachgeholt).reduce((s, x) => s + x.min, 0);
  const schwarz = vp.filter((x) => x.art === 'verpasst').reduce((s, x) => s + x.min, 0);
  const zurueck = Math.min(f.gelb, nach);
  f.gruen += zurueck; f.gelb -= zurueck;
  f.rot = Math.min(f.gruen, offen); f.gruen -= f.rot;
  f.schwarz = Math.min(f.gruen, schwarz); f.gruen -= f.schwarz;
  f.status = f.gelb > 0 ? 'offen' : f.grau > 0 ? 'unbekannt' : 'fertig';
  return f;
}
function fortschrittRoh(erg, z, uListe) {
  const t = z.teil;
  const k = Math.max(0, z.kontingent_min || (z.P && z.P.K ? Math.round(z.P.K / Math.max(1, z.P.elemente.length)) : 0) || 60);
  const voll = (art) => ({ k, gruen: art === 'gruen' ? k : 0, gelb: art === 'gelb' ? k : 0, grau: art === 'grau' ? k : 0, status: art === 'gruen' ? 'fertig' : art === 'grau' ? 'unbekannt' : 'offen' });
  const teils = (gruen, grau = 0) => {
    const g = Math.max(0, Math.min(k, Math.round(gruen))), gr = Math.max(0, Math.min(k - g, Math.round(grau)));
    const gelb = k - g - gr;
    return { k, gruen: g, gelb, grau: gr, status: gelb > 0 ? 'offen' : gr > 0 ? 'unbekannt' : 'fertig' };
  };
  if (t.art === 'praesenz') {
    if (z.alternativen === 'info_fehlt') return voll('grau');
    if (z.alternativen === 'fest' || z.alternativen === 'gewaehlt' || z.alternativen === 'zuteilung_offen') return voll('gruen');
    const gew = (t.optionen || []).some((o) => o.id === (erg.plan.wahl || {})[t.id]);
    return voll(gew && z.alternativen !== 'gescheitert' && z.alternativen !== 'frist_vorbei' ? 'gruen' : 'gelb');
  }
  if (t.art === 'pruefung') {
    const X = erg.pruefungen.get(t.pruefung);
    if (!X || !X.termin) return voll('grau');
    return teils(z.plan_min >= k - toleranz(k, erg.regeln) ? k : z.plan_min);
  }
  if (z.unregel) {
    const U = (uListe || unregelmaessige(erg)).find((x) => x.z === z);
    if (!U) return voll('grau');
    const soll = U.einheiten.reduce((s, e) => s + e.soll_min, 0) || 1;
    const gruen = U.einheiten.reduce((s, e) => s + (e.fertig ? e.soll_min : Math.min(e.soll_min, e.plan_min)), 0);
    const grau = U.einheiten.filter((e) => !e.bekannt).reduce((s, e) => s + e.soll_min, 0);
    return teils((gruen / soll) * k, (grau / soll) * k);
  }
  if (z.wartet) return voll('grau');
  // Videos und Quizze mit Dauer: fertig, wenn ihre Einheiten gedeckt sind — nicht, wenn die Blöcke im Mittel lang genug
  // sind (V-0357: STAT1-Videos 31–34 hatten nie einen Block, und der Balken war grün).
  if (z.el === 'einheiten' && z.gruppen && z.gruppen.some((g) => g.bedarf_min)) {
    const ungedeckt = z.gruppen.reduce((s, g) => s + (g.bedarf_min ? Math.max(0, g.bedarf_min - g.belegt_min) : 0), 0);
    return teils(ungedeckt <= toleranz(k, erg.regeln) ? k : k - ungedeckt);
  }
  // Fertig auch, wenn die Wochenblöcke so lang sind, wie die Vorgabe will (je Woche gemittelt) — ein Teil davon zählt
  // vielleicht nicht (vor dem ersten Stoff, auf einem Termin), aber mehr zu legen gibt es nicht.
  const vg = vorgabe(erg, t.id);
  const proWoche = (erg.plan.bloecke || []).filter((b) => b.teil === t.id && !b.datum).reduce((s, b) => s + (min(b.ende) - min(b.start)) / Math.max(1, b.alle || 1), 0);
  const fertig = z.fehlt_min <= toleranz(k, erg.regeln) || (vg && !vg.einzeln && proWoche >= (vg.anzahl * vg.dauer_min) / vg.alle - erg.regeln.raster_min);
  return teils(fertig ? k : z.plan_min);
}

/** Der Fortschritt einer Menge von Elementen (ein Modul in einem Schritt, ein Schritt, ein ganzes Modul): Summe der
 *  Minuten, Anteil grün, und die Elemente je Status. */
export function fortschrittVon(erg, zs, uListe = null) {
  const u = uListe || (zs.some((z) => z.unregel) ? unregelmaessige(erg) : []);
  const je = zs.map((z) => ({ z, f: fortschritt(erg, z, u) }));
  const s = { k: 0, gruen: 0, gelb: 0, grau: 0, rot: 0, schwarz: 0 };
  for (const { f } of je) { s.k += f.k; s.gruen += f.gruen; s.gelb += f.gelb; s.grau += f.grau; s.rot += f.rot || 0; s.schwarz += f.schwarz || 0; }
  s.anteil = s.k ? (s.gruen + s.rot + s.schwarz) / s.k : 1;
  s.status = s.gelb > 0 ? 'offen' : s.grau > 0 ? 'unbekannt' : 'fertig';
  s.je = je;
  return s;
}

/** Der Vollzug eines Elements (SP-0419, Silas, 17.10.: „wenn der Stundenplaner fertig ist, dann soll es die Progress Bar
 *  sein … wie viel hast du gemacht von dem, was da ist, und wie viel kommt noch … 100 % in grün wäre, man hat alles
 *  gemacht … eine rote Bar für das, wo man es nicht gemacht hat und was noch offen ist. Und bei dieser Woche genau die
 *  gleiche Logik, nur eben für diese Woche, und da in Rot, wie viel Prozent noch fehlen, welche noch nicht verplant
 *  sind“). Der Fortschritt oben misst weiter die Planung; das hier misst, was davon getan ist. In Minuten:
 *   - gruen:  erledigt (✓, „teilweise“ mit seinen Minuten, ein ✗ mit „Nachgeholt“ von Hand);
 *   - rot:    nicht gemacht und nachzuholen (✗ an Block oder Video, der Rest von „teilweise“), bis „Nachgeholt“;
 *   - schwarz: Präsenz verpasst (nicht nachzuholen, wie im Fortschritt);
 *   - unbest: vorbei, aber noch ohne ✓ oder ✗ (G6: unbestätigt ist nicht erledigt);
 *   - kommt:  was noch kommt — im Semester alles Übrige, in der Woche das Geplante, das noch nicht vorbei ist;
 *   - ungeplant: nur in der Woche — was dran wäre (wochenBedarf), aber noch keinen Block hat.
 *  Ohne Woche ist k das Kontingent; mit Woche (w, b = sein Eintrag aus wochenBedarf) das Größere aus „dran“ und dem,
 *  was in der Woche liegt. Erledigt bis auf die Toleranz und sonst nichts mehr offen heißt fertig (100 %). */
export function vollzug(erg, z, w = null, b = null) {
  const ist = (erg.plan && erg.plan.ist) || {};
  const inW = (d) => !w || (d >= w.von && d <= w.bis);
  const s = { gruen: 0, rot: 0, schwarz: 0, unbest: 0, kommt: 0, ungeplant: 0 };
  for (const v of z.vk) {
    if ((v.quelle !== 'termin' && v.quelle !== 'block') || v.ausgefallen || !inW(v.datum)) continue;
    s.gruen += v.erledigt_min || 0;
    if (v.ist === 'offen') s.unbest += v.plan_min || 0;
    else if (w && !v.ist && !v.vergangen) s.kommt += v.plan_min || 0;
  }
  for (const x of verpasst(erg, z)) {
    if (!inW(x.v.datum)) continue;
    if (x.art === 'verpasst') s.schwarz += x.min;
    else if (x.art === 'nachholen' && !x.nachgeholt) s.rot += x.min;
    // „Nachgeholt“ von Hand ist getan; deckt es ein späterer Block von selbst (Videos), zählt dessen ✓.
    else if (x.art === 'nachholen' && (istEintrag(ist[x.v.id]) || {}).nachgeholt) s.gruen += x.min;
  }
  let k;
  if (!w) {
    k = Math.max(0, z.kontingent_min || (z.P && z.P.K ? Math.round(z.P.K / Math.max(1, z.P.elemente.length)) : 0) || 60);
    s.gruen = Math.min(k, s.gruen);
    s.rot = Math.min(k - s.gruen, s.rot);
    s.schwarz = Math.min(k - s.gruen - s.rot, s.schwarz);
    s.unbest = Math.min(k - s.gruen - s.rot - s.schwarz, s.unbest);
    s.kommt = k - s.gruen - s.rot - s.schwarz - s.unbest;
    // Bis auf die Toleranz erledigt und nichts mehr offen oder geplant: fertig (eine Stunde unter dem Kontingent ist kein Rest).
    if (!s.rot && !s.unbest && s.kommt <= toleranz(k, erg.regeln) && !z.vk.some((v) => (v.quelle === 'termin' || v.quelle === 'block') && !v.ausgefallen && !v.ist && !v.vergangen && (v.plan_min || 0) > 0)) {
      s.gruen += s.kommt; s.kommt = 0;
    }
  } else {
    const belegt = s.gruen + s.rot + s.schwarz + s.unbest + s.kommt;
    // Noch nicht verplant ist nur, was der Wochenbedarf „planen“ nennt — nicht, was auf eine Info oder eine Übung wartet —,
    // und erst jenseits derselben kleinen Toleranz wie dort (ein ✗ nimmt den Block aus dem Plan, er steht hier rot).
    const fehlt = b && b.grund === 'planen' ? Math.max(0, b.soll_min - belegt) : 0;
    s.ungeplant = fehlt >= Math.max(30, Math.round(b ? b.soll_min * 0.1 : 0)) ? fehlt : 0;
    k = belegt + s.ungeplant;
  }
  s.k = k;
  s.anteil = k ? s.gruen / k : 1;
  s.status = s.gruen >= k ? 'fertig' : 'laeuft';
  return s;
}

/** Der Vollzug einer Menge von Elementen (ein Modul): Summe der Minuten. wb: Map Teil-Id → Eintrag aus wochenBedarf. */
export function vollzugVon(erg, zs, w = null, wb = null) {
  const s = { k: 0, gruen: 0, rot: 0, schwarz: 0, unbest: 0, kommt: 0, ungeplant: 0 };
  for (const z of zs) {
    const f = vollzug(erg, z, w, wb ? wb.get(z.teil.id) : null);
    for (const x of Object.keys(s)) s[x] += f[x];
  }
  s.anteil = s.k ? s.gruen / s.k : 1;
  s.status = s.gruen >= s.k ? 'fertig' : 'laeuft';
  return s;
}

/** Die Fahrzeit eines Tages (V-0338): vor dem frühesten und nach dem spätesten Termin vor Ort — Online-Termine zählen
 *  nicht. termine: [{start, ende, ort?, online?}] eines Tages. Ergebnis: [[start, ende] davor, [start, ende] danach].
 *  Sie überdeckt nichts (SP-0418, Silas: „die überschneiden sich manchmal mit irgendwelchen Modulkacheln, aber das geht
 *  ja nicht“): belegt sind alle Kacheln des Tages; liegt dort etwas, rückt die Hinfahrt früher und die Rückfahrt später,
 *  in die nächste Lücke. fest: {hin, zurueck} (Minuten), wohin Silas sie für diesen Tag gezogen hat (plan.fahrt) — die
 *  Hinfahrt endet trotzdem spätestens beim ersten Termin, die Rückfahrt beginnt frühestens nach dem letzten. */
export function fahrzeiten(termine, regeln = REGELN, belegt = [], fest = {}) {
  const da = termine.filter(vorOrt);
  if (!da.length) return [];
  const p = regeln.pendeln_min;
  const a = Math.min(...da.map((t) => t.start)), b = Math.max(...da.map((t) => t.ende));
  const ziel = (x, sonst) => (Number.isFinite(x) ? x : sonst);
  const hin = naechsterPlatz(belegt, p, 0, a, ziel(fest && fest.hin, a - p)) ?? a - p;
  const zurueck = naechsterPlatz(belegt, p, b, 24 * 60, ziel(fest && fest.zurueck, b)) ?? b;
  return [[hin, hin + p], [zurueck, zurueck + p]];
}

/** Die Mittagspause eines Tages (SP-0418, Silas: „im besten Fall 30 Minuten … 12 Uhr die optimale Uhrzeit und je näher
 *  an 12 …, desto besser … nicht vor 11 … nicht nach 15 Uhr“): mittag_min am nächsten an mittag_ziel im mittag_fenster,
 *  ohne etwas zu überdecken (Kacheln und Fahrzeit). Passt sie nirgends ganz, die größte Lücke darin (ab mittag_rest_min),
 *  bei gleicher Größe die nähere — kürzer als mittag_min, die Oberfläche sagt, wie viel Zeit bleibt. Ohne jede Lücke:
 *  null. fest: der Anfang, den Silas für diesen Tag gezogen hat (plan.mittag, Minuten) — er ersetzt 12 Uhr als Ziel. */
export function mittagspause(belegt, regeln = REGELN, fest = null) {
  const [von, bis] = regeln.mittag_fenster.map(min);
  const ziel = Number.isFinite(fest) ? fest : min(regeln.mittag_ziel);
  const s = naechsterPlatz(belegt, regeln.mittag_min, von, bis, ziel);
  if (s != null) return [s, s + regeln.mittag_min];
  const abstand = ([a, b]) => Math.abs(Math.max(a, Math.min(b, ziel)) - ziel);
  const luecken = freieFenster(belegt, regeln.mittag_rest_min, von, bis);
  return luecken.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]) || abstand(x) - abstand(y))[0] || null;
}

/** Wie voll ein Tag ist: alles, was im Kalender liegt (Termine als Doppelstunde, Blöcke, geltende Prüfungen). */
export function tagesLast(erg, datum) {
  let summe = 0;
  for (const v of erg.vorkommen) {
    if (v.datum !== datum || v.ganztag || v.start == null || v.ende == null || v.ausgefallen) continue;
    if (v.quelle === 'pruefung' && !v.wichtig) continue;
    if (v.quelle === 'block' && (v.ist === 'verschoben' || v.ist === 'nein')) continue;
    // Ein Block auf einem Termin zählt nur mit dem Teil, der frei ist (V-0357, wie last()).
    summe += v.quelle === 'termin' ? zaehltMin(v.start, v.ende, v.ct) : Math.max(0, v.ende - v.start - (v.quelle === 'block' ? v.ueberlappt || 0 : 0));
  }
  return summe;
}

// ── Sichten ──────────────────────────────────────────────────────────────────────────────────────

/** Was in einer Woche liegt, und wie viele Stunden das sind. */
export function woche(erg, wocheId) {
  const w = erg.wochen.find((x) => x.id === wocheId);
  const vk = erg.vorkommen.filter((v) => (v.datum >= w.von && v.datum <= w.bis) || (v.bis && v.datum < w.von && v.bis >= w.von));
  const proTag = Array(7).fill(0);
  let ects = 0, belegt = 0;
  for (const v of vk) {
    if (v.ganztag || v.start == null || v.ende == null || v.ausgefallen) continue;
    if (v.quelle === 'pruefung' && !v.wichtig) continue;
    if (v.quelle === 'block' && (v.ist === 'verschoben' || v.ist === 'nein')) continue;
    const d = wochentag(v.datum < w.von ? w.von : v.datum);
    const dauer = v.quelle === 'termin' ? zaehltMin(v.start, v.ende, v.ct) : Math.max(0, v.ende - v.start - (v.quelle === 'block' ? v.ueberlappt || 0 : 0));
    proTag[d] += dauer;
    belegt += dauer;
    ects += v.zaehlt_min;
  }
  return { woche: w, vorkommen: vk, proTag, belegt_min: belegt, ects_min: ects };
}

/** Was in einer Woche dran wäre und was davon im Plan ist — je Element (kontingent.mjs). Ohne wocheId die Standardwoche:
 *  dann ist „dran“ der Wochenwert und „im Plan“, was die Standardwoche je Woche trägt (ein Block alle 2 Wochen halb). */
export function wochenBedarf(angebot, plan, erg, wocheId = null) {
  let std = null;
  if (!wocheId) {
    std = new Map();
    for (const k of standardwoche(angebot, plan, erg)) {
      if (k.art !== 'block' || !k.teil) continue;
      const b = (plan.bloecke || []).find((x) => x.id === k.block);
      std.set(k.teil, (std.get(k.teil) || 0) + (k.ende - k.start) / Math.max(1, (b && b.alle) || 1));
    }
  }
  return bedarfJeWoche(erg, wocheId, std);
}

/** Der häufigste Wochentag und die Zeit eines Musters — wo eine Reihe in der Standardwoche steht. */
export function typischerPlatz(termine) {
  if (!termine.length) return null;
  const n = new Map();
  for (const x of termine) {
    const k = `${wochentag(x.datum)}|${x.start}|${x.ende}`;
    n.set(k, (n.get(k) || 0) + 1);
  }
  const [k] = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  const [tag, start, ende] = k.split('|').map(Number);
  return { tag, start, ende };
}

/** Die Standardwoche: was jede Woche wiederkehrt — Serien, gewählte Gruppen, Wochenblöcke —, und die Reihen an ihrem
 *  typischen Platz mit „nur 7×“. */
export function standardwoche(angebot, plan, erg) {
  const kacheln = [];
  const wahl = (plan && plan.wahl) || {};
  for (const { teil: t, modul: m } of teileVon(angebot)) {
    if (t.art !== 'praesenz') continue;
    const z = erg.teile.get(t.id);
    const quelle = istWahl(t) ? (t.optionen || []).find((o) => o.id === wahl[t.id]) : t;
    if (!quelle) continue;
    for (const mu of muster(quelle)) {
      // Ein Termin, der nur in einer Woche woanders liegt (SP-0421 getauscht, SP-0423 verlegt), gehört weiter zu seinem
      // Muster: Gezählt und eingeordnet wird er an seinem ursprünglichen Platz.
      const her = (v) => v.verlegt || v.tausch || v;
      const vk = z.vk.filter((v) => !v.ausgefallen && (mu.typ === 'serie'
        ? wochentag(her(v).datum) === TAGE.indexOf(mu.tag) && her(v).start === min(mu.start)
        : (mu.daten || []).some((x) => x.datum === her(v).datum)));
      // Ein, zwei Einzeltermine (der Kick-off) sind kein Wochenmuster: Sie stehen rechts und in der echten Woche. Eine
      // Reihe seltener als jede zweite Vorlesungswoche (BuK-VL 6×, EINFWI-Übung 5×) gehört nicht zum Gerüst (V-0354,
      // Silas: „In der Woche-Ansicht entsteht das Grundgerüst mit allen Terminen, die mindestens alle 2 Wochen regulär
      // stattfinden“) — sie steht als Umriss da (unregel), weil sie den Platz an ihren Tagen trotzdem sperrt.
      if (!vk.length || (mu.typ === 'reihe' && vk.length < 3)) continue;
      const unregel = mu.typ === 'reihe' && vk.length < regelmaessigAb(erg);
      const platz = mu.typ === 'serie' ? { tag: TAGE.indexOf(mu.tag), start: min(mu.start), ende: min(mu.ende) } : typischerPlatz(vk.map(her));
      kacheln.push({
        art: 'termin', schicht: istWahl(t) ? 'B' : 'A', teil: t.id, modul: m.id, option: quelle === t ? null : quelle.id,
        ...platz, ort: mu.ort || quelle.ort || t.ort || null, reihe: mu.typ === 'reihe', anzahl: vk.length, vk,
        unsicher: !!t.unsicher, annahme: vk.some((v) => v.annahme), unregel,
      });
    }
  }
  for (const b of (plan && plan.bloecke) || []) {
    if (b.datum) continue;
    const vk = erg.vorkommen.filter((v) => v.block === b.id);
    const z = b.teil ? erg.teile.get(b.teil) : null;
    kacheln.push({ art: 'block', schicht: 'D', block: b.id, teil: b.teil || null, modul: z ? z.modul.id : null, tag: TAGE.indexOf(b.tag), start: min(b.start), ende: min(b.ende), vk, anzahl: vk.length });
  }
  return kacheln;
}

/** Die Optionen eines Wahl-Teils als Kacheln (zum Wählen im Raster). */
export function optionsKacheln(angebot, erg, teilId) {
  const eintrag = teileVon(angebot).find((x) => x.teil.id === teilId);
  if (!eintrag || !istWahl(eintrag.teil)) return [];
  const { teil: t, modul: m } = eintrag;
  const aus = [];
  for (const o of t.optionen || []) {
    for (const mu of muster(o)) {
      const termine = termineAus(mu, erg.sem);
      if (!termine.length) continue;
      const platz = mu.typ === 'serie' ? { tag: TAGE.indexOf(mu.tag), start: min(mu.start), ende: min(mu.ende) } : typischerPlatz(termine);
      let kollision = 0;
      for (const x of termine) {
        if (erg.vorkommen.some((v) => v.teil !== t.id && v.datum === x.datum && v.start != null && !v.ganztag && !v.ausgefallen && v.start < x.ende && x.start < v.ende && v.quelle !== 'block')) kollision += 1;
      }
      aus.push({ art: 'option', teil: t.id, modul: m.id, option: o.id, label: o.label, ...platz, ort: mu.ort || o.ort || null, reihe: mu.typ === 'reihe', anzahl: termine.length, kollision, termine, notiz: o.notiz || null });
    }
  }
  return aus;
}

// ── Annahmen an einem Ort ────────────────────────────────────────────────────────────────────────
// Silas, 11.10.: „Gibt es einen Ort, an dem ich einmal alle Annahmen als Liste sehe und auf diese antworten kann,
// beziehungsweise dort Werte verändern könnte manuell?“

/** Feste Regeln (mit Quelle, nicht änderbar) und Stellschrauben (änderbar, im Angebot unter `regeln`). */
export const REGEL_TEXTE = [
  { feld: 'lp_h', titel: '1 Leistungspunkt = 30 Zeitstunden', quelle: 'AllgStuPO der TU Berlin § 45 Abs. 2; BlnStudAkkV § 8: 25–30 h', fest: true },
  { feld: 'ct', titel: 'Ein c.t.-Termin (16:15–17:45) belegt die Doppelstunde (2 h)', quelle: 'Modulbeschreibungen: 2 SWS = 2 h Präsenzzeit je Woche', fest: true },
  { feld: 'katalog_wochen', titel: 'Eine wöchentliche Serie wird gegen höchstens so viele Termine geprüft', einheit: 'Termine', quelle: 'Multiplikator der Aufwandstabellen (15); die 16. Woche ist Luft' },
  { feld: 'woche_h', titel: 'Kapazität je Woche', einheit: 'h', quelle: 'Silas, 12.10. (G8)' },
  { feld: 'tag_h', titel: 'Kapazität je Tag', einheit: 'h', quelle: 'Silas, V-0340 und 12.10. (G8)' },
  { feld: 'we_h', titel: 'Vorschlag: das Wochenende vor einer Prüfung', einheit: 'h', quelle: 'Silas, V-0340 und 12.10. (V-0357)' },
  { feld: 'we2_h', titel: 'Vorschlag: das Wochenende davor', einheit: 'h', quelle: 'Silas, 12.10. (V-0357)' },
  { feld: 'we_rest_h', titel: 'Vorschlag: jedes Wochenende davor', einheit: 'h', quelle: 'Silas, 12.10. (V-0357)' },
  { feld: 'toleranz_mind_min', titel: 'Abgleich je Posten: passt bis 10 %, mindestens', einheit: 'min', quelle: 'Kontingent-Modell' },
  { feld: 'modul_meldung_min', titel: 'Abgleich je Modul: melden ab', einheit: 'min', quelle: 'Silas, 11.10.: ±2 h nicht melden' },
  { feld: 'video_puffer_min', titel: 'Puffer je Videowoche', einheit: 'min', quelle: 'Silas: „1:45 Video → 2 h einplanen“' },
  { feld: 'raster_min', titel: 'Blöcke aufrunden auf', einheit: 'min', quelle: 'Silas: „1:45 Video → 2 h einplanen“' },
];

/** Alle Annahmen: jede mit Ort (Modul, Teil), Satz und — wo es einen gibt — dem Wert, den Silas ändern kann. */
export function annahmen(angebot, erg) {
  const aus = [];
  const regeln = erg.regeln;
  for (const r of REGEL_TEXTE) {
    aus.push({ id: `regel:${r.feld}`, art: 'regel', titel: r.titel, quelle: r.quelle, fest: !!r.fest, feld: r.fest ? null : r.feld, wert: regeln[r.feld], einheit: r.einheit || null });
  }
  for (const z of erg.teile.values()) {
    const t = z.teil, m = z.modul;
    if (t.annahme) aus.push({ id: `text:${t.id}`, art: 'text', modul: m.id, teil: t.id, titel: t.annahme, quelle: t.quelle || null });
    if (z.erwartet_min) aus.push({ id: `erwartet:${t.id}`, art: 'erwartet', modul: m.id, teil: t.id, titel: `Termine erwartet, je ${stunden(t.erwartet.dauer_min || regeln.erwartet_min)} — bis die echten kommen`, feld: 'anzahl', wert: t.erwartet.anzahl, einheit: 'Termine', quelle: t.erwartet.quelle || null });
    if (t.art === 'video') {
      const ohne = (z.einheiten || []).filter((e) => e.laenge_min == null).length;
      if (ohne || !z.einheiten) aus.push({ id: `video:${t.id}`, art: 'video', modul: m.id, teil: t.id, titel: z.einheiten ? `${ohne} von ${z.einheiten.length} Videos ohne Länge — so lang angenommen` : 'Videolänge unbekannt — so lang angenommen', feld: 'annahme_min', wert: (t.einheiten && t.einheiten.annahme_min) || 90, einheit: 'min', quelle: 'Schätzung' });
    }
    if (z.el === 'einheiten' && t.art === 'selbst' && t.einheiten) aus.push({ id: `dauer:${t.id}`, art: 'dauer', modul: m.id, teil: t.id, titel: 'Dauer je Einheit', feld: 'dauer_min', wert: t.einheiten.dauer_min, einheit: 'min', quelle: t.einheiten.dauer_quelle || 'Annahme' });
    for (const o of t.optionen || []) if (o.annahme) aus.push({ id: `option:${o.id}`, art: 'text', modul: m.id, teil: t.id, titel: `${o.label}: ${o.annahme}`, quelle: o.quelle || null });
  }
  return aus;
}

/** Alles Offene nach Stufe (kontingent.mjs, Schritt 12). */
export const luecken = (erg) => erg.offen;

// ── Hilfen zum Planen ────────────────────────────────────────────────────────────────────────────

const belegtAm = (erg, datum) => erg.vorkommen.filter((v) => v.datum === datum && v.start != null && v.ende != null && !v.ganztag && !v.ausgefallen
  && v.ist !== 'verschoben' && !(v.quelle === 'pruefung' && !v.wichtig)).map((v) => [v.start, v.ende]);

/** Die größte freie Lücke eines Tages im Lernfenster: [start, ende] in Minuten, oder null (unter 60 min). */
export function freieLuecke(erg, datum, extra = [], fenster = null) {
  const [fa, fe] = (fenster || erg.regeln.lernfenster).map(min);
  const belegt = belegtAm(erg, datum).concat(extra);
  belegt.sort((a, b) => a[0] - b[0]);
  let beste = null, cursor = fa;
  for (const [s, e] of [...belegt, [fe, fe]]) {
    const ende = Math.min(s, fe);
    if (ende - cursor >= 60 && (!beste || ende - cursor > beste[1] - beste[0])) beste = [cursor, ende];
    cursor = Math.max(cursor, e);
  }
  return beste;
}

/** Wo an einem Tag `dauer` Minuten Lernen hinpassen (Vorschlag übernehmen, Ziehen im Prüfungskalender): zuerst am Stück
 *  im Lernfenster (9–19 Uhr), dann früh und abends (7–22 Uhr); sonst in die größten Lücken geteilt. extra: schon
 *  vergebene Strecken. Ergebnis: [[start, ende], …] (leer, wenn nichts frei ist). */
export function lernStrecken(erg, datum, dauer, extra = []) {
  const belegt = belegtAm(erg, datum).concat(extra);
  const raster = erg.regeln.raster_min;
  for (const f of [erg.regeln.lernfenster, erg.regeln.pruef_fenster]) {
    const [a, b] = f.map(min);
    const frei = freieFenster(belegt, dauer, a, b);
    if (frei.length) return [[frei[0][0], frei[0][0] + dauer]];
  }
  const [a, b] = erg.regeln.pruef_fenster.map(min);
  const luecken_ = freieFenster(belegt, raster, a, b).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]));
  const aus = [];
  let rest = dauer;
  for (const [s, e] of luecken_) {
    if (rest <= 0) break;
    const lang = Math.min(rest, Math.floor((e - s) / raster) * raster);
    if (lang <= 0) continue;
    aus.push([s, s + lang]); rest -= lang;
  }
  return aus.sort((x, y) => x[0] - y[0]);
}

// ── Export: Ereignisse für das Study OS und den Kalender ─────────────────────────────────────────
// Jedes konkrete Vorkommen mit stabiler Id, Zeitpunkt mit Zeitzone und Schicht (docs/SILAS.md §6): A Fixtermin ·
// B Wahltermin · C Frist/Einzeltermin · D Lernblock · R Semesterrahmen. Das Study OS liest diese Liste.

const ART_TEXT = { termin: 'Termin', block: 'Lernen', pruefung: 'Prüfung', frist: 'Frist', einzel: 'Termin', rahmen: 'Semester' };

export function titelVon(v, erg, angebot) {
  const z = v.teil ? erg.teile.get(v.teil) : null;
  const m = (angebot.module || []).find((x) => x.id === v.modul);
  const k = m ? kurz(m) : null;
  if (v.quelle === 'termin') return [k, z.teil.titel].filter(Boolean).join(' · ') + (v.titel ? ` (${v.titel})` : '');
  if (v.quelle === 'block') return z ? `${k} · ${z.teil.titel}` : (v.titel || 'Puffer');
  return [k, v.titel].filter(Boolean).join(' · ');
}

export function ereignisse(angebot, plan, optionen = {}) {
  const erg = rechnen(angebot, plan, optionen);
  return erg.vorkommen.filter((v) => !(v.quelle === 'block' && v.ist === 'verschoben')).map((v) => {
    const m = (angebot.module || []).find((x) => x.id === v.modul);
    const e = {
      id: v.id, schicht: v.schicht, quelle: v.quelle, art: ART_TEXT[v.quelle] || v.quelle,
      modul: v.modul, modulnummer: m && m.nr ? String(m.nr) : null, titel: titelVon(v, erg, angebot),
      datum: v.datum, bis: v.bis || null, ort: v.ort || null, online: v.online || null,
      ganztag: !!v.ganztag || v.start == null, wichtig: !!v.wichtig, unsicher: !!v.unsicher,
      teil: v.teil || null, zaehlt_min: v.zaehlt_min, flags: v.flags, ausgefallen: v.ausgefallen || null, ist: v.ist || null,
      einzeln: !!v.serie || !!v.tausch || !!v.verlegt,
    };
    // Nur in dieser Woche bei einer anderen Gruppe (SP-0421) oder verlegt (SP-0423, `verlegt: true`): wo der Termin sonst liegt.
    const her = v.tausch || v.verlegt;
    if (her) e.sonst = { datum: her.datum, start: isoZeit(her.datum, her.start), ende: isoZeit(her.datum, her.ende) };
    if (v.verlegt) e.verlegt = true;
    if (!e.ganztag) { e.start = isoZeit(v.datum, v.start); e.ende = isoZeit(v.datum, v.ende ?? v.start); }
    if (v.punkt != null) e.uhrzeit = hhmm(v.punkt);
    return e;
  });
}

/** Der Reiter „Prüfungen“ als Daten für das Study OS (SP-0412). Silas, 17.10.2026: das Study OS soll „die Termine und
 *  Intervalle und auch die Daten vom Prüfungstab“ zeigen. Die Ereignisse tragen je Prüfungstermin nur `wichtig` (gilt);
 *  was der Reiter darüber hinaus weiß — Art (Form der Marke), gewählt oder Arbeitsannahme (G7), Rückfall- und
 *  Nachholtermine, Stand nach § 63, Punkte, Fristen, Kontingent und die Strecke der Vorbereitung (vom ersten gelegten
 *  oder vorgeschlagenen Tag an, wie die Zeitleiste sie zieht) —, steht hier, aus demselben `rechnen()`. Prüfungen ohne
 *  Datum kommen mit ihrer offenen Frage; das Study OS erfindet kein Datum. `erg` braucht `heute` (sonst schlägt der
 *  Vorschlag auch Vergangenes vor). */
export function pruefungenExport(erg) {
  const termin = (x, gilt) => ({
    datum: x.datum, start: x.start || null, ende: x.ende || null, ort: x.ort || null, label: x.label || null,
    gilt: x === gilt, nachholen: !!x.nachholen, unsicher: !!x.unsicher,
  });
  return [...erg.pruefungen.values()].map((X) => {
    const t = X.termin;
    const tage = [...(X.bloecke || []).filter((v) => v.ist !== 'verschoben').map((v) => v.datum), ...(X.vorschlag || []).map((v) => v.datum)].sort();
    const ab = t && tage[0] && tage[0] < t.datum ? tage[0] : null;
    return {
      id: X.id, modul: X.modul.id, modulnummer: X.modul.nr ? String(X.modul.nr) : null, kurz: kurz(X.modul),
      titel: X.p.titel, art: X.art, form: X.p.form || null, portfolio: !!X.portfolio, haupt: !!X.haupt,
      dauer_min: Number.isFinite(X.p.dauer_min) ? X.p.dauer_min : null, punkte: X.punkte, erreicht: X.erreicht,
      status: X.status, zaehlt: !!X.zaehlt, alternativen: X.alternativen, gewaehlt: !!X.gewaehlt, annahme: !!X.annahme,
      wiederholung: !!X.wiederholung,
      termin: t ? termin(t, t) : null,
      termine: X.datiert.map((x) => termin(x, t)),
      // Termine ohne Datum (etwa „laut Semesterplanung in der Klausurwoche …“) mit dem, was über sie bekannt ist.
      offen: (X.p.termine || []).filter((x) => !istDatum(x.datum)).map((x) => ({ label: x.label || null, text: x.offen || null })),
      frage: X.info ? { text: X.info.frage, stichtag: X.info.stichtag || null } : null,
      zulassung: X.p.zulassung || null, stoff: X.p.stoff || null, quelle: X.p.quelle || null,
      kontingent_min: X.kontingent_min, zu_planen_min: X.zu_planen_min, erledigt_min: X.erledigt_min,
      geplant_min: X.geplant_min, offen_min: X.offen_min,
      vorschlag_min: (X.vorschlag || []).reduce((s, v) => s + v.min, 0), passt_nicht_min: X.passt_nicht_min || 0,
      fenster: X.fenster ? { ab: X.fenster.ab || null, bis: X.fenster.bis || null } : null,
      vorbereitung: ab ? { von: ab, bis: plusTage(t.datum, -1) } : null,
      fristen: (X.fristen || []).map((f) => ({ art: f.art, datum: f.datum, zeit: f.zeit || null, text: f.text, regel: !!f.regel })),
    };
  }).sort((a, b) => ((a.termin && a.termin.datum) || '9') < ((b.termin && b.termin.datum) || '9') ? -1 : 1);
}

/** Die Zeiträume des Semesters für das Study OS (SP-0412): Vorlesungszeit, Pausen, die vorlesungsfreie Zeit bis zum Ende
 *  des Planungszeitraums (die Prüfungszeit, P1 …) und die Schließung der Gebäude. Dieselben Phasen wie phasen(). */
export function zeitraeume(sem) {
  const aus = phasen(sem).map((p, i) => ({ id: p.id === 'pause' ? `pause-${i}` : p.id, art: p.id, titel: p.titel, von: p.von, bis: p.bis }));
  (sem.geschlossen || []).forEach((g, i) => aus.push({ id: `geschlossen-${i}`, art: 'geschlossen', titel: g.titel || 'Gebäude geschlossen', von: g.von, bis: g.bis, quelle: g.quelle || null }));
  return aus.sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));
}

// ── Prüfung eines Angebots ──────────────────────────────────────────────────────────────────────

/** Was an einem Angebot formal nicht stimmt — die Seite zeigt es, die API lehnt damit ab. */
export function pruefeAngebot(a) {
  const f = [];
  if (!a || typeof a !== 'object') return ['Kein Angebot'];
  const s = a.semester;
  if (!s || !s.vorlesung || !istDatum(s.vorlesung.von) || !istDatum(s.vorlesung.bis)) f.push('semester.vorlesung von/bis fehlt');
  const ids = new Set();
  for (const m of a.module || []) {
    if (!m.id || ids.has(m.id)) f.push(`Modul-Id „${m.id}“ fehlt oder doppelt`);
    ids.add(m.id);
    if (!(m.lp > 0)) f.push(`${m.id}: LP fehlen`);
    for (const t of m.teile || []) {
      if (!t.id || ids.has(t.id)) f.push(`Teil-Id „${t.id}“ fehlt oder doppelt`);
      ids.add(t.id);
      if (!['praesenz', 'video', 'selbst', 'pruefung'].includes(t.art)) f.push(`${t.id}: Art „${t.art}“ unbekannt`);
      if (t.topf && !['semester', 'pruefung'].includes(t.topf)) f.push(`${t.id}: Topf „${t.topf}“ unbekannt`);
      for (const quelle of [t, ...(t.optionen || [])]) {
        for (const mu of muster(quelle)) {
          try { termineAus(mu, s || { frei: [] }); } catch (e) { f.push(`${t.id}: ${e.message}`); }
        }
      }
    }
  }
  return f;
}
