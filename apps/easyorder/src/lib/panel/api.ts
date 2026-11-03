import type { ApiResult } from "../api";
import type { ApiErrorBody } from "../types";
import type { MyRestaurants, PanelAccess, PanelBranch, PanelOrder, SalesOverview } from "./types";

/** Cliente de la API del panel. Cada llamada lleva el token de la sesión de Supabase. */
export function createPanelApi(baseUrl: string, getToken: () => Promise<string | null>) {
  const base = baseUrl.replace(/\/$/, "");

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
          ...init.headers,
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

  const panel = (slug: string, path: string) => `/panel/${encodeURIComponent(slug)}${path}`;
  const local = (branchId: number | null) => (branchId ? `&local=${branchId}` : "");

  return {
    myRestaurants: () => request<MyRestaurants>("/me/restaurantes"),
    access: (slug: string) => request<PanelAccess>(panel(slug, "/acceso")),
    board: (slug: string, branchId: number | null) =>
      request<{ pedidos: PanelOrder[]; ahora: string }>(
        panel(slug, `/orders?vista=tablero${local(branchId)}`),
      ),
    changeStatus: (slug: string, orderId: number, estado: string) =>
      request<{ id: number; estado: string }>(panel(slug, `/orders/${orderId}/status`), {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      }),
    confirmPayment: (slug: string, orderId: number) =>
      request<{ id: number; estado: string }>(panel(slug, `/orders/${orderId}/pago`), {
        method: "PATCH",
        body: JSON.stringify({ estado_pago: "pagado" }),
      }),
    branches: (slug: string) => request<{ locales: PanelBranch[] }>(panel(slug, "/locales")),
    startBusy: (slug: string, branchId: number, minutes: number, duration: number) =>
      request(panel(slug, `/locales/${branchId}/modo-ocupado`), {
        method: "POST",
        body: JSON.stringify({ minutos_extra: minutes, duracion_minutos: duration }),
      }),
    stopBusy: (slug: string, branchId: number) =>
      request(panel(slug, `/locales/${branchId}/modo-ocupado`), { method: "DELETE" }),
    overview: (slug: string, desde: string, hasta: string, branchId: number | null) =>
      request<SalesOverview>(
        panel(slug, `/reports/overview?desde=${desde}&hasta=${hasta}${local(branchId)}`),
      ),
  };
}

export type PanelApi = ReturnType<typeof createPanelApi>;

/** Mensaje para el equipo del restaurante a partir de un error de la API. */
export function describePanelError(status: number, body: ApiErrorBody | null): string {
  if (status === 0) return "Sin conexión con el servidor. Lo volvemos a intentar en unos segundos.";
  if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar.";
  if (status === 403) return "Tu usuario no tiene permiso para hacer esto.";
  if (status === 404) return "Ese pedido ya no está disponible.";
  if (body?.error === "transition_not_allowed") {
    const reason = (body as { reason?: string }).reason;
    if (reason === "payment_pending") return "Confirma el cobro antes de entregar el pedido.";
    if (reason === "payment_not_pending") return "El cobro de este pedido ya estaba resuelto.";
    return "El pedido cambió de estado mientras tanto. Actualizamos el tablero.";
  }
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}
