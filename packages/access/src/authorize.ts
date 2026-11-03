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
  /** Locales (sucursales) que el usuario puede ver y operar. */
  readonly branchScope: BranchScope;
};

/** `all`: todos los locales del restaurante. Si no, solo los indicados. */
export type BranchScope = "all" | ReadonlySet<number>;

export const ALL_BRANCHES = "all" as const;

export function buildAccessContext(input: {
  readonly restauranteId: number;
  readonly contractedModules: Iterable<ModuleCode>;
  readonly rolePermissions: Iterable<Iterable<PermissionCode>>;
  /** Locales asignados al miembro. Vacío o ausente: todos. */
  readonly branchIds?: Iterable<number>;
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
    branchScope: scopeFrom(input.branchIds),
  };
}

function scopeFrom(branchIds: Iterable<number> | undefined): BranchScope {
  const ids = new Set(branchIds ?? []);
  return ids.size === 0 ? ALL_BRANCHES : ids;
}

/** ¿Puede el usuario ver u operar este local? */
export function canAccessBranch(context: AccessContext, branchId: number | null): boolean {
  if (context.branchScope === ALL_BRANCHES) return true;
  return branchId !== null && context.branchScope.has(branchId);
}

/**
 * Locales sobre los que filtrar una consulta: `null` = sin filtro (todos); si no, la lista.
 * Si el usuario pide un local concreto fuera de su alcance, devuelve una lista vacía.
 */
export function branchFilter(
  context: AccessContext,
  requested: number | null = null,
): readonly number[] | null {
  if (requested !== null) return canAccessBranch(context, requested) ? [requested] : [];
  return context.branchScope === ALL_BRANCHES ? null : [...context.branchScope];
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

/**
 * Evita ampliar el alcance por locales: quien está limitado a unos locales solo puede asignar
 * esos mismos (y nunca «todos»). `branchIds` vacío significa «todos los locales».
 */
export function canGrantBranches(granter: AccessContext, branchIds: Iterable<number>): boolean {
  if (granter.branchScope === ALL_BRANCHES) return true;
  const ids = [...branchIds];
  return ids.length > 0 && ids.every((id) => canAccessBranch(granter, id));
}
