# Diseño: adaptador de canal con Kapso y tabla `canal_whatsapp`

- Estado: **aprobada (2026-11-13)**. Propuesta del 11/11, fusionada en el PR #121; ajustes de la
  revisión (sección 5) en el PR siguiente. Ya se puede construir.
- Desarrolla: [ADR 0012](../../../docs/adr/0012-agente-whatsapp-multirestaurante.md), puntos 1 a 4 y 8.
- Fuente de Kapso: documentación oficial (docs.kapso.ai, consultada el 11/11/2026). Lo marcado
  «por confirmar» no está documentado y se comprueba con el sandbox.

## 1. Qué resuelve

Hoy el agente entra por Chatwoot, agrupa mensajes con Redis, sale por Chatwoot y toma el
restaurante de un atributo del contacto (`p_restaurante_id`, 11 por defecto). Con el diseño:

- **una sola entrada** para todos los restaurantes: un webhook de n8n que recibe a Kapso;
- el **restaurante sale del número** que recibe el mensaje (`phone_number_id` → `canal_whatsapp`);
- **una sola salida**: el subflujo «[Canal] Enviar mensaje»;
- el resto de flujos (Director, Apertura, Despacho, Pago…) reciben un mensaje normalizado y no
  saben qué proveedor hay detrás.

Nodos que se sustituyen (inventario del 11/11):

| Flujo                              | Nodos ligados a Chatwoot o Redis                                                                                                | Pasan a                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `[MVP] Pizzeria` (Director)        | Webhook `chatwootnew`, Redis, Redis1, Redis2, Descargar Imagen, Descargar Audio, Mensaje Chatwoot, Mensaje Interactivo Chatwoot | «[Canal] Entrada Kapso» + «[Canal] Enviar mensaje»                                                  |
| `[MVP] Notificacion Estado Pedido` | Buscar Contacto, Obtener Conversaciones, Enviar Mensaje                                                                         | «[Canal] Enviar mensaje» (por teléfono, sin conversación de Chatwoot)                               |
| `[MVP] Cron Expirar Pedidos`       | Enviar Advertencia, Enviar Notificacion Expiracion                                                                              | «[Canal] Enviar mensaje»                                                                            |
| `[MVP] Derivar Humano`             | Apagar bot, noti lovable (Supabase externo)                                                                                     | pausa del agente en `whatsapp_conversacion`; se quita «noti lovable» (ADR 0008, datos a un tercero) |

## 2. Entrada: «[Canal] Entrada Kapso»

```
Kapso ──POST──▶ n8n /webhook/kapso-entrada
                 1. Responder 200 enseguida (Kapso exige respuesta en < 10 s)
                 2. Verificar firma  X-Webhook-Signature = HMAC-SHA256(cuerpo crudo, secreto), hex
                 3. Idempotencia      X-Idempotency-Key ya visto → fin
                 4. Desempaquetar lote (batch: true → data[])
                 5. Clasificar evento (tabla de abajo)
                 6. Resolver restaurante  phone_number_id → canal_whatsapp (activo)
                 7. Comprobar módulo      whatsapp.agent activo para el restaurante
                 8. Pausa                 whatsapp_conversacion.pausado_hasta > ahora → fin
                 9. Normalizar            → MensajeEntrante
                10. Marcar leído + «escribiendo…»
                11. Llamar al Director con MensajeEntrante
```

- **Formato y suscripción:** webhook de Kapso en formato propio (v2), por número, con los eventos
  `whatsapp.message.received` y `whatsapp.message.sent`. Mismo URL de n8n y mismo secreto para
  todos los números (el secreto va en una credencial de n8n, no en el flujo).
- **Agrupar mensajes:** se usa el **buffer de Kapso** (por conversación, ventana configurable,
  5 s por defecto) en lugar de Redis. Llega siempre como lote (`batch: true`, `data[]`, ordenado
  por secuencia): los textos se unen en orden, la última ubicación manda y se guardan todos los
  adjuntos. **Redis deja de hacer falta** para el agente.
- **Firma:** el nodo Webhook guarda el cuerpo crudo y un nodo Code calcula el HMAC con `crypto`
  (n8n necesita `NODE_FUNCTION_ALLOW_BUILTIN=crypto`). Firma inválida → se descarta y se registra.
- **Idempotencia:** tabla `whatsapp_evento` (clave de idempotencia, fecha); se borra lo de más de
  7 días con el Cron. Si el proceso falla después del 200, Kapso no reintenta: el fallo se registra
  y se deriva como hoy («Respuesta Error Sistema»).

