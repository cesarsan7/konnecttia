import { allergenLabel, ETA_SERVICE, searchMenu } from "@konnecttia/domain";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { resolveAgentChannel } from "../middleware/agent";
import {
  agentPresentation,
  agentSettings,
  loadAgentCustomer,
  loadRestaurantMessages,
} from "../repositories/agent";
import { isPhoneBlocked } from "../repositories/antifraud";
import {
  type BranchRecord,
  loadBranches,
  openChecker,
  unavailableItems,
} from "../repositories/branches";
import { loadPublicMenu, type PublicMenu } from "../repositories/catalog";
import { loadEtaContext } from "../repositories/eta";
import { loadConfig, openOverride, pickupEta } from "../repositories/restaurants";
import { restaurantAcceptsOrders } from "../repositories/trial";

/** Teléfono del cliente en E.164 con «+» (el adaptador de canal ya lo normaliza). */
const phoneSchema = z.string().regex(/^\+[1-9][0-9]{6,14}$/);
const branchIdSchema = z.coerce.number().int().positive();
const MAX_QUERY_LENGTH = 200;
const MAX_MATCHES = 8;

const cartaQuerySchema = z.object({
  sucursal_id: branchIdSchema.optional(),
  q: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
  categoria: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
});

/**
 * Local con el que se consulta la carta: el pedido explícitamente (si es de este restaurante y
 * está activo), el del número de WhatsApp o, si solo hay uno activo, ese. null = sin local.
 */
function pickBranch(
  active: readonly BranchRecord[],
  requested: number | undefined,
  channelBranch: number | null,
): BranchRecord | null | "not_found" {
  if (requested !== undefined) {
    return active.find((branch) => branch.id === requested) ?? "not_found";
  }
  if (channelBranch !== null) {
    return active.find((branch) => branch.id === channelBranch) ?? null;
  }
  return active.length === 1 ? (active[0] ?? null) : null;
}

type AgentProduct = {
  readonly id: number;
  readonly nombre: string;
  readonly categoria: string;
  readonly descripcion: string | null;
  readonly variantes: readonly { id: number; nombre: string; precio: number }[];
  readonly extras: readonly { id: number; nombre: string; precio: number }[];
  /** Texto listo para el cliente; nunca dice «sin alérgenos» si el dato falta. */
  readonly alergenos: string;
};

function agentProducts(menu: PublicMenu, hidden: ReadonlySet<number>): AgentProduct[] {
  return menu.categories.flatMap((category) =>
    category.items
      .filter((item) => !hidden.has(item.id))
      .map((item) => ({
        id: item.id,
        nombre: item.name,
        categoria: category.name,
        descripcion: item.description,
        variantes: item.variants.map((variant) => ({
          id: variant.id,
          nombre: variant.name,
          precio: variant.price,
        })),
        extras: item.extras.map((extra) => ({
          id: extra.id,
          nombre: extra.name,
          precio: extra.price,
        })),
        alergenos: allergenLabel(item.allergens),
      })),
  );
}

/**
 * Rutas para el agente de WhatsApp en n8n (ADR 0012, punto 5): la conversación vive en n8n; los
 * datos y las reglas, aquí, con la misma lógica que la web.
 */
