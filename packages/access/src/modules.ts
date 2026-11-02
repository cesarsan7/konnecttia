/**
 * Catálogo de módulos de EasyOrder. Un módulo es una capacidad que se activa por restaurante
 * (por plan o como complemento). Los códigos son estables: se guardan en base de datos.
 */

export const MODULE = {
  Orders: "core.orders",
  Menu: "core.menu",
  Settings: "core.settings",
  Team: "core.team",
  EmailNotifications: "notify.email",
  Delivery: "delivery",
  Customers: "customers",
  Tables: "tables",
  Analytics: "analytics",
  ScheduledOrders: "scheduled_orders",
  MenuTranslations: "menu_i18n",
  NewsAndReviews: "news_reviews",
  MultiLocation: "locations.multi",
  WhatsappChannel: "whatsapp.channel",
  WhatsappNotifications: "notify.whatsapp",
  WhatsappAgent: "whatsapp.agent",
  SmsNotifications: "notify.sms",
  OnlinePayments: "payments.online",
} as const;

export type ModuleCode = (typeof MODULE)[keyof typeof MODULE];

export const MODULE_KIND = {
  /** Siempre incluido: sin él no hay producto. */
  Core: "core",
  /** Incluido según el plan. */
  Plan: "plan",
  /** Se contrata aparte y puede tener consumo. */
  Addon: "addon",
  /** Definido pero aún no disponible. */
  Future: "future",
} as const;

export type ModuleKind = (typeof MODULE_KIND)[keyof typeof MODULE_KIND];

export type ModuleDefinition = {
  readonly code: ModuleCode;
  readonly name: string;
  readonly kind: ModuleKind;
  readonly dependsOn: readonly ModuleCode[];
};

export const MODULES: readonly ModuleDefinition[] = [
  { code: MODULE.Orders, name: "Pedidos web y panel", kind: MODULE_KIND.Core, dependsOn: [] },
  { code: MODULE.Menu, name: "Carta online", kind: MODULE_KIND.Core, dependsOn: [] },
  { code: MODULE.Settings, name: "Configuración del local", kind: MODULE_KIND.Core, dependsOn: [] },
  { code: MODULE.Team, name: "Equipo y roles", kind: MODULE_KIND.Core, dependsOn: [] },
  {
    code: MODULE.EmailNotifications,
    name: "Avisos por email",
    kind: MODULE_KIND.Core,
    dependsOn: [MODULE.Orders],
  },
  {
    code: MODULE.Delivery,
    name: "Reparto propio con zonas",
    kind: MODULE_KIND.Plan,
    dependsOn: [MODULE.Orders],
  },
  { code: MODULE.Customers, name: "Clientes e historial", kind: MODULE_KIND.Plan, dependsOn: [] },
  {
    code: MODULE.Tables,
    name: "Mesas, camareros y comanda",
    kind: MODULE_KIND.Plan,
    dependsOn: [MODULE.Orders],
  },
  { code: MODULE.Analytics, name: "Analíticas", kind: MODULE_KIND.Plan, dependsOn: [] },
  {
    code: MODULE.ScheduledOrders,
    name: "Pedidos programados y hora de recogida",
    kind: MODULE_KIND.Plan,
    dependsOn: [MODULE.Orders],
  },
  {
    code: MODULE.MenuTranslations,
    name: "Carta en varios idiomas",
    kind: MODULE_KIND.Plan,
    dependsOn: [MODULE.Menu],
  },
  {
    code: MODULE.NewsAndReviews,
    name: "Novedades y reseñas",
    kind: MODULE_KIND.Plan,
    dependsOn: [],
  },
  { code: MODULE.MultiLocation, name: "Varios locales", kind: MODULE_KIND.Plan, dependsOn: [] },
  {
    code: MODULE.WhatsappChannel,
    name: "Conexión de WhatsApp (Kapso)",
    kind: MODULE_KIND.Addon,
    dependsOn: [],
  },
  {
    code: MODULE.WhatsappNotifications,
    name: "Avisos por WhatsApp",
    kind: MODULE_KIND.Addon,
    dependsOn: [MODULE.WhatsappChannel, MODULE.Orders],
  },
  {
    code: MODULE.WhatsappAgent,
    name: "Agente de WhatsApp con IA",
    kind: MODULE_KIND.Addon,
    dependsOn: [MODULE.WhatsappChannel, MODULE.Orders, MODULE.Menu],
  },
  {
    code: MODULE.SmsNotifications,
    name: "Avisos por SMS",
    kind: MODULE_KIND.Addon,
    dependsOn: [MODULE.Orders],
  },
  {
    code: MODULE.OnlinePayments,
    name: "Cobro online",
    kind: MODULE_KIND.Future,
    dependsOn: [MODULE.Orders],
  },
];

const DEFINITIONS = new Map(MODULES.map((definition) => [definition.code, definition]));

export function getModule(code: ModuleCode): ModuleDefinition {
  const definition = DEFINITIONS.get(code);
  if (!definition) {
    throw new Error(`Módulo desconocido: ${code}`);
  }
  return definition;
}

export const CORE_MODULES: readonly ModuleCode[] = MODULES.filter(
  (definition) => definition.kind === MODULE_KIND.Core,
).map((definition) => definition.code);

/**
 * Módulos realmente operativos: los contratados más los básicos, quitando los que tienen
 * dependencias sin contratar y los que aún no están disponibles. Se recalcula hasta estabilizar
 * para que una dependencia ausente desactive toda la cadena.
 */
export function resolveActiveModules(contracted: Iterable<ModuleCode>): ReadonlySet<ModuleCode> {
  const active = new Set<ModuleCode>([...CORE_MODULES, ...contracted]);
  for (const code of [...active]) {
    if (getModule(code).kind === MODULE_KIND.Future) {
      active.delete(code);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const code of [...active]) {
      if (getModule(code).dependsOn.some((dependency) => !active.has(dependency))) {
        active.delete(code);
        changed = true;
      }
    }
  }
  return active;
}

/** Planes comerciales: qué módulos de tipo «plan» incluye cada uno. */
export const PLAN = {
  Basic: "basico",
  Premium: "premium",
} as const;

export type PlanCode = (typeof PLAN)[keyof typeof PLAN];

export const PLAN_MODULES: Readonly<Record<PlanCode, readonly ModuleCode[]>> = {
  [PLAN.Basic]: [MODULE.Delivery, MODULE.Customers],
  [PLAN.Premium]: [
    MODULE.Delivery,
    MODULE.Customers,
    MODULE.Tables,
    MODULE.Analytics,
    MODULE.ScheduledOrders,
    MODULE.MenuTranslations,
    MODULE.NewsAndReviews,
    MODULE.MultiLocation,
  ],
};
