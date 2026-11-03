/**
 * Límite de peticiones por clave en memoria (ventana deslizante). Suficiente con una instancia;
 * con varias réplicas se sustituye por un contador en Redis.
 */
export function createRateLimiter(maxPerWindow: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function isLimited(key: string, now = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > maxPerWindow;
  };
}
