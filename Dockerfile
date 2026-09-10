# syntax=docker/dockerfile:1
# Repoggits production image. Built for a single VPS behind a reverse proxy that
# terminates TLS. See docs/DEPLOYMENT.md.

FROM node:24-alpine AS base
# Next.js and sharp expect a few glibc entry points that Alpine provides separately.
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Build ------------------------------------------------------------------
# TypeScript and the Next compiler are needed here only, so they stay out of the
# final image. No database is contacted during the build: every page renders at
# request time, so DATABASE_URL is a runtime setting.
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The full source tree is kept in the image on purpose: Admin > Backups builds the
# website source ZIP from the running deployment and reports 503 without it.
COPY . .
COPY --from=build /app/.next ./.next

# Written by db:setup (the administrator invitation) and mail:outbox. Mount a
# volume over it to keep those files across container replacements.
RUN mkdir -p /app/.local && chown -R node:node /app/.local /app/.next

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

CMD ["npm", "run", "start"]
