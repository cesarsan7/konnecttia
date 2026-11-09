# Imagen de la API (apps/api). Contexto de build: raíz del repositorio.
FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @konnecttia/api...
RUN pnpm --filter @konnecttia/api build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3001 AUTO_MIGRATE=true MIGRATIONS_DIR=/app/migrations
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/api/dist ./dist
# Migraciones: la API las aplica al arrancar (AUTO_MIGRATE=false lo apaga).
COPY --from=build --chown=app:app /repo/packages/db/migrations ./migrations
USER app
EXPOSE 3001
CMD ["node", "dist/index.js"]
