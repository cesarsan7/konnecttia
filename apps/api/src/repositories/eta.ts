import {
  adjustEta,
  type BusyMode,
  type EtaAdjustments,
  type EtaService,
  formatEtaRange,
  type PeakWindow,
} from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { type EtaBase, queueRule } from "./restaurants";

/** Estados en los que un pedido ocupa a la cocina (para el ajuste por cola). */
const ACTIVE_ORDER_STATES = [
  "recibido",
  "pendiente_pago",
  "confirmado",
  "pagado",
  "en_preparacion",
];
/** Ventana para contar pedidos activos: evita que pedidos antiguos olvidados sumen. */
const ACTIVE_WINDOW_HOURS = 6;

type PeakRow = {
  sucursal_id: number | null;
  dia: string | null;
  desde: string;
  hasta: string;
  servicio: PeakWindow["service"];
  minutos_extra: number;
};

type BusyRow = {
  sucursal_id: number | null;
  servicio: BusyMode["service"];
  minutos_extra: number;
  hasta: Date;
};

/** Todo lo que puede ajustar el tiempo de un restaurante ahora mismo, en una sola carga. */
export type EtaContext = {
  readonly resolve: (base: EtaBase | null, service: EtaService, branchId: number) => string | null;
};

export async function loadEtaContext(
  sql: Sql,
  restaurant: { readonly id: number; readonly zonaHoraria: string },
  config: ReadonlyMap<string, string>,
  now: Date,
): Promise<EtaContext> {
  const queue = queueRule(config);
  const [peaks, busy, active] = await Promise.all([
    sql<PeakRow[]>`
      SELECT sucursal_id, dia, to_char(desde, 'HH24:MI') AS desde, to_char(hasta, 'HH24:MI') AS hasta,
             servicio, minutos_extra
      FROM   public.franja_pico
      WHERE  restaurante_id = ${restaurant.id} AND activo
    `,
    sql<BusyRow[]>`
      SELECT sucursal_id, servicio, minutos_extra, hasta
      FROM   public.modo_ocupado
      WHERE  restaurante_id = ${restaurant.id}
        AND  finalizado_at IS NULL
        AND  desde <= ${now} AND hasta > ${now}
    `,
    queue
      ? sql<{ sucursal_id: number | null; pedidos: number }[]>`
          SELECT sucursal_id, count(*)::int AS pedidos
          FROM   public.pedidos
          WHERE  restaurante_id = ${restaurant.id}
            AND  estado IN ${sql(ACTIVE_ORDER_STATES)}
            AND  created_at > (${now}::timestamptz AT TIME ZONE 'UTC') - make_interval(hours => ${ACTIVE_WINDOW_HOURS})
          GROUP  BY sucursal_id
        `
      : Promise.resolve([]),
  ]);
  const activeByBranch = new Map(active.map((row) => [row.sucursal_id, row.pedidos]));

  const adjustmentsFor = (branchId: number): EtaAdjustments => ({
    peaks: peaks
      .filter((row) => row.sucursal_id === null || row.sucursal_id === branchId)
      .map((row) => ({
        day: row.dia,
        from: row.desde,
        to: row.hasta,
        service: row.servicio,
        extraMinutes: row.minutos_extra,
      })),
    busy: busy
      .filter((row) => row.sucursal_id === null || row.sucursal_id === branchId)
      .map((row) => ({ service: row.servicio, extraMinutes: row.minutos_extra, until: row.hasta })),
    queue,
    activeOrders: activeByBranch.get(branchId) ?? 0,
  });

  return {
    resolve: (base, service, branchId) => {
      if (!base) return null;
      if (base.kind === "texto") return base.text;
      return formatEtaRange(
        adjustEta(base.range, service, adjustmentsFor(branchId), now, restaurant.zonaHoraria),
      );
    },
  };
}
