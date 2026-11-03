# EasyOrder — Roadmap Post-MVP

Este archivo registra ideas, propuestas y requerimientos confirmados para versiones
posteriores al MVP. No deben implementarse hasta que el MVP esté estabilizado en producción.

---

## Notificaciones

### [POST-MVP] Notificaciones persistentes en dashboard
- **Motivación**: actualmente las notificaciones son efímeras (polling sobre `escalaciones`). 
  Si el operador no estaba mirando el dashboard, las pierde.
- **Propuesta**: tabla `notificaciones` con campos `tipo`, `pedido_id`, `mensaje`, `leido`, 
  `created_at`. El frontend marca como leídas. Permite historial y badge de no leídas preciso.
- **Dependencias**: requiere endpoint de marcado individual + bulk mark-as-read.

### [POST-MVP] SSE (Server-Sent Events) para push real en dashboard
- **Motivación**: polling cada 30s introduce hasta 30s de latencia en notificaciones urgentes.
- **Propuesta**: reemplazar polling por `GET /dashboard/:slug/notifications/stream` con 
  Content-Type: text/event-stream. El frontend usa `EventSource`. Sin librerías externas.
- **Compatibilidad**: la tabla `notificaciones` (ver arriba) es compatible con SSE — 
  ambos enfoques comparten el mismo origen de datos.
- **Nota**: en entornos con proxy inverso (EasyPanel/nginx) verificar que no haya timeout 
  agresivo en conexiones keep-alive.

---

## Trazabilidad y analítica

### [POST-MVP] Timeline de pedido en dashboard
- **Motivación**: la tabla `pedido_estado_log` ya se crea en M-10. 
  El dato está disponible desde el primer día.
- **Propuesta**: en la vista detalle del pedido, mostrar un timeline visual con cada 
  transición de estado, timestamp, origen (dashboard/n8n/cron) y actor (usuario o sistema).
- **Endpoint**: `GET /dashboard/:slug/orders/:id/timeline` → array de transiciones ordenadas.

### [POST-MVP] Métricas de tiempos entre estados
- **Motivación**: detectar cuellos de botella operativos. Ejemplo: pedidos que tardan 
  más de 10 min entre `confirmado` y `en_preparacion`.
- **Propuesta**: query analítica sobre `pedido_estado_log` con `LAG()` para calcular 
  duración entre transiciones. Mostrar en dashboard de métricas.
- **Query base**:
  ```sql
  SELECT 
    estado_anterior, estado_nuevo,
    AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY pedido_id ORDER BY created_at)))/60) AS avg_minutos
  FROM pedido_estado_log
  WHERE restaurante_id = $1
    AND created_at > NOW() - INTERVAL '30 days'
  GROUP BY estado_anterior, estado_nuevo
  ORDER BY avg_minutos DESC;
  ```

### [POST-MVP] Política de retención automática para pedido_estado_log
- **Motivación**: la tabla crece indefinidamente en producción.
- **Propuesta actual (MVP)**: config key `log_retention_days` en `restaurante_config`. 
  El operador configura el período. El DELETE debe ejecutarse manualmente o via cron n8n.
- **Propuesta post-MVP**: workflow n8n semanal que ejecuta 
  `DELETE FROM pedido_estado_log WHERE created_at < NOW() - (log_retention_days || ' days')::interval`.
- **Alternativa avanzada**: `pg_partman` para particionado por mes.

---

## Expiración de pedidos

### [POST-MVP] pg_cron para expiración de pedidos (alternativa a n8n)
- **Motivación**: si el servicio n8n tiene downtime, los pedidos no se expiran.
- **Propuesta**: migrar el cron de expiración a `pg_cron` (extensión PostgreSQL) para 
  que opere independientemente de n8n. Requiere verificar disponibilidad en EasyPanel.
- **Query**:
  ```sql
  SELECT cron.schedule('expire-carts', '*/5 * * * *', $$
    UPDATE pedidos SET estado = 'expirado', updated_at = NOW()
    WHERE estado = 'en_curso'
      AND COALESCE(updated_at, created_at) < NOW() 
          - (SELECT COALESCE(config_value::int, 60) FROM restaurante_config 
             WHERE config_key = 'cart_expiry_minutes' AND restaurante_id = pedidos.restaurante_id) 
          * INTERVAL '1 minute';
  $$);
  ```

---

## Bot y escalaciones

### [POST-MVP] Flujo completo de aprobación de modificación desde dashboard
- **Motivación**: cuando el operador resuelve una escalación por modificación de pedido,
  hoy solo marca como resuelta y reactiva el bot. No hay un flujo guiado para que el 
  operador aplique el cambio solicitado por el cliente dentro del mismo panel.
- **Propuesta**: en la vista de escalación, mostrar el pedido vinculado con botones de 
  acción: "Aplicar cambio", "Rechazar modificación", con campo de nota. Al confirmar, 
  el dashboard actualiza el pedido y envía notificación WhatsApp al cliente vía n8n webhook.

### [POST-MVP] Historial de escalaciones por cliente
- **Motivación**: identificar clientes recurrentes que generan derivaciones.
- **Propuesta**: en la vista de perfil de cliente del dashboard, mostrar historial 
  de escalaciones pasadas (última N escalaciones con problema + resolución).

---

## Multi-tenant

### [POST-MVP] config `dashboard_polling_seconds` por tenant en UI
- **Motivación**: actualmente el polling interval se lee del backend. El operador 
  no puede ajustarlo desde la UI sin acceso a la BD.
- **Propuesta**: sección "Configuración avanzada" en el dashboard donde el owner 
  pueda ajustar el intervalo de polling (mínimo 15s, máximo 120s).

---

*Última actualización: 2026-05-01*
*Referencia: sesión de arquitectura Fase 3 EasyOrder*