Clasificación de eventos:

| Evento                                 | `message.kapso.origin`                             | Qué hace                                                                                              |
| -------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `whatsapp.message.received`            | —                                                  | Mensaje del cliente → al Director                                                                     |
| `whatsapp.message.sent`                | `business_app`                                     | El personal escribió desde su app → **pausar el agente** en esa conversación (`agente_pausa_minutos`) |
| `whatsapp.message.sent`                | `cloud_api`                                        | Es nuestra propia respuesta → ignorar                                                                 |
| `whatsapp.message.sent`                | `history_sync`, `other_app`, `meta_business_agent` | Ignorar (se registra)                                                                                 |
| Otros (`delivered`, `read`, `failed`…) | —                                                  | Sin suscribir en esta fase                                                                            |

### Contrato `MensajeEntrante`

Lo único que ven el Director y los subflujos:

```json
{
  "restaurante_id": 1,
  "sucursal_id": null,
  "canal_id": 7,
  "proveedor": "kapso",
  "phone_number_id": "123456789012345",
  "conversacion_id": "conv_123",
  "cliente": { "telefono": "+34600000000", "bsuid": null, "nombre": "Ana" },
  "texto": "quiero dos arepas para recoger",
  "ubicacion": { "lat": 28.963, "lng": -13.547, "direccion": null },
  "adjuntos": [{ "tipo": "audio", "url": "…", "transcripcion": "…", "mime": "audio/ogg" }],
  "respuesta_interactiva": { "id": "local_2", "titulo": "Siempre Juntos 1" },
  "mensaje_ids": ["wamid…"],
  "recibido_at": "2026-11-11T18:00:00Z"
}
```

- `telefono` en E.164 con «+» (Kapso lo manda sin «+»). Si solo llega el identificador de usuario
  de Meta (BSUID, sin teléfono), se responde con el enlace de la carta y no se crea pedido
  (`pedidos.telefono` es obligatorio); ampliar a BSUID queda para después del MVP.
- Audio: Kapso ya trae `kapso.transcript.text`; si viene, se usa y no se transcribe aparte
  (ahorro). Imagen: URL de Kapso (si exige la clave de API y cuánto dura: por confirmar).
- `sucursal_id` viene del canal cuando el número es de un local concreto (ver tabla).

## 3. Salida: «[Canal] Enviar mensaje»

Subflujo único que usan el Director, Notificación Estado Pedido, Cron Expirar Pedidos y Derivar
Humano. Entrada:

```json
{
  "restaurante_id": 1,
  "destinatario": "+34600000000",
  "tipo": "texto | botones | lista | pedir_ubicacion | plantilla",
  "texto": "…",
  "botones": [{ "id": "recoger", "titulo": "Recoger" }],
  "lista": {
    "boton": "Ver locales",
    "secciones": [{ "titulo": "…", "filas": [{ "id": "…", "titulo": "…", "descripcion": "…" }] }]
  },
  "plantilla": { "nombre": "…", "idioma": "es", "parametros": {} }
}
```

- Busca el canal activo del restaurante (`canal_whatsapp`) y envía con el nodo oficial de Kapso
  («Send Raw Payload», formato de la Cloud API de Meta) a `/{phone_number_id}/messages`.
- Límites de Meta (por confirmar en el sandbox): 3 botones de 20 caracteres, listas de 10 filas.
  Si se superan o el envío interactivo falla, se manda el mismo contenido como texto numerado.
- Fuera de la ventana de 24 h solo se puede enviar plantilla: el subflujo lo detecta por
  `whatsapp_conversacion.ultimo_entrante_at` y, sin plantilla, no envía y lo registra.
- Ningún otro nodo llama a Kapso directamente.

## 4. Identidad del agente y configuración

El agente se presenta siempre como el del restaurante consultado. Un solo nodo «Construir
identidad» arma el mensaje de sistema a partir de la base; nada de texto por cliente en los flujos.

