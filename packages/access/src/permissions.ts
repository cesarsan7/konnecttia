import { MODULE, type ModuleCode } from "./modules";

/**
 * Catálogo de permisos. Cada permiso pertenece a un módulo: si el módulo no está activo para el
 * restaurante, el permiso no sirve aunque el rol lo tenga.
 */
export const PERMISSION = {
  OrdersView: "orders.view",
  OrdersCreate: "orders.create",
  OrdersUpdate: "orders.update",
  OrdersChangeStatus: "orders.change_status",
  OrdersCancel: "orders.cancel",
  OrdersExport: "orders.export",
  MenuView: "menu.view",
  MenuCreate: "menu.create",
  MenuUpdate: "menu.update",
  MenuDelete: "menu.delete",
  SettingsView: "settings.view",
  SettingsUpdate: "settings.update",
  TeamView: "team.view",
  TeamManage: "team.manage",
  DeliveryView: "delivery.view",
  DeliveryManage: "delivery.manage",
  CustomersView: "customers.view",
  CustomersExport: "customers.export",
  TablesView: "tables.view",
  TablesManage: "tables.manage",
  AnalyticsView: "analytics.view",
  NewsManage: "news.manage",
  ConversationsView: "conversations.view",
  ConversationsReply: "conversations.reply",
  AgentConfigure: "agent.configure",
} as const;

export type PermissionCode = (typeof PERMISSION)[keyof typeof PERMISSION];

export const PERMISSION_MODULE: Readonly<Record<PermissionCode, ModuleCode>> = {
  [PERMISSION.OrdersView]: MODULE.Orders,
  [PERMISSION.OrdersCreate]: MODULE.Orders,
  [PERMISSION.OrdersUpdate]: MODULE.Orders,
  [PERMISSION.OrdersChangeStatus]: MODULE.Orders,
  [PERMISSION.OrdersCancel]: MODULE.Orders,
  [PERMISSION.OrdersExport]: MODULE.Orders,
  [PERMISSION.MenuView]: MODULE.Menu,
  [PERMISSION.MenuCreate]: MODULE.Menu,
  [PERMISSION.MenuUpdate]: MODULE.Menu,
  [PERMISSION.MenuDelete]: MODULE.Menu,
  [PERMISSION.SettingsView]: MODULE.Settings,
  [PERMISSION.SettingsUpdate]: MODULE.Settings,
  [PERMISSION.TeamView]: MODULE.Team,
  [PERMISSION.TeamManage]: MODULE.Team,
  [PERMISSION.DeliveryView]: MODULE.Delivery,
  [PERMISSION.DeliveryManage]: MODULE.Delivery,
  [PERMISSION.CustomersView]: MODULE.Customers,
  [PERMISSION.CustomersExport]: MODULE.Customers,
  [PERMISSION.TablesView]: MODULE.Tables,
  [PERMISSION.TablesManage]: MODULE.Tables,
  [PERMISSION.AnalyticsView]: MODULE.Analytics,
  [PERMISSION.NewsManage]: MODULE.NewsAndReviews,
  [PERMISSION.ConversationsView]: MODULE.WhatsappChannel,
  [PERMISSION.ConversationsReply]: MODULE.WhatsappChannel,
  [PERMISSION.AgentConfigure]: MODULE.WhatsappAgent,
};

export const ALL_PERMISSIONS = Object.values(PERMISSION) as readonly PermissionCode[];

/** Plantillas de rol. En el MVP solo el panel de Konnecttia crea o modifica roles. */
export const ROLE_TEMPLATE = {
  Owner: "owner",
  Manager: "manager",
  Staff: "staff",
  Viewer: "viewer",
} as const;

export type RoleTemplateCode = (typeof ROLE_TEMPLATE)[keyof typeof ROLE_TEMPLATE];

const STAFF_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSION.OrdersView,
  PERMISSION.OrdersCreate,
  PERMISSION.OrdersChangeStatus,
  PERMISSION.MenuView,
  PERMISSION.DeliveryView,
  PERMISSION.CustomersView,
  PERMISSION.TablesView,
  PERMISSION.TablesManage,
  PERMISSION.ConversationsView,
  PERMISSION.ConversationsReply,
];

export const ROLE_TEMPLATE_PERMISSIONS: Readonly<
  Record<RoleTemplateCode, readonly PermissionCode[]>
> = {
  [ROLE_TEMPLATE.Owner]: ALL_PERMISSIONS,
  [ROLE_TEMPLATE.Manager]: ALL_PERMISSIONS.filter(
    (permission) =>
      permission !== PERMISSION.TeamManage && permission !== PERMISSION.AgentConfigure,
  ),
  [ROLE_TEMPLATE.Staff]: STAFF_PERMISSIONS,
  [ROLE_TEMPLATE.Viewer]: [
    PERMISSION.OrdersView,
    PERMISSION.MenuView,
    PERMISSION.DeliveryView,
    PERMISSION.TablesView,
  ],
};
