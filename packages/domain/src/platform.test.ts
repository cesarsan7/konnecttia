import { describe, expect, it } from "vitest";
import {
  allowedPaymentMethods,
  checkRestaurantSlug,
  enabledPaymentMethods,
  isValidTimeZone,
  PLATFORM_ROLE,
  platformRoleAtLeast,
  RESERVED_SLUGS,
  SLUG_ERROR,
  slugFromName,
} from "./platform";

describe("slug de restaurante", () => {
  it("acepta minúsculas, números y guiones entre palabras", () => {
    expect(checkRestaurantSlug("la-isla-pizzeria")).toBeNull();
    expect(checkRestaurantSlug("bar-2000")).toBeNull();
  });

  it("rechaza formato inválido, corto y largo", () => {
    expect(checkRestaurantSlug("ab")).toBe(SLUG_ERROR.TooShort);
    expect(checkRestaurantSlug("a".repeat(41))).toBe(SLUG_ERROR.TooLong);
    for (const bad of ["La-Isla", "la isla", "-isla", "isla-", "la--isla", "isla_1", "ñandú"]) {
      expect(checkRestaurantSlug(bad), bad).toBe(SLUG_ERROR.InvalidFormat);
    }
  });

  it("rechaza los slugs reservados", () => {
    for (const slug of ["panel", "interno", "api", "admin", "www", "plataforma", "privacidad"]) {
      expect(RESERVED_SLUGS.has(slug)).toBe(true);
      expect(checkRestaurantSlug(slug), slug).toBe(SLUG_ERROR.Reserved);
    }
  });

  it("propone un slug desde el nombre", () => {
    expect(slugFromName("Cafetería «Siempre Juntos»")).toBe("cafeteria-siempre-juntos");
    expect(slugFromName("  Pizzería  La Isla!! ")).toBe("pizzeria-la-isla");
    expect(slugFromName("!!!")).toBe("");
    expect(checkRestaurantSlug(slugFromName("x".repeat(80)))).toBeNull();
  });
});

describe("zona horaria", () => {
  it("acepta nombres IANA y rechaza el resto", () => {
    expect(isValidTimeZone("Atlantic/Canary")).toBe(true);
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("Canarias")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(" Europe/Madrid")).toBe(false);
  });
});

describe("roles de plataforma", () => {
  it("admin cumple todo; soporte solo lectura", () => {
    expect(platformRoleAtLeast(PLATFORM_ROLE.Admin, PLATFORM_ROLE.Admin)).toBe(true);
    expect(platformRoleAtLeast(PLATFORM_ROLE.Admin, PLATFORM_ROLE.Support)).toBe(true);
    expect(platformRoleAtLeast(PLATFORM_ROLE.Support, PLATFORM_ROLE.Support)).toBe(true);
    expect(platformRoleAtLeast(PLATFORM_ROLE.Support, PLATFORM_ROLE.Admin)).toBe(false);
  });
});

describe("métodos de pago permitidos", () => {
  it("null permite todos; un array, solo esos", () => {
    expect(allowedPaymentMethods(null)).toEqual(["efectivo", "tarjeta", "transferencia", "bizum"]);
    expect(allowedPaymentMethods(["efectivo", "tarjeta", "inventado"])).toEqual([
      "efectivo",
      "tarjeta",
    ]);
  });

  it("lo activo se limita a lo permitido", () => {
    expect(enabledPaymentMethods(["efectivo", "bizum", "online"], ["efectivo", "tarjeta"])).toEqual(
      ["efectivo"],
    );
    expect(enabledPaymentMethods(["efectivo", "bizum"], null)).toEqual(["efectivo", "bizum"]);
    expect(enabledPaymentMethods(null, null)).toEqual([]);
  });
});
