"use client";

import { MODULE_HELP } from "@/lib/module-help";
import { ALLERGEN_LABEL, ALLERGENS, type Allergen } from "@/lib/panel/menu";
import { HelpNote } from "../../HelpNote";

/**
 * Alérgenos: «no informados» (null) es distinto de «no contiene ninguno» ([]). La web nunca dice
 * «sin alérgenos» si el restaurante no lo ha declarado.
 */
export function AllergenPicker({
  value,
  onChange,
  name,
}: {
  readonly value: readonly Allergen[] | null;
  readonly onChange: (value: Allergen[] | null) => void;
  readonly name: string;
}) {
  const declared = value !== null;
  const selected = new Set(value ?? []);
  return (
    <fieldset className="k-allergens">
      <legend className="k-field-label">Alérgenos</legend>
      <HelpNote items={MODULE_HELP.alergenos} summary="¿Cómo se declaran los alérgenos?" />
      <div
        className="k-segment k-segment-sm"
        role="radiogroup"
        aria-label="Información de alérgenos"
      >
        <button
          type="button"
          aria-pressed={!declared}
          className={declared ? "" : "is-on"}
          onClick={() => onChange(null)}
        >
          Sin informar
        </button>
        <button
          type="button"
          aria-pressed={declared}
          className={declared ? "is-on" : ""}
          onClick={() => onChange(value ? [...value] : [])}
        >
          Informados
        </button>
      </div>
      {declared ? (
        <>
          <div className="k-allergen-grid">
            {ALLERGENS.map((allergen) => (
              <label
                key={allergen}
                className={`k-allergen${selected.has(allergen) ? " is-on" : ""}`}
              >
                <input
                  type="checkbox"
                  name={`${name}-${allergen}`}
                  checked={selected.has(allergen)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(allergen);
                    else next.delete(allergen);
                    onChange(ALLERGENS.filter((code) => next.has(code)));
                  }}
                />
                <span>{ALLERGEN_LABEL[allergen]}</span>
              </label>
            ))}
          </div>
          <p className="k-small k-muted">
            {selected.size === 0
              ? "Sin marcar ninguno, la carta dirá que no contiene ninguno de los 14 alérgenos."
              : `Contiene: ${ALLERGENS.filter((code) => selected.has(code))
                  .map((code) => ALLERGEN_LABEL[code].toLowerCase())
                  .join(", ")}.`}
          </p>
        </>
      ) : (
        <p className="k-small k-muted">
          La carta mostrará «Alérgenos no informados: consulta al restaurante».
        </p>
      )}
    </fieldset>
  );
}
