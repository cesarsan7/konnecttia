# Prueba del agente de WhatsApp con Arepa's Factory (staging UE)

- Fecha: 17/11/2026 · Entorno: staging de la UE · Restaurante: Arepa's Factory (`restaurante_id = 2`, slug `arepas-factory`)
- Decisión del promotor: **opción A**, pasar el sandbox de Kapso de Siempre Juntos (id 1) a Arepa's Factory, de forma reversible.
- Componente: configuración de datos de staging (sin código nuevo en el agente). Reutiliza `canal_whatsapp` (0038),
  los flujos ya publicados y la API `/agente`. Tablas que toca: `canal_whatsapp`, `restaurante_modulo`,
  `restaurante_config` y, solo si se prueba transferencia, `restaurante` (`payment_methods`, `datos_bancarios`).
  Riesgo: bajo (staging; nada se borra; vuelta atrás en la sección 3). MVP.

## 0. Estado real comprobado (17/11/2026, 04:00 UTC)

Comprobado contra la API y n8n de staging (lectura). **La base no es accesible desde esta sesión**: lo que
depende de tablas internas va como consulta de solo lectura en la sección 2 para ejecutarla en DBeaver.

| Qué                                   | Resultado                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR fusionados desde el #124           | Hasta el #160 (`f3ea974`: carta de solo lectura en `/<slug>/carta` y `carta_url` del agente). Migraciones en el repositorio: hasta la **0049**                |
| Migraciones aplicadas en staging      | Sin acceso a `schema_migrations`: ver consulta 2.0. Indicio positivo: la API de staging usa 0046 (plantilla), 0047/0048 (avisos) y el agente responde con ellas |
| n8n staging                           | 17 flujos; **todos activos salvo `[MVP] Pizzeria`** (legado de Chatwoot, inactivo: correcto). `[Agente] Director`, `Llamar API`, `Mantenimiento`, `[Canal] Entrada Kapso` y `Enviar mensaje` publicados y activos hoy entre las 02:36 y las 03:41 UTC |
| Ejecuciones reales                    | El agente funciona de punta a punta con Siempre Juntos: ejecución #918 (pedido confirmado `261117-1001`), webhook firmado y verificado, aviso de estado enviado |
| Kapso                                 | 1 número: sandbox `597907523413541` (`Sandbox WhatsApp`), 1 webhook activo a `…/webhook/kapso-entrada`, eventos `message.received` y `message.sent`, formato v2 |
| `canal_whatsapp` hoy                  | `canal_id = 1` → `restaurante_id = 1` (Siempre Juntos), sin local fijo (`sucursal_id` nulo). Visto en la ejecución #918 (`restaurante_id=1`, `canal_id=1`)         |
| Único teléfono que puede escribir     | El de pruebas del sandbox (`+16314662990` en las ejecuciones). Un sandbox solo admite a ese teléfono                                                          |
| Arepa's Factory en la API pública     | `/public/arepas-factory/{locales,zonas,menu,cotizacion}` responden 200: 1 local (id 3), 1 zona, 13 categorías y 76 productos                                |
| Web de la carta                       | `https://app.staging.konnecttia.com/arepas-factory/carta` → 200. (`panel.eu.konnecttia.com` no resuelve desde esta sesión; los documentos comerciales lo citan)  |

**El webhook de Kapso no hay que tocarlo**: es el mismo número y la misma URL. Reasignar el canal es solo un cambio en la base.

## 1. Checklist de lo que le falta a Arepa's Factory

Leyenda: ✅ comprobado por la API · ⚠️ hallazgo · ❓ hay que mirarlo en la base (consulta de la sección 2) · ⛔ falta seguro.

