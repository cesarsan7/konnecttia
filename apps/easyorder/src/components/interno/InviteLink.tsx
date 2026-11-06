"use client";

import { useState } from "react";
import "./invite-link.css";

/** Enlace de invitación con botón para copiarlo. */
export function InviteLink({ link }: { readonly link: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 3000);
  }

  return (
    <div className="k-il">
      <input
        className="k-il-input"
        type="text"
        readOnly
        value={link}
        aria-label="Enlace de invitación"
        onFocus={(event) => event.currentTarget.select()}
      />
      <button type="button" className="k-btn k-btn-secondary k-il-copy" onClick={() => void copy()}>
        {state === "copied" ? "Copiado" : "Copiar enlace"}
      </button>
      <p className="k-small k-il-state" role="status">
        {state === "failed" ? "No se pudo copiar. Selecciónalo y cópialo a mano." : ""}
      </p>
    </div>
  );
}
