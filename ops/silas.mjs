#!/usr/bin/env node
// /silas von der Werkbank aus (V-0321, docs/SILAS.md, docs/BETRIEB.md „/silas“):
//
//   node ops/silas.mjs pruefen <stand.json>     rechnet einen Stand durch, ohne Netz (Summen, rote Teile)
//   node ops/silas.mjs holen [<datei>]          GET  /silas/api/stand  (ohne Datei: auf die Ausgabe)
//   node ops/silas.mjs senden <stand.json>      PUT  /silas/api/stand  (auf dem aktuellen Stand des Servers)
//   node ops/silas.mjs einrichten [--pruefen]   KV-Namensräume, Bindung SILAS und Geheimnis SILAS_SCHLUESSEL
//                                               im Pages-Projekt; legt den Schlüssel in betrieb/.env an
//
// Der Schlüssel steht in betrieb/.env (SILAS_SCHLUESSEL, git-ignoriert) des Hauptklons, nie im Repo und
// nie in der Ausgabe. `einrichten` braucht einen Zugang, der KV anlegen darf — der enge Deploy-Token darf
// das nicht. Er kommt NUR aus der Umgebung dieses einen Aufrufs: CF_AUTH_EMAIL + CF_AUTH_KEY (Global Key)
// oder CF_EINRICHT_TOKEN. Das Repo ist öffentlich: keine Adresse, kein Konto, kein Schlüssel hier drin.

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import * as M from '../web/silas/modell.mjs';

const BASIS = process.env.SILAS_URL || 'https://www.stundenplanner.de';
const PROJEKT = 'stundenplanner';
const KV = { production: 'stundenplanner-silas', preview: 'stundenplanner-silas-vorschau' };
// Python-urllib und ähnliche Kennungen blockt Cloudflare (Fehler 1010, BETRIEB §5.9).
const UA = 'Mozilla/5.0 (stundenplanner-ops)';

const hauptklon = () => {
  const gemein = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return join(gemein, '..');
};
const envDatei = () => join(hauptklon(), 'betrieb', '.env');