| #  | Requisito del agente                                               | Estado | Detalle                                                                                                                                                                                                                               |
| -- | ------------------------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Restaurante activo y acepta pedidos                                |   ✅   | `acepta_pedidos: true` (prueba gratuita no vencida; la API lo evalúa con `fn_restaurante_acepta_pedidos`)                                                                                                                              |
| 2  | Carta                                                              |   ✅   | 13 categorías, 76 productos con variante y extras. **Ningún producto tiene alérgenos declarados** (`not_declared`): el agente solo dará la nota de alérgenos con el enlace de la carta (regla 12), no «sin alérgenos». Correcto para la prueba |
| 3  | Locales                                                            |   ✅   | 1 local: «Arepa's Factory» (id 3), Calle Polca 16, recogida sí, reparto sí, principal                                                                                                                                                  |
| 4  | Horario                                                            |   ⚠️   | **A las 04:00 la API dice `abierto: true`, pero el seed define 08:00–23:00.** Algo fuerza la apertura: `is_open_override = 'true'`, `sucursal.forzar_abierto` o un horario distinto. Para probar «local cerrado» hay que averiguarlo (consulta 2.3) |
| 5  | Reparto: zona                                                      |   ✅   | 1 zona «Arrecife (5 km desde Calle Polca)»: radio 5 km, tarifa fija 2,00 €, mínimo 30,00 €, 30 min. Cotizado con la API: punto a 2,7 km → envío 2 € / mínimo 30; punto en Puerto del Carmen → `fuera_de_cobertura`; sin ubicación → `ubicacion_necesaria` |
| 6  | Recogida                                                           |   ✅   | Cotización de recogida OK: 30 min, sin envío ni mínimo                                                                                                                                                                                 |
| 7  | Pago                                                               |   ⚠️   | Métodos activos: **efectivo y tarjeta**. Para probar «transferencia → pendiente de pago» hay que activarla y cargar `datos_bancarios` (SQL 4.2, datos ficticios de prueba)                                                              |
| 8  | Módulos `whatsapp.channel` y `whatsapp.agent`                      |   ⛔   | El plan premium del seed **no** los incluye (son `addon`). Sin ellos la API responde 403 `modulo_agente_inactivo` y «[Canal] Entrada Kapso» no responde. Alta en `/interno` o con el SQL 4.1 (origen `cortesia`)                       |
| 9  | `agente_activo = 'true'` en `restaurante_config`                   |   ⛔   | **No se hereda de la plantilla** (0046) y «[Canal] Entrada Kapso» lo lee directamente de `restaurante_config`. Debe existir la fila propia                                                                                              |
| 10 | `api_konnecttia_url`                                               |   ❓   | `http://staging_konnecttia-api:3001`. La necesita Despacho (flujos antiguos) y el README la pide por restaurante; el Director nuevo usa `API_KONNECTTIA_URL` del entorno                                                                  |
| 11 | `cart_expiry_minutes = 30`, `cart_warning_minutes = 5`             |   ❓   | La API los hereda de la plantilla estándar (30 y 5). Los flujos de n8n que leen `restaurante_config` directamente necesitan fila propia: el SQL 4.1 las crea sin pisar                                                                   |
| 12 | `agente_pausa_minutos`                                             |   ❓   | Sin valor, no hay pausa cuando escribe el personal. Siempre Juntos tiene 60. El SQL 4.1 pone 60                                                                                                                                         |
| 13 | `agente_tono`, `agente_nota_alergenos`, `agente_pausa_derivar_minutos` |  ✅  | Vienen de la plantilla estándar: tono `cercano`, nota con `{carta_url}` y 120 min                                                                                                                                                       |
| 14 | `agente_nombre_visible`                                            |   ✅   | Vacío a propósito: la presentación sale «Soy el agente de pedidos del restaurante Arepa's Factory»                                                                                                                                      |
| 15 | `agente_derivar_email`                                             |   ❓   | Vacío = correo del propietario. Para ver el aviso de derivación, el propietario de Arepa's debe tener correo (consulta 2.5)                                                                                                              |
| 16 | `canal_whatsapp` apuntando a Arepa's                               |   ⛔   | Hoy apunta a Siempre Juntos. SQL 3.1                                                                                                                                                                                                   |
| 17 | Credenciales de n8n (`staging_postgres`, `staging_kapso`, `staging_openai`, `staging_agente_api`) | ✅ | Ya funcionan: las ejecuciones de hoy llegan a Kapso, a la API y a OpenAI                                                                                                                                                              |
| 18 | `AGENTE_API_SECRET`, `KAPSO_WEBHOOK_SECRET`                        |   ✅   | En uso (firma verificada en la ejecución #922)                                                                                                                                                                                        |

## 2. Consultas de comprobación (solo lectura, DBeaver)

Cualquier usuario sirve (`cesar_escritura` o solo lectura). Pegar el resultado en la conversación.

```sql
-- 2.0 Migraciones aplicadas (última debe ser la 0049)
SELECT * FROM public.schema_migrations ORDER BY 1 DESC LIMIT 5;  -- si la tabla tiene otro nombre: \dt *migra*

-- 2.1 Canal actual y su actividad (qué se mueve y qué cuelga del canal)
SELECT id, restaurante_id, sucursal_id, phone_number_id, numero_e164, modo_conexion, estado
FROM   public.canal_whatsapp ORDER BY id;
SELECT 'conversaciones' AS tabla, count(*) FROM public.whatsapp_conversacion WHERE canal_id = 1
UNION ALL SELECT 'carritos', count(*) FROM public.agente_carrito WHERE canal_id = 1;

-- 2.2 Módulos y configuración de Arepa's (restaurante 2)
SELECT modulo_code, estado, origen FROM public.restaurante_modulo WHERE restaurante_id = 2 ORDER BY 1;
SELECT config_key, config_value FROM public.restaurante_config WHERE restaurante_id = 2 ORDER BY 1;

-- 2.3 Por qué está «abierto» a las 4 de la mañana
SELECT config_key, config_value FROM public.restaurante_config
 WHERE restaurante_id = 2 AND config_key LIKE 'is_open_override%';
SELECT id, nombre, activo, forzar_abierto FROM public.sucursal WHERE restaurante_id = 2;
SELECT dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2 FROM public.horarios WHERE restaurante_id = 2;
SELECT * FROM public.festivo WHERE restaurante_id = 2 AND fecha >= current_date - 2;

-- 2.4 Pago y datos bancarios (no copiar el IBAN real a ningún sitio)
SELECT payment_methods, metodos_pago_permitidos, (datos_bancarios IS NOT NULL) AS tiene_datos_bancarios
FROM   public.restaurante WHERE id = 2;

-- 2.5 Quién recibe el aviso de derivación
SELECT m.email, m.rol FROM public.local_memberships m WHERE m.restaurante_id = 2;
```

## 3. Reasignar el canal (y volver atrás)

Idea: **no se mueve la fila del canal, se crea otra**. `whatsapp_conversacion` y `agente_carrito` cuelgan de
`(canal_id, restaurante_id)` con clave foránea sin `ON UPDATE CASCADE`: un `UPDATE restaurante_id` falla en cuanto
hay una conversación, y borrar sería perder el historial de Siempre Juntos. Con esta forma, el canal 1 queda
intacto (desconectado) con todo su historial y Arepa's empieza con un canal nuevo y limpio. `UNIQUE (proveedor,
phone_number_id)` obliga a «apartar» el número del canal viejo antes; todo va en una transacción.

Ejecutar como `cesar_escritura`; si falla por permisos (`INSERT` o secuencia de `canal_whatsapp`), como `postgres`.
**Antes, ejecutar la sección 4.1** (módulos y claves): si el canal se activa sin módulo, el agente calla.

### 3.1 Pasar el sandbox a Arepa's Factory

```sql
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.canal_whatsapp
                 WHERE id = 1 AND restaurante_id = 1 AND proveedor = 'kapso'
                   AND phone_number_id = '597907523413541' AND estado = 'activo') THEN
    RAISE EXCEPTION 'El canal 1 no está como se esperaba (¿ya reasignado?): no se toca nada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurante WHERE id = 2 AND slug = 'arepas-factory') THEN
    RAISE EXCEPTION 'El restaurante 2 no es arepas-factory';
  END IF;
