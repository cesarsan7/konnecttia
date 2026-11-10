/** Respuestas de GET /panel/:slug/facturacion (apps/api/src/routes/panel-billing.ts). */

export type SubscriptionState = "incompleta" | "activa" | "impago" | "cancelada";

export type Billing = {
  /** false si la plataforma aún no tiene Stripe configurado: el plan lo asigna Konnecttia. */
  readonly disponible: boolean;
  readonly plan_actual: string | null;
  readonly planes_de_pago: readonly string[];
  readonly suscripcion: {
    readonly plan: string | null;
    readonly estado: SubscriptionState;
    readonly periodo_fin: string | null;
    readonly cancelar_al_final: boolean;
    readonly tiene_portal: boolean;
  } | null;
};

export const PLAN_LABEL: Readonly<Record<string, string>> = {
  prueba: "Prueba gratuita",
  basico: "Básico",
  premium: "Premium",
};

export const planLabel = (code: string | null): string =>
  code ? (PLAN_LABEL[code] ?? code) : "Sin plan";

export const STATE_LABEL: Readonly<Record<SubscriptionState, string>> = {
  incompleta: "Pago sin completar",
  activa: "Activa",
  impago: "Pago pendiente",
  cancelada: "Cancelada",
};

/** «15 de diciembre de 2026» o null si no hay fecha. */
export function periodEnd(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

/** Mensaje de la franja superior según el estado de la suscripción. */
export function billingNotice(billing: Billing): string | null {
  const sub = billing.suscripcion;
  if (!sub) return null;
  if (sub.estado === "impago")
    return "No pudimos cobrar la última cuota. Actualiza la tarjeta en «Gestionar suscripción».";
  if (sub.estado === "cancelada") return "La suscripción está cancelada.";
  const end = periodEnd(sub.periodo_fin);
  if (sub.cancelar_al_final && end) return `Se cancelará el ${end}; hasta entonces sigue activa.`;
  return null;
}