| Dato                                                                           | De dónde sale                                                                | Quién lo edita               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------- |
| Nombre del restaurante                                                         | `restaurante.nombre`                                                         | Ajustes → Datos (ya existe)  |
| Bienvenida y mensaje de cerrado                                                | `restaurante.mensaje_bienvenida`, `restaurante.mensaje_cerrado` (ya existen) | Ajustes → Agente de WhatsApp |
| `agente_activo` (booleano)                                                     | `restaurante_config`                                                         | Ajustes → Agente de WhatsApp |
| `agente_nombre_visible` (texto; vacío = «agente de pedidos de <restaurante>»)  | `restaurante_config`                                                         | Ajustes → Agente de WhatsApp |
| `agente_tono` (`cercano` / `formal`)                                           | `restaurante_config`                                                         | Ajustes → Agente de WhatsApp |
| `agente_instrucciones` (texto corto: lo que el agente debe saber del local)    | `restaurante_config`                                                         | Ajustes → Agente de WhatsApp |
| `agente_pausa_minutos` (entero: cuánto calla el agente si escribe el personal) | `restaurante_config`                                                         | Ajustes → Agente de WhatsApp |
| Módulos `whatsapp.channel` y `whatsapp.agent`                                  | `restaurante_modulo` (ya existen)                                            | `/interno`                   |
| Número conectado                                                               | `canal_whatsapp`                                                             | `/interno`                   |
| `agente_modelo`, `agente_limite_mensajes_dia`                                  | `restaurante_config`                                                         | `/interno`                   |

- Las claves nuevas se documentan en `config_clave` (migración). Sin valor no se inventa uno en
  el código: el agente usa el nombre del restaurante, tono `cercano` documentado como valor de
  ejemplo y la pausa se desactiva; `agente_activo` falso o sin módulo → no responde.
- Ajustes → Agente de WhatsApp usa el permiso `agent.configure` (ya existe en `packages/access`).
- Horario, carta, zonas, mínimos, formas de pago y tiempos: los mismos datos que la web.

## 5. Tablas nuevas (migración 0038, en su propio PR)

```sql
-- Número de WhatsApp de un restaurante (o de un local) en un proveedor.
CREATE TABLE public.canal_whatsapp (
  id               bigserial    PRIMARY KEY,
  restaurante_id   int4         NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  sucursal_id      bigint       NULL,                  -- sucursal.id es bigint
  proveedor        varchar(20)  NOT NULL CHECK (proveedor IN ('kapso')),
  phone_number_id  varchar(64)  NOT NULL,
  numero_e164      varchar(20)  NOT NULL CHECK (numero_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  modo_conexion    varchar(20)  NOT NULL CHECK (modo_conexion IN ('coexistencia', 'dedicado', 'sandbox')),
  cliente_proveedor_id varchar(64) NULL,           -- customer de Kapso
  estado           varchar(20)  NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'activo', 'pausado', 'desconectado')),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT canal_whatsapp_numero_uk UNIQUE (proveedor, phone_number_id),
  CONSTRAINT canal_whatsapp_id_restaurante_key UNIQUE (id, restaurante_id),
  -- El local debe ser del mismo restaurante (usa sucursal_id_restaurante_key de la 0003).
  CONSTRAINT canal_whatsapp_sucursal_fk FOREIGN KEY (sucursal_id, restaurante_id)
    REFERENCES public.sucursal (id, restaurante_id)
);
CREATE INDEX idx_canal_whatsapp_restaurante ON public.canal_whatsapp (restaurante_id) WHERE estado = 'activo';

-- Estado de cada conversación para el agente (pausa por atención humana, ventana de 24 h).
-- Una conversación es de un cliente con un número del restaurante: clave (canal_id, telefono).
CREATE TABLE public.whatsapp_conversacion (
  canal_id             bigint      NOT NULL,
  restaurante_id       int4        NOT NULL,
  telefono             text        NOT NULL,
  pausado_hasta        timestamptz NULL,
  pausado_por          varchar(20) NULL CHECK (pausado_por IN ('personal', 'derivar_humano', 'panel')),
  ultimo_entrante_at   timestamptz NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canal_id, telefono),
  -- El restaurante de la conversación es siempre el del canal.
  CONSTRAINT whatsapp_conversacion_canal_fk FOREIGN KEY (canal_id, restaurante_id)
    REFERENCES public.canal_whatsapp (id, restaurante_id) ON DELETE CASCADE
);
CREATE INDEX idx_whatsapp_conversacion_restaurante ON public.whatsapp_conversacion (restaurante_id, telefono);

-- Entregas ya procesadas (idempotencia de los webhooks). Se purga a los 7 días.
CREATE TABLE public.whatsapp_evento (
  clave        varchar(128) PRIMARY KEY,
  recibido_at  timestamptz  NOT NULL DEFAULT now()
);
```

- Varios números por restaurante: uno general (`sucursal_id` nulo) o uno por local (Siempre
  Juntos podría tener uno para cada local; el local queda preseleccionado para recoger).
