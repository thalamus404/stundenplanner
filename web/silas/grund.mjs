// Die Grundlagen von /silas (V-0349): Zeit, Semester, Termin-Muster, Einheiten und die Stellschrauben. Rein — kein
// DOM, kein Netz, keine Uhr außer der übergebenen. modell.mjs (die Vorkommen) und kontingent.mjs (das
// Kontingent-Modell) bauen darauf; modell.mjs reicht alles hier weiter, die Seite liest es als M.*.
//
// Ein Datum ist 'JJJJ-MM-TT' ohne Zeitzone, eine Uhrzeit sind Minuten ab Mitternacht (Berliner Ortszeit). Gerechnet
// wird in UTC-Tagen, damit die Umstellung auf Winterzeit (25.10.2026) keinen Tag verschiebt; die Zeitzone kommt erst
// beim Export dazu (isoZeit).

export const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const TAGE_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Die Stellschrauben. Jede steht in docs/SILAS.md §4 mit ihrem Grund; das Angebot darf sie überschreiben (`regeln`).
export const REGELN = {
  lp_h: 30,              // AllgStuPO § 45 Abs. 2: 1 LP = 30 Zeitstunden
  katalog_wochen: 15,    // der Multiplikator der Modulbeschreibungen — eine wöchentliche Serie wird gegen höchstens so
                         // viele Termine geprüft, die 16. Woche ist die Woche Luft (Kontingent-Modell, Audit)
  video_puffer_min: 15,  // „1:45 Video → 2 h einplanen“ (Silas): Länge + Puffer, auf das Raster aufgerundet
  raster_min: 30,
  lerntag_h: 6,          // höchstens so lang ist ein Lernblock, den ein Tipp im Prüfungskalender legt
  lernfenster: ['09:00', '19:00'],
  pendeln_min: 45,       // Silas, 12.10. (V-0345): 45 min vor dem ersten und nach dem letzten Präsenztermin
  woche_h: 45,           // G8, Silas 12.10.: höchstens 45 h je Woche, alles eingerechnet
  tag_h: 9,              // G8, Silas V-0340/12.10.: „neun Stunden heißt maximale Auslastung pro Tag“
  toleranz_anteil: 0.1,  // Audit je Posten: passt bis 10 % Abweichung …
  toleranz_mind_min: 60, // … mindestens 1 h
  modul_meldung_min: 120, // Audit je Modul: „mehr“ oder „weniger“ über 2 h meldet das Modul (Silas, 11.10.: ±2 h)
  stichtag_tage: 14,     // § 65 Abs. 3 AllgStuPO: Prüfungstermine 14 Tage nach Modulbeginn bekannt
  anmeldung_tage: 7,     // § 63 Abs. 4: schriftliche Prüfung — Anmeldung bis eine Woche vorher
  abmeldung_tage: 3,     // § 63 Abs. 5: Abmeldung bis drei Tage vorher
  portfolio_tage: 1,     // § 63 Abs. 4 und 5: Portfolio — An- und Abmeldung bis einen Tag vor dem ersten Teil
  vorbehalt_tage: 14,    // § 63 Abs. 2: Vorbehalt bis zwei Wochen vor der Prüfung aufheben (Nachweis, Übungsschein)
  anmeldung_ab_tage: 14, // § 63 Abs. 4: Die Anmeldung beginnt in der Regel zwei Wochen nach Vorlesungsbeginn
  we_h: 10,              // Silas, V-0340: die zwei Wochenenden vor einer Prüfung je höchstens 10 h
  erwartet_min: 120,     // ein Termin, dessen Daten noch fehlen (Tutorium, Übung): eine Doppelstunde
  evl_block_min: 120,    // Silas, 11.10. (V-0335): „EVL-Block muss einfach zwei Stunden sein“ …
  evl_min_min: 90,       // … „mindestens anderthalb Stunden“
  lern_min_min: 45,      // V-0356: Vor-/Nachbereitung und Quizze in halben Blöcken (2 h → 2 × 1 h, 1,5 h → 2 × 45 min)
  evl_fenster: ['10:00', '18:00'], // freie Plätze dazwischen sind bevorzugt („alles zwischen 10 und 18 Uhr preferred“)
  tag_fenster: ['08:00', '20:00'], // wo freie Plätze überhaupt gesucht werden
  pruef_fenster: ['07:00', '22:00'], // Prüfungsvorbereitung: auch früh und abends (V-0337)
  mittag_min: 45, mittag_fenster: ['11:30', '14:30'], // Silas, V-0340: 45 min Mittagspause, nur gezeigt
  bezug_direkt_min: 120, // V-0342: ein Lernblock höchstens 2 h nach seinem Stoff (oder vor einer Präsenz) = „direkt“ …
  bezug_nah_tage: 3,     // … bis 3 Tage danach „nah“, später „weit weg vom Stoff“
};

