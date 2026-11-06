/** Respuestas de GET /panel/:slug/equipo y /me/invitaciones (apps/api/src/routes/panel-team.ts, me.ts). */

export type TeamRole = {
  readonly id: number;
  readonly code: string;
  readonly nombre: string;
  readonly plantilla: boolean;
  readonly permisos: readonly string[];
  readonly asignable: boolean;
};

export type TeamMember = {
  readonly id: number;
  readonly email: string | null;
  readonly nombre: string | null;
  readonly apodo: string | null;
  /** Apodo o nombre; null si aún no lo ha puesto. */
  readonly mostrar: string | null;
  readonly created_at: string;
  readonly roles: readonly {
    readonly id: number;
    readonly code: string;
    readonly nombre: string;
  }[];
  readonly locales: "todos" | readonly number[];
  readonly eres_tu: boolean;
};

export type TeamInvite = {
  readonly id: number;
  readonly email: string | null;
  readonly rol_id: number;
  readonly token: string;
  readonly expires_at: string;
  readonly locales: "todos" | readonly number[];
};

export type Team = {
  readonly miembros: readonly TeamMember[];
  readonly invitaciones: readonly TeamInvite[];
  readonly roles: readonly TeamRole[];
  readonly locales: readonly { readonly id: number; readonly nombre: string }[];
  readonly dias_invitacion: number;
};

export type InvitePreview = {
  readonly estado: "valida" | "usada" | "caducada" | "anulada" | "otro_email" | "ya_miembro";
  readonly restaurante: { readonly nombre: string; readonly slug: string | null };
  readonly rol: string | null;
  readonly todos_los_locales: boolean;
  readonly tu_email: string | null;
};

/** Nombre y apodo de una persona del equipo (los mismos límites que la API). */
export const MEMBER_NAME_MAX = 80;

export type MemberName = { readonly nombre: string; readonly apodo: string | null };

/**
 * Cómo llamar a una persona del equipo: apodo o nombre y, solo si no los ha puesto, su email
 * (que únicamente llega a quien ve el equipo) o, si tampoco, el texto de reserva.
 */
export function personLabel(
  person: { readonly name?: string | null; readonly email?: string | null },
  fallback: string,
): string {
  return person.name?.trim() || person.email?.trim() || fallback;
}

/** Valida el formulario de nombre y apodo; devuelve el error o los valores limpios. */
export function parseMemberName(
  nombre: string,
  apodo: string,
): { readonly error: string } | { readonly value: MemberName } {
  const cleanName = nombre.trim();
  const cleanNick = apodo.trim();
  if (!cleanName) return { error: "Escribe tu nombre." };
  if (cleanName.length > MEMBER_NAME_MAX || cleanNick.length > MEMBER_NAME_MAX) {
    return { error: `Nombre y apodo admiten hasta ${MEMBER_NAME_MAX} caracteres.` };
  }
  return { value: { nombre: cleanName, apodo: cleanNick || null } };
}

/** Qué puede hacer cada plantilla de rol (para elegir sin leer la lista de permisos). */
export const ROLE_SUMMARY: Readonly<Record<string, string>> = {
  owner: "Todo, incluido el equipo y quién entra al panel.",
  manager: "Todo menos gestionar el equipo: pedidos, carta, ajustes y estadísticas.",
  staff: "Tablero de pedidos: aceptar, preparar y entregar. Ve la carta sin cambiarla.",
  viewer: "Solo consulta: ve pedidos y carta, no cambia nada.",
  waiter: "Mesas: toma pedidos en mesa, los avanza y ocupa o libera mesas.",
  driver: "Reparto: solo ve y entrega los pedidos que tiene asignados.",
};

/** Respuesta de GET /panel/:slug/equipo/roles (apps/api/src/routes/panel-roles.ts). */
export type RoleDetail = {
  readonly id: number;
  readonly code: string;
  readonly nombre: string;
  readonly plantilla: boolean;
  readonly permisos: readonly string[];
  readonly miembros: number;
  readonly invitaciones: number;
  readonly editable: boolean;
};

export type PermissionGroup = {
  readonly modulo: string;
  readonly nombre: string;
  readonly activo: boolean;
  readonly permisos: readonly {
    readonly code: string;
    readonly nombre: string;
    readonly puedes_dar: boolean;
  }[];
};

export type RolesCatalog = {
  readonly roles: readonly RoleDetail[];
  readonly catalogo: readonly PermissionGroup[];
};

/** Mensaje del error al guardar o borrar un rol. */
export function roleErrorMessage(reason: string | undefined): string {
  switch (reason) {
    case "duplicate_name":
      return "Ya hay un rol con ese nombre.";
    case "role_in_use":
      return "Ese rol está asignado a alguien: cámbiale el rol antes de borrarlo.";
    case "pending_invites":
      return "Hay invitaciones pendientes con ese rol: anúlalas antes de borrarlo.";
    case "role_above_yours":
      return "No puedes dar permisos que tú no tienes.";
    case "template_role":
      return "Los roles de EasyOrder no se pueden cambiar. Crea uno propio.";
    default:
      return "No se pudo guardar el rol. Revisa los datos.";
  }
}

export function roleSummary(role: Pick<TeamRole, "code" | "permisos">): string {
  return (
    ROLE_SUMMARY[role.code] ?? `${role.permisos.length} permisos (rol propio del restaurante).`
  );
}

export function inviteLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/panel/unirse/${token}`;
}

/** Mensaje para compartir por WhatsApp o email. */
export function inviteMessage(restaurant: string, role: string, link: string): string {
  return `Te invito al panel de ${restaurant} en EasyOrder como ${role.toLowerCase()}. Entra con este enlace (personal, caduca en unos días): ${link}`;
}

export function branchesLabel(
  locales: "todos" | readonly number[],
  names: ReadonlyMap<number, string>,
): string {
  if (locales === "todos") return "Todos los locales";
  return locales.map((id) => names.get(id) ?? "Local").join(", ");
}

const TEAM_ERROR: Readonly<Record<string, string>> = {
  name_required: "Escribe el nombre.",
  already_member: "Esa persona ya forma parte del equipo.",
  role_above_yours: "No puedes asignar un rol con más permisos que el tuyo.",
  branch_out_of_scope: "No puedes asignar locales que tú no gestionas.",
  unknown_role: "Ese rol ya no existe. Recarga la página.",
  unknown_branch: "Ese local no está disponible.",
  self_change: "No puedes cambiar ni quitar tu propio acceso.",
  last_owner: "El restaurante necesita al menos un propietario.",
};

export function teamErrorMessage(reason: string | undefined): string {
  return (reason && TEAM_ERROR[reason]) || "No se pudo completar la acción. Inténtalo de nuevo.";
}

const INVITE_STATE_TEXT: Readonly<Record<InvitePreview["estado"], string>> = {
  valida: "",
  usada: "Esta invitación ya se usó.",
  caducada: "Esta invitación ha caducado. Pide una nueva a quien te invitó.",
  anulada: "Esta invitación se anuló. Pide una nueva a quien te invitó.",
  otro_email: "Esta invitación es para otro email. Entra con la cuenta a la que te invitaron.",
  ya_miembro: "Ya formas parte de este restaurante.",
};

export function inviteStateText(state: InvitePreview["estado"]): string {
  return INVITE_STATE_TEXT[state];
}
