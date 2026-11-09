# Escenarios de prueba para el equipo comercial

9 de noviembre de 2026

Guiones paso a paso para probar EasyOrder en el entorno de pruebas con varios roles a la vez, y saber qué contar al cliente de cada uno. Se hacen con dos personas o con dos pantallas: el móvil hace de cliente y un ordenador hace de local.

## Antes de empezar

- Usa un **restaurante de pruebas**, nunca el de un cliente real ni La Isla. Si no existe, pide a Cesar que lo cree en `/interno` («Nuevo restaurante»), con plan Premium.
- Pide a Cesar un usuario por rol. Cada uno entra al panel con su propio email.
- Si algo no sale como dice «Resultado esperado», haz una foto, anota el escenario y el paso, y avisa a Cesar. Los nombres de los botones pueden variar un poco.

| Rol         | Qué puede hacer en el panel                                                             |
| ----------- | --------------------------------------------------------------------------------------- |
| Propietario | Todo, incluido el equipo y el agente                                                    |
| Encargado   | Todo menos gestionar el equipo y configurar el agente                                   |
| Personal    | Ver y crear pedidos, cambiar su estado, asignar repartos, ver clientes, gestionar mesas |
| Mesero      | Ver y crear pedidos, cambiar su estado, gestionar mesas                                 |
| Repartidor  | Solo ve y entrega los pedidos que tiene asignados                                       |
| Consulta    | Solo mirar: pedidos, carta, reparto y mesas                                             |

## Enlaces

| Qué                              | Enlace                                               | Estado                                                  |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Landing                          | https://site.eu.konnecttia.com/                      | Confirmado                                              |
| Panel interno (Konnecttia)       | https://panel.eu.konnecttia.com/interno              | Confirmado                                              |
| Panel del restaurante            | https://panel.eu.konnecttia.com/panel                | Confirmado                                              |
| Panel de Arepa's Factory         | https://panel.eu.konnecttia.com/panel/arepas-factory | Deducido: comprobar la primera vez                      |
| Carta pública de Arepa's Factory | https://panel.eu.konnecttia.com/arepas-factory       | Confirmado                                              |
| Panel de Siempre Juntos          | https://panel.eu.konnecttia.com/panel/siempre-juntos | Deducido: comprobar la primera vez                      |
| Carta pública de Siempre Juntos  | https://panel.eu.konnecttia.com/siempre-juntos       | Deducido; solo vale si está cargado en la base de la UE |
| Alta autoservicio                | https://panel.eu.konnecttia.com/alta                 | Deducido; apagada hasta activarla en `/interno`         |

Para el restaurante de pruebas, el panel es `/panel/<slug>` y la carta `/<slug>`, con el slug que le haya puesto Cesar.

## 1. Pedido a domicilio con Bizum, repartidor y foto de entrega

**Roles:** cliente (móvil), Personal, Encargado, Repartidor.
**Preparación:** el restaurante tiene Bizum activado en Ajustes, una zona de reparto con pedido mínimo y un repartidor invitado.

1. **Cliente:** abre la carta pública, añade productos hasta superar el mínimo, elige «A domicilio» e indica una dirección dentro de la zona.
2. **Cliente:** paga con Bizum, sube una captura como justificante y envía el pedido. Guarda el enlace de seguimiento.
3. **Personal:** en **Pedidos** suena el aviso y aparece el pedido. Ábrelo y comprueba que ve el justificante.
4. **Encargado:** en **Cobros pendientes**, confirma el cobro.
5. **Personal:** pulsa **Aceptar pedido**, después preparar y listo. Asigna el pedido al repartidor.
6. **Repartidor:** en **Repartos** ve solo ese pedido. Lo marca como en camino y lo entrega haciendo una foto.
7. **Cliente:** mira cómo cambia el estado en el seguimiento hasta «entregado».

**Resultado esperado:** el pedido no se puede entregar hasta confirmar el cobro; la foto de entrega aparece dentro del pedido; el repartidor ve su historial en **Mi historial** y el encargado en **Actividad**.
**Qué contar al cliente:** «Todo llega a un solo tablero, con aviso. No entregas sin cobrar y tienes la foto de cada entrega por si hay una queja.»

## 2. Mesa con mesero, comanda y cuenta (plan Premium)

**Roles:** Mesero, Personal.

1. **Mesero:** entra en **Mesas**, ocupa una mesa y toma un pedido con dos productos y una nota.
2. **Personal:** en **Pedidos** aparece el pedido de la mesa con el nombre del mesero. Imprime la comanda (ver escenario 8).
3. **Mesero:** avanza el pedido hasta entregado y pide la cuenta de la mesa.
4. **Mesero:** libera la mesa.

