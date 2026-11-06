import type { ApiResult } from "../api";
import type { ApiErrorBody } from "../types";
import type {
  CreatedRestaurant,
  ModuleChangeBody,
  ModuleSaved,
  NewRestaurantBody,
  PaymentSaved,
  PlanSaved,
  PlatformMe,
  RestaurantDetail,
  RestaurantRow,
} from "./types";

/** Cliente de la API `/plataforma/*`. Cada llamada lleva el token de la sesión de Supabase. */
export function createPlatformApi(baseUrl: string, getToken: () => Promise<string | null>) {
  const base = `${baseUrl.replace(/\/$/, "")}/plataforma`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
    const token = await getToken();
    if (!token) return { ok: false, status: 401, body: null };
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      return { ok: false, status: 0, body: null };
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, status: response.status, body: (body as ApiErrorBody | null) ?? null };
    }
    return { ok: true, data: body as T };
  }

  const put = <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) });

  return {
    me: () => request<PlatformMe>("/yo"),
    restaurants: (q: string) =>
      request<{
        restaurantes: RestaurantRow[];
        planes: { code: string; nombre: string }[];
      }>(`/restaurantes${q.trim() ? `?${new URLSearchParams({ q: q.trim() })}` : ""}`),
    restaurant: (id: number) => request<RestaurantDetail>(`/restaurantes/${id}`),
    createRestaurant: (body: NewRestaurantBody) =>
      request<CreatedRestaurant>("/restaurantes", { method: "POST", body: JSON.stringify(body) }),
    changePlan: (id: number, plan: string) => put<PlanSaved>(`/restaurantes/${id}/plan`, { plan }),
    changeModule: (id: number, code: string, change: ModuleChangeBody) =>
      put<ModuleSaved>(`/restaurantes/${id}/modulos/${encodeURIComponent(code)}`, change),
    changePaymentMethods: (id: number, metodos: readonly string[] | null) =>
      put<PaymentSaved>(`/restaurantes/${id}/metodos-pago`, { metodos }),
  };
}

export type PlatformApi = ReturnType<typeof createPlatformApi>;