END $$;

-- 1) Apartar el canal de Siempre Juntos (queda con su historial; no recibe nada).
UPDATE public.canal_whatsapp
SET    phone_number_id = phone_number_id || '#r1', estado = 'desconectado', updated_at = now()
WHERE  id = 1;

-- 2) Canal de Arepa's: mismo número, mismo modo, número general (sin local fijo; Arepa's tiene uno solo).
INSERT INTO public.canal_whatsapp
  (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion,
   cliente_proveedor_id, estado)
SELECT 2, NULL, proveedor, '597907523413541', numero_e164, modo_conexion, cliente_proveedor_id, 'activo'
FROM   public.canal_whatsapp WHERE id = 1;

SELECT id, restaurante_id, phone_number_id, estado FROM public.canal_whatsapp ORDER BY id;
COMMIT;
```

Resultado esperado: el canal 1 con `…#r1` y `desconectado`, y un canal nuevo (`id` ≥ 2) con `restaurante_id = 2`,
`estado = activo`. Apuntar ese `id` (lo llamo `<N>` abajo): sale en los informes de n8n como `canal_id`.

### 3.2 Vuelta atrás: devolver el sandbox a Siempre Juntos

```sql
BEGIN;
-- Apartar el canal de Arepa's (conserva sus conversaciones y carritos).
UPDATE public.canal_whatsapp
SET    phone_number_id = phone_number_id || '#r2', estado = 'desconectado', updated_at = now()
WHERE  restaurante_id = 2 AND phone_number_id = '597907523413541' AND estado = 'activo';

-- Reactivar el de Siempre Juntos.
UPDATE public.canal_whatsapp
SET    phone_number_id = '597907523413541', estado = 'activo', updated_at = now()
WHERE  id = 1 AND phone_number_id = '597907523413541#r1';

SELECT id, restaurante_id, phone_number_id, estado FROM public.canal_whatsapp ORDER BY id;
COMMIT;
```

