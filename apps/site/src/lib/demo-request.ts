import { z } from "zod";

export const PRODUCT_INTEREST = ["EasyOrder", "EasyAgenda", "Complementos de WhatsApp"] as const;

export const demoRequestSchema = z.object({
  nombre: z.string().trim().min(2, "Indica tu nombre").max(80),
  negocio: z.string().trim().min(2, "Indica el nombre del negocio").max(120),
  municipio: z.string().trim().min(2, "Indica el municipio o la isla").max(80),
  contacto: z
    .string()
    .trim()
    .min(6, "Indica un teléfono o correo")
    .max(120)
    .refine(
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^\+?[\d\s-]{9,15}$/.test(value),
      "Escribe un teléfono o un correo válido",
    ),
  producto: z.enum(PRODUCT_INTEREST),
  mensaje: z.string().trim().max(1000).optional().default(""),
  privacidad: z.literal(true, { error: "Necesitamos tu aceptación para responderte" }),
  /** Campo trampa para bots: los humanos no lo ven ni lo rellenan. */
  website: z.string().max(0).optional().default(""),
});

export type DemoRequest = z.infer<typeof demoRequestSchema>;

export function demoRequestEmail(request: DemoRequest): { subject: string; text: string } {
  return {
    subject: `Solicitud de demo: ${request.negocio} (${request.producto})`,
    text: [
      `Nombre: ${request.nombre}`,
      `Negocio: ${request.negocio}`,
      `Municipio o isla: ${request.municipio}`,
      `Contacto: ${request.contacto}`,
      `Producto: ${request.producto}`,
      "",
      request.mensaje || "(sin mensaje)",
    ].join("\n"),
  };
}
