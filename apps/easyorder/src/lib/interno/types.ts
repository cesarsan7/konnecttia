/** Respuestas de la API del panel interno (apps/api/src/routes/plataforma.ts). */

export type PlatformRole = "admin" | "soporte";

export type PlatformMe = { readonly email: string | null; readonly rol: PlatformRole };

export type RestaurantRow = {
  readonly id: number;
  readonly nombre: string;
  readonly slug: string | null;
  readonly plan: string | null;
  readonly creado: string | null;
  readonly locales: number;
  readonly miembros: number;
  readonly pedidos_30d: number;
  readonly ultimo_pedido: string | null;
};

export type ModuleKind = "core" | "plan" | "addon" | "future";
export type ModuleState = "activo" | "suspendido" | "cancelado";
export type ModuleOrigin = "plan" | "complemento" | "cortesia";

export type ModuleRow = {
  readonly code: string;
  readonly nombre: string;
  readonly tipo: ModuleKind;
  readonly depende_de: readonly string[];
  /** null: el restaurante no tiene fila para este módulo. */
  readonly estado: ModuleState | null;
  readonly origen: ModuleOrigin | null;
  readonly en_plan: boolean;
  readonly gestionable: boolean;
};

export type PaymentMethodsInfo = {
  readonly catalogo: readonly string[];
  /** null = todos los que existan. */
  readonly permitidos: readonly string[] | null;
  readonly activos: readonly string[];
};

/** Qué se copia al crear un restaurante «a partir de» otro. */
export type CloneFrom = {
  readonly restaurante_id: number;
  readonly carta: boolean;
  readonly horario: boolean;
  readonly reparto: boolean;
  readonly ajustes: boolean;
};

export type RestaurantDetail = {
  /** Pedidos del restaurante (todos): se avisa antes de borrarlo. */
  readonly pedidos_total?: number;
  readonly restaurante: {
    readonly id: number;
    readonly nombre: string;
    readonly slug: string | null;
    readonly zona_horaria: string | null;
    readonly direccion: string | null;
    readonly telefono: string | null;
    readonly creado: string | null;
  };
  readonly plan: { readonly code: string; readonly nombre: string; readonly desde: string } | null;
  readonly planes: readonly { readonly code: string; readonly nombre: string }[];
  readonly modulos: readonly ModuleRow[];
  readonly metodos_pago: PaymentMethodsInfo;
  readonly carta: { readonly categorias: number; readonly productos: number };
  readonly antifraude_codigo: CodeSettingsInfo;
  readonly locales: readonly {
    readonly id: number;
    readonly nombre: string;
    readonly slug: string;
    readonly direccion: string | null;
    readonly telefono: string | null;
    readonly principal: boolean;
    readonly activo: boolean;
  }[];
  readonly equipo: readonly {
    readonly id: number;
    readonly email: string | null;
    readonly nombre: string | null;
    readonly apodo: string | null;
    readonly mostrar: string | null;
    readonly created_at: string;
    readonly roles: readonly {
      readonly id: number;
      readonly code: string;
      readonly nombre: string;
    }[];
  }[];
  readonly invitaciones_pendientes: readonly {
    readonly id: number;
    readonly email: string | null;
    readonly rol: string | null;
    readonly expires_at: string;
  }[];
};

export type NewRestaurantBody = {
  readonly nombre: string;
  readonly slug: string;
  readonly zona_horaria: string;
  readonly clonar_de?: CloneFrom;
  readonly pais: string;
  readonly plan: string;
  readonly local: {
    readonly nombre: string;
    readonly direccion?: string;
    readonly telefono?: string;
  };
  readonly propietario_email: string;
  readonly ubicacion?: { readonly lat: number; readonly lng: number };
  readonly horario?: readonly {
    readonly dia: string;
    readonly disponible: boolean;
    readonly apertura: string;
    readonly cierre: string;
  }[];
  readonly recogida_minutos?: number;
  readonly zona_reparto?: {
    readonly radio_km: number;
    readonly tarifa: number;
    readonly minimo: number;
    readonly minutos: number;
  };
  readonly metodos_pago?: readonly string[];
  /** Código de verificación del checkout web (capa 3). Sin indicar: apagado. */
  readonly codigo_verificacion?: CodeChannel;
};

/** Canales que ofrece el panel interno (el SMS está descartado por ahora, ADR 0011). */
export type CodeChannel = "whatsapp" | "apagado";

export type CodeSettingsInfo = {
  readonly canal: CodeChannel;
  /** Importe desde el que se pide código; 30 € si el restaurante no lo cambió. */
  readonly umbral_eur: number;
  readonly umbral_personalizado: boolean;
  /** Gasto máximo mensual en códigos; 10 € si el restaurante no lo cambió. */
  readonly tope_mensual_eur: number;
  readonly tope_personalizado: boolean;
  readonly gasto_mes_eur: number;
  /** false: la API no tiene WhatsApp configurado y no envía códigos aunque el canal esté activo. */
  readonly api_configurada: boolean;
};