- **Decisión (13/11): una conversación por cliente y número, no por restaurante.** Si un cliente
  escribe a los dos números de un restaurante (uno por local), cada conversación tiene su propia
  pausa y su propia ventana de 24 h, y `canal_id` nunca cambia de valor. El agente ya conoce el
  restaurante por el canal; el local queda preseleccionado según el número.
- **Permisos explícitos** (la 0038 no depende de los permisos por defecto del README del
  staging, que se dieron una sola vez al crear el rol). Cada `GRANT` va protegido con una
  comprobación de que el rol existe, para que la migración también corra en bases de prueba:

  | Rol              | `canal_whatsapp`                                          | `whatsapp_conversacion`  | `whatsapp_evento`        |
  | ---------------- | --------------------------------------------------------- | ------------------------ | ------------------------ |
  | `konnecttia_app` | `SELECT, INSERT, UPDATE, DELETE` (lo gestiona `/interno`) | `SELECT` (vista futura)  | —                        |
  | `n8n_agente`     | `SELECT`                                                  | `SELECT, INSERT, UPDATE` | `SELECT, INSERT, DELETE` |

  Más `USAGE, SELECT` en las secuencias que corresponda. `DELETE` en `whatsapp_evento` es para la
  **purga de 7 días** del Cron (`DELETE … WHERE recibido_at < now() - interval '7 days'`); el
  agente no borra conversaciones.
- Prueba de aislamiento (regla de `AGENTS.md`): el restaurante A no ve los canales ni las
  conversaciones del B.
- Más adelante (aislamiento, punto 5 del plan del agente): `n8n_chat_histories` con clave de
  sesión `{restaurante_id}:{telefono}`.

## 6. Alta de un número

- **Staging (ahora, manual):** el número entra en Kapso (sandbox o enlace de alta), se registra el
  webhook del número hacia n8n y se inserta la fila en `canal_whatsapp` con SQL.
- **Después (automático, sesión EasyOrder):** `/interno` → «Conectar WhatsApp» → la API crea el
  cliente en Kapso (`external_customer_id` = id del restaurante) y un enlace de alta en español;
  el restaurante lo completa con su cuenta de Meta (coexistencia o dedicado); el evento
  `whatsapp.phone_number.created` llega a un webhook firmado de la API, que crea la fila de
  `canal_whatsapp` y registra el webhook de mensajes del número hacia n8n.
- Coexistencia según Kapso: hasta 20 mensajes/s, algunos primeros mensajes pueden tardar en llegar
  y puede desconectarse; el modo dedicado es más estable. Para un restaurante basta la
  coexistencia; se vigila en las pruebas.

## 7. Números de prueba

1. **Sandbox de Kapso** primero: solo el teléfono de prueba registrado puede escribirle, admite
   texto e interactivos y no plantillas. Riesgo cero para La Isla.
2. El **número de pruebas de EE. UU.** después, por enlace de alta de Kapso. Antes, desactivar los flujos del
   staging antiguo (`n8nlearning`) para que no respondan dos agentes. No tocar el webhook de la
   app de Meta «chatwoot», que usa La Isla.
3. El **número de La Isla** solo cuando el promotor decida apagar esa demo.

## 8. Orden de construcción (un PR por pieza)

| PR  | Sesión    | Contenido                                                                                                                                         |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Agente    | Migración 0038 (tablas de arriba + claves `agente_*` en `config_clave`) y permisos                                                                |
| 2   | Agente    | «[Canal] Entrada Kapso», «[Canal] Enviar mensaje», Director sin Chatwoot ni Redis, «Construir identidad»; script de publicación por la API de n8n |
| 3   | Agente    | Notificación Estado Pedido, Cron Expirar Pedidos y Derivar Humano por el adaptador; fuera «noti lovable»                                          |
| 4   | EasyOrder | Ajustes → Agente de WhatsApp y canal manual en `/interno`                                                                                         |
| 5   | EasyOrder | Alta automática con enlace de Kapso                                                                                                               |

Riesgo: medio (sustituye la entrada y la salida del agente), solo en staging; la demo de La Isla
no se toca. MVP: PR 1 a 4; el alta automática (5) puede ir después.

## 9. Por confirmar con el sandbox

Forma exacta de `list_reply`; si la URL de los adjuntos exige la clave y cuánto dura; límites de
botones y listas; salida del nodo disparador de Kapso; región de datos y contrato de encargado.
