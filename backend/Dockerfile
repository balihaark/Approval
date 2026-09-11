# Approvals backend — Fastify + TypeScript + Prisma.
# Multi-stage build: compile TS + generate Prisma client in `build`, then copy
# only what we need into a slim runtime image.

# ---- 1. build stage ---------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so the install layer caches until deps change.
COPY package.json package-lock.json* ./

# Install deps WITHOUT running postinstall — Prisma's `postinstall` calls
# `prisma generate`, which needs prisma/schema.prisma. We haven't COPY'd
# the schema yet (that would kill the manifests-only cache layer), so we
# skip scripts here and run `prisma generate` explicitly below.
RUN apk add --no-cache openssl \
 && if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund --ignore-scripts; \
    else \
      npm install --no-audit --no-fund --ignore-scripts; \
    fi

# Now that deps are installed, bring in prisma + source and finish the build.
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

RUN npx prisma generate \
 && npm run build


# ---- 2. runtime stage -------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

# Prisma's query engine needs openssl at runtime. `tini` reaps zombies so
# Fastify's graceful-shutdown handling actually gets SIGTERM.
RUN apk add --no-cache openssl tini

ENV NODE_ENV=production
ENV PORT=3001

# Full node_modules (with Prisma client + CLI) + compiled JS + Prisma schema.
# Not pruning devDeps because the CMD below calls `npx prisma migrate deploy`
# which needs the prisma CLI; keeping the image self-contained is worth the
# ~50MB.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O - http://localhost:3001/health >/dev/null || exit 1

# Migrations first, then boot Fastify. tini keeps SIGTERM propagation clean.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
