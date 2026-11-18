import { describe, expect, it } from "vitest";
import { normalizeSearchText, type SearchableItem, searchMenu } from "./menu-search";

const SIZES = [
  { id: 101, name: "Pequeña" },
  { id: 102, name: "Mediana" },
  { id: 103, name: "Familiar" },
];
const PIZZA_EXTRAS = [
  { id: 201, name: "Extra queso" },
  { id: 202, name: "Extra jalapeños" },
  { id: 203, name: "Extra bacon" },
];

const MENU: readonly SearchableItem[] = [
  {
    id: 1,
    name: "Pizza Margarita",
    category: "Pizzas",
    description: "Tomate y mozzarella",
    variants: SIZES,
    extras: PIZZA_EXTRAS,
  },
  {
    id: 2,
    name: "Pizza Pepperoni",
    category: "Pizzas",
    description: null,
    variants: SIZES,
    extras: PIZZA_EXTRAS,
  },
  {
    id: 3,
    name: "Pizza 4 Quesos",
    category: "Pizzas",
    description: null,
    variants: SIZES,
    extras: [],
  },
  {
    id: 4,
    name: "Coca-Cola",
    category: "Bebidas",
    description: null,
    variants: [{ id: 301, name: "Lata" }],
    extras: [],
  },
  {
    id: 5,
    name: "Hamburguesa Pollo Crispy",
    category: "Hamburguesas",
    description: "Con salsa",
    variants: [],
    extras: [
      { id: 401, name: "Extra jalapeños" },
      { id: 402, name: "Extra cheddar" },
    ],
  },
  {
    id: 6,
    name: "Café",
    category: "Bebidas",
    description: null,
    variants: [],
    extras: [],
  },
];

const ids = (query: string, limit?: number) =>
  searchMenu(query, MENU, limit).map((match) => match.itemId);

describe("normalizeSearchText", () => {
  it("pasa a minúsculas, quita tildes y puntuación y colapsa espacios", () => {
    expect(normalizeSearchText("  ¡CAFÉ,   con   Leche!  ")).toBe("cafe con leche");
    expect(normalizeSearchText("Coca-Cola")).toBe("coca cola");
  });
});

describe("searchMenu", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(ids("CAFE")[0]).toBe(6);
    expect(ids("café")[0]).toBe(6);
  });

  it("empareja plurales con singulares", () => {
    expect(ids("dos pizzas margarita")[0]).toBe(1);
    expect(ids("una hamburguesa pollo crispy")[0]).toBe(5);
    expect(ids("hamburguesas")).toEqual([5]);
  });

  it("tolera erratas (peperoni ~ pepperoni)", () => {
    expect(ids("dos pizzas peperoni medianas")[0]).toBe(2);
  });

  it("detecta la variante nombrada en el texto", () => {
    const [top] = searchMenu("pizza margarita mediana", MENU);
    expect(top?.itemId).toBe(1);
    expect(top?.variantId).toBe(102);
  });

  it("no inventa variante si no se nombra ninguna", () => {
    const [top] = searchMenu("pizza margarita", MENU);
    expect(top?.variantId).toBeNull();
  });

  it("devuelve la única variante de un producto con una sola", () => {
    const [top] = searchMenu("una coca cola", MENU);
    expect(top?.itemId).toBe(4);
    expect(top?.variantId).toBe(301);
  });

  it("detecta extras del producto, también con el prefijo genérico omitido", () => {
    const [top] = searchMenu("hamburguesa pollo crispy con extra jalapeños", MENU);
    expect(top?.itemId).toBe(5);
    expect(top?.extraIds).toEqual([401]);
    const [pizza] = searchMenu("pizza margarita con queso y bacon", MENU);
    expect(pizza?.extraIds).toEqual([201, 203]);
  });

  it("un extra por sí solo no hace coincidir un producto", () => {
    expect(ids("jalapeños")).toEqual([]);
    expect(ids("extra bacon")).toEqual([]);
  });

  it("empareja números en cifras y en palabras", () => {
    expect(ids("cuatro quesos")[0]).toBe(3);
    expect(ids("una pizza 4 quesos")[0]).toBe(3);
    const numbered: SearchableItem[] = [
      { ...MENU[2], id: 9, name: "Pizza Cuatro Quesos" } as SearchableItem,
    ];
    expect(searchMenu("pizza 4 quesos", numbered)[0]?.itemId).toBe(9);
  });

  it("una cantidad suelta no hace coincidir productos con cifras en el nombre", () => {
    expect(ids("2 coca colas")).toEqual([4]);
  });

  it("una consulta solo de categoría devuelve esa categoría y no otras", () => {
    const result = ids("pizzas");
    expect(result.sort()).toEqual([1, 2, 3]);
  });

  it("una consulta sin relación devuelve vacío", () => {
    expect(ids("sushi")).toEqual([]);
    expect(ids("")).toEqual([]);
    expect(ids("quiero un por favor")).toEqual([]);
  });

  it("el nombre exacto va primero con puntuación 1", () => {
    const result = searchMenu("Pizza Margarita", MENU);
    expect(result[0]?.itemId).toBe(1);
    expect(result[0]?.score).toBe(1);
    expect(result[1]?.score).toBeLessThan(1);
  });

  it("las puntuaciones están entre 0 y 1 y vienen ordenadas", () => {
    const result = searchMenu("pizza margarita mediana con extra queso", MENU);
    for (const match of result) {
      expect(match.score).toBeGreaterThan(0);
      expect(match.score).toBeLessThanOrEqual(1);
    }
    const scores = result.map((match) => match.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("respeta el límite (por defecto 5) y el orden de la carta en empates", () => {
    expect(ids("pizzas", 2)).toEqual([1, 2]);
    const many: SearchableItem[] = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Tapa ${i + 1}`,
      category: "Tapas",
      description: null,
      variants: [],
      extras: [],
    }));
    expect(searchMenu("tapas", many)).toHaveLength(5);
    expect(searchMenu("tapas", many, 0)).toEqual([]);
  });

  it("solo devuelve productos de la carta recibida", () => {
    const otherMenu: SearchableItem[] = [
      { id: 900, name: "Sushi", category: "Japonesa", description: null, variants: [], extras: [] },
    ];
    expect(searchMenu("pizza margarita", otherMenu)).toEqual([]);
  });

  it("«qué variedades de pizzas tienes» busca la categoría: las palabras de pregunta no puntúan", () => {
    const ids = (query: string) => searchMenu(query, MENU, 10).map((match) => match.itemId);
    expect(ids("qué variedades de pizzas tienes")).toEqual(ids("pizzas"));
    expect(ids("qué tipos de pizza hay")).toEqual(ids("pizza"));
    expect(ids("pizzas opciones")).toEqual(ids("pizzas"));
    expect(ids("qué variedades de pizzas tienes").length).toBeGreaterThan(0);
  });
});
