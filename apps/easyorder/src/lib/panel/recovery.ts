/**
 * A dónde volver tras crear la contraseña nueva. «¿Olvidaste tu contraseña?» en /interno y en
 * /alta abre el formulario del panel con `?volver=interno|alta`; se recuerda en el navegador
 * (el enlace del email suele abrirse en otra pestaña) y se usa una sola vez.
 */
const RETURN_KEY = "easyorder.recuperar.volver";

export const RETURN_PATHS = { interno: "/interno", alta: "/alta" } as const;
type ReturnTarget = keyof typeof RETURN_PATHS;

export function parseReturnTarget(value: string | null): ReturnTarget | null {
  return value !== null && Object.hasOwn(RETURN_PATHS, value) ? (value as ReturnTarget) : null;
}

export function rememberReturn(target: ReturnTarget | null) {
  try {
    if (target) localStorage.setItem(RETURN_KEY, target);
    else localStorage.removeItem(RETURN_KEY);
  } catch {
    // Navegación privada: se decide con los datos de la cuenta.
  }
}

/** Lee y borra el destino recordado. */
export function takeReturn(): ReturnTarget | null {
  try {
    const target = parseReturnTarget(localStorage.getItem(RETURN_KEY));
    localStorage.removeItem(RETURN_KEY);
    return target;
  } catch {
    return null;
  }
}

/**
 * Destino final: el recordado; si no hay, el panel interno para quien es del equipo de
 * Konnecttia y no pertenece a ningún restaurante; si no, el panel.
 */
export function resetDestination(input: {
  readonly remembered: ReturnTarget | null;
  readonly restaurants: number | null;
  readonly platformMember: boolean;
}): string {
  if (input.remembered) return RETURN_PATHS[input.remembered];
  if (input.platformMember && input.restaurants === 0) return RETURN_PATHS.interno;
  return "/panel";
}
