# Imagen del worker (apps/worker): avisos por email desde el outbox. Contexto de build: raíz del repositorio.
FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @konnecttia/worker...
RUN pnpm --filter @konnecttia/worker build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/worker/dist ./dist
USER app
# Sin puerto: es un proceso en segundo plano. SIGTERM (parada de EasyPanel) lo detiene limpiamente.
CMD ["node", "dist/index.js"]
