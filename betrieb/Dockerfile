# Der Container des täglichen Laufs (docs/BETRIEB.md): holt main von GitHub, ruft MOSES ab, baut
# das Lesemodell, prüft mit ops/test.sh und liefert web/ mit wrangler an Cloudflare Pages aus.
# Eigene Infrastruktur (AGENTS.md §2 ④): nichts aus anderen Images oder Diensten der Maschine.
#
# Gebaut wird aus einem git-Stand, nicht aus dem Ordner: ops/bauen.sh live <stand> schickt
# `git archive <stand>` als Kontext. So steckt im Image genau, was in git steht.
#
# Node kommt aus dem offiziellen Node-Image derselben Debian-Fassung (bookworm): wrangler verlangt
# Node >= 22, Debian liefert 18. Beide Images auf bookworm gepinnt, damit die glibc passt.
FROM node:22-bookworm-slim AS node

FROM python:3.12-slim-bookworm

# Gepinnt: Ein wrangler, der sich über Nacht ändert, darf die Auslieferung nicht still brechen.
# Anheben = diese Zeile ändern, bauen, einen Lauf mit Token beobachten (docs/BETRIEB.md).
ARG WRANGLER_VERSION=4.147.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && npm install -g --no-fund --no-audit --loglevel=error "wrangler@${WRANGLER_VERSION}" \
 && npm cache clean --force \
 && wrangler --version

# requirements.txt mit Platzhalter-Muster: Solange abruf/ sie noch nicht hat, passt das Muster auf
# nichts, und es wird dieselbe Rückfallzeile installiert wie in .github/workflows/test.yml.
COPY betrieb/lauf.py betrieb/einrichten.py abruf/requirements.tx[t] /opt/stundenplanner/
RUN if [ -f /opt/stundenplanner/requirements.txt ]; then \
      pip install --no-cache-dir --disable-pip-version-check -r /opt/stundenplanner/requirements.txt; \
    else pip install --no-cache-dir --disable-pip-version-check beautifulsoup4==4.12.3; fi

# Kein root: Der Lauf braucht nur sein Volume. /daten gehört dem Benutzer schon im Image, damit ein
# neues benanntes Volume diese Eigentümerschaft beim ersten Einhängen übernimmt.
RUN useradd --create-home --uid 10001 abruf && mkdir -p /daten && chown abruf:abruf /daten
USER abruf
WORKDIR /daten

ENV DATEN=/daten \
    TZ=Europe/Berlin \
    PYTHONUNBUFFERED=1 \
    WRANGLER_SEND_METRICS=false

# Lebt die Zeitplan-Schleife? Sie berührt das Herz jede Minute und während jedes Schritts.
HEALTHCHECK --interval=5m --timeout=10s --start-period=1m \
  CMD python3 -c "import os,sys,time; sys.exit(0 if time.time()-os.path.getmtime('/daten/heartbeat')<300 else 1)"

# Zuletzt, damit ein neuer Stand den Zwischenspeicher der Schichten darüber nicht verwirft.
ARG STAND=unbekannt
LABEL org.opencontainers.image.source="https://github.com/thalamus404/stundenplanner" \
      org.opencontainers.image.revision="${STAND}"
ENV STAND_IMAGE=${STAND}

CMD ["python3", "/opt/stundenplanner/lauf.py"]
