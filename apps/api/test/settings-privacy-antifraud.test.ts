import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isValidPhoneLimit,
  isValidPolicyUrl,
  PHONE_LIMIT_MAX,
  PRIVACY_URL_MAX,
  parseHttpUrl,
} from "../src/lib/settings-validation";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

const salchimaduro = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];

async function call(user: User, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: {
      ...auth(user),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const patch = (user: User, slug: string, body: unknown) =>
  call(user, "PATCH", `/panel/${slug}/ajustes/restaurante`, body);

async function webOrder(phone: string) {
  const response = await ctx.app.request("/public/prueba-a/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `198.51.100.${Math.floor(Math.random() * 200)}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Lucía",
      telefono: phone,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      items: salchimaduro,
    }),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const configValue = async (key: string) => {
  const rows = await ctx.sql<{ config_value: string }[]>`
    SELECT config_value FROM public.restaurante_config
    WHERE  restaurante_id = 101 AND config_key = ${key}
  `;
  return rows[0]?.config_value ?? null;
};

describe("validación de privacidad y antifraude (lógica pura)", () => {
  it("acepta URL http/https o vacía y rechaza el resto", () => {
    expect(isValidPolicyUrl("https://rest.example/privacidad")).toBe(true);
    expect(isValidPolicyUrl("http://rest.example")).toBe(true);
    expect(isValidPolicyUrl("   ")).toBe(true);
    expect(isValidPolicyUrl(null)).toBe(true);
    expect(isValidPolicyUrl("javascript:alert(1)")).toBe(false);
    expect(isValidPolicyUrl("ftp://rest.example/p")).toBe(false);
    expect(isValidPolicyUrl("rest.example/privacidad")).toBe(false);
    expect(isValidPolicyUrl(`https://rest.example/${"a".repeat(PRIVACY_URL_MAX)}`)).toBe(false);
    expect(parseHttpUrl("data:text/html,x")).toBeNull();
  });

  it("acepta límites enteros de 1 al tope o vacíos", () => {
    expect(isValidPhoneLimit(null)).toBe(true);
    expect(isValidPhoneLimit(undefined)).toBe(true);
    expect(isValidPhoneLimit(1)).toBe(true);
    expect(isValidPhoneLimit(PHONE_LIMIT_MAX)).toBe(true);
    expect(isValidPhoneLimit(0)).toBe(false);
    expect(isValidPhoneLimit(-2)).toBe(false);
    expect(isValidPhoneLimit(1.5)).toBe(false);
    expect(isValidPhoneLimit(PHONE_LIMIT_MAX + 1)).toBe(false);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("ajustes de privacidad y antifraude", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("rechaza URL no web, versión larga y límites inválidos", async () => {
    for (const body of [
      { privacidad_url: "javascript:alert(1)" },
      { privacidad_url: "ftp://rest.example/p" },
      { privacidad_url: "rest.example/privacidad" },
      { privacidad_version: "v".repeat(41) },
      { antifraude_abiertos: 0 },
      { antifraude_abiertos: 1.5 },
      { antifraude_por_hora: "3" },
      { antifraude_por_hora: PHONE_LIMIT_MAX + 1 },
    ]) {
      expect((await patch("ownerA", "prueba-a", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await configValue("privacidad_url")).toBeNull();
  });

  it("solo quien puede cambiar los ajustes del restaurante los guarda", async () => {
    const body = { privacidad_version: "2027-01" };
    expect((await patch("viewerA", "prueba-a", body)).status).toBe(403);
    expect((await patch("ownerB", "prueba-a", body)).status).toBe(403);
    // Usuario limitado a un local: los ajustes generales los cambia el propietario.
    expect((await patch("managerPlaya", "prueba-c", body)).status).toBe(403);
    expect(await configValue("privacidad_version")).toBeNull();
  });

  it("guarda, devuelve y audita los ajustes", async () => {
    const saved = await patch("ownerA", "prueba-a", {
      privacidad_url: "  https://prueba-a.example/privacidad ",
      privacidad_version: " 2027-01 ",
      antifraude_abiertos: 2,
      antifraude_por_hora: 5,
    });
    expect(saved.status).toBe(200);
    expect(await configValue("privacidad_url")).toBe("https://prueba-a.example/privacidad");
    expect(await configValue("privacidad_version")).toBe("2027-01");
    expect(await configValue("antifraude_pedidos_abiertos_por_telefono")).toBe("2");
    expect(await configValue("antifraude_pedidos_por_telefono_hora")).toBe("5");

    const read = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(read.body.restaurante).toMatchObject({
      privacidad_url: "https://prueba-a.example/privacidad",
      privacidad_version: "2027-01",
      antifraude_abiertos: 2,
      antifraude_por_hora: 5,
    });

    const trail = await ctx.sql<{ detalle: Json }[]>`
      SELECT detalle FROM public.auditoria
      WHERE  restaurante_id = 101 AND accion = 'ajustes.restaurante'
        AND  detalle ? 'privacidad_version'
    `;
    expect(trail.length).toBe(1);
    expect(trail[0]?.detalle).toMatchObject({
      privacidad_version: "2027-01",
      antifraude_por_hora: 5,
    });
  });

  it("los pedidos web nuevos guardan la versión vigente de la política", async () => {
    await patch("ownerA", "prueba-a", { privacidad_version: "2027-02" });
    const order = await webOrder("+34600009101");
    expect(order.status).toBe(201);
    const [row] = await ctx.sql<{ privacidad_version: string | null }[]>`
      SELECT privacidad_version FROM public.pedidos
      WHERE  tracking_token = ${order.body.tracking_token}::uuid
    `;
    expect(row?.privacidad_version).toBe("2027-02");

    await patch("ownerA", "prueba-a", { privacidad_version: "2027-03" });
    const next = await webOrder("+34600009102");
    expect(next.status).toBe(201);
    const [again] = await ctx.sql<{ privacidad_version: string | null }[]>`
      SELECT privacidad_version FROM public.pedidos
      WHERE  tracking_token = ${next.body.tracking_token}::uuid
    `;
    expect(again?.privacidad_version).toBe("2027-03");
  });

  it("aplica el límite por hora configurado y deja de aplicarlo al vaciarlo", async () => {
    await patch("ownerA", "prueba-a", { antifraude_abiertos: null, antifraude_por_hora: 1 });
    expect((await webOrder("+34600009201")).status).toBe(201);
    const blocked = await webOrder("+34600009201");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ reason: "phone_limit" });

    await patch("ownerA", "prueba-a", { antifraude_por_hora: null });
    expect(await configValue("antifraude_pedidos_por_telefono_hora")).toBeNull();
    expect((await webOrder("+34600009201")).status).toBe(201);
  });

  it("aplica el límite de pedidos abiertos configurado", async () => {
    await patch("ownerA", "prueba-a", { antifraude_abiertos: 1, antifraude_por_hora: null });
    expect((await webOrder("+34600009301")).status).toBe(201);
    expect((await webOrder("+34600009301")).status).toBe(429);
  });

  it("vaciar URL y versión borra las claves (vuelve la página plantilla)", async () => {
    const cleared = await patch("ownerA", "prueba-a", {
      privacidad_url: "",
      privacidad_version: null,
    });
    expect(cleared.status).toBe(200);
    expect(await configValue("privacidad_url")).toBeNull();
    expect(await configValue("privacidad_version")).toBeNull();
    const read = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(read.body.restaurante).toMatchObject({ privacidad_url: null, privacidad_version: null });
  });
});
