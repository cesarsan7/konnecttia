import { z } from "zod";

/** Solicitud de demo enviada desde el formulario de la landing. */
export const demoRequestSchema = z.object({
  nombre: z.string().trim().min(2, "Indica tu nombre").max(80),
  restaurante: z.string().trim().min(2, "Indica el nombre del restaurante").max(120),
  ubicacion: z.string().trim().max(80).optional().default(""),
  contacto: z
    .string()
    .trim()
    .min(6, "Indica un teléfono o correo")
    .max(120)
    .refine(
      (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^\+?[\d\s-]{9,15}$/.test(value),
      "Escribe un teléfono o un correo válido",
    ),
  mensaje: z.string().trim().max(1000).optional().default(""),
  consentimiento: z.literal(true, { error: "Necesitamos tu consentimiento para responderte" }),
  /** Campo trampa para bots: los humanos no lo ven ni lo rellenan. */
  website: z.string().max(200).optional().default(""),
});

export type DemoRequest = z.infer<typeof demoRequestSchema>;

export function demoRequestEmail(request: DemoRequest): { subject: string; text: string } {
  return {
    subject: `Solicitud de demo de EasyOrder: ${request.restaurante}`,
    text: [
      `Nombre: ${request.nombre}`,
      `Restaurante: ${request.restaurante}`,
      `Municipio o isla: ${request.ubicacion || "(no indicado)"}`,
      `Contacto: ${request.contacto}`,
      "",
      request.mensaje || "(sin mensaje)",
    ].join("\n"),
  };
}
