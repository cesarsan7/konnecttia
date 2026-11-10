# EasyOrder · Guía comercial

Nov 4, 2026 · @Cesar

## En 30 segundos

EasyOrder es la carta online y el sistema de pedidos propio del restaurante: el cliente pide desde el móvil sin descargar nada, por la web o por WhatsApp, y todo llega a un solo tablero en el local. **Sin comisión por pedido**: el restaurante paga una cuota fija y los clientes y sus datos son suyos.

**Para quién:** locales de comida rápida, cafeterías, pizzerías y restaurantes de Canarias que reciben pedidos para recoger, a domicilio o en mesa, con uno o varios locales.

**La frase:** «Lo mismo que te dan las plataformas de reparto, pero con tu marca, tus clientes y sin pagar un porcentaje de cada pedido.»

## Inventario de funcionalidades

Estado a 9 de noviembre: **Disponible** = construido y probado en el entorno de pruebas; **En pruebas** = funciona, pero aún se está validando; **Próximamente** = planificado, todavía no se puede enseñar.

| Área           | Funcionalidad                   | Qué hace                                                                                                                                                                   | Plan        | Estado       |
| -------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------ |
| Carta online   | Carta propia por local          | Enlace propio (konnecttia.com/tu-local) con fotos, variantes (tamaños), extras y precios                                                                                   | Básico      | Disponible   |
| Carta online   | Alérgenos                       | Los 14 alérgenos de la UE por producto y extra, visibles para el cliente                                                                                                   | Básico      | Disponible   |
| Carta online   | Agotados por local              | Un producto se marca agotado en un local sin tocar los demás                                                                                                               | Básico      | Disponible   |
| Pedidos web    | Pedido sin app                  | Recoger o a domicilio, con el local abierto o cerrado según el horario                                                                                                     | Básico      | Disponible   |
| Pedidos web    | Reparto con zonas               | Zonas, tarifa fija o por km, pedido mínimo y tiempo estimado por zona                                                                                                      | Básico      | Disponible   |
| Pedidos web    | Seguimiento                     | El cliente ve el estado de su pedido en el móvil                                                                                                                           | Básico      | Disponible   |
| Pedidos web    | Suplementos                     | Cargo automático, p. ej. envases si el pedido no llega a un importe                                                                                                        | Básico      | Disponible   |
| Panel          | Tablero en directo              | Los pedidos llegan al momento con aviso sonoro: aceptar, preparar, listo, entregado                                                                                        | Básico      | Disponible   |
| Panel          | Vista tabla                     | Historial con filtros (fechas, estado, tipo, canal, cobro) y orden por columnas                                                                                            | Básico      | Disponible   |
| Panel          | Imprimir comanda                | Ticket de 58 u 80 mm, a mano o automático al llegar o aceptar                                                                                                              | Básico      | Disponible   |
| Panel          | Cobros pendientes               | Transferencia o Bizum: no se entrega hasta confirmar el cobro                                                                                                              | Básico      | Disponible   |
| Panel          | Modo ocupado                    | Suma minutos al tiempo de espera que ven los clientes nuevos durante un rato                                                                                               | Básico      | Disponible   |
| Panel          | Pedido manual                   | Pedidos por teléfono o en mostrador con los precios de la carta                                                                                                            | Básico      | Disponible   |
| Panel          | Repetir pedido                  | Al escribir el teléfono salen sus últimos pedidos para repetirlos                                                                                                          | Básico      | Disponible   |
| Clientes       | Ficha de cliente                | Historial, gasto, ticket medio, lo que más pide; exportar a Excel (CSV)                                                                                                    | Básico      | Disponible   |
| Ajustes        | Horario y apertura              | Dos turnos por día, festivos, abrir o cerrar a mano, horas punta                                                                                                           | Básico      | Disponible   |
| Ajustes        | Cobro                           | Efectivo, tarjeta, Bizum y transferencia (con IBAN)                                                                                                                        | Básico      | Disponible   |
| Equipo         | Equipo y roles                  | Invitar por enlace o email, rol y locales por persona, roles propios                                                                                                       | Básico      | Disponible   |
| Estadísticas   | Ventas                          | Ventas, pedidos, ticket medio, hora punta, comparado con el periodo anterior                                                                                               | Premium     | Disponible   |
| Varios locales | Multilocal                      | Varios locales con su horario, carta, zonas y equipo, en un solo panel                                                                                                     | Premium     | Disponible   |
| Mesas          | Plano de mesas                  | Zonas y mesas, ocupar y liberar, cuenta de la mesa, pedidos en mesa                                                                                                        | Premium     | Disponible   |
| Mesas          | Tiempos y avisos                | Cuánto lleva cada mesa esperando y sentada, con aviso configurable                                                                                                         | Premium     | Disponible   |
| Mesas          | Meseros                         | Mesero que atiende cada mesa y pedido, pedidos e importe del día (base para propinas)                                                                                      | Premium     | Disponible   |
| Reparto        | Repartidores                    | Asignar repartos; el repartidor ve los suyos en el móvil y los marca entregados                                                                                            | Básico      | Disponible   |
| Pedidos web    | Aviso en el seguimiento         | Recuerda al cliente que no cierre la página y le deja copiar el enlace del seguimiento                                                                                     | Básico      | En pruebas   |
| Pedidos web    | Justificante de pago            | Con Bizum o transferencia, el cliente ve los datos para pagar y el concepto, y sube el justificante; el local lo ve en el pedido                                           | Básico      | En pruebas   |
| Pedidos web    | Pedidos sospechosos             | Límite de pedidos por teléfono, captcha invisible y teléfonos bloqueados desde la ficha del cliente (en WhatsApp, en preparación)                                          | Básico      | En pruebas   |
| Pedidos web    | Código de verificación          | Si el pedido tiene riesgo (teléfono nuevo, reparto con pago en efectivo o importe desde 30 €, ajustable por local), se pide un código por WhatsApp antes de enviarlo       | Por definir | Próximamente |
| Panel          | Mesero en la comanda            | La comanda y la tarjeta del pedido dicen quién atiende la mesa                                                                                                             | Premium     | En pruebas   |
| Panel          | Filtros por mesero y repartidor | La vista tabla se filtra por quién atendió o repartió cada pedido                                                                                                          | Básico      | En pruebas   |
| Estadísticas   | Por mesero y por repartidor     | Pedidos, importe y ticket medio por mesero (base para propinas); repartos y tiempo medio de entrega por repartidor                                                         | Premium     | En pruebas   |
| Reparto        | Foto de entrega                 | El repartidor hace una foto al entregar; el local decide si es opcional u obligatoria y la ve en el pedido                                                                 | Básico      | En pruebas   |
| Equipo         | Nombre y apodo                  | El panel muestra el nombre o apodo de cada persona y su rol, no su email                                                                                                   | Básico      | En pruebas   |
| Clientes       | Privacidad y borrado de datos   | Aceptación de la política de privacidad al pedir, promociones aparte, y borrar los datos de un cliente que lo pida                                                         | Básico      | En pruebas   |
| Acceso         | Recuperar contraseña            | Enlace por email para crear una contraseña nueva                                                                                                                           | Básico      | En pruebas   |
| Ayuda          | Guía y centro de ayuda          | Recorrido guiado en cada sección del panel y ayuda pública con capturas en /ayuda                                                                                          | Básico      | En pruebas   |
| WhatsApp       | Agente con IA                   | Toma pedidos por WhatsApp con la misma carta, zonas y precios                                                                                                              | Complemento | En pruebas   |
| Avisos         | Avisos por email                | Email al local con cada pedido nuevo, y, si quiere, al cliente cuando su pedido se acepta, está listo, va en camino o se cancela; se activa en Ajustes                     | Básico      | En pruebas   |
| Avisos         | Avisos por WhatsApp o SMS       | Mensaje al cliente cuando su pedido está listo o en camino                                                                                                                 | Complemento | Próximamente |
| Pedidos        | Pedidos programados             | El cliente elige la hora de recogida o entrega                                                                                                                             | Premium     | Próximamente |
| Carta online   | Carta en varios idiomas         | Carta en inglés, alemán… para turistas                                                                                                                                     | Premium     | Próximamente |
| Pedidos        | Pago online                     | El cliente paga con tarjeta al pedir                                                                                                                                       | Complemento | Próximamente |
| Alta           | Alta autoservicio con prueba    | El restaurante se da de alta solo en /alta y prueba gratis por días o por pedidos; Konnecttia la activa, la aprueba y la convierte en plan                                 | —           | En pruebas   |
| Equipo         | Actividad del equipo            | Ficha de cada repartidor y mesero: repartos o mesas, horas, fotos de entrega e importes; cada uno ve solo la suya                                                          | Premium     | En pruebas   |
| Equipo         | Personalizar roles              | El dueño parte de un rol de Konnecttia y ajusta sus permisos para su restaurante                                                                                           | Básico      | En pruebas   |
| Pedidos web    | Cancelar el pedido              | El cliente puede cancelar su pedido desde el seguimiento                                                                                                                   | Básico      | En pruebas   |
| Pedidos web    | Avisar de un problema           | El cliente avisa al local de una incidencia con su pedido y el local la ve en el panel                                                                                     | Básico      | En pruebas   |
| Pedidos web    | Teléfono con prefijo del país   | El cliente elige el prefijo con la bandera; por defecto, el país del restaurante; el pedido manual del panel parte del mismo país                                          | Básico      | En pruebas   |
| Ajustes        | Marca del local                 | Logo, color de marca, eslogan y redes sociales en la parte superior de la carta                                                                                            | Básico      | En pruebas   |
| Ajustes        | Enlaces y QR                    | Enlace de la carta y código QR para compartir; los accesos del panel se muestran según los permisos del rol                                                                | Básico      | En pruebas   |
| Ajustes        | Ayuda en cada pantalla          | Cada parámetro explica para qué sirve, cómo funciona y con un ejemplo, para configurar el restaurante sin ayuda; también en Equipo, Mesas, alérgenos de la carta y comanda | Básico      | En pruebas   |
| Panel          | Sonido por estado del pedido    | Un sonido distinto para pedido nuevo, aceptado, en preparación, listo, en camino, entregado y cancelado; se elige en Ajustes y suena igual en todo el equipo               | Básico      | En pruebas   |
| Panel          | App instalable y avisos push    | El panel se instala en el móvil como una app y avisa de cada pedido nuevo aunque el tablero esté cerrado (en iPhone, desde la pantalla de inicio)                          | Básico      | Próximamente |
| Alta           | Términos legales en el alta     | El alta exige aceptar los términos y el contrato de encargado de tratamiento, y guarda qué versión aceptó cada persona (textos en borrador, pendientes de revisión legal)  | —           | En pruebas   |
| Alta           | Cobro de la suscripción         | El restaurante paga su plan con tarjeta desde Ajustes → Plan y facturación (Stripe) y puede gestionar su suscripción desde el portal                                       | —           | Próximamente |

