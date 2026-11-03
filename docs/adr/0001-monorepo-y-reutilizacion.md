# ADR 0001 — Monorepo nuevo que reutiliza EasyOrder

- Estado: aceptada (2026-11-02)

## Contexto

EasyOrder funciona en producción para La Isla, pero mezcla rutas de API muy grandes, no tiene
pruebas y su estructura no admite varios productos. Se valoró reescribir con otro stack
(NestJS + Drizzle) y clonar Pedifast.

## Decisión

Crear `konnecttia` como monorepo (pnpm + Turborepo) con una aplicación por producto y paquetes
compartidos. Se trasladan la lógica, las reglas y la base de datos de EasyOrder; no se reescribe
desde cero. Pedifast se usa solo como referencia (no tiene licencia).

## Consecuencias

- `easyorder` sigue en producción hasta que Konnecttia pase staging.
- EasyAgenda se añadirá como `apps/easyagenda` reutilizando acceso, notificaciones y UI.
