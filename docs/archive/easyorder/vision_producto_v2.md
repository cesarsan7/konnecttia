# Visión del Producto — EasyOrder v2 / Marketplace Canarias

**Versión:** 1.0  
**Fecha:** 2026-07-06  
**Estado:** Planificación — pendiente de aprobación antes de implementar

---

## 1. Definición del producto

**Qué es:**  
Un marketplace local de restaurantes para Canarias donde cada restaurante tiene su página personalizada, recibe pedidos web y gestiona el pedido por WhatsApp mediante un agente inteligente.

**En una línea:**  
Toast Local + menú digital + sistema de pedidos + agente WhatsApp operativo — construido para Canarias.

**No es:**  
POS físico, app móvil nativa, reservas, gift cards, programa de fidelización, contabilidad, inventario avanzado. Todo eso es post-MVP.

---

## 2. Estructura de URLs

```
[dominio.com]/                          → Landing page SaaS (captura de leads B2B)
[dominio.com]/login                     → Login restaurantes
[dominio.com]/registro                  → Onboarding nuevo restaurante
[dominio.com]/dashboard/[slug]/...      → Panel del restaurante (privado)

[dominio.com]/local/                    → Directorio general (todos los restaurantes)
[dominio.com]/local/lanzarote           → Directorio por isla
[dominio.com]/local/arrecife            → Directorio por zona/municipio
[dominio.com]/local/playa-honda         → Directorio por zona específica
[dominio.com]/local/fuerteventura       → Otra isla
[dominio.com]/local/corralejo           → Zona de Fuerteventura

[dominio.com]/[slug]                    → Página pública del restaurante
[dominio.com]/[slug]/carta              → Carta completa
[dominio.com]/[slug]/pedido             → Checkout del pedido
```

**Nota:** El dominio se define antes de implementar. Opciones posibles: `konnecttia.com`, `easyorder.ai2nomous.com`, otro.

---

## 3. Mapa de funcionalidades completo (merged)

### 3A. Directorio público (nuevo)

| Feature | Prioridad | Descripción |
|---------|-----------|-------------|
| Listado por zona | MVP | `/local/[zona]` con cards de restaurantes |
| Filtro: tipo de comida | MVP | Pizza, Burger, Sushi, Cafetería, etc. |
| Filtro: abierto ahora | MVP | Evalúa horario real vs hora actual |
| Filtro: delivery disponible | MVP | Según config del restaurante |
| Filtro: retiro disponible | MVP | Según config del restaurante |
| Filtro: pedido mínimo | MVP | Rango deslizante |
| Filtro: métodos de pago | MVP | Efectivo, transferencia, tarjeta |
| Filtro: promociones activas | Post-MVP | Restaurantes con promos |
| Búsqueda por nombre o plato | Post-MVP | Búsqueda full-text |
| Ordenar por: distancia | Post-MVP | Requiere geolocalización del usuario |
| Ordenar por: popularidad | Post-MVP | Requiere métricas |

### 3B. Página pública del restaurante (extendida)

| Feature | Prioridad | Descripción |
|---------|-----------|-------------|
| URL propia: `[dominio]/[slug]` | MVP | Ya existe parcialmente |
| Banner + logo personalizados | MVP | Upload desde dashboard |
| Nombre, descripción, slogan | MVP | Editable desde dashboard |
| Dirección + mapa estático | MVP | Coordenadas del restaurante |
| Horario con estado abierto/cerrado | MVP | Calculado en tiempo real |
| Color principal personalizable | MVP | Aplica a botones y acentos |
| Carta por categorías con fotos | MVP | Imágenes subidas por el restaurante |
| Variantes por producto | MVP | Tallas, sabores, etc. |
| Extras/complementos | MVP | Ingredientes adicionales |
| Productos destacados | MVP | Marcados como "featured" |
| Precio y descripción | MVP | Ya existe |
| Carrito de compra | MVP | Con resumen y subtotal |
| Botón "Pedir por WhatsApp" | MVP | Abre chat con pedido pre-armado |
| Botón "Continuar pedido en WhatsApp" | MVP | Si hay pedido activo |
| Zonas de delivery con validación | MVP | Verifica si el CP está en zona |
| Promociones activas | Post-MVP | Banner o badge en productos |
| Redes sociales | Post-MVP | Links en el perfil del restaurante |

### 3C. Dashboard del restaurante (extendido)

