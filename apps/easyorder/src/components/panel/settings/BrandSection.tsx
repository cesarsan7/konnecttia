"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import type { ApiResult } from "@/lib/api";
import {
  checkLogoFile,
  freeNetworks,
  LOGO_ACCEPT,
  logoError,
  rowsFrom,
  type SocialRow,
  socialLabel,
  socialPayload,
} from "@/lib/panel/brand";
import type { RestaurantSettings } from "@/lib/panel/settings";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";
import "./brand-section.css";

type Saver = (run: () => Promise<ApiResult<unknown>>, done: string) => Promise<string | null>;

type Props = {
  readonly restaurant: RestaurantSettings;
  readonly editable: boolean;
  readonly save: Saver;
};

/**
 * Ajustes → Marca (pieza Z): el logo y las redes sociales que la carta pública muestra. El
 * logo se sube al instante; las redes se guardan con el botón.
 */
export function BrandSection({ restaurant, editable, save }: Props) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<SocialRow[]>(() => rowsFrom(restaurant.redes_sociales));
  const [busy, setBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const logo = restaurant.logo_url ?? null;
  const available = freeNetworks(rows);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = checkLogoFile(file);
    if (problem) return setLogoMessage(problem);
    setBusy(true);
    setLogoMessage(null);
    const message = await save(async () => {
      const result = await api.uploadLogo(slug, file);
      if (!result.ok) {
        const reason = (result.body as { reason?: string } | null)?.reason;
        setLogoMessage(logoError(result.status, reason));
      }
      return result;
    }, "Logo guardado");
    setBusy(false);
    if (message && !logoMessage) setLogoMessage(message);
  }

  async function remove() {
    setBusy(true);
    setLogoMessage(null);
    await save(() => api.removeLogo(slug), "Logo quitado");
    setBusy(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = socialPayload(rows);
    if (!payload.ok) return setSocialMessage(payload.message);
    setBusy(true);
    setSocialMessage(null);
    const message = await save(
      () => api.settingsChange(slug, "PATCH", "/restaurante", { redes_sociales: payload.links }),
      "Redes guardadas",
    );
    setBusy(false);
    setSocialMessage(message);
  }

  return (
    <div className="k-settings-stack">
      <section className="k-card k-settings">
        <header className="k-settings-head">
          <h2 className="k-title">Logo</h2>
          <p className="k-muted k-small">
            Se ve en la cabecera de tu carta online. PNG, JPG o WebP, hasta 2 MB; mejor cuadrado o
            con el fondo transparente.
          </p>
        </header>
        <div className="k-brand-logo">
          {logo ? (
            // biome-ignore lint/performance/noImgElement: logo en una URL externa (Storage)
            <img className="k-brand-logo-img" src={logo} alt="Logo del restaurante" />
          ) : (
            <span className="k-brand-logo-empty k-muted k-small">Sin logo</span>
          )}
          {editable ? (
            <div className="k-brand-actions">
              <input
                ref={input}
                type="file"
                accept={LOGO_ACCEPT}
                hidden
                onChange={(event) => void pick(event)}
              />
              <button
                type="button"
                className="k-btn k-btn-secondary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {logo ? "Cambiar logo" : "Subir logo"}
              </button>
              {logo ? (
                <button
                  type="button"
                  className="k-btn k-btn-sm"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {logoMessage ? (
          <p className="k-alert" role="alert">
            {logoMessage}
          </p>
        ) : null}
      </section>

      <form className="k-card k-settings" onSubmit={(event) => void submit(event)} noValidate>
        <header className="k-settings-head">
          <h2 className="k-title">Redes sociales y web</h2>
          <p className="k-muted k-small">
            Tu carta las muestra como enlaces. Pega la dirección completa; en WhatsApp basta el
            teléfono.
          </p>
        </header>
        <ul className="k-brand-rows">
          {rows.map((row, index) => (
            <li key={row.red} className="k-brand-row">
              <label className="k-brand-field">
                <span>{socialLabel(row.red)}</span>
                <input
                  className="k-input"
                  value={row.url}
                  disabled={!editable}
                  maxLength={300}
                  inputMode={row.red === "whatsapp" ? "tel" : "url"}
                  placeholder={row.red === "whatsapp" ? "+34 600 000 000" : "https://"}
                  onChange={(event) =>
                    setRows(
                      rows.map((item, position) =>
                        position === index ? { ...item, url: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              {editable ? (
                <button
                  type="button"
                  className="k-btn k-btn-sm"
                  aria-label={`Quitar ${socialLabel(row.red)}`}
                  onClick={() => setRows(rows.filter((_, position) => position !== index))}
                >
                  Quitar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {editable && available.length > 0 ? (
          <label className="k-brand-add">
            <span className="k-sr-only">Añadir una red</span>
            <select
              className="k-input"
              value=""
              onChange={(event) => {
                const red = available.find((network) => network === event.target.value);
                if (red) setRows([...rows, { red, url: "" }]);
              }}
            >
              <option value="">Añadir una red…</option>
              {available.map((network) => (
                <option key={network} value={network}>
                  {socialLabel(network)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {editable ? (
          <div className="k-save-bar">
            {socialMessage ? (
              <p className="k-alert" role="alert">
                {socialMessage}
              </p>
            ) : null}
            <button type="submit" className="k-btn k-btn-go" disabled={busy}>
              {busy ? "Guardando…" : "Guardar redes"}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
