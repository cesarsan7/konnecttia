import { z } from "zod";

/** Variables de entorno obligatorias: si falta alguna, la API no arranca. */
const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(20),
    PORT: z.coerce.number().int().positive().default(3001),
    /** Cabecera con la IP real del cliente, fijada por el proxy (Traefik en EasyPanel). */
    CLIENT_IP_HEADER: z.string().default("x-real-ip"),
    /** Orígenes permitidos para el navegador (CORS), separados por comas. */
    ALLOWED_ORIGINS: z.string().default(""),
    /**
     * Opcional: clave de servicio de Supabase para subir fotos de la carta a Storage. Sin ella, el
     * panel no ofrece subir fotos (solo pegar una URL). Nunca se envía al navegador.
     */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    /** Bucket público de Supabase Storage para las fotos de la carta. */
    MENU_IMAGES_BUCKET: z.string().min(1).default("menu-images"),
    /** Bucket PRIVADO de Supabase Storage para los justificantes de pago (usa la clave de servicio). */
    PAYMENT_PROOFS_BUCKET: z.string().min(1).default("payment-proofs"),
    /** Opcional: clave de Resend para enviar las invitaciones al equipo por email. */
    RESEND_API_KEY: z.string().min(10).optional(),
    /** Remitente verificado en Resend, p. ej. «EasyOrder <hola@konnecttia.com>». */
    RESEND_FROM: z.string().min(3).default("EasyOrder <onboarding@resend.dev>"),
    /** URL pública del panel (enlaces de los emails si la petición no trae Origin). */
    PANEL_PUBLIC_URL: z.string().url().optional(),
    /**
     * Opcional: clave secreta de Cloudflare Turnstile. Con ella, el pedido web exige el token del
     * captcha y lo verifica; sin ella, el pedido funciona como siempre. Nunca se envía al navegador.
     */
    TURNSTILE_SECRET_KEY: z.string().min(10).optional(),
    /**
     * `true` aplica las migraciones pendientes al arrancar (la imagen de producción lo activa).
     * Si una migración falla, la API no arranca. En desarrollo queda apagado.
     */
    AUTO_MIGRATE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /**
     * Antifraude capa 3 (código por WhatsApp). Sin credenciales ni simulación, la capa está apagada.
     * Número central de Konnecttia: una sola cuenta y una sola plantilla de autenticación.
     */
    WHATSAPP_ACCESS_TOKEN: z.string().min(10).optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(3).optional(),
    /** Nombre de la plantilla de autenticación aprobada en Meta. */
    WHATSAPP_CODE_TEMPLATE: z.string().min(1).default("codigo_verificacion"),
    WHATSAPP_CODE_LANGUAGE: z.string().min(2).default("es"),
    /** Secreto del HMAC de los códigos. Obligatorio si la capa 3 puede enviar. */
    CODE_HMAC_SECRET: z.string().min(32).optional(),
    /**
     * Solo para pruebas en staging mientras Meta aprueba la plantilla: en vez de enviar, escribe el
     * código en el log de la API. NUNCA en producción.
     */
    ANTIFRAUD_CODE_SIMULATE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    /**
     * Cobro de la suscripción (Stripe Billing). Todo opcional: sin STRIPE_SECRET_KEY el plan se
     * sigue asignando a mano. Los ids de precio son de los productos creados en Stripe.
     */
    STRIPE_SECRET_KEY: z.string().min(10).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
    STRIPE_PRICE_BASICO: z.string().min(3).optional(),
    STRIPE_PRICE_PREMIUM: z.string().min(3).optional(),
    /** Carpeta con las migraciones `NNNN_*.sql` (en la imagen: `/app/migrations`). */
    MIGRATIONS_DIR: z.string().min(1).default("../../packages/db/migrations"),
  })
  .superRefine((env, ctx) => {
    const whatsapp = [env.WHATSAPP_ACCESS_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID];
    if (whatsapp.some(Boolean) && !whatsapp.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: ["WHATSAPP_PHONE_NUMBER_ID"],
        message: "WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID van juntas",
      });
    }
    if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_WEBHOOK_SECRET"],
        message: "obligatorio si hay STRIPE_SECRET_KEY (sin él no se confirman los pagos)",
      });
    }
    const canSend = whatsapp.every(Boolean) || env.ANTIFRAUD_CODE_SIMULATE;
    if (canSend && !env.CODE_HMAC_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["CODE_HMAC_SECRET"],
        message: "obligatorio (32 caracteres o más) si se envían códigos de verificación",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Variables de entorno no válidas o ausentes: ${missing}`);
  }
  return parsed.data;
}
