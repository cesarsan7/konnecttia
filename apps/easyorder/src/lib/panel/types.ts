/** Respuestas de la API del panel (apps/api/src/routes/panel.ts y routes/me.ts). */

/** Los importes NUMERIC llegan como texto desde la base ("28.00"). */
export type Amount = string | number;

export type MyRestaurants = {
  readonly email: string | null;
  readonly restaurantes: readonly {
    readonly slug: string;
    readonly nombre: string;
    readonly roles: readonly string[];
  }[];
};

export type BusyModeSettings = {
  readonly opciones: readonly number[];
  readonly duracion_minutos: number;
};

export type PanelAccess = {
  /** Ajustes del restaurante que usa el panel (restaurante_config). null = no configurado. */
  readonly ajustes: { readonly modo_ocupado: BusyModeSettings | null };
  /** `mostrar` = apodo o nombre; null en los miembros antiguos que aún no lo han puesto. */
  readonly usuario: {
    readonly email: string | null;
    readonly nombre: string | null;
    readonly apodo: string | null;
    readonly mostrar: string | null;
  };
  readonly restaurante: {
    readonly nombre: string;
    readonly slug: string;
    readonly zona_horaria: string;
  };
  readonly roles: readonly { readonly code: string; readonly nombre: string }[];
  readonly permisos: readonly string[];
  readonly modulos: readonly string[];
  readonly locales: "todos" | readonly number[];
};

export type PanelOrder = {
  readonly id: number;
  readonly pedido_codigo: string | null;
  readonly estado: string;
  readonly estado_pago: string;
  readonly tipo_despacho: "retiro" | "delivery" | "mesa" | null;
  readonly canal: string;
  readonly nombre_pedido: string | null;
  readonly telefono: string;
  readonly direccion: string | null;
  readonly items: unknown;
  readonly subtotal: Amount;
  readonly costo_envio: Amount;
  readonly total: Amount;
  readonly metodo_pago: string | null;
  readonly tiempo_estimado: string | null;
  readonly notas: unknown;
  readonly created_at: string;
  readonly updated_at: string | null;
  readonly sucursal_id: number | null;
  readonly local_nombre: string | null;
  readonly mesa_id?: number | null;
  readonly mesa_nombre?: string | null;
  /** Reparto asignado (pedido_reparto). */
  readonly repartidor_id?: number | null;
  readonly repartidor_email?: string | null;
  /** Apodo o nombre del repartidor (el email solo llega a quien ve el equipo). */
  readonly repartidor_nombre?: string | null;
  readonly salida_at?: string | null;
};

export type BusyMode = {
  readonly minutos_extra: number;
  readonly servicio: "recogida" | "reparto" | "ambos";
  readonly hasta: string;
};

export type PanelBranch = {
  readonly id: number;
  readonly nombre: string;
  readonly principal: boolean;
  readonly activo: boolean;
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly modo_ocupado: BusyMode | null;
};

export type Totals = {
  readonly ventas: number;
  readonly pedidos: number;
  readonly ticket_medio: number;
  readonly cancelados: number;
  readonly pendientes_pago: number;
  readonly clientes: number;
};

export type SalesOverview = {
  readonly desde: string;
  readonly hasta: string;
  readonly anterior: { readonly desde: string; readonly hasta: string };
  readonly zona_horaria: string;
  readonly resumen: Totals;
  readonly resumen_anterior: Totals;
  readonly por_dia: readonly { fecha: string; ventas: number; pedidos: number }[];
  readonly por_hora: readonly { hora: number; ventas: number; pedidos: number }[];
  readonly productos: readonly { nombre: string; cantidad: number; ventas: number }[];
  readonly despacho: { readonly recogida: number; readonly reparto: number };
  readonly canal: { readonly web: number; readonly whatsapp: number; readonly otros: number };
  readonly metodos_pago: readonly { metodo: string; pedidos: number; ventas: number }[];
  readonly locales: readonly {
    sucursal_id: number;
    local: string;
    pedidos: number;
    ventas: number;
  }[];
};

/** Configuración del panel leída en el servidor (variables de entorno en tiempo de ejecución). */
export type PanelConfig = {
  readonly apiUrl: string;
  readonly supabaseUrl: string | null;
  readonly supabaseAnonKey: string | null;
};
