# apps/worker

Proceso en segundo plano que lee `outbox_evento` con `FOR UPDATE SKIP LOCKED`, por lotes, y envía los
**avisos por email** (pieza 7). Reintenta con espera creciente y se detiene limpiamente con SIGTERM.

**Estado:** avisos por email hechos. Pendientes en el worker: SMS y avisos de pedidos sin atender.

## Qué hace y qué no

| Evento del outbox        | Aviso al local                            | Aviso al cliente                         |
| ------------------------ | ----------------------------------------- | ---------------------------------------- |
| `pedido.recibido`        | «Nuevo pedido» (una o varias direcciones) | Confirmación de que se recibió el pedido |
| `pedido.estado_cambiado` | —                                         | Aceptado, listo, en camino y cancelado   |

El worker **no** avisa por WhatsApp (lo hace n8n, «Notificacion Estado Pedido») ni expira carritos
(«Cron Expirar Pedidos»).

Cada aviso se activa por restaurante en `restaurante_config` (migración `0025`, documentadas en
`config_clave`). Sin clave, todo está apagado:

| Clave                          | Valor                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `avisos_email_local_activo`    | `true` para avisar al local de cada pedido nuevo                                    |
| `avisos_email_local`           | direcciones del local, separadas por coma (máximo 10)                               |
| `avisos_email_cliente_activo`  | `true` para escribir al cliente                                                     |
| `avisos_email_cliente_estados` | estados que avisan al cliente; sin clave: `confirmado, listo, en_camino, cancelado` |

```sql
INSERT INTO restaurante_config (restaurante_id, config_key, config_value) VALUES
  (<id>, 'avisos_email_local_activo', 'true'),
  (<id>, 'avisos_email_local', 'pedidos@ejemplo.com, cocina@ejemplo.com');
```

Detalles:

- El aviso al local no se envía para pedidos creados por el personal (`mostrador`, `telefono`).
- El módulo `notify.email` es de núcleo: está activo salvo que se suspenda o cancele en
  `restaurante_modulo`.
- **Aviso al cliente: preparado pero inactivo.** Ni `pedidos` ni `usuarios` guardan el email del
  cliente y el checkout no lo pide. El worker lo lee de `payload.email_cliente` del evento (solo
  direcciones válidas); como la API aún no lo escribe, hoy no sale ningún email al cliente. Para
  activarlo: pedir el email (opcional, con consentimiento) en el checkout y añadirlo al `payload`
  de los eventos `pedido.recibido` y `pedido.estado_cambiado`, o guardarlo en el pedido y leerlo en
  `loadOrder` (`src/processor.ts`).
- El enlace de seguimiento es `PUBLIC_WEB_URL/<slug>/pedido/<tracking_token>`; sin `PUBLIC_WEB_URL`
  no se avisa al cliente. El del panel es `PANEL_PUBLIC_URL/panel/<slug>`; sin él, el email al local
  no lleva botón.

## Garantías

- **Sin duplicados:** `aviso_envio` guarda un registro por evento y destinatario (único). Si un
  evento se procesa dos veces, o un reintento llega tras un envío parcial, solo se envía a quien falte.
  Se guarda el hash de la dirección, no la dirección.
- **Reintentos:** al reclamar un evento se suma un intento y se reserva `WORKER_LEASE_SECONDS`. Si falla,
  queda `fallido` con `disponible_en = ahora + base · 2^(intento-1)` (con tope). Al llegar a
  `WORKER_MAX_ATTEMPTS` queda `fallido` y no se reclama más. Si el proceso muere a medias, la
  reserva vence y otro lo recoge.
- **Sin `RESEND_API_KEY`** no se envía: los eventos pendientes pasan a `descartado` con
  `ultimo_error = 'sin_proveedor_email'` (no se pierden ni se reintentan sin fin). Para reponerlos
  cuando haya clave:

  ```sql
  UPDATE outbox_evento
  SET estado = 'pendiente', intentos = 0, ultimo_error = NULL, disponible_en = now()
  WHERE estado = 'descartado' AND ultimo_error = 'sin_proveedor_email';
  ```

