# Plan del panel de EasyOrder (lo que falta para el MVP)

Documento de traspaso: cualquier sesión de trabajo (persona o agente) puede retomar desde aquí.
Leer antes `AGENTS.md` y `docs/konnecTTia.md`. Estado al 6 de noviembre de 2026 (noche).

## Hecho

| Pieza                                                                                      | Dónde                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Carta pública, checkout, seguimiento                                                       | `apps/easyorder/src/app/[slug]`                                                                                              |
| Acceso (Supabase Auth), selector de restaurante                                            | `/panel`, `GET /me/restaurantes`                                                                                             |
| Tablero de pedidos en directo, cobro, cancelar, tarjetas plegables                         | `/panel/[slug]`                                                                                                              |
| Modo ocupado configurable (`modo_ocupado_opciones`, `modo_ocupado_duracion_minutos`)       | 0009                                                                                                                         |
| Estadísticas                                                                               | `/panel/[slug]/estadisticas`, `GET /panel/:slug/reports/overview`                                                            |
| Cotización para n8n (Despacho v2)                                                          | `POST /public/:slug/cotizacion`                                                                                              |
| **Carta (pieza 1)**: PR #23 (fusionado), CORS PR #24                                       | `/panel/[slug]/carta`, `/panel/:slug/carta/*`, migración 0011                                                                |
| **Ajustes, parte 1 (pieza 3)**: PR #25 (fusionado)                                         | `/panel/[slug]/ajustes`, `/panel/:slug/ajustes/*`, sin migraciones                                                           |
| **Ajustes, parte 2**: zonas y tarifas de reparto, horas punta, suplementos. PR #26         | pestaña Reparto, `/panel/:slug/reparto/zonas`, `/panel/:slug/ajustes/franjas`, `suplementos` en `PATCH /ajustes/restaurante` |
| **Equipo y roles (pieza 4)**: PR #27, migración 0012                                       | `/panel/[slug]/equipo`, `/panel/unirse/[token]`, `/panel/:slug/equipo/*`, `/me/invitaciones/:token`                          |
| **Pedido manual (pieza 2)**: PR #28                                                        | «Nuevo pedido» en el tablero, `POST /panel/:slug/orders`, `repositories/place-order.ts`                                      |
| **Clientes (pieza 5)**: PR #29                                                             | `/panel/[slug]/clientes`, `/panel/:slug/clientes/*` (lista, ficha, exportar CSV)                                             |
| **Tiempo real (pieza 6)**: PR #30                                                          | `GET /panel/:slug/orders/stream` (SSE)                                                                                       |
| **Mesas** (post-MVP, módulo `tables`): PR #31                                              | `/panel/[slug]/mesas`, `/panel/:slug/mesas/*`, pedidos `tipo_despacho = mesa`                                                |
| **Gestión de mesas** y opción «Mesa» en el pedido manual: PR #33, migración 0013           | ventana de mesa (pedidos, cuenta, ocupar, liberar), `PATCH /panel/:slug/mesas/:id/estado`                                    |
| **Repetir pedido** por teléfono en el pedido manual: PR #34                                | `GET /panel/:slug/orders/anteriores`, `lib/panel/reorder.ts`, `lookup_pedidos_limit`                                         |
| **Invitación por email** (Resend): PR #35                                                  | `lib/mailer.ts`, `RESEND_API_KEY`, `RESEND_FROM`, `PANEL_PUBLIC_URL`                                                         |
| Requerimientos A–F del 4/11 (tabla, mesas, roles, meseros, repartidores), comanda: #37–#43 | ver sección «Requerimientos del promotor (4/11)»                                                                             |
| Requerimientos G–S del 6/11 y extras: #44–#62                                              | ver sección «Requerimientos del promotor (6/11)»                                                                             |

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

