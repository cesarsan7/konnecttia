# ADR 0007 — Locales (sucursales) dentro de un restaurante

- Estado: aceptada (2026-11-02)
- Origen: Cafetería Siempre Juntos tiene dos locales; otros prospectos pueden tener más.

## Decisión

El **restaurante** sigue siendo el tenant (marca, carta, plan, equipo, clientes). Cada restaurante
tiene uno o varios **locales**, guardados en la tabla `sucursal` (migración 0003). En la interfaz
se dice «local»; en la base, `sucursal`, porque `local_memberships` ya significa «miembro del
restaurante» en el esquema heredado.

| Pieza                         | Dónde vive                                     | Regla                                                                                   |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Local principal               | `sucursal.es_principal`                        | Exactamente uno por restaurante; se crea solo, también en altas nuevas                  |
| Pedido → local                | `pedidos.sucursal_id`                          | Si no se indica (n8n, dashboard actual), un trigger pone la principal                   |
| Recogida                      | API `POST /public/:slug/orders`                | El cliente elige local o, con su ubicación, se asigna el abierto más cercano            |
| Reparto                       | `delivery_zone.sucursal_id`                    | Reparte el local abierto más cercano entre los que tienen una zona que cubre al cliente |
| Horario                       | `sucursal_horario` (opcional)                  | Sin filas, el local usa `horarios` del restaurante; `forzar_abierto` cierra un local    |
| Carta                         | Del restaurante; `sucursal_item_no_disponible` | Un local puede no servir (o tener agotado) un producto                                  |
| Mesas, zonas de mesa, meseros | `sucursal_id` en sus tablas                    | Preparado para la comanda por local                                                     |
| Equipo                        | `membresia_sucursal`                           | Sin filas: todos los locales. Con filas: solo esos (cajeros, camareros)                 |
| Informes                      | `GET /panel/:slug/reports/sales`               | Ventas por local, respetando el alcance del usuario                                     |

El módulo **Varios locales** (`locations.multi`, plan Premium) activa todo lo anterior. Sin él,
el restaurante funciona con su local principal y los demás locales no aparecen ni reciben pedidos.

## Motivo

- Los locales comparten marca, carta y clientes: no son restaurantes distintos. Crear un tenant
  por local duplicaría la carta y rompería el historial del cliente.
- Asignar la principal por trigger mantiene funcionando n8n y el dashboard actual sin cambios.
- Guardar el local en cada pedido es la base para ventas por local, inventario y compras de
  cocina (los `items` del pedido ya son una instantánea con nombre, variante y cantidad).

## Consecuencias

- **n8n**: los pedidos por WhatsApp de un restaurante con varios locales entran en la principal
  hasta que el subflujo Despacho elija local (pasando `sucursal_id` o llamando a la API). Para
  restaurantes de un solo local no cambia nada.
- `delivery_zone` mantiene la clave única `(restaurante_id, postal_code)`: un código postal solo
  puede pertenecer a un local. Las zonas por radio no tienen esa limitación.
- El dashboard actual de EasyOrder ignora `sucursal_id`; los filtros por local llegan con el
  nuevo panel.
- Pendiente para inventario: tablas de stock y recetas por local, que leerán `pedidos.items`
  por `sucursal_id`. No forman parte del MVP.

## Alternativas descartadas

- **Un restaurante por local**: duplica carta, configuración y clientes; los informes del dueño
  tendrían que sumar tenants.
- **`local_id` nulo = «todos»** en las tablas operativas: ambiguo en pedidos y en informes; se
  prefirió asignar siempre un local concreto.
