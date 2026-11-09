import type { CodeSender } from "../context";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const GRAPH_URL = "https://graph.facebook.com/v21.0";
const SEND_TIMEOUT_MS = 8_000;

export type WhatsAppCodeConfig = {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  /** Plantilla de categoría «autenticación» aprobada en Meta. */
  readonly template: string;
  readonly language: string;
};

/**
 * Envía el código con la API de WhatsApp Cloud de Meta, desde el número central de Konnecttia.
 * Una plantilla de autenticación lleva el código en el cuerpo y en el botón «copiar código».
 * Meta no admite códigos en otras categorías de plantilla. Falla cerrado: cualquier error o
 * respuesta que no sea 2xx devuelve false (y nunca se registra el código ni el teléfono).
 *
 * El nombre del restaurante NO se envía: las plantillas de autenticación tienen formato fijo y
 * está pendiente de confirmar con Meta si admiten una cabecera con él (ADR 0011).
 */
export function createWhatsAppCodeSender(
  config: WhatsAppCodeConfig,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): CodeSender {
  return async ({ telefono, codigo }) => {
    const to = telefono.replace(/\D/g, "");
    if (!to) return false;
    try {
      const response = await fetchImpl(`${GRAPH_URL}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: config.template,
            language: { code: config.language },
            components: [
              { type: "body", parameters: [{ type: "text", text: codigo }] },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: codigo }],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  };
}

/**
 * Solo staging, mientras Meta aprueba la plantilla: escribe el código en el log de la API (con el
 * teléfono parcialmente oculto) en lugar de enviarlo. Se activa con ANTIFRAUD_CODE_SIMULATE.
 */
export function createSimulatedCodeSender(
  log: (line: string) => void = (line) => console.warn(line),
): CodeSender {
  return async ({ telefono, codigo, restaurante }) => {
    const hidden = `${"*".repeat(Math.max(telefono.length - 3, 0))}${telefono.slice(-3)}`;
    log(`[CÓDIGO SIMULADO] ${restaurante} · ${hidden}: ${codigo}`);
    return true;
  };
}