Para la demo, enseña solo lo que está **Disponible**. Lo de **Próximamente** se puede mencionar como hoja de ruta, sin prometer fechas. Lo que está **En pruebas** se puede enseñar avisando de que aún se está validando.

## Planes y complementos

Dos planes y complementos que se suman a cualquiera de los dos. Los precios van en la propuesta de cada cliente; esta tabla es lo que entra en cada uno (así está configurado en el sistema).

| Qué incluye                                                                         | Básico | Premium |
| ----------------------------------------------------------------------------------- | ------ | ------- |
| Carta online, pedidos web, tablero, comanda, pedido manual, ajustes, equipo y roles | Sí     | Sí      |
| Reparto propio con zonas y repartidores                                             | Sí     | Sí      |
| Clientes e historial                                                                | Sí     | Sí      |
| Avisos por email al local y al cliente (en pruebas)                                 | Sí     | Sí      |
| Varios locales                                                                      | —      | Sí      |
| Estadísticas                                                                        | —      | Sí      |
| Mesas, meseros y comanda en mesa                                                    | —      | Sí      |
| Pedidos programados (próximamente)                                                  | —      | Sí      |
| Carta en varios idiomas (próximamente)                                              | —      | Sí      |
| Novedades y reseñas (próximamente)                                                  | —      | Sí      |

