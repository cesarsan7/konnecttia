import type { Sql } from "../lib/db";
import type { PushPayload, PushSender } from "../lib/push";

type Row = { id: number; endpoint: string; p256dh: string; auth: string };

export async function saveSubscription(
  sql: Sql,
  input: {
    restauranteId: number;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
): Promise<void> {
  await sql`
    INSERT INTO public.push_suscripcion (restaurante_id, user_id, endpoint, p256dh, auth)
    VALUES (${input.restauranteId}, ${input.userId}::uuid, ${input.endpoint}, ${input.p256dh}, ${input.auth})
    ON CONFLICT (endpoint) DO UPDATE SET
      restaurante_id = EXCLUDED.restaurante_id, user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `;
}

export async function removeSubscription(
  sql: Sql,
  restauranteId: number,
  userId: string,
  endpoint: string,
): Promise<void> {
  await sql`
    DELETE FROM public.push_suscripcion
    WHERE endpoint = ${endpoint} AND restaurante_id = ${restauranteId} AND user_id = ${userId}::uuid
  `;
}

export async function hasSubscription(
  sql: Sql,
  restauranteId: number,
  userId: string,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM public.push_suscripcion
    WHERE restaurante_id = ${restauranteId} AND user_id = ${userId}::uuid LIMIT 1
  `;
  return rows.length > 0;
}

/** Canales en los que el pedido lo crea el propio personal: no hace falta avisarles. */
export const SILENT_CHANNELS: ReadonlySet<string> = new Set(["mostrador", "telefono"]);

/**
 * Avisa a todos los navegadores suscritos del restaurante. No lanza nunca: el pedido ya está
 * guardado y un fallo del servicio push no debe afectarlo. Borra las suscripciones caducadas.
 */
export async function notifyStaff(
  sql: Sql,
  sender: PushSender,
  restauranteId: number,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  try {
    const targets = await sql<Row[]>`
      SELECT id, endpoint, p256dh, auth FROM public.push_suscripcion
      WHERE restaurante_id = ${restauranteId}
    `;
    const results = await Promise.all(
      targets.map(async (target) => ({ target, result: await sender.send(target, payload) })),
    );
    const gone = results.filter((entry) => entry.result === "gone").map((entry) => entry.target.id);
    const ok = results.filter((entry) => entry.result === "sent").map((entry) => entry.target.id);
    if (gone.length > 0)
      await sql`DELETE FROM public.push_suscripcion WHERE id = ANY(${gone}::bigint[])`;
    if (ok.length > 0)
      await sql`UPDATE public.push_suscripcion SET last_ok_at = now() WHERE id = ANY(${ok}::bigint[])`;
    return { sent: ok.length, removed: gone.length };
  } catch {
    return { sent: 0, removed: 0 };
  }
}
