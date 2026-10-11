// Das Planungsmodell von /silas (V-0321): Aufwand nach Leistungspunkten, nicht nach SWS.
//
// Silas, 11.10.2026: Seit Bologna zählt nicht die Kontaktzeit, sondern der ganze Aufwand. 1 LP sind
// 30 Zeitstunden (AllgStuPO § 45 Abs. 2), ein 6-LP-Modul also 180 h. Jede Modulbeschreibung zerlegt
// die 180 h in Posten (Präsenzzeit, Vor-/Nachbereitung, Prüfungsvorbereitung …). Dieser Planer prüft,
// ob jede dieser Stunden einen festen Platz im Kalender hat: Termine der Lehrstühle (Präsenz),
// gewählte Gruppen (Tutorium, Übung) und Silas' eigene Blöcke (Videos, Labs, Lernen). Was keinen
// Platz hat oder wozu eine Angabe fehlt, ist rot.
//
// Der Vertrag ist docs/SILAS.md. Diese Datei übernimmt NICHTS aus der Logik des öffentlichen Planers
// (auswahl.mjs, planwahl.mjs …): Silas wollte ausdrücklich eine neue. Sie ist rein — kein DOM, kein
// Netz, keine Uhr außer der übergebenen —, damit die Seite (web/silas/silas.mjs) und die Pages
// Function (functions/silas/api) mit derselben Rechnung arbeiten.

export const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const TAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Die Stellschrauben. Jede steht in docs/SILAS.md §4 mit ihrem Grund; das Angebot darf sie überschreiben.
export const REGELN = {
  lp_h: 30,             // AllgStuPO § 45 Abs. 2
  katalog_wochen: 15,   // der Multiplikator der Modulbeschreibungen
  video_puffer_min: 15, // „1:45 Video → 2 h einplanen“ (Silas): Länge + Puffer, auf das Raster aufgerundet
  raster_min: 30,
  lerntag_h: 6,         // Faustregel aus Silas' Semesterplan: Stunden ÷ 6 = Lerntage
  lernfenster: ['09:00', '19:00'],
  pendeln_min: 45,
  toleranz_min: 120,    // Silas, 11.10.: Abweichungen bis ±2 h nicht melden („sonst zu verwirrend“)
  vorlauf_tage: 21,     // Vorbereitung auf eine Prüfung in der Vorlesungszeit wird so viele Tage vorher kritisch
  evl_block_min: 120,   // Silas, 11.10. (V-0335): „EVL-Block muss einfach zwei Stunden sein“ …
  evl_min_min: 90,      // … „mindestens anderthalb Stunden“
  evl_fenster: ['10:00', '18:00'], // freie Plätze dazwischen sind bevorzugt („alles zwischen 10 und 18 Uhr preferred“)
  tag_fenster: ['08:00', '20:00'], // wo freie Plätze überhaupt gesucht werden
  pruef_fenster: ['07:00', '22:00'], // Prüfungsvorbereitung in der Vorlesungszeit: auch früh und abends (V-0337)
};

// ── Zeit ─────────────────────────────────────────────────────────────────────────────────────────
// Ein Datum ist 'JJJJ-MM-TT' ohne Zeitzone, eine Uhrzeit sind Minuten ab Mitternacht (Berliner
// Ortszeit). Gerechnet wird in UTC-Tagen, damit die Umstellung auf Winterzeit (25.10.2026) keinen
// Tag verschiebt; die Zeitzone kommt erst beim Export dazu (isoZeit).

