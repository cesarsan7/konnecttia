import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { AppDeps, AppEnv } from "./context";
import { API_ERROR, fail } from "./lib/http";
import { meRoutes } from "./routes/me";
import { panelRoutes } from "./routes/panel";
import { publicRoutes } from "./routes/public";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("requestId", randomUUID());
    await next();
    c.header("X-Request-Id", c.get("requestId"));
  });
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: (origin) => (deps.allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/public", publicRoutes(deps));
  app.route("/me", meRoutes(deps));
  app.route("/panel", panelRoutes(deps));

  app.onError((error, c) => {
    // Nunca se devuelven detalles internos: solo una referencia para soporte.
    console.error(
      JSON.stringify({
        level: "error",
        requestId: c.get("requestId"),
        path: c.req.path,
        message: error.message,
      }),
    );
    return fail(c, 503, API_ERROR.ServiceUnavailable, { reference: c.get("requestId") });
  });

  return app;
}
