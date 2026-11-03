# konnecTTia — producto, arquitectura y plan

Documento único de referencia. Sustituye a los documentos de EasyOrder y a las propuestas
anteriores, que quedan en [`archive/`](archive/) solo como historial.

Última revisión: 2026-11-02.

---

## 1. Qué es Konnecttia

**Konnecttia** (dominio `konnecttia.com`, propiedad del promotor) es la marca canaria de
herramientas digitales sencillas para que los negocios locales atiendan y vendan por sus propios
canales.

- La doble **TT** se lee como dos letras abrazadas: cercanía con el cliente.
- El final **IA** indica que se usa inteligencia artificial para añadir valor, siempre como
  complemento opcional (por ejemplo, el agente de WhatsApp para pedidos).

| Producto                     | Estado                    | Para quién                                                                    |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| **EasyOrder by Konnecttia**  | En construcción (piloto)  | Restaurantes, cafeterías y locales de comida para llevar o con reparto propio |
| **EasyAgenda by Konnecttia** | Futuro (lista de interés) | Peluquerías, estética y bienestar                                             |
| Webs para negocios locales   | Servicio, fuera del SaaS  | Comercios que necesitan presencia web                                         |

Idea que guía las decisiones: **el negocio local es el protagonista; su marca, sus clientes y su
margen son suyos. Konnecttia se encarga de que funcione.**

## 2. Cliente objetivo y propuesta de valor

**Segmento inicial:** restaurantes de Lanzarote (Arrecife y alrededores) de 1 a 3 locales que
reciben pedidos por teléfono o WhatsApp, o que pagan comisión a una app de reparto.

**Propuesta:** «Tu canal de pedidos propio, sin comisión por pedido, listo en días y con
acompañamiento en tu local».

| Alternativa del cliente    | Qué deja sin resolver                                    | Qué aporta EasyOrder                              |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Apps de reparto            | Comisión por pedido; la marca y el cliente son de la app | Canal propio a precio fijo, datos del restaurante |
| Teléfono y WhatsApp manual | Errores, colas en hora punta, sin registro               | Pedido completo y validado en un panel            |
| Cartas QR o PDF            | Solo muestran la carta                                   | Pedido, zonas, mínimos, horarios y alérgenos      |
| Software genérico de fuera | Complejo, sin presencia local                            | Alta en el local y soporte cercano                |

**No es:** app de reparto, TPV, programa de facturación, ni una promesa de más ventas.

### Pilotos y prospectos (noviembre de 2026)

| Negocio                             | Tipo                                                 | Necesidades detectadas                                                                                                              |
| ----------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Pizzería La Isla 1999 (Arrecife)    | Pizzería, recogida y reparto                         | Lo construido en EasyOrder; hoy paga comisión a Glovo                                                                               |
| La Ripia (Argana Alta, Arrecife)    | Finger food, sala + para llevar por teléfono         | Envases +1 € en pedidos < 25 €; pan sin gluten o vegano +1 €; disponibilidad según inventario; hora de recogida; carta en inglés    |
| Cafetería Siempre Juntos (Arrecife) | Comida colombiana: salchipapas, arepas, hamburguesas | **Dos locales**; reparto en todo Arrecife; tamaños pequeño y grande; extras con precio; «+1 € si es de chorizo»; tabla de alérgenos |
| 2 prospectos                        | Pendiente de propuesta comercial                     | Mismo alcance que La Isla                                                                                                           |

## 3. Módulos y planes

Cada restaurante tiene **módulos activos** (por plan o como complemento) y cada usuario tiene
**roles con permisos**. Una acción solo se permite si se cumplen las dos cosas.

| Módulo                                                                                                        | Tipo        | Incluido en         |
| ------------------------------------------------------------------------------------------------------------- | ----------- | ------------------- |
| Pedidos web y panel · Carta · Configuración · Equipo y roles · Avisos por email                               | Básico      | Todos               |
| Reparto con zonas · Clientes e historial                                                                      | Plan        | Básico y Premium    |
| Mesas y comanda · Analíticas · Pedidos programados · Carta multilingüe · Novedades y reseñas · Varios locales | Plan        | Premium             |
| Conexión de WhatsApp (Kapso) · Avisos por WhatsApp · Agente de IA · Avisos por SMS                            | Complemento | Se contratan aparte |
| Cobro online                                                                                                  | Futuro      | —                   |

