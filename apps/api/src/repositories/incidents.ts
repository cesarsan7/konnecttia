import {
  canReportIncident,
  INCIDENT_STATUS,
  type IncidentType,
  MAX_OPEN_INCIDENTS_PER_ORDER,
} from "@konnecttia/domain";
import type { Sql } from "../lib/db";

export type ReportIncident = "created" | "not_found" | "not_allowed" | "too_many";

/**
 * El cliente abre una incidencia desde el enlace de seguimiento (pieza P). El token es la
 * credencial; el pedido se bloquea para contar bien las abiertas aunque lleguen dos a la vez.
 */
export async function reportIncident(
  sql: Sql,
  token: string,
  input: { readonly tipo: IncidentType; readonly descripcion: string },
): Promise<ReportIncident> {
  return sql.begin(async (tx) => {
    const [order] = await tx<{ id: number; restaurante_id: number; estado: string }[]>`
      SELECT id, restaurante_id, estado FROM public.pedidos
      WHERE  tracking_token = ${token}::uuid
      FOR UPDATE
    `;
    if (!order) return "not_found" as const;
    if (!canReportIncident(order.estado)) return "not_allowed" as const;
    const [open] = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.pedido_incidencia
      WHERE  pedido_id = ${order.id} AND estado = ${INCIDENT_STATUS.Open}
    `;
    if ((open?.n ?? 0) >= MAX_OPEN_INCIDENTS_PER_ORDER) return "too_many" as const;
    await tx`
      INSERT INTO public.pedido_incidencia (pedido_id, restaurante_id, tipo, descripcion)
      VALUES (${order.id}, ${order.restaurante_id}, ${input.tipo}, ${input.descripcion})
    `;
    return "created" as const;
  });
}

/** Incidencias del pedido que ve el propio cliente en el seguimiento (sin datos del local). */
export async function trackedIncidents(
  sql: Sql,
  token: string,
): Promise<{ tipo: string; estado: string; createdAt: string }[]> {
  return sql<{ tipo: string; estado: string; createdAt: string }[]>`
    SELECT i.tipo, i.estado, i.created_at AS "createdAt"
    FROM   public.pedido_incidencia i
    JOIN   public.pedidos p ON p.id = i.pedido_id
    WHERE  p.tracking_token = ${token}::uuid
    ORDER  BY i.created_at DESC
    LIMIT  10
  `;
}
