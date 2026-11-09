"use client";

import { useEffect, useId, useState } from "react";
import type { Api } from "@/lib/api";
import {
  CODE_SENT_FALLBACK_SECONDS,
  codeComplete,
  codeRequestBody,
  countdownLabel,
  describeCodeRequestError,
  describeConfirmError,
  normalizeCode,
} from "@/lib/verification";

type Props = {
  readonly api: Api;
  readonly slug: string;
  readonly restaurantName: string;
  /** Teléfono ya normalizado (+34…): el mismo del pedido. */
  readonly phone: string;
  readonly fulfillment: string;
  readonly payment: string;
  /** Total con el que el servidor decidió pedir el código. */
  readonly totalEuros: number;
  readonly captchaToken: string | null;
  /** Texto mientras el captcha no ha dado su token; null si no hace falta o ya está. */
  readonly captchaWaiting: string | null;
  /** El token del captcha es de un solo uso: pide uno nuevo. */
  readonly onTokenSpent: () => void;
  /** Teléfono verificado: el pedido se reenvía. */
  readonly onVerified: () => void;
  readonly onCancel: () => void;
};

/**
 * Paso «Verifica tu teléfono» del checkout web (antifraude capa 3). Solo aparece cuando el servidor
 * lo pide: teléfono sin pedidos entregados, reparto en efectivo o importe alto.
 */
export function CodeVerification(props: Props) {
  const { api, slug, phone, captchaToken, captchaWaiting } = props;
  const fieldId = useId();
  const [stage, setStage] = useState<"intro" | "sent">("intro");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Cuenta atrás del reenvío: un tic por segundo hasta llegar a 0.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft(secondsLeft - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  async function send() {
    if (busy || captchaWaiting) return;
    setBusy(true);
    setMessage(null);
    const result = await api.requestCode(
      slug,
      codeRequestBody({
        phone,
        fulfillment: props.fulfillment,
        payment: props.payment,
        totalEuros: props.totalEuros,
        captchaToken,
      }),
    );
    props.onTokenSpent();
    setBusy(false);
    if (result.ok) {
      // El servidor dice que ya no hace falta (p. ej. tope de gasto con pago garantizado).
      if (!result.data.requerida) {
        props.onVerified();
        return;
      }
      setStage("sent");
      setCode("");
      setSecondsLeft(result.data.reenviar_en);
      return;
    }
    if (result.body?.reason === "resend_wait") {
      // Ya hay un código en camino: se puede escribir ese.
      setStage("sent");
      setSecondsLeft(result.body.reintentar_en ?? CODE_SENT_FALLBACK_SECONDS);
    }
    setMessage(describeCodeRequestError(result.status, result.body));
  }

  async function confirm() {
    if (busy || !codeComplete(code)) return;
    setBusy(true);
    setMessage(null);
    const result = await api.confirmCode(slug, phone, normalizeCode(code));
    setBusy(false);
    if (result.ok) {
      props.onVerified();
      return;
    }
    setMessage(describeConfirmError(result.status, result.body));
    if (result.body?.reason === "locked" || result.body?.reason === "expired") setCode("");
  }

  return (
    <fieldset className="group code-verification" aria-labelledby={`${fieldId}-title`}>
      <legend id={`${fieldId}-title`}>Verifica tu teléfono</legend>
      <p>
        Para proteger los pedidos, te enviamos un código por WhatsApp al <strong>{phone}</strong>,
        desde Pedidos Konnecttia, para tu pedido en {props.restaurantName}.
      </p>

      {stage === "sent" && (
        <label className="field" htmlFor={fieldId}>
          <span>Código de 6 cifras</span>
          <input
            id={fieldId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={9}
            value={code}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            placeholder="123456"
          />
        </label>
      )}

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {captchaWaiting && stage === "intro" && (
        <p className="hint" role="status">
          {captchaWaiting}
        </p>
      )}

      <div className="code-actions">
        {stage === "intro" ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy || captchaWaiting !== null}
            onClick={() => void send()}
          >
            {busy ? "Enviando…" : "Enviar código"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !codeComplete(code)}
              onClick={() => void confirm()}
            >
              {busy ? "Comprobando…" : "Confirmar y enviar pedido"}
            </button>
            <button
              type="button"
              className="link-btn"
              disabled={busy || secondsLeft > 0 || captchaWaiting !== null}
              onClick={() => void send()}
            >
              {secondsLeft > 0 ? `Reenviar en ${countdownLabel(secondsLeft)}` : "Reenviar código"}
            </button>
          </>
        )}
        <button type="button" className="link-btn" disabled={busy} onClick={props.onCancel}>
          Cancelar
        </button>
      </div>
    </fieldset>
  );
}
