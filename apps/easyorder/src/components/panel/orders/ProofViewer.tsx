"use client";

import "./proof-viewer.css";
import { useState } from "react";
import {
  describeProofViewError,
  type OrderProof,
  proofIndicator,
  proofLinkLabel,
} from "@/lib/panel/proofs";
import { Icon } from "../Icon";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

type Props = {
  readonly orderId: number;
  /** Justificantes que ha subido el cliente (0 = no se muestra nada). */
  readonly count: number;
};

/**
 * «Justificante recibido» + «Ver justificante». El panel no guarda ninguna URL: cada vez que se
 * pulsa el botón pide a la API URLs firmadas de pocos minutos y las enseña como enlaces.
 */
export function ProofViewer({ orderId, count }: Props) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [loading, setLoading] = useState(false);
  const [proofs, setProofs] = useState<readonly OrderProof[] | null>(null);
  const [expires, setExpires] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const indicator = proofIndicator(count);
  if (!indicator) return null;

  async function open() {
    setLoading(true);
    setError(null);
    const result = await api.orderProofs(slug, orderId);
    setLoading(false);
    if (!result.ok) {
      setProofs(null);
      setError(describeProofViewError(result.status, result.body));
      return;
    }
    setProofs(result.data.justificantes);
    setExpires(result.data.expira_en_segundos);
  }

  return (
    <div className="k-proof">
      <span className="k-chip k-proof-chip">
        <Icon name="check" size={14} />
        {indicator}
      </span>
      <button
        type="button"
        className="k-btn k-btn-secondary k-btn-sm"
        disabled={loading}
        onClick={open}
      >
        {loading ? "Abriendo…" : "Ver justificante"}
      </button>
      {proofs ? (
        <div className="k-proof-links">
          <ul>
            {proofs.map((proof, index) => (
              <li key={proof.id}>
                <a href={proof.url} target="_blank" rel="noreferrer noopener">
                  {proofLinkLabel(index, proof)}
                </a>
              </li>
            ))}
          </ul>
          <p className="k-small k-muted">
            Los enlaces caducan en {Math.round(expires / 60)} min. Vuelve a pulsar para renovarlos.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="k-proof-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
