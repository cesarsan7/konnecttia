# apps/api

API HTTP en Hono: endpoints públicos (carta, pedido, seguimiento), privados (panel), webhooks
(Kapso, n8n) y tools del agente.

**Estado:** pendiente (fase 1). Se trasladará desde `cesarsan7/easyorder/api` con estos cambios:
- `POST /orders` usa `@konnecttia/domain` (`priceOrder`) e ignora precios del navegador;
- clave de idempotencia obligatoria en el checkout;
- seguimiento por `tracking_token`, nunca por `pedido_codigo`;
- autorización con `@konnecttia/access` (`authorize`), sin comparar roles a mano;
- webhooks firmados e idempotentes; rate limit por la IP que fija el proxy.
