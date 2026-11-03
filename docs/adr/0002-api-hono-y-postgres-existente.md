# ADR 0002 — API en Hono sobre la base de datos existente

- Estado: aceptada (2026-11-02)

## Decisión

La API sigue en Hono y PostgreSQL sigue siendo la base principal. El esquema actual entra como
`0000_baseline.sql` y cada cambio es una migración nueva, compatible con los flujos de n8n.

## Motivo

n8n, Kapso y el worker necesitan una API HTTP estable; la base contiene los datos de La Isla y las
funciones SQL que usa n8n.
