"use client";

import { useState } from "react";
import { deleteCustomerError } from "@/lib/panel/customers";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";
import "./delete-customer.css";

/** Confirmación de «Borrar datos del cliente»: anonimiza su perfil y sus pedidos. */
export function DeleteCustomerDialog({
  customerId,
  name,
  onClose,
  onDeleted,
}: {
  readonly customerId: number;
  readonly name: string;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await api.deleteCustomer(slug, customerId);
    setBusy(false);
    if (result.ok) return onDeleted();
    setError(
      deleteCustomerError(result.status, (result.body as { reason?: string } | null)?.reason),
    );
  }

  return (
    <Modal title="Borrar datos del cliente" onClose={onClose}>
      <div className="k-editor">
        <p>
          Vas a borrar los datos personales de <strong>{name}</strong>: nombre, teléfono,
          direcciones y notas, tanto del perfil como de sus pedidos.
        </p>
        <p className="delete-customer-keep k-small">
          Los pedidos se conservan con su importe y su fecha, pero sin identificar a la persona.
        </p>
        <p className="delete-customer-warning" role="alert">
          No se puede deshacer.
        </p>
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
            {busy ? "Borrando…" : "Borrar datos"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
