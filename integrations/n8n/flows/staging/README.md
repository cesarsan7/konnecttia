# Flujos de n8n para staging (VPS de la UE)

Flujos del agente de WhatsApp para el entorno de **staging** de Konnecttia, en el VPS de la UE
(Düsseldorf, EasyPanel, proyecto `staging`). Nacieron como copia de los flujos de producción de
La Isla, que siguen en el repositorio privado `cesarsan7/easyorder` (`docs/n8n/la isla/`) y no se
tocan desde aquí. Diferencias con producción:

- Inactivos al importar.
- **Sin URLs en git** (este repositorio es público): Chatwoot, su número de cuenta y Supabase van
  como marcadores (`__CHATWOOT_URL__`, `__CHATWOOT_CUENTA__`, `__SUPABASE_FUNCIONES_URL__`). La
  copia para importar se genera con `scripts/renderizar.py` y los valores de `.env.staging` (paso 4).
- Credenciales con nombre `staging …` y sin id: nunca se enlazan con las de la demo.
- Se conservan los ids de los flujos: así las llamadas entre subflujos siguen funcionando.

> Regla: nada de staging puede conocer la URL ni la contraseña de la base de la demo de La Isla
> (VPS antiguo, base `restaurante_mvp`).

## 0. Qué hay en el proyecto `staging`

Los servicios se ven entre sí por la red interna `easypanel-staging` con el nombre
`staging_<servicio>` (formato de EasyPanel `<proyecto>_<servicio>`).

| Servicio de EasyPanel | Host interno                | Uso para el agente                                       |
| --------------------- | --------------------------- | -------------------------------------------------------- |
| `postgres-staging`    | `staging_postgres-staging`  | Base `restaurante_staging` (puerto 5432)                  |
| `konnecttia-api`      | `staging_konnecttia-api`    | API, puerto **3001** (`/health`); Despacho cotiza aquí    |
| `konnecttia-worker`   | —                           | Avisos por email; no interviene en el agente             |
| `n8n`                 | `staging_n8n`               | Se crea en el paso 1                                     |
| `redis`               | `staging_redis`             | Se crea en el paso 1 (buffer de mensajes del Director)   |
| Canal de WhatsApp     | —                           | Pendiente de decidir: Chatwoot o Kapso (paso 5)          |

Comprobar que n8n verá la API (debe responder `{"ok":true}`):

```bash
docker run --rm --network easypanel-staging curlimages/curl:8.10.1 -s http://staging_konnecttia-api:3001/health
```

## 1. n8n en EasyPanel (hecho el 13/11/2026)

n8n está en `https://n8n.staging.konnecttia.com` (host interno `staging_n8n`, puerto 5678). **No hace
falta Redis** (el buffer de mensajes lo hace Kapso, ADR 0012) **ni Chatwoot**. Variables del servicio
(en EasyPanel, nunca en el repositorio): las de la plantilla más

- `N8N_ENCRYPTION_KEY`: definirla **antes del primer Deploy** (si n8n arranca sin ella genera una
  propia en el volumen y luego da «Mismatching encryption keys»);
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto`: firma de los webhooks de Kapso;
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` y `KAPSO_WEBHOOK_SECRET=<secreto del webhook de Kapso>`: el
  flujo «[Canal] Entrada Kapso» lee el secreto con `$env` (n8n lo bloquea por defecto). Alternativa
  si no se quiere abrir `$env`: guardar el secreto en una credencial y verificar con un nodo propio.

Nodo de comunidad `@kapso/n8n-nodes-kapso` instalado desde _Settings → Community nodes_.

## 2. Base de datos: rol de n8n y configuración del restaurante

n8n entra con un rol propio, no con `postgres` ni con el de la API, para poder auditarlo y
revocarlo por separado. La contraseña se escribe por teclado y no queda en el historial.

```bash
C=$(docker ps --format '{{.Names}}' | grep -i 'staging.*postgres' | head -n1); echo "$C"
docker exec -i "$C" psql -U postgres -d restaurante_staging -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE n8n_agente LOGIN;
GRANT CONNECT ON DATABASE restaurante_staging TO n8n_agente;
GRANT USAGE ON SCHEMA public TO n8n_agente;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO n8n_agente;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO n8n_agente;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO n8n_agente;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO n8n_agente;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO n8n_agente;
SQL
docker exec -it "$C" psql -U postgres -d restaurante_staging -c '\password n8n_agente'
```

Configuración que leen los flujos (por restaurante, en `restaurante_config`):

| Clave                  | Valor en staging                      | Si falta                                              |
| ---------------------- | ------------------------------------- | ----------------------------------------------------- |
| `api_konnecttia_url`   | `http://staging_konnecttia-api:3001`  | Despacho no puede cotizar y deriva a una persona      |
| `cart_expiry_minutes`  | `30` (regla de negocio)               | Los flujos usan 60: el carrito caduca tarde           |
| `cart_warning_minutes` | `5`                                   | El aviso de carrito sale a destiempo                  |

