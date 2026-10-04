#!/bin/sh
# Der Test des Airfields stundenplanner — befehle.test in .tower/airfield.json.
#
# Heute gibt es keinen Produktcode. Geprüft wird, was es zu prüfen gibt: die Haustür und die
# Regel eines ÖFFENTLICHEN Repos (AGENTS.md §2 ①) — keine Adresse oder kein Pfad der Werkstatt,
# kein Geheimnis, keine .env. Ein öffentlicher Commit lässt sich nicht zurückholen; deshalb steht
# die Regel als Prüfung hier und nicht nur als Satz (Axiom 0, Schritt 3). Die Muster sind
# allgemein gehalten, damit diese Datei selbst nichts über die Werkstatt verrät.
#
# Wer Code dazubringt, hängt seine Tests unten an. Aufruf aus einem Klon oder Arbeitsbaum:
#   sh ops/test.sh
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
fehler=0
ok()   { echo "  ✓ $1"; }
nein() { echo "  ✗ $1"; fehler=$((fehler + 1)); }

echo "  stundenplanner — Test"

# 1 · Die Haustür und die Airfield-Datei
if grep -q '"airfield": "stundenplanner"' .tower/airfield.json 2>/dev/null; then
  ok ".tower/airfield.json nennt das Airfield stundenplanner"
else
  nein ".tower/airfield.json fehlt oder nennt ein anderes Airfield"
fi
if grep -q 'tower anmelden <rufzeichen>' AGENTS.md 2>/dev/null; then
  ok "AGENTS.md trägt den Anbindungsblock"
else
  nein "AGENTS.md ohne Anbindungsblock (der Befehl tower anmelden fehlt)"
fi
if [ -L CLAUDE.md ] && [ "$(readlink CLAUDE.md)" = "AGENTS.md" ]; then
  ok "CLAUDE.md ist ein Symlink auf AGENTS.md"
else
  nein "CLAUDE.md ist kein Symlink auf AGENTS.md — eine Tür, zwei Schilder"
fi

# 2 · Öffentlich: nichts aus der Werkstatt. git grep sieht nur, was git verfolgt (auch
# frisch hinzugefügt) — genau das, was ein Commit veröffentlichen würde.
muster='([A-Za-z0-9]-nas([^A-Za-z0-9]|$))'                     # Hostname eines NAS
muster="$muster|(/share/Container/)|(/Users/[A-Z][a-z]+/)"      # Gerätepfade
muster="$muster|((^|[^0-9.])192\.168\.[0-9]+\.[0-9]+)"          # Heimnetz
muster="$muster|((^|[^0-9.])100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]+\.[0-9]+)"  # Tailnet
muster="$muster|(-----BEGIN [A-Z ]*PRIVATE KEY)|(ghp_[A-Za-z0-9]{20,})|(github_pat_)|(sk-ant-)|(xox[bp]-)"
treffer=$(git grep -n -I -E -e "$muster" -- . ':!ops/test.sh' 2>/dev/null)
if [ -z "$treffer" ]; then
  ok "keine Adresse, kein Gerätepfad, kein Geheimnis in verfolgten Dateien"
else
  nein "Werkstatt oder Geheimnis in verfolgten Dateien — das Repo ist öffentlich:"
  echo "$treffer" | head -20 | sed 's/^/      /'
fi
envs=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v -E '\.env\.example$')
if [ -z "$envs" ]; then
  ok "keine .env verfolgt"
else
  nein "eine .env ist verfolgt: $envs"
fi

echo
if [ "$fehler" -eq 0 ]; then
  echo "  grün"
  exit 0
fi
echo "  $fehler Fehler"
exit 1
