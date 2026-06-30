# Persistent-container build (brief §2: Render, not Vercel serverless — the
# phase-6 Playwright PDF path needs a long-lived container).
# Multi-stage; produces Next.js standalone output.

FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Use `npm ci` when a lockfile is present (reproducible); fall back to install.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- build ----
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public env vars must be present at build time for Next to inline them.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
RUN npm run build

# ---- runtime ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Keep Playwright's browser inside the image at a stable path.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Playwright is a server-external package, so it lives in node_modules, not the
# bundle — copy it plus its standalone trace, then install Chromium + OS deps.
COPY --from=build /app/node_modules/playwright ./node_modules/playwright
COPY --from=build /app/node_modules/playwright-core ./node_modules/playwright-core

RUN npx --yes playwright install --with-deps chromium \
  && chown -R nextjs:nodejs /opt/pw-browsers

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
