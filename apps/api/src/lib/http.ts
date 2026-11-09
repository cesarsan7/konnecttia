import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const API_ERROR = {
  InvalidBody: "invalid_body",
  RestaurantNotFound: "restaurant_not_found",
  RestaurantClosed: "local_closed",
  PaymentMethodNotAccepted: "payment_method_not_accepted",
  DeliveryNotAvailable: "delivery_not_available",
  PickupNotAvailable: "pickup_not_available",
  DeliveryZoneNotFound: "zone_not_found",
  BranchRequired: "branch_required",
  LocationRequired: "location_required",
  BranchNotAvailable: "branch_not_available",
  InvalidItems: "invalid_items",
  IdempotencyKeyRequired: "idempotency_key_required",
  OrderNotFound: "order_not_found",
  Unauthorized: "unauthorized",
  Forbidden: "forbidden",
  InvalidTransition: "transition_not_allowed",
  RateLimited: "rate_limited",
  ServiceUnavailable: "service_unavailable",
  NotFound: "not_found",
  Conflict: "conflict",
  /** La petición está bien formada pero una regla la rechaza; `reason` dice cuál. */
  Unprocessable: "unprocessable",
  InvalidImage: "invalid_image",
  StorageNotConfigured: "storage_not_configured",
  InvalidProof: "invalid_proof",
  ProofLimitReached: "proof_limit_reached",
  PaymentNotPending: "payment_not_pending",
  PrivacyRequired: "privacy_required",
  CaptchaFailed: "captcha_failed",
  /** Rechazo neutro de un pedido web: no dice si el teléfono está bloqueado. */
  OrderNotAccepted: "order_not_accepted",
  /** El restaurante no acepta pedidos ahora (prueba pendiente, rechazada o vencida). */
  RestaurantUnavailable: "restaurant_unavailable",
  /** Antifraude capa 3: el pedido de riesgo necesita un código de verificación del teléfono. */
  VerificationRequired: "verification_required",
  /** Antifraude capa 3: se alcanzó el tope mensual de códigos; pagar con tarjeta o llamar al local. */
  VerificationUnavailable: "verification_unavailable",
  /** El código escrito no es correcto, caducó o se agotaron los intentos (`reason` dice cuál). */
  CodeInvalid: "code_invalid",
  /** El proveedor no pudo enviar el código. */
  CodeSendFailed: "code_send_failed",
} as const;

export type ApiError = (typeof API_ERROR)[keyof typeof API_ERROR];

export function fail(
  c: Context,
  status: ContentfulStatusCode,
  error: ApiError,
  extra: Record<string, unknown> = {},
) {
  return c.json({ error, ...extra }, status);
}
