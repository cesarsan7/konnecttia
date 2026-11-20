# Contexto del proyecto para sesiones de Claude

> Archivo creado el 17/11/2026: el encargo lo citaba, pero **no existía** en `konnecttia` ni en `easyorder`
> (ni en `main` ni en ramas). Contiene solo la sección del agente de WhatsApp; las demás sesiones (EasyOrder,
> comercial) añaden la suya. Fuente de verdad del producto: `AGENTS.md` y `docs/`.

## Sesión: Agente de WhatsApp

### Estado a 17/11/2026

- `main` llega al PR #160 (carta de solo lectura y `carta_url` del agente). Migraciones en el repositorio: hasta la 0049.
- n8n de staging (`n8n.staging.konnecttia.com`): 17 flujos, todos activos salvo `[MVP] Pizzeria` (legado de Chatwoot).
  Agente vigente: `[Canal] Entrada Kapso` → `[Agente] Director` (herramientas sobre `/agente/canales/:canalId/…`)
  → `[Canal] Enviar mensaje`; `[Agente] Mantenimiento` cada 2 min (caducidad de carritos).
- Kapso: un solo número, el **sandbox** `597907523413541`, con un webhook a `…/webhook/kapso-entrada`.
  Solo escribe el teléfono de pruebas registrado. Buffer de mensajes de Kapso **desactivado** (el diseño lo da por activo).
- `canal_whatsapp`: `id = 1` → Siempre Juntos (`restaurante_id = 1`). Probado de punta a punta (pedido `261117-1001`).
- Arepa's Factory (`restaurante_id = 2`; módulos y claves del agente ya cargados el 17/11): carta (13 categorías, 76 productos), 1 local (id 3), 1 zona (radio 5 km, 2 € fijo,
  mínimo 30 €), efectivo y tarjeta. **Le falta** el canal (sigue en Siempre Juntos) y `agente_pausa_minutos`; borrar `is_open_override`.

### Decisión del promotor (17/11)

Opción A: pasar el sandbox de Siempre Juntos a Arepa's Factory, de forma reversible. Se hace **creando un canal nuevo**
y apartando el viejo (`phone_number_id || '#r1'`, `desconectado`), no con `UPDATE restaurante_id`: `whatsapp_conversacion`
y `agente_carrito` tienen FK `(canal_id, restaurante_id)` sin `ON UPDATE CASCADE`. Guion, SQL de ida y vuelta, checklist
y batería de pruebas: [`integrations/n8n/pruebas/arepas-factory-whatsapp.md`](../integrations/n8n/pruebas/arepas-factory-whatsapp.md).
Revisión de ejecuciones (solo lectura): `integrations/n8n/scripts/revisar_ejecuciones.py`.

### Hallazgos abiertos

1. **Transferencia ⇒ `pendiente_pago`**: resuelto en código (PR pendiente): el cancelado automático de pagos pendientes ahora actúa
   sobre `recibido` + `estado_pago = 'pendiente'`, que es como nacen los pedidos (web y agente). Prueba nueva en
   `agente-mantenimiento.test.ts`; suite de la API 629/629.
2. Arepa's tiene `is_open_override = 'true'` (confirmado): abierto 24 h. Borrar la fila para que mande el horario.
3. «[Canal] Entrada Kapso» lee `agente_activo` y `agente_pausa_minutos` directamente de `restaurante_config` (sin plantilla),
   y la rama «agente no activo» termina en silencio: un restaurante sin la fila propia no responde y no avisa.
4. Buffer de Kapso apagado.

### Pruebas con Arepa's (17/11, canal 2, teléfono de pruebas)

Pedido a domicilio `261117-1002` creado bien (restaurante 2, canal 2, 36,50 €, efectivo). Dos fallos del promotor, ambos con causa:

1. **Sin enlace de seguimiento.** El enlace lo añade el nodo «Respuesta» del Director, pero leía la observación de la herramienta como
   objeto y n8n la entrega como texto JSON de un **array** (`[{"ok":true,…}]`): `ok` nunca era `true`. Lo mismo hacía que los
   botones de `ofrecer_opciones` (despacho, pago, dirección) **no se enviaran nunca** y todo saliera como texto. Corregido
   desenvolviendo el array.
2. **No preguntó cómo dar la dirección.** El modelo pidió la dirección en texto en vez de llamar a `ofrecer_opciones(direccion)`; además el Director
   publicado en n8n (03:41 UTC) es anterior al #159 (reglas de «pasos deterministas»), que ya lo endurecía. Ahora, si `elegir_despacho`
   responde `direccion_necesaria`, la API devuelve `pregunta` y `opciones` (botones) y el sistema los envía sin depender del modelo.

Para verlo en staging hay que publicar el Director (`publicar.py "[Agente] Director"`) y desplegar la API.

