/**
 * Países de EasyOrder (pieza «prefijo telefónico»). Cada restaurante tiene un país: de él salen el
 * prefijo telefónico por defecto del checkout y la bandera. La misma lista se siembra en la tabla
 * `pais` (migración 0030); la prueba catalog-sync evita que se desincronicen.
 */
export type Country = {
  readonly code: string;
  readonly nombre: string;
  /** Prefijo internacional con «+». */
  readonly prefijo: string;
};

/** País con el que se comportaba EasyOrder antes de tenerlo configurado (números sin prefijo = +34). */
export const DEFAULT_COUNTRY = "ES";

export const COUNTRIES: readonly Country[] = [
  { code: "ES", nombre: "España", prefijo: "+34" },
  { code: "US", nombre: "Estados Unidos", prefijo: "+1" },
  { code: "MX", nombre: "México", prefijo: "+52" },
  { code: "CO", nombre: "Colombia", prefijo: "+57" },
  { code: "AR", nombre: "Argentina", prefijo: "+54" },
  { code: "CL", nombre: "Chile", prefijo: "+56" },
  { code: "PE", nombre: "Perú", prefijo: "+51" },
  { code: "EC", nombre: "Ecuador", prefijo: "+593" },
  { code: "VE", nombre: "Venezuela", prefijo: "+58" },
  { code: "UY", nombre: "Uruguay", prefijo: "+598" },
  { code: "PY", nombre: "Paraguay", prefijo: "+595" },
  { code: "BO", nombre: "Bolivia", prefijo: "+591" },
  { code: "CR", nombre: "Costa Rica", prefijo: "+506" },
  { code: "PA", nombre: "Panamá", prefijo: "+507" },
  { code: "DO", nombre: "República Dominicana", prefijo: "+1" },
  { code: "GT", nombre: "Guatemala", prefijo: "+502" },
  { code: "HN", nombre: "Honduras", prefijo: "+504" },
  { code: "SV", nombre: "El Salvador", prefijo: "+503" },
  { code: "NI", nombre: "Nicaragua", prefijo: "+505" },
  { code: "CU", nombre: "Cuba", prefijo: "+53" },
  { code: "PR", nombre: "Puerto Rico", prefijo: "+1" },
  { code: "BR", nombre: "Brasil", prefijo: "+55" },
  { code: "CA", nombre: "Canadá", prefijo: "+1" },
  { code: "PT", nombre: "Portugal", prefijo: "+351" },
  { code: "FR", nombre: "Francia", prefijo: "+33" },
  { code: "IT", nombre: "Italia", prefijo: "+39" },
  { code: "DE", nombre: "Alemania", prefijo: "+49" },
  { code: "GB", nombre: "Reino Unido", prefijo: "+44" },
];

export function countryByCode(code: string | null | undefined): Country | null {
  const wanted = code?.trim().toUpperCase();
  return COUNTRIES.find((country) => country.code === wanted) ?? null;
}

/** País del restaurante, o el de siempre (España) si no tiene uno válido. */
export function countryOrDefault(code: string | null | undefined): Country {
  return countryByCode(code) ?? (countryByCode(DEFAULT_COUNTRY) as Country);
}

/** Bandera como emoji (letras regionales). En Windows muchos navegadores muestran «ES» en su lugar. */
export function flagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

const ZONE_COUNTRY: readonly (readonly [RegExp, string])[] = [
  [/^(Europe\/Madrid|Atlantic\/Canary|Africa\/Ceuta)$/, "ES"],
  [
    /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/.+|Kentucky\/.+)|Pacific\/Honolulu)$/,
    "US",
  ],
  [/^America\/(Mexico_City|Monterrey|Merida|Cancun|Tijuana|Chihuahua|Hermosillo|Mazatlan)$/, "MX"],
  [/^America\/Bogota$/, "CO"],
  [/^America\/(Argentina\/.+|Buenos_Aires)$/, "AR"],
  [/^America\/Santiago$/, "CL"],
  [/^America\/Lima$/, "PE"],
  [/^America\/Guayaquil$/, "EC"],
  [/^America\/Caracas$/, "VE"],
  [/^America\/Montevideo$/, "UY"],
  [/^America\/Asuncion$/, "PY"],
  [/^America\/La_Paz$/, "BO"],
  [/^America\/Costa_Rica$/, "CR"],
  [/^America\/Panama$/, "PA"],
  [/^America\/Santo_Domingo$/, "DO"],
  [/^America\/Guatemala$/, "GT"],
  [/^America\/Tegucigalpa$/, "HN"],
  [/^America\/El_Salvador$/, "SV"],
  [/^America\/Managua$/, "NI"],
  [/^America\/Havana$/, "CU"],
  [/^America\/Puerto_Rico$/, "PR"],
  [/^America\/(Sao_Paulo|Manaus|Bahia|Fortaleza|Recife)$/, "BR"],
  [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)$/, "CA"],
  [/^Europe\/Lisbon$/, "PT"],
  [/^Europe\/Paris$/, "FR"],
  [/^Europe\/Rome$/, "IT"],
  [/^Europe\/Berlin$/, "DE"],
  [/^Europe\/London$/, "GB"],
];

/** País probable de una zona horaria IANA (para sugerirlo en el alta). null si no se reconoce. */
export function countryFromTimeZone(zone: string | null | undefined): string | null {
  const name = zone?.trim() ?? "";
  return ZONE_COUNTRY.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

/**
 * Junta el prefijo elegido y el número escrito. Un número que ya trae «+» o «00» se respeta tal
 * cual (el cliente sabe lo que escribe); si no, se le antepone el prefijo y se quita el «0» inicial
 * de marcación nacional. Devuelve `+dígitos` (8 a 15 en total) o null si no es un teléfono.
 */
export function composePhone(raw: string, prefix: string): string | null {
  const compact = raw.replace(/[\s().-]/g, "");
  if (compact === "") return null;
  const explicit = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  let candidate: string;
  if (explicit.startsWith("+")) {
    candidate = explicit;
  } else if (/^\d+$/.test(explicit)) {
    const countryDigits = prefix.replace(/\D/g, "");
    const national = prefix === "+34" ? explicit : explicit.replace(/^0+/, "");
    candidate = `+${countryDigits}${national}`;
  } else {
    return null;
  }
  const digits = candidate.slice(1);
  return /^\d{8,15}$/.test(digits) ? candidate : null;
}

/** País efectivo de un formulario: el elegido si es válido; si no, el de la zona horaria; si no, España. */
export function resolveCountry(
  chosen: string | null | undefined,
  zone: string | null | undefined,
): string {
  return countryByCode(chosen)?.code ?? countryFromTimeZone(zone) ?? DEFAULT_COUNTRY;
}
