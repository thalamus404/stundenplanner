#!/bin/sh
# Den Stundenplanner auf dem NAS bauen und starten (docs/BETRIEB.md) — befehle.bau_live in
# .tower/airfield.json.
#
#   sh ops/bauen.sh live [stand] [--probe]   Image aus dem git-Stand bauen (Standard: origin/main),
#                                            Container stundenplanner-abruf neu starten, einen Lauf
#                                            --jetzt auslösen. --probe: alles prüfen, bis vor docker build
#   sh ops/bauen.sh lauf                     im laufenden Container einen Lauf jetzt auslösen
#   sh ops/bauen.sh status                   Zustand des letzten Laufs
#   sh ops/bauen.sh rueckweg                 den Container auf das Image vor dem letzten Bau zurücksetzen
#   sh ops/bauen.sh zugang                   Cloudflare-Token und Account-ID unsichtbar abfragen und in
#                                            <hauptklon>/betrieb/.env schreiben (Rechte 600)
#   sh ops/bauen.sh einrichten               Pages-Projekt, eigene Domains und DNS bei Cloudflare anlegen,
#                                            soweit sie fehlen (wiederholbar, betrieb/einrichten.py)
#
# Exit-Codes von live und lauf: 0 ausgeliefert · 1 gescheitert · 3 Lauf gelungen, aber nicht
# ausgeliefert (kein Cloudflare-Token in betrieb/.env). 3 ist absichtlich nicht grün: live ist,
# was bei Cloudflare liegt, nicht was im Container gelungen ist.
#
# ZWEI WURZELN. Gebaut wird aus dem git-STAND (git archive), nicht aus dem Ordner: Im Image steckt
# genau ein Commit, egal, in welchem Arbeitsbaum man steht. BETRIEBEN wird mit der .env des
# HAUPTKLONS: Sie ist nicht versioniert und liegt nie in einem Arbeitsbaum. Im Nachbar-Airfield
# startete am 18.09.2026 ein Dienst aus einem Arbeitsbaum ohne .env und zeigte auf einen leeren
# Ordner; deshalb rechnet dieses Skript den Hauptklon selbst aus, statt es dem Aufrufer zu
# überlassen.
set -eu

BILD=stundenplanner-abruf
NAME=stundenplanner-abruf
WURZEL=$(git rev-parse --show-toplevel)
HAUPTKLON=$(dirname "$(git -C "$WURZEL" rev-parse --path-format=absolute --git-common-dir)")
ENVDATEI="$HAUPTKLON/betrieb/.env"

lauf_jetzt() {
  echo "  ── Lauf --jetzt (Ausgabe im Container-Protokoll: docker logs $NAME) ──"
  rc=0; docker exec "$NAME" python3 /opt/stundenplanner/lauf.py --jetzt || rc=$?
  docker exec "$NAME" python3 /opt/stundenplanner/lauf.py --status 2>/dev/null \
    | python3 -c 'import json,sys; z=json.load(sys.stdin); print("  Stand", z.get("commit","?"), "·", z.get("status"), "·", z.get("meldung") or ""); [print("  ⚠ Lücke in der Seite:", l) for l in z.get("luecken") or []]' || true
  case "$rc" in
    0) echo "  ✓ ausgeliefert" ;;
    3) echo "  ⚠ Lauf gelungen, aber NICHT ausgeliefert: kein Cloudflare-Token in $ENVDATEI (docs/BETRIEB.md, „Was Silas einmal tun muss“)" ;;
    *) echo "  ✗ Lauf gescheitert, nichts ausgeliefert — online bleibt der letzte gelungene Stand. docker logs $NAME" ;;
  esac
  return "$rc"
}

