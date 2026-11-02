# KONNECTTIA — EasyOrder v2: Briefing completo para implementación

> **Este documento es autosuficiente.** Contiene todo lo necesario para que una nueva sesión de Claude (Cowork, Claude Code, o cualquier chat) pueda implementar el proyecto desde cero, sin depender de ninguna conversación anterior.
>
> **Proyecto actual (Plan B):** `C:\AI2nomous\easyorder\` — NO tocar. Queda como demo y fallback.  
> **Proyecto nuevo (v2):** crear en la ruta que el usuario indique (ver sección 11).

---

## 1. Identidad del producto

| Campo | Valor |
|-------|-------|
| **Empresa** | Konnecttia |
| **Dominio principal** | konnecttia.com |
| **Producto** | EasyOrder — uno de varios productos de Konnecttia |
| **Otros productos futuros** | Gestión de redes sociales, creación de sitios web para comercios |
| **Mercado objetivo** | Restaurantes de Canarias, España |
| **Referencia de producto** | Toast Local (toasttab.com/local) + menú digital + pedidos web + agente WhatsApp |

---

## 2. Visión del producto en una línea

Un **marketplace local de restaurantes para Canarias** donde cada restaurante tiene su página personalizada, recibe pedidos web y continúa la gestión del pedido por WhatsApp mediante un agente inteligente.

### Experiencia del usuario final
1. Entra a `konnecttia.com/local/arrecife`
2. Busca restaurantes por zona: Playa Honda, Tahíche, Arrecife, Puerto del Rosario, Corralejo
3. Entra a la página del restaurante
4. Ve carta, horarios, delivery/retiro, fotos, métodos de pago
5. Hace el pedido en la web — queda registrado
6. Recibe confirmación por WhatsApp
7. Desde WhatsApp puede agregar, quitar, cambiar, confirmar pago, enviar comprobante o pedir humano
8. El restaurante gestiona el pedido desde su dashboard

---

## 3. Stack tecnológico (continúa el del proyecto base)

```
Frontend:    Next.js 14 (App Router) — monorepo: landing + directorio + carta + dashboard
Backend:     Hono.js + TypeScript (mismo framework que el proyecto base)
Base datos:  PostgreSQL vía Supabase (proyecto NUEVO, DB limpia)
Auth:        Supabase Auth (mismo patrón que el base)
Imágenes:    Supabase Storage (nuevo bucket para fotos de menú y branding)
Real-time:   Polling cada 10s en MVP → WebSocket post-MVP
Mapas:       Leaflet.js (open source, sin costo, sin API key)
WhatsApp:    n8n + Chatwoot (arquitectura multi-tenant — ver sección 9)
Deploy:      EasyPanel en VPS Hostinger (misma infra que el proyecto base)
```

---

## 4. Estructura de URLs completa

```
konnecttia.com/                        → Landing Konnecttia (empresa + todos sus productos)
konnecttia.com/easyorder               → Landing del producto EasyOrder (features, precios, CTA)
konnecttia.com/login                   → Login restaurantes
konnecttia.com/registro                → Onboarding nuevo restaurante (multi-step)

konnecttia.com/local/                  → Directorio general (todos los restaurantes)
konnecttia.com/local/lanzarote         → Directorio por isla
konnecttia.com/local/arrecife          → Directorio por municipio
konnecttia.com/local/playa-honda       → Directorio por zona
konnecttia.com/local/fuerteventura     → Otra isla
konnecttia.com/local/corralejo         → Zona Fuerteventura
konnecttia.com/local/puerto-del-rosario

konnecttia.com/[slug]                  → Página pública del restaurante
konnecttia.com/[slug]/menu             → Carta completa
konnecttia.com/[slug]/carrito          → Carrito
konnecttia.com/[slug]/checkout/...     → Flujo de checkout (despacho → datos → pago → confirmar)
konnecttia.com/[slug]/pedido/estado    → Estado del pedido