Para volver a pasarlo a Arepa's después, no repetir 3.1: reactivar el canal apartado
(`UPDATE … SET phone_number_id = '597907523413541', estado = 'activo' WHERE id = <N>`, tras apartar el de Siempre
Juntos igual que arriba). La vuelta atrás no deshace los datos de la sección 4: no estorban a Siempre Juntos.

## 4. Datos de Arepa's Factory

### 4.1 Módulos y claves del agente (obligatorio)

```sql
BEGIN;
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
VALUES (2, 'whatsapp.channel', 'cortesia'), (2, 'whatsapp.agent', 'cortesia')
ON CONFLICT (restaurante_id, modulo_code)
DO UPDATE SET estado = 'activo', updated_at = now();

-- Solo se crean las que faltan: nunca se pisa un valor que el restaurante ya tenga.
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
VALUES (2, 'agente_activo',        'true'),
       (2, 'agente_pausa_minutos', '60'),
       (2, 'cart_expiry_minutes',  '30'),
       (2, 'cart_warning_minutes', '5'),
       (2, 'api_konnecttia_url',   'http://staging_konnecttia-api:3001')
ON CONFLICT (config_key, restaurante_id) DO NOTHING;

SELECT modulo_code, estado FROM public.restaurante_modulo WHERE restaurante_id = 2 AND modulo_code LIKE 'whatsapp.%';
SELECT config_key, config_value FROM public.restaurante_config WHERE restaurante_id = 2 AND config_key LIKE 'agente_%';
COMMIT;
```

Si `agente_activo` ya existía con otro valor, el `DO NOTHING` lo deja: comprobarlo en el `SELECT` final y, si no es
`true`, `UPDATE public.restaurante_config SET config_value = 'true' WHERE restaurante_id = 2 AND config_key = 'agente_activo';`.
Vuelta atrás: `DELETE FROM public.restaurante_config WHERE restaurante_id = 2 AND config_key IN (…);` y
`UPDATE public.restaurante_modulo SET estado = 'cancelado' WHERE restaurante_id = 2 AND modulo_code IN ('whatsapp.channel','whatsapp.agent');`

### 4.2 Transferencia (solo para la prueba T10) — **datos ficticios**

Antes, guardar el valor actual (consulta 2.4 muestra si había datos). Con `postgres` o `cesar_escritura`:

```sql
BEGIN;
UPDATE public.restaurante
SET    payment_methods = '["efectivo", "tarjeta", "transferencia"]'::jsonb,
       datos_bancarios = COALESCE(datos_bancarios, '{}'::jsonb)
                         || '{"titular":"PRUEBA Arepas Factory","iban":"ES00 0000 0000 0000 0000 0000","banco":"Banco de pruebas"}'::jsonb
WHERE  id = 2;
SELECT payment_methods, metodos_pago_permitidos, datos_bancarios FROM public.restaurante WHERE id = 2;
COMMIT;
```

