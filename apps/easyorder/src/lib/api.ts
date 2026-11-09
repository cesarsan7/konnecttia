import type { AltaConfig, SlugCheck } from "./alta/types";
import type {
  ApiErrorBody,
  Branch,
  CodeRequested,
  CreatedOrder,
  DeliveryZone,
  Menu,
  PrivacyInfo,
  TrackedOrder,
} from "./types";

/** Resultado de una llamada: o datos, o estado HTTP con el cuerpo de error de la API. */
export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly body: ApiErrorBody | null };

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store" });
  } catch {
    return { ok: false, status: 0, body: null };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, status: response.status, body: (body as ApiErrorBody | null) ?? null };
  }
  return { ok: true, data: body as T };
}

const segment = (value: string) => encodeURIComponent(value);

export function createApi(baseUrl: string) {
  const root = baseUrl.replace(/\/$/, "");
  const base = `${root}/public`;
  return {
    menu: (slug: string, branchId?: number | null) =>
      request<Menu>(`${base}/${segment(slug)}/menu${branchId ? `?local=${branchId}` : ""}`),
    branches: (slug: string, point?: { lat: number; lng: number } | null) =>
      request<{ locales: Branch[] }>(
        `${base}/${segment(slug)}/locales${point ? `?lat=${point.lat}&lng=${point.lng}` : ""}`,
      ),
    /** Alta autoservicio: si está abierta y los límites de la prueba (para la landing). */
    altaConfig: () => request<AltaConfig>(`${root}/alta/config`),
    /**
     * «¿Olvidaste tu contraseña?»: la API envía el enlace con Resend. Si responde `supabase`, el
     * panel debe pedírselo a Supabase directamente (no hay clave de servicio o Resend).
     */
    recoverPassword: (email: string) =>
      request<{ ok: true; enviado_por: "easyorder" | "supabase" }>(`${root}/auth/recuperar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    /** Alta autoservicio: ¿está libre esa dirección web? */
    altaSlug: (valor: string) =>
      request<SlugCheck>(`${root}/alta/slug?${new URLSearchParams({ valor })}`),
    privacy: (slug: string) => request<PrivacyInfo>(`${base}/${segment(slug)}/privacidad`),
    zones: (slug: string) => request<{ zonas: DeliveryZone[] }>(`${base}/${segment(slug)}/zonas`),
    createOrder: (slug: string, body: unknown, idempotencyKey: string) =>
      request<CreatedOrder>(`${base}/${segment(slug)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      }),
    /** Antifraude capa 3: pide el código de verificación del teléfono (por WhatsApp). */
    requestCode: (slug: string, body: unknown) =>
      request<CodeRequested>(`${base}/${segment(slug)}/verificacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    confirmCode: (slug: string, telefono: string, codigo: string) =>
      request<{ verificado: true }>(`${base}/${segment(slug)}/verificacion/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, codigo }),
      }),
    tracking: (token: string) => request<TrackedOrder>(`${base}/orders/${segment(token)}`),
    /** Corrige el email de avisos del pedido (con el token; solo mientras el pedido está abierto). */
    updateEmail: (token: string, email: string) =>
      request<{ ok: true; email_avisos: string }>(`${base}/orders/${segment(token)}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    /** Sube el justificante de un pago por Bizum o transferencia (con el token del pedido). */
    uploadProof: (token: string, file: File) => {
      const form = new FormData();
      form.append("justificante", file);
      return request<{ justificantes: number }>(`${base}/orders/${segment(token)}/justificante`, {
        method: "POST",
        body: form,
      });
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/** API vista desde el servidor de Next (red interna). Se lee en tiempo de ejecución. */
export function serverApi(): Api {
  return createApi(process.env.API_URL ?? "http://localhost:3001");
}

/** URL de la API para el navegador. Se pasa como prop: no depende de variables de build. */
export function publicApiUrl(): string {
  return process.env.API_PUBLIC_URL ?? process.env.API_URL ?? "http://localhost:3001";
}
