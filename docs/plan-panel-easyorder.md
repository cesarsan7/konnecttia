# Plan del panel de EasyOrder (lo que falta para el MVP)

Documento de traspaso: cualquier sesión de trabajo (persona o agente) puede retomar desde aquí.
Leer antes `AGENTS.md` y `docs/konnecTTia.md`. Estado al 4 de noviembre de 2026.

## Hecho

| Pieza                                                                                | Dónde                                                                                                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Carta pública, checkout, seguimiento                                                 | `apps/easyorder/src/app/[slug]`                                                                                              |
| Acceso (Supabase Auth), selector de restaurante                                      | `/panel`, `GET /me/restaurantes`                                                                                             |
| Tablero de pedidos en directo, cobro, cancelar, tarjetas plegables                   | `/panel/[slug]`                                                                                                              |
| Modo ocupado configurable (`modo_ocupado_opciones`, `modo_ocupado_duracion_minutos`) | 0009                                                                                                                         |
| Estadísticas                                                                         | `/panel/[slug]/estadisticas`, `GET /panel/:slug/reports/overview`                                                            |
| Cotización para n8n (Despacho v2)                                                    | `POST /public/:slug/cotizacion`                                                                                              |
| **Carta (pieza 1)**: PR #23 (fusionado), CORS PR #24                                 | `/panel/[slug]/carta`, `/panel/:slug/carta/*`, migración 0011                                                                |
| **Ajustes, parte 1 (pieza 3)**: PR #25 (fusionado)                                   | `/panel/[slug]/ajustes`, `/panel/:slug/ajustes/*`, sin migraciones                                                           |
| **Ajustes, parte 2**: zonas y tarifas de reparto, horas punta, suplementos. PR #26   | pestaña Reparto, `/panel/:slug/reparto/zonas`, `/panel/:slug/ajustes/franjas`, `suplementos` en `PATCH /ajustes/restaurante` |
| **Equipo y roles (pieza 4)**: PR #27, migración 0012                                 | `/panel/[slug]/equipo`, `/panel/unirse/[token]`, `/panel/:slug/equipo/*`, `/me/invitaciones/:token`                          |
| **Pedido manual (pieza 2)**: PR #28                                                  | «Nuevo pedido» en el tablero, `POST /panel/:slug/orders`, `repositories/place-order.ts`                                      |
| **Clientes (pieza 5)**: PR #29                                                       | `/panel/[slug]/clientes`, `/panel/:slug/clientes/*` (lista, ficha, exportar CSV)                                             |
| **Tiempo real (pieza 6)**: PR #30                                                    | `GET /panel/:slug/orders/stream` (SSE)                                                                                       |
| **Mesas** (post-MVP, módulo `tables`): PR #31                                        | `/panel/[slug]/mesas`, `/panel/:slug/mesas/*`, pedidos `tipo_despacho = mesa`                                                |
| **Gestión de mesas** y opción «Mesa» en el pedido manual: PR #33, migración 0013     | ventana de mesa (pedidos, cuenta, ocupar, liberar), `PATCH /panel/:slug/mesas/:id/estado`                                    |
| **Repetir pedido** por teléfono en el pedido manual: PR #34                          | `GET /panel/:slug/orders/anteriores`, `lib/panel/reorder.ts`, `lookup_pedidos_limit`                                         |
| **Invitación por email** (Resend): PR #35                                            | `lib/mailer.ts`, `RESEND_API_KEY`, `RESEND_FROM`, `PANEL_PUBLIC_URL`                                                         |

### Notas de la pieza 1 (Carta)

- Migración `0011_carta_panel.sql`: añade `sort_order` en `menu_item`, `menu_variant` y `extra`, y
  `alergenos text[]` en `menu_item` y `extra`. NULL significa «no informados» y `{}` significa
  ninguno. Aplicada en staging.
- Fotos: activas en staging (`SUPABASE_SERVICE_ROLE_KEY`) (bucket
  `MENU_IMAGES_BUCKET`, por defecto `menu-images`). Sin la clave, el panel permite pegar una URL https.
