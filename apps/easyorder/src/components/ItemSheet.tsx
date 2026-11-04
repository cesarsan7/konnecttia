"use client";

import { addCents, centsFromDecimal, multiplyCents } from "@konnecttia/domain";
import { useEffect, useId, useRef, useState } from "react";
import { allergenNames, lineAllergens } from "@/lib/allergens";
import { buildLine, type CartLine, MAX_QUANTITY } from "@/lib/cart";
import { euros, eurosFromCents } from "@/lib/format";
import type { MenuItem } from "@/lib/types";

type Props = {
  readonly item: MenuItem;
  readonly onAdd: (line: CartLine) => void;
  readonly onClose: () => void;
};

/** Ficha de producto: tamaño, extras, cantidad y nota. Se abre como diálogo modal. */
export function ItemSheet({ item, onAdd, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const defaultVariant = item.variants.find((v) => v.isDefault) ?? item.variants[0];
  const [variantId, setVariantId] = useState(defaultVariant?.id ?? 0);
  const [extras, setExtras] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const variant = item.variants.find((v) => v.id === variantId);
  const unit = addCents(
    centsFromDecimal(variant?.price ?? 0),
    ...item.extras.filter((e) => extras.includes(e.id)).map((e) => centsFromDecimal(e.price)),
  );

  const allergens = lineAllergens(item, extras);
  const allergenList = allergenNames(allergens);

  const toggleExtra = (id: number) =>
    setExtras((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
    >
      <form
        method="dialog"
        className="sheet-body"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd(buildLine(item, variantId, extras, quantity, note));
        }}
      >
        <header className="sheet-head">
          <h2 id={titleId}>{item.name}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </header>
        {item.description && <p className="muted">{item.description}</p>}

        {item.variants.length > 1 && (
          <fieldset className="group">
            <legend>Tamaño</legend>
            {item.variants.map((option) => (
              <label key={option.id} className="choice">
                <input
                  type="radio"
                  name="variant"
                  checked={option.id === variantId}
                  onChange={() => setVariantId(option.id)}
                />
                <span>{option.name}</span>
                <span className="price">{euros(option.price)}</span>
              </label>
            ))}
          </fieldset>
        )}

        {item.extras.length > 0 && (
          <fieldset className="group">
            <legend>Extras</legend>
            {item.extras.map((extra) => (
              <label key={extra.id} className="choice">
                <input
                  type="checkbox"
                  checked={extras.includes(extra.id)}
                  onChange={() => toggleExtra(extra.id)}
                />
                <span>{extra.name}</span>
                <span className="price">+{euros(extra.price)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="field">
          <span>Nota para la cocina (opcional)</span>
          <input
            type="text"
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ej.: sin cebolla"
          />
        </label>

        <p className="allergen-note" aria-live="polite">
          {allergens.status === "declared" ? (
            allergenList.length > 0 ? (
              <>
                Alérgenos: <strong>{allergenList.join(", ")}</strong>.
              </>
            ) : (
              <>
                <strong>No contiene</strong> ninguno de los 14 alérgenos de declaración obligatoria.
              </>
            )
          ) : (
            <>
              Alérgenos: <strong>no informados</strong> para este producto
              {extras.length > 0 ? " o sus extras" : ""}. Si tienes alguna alergia, pregunta al
              local antes de pedir.
            </>
          )}
        </p>

        <footer className="sheet-foot">
          <fieldset className="stepper" aria-label="Cantidad">
            <button
              type="button"
              aria-label="Quitar uno"
              disabled={quantity <= 1}
              onClick={() => setQuantity((value) => value - 1)}
            >
              −
            </button>
            <output aria-live="polite">{quantity}</output>
            <button
              type="button"
              aria-label="Añadir uno"
              disabled={quantity >= MAX_QUANTITY}
              onClick={() => setQuantity((value) => value + 1)}
            >
              +
            </button>
          </fieldset>
          <button type="submit" className="btn primary grow">
            Añadir · {eurosFromCents(multiplyCents(unit, quantity))}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
