# ADR 0005 — WhatsApp: Kapso para la conexión, n8n como cerebro

- Estado: aceptada (2026-11-02), pendiente de prueba técnica. Desarrollada y en parte sustituida por
  el [ADR 0012](0012-agente-whatsapp-multirestaurante.md) (2026-11-11): Kapso es el único canal, sin Chatwoot.

## Decisión

Kapso conecta el número de WhatsApp que ya usa cada negocio (modo coexistencia) y envía los
avisos. El agente de pedidos sigue en n8n, reutilizando los flujos de La Isla, y pasará a llamar a
la API de Konnecttia en lugar de escribir directamente en la base de datos.

## A validar con un número de prueba

- Coexistencia y uso de WhatsApp Web en el mostrador.
- Obligación de abrir la app del negocio periódicamente.
- Tarifas de Meta por plantilla y plan de Kapso.
- Dónde trata Kapso los datos (contrato de encargado).