| Feature | Prioridad | Módulo |
|---------|-----------|--------|
| Panel pedidos en tiempo real | MVP | Polling/WebSocket + sonido alerta |
| Toma de pedido manual | MVP | Crear pedido desde el panel |
| Gestión del menú + fotos | MVP | Upload imágenes, variantes, extras |
| Zonas de despacho con mapa | MVP | UI visual para crear/editar zonas |
| Tarifa de despacho (fija o por zona) | MVP | Ya existe en DB |
| Cuadre de caja | MVP | Ventas del día por método de pago |
| Cierre de caja diario | MVP | Reporte exportable |
| Base de clientes + historial | MVP | Lista de usuarios con pedidos |
| Gestión de equipo (hasta 3 empleados) | MVP | Roles: admin, operador, cajero |
| Configuración visual del local | MVP | Logo, banner, colores, slogan |
| Configuración operativa | MVP | Horarios, modos despacho, métodos pago |
| Métricas básicas | Post-MVP | Ventas semana/mes, ticket promedio |
| Exportar reportes | Post-MVP | CSV/PDF de pedidos y caja |

### 3D. Agente WhatsApp (ya existe, se extiende)

| Feature | Prioridad | Estado |
|---------|-----------|--------|
| Recibir y procesar pedido web | MVP | Por implementar (integración n8n↔web) |
| Confirmar pedido por WhatsApp | MVP | Existe |
| Modificar pedido por WhatsApp | MVP | Existe |
| Enviar comprobante de pago | MVP | Existe (pendiente_pago) |
| Derivar a humano | MVP | Existe |
| Notificar cambio de estado | MVP | Existe parcialmente |
| Multi-restaurante (un solo n8n) | MVP | Arquitectura documentada |

### 3E. Landing page SaaS (nuevo)

| Feature | Prioridad | Descripción |
|---------|-----------|-------------|
| Hero con propuesta de valor | MVP | "Tu restaurante en Canarias, digital y conectado" |
| Demo visual del producto | MVP | Screenshots o video corto |
| Sección de funcionalidades | MVP | Cards de features clave |
| Planes y precios | MVP | 1 plan MVP, escalar después |
| Testimonios / logos | Post-MVP | Cuando haya clientes reales |
| CTA: "Registra tu restaurante" | MVP | Link a `/registro` |
| CTA: "Iniciar sesión" | MVP | Link a `/login` |
| Footer con links legales | MVP | Privacidad, términos |

---

## 4. Arquitectura técnica

### Stack

```
Frontend:   Next.js 14 (App Router) — monorepo: landing + directorio + carta + dashboard
Backend:    Express.js + TypeScript
Base datos: PostgreSQL vía Supabase (nuevo proyecto, DB limpia)
Auth:       Supabase Auth
Imágenes:   Supabase Storage
Real-time:  Polling cada 10s (MVP) → WebSocket (post-MVP)
Mapas:      Leaflet.js (open source, sin costo)
WhatsApp:   n8n + Chatwoot (arquitectura multi-tenant documentada)
Deploy:     EasyPanel en VPS Hostinger
```

### Estructura del proyecto

```
/easyorder-v2/   (o el nombre que elijas)
  /web/
    /app/
      /page.tsx                   → Landing page SaaS
      /login/
      /registro/
      /local/
        /page.tsx                 → Directorio general
        /[zona]/
          /page.tsx               → Directorio por zona
      /[slug]/
        /page.tsx                 → Página pública restaurante
        /pedido/page.tsx          → Checkout
      /dashboard/
        /[slug]/
          /page.tsx               → Resumen / pedidos RT
          /menu/page.tsx          → Gestión menú
          /pedidos/page.tsx       → Panel pedidos + manual
          /caja/page.tsx          → Cuadre y cierre de caja
          /clientes/page.tsx      → Base de clientes
          /equipo/page.tsx        → Empleados y roles
          /zonas/page.tsx         → Zonas de despacho + mapa
          /configuracion/page.tsx → Branding + operativa
  /api/
    /src/routes/
      public.ts          → Directorio, página restaurante, carta
      orders.ts          → Pedidos web + manual
      dashboard.ts       → Panel privado
      caja.ts            → Cuadre y cierre
      clientes.ts        → Historial de clientes
      equipo.ts          → Empleados
      zonas.ts           → Zonas de despacho
      menu.ts            → CRUD menú + upload fotos
      onboarding.ts      → Registro restaurante
  /docs/
  /scripts/
```

---

## 5. Esquema de base de datos (nuevo proyecto)

### Tablas nuevas o extendidas vs proyecto actual

