"use client";

import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import type { ApiResult } from "@/lib/api";
import {
  COLOR_INVALID,
  checkLogoFile,
  colorFeedback,
  freeNetworks,
  LOGO_ACCEPT,
  logoError,
  PREVIEW_DEFAULT,
  rowsFrom,
  type SocialRow,
  socialLabel,
  socialPayload,
} from "@/lib/panel/brand";
import type { RestaurantSettings } from "@/lib/panel/settings";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";
import "./brand-section.css";
import { SETTINGS_HELP } from "@/lib/settings-help";
import { HelpNote } from "../../HelpNote";

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
  const [colorText, setColorText] = useState(restaurant.color_marca ?? "");
  const [colorMessage, setColorMessage] = useState<string | null>(null);
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

  const feedback = colorFeedback(colorText);

  async function saveColor(next: string | null) {
    setColorMessage(null);
    if (next !== null && !colorFeedback(next)) return setColorMessage(COLOR_INVALID);
    setBusy(true);
    const message = await save(
      () =>
        api.settingsChange(slug, "PATCH", "/restaurante", {
          color_marca: next === null ? null : (colorFeedback(next)?.color ?? null),
        }),
      next === null ? "Color de EasyOrder restaurado" : "Color guardado",
    );
    setBusy(false);
    setColorMessage(message);
    if (!message && next === null) setColorText("");
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
          <HelpNote items={SETTINGS_HELP.logo} />
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

      <section className="k-card k-settings">
        <header className="k-settings-head">
          <h2 className="k-title">Color de la carta</h2>
          <p className="k-muted k-small">
            Tu carta online y el seguimiento de los pedidos usan este color en botones, bordes y
            selección. El panel mantiene los colores de EasyOrder.
          </p>
          <HelpNote items={SETTINGS_HELP.color} />
        </header>
        <div className="k-brand-color">
          <input
            type="color"
            className="k-brand-swatch"
            aria-label="Elegir color"
            value={feedback?.color ?? restaurant.color_marca ?? PREVIEW_DEFAULT}
            disabled={!editable}
            onChange={(event) => setColorText(event.target.value)}
          />
          <label className="k-brand-field">
            <span>Código del color</span>
            <input
              className="k-input"
              value={colorText}
              disabled={!editable}
              maxLength={9}
              placeholder={`${PREVIEW_DEFAULT} (el de EasyOrder)`}
              onChange={(event) => setColorText(event.target.value)}
            />
          </label>
          <span
            className="k-brand-preview"
            style={{
              background: feedback?.color ?? PREVIEW_DEFAULT,
              color: feedback?.ink ?? "#ffffff",
            }}
          >
            Añadir al pedido
          </span>
        </div>
        {colorText.trim() && !feedback ? (
          <p className="k-alert" role="status">
            {COLOR_INVALID}
          </p>
        ) : null}
        {feedback?.warning ? (
          <p className="k-warn k-small" role="status">
            {feedback.warning}
          </p>
        ) : null}
        {colorMessage ? (
          <p className="k-alert" role="alert">
            {colorMessage}
          </p>
        ) : null}
        {editable ? (
          <div className="k-brand-actions">
            <button
              type="button"
              className="k-btn k-btn-go"
              disabled={busy || !feedback}
              onClick={() => void saveColor(colorText)}
            >
              Guardar color
            </button>
            {restaurant.color_marca ? (
              <button
                type="button"
                className="k-btn k-btn-sm"
                disabled={busy}
                onClick={() => void saveColor(null)}
              >
                Usar el color de EasyOrder
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <form className="k-card k-settings" onSubmit={(event) => void submit(event)} noValidate>
        <header className="k-settings-head">
          <h2 className="k-title">Redes sociales y web</h2>
          <p className="k-muted k-small">
            Tu carta las muestra como enlaces. Pega la dirección completa; en WhatsApp basta el
            teléfono.
          </p>
          <HelpNote items={SETTINGS_HELP.redes} />
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
