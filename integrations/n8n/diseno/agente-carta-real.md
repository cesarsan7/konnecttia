# Diseño: el agente de WhatsApp con la carta y la configuración reales

- Estado: **aprobado (2026-11-14)**. Se construye en cuatro PR (sección 6).
- Desarrolla: [ADR 0012](../../../docs/adr/0012-agente-whatsapp-multirestaurante.md), puntos 3, 5 y 6.
- Depende de: [adaptador de canal con Kapso](adaptador-canal-kapso.md) (`MensajeEntrante`,
  «[Canal] Enviar mensaje», `canal_whatsapp`, `whatsapp_conversacion`).

## 1. Qué resuelve

Los flujos copiados de La Isla toman el pedido con lógica propia en n8n: precio, horario,
agotados, sinónimos de productos, botones y tiempos. Eso no sirve para muchos restaurantes y
duplica lo que ya hace la web. Principio de este diseño: **lo máximo posible en la API**, con la
misma lógica y las mismas pruebas que la web; **n8n solo conversa** (modelo de lenguaje, memoria y
enrutado).

## 2. Auditoría (14/11/2026)

| Flujo     | Problema                                                                                                                                            | Qué pasa a hacer                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Despacho  | «Guardar Direccion Frecuente» actualiza `usuarios` por teléfono **sin `restaurante_id`** (pisa la dirección del cliente en otros restaurantes)      | La API guarda la dirección del restaurante del canal                            |
| Apertura  | «Check Carrito Expirado» busca por teléfono sin `restaurante_id`                                                                                    | Carrito por canal y teléfono en la API                                          |
| Apertura  | «Ejecutar Acción» calcula `cantidad × precio` (rompe el ADR 0004)                                                                                   | `priceOrder` de `packages/domain`                                               |
| Apertura  | Solo usa `disponible` de `fn_menu_lookup`: no ve lo agotado por local                                                                               | `unavailableItems` del local                                                    |
| Apertura  | Sinónimos y tamaños de La Isla escritos en el código                                                                                                | Búsqueda genérica `searchMenu` sobre la carta real                              |
| Director  | «Validacion» calcula abierto/cerrado con `horarios`: ignora horario por local, festivos, apertura manual y modo ocupado                             | `openChecker` de la API                                                         |
| Director  | Prompt de 29,5 KB y 72 reglas; reglas 53–59 y 67 piden la zona primero (contradice Despacho v2 por ubicación); se presenta como «asistente virtual» | Prompt corto con la identidad de `/agente/contexto`                             |
| Director  | Botones por expresiones regulares sobre la respuesta; pago siempre «Efectivo / Tarjeta»                                                             | Botones que devuelve la API (formas de pago reales)                             |
| Pago      | No valida el método contra el restaurante; un método desconocido acaba en «efectivo»                                                                | `placeOrder` (método aceptado o error)                                          |
| Preguntas | Prompt «Eres el asistente de información de La Isla Pizzería»                                                                                       | Identidad del restaurante                                                       |
| Varios    | Teléfono, `session_id` y `pedido_id` interpolados en SQL                                                                                            | Sin SQL de pedidos en n8n                                                       |
| Memoria   | Clave `{restaurante_id}_{conversation_id de Chatwoot}`; el trigger asigna el restaurante 1 si no entiende la clave                                  | Clave `{restaurante_id}:{telefono}`; el trigger falla en vez de adivinar (0039) |

## 3. Quién decide qué

| Modelo de lenguaje (n8n)                                          | Código o API (con pruebas)                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Entender la intención y extraer lo que el cliente nombra          | Restaurante y local (por el canal, en el servidor)                            |
| Elegir entre los candidatos de la API o preguntar                 | Abierto, modo ocupado, acepta pedidos, teléfono bloqueado                     |
| Preguntar solo lo que falta; redactar con el tono del restaurante | Texto → producto, variante y extras (`searchMenu`)                            |
| Detectar reclamos y derivar                                       | Agotados por local, precios, extras válidos, alérgenos                        |
| Responder dudas con la carta y las FAQ                            | Carrito, caducidad, mínimo, zona, envío, tiempo, formas de pago, estado final |

El modelo nunca escribe un precio, un total ni un estado: repite lo que devuelve la herramienta.

## 4. API: rutas `/agente`

- **Autenticación:** cabecera `X-Agente-Secreto` con el secreto `AGENTE_API_SECRET` (variable de
  EasyPanel en la API y credencial de n8n). Sin variable, 503.
- **Restaurante:** n8n solo envía el canal (`/agente/canales/:canalId/...`). La API lo busca en
  `canal_whatsapp` (estado `activo`), saca restaurante y local, y exige el módulo
  `whatsapp.agent` operativo (con sus dependencias). n8n nunca indica el restaurante.

