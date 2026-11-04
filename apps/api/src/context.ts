import type { AccessContext } from "@konnecttia/access";
import type { Sql } from "./lib/db";
import type { Restaurant } from "./repositories/restaurants";

export type AuthenticatedUser = { readonly userId: string; readonly email: string | null };

/** Almacén de imágenes (fotos de la carta). Devuelve la URL pública del archivo guardado. */
export type ImageStorage = {
  readonly upload: (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;
};

/** Envío de emails (Resend). */
export type Mailer = {
  readonly send: (message: {
    readonly to: string;
    readonly subject: string;
    readonly html: string;
    readonly text: string;
  }) => Promise<void>;
};

/** Dependencias inyectadas: permiten probar la API con una base real y una autenticación falsa. */
export type AppDeps = {
  readonly sql: Sql;
  readonly verifyToken: (token: string) => Promise<AuthenticatedUser | null>;
  readonly now: () => Date;
  readonly clientIpHeader: string;
  readonly allowedOrigins: readonly string[];
  /** null si no está configurado: el panel ofrece pegar una URL en lugar de subir la foto. */
  readonly imageStorage?: ImageStorage | null;
  /** null si no hay RESEND_API_KEY: las invitaciones se comparten solo con el enlace. */
  readonly mailer?: Mailer | null;
  /** URL pública del panel para los enlaces de los emails si la petición no trae Origin. */
  readonly panelUrl?: string | null;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    restaurant: Restaurant;
    user: AuthenticatedUser;
    access: AccessContext;
  };
};
