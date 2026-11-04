"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { describePanelError } from "@/lib/panel/api";
import {
  type AdminCategory,
  type AdminExtra,
  type AdminItem,
  type AdminMenu,
  allergenSummary,
  formatPrice,
  itemsOf,
  moveId,
  priceLabel,
} from "@/lib/panel/menu";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";
import {
  CategoryEditor,
  ExtraEditor,
  errorMessage,
  ItemEditor,
  OrderButtons,
  Toggle,
} from "./Editors";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly menu: AdminMenu }
  | { readonly kind: "error"; readonly message: string };

type Editing =
  | { readonly kind: "category"; readonly category: AdminCategory | null }
  | { readonly kind: "item"; readonly item: AdminItem | null; readonly categoryId: number | null }
  | { readonly kind: "extra"; readonly extra: AdminExtra | null }
  | null;

type Toast = { readonly id: number; readonly text: string; readonly tone: "ok" | "error" };

const TAB = { Items: "productos", Extras: "extras" } as const;
type Tab = (typeof TAB)[keyof typeof TAB];

const BRANCH_KEY = "k-carta-local";

export function MenuView() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>(TAB.Items);
  const [editing, setEditing] = useState<Editing>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");

  const canView = can(PERMISSION.MenuView);
  const menu = state.kind === "ready" ? state.menu : null;
  const fullEdit = menu?.edicion_completa ?? false;
  const canCreate = can(PERMISSION.MenuCreate) && fullEdit;
  const canUpdate = can(PERMISSION.MenuUpdate) && fullEdit;
  const canDelete = can(PERMISSION.MenuDelete) && fullEdit;
  const canAvailability = can(PERMISSION.MenuUpdate);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    const result = await api.menu(slug);
    if (result.ok) {
      setState({ kind: "ready", menu: result.data });
      setBranchId((current) => {
        const ids = result.data.locales.map((local) => local.id);
        if (current && ids.includes(current)) return current;
        let stored: number | null = null;
        try {
          stored = Number(localStorage.getItem(`${BRANCH_KEY}:${slug}`)) || null;
        } catch {
          // Sin almacenamiento: se usa el primero.
        }
        return stored && ids.includes(stored) ? stored : (ids[0] ?? null);
      });
    } else {
      setState({ kind: "error", message: describePanelError(result.status, result.body) });
    }
  }, [api, slug]);

  useEffect(() => {
    if (canView) void load();
  }, [load, canView]);

  function chooseBranch(id: number) {
    setBranchId(id);
    try {
      localStorage.setItem(`${BRANCH_KEY}:${slug}`, String(id));
    } catch {
      // Solo dura esta visita.
    }
  }

  /** Cambio rápido desde la lista (orden, visible, disponible): aplica, avisa y recarga. */
  async function quick(run: () => ReturnType<typeof api.menuChange>, done: string): Promise<void> {
    setPending(true);
    const result = await run();
    setPending(false);
    if (result.ok) toast(done);
    else toast(errorMessage(result), "error");
    await load();
  }

  const saved = (message: string) => {
    setEditing(null);
    toast(message);
    void load();
  };

  const filtered = useMemo(() => {
    if (!menu) return null;
    const text = query.trim().toLocaleLowerCase("es");
    if (!text) return null;
    return new Set(
      menu.productos
        .filter((item) => item.nombre.toLocaleLowerCase("es").includes(text))
        .map((item) => item.id),
    );
  }, [menu, query]);

  const header = (
    <header className="k-page-head">
      <div>
        <p className="k-eyebrow">{access.restaurante.nombre}</p>
        <h1 className="k-heading">Carta</h1>
      </div>
      {menu && (canCreate || menu.locales.length > 1) ? (
        <div className="k-head-tools">
          {menu.locales.length > 1 ? (
            <label className="k-select">
              <span className="k-small k-muted">Disponibilidad en</span>
              <select
                value={branchId ?? ""}
                onChange={(event) => chooseBranch(Number(event.target.value))}
              >
                {menu.locales.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {canCreate && tab === TAB.Items ? (
            <>
              <button
                type="button"
                className="k-btn k-btn-secondary"
                onClick={() => setEditing({ kind: "category", category: null })}
              >
                Nueva categoría
              </button>
              <button
                type="button"
                className="k-btn k-btn-primary"
                disabled={menu.categorias.length === 0}
                onClick={() => setEditing({ kind: "item", item: null, categoryId: null })}
              >
                Nuevo producto
              </button>
            </>
          ) : null}
          {canCreate && tab === TAB.Extras ? (
            <button
              type="button"
              className="k-btn k-btn-primary"
              onClick={() => setEditing({ kind: "extra", extra: null })}
            >
              Nuevo extra
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  );

  if (!canView) {
    return (
      <div className="k-page">
        {header}
        <div className="k-card">
          <p>Tu usuario no tiene permiso para ver la carta.</p>
        </div>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="k-page" aria-busy="true">
        {header}
        <div className="k-skeleton k-skeleton-tall" />
      </div>
    );
  }

  if (state.kind === "error" || !menu) {
    return (
      <div className="k-page">
        {header}
        <div className="k-card">
          <p className="k-alert" role="alert">
            {state.kind === "error" ? state.message : "No pudimos cargar la carta."}
          </p>
          <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const branchName = menu.locales.find((local) => local.id === branchId)?.nombre ?? null;
  const categoryIds = menu.categorias.map((category) => category.id);
  const undeclared = menu.productos.filter((item) => item.alergenos === null).length;

  return (
    <div className="k-page">
      {header}

      {!fullEdit ? (
        <p className="k-card k-note">
          Tu usuario opera solo algunos locales: puedes marcar qué productos están disponibles en
          ellos. La carta la cambia el propietario o un encargado de todos los locales.
        </p>
      ) : null}

      <div className="k-carta-bar">
        <fieldset className="k-segment" aria-label="Sección de la carta">
          <button
            type="button"
            className={tab === TAB.Items ? "is-on" : ""}
            aria-pressed={tab === TAB.Items}
            onClick={() => setTab(TAB.Items)}
          >
            Productos <span className="k-count">{menu.productos.length}</span>
          </button>
          <button
            type="button"
            className={tab === TAB.Extras ? "is-on" : ""}
            aria-pressed={tab === TAB.Extras}
            onClick={() => setTab(TAB.Extras)}
          >
            Extras <span className="k-count">{menu.extras.length}</span>
          </button>
        </fieldset>
        {tab === TAB.Items && menu.productos.length > 0 ? (
          <label className="k-search">
            <span className="k-sr-only">Buscar producto</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto"
            />
          </label>
        ) : null}
      </div>

      {tab === TAB.Items && undeclared > 0 && fullEdit ? (
        <p className="k-hint">
          <strong>{undeclared}</strong>{" "}
          {undeclared === 1 ? "producto no tiene" : "productos no tienen"} los alérgenos informados.
          La carta dirá «consulta al restaurante» hasta que los marques.
        </p>
      ) : null}

      {tab === TAB.Items ? (
        menu.categorias.length === 0 ? (
          <div className="k-card k-empty-state">
            <h2 className="k-title">Empieza por una categoría</h2>
            <p className="k-muted">
              Por ejemplo «Hamburguesas», «Bebidas» o «Postres». Después añade los productos con sus
              precios.
            </p>
            {canCreate ? (
              <button
                type="button"
                className="k-btn k-btn-primary"
                onClick={() => setEditing({ kind: "category", category: null })}
              >
                Crear la primera categoría
              </button>
            ) : null}
          </div>
        ) : (
          <div className="k-carta">
            {menu.categorias.map((category, index) => {
              const items = itemsOf(menu, category.id).filter(
                (item) => filtered === null || filtered.has(item.id),
              );
              if (filtered !== null && items.length === 0) return null;
              const itemIds = itemsOf(menu, category.id).map((item) => item.id);
              return (
                <section
                  key={category.id}
                  className={`k-card k-cat${category.activa ? "" : " is-hidden"}`}
                  aria-labelledby={`cat-${category.id}`}
                >
                  <header className="k-cat-head">
                    <h2 id={`cat-${category.id}`} className="k-title">
                      {category.nombre}
                    </h2>
                    {!category.activa ? <span className="k-chip k-chip-off">Oculta</span> : null}
                    <span className="k-muted k-small">
                      {itemIds.length} {itemIds.length === 1 ? "producto" : "productos"}
                    </span>
                    {canUpdate ? (
                      <span className="k-cat-tools">
                        <OrderButtons
                          label={`la categoría ${category.nombre}`}
                          first={index === 0}
                          last={index === menu.categorias.length - 1}
                          disabled={pending || filtered !== null}
                          onMove={(step) =>
                            void quick(
                              () =>
                                api.menuChange(slug, "PUT", "/categorias/orden", {
                                  ids: moveId(categoryIds, category.id, step),
                                }),
                              "Orden guardado",
                            )
                          }
                        />
                        <button
                          type="button"
                          className="k-btn k-btn-secondary k-btn-sm"
                          onClick={() => setEditing({ kind: "category", category })}
                        >
                          Editar
                        </button>
                      </span>
                    ) : null}
                  </header>
                  {items.length === 0 ? (
                    <div className="k-cat-empty">
                      <p className="k-muted k-small">Sin productos todavía.</p>
                      {canCreate ? (
                        <button
                          type="button"
                          className="k-link k-small"
                          onClick={() =>
                            setEditing({ kind: "item", item: null, categoryId: category.id })
                          }
                        >
                          Añadir producto a {category.nombre}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <ul className="k-items">
                      {items.map((item, itemIndex) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          first={itemIndex === 0}
                          last={itemIndex === items.length - 1}
                          branchId={branchId}
                          branchName={menu.locales.length > 1 ? branchName : null}
                          canUpdate={canUpdate}
                          canAvailability={canAvailability && branchId !== null}
                          pending={pending}
                          reorderable={filtered === null}
                          onEdit={() => setEditing({ kind: "item", item, categoryId: null })}
                          onMove={(step) =>
                            void quick(
                              () =>
                                api.menuChange(
                                  slug,
                                  "PUT",
                                  `/categorias/${category.id}/productos/orden`,
                                  {
                                    ids: moveId(itemIds, item.id, step),
                                  },
                                ),
                              "Orden guardado",
                            )
                          }
                          onVisible={(activo) =>
                            void quick(
                              () =>
                                api.menuChange(slug, "PATCH", `/productos/${item.id}`, { activo }),
                              activo ? `${item.nombre} visible` : `${item.nombre} oculto`,
                            )
                          }
                          onAvailable={(disponible) =>
                            void quick(
                              () =>
                                api.menuChange(
                                  slug,
                                  "PUT",
                                  `/productos/${item.id}/disponibilidad`,
                                  {
                                    sucursal_id: branchId,
                                    disponible,
                                  },
                                ),
                              disponible
                                ? `${item.nombre} disponible${branchName ? ` en ${branchName}` : ""}`
                                : `${item.nombre} agotado${branchName ? ` en ${branchName}` : ""}`,
                            )
                          }
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
            {filtered !== null && filtered.size === 0 ? (
              <p className="k-muted">Ningún producto coincide con «{query}».</p>
            ) : null}
          </div>
        )
      ) : (
        <ExtrasList
          menu={menu}
          canUpdate={canUpdate}
          canCreate={canCreate}
          pending={pending}
          onCreate={() => setEditing({ kind: "extra", extra: null })}
          onEdit={(extra) => setEditing({ kind: "extra", extra })}
          onMove={(extra, step) =>
            void quick(
              () =>
                api.menuChange(slug, "PUT", "/extras/orden", {
                  ids: moveId(
                    menu.extras.map((other) => other.id),
                    extra.id,
                    step,
                  ),
                }),
              "Orden guardado",
            )
          }
          onActive={(extra, activo) =>
            void quick(
              () => api.menuChange(slug, "PATCH", `/extras/${extra.id}`, { activo }),
              activo ? `${extra.nombre} disponible` : `${extra.nombre} no disponible`,
            )
          }
        />
      )}

      {editing?.kind === "category" ? (
        <CategoryEditor
          slug={slug}
          api={api}
          category={editing.category}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}
      {editing?.kind === "item" ? (
        <ItemEditor
          slug={slug}
          api={api}
          menu={menu}
          item={editing.item}
          defaultCategory={editing.categoryId}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}
      {editing?.kind === "extra" ? (
        <ExtraEditor
          slug={slug}
          api={api}
          menu={menu}
          extra={editing.extra}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}

      <div className="k-toasts" aria-live="polite">
        {toasts.map((item) => (
          <p key={item.id} className={`k-toast is-${item.tone}`}>
            {item.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function ItemRow(props: {
  readonly item: AdminItem;
  readonly first: boolean;
  readonly last: boolean;
  readonly branchId: number | null;
  readonly branchName: string | null;
  readonly canUpdate: boolean;
  readonly canAvailability: boolean;
  readonly pending: boolean;
  readonly reorderable: boolean;
  readonly onEdit: () => void;
  readonly onMove: (step: -1 | 1) => void;
  readonly onVisible: (value: boolean) => void;
  readonly onAvailable: (value: boolean) => void;
}) {
  const { item } = props;
  const available = props.branchId === null || !item.no_disponible_en.includes(props.branchId);
  const activeVariants = item.variantes.filter((variant) => variant.activa);
  return (
    <li className={`k-item${item.activo ? "" : " is-hidden"}`}>
      <span className="k-thumb" aria-hidden="true">
        {item.imagen_url ? (
          // biome-ignore lint/performance/noImgElement: miniatura de una URL externa (Storage)
          <img src={item.imagen_url} alt="" loading="lazy" />
        ) : (
          <span>{item.nombre.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      <span className="k-item-main">
        <span className="k-item-name">
          {props.canUpdate ? (
            <button type="button" className="k-item-link" onClick={props.onEdit}>
              {item.nombre}
            </button>
          ) : (
            <strong>{item.nombre}</strong>
          )}
          {!item.activo ? <span className="k-chip k-chip-off">Oculto</span> : null}
          {!available ? (
            <span className="k-chip k-chip-soldout">
              Agotado{props.branchName ? ` en ${props.branchName}` : ""}
            </span>
          ) : null}
        </span>
        <span className="k-item-meta k-small">
          <span>{priceLabel(item.variantes)}</span>
          {activeVariants.length > 1 ? (
            <span className="k-muted">
              {activeVariants
                .map((v) => `${v.nombre} ${formatPrice(v.precio_centimos)}`)
                .join(" · ")}
            </span>
          ) : null}
        </span>
        <span className={`k-item-allergens k-small${item.alergenos === null ? " is-missing" : ""}`}>
          {allergenSummary(item.alergenos)}
        </span>
      </span>
      <span className="k-item-tools">
        {props.canAvailability ? (
          <Toggle
            compact
            visibleLabel="Disponible"
            checked={available}
            disabled={props.pending}
            onChange={props.onAvailable}
            label={`${item.nombre} disponible${props.branchName ? ` en ${props.branchName}` : ""}`}
          />
        ) : null}
        {props.canUpdate ? (
          <>
            <button
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              disabled={props.pending}
              onClick={() => props.onVisible(!item.activo)}
            >
              {item.activo ? "Ocultar" : "Mostrar"}
            </button>
            <OrderButtons
              label={item.nombre}
              first={props.first}
              last={props.last}
              disabled={props.pending || !props.reorderable}
              onMove={props.onMove}
            />
          </>
        ) : null}
      </span>
    </li>
  );
}

function ExtrasList(props: {
  readonly menu: AdminMenu;
  readonly canUpdate: boolean;
  readonly canCreate: boolean;
  readonly pending: boolean;
  readonly onCreate: () => void;
  readonly onEdit: (extra: AdminExtra) => void;
  readonly onMove: (extra: AdminExtra, step: -1 | 1) => void;
  readonly onActive: (extra: AdminExtra, value: boolean) => void;
}) {
  const { menu } = props;
  const names = new Map(menu.categorias.map((category) => [category.id, category.nombre]));
  if (menu.extras.length === 0) {
    return (
      <div className="k-card k-empty-state">
        <h2 className="k-title">Sin extras</h2>
        <p className="k-muted">
          Los extras son suplementos que el cliente añade a un producto: queso, salsa, pan sin
          gluten… Se ofrecen por categoría.
        </p>
        {props.canCreate ? (
          <button type="button" className="k-btn k-btn-primary" onClick={props.onCreate}>
            Crear un extra
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <section className="k-card k-cat" aria-label="Extras">
      <ul className="k-items">
        {menu.extras.map((extra, index) => (
          <li key={extra.id} className={`k-item${extra.activo ? "" : " is-hidden"}`}>
            <span className="k-item-main">
              <span className="k-item-name">
                {props.canUpdate ? (
                  <button type="button" className="k-item-link" onClick={() => props.onEdit(extra)}>
                    {extra.nombre}
                  </button>
                ) : (
                  <strong>{extra.nombre}</strong>
                )}
                {!extra.activo ? <span className="k-chip k-chip-off">No disponible</span> : null}
              </span>
              <span className="k-item-meta k-small">
                <span>
                  {extra.precio_centimos === 0
                    ? "Gratis"
                    : `+${formatPrice(extra.precio_centimos)}`}
                </span>
                <span className="k-muted">
                  {extra.categorias.length === 0
                    ? "No se ofrece en ninguna categoría"
                    : `En ${extra.categorias.map((id) => names.get(id) ?? "").join(", ")}`}
                </span>
              </span>
              <span
                className={`k-item-allergens k-small${extra.alergenos === null ? " is-missing" : ""}`}
              >
                {allergenSummary(extra.alergenos)}
              </span>
            </span>
            {props.canUpdate ? (
              <span className="k-item-tools">
                <Toggle
                  compact
                  checked={extra.activo}
                  disabled={props.pending}
                  onChange={(value) => props.onActive(extra, value)}
                  label={`${extra.nombre} disponible`}
                />
                <OrderButtons
                  label={extra.nombre}
                  first={index === 0}
                  last={index === menu.extras.length - 1}
                  disabled={props.pending}
                  onMove={(step) => props.onMove(extra, step)}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
