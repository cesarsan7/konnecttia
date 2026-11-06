# Despliegue en EasyPanel

| Servicio                       | Origen                           | Rama   | Puerto |
| ------------------------------ | -------------------------------- | ------ | ------ |
| `konnecttia-site` (staging)    | `infra/docker/site.Dockerfile`   | `main` | 3000   |
| `konnecttia-site` (producción) | `infra/docker/site.Dockerfile`   | `main` | 3000   |
| `konnecttia-worker`            | `infra/docker/worker.Dockerfile` | `main` | —      |

Siempre se despliega primero en staging (ADR 0008). Producción solo con aprobación del promotor.

Variables (solo en EasyPanel, nunca en el repositorio): ver `apps/site/.env.example`.

## `konnecttia-site` en staging (proyecto `n8nlearning`)

La landing no usa base de datos ni la API: no toca la demo de La Isla.

1. En el proyecto `n8nlearning`: _+ Service_ → _App_ → nombre `konnecttia-site`.
2. _Source_ → GitHub: `cesarsan7/konnecttia`, rama `main` (o la rama del PR para probarlo antes
   de fusionar).
3. _Build_ → Dockerfile. _Build Path_ = `/`. _File_ = `infra/docker/site.Dockerfile`.
4. _Environment_:

   ```env
   EASYORDER_PANEL_URL=https://n8nlearning-konnecttia-easyorder.avtsif.easypanel.host/panel
   ```

   El formulario de demo necesita además `RESEND_API_KEY`, `DEMO_REQUEST_TO` y `EMAIL_FROM`. Si
   faltan, la web arranca igual y el formulario responde que el envío aún no está activo.
   `EASYORDER_PANEL_URL` se lee en tiempo de ejecución: cambiarla solo exige reiniciar, no
   reconstruir.
5. _Domains_: el dominio por defecto
   (`https://n8nlearning-konnecttia-site.avtsif.easypanel.host`), puerto **3000**, protocolo de
   destino HTTP.
6. _Deploy_ y comprobar:

   | URL           | Esperado                                          |
   | ------------- | ------------------------------------------------- |
   | `/api/health` | `{"ok":true,"panelAccess":true}`                  |
   | `/`           | Landing; «EasyOrder» en el menú lleva a la página |
   | `/easyorder`  | Página del servicio                               |
   | `/acceder`    | Redirección 307 al login del panel                |

   Si `/acceder` devuelve 503 o `panelAccess` es `false`, falta `EASYORDER_PANEL_URL`.

Memoria: un servicio más en el VPS de 8 GB, que va por el
~66 % de uso (ADR 0008). Vigilarlo tras el primer despliegue.

## Producción (en la migración a la UE)

Mismo servicio en el proyecto `prod`, dominio `konnecttia.com`, y
`EASYORDER_PANEL_URL` apuntando al panel de producción.

## `konnecttia-worker` (avisos por email)

Servicio aparte sin dominio ni puerto: `infra/docker/worker.Dockerfile`, mismo repositorio y rama.
Variables, pasos y comprobación en [`apps/worker/README.md`](../../apps/worker/README.md).
