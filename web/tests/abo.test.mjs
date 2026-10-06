// Das Kalender-Abo (V-0271): die Funktion functions/abo rechnet aus der Auswahl in der Adresse dieselbe
// Datei wie der Export im Browser, mit dem Namen „Stundenplan“ und dem Takt zum Nachsehen; kaputte,
// fremde und zu lange Adressen bekommen eine klare Antwort, nie eine leere 200. Ohne Netz: env.ASSETS
// liefert die Testdaten aus web/tests/fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { abo } from '../../functions/abo/[datei].js';
import * as A from '../auswahl.mjs';
import * as I from '../ics.mjs';
import { plan } from './hilfe.mjs';

const ID = 'test-bsc:stupo-2025:wise-2026-27:fs1';
const JETZT = new Date(Date.UTC(2026, 9, 6, 6, 0, 0));
const INDEX = {
  schema: 2,
  wahl: { stufe: 'hochschule', regel: 'waehlen', optionen: [{ id: 'tu-berlin', label: 'TU Berlin', weiter: {
    stufe: 'studiengang', regel: 'waehlen', optionen: [{ id: 'test-bsc', label: 'Teststudiengang', weiter: {
      stufe: 'fachsemester', regel: 'waehlen', optionen: [{ id: '1', label: '1. Fachsemester', semester: 'wise-2026-27', fachsemester: 1,
        plan: { id: ID, datei: 'test/plan.json' } }] } }] } }] },
};

const env = {
  ASSETS: {
    async fetch(req) {
      const pfad = new URL(req.url).pathname;
      if (pfad === '/daten/index.json') return new Response(JSON.stringify(INDEX));
      if (pfad === '/daten/test/plan.json') return new Response(readFileSync(new URL('./fixtures/plan.json', import.meta.url)));
      return new Response('nicht da', { status: 404 });
    },
  },
};

const ALLES = { '10001:100': { group: '11' }, '10001:200': { group: '22' }, '10002:500': { group: '53' } };
const anfrage = (auswahl) => A.teilenFragment({ id: ID }, auswahl).slice(1);
const hole = (pfad) => abo(new Request('https://www.stundenplanner.de' + pfad), env, JETZT);

test('Abo: Kalender „Stundenplan“ mit Takt, dieselben Termine wie der Export im Browser', async () => {
  const r = await hole('/abo/stundenplan.ics?' + anfrage(ALLES));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/calendar; charset=utf-8');
  const text = await r.text();
  assert.match(text, /\r\nX-WR-CALNAME:Stundenplan\r\n/);
  assert.match(text, /\r\nREFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n/);
  const p = plan(); p.id = ID;
  const b = A.bestand(p);
  const { selected } = A.auswerten(p, b, A.geteilteAuswahl(b, A.teilenLesen(anfrage(ALLES)).paare).auswahl);
  assert.equal(I.anzahlTermine(text), I.anzahlTermine(I.icsAusAuswahl(p, A.wirksameAuswahl(selected), { jetzt: JETZT })));
  assert.ok(I.anzahlTermine(text) > 0);
});

test('Abo: kaputte, fremde und zu lange Adressen bekommen 400/404, nie eine leere 200', async () => {
  assert.equal((await hole('/abo/stundenplan.ics')).status, 400);
  assert.equal((await hole('/abo/stundenplan.ics?plan=gibt-es-nicht&w=1~2')).status, 404);
  assert.equal((await hole('/abo/../../etc.ics?' + anfrage(ALLES))).status, 404);
  assert.equal((await hole('/abo/x.txt?' + anfrage(ALLES))).status, 404);
  assert.equal((await hole('/abo/stundenplan.ics?' + anfrage(ALLES) + '&w=' + 'x'.repeat(5000))).status, 400);
  const leer = await hole('/abo/stundenplan.ics?plan=' + encodeURIComponent(ID));
  assert.equal(leer.status, 200, 'ohne Gruppen ein gültiger, leerer Kalender');
  assert.equal(I.anzahlTermine(await leer.text()), 0);
});

test('Abo-Adressen: https, webcal und Google aus derselben Anfrage', () => {
  const a = I.aboAdressen('https://www.stundenplanner.de/', 'plan=x&w=1~2');
  assert.equal(a.https, 'https://www.stundenplanner.de/abo/stundenplan.ics?plan=x&w=1~2');
  assert.equal(a.webcal, 'webcal://www.stundenplanner.de/abo/stundenplan.ics?plan=x&w=1~2');
  assert.equal(a.google, 'https://calendar.google.com/calendar/render?cid=' + encodeURIComponent(a.webcal));
});
