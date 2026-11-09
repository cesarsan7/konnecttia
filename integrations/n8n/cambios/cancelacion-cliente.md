# Cancelación por el cliente en WhatsApp (pieza O) — propuesta para n8n

Estado: **propuesta, sin aplicar**. La web ya cancela (`POST /public/orders/:token/cancelar`). Falta que el
subflujo **Pedidos Cliente** aplique la misma regla. No se toca el JSON de producción: al aplicarlo se
genera una versión nueva con diff.

## Regla (la misma que la web)

El cliente cancela solo mientras el local **no ha aceptado** el pedido:

- `estado` en `recibido` o `pendiente_pago` **y** sin justificantes de pago subidos
  (`pedido_justificante`). Con justificante, el local puede estar verificando el cobro.
- Si ya fue aceptado (`confirmado`, `pagado`, `en_preparacion`…): **no cancelar**; responder que el
  local ya lo aceptó y **derivar a humano** (regla 12).

## Cambio propuesto en Pedidos Cliente

1. Consultar el pedido del cliente (ya lo hace) y calcular `puede_cancelar` con la regla anterior.
2. Si el cliente pide cancelar y `puede_cancelar`: `UPDATE pedidos SET estado = 'cancelado'` con
   `set_config('app.origen', 'cliente')` y `set_config('app.actor', 'cliente')` en la misma transacción,
   para que `fn_log_estado_pedido` deje el origen. El tablero muestra «Cancelado por el cliente».
3. Si no puede: derivar a humano con el motivo «cancelación tras aceptar».

Pendiente de decidir: si la regla vive como función SQL (`fn_cliente_puede_cancelar`, nueva, por
proponer) o se repite en el nodo. Hasta decidirlo no se crea ninguna función.
