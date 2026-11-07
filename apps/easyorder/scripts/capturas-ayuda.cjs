// Genera las capturas de pantalla del centro de ayuda (`public/ayuda/<nombre>-escritorio.png` y
// `-movil.png`). Se ejecuta contra un entorno local con datos de demostración: mira
// scripts/README-capturas.md para prepararlo.
//
//   DATABASE_URL=postgresql://…/konnecttia_visual node apps/easyorder/scripts/capturas-ayuda.cjs
//
// Variables opcionales: WEB_URL (por defecto http://localhost:3020), SALIDA (carpeta de salida),
// SOLO (lista de capturas separadas por comas, para repetir solo algunas).
const { execFileSync } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, devices } = require("playwright");

const WEB = process.env.WEB_URL ?? "http://localhost:3020";
const OUT = process.env.SALIDA ?? join(__dirname, "..", "public", "ayuda");
const ONLY = process.env.SOLO ? new Set(process.env.SOLO.split(",")) : null;
const SLUG = "prueba-c";
const SLUG_TRIAL = "prueba-t";
const TIMEOUT = 20000;

// Personas de la API falsa (scripts/capturas/api-falsa.ts). Los datos son inventados.
const PEOPLE = {
  owner: ["token-ownerC", "00000000-0000-0000-0000-0000000000c1", "owner-c@test.local"],
  driver: ["token-driver", "00000000-0000-0000-0000-0000000000e1", "repartidor@test.local"],
  trial: ["token-trial", "00000000-0000-0000-0000-0000000000f1", "alta1@test.local"],
};
const SECTIONS = [
  "pedidos",
  "mesas",
  "carta",
  "clientes",
  "estadisticas",
  "equipo",
  "ajustes",
  "repartos",
];