/** Cuerpo de PUT /restaurantes/:id/antifraude-codigo: null = valor por defecto. */
export type CodeSettingsBody = {
  readonly canal: CodeChannel;
  readonly umbral_eur: number | null;
  readonly tope_mensual_eur: number | null;
};

export type CreatedRestaurant = {
  readonly id: number;
  readonly slug: string;
  readonly plan: string;
  readonly modulos: readonly string[];
  readonly invitacion: {
    readonly email: string;
    readonly token: string;
    readonly expires_at: string;
    /** null si la API no conoce la URL del panel. */
    readonly enlace: string | null;
    readonly email_enviado: boolean;
  };
};

export type PaymentSaved = {
  readonly permitidos: readonly string[] | null;
  readonly activos: readonly string[];
  readonly metodos_quitados: readonly string[];
  readonly sin_metodos_activos: boolean;
};

export type PlanSaved = {
  readonly plan: string;
  readonly anterior: string | null;
  readonly modulos_anadidos: readonly string[];
  readonly modulos_quitados: readonly string[];
};

export type ModuleSaved = {
  readonly modulo: string;
  readonly estado: ModuleState;
  readonly origen: ModuleOrigin;
};

export type ModuleChangeBody =
  | { readonly estado: "activo"; readonly origen?: "complemento" | "cortesia" }
  | { readonly estado: "suspendido" | "cancelado" };

export type TrialState = "pendiente" | "activa" | "convertida" | "rechazada";

/** Una prueba gratuita (`GET /plataforma/pruebas`). null = sin límite. */
export type TrialRow = {
  readonly restaurante_id: number;
  readonly nombre: string;
  readonly slug: string | null;
  readonly plan: string | null;
  readonly email: string | null;
  readonly estado: TrialState;
  readonly inicio: string;
  readonly fin: string | null;
  readonly max_pedidos: number | null;
  readonly pedidos_usados: number;
  readonly dias_restantes: number | null;
  readonly pedidos_restantes: number | null;
  readonly acepta_pedidos: boolean;
};

export type TrialList = {
  readonly pruebas: readonly TrialRow[];
  /** Planes de pago a los que se puede convertir una prueba. */
  readonly planes: readonly { readonly code: string; readonly nombre: string }[];
};

export type TrialAction =
  | { readonly accion: "aprobar" | "rechazar" }
  | { readonly accion: "ampliar"; readonly dias?: number; readonly pedidos?: number };

export type TrialConverted = {
  readonly estado: "convertida";
  readonly plan: string;
  readonly modulos_anadidos: readonly string[];
  readonly modulos_quitados: readonly string[];
};

/** Configuración global del alta (`plataforma_config`). null = sin límite / sin dato. */
export type SignupSettings = {
  readonly alta_autoservicio_activa: boolean;
  readonly alta_requiere_aprobacion: boolean;
  readonly prueba_dias: number | null;
  readonly prueba_max_pedidos: number | null;
  readonly alta_contacto_email: string | null;
};

export type PlatformSettings = {
  readonly config: SignupSettings;
  readonly descripciones: Readonly<Record<string, string>>;
};

export type RoleRowInfo = {
  readonly id: number;
  readonly code: string;
  readonly nombre: string;
  readonly plantilla: boolean;
  readonly permisos: readonly string[];
  readonly miembros: number;
  readonly invitaciones: number;
  readonly editable: boolean;
};

export type RoleCatalogGroup = {
  readonly modulo: string;
  readonly nombre: string;
  /** El restaurante tiene el módulo contratado. */
  readonly activo: boolean;
  readonly permisos: readonly { readonly code: string; readonly nombre: string }[];
};

export type RolesInfo = {
  readonly roles: readonly RoleRowInfo[];
  readonly catalogo: readonly RoleCatalogGroup[];
};

export type RoleBody = { readonly nombre: string; readonly permisos: readonly string[] };

export type MenuImportSummary = {
  readonly simulacion: boolean;
  readonly categorias: number;
  readonly productos: number;
  readonly precios: number;
};

/**
 * Plantilla de rol global (GET /plataforma/plantillas). `base`: conserva código y nombre (solo se
 * editan sus permisos y no se borra). `por_defecto`: permisos con los que nace una base.
 * `minimos`: permisos que no se pueden quitar (Propietario).
 */
export type TemplateInfo = {
  readonly id: number;
  readonly code: string;
  readonly nombre: string;
  readonly permisos: readonly string[];
  readonly miembros: number;
  readonly invitaciones: number;
  readonly restaurantes: number;
  readonly base: boolean;
  readonly editable: boolean;
  readonly borrable: boolean;
  readonly por_defecto: readonly string[] | null;
  readonly minimos: readonly string[];
};

export type TemplatesInfo = {
  readonly plantillas: readonly TemplateInfo[];
  readonly catalogo: readonly {
    readonly modulo: string;
    readonly nombre: string;
    readonly permisos: readonly { readonly code: string; readonly nombre: string }[];
  }[];
};
