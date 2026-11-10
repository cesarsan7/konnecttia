import type { AccessContext } from "@konnecttia/access";
import type { PlatformRole } from "@konnecttia/domain";
import type { Mailer } from "@konnecttia/notifications";
import type { AuthAdmin } from "./lib/auth-admin";
import type { Sql } from "./lib/db";
import type { PushSender } from "./lib/push";
import type { StripeClient } from "./lib/stripe";
import type { Restaurant } from "./repositories/restaurants";

export type AuthenticatedUser = {
  readonly userId: string;
  readonly email: string | null;
  /**
   * Si el email está confirmado en Supabase Auth. Sin indicar se trata como NO verificado: el
   * alta autoservicio lo exige y falla cerrado.
   */
  readonly emailVerified?: boolean;
};

/** Persona del equipo de Konnecttia que usa el panel interno (`plataforma_miembro`). */
export type PlatformUser = {
  readonly userId: string;
  readonly email: string | null;
  readonly rol: PlatformRole;
};

/** Almacén de imágenes (fotos de la carta). Devuelve la URL pública del archivo guardado. */
export type ImageStorage = {
  readonly upload: (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;
  /** Borra todo lo que cuelga de una carpeta (al borrar un restaurante); devuelve cuántos archivos. */
  readonly removeFolder?: (prefix: string) => Promise<number>;
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
  /** Borra todo lo que cuelga de una carpeta (al borrar un restaurante); devuelve cuántos archivos. */
  readonly removeFolder?: (prefix: string) => Promise<number>;
};

/** Envío de emails (Resend); vive en `@konnecttia/notifications`, compartido con el worker. */
export type { Mailer };

/**
 * Verifica el token del captcha del checkout web con la IP del cliente (si se conoce).
 * Devuelve false si el token falta, es inválido o caducó, o si no se pudo comprobar.
 */
export type CaptchaVerifier = (token: string | undefined, ip: string | null) => Promise<boolean>;

/**
 * Genera el enlace de recuperación de contraseña de Supabase Auth (clave de servicio). Devuelve
 * null si el email no tiene cuenta o no se pudo generar: quien llama no lo distingue.
 */
export type RecoveryLinkGenerator = (email: string, redirectTo: string) => Promise<string | null>;

/**
 * Envía el código de verificación al teléfono del cliente (WhatsApp, plantilla de autenticación).
 * Devuelve false si el proveedor no lo aceptó; nunca debe registrar el código.
 */
export type CodeSender = (message: {
  readonly telefono: string;
  readonly codigo: string;
  readonly restaurante: string;
}) => Promise<boolean>;

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
  /**
   * null si no hay clave de servicio: el panel pide el email de recuperación directamente a
   * Supabase (que necesita su propio SMTP).
   */
  readonly generateRecoveryLink?: RecoveryLinkGenerator | null;
  /** null si no hay TURNSTILE_SECRET_KEY: el pedido web no exige captcha. */
  readonly verifyCaptcha?: CaptchaVerifier | null;
  /**
   * Antifraude capa 3. Sin `sendCode` y `codeSecret` la capa queda apagada aunque un restaurante
   * tenga `antifraude_codigo_canal`: no se pide código que no se pueda enviar.
   */
  readonly sendCode?: CodeSender | null;
  /** Secreto del HMAC con el que se guarda el hash de cada código (mínimo 32 caracteres). */
  readonly codeSecret?: string | null;
  /** null si no hay STRIPE_SECRET_KEY: el cobro de la suscripción queda apagado. */
  /** null si no hay clave de servicio: el panel interno no puede buscar ni borrar cuentas de Supabase. */
  readonly authAdmin?: AuthAdmin | null;
  /** null si no hay claves VAPID: el tablero no ofrece activar los avisos push. */
  readonly push?: PushSender | null;
  readonly stripe?: StripeClient | null;
  /** Secreto del endpoint del webhook de Stripe; sin él, el webhook responde 503. */
  readonly stripeWebhookSecret?: string | null;
  /** Precio de Stripe de cada plan de pago (código del plan → id del precio). */
  readonly stripePrices?: Readonly<Record<string, string>>;
};

export type AppEnv = {
  Variables: {
    requestId: string;
    restaurant: Restaurant;
    user: AuthenticatedUser;
    access: AccessContext;
    platform: PlatformUser;
    /** Presente solo si quien consulta es del equipo de Konnecttia en modo soporte (solo lectura). */
    support: { readonly expiraEn: Date; readonly motivo: string } | null;
  };
};
