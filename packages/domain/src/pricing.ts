import { type AllergenInfo, combineAllergens } from "./allergens";
import { FULFILLMENT, type Fulfillment } from "./delivery";
import type { Catalog, Id, MenuItem, ModifierOption } from "./menu";
import { addCents, type Cents, cents, multiplyCents } from "./money";

/**
 * Cálculo del pedido en el servidor. El navegador solo envía ids y cantidades;
 * cualquier precio que envíe se ignora.
 */

export const MAX_LINES = 50;
export const MAX_QUANTITY = 99;

export const PRICING_ERROR = {
  EmptyOrder: "EMPTY_ORDER",
  TooManyLines: "TOO_MANY_LINES",
  InvalidQuantity: "INVALID_QUANTITY",
  ItemNotFound: "ITEM_NOT_FOUND",
  ItemUnavailable: "ITEM_UNAVAILABLE",
  VariantNotFound: "VARIANT_NOT_FOUND",
  VariantUnavailable: "VARIANT_UNAVAILABLE",
  OptionNotInItem: "OPTION_NOT_IN_ITEM",
  OptionUnavailable: "OPTION_UNAVAILABLE",
  OptionQuantityExceeded: "OPTION_QUANTITY_EXCEEDED",
  GroupMinNotMet: "GROUP_MIN_NOT_MET",
  GroupMaxExceeded: "GROUP_MAX_EXCEEDED",
  DeliveryZoneRequired: "DELIVERY_ZONE_REQUIRED",
  DeliveryMinimumNotMet: "DELIVERY_MINIMUM_NOT_MET",
} as const;

export type PricingErrorCode = (typeof PRICING_ERROR)[keyof typeof PRICING_ERROR];

export type PricingError = {
  readonly code: PricingErrorCode;
  readonly lineIndex?: number;
  readonly detail?: string;
};

export type RequestedModifier = { readonly optionId: Id; readonly quantity: number };

export type RequestedLine = {
  readonly itemId: Id;
  readonly variantId: Id;
  readonly quantity: number;
  readonly modifiers?: readonly RequestedModifier[];
  readonly note?: string;
};

export const SURCHARGE_KIND = {
  /** Suplemento cuando el subtotal no llega a un umbral (p. ej. envases +1 € en pedidos < 25 €). */
  BelowSubtotal: "below_subtotal",
} as const;

export type SurchargeRule = {
  readonly kind: typeof SURCHARGE_KIND.BelowSubtotal;
  readonly label: string;
  readonly thresholdCents: Cents;
  readonly amountCents: Cents;
  /** Si se omite, aplica a todas las modalidades. */
  readonly appliesTo?: readonly Fulfillment[];
};

export type DeliveryTerms = {
  readonly feeCents: Cents;
  readonly minOrderCents: Cents;
  /** Envío gratis cuando los productos alcanzan este importe. `null`/ausente: nunca. */
  readonly freeFromCents?: Cents | null;
};

export type PricingContext = {
  readonly fulfillment: Fulfillment;
  /** Obligatorio para reparto: condiciones de la zona ya resuelta en el servidor. */
  readonly delivery?: DeliveryTerms;
  readonly surcharges?: readonly SurchargeRule[];
};

export type QuotedModifier = {
  readonly optionId: Id;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
};

export type QuotedLine = {
  readonly itemId: Id;
  readonly variantId: Id;
  /** Nombres y precios congelados en el pedido: cambiar la carta mañana no altera este pedido. */
  readonly name: string;
  readonly variantName: string;
  readonly quantity: number;
  readonly unitPriceCents: Cents;
  readonly modifiers: readonly QuotedModifier[];
  readonly lineTotalCents: Cents;
  readonly allergens: AllergenInfo;
  readonly note?: string;
};

export type Quote = {
  readonly lines: readonly QuotedLine[];
  readonly subtotalCents: Cents;
  readonly surcharges: readonly { readonly label: string; readonly amountCents: Cents }[];
  readonly deliveryFeeCents: Cents;
  readonly totalCents: Cents;
};

export type PricingResult =
  | { readonly ok: true; readonly quote: Quote }
  | { readonly ok: false; readonly errors: readonly PricingError[] };

function isValidQuantity(quantity: number, max: number): boolean {
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= max;
}

function findOption(item: MenuItem, optionId: Id): { option: ModifierOption; groupId: Id } | null {
  for (const group of item.modifierGroups) {
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (option) {
      return { option, groupId: group.id };
    }
  }
  return null;
}