**Complementos:** conexión de WhatsApp, agente de WhatsApp con IA (en pruebas), avisos por WhatsApp, avisos por SMS y cobro online (próximamente).

**Cómo elegir:** un solo local sin mesas → Básico. Dos o más locales, servicio en mesa o quiere ver estadísticas → Premium. Recibe muchos pedidos por WhatsApp → añadir el agente.

## La demo en 10 minutos

Lleva dos pantallas: el móvil hace de cliente y el portátil (o una tableta) de local. Usa siempre el restaurante de pruebas, nunca La Isla.

1. **Antes de empezar (1 min).** Pregunta cuántos pedidos reciben al día, por qué canal (teléfono, WhatsApp, plataformas) y si tienen reparto o mesas. Enseña solo lo que le sirve.
2. **El cliente pide (2 min).** Desde el móvil abre la carta del local: fotos, alérgenos, tamaños y extras. Haz un pedido a domicilio y enseña cómo calcula el envío y el pedido mínimo.
3. **Llega al local (2 min).** En el tablero suena el aviso. Acepta, imprime la comanda, márcalo listo. En el móvil del cliente el estado cambia solo.
4. **Un pedido por teléfono (1 min).** «Nuevo pedido», escribe el teléfono de un cliente que ya pidió y pulsa «Repetir». Es el momento «esto me ahorra tiempo».
5. **Reparto o mesas, según el negocio (2 min).** Reparto: asigna un repartidor y enseña «Mis repartos» en el móvil. Mesas: ocupa una mesa, toma el pedido con el mesero y enseña la cuenta y los tiempos.
6. **Cuando hay lío (30 s).** Activa el modo ocupado: los clientes nuevos ven más tiempo de espera y nadie se queja.
7. **Datos y control (1 min).** Clientes (quién repite y qué pide), vista tabla con filtros y, en Premium, estadísticas.
8. **Cierre (30 s).** «Todo esto con tu marca y sin comisión por pedido.» Deja el checklist de alta y acuerda la fecha para recoger los datos.

