import { describe, expect, it } from "vitest";
import {
  formatCents,
  newOrderEmail,
  ORDER_DELIVERY_KIND,
  ORDER_NOTICE,
  orderNoticeEmail,
} from "./index";

describe("aviso de pedido nuevo al local", () => {
  const base = {
    restaurante: "Cafetería <Sol>",
    codigo: "261103-0007",
    delivery: ORDER_DELIVERY_KIND.Delivery,
    totalCents: 2350,
    nombre: "Ana\nBcc: x@evil.test",
    panelUrl: "https://panel.example.test/panel/sol",
  };

  it("incluye código, entrega, total y enlace al panel", () => {
    const email = newOrderEmail(base);
    expect(email.subject).toContain("261103-0007");
    expect(email.text).toContain("Reparto a domicilio");
    expect(email.text).toContain(formatCents(2350));
    expect(email.text).toContain("https://panel.example.test/panel/sol");
    expect(email.html).toContain('href="https://panel.example.test/panel/sol"');
  });

  it("escapa el HTML y el asunto no admite saltos de línea", () => {
    const email = newOrderEmail(base);
    expect(email.html).not.toContain("<Sol>");
    expect(email.html).toContain("&lt;Sol&gt;");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).not.toContain("Ana\nBcc");
  });

  it("sin enlace al panel no hay botón", () => {
    const email = newOrderEmail({ ...base, panelUrl: null });
    expect(email.html).not.toContain("<a ");
    expect(email.text).not.toContain("Abrir el panel");
  });

  it("sin nombre no muestra la fila de cliente", () => {
    expect(newOrderEmail({ ...base, nombre: null }).text).not.toContain("Cliente:");
  });
});

describe("avisos al cliente", () => {
  const base = {
    restaurante: "Cafetería Sol",
    codigo: "261103-0007",
    delivery: ORDER_DELIVERY_KIND.Pickup,
    totalCents: 1000,
    trackingUrl: "https://web.example.test/sol/pedido/abc",
  };

  it.each(Object.values(ORDER_NOTICE))("«%s» lleva el enlace de seguimiento", (notice) => {
    const email = orderNoticeEmail({ ...base, notice });
    expect(email.html).toContain("https://web.example.test/sol/pedido/abc");
    expect(email.text).toContain("https://web.example.test/sol/pedido/abc");
    expect(email.subject).toContain("261103-0007");
  });

  it("cada aviso tiene su propio asunto", () => {
    const subjects = Object.values(ORDER_NOTICE).map(
      (notice) => orderNoticeEmail({ ...base, notice }).subject,
    );
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it("«listo» distingue recogida de reparto", () => {
    const pickup = orderNoticeEmail({ ...base, notice: ORDER_NOTICE.Ready });
    const delivery = orderNoticeEmail({
      ...base,
      notice: ORDER_NOTICE.Ready,
      delivery: ORDER_DELIVERY_KIND.Delivery,
    });
    expect(pickup.text).toContain("recoger");
    expect(delivery.text).not.toContain("recoger");
  });
});
