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
    /** false con una prueba pendiente, rechazada o terminada. Ausente en respuestas antiguas. */
    readonly acepta_pedidos?: boolean;
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
  /** Solo los datos del método elegido (IBAN y titular, o teléfono de Bizum). */
  readonly datosBancarios: Record<string, string> | null;
  /** Justificantes ya subidos y si el cliente aún puede subir otro. */
  readonly justificantes: number;
  readonly aceptaJustificante: boolean;
  /** Email de avisos con la parte local oculta (j***@dominio); null si el pedido no lo tiene. */
  readonly emailAvisos?: string | null;
  /** El cliente puede corregirlo mientras el pedido no esté entregado, cancelado o expirado. */
  readonly emailEditable?: boolean;
  /** El local aún no aceptó el pedido: el cliente puede cancelarlo (pieza O). */
  readonly puedeCancelar?: boolean;
  /** Teléfono del restaurante para «Contactar con el local». */
  readonly contactoTelefono?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

export type ApiErrorBody = {
  readonly error: string;
  /** Motivo concreto cuando un mismo `error` tiene varias causas (p. ej. `phone_limit`). */
  readonly reason?: string;
  readonly errors?: readonly { readonly code: string; readonly detail?: string }[];
  readonly locales?: readonly { readonly id: number; readonly nombre: string }[];
  readonly issues?: readonly { readonly path: string; readonly message: string }[];
  /** Código de verificación (capa 3): total del pedido calculado por el servidor, en euros. */
  readonly importe?: number;
  /** Segundos hasta poder pedir otro código. */
  readonly reintentar_en?: number;
  /** Intentos que quedan para escribir el código. */
  readonly intentos_restantes?: number;
};

/** Respuesta de POST /public/:slug/verificacion. */
export type CodeRequested =
  | { readonly requerida: false }
  | {
      readonly requerida: true;
      readonly canal: "whatsapp";
      readonly expira_en: number;
      readonly reenviar_en: number;
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