// ── Zeit ─────────────────────────────────────────────────────────────────────────────────────────

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
export const datumTag = (iso) => `${TAGE[wochentag(iso)]} ${datumKurz(iso)}`;

/** Stunden für Menschen, auf Viertelstunden: 1,5 h, 12 h, 0,25 h. */
export function stunden(m) {
  const h = Math.round((m / 60) * 4) / 4;
  return `${String(h).replace('.', ',')} h`;
}
/** Stunden mit einer Nachkommastelle — für Wochenwerte, die keine Viertelstunden sind (1,9 h pro Woche). */
export function stunden1(m) {
  const h = Math.round((m / 60) * 10) / 10;
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
/** Die Gebäude der Universität sind zu (semester.geschlossen, V-0349: TU Berlin 17.12.2026 22:00 bis 05.01.2027 06:00 —
 *  „Ein Arbeiten in Präsenz wird in diesem Zeitraum grundsätzlich nicht möglich sein“). Präsenz vor Ort fällt aus. */
export function istGeschlossen(sem, datum) {
  return (sem.geschlossen || []).some((f) => datum >= f.von && datum <= f.bis);
}
/** Die Feiertage, an denen der Vorschlag nichts legt (Kontingent-Modell: 24.–26.12., 31.12., 01.01.). Legen darf Silas
 *  dort trotzdem. Das Angebot kann sie in semester.feiertage selbst nennen. */
export function feiertage(sem) {
  if (Array.isArray(sem.feiertage)) return new Set(sem.feiertage);
  const aus = new Set();
  const von = +sem.vorlesung.von.slice(0, 4), bis = +(sem.ende || sem.vorlesung.bis).slice(0, 4);
  for (let j = von; j <= bis; j++) for (const md of ['01-01', '12-24', '12-25', '12-26', '12-31']) aus.add(`${j}-${md}`);
  return aus;
}
/** Ein Vorlesungstag: in der Vorlesungszeit und nicht in einer Pause (die Weihnachtspause zählt nicht mit). */
export const istVorlesungstag = (sem, d) => d >= sem.vorlesung.von && d <= sem.vorlesung.bis && !istFrei(sem, d);

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
// Drei Formen (docs/SILAS.md §2.3): die Serie (wiederkehrend in einem Takt, mit Ausnahmen), die Reihe (feste Daten
// ohne Takt, z. B. EINFWI-Übung 5×) und der Einzeltermin (eine Reihe mit einem Datum).

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
      // Übung statt VL — ohne die Serie in eine Reihe aufzulösen.
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

/** Zählt ein Termin c.t., belegt er die volle Doppelstunde: 16:15–17:45 sind 2 h, denn das Viertel davor und danach
 *  ist der Weg, und die Modulbeschreibung rechnet 2 SWS als 2 h Präsenzzeit. */
export function zaehltMin(start, ende, ct = true) {
  const dauer = ende - start;
  return ct && start % 60 === 15 && ende % 60 === 45 ? dauer + 30 : dauer;
}

/** Online ohne Ort vor Ort (Zoom, ISIS): kein Weg, und eine Schließung der Gebäude trifft ihn nicht. */
export const nurOnline = (ort) => /^\s*(online|zoom|webex|isis)/i.test(String(ort || ''));

// ── Einheiten ────────────────────────────────────────────────────────────────────────────────────

/** Die Einheiten eines Video- oder Selbstlern-Teils (je Video, je Quiz), mit ihrem Freigabetag. Eine Liste steht im
 *  Angebot, oder ein Takt (jeden Freitag von … bis …) erzeugt sie. Ohne beides gibt es keine datierten Einheiten:
 *  Dann ist das Fenster „Info fehlt“, und `einheiten.anzahl` sagt, wie viele erwartet werden. */
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
    quelle: x.quelle || null, offen: x.offen || null, unsicher: x.unsicher || null, auf: x.auf || null,
  });
  if (Array.isArray(e.liste) && e.liste.length) {
    const mit = e.liste.filter((x) => istDatum(x.ab)).map(voll);
    return mit.length ? mit : null;
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

// ── Prüfungstermine ──────────────────────────────────────────────────────────────────────────────

/** Welcher Termin einer Prüfung gilt (G7): der gewählte (plan.pruefungstermin), sonst als Arbeitsannahme der früheste —
 *  ohne Nachholtermine (`nachholen: true`, z. B. der EINFWI-Test am 15.02. nur nach Rücktritt). Nach einem anerkannten
 *  Rücktritt oder einem Nichtbestehen (plan.pruefung[pid].status) gilt der nächste Termin; die Vorbereitung wandert mit.
 *  Ergebnis: { pruefung, termin, gewaehlt, annahme (Wahl offen, früheste angenommen), weiter (nächster Termin nach
 *  Rücktritt/Wiederholung), datiert, kandidaten }. */
export function pruefungsTermin(modul, pid, plan = {}) {
  const p = (modul.pruefungen || []).find((x) => x.id === pid);
  if (!p) return { pruefung: null, termin: null, gewaehlt: false, annahme: false, weiter: false, datiert: [], kandidaten: [] };
  const datiert = (p.termine || []).filter((x) => istDatum(x.datum)).slice().sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const kandidaten = datiert.filter((x) => !x.nachholen);
  const wahl = (plan.pruefungstermin || {})[p.id];
  let termin = (wahl && datiert.find((x) => x.datum === wahl)) || null;
  const gewaehlt = !!termin;
  // Ein Termin, den das Angebot als Rückfall kennzeichnet (wichtig: false), ist nie die Arbeitsannahme, solange es einen
  // anderen gibt.
  if (!termin) termin = kandidaten.find((x) => x.wichtig !== false) || kandidaten[0] || datiert[0] || null;
  const st = (plan.pruefung || {})[p.id] || {};
  let weiter = false;
  if (termin && ['ruecktritt_anerkannt', 'nicht_bestanden'].includes(st.status)) {
    const war = istDatum(st.termin) ? st.termin : termin.datum;
    termin = datiert.find((x) => x.datum > war) || null;
    weiter = true;
  }
  return { pruefung: p, termin, gewaehlt, annahme: !gewaehlt && !weiter && kandidaten.length > 1, weiter, datiert, kandidaten };
}

/** Die Art einer Prüfung für Zeitleiste und Farbe (V-0337, Silas: „A die Klausuren, B die E-Tests, C die Online-Tests
 *  und die schriftlichen Prüfungen“). Im Angebot überschreibt `art` die Herleitung aus dem Titel. */
export const PRUEFUNGSARTEN = [['klausur', 'Klausuren'], ['etest', 'E-Tests'], ['test', 'Online- und schriftliche Tests']];
export function pruefungsArt(p) {
  if (p.art && PRUEFUNGSARTEN.some(([a]) => a === p.art)) return p.art;
  const t = `${p.id} ${p.titel}`;
  if (/\be-?test/i.test(t)) return 'etest'; // nicht „Online-Test“ (onlin-e-Test)
  if (/klausur/i.test(t)) return 'klausur';
  return 'test';
}
/** Ein Teil einer Portfolioprüfung (Test + Klausur, E-Tests + Test): eine Anmeldung für alle Teile, Punkte statt Note. */
export const istPortfolio = (p) => /portfolio/i.test(String(p.form || ''));

// ── Freie Zeit ───────────────────────────────────────────────────────────────────────────────────

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