konnecttia.com/dashboard/[slug]/              → Resumen + pedidos en tiempo real
konnecttia.com/dashboard/[slug]/menu/         → Gestión del menú + fotos
konnecttia.com/dashboard/[slug]/pedidos/      → Panel de pedidos (incluye toma manual)
konnecttia.com/dashboard/[slug]/caja/         → Cuadre y cierre de caja
konnecttia.com/dashboard/[slug]/clientes/     → Base de clientes + historial
konnecttia.com/dashboard/[slug]/equipo/       → Empleados y roles
konnecttia.com/dashboard/[slug]/zonas/        → Zonas de despacho con mapa Leaflet
konnecttia.com/dashboard/[slug]/configuracion/ → Branding + operativa
```

---

## 5. Estructura del proyecto (carpetas)

```
/konnecttia/                    ← raíz del proyecto nuevo
  /web/                         ← Next.js 14
    /app/
      /page.tsx                 → Landing Konnecttia (empresa)
      /easyorder/
        /page.tsx               → Landing producto EasyOrder
      /login/page.tsx
      /registro/page.tsx
      /local/
        /page.tsx               → Directorio general
        /[zona]/page.tsx        → Directorio por zona
      /(public)/
        /[slug]/
          /page.tsx             → Página restaurante
          /menu/page.tsx
          /carrito/page.tsx
          /checkout/
            /despacho/page.tsx
            /datos/page.tsx
            /pago/page.tsx
            /confirmar/page.tsx
          /pedido/estado/page.tsx
      /dashboard/
        /page.tsx               → Selector de restaurante
        /[slug]/
          /layout.tsx           → Sidebar + auth guard
          /page.tsx             → Panel principal + pedidos RT
          /menu/page.tsx
          /pedidos/page.tsx     → Lista + toma manual
          /caja/page.tsx        → Cuadre + cierre
          /clientes/page.tsx
          /equipo/page.tsx
          /zonas/page.tsx
          /configuracion/page.tsx
    /lib/
      /supabase/
        /client.ts
        /server.ts
      /hooks/
        /useBranding.ts         → Carga colores/logo del restaurante activo
        /usePedidos.ts          → Polling de pedidos nuevos
    /components/
      /ui/                      → Componentes base (Button, Card, Modal, etc.)
      /menu/                    → MenuCard, CartDrawer, ProductModal
      /pedidos/                 → PedidoCard, EstadoBadge, SoundAlert
      /directorio/              → RestauranteCard, FiltrosBar, ZonaHeader
      /dashboard/               → Sidebar, StatCard, CajaResumen

  /api/                         ← Hono.js + TypeScript
    /src/
      /index.ts                 → Entry point + rutas montadas
      /lib/
        /db.ts                  → PostgreSQL pool (postgres.js)
        /supabase-admin.ts      → Supabase admin client
        /is-open.ts             → Helper horario
        /branding.ts            → Helper colores/logo
      /middleware/
        /auth.ts                → Valida JWT Supabase
        /tenant.ts              → Resuelve restaurante_id desde slug
      /routes/
        /public.ts              → Directorio, restaurante, menú, horario
        /orders.ts              → Crear/modificar pedido web
        /onboarding.ts          → Registro nuevo restaurante
        /dashboard/
          /pedidos.ts           → Listar, actualizar estado, crear manual
          /menu-categories.ts
          /menu-items.ts        → CRUD + upload foto Supabase Storage
          /menu-variants.ts
          /menu-extras.ts
          /caja.ts              → Cuadre + cierre + historial
          /clientes.ts
          /members.ts           → Equipo y roles
          /zonas.ts             → Delivery zones
          /hours.ts
          /configuracion.ts     → Branding + settings

  /docs/
    /db/
      /DDL_v2.sql               → Schema completo
      /migrations/              → M-01, M-02, etc.
    /business/
      /KONNECTTIA_V2_BRIEFING.md  ← este archivo
  /scripts/
    /onboard_new_client.py      → Seed de nuevo restaurante
    /seed_demo_data.py          → Datos de prueba
