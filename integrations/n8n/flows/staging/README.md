# Flujos de n8n para staging

Flujos del agente de WhatsApp para el entorno de **staging** de Konnecttia. Nacieron como copia de
los flujos de producción de La Isla, que siguen en el repositorio privado `cesarsan7/easyorder`
(`docs/n8n/la isla/`, generada con su `scripts/n8n/preparar_staging.py`). Desde el 7/11/2026 los
cambios del agente se hacen aquí, con su PR en `konnecttia`. Diferencias con producción:

- Inactivos al importar.
- **Sin URLs en git** (este repositorio es público): Chatwoot, su número de cuenta y Supabase van
  como marcadores (`__CHATWOOT_URL__`, `__CHATWOOT_CUENTA__`, `__SUPABASE_FUNCIONES_URL__`). La
  copia para importar se genera con `scripts/renderizar.py` y los valores de `.env.staging` (paso 3).
- Credenciales con nombre `staging …` y sin id: nunca se enlazan con las de la demo.
- Se conservan los ids de los flujos: así las llamadas entre subflujos siguen funcionando.

> Regla: nada de staging puede conocer la URL ni la contraseña de la base de datos de la demo
> (`n8nlearning_postgres`, base `restaurante_mvp`).

## 0. Antes de nada: apagar los flujos antiguos de `n8nlearning`

Usan las mismas rutas de webhook (`chatwootnew`, `notificacion-estado-pedido`) y probablemente
una credencial que apunta a la base de la demo. Un *Cron Expirar Pedidos* antiguo activo estaría
tocando pedidos reales.

```bash
N8N=$(docker ps -q -f label=com.docker.swarm.service.name=n8nlearning_n8n)
docker exec "$N8N" n8n export:workflow --all --output=/home/node/.n8n/backup-flujos-antiguos.json
```

Después, en la interfaz de n8n de `n8nlearning`: desactivar **todos** los flujos.

## 1. Base de datos de staging

1. EasyPanel → `n8nlearning` → **+ Service → Postgres**. Nombre `postgres-dev`, base
   `easyorder_dev`, misma versión mayor que `postgres` (17). Producción se renombrará a `easyorder_prd` en la migración a la UE. Sin puerto expuesto.
2. Copiar los datos de la demo (solo lectura sobre producción):

   ```bash
   PROD=$(docker ps -q -f label=com.docker.swarm.service.name=n8nlearning_postgres)
   STG=$(docker ps -q -f label=com.docker.swarm.service.name=n8nlearning_postgres-dev)
   docker exec "$PROD" pg_dump -U postgres -Fc restaurante_mvp > /root/restaurante_mvp.dump
   docker exec -i "$STG" pg_restore -U postgres -d easyorder_dev --no-owner --no-acl < /root/restaurante_mvp.dump
   rm /root/restaurante_mvp.dump
   ```

3. **Neutralizar** lo que podría llegar a clientes reales o a la demo (en `easyorder_dev`):

   ```sql
   -- Conversaciones de Chatwoot de producción: en staging no existen o son de otra persona.
   UPDATE public.pedidos SET chatwoot_conversation_id = NULL;
   -- URLs que apuntan a producción (avisos, webhooks): revisar y cambiar a las de staging.
   SELECT restaurante_id, config_key, config_value
   FROM public.restaurante_config
   WHERE config_value ILIKE '%http%';
   -- p. ej.:
   -- UPDATE public.restaurante_config
   --    SET config_value = '<URL de n8n de staging>/webhook/notificacion-estado-pedido'
   --  WHERE config_key = 'chatwoot_webhook_prod';
   ```

## 2. Credenciales en el n8n de staging

Crear en *Credentials* con estos nombres **exactos**:

| Nombre                              | Tipo        | Valor                                                                 |
| ----------------------------------- | ----------- | --------------------------------------------------------------------- |
| `staging postgres`                  | Postgres    | Host `n8nlearning_postgres-dev`, base `easyorder_dev`       |
| `staging chatwoot`                  | Header Auth | Name `api_access_token`, Value: token de usuario del Chatwoot de staging |
| `staging OpenAI`                    | OpenAI      | Mejor una clave aparte, para separar costes                           |
| `staging redis`                     | Redis       | Host `n8nlearning_redis`                                              |

## 3. Importar los flujos (conservando los ids)

La importación desde la interfaz crea ids nuevos y rompe las llamadas entre subflujos; por eso se
usa la línea de comandos de n8n dentro del contenedor:

Primero se genera la copia con las URLs reales (desde tu PC, en la raíz del repositorio):

```bash
cp integrations/n8n/.env.example integrations/n8n/.env.staging   # la primera vez; rellenar valores
python3 integrations/n8n/scripts/renderizar.py                     # -> integrations/n8n/dist/n8n-staging.tar.gz
scp integrations/n8n/dist/n8n-staging.tar.gz root@<ip-del-vps>:/root/
```

`.env.staging` y `dist/` no se suben a git. Nunca importar los JSON de `flows/staging/` directamente:
llevan los marcadores y las llamadas a Chatwoot fallarían.

