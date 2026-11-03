"use client";

import { type FormEvent, useState } from "react";
import type { ApiResult } from "@/lib/api";
import { describePanelError, type PanelApi } from "@/lib/panel/api";
import {
  type AdminCategory,
  type AdminExtra,
  type AdminItem,
  type AdminMenu,
  type Allergen,
  draftsFrom,
  menuConflictMessage,
  parsePrice,
  planVariants,
  priceInput,
  type VariantDraft,
  validateVariants,
} from "@/lib/panel/menu";
import type { ApiErrorBody } from "@/lib/types";
import { AllergenPicker } from "./AllergenPicker";
import { Modal } from "./Modal";

type Done = (message: string) => void;

type Common = {
  readonly slug: string;
  readonly api: PanelApi;
  readonly onClose: () => void;
  readonly onSaved: Done;
  readonly canDelete: boolean;
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function errorMessage(result: ApiResult<unknown>): string {
  if (result.ok) return "";
  const body = result.body as (ApiErrorBody & { reason?: string; field?: string }) | null;
  if (result.status === 409) return menuConflictMessage(body?.reason);
  if (result.status === 400) return "Revisa los datos: hay algún campo no válido.";
  if (result.status === 413) return "La foto pesa demasiado (máximo 5 MB).";
  if (result.status === 415) return "Solo se admiten fotos JPG, PNG o WebP.";
  if (result.status === 503 && body?.error === "storage_not_configured") {
    return "La subida de fotos no está activada. Pega la dirección (URL) de la foto.";
  }
  if (result.status === 403 && body?.reason === "branch_scope_limited") {
    return "Tu usuario solo opera algunos locales: no puede cambiar la carta común.";
  }
  if (result.status === 404) return "Ya no existe. Recargamos la carta.";
  return describePanelError(result.status, body);
}

function ErrorLine({ text }: { readonly text: string | null }) {
  return text ? (
    <p className="k-alert" role="alert">
      {text}
    </p>
  ) : null;
}

/** Confirmación en dos pasos dentro del propio diálogo (sin window.confirm). */
function DeleteButton({
  label,
  onConfirm,
  busy,
}: {
  readonly label: string;
  readonly onConfirm: () => void;
  readonly busy: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className="k-link k-link-danger" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="k-confirm">
      <span className="k-small">¿Seguro? No se puede deshacer.</span>
      <button
        type="button"
        className="k-btn k-btn-sm k-btn-danger"
        disabled={busy}
        onClick={onConfirm}
      >
        Sí, borrar
      </button>
      <button
        type="button"
        className="k-btn k-btn-sm k-btn-secondary"
        onClick={() => setAsking(false)}
      >
        No
      </button>
    </span>
  );
}

// ------------------------------------------------------------------------------- categoría

export function CategoryEditor({
  category,
  ...props
}: Common & { readonly category: AdminCategory | null }) {
  const [nombre, setNombre] = useState(category?.nombre ?? "");
  const [activa, setActiva] = useState(category?.activa ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!nombre.trim()) return setError("Ponle un nombre a la categoría.");
    setBusy(true);
    const result = category
      ? await props.api.menuChange(props.slug, "PATCH", `/categorias/${category.id}`, {
          nombre: nombre.trim(),
          activa,
        })
      : await props.api.menuChange(props.slug, "POST", "/categorias", {
          nombre: nombre.trim(),
          activa,
        });
    setBusy(false);
    if (!result.ok) return setError(errorMessage(result));
    props.onSaved(category ? "Categoría guardada" : "Categoría creada");
  }

  async function remove() {
    if (!category) return;
    setBusy(true);
    const result = await props.api.menuChange(props.slug, "DELETE", `/categorias/${category.id}`);
    setBusy(false);
    if (!result.ok) return setError(errorMessage(result));
    props.onSaved("Categoría borrada");
  }

  return (
    <Modal title={category ? "Editar categoría" : "Nueva categoría"} onClose={props.onClose}>
      <form onSubmit={save} noValidate>
        <ErrorLine text={error} />
        <label className="k-field">
          <span>Nombre</span>
          <input
            value={nombre}
            maxLength={100}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ej.: Hamburguesas"
            required
          />
        </label>
        <Toggle checked={activa} onChange={setActiva} label="Visible en la carta" />
        <div className="k-dialog-actions k-dialog-actions-split">
          {category && props.canDelete ? (
            <DeleteButton label="Borrar categoría" onConfirm={remove} busy={busy} />
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="submit" className="k-btn k-btn-go" disabled={busy}>
              Guardar
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

// -------------------------------------------------------------------------------- producto

let draftCounter = 0;
const newDraft = (first: boolean): VariantDraft => ({
  key: `n${++draftCounter}`,
  id: null,
  nombre: first ? "Normal" : "",
  precio: "",
  predeterminada: first,
  activa: true,
});

export function ItemEditor({
  item,
  menu,
  defaultCategory,
  ...props
}: Common & {
  readonly item: AdminItem | null;
  readonly menu: AdminMenu;
  readonly defaultCategory: number | null;
}) {
  const [categoria, setCategoria] = useState<number>(
    item?.categoria_id ?? defaultCategory ?? menu.categorias[0]?.id ?? 0,
  );
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(item?.descripcion ?? "");
  const [activo, setActivo] = useState(item?.activo ?? true);
  const [alergenos, setAlergenos] = useState<Allergen[] | null>(
    item?.alergenos ? [...item.alergenos] : null,
  );
  const [imagen, setImagen] = useState(item?.imagen_url ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [variants, setVariants] = useState<VariantDraft[]>(
    item ? draftsFrom(item.variantes) : [newDraft(true)],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const variantErrors = validateVariants(variants);
  const [showErrors, setShowErrors] = useState(false);

  const updateVariant = (key: string, patch: Partial<VariantDraft>) =>
    setVariants((list) =>
      list.map((draft) => {
        if (draft.key === key) return { ...draft, ...patch };
        // Solo una predeterminada.
        return patch.predeterminada ? { ...draft, predeterminada: false } : draft;
      }),
    );

  const moveVariant = (key: string, step: -1 | 1) =>
    setVariants((list) => {
      const index = list.findIndex((draft) => draft.key === key);
      const target = index + step;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target] as VariantDraft, next[index] as VariantDraft];
      return next;
    });

  async function save(event: FormEvent) {
    event.preventDefault();
    setShowErrors(true);
    if (!nombre.trim()) return setError("Ponle un nombre al producto.");
    if (!categoria) return setError("Elige una categoría.");
    if (variantErrors.length > 0) return setError("Revisa los precios marcados.");
    const url = imagen.trim();
    if (url && !url.startsWith("https://")) {
      return setError("La dirección de la foto debe empezar por https://");
    }
    if (photo && photo.size > MAX_PHOTO_BYTES) {
      return setError("La foto pesa demasiado (máximo 5 MB).");
    }
    setBusy(true);
    setError(null);
    const fields = {
      categoria_id: categoria,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      activo,
      alergenos,
      imagen_url: url || null,
    };
    const failure = await (item ? update(item, fields) : create(fields));
    setBusy(false);
    if (failure) return setError(failure);
    props.onSaved(item ? "Producto guardado" : "Producto creado");
  }

  async function create(fields: Record<string, unknown>): Promise<string | null> {
    const result = await props.api.menuChange(props.slug, "POST", "/productos", {
      ...fields,
      variantes: variants.map((draft) => ({
        nombre: draft.nombre.trim(),
        precio_centimos: parsePrice(draft.precio) ?? 0,
        predeterminada: draft.predeterminada,
        activa: draft.activa,
      })),
    });
    if (!result.ok) return errorMessage(result);
    if (photo) {
      const upload = await props.api.uploadPhoto(props.slug, result.data.id, photo);
      if (!upload.ok) return `Producto creado, pero la foto no: ${errorMessage(upload)}`;
    }
    return null;
  }

  async function update(
    original: AdminItem,
    fields: Record<string, unknown>,
  ): Promise<string | null> {
    const result = await props.api.menuChange(
      props.slug,
      "PATCH",
      `/productos/${original.id}`,
      fields,
    );
    if (!result.ok) return errorMessage(result);
    const plan = planVariants(original.variantes, variants);
    const steps: (() => Promise<ApiResult<unknown>>)[] = [
      ...plan.remove.map(
        (id) => () => props.api.menuChange(props.slug, "DELETE", `/variantes/${id}`),
      ),
      ...plan.update.map(
        ({ id, changes }) =>
          () =>
            props.api.menuChange(props.slug, "PATCH", `/variantes/${id}`, changes),
      ),
      ...(plan.order
        ? [
            () =>
              props.api.menuChange(props.slug, "PUT", `/productos/${original.id}/variantes/orden`, {
                ids: plan.order,
              }),
          ]
        : []),
      ...plan.create.map(
        (body) => () =>
          props.api.menuChange(props.slug, "POST", `/productos/${original.id}/variantes`, body),
      ),
    ];
    for (const step of steps) {
      const outcome = await step();
      if (!outcome.ok) return errorMessage(outcome);
    }
    if (photo) {
      const upload = await props.api.uploadPhoto(props.slug, original.id, photo);
      if (!upload.ok) return errorMessage(upload);
    }
    return null;
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    const result = await props.api.menuChange(props.slug, "DELETE", `/productos/${item.id}`);
    setBusy(false);
    if (!result.ok) return setError(errorMessage(result));
    props.onSaved("Producto borrado");
  }

  const preview = photo
    ? URL.createObjectURL(photo)
    : imagen.trim().startsWith("https://")
      ? imagen.trim()
      : null;

  return (
    <Modal title={item ? "Editar producto" : "Nuevo producto"} onClose={props.onClose} wide>
      <form onSubmit={save} noValidate className="k-editor">
        <ErrorLine text={error} />
        <div className="k-editor-grid">
          <div>
            <label className="k-field">
              <span>Nombre</span>
              <input
                value={nombre}
                maxLength={150}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="Ej.: Salchipapa especial"
                required
              />
            </label>
            <label className="k-field">
              <span>Categoría</span>
              <select
                className="k-input"
                value={categoria}
                onChange={(event) => setCategoria(Number(event.target.value))}
              >
                {menu.categorias.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="k-field">
              <span>
                Descripción <span className="k-muted k-optional">(opcional)</span>
              </span>
              <textarea
                className="k-input"
                rows={3}
                maxLength={500}
                value={descripcion}
                onChange={(event) => setDescripcion(event.target.value)}
                placeholder="Ingredientes o cómo se sirve"
              />
            </label>
            <Toggle checked={activo} onChange={setActivo} label="Visible en la carta" />
          </div>

          <div className="k-photo-field">
            <span className="k-field-label">
              Foto <span className="k-muted k-optional">(opcional)</span>
            </span>
            <div className="k-photo">
              {preview ? (
                // biome-ignore lint/performance/noImgElement: vista previa local o de una URL externa
                <img src={preview} alt="" />
              ) : (
                <span className="k-muted k-small">Sin foto</span>
              )}
            </div>
            {menu.subida_fotos ? (
              <label className="k-btn k-btn-secondary k-btn-sm k-file">
                {preview ? "Cambiar foto" : "Subir foto"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <label className="k-field">
                <span className="k-small">Dirección de la foto (https://…)</span>
                <input
                  type="url"
                  inputMode="url"
                  value={imagen}
                  maxLength={1000}
                  onChange={(event) => setImagen(event.target.value)}
                  placeholder="https://"
                />
              </label>
            )}
            {preview ? (
              <button
                type="button"
                className="k-link k-small"
                onClick={() => {
                  setPhoto(null);
                  setImagen("");
                }}
              >
                Quitar foto
              </button>
            ) : null}
            <p className="k-small k-muted">JPG, PNG o WebP, hasta 5 MB. Mejor cuadrada.</p>
          </div>
        </div>

        <fieldset className="k-variants">
          <legend className="k-field-label">Precios</legend>
          <p className="k-small k-muted">
            Un precio por tamaño o versión (pequeño, grande…). El marcado como «principal» es el que
            se elige por defecto.
          </p>
          <ul className="k-variant-list">
            {variants.map((draft, index) => {
              const issues = showErrors ? variantErrors.filter((e) => e.key === draft.key) : [];
              return (
                <li key={draft.key} className={`k-variant${draft.activa ? "" : " is-off"}`}>
                  <label className="k-field">
                    <span className="k-sr-only">Nombre del precio {index + 1}</span>
                    <input
                      value={draft.nombre}
                      maxLength={80}
                      aria-invalid={issues.length > 0}
                      placeholder="Ej.: Grande"
                      onChange={(event) => updateVariant(draft.key, { nombre: event.target.value })}
                    />
                  </label>
                  <label className="k-field k-price-input">
                    <span className="k-sr-only">Precio {index + 1} en euros</span>
                    <input
                      value={draft.precio}
                      inputMode="decimal"
                      aria-invalid={issues.length > 0}
                      placeholder="0,00"
                      onChange={(event) => updateVariant(draft.key, { precio: event.target.value })}
                    />
                    <span aria-hidden="true">€</span>
                  </label>
                  <label className="k-check">
                    <input
                      type="radio"
                      name="principal"
                      checked={draft.predeterminada}
                      onChange={() => updateVariant(draft.key, { predeterminada: true })}
                    />
                    <span>Principal</span>
                  </label>
                  <label className="k-check">
                    <input
                      type="checkbox"
                      checked={draft.activa}
                      onChange={(event) =>
                        updateVariant(draft.key, { activa: event.target.checked })
                      }
                    />
                    <span>Activo</span>
                  </label>
                  <span className="k-variant-tools">
                    <OrderButtons
                      label={draft.nombre || `precio ${index + 1}`}
                      first={index === 0}
                      last={index === variants.length - 1}
                      onMove={(step) => moveVariant(draft.key, step)}
                    />
                    <button
                      type="button"
                      className="k-icon-btn"
                      aria-label={`Quitar ${draft.nombre || `precio ${index + 1}`}`}
                      disabled={variants.length === 1}
                      onClick={() =>
                        setVariants((list) => {
                          const next = list.filter((other) => other.key !== draft.key);
                          if (
                            draft.predeterminada &&
                            next[0] &&
                            !next.some((v) => v.predeterminada)
                          ) {
                            next[0] = { ...next[0], predeterminada: true };
                          }
                          return next;
                        })
                      }
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </span>
                  {issues.length > 0 ? (
                    <p className="k-field-error">
                      {issues.map((issue) => issue.message).join(" ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            onClick={() => setVariants((list) => [...list, newDraft(list.length === 0)])}
          >
            Añadir precio
          </button>
        </fieldset>

        <AllergenPicker value={alergenos} onChange={setAlergenos} name="producto" />

        <div className="k-dialog-actions k-dialog-actions-split">
          {item && props.canDelete ? (
            <DeleteButton label="Borrar producto" onConfirm={remove} busy={busy} />
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="submit" className="k-btn k-btn-go" disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------------- extra

export function ExtraEditor({
  extra,
  menu,
  ...props
}: Common & { readonly extra: AdminExtra | null; readonly menu: AdminMenu }) {
  const [nombre, setNombre] = useState(extra?.nombre ?? "");
  const [precio, setPrecio] = useState(extra ? priceInput(extra.precio_centimos) : "");
  const [activo, setActivo] = useState(extra?.activo ?? true);
  const [alergenos, setAlergenos] = useState<Allergen[] | null>(
    extra?.alergenos ? [...extra.alergenos] : null,
  );
  const [categorias, setCategorias] = useState<number[]>([...(extra?.categorias ?? [])]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const cents = parsePrice(precio);
    if (!nombre.trim()) return setError("Ponle un nombre al extra.");
    if (cents === null) return setError("Precio no válido. Ejemplo: 1,50 (0 si es gratis).");
    setBusy(true);
    const body = { nombre: nombre.trim(), precio_centimos: cents, activo, alergenos, categorias };
    const result = extra
      ? await props.api.menuChange(props.slug, "PATCH", `/extras/${extra.id}`, body)
      : await props.api.menuChange(props.slug, "POST", "/extras", body);
    setBusy(false);
    if (!result.ok) return setError(errorMessage(result));
    props.onSaved(extra ? "Extra guardado" : "Extra creado");
  }

  async function remove() {
    if (!extra) return;
    setBusy(true);
    const result = await props.api.menuChange(props.slug, "DELETE", `/extras/${extra.id}`);
    setBusy(false);
    if (!result.ok) return setError(errorMessage(result));
    props.onSaved("Extra borrado");
  }

  return (
    <Modal title={extra ? "Editar extra" : "Nuevo extra"} onClose={props.onClose} wide>
      <form onSubmit={save} noValidate className="k-editor">
        <ErrorLine text={error} />
        <div className="k-editor-row">
          <label className="k-field">
            <span>Nombre</span>
            <input
              value={nombre}
              maxLength={120}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej.: Queso extra"
            />
          </label>
          <label className="k-field k-price-input">
            <span>Suplemento</span>
            <input
              value={precio}
              inputMode="decimal"
              placeholder="0,00"
              onChange={(event) => setPrecio(event.target.value)}
            />
            <span aria-hidden="true">€</span>
          </label>
        </div>
        <Toggle checked={activo} onChange={setActivo} label="Disponible" />
        <fieldset className="k-fieldset">
          <legend className="k-field-label">Se ofrece en</legend>
          {menu.categorias.length === 0 ? (
            <p className="k-small k-muted">Crea antes alguna categoría.</p>
          ) : (
            <div className="k-chips-pick">
              {menu.categorias.map((category) => {
                const on = categorias.includes(category.id);
                return (
                  <label key={category.id} className={`k-allergen${on ? " is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(event) =>
                        setCategorias((list) =>
                          event.target.checked
                            ? [...list, category.id]
                            : list.filter((id) => id !== category.id),
                        )
                      }
                    />
                    <span>{category.nombre}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="k-small k-muted">
            El extra aparece en todos los productos de las categorías marcadas.
          </p>
        </fieldset>
        <AllergenPicker value={alergenos} onChange={setAlergenos} name="extra" />
        <div className="k-dialog-actions k-dialog-actions-split">
          {extra && props.canDelete ? (
            <DeleteButton label="Borrar extra" onConfirm={remove} busy={busy} />
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="submit" className="k-btn k-btn-go" disabled={busy}>
              Guardar
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------------------- comunes

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  compact = false,
  visibleLabel,
}: {
  readonly visibleLabel?: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <label className={`k-toggle${compact ? " is-compact" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="k-toggle-track" aria-hidden="true" />
      <span className={compact ? "k-sr-only" : ""}>{label}</span>
      {visibleLabel ? (
        <span className="k-toggle-text" aria-hidden="true">
          {visibleLabel}
        </span>
      ) : null}
    </label>
  );
}

export function OrderButtons({
  label,
  first,
  last,
  onMove,
  disabled = false,
}: {
  readonly label: string;
  readonly first: boolean;
  readonly last: boolean;
  readonly onMove: (step: -1 | 1) => void;
  readonly disabled?: boolean;
}) {
  return (
    <span className="k-order-btns">
      <button
        type="button"
        className="k-icon-btn"
        aria-label={`Subir ${label}`}
        disabled={first || disabled}
        onClick={() => onMove(-1)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M18 15l-6-6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="k-icon-btn"
        aria-label={`Bajar ${label}`}
        disabled={last || disabled}
        onClick={() => onMove(1)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}