Si `metodos_pago_permitidos` no es nulo y no incluye `transferencia`, la API **no la ofrece** aunque esté activa
(la fija Konnecttia en `/interno`): añadirla desde ahí o con
`UPDATE public.restaurante SET metodos_pago_permitidos = metodos_pago_permitidos || '"transferencia"'::jsonb WHERE id = 2;`.
Vuelta atrás: `UPDATE public.restaurante SET payment_methods = '["efectivo", "tarjeta"]'::jsonb, datos_bancarios = <valor anterior> WHERE id = 2;`
Los datos reales de Arepa's los carga su propietario en el panel; no se escriben aquí.

### 4.3 Cerrar y abrir el local (solo para la prueba T7)

Mejor desde el panel de Arepa's (cierre manual del local en Ajustes), que es lo que hará el restaurante; comprobar el nombre exacto del botón la primera vez. Equivalente en SQL:

```sql
-- cerrar
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
VALUES (2, 'is_open_override', 'false')
ON CONFLICT (config_key, restaurante_id) DO UPDATE SET config_value = 'false';
-- volver a lo que había (anotar antes el valor de la consulta 2.3; si no había fila, borrarla)
-- DELETE FROM public.restaurante_config WHERE restaurante_id = 2 AND config_key = 'is_open_override';
```

Si el hallazgo del punto 4 es `sucursal.forzar_abierto = true`, ese manda sobre el restaurante: ponerlo en `NULL`
(es lo que lee `openChecker`) y volver a medirlo con `…/public/arepas-factory/locales`.

## 5. Lo que haces tú, paso a paso

### En la base (DBeaver)

1. Consultas 2.0–2.5 y pegarme el resultado (sobre todo 2.3: por qué está abierto).
2. Sección 4.1 (módulos y claves).
3. Sección 4.2 solo si vas a probar transferencia.
4. Sección 3.1 (reasignar el canal). Anotar el `id` del canal nuevo.

### En Kapso

Nada que cambiar: el webhook ya apunta a n8n y no distingue restaurantes. Solo comprobar:

1. _WhatsApp → Sandbox_ (número `597907523413541`): que el teléfono de pruebas sigue registrado (el que escribió hoy).
2. _Webhooks_ del número: activo, eventos `whatsapp.message.received` y `whatsapp.message.sent`, v2.
3. **Buffer de mensajes:** hoy está **desactivado** (`buffer_enabled: false`) y el diseño (ADR 0012) cuenta con
   él para unir mensajes seguidos del cliente. Para la prueba T12 (varios mensajes seguidos) actívalo
   en el webhook con ventana de 5 s, eventos `whatsapp.message.received`. Si no se activa, cada mensaje abre
   una ejecución del Director y el agente puede contestar dos veces.

### En n8n (`https://n8n.staging.konnecttia.com`)

Nada que publicar: los flujos y credenciales de hoy sirven. Antes de empezar:

1. Comprobar que `[Canal] Entrada Kapso`, `[Agente] Director`, `[Agente] Llamar API`, `[Canal] Enviar mensaje` y
   `[Agente] Mantenimiento` están activos (lo están a las 04:00 UTC).
2. Dejar abierta la pestaña _Executions_ para ver cada mensaje en vivo.
3. Al terminar cada prueba (o todas), ejecutar la revisión de este repositorio (solo lectura):

```bash
N8N_URL=https://n8n.staging.konnecttia.com N8N_API_KEY=<tu clave de la API de n8n> \
  python3 integrations/n8n/scripts/revisar_ejecuciones.py --desde 2026-11-17T10:00:00Z
```

## 6. Batería de pruebas por WhatsApp

Escribir desde el **teléfono de pruebas del sandbox** al número del sandbox. Hacer las pruebas en orden; cada una
empieza con «nuevo pedido» salvo que se diga otra cosa. Hora local de Arrecife = UTC en noviembre.
Datos de la carta (precios reales de staging): Arepa Burger 5,40 €, Cachapa 4,90 €, Tostada 1 3,00 €, Combo Factory 7,50 €.
Ubicaciones: **dentro** = 28.9630, -13.5480 (centro de Arrecife, 2,7 km, zona 5 km) · **fuera** = 28.9200, -13.6580 (Puerto del Carmen).

