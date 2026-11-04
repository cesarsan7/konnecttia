import { describe, expect, it } from "vitest";
import { backoffMs, parseSse } from "./stream";

describe("SSE del tablero", () => {
  it("separa eventos completos y guarda el resto", () => {
    const { events, rest } = parseSse(
      "event: pedidos\ndata: inicio\nretry: 3000\n\n: ping\n\nevent: pedidos\ndata: cam",
    );
    expect(events).toEqual([{ event: "pedidos", data: "inicio" }]);
    expect(rest).toBe("event: pedidos\ndata: cam");
  });

  it("acepta CRLF y eventos de latido", () => {
    const { events } = parseSse("event: ping\r\ndata: \r\n\r\n");
    expect(events).toEqual([{ event: "ping", data: "" }]);
  });

  it("espera cada vez más antes de reconectar, con tope", () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(10)).toBe(30_000);
  });
});
