# ADR 0012 — Agente de WhatsApp multirestaurante: Kapso como canal, n8n como cerebro, sin Chatwoot

- Estado: aceptada (2026-11-11). El promotor eligió Kapso como único canal de WhatsApp.
- Sustituye en parte: ADR 0005 (se confirma Kapso; Chatwoot deja de formar parte del agente) y
  ADR 0008 («un n8n y un Chatwoot para todos» pasa a «un n8n y Kapso para todos»).
- Relacionado: ADR 0004 (precio en el servidor), ADR 0010 (UE; staging en `*.staging.konnecttia.com`).

## Contexto

El agente de pedidos por WhatsApp nació para un solo restaurante (La Isla), con Chatwoot como
entrada y salida de mensajes y varios `restaurante_id` fijos en los flujos. Konnecttia lo ofrecerá
a muchos restaurantes, cada uno con su propio número de WhatsApp, y el staging de la UE aún no
tiene n8n, Redis ni Chatwoot: es el momento de fijar la arquitectura antes de desplegar.

Requisitos del promotor (11/11):

- un solo n8n y un solo juego de flujos para todos los restaurantes, sin copias por cliente;
- un solo servicio de mensajería para todos;
- cada restaurante con su número;
- el agente habla en nombre del restaurante: «Soy el agente de pedidos de <restaurante>»;
- todo configurable desde Ajustes del restaurante o desde `/interno`, fácil de dar de alta;
- mantenimiento sostenible con muchos clientes;
- conversación natural, clara y coherente con los pedidos de la carta web.

## Decisión

1. **Canal: Kapso, sin Chatwoot.** Kapso conecta el número de cada restaurante (en coexistencia con
   la app WhatsApp Business o como número nuevo), entrega los mensajes a n8n y envía las
   respuestas. La atención humana la hace el personal desde su propia app de WhatsApp Business
   (coexistencia); el agente se pausa en esa conversación cuando el restaurante escribe a mano y
   se reanuda pasado un tiempo configurable. El soporte de Konnecttia usa la bandeja de Kapso.
   Más adelante, una vista de conversaciones en el panel.
2. **Un n8n, un juego de flujos.** El restaurante se identifica por el número que recibe el
   mensaje: tabla nueva `canal_whatsapp` (restaurante, proveedor, id del número en Meta, número
   E.164, estado), en una migración propia. Si el número no está asociado a ningún restaurante
   activo, no se responde. Ningún `restaurante_id` fijo en los flujos.
3. **El agente es del restaurante.** Se presenta como el agente de pedidos del restaurante (nombre
   de `restaurante.nombre`). Nombre visible, saludo, tono, mensajes (cerrado, derivar, despedida),
   cuándo pasar a una persona y tiempo de pausa viven en `restaurante_config` (claves `agente_*`,
   documentadas en `config_clave`) y se editan en **Panel → Ajustes → Agente de WhatsApp**. En
   **`/interno`**: activar el módulo, conectar el número, modelo y límites de uso, plantillas de Meta.
   Horario, carta, zonas, mínimos, formas de pago y tiempos salen de los datos que ya usa la web.
4. **Adaptador de canal.** Un único punto normaliza la entrada (restaurante, teléfono, texto, tipo,
   multimedia, ubicación, id del mensaje) y un único subflujo «Enviar mensaje» envía texto, botones,
   listas y plantillas. El resto de flujos no conoce el proveedor: cambiarlo toca dos piezas.
5. **Reglas en la API, conversación en n8n.** n8n lleva el modelo de lenguaje, la memoria y el
   enrutado; carta, carrito, cotización, crear, confirmar y cancelar pedido, pago y estado son
   endpoints de la API para el agente, autenticados y con `restaurante_id` resuelto en el
   servidor. Misma lógica, precios (ADR 0004), mínimos y estados que la web, con sus pruebas en CI.
   Despacho ya funciona así (`/cotizacion`); el resto migra por partes.
6. **Conversación.** Preguntar solo lo que falta; botones y listas de WhatsApp para elegir local,
   recogida o reparto y forma de pago; resumen final igual que el de la web, con código y enlace de
   seguimiento; ofrecer el enlace de la carta a quien prefiera pedir desde la web. Las reglas de
   negocio del agente (Apertura → Despacho → Pago, etc.) no cambian.
7. **Despliegue y mantenimiento.** Flujos en git sin URLs (marcadores); publicación por script
   contra la API de n8n; un juego de conversaciones de regresión (recogida, reparto, mínimo, fuera
   de zona, pago, reclamo) se lanza contra staging antes de pasar a producción.
8. **Números.** Staging usa el número de pruebas de EE. UU. Un número solo puede estar conectado a
   un proveedor de la API a la vez y el webhook de Meta se configura por app: el número de La Isla
   no se mueve hasta la ventana planificada de la fase 4 (moverlo corta su WhatsApp actual), y los
   números se conectan a Kapso con su alta propia o con una app de Meta de Konnecttia, nunca
   repuntando el webhook de la app que usa la demo.

## Consecuencias

- Hay que rehacer los nodos ligados a Chatwoot: entrada del Director, envío de mensajes,
  Notificación Estado Pedido, Derivar Humano y Cron Expirar Pedidos (a través del adaptador).
- Dependencia de Kapso: antes de producción, confirmar dónde trata los datos y firmar el contrato
  de encargado del tratamiento. Plan gratuito: 2.000 mensajes al mes (entrantes y salientes) y un
  número; planes de pago por volumen y número (precios a noviembre de 2026).
- Sin Chatwoot no hay que desplegarlo ni mantenerlo en la UE (menos memoria y menos piezas).
- Migraciones nuevas (`canal_whatsapp`, claves `agente_*`): cada una en su PR y primero en staging.

## A validar con el número de pruebas

Coexistencia y uso de la app en el mostrador; eventos de mensajes escritos por el restaurante
(para pausar el agente); botones y listas; tarifas reales; región de datos de Kapso.
