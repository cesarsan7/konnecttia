import { type ModuleCode, resolveActiveModules } from "./modules";
import { PERMISSION_MODULE, type PermissionCode } from "./permissions";

export const DENY_REASON = {
  ModuleDisabled: "module_disabled",
  MissingPermission: "missing_permission",
  UnknownPermission: "unknown_permission",
} as const;

export type DenyReason = (typeof DENY_REASON)[keyof typeof DENY_REASON];

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DenyReason };

/**
 * Contexto de acceso de un usuario dentro de UN restaurante. Se construye en el servidor a partir
 * de la membresía (usuario + restaurante) y nunca a partir de datos enviados por el navegador.
 */
export type AccessContext = {
  readonly restauranteId: number;
  readonly activeModules: ReadonlySet<ModuleCode>;
  readonly permissions: ReadonlySet<PermissionCode>;
};

export function buildAccessContext(input: {
  readonly restauranteId: number;
  readonly contractedModules: Iterable<ModuleCode>;
  readonly rolePermissions: Iterable<Iterable<PermissionCode>>;
}): AccessContext {
  const permissions = new Set<PermissionCode>();
  for (const role of input.rolePermissions) {
    for (const permission of role) {
      permissions.add(permission);
    }
  }
  return {
    restauranteId: input.restauranteId,
    activeModules: resolveActiveModules(input.contractedModules),
    permissions,
  };
}

/** Regla única de acceso: módulo activo para el restaurante Y permiso concedido por un rol. */
export function authorize(context: AccessContext, permission: PermissionCode): Decision {
  const module = PERMISSION_MODULE[permission];
  if (!module) {
    return { allowed: false, reason: DENY_REASON.UnknownPermission };
  }
  if (!context.activeModules.has(module)) {
    return { allowed: false, reason: DENY_REASON.ModuleDisabled };
  }
  if (!context.permissions.has(permission)) {
    return { allowed: false, reason: DENY_REASON.MissingPermission };
  }
  return { allowed: true };
}

export function can(context: AccessContext, permission: PermissionCode): boolean {
  return authorize(context, permission).allowed;
}

/**
 * Evita la escalada de privilegios: solo se puede asignar un rol cuyos permisos estén
 * contenidos en los del usuario que lo asigna.
 */
export function canGrantRole(
  granter: AccessContext,
  rolePermissions: Iterable<PermissionCode>,
): boolean {
  for (const permission of rolePermissions) {
    if (!granter.permissions.has(permission)) {
      return false;
    }
  }
  return true;
}
