"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { deleteConfirmed, platformErrorMessage } from "@/lib/interno/logic";
import type { RestaurantDetail as Detail } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./lifecycle-section.css";

/** Clonar (crear a partir de este) y borrar. Borrar es irreversible y pide escribir el enlace. */
export function LifecycleSection({ detail }: { readonly detail: Detail }) {
  const { api, canWrite } = usePlatform();
  const router = useRouter();
  const restaurant = detail.restaurante;
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) return null;
  const expected = restaurant.slug ?? String(restaurant.id);
  const orders = detail.pedidos_total ?? 0;

  async function remove(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!deleteConfirmed(typed, restaurant.slug, restaurant.id)) return;
    setBusy(true);
    const result = await api.deleteRestaurant(restaurant.id, typed.trim());
    setBusy(false);
    if (result.ok) {
      router.replace("/interno");
      return;
    }
    setError(platformErrorMessage(result.status, result.body));
  }

  return (
    <section className="k-card k-rd-section k-lc" aria-labelledby="rd-ciclo">
      <h2 id="rd-ciclo" className="k-title">
        Clonar y borrar
      </h2>

      <div className="k-lc-block">
        <p className="k-muted k-small">
          Crea otro restaurante usando este como plantilla (carta, horario, zonas de reparto y
          ajustes). Eliges qué copiar en el formulario.
        </p>
        <Link href={`/interno/nuevo?clonar=${restaurant.id}`} className="k-btn k-btn-secondary">
          Crear un restaurante a partir de este
        </Link>
      </div>

      <form className="k-lc-block k-lc-danger" onSubmit={(event) => void remove(event)}>
        <h3 className="k-lc-danger-title">Borrar este restaurante</h3>
        <p className="k-small">
          Se borra para siempre, con su carta, equipo, clientes y{" "}
          <strong>
            {orders} {orders === 1 ? "pedido" : "pedidos"}
          </strong>
          . La auditoría se conserva. Los archivos subidos (logo, fotos, justificantes) no se
          eliminan del almacenamiento.
        </p>
        <label className="k-field">
          <span>
            Para confirmar, escribe <code>{expected}</code>
          </span>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="k-btn k-btn-danger"
          disabled={busy || !deleteConfirmed(typed, restaurant.slug, restaurant.id)}
        >
          {busy ? "Borrando…" : "Borrar para siempre"}
        </button>
      </form>
    </section>
  );
}
