# @konnecttia/db

Migraciones SQL de la base de datos compartida por la API, el worker y los flujos de n8n.

## Carpetas

| Carpeta       | Contenido                                                                  | ¿Se aplica sola?                                 |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `migrations/` | Migraciones numeradas. Se aplican en orden con `infra/scripts/migrate.sh`. | Sí                                               |
| `proposed/`   | Cambios que requieren comprobar producción antes (datos o flujos de n8n).  | No: se mueven a `migrations/` cuando se aprueban |
| `checks/`     | Consultas de solo lectura para revisar producción antes de una propuesta.  | No                                               |
| `test/`       | Datos sintéticos, comprobaciones SQL y prueba de sincronía del catálogo.   | —                                                |

## Estado

| Migración                                          | Qué hace                                                                                                                                               | Riesgo                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `0000_baseline.sql`                                | Esquema actual de EasyOrder (M-1…M-31). En producción ya está aplicado.                                                                                | Ninguno                                     |
| `0001_access_modules_rbac.sql`                     | Módulos por restaurante, planes, permisos, roles, auditoría inmutable. Los restaurantes actuales pasan al plan premium y cada miembro conserva su rol. | Bajo: solo añade                            |
| `0002_orders_tracking_outbox.sql`                  | `tracking_token` aleatorio, `idempotency_key` y tabla `outbox_evento`.                                                                                 | Bajo: solo añade                            |
| `0003_sucursales.sql`                              | Locales por restaurante (`sucursal`), `sucursal_id` en pedidos, zonas, mesas y meseros (principal por defecto). Ver ADR 0007.                          | Bajo: solo añade; rellena `pedidos` una vez |
| `proposed/0100_tenant_not_null.sql`                | `restaurante_id NOT NULL` en 9 tablas. Falla si hay filas huérfanas.                                                                                   | Medio                                       |
| `proposed/0101_drop_legacy_function_overloads.sql` | Borra versiones antiguas de funciones sin `restaurante_id`.                                                                                            | Medio                                       |

## Uso

### Desde el VPS (EasyPanel), sin instalar nada

```bash
curl -fsSL https://raw.githubusercontent.com/cesarsan7/konnecttia/main/infra/scripts/migrate-easypanel.sh -o /root/migrate-easypanel.sh
# 1. Prueba: aplica todo dentro de una transacción y lo deshace. No cambia nada.
bash /root/migrate-easypanel.sh n8nlearning_postgres-dev easyorder_dev --baseline --check
# 2. Aplicación real (cada migración y su registro, en una transacción).
bash /root/migrate-easypanel.sh n8nlearning_postgres-dev easyorder_dev --baseline
```

El script pide la contraseña por teclado y se niega a tocar un host que no termine en `-dev`
salvo que se indique `--produccion`.

### En local o en CI

```bash
# Base que ya es EasyOrder (producción o una copia para staging):
DATABASE_URL=... infra/scripts/migrate.sh --baseline

# Base vacía:
DATABASE_URL=... infra/scripts/migrate.sh

# Probar todo en un servidor de pruebas (crea y borra una base temporal):
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres pnpm db:test
```

Antes de aplicar en producción: copia de seguridad, prueba en staging y ejecutar
`checks/null_tenant_report.sql` si toca una propuesta.

## Reglas

- Nunca editar una migración ya aplicada; crear una nueva.
- Cada migración empieza con: componente, qué reutiliza, riesgo y fase.
- Migraciones compatibles con el código y los flujos de n8n que están en producción.
- El catálogo de acceso se define en `packages/access/src` y se siembra en SQL; `pnpm test`
  falla si ambos no coinciden.
