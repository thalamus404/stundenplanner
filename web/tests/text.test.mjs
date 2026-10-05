// Escapen und Links: Kein Text aus der Datendatei wird HTML, Links nur zu MOSES und ISIS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, link, sichereUrl, plusTage, tagMonat, stamp } from '../text.mjs';

test('esc: alle fünf Zeichen, auch null und Zahlen', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(2.5), '2.5');
});

test('Links nur zu moseskonto/isis.tu-berlin.de über https', () => {
  assert.equal(sichereUrl('https://moseskonto.tu-berlin.de/moses/x'), 'https://moseskonto.tu-berlin.de/moses/x');
  assert.equal(sichereUrl('https://isis.tu-berlin.de/course/view.php?id=1'), 'https://isis.tu-berlin.de/course/view.php?id=1');
  for (const boese of ['http://moseskonto.tu-berlin.de/x', 'javascript:alert(1)', 'https://moseskonto.tu-berlin.de.example.com/',
    'https://isis.tu-berlin.de@example.com/', 'https://example.com/?https://isis.tu-berlin.de/', '//isis.tu-berlin.de/', null, 42]) {
    assert.equal(sichereUrl(boese), null, String(boese));
    assert.equal(link(boese, 'x'), '');
  }
});

test('link escaped Adresse und Text und öffnet ohne Opener und Referrer', () => {
  const html = link('https://isis.tu-berlin.de/s?q="><script>', 'ISIS <b>');
  assert.equal(html, '<a class="extern" href="https://isis.tu-berlin.de/s?q=&quot;&gt;&lt;script&gt;" target="_blank" rel="noopener noreferrer">ISIS &lt;b&gt;<svg class="i" aria-hidden="true"><use href="#i-extern"/></svg></a>');
});

test('Tage rechnen über Zeitumstellung und Jahreswechsel', () => {
  assert.equal(plusTage('2026-10-19', 7), '2026-10-26');
  assert.equal(plusTage('2026-10-26', 6), '2026-11-01');
  assert.equal(plusTage('2026-12-28', 7), '2027-01-04');
  assert.equal(plusTage('2026-10-12', -7), '2026-10-05');
});

test('Datumsangaben deutsch, Zeitstempel in Berliner Zeit über die Zeitumstellung', () => {
  assert.equal(tagMonat('2026-10-19'), '19.10.');
  assert.equal(stamp('2026-10-05T00:14:33+02:00'), '05.10., 00:14');
  assert.equal(stamp('2026-10-04T22:14:33Z'), '05.10., 00:14');         // Sommerzeit
  assert.equal(stamp('2026-12-01T10:00:00+00:00'), '01.12., 11:00');    // Winterzeit
  assert.equal(stamp('2026-10-25T00:59:00Z'), '25.10., 02:59');         // letzte Minute Sommerzeit
  assert.equal(stamp('2026-10-25T01:00:00Z'), '25.10., 02:00');         // erste Minute Winterzeit
  assert.equal(stamp('2027-03-28T01:00:00Z'), '28.03., 03:00');         // Beginn der Sommerzeit
  assert.equal(stamp(null), 'noch kein Lauf');
  assert.equal(stamp('kaputt'), 'unbekannt');
});
