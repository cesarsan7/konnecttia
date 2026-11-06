import { type AccessContext, can, PERMISSION } from "@konnecttia/access";
import { z } from "zod";

/** Longitud máxima de nombre y apodo (coincide con el CHECK de la migración 0018). */
export const MEMBER_NAME_MAX = 80;

/** Motivo (`reason`) del 400 cuando falta el nombre. */
export const NAME_REQUIRED_REASON = "name_required";

const optionalText = z
  .string()
  .trim()
  .max(MEMBER_NAME_MAX)
  .nullish()
  .transform((value) => (value ? value : null));

/** Nombre (obligatorio) y apodo (opcional) de una persona del equipo. */
export const memberNameSchema = z.object({
  nombre: z.string().trim().min(1).max(MEMBER_NAME_MAX),
  apodo: optionalText,
});

/** Lo que se muestra en el panel: apodo, si no nombre, si no nada (la UI usa entonces el email). */
export function displayName(apodo: string | null, nombre: string | null): string | null {
  return apodo ?? nombre ?? null;
}

/**
 * El email de otras personas del equipo solo lo ven quienes pueden ver o gestionar el equipo
 * (módulo «equipo» activo). El resto de pantallas usan el nombre.
 */
export function canSeeMemberEmails(access: AccessContext): boolean {
  return can(access, PERMISSION.TeamView) || can(access, PERMISSION.TeamManage);
}
