/** Respuestas de la API pública de Konnecttia (apps/api/src/routes/public.ts). */

export type Fulfillment = "retiro" | "delivery";

export type MenuVariant = {
  readonly id: number;
  readonly name: string;
  readonly price: number;
  readonly isDefault: boolean;
};

export type AllergenPayload = { readonly status: string; readonly allergens?: readonly string[] };

export type MenuExtra = {
  readonly id: number;
  readonly name: string;
  readonly price: number;
  /** Ausente en respuestas antiguas: se trata como «no informados». */
  readonly allergens?: AllergenPayload;
};

export type MenuItem = {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly variants: readonly MenuVariant[];
  readonly extras: readonly MenuExtra[];
  readonly allergens: AllergenPayload;
};

export type Menu = {
  readonly restaurante: {
    readonly nombre: string;
    readonly slug: string;
    readonly recogida: boolean;
    readonly reparto: boolean;
    readonly metodos_pago: readonly string[];
    /** Política propia del restaurante; null = se enlaza a la página genérica /<slug>/privacidad. */
    readonly privacidad_url: string | null;
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
  /** Tiempo de recogida actual (incluye hora punta y modo ocupado); null = a confirmar. */
  readonly tiempo_recogida?: string | null;
};

export type DeliveryZone = {
  readonly id: number;
  readonly nombre: string;
  readonly tipo_tarifa: "fija" | "por_km";
  /** Tarifa fija, o importe base si es por km. */
  readonly envio: number;
  readonly por_km: number | null;
  readonly envio_maximo: number | null;
  readonly gratis_desde: number | null;
  readonly minimo: number;
  readonly tiempo: string | null;
  readonly toda_la_ciudad: boolean;
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
  readonly tiempo_estimado: string | null;
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

/** Datos de /public/:slug/privacidad para la página genérica de privacidad. */
export type PrivacyInfo = {
  readonly restaurante: {
    readonly nombre: string;
    readonly direccion: string | null;
    readonly telefono: string | null;
  };
  readonly locales: readonly {
    readonly nombre: string;
    readonly direccion: string | null;
    readonly telefono: string | null;
  }[];
  readonly privacidad_url: string | null;
  readonly version: string | null;
};
