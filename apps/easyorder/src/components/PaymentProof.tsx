"use client";

import { useEffect, useRef, useState } from "react";
import type { Api } from "@/lib/api";
import {
  describeProofError,
  PROOF_ACCEPT,
  paymentConcept,
  paymentDetailRows,
  paymentTitle,
  proofProblem,
  proofProblemMessage,
  proofStatusText,
} from "@/lib/payment-proof";
import { copyText } from "@/lib/tracking";
import type { TrackedOrder } from "@/lib/types";
import "./payment-proof.css";

const COPIED_MS = 3_000;

type Props = {
  readonly api: Api;
  readonly token: string;
  readonly order: TrackedOrder;
  /** Tras subir un justificante: vuelve a pedir el pedido para actualizar el recuento. */
  readonly onUploaded: () => void;
};

/** Botón que copia un texto y avisa. Sin permiso del navegador, deja el texto seleccionable. */
function CopyButton({ text, label }: { readonly text: string; readonly label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    setState((await copyText(text, navigator.clipboard)) ? "copied" : "failed");
  }

  return (
    <>
      <button type="button" className="btn pay-copy" onClick={copy} aria-label={label}>
        Copiar
      </button>
      <span className="pay-copy-state" role="status">
        {state === "copied" ? "Copiado" : state === "failed" ? "Cópialo a mano" : ""}
      </span>
    </>
  );
}

/**
 * Cómo pagar un pedido de Bizum o transferencia: datos del local, concepto (el código del
 * pedido) y subida del justificante. Se muestra solo mientras el cobro está pendiente.
 */
export function PaymentProof({ api, token, order, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = paymentDetailRows(order.datosBancarios);
  const concept = paymentConcept(order.pedidoCodigo);
  const sent = proofStatusText(order.justificantes);

  async function upload(file: File) {
    const problem = proofProblem(file);
    if (problem) {
      setError(proofProblemMessage(problem));
      return;
    }
    setUploading(true);
    setError(null);
    const result = await api.uploadProof(token, file);
    setUploading(false);
    if (input.current) input.current.value = "";
    if (!result.ok) {
      setError(describeProofError(result.status, result.body));
      return;
    }
    onUploaded();
  }

  return (
    <section className="group card pay" aria-label="Pago del pedido">
      <h2>{paymentTitle(order.metodoPago)}</h2>

      {rows.length > 0 && (
        <dl className="pay-rows">
          {rows.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>
                <span className="pay-value">{row.value}</span>
                <CopyButton text={row.value} label={`Copiar ${row.label}`} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {concept && (
        <div className="pay-concept">
          <p className="pay-concept-text">
            Concepto: <strong>{concept}</strong>
          </p>
          <CopyButton text={concept} label="Copiar el concepto" />
        </div>
      )}
      <p className="muted small">
        {concept ? "Pon ese concepto en el pago para que el local lo reconozca. " : ""}
        Prepararán el pedido cuando confirmen el cobro.
      </p>

      <div className="pay-proof">
        {sent && (
          <p className="pay-sent" role="status">
            {sent}
          </p>
        )}
        {order.aceptaJustificante && (
          <>
            <input
              ref={input}
              id="justificante"
              className="pay-file"
              type="file"
              accept={PROOF_ACCEPT}
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <label
              htmlFor="justificante"
              className={`btn pay-upload${uploading ? " is-busy" : ""}`}
              aria-disabled={uploading}
            >
              {uploading
                ? "Subiendo…"
                : order.justificantes > 0
                  ? "Subir otro justificante"
                  : "Subir justificante"}
            </label>
            <p className="muted small">Imagen (JPG, PNG, WebP) o PDF, de hasta 5 MB.</p>
          </>
        )}
        {error && (
          <p className="pay-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
