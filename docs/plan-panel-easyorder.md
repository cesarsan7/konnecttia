# Plan del panel de EasyOrder (lo que falta para el MVP)

Documento de traspaso: cualquier sesión de trabajo (persona o agente) puede retomar desde aquí.
Leer antes `AGENTS.md` y `docs/konnecTTia.md`. Estado al 3 de noviembre de 2026.

## Hecho

| Pieza | Dónde |
| --- | --- |
| Carta pública, checkout, seguimiento | `apps/easyorder/src/app/[slug]` |
| Acceso (Supabase Auth), selector de restaurante | `/panel`, `GET /me/restaurantes` |
| Tablero de pedidos en directo, cobro, cancelar, tarjetas plegables | `/panel/[slug]` |
| Modo ocupado configurable (`modo_ocupado_opciones`, `modo_ocupado_duracion_minutos`) | 0009 |
| Estadísticas | `/panel/[slug]/estadisticas`, `GET /panel/:slug/reports/overview` |
| Cotización para n8n (Despacho v2) | `POST /public/:slug/cotizacion` |

## Reglas para cada pieza nueva

- Antes de empezar: componente, qué reutiliza, tablas, riesgo y si es MVP (`CLAUDE.md`).
- Cada endpoint del panel exige membresía y un permiso de `@konnecttia/access`, filtra por
  `restaurante_id` y por los locales del usuario (`branchFilter` / `canAccessBranch`), y deja
  rastro en `auditoria` si cambia datos.
- Nada de valores de negocio en el código: lo que cambie por restaurante va en la base
  (`restaurante_config` documentado en `config_clave`, o tabla propia).
- Migraciones nuevas en `packages/db/migrations` (sin BEGIN/COMMIT), probadas con `--check`.
- Pruebas de API con Postgres real (`apps/api/test`), pruebas de la web con Vitest, y revisión
  visual con Playwright en escritorio y móvil, claro y oscuro.
- Una rama y un PR por pieza, siempre contra `main`.
- Todo en staging (`n8nlearning`, `easyorder_dev`). La demo de La Isla no se toca.

## Pendiente, en orden

| # | Pieza | Qué incluye | Tablas | Permisos | Fase |
| --- | --- | --- | --- | --- | --- |
| 1 | **Carta** | Categorías, productos, variantes, extras y su orden; activar/ocultar; disponibilidad por local; alérgenos (los 14 de la UE, «no informados» por defecto); foto | `menu_category`, `menu_item`, `menu_variant`, `extra`, `menu_category_extra`, `sucursal_item_no_disponible` | `menu.*` | MVP |
| 2 | **Pedido manual** | Crear un pedido desde el panel (teléfono o mostrador) con el mismo cálculo del servidor que la web | `pedidos` (vía `createOrder`) | `orders.create` | MVP |
| 3 | **Configuración** | Datos del local, horarios por local, festivos, zonas y tarifas, tiempos (base, hora punta), métodos de pago y datos bancarios, opciones del modo ocupado | `restaurante`, `horarios`, `sucursal_horario`, `festivo`, `delivery_zone`, `franja_pico`, `restaurante_config` | `settings.*`, `delivery.manage` | MVP |
| 4 | **Equipo y roles** | Invitar por email, asignar rol (propietario, encargado, personal, consulta) y locales; quitar acceso | `restaurant_invites`, `local_memberships`, `membresia_rol`, `membresia_sucursal` | `team.*` | MVP |
| 5 | **Clientes** | Lista, ficha con historial de pedidos y dirección frecuente; exportar | `usuarios`, `pedidos` | `customers.*` | MVP |
| 6 | **Tiempo real** | Sustituir el sondeo de 10 s por SSE desde `outbox_evento` | `outbox_evento` | `orders.view` | MVP |
| 7 | **Avisos por email** | Worker que lee `outbox_evento` y envía al cliente y al local | `outbox_evento` | — | Fase 3 |
| 8 | **Panel interno Konnecttia** (`apps/admin`) | Alta de restaurante, plan, módulos y complementos, roles por restaurante | `restaurante_plan`, `restaurante_modulo`, `rol` | solo equipo Konnecttia | Fase 3 |
| 9 | **Derivar a humano en el panel** | Ver conversaciones derivadas por el agente y responder | Chatwoot / Kapso | `conversations.*` | Post-MVP |
| 10 | **Cobro online** | ADR y pasarela | — | — | Post-MVP |

## n8n (staging) pendiente

- Director: sacar el restaurante de la bandeja de Chatwoot por la que entra el mensaje, en lugar
  del atributo `p_restaurante_id` con el valor 11 por defecto.
- Revisar el resto de subflujos con datos de La Isla escritos a mano.