| #   | Pieza                                     | Qué incluye                                                                                                                                   | Tablas                                          | Permisos                   | Fase     |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------- | -------- |
| 1   | ~~Carta~~                                 | Hecha en el PR #23 (fusionado, 0011 aplicada en staging)                                                                                      | —                                               | `menu.*`                   | MVP      |
| 2   | ~~Pedido manual~~                         | Hecho en el PR #28                                                                                                                            | —                                               | `orders.create`            | MVP      |
| 3   | ~~Configuración~~                         | Hecha: parte 1 (PR #25) y parte 2 (zonas, horas punta, suplementos)                                                                           | —                                               | `settings.*`, `delivery.*` | MVP      |
| 4   | ~~Equipo y roles~~                        | Hecho: invitación por enlace (opcionalmente para un email), rol y locales, cambiar y quitar acceso. Roles propios: panel interno              | —                                               | `team.*`                   | MVP      |
| 5   | ~~Clientes~~                              | Hecho en el PR #29                                                                                                                            | —                                               | `customers.*`              | MVP      |
| 6   | ~~Tiempo real~~                           | Hecho en el PR #30 (huella del tablero, también detecta cambios de n8n)                                                                       | —                                               | `orders.view`              | MVP      |
| 7   | ~~Avisos por email~~                      | Hecho en el PR #61 (`apps/worker`, 0025): aviso al local; al cliente, cuando el pedido trae email (obligatorio en el checkout web desde 0027) | `outbox_evento`                                 | —                          | Fase 3   |
| 8   | ~~Panel interno Konnecttia~~ (`/interno`) | Hecho en el PR #54 (ADR 0009, 0022): alta, plan, módulos, métodos de pago. Roles por restaurante hechos en #70                                | `restaurante_plan`, `restaurante_modulo`, `rol` | solo equipo Konnecttia     | Fase 3   |
| 9   | **Derivar a humano en el panel**          | Ver conversaciones derivadas por el agente y responder                                                                                        | Chatwoot / Kapso                                | `conversations.*`          | Post-MVP |
| 10  | **Cobro online**                          | ADR y pasarela                                                                                                                                | —                                               | —                          | Post-MVP |

## Requerimientos del promotor (4/11), aterrizados

Ideas de alto nivel convertidas en piezas. Orden de trabajo: A → B → C → D → E → F. E y F
necesitan las plantillas de D (roles).

Estado (4/11): A y B en el PR #37, C en #38 (0014), D en #39 (0015), E en #40 (0016, encima de
#38) y F en #41 (0017, encima de #39 y #37). Orden de fusión: #37 → #38 → #39 → #40 → #41.

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
- Hecho así: «Mis repartos» aparece en el menú de quien reparte y no lleva el tablero (sin
  `orders.change_status`); si entra en Pedidos sin `orders.view`, va a «Mis repartos». El cambio
  de estado del tablero y del repartidor usa la misma función (`repositories/order-status.ts`).
  Con cobro pendiente (transferencia, Bizum) el repartidor no puede entregar.
- Pendiente: filtro por repartidor y por mesero en la tabla de pedidos y en estadísticas.

## En espera de respuestas del promotor (6/11)

Se retoman cuando el promotor tenga estos datos:

- **Cancelación por el cliente e incidencias (O, P)** y **estimación de costes (T)**:
  - importes mensuales de cada servicio (VPS, Resend, WhatsApp de Meta, Chatwoot, IA del agente,
    otros) y horas que lleva hoy dar de alta un restaurante;
  - si hay un proveedor de reparto externo en mente (M);
  - si hay presupuesto para enviar códigos por SMS o WhatsApp (capa 3 de Q).
- Despliegue: si las migraciones se aplican solas al desplegar o se deja un aviso en `AGENTS.md`.
- ~~Avisos por email al cliente~~: hecho. El email es obligatorio en el checkout web (`pedidos.email_cliente`, 0027) y el cliente puede corregirlo desde el seguimiento mientras el pedido está abierto; el aviso lo envía el worker si el local lo activa.
- ¿Las estadísticas por mesero y repartidor deben verlas todos los que ven estadísticas?

### Estado del 6/11 (noche)

| Pieza                                               | PR       | Migración | Estado                                                                    |
| --------------------------------------------------- | -------- | --------- | ------------------------------------------------------------------------- |
| Documentación comercial                             | #44, #48 | —         | Fusionado                                                                 |
| I · Mesero en la comanda                            | #45      | —         | Fusionado                                                                 |
| J · Aviso en el seguimiento                         | #46      | —         | Fusionado                                                                 |
| H · Nombre y apodo                                  | #47      | 0018      | Fusionado, aplicada                                                       |
| S · Auditoría de seguridad                          | #49      | —         | Fusionado; pendiente la lista de `docs/seguridad/auditoria-2026-11.md`    |
| L · Concepto y justificante de pago                 | #50      | 0020      | Fusionado, aplicada                                                       |
| R · Consentimiento y borrado de datos               | #51, #53 | 0019      | Fusionado, aplicada; el borrado conserva el bloqueo antifraude sin motivo |
| Q · Antifraude (capas 1 y 2)                        | #52      | 0021      | Fusionado, aplicada. n8n: hecho en el flujo Apertura de staging           |
| 8 + K · Panel interno y métodos de pago permitidos  | #54      | 0022      | Fusionado, aplicada                                                       |
| G · Alta autoservicio con prueba                    | #55      | 0023      | Fusionado, aplicada; el alta queda apagada hasta activarla en `/interno`  |
| Recuperar contraseña (Resend, `/panel/restablecer`) | #56, #57 | —         | Fusionado; probado en staging                                             |
| Ajustes de privacidad y antifraude, CSV de clientes | #58      | —         | Fusionado                                                                 |
| Filtros y estadísticas por mesero y repartidor      | #59      | —         | Fusionado                                                                 |
| N · Foto de entrega                                 | #60      | 0024      | Fusionado; confirmar la migración en staging                              |
| 7 · Avisos por email (worker)                       | #61      | 0025      | Fusionado; confirmar la migración y crear el servicio del worker          |
| Guía en el panel y centro de ayuda `/ayuda`         | #62      | —         | Fusionado                                                                 |

### Estado del 9/11

| Pieza                                                           | PR  | Migración | Estado                                  |
| --------------------------------------------------------------- | --- | --------- | --------------------------------------- |
| Alta de Arepa's Factory y su carta                              | #68 | —         | Fusionado; aplicar el seed en staging   |
| Alta completa desde `/interno` con importación de la carta      | #69 | —         | Fusionado                               |
| Roles por restaurante en `/interno`                             | #70 | —         | Fusionado                               |
| V · Personalizar plantillas de rol en el panel                  | #71 | —         | Fusionado                               |
| U · Actividad de repartidores y meseros                         | #72 | —         | Fusionado                               |
| Arreglo del typecheck de `panel-roles` tras #70 y #71           | #73 | —         | Fusionado                               |
| Plantillas de rol propias de Konnecttia (`/interno/plantillas`) | #74 | —         | Fusionado                               |
| Q · Antifraude capa 3: propuesta (ADR 0011)                     | #75 | —         | Fusionado; canales y tope decididos     |
| Migraciones automáticas al desplegar la API                     | #77 | —         | Fusionado; vigilar el primer despliegue |
| Q · Antifraude capa 3, paso 1: tabla de códigos                 | #78 | 0026      | Fusionado; confirmar la migración       |
| Costes, prueba de impresión y escenarios de prueba (T, W)       | #79 | —         | Fusionado (`docs/comercial/`)           |
| Email del cliente obligatorio en el checkout web                | #80 | 0027      | Abierto, pendiente de revisión          |

### Decisiones del promotor (9/11)

- **Antifraude, capa 3:** los dos canales (WhatsApp y SMS) a elegir por restaurante al darlo de alta;
  tope de 10 € al mes por restaurante. Tabla de códigos en la migración 0026 (PR #78); la API, la
  web y n8n vienen después. Detalle en el ADR 0011.
- **Migraciones:** se aplican solas al desplegar la API (PR #77).
- **Email del cliente:** obligatorio en el checkout web y editable desde el seguimiento (PR #80,
  abierto, migración 0027). Con él, el worker ya puede enviar los avisos al cliente. WhatsApp y el
  pedido manual no cambian.
- **Reparto externo (M):** pasa a después del MVP.
- **Costes (T):** estimación hecha en `docs/comercial/coste-restaurante-nuevo.md`; faltan datos
  reales de uso y la confirmación de la tarifa de Meta desde el 1/10/2026.

## Requerimientos del promotor (6/11), aterrizados

A–F están fusionados (#37–#43). Orden propuesto: H → I → J (rápidas) → O + P → Q + R → L → K
(con el panel interno) → G → M, N, S, T.

### G · Alta autoservicio con prueba (Fase 3)

- Landing «Prueba gratis» → registro en Supabase con email verificado → asistente: nombre, slug,
  local, dirección, teléfono, horario, cobro, recogida/reparto.
- Crea restaurante, local principal, membresía de dueño y plan `prueba`.
- Límite de la prueba por días **o** por número de pedidos, en configuración global (tabla
  nueva de configuración de plataforma; nada escrito a mano).
- Al vencer: la carta pública deja de aceptar pedidos, el panel muestra «Activa tu plan», los
  datos se conservan.
- Antiabuso: email verificado, límite por IP, slugs reservados, captcha (Turnstile), aprobación
  manual opcional.
- Panel interno: ver, ampliar y convertir pruebas. Checklist de configuración al primer acceso
  (el mismo de `docs/comercial/checklist-alta-restaurante.md`).

### H · Nombre y apodo en el equipo (MVP)

- `local_memberships`: `nombre` (obligatorio al aceptar la invitación o al editar) y `apodo`
  (opcional).
- En la cabecera, el tablero, el historial, los repartos y la comanda se muestra
  «apodo o nombre · rol», nunca el email. El email solo lo ve quien gestiona el equipo.

### I · Mesero en la comanda (MVP)

- Si el pedido tiene mesero, la comanda imprime «Atiende: <apodo o nombre>».

### J · Aviso en el seguimiento web (MVP)

- Tras pedir: «No cierres esta página para ver el estado de tu pedido», con botón para copiar el
  enlace de seguimiento (si la cierra, puede volver con él).

### K · Métodos de pago permitidos por Konnecttia (Fase 3, panel interno)

- Hoy cada restaurante elige sus métodos en Ajustes y la carta solo muestra esos.
- Nuevo: Konnecttia fija qué métodos puede activar cada restaurante (p. ej. La Isla: efectivo y
  tarjeta); Ajustes solo ofrece esos. Tabla de métodos permitidos por restaurante; hasta que
  exista el panel interno, se carga por SQL.

### L · Validar cobros de Bizum y transferencia (post-MVP)

- Hoy: el pedido queda «pendiente de pago» y el local lo confirma a mano en el tablero; no se
  puede entregar sin confirmar. Probado con tests automáticos, no con un cobro bancario real.
- Paso 1: el concepto del pago es el código del pedido (se muestra al cliente) para cuadrarlo
  con el banco, y el cliente puede subir el justificante (captura) que el local ve en el pedido.
- Paso 2 (con «Cobro online»): Bizum y tarjeta por pasarela (TPV del banco con Bizum, o
  similar), que confirma el pago sola. Leer movimientos del banco por API (PSD2) es posible pero
  caro de mantener; no se recomienda para el MVP.

### M · Reparto con plataforma externa (post-MVP, investigar)

- Modelo «reparto bajo demanda»: al marcar «listo», EasyOrder pide un repartidor a la plataforma
  (recogida, entrega, importe), recibe por webhook su estado y lo refleja en el pedido.
- Pendiente de validar: qué proveedores dan servicio en Canarias, precio por envío, contrato y
  API. Se modela como un proveedor de reparto por local, con `pedido_reparto` como hoy.
- Alternativa sin integración: repartidor externo con enlace de un solo pedido (sin cuenta).

### N · Prueba de entrega (post-MVP)

- Al marcar «entregado», el repartidor puede (o debe, según ajuste del local) subir una foto.
  Se guarda en almacenamiento privado y se enlaza en `pedido_reparto`; la ve el local.

### O · Cancelación por el cliente (MVP)

- Como en las plataformas: el cliente cancela solo mientras el local no ha aceptado el pedido;
  después, «Contactar con el local» (decide el local).
- Web: botón «Cancelar pedido» en el seguimiento. WhatsApp: el subflujo Pedidos Cliente aplica
  la misma regla y, si ya está aceptado, deriva a humano.
- Mismo cambio de estado que el tablero (`changeOrderStatus`, origen `cliente`) y aviso en el
  tablero.

### P · Incidencias del cliente (MVP)

- En el seguimiento: «¿Algún problema con tu pedido?» → tipo (falta algo, llegó mal, retraso,
  otro), texto y foto opcional. Tabla nueva de incidencias por pedido; aviso y listado en el
  panel, con estado (abierta, resuelta).
- WhatsApp: un reclamo sigue derivándose a humano (regla 12) y además queda como incidencia.

### Q · Pedidos fraudulentos (MVP por capas, código por SMS post-MVP)

- Un código por SMS en cada pedido cuesta dinero por pedido y frena a los clientes buenos. Se
  propone por capas:
  1. Límite de pedidos por teléfono e IP, captcha invisible (Turnstile) en la web y lista de
     bloqueados por restaurante (bloquear un teléfono desde la ficha del cliente).
  2. Los pedidos por WhatsApp ya vienen del propio número: no necesitan código.
  3. Código de verificación solo cuando hay riesgo: teléfono nuevo, reparto con pago en efectivo
     o importe alto (30 € por defecto, ajustable por restaurante). Se envía por WhatsApp
     (plantilla de autenticación) desde un número central de Konnecttia; el SMS se descarta por
     ahora (ADR 0011).
- Los clientes que ya pidieron y recibieron su pedido no vuelven a pasar por el código.
- **Capas 1 y 2: en curso** (rama `feat/antifraude`, migración 0021). Límite de pedidos web por
  teléfono (claves `antifraude_pedidos_abiertos_por_telefono` y
  `antifraude_pedidos_por_telefono_hora`; sin clave, sin límite), captcha Turnstile opcional
  (`TURNSTILE_SECRET_KEY` en la API y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en la web) y teléfonos
  bloqueados por restaurante (permiso `customers.block`; «Bloquear» en la ficha del cliente y
  filtro «Solo bloqueados»). El pedido manual del panel avisa, pero deja continuar.
- n8n: hecho en staging. El flujo `[MVP] Apertura` llama a `fn_restaurante_acepta_pedidos` y
  `fn_telefono_bloqueado` («Verificar Puede Pedir») antes de abrir un pedido por WhatsApp; los
  pedidos web lo saltan porque la API ya lo exige. La capa 3 (código por WhatsApp) está
  decidida en el ADR 0011; falta la aprobación de la plantilla en Meta.

### R · Tratamiento de datos (MVP, revisar con un abogado)

- Casilla obligatoria con enlace a la política de privacidad al pedir; se guarda la fecha y la
  versión aceptada. Casilla aparte, sin marcar, para recibir promociones.
- Contrato de encargado del tratamiento entre Konnecttia y cada restaurante.
- En el panel: exportar y borrar los datos de un cliente que lo pida.

### S · Seguridad del sitio (auditoría)

- Revisión con informe: cabeceras (CSP, HSTS), límites de peticiones, ajustes de Supabase Auth,
  dependencias, copias de seguridad de Postgres, secretos y proxy de EasyPanel. Después, los
  arreglos en PR propios.

### T · Coste de un cliente nuevo (documento)

- Estimación del coste para Konnecttia por restaurante: fijo (VPS, servicios) repartido, variable
  (emails, WhatsApp, IA del agente, SMS) y horas de alta. Necesita los importes reales de los
  servicios contratados.

## Requerimientos del promotor (6/11, noche)

U y V están hechas; el resto solo está planificado y se implementa cuando el promotor lo pida. Letras a continuación de la T.

### U · Historial de actividad de repartidores y meseros (hecho en #72)

- Ficha por repartidor y por mesero con su historia: repartos asignados, salida y entrega con
  horas, fotos de entrega, cobros pendientes que llevaba; pedidos y mesas atendidos, importes,
  cancelaciones. Filtrable por fechas y local; útil ante una incidencia («¿quién llevó el pedido
  E-1043 y a qué hora salió?»).
- Reutiliza `pedido_reparto`, `pedido_foto_entrega`, `pedido_estado_log` (actor y origen),
  `pedidos.mesero_id` y `auditoria`. Sin tablas nuevas salvo, si hace falta, un índice.
- Enlace con las incidencias del cliente (pieza P): la incidencia muestra quién repartió o atendió.
- Permisos: lo ven quien gestiona el equipo y el encargado del local; cada repartidor o mesero ve
  solo lo suyo.

### V · Editar los permisos de los roles del restaurante (hecho en #71)

- Hoy: los roles propios del restaurante se crean y editan en Equipo → Roles (#39), pero las
  plantillas (Propietario, Encargado, Personal, Consulta, Mesero, Repartidor) no se pueden tocar
  (`template_role`).
- Propuesta: «Personalizar» una plantilla crea una copia propia del restaurante con los mismos
  permisos, editable, y reasigna (con confirmación) a quienes tenían la plantilla. Las plantillas
  globales siguen sin cambiar. Sin escalada (`canGrantRole`); Propietario no se puede recortar.
- Tablas: `rol`, `rol_permiso`, `membresia_rol`.

### W · Escenarios de prueba para el equipo comercial (hecho: `docs/comercial/escenarios-de-prueba.md`)

- `docs/comercial/escenarios-de-prueba.md` (y su Claude Doc): guiones paso a paso en staging con
  varios roles a la vez (cliente en el móvil, cajero, encargado, mesero, repartidor, propietario,
  Konnecttia en `/interno`). Por ejemplo: pedido web a domicilio con Bizum y justificante → asignar
  repartidor → foto de entrega; mesa con mesero y comanda → cuenta; cliente bloqueado;
  hora punta con modo ocupado; alta autoservicio y conversión del plan; borrar los datos de un
  cliente. Cada escenario: preparación, pasos por rol, resultado esperado y qué contar al cliente.
- Requiere un restaurante de demostración en staging con usuarios de cada rol (nunca La Isla).

### X · QR para pagar por transferencia o Bizum (post-MVP, viable con matices)

- Viable como **QR que abre una página de pago** del pedido (la del seguimiento): importe,
  concepto (código del pedido), IBAN y titular o teléfono de Bizum —los configurados en Ajustes—,
  con botones para copiar y subir el justificante (pieza L). El repartidor lo enseña en el móvil o
  va impreso en la comanda de reparto.
- Transferencia: existe el estándar europeo de QR de transferencia (EPC/SEPA), pero no todas las
  apps de bancos españoles lo leen; pendiente de validar con los bancos de los clientes. Se puede
  ofrecer como extra junto a la página.
- Bizum: no hay un QR o enlace de pago público para particulares; Bizum como cobro automático va
  con el TPV del banco (pieza «Cobro online»). Con el QR, el cliente ve el teléfono y el concepto.
- Sin tablas nuevas; usa `datos_bancarios` y el token de seguimiento. Dependencia: una librería
  de QR (proponerla en su PR).

### Y · QR de los enlaces del restaurante (MVP)

- En Ajustes, una sección «Enlaces y QR»: carta pública (`/<slug>`), panel (`/panel`) y, para
  Konnecttia, el alta (`/alta`). Cada uno con su QR para descargar (PNG y SVG, varios tamaños) y
  compartir (botón compartir del móvil), con el logo y el color del restaurante si los hay.
- Pensado para redes sociales, mesas, bolsas y el escaparate. Misma librería de QR que X.

### Z · Logo y redes sociales del restaurante (MVP)

- La tabla `restaurante` ya tiene `logo_url` y `redes_sociales` (de la versión anterior), pero el
  panel nuevo no las edita y la carta pública no las muestra.
- Ajustes → Marca: subir el logo (como las fotos de la carta, Supabase Storage, bucket público) y
  verlo en la cabecera del panel y de la carta; redes sociales (Instagram, Facebook, TikTok,
  Google, web, WhatsApp…) con validación de URL, que la carta muestra como iconos.

### AA · Colores de marca en la carta pública (MVP)

- `restaurante.brand_color` y `theme_id` ya existen. Ajustes → Marca: color principal (y
  opcionalmente secundario) con vista previa; la carta pública y el seguimiento usan esos colores
  y el logo.
- Contraste: el sistema calcula el color del texto sobre el color de marca y avisa si no se lee
  bien (accesibilidad). El panel mantiene los colores de EasyOrder.

### AB · Promociones en la carta (post-MVP, módulo nuevo)

- El catálogo de módulos ya prevé «Novedades y reseñas» (Premium); las promociones serían un
  módulo propio (`promotions`) o parte de ese.
- Promoción = título, texto, imagen opcional, fechas y horas de validez (fechas especiales,
  «happy hour»), locales, y opcionalmente una regla: % o importe de descuento sobre productos o
  categorías, 2×1, envío gratis a partir de un importe, o código promocional.
- La carta pública muestra un banner y marca los productos en promoción; el precio con descuento
  se calcula SIEMPRE en el servidor (ADR 0004) y queda guardado en el pedido. n8n (WhatsApp) debe
  aplicar las mismas reglas usando la misma función de precios.
- Fases: 1) banners informativos con fechas, sin descuento; 2) descuentos automáticos; 3) códigos.

## Documentación comercial

- `docs/comercial/guia-comercial.md` y `docs/comercial/checklist-alta-restaurante.md` son la copia
  en el repositorio de los documentos que usa la comercial (se editan en Claude Docs).
- Se actualizan cuando el promotor lo pide («actualiza la documentación»); ver `AGENTS.md`.

## n8n (staging) pendiente

- Director: sacar el restaurante de la bandeja de Chatwoot por la que entra el mensaje, en lugar
  del atributo `p_restaurante_id` con el valor 11 por defecto.
- Revisar el resto de subflujos con datos de La Isla escritos a mano.
- Leer `sucursal_item_no_disponible` (agotados por local) y `alergenos` en la consulta de carta.
- Apertura: comprobar `fn_restaurante_acepta_pedidos` y `fn_telefono_bloqueado` antes de tomar el
  pedido. Preparado en el PR #9 de `cesarsan7/easyorder`; falta importarlo en staging y probarlo.
