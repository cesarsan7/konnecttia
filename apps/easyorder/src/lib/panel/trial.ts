import { plural } from "../alta/logic";

/** Prueba gratuita del restaurante, tal como la devuelve `GET /panel/:slug/acceso`. */
export type Trial = {
  readonly estado: "pendiente" | "activa" | "convertida" | "rechazada";
  /** null = sin límite de días. */
  readonly dias_restantes: number | null;
  /** null = sin límite de pedidos. */
  readonly pedidos_restantes: number | null;
  readonly acepta_pedidos: boolean;
  readonly contacto: string | null;
};

export type TrialBannerTone = "info" | "warn" | "danger";

export type TrialBanner = {
  readonly tone: TrialBannerTone;
  /** Frase del banner. Si hay `contact`, el banner la completa con ese email como enlace. */
  readonly text: string;
  readonly contact: string | null;
};

/**
 * Aviso del panel según el estado de la prueba. null si el restaurante no está en prueba
 * (restaurantes de siempre y pruebas ya convertidas).
 */
export function trialBanner(trial: Trial | null): TrialBanner | null {
  if (!trial || trial.estado === "convertida") return null;
  const contact = trial.contacto;
  if (trial.estado === "pendiente") {
    return {
      tone: "warn",
      text: "Pendiente de aprobación: te avisaremos en cuanto tu restaurante pueda recibir pedidos.",
      contact: null,
    };
  }
  if (trial.estado === "rechazada") {
    return {
      tone: "danger",
      text: contact
        ? "Tu solicitud no se ha aprobado y tu carta no acepta pedidos. Tus datos se conservan. Escríbenos a"
        : "Tu solicitud no se ha aprobado y tu carta no acepta pedidos. Tus datos se conservan.",
      contact,
    };
  }
  if (!trial.acepta_pedidos) {
    return {
      tone: "danger",
      text: contact
        ? "Tu prueba terminó: tus datos se conservan. Activa tu plan escribiendo a"
        : "Tu prueba terminó: tus datos se conservan. Activa tu plan hablando con Konnecttia.",
      contact,
    };
  }
  const left = [
    trial.dias_restantes === null ? null : plural(trial.dias_restantes, "día", "días"),
    trial.pedidos_restantes === null ? null : plural(trial.pedidos_restantes, "pedido", "pedidos"),
  ].filter((part): part is string => part !== null);
  const urgent =
    (trial.dias_restantes !== null && trial.dias_restantes <= 3) ||
    (trial.pedidos_restantes !== null && trial.pedidos_restantes <= 5);
  return {
    tone: urgent ? "warn" : "info",
    text:
      left.length === 0
        ? "Estás en la prueba gratuita de EasyOrder."
        : `Prueba: te quedan ${left.join(" y ")}.`,
    contact: null,
  };
}