export function min(hhmm) {
  if (typeof hhmm === 'number') return hhmm;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) throw new Error(`Uhrzeit „${hhmm}“ ist nicht HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const utcTag = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const plusTage = (iso, n) => new Date(utcTag(iso) + n * 864e5).toISOString().slice(0, 10);
export const wochentag = (iso) => (new Date(utcTag(iso)).getUTCDay() + 6) % 7; // 0 = Montag
export const montagVon = (iso) => plusTage(iso, -wochentag(iso));
export const tageZwischen = (a, b) => Math.round((utcTag(b) - utcTag(a)) / 864e5);
export const istDatum = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const datumKurz = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
export const aufRaster = (m, r) => Math.ceil(m / r) * r;

/** Stunden für Menschen: 1,5 h, 12 h, 0,25 h. */
export function stunden(m) {
  const h = Math.round((m / 60) * 4) / 4;
  return `${String(h).replace('.', ',')} h`;
}

// Sommerzeit in Berlin: vom letzten Sonntag im März, 02:00, bis zum letzten Sonntag im Oktober, 03:00.
function letzterSonntag(jahr, monat) {
  const ende = new Date(Date.UTC(jahr, monat, 0)).toISOString().slice(0, 10);
  return plusTage(ende, -((wochentag(ende) + 1) % 7));
}
export function berlinVersatz(datum, minuten = 720) {
  const j = +datum.slice(0, 4);
  const anfang = letzterSonntag(j, 3), ende = letzterSonntag(j, 10);
  const nach = (tag, grenze) => datum > tag || (datum === tag && minuten >= grenze);
  return nach(anfang, 120) && !nach(ende, 180) ? '+02:00' : '+01:00';
}
export const isoZeit = (datum, minuten) => `${datum}T${hhmm(minuten)}:00${berlinVersatz(datum, minuten)}`;

// ── Das Semester ─────────────────────────────────────────────────────────────────────────────────

export function istFrei(sem, datum) {
  return (sem.frei || []).some((f) => datum >= f.von && datum <= f.bis);
}

/** Alle Wochen von der ersten Vorlesungswoche bis zum Ende des Planungszeitraums (letzte Prüfung).
 *  Vorlesungswochen zählen W01, W02 …; die vorlesungsfreie Zeit und die Prüfungszeit nicht. */
export function wochen(sem) {
  const aus = [];
  const letzte = montagVon(sem.ende || sem.vorlesung.bis);
  let nr = 0, p = 0;
  for (let mo = montagVon(sem.vorlesung.von); mo <= letzte; mo = plusTage(mo, 7)) {
    const fr = plusTage(mo, 4);
    let art = 'vorlesung';
    if (mo > sem.vorlesung.bis) art = 'pruefung';
    else if (istFrei(sem, mo) && istFrei(sem, fr)) art = 'frei';
    const w = { id: mo, von: mo, bis: plusTage(mo, 6), art, nr: null };
    if (art === 'vorlesung') { nr += 1; w.nr = nr; w.kurz = `W${String(nr).padStart(2, '0')}`; }
    else if (art === 'pruefung') { p += 1; w.kurz = `P${p}`; }
    else w.kurz = 'Pause';
    aus.push(w);
  }
  return aus;
}
/** Die Phasen des Semesters (Silas, 11.10.: „eine Unterscheidung zwischen Vorlesungszeit und vorlesungsfreier
 *  Zeit … da hat man Platz, um zu planen, wann man welche Klausurvorbereitung macht“). */
export function phasen(sem) {
  const aus = [{ id: 'vorlesung', titel: 'Vorlesungszeit', von: sem.vorlesung.von, bis: sem.vorlesung.bis }];
  for (const f of sem.frei || []) aus.push({ id: 'pause', titel: f.titel || 'Vorlesungsfrei', von: f.von, bis: f.bis });
  if (sem.ende && sem.ende > sem.vorlesung.bis) aus.push({ id: 'frei', titel: 'Vorlesungsfreie Zeit', von: plusTage(sem.vorlesung.bis, 1), bis: sem.ende });
  return aus;
}
export const phaseVon = (sem, datum) => {
  const ps = phasen(sem);
  return ps.find((p) => p.id !== 'vorlesung' && datum >= p.von && datum <= p.bis) || (datum >= sem.vorlesung.von && datum <= sem.vorlesung.bis ? ps[0] : null);
};

export const wocheVon = (wo, datum) => wo.find((w) => datum >= w.von && datum <= w.bis) || null;

// ── Termine aus einem Muster ─────────────────────────────────────────────────────────────────────
// Drei Formen (docs/SILAS.md §2.3): die Serie (wiederkehrend in einem Takt, mit Ausnahmen), die Reihe
// (feste Daten ohne Takt, z. B. BuK-Präsenz 7×) und der Einzeltermin (eine Reihe mit einem Datum).

export function muster(teilOderOption) {
  const t = teilOderOption.termine;
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

export function termineAus(m, sem) {
  const aus = [];
  if (m.typ === 'serie') {
    const ziel = TAGE.indexOf(m.tag);
    if (ziel < 0) throw new Error(`Wochentag „${m.tag}“ unbekannt`);
    let d = m.von;
    while (wochentag(d) !== ziel) d = plusTage(d, 1);
    const ausser = new Set(m.ausser || []);
    for (; d <= m.bis; d = plusTage(d, 7 * (m.alle || 1))) {
      if (ausser.has(d) || (istFrei(sem, d) && !m.auch_frei)) continue;
      // Angaben zu einzelnen Tagen einer Serie (tage: {datum: {titel, ort, unsicher, quelle}}): der eine Freitag mit
      // Übung statt VL, die Übung am 10.02. als Probeklausur — ohne die Serie in eine Reihe aufzulösen.
      const tag = (m.tage || {})[d] || {};
      aus.push({ datum: d, start: min(m.start), ende: min(m.ende), ort: tag.ort || m.ort || null, titel: tag.titel || null, quelle: tag.quelle || m.quelle || null, unsicher: tag.unsicher || null });
    }
  } else if (m.typ === 'reihe') {
    for (const x of m.daten || []) {
      aus.push({
        datum: x.datum, start: min(x.start || m.start), ende: min(x.ende || m.ende),
        ort: x.ort || m.ort || null, titel: x.titel || null, quelle: x.quelle || m.quelle || null,
        unsicher: x.unsicher || null,
      });
    }
  } else throw new Error(`Termin-Muster „${m.typ}“ unbekannt`);
  return aus;
}

/** Zählt ein Termin c.t., belegt er die volle Doppelstunde: 16:15–17:45 sind 2 h, denn das Viertel
 *  davor und danach ist der Weg, und die Modulbeschreibung rechnet 2 SWS als 2 h Präsenzzeit. */
export function zaehltMin(start, ende, ct = true) {
  const dauer = ende - start;
  return ct && start % 60 === 15 && ende % 60 === 45 ? dauer + 30 : dauer;
}

// ── Bausteine ────────────────────────────────────────────────────────────────────────────────────

export function teileVon(angebot) {
  const aus = [];
  for (const m of angebot.module || []) for (const t of m.teile || []) aus.push({ teil: t, modul: m });
  return aus;
}
/** Die Art eines Bestandteils für Farbe und Legende (Silas, 11.10.: „Präsenzveranstaltung sollte das gleiche
 *  Farbschema haben bei allen Modulen … Klausurvorbereitung, Klausur, Fristen … Quiz zum Beispiel immer grün“).
 *  Das Modul erkennt man am Streifen und am Kürzel; im Angebot überschreibt `kategorie` die Herleitung. */
export const KATEGORIEN = [
  ['praesenz', 'Präsenz'], ['video', 'Videos'], ['lernen', 'Vor- und Nachbereitung'], ['aufgaben', 'Aufgaben und Labs'],
  ['quiz', 'Quiz und Tests'], ['pruefung', 'Prüfung'],
];
export function kategorie(t) {
  if (t.kategorie) return t.kategorie;
  if (t.art === 'praesenz') return 'praesenz';
  if (t.art === 'video') return 'video';
  if (t.art === 'pruefung') return 'pruefung';
  const text = `${t.id} ${t.titel}`;
  if (/quiz|quicktest|e-test|test/i.test(text)) return 'quiz';
  if (/lab|aufgab|übungsbl|blatt|abgabe/i.test(text)) return 'aufgaben';
  return 'lernen';
}

export const istWahl = (t) => t.art === 'praesenz' && (t.wahl || (t.optionen && t.optionen.length > 0));
export const kurz = (m) => m.kurz || m.id;

// ── Die vier Schritte (V-0333) ───────────────────────────────────────────────────────────────────
// Silas, 11.10.2026: „Die absolute Foundation muss sein: alle bestätigten Pflichtpräsenztermine sind dort eingetragen
// und die Quizze … Dann der zweite Layer, das sind Optionstermine … Tutoriumsgruppe XY oder Übungsgruppe XY …
// dann die dritte Schicht, Screencasts und alles, was eigentlich eine Präsenzveranstaltung wäre, aber über ein Video
// … und dann als letzte Sache für alle Sachen eine Vor- und Nachbereitung. Das Tool soll einen durch genau diese
// Entscheidungen durchführen und man soll die selber treffen … und zurückspringen können.“ Jeder Bestandteil und
// jedes Vorkommen gehört zu genau einem Schritt; Zurücksetzen nimmt die Schritte ab 2 weg, Schritt 1 bleibt.
// V-0334, Silas: „Klausurvorbereitung und Prüfungsgeschichten sollen gar nicht in dieser Planung stattfinden … wenn der
// ganze Plan steht … kann man ab Mitte des Semesters das einplanen.“ Prüfungen, ihre Anmeldungen und die
// Prüfungsvorbereitung sind darum Schritt 5 (PRUEFUNGEN): nicht im Ablauf, erst nach „Stundenplan festlegen“.
export const PRUEFUNGEN = 5;
export const SCHRITTE = [
  { nr: 1, id: 'grundlage', titel: 'Grundlage', satz: 'Feste Präsenztermine, Prüfungen, Quizze und Fristen — steht fest' },
  { nr: 2, id: 'gruppen', titel: 'Gruppen', satz: 'Tutorien und Übungen mit Gruppen — du wählst' },
  { nr: 3, id: 'videos', titel: 'Videos', satz: 'Screencasts und Lehrvideos — du legst sie selbst' },
  { nr: 4, id: 'evl', titel: 'EVL', satz: 'Eigenverantwortliches Lernen: Vor- und Nachbereitung, Labs, Quizze' },
];
/** Präsenz mit eigenen Terminen ist Schritt 1, Präsenz mit Gruppen (oder ohne Termine — die Gruppen kommen noch)
 *  Schritt 2, Videos Schritt 3, Selbststudium Schritt 4, Prüfungsvorbereitung 5 (nach dem Festlegen). */
export function schrittVon(t) {
  if (t.schritt) return t.schritt;
  if (t.art === 'praesenz') return istWahl(t) || !muster(t).length ? 2 : 1;
  return t.art === 'video' ? 3 : t.art === 'pruefung' ? PRUEFUNGEN : 4;
}
/** Ein Block gehört zum Schritt seines Bestandteils: Videos 3, Prüfungsvorbereitung 5, alles andere (auch Puffer
 *  ohne Teil) 4. */
export const schrittVonBlock = (teil) => (teil ? Math.max(3, schrittVon(teil)) : 4);
/** Das Etikett an jeder Kachel (Silas: „ist es Präsenz, ist es Video oder ist es EVL“). */
export const ETIKETT = { 1: 'Präsenz', 2: 'Präsenz', 3: 'Video', 4: 'EVL' };
export const postenGesamt = (p) => Math.round(p.mult * p.h * 60); // in Minuten

/** Die Einheiten eines Video- oder Selbstlern-Teils (je Video, je Quiz), mit ihrem Freigabetag. Eine
 *  Liste steht im Angebot, oder ein Takt (jeden Freitag von … bis …) erzeugt sie. Ohne beides gibt es
 *  keine Einheiten: Dann zählt jeder Block, und das fehlende Datum ist eine Info-Lücke. */
export function einheiten(teil, sem) {
  const e = teil.einheiten;
  if (!e) return null;
  // Je Einheit (ein Video, ein Quiz) ihre eigene Länge: Silas, 11.10.: „Woche 2 … Screencast 3, 40 Minuten. Und
  // Screencast 4, auch 40 Minuten.“ Eine Länge je Teil gilt nur, wo eine Einheit keine eigene hat.
  const teilLaenge = Number.isFinite(e.laenge_min) ? e.laenge_min : null;
  const voll = (x, i) => ({
    nr: x.nr ?? i + 1, ab: x.ab, titel: x.titel || null, woche: x.woche ?? null,
    laenge_min: Number.isFinite(x.laenge_min) ? x.laenge_min : teilLaenge,
    bis: istDatum(x.bis) ? x.bis : null, bis_zeit: x.bis_zeit || null,
    quelle: x.quelle || null, offen: x.offen || null, unsicher: x.unsicher || null,
  });
  if (Array.isArray(e.liste) && e.liste.length) {
    const mit = e.liste.filter((x) => istDatum(x.ab)).map(voll);
    return mit.length ? mit : null; // ohne ein einziges Datum: wie ohne Liste (jeder Block zählt), Lücke wird gemeldet
  }
  if (e.takt && e.takt.tag && e.takt.von && e.takt.bis) {
    return termineAus({ typ: 'serie', tag: e.takt.tag, von: e.takt.von, bis: e.takt.bis, start: '00:00', ende: '00:00', ausser: e.takt.ausser, auch_frei: e.takt.auch_frei }, sem)
      .map((x, i) => voll({ ab: x.datum }, i));
  }
  return null;
}

/** Wie lang ein Block für ein Video sein soll: Länge plus Puffer, auf das Raster aufgerundet. */
export function videoBlockMin(laengeMin, regeln = REGELN) {
  return aufRaster(laengeMin + regeln.video_puffer_min, regeln.raster_min);
}

/** Welcher Termin einer Prüfung zählt: der, den Silas gewählt hat (plan.pruefungstermin, z. B. E-Test am 24.11.
 *  statt am 30.11. oder der Zweittermin), sonst der erste reguläre, sonst der erste datierte. */
export function pruefungsTermin(modul, pid, plan = {}) {
  const p = (modul.pruefungen || []).find((x) => x.id === pid);
  if (!p) return { pruefung: null, termin: null, gewaehlt: false };
  const datiert = (p.termine || []).filter((x) => istDatum(x.datum));
  const wahl = (plan.pruefungstermin || {})[p.id];
  const gewaehlt = wahl ? datiert.find((x) => x.datum === wahl) : null;
  const termin = gewaehlt || datiert.find((x) => x.wichtig !== false) || datiert[0] || null;
  return { pruefung: p, termin, gewaehlt: !!gewaehlt };
}

// ── Stufen ───────────────────────────────────────────────────────────────────────────────────────
// kritisch (rot) · achtung (orange) · dran (hellblau: du bist dran — eintragen, festlegen, planen) · kommt (grau: der
// Lehrstuhl liefert es noch) · spaeter (grau: Prüfungsvorbereitung, deren Zeit noch nicht da ist) · info (grau).
export const STUFEN = ['kritisch', 'achtung', 'dran', 'kommt', 'spaeter', 'info'];
export const STUFE_TEXT = { kritisch: 'kritisch', achtung: 'Achtung', dran: 'du bist dran', kommt: 'kommt noch', spaeter: 'später', info: 'Hinweis' };
const RANG = Object.fromEntries(STUFEN.map((s, i) => [s, i]));
export const hoechste = (flags) => flags.reduce((b, f) => (f.stufe && (b === 'ok' || RANG[f.stufe] < RANG[b]) ? f.stufe : b), 'ok');

const PRUEFUNGSTHEMEN = new Set(['datum_offen', 'uhrzeit_offen', 'pruefung_offen', 'pruefung_unsicher', 'anmeldung_offen', 'anmeldung_unsicher', 'pruefung_wahl', 'pruefung_konflikt']);

/** Die Art einer Prüfung für die Zeitleiste (V-0337, Silas: „A die Klausuren, B die E-Tests, C die Online-Tests und
 *  die schriftlichen Prüfungen und alles, was eine Prüfungsleistung ist“). Im Angebot überschreibt `art` die Herleitung
 *  aus dem Titel. */
export const PRUEFUNGSARTEN = [['klausur', 'Klausuren'], ['etest', 'E-Tests'], ['test', 'Online- und schriftliche Tests']];
export function pruefungsArt(p) {
  if (p.art && PRUEFUNGSARTEN.some(([a]) => a === p.art)) return p.art;
  const t = `${p.id} ${p.titel}`;
  if (/\be-?test/i.test(t)) return 'etest'; // nicht „Online-Test“ (onlin-e-Test)
  if (/klausur/i.test(t)) return 'klausur';
  return 'test';
}

/** unbekannt (kein Prüfungstermin), bekannt (ein Termin steht), anmeldung (die Anmeldung des Moduls läuft). */
export function pruefungsStand(m, heute) {
  const ps = m.pruefungen || [];
  const von = ps.map((p) => p.anmeldung && p.anmeldung.von).filter(istDatum).sort()[0];
  if (heute && von && heute >= von) return 'anmeldung';
  return ps.some((p) => (p.termine || []).some((x) => istDatum(x.datum))) ? 'bekannt' : 'unbekannt';
}

/** Ab wann eine fehlende Prüfungsvorbereitung kritisch ist: mit Beginn der vorlesungsfreien Zeit (Silas: „erst wenn
 *  auch die vorlesungsfreie Zeit begonnen hat“); liegt die Prüfung in der Vorlesungszeit (E-Test, Online-Test),
 *  regeln.vorlauf_tage vor ihr. */
export function kritischAb(z, sem, regeln = REGELN) {
  const x = z.pruefungstermin;
  if (x && x.datum <= sem.vorlesung.bis) return plusTage(x.datum, -regeln.vorlauf_tage);
  return plusTage(sem.vorlesung.bis, 1);
}

function anmeldeStufe(a, erledigt, heute, pruefung) {
  if (!a || erledigt || !heute) return null;
  const von = istDatum(a.von) ? a.von : null, bis = istDatum(a.bis) ? a.bis : null;
  if (!von && !bis) return null; // ganz offen: das meldet anmeldung_offen
  const wo = a.wo ? ` (${String(a.wo).split(' (')[0]})` : '';
  const bisText = bis ? ` bis ${TAGE[wochentag(bis)]} ${datumKurz(bis)}${a.bis_zeit ? ` ${a.bis_zeit}` : ''}` : '';
  if (bis && heute > bis) return { stufe: 'kritisch', text: `Anmeldefrist war am ${datumKurz(bis)} — angemeldet? Dann abhaken` };
  const laeuft = von ? heute >= von : tageZwischen(heute, bis) <= 14;
  if (!laeuft) return { stufe: 'info', text: von ? `Anmeldung ab ${TAGE[wochentag(von)]} ${datumKurz(von)}${bisText}${wo}` : `Anmeldung${bisText}${wo}` };
  // Prüfung: rot, sobald die Anmeldung läuft (Silas). Gruppe: in der letzten Woche rot, davor „du bist dran“.
  const rest = bis ? tageZwischen(heute, bis) : null;
  return { stufe: pruefung || rest == null || rest <= 7 ? 'kritisch' : 'dran', text: `Jetzt anmelden${bisText}${wo}` };
}

function einstufen(f, z, stand, heute) {
  if (f.stufe_fest) return f.stufe_fest;
  const a = f.art;
  if (PRUEFUNGSTHEMEN.has(a)) {
    if (f.nur_ort || a === 'uhrzeit_offen') return 'achtung';
    if (f.nur_neben) return 'info'; // zwei Zweittermine übereinander: nur wichtig, wenn beide nötig werden
    if (a.endsWith('_unsicher')) return stand === 'anmeldung' ? 'achtung' : 'info';
    return stand === 'anmeldung' ? 'kritisch' : stand === 'bekannt' ? 'achtung' : 'kommt';
  }
  if (z && z.teil.art === 'pruefung' && ['ungeplant', 'luecke', 'einheit_ohne_block'].includes(a)) {
    return heute && z.kritisch_ab && heute >= z.kritisch_ab ? 'kritisch' : 'spaeter';
  }
  switch (a) {
    case 'konflikt': return z && z.teil.art === 'praesenz' ? 'kritisch' : 'achtung';
    case 'ungeplant': case 'luecke': case 'einheit_ohne_block': case 'wahl_offen': return 'dran';
    case 'laenge_offen': return f.faellig ? 'dran' : 'kommt';
    case 'zu_kurz': return 'dran';
    // Was in einem Angebot „offen“ steht, liefert der Lehrstuhl noch (Termine, Fristen, Räume) — was Silas selbst tun
    // muss (anmelden, wählen, Längen ablesen), hat eigene Meldungen.
    case 'termine_offen': case 'freigabe_offen': case 'einheit_offen': case 'frist_offen': case 'offen': return 'kommt';
    // Orange nur, was Silas prüfen oder ändern sollte: Unsicheres, Fehler im Angebot, Blöcke nach der Prüfung und
    // selbst geplantes Zuviel über ±2 h. Annahmen stehen unter „Offen & Annahmen“, Blöcke ohne Video und kleine
    // Überlappungen sind Hinweise.
    // Unsicheres an einem Teil, dessen Termine ohnehin noch kommen (Tutorium „startet vermutlich in Woche 2“), ist
    // ein Hinweis — sonst verdrängte „bitte prüfen“ das eigentliche „Termine kommen noch“.
    case 'unsicher': return z && z.flags.some((x) => x.art === 'termine_offen') ? 'info' : 'achtung';
    case 'nach_pruefung': case 'posten': case 'pruefung_fehlt': case 'posten_summe': case 'posten_teile': return 'achtung';
    case 'ueber': return z && z.teil.art !== 'praesenz' ? 'achtung' : 'info';
    case 'gesperrt': return f.dauernd ? 'dran' : 'info';
    default: return 'info'; // annahme, aufteilung, leer, einheit_unsicher, termin_unsicher, videozeit, hinweis
  }
}

// ── Die Rechnung ─────────────────────────────────────────────────────────────────────────────────

/**
 * Rechnet einen Stand durch. Ergebnis:
 *  - wochen: alle Wochen des Planungszeitraums
 *  - vorkommen: jeder konkrete Termin, Block, jede Prüfung, Frist und Freigabe, mit Datum
 *  - teile: je Teil Soll, Ist, Lücke, Flaggen (rot = Info fehlt oder nicht geplant, gelb = Hinweis)
 *  - module: je Modul die Summen; summe: das Semester
 */
export function rechnen(angebot, plan = {}, optionen = {}) {
  const sem = angebot.semester;
  const regeln = { ...REGELN, ...(angebot.regeln || {}) };
  const wo = wochen(sem);
  const wahl = plan.wahl || {};
  const vorkommen = [];
  const teile = new Map();
  // Beim Erzeugen trägt jede Meldung ihre ROHE Art (info/plan/hinweis); welche Farbe sie zeigt, entscheidet
  // erst einstufen() am Ende — nach Datum, Semesterphase und Stand der Prüfung (V-0332).
  const flagge = (z, roh, art, text, extra) => z.flags.push({ roh, art, text, ...(extra || {}) });
  const heute = optionen.heute || null;

  // 1 · Soll je Teil. Die Posten sind amtlich (Modulbeschreibung); ein Teil deckt einen Posten ganz
  //     oder seinen Anteil (soll_h). Teilen sich mehrere Teile einen Posten ohne Anteil, wird gleich
  //     geteilt — als Annahme sichtbar.
  for (const m of angebot.module || []) {
    const posten = new Map((m.posten || []).map((p) => [p.id, p]));
    const nutzer = new Map();
    for (const t of m.teile || []) nutzer.set(t.posten, [...(nutzer.get(t.posten) || []), t]);
    for (const t of m.teile || []) {
      const p = posten.get(t.posten);
      const z = { teil: t, modul: m, posten: p || null, soll_min: 0, ist_min: 0, vk: [], flags: [], einheiten: null };
      if (!p) flagge(z, 'info', 'posten', `Posten „${t.posten}“ fehlt in der Aufwandstabelle`);
      else if (t.soll_h != null) z.soll_min = Math.round(t.soll_h * 60);
      else {
        const geschwister = nutzer.get(t.posten);
        const vergeben = geschwister.filter((g) => g.soll_h != null).reduce((s, g) => s + g.soll_h * 60, 0);
        const offen = geschwister.filter((g) => g.soll_h == null);
        z.soll_min = Math.round((postenGesamt(p) - vergeben) / offen.length);
        if (offen.length > 1 && !(plan.bestaetigt || {})[`soll:${t.id}`]) flagge(z, 'hinweis', 'aufteilung', `Aufteilung angenommen: ${p.titel} (${stunden(postenGesamt(p))}) zu gleichen Teilen auf ${offen.length} Bestandteile`);
      }
      z.soll_orig_min = z.soll_min;
      teile.set(t.id, z);
    }
  }
  // Umwidmung: Stunden, die an einer Stelle nicht stattfinden können (die Übung findet nur 5× statt),
  // wandern zu einem anderen Teil desselben Moduls. Die 180 h des Moduls bleiben gleich.
  for (const u of plan.umwidmungen || []) {
    const von = teile.get(u.von), nach = teile.get(u.nach);
    if (!von || !nach || von.modul !== nach.modul) continue;
    const m = Math.round(u.h * 60);
    von.soll_min -= m; nach.soll_min += m;
    (von.umgewidmet ||= []).push({ ...u, richtung: 'weg' });
    (nach.umgewidmet ||= []).push({ ...u, richtung: 'her' });
  }

  // 2 · Termine der Lehrstühle (Schicht A) und gewählte Gruppen (Schicht B)
  for (const z of teile.values()) {
    const t = z.teil;
    if (t.art !== 'praesenz') continue;
    let quelle = t, schicht = 'A', option = null;
    if (istWahl(t)) {
      const opts = t.optionen || [];
      if (!opts.length) { flagge(z, 'info', 'termine_offen', t.offen || 'Die Termine stehen noch nicht fest'); continue; }
      option = opts.find((o) => o.id === wahl[t.id]) || null;
      if (!option) { flagge(z, 'plan', 'wahl_offen', `Noch keine Gruppe gewählt (${opts.length} zur Auswahl)`); continue; }
      quelle = option; schicht = 'B';
    } else if (!muster(t).length) { flagge(z, 'info', 'termine_offen', t.offen || 'Die Termine stehen noch nicht fest'); continue; }
    for (const [mi, m] of muster(quelle).entries()) {
      for (const x of termineAus(m, sem)) {
        // hart: Auf einem Termin kann kein Block liegen (Silas, 11.10.: „die Sachen sind ganz sicher geblockt“).
        const v = {
          id: `${t.id}@${x.datum}@${hhmm(x.start)}`, quelle: 'termin', schicht, schritt: schrittVon(t), hart: true, muster: mi,
          teil: t.id, modul: z.modul.id, option: option && option.id, datum: x.datum, start: x.start, ende: x.ende,
          ort: x.ort || quelle.ort || t.ort || null, online: quelle.online || t.online || null,
          titel: x.titel, ct: t.ct !== false, zaehlt_min: 0, flags: [], mit: [],
          herkunft: x.quelle || quelle.quelle || t.quelle || null, unsicher: !!x.unsicher,
        };
        vorkommen.push(v); z.vk.push(v);
      }
    }
  }

  // 3 · Silas' Blöcke (Schicht D). Ein Wochenblock gilt in jeder Vorlesungswoche (in der Pause nur mit
  //     pause: true), mit `alle: n` nur in jeder n-ten (ab der ersten, `versatz` verschiebt), ein Datumsblock genau
  //     an seinem Tag. (`alle`, V-0335: ein 2-h-EVL-Block für 1 h je Woche liegt alle zwei Wochen.)
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
    }
    for (const d of tage) {
      const v = {
        id: `${b.id}@${d}`, quelle: 'block', schicht: 'D', schritt: schrittVonBlock(z && z.teil), block: b.id, teil: z ? z.teil.id : null,
        modul: z ? z.modul.id : null, datum: d, start: min(b.start), ende: min(b.ende),
        titel: b.titel || null, zaehlt_min: 0, flags: [], mit: [], woechentlich: !b.datum,
      };
      vorkommen.push(v);
      if (z) z.vk.push(v);
    }
  }

  // 4 · Prüfungen (Schicht A), Einzeltermine und Fristen (Schicht C) — sie tragen keine Lernstunden,
  //     aber sie belegen Zeit und binden die Prüfungsvorbereitung.
  function anmeldeFristen(a, id, modul, titel, teil = null) {
    if (!a) return;
    const wo = a.wo ? ` (${String(a.wo).split(' (')[0]})` : '';
    // Die Anmeldung einer Gruppe gehört zu ihrem Schritt (2), die einer Prüfung zu den Prüfungen (5).
    const sch = teil ? schrittVon(teile.get(teil).teil) : PRUEFUNGEN;
    if (istDatum(a.von)) frist(`${id}-von`, modul, a.von, a.von_zeit, `${titel}: Anmeldung öffnet${wo}`, false, a, teil, sch);
    if (istDatum(a.bis)) frist(`${id}-bis`, modul, a.bis, a.bis_zeit, `${titel}: Anmeldung endet${wo}${a.nur ? ` — nur ${a.nur}` : ''}`, true, a, teil, sch);
  }
  function frist(id, modul, datum, zeit, titel, wichtig, herkunft, teil = null, schritt = 1) {
    vorkommen.push({
      id, quelle: 'frist', schicht: 'C', schritt, modul, teil, datum, ganztag: true, punkt: zeit ? min(zeit) : undefined,
      titel, wichtig: !!wichtig, unsicher: !!(herkunft && herkunft.unsicher), herkunft: (herkunft && herkunft.quelle) || null,
      zaehlt_min: 0, flags: [], mit: [],
    });
  }
  for (const m of angebot.module || []) {
    for (const p of m.pruefungen || []) {
      // Bei einer echten Wahl (p.wahl: zwei gleichwertige Termine, einer wird geschrieben) verschwindet der andere,
      // sobald Silas gewählt hat; Erst- und Zweittermin bleiben beide sichtbar.
      const { termin: gilt, gewaehlt } = pruefungsTermin(m, p.id, plan);
      for (const x of p.termine || []) {
        if (!istDatum(x.datum)) continue;
        if (p.wahl && gewaehlt && x !== gilt) continue;
        const zeit = x.start ? { start: min(x.start), ende: x.ende ? min(x.ende) : min(x.start) + (p.dauer_min || 60) } : { ganztag: true };
        // Ein Ausweich- oder Zweittermin ist „nicht wichtig“, solange Silas ihn nicht gewählt hat — und sperrt nichts.
        const wichtig = x.wichtig !== false || (gewaehlt && x === gilt);
        vorkommen.push({
          id: `${p.id}@${x.datum}`, quelle: 'pruefung', schicht: 'A', schritt: PRUEFUNGEN, hart: wichtig, modul: m.id, pruefung: p.id,
          datum: x.datum, ...zeit, titel: [p.titel, x.label].filter(Boolean).join(' · '), ort: x.ort || null,
          wichtig, unsicher: !!x.unsicher, zaehlt_min: 0, flags: [], mit: [],
          herkunft: x.quelle || p.quelle || null,
        });
      }
      // Die Anmeldung zur Prüfung: ohne sie wird nichts bewertet (AllgStuPO § 63 Abs. 1).
      anmeldeFristen(p.anmeldung, `${p.id}-anmeldung`, m.id, p.titel);
      for (const x of p.termine || []) if (x.anmeldung) anmeldeFristen(x.anmeldung, `${p.id}@${x.datum}-anmeldung`, m.id, `${p.titel}${x.label ? ` (${x.label})` : ''}`);
    }
    // Auch eine Gruppe kann eine Anmeldung haben (EINFWI-Übung über MOSES bis 14.10.).
    for (const t of m.teile || []) anmeldeFristen(t.anmeldung, `${t.id}-anmeldung`, m.id, t.titel, t.id);
    // Abgaben und Schlusszeiten der Einheiten (Quiz, Blatt): Fristen der Schicht C.
    for (const t of m.teile || []) {
      for (const e of einheiten(t, sem) || []) {
        if (e.bis) frist(`${t.id}#${e.nr}@bis`, m.id, e.bis, e.bis_zeit, `${t.titel} ${e.nr}${e.titel ? ` (${e.titel})` : ''} fällig`, false, e, t.id);
      }
    }
  }
  for (const e of angebot.termine || []) {
    if (!istDatum(e.datum)) continue; // Datum offen: als Lücke am Modul (Schritt 8), nicht im Kalender
    const zeit = e.start && e.ende ? { start: min(e.start), ende: min(e.ende) } : e.start ? { punkt: min(e.start), ganztag: true } : { ganztag: true };
    vorkommen.push({
      id: e.id, quelle: e.art === 'frist' ? 'frist' : e.art === 'rahmen' ? 'rahmen' : 'einzel',
      schicht: e.art === 'rahmen' ? 'R' : 'C', schritt: 1, hart: !zeit.ganztag && e.art !== 'frist' && e.art !== 'rahmen',
      modul: e.modul || null, datum: e.datum, bis: e.bis || null, ...zeit,
      titel: e.titel, ort: e.ort || null, wichtig: !!e.wichtig, unsicher: !!e.unsicher, art: e.art,
      zaehlt_min: 0, flags: [], mit: [], herkunft: e.quelle || null, notiz: e.notiz || null,
    });
  }

  // 5 · Überschneidungen — an den konkreten Tagen, nicht im Wochenraster (eine Übungsgruppe, die nur
  //     an fünf Terminen stattfindet, stört die übrigen Wochen nicht). Ein Block, der einen Termin überlappt, zählt nur
  //     mit dem Teil, der frei bleibt.
  const konflikte = [];
  const marke = (v, f) => { if (!v.flags.includes(f)) v.flags.push(f); };
  const proTag = new Map();
  for (const v of vorkommen) if (v.start != null && v.ende != null && !v.ganztag) proTag.set(v.datum, [...(proTag.get(v.datum) || []), v]);
  for (const liste of proTag.values()) {
    liste.sort((a, b) => a.start - b.start || a.ende - b.ende);
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length && liste[j].start < liste[i].ende; j++) {
        const a = liste[i], b = liste[j];
        const ueber = Math.min(a.ende, b.ende) - Math.max(a.start, b.start);
        if (ueber <= 0) continue;
        // Ein Ausweich- oder Zweittermin einer Prüfung (wichtig: false) schreibt Silas nur im Notfall: Er verdrängt
        // weder einen Termin noch einen Block (das BuK-Tutorium Mo 8–10 lag am 14.12. auf dem E-Test-Ausweichtermin).
        const neben = (v) => v.quelle === 'pruefung' && !v.wichtig;
        if ((neben(a) && b.quelle !== 'pruefung') || (neben(b) && a.quelle !== 'pruefung')) continue;
        a.mit.push(b.id); b.mit.push(a.id);
        konflikte.push({ datum: a.datum, a: a.id, b: b.id, minuten: ueber });
        // Ein Termin ist gesperrt (V-0333, Silas: „während ein Präsenztermin stattfindet … darf es nicht möglich sein,
        // dass man irgendetwas anderes macht“): Ein Block auf ihm verliert die überlappte Zeit, der Termin bleibt, wie
        // er ist. Die Seite lässt keinen Block auf einen sichtbaren Termin legen; hier landet, was Silas erst später
        // gesperrt hat (eine Gruppe gewählt, auf der schon ein Block lag) oder was nur an einzelnen Tagen trifft
        // (der Kick-off unter einem Wochenblock). Zwei Termine oder zwei Blöcke übereinander sind ein Konflikt für beide.
        const blockA = a.quelle === 'block', blockB = b.quelle === 'block';
        if (blockA && !blockB) { a.ueberlappt = (a.ueberlappt || 0) + ueber; marke(a, 'gesperrt'); }
        else if (blockB && !blockA) { b.ueberlappt = (b.ueberlappt || 0) + ueber; marke(b, 'gesperrt'); }
        else { marke(a, 'konflikt'); marke(b, 'konflikt'); }
      }
    }
  }

  // 6 · Zählen. Termine mit ihrer Doppelstunde, Blöcke mit ihrer Dauer — aber ein Video-Block nur,
  //     wenn es ein Video gibt, das er schauen kann (erst ab der Freigabe), und ein Lernblock für eine
  //     Prüfung nur vor ihr.
  for (const z of teile.values()) {
    const t = z.teil;
    for (const v of z.vk) {
      if (v.quelle === 'termin') v.zaehlt_min = zaehltMin(v.start, v.ende, v.ct);
      else v.zaehlt_min = Math.max(0, v.ende - v.start - (v.ueberlappt || 0));
    }
    const bloecke = z.vk.filter((v) => v.quelle === 'block').sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.start - b.start));
    if (t.art === 'video' || t.art === 'selbst') {
      const liste = einheiten(t, sem);
      z.einheiten = liste;
      const video = t.art === 'video';
      const wort = video ? ['Video', 'Videos'] : ['Einheit', 'Einheiten'];
      const annahme = (t.einheiten && (t.einheiten.laenge_min || t.einheiten.annahme_min)) || 90;
      if (liste) {
        // Die Einheiten einer Woche gehören zusammen (zwei Screencasts in Woche 2 schaut man in einem Block).
        // Blöcke füllen die Wochen der Reihe nach: Ein Block deckt die früheste freigegebene Woche, die noch
        // Zeit braucht — so holt ein späterer Block eine verpasste Woche nach. Ein Block, für den es (noch) nichts
        // zu tun gibt, zählt nicht. Bei Videos braucht eine Woche die Summe ihrer Längen plus Puffer (videoBlockMin);
        // bei Quiz und Blättern ohne Länge genau einen Block.
        const gruppen = [];
        for (const e of [...liste].sort((a, b) => (a.ab < b.ab ? -1 : a.ab > b.ab ? 1 : 0))) {
          const mo = montagVon(e.ab);
          let g = gruppen.find((x) => x.montag === mo);
          if (!g) { g = { montag: mo, ab: e.ab, einheiten: [], bedarf_min: null, belegt_min: 0, bloecke: [] }; gruppen.push(g); }
          g.einheiten.push(e);
        }
        // Quiz und Blätter mit erwarteter Bearbeitungszeit (einheiten.dauer_min, z. B. 1 h je ISIS-Quiz laut
        // Aufwandstabelle) brauchen so viel Zeit je Woche; ohne sie genau einen Block.
        const dauer = t.einheiten && Number.isFinite(t.einheiten.dauer_min) ? t.einheiten.dauer_min : null;
        if (!video && dauer) for (const g of gruppen) g.bedarf_min = aufRaster(g.einheiten.length * dauer, regeln.raster_min);
        if (video) {
          for (const g of gruppen) {
            g.laenge_min = g.einheiten.reduce((s, e) => s + (e.laenge_min ?? annahme), 0);
            g.bedarf_min = videoBlockMin(g.laenge_min, regeln);
            g.geschaetzt = g.einheiten.some((e) => e.laenge_min == null);
          }
        }
        // Abgaben ohne erwartete Dauer (Prog1WINF-Aufgaben, Blätter): ein Fenster statt einer Menge — ein Block zählt,
        // solange eine Einheit offen ist (ab ≤ Tag ≤ bis; ohne bis bis zur nächsten Freigabe bzw. Vorlesungsende).
        // Sonst zählte von zwei Lab-Blöcken je Woche nur einer (PROG1-Agent, 11.10.).
        const fenster = !video && !gruppen.some((g) => g.bedarf_min);
        if (fenster) {
          gruppen.forEach((g, n) => {
            const bisListe = g.einheiten.map((e) => e.bis).filter(Boolean).sort();
            g.bis = bisListe.length ? bisListe[bisListe.length - 1] : (gruppen[n + 1] ? plusTage(gruppen[n + 1].ab, -1) : sem.vorlesung.bis);
          });
        }
        for (const v of bloecke) {
          const g = fenster
            ? gruppen.find((x) => x.ab <= v.datum && v.datum <= x.bis)
            : gruppen.find((x) => x.ab <= v.datum && (x.bedarf_min == null ? !x.bloecke.length : x.belegt_min < x.bedarf_min));
          if (!g) { v.zaehlt_min = 0; v.flags.push('leer'); continue; }
          g.bloecke.push(v.id);
          g.belegt_min += Math.max(0, v.ende - v.start - (v.ueberlappt || 0));
          v.einheit = g.einheiten.map((e) => e.nr).join(' + ');
          for (const e of g.einheiten) if (!e.block) e.block = v.id;
        }
        z.gruppen = gruppen;
        const frei = bloecke.filter((v) => v.flags.includes('leer'));
        if (frei.length) flagge(z, 'hinweis', 'leer', `${frei.length} ${frei.length > 1 ? 'Blöcke' : 'Block'} ohne ${wort[0]} (zuerst ${datumKurz(frei[0].datum)}) — die Zeit zählt nicht`);
        const ohne = gruppen.filter((g) => !g.bloecke.length);
        if (ohne.length && bloecke.length) flagge(z, 'plan', 'einheit_ohne_block', `${ohne.reduce((s, g) => s + g.einheiten.length, 0)} von ${liste.length} ${wort[1]} ohne Block (ab ${datumKurz(ohne[0].ab)})`);
        const kurz = gruppen.filter((g) => g.bedarf_min && g.belegt_min > 0 && g.belegt_min < g.bedarf_min);
        if (kurz.length) flagge(z, 'hinweis', 'zu_kurz', `${kurz.length} ${kurz.length > 1 ? 'Wochen' : 'Woche'}: Block kürzer als ${video ? 'die Videos' : 'die Einheiten'} (ab ${datumKurz(kurz[0].ab)}: ${stunden(kurz[0].belegt_min)} eingeplant, ${stunden(kurz[0].bedarf_min)} nötig)`);
        if (video) {
          const unbekannt = liste.filter((e) => e.laenge_min == null).length;
          z.video_bedarf_min = gruppen.reduce((s, g) => s + g.bedarf_min, 0);
          z.video_bekannt = unbekannt === 0;
          // Die Länge eines Videos kann Silas erst ablesen, wenn es erschienen ist: nur das ist „du bist dran“.
          const faellig = liste.filter((e) => e.laenge_min == null && heute && e.ab <= heute).length;
          if (unbekannt) flagge(z, 'info', 'laenge_offen', `${unbekannt} von ${liste.length} Videos ohne Länge${faellig ? ` (${faellig} schon erschienen)` : ''} — angenommen je ${annahme} min`, { faellig });
          if (z.video_bekannt && z.video_bedarf_min + regeln.toleranz_min < z.soll_min) z.video_rest_min = z.soll_min - z.video_bedarf_min;
          const satz = `Die Videos brauchen mit Puffer ${stunden(z.video_bedarf_min)}${z.video_bekannt ? '' : ' (geschätzt)'}, der Posten sieht ${stunden(z.soll_min)} vor`;
          if (Math.abs(z.video_bedarf_min - z.soll_min) > 60) flagge(z, 'hinweis', 'videozeit', satz + (z.video_bedarf_min < z.soll_min ? ' — der Rest gehört in Nachbereitung oder Prüfungsvorbereitung (umwidmen)' : ''));
        }
        const unsicher = liste.filter((e) => e.unsicher);
        if (unsicher.length) flagge(z, 'hinweis', 'einheit_unsicher', `${unsicher.length} ${unsicher.length > 1 ? wort[1] : wort[0]} mit unsicherer Angabe: ${unsicher[0].unsicher}`);
        if (t.einheiten.offen) flagge(z, 'info', 'freigabe_offen', t.einheiten.offen);
        const ohneAb = (t.einheiten.liste || []).length - liste.length;
        if (ohneAb > 0) flagge(z, 'info', 'freigabe_offen', `${ohneAb} weitere ${ohneAb > 1 ? wort[1] : wort[0]} ohne Freigabedatum`);
        // Eine fehlende Videolänge meldet schon laenge_offen (einmal für alle) — nicht noch einmal je Video.
        const offen = liste.filter((e) => e.offen && !(video && e.laenge_min == null));
        if (offen.length) flagge(z, 'info', 'einheit_offen', `${offen.length} ${offen.length > 1 ? wort[1] : wort[0]}: ${offen[0].offen}`);
      } else {
        if (t.einheiten && t.einheiten.offen) flagge(z, 'info', 'freigabe_offen', t.einheiten.offen);
        const ohneDatum = ((t.einheiten && t.einheiten.liste) || []).length;
        const anzahl = t.einheiten && (t.einheiten.anzahl || ohneDatum);
        if (anzahl && !(t.einheiten && t.einheiten.offen)) flagge(z, 'info', 'freigabe_offen', `${anzahl} ${wort[1]} ohne Freigabedatum`);
        if (video && !(t.einheiten && t.einheiten.laenge_min)) flagge(z, 'info', 'laenge_offen', `Videolänge unbekannt${t.einheiten && t.einheiten.annahme_min ? ` — angenommen ${t.einheiten.annahme_min} min, Block ${stunden(videoBlockMin(t.einheiten.annahme_min, regeln))}` : ''}`);
      }
    }
    if (t.art === 'pruefung') {
      const { pruefung, termin } = pruefungsTermin(z.modul, t.pruefung, plan);
      z.pruefung = pruefung; z.pruefungstermin = termin;
      if (!pruefung) flagge(z, 'info', 'pruefung_fehlt', 'Zu diesem Lernblock gehört keine Prüfung');
      else if (!termin) flagge(z, 'info', 'datum_offen', `${pruefung.titel}: Termin steht noch nicht fest`);
      else {
        if (!termin.start) flagge(z, 'info', 'uhrzeit_offen', `${pruefung.titel} am ${datumKurz(termin.datum)}: Uhrzeit fehlt`);
        let nach = 0;
        for (const v of bloecke) if (v.datum >= termin.datum) { v.zaehlt_min = 0; v.flags.push('nach_pruefung'); nach += 1; }
        if (nach) flagge(z, 'plan', 'nach_pruefung', `${nach} Lernblock${nach > 1 ? 'e liegen' : ' liegt'} am oder nach dem Prüfungstag und ${nach > 1 ? 'zählen' : 'zählt'} nicht`);
      }
    }
    z.ist_min = z.vk.reduce((s, v) => s + v.zaehlt_min, 0);
  }

  // 7 · Lücken und Ampel je Teil
  // Ein Block auf einem Termin (gesperrt): je Block eine Meldung, mit dem Namen dessen, was ihn sperrt. Trifft er in
  // mindestens drei Wochen (oder an jedem seiner Tage) einen Termin, muss er weg — „du bist dran“. Trifft er nur an
  // einzelnen Tagen (Kick-off, E-Test), fällt er dort weg — ein Hinweis.
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
      aus.push({
        roh: 'plan', art: 'gesperrt', dauernd, block: id,
        text: dauernd ? `Block ${wann} liegt ${alle > 1 ? `an ${vs.length} Tagen ` : ''}auf ${namen} — dort ist gesperrt, verschieben`
          : `Block ${wann} fällt am ${vs.map((v) => datumKurz(v.datum)).join(', ')} teilweise weg (${namen})`,
      });
    }
    return aus;
  }
  for (const z of teile.values()) {
    const t = z.teil;
    z.fehlt_min = Math.max(0, z.soll_min - z.ist_min);
    z.ueber_min = Math.max(0, z.ist_min - z.soll_min);
    z.gedeckt_min = Math.min(z.ist_min, Math.max(0, z.soll_min));
    const konflikte = z.vk.filter((v) => v.flags.includes('konflikt'));
    if (konflikte.length) flagge(z, 'plan', 'konflikt', `Überschneidung an ${konflikte.length} Termin${konflikte.length > 1 ? 'en' : ''} (erster: ${datumKurz(konflikte[0].datum)})`);
    z.flags.push(...sperren(z.vk));
    if (z.soll_min > 0 && z.ist_min === 0 && !z.flags.some((f) => ['termine_offen', 'wahl_offen'].includes(f.art))) flagge(z, 'plan', 'ungeplant', `Nicht eingeplant — ${stunden(z.soll_min)} fehlen`);
    else if (z.fehlt_min >= regeln.toleranz_min && z.ist_min > 0) {
      // Strukturell: Alle Termine stehen fest, mehr gibt es nicht. Dann hilft kein Block, nur eine
      // Umwidmung in einen anderen Teil des Moduls.
      const fest = (t.art === 'praesenz' && !z.flags.some((f) => f.roh === 'info'))
        || (t.art === 'video' && z.video_rest_min && z.fehlt_min <= z.video_rest_min + regeln.toleranz_min);
      z.strukturell = !!fest;
      flagge(z, 'plan', 'luecke', fest
        ? (t.art === 'video' ? `Die Videos sind kürzer: ${stunden(z.fehlt_min)} bleiben übrig — umwidmen` : `Nur ${z.vk.length} Termine: ${stunden(z.fehlt_min)} finden hier nicht statt — umwidmen`)
        : `${stunden(z.fehlt_min)} fehlen noch (${stunden(z.ist_min)} von ${stunden(z.soll_min)})`);
    }
    if (z.ueber_min > regeln.toleranz_min) flagge(z, 'hinweis', 'ueber', `${stunden(z.ueber_min)} mehr als in der Modulbeschreibung`);
    if (t.offen && !z.flags.some((f) => f.text === t.offen)) flagge(z, 'info', 'offen', t.offen);
    // Eine Annahme ist gelb, bis Silas sie bestätigt (plan.bestaetigt) oder den Wert ändert.
    const bestaetigt = (plan.bestaetigt || {});
    if (t.annahme && !bestaetigt[`soll:${t.id}`]) flagge(z, 'hinweis', 'annahme', `Annahme: ${t.annahme}`);
    for (const o of t.optionen || []) if (o.annahme && !bestaetigt[`option:${o.id}`]) flagge(z, 'hinweis', 'annahme', `${o.label}: ${o.annahme}`);
    if (t.unsicher) flagge(z, 'hinweis', 'unsicher', t.unsicher);
    if (t.hinweis) flagge(z, 'hinweis', 'hinweis', t.hinweis);
  }

  // 8 · Module und Semester
  const module = (angebot.module || []).map((m) => {
    const zs = (m.teile || []).map((t) => teile.get(t.id));
    const soll = m.lp * regeln.lp_h * 60;
    const posten = (m.posten || []).reduce((s, p) => s + postenGesamt(p), 0);
    const r = {
      modul: m, teile: zs, soll_min: soll, posten_min: posten,
      gedeckt_min: zs.reduce((s, z) => s + z.gedeckt_min, 0),
      ist_min: zs.reduce((s, z) => s + z.ist_min, 0),
      ueber_min: zs.reduce((s, z) => s + z.ueber_min, 0),
      flags: [],
    };
    r.fehlt_min = Math.max(0, soll - r.gedeckt_min);
    // Was an einer Prüfung offen oder unsicher ist (Raum, Bestehensgrenze, Anmeldefrist), soll links sichtbar sein.
    for (const p of m.pruefungen || []) {
      if (p.offen) r.flags.push({ roh: 'info', art: 'pruefung_offen', text: `${p.titel}: ${p.offen}`, pruefung: p.id });
      if (p.unsicher) r.flags.push({ roh: 'hinweis', art: 'pruefung_unsicher', text: `${p.titel}: ${p.unsicher}`, pruefung: p.id });
      for (const x of p.termine || []) {
        // Steht das Datum, ist ein fehlender Raum oder eine fehlende Uhrzeit nur eine Warnung (Silas, 11.10.).
        if (x.offen) r.flags.push({ roh: 'info', art: 'pruefung_offen', text: `${p.titel}${x.label ? ` (${x.label})` : ''}: ${x.offen}`, pruefung: p.id, nur_ort: istDatum(x.datum) && /raum|\bort\b|uhrzeit|zeit/i.test(x.offen) });
        if (x.unsicher && typeof x.unsicher === 'string') r.flags.push({ roh: 'hinweis', art: 'pruefung_unsicher', text: `${p.titel}${x.label ? ` (${x.label})` : ''}: ${x.unsicher}`, pruefung: p.id });
      }
      const datiert = (p.termine || []).filter((x) => istDatum(x.datum));
      if (p.wahl && datiert.length > 1 && !(plan.pruefungstermin || {})[p.id]) r.flags.push({ roh: 'plan', art: 'pruefung_wahl', text: `${p.titel}: Termin wählen (${datiert.map((x) => datumKurz(x.datum)).join(' oder ')})`, pruefung: p.id });
      const a = p.anmeldung;
      if (a && a.offen) r.flags.push({ roh: 'info', art: 'anmeldung_offen', text: `${p.titel}, Anmeldung: ${a.offen}`, pruefung: p.id });
      if (a && typeof a.unsicher === 'string') r.flags.push({ roh: 'hinweis', art: 'anmeldung_unsicher', text: `${p.titel}, Anmeldung: ${a.unsicher}`, pruefung: p.id });
    }
    for (const t of m.teile || []) {
      const a = t.anmeldung;
      if (a && a.offen) r.flags.push({ roh: 'info', art: 'anmeldung_offen', text: `${t.titel}, Anmeldung: ${a.offen}`, gruppe: t.id });
      if (a && typeof a.unsicher === 'string') r.flags.push({ roh: 'hinweis', art: 'anmeldung_unsicher', text: `${t.titel}, Anmeldung: ${a.unsicher}`, gruppe: t.id });
    }
    for (const e of angebot.termine || []) {
      if (e.modul === m.id && istDatum(e.datum) && typeof e.unsicher === 'string') r.flags.push({ roh: 'hinweis', art: 'termin_unsicher', text: `${e.titel} (${datumKurz(e.datum)}): ${e.unsicher}` });
      if (e.modul === m.id && !istDatum(e.datum)) r.flags.push({ roh: 'info', art: 'frist_offen', text: `${e.titel}: Datum offen${e.offen ? ` — ${e.offen}` : ''}` });
    }
    const pk = vorkommen.filter((v) => v.modul === m.id && v.quelle === 'pruefung' && v.flags.includes('konflikt'));
    for (const v of pk) r.flags.push({ roh: 'plan', art: 'pruefung_konflikt', nur_neben: !v.wichtig && v.mit.every((id) => { const o = vorkommen.find((x) => x.id === id); return o && o.quelle === 'pruefung' && !o.wichtig; }), text: `${v.titel} am ${datumKurz(v.datum)} überschneidet sich mit ${v.mit.map((id) => { const o = vorkommen.find((x) => x.id === id); return o ? (o.modul ? `${o.modul} ${o.titel || ''}` : o.titel) : id; }).join(', ')}` });
    // Je Posten müssen die Teile zusammen genau den Posten tragen — sonst fehlen Stunden still (oder es sind zu viele).
    for (const p of m.posten || []) {
      const summeTeile = zs.filter((z) => z.teil.posten === p.id).reduce((s, z) => s + z.soll_orig_min, 0);
      if (Math.abs(summeTeile - postenGesamt(p)) > 1) r.flags.push({ roh: 'info', art: 'posten_teile', text: `${p.titel}: Die Teile tragen ${stunden(summeTeile)}, der Posten hat ${stunden(postenGesamt(p))}` });
    }
    // Prüfungen ohne Termin, an denen kein Lernblock hängt (BuK E-Test 2): sonst sähe man sie nirgends.
    const gebunden = new Set(zs.map((z) => z.teil.pruefung).filter(Boolean));
    for (const p of m.pruefungen || []) {
      if (!gebunden.has(p.id) && !(p.termine || []).some((x) => istDatum(x.datum))) r.flags.push({ roh: 'info', art: 'datum_offen', text: `${p.titel}: Termin steht noch nicht fest`, pruefung: p.id });
    }
    if (Math.abs(posten - soll) > 1) r.flags.push({ roh: 'info', art: 'posten_summe', text: `Die Aufwandstabelle ergibt ${stunden(posten)}, ${m.lp} LP sind ${stunden(soll)}` });

    // Anmeldungen (Prüfung und Gruppe): „Jetzt anmelden“, solange das Fenster offen ist und Silas sie nicht als
    // erledigt markiert hat (plan.angemeldet). Die Stufe steht hier fest, nicht in einstufen().
    const angemeldet = plan.angemeldet || {};
    for (const p of m.pruefungen || []) {
      const st = anmeldeStufe(p.anmeldung, angemeldet[p.id], heute, true);
      if (st) r.flags.push({ roh: 'plan', art: 'anmelden', text: `${p.titel}: ${st.text}`, pruefung: p.id, stufe_fest: st.stufe, anmeldung: p.id });
    }
    for (const z of zs) {
      const st = anmeldeStufe(z.teil.anmeldung, angemeldet[z.teil.id], heute, false);
      if (st) z.flags.push({ roh: 'plan', art: 'anmelden', text: `${z.teil.titel}: ${st.text}`, stufe_fest: st.stufe, anmeldung: z.teil.id });
    }

    // Die Stufe jeder Meldung (V-0332). Silas, 11.10.: Orange = Achtung (Raum oder Uhrzeit fehlt, wenn das Datum
    // steht), Hellblau = „das musst du noch eintragen oder festlegen“, Grau = Hinweis, Rot nur kritisch. Alles zur
    // Prüfung ist grau, solange kein Prüfungstermin bekannt ist, orange, sobald einer bekannt ist, und rot, sobald für
    // dieses Modul die Anmeldung läuft. Die Prüfungsvorbereitung wird erst kritisch, wenn ihre Zeit da ist.
    const stand = pruefungsStand(m, heute);
    r.pruefungsstand = stand;
    for (const z of zs) {
      if (z.teil.art === 'pruefung') z.kritisch_ab = kritischAb(z, sem, regeln);
      for (const f of z.flags) f.stufe = einstufen(f, z, stand, heute);
      z.stufe = hoechste(z.flags);
      z.rot = z.stufe === 'kritisch';
      z.status = z.stufe;
    }
    for (const f of r.flags) f.stufe = einstufen(f, null, stand, heute);
    r.stufe = hoechste([...r.flags, ...zs.map((z) => ({ stufe: z.stufe }))]);
    r.rot = r.stufe === 'kritisch';
    r.offen = zs.filter((z) => z.rot).length;
    return r;
  });
  const summe = {
    soll_min: module.reduce((s, m) => s + m.soll_min, 0),
    gedeckt_min: module.reduce((s, m) => s + m.gedeckt_min, 0),
    ueber_min: module.reduce((s, m) => s + m.ueber_min, 0),
  };
  // Silas, 11.10.: „die Zahl davor muss alles zusammengerechnet sein und dahinter muss stehen minus so und so viele
  // Stunden, die zu viel eingeplant sind.“ eingeplant − zu viel = gedeckt.
  summe.ist_min = module.reduce((s, m) => s + m.ist_min, 0);
  summe.fehlt_min = Math.max(0, summe.soll_min - summe.gedeckt_min);
  summe.offen = module.reduce((s, m) => s + m.offen, 0);
  // Blöcke ohne Bestandteil (Puffer, Wochenstart) haben kein Modul: Ihre Meldungen stehen hier.
  const planFlags = sperren(vorkommen.filter((v) => v.quelle === 'block' && !v.teil));
  for (const f of planFlags) f.stufe = einstufen(f, null, null, heute);
  summe.zaehler = Object.fromEntries(STUFEN.map((st) => [st, 0]));
  for (const r of module) { for (const f of r.flags) summe.zaehler[f.stufe] += 1; for (const z of r.teile) for (const f of z.flags) summe.zaehler[f.stufe] += 1; }
  for (const f of planFlags) summe.zaehler[f.stufe] += 1;
  // Das Wochensoll: alle wöchentlichen Posten (Multiplikator 15) einer Woche, wie in Silas' Semesterplan.
  summe.woche_min = (angebot.module || []).reduce((s, m) => s + (m.posten || []).filter((p) => p.mult > 1).reduce((a, p) => a + p.h * 60, 0), 0);

  vorkommen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : (a.start ?? -1) - (b.start ?? -1)));
  // Wiederholungen (Silas, 11.10.: „pro Eintrag, wie oft sich dieser Eintrag … bis zum Ende des Semesters wiederholt
  // … da wird dann auch sofort klar, welche sich nicht wiederholen“). Ein Eintrag ist ein Muster eines Termins (eine
  // Serie, eine Reihe), ein Block oder eine Prüfung; je Vorkommen: das wievielte (nr), wie viele insgesamt (gesamt) und
  // wie viele ab ihm noch kommen, es eingeschlossen (rest).
  const reihen = new Map();
  for (const v of vorkommen) {
    const k = v.quelle === 'termin' ? `t|${v.teil}|${v.option || ''}|${v.muster ?? 0}` : v.quelle === 'block' ? `b|${v.block}` : `e|${v.id}`;
    reihen.set(k, [...(reihen.get(k) || []), v]);
  }
  for (const vs of reihen.values()) vs.forEach((v, i) => { v.nr = i + 1; v.gesamt = vs.length; v.rest = vs.length - i; });
  return { sem, regeln, wochen: wo, vorkommen, teile, module, summe, konflikte, planFlags, heute: optionen.heute || null };
}

