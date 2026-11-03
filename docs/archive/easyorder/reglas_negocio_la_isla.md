# Reglas del negocio actuales — La Isla Pizzería

## 1. Flujo general
- El flujo operativo del pedido es: **Apertura → Despacho → Pago**.
- El bot solo debe avanzar al **siguiente paso lógico**.
- Si el local está cerrado, **no debe tomar pedidos**; solo informar, responder preguntas y derivar a humano si corresponde.

## 2. Menú y productos
- El catálogo operativo sale de **`fn_menu_lookup()` / `fn_menu_catalog()`** sobre el modelo actual de menú.
- El bot debe:
  - reconocer productos exactos,
  - tolerar errores ortográficos razonables,
  - pedir aclaración si hay ambigüedad,
  - pedir **tamaño/variante** si el producto lo requiere,
  - ofrecer **extras** si el producto los tiene disponibles.
- No debe inventar productos, precios, tamaños, extras ni disponibilidad.

## 3. Creación y continuidad del pedido
- Si existe un pedido reutilizable del mismo cliente, el sistema debe trabajar sobre ese pedido.
- Solo debe abrirse un pedido nuevo si el cliente lo pide de forma explícita: **“pedido nuevo”**, **“otro pedido”**, **“separado”**.
- El pedido debe conservar sus ítems previos; no debe vaciarse al agregar, modificar o combinar productos.

## 4. Despacho
- Los únicos tipos válidos son:
  - **retiro**
  - **delivery**
- Para **retiro**, no se debe pedir dirección.
- Para **delivery**:
  - se debe validar zona de cobertura,
  - calcular costo de envío,
  - validar monto mínimo por zona,
  - guardar dirección,
  - guardar **tiempo_estimado**.
- Si no alcanza el mínimo de delivery:
  - se debe **mantener la intención de delivery**,
  - pedir agregar más productos o cambiar a retiro,
  - no confirmar el pedido todavía.

## 5. Perfil del cliente
- Si falta el nombre y el pedido va a continuar, se debe pedir **a nombre de quién será**.
- Si el cliente entrega su nombre, debe guardarse en perfil.
- Si el cliente usa delivery con una dirección nueva, debe guardarse como **dirección frecuente**.
- Si ya existe nombre o dirección frecuente, deben reutilizarse en conversaciones futuras.

## 6. Pago
- Métodos válidos:
  - **efectivo**
  - **tarjeta**
  - **transferencia**
  - **bizum**
  - **online**
- El bot no debe asumir un método de pago si el cliente no lo indicó.
- En **transferencia**, el pedido debe quedar como **pendiente_pago**.
- En otros métodos, el pedido puede quedar **confirmado** según la lógica actual.
- El mensaje final debe resumir:
  - código de pedido si existe,
  - ítems,
  - tipo de despacho,
  - subtotal,
  - total,
  - método de pago.

## 7. Modificación de pedidos
- Se puede modificar un pedido vigente dentro de la ventana válida.
- El sistema debe permitir:
  - agregar ítems,
  - quitar ítems,
  - cambiar cantidades,
  - cambiar productos.
- Se puede resolver un pedido por:
  - **pedido_codigo completo**
  - **referencia corta** si identifica de forma única.
- Si la ventana expiró, no debe modificarse; debe ofrecer iniciar un pedido nuevo.

## 8. Estado y consulta
- Estados operativos observables:
  - **en_curso**
  - **pendiente_pago**
  - **confirmado**
  - **pagado / paid**
- El cliente puede consultar su pedido actual o un pedido por código.
- Si el pedido no existe o no corresponde al teléfono, el bot debe indicarlo claramente.

## 9. Horarios
- El horario se evalúa con zona horaria **Atlantic/Canary**.
- El sistema debe soportar:
  - horario abierto,
  - cerrado por hora,
  - cerrado por día,
  - próxima apertura,
  - turnos que cruzan medianoche.

## 10. Reglas de seguridad conversacional
- No inventar datos.
- No cambiar a **retiro** si el cliente venía en **delivery** sin confirmación explícita.
- No confirmar un pedido sin haber pasado correctamente por el paso de **Pago**.
- Si hay reclamo, caso sensible o solicitud explícita, se debe **derivar a humano**.

## 11. Expiración de pedidos (carrito abandonado)
- Un pedido en estado **`en_curso`** expira por inactividad según la configuración del local.
- Valores actuales en `restaurante_config`:
  - `cart_expiry_minutes = 30` → el pedido pasa a **`expirado`** tras 30 min de inactividad.
  - `cart_warning_minutes = 5` → se envía un mensaje de persuasión 5 min **antes** de la expiración (a los 25 min de inactividad).
- La inactividad se mide sobre `COALESCE(updated_at, created_at)` del pedido.
- El cron `[MVP] Cron Expirar Pedidos` corre cada 5 minutos y:
  1. **Advierte** pedidos en la ventana `[expiry - warning, expiry)` con `cart_warned_at IS NULL`.
  2. **Expira** pedidos con inactividad ≥ `cart_expiry_minutes`.
- Si `cart_warning_minutes = cart_expiry_minutes` la advertencia se dispara de inmediato y pierde utilidad; deben configurarse con diferencia significativa.
- Todas las comparaciones de tiempo usan UTC explícito (`AT TIME ZONE 'UTC'`) para evitar el desfase del servidor PostgreSQL (-0400).

## 12. Zona horaria del sistema
- Fuente única de verdad: columna `restaurante.zona_horaria` (valor: `Atlantic/Canary`).
- La conexión postgres.js de la API fuerza `TimeZone='UTC'` en todas las sesiones para que `NOW()` y las comparaciones sean siempre UTC.
- Los timestamps se almacenan como UTC en columnas `timestamp without time zone`.
- El frontend convierte a `zona_horaria` del restaurante únicamente para visualización (via `useBranding().zonaHoraria`).
- Nunca hardcodear `'Atlantic/Canary'` en código — siempre leer de `restaurante.zona_horaria`.
