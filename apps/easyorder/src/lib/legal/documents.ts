import { LEGAL_DOCUMENT, type LegalDocument } from "@konnecttia/domain";

/**
 * Borradores de los documentos legales de Konnecttia. NO son texto jurídico definitivo: deben
 * revisarlos una persona abogada antes de publicarse (mientras la versión termine en «-borrador»
 * la página lo avisa). Datos de la empresa por completar: razón social, NIF y domicilio.
 */
export type LegalSection = { readonly titulo: string; readonly parrafos: readonly string[] };
export type LegalText = {
  readonly titulo: string;
  readonly resumen: string;
  readonly secciones: readonly LegalSection[];
};

export const LEGAL_TEXTS: Readonly<Record<LegalDocument, LegalText>> = {
  [LEGAL_DOCUMENT.Terms]: {
    titulo: "Términos del servicio",
    resumen: "Las condiciones con las que un restaurante usa Konnecttia / EasyOrder.",
    secciones: [
      {
        titulo: "1. Qué es el servicio",
        parrafos: [
          "Konnecttia ofrece al restaurante una carta online propia, un sistema de pedidos por la web y por WhatsApp, y un panel para gestionarlos. El restaurante vende sus productos directamente a sus clientes; Konnecttia no es parte de esa venta.",
        ],
      },
      {
        titulo: "2. Precio",
        parrafos: [
          "El servicio se cobra con una cuota fija según el plan elegido. Konnecttia no cobra comisión por pedido. Los complementos (por ejemplo, avisos por WhatsApp) pueden tener coste adicional, que se informará antes de activarlos.",
          "Durante la prueba gratuita el servicio puede estar limitado por días o por número de pedidos.",
        ],
      },
      {
        titulo: "3. Obligaciones del restaurante",
        parrafos: [
          "El restaurante es responsable de la veracidad de su carta, precios, alérgenos, horarios y zonas de reparto; de cumplir la normativa aplicable a su actividad (sanidad, consumo, fiscalidad); y de la atención a sus clientes y reclamaciones.",
          "Debe mantener seguras sus credenciales y las de su equipo, y no usar el servicio para fines ilícitos.",
        ],
      },
      {
        titulo: "4. Obligaciones de Konnecttia",
        parrafos: [
          "Prestar el servicio con diligencia razonable, mantener copias de seguridad y avisar con antelación de interrupciones previsibles. No se garantiza una disponibilidad ininterrumpida.",
        ],
      },
      {
        titulo: "5. Datos y confidencialidad",
        parrafos: [
          "Los clientes y los pedidos del restaurante son del restaurante. El tratamiento de datos personales se rige por el contrato de encargado de tratamiento.",
        ],
      },
      {
        titulo: "6. Duración y baja",
        parrafos: [
          "El servicio se contrata sin permanencia salvo pacto distinto. El restaurante puede darse de baja en cualquier momento; al hacerlo, puede exportar sus datos y, a su petición, se borrarán.",
          "Konnecttia puede suspender el servicio por impago, uso fraudulento o incumplimiento grave de estos términos.",
        ],
      },
      {
        titulo: "7. Responsabilidad",
        parrafos: [
          "Konnecttia responde de los daños directos causados por su incumplimiento hasta el importe pagado por el restaurante en los doce meses anteriores, salvo dolo o lo que la ley no permita limitar.",
        ],
      },
      {
        titulo: "8. Cambios y ley aplicable",
        parrafos: [
          "Los cambios en estos términos se comunicarán con antelación razonable y se identificarán por su versión. Se aplica la ley española; los tribunales competentes serán los que correspondan según la normativa de consumidores y usuarios o, en su defecto, los del domicilio de Konnecttia.",
        ],
      },
    ],
  },
  [LEGAL_DOCUMENT.Processor]: {
    titulo: "Contrato de encargado de tratamiento",
    resumen:
      "Cómo trata Konnecttia los datos personales de los clientes del restaurante (art. 28 RGPD).",
    secciones: [
      {
        titulo: "1. Partes y objeto",
        parrafos: [
          "El restaurante es el responsable del tratamiento de los datos de sus clientes. Konnecttia actúa como encargado y trata esos datos solo para prestar el servicio (carta, pedidos, seguimiento, avisos y panel) y siguiendo las instrucciones del restaurante.",
        ],
      },
      {
        titulo: "2. Datos y personas afectadas",
        parrafos: [
          "Datos de los clientes finales: nombre, teléfono, email, dirección de entrega, contenido de los pedidos, justificantes de pago e incidencias. Datos del equipo del restaurante: nombre, email y rol.",
        ],
      },
      {
        titulo: "3. Obligaciones del encargado",
        parrafos: [
          "Tratar los datos solo según las instrucciones del restaurante; garantizar la confidencialidad de quien acceda a ellos; aplicar medidas de seguridad adecuadas (control de acceso por rol, cifrado en tránsito, copias de seguridad, registro de actividad); y ayudar al restaurante a atender los derechos de los interesados.",
          "Avisar al restaurante sin dilación indebida si detecta una violación de seguridad que afecte a sus datos.",
        ],
      },
      {
        titulo: "4. Subencargados",
        parrafos: [
          "El restaurante autoriza el uso de proveedores necesarios para el servicio: alojamiento e infraestructura, base de datos y autenticación (Supabase), envío de email (Resend), mensajería (Meta / WhatsApp Business) y, si se activa, cobro de la suscripción (Stripe). Konnecttia les impone obligaciones equivalentes y avisará de cambios relevantes.",
        ],
      },
      {
        titulo: "5. Transferencias internacionales",
        parrafos: [
          "Si algún subencargado trata datos fuera del Espacio Económico Europeo, se hará con las garantías previstas en el RGPD (decisión de adecuación o cláusulas contractuales tipo).",
        ],
      },
      {
        titulo: "6. Duración, devolución y supresión",
        parrafos: [
          "El contrato dura lo que el servicio. Al terminar, y a petición del restaurante, Konnecttia le devolverá o suprimirá los datos, incluidos los archivos asociados, salvo que la ley exija conservarlos.",
        ],
      },
      {
        titulo: "7. Auditoría",
        parrafos: [
          "Konnecttia pondrá a disposición del restaurante la información necesaria para demostrar el cumplimiento de estas obligaciones.",
        ],
      },
    ],
  },
  [LEGAL_DOCUMENT.Cookies]: {
    titulo: "Política de cookies",
    resumen: "Qué almacenamiento usa la plataforma en tu navegador.",
    secciones: [
      {
        titulo: "1. Qué usamos",
        parrafos: [
          "Solo almacenamiento técnico necesario: la sesión de acceso al panel, la preferencia de tema y el recorrido guiado, y el carrito del cliente en su navegador. También se carga una comprobación anti-bots (Cloudflare Turnstile) en formularios sensibles.",
        ],
      },
      {
        titulo: "2. Qué no usamos",
        parrafos: [
          "No usamos cookies de publicidad ni de seguimiento de terceros. Si en el futuro se añade analítica o marketing, se pedirá consentimiento antes de activarla.",
        ],
      },
      {
        titulo: "3. Cómo borrarlas",
        parrafos: [
          "Puedes borrar el almacenamiento del sitio desde los ajustes de tu navegador; al hacerlo se cerrará tu sesión y se vaciará tu carrito.",
        ],
      },
    ],
  },
};
