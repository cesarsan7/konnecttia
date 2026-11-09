"use client";

import { centsFromDecimal } from "@konnecttia/domain";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createApi } from "@/lib/api";
import { brandStyle, publicLogo, publicSocialLinks } from "@/lib/brand";
import { addLine, type CartLine, itemCount, parseStoredCart, subtotalCents } from "@/lib/cart";
import { acceptsOnlineOrders, RESTAURANT_UNAVAILABLE_MESSAGE } from "@/lib/checkout";
import { eurosFromCents } from "@/lib/format";
import type { Branch, DeliveryZone, Menu, MenuItem } from "@/lib/types";
import { Checkout } from "./Checkout";
import { ItemSheet } from "./ItemSheet";

type Props = {
  readonly apiUrl: string;
  /** Clave pública de Turnstile; null = el checkout no usa captcha. */
  readonly captchaSiteKey: string | null;
  readonly slug: string;
  readonly initialMenu: Menu;
  readonly branches: readonly Branch[];
  readonly zones: readonly DeliveryZone[];
};

type Point = { lat: number; lng: number };

const cartKey = (slug: string) => `easyorder:carrito:${slug}`;

function readCart(slug: string): CartLine[] {
  try {
    return parseStoredCart(window.localStorage.getItem(cartKey(slug)));
  } catch {
    return [];
  }
}

function writeCart(slug: string, lines: readonly CartLine[]) {
  try {
    window.localStorage.setItem(cartKey(slug), JSON.stringify(lines));
  } catch {
    // Sin almacenamiento (modo privado): el carrito vive solo en memoria.
  }
}

function fromPrice(item: MenuItem): number {
  return Math.min(...item.variants.map((variant) => variant.price));
}

