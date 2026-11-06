# @konnecttia/notifications

Envío y plantillas de email compartidos por la API y el worker.

- `createResendMailer` — envío con Resend (fetch, sin SDK) y el tipo `Mailer`.
- Plantillas de equipo: `inviteEmail`, `recoveryEmail` (las usa la API).
- Plantillas de pedido: `newOrderEmail` (aviso al local) y `orderNoticeEmail` (aviso al cliente), que
  usa `apps/worker`.

**Estado:** email hecho. SMS (proveedor con alias inscrito en la CNMC) y WhatsApp (Kapso) siguen
pendientes (fases 3 y 4); n8n sigue enviando los avisos de estado por WhatsApp.
