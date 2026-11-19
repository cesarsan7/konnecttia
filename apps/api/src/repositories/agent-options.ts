import { FULFILLMENT, PAYMENT_METHOD } from "@konnecttia/domain";

/**
 * Opciones tocables de WhatsApp (botones y listas) para el agente. El texto y los límites de
 * WhatsApp se resuelven aquí, con los datos reales del restaurante: n8n solo las reenvía al
 * adaptador de salida, que sabe caer a texto numerado si algo no cabe.
 */
export const OPTION_KIND = {
  Fulfillment: "despacho",
  Branch: "local",
  Payment: "pago",
  Address: "direccion",
  Confirm: "confirmar",
} as const;

export type OptionKind = (typeof OPTION_KIND)[keyof typeof OPTION_KIND];

/** Prefijo del id que vuelve cuando el cliente toca una opción (`despacho:retiro`). */
export const OPTION_ID_PREFIX: Readonly<Record<OptionKind, string>> = {
  [OPTION_KIND.Fulfillment]: "despacho:",
  [OPTION_KIND.Branch]: "local:",
  [OPTION_KIND.Payment]: "pago:",
  [OPTION_KIND.Address]: "direccion:",
  [OPTION_KIND.Confirm]: "confirmar:",
};

const BUTTON_TITLE_MAX = 20;
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;
const LIST_MAX_ROWS = 10;
const LIST_BUTTON = "Ver locales";

const PAYMENT_TITLE: Readonly<Record<string, string>> = {
  [PAYMENT_METHOD.Cash]: "Efectivo",
  [PAYMENT_METHOD.Card]: "Tarjeta",
  [PAYMENT_METHOD.Transfer]: "Transferencia",
  [PAYMENT_METHOD.Bizum]: "Bizum",
};

export type ChoiceButton = { readonly id: string; readonly titulo: string };
export type ChoiceRow = {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion?: string;
};

export type OptionsView =
  | { readonly tipo: OptionKind; readonly disponible: false; readonly motivo: string }
  | {
      readonly tipo: OptionKind;
      readonly disponible: true;
      readonly botones: readonly ChoiceButton[];
    }
  | {
      readonly tipo: OptionKind;
      readonly disponible: true;
      readonly lista: {
        readonly boton: string;
        readonly secciones: readonly { readonly filas: readonly ChoiceRow[] }[];
      };
    };

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

export type FulfillmentInput = {
  readonly pickupEnabled: boolean;
  readonly deliveryEnabled: boolean;
};

/** Recoger o reparto: solo lo que el restaurante ofrece. Con una sola, no hay nada que elegir. */
export function fulfillmentOptions(input: FulfillmentInput): OptionsView {
  const botones: ChoiceButton[] = [];
  if (input.pickupEnabled) {
    botones.push({ id: `${OPTION_ID_PREFIX.despacho}${FULFILLMENT.Pickup}`, titulo: "Recoger" });
  }
  if (input.deliveryEnabled) {
    botones.push({
      id: `${OPTION_ID_PREFIX.despacho}${FULFILLMENT.Delivery}`,
      titulo: "A domicilio",
    });
  }
  if (botones.length < 2) {
    return { tipo: OPTION_KIND.Fulfillment, disponible: false, motivo: "una_sola_opcion" };
  }
  return { tipo: OPTION_KIND.Fulfillment, disponible: true, botones };
}

export type BranchOption = {
  readonly id: number;
  readonly name: string;
  readonly address: string | null;
};

/** Locales para recoger. Con uno solo no hay que elegir; con más de diez, el agente pregunta. */
export function branchOptions(branches: readonly BranchOption[]): OptionsView {
  if (branches.length < 2) {
    return { tipo: OPTION_KIND.Branch, disponible: false, motivo: "una_sola_opcion" };
  }
  if (branches.length > LIST_MAX_ROWS) {
    return { tipo: OPTION_KIND.Branch, disponible: false, motivo: "demasiadas_opciones" };
  }
  const filas = branches.map((branch) => ({
    id: `${OPTION_ID_PREFIX.local}${branch.id}`,
    titulo: clip(branch.name, ROW_TITLE_MAX),
    ...(branch.address ? { descripcion: clip(branch.address, ROW_DESCRIPTION_MAX) } : {}),
  }));
  return {
    tipo: OPTION_KIND.Branch,
    disponible: true,
    lista: { boton: LIST_BUTTON, secciones: [{ filas }] },
  };
}

/** Formas de pago que acepta el restaurante (hasta tres botones; más, el agente pregunta). */
export function paymentOptions(methods: readonly string[]): OptionsView {
  if (methods.length < 2) {
    return { tipo: OPTION_KIND.Payment, disponible: false, motivo: "una_sola_opcion" };
  }
  if (methods.length > 3) {
    return { tipo: OPTION_KIND.Payment, disponible: false, motivo: "demasiadas_opciones" };
  }
  const botones = methods.map((method) => ({
    id: `${OPTION_ID_PREFIX.pago}${method}`,
    titulo: clip(PAYMENT_TITLE[method] ?? method, BUTTON_TITLE_MAX),
  }));
  return { tipo: OPTION_KIND.Payment, disponible: true, botones };
}

/**
 * Última pregunta antes de crear el pedido: confirmar o cambiar algo. Sustituye a repetir los
 * botones de pago cuando el cliente ya eligió cómo paga.
 */
export function confirmOptions(): OptionsView {
  return {
    tipo: OPTION_KIND.Confirm,
    disponible: true,
    botones: [
      { id: `${OPTION_ID_PREFIX.confirmar}si`, titulo: "Sí, confirmar" },
      { id: `${OPTION_ID_PREFIX.confirmar}cambiar`, titulo: "Cambiar algo" },
    ],
  };
}

/**
 * Cómo da el cliente la dirección de reparto: escribirla o enviar un pin de WhatsApp. Siempre hay
 * dos botones; el agente explica después el formato de la dirección o cómo enviar el pin.
 */
export function addressOptions(): OptionsView {
  return {
    tipo: OPTION_KIND.Address,
    disponible: true,
    botones: [
      { id: `${OPTION_ID_PREFIX.direccion}escribir`, titulo: "Escribir dirección" },
      { id: `${OPTION_ID_PREFIX.direccion}ubicacion`, titulo: "Enviar ubicación" },
    ],
  };
}