```bash
C=$(docker ps --format '{{.Names}}' | grep -i 'staging.*postgres' | head -n1); echo "$C"
docker exec -i "$C" psql -U postgres -d restaurante_staging -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
SELECT id, 'api_konnecttia_url', 'http://staging_konnecttia-api:3001' FROM public.restaurante
ON CONFLICT (config_key, restaurante_id) DO UPDATE SET config_value = EXCLUDED.config_value;
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
SELECT r.id, v.k, v.v FROM public.restaurante r
CROSS JOIN (VALUES ('cart_expiry_minutes', '30'), ('cart_warning_minutes', '5')) AS v(k, v)
ON CONFLICT (config_key, restaurante_id) DO NOTHING;
SELECT restaurante_id, config_key, config_value FROM public.restaurante_config
WHERE config_key IN ('api_konnecttia_url', 'cart_expiry_minutes', 'cart_warning_minutes')
ORDER BY restaurante_id, config_key;
SQL
```

## 3. Credenciales en el n8n de staging

Crear en _Credentials_ con estos nombres **exactos** (los flujos nuevos los usan tal cual):

| Nombre             | Tipo        | Valor                                                                          |
| ------------------ | ----------- | ------------------------------------------------------------------------------ |
| `staging_postgres` | Postgres    | Host `staging_postgres-staging`, puerto 5432, base `restaurante_staging`, usuario `n8n_agente` |
| `staging_kapso`    | Kapso API   | Clave de la API de Kapso (la lleva la cabecera `X-API-Key`); base `https://api.kapso.ai`   |
| `staging_openai`   | OpenAI      | Mejor una clave aparte, para separar costes                                    |

Los flujos copiados de La Isla todavía usan los nombres antiguos (`staging postgres`,
`staging OpenAI`, `staging redis`, `staging chatwoot`): el PR que conecta el Director al canal
los pasa a esta convención. Hasta entonces, elegir la credencial a mano en esos nodos.

## 4. Generar la copia e importar (conservando los ids)

La importación desde la interfaz crea ids nuevos y rompe las llamadas entre subflujos; por eso se
usa la línea de comandos de n8n dentro del contenedor.

En tu PC, en la raíz del repositorio:

```bash
cp integrations/n8n/.env.example integrations/n8n/.env.staging   # la primera vez; rellenar valores
python3 integrations/n8n/scripts/renderizar.py                     # -> integrations/n8n/dist/n8n-staging.tar.gz
scp integrations/n8n/dist/n8n-staging.tar.gz root@<servidor-ue>:/root/
```

`.env.staging` y `dist/` no se suben a git. Nunca importar los JSON de `flows/staging/` directamente:
llevan los marcadores y las llamadas a Chatwoot fallarían.

En el servidor de la UE:

```bash
VOL=$(ls -d /etc/easypanel/projects/staging/n8n/volumes/*/ | head -1); echo "$VOL"
mkdir -p "$VOL/staging-import" && tar -xzf /root/n8n-staging.tar.gz -C "$VOL/staging-import"
ls "$VOL/staging-import"   # deben aparecer 12 ficheros .json
N8N=$(docker ps -q -f label=com.docker.swarm.service.name=staging_n8n); echo "$N8N"
docker exec "$N8N" n8n import:workflow --separate --input=/home/node/.n8n/staging-import
```

Si `VOL` sale vacío, mirar el nombre real de la carpeta con
`ls /etc/easypanel/projects/staging/n8n/volumes/` (la plantilla de EasyPanel puede montar el
volumen con otro nombre); la carpeta montada en `/home/node/.n8n` es la buena.

Abrir cada flujo y comprobar que cada nodo tiene su credencial `staging …` seleccionada (si alguno
aparece sin credencial, elegirla a mano). Luego activar: primero los subflujos, después
`[MVP] Pizzeria`, `[MVP] Notificacion Estado Pedido` y, al final, `[MVP] Cron Expirar Pedidos`.

## 5. Canal de WhatsApp: Kapso

Diseño: [`../../diseno/adaptador-canal-kapso.md`](../../diseno/adaptador-canal-kapso.md). Flujos
`[Canal] Entrada Kapso` y `[Canal] Enviar mensaje` (generados por `scripts/canal_kapso.py`).

1. Publicar los flujos: `python3 integrations/n8n/scripts/publicar.py "[Canal] Enviar mensaje" "[Canal] Entrada Kapso"`
   (necesita `N8N_URL` y `N8N_API_KEY`; los ids de las credenciales van en `.env.staging` como
   `CRED_staging_postgres=<id>` y `CRED_staging_kapso=<id>`, ver `.env.example`). Sin ids, abrir cada
   flujo y elegir la credencial en los nodos que la piden.
