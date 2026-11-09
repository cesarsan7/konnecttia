/**
 * Redes sociales y web del restaurante (pieza Z). Se guardan en `restaurante.redes_sociales`
 * como `[{ "red": "instagram", "url": "https://…" }]` y la carta pública las muestra como enlaces.
 */
export const SOCIAL_NETWORK = {
  Instagram: "instagram",
  Facebook: "facebook",
  TikTok: "tiktok",
  Google: "google",
  WhatsApp: "whatsapp",
  Web: "web",
  YouTube: "youtube",
  Twitter: "twitter",
  Telegram: "telegram",
  LinkedIn: "linkedin",
  Pinterest: "pinterest",
} as const;

export type SocialNetwork = (typeof SOCIAL_NETWORK)[keyof typeof SOCIAL_NETWORK];

export const SOCIAL_NETWORKS: readonly SocialNetwork[] = Object.values(SOCIAL_NETWORK);

export const SOCIAL_LABEL: Readonly<Record<SocialNetwork, string>> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google: "Google (ficha del negocio)",
  whatsapp: "WhatsApp",
  web: "Página web",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  telegram: "Telegram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

export type SocialLink = { readonly red: SocialNetwork; readonly url: string };

export const SOCIAL_URL_MAX = 300;

export const SOCIAL_ERROR = {
  Invalid: "invalid_url",
  Duplicate: "duplicate_network",
  Unknown: "unknown_network",
} as const;

export type SocialError = (typeof SOCIAL_ERROR)[keyof typeof SOCIAL_ERROR];

export type SocialResult =
  | { readonly ok: true; readonly links: readonly SocialLink[] }
  | { readonly ok: false; readonly error: SocialError; readonly index: number };

function isNetwork(value: string): value is SocialNetwork {
  return (SOCIAL_NETWORKS as readonly string[]).includes(value);
}

/**
 * Normaliza una URL: solo https (o http, que se sube a https), sin usuario ni contraseña, con
 * un dominio de verdad. WhatsApp admite también un teléfono suelto («+34 600 000 000»), que se
 * convierte en `https://wa.me/<dígitos>`. Devuelve `null` si no vale.
 */
export function normalizeSocialUrl(network: SocialNetwork, raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > SOCIAL_URL_MAX) return null;
  if (network === SOCIAL_NETWORK.WhatsApp && /^[+\d][\d\s().-]*$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  // Sin la clase global URL (este paquete no depende del DOM ni de Node): se lee a mano.
  const match = /^https?:\/\/([^/?#\s]+)([^\s]*)$/i.exec(withScheme);
  if (!match) return null;
  const authority = match[1] ?? "";
  const rest = match[2] ?? "";
  if (authority.includes("@")) return null;
  const [host = "", port, ...extra] = authority.split(":");
  if (extra.length > 0 || (port !== undefined && !/^\d{1,5}$/.test(port))) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) return null;
  return `https://${host.toLowerCase()}${port ? `:${port}` : ""}${rest || "/"}`;
}

/** Valida y normaliza la lista que envía el panel: una red una sola vez, todas con URL válida. */
export function parseSocialLinks(input: readonly { red: string; url: string }[]): SocialResult {
  const seen = new Set<string>();
  const links: SocialLink[] = [];
  for (const [index, item] of input.entries()) {
    if (!isNetwork(item.red)) return { ok: false, error: SOCIAL_ERROR.Unknown, index };
    if (seen.has(item.red)) return { ok: false, error: SOCIAL_ERROR.Duplicate, index };
    const url = normalizeSocialUrl(item.red, item.url);
    if (!url) return { ok: false, error: SOCIAL_ERROR.Invalid, index };
    seen.add(item.red);
    links.push({ red: item.red, url });
  }
  return { ok: true, links };
}

/**
 * Lee lo guardado en la base para mostrarlo: ignora lo que no tenga la forma esperada (la columna
 * viene de una versión anterior y n8n o un SQL a mano podrían haber escrito cualquier cosa).
 */
export function readSocialLinks(stored: unknown): readonly SocialLink[] {
  if (!Array.isArray(stored)) return [];
  const links: SocialLink[] = [];
  const seen = new Set<string>();
  for (const item of stored) {
    if (typeof item !== "object" || item === null) continue;
    const { red, url } = item as { red?: unknown; url?: unknown };
    if (typeof red !== "string" || typeof url !== "string" || !isNetwork(red) || seen.has(red)) {
      continue;
    }
    const clean = normalizeSocialUrl(red, url);
    if (!clean) continue;
    seen.add(red);
    links.push({ red, url: clean });
  }
  return links;
}
