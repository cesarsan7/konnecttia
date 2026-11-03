# ADR 0008 — Entornos: producción, staging y local

- Estado: aceptada (2026-11-03)

## Contexto

En el VPS hay dos proyectos de EasyPanel que comparten la base de datos, la API y la web:

| Proyecto      | Servicios                                                                                                                              | Uso real hoy                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `la_isla`     | n8n, Chatwoot (+ db, redis, sidekiq), redis                                                                                            | **Demo comercial de La Isla.** Flujos buenos en `docs/n8n/la isla/` (repo easyorder) |
| `n8nlearning` | **postgres (`restaurante_mvp`, datos de La Isla)**, easyorder-api, easyorder-web, n8n, Chatwoot, redis, web ai2nomous, qdrant (parado) | Mezcla: la base, la API y la web son de la demo; n8n y Chatwoot son de aprendizaje   |

Una prueba hecha en `n8nlearning` puede escribir sobre los datos de la demo, y la demo es la
herramienta comercial: no se puede romper.

## Decisión

### Hoy (VPS actual)

1. **La demo de La Isla queda congelada.** No se tocan el proyecto `la_isla` ni, en
   `n8nlearning`, los servicios `postgres`, `easyorder-api` y `easyorder-web`. Solo se aceptan
   cambios de seguridad pequeños y reversibles, probados antes en staging y aplicados en horario
   sin visitas.
2. **Staging se monta en `n8nlearning` con datos propios:**

   | Servicio                   | Qué es                                                                   |
   | -------------------------- | ------------------------------------------------------------------------ |
   | `postgres-staging` (nuevo) | Copia de `restaurante_mvp` + migraciones 0001–0003 de Konnecttia         |
   | `konnecttia-api` (nuevo)   | `apps/api` del monorepo, rama `main`, contra `postgres-staging`          |
   | `n8n` (reutilizado)        | Copia de los flujos de `la_isla`, con credenciales que apuntan a staging |
   | `chatwoot` (reutilizado)   | Bandeja de pruebas con un número de WhatsApp de pruebas                  |

   Ningún servicio de staging conoce la contraseña ni la URL de la base de la demo.
3. Los flujos buenos son los de `la_isla`. Antes de copiarlos se **exportan desde la instancia**
   (no desde el repo: en la copia del repo, `[MVP] Pizzeria` llama a Despacho y a Derivar Humano
   con IDs que no coinciden con los ficheros) y se guardan en git.

### En la migración a la UE

Se crean dos proyectos limpios, con dominios propios (`*.konnecttia.com`) para no depender de los
dominios por defecto de EasyPanel:

|                     | `prod`                                                             | `staging`                               |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| Base de datos       | `restaurante`                                                      | `restaurante_staging` (servicio propio) |
| n8n                 | **Uno para todos los restaurantes**                                | Uno, con los flujos en prueba           |
| Chatwoot            | **Uno, una cuenta por restaurante** (se unifican los dos actuales) | Encendido solo para probar el agente    |
| API / web / landing | Rama `main` aprobada                                               | Cada cambio fusionado                   |
| WhatsApp            | Números de los restaurantes                                        | Número de pruebas                       |

### Un solo n8n y un solo Chatwoot

- Chatwoot: una cuenta por restaurante; todas envían el webhook al mismo n8n.
- n8n: un único juego de flujos. El restaurante se identifica por la bandeja (`inbox_id` →
  `restaurante_config.chatwoot_inbox_id`) y, con Kapso, por el número. Lo que cambia por cliente
  vive en la base de datos, no en copias del flujo.
- Requisitos previos (pendientes ya conocidos): quitar los `|| 1` / `|| 11` y `restaurante_id`
  fijos de los flujos, separar `n8n_chat_histories` por restaurante y dar `restaurante_id` a las
  funciones SQL antiguas.

### Cómo pasa un cambio a producción

1. Pull request con CI en verde, **siempre contra `main`** (no encadenar PR sobre ramas de otros PR).
2. Despliegue en staging y prueba (web, panel y, si aplica, WhatsApp de pruebas).
3. Producción. Las migraciones se aplican siempre primero en staging. Los flujos de n8n se
   versionan como JSON en git (exportación por script, ya que n8n Community no trae git).

## Consecuencias

- Más servicios en el VPS: vigilar memoria (8 GB, ~66 % en uso). El Chatwoot de staging se apaga
  cuando no se usa.
- La unificación de Chatwoot y n8n de producción se hace en la migración a la UE, con una ventana
  planificada, para no tocar la demo antes.
- Pendiente de aclarar: el nodo «noti lovable» de `[MVP] Derivar Humano` envía el teléfono del
  cliente y el texto de su reclamación a otro proyecto de Supabase (`srqnl…supabase.co`), distinto
  del de EasyOrder. Si ya no se usa, quitarlo; si se usa, debe figurar como encargado del
  tratamiento.
