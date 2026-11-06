import { describe, expect, it } from "vitest";
import { comandaHtml } from "./comanda";
import type { PanelOrder } from "./types";

const order = (patch: Partial<PanelOrder> = {}): PanelOrder => ({
  id: 7,
  pedido_codigo: "261104-1007",
  estado: "recibido",
  estado_pago: "no_aplica",
  tipo_despacho: "delivery",
  canal: "web",
  nombre_pedido: "Ana <b>",
  telefono: "+34600000001",
  direccion: "Calle Real 1",
  items: [
    {
      item_name: "Pizza",
      variant_name: "Familiar",
      quantity: 2,
      extras: [{ name: "Queso", quantity: 2 }],
      nota: "bien hecha",
    },
  ],
  subtotal: 28,
  costo_envio: 2,
  total: 30,
  metodo_pago: "efectivo",
  tiempo_estimado: "30-40 min",
  notas: [{ item: "general", nota: "Timbre roto" }],
  created_at: "2026-11-04T20:05:00.000Z",
  updated_at: null,
  sucursal_id: 1,
  local_nombre: "Centro",
  ...patch,
});

const base = { restaurante: "La Isla", timeZone: "Atlantic/Canary", paper: 80 as const };

describe("comanda", () => {
  it("copia de cocina: código, tipo, líneas, extras y notas, sin precios", () => {
    const html = comandaHtml(order(), { ...base, copia: "cocina" });
    expect(html).toContain("261104-1007");
    expect(html).toContain("REPARTO");
    expect(html).toContain("2×");
    expect(html).toContain("Pizza");
    expect(html).toContain("(Familiar)");
    expect(html).toContain("+ Queso");
    expect(html).toContain("» bien hecha");
    expect(html).toContain("NOTA: Timbre roto");
    expect(html).toContain("Calle Real 1");
    expect(html).toContain("20:05");
    expect(html).not.toContain("TOTAL");
    expect(html).toContain("size: 80mm auto");
  });

  it("imprime «Atiende» con el mesero, escapado, y nada si no hay", () => {
    const con = comandaHtml(order({ mesero_nombre: "Luis <i>" }), { ...base, copia: "cocina" });
    expect(con).toContain("Atiende: Luis &lt;i&gt;");
    const sin = comandaHtml(order({ mesero_nombre: null }), { ...base, copia: "cocina" });
    expect(sin).not.toContain("Atiende");
  });

  it("copia de cliente con envío y total; aviso de cobro pendiente", () => {
    const html = comandaHtml(order({ estado_pago: "pendiente", metodo_pago: "transferencia" }), {
      ...base,
      paper: 58,
      copia: "cliente",
    });
    expect(html).toContain("TOTAL");
    expect(html).toContain("30,00 €");
    expect(html).toContain("Envío");
    expect(html).toContain("PENDIENTE DE COBRO");
    expect(html).toContain("size: 58mm auto");
    expect(
      comandaHtml(order({ repartidor_email: "moto@test.local" }), { ...base, copia: "cocina" }),
    ).toContain("Reparte: moto@test.local");
  });

  it("mesa sin dirección y escapa el texto del cliente", () => {
    const html = comandaHtml(order({ tipo_despacho: "mesa", mesa_nombre: "Mesa 4" }), {
      ...base,
      copia: "cocina",
    });
    expect(html).toContain("MESA 4");
    expect(html).not.toContain("Calle Real 1");
    expect(html).toContain("Ana &lt;b&gt;");
    expect(html).not.toContain("Ana <b>");
  });
});
