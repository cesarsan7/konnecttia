# ADR 0006 — Alojamiento en EasyPanel, en un servidor de la UE

- Estado: aceptada (2026-11-02)

## Decisión

Todo se despliega en EasyPanel (contenedores por aplicación, staging y producción por rama de
GitHub). El servidor se migra de EE. UU. a la UE. Vercel queda como opción solo para la landing.

## Motivo

Konnecttia necesita procesos en segundo plano, conexiones largas (panel en directo), n8n,
Chatwoot, PostgreSQL y Redis, que viven mejor juntos. Datos de clientes españoles en la UE.
