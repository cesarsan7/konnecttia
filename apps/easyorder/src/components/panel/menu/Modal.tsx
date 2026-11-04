"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** Diálogo nativo (<dialog>): se abre al montarse, cierra con Esc y devuelve el foco. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const dialog = ref.current;
    // Sin close() al desmontar: en modo estricto React desmonta y vuelve a montar, y el evento
    // «close» cerraría el editor nada más abrirlo. Al quitar el <dialog> del DOM se cierra solo.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`k-dialog${wide ? " k-dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="k-dialog-head">
        <h2 id={titleId} className="k-title">
          {title}
        </h2>
        <button type="button" className="k-icon-btn" aria-label="Cerrar" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {children}
    </dialog>
  );
}