- **Motivos de omisión** (`outbox_evento.ultimo_error` de un evento `descartado`):
  `aviso_local_apagado`, `aviso_local_sin_destinatarios`, `canal_interno`, `aviso_cliente_apagado`,
  `sin_email_cliente`, `sin_url_publica`, `estado_sin_aviso_cliente`, `modulo_inactivo`,
  `pedido_no_encontrado`, `payload_invalido`.
- **Registro:** una línea JSON por evento (id, tipo, restaurante, intento, resultado, error de
  Resend como `Resend respondió 500`). Nunca emails, nombres ni teléfonos.
- El worker es el único consumidor del outbox: si en el futuro otro proceso consume los mismos eventos
  (SMS), habrá que separar su estado por canal.

## Variables de entorno

Solo en EasyPanel, nunca en el repositorio. Si falta `DATABASE_URL`, el worker no arranca.

| Variable                      | Obligatoria | Qué es                                                                   |
| ----------------------------- | ----------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                | Sí          | Conexión a PostgreSQL                                                    |
| `RESEND_API_KEY`              | No          | Clave de Resend; sin ella no se envía (ver arriba)                       |
| `RESEND_FROM`                 | No          | Remitente verificado en Resend, p. ej. `EasyOrder <hola@konnecttia.com>` |
| `PANEL_PUBLIC_URL`            | No          | URL pública del panel (botón del aviso al local)                         |
| `PUBLIC_WEB_URL`              | No          | URL pública de la web de pedidos (enlace de seguimiento al cliente)      |
| `WORKER_POLL_INTERVAL_MS`     | No          | Espera entre sondeos con la cola vacía (por defecto 5000)                |
| `WORKER_BATCH_SIZE`           | No          | Eventos por lote (10)                                                    |
| `WORKER_MAX_ATTEMPTS`         | No          | Intentos por evento (5)                                                  |
| `WORKER_BACKOFF_BASE_SECONDS` | No          | Espera tras el primer fallo; se duplica en cada intento (30)             |
| `WORKER_BACKOFF_MAX_SECONDS`  | No          | Tope de la espera (3600)                                                 |
| `WORKER_LEASE_SECONDS`        | No          | Reserva de un evento reclamado antes de que otro proceso lo recoja (300) |

## Despliegue en EasyPanel

Servicio aparte, sin dominio ni puerto. Primero en staging (ADR 0008); producción solo con
aprobación del promotor. Aplicar antes la migración `0025`.

1. En el proyecto: _+ Service_ → _App_ → nombre `konnecttia-worker`.
2. _Source_ → GitHub: `cesarsan7/konnecttia`, rama `main` (o la del PR para probarlo).
3. _Build_ → Dockerfile. _Build Path_ = `/`. _File_ = `infra/docker/worker.Dockerfile`.
4. _Environment_: las variables de la tabla (mínimo `DATABASE_URL`; para enviar, `RESEND_API_KEY`
   y `RESEND_FROM`).
5. _Deploy_. No hay `/health`: en los registros debe aparecer `worker_arrancado` con
   `envio_activo: true`. Para parar o redesplegar, EasyPanel envía SIGTERM y el worker termina el
   lote en curso (`worker_detenido`).

Comando de arranque dentro de la imagen: `node dist/index.js`. En local: `pnpm --filter
@konnecttia/worker dev` con las variables en el entorno.

## Pruebas

```bash
pnpm --filter @konnecttia/worker test
```

Las pruebas unitarias (plan de avisos, configuración, reintentos) corren siempre. Las de integración
(`test/processor.test.ts`) crean una base desechable con las migraciones reales y los datos de
`apps/api/test/fixtures.sql`, y necesitan `TEST_DATABASE_URL`; el mailer es simulado.
