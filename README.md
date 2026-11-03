# konnecTTia

Herramientas digitales sencillas para negocios locales de Canarias.
Primer producto: **EasyOrder**, pedidos online para restaurantes sin comisión por pedido.

- Producto, arquitectura y plan: [`docs/konnecTTia.md`](docs/konnecTTia.md)
- Decisiones: [`docs/adr/`](docs/adr/)
- Guía para agentes y colaboradores: [`AGENTS.md`](AGENTS.md)

## Empezar

```bash
corepack enable
pnpm install
pnpm --filter @konnecttia/site dev   # landing en http://localhost:3010
pnpm test                            # pruebas de todos los paquetes
```

## Estado

| Pieza                                                     | Estado                                           |
| --------------------------------------------------------- | ------------------------------------------------ |
| `apps/site` — landing konnecttia.com                      | Lista para staging                               |
| `packages/domain` — precio en servidor, alérgenos, zonas  | Lista, con pruebas                               |
| `packages/access` — módulos y RBAC                        | Lista, con pruebas                               |
| `packages/db` — migraciones                               | Base + 2 migraciones probadas; 2 propuestas      |
| `apps/api`, `apps/easyorder`, `apps/admin`, `apps/worker` | Pendientes (ver `docs/konnecTTia.md`, sección 7) |
