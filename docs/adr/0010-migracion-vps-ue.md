# ADR 0010 — Migración al VPS de la UE y dominio konnecttia.com

- Estado: aceptada (2026-11-06)
- Desarrolla: ADR 0006 (alojamiento en la UE) y ADR 0008 (entornos)
- 2026-11-11: el promotor confirma `*.staging.konnecttia.com` para staging (hoy en
  `*.eu.konnecttia.com`; el cambio lo hace la sesión de la VPS). Chatwoot ya no se despliega: el
  canal de WhatsApp es Kapso ([ADR 0012](0012-agente-whatsapp-multirestaurante.md)).

## Decisión

1. **Servidor:** un VPS Hostinger KVM 4 (4 vCPU, 16 GB, 200 GB NVMe) en un centro de datos de la
   UE cercano a España (Francia o Alemania), en la cuenta de Hostinger del promotor. Ubuntu LTS con
   EasyPanel. Producción y staging conviven al principio en proyectos de EasyPanel separados; se
   separa staging (KVM 2) o se sube de plan cuando haya unos 10 restaurantes activos o staging
   afecte a producción.
2. **Creación:** la hace la sesión con el plugin de Hostinger, con la compra confirmada por el
   promotor. Ninguna contraseña pasa por el chat; acceso SSH solo con clave.
3. **Dominio:** `konnecttia.com` sigue registrado en Arsys; el DNS pasa a **Cloudflare** (plan
   gratuito) cambiando los servidores de nombres en Arsys. Se conservan los registros de correo.

| Nombre                                      | Servicio                                                                | Entorno |
| ------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| `konnecttia.com`, `www`                     | Web comercial (`apps/site`)                                             | prod    |
| `app.konnecttia.com`                        | Web de EasyOrder: panel, carta `/<slug>`, `/alta`, `/interno`, `/ayuda` | prod    |
| `api.konnecttia.com`                        | API                                                                     | prod    |
| `n8n.konnecttia.com`, `chat.konnecttia.com` | n8n y Chatwoot                                                          | prod    |
| `*.staging.konnecttia.com`                  | Los mismos servicios de staging                                         | staging |

4. **Seguridad del servidor:** SSH con clave y sin contraseña, cortafuegos con 22/80/443, Postgres
   sin puerto público, actualizaciones de seguridad automáticas, panel de EasyPanel con dominio,
   contraseña fuerte y 2FA, copia diaria de las bases fuera del VPS además de la semanal de
   Hostinger.
5. **Correo:** Resend con el dominio `konnecttia.com` verificado (`noreply@konnecttia.com`).

## Fases

1. Preparación: VPS, EasyPanel, seguridad, Cloudflare, Resend.
2. Web comercial en `konnecttia.com` (sin datos personales; riesgo bajo).
3. Staging en la UE: Postgres con copia de `easyorder_dev` y migraciones, API, web, worker, n8n
   (flujos de staging), Redis; Chatwoot solo cuando se pruebe el agente. Supabase: URLs de retorno
   del dominio nuevo. Pasa la lista de comprobación → se deja de usar el staging de EE. UU.
4. Producción en la UE: `easyorder_prd`, un n8n y un Chatwoot para todos (ADR 0008), tras quitar
   los restaurantes fijos de los flujos; cambio de webhooks de WhatsApp en una ventana
   planificada. La demo de La Isla no se toca hasta entonces.
5. Cierre: copias, avisos de caída, y apagado del VPS de EE. UU. dos semanas después.

## Pendiente de confirmar

- Dónde está Supabase (Cloud y región, o instalado en el VPS de EE. UU.). Si es Cloud fuera de la
  UE, proyecto nuevo en la región de Fráncfort.
- Centro de datos final (según disponibilidad en la compra).
