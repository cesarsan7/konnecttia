import { HELP_SLUG, type HelpSlug } from "../ayuda/slugs";
import { TOUR_SECTION, type TourSection, type TourStep } from "./tour";

/**
 * Permisos (los mismos códigos que `PERMISSION` del panel) y módulos que condicionan los pasos.
 * Se repiten aquí, como en `lib/panel/onboarding.ts`, para que la lógica no dependa de un
 * componente.
 */
const NEEDS = {
  OrdersView: "orders.view",
  OrdersCreate: "orders.create",
  OrdersChangeStatus: "orders.change_status",
  OrdersDeliverAssigned: "orders.deliver_assigned",
  MenuView: "menu.view",
  MenuCreate: "menu.create",
  MenuUpdate: "menu.update",
  CustomersView: "customers.view",
  CustomersExport: "customers.export",
  AnalyticsView: "analytics.view",
  TablesView: "tables.view",
  TablesManage: "tables.manage",
  TeamView: "team.view",
  TeamManage: "team.manage",
  SettingsView: "settings.view",
  SettingsUpdate: "settings.update",
} as const;

const MODULE = { Analytics: "analytics", Tables: "tables" } as const;

export type TourDefinition = {
  readonly section: TourSection;
  /** Nombre de la pantalla, para los textos de los botones. */
  readonly label: string;
  /** Página del centro de ayuda de esta sección. */
  readonly help: HelpSlug;
  readonly steps: readonly TourStep[];
};