| #   | Mensaje del cliente                                                                | Resultado esperado                                                                                                                                                                                                                                  | Dónde comprobarlo                                                                                  |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| T1  | «Hola»                                                                             | Primera respuesta con **«Soy el agente de pedidos del restaurante Arepa's Factory»**, tono cercano, sin inventar nada. En la ejecución del Director `restaurante_id = 2` y el `canal_id` nuevo                                                    | `revisar_ejecuciones.py`; filas nuevas en `whatsapp_conversacion` con `restaurante_id = 2`          |
| T2  | «¿Qué tenéis? ¿Me pasas la carta?»                                                 | **No** lista las 76 líneas: comparte `https://app.staging.konnecttia.com/arepas-factory/carta` e invita a decir qué quiere                                                                                                                         | El enlace abre la carta de Arepa's                                                                  |
| T2b | «¿Las arepas llevan gluten?»                                                       | Solo la nota de alérgenos con el enlace; **no** responde sí/no ni «sin alérgenos» (regla 12 y 16)                                                                                                                                                  | Texto de respuesta                                                                                  |
| T3  | «Quiero 2 arepas burger para recoger»                                              | Usa `buscar_en_carta` y `cambiar_carrito`; no pide dirección (regla 4); local único: no pregunta cuál; resumen con 10,80 €, 30 min. Pide nombre. Forma de pago con botones: **solo efectivo y tarjeta**                                       | Herramientas en el informe; carrito `abierto` con `tipo_despacho = 'retiro'`, `sucursal_id = 3`     |
| T3b | Seguir T3: nombre «Prueba Uno», «efectivo», «sí, confirma»                         | Código de pedido (`AAMMDD-1xxx`), tiempo estimado y enlace `app.staging…/arepas-factory/pedido/<token>`. **El agente no confirma antes de pasar por pago** (regla 9)                                                                              | `pedidos`: `restaurante_id = 2`, `canal = 'whatsapp'`, `estado = 'recibido'`, `metodo_pago = 'efectivo'`; carrito `confirmado` |
| T4  | «Nuevo pedido: 7 arepas burger a domicilio» → «escribir dirección» → «Calle León y Castillo 20, 35500 Arrecife» | Pide cómo dar la dirección (botones), geocodifica la dirección escrita, calcula 37,80 € + 2 € envío = 39,80 €, mínimo alcanzado, 30 min. **Con ubicación dentro de zona** (enviar el pin 28.9630,-13.5480) el resultado es el mismo                 | `pedidos`: `tipo_despacho = 'delivery'`, `costo_envio = 2`, `direccion`, `tiempo_estimado = '30 min'`                  |
| T5  | «Nuevo pedido: 1 cachapa a domicilio» y enviar la ubicación **fuera** (28.9200,-13.6580) | «Fuera de nuestra zona de reparto»; ofrece otra dirección o recoger. **No** cambia a recogida por su cuenta (regla 8) ni confirma                                                                                                         | Carrito `abierto` sin pedido; cotización `fuera_de_cobertura`                                       |
| T6  | «Nuevo pedido: 2 arepas burger a domicilio» y ubicación **dentro**                 | Mantiene reparto, dice que **faltan 19,20 €** para el mínimo de 30 € (10,80 de 30) y ofrece añadir productos o pasar a recogida. **No confirma** (regla 7). Responder «añade 4 cachapas»: pasa a 30,40 € y avanza a pago                           | Carrito con `tipo_despacho = 'delivery'` y sin pedido; después, con mínimo, avanza                  |
| T7  | **Cerrar el local** (4.3) y escribir «Quiero una arepa»                            | Dice que está cerrado (usa `mensaje_cerrado` si existe; si no, texto neutro), **no** crea carrito ni usa `cambiar_carrito`; puede compartir la carta. Reabrir el local al terminar                                                              | `agente_carrito` sin filas nuevas; `…/public/arepas-factory/locales` → `abierto: false`            |
| T8  | Pago en **efectivo** (T3b y T4)                                                    | El agente no supone el método: lo pregunta con las opciones aceptadas. Con efectivo: pedido `recibido`, `estado_pago = 'no_aplica'`                                                                                                                | Fila de `pedidos`                                                                                   |
| T9  | Pago en **tarjeta**                                                                | Igual que efectivo (el cobro es en el local/al entregar; no hay pasarela online)                                                                                                                                                                   | Fila de `pedidos`                                                                                   |
| T10 | Pago por **transferencia** (requiere 4.2)                                          | El agente da titular, IBAN y banco completos (**datos ficticios**), avisa de que el pedido queda pendiente de pago. **Regla 9: `pendiente_pago`.** Ver hallazgo H1 de abajo: se espera `estado_pago = 'pendiente'`                              | `pedidos.estado`, `pedidos.estado_pago`, `pedido_justificante`; panel de Arepa's → Cobros pendientes |
| T11 | «Quiero reclamar: el pedido de ayer llegó frío, quiero hablar con alguien»         | Usa `derivar_a_persona` (motivo `reclamo`), dice que una persona le atenderá por este chat, **no intenta resolverlo**. Se pausa el agente 120 min (plantilla) en esa conversación: un mensaje posterior no recibe respuesta del agente               | `escalaciones` (nueva, `restaurante_id = 2`, `tipo_escalacion = 'reclamo'`); `whatsapp_conversacion.pausado_hasta`; panel → Derivaciones; correo al propietario |
| T12 | Tres mensajes seguidos en 3 s («Quiero» / «2 arepas» / «para recoger»)             | Con el buffer de Kapso activo, una sola ejecución del Director y una sola respuesta                                                                                                                                                                | Número de ejecuciones del Director                                                                  |
| T13 | Dejar un carrito `abierto` 25 min                                                  | Aviso de caducidad a los 25 min y caducidad a los 30 (el cron `[Agente] Mantenimiento` corre cada 2 min)                                                                                                                                         | `agente_carrito.estado = 'caducado'`; ejecuciones del Mantenimiento                                 |
| T14 | Escribir desde el móvil del restaurante (si el sandbox lo permite)                 | Pausa el agente (`agente_pausa_minutos = 60`): evento `message.sent` con `origin = business_app`. En el sandbox puede no existir ese origen: anotar si no se puede probar                                                                          | `whatsapp_conversacion.pausado_por = 'personal'`                                                    |

