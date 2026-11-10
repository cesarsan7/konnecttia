import type { HelpItem } from "@/components/HelpNote";

/**
 * Ayuda contextual del panel interno de Konnecttia: para qué sirve cada parámetro, cómo funciona,
 * ejemplos y escenarios, para que quien configura se autogestione. Solo describe comportamiento
 * comprobado; si cambia una regla, se cambia aquí.
 */
export const INTERNO_HELP = {
  nuevo: [
    {
      campo: "Enlace de la carta (slug)",
      para: "Es la dirección pública del restaurante: konnecttia.com/<enlace>.",
      como: "Solo minúsculas, números y guiones; tiene un mínimo de letras, no puede repetirse y hay palabras reservadas. Una vez compartido (QR, Instagram), cambiarlo rompe los enlaces antiguos.",
      ejemplo: "«pizzeria-luna» → konnecttia.com/pizzeria-luna.",
      cuidado: "Confírmalo con el cliente antes de crear: es lo que imprimirá en sus QR.",
    },
    {
      campo: "Zona horaria",
      para: "Que el horario, «abierto/cerrado» y las estadísticas usen la hora real del local.",
      como: "El horario semanal se interpreta en esta zona, no en la del servidor.",
      ejemplo: "Canarias: Atlantic/Canary (una hora menos que la península).",
      cuidado: "Una zona equivocada hace que el local figure cerrado en su hora de servicio.",
    },
    {
      campo: "Plan",
      para: "Decide qué módulos tiene el restaurante.",
      como: "Básico: carta, pedidos, tablero, reparto propio, clientes y equipo. Premium añade estadísticas, varios locales, mesas y meseros. Se puede cambiar después en «Plan y módulos».",
      ejemplo: "Un local con servicio en mesa y varios locales → Premium.",
    },
    {
      campo: "Local principal: nombre, dirección, ubicación (latitud / longitud)",
      para: "El primer punto de venta del restaurante; de él parten el horario, la carta y el reparto.",
      como: "La ubicación se usa para el reparto por radio y por km. Sin ella, solo funcionan las zonas por código postal o «toda la ciudad».",
      ejemplo: "Pega las coordenadas de Google Maps (clic derecho → copiar coordenadas).",
    },
    {
      campo: "Minutos para recoger",
      para: "El tiempo base que verá el cliente en recogida.",
      como: "El propietario puede cambiarlo luego en Ajustes → Pedidos y pago.",
      ejemplo: "15–20 min para pizzas, 10 para bebidas y postres.",
    },
    {
      campo: "Métodos de cobro iniciales",
      para: "Empezar con los métodos que el restaurante acepta de verdad.",
      como: "El propietario los afina después; lo que permitas aquí es el máximo que podrá activar (ver «Métodos de pago permitidos»).",
    },
    {
      campo: "Antifraude: código de verificación",
      para: "Frenar pedidos falsos desde el alta.",
      como: "Con WhatsApp activo, el pedido web pide un código solo cuando hay riesgo. Cuesta un mensaje por código y exige la API de WhatsApp configurada.",
      cuidado:
        "Si la API no tiene WhatsApp configurado, aunque esté «activo» no se pide ningún código.",
    },
    {
      campo: "Persona propietaria",
      para: "Quién administra el restaurante desde su panel.",
      como: "Se genera una invitación por enlace o email. Hasta que la acepte, el restaurante existe pero nadie puede entrar.",
      ejemplo: "El dueño abre el enlace, crea su contraseña y ya ve su tablero.",
    },
    {
      campo: "Partir de otro restaurante",
      para: "Ahorrar el montaje cuando el nuevo se parece a uno existente (otra sucursal, otro cliente similar).",
      como: "Copia lo que marques: carta, horario, zonas de reparto y ajustes. Nunca copia nombre, enlace, teléfono, dirección, datos bancarios, logo, equipo, pedidos ni clientes.",
      ejemplo: "Una franquicia con la misma carta: clona y solo cambias nombre, enlace y local.",
    },
  ],
  plan: [
    {
      campo: "Plan",
      para: "Qué puede usar el restaurante: Básico o Premium.",
      como: "Cambiarlo enciende o apaga módulos al momento (estadísticas, varios locales, mesas, meseros…). Hay que confirmar el cambio. «Prueba» no se elige a mano: se sale de él desde Pruebas.",
      ejemplo:
        "Un cliente en prueba decide quedarse con Premium: apruébalo en Pruebas y asígnale el plan.",
      cuidado: "Bajar de plan oculta módulos; los datos no se borran.",
    },
    {
      campo: "Módulos",
      para: "Activar o quitar funciones sueltas por encima (o por debajo) de lo que trae el plan.",
      como: "Un módulo activado a mano se suma al plan; uno desactivado desaparece del panel de ese restaurante.",
      ejemplo: "Un Básico que solo quiere mesas: añade ese módulo sin pasarlo a Premium.",
    },
  ],
  antifraude: [
    {
      campo: "Canal: WhatsApp / Apagado",
      para: "Verificar por WhatsApp los pedidos web con riesgo.",
      como: "Se pide un código solo si el teléfono no tiene pedidos entregados, si es reparto pagado en efectivo, o si el importe es alto. Apagado: nunca se pide.",
      ejemplo:
        "Un teléfono nuevo pide reparto en efectivo de 35 €: recibe un código por WhatsApp y lo escribe antes de enviar.",
    },
    {
      campo: "Importe desde el que se pide (€)",
      para: "Fijar a partir de cuánto un pedido se considera de riesgo por su importe.",
      como: "Vacío usa el valor por defecto. Subirlo reduce códigos (y gasto); bajarlo verifica más pedidos.",
      ejemplo: "Un local de tickets pequeños: 20 €; uno de pedidos grandes: 50 €.",
    },
    {
      campo: "Tope de gasto al mes (€)",
      para: "Que el coste de los mensajes de WhatsApp no se dispare.",
      como: "Al alcanzar el tope no se envían más códigos: el pago en efectivo pide tarjeta o llamar al local y el cobro con tarjeta sigue adelante. Se reinicia cada mes.",
      cuidado: "Con el tope alcanzado el local queda sin esta protección hasta el mes siguiente.",
    },
  ],
  pagos: [
    {
      campo: "Métodos de pago permitidos",
      para: "Limitar qué puede activar un restaurante según su contrato o su riesgo.",
      como: "«Todos» no limita. Si marcas solo algunos, el restaurante únicamente puede activar esos en sus Ajustes, y al guardar se quita lo que ya tuviera activo y no esté permitido.",
      ejemplo: "Un cliente sin cuenta bancaria registrada: permite solo efectivo y tarjeta.",
    },
  ],
  alta: [
    {
      campo: "Alta autoservicio abierta",
      para: "Dejar que cualquiera cree su restaurante de prueba desde /alta, sin que tú intervengas.",
      como: "Abierta: el formulario funciona. Cerrada: /alta solo muestra el email de contacto.",
      ejemplo: "Ábrela en una campaña; ciérrala si te llegan altas basura.",
    },
    {
      campo: "Exigir aprobación manual",
      para: "Controlar quién entra y evitar abusos.",
      como: "Con aprobación, la prueba nace pendiente y no acepta pedidos hasta que la apruebes en Pruebas. Sin ella, empieza a funcionar al momento.",
      ejemplo: "Aprobación activa mientras validas el producto con pocos clientes.",
    },
    {
      campo: "Días de prueba",
      para: "Cuánto dura la prueba gratuita por tiempo.",
      como: "Pasados los días, la prueba termina y el restaurante deja de aceptar pedidos hasta que lo conviertas en plan. Vacío: sin límite de días.",
      ejemplo: "14 días.",
    },
    {
      campo: "Pedidos de la prueba",
      para: "Cuánto dura la prueba por uso real.",
      como: "Cuenta los pedidos recibidos (no carritos ni cancelados). Al llegar al máximo, la prueba termina. Vacío: sin límite. Se combina con los días: termina lo primero que ocurra.",
      ejemplo: "30 pedidos o 14 días, lo que llegue antes.",
    },
    {
      campo: "Email de contacto",
      para: "Que quien quiere pasar a plan (o encuentra el alta cerrada) sepa a quién escribir.",
      como: "Se muestra en la pantalla de fin de prueba y en el alta cerrada.",
    },
  ],
  pruebas: [
    {
      campo: "Estados de una prueba",
      para: "Seguir qué restaurantes están probando y cuáles esperan tu decisión.",
      como: "Pendiente (esperando aprobación), en curso, rechazada, terminada o convertida en plan. Solo las que están en curso aceptan pedidos.",
      ejemplo: "Una prueba terminada que quiere seguir: añádele días o conviértela en plan.",
    },
    {
      campo: "Días a añadir / Pedidos a añadir",
      para: "Dar más margen a una prueba sin convertirla todavía.",
      como: "Suma al límite actual; no reinicia la prueba. Úsalo cuando el cliente aún está decidiendo.",
      ejemplo: "+7 días a quien acaba de montar su carta y no ha tenido servicio.",
    },
    {
      campo: "Convertir en plan",
      para: "Pasar de prueba a cliente de pago.",
      como: "Eliges Básico o Premium; la prueba deja de tener límites y el restaurante sigue con sus datos.",
    },
  ],
  roles: [
    {
      campo: "Plantillas de roles",
      para: "Dar a todos los restaurantes los mismos roles base (dueño, encargado, mesero…).",
      como: "Las plantillas son comunes: cambiar una afecta al instante a todos los que la usan. Cada restaurante puede copiarla («Personalizar») para ajustar los suyos.",
      cuidado: "Quitar un permiso a una plantilla se lo quita a todo el mundo que la tenga.",
    },
    {
      campo: "Roles propios de un restaurante",
      para: "Ajustar permisos para un solo restaurante sin tocar el resto.",
      como: "Parten de una plantilla y existen solo en ese restaurante. Un permiso solo funciona si el plan o módulo del restaurante lo incluye (si no, queda inactivo).",
      ejemplo: "Un rol «Cajero» que ve pedidos y cobros pero no estadísticas ni ajustes.",
    },
  ],
  ciclo: [
    {
      campo: "Crear a partir de este",
      para: "Reutilizar un restaurante bien montado como plantilla de otro.",
      como: "Abre «Nuevo restaurante» con este como origen; tú eliges qué copiar. No copia datos propios del negocio.",
    },
    {
      campo: "Borrar este restaurante",
      para: "Eliminar restaurantes de prueba, duplicados o clientes que se dan de baja.",
      como: "Borra para siempre su carta, equipo, clientes, pedidos y archivos (logo, fotos, justificantes). Hay que escribir el enlace del restaurante para confirmar. La auditoría se conserva sin restaurante.",
      cuidado: "No hay deshacer: si dudas, desactívalo en lugar de borrarlo.",
    },
  ],
  importar: [
    {
      campo: "Importar carta (texto tabulado)",
      para: "Cargar la carta de un cliente en minutos desde su Excel o PDF.",
      como: "Una fila por variante: categoría; producto; descripción; variante; precio. Sin variante, «Única». «Comprobar» valida sin guardar; después se importa. Solo funciona si el restaurante aún no tiene carta.",
      ejemplo: "Pizzas; Margarita; Tomate y mozzarella; Familiar; 14,50",
      cuidado:
        "Después la carta se edita en el panel del restaurante; no se puede reimportar encima.",
    },
  ],
} as const satisfies Record<string, readonly HelpItem[]>;