export const TOURS: readonly TourDefinition[] = [
  {
    section: TOUR_SECTION.Orders,
    label: "Pedidos",
    help: HELP_SLUG.Orders,
    steps: [
      {
        target: "pedidos-tablero",
        title: "Aquí llegan los pedidos",
        body: "Los de la web y los de WhatsApp aparecen solos, con un aviso sonoro. Cada columna es un momento: Nuevos, En preparación, Listos y en reparto, y Terminados. Pulsa el botón grande de cada tarjeta para pasar el pedido al siguiente paso.",
        permission: NEEDS.OrdersView,
      },
      {
        target: "pedidos-vista",
        title: "Tablero o tabla",
        body: "El tablero es para trabajar en el día a día. La tabla sirve para buscar pedidos de otros días y filtrarlos por estado, canal o cobro.",
        permission: NEEDS.OrdersView,
      },
      {
        target: "pedidos-nuevo",
        title: "Apunta un pedido tú",
        body: "Para los pedidos por teléfono, en el mostrador o en mesa. Eliges los productos, los datos del cliente y cómo paga, y el pedido entra en el tablero como cualquier otro.",
        permission: NEEDS.OrdersCreate,
      },
      {
        target: "pedidos-ocupado",
        title: "Modo ocupado",
        body: "Si hay mucho lío, suma unos minutos al tiempo de espera que ven los clientes nuevos. No deja de aceptar pedidos y se quita solo pasado un rato.",
        permission: NEEDS.OrdersChangeStatus,
      },
      {
        target: "pedidos-comanda",
        title: "Imprimir la comanda",
        body: "Elige el papel (58 u 80 mm) y si quieres la copia de cocina o la del cliente. Puedes imprimir cada pedido al llegar o al aceptarlo. Se guarda en este navegador.",
        permission: NEEDS.OrdersView,
      },
    ],
  },
  {
    section: TOUR_SECTION.Tables,
    label: "Mesas",
    help: HELP_SLUG.Tables,
    steps: [
      {
        target: "mesas-local",
        title: "Elige el local",
        body: "Cada local tiene sus propias mesas. Cambia de local aquí.",
        permission: NEEDS.TablesView,
        module: MODULE.Tables,
      },
      {
        target: "mesas-plano",
        title: "El plano de mesas",
        body: "Cada cuadro es una mesa. Tócala para ver su cuenta, tomar o añadir un pedido, ocuparla o liberarla. Una etiqueta avisa si la espera o la estancia se alargan.",
        permission: NEEDS.TablesView,
        module: MODULE.Tables,
      },
      {
        target: "mesas-filtro",
        title: "Libres u ocupadas",
        body: "Filtra para ver de un vistazo qué mesas están libres y cuáles ocupadas.",
        permission: NEEDS.TablesView,
        module: MODULE.Tables,
      },
      {
        target: "mesas-editar",
        title: "Crea tus mesas",
        body: "Activa «Editar mesas» para crear zonas (sala, terraza…), añadir mesas, dar de alta a los meseros y ajustar los avisos de tiempo.",
        permission: NEEDS.TablesManage,
        module: MODULE.Tables,
      },
    ],
  },
  {
    section: TOUR_SECTION.Menu,
    label: "Carta",
    help: HELP_SLUG.Menu,
    steps: [
      {
        target: "carta-pestanas",
        title: "Productos y extras",
        body: "Los productos son lo que vendes. Los extras son suplementos que el cliente puede añadir, como queso o una salsa.",
        permission: NEEDS.MenuView,
      },
      {
        target: "carta-nuevo",
        title: "Añade un producto",
        body: "Necesitas al menos una categoría (hamburguesas, bebidas…). Después pon el nombre, los precios por tamaño, una foto y los alérgenos.",
        permission: NEEDS.MenuCreate,
      },
      {
        target: "carta-buscar",
        title: "Busca un producto",
        body: "Escribe parte del nombre y verás solo los productos que coinciden.",
        permission: NEEDS.MenuView,
      },
      {
        target: "carta-categoria",
        title: "Cada categoría, de un vistazo",
        body: "El interruptor «Disponible» marca un producto como agotado. «Ocultar» lo quita de la carta sin borrarlo y las flechas cambian el orden. Pulsa el nombre para editarlo.",
        permission: NEEDS.MenuUpdate,
      },
    ],
  },
  {
    section: TOUR_SECTION.Customers,
    label: "Clientes",
    help: HELP_SLUG.Customers,
    steps: [
      {
        target: "clientes-buscar",
        title: "Encuentra a un cliente",
        body: "Busca por nombre o teléfono, ordena por los más recientes, los que más piden o los que más gastan, y filtra solo los bloqueados.",
        permission: NEEDS.CustomersView,
      },
      {
        target: "clientes-lista",
        title: "Su ficha",
        body: "Pulsa un cliente para ver sus pedidos, llamarle o escribirle por WhatsApp. Si tu rol lo permite, desde ahí puedes bloquearlo o borrar sus datos.",
        permission: NEEDS.CustomersView,
      },
      {
        target: "clientes-exportar",
        title: "Descarga tu lista",
        body: "«Exportar CSV» baja un archivo con tus clientes que se abre con Excel.",
        permission: NEEDS.CustomersExport,
      },
    ],
  },
  {
    section: TOUR_SECTION.Stats,
    label: "Estadísticas",
    help: HELP_SLUG.Stats,
    steps: [
      {
        target: "estadisticas-periodo",
        title: "Elige el periodo",
        body: "Hoy, 7 días, 30 días, este mes o las fechas que quieras. Todo se compara con el periodo anterior.",
        permission: NEEDS.AnalyticsView,
        module: MODULE.Analytics,
      },
      {
        target: "estadisticas-resumen",
        title: "Los números clave",
        body: "Ventas, pedidos, ticket medio (lo que gasta un cliente por pedido), clientes distintos y pedidos cancelados.",
        permission: NEEDS.AnalyticsView,
        module: MODULE.Analytics,
      },
      {
        target: "estadisticas-horas",
        title: "Tus horas punta",
        body: "Mira a qué hora entran más pedidos para planificar el personal y usar el modo ocupado.",
        permission: NEEDS.AnalyticsView,
        module: MODULE.Analytics,
      },
    ],
  },
  {
    section: TOUR_SECTION.Team,
    label: "Equipo",
    help: HELP_SLUG.Team,
    steps: [
      {
        target: "equipo-invitar",
        title: "Invita a tu equipo",
        body: "Elige el rol y, mejor, el email de la persona. Se crea un enlace de un solo uso para que entre; caduca pasados unos días.",
        permission: NEEDS.TeamManage,
      },
      {
        target: "equipo-miembros",
        title: "Quién tiene acceso",
        body: "Cada persona tiene un rol que decide qué ve y qué puede hacer en el panel.",
        permission: NEEDS.TeamView,
      },
      {
        target: "equipo-invitaciones",
        title: "Invitaciones pendientes",
        body: "Copia el enlace para mandarlo por WhatsApp o anúlalo si te equivocaste.",
        permission: NEEDS.TeamManage,
      },
      {
        target: "equipo-roles",
        title: "Roles",
        body: "Los roles de EasyOrder ya vienen preparados (Propietario, Encargado, Personal, Consulta, Mesero y Repartidor). Quien gestiona el equipo puede crear roles propios, por ejemplo uno que solo tome pedidos.",
        permission: NEEDS.TeamView,
      },
    ],
  },
  {
    section: TOUR_SECTION.Settings,
    label: "Ajustes",
    help: HELP_SLUG.Settings,
    steps: [
      {
        target: "ajustes-secciones",
        title: "Todo en pestañas",
        body: "Los ajustes están ordenados: datos del restaurante, pedidos y pago, privacidad, horario, reparto y locales. Cada pestaña se guarda por separado.",
        permission: NEEDS.SettingsView,
      },
      {
        target: "ajustes-apertura",
        title: "Abrir o cerrar al momento",
        body: "«Según horario» sigue tu horario. «Cerrado ahora» deja de aceptar pedidos hasta que lo cambies; «Abierto ahora» los acepta aunque el horario diga cerrado.",
        permission: NEEDS.SettingsView,
      },
      {
        target: "ajustes-guardar",
        title: "Guarda los cambios",
        body: "Lo que cambies no se aplica hasta que pulses el botón de guardar de esa pestaña.",
        permission: NEEDS.SettingsUpdate,
      },
    ],
  },
  {
    section: TOUR_SECTION.Deliveries,
    label: "Mis repartos",
    help: HELP_SLUG.MyDeliveries,
    steps: [
      {
        target: "repartos-lista",
        title: "Tus repartos",
        body: "Aquí solo ves los pedidos que el local te ha asignado, con la dirección, el teléfono del cliente y cuánto cobrar.",
        permission: NEEDS.OrdersDeliverAssigned,
      },
      {
        target: "repartos-paso",
        title: "Avanza el reparto",
        body: "Cuando el pedido esté listo, pulsa «Salgo a repartir»; al dejarlo en su destino, «Entregado». Si el cobro está pendiente (transferencia o Bizum), espera a que el local lo confirme.",
        permission: NEEDS.OrdersDeliverAssigned,
      },
      {
        target: "repartos-foto",
        title: "Foto de entrega",
        body: "Si el local lo pide, haz una foto al dejar el pedido y súbela. Con la foto obligatoria no podrás marcar «Entregado» sin ella.",
        permission: NEEDS.OrdersDeliverAssigned,
      },
      {
        target: "repartos-actualizar",
        title: "Lista al día",
        body: "La lista se actualiza sola cada pocos segundos. Si quieres comprobarlo ya, pulsa «Actualizar».",
        permission: NEEDS.OrdersDeliverAssigned,
      },
    ],
  },
];

export function tourFor(section: TourSection): TourDefinition | undefined {
  return TOURS.find((tour) => tour.section === section);
}