function envLesen() {
  const aus = {};
  if (!existsSync(envDatei())) return aus;
  for (const z of readFileSync(envDatei(), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(z.trim());
    if (m) aus[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return aus;
}

function schluessel() {
  const k = process.env.SILAS_SCHLUESSEL || envLesen().SILAS_SCHLUESSEL;
  if (!k) throw new Error('SILAS_SCHLUESSEL fehlt (betrieb/.env) — erst `node ops/silas.mjs einrichten`');
  return k;
}

async function api(weg, opts = {}) {
  const r = await fetch(`${BASIS}/silas/api/${weg}`, { ...opts, headers: { authorization: `Bearer ${schluessel()}`, 'content-type': 'application/json', 'user-agent': UA } });
  const text = await r.text();
  // Eine HTML-Fehlerseite (Cloudflare: „Deployment Not Found“ kurz nach dem Hochladen) nicht ganz ausgeben.
  let daten; try { daten = JSON.parse(text); } catch { daten = text.replace(/\s+/g, ' ').slice(0, 200); }
  return { status: r.status, daten };
}

function zusammenfassen(stand) {
  const maengel = M.pruefeAngebot(stand.angebot);
  if (maengel.length) { console.log('  ✗ Angebot:', maengel.join(' · ')); return false; }
  const e = M.rechnen(stand.angebot, stand.plan || {});
  for (const r of e.module) {
    console.log(`  ${M.kurz(r.modul).padEnd(8)} ${M.stunden(r.gedeckt_min).padStart(8)} von ${M.stunden(r.soll_min)}${r.fehlt_min ? `, fehlen ${M.stunden(r.fehlt_min)}` : ''} · ${r.offen} rot`);
  }
  console.log(`  Semester ${M.stunden(e.summe.gedeckt_min)} von ${M.stunden(e.summe.soll_min)} · ${e.summe.offen} Bestandteile rot, ${e.vorkommen.length} Vorkommen`);
  return true;
}

// ── Cloudflare ───────────────────────────────────────────────────────────────────────────────────

function cfKopf() {
  if (process.env.CF_EINRICHT_TOKEN) return { authorization: `Bearer ${process.env.CF_EINRICHT_TOKEN}` };
  if (process.env.CF_AUTH_EMAIL && process.env.CF_AUTH_KEY) return { 'x-auth-email': process.env.CF_AUTH_EMAIL, 'x-auth-key': process.env.CF_AUTH_KEY };
  throw new Error('Zugang fehlt: CF_AUTH_EMAIL + CF_AUTH_KEY oder CF_EINRICHT_TOKEN in der Umgebung dieses Aufrufs');
}
async function cf(methode, pfad, leib) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/${pfad}`, { method: methode, headers: { ...cfKopf(), 'content-type': 'application/json' }, body: leib ? JSON.stringify(leib) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(`${methode} ${pfad.replace(/accounts\/[0-9a-f]+/, 'accounts/…')}: HTTP ${r.status} ${JSON.stringify(d.errors || '')}`);
  return d.result;
}

async function einrichten(nurPruefen) {
  const konto = envLesen().CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!konto) throw new Error('CLOUDFLARE_ACCOUNT_ID fehlt (betrieb/.env)');
  const vorhanden = await cf('GET', `accounts/${konto}/storage/kv/namespaces?per_page=100`);
  const ids = {};
  for (const [umgebung, titel] of Object.entries(KV)) {
    const n = vorhanden.find((x) => x.title === titel);
    if (n) { ids[umgebung] = n.id; console.log(`  · KV ${titel} ist da`); continue; }
    if (nurPruefen) { console.log(`  ✗ KV ${titel} fehlt`); continue; }
    ids[umgebung] = (await cf('POST', `accounts/${konto}/storage/kv/namespaces`, { title: titel })).id;
    console.log(`  ✓ KV ${titel} angelegt`);
  }
  let k = envLesen().SILAS_SCHLUESSEL;
  if (!k) {
    if (nurPruefen) { console.log('  ✗ SILAS_SCHLUESSEL fehlt in betrieb/.env'); return; }
    k = randomBytes(32).toString('base64url');
    const alt = existsSync(envDatei()) ? readFileSync(envDatei(), 'utf8') : '';
    writeFileSync(envDatei(), `${alt}${alt.endsWith('\n') || !alt ? '' : '\n'}# /silas (V-0321): Schlüssel für den privaten Semesterplaner, docs/BETRIEB.md\nSILAS_SCHLUESSEL=${k}\n`);
    chmodSync(envDatei(), 0o600);
    console.log('  ✓ SILAS_SCHLUESSEL neu in betrieb/.env (nicht ausgegeben)');
  } else console.log('  · SILAS_SCHLUESSEL steht in betrieb/.env');
  const hash = createHash('sha256').update(k).digest('hex');
  const p = await cf('GET', `accounts/${konto}/pages/projects/${PROJEKT}`);
  const konfig = {};
  for (const umgebung of ['production', 'preview']) {
    const c = (p.deployment_configs || {})[umgebung] || {};
    const gebunden = c.kv_namespaces && c.kv_namespaces.SILAS && c.kv_namespaces.SILAS.namespace_id === ids[umgebung];
    const geheim = c.env_vars && c.env_vars.SILAS_SCHLUESSEL;
    console.log(`  ${gebunden ? '·' : '✗'} ${umgebung}: Bindung SILAS ${gebunden ? 'steht' : 'fehlt'}, Geheimnis ${geheim ? 'steht' : 'fehlt'}`);
    // PATCH führt zusammen: Was das Projekt schon hat (Kompatibilitätsdatum, andere Bindungen und
    // Variablen), bleibt. Gesendet wird nur, was neu ist — andere Geheimnisse liest die API nicht zurück
    // und würde sie mit einem leeren Wert überschreiben.
    konfig[umgebung] = {
      kv_namespaces: { SILAS: { namespace_id: ids[umgebung] } },
      env_vars: { SILAS_SCHLUESSEL: { type: 'secret_text', value: hash } },
    };
  }
  if (nurPruefen) return;
  await cf('PATCH', `accounts/${konto}/pages/projects/${PROJEKT}`, { deployment_configs: konfig });
  console.log('  ✓ Pages: Bindung SILAS und Geheimnis SILAS_SCHLUESSEL (SHA-256) gesetzt, Produktion und Vorschau');
  console.log('  → Wirksam ab der nächsten Auslieferung (bau_live).');
}

// ── Befehle ──────────────────────────────────────────────────────────────────────────────────────

const [befehl, arg] = process.argv.slice(2);
try {
  if (befehl === 'pruefen' && arg) {
    process.exit(zusammenfassen(JSON.parse(readFileSync(arg, 'utf8'))) ? 0 : 1);
  } else if (befehl === 'holen') {
    const { status, daten } = await api('stand');
    if (status !== 200) throw new Error(`GET stand: ${status} ${JSON.stringify(daten)}`);
    if (arg) { writeFileSync(arg, JSON.stringify(daten, null, 1)); console.log(`  ✓ Version ${daten.version} vom ${daten.geaendert} → ${arg}`); }
    else process.stdout.write(JSON.stringify(daten, null, 1) + '\n');
  } else if (befehl === 'senden' && arg) {
    const neu = JSON.parse(readFileSync(arg, 'utf8'));
    if (!zusammenfassen(neu)) process.exit(1);
    const jetzt = await api('stand');
    const basis = jetzt.status === 200 ? jetzt.daten.version : null;
    const { status, daten } = await api('stand', { method: 'PUT', body: JSON.stringify({ basis, angebot: neu.angebot, plan: neu.plan || {} }) });
    if (status !== 200) throw new Error(`PUT stand: ${status} ${JSON.stringify(daten)}`);
    console.log(`  ✓ gespeichert als Version ${daten.version}`);
  } else if (befehl === 'einrichten') {
    await einrichten(arg === '--pruefen');
  } else {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 9).map((z) => z.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(befehl ? 2 : 0);
  }
} catch (e) {
  console.error(`  ✗ ${e.message}`);
  process.exit(1);
}