/** Je Schritt: wie viele Meldungen welcher Stufe, und wie viele Stunden seine Bestandteile tragen und gedeckt haben.
 *  Meldungen an einem Modul gehören zu den Prüfungen (5), wenn sie eine Prüfung betreffen, sonst zu Schritt 1
 *  (Aufwandstabelle, Einzeltermine). Ergebnis: die vier Schritte und dahinter (Index 4) die Prüfungen. */
export function schrittVonFlagge(f, z) {
  if (z) return schrittVon(z.teil);
  if (f.art === 'gesperrt') return 4;
  if (f.gruppe) return 2; // die Anmeldung einer Gruppe (am Modul gemeldet)
  return f.pruefung || PRUEFUNGSTHEMEN.has(f.art) ? PRUEFUNGEN : 1;
}
export function schritte(erg) {
  const aus = [...SCHRITTE, { nr: PRUEFUNGEN, id: 'pruefungen', titel: 'Prüfungen', satz: 'Prüfungen, Anmeldungen und Prüfungsvorbereitung — nach dem Festlegen' }]
    .map((s) => ({ ...s, zaehler: Object.fromEntries(STUFEN.map((st) => [st, 0])), soll_min: 0, gedeckt_min: 0, teile: [] }));
  for (const r of erg.module) {
    for (const f of r.flags) aus[schrittVonFlagge(f, null) - 1].zaehler[f.stufe] += 1;
    for (const z of r.teile) {
      const s = aus[schrittVon(z.teil) - 1];
      for (const f of z.flags) s.zaehler[f.stufe] += 1;
      s.soll_min += z.soll_min; s.gedeckt_min += z.gedeckt_min; s.teile.push(z);
    }
  }
  for (const f of erg.planFlags || []) aus[3].zaehler[f.stufe] += 1;
  for (const s of aus) s.offen = s.zaehler.kritisch + s.zaehler.dran;
  return aus;
}