export function agenteRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use("/canales/:canalId/*", resolveAgentChannel(deps));

  /**
   * Todo lo que el agente necesita al empezar un turno: identidad, si puede tomar pedidos, locales
   * abiertos y datos del cliente en este restaurante.
   */
  app.get("/canales/:canalId/contexto", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const telefono = phoneSchema.safeParse(c.req.query("telefono"));
    if (!telefono.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: [{ path: "telefono", message: "E.164 con «+»" }],
      });
    }
    const [config, branches, messages, customer, accepts, blocked] = await Promise.all([
      loadConfig(deps.sql, restaurant.id),
      loadBranches(deps.sql, restaurant.id),
      loadRestaurantMessages(deps.sql, restaurant.id),
      loadAgentCustomer(deps.sql, restaurant.id, telefono.data),
      restaurantAcceptsOrders(deps.sql, restaurant.id, deps.now()),
      isPhoneBlocked(deps.sql, restaurant.id, telefono.data),
    ]);
    const settings = agentSettings(config);
    const active = branches.filter((branch) => branch.active);
    const isOpen = await openChecker(
      deps.sql,
      restaurant,
      active,
      openOverride(config),
      deps.now(),
    );
    const etaCtx = await loadEtaContext(deps.sql, restaurant, config, deps.now());
    const pickupBase = pickupEta(config);
    const locales = active.map((branch) => ({
      id: branch.id,
      nombre: branch.name,
      direccion: branch.address,
      abierto: isOpen(branch),
      recogida: branch.acceptsPickup && restaurant.pickupEnabled,
      reparto: branch.acceptsDelivery && restaurant.deliveryEnabled,
      tiempo_recogida: branch.acceptsPickup
        ? etaCtx.resolve(pickupBase, ETA_SERVICE.Pickup, branch.id)
        : null,
    }));
    const channelBranch = locales.find((local) => local.id === channel.sucursalId) ?? null;
    // Un número de un local concreto responde por ese local: si está cerrado, no se pide por él.
    const abierto = channelBranch ? channelBranch.abierto : locales.some((local) => local.abierto);

    return c.json({
      restaurante: { id: restaurant.id, nombre: restaurant.nombre, slug: restaurant.slug },
      agente: {
        activo: settings.activo,
        presentacion: agentPresentation(restaurant.nombre, settings.nombreVisible),
        nombre_visible: settings.nombreVisible,
        tono: settings.tono,
        instrucciones: settings.instrucciones,
        pausa_minutos: settings.pausaMinutos,
        pausa_derivar_minutos: settings.pausaDerivarMinutos,
      },
      mensajes: messages,
      canal: { id: channel.id, sucursal_id: channel.sucursalId },
      local_del_canal: channelBranch,
      abierto,
      // Mensaje neutro si no: el agente no dice el motivo (prueba vencida o teléfono bloqueado).
      puede_pedir: accepts && !blocked,
      recogida: restaurant.pickupEnabled && locales.some((local) => local.recogida),
      reparto: restaurant.deliveryEnabled && locales.some((local) => local.reparto),
      metodos_pago: restaurant.paymentMethods,
      locales,
      cliente: {
        telefono: telefono.data,
        nombre: customer.nombre,
        direccion_frecuente: customer.direccionFrecuente,
      },
    });
  });

  /**
   * Carta real para el agente: solo lo activo y, con local, sin lo agotado allí. Con `q`, los
   * productos que mejor encajan con lo que escribió el cliente (con la variante y los extras que
   * nombró); el agente elige entre ellos o pregunta, nunca inventa.
   */
  app.get("/canales/:canalId/carta", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const parsed = cartaQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const query = parsed.data;
    const [menu, branches] = await Promise.all([
      loadPublicMenu(deps.sql, restaurant.id),
      loadBranches(deps.sql, restaurant.id),
    ]);
    const branch = pickBranch(
      branches.filter((candidate) => candidate.active),
      query.sucursal_id,
      channel.sucursalId,
    );
    if (branch === "not_found") {
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    }
    const hidden = branch ? await unavailableItems(deps.sql, branch.id) : new Set<number>();
    let products = agentProducts(menu, hidden);
    if (query.categoria) {
      const wanted = searchMenu(
        query.categoria,
        products.map((product) => ({
          id: product.id,
          name: "",
          category: product.categoria,
          description: null,
          variants: [],
          extras: [],
        })),
        products.length,
      );
      const ids = new Set(wanted.map((match) => match.itemId));
      products = products.filter((product) => ids.has(product.id));
    }
    const local = branch ? { id: branch.id, nombre: branch.name } : null;

    if (!query.q) {
      return c.json({ local, productos: products });
    }
    const byId = new Map(products.map((product) => [product.id, product]));
    const matches = searchMenu(
      query.q,
      products.map((product) => ({
        id: product.id,
        name: product.nombre,
        category: product.categoria,
        description: product.descripcion,
        variants: product.variantes.map((variant) => ({ id: variant.id, name: variant.nombre })),
        extras: product.extras.map((extra) => ({ id: extra.id, name: extra.nombre })),
      })),
      MAX_MATCHES,
    );
    return c.json({
      local,
      candidatos: matches.flatMap((match) => {
        const product = byId.get(match.itemId);
        if (!product) return [];
        return [
          {
            ...product,
            puntuacion: Math.round(match.score * 100) / 100,
            variante_id: match.variantId,
            extra_ids: match.extraIds,
          },
        ];
      }),
    });
  });

  return app;
}
