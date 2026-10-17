// Der private Speicher von /silas (V-0321) — eine Cloudflare Pages Function mit KV.
//
// stundenplanner.de/silas ist Silas' persönlicher Semesterplaner (docs/SILAS.md). Die Seite selbst ist
// ein leeres Werkzeug im öffentlichen Repo; seine Daten — das Angebot mit ISIS-Angaben, seine Wahl,
// seine Blöcke — liegen NUR hier, im KV-Namensraum SILAS, nie im Repo (AGENTS.md §2 ①). Jede Anfrage
// braucht den Schlüssel. Gespeichert ist nur sein SHA-256 (Geheimnis SILAS_SCHLUESSEL der Pages), der
// Schlüssel selbst steht in betrieb/.env und in Silas' Browsern (docs/BETRIEB.md, „/silas“).
//
// Wege (alle unter /silas/api/, web/_routes.json):
//   GET  stand            → { schema, version, geaendert, angebot, plan }      (404, solange leer)
//   PUT  stand            ← { basis, angebot, plan } — basis ist die Version, auf der die Änderung
//                           beruht; passt sie nicht, 409 mit dem Stand des Servers (anderes Gerät)
//   GET  ereignisse       → jedes konkrete Vorkommen mit Id und Zeitzone, dazu die Prüfungen (der Reiter „Prüfungen“
//                           als Daten) und die Zeiträume: die Schnittstelle zum Study OS (docs/SILAS.md §6)
//   GET  kalender/<k>.ics → Kalender-Abo (termine | lernen | alles); der Schlüssel steht hier in der
//                           Adresse (?k=), weil ein Kalender keine Kopfzeile senden kann
//   GET  verlauf[/<id>]   → die stündlichen Sicherungen der letzten 60 Tage
//   GET  plaene           → die Probepläne: [{ nr, version, geaendert }]
//
// Probepläne (V-0345, Silas: „verschiedene Stundenpläne abspeichern … unter stundenplanner.de/silas/1, 2, 3 … einfach
// nur fürs Testen“): `stand?plan=1…9` liest und schreibt einen eigenen Stand (KV `stand:<n>`), mit derselben Sperre.
// Sie haben keine Sicherungen. Die Kalender-Abos kommen immer aus dem echten Plan; `ereignisse?plan=n` aus dem
// Probeplan (SP-0412, Silas, 17.10.2026: das Study OS soll „die dritte Version“ zeigen) — ohne `plan` der echte.
//
// Das Study OS liest später mit demselben Schlüssel (Kopfzeile Authorization: Bearer …). Der
// Stundenplanner selbst fragt nie etwas von dort ab: Die Richtung ist Study OS → Stundenplanner.

import * as M from '../../../web/silas/modell.mjs';
import * as K from '../../../web/silas/kalender.mjs';

const MAX_BYTES = 512 * 1024;            // ein Semester sind etwa 40 KB
const SCHLUESSEL = /^[A-Za-z0-9_-]{32,128}$/;
const VERLAUF_TAGE = 60;
const KOPF = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff' };

