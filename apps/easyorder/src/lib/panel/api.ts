import type { BoardSounds } from "@konnecttia/domain";
import type { SignupBody, SignupResult } from "../alta/types";
import type { ApiResult } from "../api";
import type { SupportAccess } from "../interno/types";
import type { ApiErrorBody } from "../types";
import type { ActivityPeople, DriverActivity, OrderTrace, WaiterActivity } from "./activity";
import type { Billing } from "./billing";
import type { CustomerDetail, CustomerList } from "./customers";
import type { DeliveryPhotoMode, OrderDeliveryPhotos } from "./delivery-photo";
import type { Delivery, Driver } from "./drivers";
import type { OrderHistory } from "./history";
import type { IncidentList } from "./incidents";
import type { AdminMenu } from "./menu";
import type { FirstSteps } from "./onboarding";
import type { OrderProofs } from "./proofs";
import type { PushState } from "./push";
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
    billing: (slug: string) => request<Billing>(panel(slug, "/facturacion")),
    billingPay: (slug: string, plan: string) =>
      send<{ url: string }>(slug, "/facturacion/pago", "POST", { plan }),
    billingPortal: (slug: string) => send<{ url: string }>(slug, "/facturacion/portal", "POST", {}),
    boardSounds: (slug: string) => request<{ sonidos: BoardSounds }>(panel(slug, "/sonidos")),
    pushState: (slug: string) => request<PushState>(panel(slug, "/push")),
    pushSubscribe: (slug: string, subscription: unknown) =>
      send<{ ok: boolean }>(slug, "/push", "POST", subscription),
    pushUnsubscribe: (slug: string, endpoint: string) =>
      send<{ ok: boolean }>(slug, "/push", "DELETE", { endpoint }),
    peaks: (slug: string) => request<{ franjas: PeakTime[] }>(panel(slug, "/ajustes/franjas")),
    supportLog: (slug: string) =>
      request<{ habilitado: boolean; accesos: readonly SupportAccess[] }>(
        panel(slug, "/soporte/registro"),
      ),
    team: (slug: string) => request<Team>(panel(slug, "/equipo")),
    /** Equipo: `path` relativo a /equipo (por ejemplo «/invitaciones»). */
    teamChange: <T = { id: number }>(
      slug: string,
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      path: string,
      body?: unknown,
    ) => send<T>(slug, `/equipo${path}`, method, body),
    activityPeople: (slug: string) => request<ActivityPeople>(panel(slug, "/actividad/personas")),
    driverActivity: (slug: string, id: number, query: string) =>
      request<DriverActivity>(panel(slug, `/actividad/repartidor/${id}?${query}`)),
    waiterActivity: (slug: string, id: number, query: string) =>
      request<WaiterActivity>(panel(slug, `/actividad/mesero/${id}?${query}`)),
    orderTrace: (slug: string, orderId: number) =>
      request<OrderTrace>(panel(slug, `/actividad/pedido/${orderId}`)),
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
    customers: (
      slug: string,
      query: { q: string; orden: string; pagina: number; bloqueados?: boolean },
    ) =>
      request<CustomerList>(
        panel(
          slug,
          `/clientes?${new URLSearchParams({
            q: query.q,
            orden: query.orden,
            pagina: String(query.pagina),
            ...(query.bloqueados ? { bloqueados: "1" } : {}),
          })}`,
        ),
      ),
    incidents: (slug: string, estado: string, pagina: number) =>
      request<IncidentList>(
        panel(slug, `/incidencias?${new URLSearchParams({ estado, pagina: String(pagina) })}`),
      ),
    /** Resuelve (con nota opcional) o reabre una incidencia del cliente. */
    resolveIncident: (slug: string, id: number, estado: "resuelta" | "abierta", nota?: string) =>
      send<{ id: number; estado: string }>(slug, `/incidencias/${id}`, "PATCH", {
        estado,
        ...(nota ? { nota } : {}),
      }),
    customer: (slug: string, id: number) => request<CustomerDetail>(panel(slug, `/clientes/${id}`)),
    /** Borra (anonimiza) los datos personales del cliente y de sus pedidos. */
    deleteCustomer: (slug: string, id: number) =>
      send<{ ok: true; pedidos_anonimizados: number }>(slug, `/clientes/${id}`, "DELETE"),
    /** Bloquea el teléfono del cliente (no podrá pedir por la web). */
    blockCustomer: (slug: string, id: number, motivo: string) =>
      send<{ ok: true; bloqueo: { motivo: string | null; desde: string } }>(
        slug,
        `/clientes/${id}/bloqueo`,
        "PUT",
        motivo.trim() ? { motivo: motivo.trim() } : {},
      ),
    unblockCustomer: (slug: string, id: number) =>
      send<{ ok: true }>(slug, `/clientes/${id}/bloqueo`, "DELETE"),
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
    /** Sube el logo del restaurante (multipart, campo `logo`; PNG, JPG o WebP, hasta 2 MB). */
    uploadLogo: (slug: string, file: File) => {
      const form = new FormData();
      form.append("logo", file);
      return request<{ logo_url: string }>(panel(slug, "/ajustes/logo"), {
        method: "POST",
        body: form,
      });
    },
    removeLogo: (slug: string) => send<{ logo_url: null }>(slug, "/ajustes/logo", "DELETE"),
    uploadPhoto: (slug: string, itemId: number, file: File) => {
      const form = new FormData();
      form.append("foto", file);
      return request<{ id: number; imagen_url: string }>(
        panel(slug, `/carta/productos/${itemId}/foto`),
        { method: "POST", body: form },
      );
    },
    myRestaurants: () => request<MyRestaurants>("/me/restaurantes"),
    /** Alta autoservicio: crea el restaurante de prueba de quien tiene la sesión abierta. */
    signup: (body: SignupBody) =>
      request<SignupResult>("/alta", { method: "POST", body: JSON.stringify(body) }),
    /** Checklist de primeros pasos del restaurante. */
    firstSteps: (slug: string) => request<FirstSteps>(panel(slug, "/primeros-pasos")),
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
    myDeliveries: (slug: string) =>
      request<{ repartos: Delivery[]; foto_entrega: DeliveryPhotoMode }>(
        panel(slug, "/mis-repartos"),
      ),
    /** Foto de entrega (multipart, campo `foto`): el pedido debe ir en camino. */
    uploadDeliveryPhoto: (slug: string, orderId: number, file: File) => {
      const form = new FormData();
      form.append("foto", file);
      return request<{ id: number; fotos_entrega: number }>(
        panel(slug, `/mis-repartos/${orderId}/foto`),
        { method: "POST", body: form },
      );
    },
    /** URLs firmadas (de corta duración) de las fotos de entrega de un pedido. */
    deliveryPhotos: (slug: string, orderId: number) =>
      request<OrderDeliveryPhotos>(panel(slug, `/orders/${orderId}/foto-entrega`)),
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
    /** URLs firmadas (de corta duración) de los justificantes de pago de un pedido. */
    orderProofs: (slug: string, orderId: number) =>
      request<OrderProofs>(panel(slug, `/orders/${orderId}/justificantes`)),
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
