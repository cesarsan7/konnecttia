# apps/api

API HTTP en Hono sobre la base de datos existente de EasyOrder.

## Endpoints

| Método y ruta                          | Acceso                               | Qué hace                                                                        |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `GET /health`                          | Público                              | Comprobación de vida                                                            |
| `GET /public/:slug/menu`               | Público                              | Carta activa por categorías y si el local está abierto                          |
| `POST /public/:slug/orders`            | Público + cabecera `Idempotency-Key` | Crea un pedido. El total lo calcula el servidor; el cuerpo no lleva precios     |
| `GET /public/orders/:token`            | Público con token                    | Seguimiento sin teléfono ni dirección                                           |
| `GET /panel/:slug/orders`              | Miembro + `orders.view`              | Pedidos del restaurante                                                         |
| `PATCH /panel/:slug/orders/:id/status` | Miembro + `orders.change_status`     | Cambia el estado según la máquina de estados; audita y deja evento en el outbox |

## Qué corrige respecto a EasyOrder

- Precio calculado en el servidor (`@konnecttia/domain`): envases, extras, mínimo de reparto.
- Idempotencia real por clave, también con peticiones simultáneas.
- Seguimiento por `tracking_token` aleatorio; el código `AAMMDD-NNNN` ya no da acceso.
- Acceso por módulo activo + permiso del rol (`@konnecttia/access`), con auditoría de denegaciones.
- Regla de pago: no se marca como entregado un pedido con el pago pendiente.
- Rate limit por la IP que fija el proxy (`CLIENT_IP_HEADER`), no por `X-Forwarded-For`.
- Errores sin detalles internos, con referencia (`X-Request-Id`) para soporte.

El pedido se guarda en el formato JSON que ya leen el panel de EasyOrder y los flujos de n8n,
así que ambos sistemas pueden convivir durante la migración.

## Configuración

Ver `.env.example`. Suplementos por restaurante en `restaurante_config`:

```sql
INSERT INTO restaurante_config (restaurante_id, config_key, config_value)
VALUES (<id>, 'surcharge_rules', '[{"label":"Envases","below":25,"amount":1}]');
```

## Pruebas

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres pnpm --filter @konnecttia/api test
```

Crean una base temporal con todas las migraciones y datos sintéticos de dos restaurantes, y la
borran al terminar. Sin `TEST_DATABASE_URL` se omiten.

## Pendiente

Resto de endpoints del panel (carta, horarios, zonas, clientes, mesas, equipo), envío de avisos
desde el outbox (`apps/worker`) y endpoints para las tools del agente de n8n.