| Ruta                                    | PR   | Qué hace                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /contexto?telefono=`               | B2.1 | Identidad (`agente_*`, «Soy el agente de pedidos del restaurante …»), mensajes de bienvenida y cerrado, `abierto` (si el número es de un local, el de ese local), `puede_pedir` (prueba vigente y teléfono no bloqueado, sin decir el motivo), recogida/reparto, formas de pago, locales con su estado y tiempo de recogida, datos del cliente en ese restaurante |
| `GET /carta?sucursal_id=&q=&categoria=` | B2.1 | Carta activa con variantes, extras y alérgenos en texto (nunca «sin alérgenos» si falta el dato); sin lo agotado en el local (el pedido, el del número o el único activo). Con `q`, candidatos con variante y extras detectados                                                                                                                                   |
| `GET /carrito?telefono=`                | B2.2 | Carrito abierto (o ninguno) con precios calculados al momento                                                                                                                                                                                                                                                                                                     |
| `PUT /carrito`                          | B2.2 | Operaciones con ids: agregar, quitar, cambiar cantidad, nota, vaciar; abrir uno nuevo solo con `nuevo: true`                                                                                                                                                                                                                                                      |
| `PUT /carrito/despacho`                 | B2.2 | Recogida (local) o reparto (dirección y ubicación); cotiza con la misma lógica que `/cotizacion` y lo guarda en el carrito                                                                                                                                                                                                                                        |
| `POST /carrito/confirmar`               | B2.2 | Nombre y forma de pago → `placeOrder` con canal `whatsapp`: crea el pedido con todas las reglas de la web y cierra el carrito                                                                                                                                                                                                                                     |
| `POST /conversacion/derivar`            | B2.4 | Registra la escalación y pausa la conversación `agente_pausa_derivar_minutos`                                                                                                                                                                                                                                                                                     |

### Carrito aparte (decisión del 14/11)

El carrito **no es una fila de `pedidos`**: vive en una tabla propia (`agente_carrito`, migración de
B2.2) y el pedido se crea solo al confirmar, con `placeOrder`, igual que la web. Código más limpio:
un solo camino para crear pedidos.

- Guarda solo ids y cantidades; el precio se calcula siempre al leer (la carta manda).
- Un carrito abierto por canal y teléfono: con un número por local, **un carrito nunca pasa de un
  local a otro**.
- Caduca a los `cart_expiry_minutes` sin cambios (regla: 30). Se comprueba al leer.
- Con esto `pedidos` deja de tener filas `en_curso` del agente. **Pendiente para después:** el aviso
  de los 25 minutos (Cron) leerá `agente_carrito`; mientras tanto el carrito caduca sin aviso.
- Pedido ya confirmado: el cliente no lo modifica por el agente; cambios o cancelación → derivar a
  una persona (como hoy cuando la ventana caduca).

## 5. n8n

- **Director:** prompt corto montado por «Construir identidad» con `/agente/contexto`; sin cálculo
  de horario ni zonas en n8n. Herramientas: Carta, Carrito, Despacho, Confirmar, Preguntas y Derivar.
- **Memoria:** clave `{restaurante_id}:{telefono}` (la 0039 adapta el trigger y deja de asignar el
  restaurante 1 por defecto).
- **Botones:** los define la respuesta de la herramienta (p. ej. formas de pago del restaurante),
  no expresiones regulares sobre el texto del modelo.
- **Reclamo:** «Derivar» llama a la API, que registra la escalación y pausa la conversación en
  `whatsapp_conversacion` (`pausado_por = 'derivar_humano'`); el adaptador deja de pasar mensajes
  al agente mientras dure. Sin `agente_pausa_derivar_minutos` no se pausa.

## 6. Orden de construcción

| PR   | Contenido                                                                                                                                                              | Base   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B2.1 | Este diseño; migración 0039 (trigger de memoria, `agente_pausa_derivar_minutos`); `/agente` con autenticación, `contexto` y `carta`; `searchMenu` en `packages/domain` | `main` |
| B2.2 | Migración `agente_carrito`; `carrito`, `despacho` y `confirmar`                                                                                                        | B2.1   |
| B1   | Director sin Chatwoot ni Redis, conectado al adaptador; «Construir identidad»                                                                                          | B2.2   |
| B2.3 | Flujos finos contra `/agente` (Carta, Carrito, Despacho, Confirmar, Preguntas)                                                                                         | B1     |
| B2.4 | Prompt nuevo, memoria `{restaurante_id}:{telefono}`, botones desde las herramientas, derivar con pausa                                                                 | B2.3   |

Riesgo: medio-alto (sustituye la toma de pedidos del agente), solo en staging; la demo de La Isla
no se toca. MVP: todo, salvo el aviso de los 25 minutos del carrito del agente.