/** Zurück auf die Grundlage (Silas: „wenn man auf Zurücksetzen drückt, die absolute Foundation muss sein …“): nimmt
 *  alles aus den Schritten `ab` bis 4 weg — ab 2 die Gruppenwahl, ab 3 die Video-Blöcke, ab 4 die übrigen Blöcke —
 *  und hebt es in `zurueckgesetzt` auf (Silas' Daten werden nie gelöscht; wiederherstellen() holt es zurück). Was
 *  Silas über das Angebot weiß (Videolängen, Uhrzeiten, Anmeldungen, bestätigte Annahmen, Umwidmungen) und alles zu
 *  den Prüfungen (gewählte Prüfungstermine, Lerntage) bleibt; ein festgelegter Plan ist danach wieder in Arbeit. */
export function zuruecksetzen(plan, angebot, ab = 2, { am = null } = {}) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const teil = new Map(teileVon(angebot).map((x) => [x.teil.id, x.teil]));
  const weg = (b) => { const s = schrittVonBlock(b.teil ? teil.get(b.teil) : null); return s >= ab && s <= 4; };
  const fort = { am, ab, wahl: ab <= 2 ? neu.wahl || {} : {}, bloecke: (neu.bloecke || []).filter(weg) };
  if (ab <= 2) delete neu.wahl;
  neu.bloecke = (neu.bloecke || []).filter((b) => !weg(b));
  delete neu.festgelegt;
  // Ein zweites Zurücksetzen legt das Aufgehobene dazu, statt es zu überschreiben.
  const alt = neu.zurueckgesetzt;
  if (Object.keys(fort.wahl).length || fort.bloecke.length) {
    neu.zurueckgesetzt = alt ? { ...fort, wahl: { ...alt.wahl, ...fort.wahl }, bloecke: [...alt.bloecke, ...fort.bloecke.filter((b) => !alt.bloecke.some((x) => x.id === b.id))] } : fort;
  }
  return neu;
}

