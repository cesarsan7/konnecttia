import { describe, expect, it } from "vitest";
import { MENU_IMPORT_ERROR, MENU_IMPORT_LIMITS, parseMenuImport } from "./menu-import";

const ok = (text: string) => {
  const result = parseMenuImport(text);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.categorias;
};

const errors = (text: string) => {
  const result = parseMenuImport(text);
  if (result.ok) throw new Error("se esperaba un error");
  return result.errors;
};

describe("parseMenuImport", () => {
  it("lee productos con una variante única y precios con coma o punto", () => {
    const categories = ok("Arepas;Arepa frita;Maíz frito;;3,00\nArepas;Arepa y queso;;;4.90");
    expect(categories).toHaveLength(1);
    const [first, second] = categories[0]?.productos ?? [];
    expect(first?.variantes).toEqual([{ nombre: "Única", precio: 300, porDefecto: true }]);
    expect(first?.descripcion).toBe("Maíz frito");
    expect(second?.variantes[0]?.precio).toBe(490);
    expect(second?.descripcion).toBeNull();
  });

  it("agrupa las filas de un producto en variantes; la primera es la de por defecto", () => {
    const categories = ok(
      "Salchipapas;Salchipapas;Con salchicha;Mini;4,50\nSalchipapas;Salchipapas;;Mediana;6,00\nSalchipapas;Salchipapas;;XL;10,00",
    );
    const item = categories[0]?.productos[0];
    expect(item?.variantes.map((v) => [v.nombre, v.precio, v.porDefecto])).toEqual([
      ["Mini", 450, true],
      ["Mediana", 600, false],
      ["XL", 1000, false],
    ]);
    expect(item?.descripcion).toBe("Con salchicha");
  });

  it("respeta la variante marcada por defecto y deja solo una", () => {
    const item = ok("A;P;;Pequeña;5;no\nA;P;;Grande;8;si")[0]?.productos[0];
    expect(item?.variantes.map((v) => v.porDefecto)).toEqual([false, true]);
  });

  it("mantiene el orden de aparición de categorías y productos", () => {
    const categories = ok("B;x;;;1\nA;y;;;2\nB;z;;;3");
    expect(categories.map((c) => c.nombre)).toEqual(["B", "A"]);
    expect(categories[0]?.productos.map((p) => p.nombre)).toEqual(["x", "z"]);
  });

  it("acepta tabuladores (pegado desde una hoja), cabecera, BOM, líneas vacías y CRLF", () => {
    const text =
      "﻿categoria\tproducto\tdescripcion\tvariante\tprecio\r\n\r\nPostres\tTarta\t\t\t3,40\r\n";
    const categories = ok(text);
    expect(categories[0]?.productos[0]?.variantes[0]?.precio).toBe(340);
  });

  it("no usa la coma como separador: «4,90» sigue siendo un precio", () => {
    expect(ok("A;P;;;4,90")[0]?.productos[0]?.variantes[0]?.precio).toBe(490);
  });

  it("señala la línea de cada error", () => {
    const found = errors("A;P;;;3,00\nA;Q;;;gratis\n;R;;;2\nA;;;;2\nA;S;x");
    expect(found.map((e) => [e.line, e.code])).toEqual([
      [2, MENU_IMPORT_ERROR.InvalidPrice],
      [3, MENU_IMPORT_ERROR.MissingCategory],
      [4, MENU_IMPORT_ERROR.MissingProduct],
      [5, MENU_IMPORT_ERROR.MissingColumns],
    ]);
  });

  it("rechaza precio cero o negativo, variantes repetidas y marcas por defecto inválidas", () => {
    expect(errors("A;P;;;0")[0]?.code).toBe(MENU_IMPORT_ERROR.InvalidPrice);
    expect(errors("A;P;;;-1")[0]?.code).toBe(MENU_IMPORT_ERROR.InvalidPrice);
    expect(errors("A;P;;M;1\nA;P;;m;2")[0]?.code).toBe(MENU_IMPORT_ERROR.DuplicateVariant);
    expect(errors("A;P;;;1;quizá")[0]?.code).toBe(MENU_IMPORT_ERROR.InvalidDefault);
  });

  it("rechaza texto vacío, textos demasiado largos y demasiadas filas", () => {
    expect(errors("  \n \n")[0]?.code).toBe(MENU_IMPORT_ERROR.Empty);
    expect(errors(`A;${"x".repeat(MENU_IMPORT_LIMITS.maxItemName + 1)};;;1`)[0]?.code).toBe(
      MENU_IMPORT_ERROR.TooLong,
    );
    const many = Array.from({ length: MENU_IMPORT_LIMITS.maxRows + 1 }, (_, i) => `A;P${i};;;1`);
    expect(errors(many.join("\n"))[0]?.code).toBe(MENU_IMPORT_ERROR.TooManyRows);
  });
});
