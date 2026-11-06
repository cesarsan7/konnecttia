import { ALL_BRANCHES, can, canAccessBranch, PERMISSION } from "@konnecttia/access";
import { FULFILLMENT, ORDER_STATUS } from "@konnecttia/domain";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { isPhoneBlocked } from "../repositories/antifraud";
import { ORDER_CHANNEL } from "../repositories/orders";
import { type OrderInput, placeOrder } from "../repositories/place-order";
import { CONFIG_KEY, loadConfig } from "../repositories/restaurants";
import { occupyTable } from "./panel-tables";
import { resolveWaiter } from "./panel-waiters";
import { orderBodySchema } from "./public";

const IDEMPOTENCY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/** Canal del pedido manual: el equipo lo toma por teléfono o en el mostrador (también en mesa). */
const manualChannel = z.enum([ORDER_CHANNEL.Phone, ORDER_CHANNEL.Counter]);

const positiveInt = z.number().int().positive();

/** Sin `lookup_pedidos_limit` se muestran los mismos que el ejemplo documentado en config_clave. */
const DEFAULT_LOOKUP_LIMIT = 5;
const MAX_LOOKUP_LIMIT = 20;
const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];

/** Solo dígitos, sin el 00 internacional: «+34 612 34 56 78» → «34612345678». */
export function phoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 7 && digits.length <= 20 ? digits : null;
}

export function lookupLimit(config: ReadonlyMap<string, string>): number {
  const value = Number.parseInt(config.get(CONFIG_KEY.LookupOrdersLimit) ?? "", 10);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_LOOKUP_LIMIT;
  return Math.min(value, MAX_LOOKUP_LIMIT);
}

/** Pedido en mesa: sin dirección ni zona; nombre y teléfono opcionales. */
const dineInSchema = z.object({
  mesa_id: positiveInt,
  /** Mesero que atiende (null = ninguno). Sin indicar: el de la mesa o el propio usuario. */
  mesero_id: positiveInt.nullable().optional(),
  nombre: z.string().trim().max(120).optional(),
  telefono: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,20}$/)
    .optional(),
  metodo_pago: z.string().trim().min(1).max(40),
  notas: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        menu_item_id: positiveInt,
        menu_variant_id: positiveInt,
        quantity: positiveInt,
        extras: z
          .array(z.object({ extra_id: positiveInt, quantity: positiveInt }))
          .max(30)
          .optional(),
        nota: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Pedido manual desde el panel (orders.create). Usa exactamente el mismo cálculo que la web
 * (placeOrder): local abierto, zona, mínimo, tarifa, tiempo, agotados por local y precios de la
 * carta. El navegador solo envía ids y cantidades. El local que resulte debe ser del usuario.
 */
