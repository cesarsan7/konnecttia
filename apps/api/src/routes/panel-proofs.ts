import { canAccessBranch, PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { listProofs, PROOF_URL_SECONDS } from "../repositories/payment-proofs";

/**
 * Justificantes de pago de un pedido (Bizum, transferencia). El archivo vive en un bucket
 * privado: el panel recibe URLs firmadas de corta duración, nunca una ruta permanente.
 * Mismo permiso que confirmar el cobro (orders.update) y solo para pedidos de los locales del
 * usuario; el de otro local o restaurante se trata como inexistente.
 */
export function registerProofRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.get(
    "/:slug/orders/:id/justificantes",
    requirePermission(deps, PERMISSION.OrdersUpdate),
    async (c) => {
      const restaurant = c.get("restaurant");
      const user = c.get("user");
      const id = Number.parseInt(c.req.param("id"), 10);
      if (!Number.isSafeInteger(id) || id < 1) {
        return fail(c, 400, API_ERROR.InvalidBody, { field: "id" });
      }
      const storage = deps.proofStorage;
      if (!storage) return fail(c, 503, API_ERROR.StorageNotConfigured);

      const [order] = await deps.sql<{ id: number; sucursal_id: number | null }[]>`
        SELECT id, sucursal_id FROM public.pedidos
        WHERE  id = ${id} AND restaurante_id = ${restaurant.id}
      `;
      if (!order || !canAccessBranch(c.get("access"), order.sucursal_id)) {
        return fail(c, 404, API_ERROR.OrderNotFound);
      }
      const proofs = await listProofs(deps.sql, restaurant.id, id);
      const justificantes = await Promise.all(
        proofs.map(async (proof) => ({
          id: proof.id,
          tipo_mime: proof.tipo_mime,
          bytes: proof.bytes,
          created_at: proof.created_at,
          url: await storage.signedUrl(proof.ruta, PROOF_URL_SECONDS),
        })),
      );
      await audit(deps.sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: "orders.proof.view",
        recursoTipo: "pedido",
        recursoId: String(id),
        resultado: "ok",
        detalle: { justificantes: justificantes.length },
        requestId: c.get("requestId"),
      });
      return c.json({ justificantes, expira_en_segundos: PROOF_URL_SECONDS });
    },
  );
}
