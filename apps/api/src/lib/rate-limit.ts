/**
 * Límite de peticiones por clave en memoria (ventana deslizante). Suficiente con una instancia;
 * con varias réplicas se sustituye por un contador en Redis.
 *
 * Las claves sin peticiones recientes se borran al limpiar (cada `windowMs`), para que un flujo
 * de IPs distintas no haga crecer la memoria sin límite.
 */
export function createRateLimiter(maxPerWindow: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;
  function isLimited(key: string, now = Date.now()): boolean {
    if (now - lastSweep >= windowMs) {
      lastSweep = now;
      for (const [stored, times] of hits) {
        if (times.every((time) => now - time >= windowMs)) hits.delete(stored);
      }
    }
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > maxPerWindow;
  }
  /** Claves guardadas ahora mismo (para tests). */
  isLimited.size = () => hits.size;
  return isLimited;
}
