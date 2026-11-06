# Auditoría de seguridad (6 de noviembre de 2026)

Revisión del código del repositorio (API, web pública y panel). Lo que depende del servidor
(EasyPanel, Supabase, copias de seguridad) no se puede ver desde el código y queda como lista para
revisar a mano.

## Lo que ya está bien

- Cada endpoint del panel exige sesión de Supabase, membresía del restaurante y un permiso; las
  denegaciones quedan en la auditoría. Filtro por restaurante y por locales en las consultas.
- Consultas SQL con parámetros (postgres.js); el único `sql.unsafe` usa una lista cerrada de
  columnas.
- Los errores no devuelven detalles internos, solo una referencia (`requestId`).
- CORS solo para los orígenes de `ALLOWED_ORIGINS`.
- Cabeceras de seguridad en la API (`secureHeaders` de Hono) y en la web (`nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Límite de peticiones por IP en pedidos, seguimiento y cotización.
- Seguimiento público por token aleatorio (UUID), no por el código del pedido.
- La comanda escapa los textos del pedido antes de imprimir.
- Ningún secreto en el repositorio (solo `.env.example`); Dependabot activo cada semana.

## Arreglado en este PR

| Hallazgo                                                                          | Riesgo                                                                        | Arreglo                                                                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| El limitador de peticiones guardaba todas las IPs para siempre                    | Memoria creciente con tráfico de muchas IPs (o un ataque) hasta tumbar la API | Limpia las claves sin peticiones recientes                                                                                                  |
| `orden=constructor` en el historial pasaba la validación (`in` mira el prototipo) | Error 503 en vez de 400; sin inyección                                        | `Object.hasOwn` y test                                                                                                                      |
| La web no pedía HTTPS al navegador ni impedía que la incrusten con CSP            | Bajo                                                                          | `Strict-Transport-Security` (1 año, sin subdominios) y CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` |

## Pendiente (código)

| #   | Hallazgo                                                                                                             | Riesgo                                                           | Propuesta                                                                                    | Prioridad        |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| 1   | `@hono/node-server` con un aviso moderado (GHSA-rmxm-3fg6-px4f, rutas estáticas)                                     | Bajo: la API no sirve archivos estáticos                         | Subir a ≥ 2.1.3 en su PR (versión mayor, probar arranque)                                    | Media            |
| 2   | Sin la cabecera de IP (`CLIENT_IP_HEADER`, por defecto `x-real-ip`) todas las peticiones comparten el mismo contador | Un solo cliente podría bloquear los pedidos de todos             | Comprobar en staging que el proxy envía `X-Real-Ip`; si falta, rechazar o registrar un aviso | Alta (comprobar) |
| 3   | Límite de peticiones en memoria                                                                                      | Con varias réplicas de la API no se comparte                     | Contador en Redis cuando haya más de una réplica                                             | Baja             |
| 4   | CSP completa (scripts y estilos)                                                                                     | Defensa extra frente a XSS                                       | Probar primero en modo `Report-Only` con nonce de Next                                       | Baja             |
| 5   | Pedidos falsos                                                                                                       | Ver pieza Q del plan (límites por teléfono, captcha, bloqueados) | Pieza Q                                                                                      | Alta             |

## Para revisar a mano (servidor y servicios)

- [ ] **EasyPanel / proxy:** HTTPS forzado en todos los dominios; la cabecera `X-Real-Ip` llega a la
  API con la IP real del cliente; el panel de EasyPanel no es accesible sin contraseña fuerte y
  2FA.
- [ ] **PostgreSQL:** el puerto 5432 no está expuesto a internet; usuarios distintos para la API,
  n8n y migraciones, cada uno con los permisos que necesita.
- [ ] **Copias de seguridad:** copia diaria de la base, fuera del VPS, y una restauración probada.
- [ ] **Supabase Auth:** confirmación de email activada; contraseñas de al menos 8 caracteres;
  Redirect URLs solo con los dominios del panel; límites de envío de emails.
- [ ] **Supabase Storage:** el bucket de fotos de la carta es público (debe serlo); los de
  justificantes y documentos, privados.
- [ ] **Claves:** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` y las de n8n solo en variables de
  EasyPanel; rotarlas si alguna se ha compartido por chat o correo.
- [ ] **VPS:** actualizaciones de seguridad automáticas, acceso SSH solo con clave, cortafuegos
  con los puertos 80/443 (y SSH) abiertos.
- [ ] **n8n y Chatwoot:** usuarios con contraseña fuerte y 2FA; webhooks de n8n con secreto.
