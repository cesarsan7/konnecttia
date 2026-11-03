# apps/worker

Proceso en segundo plano: lee `outbox_evento` con `FOR UPDATE SKIP LOCKED`, envía avisos (email,
SMS, WhatsApp) con reintentos, expira carritos y avisa de pedidos sin atender.

**Estado:** pendiente (fase 3).
