import { describe, expect, it } from "vitest";
import { HELP_PAGES } from "./content";
import { normalize, searchHelp, tokenize } from "./search";
import { HELP_SLUG } from "./slugs";
import { HELP_GROUP, type HelpPage } from "./types";

function page(slug: string, over: Partial<HelpPage>): HelpPage {
  return {
    slug: slug as HelpPage["slug"],
    title: slug,
    summary: "",
    group: HELP_GROUP.Daily,
    keywords: [],
    purpose: [],
    steps: [],
    faq: [],
    related: [],
    ...over,
  };
}

describe("normalize", () => {
  it("quita tildes y pasa a minúsculas", () => {
    expect(normalize("ÁNGEL Cobró")).toBe("angel cobro");
  });
});

describe("tokenize", () => {
  it("separa por signos y descarta palabras de una letra", () => {
    expect(tokenize("¿Cómo  cobro, a un cliente?")).toEqual(["como", "cobro", "un", "cliente"]);
  });

  it("devuelve vacío si no hay palabras útiles", () => {
    expect(tokenize("  ? a ")).toEqual([]);
  });
});

describe("searchHelp", () => {
  const a = page("a", { title: "Pagos", keywords: ["bizum"] });
  const b = page("b", { title: "Pedidos", steps: [{ text: "Confirma el cobro con Bizum" }] });
  const c = page("c", { title: "Mesas" });

  it("sin búsqueda devuelve todas, en su orden", () => {
    expect(searchHelp([a, b, c], "")).toEqual([a, b, c]);
    expect(searchHelp([a, b, c], "   ")).toEqual([a, b, c]);
  });

  it("ignora tildes y mayúsculas", () => {
    expect(searchHelp([a, b, c], "COBRÓ")).toEqual([b]);
    expect(searchHelp([a, b, c], "MÉSAS")).toEqual([c]);
  });

  it("pone primero lo que coincide en el título o las palabras clave", () => {
    expect(searchHelp([b, a, c], "bizum")).toEqual([a, b]);
  });

  it("exige todas las palabras", () => {
    expect(searchHelp([a, b, c], "cobro bizum")).toEqual([b]);
    expect(searchHelp([a, b, c], "bizum mesas")).toEqual([]);
  });

  it("a igualdad de puntos conserva el orden original", () => {
    const x = page("x", { title: "Pagos" });
    const y = page("y", { title: "Pagos" });
    expect(searchHelp([x, y], "pagos")).toEqual([x, y]);
    expect(searchHelp([y, x], "pagos")).toEqual([y, x]);
  });

  it("busca también en las preguntas frecuentes", () => {
    const faq = page("f", {
      faq: [{ question: "¿Cómo borro un cliente?", answer: "Desde su ficha." }],
    });
    expect(searchHelp([faq, c], "borro")).toEqual([faq]);
  });

  it("encuentra las páginas reales por palabras que usa la gente", () => {
    const first = (query: string) => searchHelp(HELP_PAGES, query)[0]?.slug;
    expect(first("bizum")).toBe(HELP_SLUG.Payments);
    expect(first("iban")).toBe(HELP_SLUG.Payments);
    expect(first("repartidor")).toBeDefined();
    expect(first("horario")).toBe(HELP_SLUG.Settings);
    expect(first("prueba gratis")).toBe(HELP_SLUG.Trial);
    expect(searchHelp(HELP_PAGES, "zzzzqqq")).toEqual([]);
  });
});