- La carta es común a todos los locales: solo la cambia quien tiene alcance sobre todos. Un usuario
  limitado a unos locales solo marca la disponibilidad en los suyos.
- Marcar un producto como agotado exige `menu.update`. Hoy el rol «personal» no lo tiene. Si el
  personal debe poder marcar agotados, falta un permiso propio (p. ej. `menu.availability`) desde el
  panel de Konnecttia.
- Alérgenos de las variantes: el dominio ya los admite, pero el MVP no los usa.
- n8n todavía no lee `sucursal_item_no_disponible` ni `alergenos`.

### Notas de Ajustes (parte 1)

- Métodos de pago elegibles: efectivo, tarjeta, transferencia y Bizum («online» no, hasta la
  pasarela). Transferencia exige IBAN válido y titular; Bizum, teléfono.
- El horario actualiza las filas de `horarios` conservando cómo escribe el día n8n.
- «Según horario» borra `is_open_override`; abierto/cerrado escriben `true`/`false`.
- Crear o borrar locales queda para el panel interno de Konnecttia.

### Notas de Equipo y roles

- Sin envío de emails todavía (pieza 7): la invitación es un enlace que se copia o se manda por
  WhatsApp; caduca a los 7 días y vale una vez. Con email, solo esa cuenta puede aceptarla.
- El invitado crea su cuenta en `/panel/unirse/[token]` (Supabase `signUp`): en Supabase deben
  estar permitidos los registros y, si se exige confirmar el email, la URL del panel debe estar
  en las Redirect URLs.
- Sin escalada (`canGrantRole`, `canGrantBranches`); nadie se cambia ni se quita a sí mismo; el
  restaurante nunca se queda sin propietario. `local_memberships.rol` se mantiene para el
  dashboard antiguo (owner / manager / viewer).
- El menú del panel oculta las secciones sin permiso; «Premium» solo si falta el módulo.

### Notas de pedido manual, clientes, tiempo real y mesas

- Pedido manual: la lógica de `POST /public/:slug/orders` vive en `placeOrder` y la usan la web y el
  panel. Canal `telefono` o `mostrador`; el teléfono es obligatorio salvo en mesa
  (`pedidos.telefono` es NOT NULL: en mesa se guarda vacío y no se crea perfil de cliente).
- Clientes: nunca se expone `usuarios.contexto`; el CSV neutraliza fórmulas y queda en la
  auditoría. Un usuario limitado a unos locales solo ve clientes y pedidos de esos locales.
- Tiempo real: n8n escribe en `pedidos` sin outbox, por eso el servidor compara una huella del
  tablero cada 2 s y avisa por SSE. Si el directo cae, el tablero vuelve al sondeo de 10 s.
- Mesas: reutiliza `zona_mesa` y `mesa` (con `sucursal_id`). `FULFILLMENT.DineIn = "mesa"` en el
  dominio: pasa de listo a entregado, sin envío ni suplementos de envases. Solo desde el panel; la
  web pública no lo ofrece. Desde 0013 la mesa se ocupa a mano o con su primer pedido
  (`mesa.ocupada_desde`) y sigue ocupada hasta que el equipo la libera, aunque sus pedidos ya
  estén servidos; no se libera con pedidos en marcha (409 `orders_in_progress`). Los pedidos
  desde `ocupada_desde` son la cuenta de la mesa.
- Repetir pedido: solo en el panel (`orders.create`). El teléfono se compara por dígitos
  (`+34…`, `34…`, `612…`). En la web pública no se ofrece sin verificar antes el teléfono.
- Invitación por email: Resend con fetch, sin SDK. El enlace usa el `Origin` permitido o
  `PANEL_PUBLIC_URL`; si Resend falla, la invitación se crea igual.
- Barra inferior del móvil: 4 secciones y «Más».

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

