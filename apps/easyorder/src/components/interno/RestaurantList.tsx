"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { platformErrorMessage } from "@/lib/interno/logic";
import type { RestaurantRow } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./restaurant-list.css";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly rows: readonly RestaurantRow[] }
  | { readonly kind: "error"; readonly message: string };

/** Pausa tras la última tecla antes de buscar. */
const SEARCH_DELAY_MS = 250;

const dateTime = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

export function RestaurantList() {
  const { api, canWrite } = usePlatform();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` fuerza «Reintentar»
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const result = await api.restaurants(query);
      if (!active) return;
      setState(
        result.ok
          ? { kind: "ready", rows: result.data.restaurantes }
          : { kind: "error", message: platformErrorMessage(result.status, result.body) },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, query, attempt]);

  return (
    <div className="k-page">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">Konnecttia</p>
          <h1 className="k-heading">Restaurantes</h1>
        </div>
        {canWrite ? (
          <div className="k-head-tools">
            <Link href="/interno/nuevo" className="k-btn k-btn-primary k-rl-new">
              Nuevo restaurante
            </Link>
          </div>
        ) : null}
      </header>

      <label className="k-field k-rl-search">
        <span className="k-sr-only">Buscar restaurante</span>
        <input
          type="search"
          placeholder="Buscar por nombre o enlace"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {state.kind === "loading" ? (
        <div className="k-skeleton k-skeleton-tall" aria-busy="true" />
      ) : state.kind === "error" ? (
        <div className="k-card">
          <p className="k-alert" role="alert">
            {state.message}
          </p>
          <button
            type="button"
            className="k-btn k-btn-secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : state.rows.length === 0 ? (
        <p className="k-card k-muted">
          {query.trim()
            ? "Ningún restaurante coincide con la búsqueda."
            : "Aún no hay restaurantes."}
        </p>
      ) : (
        <ul className="k-rl-list">
          {state.rows.map((row) => (
            <li key={row.id}>
              <Link href={`/interno/${row.id}`} className="k-card k-rl-row">
                <span className="k-rl-main">
                  <strong className="k-rl-name">{row.nombre}</strong>
                  <span className="k-muted k-small k-ellipsis">/{row.slug ?? "sin enlace"}</span>
                </span>
                <span className="k-rl-plan">{row.plan ?? "Sin plan"}</span>
                <dl className="k-rl-stats">
                  <div>
                    <dt>Locales</dt>
                    <dd>{row.locales}</dd>
                  </div>
                  <div>
                    <dt>Equipo</dt>
                    <dd>{row.miembros}</dd>
                  </div>
                  <div>
                    <dt>Pedidos 30 días</dt>
                    <dd>{row.pedidos_30d}</dd>
                  </div>
                  <div>
                    <dt>Último pedido</dt>
                    <dd>
                      {row.ultimo_pedido ? dateTime.format(new Date(row.ultimo_pedido)) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Alta</dt>
                    <dd>{row.creado ? day.format(new Date(row.creado)) : "—"}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