/** Was zurückgesetzt wurde, wieder einsetzen: Gruppen, wo noch keine gewählt ist, Blöcke, deren Id es nicht gibt. */
export function wiederherstellen(plan) {
  const neu = JSON.parse(JSON.stringify(plan || {}));
  const z = neu.zurueckgesetzt;
  if (!z) return neu;
  neu.wahl = { ...z.wahl, ...(neu.wahl || {}) };
  const ids = new Set((neu.bloecke || []).map((b) => b.id));
  neu.bloecke = [...(neu.bloecke || []), ...z.bloecke.filter((b) => !ids.has(b.id))];
  delete neu.zurueckgesetzt;
  return neu;
}

/** Was einen neuen oder verschobenen Block verbietet (V-0333): Gesperrt ist, was im Raster als Termin steht — in der
 *  Standardwoche die wiederkehrenden Termine (Serien, Reihen ab drei Terminen, gewählte Gruppen), an einem Datum die
 *  Termine und Prüfungen dieses Tages. Ein Wochenblock, der nur an einzelnen Tagen auf einen Termin trifft (der
 *  Kick-off), bleibt erlaubt; dort fällt er weg (Meldung „gesperrt“, Hinweis). Ergebnis: die Namen dessen, was im Weg
 *  ist — leer heißt frei. entwurf: { tag (0 = Mo), datum?, start, ende (Minuten), woechentlich }. */
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