```

---

## 6. Base de datos — Schema completo

### 6.1 Tablas que se reutilizan del proyecto base (misma estructura)

Estas tablas ya están probadas en producción. Copiar exactamente:

- `restaurante` — con columnas adicionales (ver 6.2)
- `horarios` — `(id, restaurante_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2)`
- `menu_category` — `(menu_category_id, restaurante_id, name, sort_order, is_active)`
- `menu_item` — `(menu_item_id, restaurante_id, menu_category_id, name, description, price, is_active)` + columna `foto_url` nueva
- `menu_variant` — `(menu_variant_id, menu_item_id, restaurante_id, variant_name, price, is_default, is_active)`
- `extra` — `(extra_id, restaurante_id, name, price, is_active)`
- `menu_item_extra` — tabla de relación item ↔ extra
- `delivery_zone` — `(delivery_zone_id, restaurante_id, postal_code, zone_name, fee, min_order_amount, estimated_minutes_min, estimated_minutes_max, is_active)`
- `pedidos` — (ver DDL completo en sección 6.3)
- `usuarios` — clientes WhatsApp del restaurante
- `contexto` — historial de conversación WhatsApp
- `faqs` — preguntas frecuentes por restaurante
- `restaurante_config` — clave-valor de configuración
- `config_operativa` — tiempo de espera, mensajes
- `n8n_chat_histories` — historial del agente

### 6.2 Tabla `restaurante` — columnas extendidas para v2

```sql
CREATE TABLE restaurante (
  id                  serial PRIMARY KEY,
  -- Identidad
  nombre              text NOT NULL,
  slug                varchar(60) UNIQUE NOT NULL,
  descripcion         text,
  slogan              text,
  tipo_cocina         varchar(60),           -- 'pizza', 'burger', 'sushi', 'cafeteria'
  -- Directorio
  zona                varchar(60),           -- 'arrecife', 'playa-honda', 'corralejo'
  isla                varchar(40),           -- 'lanzarote', 'fuerteventura', 'gran-canaria'
  activo_directorio   bool DEFAULT true,
  destacado           bool DEFAULT false,    -- badge "Destacado" en el directorio
  -- Contacto y ubicación
  direccion           text,
  telefono            text,
  lat                 numeric(10,8),
  lng                 numeric(11,8),
  zona_horaria        text DEFAULT 'Atlantic/Canary',
  -- Branding
  logo_url            text,
  banner_url          text,
  color_primario      varchar(7) DEFAULT '#E63946',
  color_secundario    varchar(7) DEFAULT '#1D3557',
  -- Operativa
  mensaje_bienvenida  text,
  mensaje_cerrado     text,
  moneda              varchar(5) DEFAULT '€',
  radio_cobertura_km  numeric(5,2) DEFAULT 5.0,
  tarifa_envio_tipo   text DEFAULT 'fija',   -- 'fija' o 'por_zona'
  tarifa_envio_valor  numeric(10,2) DEFAULT 0,
  datos_bancarios     jsonb,
  redes_sociales      jsonb,                 -- {"instagram": "url", "facebook": "url"}
  -- Timestamps
  created_at          timestamp DEFAULT now()
);
```

### 6.3 Tabla `pedidos` — igual al base

```sql
CREATE TABLE pedidos (
  id                serial PRIMARY KEY,
  restaurante_id    int4 REFERENCES restaurante(id) ON DELETE CASCADE,
  usuario_id        int4,
  telefono          text NOT NULL,
  canal             text DEFAULT 'whatsapp',  -- 'whatsapp' | 'web' | 'manual'
  items             jsonb DEFAULT '[]',
  subtotal          numeric(10,2) DEFAULT 0,
  tipo_despacho     text,                     -- 'delivery' | 'retiro'
  direccion         text,
  lat               numeric(10,8),
  lng               numeric(11,8),
  distancia_km      numeric(5,2),
  tiempo_estimado   text,
  costo_envio       numeric(10,2) DEFAULT 0,
  total             numeric(10,2) DEFAULT 0,
  metodo_pago       text,                     -- 'transferencia' | 'efectivo' | 'tarjeta'
  estado            text DEFAULT 'en_curso',  -- ver estados abajo
  notas             text,
  pedido_numero     int4 DEFAULT 1,
  pedido_codigo     varchar(20),
  session_id        text,
  session_started_at timestamp,
  created_at        timestamp DEFAULT now(),
  updated_at        timestamp DEFAULT now()
);

-- Estados del pedido (ciclo completo):
-- en_curso → confirmado → preparando → listo_retiro | en_camino → entregado
-- en_curso → cancelado
-- en_curso → pendiente_pago → confirmado (cuando hay transferencia)
```

### 6.4 Tablas nuevas en v2

```sql
-- Empleados del restaurante con roles
CREATE TABLE local_memberships (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  rol             varchar(20) NOT NULL CHECK (rol IN ('admin','operador','cajero')),
  activo          bool DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (restaurante_id, user_id)
);

