import { ALLERGEN_STATUS, centsFromDecimal } from "@konnecttia/domain";
import { allergenNames, lineAllergens } from "../lib/allergens";
import { brandStyle, publicLogo } from "../lib/brand";
import { eurosFromCents } from "../lib/format";
import type { Menu, MenuExtra, MenuItem } from "../lib/types";

const price = (value: number) => eurosFromCents(centsFromDecimal(value));

function itemAllergens(item: MenuItem): string {
  const info = lineAllergens(item, []);
  if (info.status !== ALLERGEN_STATUS.Declared) return "Alérgenos: pregunta en el local";
  const names = allergenNames(info);
  return names.length > 0 ? `Alérgenos: ${names.join(", ")}` : "Sin alérgenos declarados";
}

function extraLabel(item: MenuItem, extra: MenuExtra): string {
  const names = allergenNames(
    lineAllergens({ ...item, allergens: { status: "" }, extras: [extra] }, [extra.id]),
  );
  const suffix = names.length > 0 ? `, contiene ${names.join(", ")}` : "";
  return `${extra.name} (+${price(extra.price)}${suffix})`;
}

/** Carta de solo lectura: sin carrito ni botones de pedido. La comparte el agente de WhatsApp. */
export function MenuReadOnly({ menu }: { readonly menu: Menu }) {
  const restaurant = menu.restaurante;
  const logo = publicLogo(restaurant.logo_url);
  return (
    <main className="shell" style={brandStyle(restaurant.color_marca)}>
      <header className="store-head">
        {logo && (
          // biome-ignore lint/performance/noImgElement: logo del restaurante en una URL externa (Storage)
          <img className="store-logo" src={logo} alt={`Logo de ${restaurant.nombre}`} />
        )}
        <h1 className="title">{restaurant.nombre}</h1>
        {restaurant.eslogan?.trim() && <p className="store-slogan">{restaurant.eslogan.trim()}</p>}
        <p className="notice">
          Esta es solo la carta, para consultarla. Para pedir, escríbenos por WhatsApp.
        </p>
      </header>

      {menu.categories.length === 0 && (
        <p className="muted center">La carta está vacía por ahora.</p>
      )}

      {menu.categories.map((category) => (
        <section key={category.id} id={`cat-${category.id}`} className="category">
          <h2>{category.name}</h2>
          <ul className="items">
            {category.items.map((item) => (
              <li key={item.id} className="item">
                <span className="item-text">
                  <strong>{item.name}</strong>
                  {item.description && <span className="muted small">{item.description}</span>}
                  {item.variants.length > 1 ? (
                    <ul className="muted small">
                      {item.variants.map((variant) => (
                        <li key={variant.id}>
                          {variant.name}: {price(variant.price)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="price">{price(item.variants[0]?.price ?? 0)}</span>
                  )}
                  <span className="muted small">{itemAllergens(item)}</span>
                  {item.extras.length > 0 && (
                    <span className="muted small">
                      Extras: {item.extras.map((extra) => extraLabel(item, extra)).join(" · ")}
                    </span>
                  )}
                </span>
                {item.imageUrl && (
                  // biome-ignore lint/performance/noImgElement: imágenes externas del restaurante
                  <img src={item.imageUrl} alt="" loading="lazy" width={88} height={88} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer className="powered">Carta de {restaurant.nombre} · EasyOrder · Konnecttia</footer>
    </main>
  );
}
