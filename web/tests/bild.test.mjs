// Das Bild des fertigen Plans (V-0253): nur die übergebenen (eingeplanten) Gruppen, je Termin eine Kachel,
// Lage als data-* statt style (CSP), Text immer escaped, Überschneidungen mit Ring, der Satz zum Kalender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../auswahl.mjs';
import * as I from '../ics.mjs';
import * as B from '../bild.mjs';
import { plan } from './hilfe.mjs';

const ALLES = { '10001:100': { group: '11' }, '10001:200': { group: '22' }, '10002:500': { group: '53' } };

function eingeplant(auswahl = ALLES) {
  const p = plan();
  const b = A.bestand(p);
  const { selected } = A.auswerten(p, b, auswahl);
  return { p, selected };
}

test('je Termin der eingeplanten Gruppen eine Kachel, nichts sonst, kein style-Attribut', () => {
  const { p, selected } = eingeplant();
  const html = B.planBildHtml({ gruppen: selected, titel: 'Test', module: p.modules });
  const kacheln = (html.match(/class="kachel /g) || []).length;
  assert.equal(kacheln, selected.reduce((n, g) => n + g.slots.length, 0));
  assert.ok(!/\sstyle=/.test(html), 'Lage nur als data-*, die CSP verbietet style-Attribute');
  assert.match(html, /role="img" aria-label="Wochenplan, /);
  for (const m of html.matchAll(/data-o="([\d.]+)" data-h="([\d.]+)"/g)) {
    assert.ok(Number(m[1]) >= 0 && Number(m[1]) + Number(m[2]) <= 100.0001, 'Kachel innerhalb der Achse');
  }
});

test('Text aus den Daten wird escaped, Überschneidungen tragen den Ring', () => {
  const { p, selected } = eingeplant();
  selected[0].module_short = '<b>x</b>';
  const html = B.planBildHtml({ gruppen: selected, konflikt: new Set([selected[1].key]), titel: '<i>t</i>', module: p.modules });
  assert.ok(!html.includes('<b>x</b>') && html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!html.includes('<i>t</i>'));
  assert.ok(html.includes(' konflikt'), 'die Gruppe in einer Überschneidung behält ihren Ring');
});

test('ohne Gruppen: ein leeres Bild Mo–Fr, kein Fehler', () => {
  const html = B.planBildHtml({ gruppen: [] });
  assert.equal((html.match(/class="spalte"/g) || []).length, 5);
  assert.equal((html.match(/class="kachel /g) || []).length, 0);
});

test('Satz zum Kalender: Gruppen, Termine, erster und letzter Tag', () => {
  const { p, selected } = eingeplant();
  const termine = I.icsTermine(p, A.wirksameAuswahl(selected));
  const satz = B.kalenderSatz(selected, termine);
  assert.match(satz, /^\d+ Termingruppen, \d+ Termine vom \d\d\.\d\d\. bis \d\d\.\d\d\.$/);
  assert.equal(B.kalenderSatz([], []), '0 Termingruppen, 0 Termine');
});
