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
    | python3 -c 'import json,sys; z=json.load(sys.stdin); print("  Stand", z.get("commit","?"), "·", z.get("status"), "·", z.get("meldung") or "")' || true
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
    TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
    git -C "$WURZEL" show "HEAD:betrieb/docker-compose.yml" > "$TMP/docker-compose.yml"
    docker image tag "$BILD:vorher" "$BILD:live"
    STUNDENPLANNER_ENV="$ENVDATEI" docker compose -f "$TMP/docker-compose.yml" up -d --force-recreate --no-build
    echo "  ✓ $NAME läuft wieder mit dem Image vor dem letzten Bau ($(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$BILD:live"))"
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