| #   | Pieza                                       | Qué incluye                                                                                                                      | Tablas                                          | Permisos                   | Fase     |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------- | -------- |
| 1   | ~~Carta~~                                   | Hecha en el PR #23 (fusionado, 0011 aplicada en staging)                                                                         | —                                               | `menu.*`                   | MVP      |
| 2   | ~~Pedido manual~~                           | Hecho en el PR #28                                                                                                               | —                                               | `orders.create`            | MVP      |
| 3   | ~~Configuración~~                           | Hecha: parte 1 (PR #25) y parte 2 (zonas, horas punta, suplementos)                                                              | —                                               | `settings.*`, `delivery.*` | MVP      |
| 4   | ~~Equipo y roles~~                          | Hecho: invitación por enlace (opcionalmente para un email), rol y locales, cambiar y quitar acceso. Roles propios: panel interno | —                                               | `team.*`                   | MVP      |
| 5   | ~~Clientes~~                                | Hecho en el PR #29                                                                                                               | —                                               | `customers.*`              | MVP      |
| 6   | ~~Tiempo real~~                             | Hecho en el PR #30 (huella del tablero, también detecta cambios de n8n)                                                          | —                                               | `orders.view`              | MVP      |
| 7   | **Avisos por email**                        | Worker que lee `outbox_evento` y envía al cliente y al local (el mailer de Resend ya existe, PR #35)                             | `outbox_evento`                                 | —                          | Fase 3   |
| 8   | **Panel interno Konnecttia** (`apps/admin`) | Alta de restaurante, plan, módulos y complementos, roles por restaurante                                                         | `restaurante_plan`, `restaurante_modulo`, `rol` | solo equipo Konnecttia     | Fase 3   |
| 9   | **Derivar a humano en el panel**            | Ver conversaciones derivadas por el agente y responder                                                                           | Chatwoot / Kapso                                | `conversations.*`          | Post-MVP |
| 10  | **Cobro online**                            | ADR y pasarela                                                                                                                   | —                                               | —                          | Post-MVP |

## Requerimientos del promotor (4/11), aterrizados

Ideas de alto nivel convertidas en piezas. Orden de trabajo: A → B → C → D → E → F. E y F
necesitan las plantillas de D (roles).

### A · Pedidos: vista tabla, filtros y orden (MVP)
- Problema: con muchos pedidos, el tablero (kanban) obliga a hacer mucho scroll; La Isla tenía una
  tabla con filtros y orden.
- Solución: conmutador **Tablero / Tabla** en Pedidos (se recuerda por navegador).
  - Tabla: una fila por pedido con código, hora, cliente, tipo (recogida, reparto, mesa), local,
    canal, estado, cobro, total y la acción principal. Clic en la fila abre el detalle.
  - Filtros: fechas (hoy, ayer, 7 días, mes, rango), estado o «en marcha», tipo, canal, método y
    estado de cobro, local y búsqueda por código, nombre o teléfono.
  - Orden por columnas (fecha, código, cliente, estado, total, tiempo de espera), asc/desc.
  - Paginación en el servidor (la tabla sirve también de historial; el tablero solo muestra lo
    de las últimas 12 horas).
- Orden en el tablero: selector «Más antiguos primero» (por defecto, lo que más espera),
  «Más recientes primero», «Por hora de entrega» y «Por importe».
- API: `GET /panel/:slug/orders/historial` con `desde`, `hasta` (días del restaurante), `estado`
  (lista o `activos`), `tipo`, `canal`, `pago`, `metodo`, `local`, `q`, `orden`, `dir`,
  `pagina`; devuelve `total` e `importe`. El tablero sigue con `GET /orders?vista=tablero`.
- Hecho en el PR de «vista tabla» (junto con B). En el móvil cada pedido es una tarjeta y los
  filtros se pliegan.
- Tablas: solo lectura de `pedidos`. Sin migraciones.

### B · Modo ocupado explicado (MVP)
- Qué hace (comprobado en `repositories/eta.ts`): suma los minutos elegidos al **tiempo
  estimado que ven los clientes nuevos** del local (web y WhatsApp vía la cotización), durante
  `modo_ocupado_duracion_minutos`, y se apaga solo. No para los pedidos, no cambia los ya hechos
  ni avisa a nadie. Se suma a las horas punta (`franja_pico`) y al ajuste por cola.
- Solución: desplegable «¿Qué hace el modo ocupado?» en el tablero y en Ajustes, con un ejemplo
  del tiempo resultante («25-35 min → 40-50 min»). Hecho con A.

### C · Mesas: tiempos y avisos (post-MVP)
- Problema: saber si una mesa lleva mucho tiempo esperando o sentada.
- Solución: en cada mesa, **tiempo en el estado actual** del último pedido («Preparando hace
  12 min», de `pedido_estado_log`) y **tiempo sentados**. Aviso de color cuando se pasa del umbral:
  `mesa_aviso_espera_minutos` (pedido sin servir) y `mesa_aviso_estancia_minutos` (estancia).
  Sin la clave, no hay aviso (nada de valores fijos). En la ventana de mesa, línea de tiempo de
  cada pedido (recibido, preparando, listo, servido, con hora).
- Tablas: `pedido_estado_log` (lectura), `config_clave` (2 claves nuevas).

### D · Roles personalizados y plantillas nuevas (MVP para plantillas, post-MVP para editor)
- Hoy: 4 plantillas globales (propietario, encargado, personal, consulta) definidas en código y
  migraciones; los roles propios de un restaurante solo los crearía el panel interno.
- Solución en dos capas:
  1. **Plantillas globales** (las definimos los desarrolladores en `packages/access` + migración):
     nuevas **Mesero** y **Repartidor**, y los permisos nuevos que piden E y F.
  2. **Roles propios del restaurante** en Equipo → Roles: crear, editar (nombre y permisos
     agrupados por módulo) y borrar. Sin escalada: solo se pueden dar permisos que tiene quien
     edita y de módulos activos. No se borra un rol en uso. Auditoría de cada cambio.
- El panel interno de Konnecttia (pieza 8) añadirá después: plantillas propias de Konnecttia,
  activar módulos y ver/editar roles de cualquier restaurante.
- Tablas: `rol`, `rol_permiso`, `membresia_rol`, `permiso`.

### E · Meseros (post-MVP, módulo `tables`)
- Reutiliza `meseros` (nombre, activo) y `pedidos.mesero_id` del dashboard antiguo; se añade
  `sucursal_id` y `membership_id` opcional (un mesero puede tener o no usuario en el panel).
- Mesas → Meseros: alta, baja y edición por local. Al tomar un pedido en mesa se elige el mesero;
  si quien lo toma es un mesero con usuario, se asigna solo. La ocupación de la mesa guarda el
  mesero que la atiende.
- Tabla de pedidos y estadísticas filtrables por mesero (base para propinas en el futuro).
- Permisos: `tables.manage` gestiona meseros; plantilla Mesero = pedidos (ver, crear, cambiar
  estado), carta (ver) y mesas (ver, gestionar).

### F · Repartidores y trazabilidad (post-MVP, módulo `delivery`)
- Asignar un pedido de reparto a un repartidor (miembro con rol Repartidor y acceso al local).
- Permisos nuevos: `delivery.assign` (asignar, encargado) y `orders.deliver_assigned` (el
  repartidor ve **sus** repartos y los marca «en camino» y «entregado», nada más).
- Vista «Mis repartos» para el repartidor (móvil primero): dirección, teléfono, cobro pendiente,
  botones grandes.
- Trazabilidad: `pedido_reparto` (pedido, repartidor, asignado_por, asignado_at, salida_at,
  entregado_at) + `pedido_estado_log` con el actor. Filtro por repartidor en la tabla de pedidos.
- Tablas nuevas: `pedido_reparto`.

## n8n (staging) pendiente

- Director: sacar el restaurante de la bandeja de Chatwoot por la que entra el mensaje, en lugar
  del atributo `p_restaurante_id` con el valor 11 por defecto.
- Revisar el resto de subflujos con datos de La Isla escritos a mano.
- Leer `sucursal_item_no_disponible` (agotados por local) y `alergenos` en la consulta de carta.
