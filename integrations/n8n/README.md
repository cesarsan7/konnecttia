# integrations/n8n

Flujos de n8n del agente de WhatsApp, versionados **sin secretos ni URLs privadas** (este
repositorio es público).

| Ruta                                                    | Qué es                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flows/staging/`                                        | Flujos del entorno de staging (VPS de la UE, proyecto `staging`, base `restaurante_staging`). Guía: [`flows/staging/README.md`](flows/staging/README.md) |
| `scripts/renderizar.py`                                 | Genera la copia para importar: sustituye los marcadores `__NOMBRE__` con `.env.<entorno>` y crea `dist/n8n-<entorno>.tar.gz`                             |
| `scripts/*_v2.py`, `scripts/director_solo_entrantes.py` | Cambios ya aplicados a `flows/staging/` (historial; se niegan a aplicarse dos veces)                                                                     |
| `.env.example`                                          | Marcadores que existen y qué valor llevan. Copiar a `.env.staging` (ignorado por git)                                                                    |
| `diseno/`                                               | Diseños pendientes de construir (p. ej. [adaptador de canal con Kapso](diseno/adaptador-canal-kapso.md))                                                 |

Desde el 7/11/2026 el agente de staging se cambia **aquí**, con un PR en `konnecttia`, junto a la
API y las migraciones de las que depende. La demo comercial de La Isla (producción) sigue en el
repositorio privado `cesarsan7/easyorder` (`docs/n8n/la isla/`) y no se toca desde aquí.

Reglas:

- Ninguna URL de entorno escrita en un flujo: va como marcador y en `.env.example`.
  `python3 integrations/n8n/scripts/renderizar.py --comprobar` lo revisa.
- Credenciales solo por nombre (`staging postgres`, `staging chatwoot`…), nunca con id ni valor.
- Sin `pinData` (datos de ejecuciones de prueba, pueden contener teléfonos reales).

Pendiente para producción (fase 4, en la migración a la UE):

- webhooks autenticados por cabecera (`N8N_WEBHOOK_SECRET`);
- `restaurante_id` explícito en todas las llamadas SQL;
- llamadas a la API de Konnecttia en lugar de escribir en la base de datos (Despacho ya lo hace).
