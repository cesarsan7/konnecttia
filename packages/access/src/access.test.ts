import { describe, expect, it } from "vitest";
import { authorize, buildAccessContext, can, canGrantRole, DENY_REASON } from "./authorize";
import { MODULE, PLAN, PLAN_MODULES, resolveActiveModules } from "./modules";
import {
  ALL_PERMISSIONS,
  PERMISSION,
  PERMISSION_MODULE,
  ROLE_TEMPLATE,
  ROLE_TEMPLATE_PERMISSIONS,
} from "./permissions";

const viewerAtLaIsla = buildAccessContext({
  restauranteId: 1,
  contractedModules: PLAN_MODULES[PLAN.Basic],
  rolePermissions: [ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Viewer]],
});

describe("authorize", () => {
  it("un rol de consulta ve pedidos pero no puede editarlos ni cambiar su estado", () => {
    expect(can(viewerAtLaIsla, PERMISSION.OrdersView)).toBe(true);
    expect(authorize(viewerAtLaIsla, PERMISSION.OrdersUpdate)).toEqual({
      allowed: false,
      reason: DENY_REASON.MissingPermission,
    });
    expect(can(viewerAtLaIsla, PERMISSION.OrdersChangeStatus)).toBe(false);
  });

  it("tener el permiso no sirve si el restaurante no tiene el módulo activo", () => {
    const owner = buildAccessContext({
      restauranteId: 1,
      contractedModules: PLAN_MODULES[PLAN.Basic],
      rolePermissions: [ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Owner]],
    });
    // El plan básico no incluye mesas.
    expect(authorize(owner, PERMISSION.TablesManage)).toEqual({
      allowed: false,
      reason: DENY_REASON.ModuleDisabled,
    });
  });

  it("un módulo contratado no da acceso a quien no tiene el permiso", () => {
    const staff = buildAccessContext({
      restauranteId: 2,
      contractedModules: [...PLAN_MODULES[PLAN.Premium], MODULE.WhatsappChannel],
      rolePermissions: [ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Staff]],
    });
    expect(can(staff, PERMISSION.TablesManage)).toBe(true);
    expect(can(staff, PERMISSION.AnalyticsView)).toBe(false);
    expect(can(staff, PERMISSION.TeamManage)).toBe(false);
  });

  it("los permisos de varios roles se suman", () => {
    const context = buildAccessContext({
      restauranteId: 1,
      contractedModules: PLAN_MODULES[PLAN.Premium],
      rolePermissions: [
        ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Viewer],
        [PERMISSION.AnalyticsView],
      ],
    });
    expect(can(context, PERMISSION.AnalyticsView)).toBe(true);
    expect(can(context, PERMISSION.OrdersView)).toBe(true);
  });
});

describe("resolveActiveModules", () => {
  it("siempre incluye los módulos básicos", () => {
    const active = resolveActiveModules([]);
    expect(active.has(MODULE.Orders)).toBe(true);
    expect(active.has(MODULE.Menu)).toBe(true);
    expect(active.has(MODULE.EmailNotifications)).toBe(true);
  });

  it("el agente de WhatsApp no funciona sin la conexión de WhatsApp contratada", () => {
    expect(resolveActiveModules([MODULE.WhatsappAgent]).has(MODULE.WhatsappAgent)).toBe(false);
    expect(
      resolveActiveModules([MODULE.WhatsappAgent, MODULE.WhatsappChannel]).has(
        MODULE.WhatsappAgent,
      ),
    ).toBe(true);
  });

  it("los módulos futuros no se activan aunque se contraten", () => {
    expect(resolveActiveModules([MODULE.OnlinePayments]).has(MODULE.OnlinePayments)).toBe(false);
  });

  it("permite configuraciones distintas por cliente (SMS para uno, email para otro)", () => {
    const laIsla = resolveActiveModules([MODULE.SmsNotifications]);
    const laRipia = resolveActiveModules([]);
    expect(laIsla.has(MODULE.SmsNotifications)).toBe(true);
    expect(laRipia.has(MODULE.SmsNotifications)).toBe(false);
    expect(laRipia.has(MODULE.EmailNotifications)).toBe(true);
  });
});

describe("canGrantRole", () => {
  it("impide asignar un rol con más permisos que los propios", () => {
    const manager = buildAccessContext({
      restauranteId: 1,
      contractedModules: PLAN_MODULES[PLAN.Premium],
      rolePermissions: [ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Manager]],
    });
    expect(canGrantRole(manager, ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Viewer])).toBe(true);
    expect(canGrantRole(manager, ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Owner])).toBe(false);
  });
});

describe("catálogo", () => {
  it("todo permiso pertenece a un módulo conocido", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(PERMISSION_MODULE[permission]).toBeDefined();
    }
  });
});
