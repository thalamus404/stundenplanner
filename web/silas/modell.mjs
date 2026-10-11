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
  toleranz_min: 15,     // darunter gilt eine Lücke als gedeckt
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
export const istWahl = (t) => t.art === 'praesenz' && (t.wahl || (t.optionen && t.optionen.length > 0));
export const kurz = (m) => m.kurz || m.id;
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
  const flagge = (z, stufe, art, text) => z.flags.push({ stufe, art, text });

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
    for (const m of muster(quelle)) {
      for (const x of termineAus(m, sem)) {
        const v = {
          id: `${t.id}@${x.datum}@${hhmm(x.start)}`, quelle: 'termin', schicht, teil: t.id, modul: z.modul.id,
          option: option && option.id, datum: x.datum, start: x.start, ende: x.ende,
          ort: x.ort || quelle.ort || t.ort || null, online: quelle.online || t.online || null,
          titel: x.titel, ct: t.ct !== false, zaehlt_min: 0, flags: [], mit: [],
          herkunft: x.quelle || quelle.quelle || t.quelle || null, unsicher: !!x.unsicher,
        };
        vorkommen.push(v); z.vk.push(v);
      }
    }
  }

  // 3 · Silas' Blöcke (Schicht D). Ein Wochenblock gilt in jeder Vorlesungswoche (in der Pause nur mit
  //     pause: true), ein Datumsblock genau an seinem Tag.
  for (const b of plan.bloecke || []) {
    const z = b.teil ? teile.get(b.teil) : null;
    const tage = [];
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
    }
    for (const d of tage) {
      const v = {
        id: `${b.id}@${d}`, quelle: 'block', schicht: 'D', block: b.id, teil: z ? z.teil.id : null,
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
    if (istDatum(a.von)) frist(`${id}-von`, modul, a.von, a.von_zeit, `${titel}: Anmeldung öffnet${wo}`, false, a, teil);
    if (istDatum(a.bis)) frist(`${id}-bis`, modul, a.bis, a.bis_zeit, `${titel}: Anmeldung endet${wo}${a.nur ? ` — nur ${a.nur}` : ''}`, true, a, teil);
  }
  function frist(id, modul, datum, zeit, titel, wichtig, herkunft, teil = null) {
    vorkommen.push({
      id, quelle: 'frist', schicht: 'C', modul, teil, datum, ganztag: true, punkt: zeit ? min(zeit) : undefined,
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
        vorkommen.push({
          id: `${p.id}@${x.datum}`, quelle: 'pruefung', schicht: 'A', modul: m.id, pruefung: p.id,
          datum: x.datum, ...zeit, titel: [p.titel, x.label].filter(Boolean).join(' · '), ort: x.ort || null,
          wichtig: x.wichtig !== false, unsicher: !!x.unsicher, zaehlt_min: 0, flags: [], mit: [],
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
      schicht: e.art === 'rahmen' ? 'R' : 'C', modul: e.modul || null, datum: e.datum, bis: e.bis || null, ...zeit,
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
        a.mit.push(b.id); b.mit.push(a.id);
        konflikte.push({ datum: a.datum, a: a.id, b: b.id, minuten: ueber });
        // Termin schlägt Block: Der Block verliert die überlappte Zeit, der Termin bleibt, wie er ist —
        // er ist nicht schuld (der Kick-off am 19.10. war rot, weil ein Wochenblock auf ihm lag).
        // Zwei Termine oder zwei Blöcke übereinander sind ein echter Konflikt für beide.
        const blockA = a.quelle === 'block', blockB = b.quelle === 'block';
        if (blockA && !blockB) { a.ueberlappt = (a.ueberlappt || 0) + ueber; marke(a, 'weicht'); }
        else if (blockB && !blockA) { b.ueberlappt = (b.ueberlappt || 0) + ueber; marke(b, 'weicht'); }
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
          if (unbekannt) flagge(z, 'info', 'laenge_offen', `${unbekannt} von ${liste.length} Videos ohne Länge — angenommen je ${annahme} min`);
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
  for (const z of teile.values()) {
    const t = z.teil;
    z.fehlt_min = Math.max(0, z.soll_min - z.ist_min);
    z.ueber_min = Math.max(0, z.ist_min - z.soll_min);
    z.gedeckt_min = Math.min(z.ist_min, Math.max(0, z.soll_min));
    const konflikte = z.vk.filter((v) => v.flags.includes('konflikt'));
    if (konflikte.length) flagge(z, 'plan', 'konflikt', `Überschneidung an ${konflikte.length} Termin${konflikte.length > 1 ? 'en' : ''} (erster: ${datumKurz(konflikte[0].datum)})`);
    const weicht = z.vk.filter((v) => v.flags.includes('weicht'));
    if (weicht.length) flagge(z, 'hinweis', 'weicht', `${weicht.length > 1 ? `${weicht.length} Blöcke weichen` : 'Ein Block weicht'} einem Termin (zuerst ${datumKurz(weicht[0].datum)}) — die überlappte Zeit zählt nicht`);
    if (z.soll_min > 0 && z.ist_min === 0 && !z.flags.some((f) => ['termine_offen', 'wahl_offen'].includes(f.art))) flagge(z, 'plan', 'ungeplant', `Nicht eingeplant — ${stunden(z.soll_min)} fehlen`);
    else if (z.fehlt_min >= regeln.toleranz_min && z.ist_min > 0) {
      // Strukturell: Alle Termine stehen fest, mehr gibt es nicht. Dann hilft kein Block, nur eine
      // Umwidmung in einen anderen Teil des Moduls.
      const fest = (t.art === 'praesenz' && !z.flags.some((f) => f.stufe === 'info'))
        || (t.art === 'video' && z.video_rest_min && z.fehlt_min <= z.video_rest_min + regeln.toleranz_min);
      z.strukturell = !!fest;
      flagge(z, 'plan', 'luecke', fest
        ? (t.art === 'video' ? `Die Videos sind kürzer: ${stunden(z.fehlt_min)} bleiben übrig — umwidmen` : `Nur ${z.vk.length} Termine: ${stunden(z.fehlt_min)} finden hier nicht statt — umwidmen`)
        : `${stunden(z.fehlt_min)} fehlen noch (${stunden(z.ist_min)} von ${stunden(z.soll_min)})`);
    }
    if (z.ueber_min > Math.max(60, z.soll_min * 0.15)) flagge(z, 'hinweis', 'ueber', `${stunden(z.ueber_min)} mehr als in der Modulbeschreibung`);
    if (t.offen && !z.flags.some((f) => f.text === t.offen)) flagge(z, 'info', 'offen', t.offen);
    // Eine Annahme ist gelb, bis Silas sie bestätigt (plan.bestaetigt) oder den Wert ändert.
    const bestaetigt = (plan.bestaetigt || {});
    if (t.annahme && !bestaetigt[`soll:${t.id}`]) flagge(z, 'hinweis', 'annahme', `Annahme: ${t.annahme}`);
    for (const o of t.optionen || []) if (o.annahme && !bestaetigt[`option:${o.id}`]) flagge(z, 'hinweis', 'annahme', `${o.label}: ${o.annahme}`);
    if (t.unsicher) flagge(z, 'hinweis', 'unsicher', t.unsicher);
    if (t.hinweis) flagge(z, 'hinweis', 'hinweis', t.hinweis);
    z.rot = z.flags.some((f) => f.stufe === 'info' || f.stufe === 'plan');
    z.info = z.flags.some((f) => f.stufe === 'info');
    z.status = z.rot ? (z.info ? 'info' : 'fehlt') : z.flags.some((f) => f.stufe === 'hinweis') ? 'hinweis' : 'ok';
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
      if (p.offen) r.flags.push({ stufe: 'info', art: 'pruefung_offen', text: `${p.titel}: ${p.offen}`, pruefung: p.id });
      if (p.unsicher) r.flags.push({ stufe: 'hinweis', art: 'pruefung_unsicher', text: `${p.titel}: ${p.unsicher}`, pruefung: p.id });
      for (const x of p.termine || []) {
        if (x.offen) r.flags.push({ stufe: 'info', art: 'pruefung_offen', text: `${p.titel}${x.label ? ` (${x.label})` : ''}: ${x.offen}`, pruefung: p.id });
        if (x.unsicher && typeof x.unsicher === 'string') r.flags.push({ stufe: 'hinweis', art: 'pruefung_unsicher', text: `${p.titel}${x.label ? ` (${x.label})` : ''}: ${x.unsicher}`, pruefung: p.id });
      }
      const datiert = (p.termine || []).filter((x) => istDatum(x.datum));
      if (p.wahl && datiert.length > 1 && !(plan.pruefungstermin || {})[p.id]) r.flags.push({ stufe: 'plan', art: 'pruefung_wahl', text: `${p.titel}: Termin wählen (${datiert.map((x) => datumKurz(x.datum)).join(' oder ')})`, pruefung: p.id });
      const a = p.anmeldung;
      if (a && a.offen) r.flags.push({ stufe: 'info', art: 'anmeldung_offen', text: `${p.titel}, Anmeldung: ${a.offen}`, pruefung: p.id });
      if (a && typeof a.unsicher === 'string') r.flags.push({ stufe: 'hinweis', art: 'anmeldung_unsicher', text: `${p.titel}, Anmeldung: ${a.unsicher}`, pruefung: p.id });
    }
    for (const t of m.teile || []) {
      const a = t.anmeldung;
      if (a && a.offen) r.flags.push({ stufe: 'info', art: 'anmeldung_offen', text: `${t.titel}, Anmeldung: ${a.offen}` });
      if (a && typeof a.unsicher === 'string') r.flags.push({ stufe: 'hinweis', art: 'anmeldung_unsicher', text: `${t.titel}, Anmeldung: ${a.unsicher}` });
    }
    for (const e of angebot.termine || []) {
      if (e.modul === m.id && istDatum(e.datum) && typeof e.unsicher === 'string') r.flags.push({ stufe: 'hinweis', art: 'termin_unsicher', text: `${e.titel} (${datumKurz(e.datum)}): ${e.unsicher}` });
      if (e.modul === m.id && !istDatum(e.datum)) r.flags.push({ stufe: 'info', art: 'frist_offen', text: `${e.titel}: Datum offen${e.offen ? ` — ${e.offen}` : ''}` });
    }
    const pk = vorkommen.filter((v) => v.modul === m.id && v.quelle === 'pruefung' && v.flags.includes('konflikt'));
    for (const v of pk) r.flags.push({ stufe: 'plan', art: 'pruefung_konflikt', text: `${v.titel} am ${datumKurz(v.datum)} überschneidet sich mit ${v.mit.map((id) => { const o = vorkommen.find((x) => x.id === id); return o ? (o.modul ? `${o.modul} ${o.titel || ''}` : o.titel) : id; }).join(', ')}` });
    // Je Posten müssen die Teile zusammen genau den Posten tragen — sonst fehlen Stunden still (oder es sind zu viele).
    for (const p of m.posten || []) {
      const summeTeile = zs.filter((z) => z.teil.posten === p.id).reduce((s, z) => s + z.soll_orig_min, 0);
      if (Math.abs(summeTeile - postenGesamt(p)) > 1) r.flags.push({ stufe: 'info', art: 'posten_teile', text: `${p.titel}: Die Teile tragen ${stunden(summeTeile)}, der Posten hat ${stunden(postenGesamt(p))}` });
    }
    // Prüfungen ohne Termin, an denen kein Lernblock hängt (BuK E-Test 2): sonst sähe man sie nirgends.
    const gebunden = new Set(zs.map((z) => z.teil.pruefung).filter(Boolean));
    for (const p of m.pruefungen || []) {
      if (!gebunden.has(p.id) && !(p.termine || []).some((x) => istDatum(x.datum))) r.flags.push({ stufe: 'info', art: 'datum_offen', text: `${p.titel}: Termin steht noch nicht fest`, pruefung: p.id });
    }
    if (Math.abs(posten - soll) > 1) r.flags.push({ stufe: 'info', art: 'posten_summe', text: `Die Aufwandstabelle ergibt ${stunden(posten)}, ${m.lp} LP sind ${stunden(soll)}` });
    r.rot = r.flags.some((f) => f.stufe !== 'hinweis') || zs.some((z) => z.rot);
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
  summe.info = [...teile.values()].filter((z) => z.info).length;
  // Das Wochensoll: alle wöchentlichen Posten (Multiplikator 15) einer Woche, wie in Silas' Semesterplan.
  summe.woche_min = (angebot.module || []).reduce((s, m) => s + (m.posten || []).filter((p) => p.mult > 1).reduce((a, p) => a + p.h * 60, 0), 0);

  vorkommen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : (a.start ?? -1) - (b.start ?? -1)));
  return { sem, regeln, wochen: wo, vorkommen, teile, module, summe, konflikte, heute: optionen.heute || null };
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
    const d = wochentag(v.datum < w.von ? w.von : v.datum);
    // Belegt ist, was im Kalender blockiert ist: ein c.t.-Termin mit seiner Doppelstunde (16–18).
    const dauer = v.quelle === 'termin' ? zaehltMin(v.start, v.ende, v.ct) : v.ende - v.start;
    proTag[d] += dauer;
    belegt += dauer;
    ects += v.zaehlt_min;
  }
  return { woche: w, vorkommen: vk, proTag, belegt_min: belegt, ects_min: ects };
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
  const rang = { info: 0, plan: 1, hinweis: 2 };
  return aus.sort((a, b) => rang[a.stufe] - rang[b.stufe]);
}

// ── Vorschläge ───────────────────────────────────────────────────────────────────────────────────

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

/** Ein Lernplan vor einer Prüfung: Rückwärts vom Tag vor der Prüfung (der bleibt als Puffer frei)
 *  sucht er je Tag die größte freie Lücke im Lernfenster, höchstens einen Lerntag lang, bis die
 *  fehlenden Stunden gedeckt sind. Sonntage bleiben frei. Ergebnis sind Datumsblöcke zum Übernehmen. */
export function lernplanVorschlag(erg, teilId, { tag_h, start, bis_tage = 120 } = {}) {
  const z = erg.teile.get(teilId);
  if (!z || !z.pruefungstermin) return [];
  const r = erg.regeln;
  const laenge = Math.round((tag_h || r.lerntag_h) * 60);
  const [fa, fe] = (start ? [start, r.lernfenster[1]] : r.lernfenster).map(min);
  let rest = z.fehlt_min;
  const aus = [];
  const pruefungstag = z.pruefungstermin.datum;
  for (let i = 2; i <= bis_tage && rest > 0; i++) {
    const d = plusTage(pruefungstag, -i);
    if (d < erg.sem.vorlesung.von) break;
    if (wochentag(d) === 6) continue;
    const belegt = erg.vorkommen
      .filter((v) => v.datum === d && v.start != null && v.ende != null && !v.ganztag)
      .map((v) => [v.start, v.ende]);
    if (erg.vorkommen.some((v) => v.datum === d && v.quelle === 'pruefung' && v.wichtig)) continue;
    for (const a of aus) if (a.datum === d) belegt.push([min(a.start), min(a.ende)]);
    belegt.sort((a, b) => a[0] - b[0]);
    let beste = null, cursor = fa;
    for (const [s, e] of [...belegt, [fe, fe]]) {
      const ende = Math.min(s, fe);
      if (ende - cursor >= 90 && (!beste || ende - cursor > beste[1] - beste[0])) beste = [cursor, ende];
      cursor = Math.max(cursor, e);
    }
    if (!beste) continue;
    const dauer = Math.min(laenge, beste[1] - beste[0], aufRaster(rest, r.raster_min));
    aus.push({ datum: d, start: hhmm(beste[0]), ende: hhmm(beste[0] + dauer), teil: teilId });
    rest -= dauer;
  }
  return aus.sort((a, b) => (a.datum < b.datum ? -1 : 1));
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