```bash
VOL=$(ls -d /etc/easypanel/projects/n8nlearning/n8n/volumes/*/ | head -1)
mkdir -p "$VOL/staging-import" && tar -xzf /root/n8n-staging.tar.gz -C "$VOL/staging-import"
ls "$VOL/staging-import"   # deben aparecer 12 ficheros .json
N8N=$(docker ps -q -f label=com.docker.swarm.service.name=n8nlearning_n8n)
docker exec "$N8N" n8n import:workflow --separate --input=/home/node/.n8n/staging-import
```

Abrir cada flujo y comprobar que cada nodo tiene su credencial `staging …` seleccionada (si alguno
aparece sin credencial, elegirla a mano). Luego activar: primero los subflujos, después
`[MVP] Pizzeria`, `[MVP] Notificacion Estado Pedido` y, al final, `[MVP] Cron Expirar Pedidos`.

## 4. Chatwoot de staging

Bandeja de WhatsApp con el número de pruebas; webhook a `<URL de n8n de staging>/webhook/chatwootnew`.

## 5. Despacho v2: cotización con la API de Konnecttia

Generado con `scripts/despacho_v2.py` (el script explica cada cambio; la v1 queda en el
historial de git). Despacho ya no calcula zona, tarifa, mínimo ni tiempo con SQL propio: llama a
`POST <api>/public/<slug>/cotizacion`, que aplica las mismas reglas que la web (zonas por radio,
código postal o toda la ciudad, tarifa por km, envío gratis, local que reparte, hora punta,
modo ocupado y cola). Sin tiempos fijos en el código y con consultas parametrizadas.

Requisitos en la base de staging (`easyorder_dev`):

```sql
-- URL de la API vista desde n8n (misma red interna de EasyPanel)
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
SELECT id, 'api_konnecttia_url', 'http://n8nlearning_konnecttia-api:3001' FROM public.restaurante
ON CONFLICT (config_key, restaurante_id) DO UPDATE SET config_value = EXCLUDED.config_value;
```

Sin esa clave, Despacho no puede cotizar y deriva a una persona (Respuesta Error Sistema).

Importar `[MVP] Despacho.json` y `[MVP] Pizzeria.json` como en el paso 3 (mismos ids: se
sobrescriben). Comprobar que el nodo nuevo **Datos Restaurante** tiene la credencial
`staging postgres`.

Pruebas por WhatsApp (Siempre Juntos):

| Mensaje | Esperado |
| --- | --- |
| «para recoger» | Pregunta en qué local: Siempre Juntos 2 o Siempre Juntos 1 (si los dos están abiertos) |
| «en el de Huelva» | Recogida en Siempre Juntos 1, con su tiempo; el pedido guarda `sucursal_id` |
| «a domicilio, Calle Real 10» (sin ubicación) | Pide compartir la ubicación (la zona es por radio) |
| Ubicación dentro de 3 km, pedido < 25 € | Mantiene reparto e indica cuánto falta para el mínimo |
| Ubicación dentro de 3 km, pedido ≥ 25 € | Envío 2 €, tiempo de la zona (+ modo ocupado si está activo) |
| Modo ocupado +20 en el panel y repetir | El tiempo que da el agente sube 20 min |

## 6. Director: solo mensajes del cliente

`scripts/director_solo_entrantes.py` añade el nodo **¿Mensaje del cliente?** detrás del
Webhook. Chatwoot avisa también de los mensajes salientes (las respuestas del agente) y de las
notas privadas; sin teléfono de cliente, esas ejecuciones fallaban en «Nuevo usuario».

## Cambios sobre la copia de producción

- **Apertura (6/11/2026):** antes de buscar o crear el pedido, el nodo *Verificar Puede Pedir*
  llama a `fn_restaurante_acepta_pedidos` (prueba gratuita vencida o pendiente, migración 0023) y
  a `fn_telefono_bloqueado` (teléfonos bloqueados por el restaurante, migración 0021). Si no
  puede pedir, *Respuesta No Acepta Pedidos* devuelve al agente un mensaje neutro
  («Ahora mismo no podemos tomar tu pedido por aquí…») sin crear ni tocar pedidos. Los pedidos
  que vienen de la web (`¿Es Ref Web?`) no pasan por este control: la web ya lo aplica.

## Cómo hacer un cambio en el agente

1. Rama propia en `konnecttia` y cambio en `integrations/n8n/flows/staging/` (a mano o con un script
   en `scripts/`, que explique qué cambia y se niegue a aplicarse dos veces).
2. `python3 integrations/n8n/scripts/renderizar.py --comprobar`: no puede quedar ninguna URL
   escrita a mano (toda URL de entorno va como marcador `__NOMBRE__` y en `.env.example`).
3. Si el cambio necesita una migración o un endpoint, va en el mismo PR o encadenado al suyo.
4. Tras fusionar: generar el `.tar.gz`, importar (paso 3) y probar por el WhatsApp de pruebas.
