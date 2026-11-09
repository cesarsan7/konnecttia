import { COUNTRIES, countryOrDefault, flagEmoji } from "@konnecttia/domain";
import { useId } from "react";

type Props = {
  readonly label: string;
  /** Código ISO del país elegido (de él sale el prefijo). */
  readonly country: string;
  readonly onCountryChange: (code: string) => void;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
};

/**
 * Teléfono con prefijo: el selector parte del país del restaurante pero se puede cambiar
 * (clientes de otro país). En Windows el navegador puede mostrar «ES» en lugar de la bandera.
 */
export function PhoneField(props: Props) {
  const id = useId();
  const current = countryOrDefault(props.country);
  return (
    <div className="field phone-field">
      <label htmlFor={`${id}-num`}>{props.label}</label>
      <div className="phone-row">
        <select
          aria-label="Prefijo del país"
          value={current.code}
          onChange={(event) => props.onCountryChange(event.target.value)}
        >
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {flagEmoji(country.code)} {country.nombre} {country.prefijo}
            </option>
          ))}
        </select>
        <input
          id={`${id}-num`}
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={props.placeholder ?? "612 345 678"}
        />
      </div>
    </div>
  );
}