/** Die Vorgabe je Woche (V-0335, Silas: „dass man einfach die Vorgabe bekommt: um die Gesamtstunden über das Semester
 *  innerhalb der Vorlesungszeit zu erreichen, müsstest du in der Woche zwei Stunden für Statistik blocken“). Gerechnet
 *  auf das Soll abzüglich der Toleranz (±2 h melden ohnehin nichts):
 *  - Video: EIN Block je Woche, von der Woche der ersten Freigabe bis zum Ende der Vorlesungszeit, so lang, dass er
 *    das Soll deckt — höchstens aber, was die Videos mit Puffer brauchen (mehr zählt nicht: Ein Block ohne Video ist
 *    leer). Aufs Raster aufgerundet. Was liegen bleibt, holt der nächste Block nach (rechnen(), Schritt 6).
 *  - EVL: Blöcke von evl_min_min bis evl_block_min (1,5–2 h, Silas: „mindestens anderthalb Stunden … einfach zwei
 *    Stunden“); k je Woche oder einer alle n Wochen — was dem Soll am nächsten kommt, bei Gleichstand der längere Block.
 *  Ergebnis: { dauer_min, anzahl (je Woche), alle (jede n-te Woche), wochen (wie oft er liegt), summe_min, soll_min,
 *  bis (letzter Tag, wenn er eine Woche vor dem Ende aufhört) }
 *  oder null (Präsenz, Prüfung, kein Soll). Was tatsächlich zählt, rechnet danach rechnen() an den echten Tagen. */