**Aislamiento (obligatorio):** tras T3b, el mismo teléfono ya existe en Siempre Juntos con otro nombre. El agente de Arepa's
debe pedir el nombre (no usar «Cesa Augusto» ni la dirección habitual de Siempre Juntos, que salía en la ejecución #918).
Consulta de comprobación:

```sql
SELECT restaurante_id, nombre, telefono, direccion_frecuente FROM public.usuarios
WHERE  telefono = '+16314662990' ORDER BY restaurante_id;
```

## 7. Hallazgos previos a las pruebas (leídos en el código, a confirmar con T10 y T4)

- **H1 · «Transferencia ⇒ `pendiente_pago`» (resuelto en código, falta desplegar).** La web y el agente crean todo pedido en
  `recibido`; para transferencia o Bizum solo `estado_pago` pasa a `pendiente` (así funciona Siempre Juntos y lo fijan las
  pruebas). El cancelado automático (`pedido_pago_pendiente_expira_minutos`, 60 min) filtraba por `estado = 'pendiente_pago'`
  y nunca actuaba. Ahora cancela los pedidos con `estado_pago = 'pendiente'` en `recibido` o `pendiente_pago`, sin
  justificante y aún no aceptados por el local (premium). No se cambia el flujo de la web. Se despliega con la API de staging.
- **H2 · Apertura forzada (confirmado el 17/11).** `restaurante_config.is_open_override = 'true'` para Arepa's: el local
  figura abierto 24 h. Para T7 y para que el horario real (08:00–23:00) mande: `DELETE FROM public.restaurante_config
  WHERE restaurante_id = 2 AND config_key = 'is_open_override';` (volver: insertar `'true'`).
- **H3 · `agente_activo` y módulos.** Sin los pasos 4.1, el agente de Arepa's **no contesta y no avisa**: «[Canal] Entrada
  Kapso» termina en silencio si `modulo_activo` o `agente_activo` fallan. Es el motivo más probable de «no responde».
- **H4 · Buffer de Kapso apagado** frente a lo diseñado (ver sección 5).
- **H5 · Mínimo de reparto de 30 €** con productos de 3 a 7,50 €: el reparto exige un pedido grande (6 arepas). Es el
  dato del seed, no un fallo; confirmar con el cliente antes de enseñárselo.

## 8. Informe de resultados

Se rellena tras las pruebas con `revisar_ejecuciones.py` y las consultas de la base: una fila por prueba con
OK / FALLA, ejecución de n8n (#), lo que respondió y lo que debía responder. Pendiente de ejecutar las pruebas.
