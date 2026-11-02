# ADR 0004 — El precio del pedido se calcula siempre en el servidor

- Estado: aceptada (2026-11-02)

## Contexto

EasyOrder suma los `unit_price` que envía el navegador: un cliente puede pagar lo que quiera.

## Decisión

El navegador envía solo ids y cantidades. `packages/domain/pricing.ts` valida producto, variante,
modificadores (mínimos y máximos por grupo), disponibilidad, mínimo de reparto y suplementos
(como envases), y calcula el total en céntimos enteros. Nombres y precios se congelan en el pedido.
