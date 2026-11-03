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