Roles plantilla: **Propietario**, **Encargado**, **Personal** y **Consulta**. En el MVP los roles
de cada restaurante solo los crea el panel interno de Konnecttia.

Definición en código: `packages/access`. Siembra en base de datos:
`packages/db/migrations/0001_access_modules_rbac.sql`.

## 4. Arquitectura

```text
           konnecttia.com (site)       pedir.konnecttia.com/[slug] (easyorder)
                     │                              │
   app.konnecttia.com (panel)   admin (interno)     │
                     └──────────────┬───────────────┘
                                    ▼
                         api (Hono) ── webhooks ◄── Kapso (WhatsApp)
                           │    │                ◄── n8n (agente)
                           │    └── outbox ──► worker ──► email / SMS / WhatsApp
                           ▼
                   PostgreSQL (restaurante_mvp)  ◄── n8n (funciones SQL existentes)
```

| Pieza           | Tecnología                                            | Motivo                                                                   |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Monorepo        | pnpm + Turborepo                                      | Productos separados con paquetes compartidos                             |
| Web             | Next.js 16, React 19 (landing con CSS propio)         | Versiones actuales; páginas públicas rápidas                             |
| API             | Hono                                                  | Reutiliza la API de EasyOrder; HTTP estable para n8n, Kapso y worker     |
| Base de datos   | PostgreSQL existente                                  | Conserva los datos de La Isla; se evoluciona con migraciones             |
| Autenticación   | Supabase Auth (solo acceso)                           | Ya integrado; enlace mágico y Google                                     |
| Agente WhatsApp | n8n como «cerebro» + Kapso como conexión del número   | Reutiliza lo construido; coexistencia con la app de WhatsApp del negocio |
| Atención humana | Chatwoot hoy; objetivo: bandeja integrada en el panel | Menos aplicaciones para el restaurante                                   |
| Alojamiento     | EasyPanel en un VPS de la UE                          | Workers, SSE y servicios propios en un solo lugar; RGPD                  |
| Calidad         | Biome, Vitest, Playwright, GitHub Actions             | Ninguna regla de negocio sin prueba                                      |

Decisiones detalladas en [`adr/`](adr/).

### Locales (sucursales)

Un restaurante puede tener varios locales (módulo «Varios locales», plan Premium). La marca, la
carta, el equipo y los clientes son del restaurante; cada pedido queda asignado a un local:

- **Recogida**: el cliente elige el local o, si comparte su ubicación, se asigna el abierto más
  cercano.
- **Reparto**: cada zona pertenece a un local; reparte el local abierto más cercano que cubre la
  dirección.
- **Panel**: el dueño ve todos los locales y las ventas por local; un cajero o camarero puede
  quedar limitado a su local.
- **Compatibilidad**: lo que no indica local (n8n, dashboard actual) va al local principal.

Detalle y consecuencias en [ADR 0007](adr/0007-sucursales.md).

### Referencias usadas

- **EasyOrder** (`cesarsan7/easyorder`): producto y reglas de negocio. Se reutiliza su lógica y su
  base de datos.
- **Pedifast** (`Agustin-Perezz/pedifast`): solo como referencia de ideas (checkout en una
  pantalla, grupos de modificadores, panel en directo, prácticas de calidad). Su código no tiene
  licencia y no se copia.

### Parámetros de reparto y tiempos (sin valores en el código)

Todo se configura en la base de datos, por restaurante o por zona:

| Qué                                                                                                                                                          | Dónde                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Zonas: cobertura por radio, código postal o toda la ciudad (`cubre_todo`)                                                                                    | `delivery_zone`      |
| Tarifa fija o por km (`tipo_tarifa`, `fee`, `tarifa_por_km`, `tarifa_maxima`)                                                                                | `delivery_zone`      |
| Envío gratis desde (`envio_gratis_desde`) y pedido mínimo (`min_order_amount`)                                                                               | `delivery_zone`      |
| Tiempo de reparto de la zona (`estimated_minutes_min` / `_max`)                                                                                              | `delivery_zone`      |
| Tiempo de reparto general: `delivery_eta_text` o `delivery_eta_min_minutes` / `delivery_eta_max_minutes` (y, como último recurso, `estimated_time_delivery`) | `restaurante_config` |
| Tiempo de recogida: `pickup_eta_text` o `pickup_eta_minutes` (último recurso `estimated_time_pickup`)                                                        | `restaurante_config` |
| Suplementos por pedido pequeño (`surcharge_rules`, JSON)                                                                                                     | `restaurante_config` |

