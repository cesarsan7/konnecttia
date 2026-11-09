# Incidencias del cliente en WhatsApp (pieza P) — propuesta para n8n

Estado: **propuesta, sin aplicar**. La web ya crea incidencias (`POST /public/orders/:token/incidencias`)
y el panel las lista en Incidencias. No se toca el JSON de producción: al aplicarlo se genera una versión
nueva con diff.

## Regla que no cambia

Un reclamo o caso sensible sigue **derivándose a humano** (regla 12). La incidencia se añade, no lo
sustituye.

## Cambio propuesto en Pedidos Cliente / Derivar Humano

Cuando el agente deriva a humano por un reclamo sobre un pedido concreto, insertar además una fila en
`pedido_incidencia` (tabla de la migración 0028):

| Columna          | Valor                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| `pedido_id`      | pedido sobre el que reclama (el último reutilizable del cliente)         |
| `restaurante_id` | el mismo del pedido (un trigger lo comprueba)                            |
| `tipo`           | `falta_algo`, `llego_mal`, `retraso` u `otro` (si no está claro, `otro`) |
| `descripcion`    | resumen del reclamo con las palabras del cliente (3 a 1000 caracteres)   |

- Máximo 3 incidencias abiertas por pedido (la API lo aplica en la web; en n8n, comprobarlo antes).
- Si el reclamo no es sobre un pedido concreto, no se crea incidencia: solo se deriva a humano.
- El texto puede contener datos personales; al borrar los datos del cliente desde el panel se vacía solo.

Pendiente de decidir: si el alta vive como función SQL nueva (por proponer) o se hace con un nodo
Postgres. Hasta decidirlo no se crea ninguna función.
