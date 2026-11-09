"use client";

import { useId, useState } from "react";
import type { Api } from "@/lib/api";
import { EMAIL_REQUIRED_MESSAGE, normalizeEmail } from "@/lib/checkout";
import type { TrackedOrder } from "@/lib/types";

type Props = {
  readonly api: Api;
  readonly token: string;
  readonly order: TrackedOrder;
  /** Recarga el pedido tras guardar, para mostrar el email nuevo enmascarado. */
  readonly onSaved: () => void;
};

/**
 * «Avisos a j***@dominio» con la opción de corregirlo mientras el pedido sigue abierto. El email
 * nunca se muestra completo: la página se abre con un enlace y solo debe enseñar una pista.
 */
export function EmailAvisos({ api, token, order, onSaved }: Props) {
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!order.emailAvisos) return null;

  async function save() {
    const email = normalizeEmail(value);
    if (!email) {
      setMessage(EMAIL_REQUIRED_MESSAGE);
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await api.updateEmail(token, email);
    setSaving(false);
    if (result.ok) {
      setEditing(false);
      setValue("");
      setMessage("Email actualizado.");
      onSaved();
      return;
    }
    setMessage(
      result.status === 409
        ? "El pedido ya terminó: no se puede cambiar el email."
        : "No hemos podido guardar el email. Inténtalo de nuevo.",
    );
  }

  return (
    <section className="group card" aria-label="Avisos del pedido">
      <p>
        Avisos a <strong>{order.emailAvisos}</strong>
        {order.emailEditable && !editing && (
          <>
            {" "}
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              Cambiar
            </button>
          </>
        )}
      </p>
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="field" htmlFor={fieldId}>
            <span>Nuevo email</span>
            <input
              id={fieldId}
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="tu@email.com"
            />
          </label>
          <div className="track-notice-actions">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      <p className="muted" role="status">
        {message ?? ""}
      </p>
    </section>
  );
}
