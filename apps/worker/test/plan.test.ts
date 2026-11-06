import { describe, expect, it } from "vitest";
import type { NoticeConfig } from "../src/config";
import {
  customerEmailFromPayload,
  type OrderForNotice,
  OUTBOX_EVENT,
  type PlanInput,
  planDeliveries,
  RECIPIENT,
  SKIP_REASON,
} from "../src/plan";

const order: OrderForNotice = {
  id: 7,
  codigo: "261103-0007",
  tipoDespacho: "delivery",
  canal: "web",
  nombre: "Ana",
  totalCents: 1850,
  trackingToken: "11111111-2222-3333-4444-555555555555",
  restauranteNombre: "Cafetería Sol",
  restauranteSlug: "sol",
};

const allOn: NoticeConfig = {
  localEnabled: true,
  localRecipients: ["cocina@x.test", "dueno@x.test"],
  customerEnabled: true,
  customerStatuses: new Set(["confirmado", "listo", "en_camino", "cancelado"]),
};

const input = (overrides: Partial<PlanInput>): PlanInput => ({
  tipo: OUTBOX_EVENT.OrderReceived,
  payload: { pedido_id: 7, canal: "web" },
  order,
  config: allOn,
  moduleActive: true,
  panelUrl: "https://panel.test",
  webUrl: "https://web.test",
  ...overrides,
});

describe("plan de avisos: pedido recibido", () => {
  it("avisa a cada dirección del local con el enlace al panel", () => {
    const plan = planDeliveries(input({}));
    const local = plan.deliveries.filter((d) => d.kind === RECIPIENT.Local);
    expect(local.map((d) => d.to)).toEqual(["cocina@x.test", "dueno@x.test"]);
    expect(local[0]?.message.text).toContain("https://panel.test/panel/sol");
  });

  it("con aviso al local apagado no envía nada", () => {
    const plan = planDeliveries(input({ config: { ...allOn, localEnabled: false } }));
    expect(plan.deliveries).toHaveLength(0);
    expect(plan.skipped).toContain(SKIP_REASON.LocalDisabled);
  });

  it("encendido pero sin direcciones, no envía", () => {
    const plan = planDeliveries(input({ config: { ...allOn, localRecipients: [] } }));
    expect(plan.skipped).toContain(SKIP_REASON.LocalNoRecipients);
  });

  it("los pedidos creados por el personal no avisan al local", () => {
    const plan = planDeliveries(input({ order: { ...order, canal: "mostrador" } }));
    expect(plan.deliveries.filter((d) => d.kind === RECIPIENT.Local)).toHaveLength(0);
    expect(plan.skipped).toContain(SKIP_REASON.InternalChannel);
  });

  it("sin email del cliente no hay aviso al cliente, pero sí al local", () => {
    const plan = planDeliveries(input({}));
    expect(plan.deliveries.some((d) => d.kind === RECIPIENT.Customer)).toBe(false);
  });

  it("con email del cliente en el evento, le envía la confirmación con su enlace de seguimiento", () => {
    const plan = planDeliveries(
      input({ payload: { pedido_id: 7, canal: "web", email_cliente: "Cliente@X.test" } }),
    );
    const customer = plan.deliveries.find((d) => d.kind === RECIPIENT.Customer);
    expect(customer?.to).toBe("cliente@x.test");
    expect(customer?.message.text).toContain(`https://web.test/sol/pedido/${order.trackingToken}`);
  });

  it("el aviso al cliente apagado no envía aunque haya email", () => {
    const plan = planDeliveries(
      input({
        payload: { email_cliente: "c@x.test" },
        config: { ...allOn, localEnabled: false, customerEnabled: false },
      }),
    );
    expect(plan.deliveries).toHaveLength(0);
    expect(plan.skipped).toContain(SKIP_REASON.CustomerDisabled);
  });

  it("sin URL pública de la web no se avisa al cliente (no hay enlace de seguimiento)", () => {
    const plan = planDeliveries(
      input({
        payload: { email_cliente: "c@x.test" },
        webUrl: null,
        config: { ...allOn, localEnabled: false },
      }),
    );
    expect(plan.deliveries).toHaveLength(0);
    expect(plan.skipped).toContain(SKIP_REASON.NoPublicUrl);
  });

  it("con el módulo de avisos por email suspendido no envía nada", () => {
    const plan = planDeliveries(input({ moduleActive: false }));
    expect(plan.deliveries).toHaveLength(0);
    expect(plan.skipped).toEqual([SKIP_REASON.ModuleOff]);
  });
});

describe("plan de avisos: cambio de estado", () => {
  const changed = (hacia: unknown, extra: Partial<PlanInput> = {}) =>
    input({
      tipo: OUTBOX_EVENT.OrderStatusChanged,
      payload: { pedido_id: 7, desde: "recibido", hacia, email_cliente: "c@x.test" },
      ...extra,
    });

  it.each(["confirmado", "listo", "en_camino", "cancelado"])("«%s» avisa al cliente", (estado) => {
    const plan = planDeliveries(changed(estado));
    expect(plan.deliveries.map((d) => d.kind)).toEqual([RECIPIENT.Customer]);
  });

  it("los cambios de estado no avisan al local", () => {
    expect(
      planDeliveries(changed("listo")).deliveries.some((d) => d.kind === RECIPIENT.Local),
    ).toBe(false);
  });

  it("un estado no importante no avisa", () => {
    const plan = planDeliveries(changed("en_preparacion"));
    expect(plan.skipped).toContain(SKIP_REASON.CustomerStatusIgnored);
  });

  it("respeta la lista de estados del restaurante", () => {
    const config = { ...allOn, customerStatuses: new Set(["cancelado"]) };
    expect(planDeliveries(changed("listo", { config })).deliveries).toHaveLength(0);
    expect(planDeliveries(changed("cancelado", { config })).deliveries).toHaveLength(1);
  });

  it("un evento sin «hacia» es un payload inválido", () => {
    expect(planDeliveries(changed(undefined)).skipped).toContain(SKIP_REASON.BadPayload);
  });
});

describe("email del cliente en el evento", () => {
  it("solo acepta direcciones válidas", () => {
    expect(customerEmailFromPayload({ email_cliente: " A@X.test " })).toBe("a@x.test");
    expect(customerEmailFromPayload({ email_cliente: "no-es-email" })).toBeNull();
    expect(customerEmailFromPayload({ email_cliente: 12 })).toBeNull();
    expect(customerEmailFromPayload(null)).toBeNull();
    expect(customerEmailFromPayload({})).toBeNull();
  });
});
