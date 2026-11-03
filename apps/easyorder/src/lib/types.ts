/** Respuestas de la API pública de Konnecttia (apps/api/src/routes/public.ts). */

export type Fulfillment = "retiro" | "delivery";

export type MenuVariant = {
  readonly id: number;
  readonly name: string;
  readonly price: number;
  readonly isDefault: boolean;
};

export type MenuExtra = { readonly id: number; readonly name: string; readonly price: number };

export type MenuItem = {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly variants: readonly MenuVariant[];
  readonly extras: readonly MenuExtra[];
  readonly allergens: { readonly status: string; readonly allergens?: readonly string[] };
};

export type Menu = {
  readonly restaurante: {
    readonly nombre: string;
    readonly slug: string;
    readonly recogida: boolean;
    readonly reparto: boolean;
    readonly metodos_pago: readonly string[];
  };
  readonly local: { readonly id: number; readonly nombre: string } | null;
  readonly abierto: boolean;
  readonly categories: readonly {
    readonly id: number;
    readonly name: string;
    readonly items: readonly MenuItem[];
  }[];
};

export type Branch = {
  readonly id: number;
  readonly nombre: string;
  readonly direccion: string | null;
  readonly telefono: string | null;
  readonly principal: boolean;
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly abierto: boolean;
  readonly distancia_km: number | null;
};

export type DeliveryZone = {
  readonly id: number;
  readonly nombre: string;
  readonly envio: number;
  readonly minimo: number;
  readonly tiempo: string | null;
  readonly local: string | null;
};

export type CreatedOrder = {
  readonly pedido_codigo: string | null;
  readonly tracking_token: string;
  readonly estado: string;
  readonly local: {
    readonly id: number;
    readonly nombre: string;
    readonly direccion: string | null;
  };
  readonly tiempo_estimado: string;
  readonly subtotal: number;
  readonly suplementos: readonly { readonly concepto: string; readonly importe: number }[];
  readonly costo_envio: number;
  readonly total: number;
};

export type TrackedOrder = {
  readonly pedidoCodigo: string | null;
  readonly restaurante: string;
  readonly local: { readonly nombre: string; readonly direccion: string | null } | null;
  readonly estado: string;
  readonly estadoPago: string;
  readonly tipoDespacho: Fulfillment | null;
  readonly tiempoEstimado: string | null;
  readonly items: unknown;
  readonly subtotal: number;
  readonly costoEnvio: number;
  readonly total: number;
  readonly metodoPago: string | null;
  readonly datosBancarios: Record<string, string> | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ApiErrorBody = {
  readonly error: string;
  readonly errors?: readonly { readonly code: string; readonly detail?: string }[];
  readonly locales?: readonly { readonly id: number; readonly nombre: string }[];
  readonly issues?: readonly { readonly path: string; readonly message: string }[];
};