```sql
-- NUEVO: Directorio y branding
ALTER TABLE restaurante ADD COLUMN zona        varchar(60);    -- 'arrecife', 'playa-honda'
ALTER TABLE restaurante ADD COLUMN isla        varchar(40);    -- 'lanzarote', 'fuerteventura'
ALTER TABLE restaurante ADD COLUMN tipo_cocina varchar(60);    -- 'pizza', 'burger', 'sushi'
ALTER TABLE restaurante ADD COLUMN slogan      text;
ALTER TABLE restaurante ADD COLUMN logo_url    text;
ALTER TABLE restaurante ADD COLUMN banner_url  text;
ALTER TABLE restaurante ADD COLUMN color_primario   varchar(7);  -- '#E63946'
ALTER TABLE restaurante ADD COLUMN color_secundario varchar(7);
ALTER TABLE restaurante ADD COLUMN redes_sociales   jsonb;
ALTER TABLE restaurante ADD COLUMN lat         numeric(10,8);
ALTER TABLE restaurante ADD COLUMN lng         numeric(11,8);
ALTER TABLE restaurante ADD COLUMN activo_directorio bool DEFAULT true;
ALTER TABLE restaurante ADD COLUMN destacado   bool DEFAULT false;  -- badge "Destacado"

-- NUEVO: Fotos de productos
ALTER TABLE menu_item ADD COLUMN foto_url text;
ALTER TABLE menu_item ADD COLUMN destacado bool DEFAULT false;

-- NUEVO: Promociones
CREATE TABLE promocion (
  id             serial PRIMARY KEY,
  restaurante_id int4 NOT NULL REFERENCES restaurante(id),
  nombre         text NOT NULL,
  descripcion    text,
  descuento_pct  numeric(5,2),
  descuento_fijo numeric(10,2),
  aplica_a       varchar(20),  -- 'pedido', 'producto', 'categoria'
  codigo         varchar(30),
  activo         bool DEFAULT true,
  fecha_inicio   timestamptz,
  fecha_fin      timestamptz
);

-- NUEVO: Roles de equipo
CREATE TABLE local_memberships (   -- ya existe, extender
  -- agregar: rol varchar(20) CHECK rol IN ('admin','operador','cajero')
  -- agregar: permisos jsonb
);

-- NUEVO: Cuadre de caja
CREATE TABLE caja_cierre (
  id             serial PRIMARY KEY,
  restaurante_id int4 NOT NULL REFERENCES restaurante(id),
  fecha          date NOT NULL,
  turno          varchar(20) DEFAULT 'dia',
  total_ventas   numeric(10,2),
  total_pedidos  int4,
  desglose_pago  jsonb,   -- {"transferencia": 150.50, "efectivo": 80.00}
  pedidos_ids    int4[],
  cerrado_por    uuid REFERENCES auth.users(id),
  cerrado_en     timestamptz DEFAULT now(),
  notas          text
);

-- NUEVO: n8n chat histories con restaurante_id
ALTER TABLE n8n_chat_histories ADD COLUMN restaurante_id int4;

-- EXISTENTES (sin cambios de estructura):
-- pedidos, usuarios, menu_category, menu_item, menu_variant,
-- extra, delivery_zone, horarios, contexto, faqs, restaurante_config
```

---

## 6. Zonas del directorio — Canarias MVP

### Lanzarote
- `/local/arrecife`
- `/local/playa-honda`
- `/local/tahiche`
- `/local/puerto-del-carmen`
- `/local/costa-teguise`
- `/local/yaiza`
- `/local/haria`

### Fuerteventura
- `/local/puerto-del-rosario`
- `/local/corralejo`
- `/local/costa-calma`
- `/local/morro-jable`

### Gran Canaria, Tenerife (post-MVP)

---

## 7. Roles de empleado

| Rol | Puede ver | Puede hacer |
|-----|-----------|-------------|
| `admin` | Todo | Todo: configurar, editar menú, ver caja, gestionar equipo |
| `operador` | Pedidos, menú | Gestionar pedidos, actualizar estado, crear pedido manual |
| `cajero` | Pedidos, caja | Ver pedidos, hacer cuadre de caja, cierre del día |

---

## 8. Panel de pedidos en tiempo real

**Flujo:**
```
Pedido nuevo (web o WhatsApp)
→ INSERT en tabla pedidos
→ Dashboard hace polling cada 10s (MVP)
→ Si hay pedido nuevo: sonido de alerta + card aparece en pantalla
→ Operador cambia estado: pendiente → preparando → listo → entregado
→ Cambio de estado dispara webhook n8n
→ n8n notifica al cliente por WhatsApp
```

**Estados del pedido:**
```
nuevo → confirmado → preparando → listo_retiro / en_camino → entregado / cancelado
```

---

## 9. Cuadre de caja

**Vista diaria:**
```
┌─────────────────────────────────────────────┐
│ CUADRE DE CAJA — Lunes 6 julio 2026         │
├─────────────────────────────────────────────┤
│ Total pedidos:        23                    │
│ Total ventas:         €487.50               │
├─────────────────────────────────────────────┤
│ Transferencia:        €310.00  (63.6%)      │
│ Efectivo:             €120.00  (24.6%)      │
│ Tarjeta:              €57.50   (11.8%)      │
├─────────────────────────────────────────────┤
│ Delivery:             €350.00  (15 pedidos) │
│ Retiro:               €137.50  (8 pedidos)  │
├─────────────────────────────────────────────┤
│ Ticket promedio:      €21.20                │
│ Pedido más alto:      €68.00                │
└─────────────────────────────────────────────┘
[Cerrar caja del día]  [Exportar CSV]
```

