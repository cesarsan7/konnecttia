/**
 * Convierte la dirección que escribe el cliente (WhatsApp) en coordenadas, para validar la zona
 * de reparto sin obligarle a compartir una ubicación. El proveedor es intercambiable: la API solo
 * conoce `Geocoder`. Hoy, Nominatim (OpenStreetMap) por HTTP; con `GEOCODING_URL` se apunta a una
 * instancia propia o compatible. La dirección sale a ese servicio: debe constar en la política
 * de privacidad.
 */
export type GeoPoint = { readonly lat: number; readonly lng: number };

export type GeocodeRequest = {
  /** Dirección tal como la escribió el cliente. */
  readonly address: string;
  /** Código ISO del país del restaurante (p. ej. «es»), para no devolver sitios de otro país. */
  readonly countryCode: string | null;
  /** Un punto del restaurante (un local) para preferir resultados cercanos. */
  readonly near: GeoPoint | null;
};

export type GeocodeResult = { readonly point: GeoPoint; readonly label: string };

/** `null`: no encontró la dirección. Lanza si el servicio no responde. */
export type Geocoder = (request: GeocodeRequest) => Promise<GeocodeResult | null>;

type Fetch = typeof fetch;

export type NominatimOptions = {
  readonly baseUrl: string;
  /** Nominatim exige identificar la aplicación (nombre y contacto). */
  readonly userAgent: string;
  readonly timeoutMs?: number;
  readonly fetch?: Fetch;
  readonly now?: () => number;
};

const CACHE_TTL_MS = 24 * 3_600_000;
const CACHE_MAX = 500;
/** Nominatim pide como máximo una petición por segundo. */
const MIN_INTERVAL_MS = 1_100;
/** Margen (grados) alrededor del local para preferir resultados cercanos. */
const NEAR_DEGREES = 1;

export function createNominatimGeocoder(options: NominatimOptions): Geocoder {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const timeout = options.timeoutMs ?? 4_000;
  const cache = new Map<string, { at: number; value: GeocodeResult | null }>();
  let last = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const search = async (request: GeocodeRequest): Promise<GeocodeResult | null> => {
    const url = new URL(`${options.baseUrl.replace(/\/$/, "")}/search`);
    url.searchParams.set("q", request.address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    if (request.countryCode)
      url.searchParams.set("countrycodes", request.countryCode.toLowerCase());
    if (request.near) {
      const { lat, lng } = request.near;
      url.searchParams.set(
        "viewbox",
        `${lng - NEAR_DEGREES},${lat + NEAR_DEGREES},${lng + NEAR_DEGREES},${lat - NEAR_DEGREES}`,
      );
    }
    const response = await fetcher(url, {
      headers: { "User-Agent": options.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`geocoding_http_${response.status}`);
    const rows = (await response.json()) as { lat?: string; lon?: string; display_name?: string }[];
    const first = rows[0];
    const lat = Number(first?.lat);
    const lng = Number(first?.lon);
    if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { point: { lat, lng }, label: first.display_name ?? request.address };
  };

  return (request) => {
    const key = `${request.countryCode ?? ""}|${request.address.trim().toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.value);
    // Las consultas van de una en una y espaciadas, como pide la política de uso.
    const run = queue.then(async () => {
      const wait = last + MIN_INTERVAL_MS - now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      last = now();
      const value = await search(request);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: now(), value });
      return value;
    });
    queue = run.catch(() => undefined);
    return run;
  };
}
