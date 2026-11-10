import type { HelpItem } from "@/components/HelpNote";

/**
 * Ayuda contextual de Ajustes: para qué sirve cada parámetro, cómo funciona y un ejemplo, para que
 * quien configura el restaurante lo entienda sin ayuda. Solo describe comportamiento comprobado en
 * la API y la carta; si cambia una regla, se cambia aquí.
 */
export const SETTINGS_HELP = {
  sonidos: [
    {
      campo: "Sonido de cada evento",
      para: "Que el tablero avise con un sonido distinto cuando llega un pedido nuevo o cambia de estado, para enterarte sin mirar la pantalla.",
      como: "Eliges un sonido por evento (o «Sin sonido»). Se guarda en el restaurante: todos los dispositivos que tengan el tablero abierto suenan igual. Con «Probar» lo oyes al momento.",
      ejemplo:
        "Pedido nuevo: campana; Listo: arpegio, para que quien reparte lo oiga; Cancelado: alerta.",
      cuidado:
        "Cada persona tiene que pulsar «Activar sonido» en el tablero (el navegador no deja sonar sin un toque). Los cambios que haces tú mismo no suenan. Si llegan varios eventos a la vez, suena uno solo: el pedido nuevo manda.",
    },
  ],
  apertura: [
    {
      campo: "Estado: Según horario / Abierto ahora / Cerrado ahora",
      para: "Abrir o cerrar el restaurante al momento sin tocar el horario semanal.",
      como: "«Según horario» usa los turnos y festivos. «Cerrado ahora» hace que la web y el agente no acepten pedidos; «Abierto ahora» los acepta aunque el horario diga cerrado.",
      ejemplo:
        "Se acaba la masa a las 22:30: pon «Cerrado ahora» y, al día siguiente, vuelve a «Según horario».",
      cuidado:
        "Las opciones manuales no se quitan solas: acuérdate de volver a «Según horario» o seguirás cerrado (o abierto) fuera de hora.",
    },
  ],
  datos: [
    {
      campo: "Nombre, teléfono, dirección, descripción",
      para: "Es lo que el cliente ve en la cabecera de tu carta online.",
      como: "Se guardan al instante y se muestran en la carta y en el seguimiento del pedido. Teléfono, dirección y descripción son opcionales.",
      ejemplo: "Descripción: «Pizzas al horno de leña desde 2009. Pedidos hasta las 23:00».",
    },
    {
      campo: "Eslogan",
      para: "Una frase corta que da personalidad a la carta.",
      como: "Aparece bajo el nombre en la parte superior de la carta online.",
      ejemplo: "«Sabor colombiano en Arrecife».",
    },
    {
      campo: "País",
      para: "Decide el prefijo telefónico que se propone a tus clientes al pedir.",
      como: "El cliente ve ese país por defecto y puede cambiarlo si su móvil es de otro. No cambia la zona horaria.",
      ejemplo:
        "Restaurante en España: los clientes verán +34 y escribirán «612 345 678» sin prefijo.",
    },
  ],
  privacidad: [
    {
      campo: "URL de tu política de privacidad",
      para: "Cumplir con la información legal que el cliente acepta al pedir por la web.",
      como: "Si la dejas vacía, la carta enlaza a una página plantilla (/privacidad). Si pones tu URL, enlaza a la tuya.",
      ejemplo: "https://mirestaurante.es/privacidad",
    },
    {
      campo: "Versión de la política",
      para: "Dejar constancia de qué texto aceptó cada cliente.",
      como: "Los pedidos nuevos guardan la versión que pongas aquí. Cámbiala cuando modifiques el texto de la política.",
      ejemplo: "«2026-11» para la política de noviembre de 2026.",
    },
  ],
  sospechosos: [
    {
      campo: "Pedidos abiertos a la vez",
      para: "Frenar pedidos falsos o repetidos de un mismo teléfono.",
      como: "Cuenta los pedidos de ese teléfono que siguen sin cerrar (ni entregados, ni cancelados, ni caducados). Al llegar al máximo, el siguiente se rechaza. Vacío: sin límite.",
      ejemplo:
        "Con 2, un teléfono no puede tener un tercer pedido abierto hasta que se cierre uno.",
    },
    {
      campo: "Pedidos por hora",
      para: "Evitar ráfagas de pedidos desde un mismo teléfono.",
      como: "Cuenta los pedidos de ese teléfono en la última hora, incluidos los cancelados. Vacío: sin límite.",
      ejemplo: "Con 3, un cuarto pedido en la misma hora se rechaza.",
      cuidado:
        "Un límite muy bajo puede bloquear a un cliente real que se equivocó y repite el pedido.",
    },
  ],
  servicios: [
    {
      campo: "Recogida en el local / Reparto a domicilio",
      para: "Elegir cómo pueden recibir el pedido tus clientes.",
      como: "Solo se ofrece en la carta lo que tengas activado. El reparto además necesita al menos una zona configurada (pestaña Reparto).",
      ejemplo: "Un local solo de recogida: desactiva el reparto y el cliente solo verá «Recoger».",
    },
  ],
  pagos: [
    {
      campo: "Efectivo, tarjeta, Bizum, transferencia",
      para: "Los métodos de cobro entre los que elige el cliente al pedir.",
      como: "Solo aparecen los que activas y los que tu plan permite. Con Bizum o transferencia el pedido queda pendiente de cobro hasta que confirmes el pago, y el cliente puede subir el justificante.",
      ejemplo:
        "Un cliente elige transferencia: ve tu IBAN y el concepto, paga y sube la captura; tú la ves en el pedido y confirmas el cobro.",
      cuidado: "No se entrega un pedido pendiente de cobro hasta confirmarlo.",
    },
    {
      campo: "Titular, IBAN, banco, concepto, teléfono de Bizum",
      para: "Los datos que ve el cliente para pagar por transferencia o Bizum.",
      como: "Se muestran tal cual en la pantalla de confirmación. El concepto ayuda a identificar el pedido en tu banco.",
      ejemplo: "Concepto: «Tu nombre y el código del pedido», para casar cada pago con su pedido.",
      cuidado: "Revisa el IBAN dos veces: un error lo verán todos los clientes.",
    },
  ],
  tiempos: [
    {
      campo: "Recogida (min) y Reparto mínimo / máximo (min)",
      para: "El tiempo que anuncias al cliente antes de pedir.",
      como: "Es la base. Las zonas de reparto pueden tener la suya, y las horas punta y el modo ocupado la amplían. Sin tiempo, el cliente ve «a confirmar».",
      ejemplo:
        "Reparto 25–35: el cliente ve «25-35 min»; con +15 de modo ocupado verá «40-50 min».",
    },
  ],
  ocupado: [
    {
      campo: "Opciones (minutos) y Duración",
      para: "Avisar de más espera durante un pico imprevisto sin dejar de vender.",
      como: "Define los botones (+10, +20…) del tablero de pedidos y cuánto dura el aviso. Suma minutos al tiempo de los clientes nuevos y se quita solo al acabar la duración.",
      ejemplo:
        "Opciones «10, 20, 30» y duración 60: en un pico pulsas +20 y durante una hora se anuncian 20 min más.",
      cuidado: "No cierra el local ni cambia los pedidos ya hechos.",
    },
  ],
  suplementos: [
    {
      campo: "Concepto, «Si el pedido no llega a», Suplemento",
      para: "Cobrar un cargo automático a los pedidos pequeños (envases, por ejemplo).",
      como: "Si el total del pedido queda por debajo del importe indicado, se suma el suplemento al total.",
      ejemplo: "Envases · si no llega a 25 € · +1 €: un pedido de 18 € paga 19 €.",
    },
  ],
  avisos: [
    {
      campo: "Avisar al local de cada pedido nuevo",
      para: "Enterarte de un pedido aunque no tengas el tablero abierto.",
      como: "Cada pedido nuevo envía un email a las direcciones que pongas (hasta 10). No avisa de pedidos hechos por el propio local (teléfono, mostrador, mesa).",
      ejemplo: "pedidos@mirestaurante.es y el email de cocina.",
      cuidado: "Requiere que tu plan incluya los avisos por email; si no, no se envía nada.",
    },
    {
      campo: "Avisar al cliente por email",
      para: "Que el cliente sepa en qué punto está su pedido sin llamar al local.",
      como: "Se envía al email que dejó en el checkout, solo en los estados que marques (aceptado, listo, en camino, cancelado). Si el pedido no tiene email, no se envía.",
      ejemplo: "Marca «listo» y «en camino»: el cliente recibe un email cuando sale su pedido.",
    },
  ],
  horario: [
    {
      campo: "Turnos por día",
      para: "Definir cuándo se aceptan pedidos.",
      como: "Fuera de turno el restaurante figura cerrado: ni la web ni WhatsApp aceptan pedidos. Un día puede tener dos turnos y un cierre menor que la apertura cruza la medianoche.",
      ejemplo: "Comida 12:00–16:00 y cena 20:00–00:00 (el segundo turno acaba tras la medianoche).",
    },
  ],
  festivos: [
    {
      campo: "Festivo",
      para: "Cambiar el horario en un día señalado sin tocar la semana.",
      como: "Un festivo usa el horario del domingo, salvo que lo marques como cerrado todo el día.",
      ejemplo: "25 de diciembre marcado «cerrado»: ese día no se aceptan pedidos.",
    },
  ],
  zonas: [
    {
      campo: "Tipo de cobertura: radio, código postal o toda la ciudad",
      para: "Decidir a qué direcciones llegas.",
      como: "Con radio se mide desde un punto del mapa; con código postal, por el de la dirección; «toda la ciudad» cubre cualquier dirección y sirve de tarifa única. Si una dirección entra en varias zonas, gana la más concreta y «toda la ciudad» va la última.",
      ejemplo:
        "Zona A: radio 3 km, envío 2 €. Zona B: toda la ciudad, envío 4 €. Quien viva a 2 km paga 2 €; el resto, 4 €.",
    },
    {
      campo: "Tarifa fija o por km (y tope)",
      para: "Calcular el envío automáticamente.",
      como: "La fija cobra siempre lo mismo; la de por km multiplica la distancia por el precio y se limita al tope si lo pones.",
      ejemplo: "0,50 € por km con tope de 4 €: a 6 km serían 3 €; a 12 km se cobra 4 €.",
    },
    {
      campo: "Pedido mínimo",
      para: "No repartir pedidos que no compensan.",
      como: "Si el pedido no llega, se mantiene el reparto pero se pide añadir productos o cambiar a recogida; no se confirma hasta cumplirlo.",
      ejemplo: "Mínimo 12 €: con 9 € se le sugiere añadir algo o recoger en el local.",
    },
    {
      campo: "Envío gratis desde",
      para: "Incentivar pedidos más grandes.",
      como: "Desde ese importe el envío es 0 €. Vacío: nunca es gratis.",
      ejemplo: "Gratis desde 25 €.",
    },
    {
      campo: "Tiempo mínimo / máximo",
      para: "Anunciar una espera realista según la zona.",
      como: "Si lo dejas vacío, se usa el tiempo de reparto general del restaurante.",
      ejemplo: "Zona lejana: 40–55 min.",
    },
  ],
  horasPunta: [
    {
      campo: "Día, desde, hasta, servicio, minutos extra",
      para: "Anunciar más espera en las franjas de más trabajo, de forma automática y recurrente.",
      como: "En esa franja se suman los minutos al tiempo estimado (recogida, reparto o ambos). Fuera de ella no cambia nada. Para un pico imprevisto usa el modo ocupado.",
      ejemplo: "Viernes 20:00–22:00 · reparto · +15 min.",
    },
  ],
  fotoEntrega: [
    {
      campo: "Foto de entrega: no, opcional u obligatoria",
      para: "Tener prueba de que el pedido se entregó, útil ante una reclamación.",
      como: "El repartidor hace la foto con el móvil al entregar. Si es obligatoria, no puede marcar «entregado» sin ella. La ve el local en el pedido; el cliente no la recibe.",
      ejemplo: "Un cliente dice que no le llegó: abres el pedido y ves la foto en la puerta.",
    },
  ],
  logo: [
    {
      campo: "Logo",
      para: "Dar identidad a tu carta online.",
      como: "Se muestra en la cabecera de la carta. PNG, JPG o WebP de hasta 2 MB; funciona mejor cuadrado o con fondo transparente.",
      cuidado: "Sin logo se muestra el nombre en texto.",
    },
  ],
  color: [
    {
      campo: "Color de la carta",
      para: "Que la carta se vea con tu marca.",
      como: "Se usa en botones, bordes y selección de la carta y del seguimiento. El panel mantiene los colores de Konnecttia.",
      ejemplo: "El rojo de tu rótulo.",
      cuidado: "Elige un color con buen contraste con el blanco para que los botones se lean.",
    },
  ],
  redes: [
    {
      campo: "Instagram, Facebook, web, WhatsApp…",
      para: "Llevar a tus clientes a tus otros canales.",
      como: "Salen como enlaces en la parte superior de la carta. Pega la dirección completa; en WhatsApp basta el teléfono.",
    },
  ],
  enlaces: [
    {
      campo: "Enlace y código QR",
      para: "Compartir tu carta donde están tus clientes.",
      como: "Cada enlace abre tu carta (o una vista concreta). El QR lleva al mismo enlace y se puede descargar para imprimirlo.",
      ejemplo: "QR en las mesas, en las bolsas de reparto y en tu Instagram.",
    },
  ],
} as const satisfies Record<string, readonly HelpItem[]>;
