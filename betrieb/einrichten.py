#!/usr/bin/env python3
"""Cloudflare einmal einrichten: Pages-Projekt, eigene Domains, DNS (docs/BETRIEB.md §5).

Wiederholbar: Jeder Schritt fragt erst, was schon da ist, und legt nur an, was fehlt. Ein zweiter
Aufruf ändert nichts und sagt, was steht. Läuft im Image des Containers mit derselben betrieb/.env
wie der tägliche Lauf (`sh ops/bauen.sh einrichten`), damit der Token nie auf eine Kommandozeile,
in einen Chat oder in ein Protokoll muss.

  1. Pages-Projekt PAGES_PROJEKT anlegen (Production branch main), falls es fehlt
  2. jede Domain aus PAGES_DOMAINS als Custom Domain an das Projekt hängen, falls sie fehlt
  3. je Domain einen DNS-Eintrag CNAME → <projekt>.pages.dev (proxied) in der Zone anlegen.
     Über die API legt Pages diesen Eintrag nicht selbst an (anders als im Dashboard).
     Ein vorhandener Eintrag, der auf die Parkseite des Registrars zeigt (beim Hinzufügen der
     Site von Cloudflare übernommen), wird ersetzt. Jeden anderen fremden Eintrag fasst das
     Skript nicht an: Es sagt ihn, und Silas entscheidet.

Der Token braucht: Account → Cloudflare Pages → Edit und Zone → DNS → Edit für die Zone.

Protokolliert werden HTTP-Status und Cloudflares Fehlercodes, nie ein Antwortkörper und nie der
Token (dieselbe Regel wie in lauf.py).

Exit: 0 alles steht · 1 ein Schritt scheiterte · 3 kein Token (nichts versucht).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.cloudflare.com/client/v4'
PROJEKT = os.getenv('PAGES_PROJEKT', 'stundenplanner')
DOMAINS = os.getenv('PAGES_DOMAINS', 'stundenplanner.de www.stundenplanner.de').split()
# Inhalte, an denen ein Parkeintrag des Registrars zu erkennen ist (Porkbun: pixie/uixie.porkbun.com).
PARKEN = tuple(os.getenv('PARK_MUSTER', 'porkbun.com').split())


class CfFehler(Exception):
    def __init__(self, status, codes):
        self.status, self.codes = status, codes
        super().__init__(f'HTTP {status}' + (f', Cloudflare-Code {", ".join(map(str, codes))}' if codes else ''))


def cf(methode, pfad, daten=None, token=None):
    """Ein Aufruf der Cloudflare-API. Gibt `result` zurück; bei Fehler CfFehler mit Status und Codes."""
    req = urllib.request.Request(API + pfad, method=methode,
                                 data=json.dumps(daten).encode() if daten is not None else None,
                                 headers={'Authorization': f'Bearer {token}',
                                          'Content-Type': 'application/json',
                                          'User-Agent': 'stundenplanner-einrichten'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            antwort = json.load(r)
            status = r.status
    except urllib.error.HTTPError as exc:
        status = exc.code
        try:
            antwort = json.load(exc)
        except ValueError:
            antwort = {}
    if status >= 400 or not antwort.get('success', False):
        raise CfFehler(status, [e.get('code') for e in antwort.get('errors') or [] if isinstance(e, dict)])
    return antwort.get('result')


def schritt(text, ok=True):
    print(f'  {"✓" if ok else "✗"} {text}', flush=True)


def apex(domain):
    return '.'.join(domain.split('.')[-2:])


def main():
    token = os.getenv('CLOUDFLARE_API_TOKEN', '').strip()
    konto = os.getenv('CLOUDFLARE_ACCOUNT_ID', '').strip()
    if not token or not konto:
        print('  ✗ kein Token: CLOUDFLARE_API_TOKEN und CLOUDFLARE_ACCOUNT_ID fehlen in betrieb/.env '
              '(sh ops/bauen.sh zugang). Nichts versucht.')
        return 3
    fehler = 0

    def api(methode, pfad, daten=None):
        return cf(methode, pfad, daten, token)

    # 1 · Pages-Projekt
    basis = f'/accounts/{urllib.parse.quote(konto)}/pages/projects'
    try:
        projekt = api('GET', f'{basis}/{PROJEKT}')
        schritt(f'Pages-Projekt {PROJEKT} gibt es schon ({projekt.get("subdomain")})')
    except CfFehler as exc:
        if exc.status != 404 and 8000007 not in exc.codes:
            schritt(f'Pages-Projekt {PROJEKT} nicht lesbar: {exc}', ok=False)
            return 1
        try:
            projekt = api('POST', basis, {'name': PROJEKT, 'production_branch': 'main'})
            schritt(f'Pages-Projekt {PROJEKT} angelegt ({projekt.get("subdomain")}, Production branch main)')
        except CfFehler as exc2:
            schritt(f'Pages-Projekt {PROJEKT} ließ sich nicht anlegen: {exc2}', ok=False)
            return 1
    ziel = projekt.get('subdomain') or f'{PROJEKT}.pages.dev'

    # 2 · Custom Domains am Projekt
    try:
        vorhanden = {d.get('name'): d for d in api('GET', f'{basis}/{PROJEKT}/domains') or []}
    except CfFehler as exc:
        schritt(f'Custom Domains nicht lesbar: {exc}', ok=False)
        return 1
    for domain in DOMAINS:
        if domain in vorhanden:
            schritt(f'{domain} hängt schon am Projekt (Status {vorhanden[domain].get("status")})')
            continue
        try:
            d = api('POST', f'{basis}/{PROJEKT}/domains', {'name': domain})
            schritt(f'{domain} an das Projekt gehängt (Status {d.get("status")})')
        except CfFehler as exc:
            schritt(f'{domain} ließ sich nicht anhängen: {exc}', ok=False)
            fehler += 1

    # 3 · DNS: CNAME je Domain auf das Projekt
    zonen = {}
    for domain in DOMAINS:
        name = apex(domain)
        try:
            if name not in zonen:
                treffer = api('GET', f'/zones?name={urllib.parse.quote(name)}') or []
                if not treffer:
                    schritt(f'Zone {name} gibt es in diesem Konto nicht (oder der Token sieht sie nicht) — '
                            f'erst die Site hinzufügen (docs/BETRIEB.md §5)', ok=False)
                    fehler += 1
                    zonen[name] = None
                    continue
                zonen[name] = treffer[0]['id']
            zone = zonen[name]
            if zone is None:
                continue
            eintraege = api('GET', f'/zones/{zone}/dns_records?name={urllib.parse.quote(domain)}') or []
            passend = [e for e in eintraege if e.get('type') == 'CNAME' and e.get('content') == ziel]
            if passend:
                schritt(f'DNS {domain} → {ziel} steht schon')
                continue
            fremd = [e for e in eintraege if e.get('type') in ('A', 'AAAA', 'CNAME')]
            geparkt = [e for e in fremd if any(m in str(e.get('content', '')) for m in PARKEN)]
            if fremd and len(geparkt) < len(fremd):
                schritt(f'DNS {domain}: es gibt schon Einträge, die nicht auf {ziel} zeigen '
                        f'({", ".join(e["type"] + " " + str(e.get("content")) for e in fremd)}) — nicht angefasst, '
                        f'Silas entscheidet', ok=False)
                fehler += 1
                continue
            for e in geparkt:
                api('DELETE', f'/zones/{zone}/dns_records/{e["id"]}')
                schritt(f'DNS {domain}: Parkeintrag {e["type"]} {e.get("content")} entfernt')
            api('POST', f'/zones/{zone}/dns_records', {'type': 'CNAME', 'name': domain, 'content': ziel,
                                                       'proxied': True, 'ttl': 1,
                                                       'comment': 'Stundenplanner: Cloudflare Pages'})
            schritt(f'DNS {domain} → {ziel} angelegt (proxied)')
        except CfFehler as exc:
            schritt(f'DNS {domain}: {exc}', ok=False)
            fehler += 1

    print()
    if fehler:
        print(f'  {fehler} Schritt(e) gescheitert. Noch einmal aufrufen, sobald behoben: Was steht, bleibt stehen.')
        return 1
    print(f'  Alles steht. Die Domains werden aktiv, sobald Cloudflare die Zertifikate ausgestellt hat '
          f'(Minuten bis Stunden). Prüfen: noch einmal aufrufen, der Status steht oben.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