const json = (status, daten) => new Response(JSON.stringify(daten), { status, headers: { ...KOPF, 'content-type': 'application/json; charset=utf-8' } });
const fehler = (status, satz) => json(status, { fehler: satz });

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function gleich(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** true, false oder 'aus' (KV oder Schlüssel nicht eingerichtet). */
async function darf(request, env, url, mitAdresse) {
  if (!env.SILAS || !env.SILAS_SCHLUESSEL) return 'aus';
  const kopf = request.headers.get('authorization') || '';
  let k = kopf.startsWith('Bearer ') ? kopf.slice(7).trim() : '';
  if (!k && mitAdresse) k = url.searchParams.get('k') || '';
  if (!SCHLUESSEL.test(k)) return false;
  return gleich(await sha256(k), String(env.SILAS_SCHLUESSEL).trim().toLowerCase());
}

async function lesen(env, schluessel = 'stand') {
  const roh = await env.SILAS.get(schluessel);
  return roh ? JSON.parse(roh) : null;
}
const PLAN = /^[1-9]$/;

/** Der Kalendertag in Berlin (JJJJ-MM-TT) — der Worker läuft in UTC, Silas' Tag nicht. */
const berlinTag = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const stundenSchluessel = (d) =>'verlauf:' + d.toISOString().slice(0, 13).replace(/[-T]/g, '');

export async function silasApi(request, env, jetzt = new Date()) {
  const url = new URL(request.url);
  const weg = url.pathname.replace(/^\/silas\/api\/?/, '');
  const ics = /^kalender\/([a-z]+)\.ics$/.exec(weg);
  const recht = await darf(request, env, url, !!ics);
  if (recht === 'aus') return fehler(503, 'Der Speicher von /silas ist noch nicht eingerichtet (docs/BETRIEB.md).');
  if (!recht) return fehler(401, 'Schlüssel fehlt oder stimmt nicht.');

  // Welcher Stand: der echte oder ein Probeplan (?plan=1…9).
  const plan = url.searchParams.get('plan');
  if (plan != null && !PLAN.test(plan)) return fehler(400, 'Probepläne heißen 1 bis 9.');
  const ort = plan ? `stand:${plan}` : 'stand';

  if (weg === 'stand' && request.method === 'GET') {
    const s = await lesen(env, ort);
    return s ? json(200, s) : fehler(404, 'Noch kein Stand gespeichert.');
  }

  if (weg === 'stand' && request.method === 'PUT') {
    const roh = await request.text();
    if (roh.length > MAX_BYTES) return fehler(413, 'Der Stand ist zu groß.');
    let neu;
    try { neu = JSON.parse(roh); } catch { return fehler(400, 'Kein gültiges JSON.'); }
    if (!neu || typeof neu !== 'object' || !neu.angebot || !neu.plan) return fehler(400, 'angebot und plan fehlen.');
    const maengel = M.pruefeAngebot(neu.angebot);
    if (maengel.length) return json(422, { fehler: 'Das Angebot ist nicht gültig.', maengel });
    try { M.rechnen(neu.angebot, neu.plan); } catch (e) { return json(422, { fehler: 'Der Plan lässt sich nicht rechnen.', maengel: [String(e.message || e)] }); }
    const alt = await lesen(env, ort);
    // Optimistische Sperre: Wer auf einem älteren Stand geändert hat, überschreibt nicht still den
    // neueren eines anderen Geräts. `basis: null` heißt „ich weiß, es ist leer“ — oder, mit
    // `erzwingen: true`, „überschreiben“ (der Knopf dafür fragt vorher).
    if (alt && !neu.erzwingen && neu.basis !== alt.version) return json(409, { fehler: 'Auf einem anderen Gerät geändert.', version: alt.version, geaendert: alt.geaendert });
    const stand = { schema: 1, version: (alt ? alt.version : 0) + 1, geaendert: jetzt.toISOString(), angebot: neu.angebot, plan: neu.plan };
    const text = JSON.stringify(stand);
    await env.SILAS.put(ort, text);
    // Eine Sicherung je Stunde (dieselbe Stunde überschreibt): genug, um einen Fehlgriff zurückzuholen,
    // und unter dem Tageskontingent von KV (1000 Schreibvorgänge) auch bei viel Planen. Nur der echte Plan.
    if (!plan) await env.SILAS.put(stundenSchluessel(jetzt), text, { expirationTtl: VERLAUF_TAGE * 86400 });
    return json(200, { version: stand.version, geaendert: stand.geaendert });
  }

  if (weg === 'ereignisse' && request.method === 'GET') {
    const s = await lesen(env, ort);
    if (!s) return fehler(404, plan ? `Probeplan ${plan} ist leer.` : 'Noch kein Stand gespeichert.');
    // Die Ereignisse rechnen ohne `heute`, wie seit V-0321 (zaehlt_min bleibt, was das Study OS kennt). Die Prüfungen
    // rechnen mit dem Berliner Tag: Ihr Vorschlag beginnt nie vor heute — so wie auf der Seite.
    const ereignisse = M.ereignisse(s.angebot, s.plan);
    const heute = berlinTag(jetzt);
    const erg = M.rechnen(s.angebot, s.plan, { heute });
    return json(200, {
      schema: 1, plan: plan ? Number(plan) : null, version: s.version, geaendert: s.geaendert, heute,
      semester: s.angebot.semester, ereignisse, pruefungen: M.pruefungenExport(erg), zeitraeume: M.zeitraeume(s.angebot.semester),
    });
  }

  if (ics && request.method === 'GET') {
    if (!K.KALENDER.includes(ics[1])) return fehler(404, 'Diesen Kalender gibt es nicht (termine, lernen, alles).');
    const s = await lesen(env);
    if (!s) return fehler(404, 'Noch kein Stand gespeichert.');
    return new Response(K.ics(M.ereignisse(s.angebot, s.plan), { kalender: ics[1], jetzt }), {
      headers: { ...KOPF, 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `inline; filename="${ics[1]}.ics"` },
    });
  }

  if (weg === 'plaene' && request.method === 'GET') {
    const liste = await env.SILAS.list({ prefix: 'stand:' });
    const plaene = [];
    for (const k of liste.keys) {
      const nr = k.name.slice(6);
      if (!PLAN.test(nr)) continue;
      const s = await lesen(env, k.name);
      if (s) plaene.push({ nr: Number(nr), version: s.version, geaendert: s.geaendert });
    }
    return json(200, { plaene: plaene.sort((a, b) => a.nr - b.nr) });
  }

  if (weg === 'verlauf' && request.method === 'GET') {
    const liste = await env.SILAS.list({ prefix: 'verlauf:' });
    return json(200, { verlauf: liste.keys.map((k) => k.name.slice(8)).sort().reverse() });
  }
  const v = /^verlauf\/(\d{10})$/.exec(weg);
  if (v && request.method === 'GET') {
    const roh = await env.SILAS.get('verlauf:' + v[1]);
    return roh ? new Response(roh, { headers: { ...KOPF, 'content-type': 'application/json; charset=utf-8' } }) : fehler(404, 'Diese Sicherung gibt es nicht.');
  }

  return fehler(404, 'Diesen Weg gibt es nicht.');
}

export const onRequest = ({ request, env }) => silasApi(request, env);
