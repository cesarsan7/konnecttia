"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type Billing,
  billingNotice,
  periodEnd,
  planLabel,
  STATE_LABEL,
} from "@/lib/panel/billing";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";
import "./billing-section.css";

const PLAN_PITCH: Readonly<Record<string, string>> = {
  basico: "Carta online, pedidos web, reparto y clientes.",
  premium: "Todo lo del Básico más mesas, estadísticas y los módulos avanzados.",
};

/**
 * Plan y facturación: estado de la suscripción y acceso al pago (Stripe Checkout) y al portal del
 * cliente de Stripe. La tarjeta se introduce en Stripe; Konnecttia nunca la ve.
 */
export function BillingSection({ editable }: { readonly editable: boolean }) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.billing(slug);
    if (result.ok) setBilling(result.data);
    else setError("No se pudo cargar el plan. Inténtalo de nuevo.");
  }, [api, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function go(key: string, call: () => ReturnType<typeof api.billingPay>) {
    setBusy(key);
    setError(null);
    const result = await call();
    if (result.ok) {
      window.location.assign(result.data.url);
      return;
    }
    setBusy(null);
    setError(
      result.status === 409
        ? "Ya tienes una suscripción activa. Usa «Gestionar suscripción»."
        : "No se pudo abrir el pago. Inténtalo de nuevo en un momento.",
    );
  }

  if (!billing) {
    return (
      <section className="k-card k-settings">
        <h2>Plan y facturación</h2>
        <p className="k-note">{error ?? "Cargando…"}</p>
      </section>
    );
  }

  const sub = billing.suscripcion;
  const notice = billingNotice(billing);
  const end = periodEnd(sub?.periodo_fin ?? null);
  const paying = sub?.estado === "activa" || sub?.estado === "impago";

  return (
    <section className="k-card k-settings" data-tour="ajustes-facturacion">
      <h2>Plan y facturación</h2>
      <p>
        Plan actual: <strong>{planLabel(billing.plan_actual)}</strong>
        {sub ? ` · ${STATE_LABEL[sub.estado]}` : ""}
        {paying && end && !sub?.cancelar_al_final ? ` · próxima renovación el ${end}` : ""}
      </p>
      {notice ? (
        <p className="k-note" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="k-alert" role="alert">
          {error}
        </p>
      ) : null}
      {!billing.disponible ? (
        <p className="k-note">
          El pago online todavía no está activo. Konnecttia te asigna el plan; escríbenos para
          cambiarlo.
        </p>
      ) : null}
      {billing.disponible && editable && !paying ? (
        <ul className="k-plans">
          {billing.planes_de_pago.map((plan) => (
            <li key={plan}>
              <strong>{planLabel(plan)}</strong>
              <span>{PLAN_PITCH[plan] ?? ""}</span>
              <button
                type="button"
                className="k-btn"
                disabled={busy !== null}
                onClick={() => go(plan, () => api.billingPay(slug, plan))}
              >
                {busy === plan ? "Abriendo…" : `Contratar ${planLabel(plan)}`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {billing.disponible && editable && sub?.tiene_portal ? (
        <button
          type="button"
          className="k-btn"
          disabled={busy !== null}
          onClick={() => go("portal", () => api.billingPortal(slug))}
        >
          {busy === "portal" ? "Abriendo…" : "Gestionar suscripción"}
        </button>
      ) : null}
      <p className="k-note">
        El pago lo gestiona Stripe: Konnecttia no ve ni guarda los datos de tu tarjeta. Desde
        «Gestionar suscripción» puedes cambiar de tarjeta, descargar facturas o cancelar.
      </p>
    </section>
  );
}