case "${1:-}" in
  live)
    shift
    STAND=""; PROBE=0
    for a in "$@"; do
      case "$a" in --probe) PROBE=1 ;; *) STAND="$a" ;; esac
    done
    if [ -z "$STAND" ]; then
      git -C "$WURZEL" fetch -q origin main 2>/dev/null || echo "  ⚠ git fetch scheiterte — ich baue den lokal bekannten Stand von origin/main"
      STAND=origin/main
    fi
    SHA=$(git -C "$WURZEL" rev-parse --verify --quiet "$STAND^{commit}") || { echo "  ✗ Stand '$STAND' gibt es in git nicht" >&2; exit 2; }
    KURZ=$(git -C "$WURZEL" rev-parse --short "$SHA")
    git -C "$WURZEL" cat-file -e "$SHA:betrieb/Dockerfile" 2>/dev/null || { echo "  ✗ Stand $KURZ hat kein betrieb/Dockerfile" >&2; exit 2; }
    command -v docker >/dev/null 2>&1 || { echo "  ✗ docker fehlt" >&2; exit 2; }
    TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
    git -C "$WURZEL" show "$SHA:betrieb/docker-compose.yml" > "$TMP/docker-compose.yml"
    export STUNDENPLANNER_ENV="$ENVDATEI"
    docker compose -f "$TMP/docker-compose.yml" config -q
    if [ -f "$ENVDATEI" ]; then echo "  · .env: $ENVDATEI"; else echo "  · .env fehlt ($ENVDATEI) — es wird gebaut und gelaufen, aber nicht ausgeliefert"; fi
    echo "  · Stand $KURZ ($STAND)"
    if [ "$PROBE" -eq 1 ]; then
      echo "  ✓ Probe: Stand, Dockerfile, Compose-Datei und docker tragen — hier begänne docker build"
      exit 0
    fi
    echo "  ── docker build ($BILD:live aus git archive $KURZ) ──"
    docker image inspect "$BILD:live" >/dev/null 2>&1 && docker image tag "$BILD:live" "$BILD:vorher"
    git -C "$WURZEL" archive --format=tar "$SHA" \
      | docker build -q -f betrieb/Dockerfile --build-arg "STAND=$KURZ" -t "$BILD:live" -
    echo "  ── Container neu starten ──"
    docker compose -f "$TMP/docker-compose.yml" up -d --force-recreate --no-build
    lauf_jetzt
    ;;
  lauf)
    lauf_jetzt
    ;;
  status)
    docker exec "$NAME" python3 /opt/stundenplanner/lauf.py --status
    ;;
  rueckweg)
    docker image inspect "$BILD:vorher" >/dev/null 2>&1 || { echo "  ✗ kein Image $BILD:vorher — es gab noch keinen zweiten Bau" >&2; exit 2; }
    docker image tag "$BILD:vorher" "$BILD:live"
    STUNDENPLANNER_ENV="$ENVDATEI" docker compose -f "$WURZEL/betrieb/docker-compose.yml" up -d --force-recreate --no-build
    echo "  ✓ $NAME läuft wieder mit dem Image vor dem letzten Bau ($(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$BILD:live"))"
    ;;
  zugang)
    # Der Token geht nie über eine Kommandozeile, einen Chat oder einen Commit: Er wird hier
    # unsichtbar eingegeben (stty -echo) und mit printf (eingebaut, kein eigener Prozess, also
    # nicht in der Prozessliste) in eine Datei mit Rechten 600 geschrieben.
    [ -t 0 ] || { echo "  ✗ zugang braucht ein Terminal: docker exec -it … sh ops/bauen.sh zugang" >&2; exit 2; }
    if [ -f "$ENVDATEI" ]; then
      printf "  %s gibt es schon. Überschreiben? [j/N] " "$ENVDATEI"; read -r ja
      [ "$ja" = j ] || { echo "  nichts geändert"; exit 0; }
    fi
    ALT=$(stty -g); trap 'stty "$ALT" 2>/dev/null' EXIT INT TERM
    printf "  Cloudflare API-Token (die Eingabe bleibt unsichtbar): "; stty -echo; read -r TOKEN; stty "$ALT"; echo
    printf "  Cloudflare Account-ID (die Eingabe bleibt unsichtbar): "; stty -echo; read -r KONTO; stty "$ALT"; echo
    case "$TOKEN" in ""|*[!A-Za-z0-9_-]*) echo "  ✗ Der Token sieht nicht aus wie ein Cloudflare-Token (nur Buchstaben, Ziffern, - und _) — nichts geschrieben" >&2; exit 2 ;; esac
    case "$KONTO" in ""|*[!0-9a-f]*) echo "  ✗ Die Account-ID sieht nicht aus wie eine (32 Zeichen 0-9 a-f) — nichts geschrieben" >&2; exit 2 ;; esac
    mkdir -p "$(dirname "$ENVDATEI")"
    ( umask 077
      printf 'CLOUDFLARE_API_TOKEN=%s\nCLOUDFLARE_ACCOUNT_ID=%s\nPAGES_PROJEKT=stundenplanner\n' "$TOKEN" "$KONTO" > "$ENVDATEI.neu"
      chmod 600 "$ENVDATEI.neu" && mv "$ENVDATEI.neu" "$ENVDATEI" )
    TOKEN=""; KONTO=""
    echo "  ✓ $ENVDATEI geschrieben (Rechte 600)."
    echo "    Weiter: sh ops/bauen.sh einrichten, dann sh ops/bauen.sh live (erst dann liest der Container die Datei)"
    ;;
  einrichten)
    docker image inspect "$BILD:live" >/dev/null 2>&1 || { echo "  ✗ kein Image $BILD:live — erst sh ops/bauen.sh live" >&2; exit 2; }
    [ -f "$ENVDATEI" ] || { echo "  ✗ $ENVDATEI fehlt — erst sh ops/bauen.sh zugang" >&2; exit 2; }
    # Ein Wegwerf-Container aus demselben Image, im Netz des Projekts, mit derselben .env wie der
    # Lauf: Der Token bleibt in der Datei und im Container.
    STUNDENPLANNER_ENV="$ENVDATEI" docker compose -f "$WURZEL/betrieb/docker-compose.yml" \
      run --rm --no-deps -T abruf python3 /opt/stundenplanner/einrichten.py
    ;;
  *)
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
