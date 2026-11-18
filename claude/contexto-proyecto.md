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

### Pendiente

- El promotor ejecuta la sección 3.1 del guion (la 4.1 ya está aplicada salvo `agente_pausa_minutos`) en DBeaver, activa el buffer de Kapso y lanza la batería T1–T14.
- Con los resultados: revisar cada ejecución con el script, comparar con la base y redactar el informe (sección 8 del guion).
- No he podido comprobar la base desde la sesión (sin acceso): las consultas 2.0–2.5 están pensadas para pegar el resultado.