Si no hay tiempo configurado, el pedido muestra «tiempo a confirmar»: la API no inventa uno.

Tiempo variable (migración 0008): base + la franja punta mayor que coincida (`franja_pico`, por
día y hora, por local o para todos) + el modo ocupado activo (`modo_ocupado`, botón del panel con
duración) + cola (`cola_minutos_por_pedido` por cada pedido activo por encima de
`cola_pedidos_sin_espera`). Un texto fijo (`*_eta_text`) se muestra tal cual, sin ajustes.
Pendiente: que el subflujo Despacho de n8n lea `tipo_tarifa`, `envio_gratis_desde` y `cubre_todo`
(hoy solo usa la tarifa fija de la zona) y elimine sus valores por defecto (20, 30 y 45 min).

## 5. Seguridad y aislamiento

Corregido o en curso en este repositorio:

| Riesgo en EasyOrder                                           | Corrección en Konnecttia                                 |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| El total del pedido usa precios enviados por el navegador     | `packages/domain/pricing.ts` calcula todo en el servidor |
| Seguimiento por código secuencial que expone datos personales | `tracking_token` aleatorio (migración 0002)              |
| Anti-duplicado por teléfono en 30 s                           | `idempotency_key` por restaurante (migración 0002)       |
| Roles comprobados con cadenas sueltas                         | `packages/access` (módulo + permiso)                     |
| `restaurante_id` nulo en 9 tablas                             | `proposed/0100_tenant_not_null.sql`                      |
| Funciones SQL antiguas sin restaurante                        | `proposed/0101_drop_legacy_function_overloads.sql`       |
| Avisos por `fetch` sin reintentos                             | Outbox + worker (migración 0002)                         |
| La aplicación usa el usuario `postgres`                       | Rol de aplicación sin privilegios y después RLS          |

Acciones del promotor fuera del código: repositorio `easyorder` en privado, autenticación en los
webhooks de n8n, rotación de la contraseña de la base de datos y servidor en la UE.

## 6. Reglas de negocio

Las reglas operativas validadas con La Isla están en [`AGENTS.md`](../AGENTS.md#reglas-de-negocio-no-negociables)
y son de obligado cumplimiento para cualquier canal (web, panel, n8n).

## 7. Plan hasta el MVP

| Fase                | Contenido                                                                         | Puerta de salida                                  |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0. Base (esta rama) | Monorepo, dominio con pruebas, acceso, migraciones, landing                       | PR revisado y fusionado                           |
| 1. API y seguridad  | API en el monorepo con precio en servidor, token, idempotencia, acceso por módulo | Pruebas de aislamiento A/B en verde en staging    |
| 2. EasyOrder web    | Carta, checkout en una pantalla, seguimiento, panel con SSE, alérgenos            | Flujo completo sin WhatsApp con 2 restaurantes    |
| 3. Avisos y admin   | Worker con email, panel interno de Konnecttia (planes, módulos, roles)            | Alta de un restaurante sin tocar la base de datos |
| 4. WhatsApp         | Kapso (conexión y avisos), n8n llamando a la API                                  | La Isla migrada; agente en pruebas                |
| 5. Piloto           | 3–5 restaurantes reales                                                           | Uso semanal y disposición a pagar                 |

Estimación: unas 4 semanas de calendario hasta un MVP vendible, con sesiones diarias de trabajo y
revisión del promotor.

## 8. Pendiente

- Servicio de staging y copia de la base de datos en EasyPanel.
- Datos legales de la entidad para aviso legal y privacidad.
- Evaluación técnica de Kapso con un número de prueba (coexistencia, WhatsApp Web, tarifas).
- n8n (Despacho): elegir local en los pedidos por WhatsApp de restaurantes con varios locales.
- Inventario y compras por local (stock, recetas) sobre `pedidos.sucursal_id`.
- Módulo «Novedades y reseñas» (ofertas de empleo, avisos, reseñas) para una fase posterior.
