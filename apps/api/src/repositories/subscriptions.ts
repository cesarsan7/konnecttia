import type { TransactionSql } from "postgres";
import type { Sql } from "../lib/db";
import { applyPlan } from "./platform";

type Tx = TransactionSql;

export const SUBSCRIPTION_STATE = {
  Incomplete: "incompleta",
  Active: "activa",
  PastDue: "impago",
  Cancelled: "cancelada",
} as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATE)[keyof typeof SUBSCRIPTION_STATE];

export type SubscriptionRow = {
  readonly restaurante_id: number;
  readonly stripe_customer_id: string | null;
  readonly plan_code: string | null;
  readonly estado: SubscriptionState;
  readonly periodo_fin: Date | null;
  readonly cancelar_al_final: boolean;
};

export async function loadSubscription(
  sql: Sql | Tx,
  restauranteId: number,
): Promise<SubscriptionRow | null> {
  const [row] = await sql<SubscriptionRow[]>`
    SELECT restaurante_id, stripe_customer_id, plan_code, estado, periodo_fin, cancelar_al_final
    FROM   public.suscripcion WHERE restaurante_id = ${restauranteId}
  `;
  return row ?? null;
}

/** Estado de Stripe → estado de Konnecttia. */
export function stateFromStripe(status: string): SubscriptionState {
  switch (status) {
    case "active":
    case "trialing":
      return SUBSCRIPTION_STATE.Active;
    case "past_due":
    case "unpaid":
      return SUBSCRIPTION_STATE.PastDue;
    case "canceled":
      return SUBSCRIPTION_STATE.Cancelled;
    default:
      return SUBSCRIPTION_STATE.Incomplete;
  }
}

type StripeObject = Record<string, unknown>;
export type StripeEvent = {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: StripeObject };
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export type SubscriptionOutcome = {
  readonly handled: boolean;
  readonly restauranteId: number | null;
  readonly detail?: string;
};

/**
 * Aplica un evento del webhook de Stripe. Idempotente (por id de evento) y todo en una
 * transacción. Ignora los tipos que no usamos. `planByPrice` traduce un precio de Stripe al plan.
 */
export async function applyStripeEvent(
  sql: Sql,
  event: StripeEvent,
  planByPrice: ReadonlyMap<string, string>,
  now: Date,
): Promise<SubscriptionOutcome> {
  return sql.begin(async (tx) => {
    const [fresh] = await tx<{ id: string }[]>`
      INSERT INTO public.stripe_evento (id, tipo) VALUES (${event.id}, ${event.type})
      ON CONFLICT (id) DO NOTHING RETURNING id
    `;
    if (!fresh) return { handled: false, restauranteId: null, detail: "duplicado" };
    const object = event.data.object;

    if (event.type === "checkout.session.completed") {
      const restauranteId = Number(text(object.client_reference_id));
      const metadata = (object.metadata ?? {}) as StripeObject;
      const plan = text(metadata.plan);
      if (!Number.isInteger(restauranteId) || !plan) {
        return { handled: false, restauranteId: null, detail: "sin_referencia" };
      }
      const [exists] = await tx`SELECT 1 FROM public.restaurante WHERE id = ${restauranteId}`;
      const [planOk] = await tx`SELECT 1 FROM public.plan WHERE code = ${plan}`;
      if (!exists || !planOk) return { handled: false, restauranteId, detail: "desconocido" };
      await tx`
        INSERT INTO public.suscripcion
          (restaurante_id, stripe_customer_id, stripe_subscription_id, plan_code, estado, updated_at)
        VALUES (${restauranteId}, ${text(object.customer)}, ${text(object.subscription)}, ${plan},
                ${SUBSCRIPTION_STATE.Active}, ${now}::timestamptz)
        ON CONFLICT (restaurante_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          plan_code = EXCLUDED.plan_code, estado = EXCLUDED.estado,
          updated_at = EXCLUDED.updated_at
      `;
      await applyPlan(tx, restauranteId, plan, now);
      // Si estaba en prueba, deja de estarlo.
      await tx`
        UPDATE public.restaurante_prueba SET estado = 'convertida', updated_at = ${now}::timestamptz
        WHERE restaurante_id = ${restauranteId} AND estado = 'activa'
      `;
      return { handled: true, restauranteId, detail: `plan:${plan}` };
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscriptionId = text(object.id);
      const [row] = await tx<{ restaurante_id: number; plan_code: string | null }[]>`
        SELECT restaurante_id, plan_code FROM public.suscripcion
        WHERE stripe_subscription_id = ${subscriptionId}
      `;
      if (!row) return { handled: false, restauranteId: null, detail: "suscripcion_desconocida" };
      const state =
        event.type === "customer.subscription.deleted"
          ? SUBSCRIPTION_STATE.Cancelled
          : stateFromStripe(String(object.status ?? ""));
      const items = ((object.items as StripeObject | undefined)?.data ?? []) as StripeObject[];
      const priceId = text((items[0]?.price as StripeObject | undefined)?.id);
      const newPlan = (priceId && planByPrice.get(priceId)) || row.plan_code;
      const end = typeof object.current_period_end === "number" ? object.current_period_end : null;
      await tx`
        UPDATE public.suscripcion SET
          estado = ${state}, plan_code = ${newPlan},
          periodo_fin = ${end === null ? null : new Date(end * 1000)}::timestamptz,
          cancelar_al_final = ${object.cancel_at_period_end === true},
          updated_at = ${now}::timestamptz
        WHERE restaurante_id = ${row.restaurante_id}
      `;
      if (state === SUBSCRIPTION_STATE.Active && newPlan && newPlan !== row.plan_code) {
        await applyPlan(tx, row.restaurante_id, newPlan, now);
      }
      return { handled: true, restauranteId: row.restaurante_id, detail: `estado:${state}` };
    }

    if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
      const subscriptionId = text(object.subscription);
      const state =
        event.type === "invoice.paid" ? SUBSCRIPTION_STATE.Active : SUBSCRIPTION_STATE.PastDue;
      const [row] = await tx<{ restaurante_id: number }[]>`
        UPDATE public.suscripcion SET estado = ${state}, updated_at = ${now}::timestamptz
        WHERE stripe_subscription_id = ${subscriptionId} AND estado <> 'cancelada'
        RETURNING restaurante_id
      `;
      return row
        ? { handled: true, restauranteId: row.restaurante_id, detail: `estado:${state}` }
        : { handled: false, restauranteId: null, detail: "suscripcion_desconocida" };
    }

    return { handled: false, restauranteId: null, detail: "tipo_ignorado" };
  });
}
