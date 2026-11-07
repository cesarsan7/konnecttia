// API SOLO PARA GENERAR LAS CAPTURAS DE LA AYUDA. No se despliega ni se importa desde ningún sitio.
//
// Arranca la API real (`createApp`) contra una base desechable y acepta tokens FALSOS para entrar
// como personas del equipo de demostración. Para usarla se copia a `apps/api/src/zz-dev-visual.ts`
// (así encuentra `./app` y `./lib/db`) y se borra al terminar: nunca se sube al repositorio.
// Ver apps/easyorder/scripts/README-capturas.md.
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createSql } from "./lib/db";

const users: Record<string, { userId: string; email: string }> = {
  "token-ownerC": { userId: "00000000-0000-0000-0000-0000000000c1", email: "owner-c@test.local" },
  "token-managerPlaya": {
    userId: "00000000-0000-0000-0000-0000000000c3",
    email: "encargado-c@test.local",
  },
  "token-driver": {
    userId: "00000000-0000-0000-0000-0000000000e1",
    email: "repartidor@test.local",
  },
  "token-trial": { userId: "00000000-0000-0000-0000-0000000000f1", email: "alta1@test.local" },
};

const app = createApp({
  sql: createSql(process.env.DATABASE_URL ?? ""),
  now: () => new Date(),
  clientIpHeader: "x-real-ip",
  allowedOrigins: ["http://localhost:3020", "http://127.0.0.1:3020"],
  verifyToken: async (token) => users[token] ?? null,
  // Almacenes falsos: el panel ofrece «Subir foto» y el cliente puede subir justificantes.
  imageStorage: { upload: async (path) => `https://example.invalid/${path}` },
  proofStorage: {
    upload: async () => {},
    signedUrl: async (path) => `https://example.invalid/${path}`,
    remove: async () => {},
  },
});

serve({ fetch: app.fetch, port: 3001 });
