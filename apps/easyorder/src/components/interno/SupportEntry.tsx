"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { platformErrorMessage } from "@/lib/interno/logic";
import { usePlatform } from "./InternalShell";
import "./support-entry.css";

const MIN_REASON = 10;

/**
 * Entrar al panel de un restaurante ajeno para dar soporte: solo lectura, una hora, con motivo
 * obligatorio. Queda en la auditoría del restaurante.
 */
export function SupportEntry({ id }: { readonly id: number }) {
  const { api, toast } = usePlatform();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await api.enterSupport(id, reason.trim());
    if (!result.ok) {
      setBusy(false);
      return toast(platformErrorMessage(result.status, result.body), "error");
    }
    router.push(`/panel/${result.data.slug}`);
  }

  if (!open) {
    return (
      <div className="k-support-entry">
        <button type="button" className="k-btn k-btn-secondary" onClick={() => setOpen(true)}>
          Ver como soporte
        </button>
        <p className="k-muted k-small">
          Solo lectura durante una hora. Queda registrado en la auditoría del restaurante.
        </p>
      </div>
    );
  }
  return (
    <form className="k-support-entry" onSubmit={enter}>
      <label className="k-field">
        <span>Motivo (obligatorio)</span>
        <textarea
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej.: El restaurante reporta que un pedido no aparece en el tablero"
        />
      </label>
      <p className="k-muted k-small">
        Verás pedidos, carta, ajustes y equipo, sin datos de clientes ni poder cambiar nada.
      </p>
      <div className="k-support-actions">
        <button
          type="submit"
          className="k-btn k-btn-primary"
          disabled={busy || reason.trim().length < MIN_REASON}
        >
          Entrar en modo soporte
        </button>
        <button type="button" className="k-link k-small" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
