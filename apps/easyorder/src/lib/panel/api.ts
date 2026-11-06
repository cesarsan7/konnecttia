import type { ApiResult } from "../api";
import type { ApiErrorBody } from "../types";
import type { CustomerDetail, CustomerList } from "./customers";
import type { Delivery, Driver } from "./drivers";
import type { OrderHistory } from "./history";
import type { AdminMenu } from "./menu";
import type { PreviousOrders } from "./reorder";
import type { DeliveryZone, PeakTime, Settings, ZoneBranch } from "./settings";
import type { TablePlan } from "./tables";
import type { InvitePreview, MemberName, RolesCatalog, Team } from "./team";
import type { MyRestaurants, PanelAccess, PanelBranch, PanelOrder, SalesOverview } from "./types";
import type { WaiterList } from "./waiters";

/** Respuesta de PUT .../perfil. */
export type ProfileSaved = {
  readonly id: number;
  readonly nombre: string;
  readonly apodo: string | null;
  readonly mostrar: string;
};

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
          ...(init.body && !(init.body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
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

  const send = <T = { id: number }>(slug: string, path: string, method: string, body?: unknown) =>
    request<T>(panel(slug, path), {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return {
    /** Token de la sesión (lo usa el tiempo real del tablero). */
    token: getToken,
    boardStreamUrl: (slug: string) => `${base}${panel(slug, "/orders/stream")}`,
    menu: (slug: string) => request<AdminMenu>(panel(slug, "/carta")),
    /** Cambios de la carta: `path` relativo a /carta (por ejemplo «/productos/12»). */
    menuChange: <T = { id: number }>(
      slug: string,
      method: "POST" | "PATCH" | "PUT" | "DELETE",
      path: string,
      body?: unknown,
    ) => send<T>(slug, `/carta${path}`, method, body),
    settings: (slug: string) => request<Settings>(panel(slug, "/ajustes")),
    /** Cambios de ajustes: `path` relativo a /ajustes (por ejemplo «/restaurante»). */
    settingsChange: <T = { ok?: boolean; id?: number }>(
      slug: string,
      method: "POST" | "PATCH" | "PUT" | "DELETE",
      path: string,
      body?: unknown,
    ) => send<T>(slug, `/ajustes${path}`, method, body),
    deliveryZones: (slug: string) =>
      request<{ zonas: DeliveryZone[]; locales: ZoneBranch[] }>(panel(slug, "/reparto/zonas")),
    /** Zonas de reparto: `path` relativo a /reparto/zonas. */
    zoneChange: (slug: string, method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
      send(slug, `/reparto/zonas${path}`, method, body),
    peaks: (slug: string) => request<{ franjas: PeakTime[] }>(panel(slug, "/ajustes/franjas")),
    team: (slug: string) => request<Team>(panel(slug, "/equipo")),
    /** Equipo: `path` relativo a /equipo (por ejemplo «/invitaciones»). */
    teamChange: <T = { id: number }>(
      slug: string,
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      path: string,
      body?: unknown,
    ) => send<T>(slug, `/equipo${path}`, method, body),
    roles: (slug: string) => request<RolesCatalog>(panel(slug, "/equipo/roles")),
    invite: (token: string) =>
      request<InvitePreview>(`/me/invitaciones/${encodeURIComponent(token)}`),
    acceptInvite: (token: string, name: MemberName) =>
      request<{ slug: string | null }>(`/me/invitaciones/${encodeURIComponent(token)}/aceptar`, {
        method: "POST",
        body: JSON.stringify(name),
      }),
    /** Nombre y apodo propios. */
    saveProfile: (slug: string, name: MemberName) =>
      request<ProfileSaved>(panel(slug, "/me/perfil"), {
        method: "PUT",
        body: JSON.stringify(name),
      }),
    /** Nombre y apodo de otra persona del equipo (team.manage). */
    saveMemberProfile: (slug: string, memberId: number, name: MemberName) =>
      request<ProfileSaved>(panel(slug, `/equipo/miembros/${memberId}/perfil`), {
        method: "PUT",
        body: JSON.stringify(name),
      }),
    manualOrder: (slug: string, body: unknown, idempotencyKey: string) =>
      request<{
        id: number;
        pedido_codigo: string | null;
        total: number;
        local: { id: number; nombre: string };
        tiempo_estimado: string | null;
      }>(panel(slug, "/orders"), {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      }),
    /** Últimos pedidos de un teléfono (pedido manual, «Repetir pedido»). */
    previousOrders: (slug: string, telefono: string) =>
      request<PreviousOrders>(
        panel(slug, `/orders/anteriores?${new URLSearchParams({ telefono })}`),
      ),
    customers: (slug: string, query: { q: string; orden: string; pagina: number }) =>
      request<CustomerList>(
        panel(
          slug,
          `/clientes?${new URLSearchParams({ q: query.q, orden: query.orden, pagina: String(query.pagina) })}`,
        ),
      ),
    customer: (slug: string, id: number) => request<CustomerDetail>(panel(slug, `/clientes/${id}`)),
    /** Descarga el CSV de clientes (con el token de la sesión). */
    exportCustomers: async (slug: string): Promise<Blob | null> => {
      const token = await getToken();
      if (!token) return null;
      try {
        const response = await fetch(`${base}${panel(slug, "/clientes/exportar")}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        return response.ok ? await response.blob() : null;
      } catch {
        return null;
      }
    },
    tables: (slug: string) => request<TablePlan>(panel(slug, "/mesas")),
    waiters: (slug: string) => request<WaiterList>(panel(slug, "/mesas/meseros")),
    /** Mesas: `path` relativo a /mesas (por ejemplo «/zonas» o «/12/estado»). */
    tableChange: (
      slug: string,
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      path: string,
      body?: unknown,
    ) => send(slug, `/mesas${path}`, method, body),
    uploadPhoto: (slug: string, itemId: number, file: File) => {
      const form = new FormData();
      form.append("foto", file);
      return request<{ id: number; imagen_url: string }>(
        panel(slug, `/carta/productos/${itemId}/foto`),
        { method: "POST", body: form },
      );
    },
    myRestaurants: () => request<MyRestaurants>("/me/restaurantes"),
    access: (slug: string) => request<PanelAccess>(panel(slug, "/acceso")),
    board: (slug: string, branchId: number | null) =>
      request<{ pedidos: PanelOrder[]; ahora: string }>(
        panel(slug, `/orders?vista=tablero${local(branchId)}`),
      ),
    /** Historial de pedidos (vista tabla); `query` lo arma historyQuery. */
    history: (slug: string, query: string) =>
      request<OrderHistory>(panel(slug, `/orders/historial?${query}`)),
    drivers: (slug: string) => request<{ repartidores: Driver[] }>(panel(slug, "/repartidores")),
    assignDriver: (slug: string, orderId: number, membershipId: number | null) =>
      request(panel(slug, `/orders/${orderId}/repartidor`), {
        method: "PUT",
        body: JSON.stringify({ membership_id: membershipId }),
      }),
    myDeliveries: (slug: string) => request<{ repartos: Delivery[] }>(panel(slug, "/mis-repartos")),
    deliveryStep: (slug: string, orderId: number, step: "salida" | "entregado") =>
      request(panel(slug, `/mis-repartos/${orderId}/${step}`), { method: "POST" }),
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
    startBusy: (slug: string, branchId: number, minutes: number) =>
      request(panel(slug, `/locales/${branchId}/modo-ocupado`), {
        method: "POST",
        body: JSON.stringify({ minutos_extra: minutes }),
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
