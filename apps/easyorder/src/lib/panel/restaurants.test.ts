import { describe, expect, it } from "vitest";
import { sortByLastUsed } from "./restaurants";

describe("elegir restaurante", () => {
  const list = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];

  it("pone primero el último usado y deja el resto en su orden", () => {
    expect(sortByLastUsed(list, "c").map((item) => item.slug)).toEqual(["c", "a", "b"]);
  });

  it("sin último usado (o si ya no está) mantiene el orden", () => {
    expect(sortByLastUsed(list, null).map((item) => item.slug)).toEqual(["a", "b", "c"]);
    expect(sortByLastUsed(list, "x").map((item) => item.slug)).toEqual(["a", "b", "c"]);
  });
});