export function registerManualOrderRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  /**
   * Últimos pedidos de un teléfono para «Repetir pedido» en el pedido manual. El teléfono se
   * compara solo por dígitos (la web guarda +34…, n8n puede guardarlo sin prefijo o sin «+»).
   * Cada usuario solo ve los pedidos de sus locales.
   */
  app.get(
    "/:slug/orders/anteriores",
    requirePermission(deps, PERMISSION.OrdersCreate),
    async (c) => {
      const digits = phoneDigits(c.req.query("telefono") ?? "");
      if (!digits) return fail(c, 400, API_ERROR.InvalidBody, { field: "telefono" });
      const restaurantId = c.get("restaurant").id;
      const scope = c.get("access").branchScope;
      const limit = lookupLimit(await loadConfig(deps.sql, restaurantId));
      // Un número español sin prefijo (9 cifras) también coincide con el mismo número con 34.
      const short = digits.startsWith("34") && digits.length === 11 ? digits.slice(2) : digits;
      const samePhone = deps.sql`regexp_replace(p.telefono, '[^0-9]', '', 'g') IN (${digits}, ${short}, ${`34${short}`})`;
      const [orders, customers, blocked] = await Promise.all([
        deps.sql<
          {
            id: number;
            codigo: string | null;
            created_at: string;
            tipo_despacho: string | null;
            direccion: string | null;
            local_nombre: string | null;
            total: string;
            items: unknown;
          }[]
        >`
          SELECT p.id, p.pedido_codigo AS codigo, p.created_at AT TIME ZONE 'UTC' AS created_at,
                 p.tipo_despacho, p.direccion, s.nombre AS local_nombre, p.total, p.items
          FROM   public.pedidos p
          LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
          WHERE  p.restaurante_id = ${restaurantId} AND p.telefono <> ''
            AND  ${samePhone}
            AND  p.estado NOT IN ${deps.sql(NOT_A_SALE)}
            ${scope === ALL_BRANCHES ? deps.sql`` : deps.sql`AND p.sucursal_id IN ${deps.sql([...scope])}`}
          ORDER  BY p.created_at DESC
          LIMIT  ${limit}
        `,
        deps.sql<{ nombre: string | null; direccion_frecuente: string | null }[]>`
          SELECT u.nombre, u.direccion_frecuente FROM public.usuarios u
          WHERE  u.restaurante_id = ${restaurantId}
            AND  regexp_replace(u.telefono, '[^0-9]', '', 'g') IN (${digits}, ${short}, ${`34${short}`})
          ORDER  BY u.updated_at DESC NULLS LAST
          LIMIT  1
        `,
        // Aviso en el pedido manual: el equipo puede continuar igualmente.
        isPhoneBlocked(deps.sql, restaurantId, digits),
      ]);
      // Un usuario limitado a unos locales no ve datos de clientes sin pedidos en ellos.
      const customer =
        scope !== ALL_BRANCHES && orders.length === 0 ? null : (customers[0] ?? null);
      return c.json({
        cliente: customer,
        bloqueado: blocked,
        pedidos: orders.map((order) => ({ ...order, total: Number(order.total) })),
      });
    },
  );

  app.post("/:slug/orders", requirePermission(deps, PERMISSION.OrdersCreate), async (c) => {
    const restaurant = c.get("restaurant");
    const user = c.get("user");
    const access = c.get("access");
    const idempotencyKey = c.req.header(IDEMPOTENCY_HEADER) ?? "";
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      return fail(c, 400, API_ERROR.IdempotencyKeyRequired, { header: IDEMPOTENCY_HEADER });
    }
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const channel = manualChannel.safeParse(raw?.canal);
    let body: OrderInput;
    let tableId: number | null = null;
    let waiterId: number | null = null;
    if (raw?.tipo_despacho === FULFILLMENT.DineIn) {
      // Mesa: requiere el módulo de mesas; el local es el de la mesa y el teléfono es opcional.
      if (!can(access, PERMISSION.TablesView)) {
        return fail(c, 403, API_ERROR.Forbidden, { permission: PERMISSION.TablesView });
      }
      const parsed = dineInSchema.safeParse(raw);
      if (!channel.success || !parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
      const [table] = await deps.sql<{ id: number; nombre: string; sucursal_id: number | null }[]>`
        SELECT id, nombre, sucursal_id FROM public.mesa
        WHERE  id = ${parsed.data.mesa_id} AND restaurante_id = ${restaurant.id} AND activa
      `;
      if (!table || table.sucursal_id === null || !canAccessBranch(access, table.sucursal_id)) {
        return fail(c, 404, API_ERROR.NotFound, { reason: "table_not_found" });
      }
      tableId = table.id;
      const waiter = await resolveWaiter(deps.sql, {
        restauranteId: restaurant.id,
        branchId: table.sucursal_id,
        tableId: table.id,
        requested: parsed.data.mesero_id,
        userId: user.userId,
      });
      if (!waiter.ok) return fail(c, 404, API_ERROR.NotFound, { reason: "waiter_not_found" });
      waiterId = waiter.id;
      body = {
        ...parsed.data,
        tipo_despacho: FULFILLMENT.DineIn,
        sucursal_id: table.sucursal_id,
        nombre: parsed.data.nombre || table.nombre,
        nombre_pedido: table.nombre,
        telefono: parsed.data.telefono ?? "",
      };
    } else {
      const parsed = orderBodySchema.safeParse(raw);
      if (!channel.success || !parsed.success) {
        return fail(c, 400, API_ERROR.InvalidBody, {
          issues: [
            ...(channel.success ? [] : [{ path: "canal", message: "telefono | mostrador" }]),
            ...(parsed.success
              ? []
              : parsed.error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  message: issue.message,
                }))),
          ],
        });
      }
      body = parsed.data;
    }
    // Un usuario limitado a unos locales solo crea pedidos en ellos.
    if (body.sucursal_id !== undefined && !canAccessBranch(access, body.sucursal_id)) {
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    }
    const placed = await placeOrder(
      deps,
      restaurant,
      body,
      `panel-${idempotencyKey}`,
      channel.success ? channel.data : ORDER_CHANNEL.Counter,
      (branchId) => canAccessBranch(access, branchId),
    );
    if (!placed.ok) return fail(c, 422, placed.error, placed.extra);
    const { order, branch, eta, priced } = placed;
    // La mesa queda ocupada (desde su primer pedido) hasta que el equipo la libere.
    if (tableId !== null) {
      await occupyTable(deps.sql, restaurant.id, tableId, order.id);
      if (waiterId !== null) {
        await deps.sql`
          UPDATE public.pedidos SET mesero_id = ${waiterId}
          WHERE  id = ${order.id} AND restaurante_id = ${restaurant.id} AND mesero_id IS NULL
        `;
        await deps.sql`
          UPDATE public.mesa SET mesero_id = COALESCE(mesero_id, ${waiterId})
          WHERE  id = ${tableId} AND restaurante_id = ${restaurant.id}
        `;
      }
    }
    if (order.created) {
      await audit(deps.sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: PERMISSION.OrdersCreate,
        recursoTipo: "pedido",
        recursoId: String(order.id),
        resultado: "ok",
        detalle: { canal: channel.data, local: branch.id, total: order.totalCents / 100 },
        requestId: c.get("requestId"),
      });
    }
    return c.json(
      {
        id: order.id,
        pedido_codigo: order.pedidoCodigo,
        tracking_token: order.trackingToken,
        estado: order.estado,
        local: { id: branch.id, nombre: branch.name },
        tiempo_estimado: eta,
        subtotal: priced.quote.subtotalCents / 100,
        costo_envio: priced.quote.deliveryFeeCents / 100,
        total: order.totalCents / 100,
      },
      order.created ? 201 : 200,
    );
  });
}