## Qué problema resuelve cada funcionalidad

| Funcionalidad      | Problema del restaurante                                  | Cómo explicarlo                                                           |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Carta online       | Cartas en PDF o fotos por WhatsApp que nadie actualiza    | «Cambias un precio o un agotado y lo ven todos al momento.»               |
| Pedido sin app     | El cliente no quiere descargar nada ni registrarse        | «Abre un enlace, elige y pide. Nada más.»                                 |
| Sin comisión       | Las plataformas se llevan un porcentaje de cada pedido    | «Pagas una cuota fija; cada pedido extra es todo margen.»                 |
| Tablero en directo | Pedidos perdidos entre teléfono, WhatsApp y papel         | «Todo entra en un solo sitio, con aviso, y nadie se olvida de uno.»       |
| Imprimir comanda   | Copiar el pedido a mano para cocina                       | «Sale el ticket solo, como en las plataformas.»                           |
| Zonas y mínimos    | Repartos que no compensan y discusiones por el envío      | «El sistema calcula el envío y no deja pedir por debajo del mínimo.»      |
| Modo ocupado       | Clientes enfadados porque el pedido tarda más de lo dicho | «En hora punta avisas de más espera con un botón.»                        |
| Repetir pedido     | Tomar por teléfono el mismo pedido de siempre             | «Escribes el teléfono y en dos toques está hecho.»                        |
| Clientes           | No saber quién repite ni qué pide                         | «Tus clientes son tuyos: los ves, los llamas y los exportas.»             |
| Cobros pendientes  | Entregar pedidos de transferencia sin cobrar              | «No se puede entregar hasta que confirmas el pago.»                       |
| Mesas y tiempos    | No saber qué mesa espera ni cuánto lleva                  | «Ves cada mesa, su cuenta y te avisa si alguien espera demasiado.»        |
| Meseros            | No saber quién atendió qué mesa (propinas, control)       | «Cada pedido lleva el nombre de quien lo tomó.»                           |
| Repartidores       | Repartidores llamando para preguntar direcciones y cobros | «Cada uno ve sus pedidos, la dirección en el mapa y cuánto cobrar.»       |
| Equipo y roles     | Todo el mundo con la misma contraseña y acceso a todo     | «Cada persona entra con su usuario y ve solo lo que le toca.»             |
| Varios locales     | Un panel por local, sin visión de conjunto                | «Todos tus locales en un panel, cada uno con su carta y horario.»         |
| Estadísticas       | Decidir a ojo                                             | «Ventas, ticket medio y hora punta, comparados con el mes anterior.»      |
| Agente de WhatsApp | Contestar WhatsApp mientras se cocina                     | «Responde y toma el pedido por ti, con tus precios y zonas.» (en pruebas) |

