// Farbschemata (V-0236): Im dunklen Schema hatten die Kacheln eigene Regeln, die mögliche Kachel
// war je Modul getönt (ein Flickenteppich), und die Legende zeigte „dunkelgrau“ an einem hellen
// Feld. Diese Tests halten fest, was das verhindert: Ein Schema ändert nur Tokens, nie eine Regel;
// die mögliche Kachel ist in jedem Schema neutral; Legende und Kachel teilen sich die Regel;
// Impressum und Datenschutz tragen dieselben Werte wie die Seite. Die Kontraste misst ops/sicht.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lies = (datei) => readFileSync(new URL(`../${datei}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const stil = lies('stil.css');
const recht = lies('recht.css');

/** Die Inhalte aller Blöcke @media (prefers-color-scheme: dark) { … }, Klammern gezählt. */
function dunkleBloecke(css) {
  const out = [];
  let i = css.indexOf('@media (prefers-color-scheme: dark)');
  while (i >= 0) {
    const auf = css.indexOf('{', i);
    let tiefe = 1, j = auf + 1;
    for (; j < css.length && tiefe; j++) tiefe += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    out.push(css.slice(auf + 1, j - 1));
    i = css.indexOf('@media (prefers-color-scheme: dark)', j);
  }
  return out;
}

/** Die Tokens aus dem ersten :root-Block eines Textes. */
function tokens(text) {
  const m = text.match(/:root\s*\{([^{}]*)\}/);
  assert.ok(m, ':root fehlt');
  return Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((t) => [t[1], t[2].trim()]));
}

const hell = (css) => tokens(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')));
const dunkel = (css) => tokens(dunkleBloecke(css)[0]);

test('Ein Schema ändert nur Tokens: Die dunklen Blöcke enthalten nur :root mit Variablen', () => {
  for (const [name, css] of [['stil.css', stil], ['recht.css', recht]]) {
    const bloecke = dunkleBloecke(css);
    assert.equal(bloecke.length, 1, `${name}: genau ein dunkler Block`);
    const rest = bloecke[0].replace(/:root\s*\{[^{}]*\}/, '').trim();
    assert.equal(rest, '', `${name}: Regeln im dunklen Block — eine Regel gilt in beiden Schemata, nur Tokens wechseln`);
    const decl = bloecke[0].match(/:root\s*\{([^{}]*)\}/)[1].split(';').map((d) => d.trim()).filter(Boolean);
    for (const d of decl) assert.match(d, /^--[\w-]+\s*:/, `${name}: keine Eigenschaft außer Variablen im dunklen :root (${d})`);
  }
});

test('Die mögliche Kachel ist in jedem Schema neutral: alle --mN-hauch gleich', () => {
  for (const [schema, t] of [['hell', hell(stil)], ['dunkel', dunkel(stil)]]) {
    const werte = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((n) => t[`--m${n}-hauch`]));
    assert.equal(werte.size, 1, `${schema}: --mN-hauch unterscheiden sich (${[...werte].join(', ')}) — die Farbe trägt der Rand`);
    assert.equal([...werte][0], t['--grau-1'], `${schema}: --mN-hauch ist die erhöhte Fläche --grau-1`);
  }
});

test('Jedes Schema setzt dieselben Tokens', () => {
  const h = Object.keys(hell(stil)).filter((k) => !['--ein', '--aus', '--h-min', '--ziel', '--zm', '--rand-x'].includes(k)).sort();
  assert.deepEqual(Object.keys(dunkel(stil)).sort(), h);
});

test('Legende und Kachel teilen sich die Regel (grau, blass)', () => {
  for (const art of ['kontext', 'zurueck']) {
    const regel = stil.match(new RegExp(`([^{}]*\\.${art} > \\.k-flaeche[^{}]*)\\{`));
    assert.ok(regel, `.${art} > .k-flaeche fehlt`);
    assert.ok(regel[1].split(',').map((s) => s.trim()).includes(`.lg-k.${art}`), `.lg-k.${art} steht nicht in derselben Regel wie die Kachel`);
  }
});

test('Impressum und Datenschutz tragen dieselben Werte wie die Seite', () => {
  for (const [schema, r, s] of [['hell', hell(recht), hell(stil)], ['dunkel', dunkel(recht), dunkel(stil)]]) {
    for (const [k, v] of Object.entries(r)) assert.equal(v, s[k], `${schema} ${k}: recht.css ${v}, stil.css ${s[k]}`);
  }
});