export function vorgabe(erg, teilId) {
  const z = erg.teile.get(teilId);
  if (!z || !(z.soll_min > 0) || !['video', 'selbst'].includes(z.teil.art)) return null;
  const r = erg.regeln;
  const vlWochen = erg.wochen.filter((w) => w.art === 'vorlesung');
  const vl = vlWochen.length || 15;
  if (z.teil.art === 'video') {
    const ab = z.gruppen && z.gruppen.length ? montagVon(z.gruppen[0].ab) : vlWochen[0].von;
    const w = vlWochen.filter((x) => x.von >= ab).length || vl;
    const ziel = Math.max(r.raster_min, Math.min(z.soll_min - r.toleranz_min, z.video_bedarf_min || Infinity));
    const dauer = Math.max(r.raster_min, aufRaster(ziel / w, r.raster_min));
    return { dauer_min: dauer, anzahl: 1, alle: 1, wochen: w, summe_min: dauer * w, soll_min: z.soll_min, video_min: z.video_bedarf_min || null, bis: null };
  }
  // Die Modulbeschreibungen rechnen mit 15 Wochen, das Semester hat 16 Vorlesungswochen: Ein Wochenblock darf darum
  // eine Woche früher enden (`bis`) — sonst plante jede Vorgabe 32 h für 30 h (Silas' Prüfung der Wochenlast, V-0336).
  // Mehr wird nicht gekürzt: Ein Block soll das Semester durchlaufen, nicht nach W10 aufhören.
  let beste = null;
  for (let L = r.evl_block_min; L >= r.evl_min_min; L -= 15) {
    for (let k = 1; k <= 4; k++) {
      for (let alle = 1; alle <= (k === 1 ? 8 : 1); alle++) {
        const moeglich = Math.ceil(vl / alle);
        for (const wochen of [moeglich, moeglich - 1]) {
          if (wochen < 1) continue;
          const summe = k * L * wochen;
          const abstand = Math.abs(summe - z.soll_min);
          if (!beste || abstand < beste.abstand - 1) {
            beste = { dauer_min: L, anzahl: k, alle, wochen, summe_min: summe, soll_min: z.soll_min, abstand,
              bis: wochen < moeglich ? vlWochen[(wochen - 1) * alle].bis : null };
          }
        }
      }
    }
  }
  delete beste.abstand;
  return beste;
}

/** Freie Fenster eines Tages: wo zwischen von und bis (Minuten) ein Block der Länge dauer passt, ohne etwas zu
 *  überdecken. belegt: [[start, ende], …]. Ergebnis: [[start, ende], …] — die ganzen freien Strecken. */
