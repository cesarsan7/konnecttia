"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { platformErrorMessage } from "@/lib/interno/logic";
import type { RestaurantDetail as Detail } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import { MenuImportSection } from "./MenuImportSection";
import { PaymentMethodsSection } from "./PaymentMethodsSection";
import { PlanModulesSection } from "./PlanModulesSection";
import "./restaurant-detail.css";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly detail: Detail }
  | { readonly kind: "error"; readonly status: number; readonly message: string };

const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

export function RestaurantDetail({ id }: { readonly id: number }) {
  const { api } = usePlatform();
  const [state, setState] = useState<Load>({ kind: "loading" });

  const load = useCallback(async () => {
    const result = await api.restaurant(id);
    setState(
      result.ok
        ? { kind: "ready", detail: result.data }
        : {
            kind: "error",
            status: result.status,
            message: platformErrorMessage(result.status, result.body),
          },
    );
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const back = (
    <Link href="/interno" className="k-link k-small">
      ← Todos los restaurantes
    </Link>
  );

  if (state.kind === "loading") {
    return (
      <div className="k-page" aria-busy="true">
        {back}
        <div className="k-skeleton k-skeleton-tall" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="k-page">
        {back}
        <div className="k-card">
          <p className="k-alert" role="alert">
            {state.message}
          </p>
          {state.status === 404 ? null : (
            <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  const { detail } = state;
  const restaurant = detail.restaurante;
  return (
    <div className="k-page">
      {back}
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">
            {detail.plan ? `Plan ${detail.plan.nombre}` : "Sin plan"} · alta{" "}
            {restaurant.creado ? day.format(new Date(restaurant.creado)) : "—"}
          </p>
          <h1 className="k-heading k-rd-name">{restaurant.nombre}</h1>
          <p className="k-muted k-small">
            /{restaurant.slug ?? "sin enlace"} · {restaurant.zona_horaria ?? "sin zona horaria"}
          </p>
        </div>
        {restaurant.slug ? (
          <div className="k-head-tools">
            <Link href={`/panel/${restaurant.slug}`} className="k-btn k-btn-secondary k-rd-open">
              Abrir su panel
            </Link>
            <p className="k-muted k-small k-rd-open-note">
              Solo te lleva a su pantalla de entrada: no da acceso si no eres de su equipo.
            </p>
          </div>
        ) : null}
      </header>

      <PlanModulesSection detail={detail} onChanged={load} />
      <PaymentMethodsSection detail={detail} onChanged={load} />
      <MenuImportSection detail={detail} onChanged={load} />

      <section className="k-card k-rd-section" aria-labelledby="rd-locales">
        <h2 id="rd-locales" className="k-title">
          Locales
        </h2>
        <ul className="k-rd-list">
          {detail.locales.map((branch) => (
            <li key={branch.id}>
              <strong>{branch.nombre}</strong>
              {branch.principal ? <span className="k-rd-chip">Principal</span> : null}
              {branch.activo ? null : <span className="k-rd-chip is-off">Inactivo</span>}
              <span className="k-muted k-small">
                {[branch.direccion, branch.telefono].filter(Boolean).join(" · ") ||
                  "Sin datos de contacto"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="k-card k-rd-section" aria-labelledby="rd-equipo">
        <h2 id="rd-equipo" className="k-title">
          Equipo
        </h2>
        <p className="k-muted k-small">Solo lectura. El equipo lo gestiona cada restaurante.</p>
        {detail.equipo.length === 0 ? (
          <p className="k-muted">Nadie ha aceptado todavía la invitación.</p>
        ) : (
          <ul className="k-rd-list">
            {detail.equipo.map((member) => (
              <li key={member.id}>
                <strong>{member.mostrar ?? member.email ?? "Sin nombre"}</strong>
                <span className="k-muted k-small k-rd-email">{member.email ?? "sin email"}</span>
                <span>
                  {member.roles.map((role) => (
                    <span key={role.id} className="k-rd-chip">
                      {role.nombre}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {detail.invitaciones_pendientes.length > 0 ? (
          <>
            <h3 className="k-subtitle">Invitaciones pendientes</h3>
            <ul className="k-rd-list">
              {detail.invitaciones_pendientes.map((invite) => (
                <li key={invite.id}>
                  <strong className="k-rd-email">{invite.email ?? "Cualquier email"}</strong>
                  <span className="k-rd-chip">{invite.rol ?? "Sin rol"}</span>
                  <span className="k-muted k-small">
                    caduca {day.format(new Date(invite.expires_at))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