function session([token, id, email]) {
  return {
    access_token: token,
    refresh_token: "r",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id,
      aud: "authenticated",
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

/** Token de seguimiento de un pedido de demostración, leído de la base local. */
function trackingToken(code) {
  const sql = `select tracking_token from public.pedidos where pedido_codigo = '${code}'`;
  return execFileSync("psql", [process.env.DATABASE_URL, "-At", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

const DEVICES = [
  { name: "escritorio", options: { viewport: { width: 1360, height: 900 } } },
  { name: "movil", options: { ...devices["iPhone 13"], deviceScaleFactor: 2 } },
];

async function open(browser, device, person, extraStorage = {}) {
  const context = await browser.newContext({
    ...device.options,
    colorScheme: "light",
    locale: "es-ES",
    timezoneId: "Atlantic/Canary",
  });
  await context.addInitScript(
    ([auth, sections, extra]) => {
      try {
        if (auth) localStorage.setItem("sb-visualtest-auth-token", JSON.stringify(auth.session));
        // La guía automática taparía la pantalla: se marca como vista en todas las secciones.
        if (auth) {
          for (const section of sections) {
            localStorage.setItem(`easyorder.guia.v1:${auth.session.user.id}:${section}`, "1");
          }
        }
        for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
      } catch {
        // Sin almacenamiento no hay nada que preparar.
      }
    },
    [person ? { session: session(person) } : null, SECTIONS, extraStorage],
  );
  const page = await context.newPage();
  await page.route("https://visualtest.supabase.co/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  return { context, page };
}

async function settle(page, ms = 700) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** Cada captura: nombre, quién entra, a dónde va y qué hace antes de fotografiar. */
const SHOTS = [
  {
    name: "login",
    run: async (page) => {
      await page.goto(`${WEB}/panel`);
      await page.waitForSelector("form", { timeout: TIMEOUT });
    },
  },
  {
    name: "alta",
    run: async (page) => {
      await page.goto(`${WEB}/alta`);
      await page.waitForSelector("form, h1", { timeout: TIMEOUT });
    },
  },
  {
    name: "pedidos-primeros-pasos",
    person: "trial",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG_TRIAL}`);
      await page.waitForSelector(".k-board", { timeout: TIMEOUT });
    },
  },
  {
    name: "prueba-aviso",
    person: "trial",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG_TRIAL}/carta`);
      await page.waitForSelector(".k-trial", { timeout: TIMEOUT });
    },
  },
  {
    name: "pedidos-tablero",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}`);
      await page.waitForSelector(".k-order", { timeout: TIMEOUT });
    },
  },
  {
    name: "pedidos-tabla",
    person: "owner",
    storage: { "easyorder.panel.vista": "tabla" },
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}`);
      await page.waitForSelector(".k-history", { timeout: TIMEOUT });
      await page.getByRole("button", { name: "Todo", exact: true }).click();
      await page.waitForSelector(".k-otable", { timeout: TIMEOUT });
    },
  },
  {
    name: "pedidos-nuevo",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}`);
      await page.getByRole("button", { name: "Nuevo pedido" }).first().click();
      await page.waitForSelector(".k-manual-item", { timeout: TIMEOUT });
      await page.locator(".k-manual-item").first().click();
    },
  },
  {
    name: "pedidos-ocupado",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}`);
      await page.waitForSelector("[data-tour=pedidos-ocupado]", { timeout: TIMEOUT });
      await page.locator("[data-tour=pedidos-ocupado] > summary").click();
    },
  },
  {
    name: "pedidos-comanda",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}`);
      await page.waitForSelector("[data-tour=pedidos-comanda]", { timeout: TIMEOUT });
      await page.locator("[data-tour=pedidos-comanda]").click();
      await page.waitForSelector("dialog[open]", { timeout: TIMEOUT });
    },
  },
  {
    name: "cobros-tablero",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}`);
      await page.waitForSelector(".k-order", { timeout: TIMEOUT });
      await page
        .locator(".k-order", { hasText: "Confirmar cobro" })
        .first()
        .scrollIntoViewIfNeeded();
    },
  },
  {
    name: "mesas-plano",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/mesas`);
      await page.waitForSelector(".k-table-tile", { timeout: TIMEOUT });
    },
  },
  {
    name: "mesas-mesa",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/mesas`);
      await page.waitForSelector(".k-table-tile", { timeout: TIMEOUT });
      await page.locator(".k-table-tile.is-busy").first().click();
      await page.waitForSelector("dialog[open]", { timeout: TIMEOUT });
    },
  },
  {
    name: "mesas-editar",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/mesas`);
      await page.waitForSelector(".k-head-tools .k-toggle", { timeout: TIMEOUT });
      await page.locator(".k-head-tools .k-toggle").first().click();
    },
  },
  {
    name: "carta-productos",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/carta`);
      await page.waitForSelector(".k-item-link", { timeout: TIMEOUT });
    },
  },
  {
    name: "carta-producto",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/carta`);
      await page.waitForSelector(".k-item-link", { timeout: TIMEOUT });
      await page.locator(".k-item-link").first().click();
      await page.waitForSelector("dialog[open]", { timeout: TIMEOUT });
    },
  },
  {
    name: "carta-extras",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/carta`);
      await page.waitForSelector(".k-item-link", { timeout: TIMEOUT });
      await page
        .getByRole("button", { name: /Extras/ })
        .first()
        .click();
      await page.waitForSelector(".k-items", { timeout: TIMEOUT });
    },
  },
  {
    name: "clientes-lista",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/clientes`);
      await page.waitForSelector(".k-item-link", { timeout: TIMEOUT });
    },
  },
  {
    name: "clientes-ficha",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/clientes`);
      await page.waitForSelector(".k-item-link", { timeout: TIMEOUT });
      await page.locator(".k-item-link").first().click();
      await page.waitForSelector("dialog[open]", { timeout: TIMEOUT });
    },
  },
  {
    name: "clientes-bloquear",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/clientes`);
      await page.waitForSelector(".k-item-link", { timeout: TIMEOUT });
      await page.locator(".k-item-link").first().click();
      await page.waitForSelector("dialog[open]", { timeout: TIMEOUT });
      await page
        .getByRole("button", { name: /Bloquear/ })
        .first()
        .click();
      await page.waitForSelector("text=Bloquear cliente", { timeout: TIMEOUT });
    },
  },
  {
    name: "estadisticas",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/estadisticas`);
      await page.waitForSelector("[data-tour=estadisticas-resumen]", { timeout: TIMEOUT });
    },
  },
  {
    name: "equipo-miembros",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/equipo`);
      await page.waitForSelector("[data-tour=equipo-miembros]", { timeout: TIMEOUT });
    },
  },
  {
    name: "equipo-invitar",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/equipo`);
      await page
        .getByRole("button", { name: /Invitar a alguien/ })
        .first()
        .click();
      await page.waitForSelector("dialog[open]", { timeout: TIMEOUT });
    },
  },
  {
    name: "equipo-roles",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/equipo`);
      await page.waitForSelector("#roles", { timeout: TIMEOUT });
      await page.locator("#roles").scrollIntoViewIfNeeded();
    },
  },
  ...[
    ["ajustes-general", "General"],
    ["ajustes-pago", "Pedidos y pago"],
    ["ajustes-privacidad", "Privacidad y antifraude"],
    ["ajustes-horario", "Horario"],
    ["ajustes-reparto", "Reparto"],
  ].map(([name, tab]) => ({
    name,
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/ajustes`);
      await page.waitForSelector("[data-tour=ajustes-secciones]", { timeout: TIMEOUT });
      await page.getByRole("button", { name: tab, exact: true }).click();
      if (name === "ajustes-general") {
        // La demo fuerza «abierto» para que la carta acepte pedidos a cualquier hora; en la
        // captura se muestra «Según horario» (sin guardar) para no enseñar el aviso rojo.
        await page.getByRole("button", { name: "Según horario", exact: true }).click();
      }
    },
  })),
  {
    name: "ajustes-foto-entrega",
    person: "owner",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/ajustes`);
      await page.waitForSelector("[data-tour=ajustes-secciones]", { timeout: TIMEOUT });
      await page.getByRole("button", { name: "Reparto", exact: true }).click();
      await page.getByText("Prueba de entrega").first().scrollIntoViewIfNeeded();
    },
  },
  {
    name: "repartos-lista",
    person: "driver",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/repartos`);
      await page.waitForSelector("[data-tour=repartos-lista]", { timeout: TIMEOUT });
    },
  },
  {
    name: "repartos-foto",
    person: "driver",
    run: async (page) => {
      await page.goto(`${WEB}/panel/${SLUG}/repartos`);
      await page.waitForSelector("[data-tour=repartos-lista]", { timeout: TIMEOUT });
      const photo = page.locator("[data-tour=repartos-foto]");
      if (await photo.count()) await photo.first().scrollIntoViewIfNeeded();
    },
  },
  {
    name: "web-carta",
    run: async (page) => {
      await page.goto(`${WEB}/${SLUG}`);
      await page.waitForSelector("main", { timeout: TIMEOUT });
    },
  },
  {
    name: "web-pedido",
    run: async (page) => {
      await page.goto(`${WEB}/${SLUG}`);
      await page.waitForSelector("main", { timeout: TIMEOUT });
      await page.locator("button.item:not([disabled])").first().click();
      await page.locator("form button[type=submit]").first().click();
      await page.locator(".cart-bar button").first().click();
      await page.waitForSelector("form", { timeout: TIMEOUT });
    },
  },
  {
    name: "web-seguimiento",
    run: async (page) => {
      await page.goto(`${WEB}/${SLUG}/pedido/${trackingToken("E-1039")}`);
      await page.waitForSelector("main", { timeout: TIMEOUT });
    },
  },
  {
    name: "cobros-seguimiento",
    run: async (page) => {
      await page.goto(`${WEB}/${SLUG}/pedido/${trackingToken("E-1044")}`);
      await page.waitForSelector("main", { timeout: TIMEOUT });
      await page
        .getByText("Subir justificante")
        .first()
        .evaluate((element) => element.scrollIntoView({ block: "center" }));
    },
  },
];

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failures = [];
  for (const shot of SHOTS) {
    if (ONLY && !ONLY.has(shot.name)) continue;
    for (const device of DEVICES) {
      const { context, page } = await open(
        browser,
        device,
        shot.person ? PEOPLE[shot.person] : null,
        shot.storage,
      );
      try {
        await shot.run(page);
        await settle(page);
        const file = join(OUT, `${shot.name}-${device.name}.png`);
        await page.screenshot({ path: file });
        console.log(`ok   ${shot.name}-${device.name}`);
      } catch (error) {
        failures.push(`${shot.name}-${device.name}`);
        console.log(`FALLA ${shot.name}-${device.name}: ${String(error.message).split("\n")[0]}`);
      } finally {
        await context.close();
      }
    }
  }
  await browser.close();
  if (failures.length > 0) {
    console.log(`\nFallaron ${failures.length}: ${failures.join(", ")}`);
    process.exitCode = 1;
  }
})();
