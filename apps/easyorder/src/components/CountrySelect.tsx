import { COUNTRIES, flagEmoji } from "@konnecttia/domain";

type Props = {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly hint?: string;
};

/** País del restaurante (alta, panel interno y Ajustes): de él sale el prefijo telefónico del checkout. */
export function CountrySelect({ value, onChange, hint }: Props) {
  return (
    <label className="k-field">
      <span>País</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {COUNTRIES.map((country) => (
          <option key={country.code} value={country.code}>
            {flagEmoji(country.code)} {country.nombre} ({country.prefijo})
          </option>
        ))}
      </select>
      <small className="k-muted">
        {hint ?? "Los clientes verán por defecto el prefijo de este país al escribir su teléfono."}
      </small>
    </label>
  );
}
