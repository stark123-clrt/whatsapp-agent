# Agent WhatsApp — image de production (Coolify / Docker)
# Node 24 : SQLite intégré (node:sqlite). Chromium : lecture des sites JavaScript.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS run
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates curl tini python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*
# Instagram (non officiel) : service Python isolé dans /opt/ig, lancé par l'appli.
COPY instagram-service/requirements.txt /tmp/ig-requirements.txt
RUN python3 -m venv /opt/ig \
  && /opt/ig/bin/pip install --no-cache-dir -r /tmp/ig-requirements.txt \
  && rm /tmp/ig-requirements.txt
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BROWSER_PATH=/usr/bin/chromium \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
# Dépendances complètes (la sélection automatique de Next.js oublie des fichiers chargés
# dynamiquement, par exemple dans puppeteer) : plus robuste.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY instagram-service ./instagram-service
# Données persistantes : base + médias + session Instagram (data/instagram), et session WhatsApp (volumes Coolify).
RUN mkdir -p /app/data /app/.wa-auth
VOLUME ["/app/data", "/app/.wa-auth"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
# tini : arrête proprement Node et Chromium quand le conteneur s'arrête.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
