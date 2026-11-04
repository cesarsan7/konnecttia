"use client";

import type { PrintSettings } from "@/lib/panel/comanda";
import { Toggle } from "../menu/Editors";
import { Modal } from "../menu/Modal";

/** Preferencias de la comanda en este navegador (cada local conecta su propia impresora). */
export function PrintSettingsDialog(props: {
  readonly settings: PrintSettings;
  readonly onChange: (settings: PrintSettings) => void;
  readonly onTest: () => void;
  readonly canTest: boolean;
  readonly onClose: () => void;
}) {
  const { settings, onChange } = props;
  const set = (patch: Partial<PrintSettings>) => onChange({ ...settings, ...patch });
  return (
    <Modal title="Comanda" onClose={props.onClose}>
      <div className="k-editor">
        <p className="k-small k-muted">
          Se guarda en este navegador: cada ordenador o tableta usa su impresora. Funciona con
          impresoras de tickets (58 u 80 mm) y con impresoras normales.
        </p>
        <fieldset className="k-fieldset k-fieldset-flat">
          <legend className="k-field-label">Papel</legend>
          <div className="k-segment k-segment-sm">
            {([80, 58] as const).map((paper) => (
              <button
                key={paper}
                type="button"
                className={settings.paper === paper ? "is-on" : ""}
                aria-pressed={settings.paper === paper}
                onClick={() => set({ paper })}
              >
                {paper} mm
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="k-fieldset k-fieldset-flat">
          <legend className="k-field-label">Copia</legend>
          <div className="k-segment k-segment-sm">
            <button
              type="button"
              className={settings.copia === "cocina" ? "is-on" : ""}
              aria-pressed={settings.copia === "cocina"}
              onClick={() => set({ copia: "cocina" })}
            >
              Cocina (sin precios)
            </button>
            <button
              type="button"
              className={settings.copia === "cliente" ? "is-on" : ""}
              aria-pressed={settings.copia === "cliente"}
              onClick={() => set({ copia: "cliente" })}
            >
              Cliente (con total)
            </button>
          </div>
        </fieldset>
        <Toggle
          checked={settings.alLlegar}
          onChange={(alLlegar) => set({ alLlegar })}
          label="Imprimir cada pedido nuevo al llegar"
        />
        <Toggle
          checked={settings.alAceptar}
          onChange={(alAceptar) => set({ alAceptar })}
          label="Imprimir al pulsar «Aceptar pedido»"
        />
        <p className="k-small k-muted">
          Para imprimir sin el cuadro de diálogo del navegador, abre Chrome en este equipo con la
          opción <code>--kiosk-printing</code> y deja la impresora de tickets como predeterminada.
          Mantén el panel abierto para que lleguen los pedidos.
        </p>
        <div className="k-dialog-actions">
          <button
            type="button"
            className="k-btn k-btn-secondary"
            disabled={!props.canTest}
            onClick={props.onTest}
          >
            Imprimir una prueba
          </button>
          <button type="button" className="k-btn k-btn-go" onClick={props.onClose}>
            Listo
          </button>
        </div>
      </div>
    </Modal>
  );
}