export function Storefront({
  apiUrl,
  captchaSiteKey,
  slug,
  initialMenu,
  branches: initialBranches,
  zones,
}: Props) {
  const api = useMemo(() => createApi(apiUrl), [apiUrl]);
  const router = useRouter();
  const [menu, setMenu] = useState(initialMenu);
  const [branches, setBranches] = useState(initialBranches);
  const pickupBranches = branches.filter((branch) => branch.recogida);
  const [branchId, setBranchId] = useState<number | null>(
    pickupBranches.length === 1 ? (pickupBranches[0]?.id ?? null) : null,
  );
  const [point, setPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"menu" | "checkout">("menu");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLines(readCart(slug));
    setLoaded(true);
  }, [slug]);

  useEffect(() => {
    if (loaded) writeCart(slug, lines);
  }, [slug, lines, loaded]);

  // Al elegir local, la carta muestra solo lo que ese local sirve.
  async function chooseBranch(id: number) {
    setBranchId(id);
    const result = await api.menu(slug, id);
    if (!result.ok) return;
    setMenu(result.data);
    const available = new Set(
      result.data.categories.flatMap((category) => category.items.map((item) => item.id)),
    );
    setLines((current) => {
      const kept = current.filter((line) => available.has(line.itemId));
      if (kept.length < current.length) {
        setNotice("Quitamos del carrito productos que ese local no sirve.");
      }
      return kept;
    });
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setNotice("Tu navegador no permite compartir la ubicación.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPoint(here);
        const result = await api.branches(slug, here);
        setLocating(false);
        if (!result.ok) return;
        setBranches(result.data.locales);
        const nearest = result.data.locales.find((branch) => branch.recogida && branch.abierto);
        if (nearest && branchId === null) void chooseBranch(nearest.id);
      },
      () => {
        setLocating(false);
        setNotice("No pudimos obtener tu ubicación. Elige el local o la zona a mano.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  const accepting = acceptsOnlineOrders(menu.restaurante);
  const count = itemCount(lines);
  const subtotal = subtotalCents(lines);
  const restaurant = menu.restaurante;
  const logo = publicLogo(restaurant.logo_url);
  const socialLinks = publicSocialLinks(restaurant.redes_sociales);
  const branchName = branches.find((branch) => branch.id === branchId)?.nombre;

  if (view === "checkout") {
    return (
      <main className="shell" style={brandStyle(restaurant.color_marca)}>
        <Checkout
          api={api}
          slug={slug}
          captchaSiteKey={captchaSiteKey}
          restaurant={restaurant}
          branches={branches}
          branchId={branchId}
          onBranchChange={(id) => void chooseBranch(id)}
          zones={zones}
          point={point}
          locating={locating}
          onLocate={locate}
          lines={lines}
          onLinesChange={setLines}
          subtotal={subtotal}
          onBack={() => setView("menu")}
          onCreated={(order) => {
            setLines([]);
            writeCart(slug, []);
            router.push(`/${slug}/pedido/${order.tracking_token}`);
          }}
        />
      </main>
    );
  }

  return (
    <main className="shell" style={brandStyle(restaurant.color_marca)}>
      <header className="store-head">
        {logo && (
          // biome-ignore lint/performance/noImgElement: logo del restaurante en una URL externa (Storage)
          <img className="store-logo" src={logo} alt={`Logo de ${restaurant.nombre}`} />
        )}
        <h1 className="title">{restaurant.nombre}</h1>
        <p className="status-line">
          <span className={`badge ${menu.abierto ? "open" : "closed"}`}>
            {menu.abierto ? "Abierto" : "Cerrado ahora"}
          </span>
          {restaurant.recogida && <span className="muted">Recogida</span>}
          {restaurant.reparto && <span className="muted">A domicilio</span>}
        </p>
        {pickupBranches.length > 1 && (
          <label className="branch-pick">
            <span>Local</span>
            <select
              value={branchId ?? ""}
              onChange={(event) =>
                event.target.value && void chooseBranch(Number(event.target.value))
              }
            >
              <option value="">Todos los locales</option>
              {pickupBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.nombre}
                  {branch.abierto ? "" : " (cerrado)"}
                </option>
              ))}
            </select>
          </label>
        )}
        {!accepting && (
          <p className="notice" role="status">
            {RESTAURANT_UNAVAILABLE_MESSAGE} Puedes ver la carta.
          </p>
        )}
        {accepting && !menu.abierto && (
          <p className="notice">
            Ahora mismo no aceptamos pedidos{branchName ? ` en ${branchName}` : ""}. Puedes ver la
            carta y volver más tarde.
          </p>
        )}
      </header>

      {notice && (
        <p className="notice" role="status">
          {notice}{" "}
          <button type="button" className="link-btn" onClick={() => setNotice(null)}>
            Entendido
          </button>
        </p>
      )}

      {menu.categories.length > 1 && (
        <nav className="cat-nav" aria-label="Categorías">
          {menu.categories.map((category) => (
            <a key={category.id} href={`#cat-${category.id}`}>
              {category.name}
            </a>
          ))}
        </nav>
      )}

      {menu.categories.length === 0 && (
        <p className="muted center">La carta está vacía por ahora.</p>
      )}

      {menu.categories.map((category) => (
        <section key={category.id} id={`cat-${category.id}`} className="category">
          <h2>{category.name}</h2>
          <ul className="items">
            {category.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="item"
                  disabled={!accepting}
                  onClick={() => setSelected(item)}
                >
                  <span className="item-text">
                    <strong>{item.name}</strong>
                    {item.description && <span className="muted small">{item.description}</span>}
                    <span className="price">
                      {item.variants.length > 1 ? "Desde " : ""}
                      {eurosFromCents(centsFromDecimal(fromPrice(item)))}
                    </span>
                  </span>
                  {item.imageUrl && (
                    // biome-ignore lint/performance/noImgElement: imágenes externas del restaurante
                    <img src={item.imageUrl} alt="" loading="lazy" width={88} height={88} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {socialLinks.length > 0 && (
        <nav className="store-social" aria-label={`Redes de ${restaurant.nombre}`}>
          {socialLinks.map((link) => (
            <a key={link.red} href={link.url} target="_blank" rel="noopener noreferrer nofollow">
              {link.label}
            </a>
          ))}
        </nav>
      )}

      <footer className="powered">Pedidos con EasyOrder · Konnecttia</footer>

      {accepting && count > 0 && (
        <div className="cart-bar">
          <button type="button" className="btn primary block" onClick={() => setView("checkout")}>
            Ver pedido · {count} {count === 1 ? "producto" : "productos"} ·{" "}
            {eurosFromCents(subtotal)}
          </button>
        </div>
      )}

      {selected && (
        <ItemSheet
          item={selected}
          onClose={() => setSelected(null)}
          onAdd={(line) => {
            setLines((current) => addLine(current, line));
            setSelected(null);
          }}
        />
      )}
    </main>
  );
}
