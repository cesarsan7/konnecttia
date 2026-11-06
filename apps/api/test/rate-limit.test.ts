import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/lib/rate-limit";

describe("createRateLimiter", () => {
  it("limita al pasar del máximo dentro de la ventana", () => {
    const limited = createRateLimiter(2, 1000);
    expect(limited("ip", 0)).toBe(false);
    expect(limited("ip", 10)).toBe(false);
    expect(limited("ip", 20)).toBe(true);
    expect(limited("ip", 2000)).toBe(false);
  });

  it("olvida las claves sin peticiones recientes", () => {
    const limited = createRateLimiter(5, 1000);
    for (let i = 0; i < 100; i++) limited(`ip-${i}`, 0);
    expect(limited.size()).toBe(100);
    limited("otra", 5000);
    expect(limited.size()).toBe(1);
  });
});