## Objeciones frecuentes

| Objeción                                       | Respuesta                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Ya estoy en Glovo / Uber Eats / Just Eat.»    | No hay que dejarlas. EasyOrder es para los clientes que ya te conocen: que pidan directo y sin comisión. Pon el enlace en tu Instagram, Google y en las bolsas.                                                                                                                                                                              |
| «Mis clientes piden por WhatsApp.»             | Perfecto: mándales el enlace de la carta por WhatsApp y el pedido llega ordenado al tablero. Con el agente, el propio WhatsApp toma el pedido (en pruebas).                                                                                                                                                                                  |
| «No sé de tecnología.»                         | Nosotros cargamos la carta y lo dejamos listo. El día a día es aceptar, preparar y marcar listo, con botones grandes. Además, cada pantalla tiene una guía paso a paso y hay un centro de ayuda con capturas.                                                                                                                                |
| «No tengo impresora de tickets.»               | Funciona sin ella, en el móvil o la tableta. Si quieres ticket, vale cualquier impresora térmica de 58 u 80 mm o una normal.                                                                                                                                                                                                                 |
| «Es caro.»                                     | Compara con la comisión: si pagas un porcentaje por pedido, con pocos pedidos al mes la cuota ya sale a cuenta. Haz la cuenta con sus números.                                                                                                                                                                                               |
| «¿Y si se cae internet?»                       | El tablero se reconecta solo y no pierde pedidos: quedan guardados y aparecen al volver.                                                                                                                                                                                                                                                     |
| «No quiero que mis empleados vean las ventas.» | Cada persona tiene su rol: el personal ve el tablero, no las estadísticas ni los ajustes.                                                                                                                                                                                                                                                    |
| «Tengo dos locales con cartas distintas.»      | Plan Premium: cada local con su horario, sus agotados, sus zonas y su equipo, en un solo panel.                                                                                                                                                                                                                                              |
| «¿Puedo cobrar online?»                        | Hoy: efectivo, tarjeta al entregar, Bizum y transferencia. Con Bizum o transferencia, el cliente sube el justificante y lo ves en el pedido. El pago online está en la hoja de ruta.                                                                                                                                                         |
| «¿Los datos son míos?»                         | Sí: los clientes y su historial son del restaurante y se pueden exportar cuando quieras. Si un cliente pide que borres sus datos, se hace desde su ficha.                                                                                                                                                                                    |
| «¿Y si me hacen pedidos falsos?»               | Puedes limitar cuántos pedidos hace un mismo teléfono, la web lleva un captcha invisible y puedes bloquear un teléfono desde la ficha del cliente. El cliente bloqueado no ve el motivo. Próximamente, en pedidos de riesgo se pedirá además un código por WhatsApp (el importe desde el que se pide, 30 € por defecto, lo ajusta el local). |

## Después de la visita

Para dar de alta un restaurante hacen falta sus datos básicos, la carta completa con precios y alérgenos, el horario, cómo cobra y, si reparte, sus zonas. Todo está en el **Checklist de alta del restaurante**, para dejar al cliente o rellenar con él.

1. Deja el checklist y acuerda la fecha de entrega de los datos (lo ideal, en 3 a 5 días).
2. Recibe la carta y el logo; nosotros cargamos la carta, el horario y las zonas.
3. Invita al propietario al panel y haz con él un pedido de prueba de principio a fin.
4. Formación de 20 minutos al equipo: tablero, comanda, pedido manual y, si aplica, mesas o repartos.
5. Publicación: enlace de la carta en Instagram, Google Maps, WhatsApp Business y un QR en el local.
6. Seguimiento a la semana: dudas, ajustes de tiempos y zonas.
7. Comparte con el equipo del restaurante el centro de ayuda (la dirección del panel seguida de /ayuda): cada sección explica con capturas cómo se usa.
