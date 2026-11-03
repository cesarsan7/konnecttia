# EasyOrder · web de pedidos

Carta y pedido online de cada restaurante: `/<slug>` (carta, selector de local, checkout en una
pantalla) y `/<slug>/pedido/<token>` (seguimiento). Habla solo con la API pública (`apps/api`):
el navegador nunca envía precios y el total lo calcula el servidor.

| Variable         | Para qué                                                                |
| ---------------- | ----------------------------------------------------------------------- |
| `API_URL`        | API vista desde el servidor de Next (red interna de EasyPanel)          |
| `API_PUBLIC_URL` | API vista desde el navegador; debe estar en `ALLOWED_ORIGINS` de la API |

Ambas se leen en tiempo de ejecución (no hacen falta en el build).

```bash
pnpm --filter @konnecttia/easyorder dev   # http://localhost:3020/<slug>
```

Reglas de negocio aplicadas en la web (la API las vuelve a comprobar):

- Recogida: nunca pide dirección; con varios locales, el cliente elige (o usa su ubicación).
- Reparto: dirección y zona (o ubicación); si no llega al mínimo, se mantiene el reparto, se
  indica cuánto falta y se ofrece cambiar a recogida. No se puede enviar.
- No hay método de pago por defecto. Transferencia queda pendiente de pago.
- Alérgenos «no informados» visibles antes de añadir cada producto.