---

## 10. Lo que necesito de ti para implementar sin preguntar

### A. Nuevo proyecto Supabase

Crea un proyecto nuevo en supabase.com con nombre `easyorder-v2` (o el que prefieras) y dame:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...        ← para ejecutar migraciones
DATABASE_URL=postgresql://postgres:...  ← connection string directa (pooler)
```

### B. Git — repositorio nuevo

Dos opciones:
- **Opción 1 (recomendada):** crea un repo en GitHub `easyorder-v2`, dame un Personal Access Token con scope `repo`. Yo hago todos los commits y pushes.
- **Opción 2:** trabajo en la carpeta montada del workspace y tú haces push manualmente cuando yo avise.

### C. Nombre del dominio / marca

Define antes de empezar:
- ¿El producto se llama **Konnecttia**? ¿EasyOrder? ¿Otro?
- ¿El dominio es `konnecttia.com`, `easyorder.ai2nomous.com`, u otro?
- ¿Tienes el dominio ya comprado o hay que considerarlo?

### D. Carpeta del nuevo proyecto

¿Dónde creo el proyecto?
- `C:\AI2nomous\easyorder-v2\` (junto al actual)
- `C:\AI2nomous\konnecttia\` (si el nombre es Konnecttia)
- Otra ruta

### E. Credenciales de despliegue (EasyPanel)

Para que yo pueda disparar redeploys automáticos:
- URL del EasyPanel + token de API, o
- Me avisas cuando quieres deploy y lo instruyo paso a paso

### F. Clave de OpenAI (para el agente n8n)

Ya existe en el proyecto actual. ¿Es la misma o crearás una nueva para v2?

### G. API key de Google Maps (opcional)

Si quieres mapas con Google Maps en lugar de Leaflet (open source). Sin esta key, uso Leaflet que no tiene costo ni límite.

---

## 11. Estimación de tiempo por bloque

| Bloque | Contenido | Sesiones |
|--------|-----------|----------|
| **Setup** | Repo, DB nueva, migraciones base, env | 1 |
| **Landing page** | Diseño completo + SEO | 1-2 |
| **Directorio** | `/local/[zona]` + filtros + cards | 2 |
| **Página restaurante** | Carta + carrito + checkout + branding | 3 |
| **Dashboard — pedidos RT** | Panel + sonido + estados | 2 |
| **Dashboard — menú + fotos** | CRUD menú + Supabase Storage | 2 |
| **Dashboard — caja** | Cuadre + cierre + exportar | 1-2 |
| **Dashboard — clientes** | Historial + búsqueda | 1 |
| **Dashboard — zonas + mapa** | Leaflet + validación CP | 1-2 |
| **Dashboard — equipo** | Roles + permisos | 1 |
| **Toma de pedido manual** | Crear pedido desde panel | 1 |
| **Integración n8n** | Web → WhatsApp → notificaciones | 2 |
| **Pruebas + ajustes** | Testing end-to-end, bugs, pulido | 2-3 |
| **Total** | | **~22-25 sesiones** |

**En calendario:** trabajando 1-2 sesiones por día → **4-6 semanas** para el producto completo y probado.

---

## 12. Plan de ejecución por fases

### Fase 1 — Fundación (semana 1)
Setup, DB, landing page, directorio básico.

### Fase 2 — Carta pública (semana 2)
Página del restaurante, carta con fotos, carrito, checkout, integración WhatsApp básica.

### Fase 3 — Dashboard operativo (semana 3)
Pedidos en tiempo real, gestión de menú, toma de pedido manual.

### Fase 4 — Caja, equipo y zonas (semana 4)
Cuadre de caja, roles de equipo, mapa de zonas, base de clientes.

### Fase 5 — Integración completa y pruebas (semana 5-6)
n8n multi-tenant conectado, notificaciones, pruebas con restaurante real, ajustes.

---

## 13. Proyecto actual como Plan B

El proyecto `easyorder` actual queda intacto en `C:\AI2nomous\easyorder\`. No se toca. Sirve para:
- Demos a clientes potenciales
- Fallback si algo falla en v2
- Referencia técnica durante el desarrollo

La Isla Pizzería puede seguir operando en el proyecto actual mientras se construye v2.

---

*Documento pendiente de aprobación. Confirmar nombre del producto, dominio y credenciales antes de iniciar implementación.*