### Pruebas con Arepa's, segunda ronda (17/11, +34660202323)

Revisadas las ejecuciones #1703–#1838. Causas y arreglos (rama del PR de seguimiento):

- **«No hay productos en el carrito» tras un resumen correcto:** el modelo dijo «Voy a añadir 2 Arepas de lomo…» sin llamar a `cambiar_carrito`
  (turnos #1720, #1741, #1838); el carrito nunca las tuvo y el resumen («resumo tu pedido…») salió de memoria. La defensa de «Respuesta» solo
  miraba el pasado («he añadido»): ahora también el futuro («voy a añadir», «te lo añado», «añadiré»). Reglas nuevas: no anunciar acciones,
  herramientas de una en una. Además, en #1766 `cambiar_carrito(nuevo:true)` y `elegir_despacho` corrieron a la vez y el despacho se guardó en el
  carrito 17, ya cerrado (el 18 quedó sin despacho → `falta_despacho`). Se pidió una herramienta por paso; si reaparece, hará falta bloquearlo en el flujo.
  Impacto real: el pedido `261117-1007` salió con 2 de las 4 líneas que pidió el cliente.
- **«Variedades de papas»:** el modelo no llamó a ninguna herramienta y escribió una lista vacía. Regla nueva (variedades, tipos, clases, opciones, sabores,
  «qué hay de X» ⇒ `buscar_en_carta`) y esas palabras ya no puntúan en la búsqueda (`SEARCH_STOPWORDS`).
- **Listas parciales:** `buscar_en_carta` devuelve máx. 8 productos y el agente decía «estas son las arepas» (8 de 22; desayunos 6 de 7). La respuesta trae
  `hay_mas` y el agente debe decir que son algunas y compartir la carta.
- **Ingredientes vs alérgenos:** la regla 16 mezclaba ambos. Ahora los ingredientes se responden con la `descripcion` de la carta y solo alérgenos/intolerancias/dietas
  con la nota. Decisión de producto a confirmar por el promotor.
- **Pregunta de despacho:** tras añadir productos invita a añadir algo más antes de preguntar recogida o domicilio (texto de `siguiente_paso`).
- **Enlaces como botón** (decisión del promotor): WhatsApp no admite hipervínculos en texto normal. «Respuesta» quita la URL del texto y manda `tipo: 'enlace'`
  con botón «Seguir mi pedido» (seguimiento) o «Ver la carta» (si el texto lleva `carta_url`); «[Canal] Enviar mensaje» lo envía como mensaje interactivo
  `cta_url` de la Cloud API y, si Kapso lo rechaza, lo reenvía como texto con el enlace a la vista («¿Falló el enlace?»). **Sin probar con Kapso**: el formato sigue
  la especificación de Meta (no pude consultar docs.kapso.ai desde la sesión) y hace falta que el cliente de pruebas escriba primero (ventana de 24 h).
  Publicar `[Canal] Enviar mensaje` y `[Agente] Director`.

### Tercera ronda (18/11, +15162849708, ejecuciones #2854–#2946)

- **Enlace largo y sin botón «Ver la carta»:** el Director y «Enviar mensaje» publicados en n8n **no eran los del repositorio** (sin la corrección del array de
  #162, sin la defensa de #159 ni el `cta_url` de #163): `publicar.py` sube lo que tiene el clon local y el clon estaba sin `git pull`. La API sí estaba al día
  (`hay_mas` y `pregunta/opciones` aparecen en las observaciones). Nuevo `scripts/comprobar_publicado.py` compara el código publicado con el del repositorio.
- **4 alitas perdidas (#2861–#2873):** el agente preguntó «¿4 alitas o la ración completa?» y, al pasar el cliente a los chorizos, dio la pregunta por cerrada. Regla
  nueva: lo pendiente se recuerda en el mismo mensaje; y el contexto de cada turno trae el **carrito real** («CARRITO AHORA») para no depender de la memoria.
- **Despacho «no indicado» (#2879–#2902):** `elegir_despacho(delivery)` sin dirección no guarda nada (devuelve `direccion_necesaria`); luego el modelo pidió confirmar un código
  postal que ya venía en la dirección y, ante el «sí», dijo «uso la dirección…» **sin llamar a `elegir_despacho`**. El resumen de pago salió «a domicilio en C. la Rosa»
  con el despacho vacío. Arreglos: CARRITO AHORA muestra «Despacho: SIN ELEGIR»; regla de llamar a la herramienta en cuanto escribe la dirección y de no confirmar el código
  postal ya escrito; la defensa de «Respuesta» cubre ahora «uso la dirección / dirección guardada» sin haber llamado a `elegir_despacho`.

### Cuarta ronda (18/11 20:56 local = 19/11 01:56Z, +15162849708, ejecuciones #3443–#3552)

Con los flujos al día (`comprobar_publicado.py` sin diferencias) funcionó: carrito con todos los productos, dirección guardada con `elegir_despacho`, mínimo de reparto,
botones de dirección y de pago, derivación al pedir modificar un pedido ya confirmado (`escalacion_id` 4, pausa 120 min), y los **botones de enlace llegaron como
`cta_url` real en Kapso** (estado «read», sin usar el reintento a texto; `[Canal] Enviar mensaje` #3451 y #3548).
Detalles corregidos: texto suelto al quitar la URL («…aquí:»), el agente decía «no puedo añadir, no has iniciado un pedido» ante un «sí» sin carrito,
«ingredientes» junto a un saludo se respondía con la nota de alérgenos, y al elegir tarjeta volvía a mostrar los botones de pago en vez de pedir confirmar
(nuevo `ofrecer_opciones` tipo `confirmar`: «Sí, confirmar» / «Cambiar algo»).
A vigilar: la memoria del chat se conserva por `restaurante:telefono`, así que el agente puede contestar variedades desde conversaciones antiguas (#3472) en vez de la carta actual.

### Quinta ronda (18/11 21:32 local = 19/11 02:32Z, ejecuciones #3578–#3645) y prueba de caducidad

Con el Director publicado (comprobar_publicado.py sin diferencias) salió bien: botones «Sí, confirmar» / «Cambiar algo» antes de confirmar, botón «Seguir mi pedido» y texto limpio.
**Caducidad probada** sin querer: la ensalada del carrito 23 (último cambio 02:33:10) caducó a las 03:04:40 (mantenimiento cada 2 min, límite 30 min) y el cliente volvió a las 03:08
con un «sí» que añadió cachapas a un carrito nuevo (24): **la ensalada se perdió en silencio**, sin que el agente lo dijera. Además **no hubo aviso a los 25 min** (`avisos: []`): el aviso y
`cart_warning_minutes` son del módulo premium `whatsapp.agent_pro` (ADR 0013) y Arepa's solo tiene `whatsapp.agent`; las reglas de negocio de AGENTS.md lo dan como regla general: decisión
del promotor (dar `whatsapp.agent_pro` a Arepa's para repetir la prueba, o aceptar que el aviso es premium).
Arreglo: `/contexto` devuelve `carrito_caducado` (último carrito caducado del número, si no hay otro posterior y tiene menos de 24 h) y el Director añade «ATENCIÓN: el carrito anterior CADUCÓ… díselo
al cliente y pregunta si quiere recuperarlo». Pendiente de ver: el modelo sigue usando `nuevo:true` al primer producto (inocuo sin carrito, pero descartaría uno abierto si se equivoca).

### Sexta ronda (19/11, 04:00Z y 10:14Z, ejecuciones #3686–#3980): aviso de caducidad que no llegó

Con #166 publicado, `/contexto` sí devolvió `carrito_caducado = Ensalada Factory` desde el primer mensaje al volver (#3966, #3972, #3980), pero el **modelo ignoró** la instrucción del prompt y nunca lo dijo.
Arreglo determinista: el nodo «Respuesta» añade al mensaje «Por cierto, tu pedido anterior caducó por inactividad… (tenía: …)» y la API marca ese carrito como avisado
(`markExpiredCartNotified`: pasa a `descartado`) para no repetirlo. El prompt ya solo dice que no lo repita. Lección general: lo que el cliente debe saber sí o sí se escribe en el flujo, no se deja a la voluntad del modelo.

### Séptima ronda (19/11 07:47 local = 12:47Z, ejecuciones #4130–#4135): «Quiero recuperarlo» → «problema técnico»

El aviso de caducidad salió bien (#4130, «tenía: 3 × Cachapa campesina»), pero al decir «Quiero recuperarlo» (#4135) el agente respondió con la frase de error técnico sin llamar a ninguna herramienta.
Causa: la API marcaba el carrito como avisado pasándolo a `descartado`, así que en el turno siguiente `/contexto` ya no traía qué se había perdido («Sin carrito abierto»); además el aviso que
añade el sistema no queda en la memoria del chat. Sin datos, el modelo improvisó la frase de la regla 14. Arreglo: migración **0050** (`agente_carrito.caducidad_avisada_at`); el carrito sigue
`caducado` y `/contexto` lo devuelve hasta que el cliente empiece otro, con `aviso_pendiente` (true solo la primera vez, cuando el sistema añade el aviso) y `recuperar` (las líneas como operaciones de
`cambiar_carrito`). El prompt las trae siempre que haya carrito caducado y la regla 14 queda solo para `error_tecnico = true` devuelto por una herramienta. Nota: `cart_expiry_minutes` de Arepa's está en 5 (se ve en `caduca_en_minutos`).

### Octava ronda (19/11 09:44 y 10:24 local = 14:44Z y 15:24Z, ejecuciones #4211–#4280)

- **503 del contexto (#4211, #4216):** la migración 0050 no se había aplicado al desplegar la API (la consulta del contexto usa la columna nueva); el promotor aplicó el `ALTER` y el `INSERT` en `konnecttia_migrations` a mano y volvió a funcionar. Lección: tras desplegar una migración, comprobar `konnecttia_migrations` antes de probar.
- **«Quiero recuperarlo» → «problema técnico» otra vez (#4280):** con todo publicado y el prompt correcto (ATENCIÓN con las operaciones exactas), el modelo no llamó a ninguna herramienta y repitió la frase de error. Causa: la **memoria del chat** (`restaurante:telefono`,
  ventana de 20 mensajes con herramientas) conserva respuestas de pruebas anteriores («Si, recupéralo» → `derivar_a_persona` → «Ha ocurrido un problema técnico…») y el modelo las imita por encima del prompt.
  Arreglos: (1) rama determinista en el Director: si el cliente pide recuperar con palabras explícitas (recuperar, lo mismo, de nuevo, otra vez, vuelve a…) y hay carrito caducado sin carrito abierto, se llama a `cambiar_carrito` con `recuperar` sin pasar por el modelo («¿Pide recuperarlo?» → «Recuperar carrito» →
  «Respuesta recuperación»); (2) «Respuesta» sustituye «problema técnico» por un mensaje neutro si no hubo error real (ninguna herramienta devolvió `error_tecnico` ni se derivó); (3) ventana de memoria 20 → 12 (el carrito real ya va en cada turno).
  Para limpiar el historial de un teléfono de pruebas: borrar sus filas de la tabla de memoria del chat (clave `2:+15162849708`).

### Novena ronda (19/11 10:51 local = 15:51Z, ejecuciones #4305–#4378; Director = #168, **#169 aún sin fusionar**)

Con #168: «Quiero Recuperarlo» sí recuperó el carrito (#4335: el modelo usó las operaciones del prompt con el historial limpio). Al dejar caducar el siguiente carrito (5 min) y contestar «Efectivo» a los 9 min (#4361), el agente
presentó un resumen y botones «Sí, confirmar» **de memoria** (el contexto ya decía «sin carrito» y «caducó»), el sistema añadió después «tu pedido anterior caducó…» y «Sí, confirmar» terminó en `carrito_vacio` («tu pedido está vacío»): contradictorio.
Arreglo (en el PR #169): «Respuesta» sustituye cualquier resumen o petición de confirmación cuando no hay carrito abierto ni `cambiar_carrito` en el turno: «Tu pedido anterior caducó por inactividad y se vació (tenía: …). ¿Quieres recuperarlo?» con botones «Recuperar pedido» (lo atiende la rama determinista) y «Pedido nuevo»,
o «Ahora mismo no tienes ningún pedido abierto» si no había nada que recuperar.

### Estado final (20/11/2026)

El agente de WhatsApp funciona de punta a punta con Arepa's Factory en el sandbox de Kapso (canal 2) y el promotor confirmó que la recuperación del carrito caducado va bien. Flujos publicados = `main` (PR #161–#169 fusionados).
Informe completo de la batería, fallos y causas: sección 8 de [`integrations/n8n/pruebas/arepas-factory-whatsapp.md`](../integrations/n8n/pruebas/arepas-factory-whatsapp.md).

### Pendiente

Decisiones del promotor (20/11): `whatsapp.agent_pro` para Arepa's (SQL en la sección 9.1 del guion); `cart_expiry_minutes` ya en 30; datos de transferencia de prueba; el número de pruebas de La Isla pasa a Arepa's.
En marcha (sección 9 del guion): activar el buffer de Kapso (5 s), prueba de concurrencia con `scripts/prueba_concurrencia.py` (5 → 10 → 25 → 50 clientes), alta del número real en Kapso y `canal_whatsapp`, y probar la pausa cuando escribe el personal (T14, solo con coexistencia).
Concurrencia probada por el promotor (20/11): 5, 15 y 25 clientes y ráfaga de 10, sin errores ni cruces, Director p50 ≈ 2 s y p95 < 4 s (detalle y límites en 9.3 del guion; falta el buffer real de Kapso y el escalón de 50).
Para reutilizar el número +1 antiguo: borrar el VPS no lo desvincula, hay que quitar el webhook de la app de Meta «chatwoot» y la bandeja de Chatwoot, desactivar los cron del n8n antiguo, tener el PIN de dos pasos y hacer copia antes de borrar (9.4).
«[Canal] Entrada Kapso» acepta varios secretos de webhook en `KAPSO_WEBHOOK_SECRET` separados por comas (uno por número de Kapso).
Vigilar: `nuevo: true` del modelo y la memoria del chat (ventana 12).
