"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { deleteConfirmed, platformErrorMessage } from "@/lib/interno/logic";
import type { RestaurantDetail as Detail } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./lifecycle-section.css";
import { HelpNote } from "@/components/HelpNote";
import { INTERNO_HELP } from "@/lib/interno/help";

/** Clonar (crear a partir de este) y borrar. Borrar es irreversible y pide escribir el enlace. */
export function LifecycleSection({ detail }: { readonly detail: Detail }) {
  const { api, canWrite, toast } = usePlatform();
  const router = useRouter();
  const restaurant = detail.restaurante;
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purgeTyped, setPurgeTyped] = useState("");
  const [purgeBefore, setPurgeBefore] = useState("");
  const [purgeParts, setPurgeParts] = useState({
    carritos: false,
    derivaciones: false,
    conversaciones: false,
  });
  const [purgeError, setPurgeError] = useState<string | null>(null);

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
      const orphans = result.data.cuentas_sin_uso.length;
      if (orphans > 0) {
        // Las cuentas de Supabase no se borran solas: se avisa y se revisan en «Equipo».
        toast(
          `Restaurante borrado. ${orphans} ${orphans === 1 ? "cuenta quedó" : "cuentas quedaron"} sin ningún uso: revísalas en Equipo.`,
        );
        router.replace("/interno/equipo#cuentas");
        return;
      }
      router.replace("/interno");
      return;
    }
    setError(platformErrorMessage(result.status, result.body));
  }

  async function purge(event: FormEvent) {
    event.preventDefault();
    setPurgeError(null);
    if (!deleteConfirmed(purgeTyped, restaurant.slug, restaurant.id)) return;
    setBusy(true);
    const result = await api.purgeOrders(restaurant.id, {
      confirmar: purgeTyped.trim(),
      ...(purgeBefore ? { antes_de: new Date(`${purgeBefore}T00:00:00`).toISOString() } : {}),
      ...purgeParts,
    });
    setBusy(false);
    if (result.ok) {
      const { pedidos, carritos, derivaciones, conversaciones } = result.data;
      toast(
        `Purga hecha: ${pedidos} pedidos, ${carritos} carritos, ${derivaciones} derivaciones y ${conversaciones} registros de conversación.`,
      );
      setPurgeTyped("");
      router.refresh();
      return;
    }
    setPurgeError(platformErrorMessage(result.status, result.body));
  }

  return (
    <section className="k-card k-rd-section k-lc" aria-labelledby="rd-ciclo">
      <h2 id="rd-ciclo" className="k-title">
        Clonar y borrar
      </h2>
      <HelpNote items={INTERNO_HELP.ciclo} />

      <div className="k-lc-block">
        <p className="k-muted k-small">
          Crea otro restaurante usando este como plantilla (carta, horario, zonas de reparto y
          ajustes). Eliges qué copiar en el formulario.
        </p>
        <Link href={`/interno/nuevo?clonar=${restaurant.id}`} className="k-btn k-btn-secondary">
          Crear un restaurante a partir de este
        </Link>
      </div>

      {detail.purga_pedidos_permitida ? (
        <form className="k-lc-block k-lc-danger" onSubmit={(event) => void purge(event)}>
          <h3 className="k-lc-danger-title">Purgar pedidos de prueba</h3>
          <p className="k-small">
            Borra los pedidos de este restaurante ({orders} ahora) con sus justificantes,
            incidencias y registros. No toca la carta, el equipo, los clientes ni los ajustes.
            Disponible solo en staging.
          </p>
          <label className="k-field">
            <span>Solo los anteriores a (opcional)</span>
            <input
              type="date"
              value={purgeBefore}
              onChange={(event) => setPurgeBefore(event.target.value)}
            />
          </label>
          {(
            [
              ["carritos", "También los carritos del agente"],
              ["derivaciones", "También las derivaciones del agente"],
              ["conversaciones", "También la memoria de las conversaciones del agente (todas)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="k-check">
              <input
                type="checkbox"
                checked={purgeParts[key]}
                onChange={(event) => setPurgeParts({ ...purgeParts, [key]: event.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
          <label className="k-field">
            <span>
              Para confirmar, escribe <code>{expected}</code>
            </span>
            <input
              value={purgeTyped}
              onChange={(event) => setPurgeTyped(event.target.value)}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {purgeError ? (
            <p className="k-alert" role="alert">
              {purgeError}
            </p>
          ) : null}
          <button
            type="submit"
            className="k-btn k-btn-danger"
            disabled={busy || !deleteConfirmed(purgeTyped, restaurant.slug, restaurant.id)}
          >
            {busy ? "Purgando…" : "Purgar pedidos"}
          </button>
        </form>
      ) : null}

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
