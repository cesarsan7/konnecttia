/** Respuestas y cuerpos de la API del alta autoservicio (apps/api/src/routes/alta.ts). */

/** `GET /alta/config`: lo que necesita la landing. null = sin límite / sin dato. */
export type AltaConfig = {
  readonly activa: boolean;
  readonly requiere_aprobacion: boolean;
  readonly dias: number | null;
  readonly max_pedidos: number | null;
  readonly contacto: string | null;
};

/** `GET /alta/slug?valor=`: disponible, o el motivo (`slug_taken`, `slug_reserved`…). */
export type SlugCheck =
  | { readonly disponible: true }
  | { readonly disponible: false; readonly motivo: string };

export type SignupBody = {
  readonly nombre: string;
  readonly slug: string;
  readonly zona_horaria: string;
  readonly local: {
    readonly nombre: string;
    readonly direccion?: string;
    readonly telefono?: string;
  };
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly miembro_nombre?: string;
  readonly captcha_token?: string;
};

export type SignupResult = { readonly slug: string; readonly estado: "activa" | "pendiente" };
