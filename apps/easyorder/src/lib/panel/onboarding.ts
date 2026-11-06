/** Checklist de primeros pasos del panel (pieza G): qué falta por configurar. */

/** `GET /panel/:slug/primeros-pasos`. `zonas` es null si el restaurante no ofrece reparto. */
export type FirstSteps = {
  readonly pasos: {
    readonly logo: boolean;
    readonly carta: boolean;
    readonly horario: boolean;
    readonly pagos: boolean;
    readonly zonas: boolean | null;
    readonly equipo: boolean;
  };
};

export type ChecklistItem = {
  readonly id: "logo" | "carta" | "horario" | "pagos" | "zonas" | "equipo";
  readonly label: string;
  readonly done: boolean;
  /** Pantalla donde se resuelve. */
  readonly href: string;
  /** Permiso necesario para abrir esa pantalla (si el rol no lo tiene, no se enlaza). */
  readonly permission: string;
};

/** Permisos (los mismos códigos que `PERMISSION` del panel) que abren cada pantalla. */
const NEEDS = {
  Settings: "settings.view",
  Menu: "menu.view",
  Delivery: "delivery.view",
  Team: "team.view",
} as const;

/** Construye los ítems del checklist; «zonas» solo aparece si el restaurante reparte. */
export function checklistItems(steps: FirstSteps["pasos"], base: string): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: "logo",
      label: "Sube tu logo",
      done: steps.logo,
      href: `${base}/ajustes`,
      permission: NEEDS.Settings,
    },
    {
      id: "carta",
      label: "Añade al menos un producto a la carta",
      done: steps.carta,
      href: `${base}/carta`,
      permission: NEEDS.Menu,
    },
    {
      id: "horario",
      label: "Define tu horario",
      done: steps.horario,
      href: `${base}/ajustes`,
      permission: NEEDS.Settings,
    },
    {
      id: "pagos",
      label: "Elige cómo cobras",
      done: steps.pagos,
      href: `${base}/ajustes`,
      permission: NEEDS.Settings,
    },
  ];
  if (steps.zonas !== null) {
    items.push({
      id: "zonas",
      label: "Crea tus zonas de reparto",
      done: steps.zonas,
      href: `${base}/ajustes`,
      permission: NEEDS.Delivery,
    });
  }
  items.push({
    id: "equipo",
    label: "Invita a tu equipo",
    done: steps.equipo,
    href: `${base}/equipo`,
    permission: NEEDS.Team,
  });
  return items;
}

export function checklistProgress(items: readonly ChecklistItem[]): {
  readonly done: number;
  readonly total: number;
  readonly complete: boolean;
} {
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}

/** Preferencias del checklist en este navegador (por restaurante). */
export type ChecklistPrefs = { readonly hidden: boolean; readonly collapsed: boolean };

export const DEFAULT_PREFS: ChecklistPrefs = { hidden: false, collapsed: false };

const PREFS_KEY = (slug: string) => `easyorder.panel.primeros-pasos.${slug}`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Lee las preferencias; sin almacenamiento (o con datos raros) devuelve las de por defecto. */
export function readChecklistPrefs(
  slug: string,
  storage: StorageLike | null = defaultStorage(),
): ChecklistPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY(slug));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ChecklistPrefs> | null;
    return { hidden: parsed?.hidden === true, collapsed: parsed?.collapsed === true };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Guarda las preferencias. Navegación privada o almacenamiento bloqueado: no pasa nada. */
export function saveChecklistPrefs(
  slug: string,
  prefs: ChecklistPrefs,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(PREFS_KEY(slug), JSON.stringify(prefs));
  } catch {
    // Se vuelve a mostrar la próxima vez: no es grave.
  }
}
