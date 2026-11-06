import type { AccessContext } from "@konnecttia/access";
import type { PlatformRole } from "@konnecttia/domain";
import type { Sql } from "./lib/db";
import type { Restaurant } from "./repositories/restaurants";

export type AuthenticatedUser = { readonly userId: string; readonly email: string | null };

/** Persona del equipo de Konnecttia que usa el panel interno (`plataforma_miembro`). */
export type PlatformUser = {
  readonly userId: string;
  readonly email: string | null;
  readonly rol: PlatformRole;
};

/** Almacén de imágenes (fotos de la carta). Devuelve la URL pública del archivo guardado. */
export type ImageStorage = {
  readonly upload: (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;
};

/**
 * Almacén PRIVADO de justificantes de pago. No devuelve URLs públicas: el panel pide una URL
 * firmada de corta duración cada vez que alguien abre el justificante.
 */
export type ProofStorage = {
  readonly upload: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  readonly signedUrl: (path: string, expiresInSeconds: number) => Promise<string>;
  /** Borrado de mejor esfuerzo (subida que no llegó a registrarse). */
  readonly remove: (path: string) => Promise<void>;
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

/**
 * Verifica el token del captcha del checkout web con la IP del cliente (si se conoce).
 * Devuelve false si el token falta, es inválido o caducó, o si no se pudo comprobar.
 */
export type CaptchaVerifier = (token: string | undefined, ip: string | null) => Promise<boolean>;

/** Dependencias inyectadas: permiten probar la API con una base real y una autenticación falsa. */
export type AppDeps = {
  readonly sql: Sql;
  readonly verifyToken: (token: string) => Promise<AuthenticatedUser | null>;
  readonly now: () => Date;
  readonly clientIpHeader: string;
  readonly allowedOrigins: readonly string[];
  /** null si no está configurado: el panel ofrece pegar una URL en lugar de subir la foto. */
  readonly imageStorage?: ImageStorage | null;
  /** null si no hay clave de servicio: el cliente no puede subir justificantes. */
  readonly proofStorage?: ProofStorage | null;
  /** null si no hay RESEND_API_KEY: las invitaciones se comparten solo con el enlace. */
  readonly mailer?: Mailer | null;
  /** URL pública del panel para los enlaces de los emails si la petición no trae Origin. */
  readonly panelUrl?: string | null;
  /** null si no hay TURNSTILE_SECRET_KEY: el pedido web no exige captcha. */
  readonly verifyCaptcha?: CaptchaVerifier | null;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    restaurant: Restaurant;
    user: AuthenticatedUser;
    access: AccessContext;
    platform: PlatformUser;
  };
};
