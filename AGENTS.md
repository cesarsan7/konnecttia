# Konnecttia — guía para agentes y colaboradores

Konnecttia (konnecTTia.com) es la marca de soluciones digitales para negocios locales de Canarias.
Su primer producto es **EasyOrder**: carta online, pedidos web y panel para restaurantes, sin comisión
por pedido. **EasyAgenda** (reservas para belleza y bienestar) es un producto futuro.

Documento de producto y arquitectura: [`docs/konnecTTia.md`](docs/konnecTTia.md).
Decisiones de arquitectura: [`docs/adr/`](docs/adr/).

## Mapa del repositorio

| Ruta                     | Qué es                                                                       |
| ------------------------ | ---------------------------------------------------------------------------- |
| `apps/site`              | Landing de konnecTTia.com (Next.js)                                          |
| `apps/easyorder`         | Carta pública, checkout, seguimiento y panel del restaurante (Next.js)       |
| `apps/admin`             | Panel interno de Konnecttia: restaurantes, planes, módulos, roles            |
| `apps/api`               | API HTTP (Hono): pública, privada, webhooks y tools del agente               |
| `apps/worker`            | Outbox, notificaciones, expiración de carritos, reintentos                   |
| `packages/domain`        | Reglas de negocio puras (sin I/O): dinero, carta, pedido, zonas, horarios    |
| `packages/access`        | Módulos contratados por restaurante + RBAC de usuarios                       |
| `packages/db`            | Migraciones SQL y acceso a PostgreSQL                                        |
| `packages/notifications` | Adaptadores de email, SMS y WhatsApp (Kapso)                                 |
| `packages/payments`      | Interfaz de pasarela de pago (sin implementar hasta la fase de cobro online) |
| `packages/ui`            | Componentes y tokens de marca                                                |
| `packages/config`        | Configuración compartida (tsconfig, entorno)                                 |
| `integrations/n8n`       | Flujos de n8n versionados sin secretos                                       |

## Comandos

```bash
pnpm install
pnpm lint        # Biome
pnpm typecheck   # tsc en todos los paquetes
pnpm test        # Vitest en todos los paquetes
pnpm build
pnpm db:test     # aplica todas las migraciones en un Postgres temporal
```

## Reglas de negocio (no negociables)

1. Flujo de pedido por WhatsApp: Apertura → Despacho → Pago.
2. Local cerrado ⇒ no se aceptan pedidos.
3. Si existe un pedido reutilizable, se continúa sobre él; solo se abre uno nuevo si el cliente lo pide.
4. Recogida ⇒ nunca pedir dirección.
5. Reparto ⇒ validar zona y mínimo, calcular envío, guardar dirección y tiempo estimado.
6. Mínimo de reparto no alcanzado ⇒ mantener reparto, pedir más productos o cambiar a recogida, no confirmar.
7. No asumir método de pago. Transferencia ⇒ `pendiente_pago`.
8. No cambiar reparto a recogida sin confirmación explícita.
9. No confirmar un pedido sin pasar por Pago.
10. Reclamos o casos sensibles ⇒ derivar a humano.
11. Carrito `en_curso` expira a los 30 min de inactividad; aviso a los 25 min.
12. Alérgenos visibles antes de confirmar; nunca mostrar «sin alérgenos» si el dato falta.
13. Varios locales: cada pedido pertenece a un local (`sucursal`). Recogida en el local elegido o el
    abierto más cercano; reparto desde el local abierto más cercano que cubre la dirección. Un
    local cerrado no acepta pedidos aunque otros estén abiertos (ADR 0007).

## Reglas técnicas

- **Multitenant siempre.** Toda tabla con datos de un restaurante tiene `restaurante_id NOT NULL`.
  El tenant se resuelve en el servidor (slug, host o identidad), nunca desde un parámetro del navegador.
- **Acceso = módulo activo para el restaurante + permiso del rol del usuario.** Usar `packages/access`;
  nunca comprobar roles con cadenas sueltas (`rol === "owner"`).
- **Precios siempre en el servidor.** El navegador envía ids y cantidades; el total lo calcula
  `packages/domain`. Dinero en céntimos enteros (`number` entero), moneda `EUR`.
- **Zona horaria:** fuente única `restaurante.zona_horaria`. Guardar en UTC (`timestamptz`).
- **Migraciones:** solo se añaden archivos nuevos en `packages/db/migrations`, numerados y compatibles con
  el código y los flujos de n8n en producción. Nunca editar una migración ya aplicada.
- **Funciones SQL multitenant:** `p_restaurante_id` obligatorio, sin valor por defecto.
- **Secretos:** solo en variables de entorno de EasyPanel. Nunca en el repositorio, prompts ni logs.
  Las variables obligatorias se validan al arrancar: si falta una, la app no arranca.
- **Webhooks entrantes:** autenticados (firma o secreto compartido) e idempotentes.
- **Sin magic strings:** constantes o enums con nombre.
- **Configuración:** sin valores de negocio en el código. Toda clave nueva de `restaurante_config` va en español
  (`snake_case`) y se documenta en `config_clave` (migración); una prueba lo exige para las que lee la API.
- **Pruebas:** toda regla de dominio nueva lleva prueba unitaria; todo cambio de acceso, prueba de que el
  restaurante A no ve datos del B y, si afecta a locales, que un usuario limitado a un local no ve
  ni opera los de otro (`canAccessBranch` / `branchFilter`).

## Forma de trabajar

Antes de proponer cambios, indicar: componente, qué se reutiliza, tablas afectadas, riesgo y si es MVP
o post-MVP. Cambios pequeños, en rama propia y con pull request. Producción solo se toca con aprobación
del promotor.

Para que fusionar un PR no deje en conflicto a los demás:

- **PR que dependen de otro o tocan los mismos archivos van encadenados**: su base es la rama del PR
  anterior, no `main`. Al fusionar el primero, GitHub cambia la base del siguiente a `main`
  (conviene tener activado «Automatically delete head branches» en el repositorio).
- **Estilos del panel por componente**: cada pantalla o componente nuevo trae su `.css` al lado y
  lo importa (`import "./mesas.css";`). `apps/easyorder/src/app/panel/panel.css` queda para la base
  común (variables, estructura, botones, formularios); no se añaden secciones nuevas al final.
- Antes de abrir un PR, `git merge main` si `main` avanzó, y comprobar que no quedan marcas de
  conflicto (`<<<<<<<`) ni errores de Biome.
