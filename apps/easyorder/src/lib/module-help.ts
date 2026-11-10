import type { HelpItem } from "@/components/HelpNote";

/**
 * Ayuda contextual de Equipo, Mesas, Carta (alérgenos) y Comanda: para qué sirve cada parámetro,
 * cómo funciona y un ejemplo. Solo describe comportamiento comprobado en el panel y la API; si
 * cambia una regla, se cambia aquí.
 */
export const MODULE_HELP = {
  miembros: [
    {
      campo: "Miembros",
      para: "Ver quién entra al panel de tu restaurante, con qué rol y a qué locales.",
      como: "Cada persona tiene un rol (lo que puede hacer) y un alcance de locales. Al abrir una persona puedes cambiarle el rol, limitarla a unos locales, ponerle nombre y apodo o quitarle el acceso.",
      ejemplo:
        "Una encargada de la sucursal Centro: rol de encargado y solo el local Centro, para que no vea ni cambie nada de los demás.",
      cuidado:
        "Quitar acceso hace que deje de entrar al panel al momento. No puedes cambiar a alguien con más permisos que los tuyos.",
    },
  ],
  invitaciones: [
    {
      campo: "Invitación (enlace)",
      para: "Dar acceso al panel a una persona nueva sin crearle tú la cuenta.",
      como: "Se crea un enlace de un solo uso que caduca a los 7 días (la fecha se ve en la lista). La persona lo abre, crea su acceso y entra con el rol y los locales que elegiste.",
      ejemplo: "Invitas a un cajero nuevo, copias el enlace y se lo mandas por WhatsApp.",
      cuidado:
        "Un enlace caducado o ya usado no sirve: crea otro. Si cambias de idea, pulsa «Anular» en la invitación pendiente.",
    },
    {
      campo: "Email (recomendado)",
      para: "Asegurar que solo la persona prevista pueda usar el enlace.",
      como: "Con email, solo esa dirección puede aceptar la invitación (y se le envía el enlace si el envío de emails está activo). Sin email, sirve a quien lo abra primero.",
      cuidado:
        "Sin email, si el enlace se reenvía por error, otra persona podría entrar con ese rol. Mejor ponlo siempre.",
    },
    {
      campo: "Rol e invitación a «Todos los locales» o a un local",
      para: "Decidir qué podrá hacer y dónde.",
      como: "El rol fija las acciones permitidas. «Todos» da acceso a todos los locales; marcar uno o varios limita a ellos, útil para cajeros o encargados de un solo local.",
    },
  ],
  roles: [
    {
      campo: "Roles de EasyOrder (plantillas)",
      para: "Tener combinaciones de permisos ya pensadas para cada puesto: propietario, encargado, personal, solo lectura, mesero y repartidor.",
      como: "No se pueden editar. Con «Ver permisos» ves exactamente qué incluye cada uno. El mesero atiende mesas y toma pedidos; el repartidor solo ve y entrega los pedidos que tiene asignados.",
      ejemplo: "Para el repartidor eliges el rol Repartidor: no verá ventas ni ajustes.",
    },
    {
      campo: "Personalizar / Rol propio",
      para: "Crear una combinación distinta de permisos cuando las plantillas no encajan.",
      como: "«Personalizar» hace una copia propia de la plantilla que sí puedes editar y pasa a ella a las personas e invitaciones que tenía, con los mismos permisos que ya tenían. «Nuevo rol» parte de cero.",
      ejemplo: "«Cajero de noche»: ver pedidos y cobrar, sin tocar la carta ni los ajustes.",
      cuidado:
        "Los cambios en un rol propio se aplican al momento a quien lo tiene. Solo puedes dar permisos que tú tienes, y los de módulos no contratados no tienen efecto hasta que se activen.",
    },
  ],
  avisosMesa: [
    {
      campo: "Espera sin servir (min)",
      para: "Detectar a simple vista mesas que llevan demasiado esperando su pedido.",
      como: "Cuando un pedido de la mesa lleva más de estos minutos sin servirse, la mesa se marca en el plano. Vacío: sin aviso.",
      ejemplo: "Con 20, una mesa que espera su comida desde hace 25 minutos aparece resaltada.",
    },
    {
      campo: "Estancia en la mesa (min)",
      para: "Saber cuándo una mesa lleva ocupada más de lo previsto, por ejemplo para rotar mesas en hora punta.",
      como: "Si la mesa lleva ocupada más de estos minutos, se marca en el plano. Vacío: sin aviso.",
      ejemplo:
        "Con 90, una mesa ocupada desde hace hora y media se resalta para que el equipo decida.",
      cuidado: "Solo marca la mesa: no cierra ni cobra nada por sí solo.",
    },
  ],
  meseros: [
    {
      campo: "Mesero",
      para: "Saber quién atiende cada mesa y cada pedido en mesa, para repartir propinas y ver informes por persona.",
      como: "Al tomar un pedido en mesa se elige quién atiende. La lista muestra los pedidos e importe de hoy de cada mesero.",
      ejemplo: "Ana atendió 12 pedidos por 340 € hoy: sirve de base para repartir propinas.",
    },
    {
      campo: "Local",
      para: "Asignar el mesero al local donde trabaja.",
      como: "Un mesero pertenece a un local; solo se le puede asignar a mesas y pedidos de ese local.",
    },
    {
      campo: "Usuario del panel (opcional)",
      para: "Que los pedidos de un mesero con acceso al panel se le asignen solos.",
      como: "Si enlazas el mesero con su usuario, cuando esa persona toma un pedido en mesa se le asigna a ella sin elegirla.",
      ejemplo: "Ana entra con su móvil y toma pedidos: todos quedan a su nombre.",
    },
    {
      campo: "Activo / borrar",
      para: "Dejar de usar a un mesero sin perder el histórico.",
      como: "Si ya tiene pedidos, «Borrar» lo desactiva (y lo quita de las mesas): su nombre sigue en el historial y los informes. Si no tiene pedidos, se borra del todo.",
    },
  ],
  mesas: [
    {
      campo: "Número y nombre",
      para: "Identificar cada mesa en el plano, en los pedidos y en la comanda.",
      como: "El número no se repite dentro de un local. El nombre es opcional: sin él se llama «Mesa N».",
      ejemplo: "Número 12 con nombre «Barra 2».",
    },
    {
      campo: "Personas (capacidad)",
      para: "Saber de un vistazo cuántas personas caben.",
      como: "Opcional, de 1 a 99. Solo informa; no impide tomar pedidos.",
    },
    {
      campo: "Zona",
      para: "Agrupar las mesas en el plano (Terraza, Salón…).",
      como: "Las mesas se muestran agrupadas por zona; las que no tienen zona van en «Sin zona». Si borras una zona, sus mesas se quedan sin zona (no se borran).",
    },
    {
      campo: "Mesa activa",
      para: "Quitar de uso una mesa sin borrarla.",
      como: "Una mesa desactivada se ve apagada en el plano y no se puede elegir para tomar pedidos. La vuelves a activar cuando quieras.",
      ejemplo: "La terraza en invierno: desactiva sus mesas y las reactivas en primavera.",
      cuidado:
        "Para liberar una mesa ocupada no debe tener pedidos en curso: ciérralos o cóbralos primero.",
    },
  ],
  alergenos: [
    {
      campo: "Sin informar / Informados",
      para: "Cumplir con la información de alérgenos que el cliente espera ver, sin afirmar nada que no hayas comprobado.",
      como: "«Sin informar» no declara nada: la carta mostrará «Alérgenos no informados: consulta al restaurante». «Informados» declara lo que marques; sin marcar ninguno, la carta dirá que no contiene ninguno de los 14 alérgenos.",
      ejemplo:
        "Una pizza con gluten y lácteos: elige «Informados» y marca Gluten y Lácteos; en la carta el cliente los verá.",
      cuidado:
        "«Informados» sin marcar nada afirma que NO contiene ninguno. Si no estás seguro, déjalo en «Sin informar».",
    },
    {
      campo: "Alérgenos de los extras",
      para: "Que el aviso del pedido refleje también lo que añade el cliente.",
      como: "El cliente ve los alérgenos del producto sumados a los de los extras que elige. Si alguna parte no está informada, el conjunto tampoco se da por informado.",
      ejemplo:
        "Pizza sin lácteos + extra de queso (lácteos): al añadirlo, el cliente ve «lácteos».",
    },
  ],
  comanda: [
    {
      campo: "Papel (58 / 80 mm)",
      para: "Que el ticket quepa bien en tu impresora.",
      como: "Elige el ancho del rollo de la impresora de tickets. Se guarda en este navegador, no para todo el restaurante.",
      cuidado: "Cada ordenador o tableta tiene su propia configuración.",
    },
    {
      campo: "Copia: Cocina / Cliente",
      para: "Imprimir lo que necesita cada persona.",
      como: "«Cocina» sale sin precios y con letra grande, para preparar. «Cliente» incluye precios y total.",
      ejemplo: "Impresora de cocina en «Cocina»; la de caja en «Cliente».",
    },
    {
      campo: "Imprimir cada pedido nuevo al llegar",
      para: "Que la cocina reciba el ticket sin que nadie lo pida.",
      como: "Al llegar un pedido con el panel abierto en este equipo, se imprime solo.",
      cuidado: "Hay que dejar el panel abierto en ese equipo: si está cerrado, no se imprime nada.",
    },
    {
      campo: "Imprimir al pulsar «Aceptar pedido»",
      para: "Imprimir solo los pedidos que el local acepta.",
      como: "El ticket sale cuando alguien acepta el pedido en el tablero.",
      ejemplo: "Útil si recibes pedidos que a veces rechazas y no quieres gastar papel.",
    },
    {
      campo: "Imprimir sin cuadro de diálogo (--kiosk-printing)",
      para: "Evitar pulsar «Imprimir» en cada ticket.",
      como: "Abre Chrome en ese equipo con la opción --kiosk-printing y deja la impresora de tickets como predeterminada: imprime directamente.",
    },
  ],
} as const satisfies Record<string, readonly HelpItem[]>;
