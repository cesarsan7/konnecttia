# integrations/n8n

Flujos de n8n del agente de WhatsApp, versionados **sin secretos ni URLs privadas**.

Hoy los flujos viven en `cesarsan7/easyorder/docs/n8n`. Se traerán aquí en la fase 4, con:
- webhooks autenticados por cabecera (`N8N_WEBHOOK_SECRET`);
- `restaurante_id` explícito en todas las llamadas SQL;
- llamadas progresivas a la API de Konnecttia en lugar de escribir en la base de datos.