2. Activar `[Canal] Entrada Kapso`. Su URL de producción es `<URL de n8n>/webhook/kapso-entrada`.
3. En Kapso, en el número (sandbox o real) → _Webhooks_ → nuevo webhook de tipo Kapso, formato v2, eventos
   `whatsapp.message.received` y `whatsapp.message.sent`, con esa URL. Copiar el secreto a la variable
   `KAPSO_WEBHOOK_SECRET` del servicio n8n y redesplegar.
4. En la base, el número en `canal_whatsapp` y los módulos `whatsapp.channel` / `whatsapp.agent` del
   restaurante, más `agente_activo = true` (ver el diseño, sección 6).
5. Escribir al número: el flujo responde «Soy el agente de pedidos del restaurante …» (respuesta de
   prueba del canal; el Director se conecta en el siguiente PR).

## 6. Despacho v2: cotización con la API de Konnecttia

Generado con `scripts/despacho_v2.py` (el script explica cada cambio; la v1 queda en el
historial de git). Despacho ya no calcula zona, tarifa, mínimo ni tiempo con SQL propio: llama a
`POST <api>/public/<slug>/cotizacion`, que aplica las mismas reglas que la web (zonas por radio,
código postal o toda la ciudad, tarifa por km, envío gratis, local que reparte, hora punta,
modo ocupado y cola). Sin tiempos fijos en el código y con consultas parametrizadas. Necesita
`api_konnecttia_url` (paso 2).

Pruebas por WhatsApp con Siempre Juntos (en la UE: `restaurante_id = 1`; reparte solo
«Siempre Juntos 2», una zona activa; pago en efectivo o tarjeta). Comprobar antes los datos de la
zona en el panel, porque la tarifa y el mínimo pueden no coincidir con los del staging antiguo:

| Mensaje                                       | Esperado                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| «para recoger»                                | Pregunta en qué local: Siempre Juntos 2 o Siempre Juntos 1 (si están abiertos) |
| «en el de Huelva»                             | Recogida en Siempre Juntos 1; el pedido guarda `sucursal_id`               |
| «a domicilio, Calle Real 10» (sin ubicación)  | Pide compartir la ubicación (la zona es por radio)                        |
| Ubicación dentro de la zona, pedido < mínimo  | Mantiene reparto e indica cuánto falta para el mínimo                      |
| Ubicación dentro de la zona, pedido ≥ mínimo  | Envío y tiempo de la zona (+ modo ocupado si está activo)                  |
| Ubicación fuera de la zona                    | «Fuera de nuestra zona de reparto», ofrece otra dirección o recogida       |
| Modo ocupado +20 en el tablero y repetir      | El tiempo que da el agente sube 20 min (dura 60 min: probar enseguida)     |

## 7. Director: solo mensajes del cliente

`scripts/director_solo_entrantes.py` añade el nodo **¿Mensaje del cliente?** detrás del
Webhook. Chatwoot avisa también de los mensajes salientes (las respuestas del agente) y de las
notas privadas; sin teléfono de cliente, esas ejecuciones fallaban en «Nuevo usuario».

## Cambios sobre la copia de producción

- **Apertura (6/11/2026):** antes de buscar o crear el pedido, el nodo _Verificar Puede Pedir_
  llama a `fn_restaurante_acepta_pedidos` (prueba gratuita vencida o pendiente, migración 0023) y
  a `fn_telefono_bloqueado` (teléfonos bloqueados por el restaurante, migración 0021). Si no
  puede pedir, _Respuesta No Acepta Pedidos_ devuelve al agente un mensaje neutro
  («Ahora mismo no podemos tomar tu pedido por aquí…») sin crear ni tocar pedidos. Los pedidos
  que vienen de la web (`¿Es Ref Web?`) no pasan por este control: la web ya lo aplica.
- **Despacho (7/11/2026):** respuesta propia para `fuera_de_cobertura`, `local_no_disponible` y
  cualquier motivo nuevo de la cotización, sin volver a pedir la dirección.

## Staging antiguo (`n8nlearning`, VPS de EE. UU.)

Sustituido por el de la UE. Sus flujos usan las mismas rutas de webhook pero en otro host, así que
no chocan; conviene desactivarlos para que su _Cron Expirar Pedidos_ no siga corriendo sobre
`easyorder_dev`.

## Cómo hacer un cambio en el agente

1. Rama propia en `konnecttia` y cambio en `integrations/n8n/flows/staging/` (a mano o con un script
   en `scripts/`, que explique qué cambia y se niegue a aplicarse dos veces).
2. `python3 integrations/n8n/scripts/renderizar.py --comprobar`: no puede quedar ninguna URL
   escrita a mano (toda URL de entorno va como marcador `__NOMBRE__` y en `.env.example`).
3. Si el cambio necesita una migración o un endpoint, va en el mismo PR o encadenado al suyo.
4. Tras fusionar: generar el `.tar.gz`, importar (paso 4) y probar por el WhatsApp de pruebas.
