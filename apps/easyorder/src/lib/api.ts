import type {
  ApiErrorBody,
  Branch,
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
  const base = `${baseUrl.replace(/\/$/, "")}/public`;
  return {
    menu: (slug: string, branchId?: number | null) =>
      request<Menu>(`${base}/${segment(slug)}/menu${branchId ? `?local=${branchId}` : ""}`),
    branches: (slug: string, point?: { lat: number; lng: number } | null) =>
      request<{ locales: Branch[] }>(
        `${base}/${segment(slug)}/locales${point ? `?lat=${point.lat}&lng=${point.lng}` : ""}`,
      ),
    privacy: (slug: string) => request<PrivacyInfo>(`${base}/${segment(slug)}/privacidad`),
    zones: (slug: string) => request<{ zonas: DeliveryZone[] }>(`${base}/${segment(slug)}/zonas`),
    createOrder: (slug: string, body: unknown, idempotencyKey: string) =>
      request<CreatedOrder>(`${base}/${segment(slug)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      }),
    tracking: (token: string) => request<TrackedOrder>(`${base}/orders/${segment(token)}`),
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
