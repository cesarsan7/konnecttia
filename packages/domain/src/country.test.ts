import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  composePhone,
  countryByCode,
  countryFromTimeZone,
  countryOrDefault,
  flagEmoji,
  resolveCountry,
} from "./country";

describe("países", () => {
  it("los códigos no se repiten y los prefijos tienen forma válida", () => {
    expect(new Set(COUNTRIES.map((country) => country.code)).size).toBe(COUNTRIES.length);
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.prefijo).toMatch(/^\+\d{1,4}$/);
    }
  });

  it("busca por código sin distinguir mayúsculas y cae en España", () => {
    expect(countryByCode("us")?.prefijo).toBe("+1");
    expect(countryByCode("ZZ")).toBeNull();
    expect(countryOrDefault(null).code).toBe("ES");
    expect(countryOrDefault("MX").prefijo).toBe("+52");
  });

  it("construye la bandera y rechaza códigos raros", () => {
    expect(flagEmoji("ES")).toBe("🇪🇸");
    expect(flagEmoji("us")).toBe("🇺🇸");
    expect(flagEmoji("USA")).toBe("");
  });

  it("sugiere el país desde la zona horaria", () => {
    expect(countryFromTimeZone("Atlantic/Canary")).toBe("ES");
    expect(countryFromTimeZone("America/New_York")).toBe("US");
    expect(countryFromTimeZone("America/Argentina/Cordoba")).toBe("AR");
    expect(countryFromTimeZone("Asia/Tokyo")).toBeNull();
    expect(countryFromTimeZone("")).toBeNull();
  });
});

describe("composePhone", () => {
  it("antepone el prefijo elegido", () => {
    expect(composePhone("612 345 678", "+34")).toBe("+34612345678");
    expect(composePhone("(305) 555-0123", "+1")).toBe("+13055550123");
  });

  it("quita el 0 inicial de marcación nacional salvo en España", () => {
    expect(composePhone("0987654321", "+593")).toBe("+593987654321");
    expect(composePhone("612345678", "+34")).toBe("+34612345678");
  });

  it("respeta un número que ya trae prefijo (+ o 00), aunque el selector diga otro", () => {
    expect(composePhone("+1 305 555 0123", "+34")).toBe("+13055550123");
    expect(composePhone("0034612345678", "+1")).toBe("+34612345678");
  });

  it("rechaza vacío, letras y longitudes imposibles", () => {
    expect(composePhone("", "+34")).toBeNull();
    expect(composePhone("abc", "+34")).toBeNull();
    expect(composePhone("123", "+1")).toBeNull();
    expect(composePhone("+1234567890123456", "+1")).toBeNull();
  });
});

describe("resolveCountry", () => {
  it("prefiere lo elegido, luego la zona horaria y al final España", () => {
    expect(resolveCountry("MX", "Atlantic/Canary")).toBe("MX");
    expect(resolveCountry("", "America/New_York")).toBe("US");
    expect(resolveCountry(undefined, "Asia/Tokyo")).toBe("ES");
    expect(resolveCountry("zz", "America/Bogota")).toBe("CO");
  });
});
