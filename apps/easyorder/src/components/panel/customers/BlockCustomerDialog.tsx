"use client";

import { useState } from "react";
import { BLOCK_REASON_MAX, blockCustomerError } from "@/lib/panel/customers";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";
import "./block-customer.css";

/** Confirmación de «Bloquear»: el teléfono deja de poder pedir por la web, con motivo opcional. */
export function BlockCustomerDialog({
  customerId,
  name,
  onClose,
  onBlocked,
}: {
  readonly customerId: number;
  readonly name: string;
  readonly onClose: () => void;
  readonly onBlocked: () => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await api.blockCustomer(slug, customerId, reason);
    setBusy(false);
    if (result.ok) return onBlocked();
    setError(blockCustomerError(result.status, false));
  }

  return (
    <Modal title="Bloquear cliente" onClose={onClose}>
      <div className="k-editor">
        <p>
          <strong>{name}</strong> no podrá hacer pedidos por la web. Si lo intenta, verá un aviso
          neutro y le sugeriremos llamar al local; no sabrá que está bloqueado.
        </p>
        <p className="block-customer-note k-small">
          Vale para todos los locales del restaurante. Los pedidos por teléfono o mostrador siguen
          funcionando y puedes desbloquearlo cuando quieras.
        </p>
        <label className="k-field">
          <span>
            Motivo <span className="k-muted k-optional">(opcional, solo lo ve tu equipo)</span>
          </span>
          <textarea
            value={reason}
            maxLength={BLOCK_REASON_MAX}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="k-dialog-actions">
          <button type="button" className="k-btn k-btn-secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="k-btn k-btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "Bloqueando…" : "Bloquear"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
