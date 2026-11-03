# Imagen de la landing (apps/site). Contexto de build: raíz del repositorio.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @konnecttia/site...
RUN pnpm --filter @konnecttia/site build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/site/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/site/.next/static ./apps/site/.next/static
COPY --from=build --chown=app:app /repo/apps/site/public ./apps/site/public
USER app
EXPOSE 3000
CMD ["node", "apps/site/server.js"]
