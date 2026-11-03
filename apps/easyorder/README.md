# EasyOrder · web de pedidos y panel del restaurante

Carta y pedido online de cada restaurante: `/<slug>` (carta, selector de local, checkout en una
pantalla) y `/<slug>/pedido/<token>` (seguimiento). Habla solo con la API pública (`apps/api`):
el navegador nunca envía precios y el total lo calcula el servidor.

Panel del restaurante (`/panel`, marca EasyOrder de Konnecttia):

- `/panel`: acceso con Supabase Auth (email y contraseña) y recuperación de contraseña
  (`/panel/restablecer`). Si el usuario es miembro de varios restaurantes, elige uno.
- `/panel/<slug>`: tablero de pedidos en directo (consulta cada 10 s), aviso sonoro de pedido
  nuevo, avance de estado con la misma máquina de estados que la API, confirmación de cobro
  (transferencia, Bizum), cancelación con confirmación y «modo ocupado» por local.
- `/panel/<slug>/estadisticas`: ventas, pedidos, ticket medio y clientes con variación frente al
  periodo anterior; ventas por día, pedidos por hora (hora punta), productos más pedidos,
  recogida/reparto, canal, métodos de pago y ventas por local. Solo con el módulo Analíticas.

El panel muestra u oculta botones según `GET /panel/<slug>/acceso`, pero la API comprueba
cada permiso en cada petición. `panel` es una ruta reservada: ningún restaurante puede tener ese slug.

| Variable            | Para qué                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| `API_URL`           | API vista desde el servidor de Next (red interna de EasyPanel)          |
| `API_PUBLIC_URL`    | API vista desde el navegador; debe estar en `ALLOWED_ORIGINS` de la API |
| `SUPABASE_URL`      | Proyecto de Supabase Auth del panel (el mismo que usa la API)           |
| `SUPABASE_ANON_KEY` | Clave pública (anon) de ese proyecto                                    |

Todas se leen en tiempo de ejecución (no hacen falta en el build).

```bash
pnpm --filter @konnecttia/easyorder dev   # http://localhost:3020/<slug>
```

Reglas de negocio aplicadas en la web (la API las vuelve a comprobar):

- Recogida: nunca pide dirección; con varios locales, el cliente elige (o usa su ubicación).
- Reparto: dirección y zona (o ubicación); si no llega al mínimo, se mantiene el reparto, se
  indica cuánto falta y se ofrece cambiar a recogida. No se puede enviar.
- No hay método de pago por defecto. Transferencia queda pendiente de pago.
- Alérgenos «no informados» visibles antes de añadir cada producto.
