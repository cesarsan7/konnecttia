import type { ApiResult } from "../api";
import type { ApiErrorBody } from "../types";
import type {
  CreatedRestaurant,
  MenuImportSummary,
  ModuleChangeBody,
  ModuleSaved,
  NewRestaurantBody,
  PaymentSaved,
  PlanSaved,
  PlatformMe,
  PlatformSettings,
  RestaurantDetail,
  RestaurantRow,
  RoleBody,
  RolesInfo,
  SignupSettings,
  TemplatesInfo,
  TrialAction,
  TrialConverted,
  TrialList,
  TrialRow,
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
    roles: (id: number) => request<RolesInfo>(`/restaurantes/${id}/roles`),
    createRole: (id: number, body: RoleBody) =>
      request<{ id: number }>(`/restaurantes/${id}/roles`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    updateRole: (id: number, roleId: number, body: RoleBody) =>
      put<{ id: number; miembros_afectados: number }>(`/restaurantes/${id}/roles/${roleId}`, body),
    deleteRole: (id: number, roleId: number) =>
      request<{ id: number }>(`/restaurantes/${id}/roles/${roleId}`, { method: "DELETE" }),
    importMenu: (id: number, texto: string, simulate: boolean) =>
      request<MenuImportSummary>(
        `/restaurantes/${id}/carta/importar${simulate ? "?simular=1" : ""}`,
        { method: "POST", body: JSON.stringify({ texto }) },
      ),
    templates: () => request<TemplatesInfo>("/plantillas"),
    createTemplate: (body: RoleBody) =>
      request<{ id: number }>("/plantillas", { method: "POST", body: JSON.stringify(body) }),
    updateTemplate: (id: number, body: RoleBody) =>
      put<{ id: number; miembros_afectados: number }>(`/plantillas/${id}`, body),
    deleteTemplate: (id: number) =>
      request<{ id: number }>(`/plantillas/${id}`, { method: "DELETE" }),
    changePlan: (id: number, plan: string) => put<PlanSaved>(`/restaurantes/${id}/plan`, { plan }),
    changeModule: (id: number, code: string, change: ModuleChangeBody) =>
      put<ModuleSaved>(`/restaurantes/${id}/modulos/${encodeURIComponent(code)}`, change),
    changePaymentMethods: (id: number, metodos: readonly string[] | null) =>
      put<PaymentSaved>(`/restaurantes/${id}/metodos-pago`, { metodos }),
    trials: () => request<TrialList>("/pruebas"),
    trialAction: (id: number, action: TrialAction) =>
      put<{ prueba: TrialRow | null }>(`/pruebas/${id}`, action),
    convertTrial: (id: number, plan: string) =>
      request<TrialConverted>(`/pruebas/${id}/convertir`, {
        method: "POST",
        body: JSON.stringify({ plan }),
      }),
    signupSettings: () => request<PlatformSettings>("/config"),
    saveSignupSettings: (values: Partial<SignupSettings>) =>
      put<PlatformSettings>("/config", values),
  };
}

export type PlatformApi = ReturnType<typeof createPlatformApi>;
