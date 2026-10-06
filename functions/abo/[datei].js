// Das Kalender-Abo (Silas, 06.10.2026, V-0271): „dass man beim ‚in eigenen Kalender übernehmen‘ ein neuer
// Kalender namens Stundenplan angelegt wird. So landet es nicht im privaten Kalender.“ Eine .ics-Datei kann
// das am iPhone nicht: „Alle hinzufügen“ fragt nur nach einem vorhandenen Kalender. Ein Abo kann es: Wer
// webcal://www.stundenplanner.de/abo/stundenplan.ics?plan=…&w=… antippt, bekommt in Apple Kalender, Google
// Kalender oder Outlook einen eigenen Kalender „Stundenplan“, und der holt Änderungen aus MOSES von selbst.
//
// Die einzige Funktion der Seite, eine Cloudflare Pages Function. Sie hält nichts fest: keine Datenbank,
// kein Speicher, kein Protokoll. Die Auswahl steht in der Adresse, im selben Format wie der Link aus
// „Stundenplan speichern“ (auswahl.mjs teilenLesen); die Termine liest sie aus den öffentlichen Dateien
// derselben Auslieferung (daten/, über env.ASSETS), also genau dem Stand der Seite. Gerechnet wird mit
// denselben Modulen wie im Browser (auswahl.mjs, planwahl.mjs, ics.mjs): eine Rechnung, zwei Orte.
// Nur /abo/* ruft diese Funktion (web/_routes.json); alles andere bleibt statisch. Ist das Kontingent der
// Funktionen erschöpft, scheitert nur das Abo, die Seite nicht, und der Kalender behält seinen alten Stand.

import * as A from '../../web/auswahl.mjs';
import * as I from '../../web/ics.mjs';
import * as P from '../../web/planwahl.mjs';

// Wie in app.js: Eine Plandatei kommt nur von hier, relativ unterhalb von daten/.
const SICHERER_PFAD = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*\.json$/;
// Eine volle Auswahl ist rund 300 Zeichen lang; mehr ist kein Abo dieser Seite.
const MAX_ANFRAGE = 4000;

const text = (status, satz) => new Response(satz + '\n', {
  status,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
});

async function holeJson(env, ursprung, pfad) {
  const r = await env.ASSETS.fetch(new Request(new URL(pfad, ursprung)));
  if (!r.ok) throw Error(String(r.status));
  return r.json();
}

/** Die Antwort für eine Abo-Adresse. Getrennt von onRequestGet, damit node --test sie prüfen kann. */
export async function abo(request, env, jetzt = new Date()) {
  const url = new URL(request.url);
  if (!/^\/abo\/[A-Za-z0-9._-]+\.ics$/.test(url.pathname)) return text(404, 'Diese Adresse gibt es nicht.');
  if (url.search.length > MAX_ANFRAGE) return text(400, 'Diese Abo-Adresse ist zu lang.');
  const verweis = A.teilenLesen(url.search.slice(1));
  if (!verweis || !verweis.plan) return text(400, 'Diese Abo-Adresse ist unvollständig. Öffne stundenplanner.de und abonniere deinen Plan neu.');
  let index, plan;
  try {
    index = await holeJson(env, url.origin, '/daten/index.json');
  } catch {
    return text(503, 'Die Termine sind gerade nicht erreichbar.');
  }
  const blatt = P.blaetter(P.wahlBaum(index, (d) => SICHERER_PFAD.test(d))).find((b) => b.id === verweis.plan);
  if (!blatt) return text(404, 'Diesen Plan gibt es hier nicht mehr. Öffne stundenplanner.de und abonniere deinen Plan neu.');
  try {
    plan = await holeJson(env, url.origin, '/daten/' + blatt.datei);
  } catch {
    return text(503, 'Die Termine sind gerade nicht erreichbar.');
  }
  if (!P.gueltigeId(plan.id)) plan.id = blatt.id;
  const bestand = A.bestand(plan);
  const { auswahl } = A.geteilteAuswahl(bestand, verweis.paare);
  const { selected } = A.auswerten(plan, bestand, auswahl);
  const ics = I.icsAusAuswahl(plan, A.wirksameAuswahl(selected), { abo: true, jetzt });
  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="stundenplan.ics"',
      // Eine Stunde: Die Daten ändern sich einmal am Tag, und ein Kalender, der öfter fragt, bekommt
      // dieselbe Antwort aus seinem eigenen Zwischenspeicher.
      'cache-control': 'public, max-age=3600',
      'x-robots-tag': 'noindex',
    },
  });
}

export const onRequestGet = ({ request, env }) => abo(request, env);
