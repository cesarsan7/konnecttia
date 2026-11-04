import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { Sql } from "../src/lib/db";

const ORIGIN = "https://panel.test";

const app = createApp({
  sql: null as unknown as Sql,
  now: () => new Date(),
  clientIpHeader: "x-real-ip",
  allowedOrigins: [ORIGIN],
  verifyToken: async () => null,
});

async function preflight(method: string, origin = ORIGIN) {
  return app.request("/panel/x/carta/categorias/orden", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
}

describe("CORS del panel", () => {
  // Sin PUT, el navegador bloquea ordenar y marcar disponibilidad («Sin conexión con el servidor»).
  it.each(["GET", "POST", "PUT", "PATCH", "DELETE"])(
    "permite %s desde un origen autorizado",
    async (method) => {
      const response = await preflight(method);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(method);
    },
  );

  it("no responde a orígenes no autorizados", async () => {
    const response = await preflight("PUT", "https://otro.test");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