-- Cuadre y cierre de caja diario
CREATE TABLE caja_cierre (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  fecha           date NOT NULL,
  turno           varchar(20) DEFAULT 'dia',
  total_ventas    numeric(10,2),
  total_pedidos   int4,
  desglose_pago   jsonb,    -- {"transferencia": 150.50, "efectivo": 80.00, "tarjeta": 57.50}
  desglose_canal  jsonb,    -- {"web": 12, "whatsapp": 8, "manual": 3}
  ticket_promedio numeric(10,2),
  pedidos_ids     int4[],
  cerrado_por     uuid REFERENCES auth.users(id),
  cerrado_en      timestamptz DEFAULT now(),
  notas           text,
  UNIQUE (restaurante_id, fecha, turno)
);

-- Fotos adicionales del restaurante
CREATE TABLE restaurante_fotos (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  url             text NOT NULL,
  alt             text,
  tipo            varchar(20) DEFAULT 'galeria',  -- 'logo' | 'banner' | 'galeria'
  sort_order      int4 DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- n8n chat histories con restaurante_id (crítico para multi-tenant)
-- Nota: esta tabla la crea n8n automáticamente; hacer ALTER TABLE para agregar la columna
ALTER TABLE n8n_chat_histories ADD COLUMN IF NOT EXISTS restaurante_id int4;
ALTER TABLE n8n_chat_histories ADD COLUMN IF NOT EXISTS session_id text;
```

### 6.5 Tablas para arquitectura multi-tenant n8n (implementar en fase 2)

```sql
-- Prompts por restaurante, versionados
CREATE TABLE restaurant_prompts (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  tipo            varchar(50) NOT NULL,   -- 'director' | 'cerrado' | 'bienvenida'
  prompt_text     text NOT NULL,
  version         int4 NOT NULL DEFAULT 1,
  activo          bool DEFAULT true,
  notas           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (restaurante_id, tipo, version)
);

-- Reglas de negocio por restaurante
CREATE TABLE restaurant_business_rules (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  reglas_texto    text NOT NULL,    -- inyectable en el prompt
  reglas_json     jsonb,            -- para validaciones en nodos Code
  version         int4 DEFAULT 1,
  activo          bool DEFAULT true,
  updated_at      timestamptz DEFAULT now()
);

-- Canales de comunicación (WhatsApp, Chatwoot) por restaurante
CREATE TABLE restaurant_channel_configs (
  id                  serial PRIMARY KEY,
  restaurante_id      int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  canal               varchar(30) NOT NULL,   -- 'whatsapp' | 'web'
  inbox_id            int4,                   -- inbox_id en Chatwoot → clave de routing
  phone_number        varchar(20),
  chatwoot_url        text,
  chatwoot_token      text,
  meta_phone_id       text,
  meta_token          text,
  escalamiento_numero varchar(20),
  activo              bool DEFAULT true,
  UNIQUE (canal, inbox_id)
);

-- Feature flags por restaurante
CREATE TABLE restaurant_feature_flags (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  flag_key        varchar(100) NOT NULL,
  flag_value      text NOT NULL,
  activo          bool DEFAULT true,
  UNIQUE (restaurante_id, flag_key)
);
-- Flags importantes: delivery_activo, retiro_activo, pago_transferencia,
-- pago_efectivo, pago_tarjeta, multimodal_audio, multimodal_imagen,
-- escalamiento_humano, web_orders_activo, notificacion_whatsapp

-- Configuración de workflow IDs de n8n por restaurante
CREATE TABLE restaurant_workflow_configs (
  id                serial PRIMARY KEY,
  restaurante_id    int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  operacion         varchar(50) NOT NULL,   -- 'apertura' | 'despacho' | 'pago' | etc.
  workflow_id_n8n   varchar(50) NOT NULL,
  activo            bool DEFAULT true,
  UNIQUE (restaurante_id, operacion)
);
```

---

## 7. Funcionalidades por módulo y prioridad

### 7A. Landing pages

| Feature | Prioridad |
|---------|-----------|
| Landing Konnecttia (empresa + productos) | MVP |
| Landing EasyOrder (features, precios, CTA) | MVP |
| CTA "Registra tu restaurante" → /registro | MVP |
| CTA "Iniciar sesión" → /login | MVP |
| Demo visual (screenshots del producto) | MVP |
| Sección funcionalidades con iconos | MVP |
| Planes y precios (1 plan MVP) | MVP |
| Footer con links legales | MVP |

### 7B. Directorio público

| Feature | Prioridad |
|---------|-----------|
| Listado de restaurantes por zona `/local/[zona]` | MVP |
| Cards con: logo, nombre, tipo cocina, estado abierto/cerrado | MVP |
| Filtro: tipo de comida | MVP |
| Filtro: abierto ahora | MVP |
| Filtro: delivery disponible | MVP |
| Filtro: retiro disponible | MVP |
| Filtro: pedido mínimo (rango) | MVP |
| Filtro: métodos de pago | Post-MVP |
| Ordenar por popularidad | Post-MVP |
| Búsqueda por nombre o plato | Post-MVP |
| Geolocalización del usuario | Post-MVP |

### 7C. Página pública del restaurante

| Feature | Prioridad |
|---------|-----------|
| URL propia: `konnecttia.com/[slug]` | MVP |
| Banner + logo del restaurante | MVP |
| Nombre, descripción, slogan | MVP |
| Dirección + mapa estático (Leaflet) | MVP |
| Horario con estado abierto/cerrado (calculado RT) | MVP |
| Color primario personalizable aplicado a botones | MVP |
| Carta por categorías | MVP |
| Fotos de productos | MVP |
| Variantes por producto (tamaños, sabores) | MVP |
| Extras/complementos | MVP |
| Productos destacados (badge "Popular") | MVP |
| Carrito con resumen y subtotal | MVP |
| Validación zona delivery (por CP o coordenadas) | MVP |
| Botón "Pedir por WhatsApp" | MVP |
| Botón "Continuar pedido en WhatsApp" | MVP |
| Checkout completo (despacho → datos → pago → confirmar) | MVP |
| Redes sociales en footer del restaurante | Post-MVP |

### 7D. Dashboard del restaurante

| Feature | Prioridad |
|---------|-----------|
| Panel pedidos en tiempo real (polling 10s + sonido alerta) | MVP |
| Cambio de estado del pedido (cards con botones) | MVP |
| Toma de pedido manual desde el panel | MVP |
| Gestión del menú: categorías, ítems, variantes, extras | MVP |
| Upload de foto por producto (Supabase Storage) | MVP |
| Zonas de despacho con mapa Leaflet (crear/editar/eliminar) | MVP |
| Tarifa de despacho: fija o por zona | MVP |
| Cuadre de caja: ventas del día por método de pago | MVP |
| Cierre de caja con exportación CSV | MVP |
| Base de clientes con historial de pedidos | MVP |
| Gestión de equipo: hasta 3 empleados con roles | MVP |
| Configuración visual: logo, banner, colores, slogan | MVP |
| Configuración operativa: horarios, modos despacho | MVP |
| Configuración métodos de pago habilitados | MVP |
| Métricas: ventas semana/mes, ticket promedio | Post-MVP |
| Exportar reportes PDF | Post-MVP |

### 7E. Roles de empleado

| Rol | Permisos |
|-----|---------|
| `admin` | Todo: configurar, editar menú, ver caja, gestionar equipo |
| `operador` | Gestionar pedidos, actualizar estado, crear pedido manual, ver menú |
| `cajero` | Ver pedidos del día, hacer cuadre de caja, cierre del día |

---

## 8. Panel de pedidos en tiempo real — diseño técnico

```
Flujo:
  Pedido nuevo (web o WhatsApp) → INSERT en pedidos
  Dashboard hace polling GET /dashboard/[slug]/pedidos?estado=nuevo,confirmado cada 10s
  Si hay pedido nuevo desde la última consulta → sonido de alerta (Audio API del browser)
  Card aparece en columna "Nuevos" del panel tipo Kanban
  Operador arrastra o hace clic en botón para cambiar estado
  PATCH /dashboard/[slug]/pedidos/[id]/estado → { estado: 'preparando' }
  API dispara webhook a n8n → n8n notifica al cliente por WhatsApp

Estados del panel (columnas Kanban):
  [Nuevos] → [Preparando] → [Listo/En camino] → [Entregado]

Toma de pedido manual:
  Modal con buscador de productos del menú
  Campo de teléfono del cliente (para asociar a usuario)
  Campo de tipo de despacho (retiro/delivery)
  Campo de notas
  POST /dashboard/[slug]/pedidos/manual → crea pedido con canal='manual'
```

---

## 9. Arquitectura n8n multi-tenant (resumen ejecutivo)

La arquitectura completa está documentada en `docs/business/n8n_multitenant_architecture.md` del proyecto base. Resumen para implementación:

### Principio
Un solo n8n, un solo set de workflows CORE, `restaurante_id` determina todo.

### Routing por inbox_id
```
WhatsApp → Chatwoot → Webhook n8n
  └→ Variables extrae inbox_id del payload
  └→ Query: SELECT restaurante_id FROM restaurant_channel_configs WHERE inbox_id = $inbox_id
  └→ Todo el flujo usa ese restaurante_id
```

### Workflows CORE (compartidos, no duplicar)
```
[CORE] Router Principal    → entry point, buffer Redis, routing
[CORE] Apertura            → crea/reutiliza pedido
[CORE] Despacho            → agrega ítems
[CORE] Pago                → confirma pedido
[CORE] Preguntas           → FAQs desde tabla faqs
[CORE] Contexto            → gestión de contexto
[CORE] Derivar Humano      → escalamiento
[CORE] Perfil Cliente      → datos del usuario
[CORE] Pedidos Cliente     → historial
[CORE] Cron Expirar        → expira pedidos en_curso > 30min
[CORE] Notificacion Estado → notifica cambios de estado al cliente
```

### Carga dinámica (post-MVP, implementar en fase 2)
- Prompts desde `restaurant_prompts` (nodo Postgres antes del Director)
- Reglas desde `restaurant_business_rules`
- Flags desde `restaurant_feature_flags`

### Bug crítico a evitar (aprendido en producción)
```
- parallelToolCalls: false   ← OBLIGATORIO en todos los nodos lmChatOpenAi
- useResponsesApi: false     ← OBLIGATORIO en todos los nodos lmChatOpenAi
- Si falla con "No tool call found...": TRUNCATE n8n_chat_histories
- Cadena de ejecución correcta: InputAgente1 → ObtenerConfigRestaurante → Horarios → Validacion → Disponible → Director/AgenteCerrado
```

---

## 10. Cuadre de caja — diseño de pantalla

```
┌─────────────────────────────────────────────────────┐
│ CUADRE DE CAJA — Lunes 6 julio 2026                 │
├─────────────────────────────────────────────────────┤
│ Total pedidos del día:   23                         │
│ Total ventas:            €487.50                    │
├─────────────────────────────────────────────────────┤
│ POR MÉTODO DE PAGO                                  │
│   Transferencia:   €310.00   (63.6%)   15 pedidos   │
│   Efectivo:        €120.00   (24.6%)    6 pedidos   │
│   Tarjeta:          €57.50   (11.8%)    2 pedidos   │
├─────────────────────────────────────────────────────┤
│ POR TIPO DE DESPACHO                                │
│   Delivery:        €350.00   (15 pedidos)           │
│   Retiro:          €137.50    (8 pedidos)           │
├─────────────────────────────────────────────────────┤
│ POR CANAL                                           │
│   WhatsApp:         12 pedidos                      │
│   Web:               8 pedidos                      │
│   Manual:            3 pedidos                      │
├─────────────────────────────────────────────────────┤
│ Ticket promedio:   €21.20                           │
│ Pedido más alto:   €68.00                           │
└─────────────────────────────────────────────────────┘
[Cerrar caja del día]  [Exportar CSV]
```

---

## 11. Lo que hay que pedirle al usuario ANTES de implementar

Estas son las únicas 4 cosas que el usuario debe proveer. Sin ellas no se puede empezar:

### A. Supabase — proyecto nuevo
```
Crear un proyecto nuevo en supabase.com (no usar el del proyecto base)
Pedir al usuario:
  NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
  SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← para ejecutar migraciones
  DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
```

### B. Git / repositorio
```
Opción A (recomendada): usuario crea repo en GitHub + da Personal Access Token con scope 'repo'
Opción B: Claude trabaja en carpeta montada y el usuario hace push cuando Claude avise
```

### C. Carpeta del proyecto
```
Preguntar al usuario dónde crear:
  C:\AI2nomous\konnecttia\      (recomendada — nombre de la empresa)
  C:\AI2nomous\easyorder-v2\
```

### D. Mapas
```
Leaflet.js (ya decidido: open source, sin costo, sin API key)
No se necesita nada del usuario para esto.
```

---

## 12. Plan de ejecución por fases

### Fase 1 — Fundación (sesiones 1-2)
- Setup repo, estructura de carpetas, package.json, tsconfig
- Migraciones DB completas (DDL_v2.sql)
- Variables de entorno y conexión Supabase
- Auth básico (login, registro restaurante)
- Landing Konnecttia + Landing EasyOrder

### Fase 2 — Directorio y carta pública (sesiones 3-5)
- `/local/[zona]` con cards de restaurantes
- Filtros: tipo cocina, abierto ahora, delivery, retiro
- Página pública del restaurante
- Carta con categorías, fotos, variantes, extras
- Carrito
- Checkout completo (4 pasos)
- Validación de zona de delivery

### Fase 3 — Dashboard operativo (sesiones 6-8)
- Panel de pedidos en tiempo real (polling + sonido)
- Gestión del menú + upload de fotos
- Toma de pedido manual
- Cambio de estado con notificación WhatsApp

### Fase 4 — Caja, clientes, equipo, zonas (sesiones 9-11)
- Cuadre de caja + cierre del día + CSV
- Base de clientes con historial
- Gestión de equipo con roles
- Mapa de zonas de despacho (Leaflet)
- Configuración visual (logo, banner, colores)

### Fase 5 — Integración n8n + pruebas (sesiones 12-15)
- Webhook: pedido web → notificación WhatsApp
- Webhook: cambio estado → notificación WhatsApp
- Arquitectura multi-tenant n8n (restaurant_channel_configs)
- Testing end-to-end con restaurante real
- Ajustes, pulido, deploy en EasyPanel

**Total estimado: 14-15 sesiones de trabajo (4-5 semanas a ritmo de 1 sesión/día)**

---

## 13. Proyecto base como Plan B

El proyecto `C:\AI2nomous\easyorder\` queda intacto. No tocar. Sirve para:
- Demos a clientes potenciales de EasyOrder
- Fallback si algo falla en v2
- Referencia técnica durante el desarrollo de v2
- La Isla Pizzería puede seguir operando en él

---

## 14. Zonas del directorio — Canarias MVP

### Lanzarote
`arrecife`, `playa-honda`, `tahiche`, `tias`, `puerto-del-carmen`, `costa-teguise`, `yaiza`, `haria`, `san-bartolome`

### Fuerteventura
`puerto-del-rosario`, `corralejo`, `costa-calma`, `morro-jable`, `caleta-de-fuste`

### Gran Canaria y Tenerife — post-MVP

---

## 15. Patrones de código del proyecto base (reutilizar)

### Patrón auth en middleware
```typescript
// middleware/auth.ts — extraer user del JWT Supabase
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const authMiddleware = async (c: Context, next: Next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
}
```

### Patrón tenant en middleware
```typescript
// middleware/tenant.ts — resolver restaurante_id desde slug + verificar membresía
export const tenantMiddleware = async (c: Context, next: Next) => {
  const slug = c.req.param('slug')
  const user = c.get('user')
  const { rows } = await db.query(
    `SELECT r.id, lm.rol FROM restaurante r
     JOIN local_memberships lm ON lm.restaurante_id = r.id
     WHERE r.slug = $1 AND lm.user_id = $2 AND lm.activo = true`,
    [slug, user.id]
  )
  if (!rows.length) return c.json({ error: 'forbidden' }, 403)
  c.set('restaurante_id', rows[0].id)
  c.set('rol', rows[0].rol)
  await next()
}
```

### Patrón conexión DB
```typescript
// lib/db.ts — pool PostgreSQL con timezone UTC forzado
import postgres from 'postgres'
export const db = postgres(process.env.DATABASE_URL!, {
  ssl: 'require',
  connection: { TimeZone: 'UTC' }
})
```

### Hook useBranding (frontend)
```typescript
// hooks/useBranding.ts — carga colores/logo del restaurante activo
// Leer desde /public/[slug] → campo color_primario, color_secundario, logo_url
// Aplicar colores como CSS variables: --color-brand, --color-brand-dark
```

---

*Briefing generado el 2026-07-06. Versión 1.0.*
*Proyecto base de referencia: C:\AI2nomous\easyorder\*
*No modificar el proyecto base — es el Plan B y entorno de demos.*