**Resultado esperado:** la comanda y la tarjeta del pedido dicen quién atiende la mesa; la mesa muestra cuánto lleva ocupada; al liberarla vuelve a estar libre.
**Qué contar al cliente:** «Sabes quién atendió cada mesa y cuánto lleva esperando, sin papel.»

## 3. Pedido por debajo del mínimo

**Roles:** cliente (móvil).

1. Abre la carta pública y añade un solo producto barato.
2. Elige «A domicilio» con una dirección de la zona.
3. Intenta enviar el pedido.

**Resultado esperado:** el sistema calcula el envío y avisa de que falta importe para llegar al mínimo; no deja pedir. Cambiar a «Recoger» no pide dirección.
**Qué contar al cliente:** «El envío y el mínimo se calculan solos; no más discusiones por teléfono.»

## 4. Cliente bloqueado

**Roles:** Encargado, cliente (móvil).

1. **Encargado:** entra en **Clientes**, abre la ficha de un teléfono de prueba y pulsa **Bloquear**.
2. **Cliente:** intenta hacer un pedido en la carta pública con ese teléfono.
3. **Encargado:** en **Clientes**, usa el filtro «Solo bloqueados» y desbloquea el teléfono.

**Resultado esperado:** el pedido del teléfono bloqueado no se acepta y el cliente no ve el motivo; al desbloquearlo, puede pedir.
**Qué contar al cliente:** «Si alguien hace pedidos falsos, lo bloqueas desde su ficha. Además puedes limitar los pedidos por teléfono.»

## 5. Hora punta con modo ocupado

**Roles:** Encargado, cliente (móvil).

1. **Encargado:** activa **Modo ocupado** y suma unos minutos de espera.
2. **Cliente:** abre la carta y mira el tiempo estimado.
3. **Encargado:** desactiva el modo ocupado.

**Resultado esperado:** los clientes nuevos ven más tiempo de espera mientras está activo; después vuelve el normal.
**Qué contar al cliente:** «En hora punta avisas de más espera con un botón y nadie se queja.»

## 6. Qué ve cada rol

**Roles:** uno por cada rol de la tabla de arriba.

1. Entra con cada usuario y recorre el menú del panel.
2. Anota qué secciones ve y si puede cambiar el estado de un pedido.

**Resultado esperado:**

- **Propietario y Encargado:** ven pedidos, carta, clientes, estadísticas y ajustes; solo el Propietario ve el equipo.
- **Personal:** pedidos, reparto, clientes y mesas; no ve estadísticas ni ajustes.
- **Mesero:** pedidos y mesas; no ve clientes, reparto ni estadísticas.
- **Repartidor:** solo sus repartos.
- **Consulta:** puede mirar, pero no cambia el estado de un pedido.

**Qué contar al cliente:** «Cada persona entra con su usuario y ve solo lo que le toca; tus empleados no ven las ventas.»

## 7. Alta autoservicio y conversión del plan

**Roles:** restaurante nuevo, Konnecttia en `/interno`.
**Preparación:** pide a Cesar que active el alta autoservicio en `/interno`; hasta entonces `/alta` está apagada.

1. Abre `/alta`, regístrate con un email nuevo y confirma el email.
2. Completa el asistente: nombre, dirección, teléfono, horario, cobro y recogida o reparto.
3. Mira el panel del restaurante nuevo: debe aparecer la prueba gratuita.
4. **Konnecttia:** en `/interno`, abre el restaurante, amplía la prueba y conviértela en plan de pago.

**Resultado esperado:** el restaurante queda creado con plan de prueba; al convertirlo, desaparece el aviso de prueba. Al vencer una prueba, la carta deja de aceptar pedidos y los datos se conservan.
**Qué contar al cliente:** «Pruebas sin tarjeta; si no sigues, no pierdes tus datos.»

## 8. Imprimir una comanda

Sigue la guía [Prueba de impresión de comanda](prueba-impresion-comanda.md). Resumen: **Pedidos → Comanda → Imprimir una prueba**, con papel de 80 mm y copia de cocina.

**Qué contar al cliente:** «Funciona con tu impresora térmica de 58 u 80 mm; la comanda sale sola al llegar o al aceptar el pedido.»

## 9. Borrar los datos de un cliente

**Roles:** Encargado, cliente (móvil).

1. **Cliente:** haz un pedido de prueba con un teléfono inventado y marca el consentimiento de privacidad.
2. **Encargado:** en **Clientes**, abre la ficha de ese teléfono y pulsa borrar sus datos.
3. Comprueba la lista de clientes.

**Resultado esperado:** los datos personales del cliente desaparecen; si estaba bloqueado, el bloqueo se mantiene sin mostrar el motivo.
**Qué contar al cliente:** «Si un cliente te pide borrar sus datos, lo haces tú en un clic.»