export function freieFenster(belegt, dauer, von, bis) {
  const b = belegt.map(([s, e]) => [Math.max(von, s), Math.min(bis, e)]).filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
  const aus = [];
  let cursor = von;
  for (const [s, e] of [...b, [bis, bis]]) {
    if (s - cursor >= dauer) aus.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  return aus;
}

// ── Sichten ──────────────────────────────────────────────────────────────────────────────────────

/** Was in einer Woche liegt, und wie viele Stunden das sind. */
export function woche(erg, wocheId) {
  const w = erg.wochen.find((x) => x.id === wocheId);
  const vk = erg.vorkommen.filter((v) => v.datum >= w.von && v.datum <= w.bis || (v.bis && v.datum < w.von && v.bis >= w.von));
  const proTag = Array(7).fill(0);
  let ects = 0, belegt = 0;
  for (const v of vk) {
    if (v.ganztag || v.start == null || v.ende == null) continue;
    if (v.quelle === 'pruefung' && !v.wichtig) continue; // Ausweichtermin: nur im Notfall
    const d = wochentag(v.datum < w.von ? w.von : v.datum);
    // Belegt ist, was im Kalender blockiert ist: ein c.t.-Termin mit seiner Doppelstunde (16–18).
    const dauer = v.quelle === 'termin' ? zaehltMin(v.start, v.ende, v.ct) : v.ende - v.start;
    proTag[d] += dauer;
    belegt += dauer;
    ects += v.zaehlt_min;
  }
  return { woche: w, vorkommen: vk, proTag, belegt_min: belegt, ects_min: ects };
}

/** Was in einer Woche dran wäre und was davon eingeplant ist — je Bestandteil (Silas, 11.10.: „für diese Woche: was
 *  wäre theoretisch dran und was ist davon tatsächlich eingeplant … und dann unten in dieser Liste, was ist noch
 *  offen“). Ohne wocheId: die Standardwoche (eine typische Vorlesungswoche). Prüfungsvorbereitung gehört in die
 *  vorlesungsfreie Zeit und fehlt hier. grund: ok · kommt (Termine kommen noch) · waehlen · planen. */
export function wochenBedarf(angebot, plan, erg, wocheId = null) {
  const w = wocheId ? erg.wochen.find((x) => x.id === wocheId) : null;
  const vlWochen = erg.wochen.filter((x) => x.art === 'vorlesung').length || 15;
  const inWoche = (v) => w && v.datum >= w.von && v.datum <= w.bis;
  const kacheln = w ? null : standardwoche(angebot, plan, erg);
  const aus = [];
  for (const z of erg.teile.values()) {
    const t = z.teil;
    if (t.art === 'pruefung') continue;
    const woechentlich = z.posten && z.posten.mult > 1;
    const vorlesung = !w || w.art === 'vorlesung';
    let soll = 0, ist = 0, grund = 'ok';
    if (w) ist = z.vk.filter(inWoche).reduce((s, v) => s + v.zaehlt_min, 0);
    else ist = kacheln.filter((k) => k.teil === t.id && !k.reihe).reduce((s, k) => s + (k.art === 'termin' ? zaehltMin(k.start, k.ende, t.ct !== false) : k.ende - k.start), 0);
    if (t.art === 'praesenz') {
      const ohneTermine = z.flags.some((f) => f.art === 'termine_offen');
      const ohneWahl = z.flags.some((f) => f.art === 'wahl_offen');
      if (ohneTermine) { soll = vorlesung && woechentlich ? Math.round(z.soll_min / vlWochen) : 0; grund = 'kommt'; }
      else if (ohneWahl) {
        const opt = (t.optionen || [])[0];
        const termine = opt ? muster(opt).flatMap((mu) => termineAus(mu, erg.sem)) : [];
        soll = w ? termine.filter((x) => x.datum >= w.von && x.datum <= w.bis).reduce((s, x) => s + zaehltMin(x.start, x.ende), 0) : (termine[0] ? zaehltMin(termine[0].start, termine[0].ende) : 0);
        grund = 'waehlen';
      } else soll = ist; // Termine stehen fest: Was stattfindet, ist auch im Plan.
    } else if (!woechentlich || !vorlesung) {
      soll = 0; // einmalige Posten (Literatur 5 h) zählen fürs Semester, nicht für eine Woche
    } else if (w && z.gruppen && z.gruppen.length) {
      // Videos und Einheiten: was in dieser Woche geschaut wird — die Woche des ersten Blocks, der eine Freigabe deckt,
      // ohne Block die Woche der Freigabe. Ein BuK-Video vom Freitag, das Silas am Montag darauf schaut, gehört in die
      // Woche des Montags, nicht in die der Freigabe (sonst fehlte es in jeder Woche einmal scheinbar).
      const schauwoche = (g) => { const v = g.bloecke.length && z.vk.find((x) => x.id === g.bloecke[0]); return v ? montagVon(v.datum) : g.montag; };
      soll = z.gruppen.filter((g) => schauwoche(g) === w.id).reduce((s, g) => s + (g.bedarf_min || Math.round(z.soll_min / vlWochen)), 0);
      if (!soll && t.art === 'selbst' && z.gruppen.some((g) => g.ab <= w.bis && (!g.bis || g.bis >= w.von))) soll = Math.round(z.soll_min / vlWochen);
    } else soll = Math.round(z.soll_min / vlWochen);
    const offen = Math.max(0, soll - ist);
    if (grund === 'ok' && offen >= 15) grund = 'planen';
    if (grund !== 'ok' && grund !== 'planen' && !soll) grund = 'ok';
    aus.push({ z, soll_min: soll, ist_min: ist, offen_min: grund === 'ok' ? 0 : offen, grund });
  }
  return aus;
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

/** Die Standardwoche: was jede Woche wiederkehrt — Serien, gewählte Gruppen, Wochenblöcke —, und
 *  die Reihen an ihrem typischen Platz mit „nur 7×“. */
export function standardwoche(angebot, plan, erg) {
  const kacheln = [];
  const wahl = (plan && plan.wahl) || {};
  for (const { teil: t, modul: m } of teileVon(angebot)) {
    if (t.art !== 'praesenz') continue;
    const z = erg.teile.get(t.id);
    const quelle = istWahl(t) ? (t.optionen || []).find((o) => o.id === wahl[t.id]) : t;
    if (!quelle) continue;
    for (const mu of muster(quelle)) {
      const vk = z.vk.filter((v) => mu.typ === 'serie'
        ? wochentag(v.datum) === TAGE.indexOf(mu.tag) && v.start === min(mu.start)
        : (mu.daten || []).some((x) => x.datum === v.datum));
      // Ein, zwei Einzeltermine (der Kick-off) sind kein Wochenmuster: Sie stehen rechts und in der echten Woche.
      if (!vk.length || (mu.typ === 'reihe' && vk.length < 3)) continue;
      const platz = mu.typ === 'serie' ? { tag: TAGE.indexOf(mu.tag), start: min(mu.start), ende: min(mu.ende) } : typischerPlatz(vk);
      kacheln.push({
        art: 'termin', schicht: istWahl(t) ? 'B' : 'A', teil: t.id, modul: m.id, option: quelle === t ? null : quelle.id,
        ...platz, ort: mu.ort || quelle.ort || t.ort || null, reihe: mu.typ === 'reihe', anzahl: vk.length, vk,
        unsicher: !!t.unsicher,
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
      // Wie oft diese Option mit dem übrigen Plan kollidiert — an den echten Tagen gerechnet.
      let kollision = 0;
      for (const x of termine) {
        if (erg.vorkommen.some((v) => v.teil !== t.id && v.datum === x.datum && v.start != null && !v.ganztag && v.start < x.ende && x.start < v.ende && v.quelle !== 'block')) kollision += 1;
      }
      aus.push({ art: 'option', teil: t.id, modul: m.id, option: o.id, label: o.label, ...platz, ort: mu.ort || o.ort || null, reihe: mu.typ === 'reihe', anzahl: termine.length, kollision, termine, notiz: o.notiz || null });
    }
  }
  return aus;
}

// ── Annahmen und Lücken an einem Ort ────────────────────────────────────────────────────────────
// Silas, 11.10.: „Gibt es einen Ort, an dem ich einmal alle Annahmen als Liste sehe und auf diese antworten kann,
// beziehungsweise dort Werte verändern könnte manuell? Und genau das Gleiche mit den Warnungen.“

/** Feste Regeln (mit Quelle, nicht änderbar) und Stellschrauben (änderbar, im Angebot unter `regeln`). */
export const REGEL_TEXTE = [
  { feld: 'lp_h', titel: '1 Leistungspunkt = 30 Zeitstunden', quelle: 'AllgStuPO der TU Berlin § 45 Abs. 2; Musterrechtsverordnung § 8: 25–30 h', fest: true },
  { feld: 'ct', titel: 'Ein c.t.-Termin (16:15–17:45) belegt die Doppelstunde (2 h)', quelle: 'Modulbeschreibungen: 2 SWS = 2 h Präsenzzeit je Woche', fest: true },
  { feld: 'video_puffer_min', titel: 'Puffer je Videowoche', einheit: 'min', quelle: 'Silas: „1:45 Video → 2 h einplanen“' },
  { feld: 'raster_min', titel: 'Blöcke aufrunden auf', einheit: 'min', quelle: 'Silas: „1:45 Video → 2 h einplanen“' },
  { feld: 'lerntag_h', titel: 'Länge eines Lerntags', einheit: 'h', quelle: 'Faustregel aus Silas’ Semesterplan: Stunden ÷ 6 = Lerntage' },
  { feld: 'toleranz_min', titel: 'Lücken darunter gelten als gedeckt', einheit: 'min', quelle: 'Rundung' },
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
    const auf = z.flags.find((f) => f.art === 'aufteilung');
    if (t.annahme || auf || (t.soll_h != null && z.posten && Math.round(t.soll_h * 60) !== postenGesamt(z.posten))) {
      aus.push({
        id: `soll:${t.id}`, art: 'soll', modul: m.id, teil: t.id, titel: t.annahme || (auf ? auf.text : `Anteil am Posten „${z.posten.titel}“`),
        quelle: t.quelle || null, feld: 'soll_h', wert: Math.round(z.soll_orig_min / 15) / 4, einheit: 'h',
        satz: z.posten ? `${z.posten.titel}: ${z.posten.mult} × ${z.posten.h} h = ${stunden(postenGesamt(z.posten))} — dieser Teil trägt` : '',
      });
    }
    if (t.art === 'video') {
      const ohne = (z.einheiten || []).filter((e) => e.laenge_min == null).length;
      if (ohne || !z.einheiten) {
        aus.push({ id: `video:${t.id}`, art: 'video', modul: m.id, teil: t.id, titel: z.einheiten ? `${ohne} von ${z.einheiten.length} Videos ohne Länge — so lang angenommen` : 'Videolänge unbekannt — so lang angenommen', feld: 'annahme_min', wert: (t.einheiten && t.einheiten.annahme_min) || 90, einheit: 'min', quelle: 'Schätzung (2 SWS = 90 min)' });
      }
    }
    for (const o of t.optionen || []) if (o.annahme) aus.push({ id: `option:${o.id}`, art: 'text', modul: m.id, teil: t.id, titel: `${o.label}: ${o.annahme}`, quelle: o.quelle || null });
  }
  return aus;
}

/** Alle Lücken und Warnungen, nach Stufe: rot (Info fehlt, nicht geplant), gelb (unsicher, Hinweis). */
export function luecken(erg) {
  const aus = [];
  for (const r of erg.module) {
    for (const f of r.flags) aus.push({ ...f, modul: r.modul.id, teil: null });
    for (const z of r.teile) for (const f of z.flags) if (!['aufteilung'].includes(f.art)) aus.push({ ...f, modul: r.modul.id, teil: z.teil.id });
  }
  for (const f of erg.planFlags || []) aus.push({ ...f, modul: null, teil: null });
  return aus.sort((a, b) => RANG[a.stufe] - RANG[b.stufe]);
}

// ── Hilfen zum Planen ────────────────────────────────────────────────────────────────────────────
// Keine Vorschläge (V-0333, Silas: „Es sollen nicht so wie jetzt Vorschläge zu den ganzen Sachen kommen, sondern man
// soll die selber wählen können“): Der Lernplan-Vorschlag ist entfernt; was bleibt, misst nur.

/** Die größte freie Lücke eines Tages im Lernfenster: [start, ende] in Minuten, oder null (unter 60 min). */
export function freieLuecke(erg, datum, extra = []) {
  const [fa, fe] = erg.regeln.lernfenster.map(min);
  const belegt = erg.vorkommen.filter((v) => v.datum === datum && v.start != null && v.ende != null && !v.ganztag).map((v) => [v.start, v.ende]).concat(extra);
  belegt.sort((a, b) => a[0] - b[0]);
  let beste = null, cursor = fa;
  for (const [s, e] of [...belegt, [fe, fe]]) {
    const ende = Math.min(s, fe);
    if (ende - cursor >= 60 && (!beste || ende - cursor > beste[1] - beste[0])) beste = [cursor, ende];
    cursor = Math.max(cursor, e);
  }
  return beste;
}

/** Wohin Stunden umgewidmet werden können, die strukturell nicht stattfinden: die Teile desselben
 *  Moduls, die selbst geplant werden (Lernen, Videos, Prüfungsvorbereitung) — Prüfungen zuerst. */
export function umwidmungsZiele(erg, teilId) {
  const z = erg.teile.get(teilId);
  if (!z) return [];
  const rang = { pruefung: 0, selbst: 1, video: 2 };
  return z.modul.teile
    .filter((t) => t.id !== teilId && t.art in rang)
    .sort((a, b) => rang[a.art] - rang[b.art])
    .map((t) => erg.teile.get(t.id));
}

// ── Export: Ereignisse für das Study OS und den Kalender ─────────────────────────────────────────
// Jedes konkrete Vorkommen mit stabiler Id, Zeitpunkt mit Zeitzone und Schicht (docs/SILAS.md §6):
// A Fixtermin · B Wahltermin · C Frist/Einzeltermin · D Lernblock · R Semesterrahmen. Das Study OS
// liest diese Liste (die Timeline ist die Lesesicht, geplant wird hier).

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
  return erg.vorkommen.map((v) => {
    const m = (angebot.module || []).find((x) => x.id === v.modul);
    const e = {
      id: v.id, schicht: v.schicht, quelle: v.quelle, art: ART_TEXT[v.quelle] || v.quelle,
      modul: v.modul, modulnummer: m && m.nr ? String(m.nr) : null, titel: titelVon(v, erg, angebot),
      datum: v.datum, bis: v.bis || null, ort: v.ort || null, online: v.online || null,
      ganztag: !!v.ganztag || v.start == null, wichtig: !!v.wichtig, unsicher: !!v.unsicher,
      teil: v.teil || null, zaehlt_min: v.zaehlt_min, flags: v.flags,
    };
    if (!e.ganztag) { e.start = isoZeit(v.datum, v.start); e.ende = isoZeit(v.datum, v.ende ?? v.start); }
    if (v.punkt != null) e.uhrzeit = hhmm(v.punkt);
    return e;
  });
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
      for (const quelle of [t, ...(t.optionen || [])]) {
        for (const mu of muster(quelle)) {
          try { termineAus(mu, s || { frei: [] }); } catch (e) { f.push(`${t.id}: ${e.message}`); }
        }
      }
    }
  }
  return f;
}