function priceLine(
  catalog: Catalog,
  line: RequestedLine,
  lineIndex: number,
): { ok: true; line: QuotedLine } | { ok: false; errors: PricingError[] } {
  const errors: PricingError[] = [];
  const fail = (code: PricingErrorCode, detail?: string) => {
    errors.push(detail === undefined ? { code, lineIndex } : { code, lineIndex, detail });
  };

  if (!isValidQuantity(line.quantity, MAX_QUANTITY)) {
    fail(PRICING_ERROR.InvalidQuantity);
  }

  const item = catalog.get(line.itemId);
  if (!item) {
    fail(PRICING_ERROR.ItemNotFound, String(line.itemId));
    return { ok: false, errors };
  }
  if (!item.active) {
    fail(PRICING_ERROR.ItemUnavailable, item.name);
  }

  const variant = item.variants.find((candidate) => candidate.id === line.variantId);
  if (!variant) {
    fail(PRICING_ERROR.VariantNotFound, String(line.variantId));
    return { ok: false, errors };
  }
  if (!variant.active) {
    fail(PRICING_ERROR.VariantUnavailable, variant.name);
  }

  const quotedModifiers: QuotedModifier[] = [];
  const selectedPerGroup = new Map<Id, number>();
  const modifierAllergens: AllergenInfo[] = [];

  for (const requested of line.modifiers ?? []) {
    const found = findOption(item, requested.optionId);
    if (!found) {
      fail(PRICING_ERROR.OptionNotInItem, String(requested.optionId));
      continue;
    }
    const { option, groupId } = found;
    if (!option.active) {
      fail(PRICING_ERROR.OptionUnavailable, option.name);
    }
    if (!isValidQuantity(requested.quantity, option.maxQuantity ?? 1)) {
      fail(PRICING_ERROR.OptionQuantityExceeded, option.name);
      continue;
    }
    selectedPerGroup.set(groupId, (selectedPerGroup.get(groupId) ?? 0) + requested.quantity);
    modifierAllergens.push(option.allergens);
    quotedModifiers.push({
      optionId: option.id,
      name: option.name,
      quantity: requested.quantity,
      unitPriceCents: option.priceDeltaCents,
    });
  }

  for (const group of item.modifierGroups) {
    const selected = selectedPerGroup.get(group.id) ?? 0;
    if (selected < group.minSelect) {
      fail(PRICING_ERROR.GroupMinNotMet, group.name);
    }
    if (group.maxSelect !== null && selected > group.maxSelect) {
      fail(PRICING_ERROR.GroupMaxExceeded, group.name);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const modifiersPerUnit = addCents(
    ...quotedModifiers.map((modifier) => multiplyCents(modifier.unitPriceCents, modifier.quantity)),
  );
  const unitPriceCents = addCents(variant.priceCents, modifiersPerUnit);

  return {
    ok: true,
    line: {
      itemId: item.id,
      variantId: variant.id,
      name: item.name,
      variantName: variant.name,
      quantity: line.quantity,
      unitPriceCents,
      modifiers: quotedModifiers,
      lineTotalCents: multiplyCents(unitPriceCents, line.quantity),
      allergens: combineAllergens([
        item.allergens,
        ...(variant.allergens ? [variant.allergens] : []),
        ...modifierAllergens,
      ]),
      ...(line.note ? { note: line.note } : {}),
    },
  };
}

export function priceOrder(
  catalog: Catalog,
  lines: readonly RequestedLine[],
  context: PricingContext,
): PricingResult {
  if (lines.length === 0) {
    return { ok: false, errors: [{ code: PRICING_ERROR.EmptyOrder }] };
  }
  if (lines.length > MAX_LINES) {
    return { ok: false, errors: [{ code: PRICING_ERROR.TooManyLines }] };
  }

  const errors: PricingError[] = [];
  const quoted: QuotedLine[] = [];
  lines.forEach((line, index) => {
    const result = priceLine(catalog, line, index);
    if (result.ok) {
      quoted.push(result.line);
    } else {
      errors.push(...result.errors);
    }
  });

  if (context.fulfillment === FULFILLMENT.Delivery && !context.delivery) {
    errors.push({ code: PRICING_ERROR.DeliveryZoneRequired });
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const subtotalCents = addCents(...quoted.map((line) => line.lineTotalCents));

  // Regla de negocio: si no se alcanza el mínimo de reparto, no se cambia a recogida;
  // se informa para que el cliente añada productos o elija recoger.
  if (context.fulfillment === FULFILLMENT.Delivery && context.delivery) {
    if (subtotalCents < context.delivery.minOrderCents) {
      return {
        ok: false,
        errors: [
          {
            code: PRICING_ERROR.DeliveryMinimumNotMet,
            detail: String(context.delivery.minOrderCents - subtotalCents),
          },
        ],
      };
    }
  }

  const surcharges = (context.surcharges ?? [])
    .filter(
      (rule) =>
        (rule.appliesTo === undefined || rule.appliesTo.includes(context.fulfillment)) &&
        subtotalCents < rule.thresholdCents,
    )
    .map((rule) => ({ label: rule.label, amountCents: rule.amountCents }));

  const freeFrom = context.delivery?.freeFromCents ?? null;
  const deliveryFeeCents =
    context.fulfillment === FULFILLMENT.Delivery &&
    context.delivery &&
    !(freeFrom !== null && subtotalCents >= freeFrom)
      ? context.delivery.feeCents
      : cents(0);

  return {
    ok: true,
    quote: {
      lines: quoted,
      subtotalCents,
      surcharges,
      deliveryFeeCents,
      totalCents: addCents(
        subtotalCents,
        deliveryFeeCents,
        ...surcharges.map((surcharge) => surcharge.amountCents),
      ),
    },
  };
}

/**
 * Condiciones de reparto para un subtotal (sin calcular las líneas): las mismas reglas de mínimo
 * y envío gratis que `priceOrder`. La usa la cotización del agente de WhatsApp.
 */
export function deliveryChargeFor(
  subtotalCents: Cents,
  terms: DeliveryTerms,
): { feeCents: Cents; meetsMinimum: boolean; missingCents: Cents } {
  const freeFrom = terms.freeFromCents ?? null;
  const missing = terms.minOrderCents - subtotalCents;
  return {
    feeCents: freeFrom !== null && subtotalCents >= freeFrom ? cents(0) : terms.feeCents,
    meetsMinimum: missing <= 0,
    missingCents: cents(Math.max(0, missing)),
  };
}
