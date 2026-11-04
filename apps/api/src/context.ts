import type { AccessContext } from "@konnecttia/access";
import type { Sql } from "./lib/db";
import type { Restaurant } from "./repositories/restaurants";

export type AuthenticatedUser = { readonly userId: string; readonly email: string | null };

/** Almacén de imágenes (fotos de la carta). Devuelve la URL pública del archivo guardado. */
export type ImageStorage = {
  readonly upload: (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;
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
};

export type AppEnv = {
  Variables: {
    requestId: string;
    restaurant: Restaurant;
    user: AuthenticatedUser;
    access: AccessContext;
  };
};
