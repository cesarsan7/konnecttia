# Arquitectura n8n Multi-Cliente — EasyOrder

**Versión:** 1.0  
**Fecha:** 2026-07-06  
**Alcance:** Diseño técnico para reutilizar workflows de n8n entre múltiples restaurantes sin duplicar flujos completos.

---

## Pregunta central

> ¿Cómo estructurar n8n para que cada nuevo cliente no requiera duplicar todos los flujos, pero sí pueda tener prompt, reglas y comportamiento personalizado?

**Respuesta en una línea:** Un único conjunto de workflows genéricos que leen toda su configuración (prompt, reglas, horarios, métodos de pago, mensajes) desde PostgreSQL usando `restaurante_id` como clave de aislamiento.

---

## 1. Diagnóstico del estado actual

### Lo que existe hoy

| Elemento | Estado |
|----------|--------|
| Flujo base (n8n AI2nomous) | Operativo. Genérico pero con referencias a La Isla |
| Flujo La Isla | Fork manual del base. Credenciales, IDs y algunos textos hardcodeados |
| `restaurante_id` en DB | Presente en todas las tablas relevantes |
| `Obtener Config Restaurante` | Ya existe como nodo Postgres en el flujo |
| Prompt del Director | Tiene `$('Obtener Config Restaurante').first().json.nombre` — ya es dinámico |
| Prompt de Agente Cerrado | Tiene "La Isla Pizzería" hardcodeado — no dinámico |
| Credenciales n8n | Específicas por instancia — no se pueden compartir entre instancias n8n |
| Chatwoot inbox | Específico por cliente — el webhook lo identifica |

### El problema de duplicar flujos

```
Cliente A: 11 workflows × 1 = 11 workflows
Cliente B: 11 workflows × 1 = 11 workflows  
Cliente C: 11 workflows × 1 = 11 workflows
→ 33 workflows, cada bug se corrige 3 veces
→ cada mejora se aplica 3 veces
→ riesgo de divergencia entre versiones
```

---

## 2. Arquitectura recomendada: Instancia única con routing dinámico

### Principio

**Una sola instancia n8n. Un solo conjunto de workflows. `restaurante_id` determina todo.**

```
WhatsApp → Chatwoot → Webhook n8n
                           │
                    [Variables] extrae restaurante_id del inbox_id
                           │
                    [Obtener Config Restaurante] carga configuración
                           │
                    [Cargar Prompt] carga prompt de DB
                           │
                    [Director / Agente Cerrado] ejecuta con contexto del restaurante
```

### Cómo se identifica el restaurante

El webhook de Chatwoot incluye `inbox_id`. Esta es la clave de routing:

```sql
-- Tabla de mapeo: inbox_id de Chatwoot → restaurante_id
CREATE TABLE restaurant_channel_configs (
  id          serial PRIMARY KEY,
  restaurante_id int4 NOT NULL REFERENCES restaurante(id),
  canal       varchar(30) NOT NULL,   -- 'whatsapp', 'web', 'instagram'
  inbox_id    int4,                   -- ID del inbox en Chatwoot
  phone_number varchar(20),           -- número WhatsApp
  chatwoot_url text,                  -- URL de la instancia Chatwoot
  chatwoot_token text,                -- API token
  meta_phone_id text,                 -- Phone Number ID de Meta
  meta_token text,                    -- token de Meta (cifrado en DB)
  activo      bool DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
```

En el nodo `Variables` del flujo:

```javascript
// Extraer inbox_id del payload de Chatwoot
const inbox_id = $json.body?.inbox?.id;

// Query en el siguiente nodo para resolver restaurante_id
// SELECT restaurante_id FROM restaurant_channel_configs WHERE inbox_id = $inbox_id
```

---

## 3. Flujos: global vs específico

### Flujos que deben ser 100% compartidos (sin modificar por cliente)

| Workflow | Motivo |
|----------|--------|
| `[CORE] Router Principal` | Lógica de entrada, buffer Redis, routing por inbox_id |
| `[CORE] Apertura` | Crea/reutiliza pedido. Toda la lógica viene de DB |
| `[CORE] Despacho` | Agrega ítems, valida zonas. Datos del menú vienen de DB |
| `[CORE] Pago` | Lógica de confirmación. Métodos de pago vienen de DB |
| `[CORE] Perfil Cliente` | Sin variación por cliente |
| `[CORE] Pedidos Cliente` | Sin variación por cliente |
| `[CORE] Contexto` | Sin variación por cliente |
| `[CORE] Derivar Humano` | Lógica genérica; destino de escalamiento viene de DB |
| `[CORE] Preguntas` | FAQs vienen de tabla `faqs` filtrada por restaurante_id |
| `[CORE] Cron Expirar Pedidos` | Genérico |
| `[CORE] Notificacion Estado Pedido` | Genérico |

### Qué se parametriza por cliente (sin crear un nuevo workflow)

| Variable | Fuente |
|----------|--------|
| Nombre del restaurante | `restaurante.nombre` |
| Prompt del Director | `restaurant_prompts.prompt_text` WHERE tipo='director' |
| Prompt del Agente Cerrado | `restaurant_prompts.prompt_text` WHERE tipo='cerrado' |
| Reglas de negocio | `restaurant_business_rules.reglas_json` |
| Horarios | `horarios` WHERE restaurante_id = X |
| Menú | `menu_category + menu_item + menu_variant` WHERE restaurante_id = X |
| Métodos de pago | `restaurant_settings` key='metodos_pago' |
| Métodos de despacho | `restaurante_config` key='modos_despacho' |
| Mínimo de delivery | `restaurante_config` key='delivery_minimo' |
| Mensajes personalizados | `restaurant_prompts` WHERE tipo='bienvenida'|'cerrado'|etc. |
| Datos bancarios | `restaurante.datos_bancarios` (JSONB) |
| Escalamiento a humano | `restaurant_channel_configs` |
| Feature flags | `restaurant_feature_flags` |

### Cuándo sí justifica un workflow separado por cliente

Solo en estos casos excepcionales:
- El cliente usa un proveedor de LLM diferente (Anthropic, Gemini)
- El cliente tiene un flujo de pago completamente diferente (ej: integración con POS físico)
- El cliente requiere un idioma diferente en la lógica del flujo (no solo en el prompt)

En esos casos: crear una rama del workflow con un prefijo `[CUSTOM-CLIENTE]` y documentarlo.

---

## 4. Carga dinámica de prompts

### Estrategia

El prompt NO se hardcodea en el nodo n8n. Se carga desde una tabla en cada ejecución.

### Nodo nuevo: `Cargar Prompt`

Se inserta después de `Obtener Config Restaurante` y antes del Director:

```sql
-- Consulta en el nodo Postgres "Cargar Prompt"
SELECT prompt_text, version
FROM restaurant_prompts
WHERE restaurante_id = {{ $('Variables').first().json.restaurante_id }}
  AND tipo = 'director'
  AND activo = true
ORDER BY version DESC
LIMIT 1;
```

### Uso en el nodo Director (system message)

```
={{ $('Cargar Prompt').first().json.prompt_text }}

CONTEXTO DEL CLIENTE:
{{ $json.contexto }}

DATOS DIRECTOS:
- Nombre: {{ $json.cliente_nombre }}
...
```

### Prompt base vs prompt específico

El prompt puede tener una plantilla con variables que se resuelven en el nodo:

```
-- En restaurant_prompts.prompt_text
Eres el asistente virtual de {nombre_restaurante} por WhatsApp.
Moneda: {moneda}
Zona: {zona_horaria}
...
REGLAS ESPECÍFICAS:
{reglas_negocio}
```

Un nodo `Code` previo hace el reemplazo:

```javascript
let prompt = $('Cargar Prompt').first().json.prompt_text;
const config = $('Obtener Config Restaurante').first().json;
const reglas = $('Cargar Reglas').first().json.reglas_texto;

prompt = prompt
  .replace('{nombre_restaurante}', config.nombre)
  .replace('{moneda}', config.moneda || '€')
  .replace('{zona_horaria}', config.zona_horaria)
  .replace('{reglas_negocio}', reglas || '');

return [{ json: { prompt_final: prompt } }];
```

---

## 5. Carga dinámica de reglas de negocio

### Estrategia

Las reglas se almacenan como texto estructurado en DB. Se inyectan en el prompt del Director.

```sql
-- Nodo "Cargar Reglas"
SELECT reglas_texto, reglas_json
FROM restaurant_business_rules
WHERE restaurante_id = {{ $('Variables').first().json.restaurante_id }}
  AND activo = true
ORDER BY updated_at DESC
LIMIT 1;
```

`reglas_texto` es el bloque de reglas en lenguaje natural listo para inyectar en el prompt.  
`reglas_json` es la versión estructurada para validaciones programáticas en nodos Code.

### Ejemplo de reglas_texto para La Isla

```
REGLAS DE NEGOCIO:
1. Flujo: Apertura → Despacho → Pago.
2. Si local cerrado, no tomar pedidos.
3. Para retiro, nunca pedir dirección.
4. Para delivery: validar zona, mínimo €15, calcular envío.
5. No confirmar sin pasar por Pago.
6. Pedido expira tras 30 min de inactividad.
7. Transferencia → estado pendiente_pago.
```

---

## 6. Manejo de excepciones por cliente

Cuando un cliente necesita lógica especial, la estrategia es:

### Opción A: Feature flags (recomendada para variaciones menores)

```sql
-- restaurant_feature_flags
SELECT flag_key, flag_value
FROM restaurant_feature_flags
WHERE restaurante_id = X AND activo = true;
```

Ejemplo de flags:
- `tiene_delivery` → true/false
- `tiene_retiro` → true/false  
- `requiere_codigo_postal` → true/false
- `pago_efectivo_habilitado` → true/false
- `pago_transferencia_habilitado` → true/false
- `escalamiento_whatsapp` → número destino

En el flujo, un nodo IF evalúa el flag antes de ejecutar la lógica:

```javascript
const flags = $('Cargar Flags').all().reduce((acc, item) => {
  acc[item.json.flag_key] = item.json.flag_value;
  return acc;
}, {});

return [{ json: { flags } }];
```

### Opción B: Sub-workflow específico por cliente (para lógica muy distinta)

Si el cliente tiene un flujo de pago diferente (ej: integra con un POS), el nodo `toolWorkflow` del Director puede apuntar a un workflow específico usando un campo en DB:

```sql
SELECT workflow_id_pago
FROM restaurant_workflow_configs
WHERE restaurante_id = X;
```

Así el workflow de Pago puede ser diferente sin tocar el Director.

---

## 7. Estructura de archivos n8n recomendada

```
/docs/n8n/
  /core/                          ← Workflows compartidos (un solo set)
    [CORE] Router Principal.json
    [CORE] Apertura.json
    [CORE] Despacho.json
    [CORE] Pago.json
    [CORE] Preguntas.json
    [CORE] Contexto.json
    [CORE] Derivar Humano.json
    [CORE] Perfil Cliente.json
    [CORE] Pedidos Cliente.json
    [CORE] Cron Expirar Pedidos.json
    [CORE] Notificacion Estado Pedido.json

  /templates/                     ← Templates para crear nuevos clientes
    onboarding-checklist.md
    seed-data-template.sql        ← INSERT de config mínima para nuevo restaurante

  /custom/                        ← Solo si un cliente necesita lógica especial
    [CUSTOM-CLIENTE-X] Pago.json

/scripts/
  update_workflow_ids.py          ← Ya existe
  update_credential_ids.py        ← Ya existe
  onboard_new_client.py           ← Por crear: seeds la DB con config del cliente
```

---

## 8. Esquema de tablas propuesto

### 8.1 `restaurant_prompts`

**Propósito:** Almacenar prompts por restaurante, por tipo y versionados.

```sql
CREATE TABLE restaurant_prompts (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  tipo            varchar(50) NOT NULL,  -- 'director', 'cerrado', 'bienvenida', 'escalamiento'
  prompt_text     text NOT NULL,
  version         int4 NOT NULL DEFAULT 1,
  activo          bool DEFAULT true,
  notas           text,
  created_by      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (restaurante_id, tipo, version)
);
```

| Campo | Propósito |
|-------|-----------|
| `tipo` | Identifica qué agente usa este prompt |
| `version` | Permite rollback a versión anterior |
| `activo` | Solo el activo se carga en cada ejecución |
| `notas` | Documenta qué cambió en esta versión |

**Cómo lo usa n8n:** Query con `WHERE restaurante_id = X AND tipo = 'director' AND activo = true ORDER BY version DESC LIMIT 1`

**Editable desde SaaS:** Sí — panel de configuración avanzada del restaurante.

---

### 8.2 `restaurant_prompt_versions`

**Propósito:** Historial de cambios de prompts para auditoría y rollback.

```sql
CREATE TABLE restaurant_prompt_versions (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id),
  tipo            varchar(50) NOT NULL,
  prompt_text     text NOT NULL,
  version         int4 NOT NULL,
  activado_en     timestamptz,
  desactivado_en  timestamptz,
  activado_por    text,
  motivo_cambio   text
);
```

**Cómo lo usa n8n:** Solo lectura para auditoría. No se consulta en ejecución normal.

**Editable desde SaaS:** Lectura (historial). El panel muestra diff entre versiones.

---

### 8.3 `restaurant_business_rules`

**Propósito:** Reglas de negocio en formato texto (para inyectar en prompt) y JSON (para validaciones en nodos Code).

```sql
CREATE TABLE restaurant_business_rules (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  reglas_texto    text NOT NULL,    -- bloque listo para prompt
  reglas_json     jsonb,            -- estructura para validaciones programáticas
  version         int4 DEFAULT 1,
  activo          bool DEFAULT true,
  updated_at      timestamptz DEFAULT now()
);
```

**Ejemplo de `reglas_json`:**

```json
{
  "delivery_minimo": 15.00,
  "delivery_zonas_activas": true,
  "retiro_activo": true,
  "pago_efectivo": false,
  "pago_transferencia": true,
  "pago_tarjeta": false,
  "cart_expiry_minutes": 30,
  "cart_warning_minutes": 5,
  "escalamiento_automatico": false
}
```

**Cómo lo usa n8n:** `reglas_texto` se inyecta en el system prompt. `reglas_json` se lee en nodos Code para validaciones (ej: `if (flags.delivery_minimo > subtotal) { ... }`).

**Editable desde SaaS:** Sí — editor de reglas con preview del prompt resultante.

---

### 8.4 `restaurant_channel_configs`

**Propósito:** Configuración de canales de comunicación por restaurante (WhatsApp, Chatwoot, Meta).

```sql
CREATE TABLE restaurant_channel_configs (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  canal           varchar(30) NOT NULL,   -- 'whatsapp', 'web', 'instagram'
  inbox_id        int4,                   -- inbox_id en Chatwoot → clave de routing
  phone_number    varchar(20),
  chatwoot_url    text,
  chatwoot_token  text,                   -- cifrado en reposo
  meta_phone_id   text,
  meta_token      text,                   -- cifrado en reposo
  escalamiento_numero varchar(20),        -- número WhatsApp para derivar humano
  activo          bool DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (canal, inbox_id)
);
```

**Cómo lo usa n8n:**
1. El nodo `Variables` recibe `inbox_id` del payload de Chatwoot
2. Query: `SELECT restaurante_id, escalamiento_numero FROM restaurant_channel_configs WHERE inbox_id = $inbox_id`
3. El `restaurante_id` resultante alimenta todos los nodos siguientes

**Editable desde SaaS:** Solo por administrador del sistema (datos sensibles).

---

### 8.5 `restaurant_settings`

**Propósito:** Configuración operativa clave-valor por restaurante. Extiende `restaurante_config` con tipos y validación.

```sql
CREATE TABLE restaurant_settings (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  setting_key     varchar(100) NOT NULL,
  setting_value   text NOT NULL,
  setting_type    varchar(20) DEFAULT 'string',  -- 'string', 'number', 'boolean', 'json'
  descripcion     text,
  editable_saas   bool DEFAULT true,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (restaurante_id, setting_key)
);
```

**Ejemplo de datos:**

```sql
INSERT INTO restaurant_settings (restaurante_id, setting_key, setting_value, setting_type) VALUES
(1, 'metodos_pago',         '["transferencia","efectivo_retiro"]', 'json'),
(1, 'modos_despacho',       '["delivery","retiro"]',               'json'),
(1, 'delivery_minimo',      '15.00',                               'number'),
(1, 'cart_expiry_minutes',  '30',                                  'number'),
(1, 'cart_warning_minutes', '5',                                   'number'),
(1, 'moneda',               '€',                                   'string'),
(1, 'modelo_llm',           'gpt-4.1-mini',                        'string');
```

**Cómo lo usa n8n:** Query con `SELECT setting_key, setting_value FROM restaurant_settings WHERE restaurante_id = X` y se convierte a un objeto en un nodo Code.

**Editable desde SaaS:** Sí — todos los marcados con `editable_saas = true`.

---

### 8.6 `restaurant_workflow_configs`

**Propósito:** Mapea qué workflow de n8n usa cada restaurante para cada operación. Permite que un cliente tenga un workflow de Pago personalizado sin tocar el Director.

```sql
CREATE TABLE restaurant_workflow_configs (
  id                  serial PRIMARY KEY,
  restaurante_id      int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  operacion           varchar(50) NOT NULL,  -- 'apertura', 'despacho', 'pago', 'preguntas', 'derivar'
  workflow_id_n8n     varchar(50) NOT NULL,  -- ID del workflow en la instancia n8n
  n8n_instance_url    text,                  -- URL de la instancia n8n (para multi-instancia futura)
  activo              bool DEFAULT true,
  UNIQUE (restaurante_id, operacion)
);
```

**Cómo lo usa n8n:** El nodo `toolWorkflow` del Director lee el `workflow_id_n8n` desde esta tabla en lugar de tenerlo hardcodeado. Esto hace que cambiar el workflow de un cliente sea un UPDATE en DB, no una reimportación de JSON.

**Editable desde SaaS:** Solo por administrador del sistema.

---

### 8.7 `restaurant_feature_flags`

**Propósito:** Activar/desactivar funcionalidades por restaurante sin modificar código.

```sql
CREATE TABLE restaurant_feature_flags (
  id              serial PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES restaurante(id) ON DELETE CASCADE,
  flag_key        varchar(100) NOT NULL,
  flag_value      text NOT NULL,          -- 'true', 'false', o valor específico
  descripcion     text,
  activo          bool DEFAULT true,
  UNIQUE (restaurante_id, flag_key)
);
```

**Flags actuales recomendados:**

| flag_key | valores posibles | Descripción |
|----------|-----------------|-------------|
| `delivery_activo` | true/false | Habilita opción delivery |
| `retiro_activo` | true/false | Habilita opción retiro |
| `pago_transferencia` | true/false | Habilita pago por transferencia |
| `pago_efectivo` | true/false | Habilita pago en efectivo |
| `preguntas_activo` | true/false | Habilita sub-flujo Preguntas |
| `escalamiento_humano` | true/false | Habilita derivación a humano |
| `notificacion_whatsapp` | true/false | Envía notificaciones por WA |
| `multimodal_audio` | true/false | Procesa mensajes de audio |
| `multimodal_imagen` | true/false | Procesa imágenes |
| `web_orders_activo` | true/false | Acepta pedidos desde web |

**Cómo lo usa n8n:** Se cargan al inicio del flujo y se pasan como contexto. Los nodos IF los evalúan antes de ejecutar sub-flujos opcionales.

**Editable desde SaaS:** Sí — panel de funcionalidades del restaurante.

---

## 9. Flujo de onboarding de nuevo restaurante

Con esta arquitectura, un nuevo cliente se onboardea así:

```
1. INSERT en restaurante (nombre, timezone, moneda)
2. INSERT en horarios (7 días)
3. INSERT en restaurant_channel_configs (inbox_id de su Chatwoot)
4. INSERT en restaurant_prompts (director, cerrado) — copiar desde template
5. INSERT en restaurant_business_rules — copiar desde template y ajustar
6. INSERT en restaurant_settings (modos_despacho, metodos_pago, etc.)
7. INSERT en restaurant_feature_flags (qué tiene activo)
8. INSERT en restaurant_workflow_configs (apuntar a los CORE workflows)
9. Registrar su menú en menu_category + menu_item + menu_variant
10. LISTO — no se importa ningún workflow nuevo
```

Script: `scripts/onboard_new_client.py` ejecuta todo esto con un JSON de configuración del cliente.

---

## 10. Versionamiento de prompts y reglas

### Flujo de cambio de prompt

```
1. Admin edita prompt en panel SaaS
2. Sistema crea nuevo registro en restaurant_prompts con version = max(version) + 1
3. Desactiva el registro anterior (activo = false)
4. Copia el viejo a restaurant_prompt_versions con desactivado_en = now()
5. El siguiente mensaje del restaurante usa el prompt nuevo
6. Si hay problemas: UPDATE restaurant_prompts SET activo = false WHERE version = nueva
             + UPDATE restaurant_prompts SET activo = true WHERE version = vieja
```

### Flujo de cambio de workflow

Los workflows CORE se versionan en git:
- `main` → producción
- `dev` → pruebas
- Tags: `v1.0.0`, `v1.1.0`, etc.

Los cambios en workflows se despliegan reimportando el JSON en n8n y actualizando `restaurant_workflow_configs` si cambia el ID.

---

## 11. Testing por cliente sin afectar otros

### Estrategia de ambientes

```
Ambiente PROD:  n8n principal → workflows CORE → DB producción
Ambiente DEV:   n8n dev (misma instancia, distinto tag) → workflows CORE-DEV → DB dev
```

### Testing de un restaurante específico en PROD

Para probar cambios en el prompt de un cliente sin afectar otros:

1. Crear registro en `restaurant_prompts` con `activo = false, notas = 'TEST'`
2. Agregar flag temporal: `restaurant_feature_flags` key=`usar_prompt_test` value=`true`
3. El flujo carga el prompt de test si el flag está activo
4. Validar con el cliente
5. Activar el prompt definitivo, desactivar el flag

### Testing de flujo completo por restaurante

Usar un número de WhatsApp de prueba registrado en el Chatwoot del cliente, con `inbox_id` separado marcado como `ambiente = 'test'` en `restaurant_channel_configs`. El workflow lo trata igual pero el historial queda aislado en `n8n_chat_histories`.

---

## 12. Riesgos

### Riesgos de arquitectura compartida (un solo set de workflows)

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Un bug en CORE afecta a todos los clientes | Media | Alto | Tests antes de deploy, rama dev separada |
| Un cliente con alta carga afecta el rendimiento de otros | Baja | Medio | Rate limiting por `restaurante_id` en Redis |
| Configuración incorrecta de un cliente rompe el flujo | Media | Bajo (aislado) | Validación en onboarding, fallbacks en nodos Code |
| `n8n_chat_histories` sin `restaurante_id` mezcla sesiones | Alta | Medio | Agregar `restaurante_id` a la tabla (pendiente) |

### Riesgos de duplicar flujos por cliente (modelo actual)

| Riesgo | Probabilidad | Impacto |
|--------|-------------|---------|
| Bugs corregidos en base no se propagan a clientes | Alta | Alto |
| Divergencia de versiones entre clientes | Muy alta | Alto |
| Costo de mantenimiento escala linealmente | Cierto | Alto |
| Error humano al hacer fork | Alta | Medio |

**Conclusión:** El riesgo de duplicar flujos supera al de compartirlos. La arquitectura compartida con `restaurante_id` es la correcta.

---

## 13. Recomendación final

### Fase 1 — Completar la base actual (MVP inmediato)

1. Agregar `restaurante_id` a `n8n_chat_histories` para aislar sesiones
2. Hacer dinámico el prompt de `Agente Cerrado` (leer desde `restaurant_prompts`)
3. Crear `restaurant_channel_configs` con el `inbox_id` de La Isla
4. Mover el `restaurante_id` del hardcode de `Variables` a resolución por `inbox_id`

### Fase 2 — Prompts y reglas desde DB

5. Crear `restaurant_prompts` y `restaurant_business_rules`
6. Agregar nodos `Cargar Prompt` y `Cargar Reglas` al flujo CORE
7. Migrar el prompt actual de La Isla a la tabla
8. Crear script `onboard_new_client.py`

### Fase 3 — Feature flags y workflow configs

9. Crear `restaurant_feature_flags`
10. Crear `restaurant_workflow_configs`
11. Hacer que el toolWorkflow del Director lea IDs desde DB
12. Panel SaaS para editar prompts, reglas y flags

### Lo que NO hacer

- No crear un workflow por cliente. Nunca más.
- No hardcodear nombres de restaurante en ningún nodo.
- No usar credenciales distintas por cliente si se puede evitar (compartir la misma key de OpenAI con billing centralizado).

---

## J. Arquitectura n8n multi-cliente (resumen ejecutivo)

**Workflows compartidos:** todos los CORE (Router, Apertura, Despacho, Pago, Preguntas, Contexto, Derivar Humano, Perfil, Pedidos, Cron, Notificación).

**Workflows específicos:** solo si el cliente requiere integración con POS externo o proveedor LLM diferente.

**Sub-workflows reutilizables:** los CORE actuales (Apertura, Despacho, Pago) ya son sub-workflows del Director. Continuar con ese patrón.

**Routing:** `inbox_id` del payload Chatwoot → `restaurant_channel_configs` → `restaurante_id`.

**Carga dinámica de prompts:** nodo Postgres `Cargar Prompt` → tabla `restaurant_prompts` → inyectado en system message.

**Carga dinámica de reglas:** nodo Postgres `Cargar Reglas` → tabla `restaurant_business_rules` → reemplazado en template del prompt.

**Configuración por restaurante:** `restaurant_settings` + `restaurant_feature_flags` cargados al inicio del flujo.

**Versionamiento:** prompts versionados en DB + workflows versionados en git con tags semver.

**Testing por cliente:** flag `usar_prompt_test` + inbox separado para pruebas.

---

## K. Modelo de configuración dinámica — ejemplo JSON completo

```json
{
  "restaurante_id": 1,
  "nombre": "La Isla Pizzería",
  "zona_horaria": "Atlantic/Canary",
  "moneda": "€",
  "settings": {
    "metodos_pago": ["transferencia"],
    "modos_despacho": ["delivery", "retiro"],
    "delivery_minimo": 15.00,
    "cart_expiry_minutes": 30,
    "cart_warning_minutes": 5,
    "modelo_llm": "gpt-4.1-mini"
  },
  "feature_flags": {
    "delivery_activo": true,
    "retiro_activo": true,
    "pago_transferencia": true,
    "pago_efectivo": false,
    "multimodal_audio": true,
    "multimodal_imagen": true,
    "escalamiento_humano": true,
    "web_orders_activo": true
  },
  "channel_configs": {
    "whatsapp": {
      "inbox_id": 5,
      "phone_number": "+34613598934",
      "chatwoot_url": "https://la-isla-chatwoot.avtsif.easypanel.host",
      "escalamiento_numero": "+34600000000"
    }
  },
  "workflow_configs": {
    "apertura":       "WORKFLOW_ID_APERTURA",
    "despacho":       "WORKFLOW_ID_DESPACHO",
    "pago":           "WORKFLOW_ID_PAGO",
    "preguntas":      "WORKFLOW_ID_PREGUNTAS",
    "derivar_humano": "WORKFLOW_ID_DERIVAR"
  },
  "prompts": {
    "director": {
      "version": 3,
      "activo": true
    },
    "cerrado": {
      "version": 1,
      "activo": true
    }
  }
}
```

Este JSON es la representación de lo que la DB almacena por restaurante y lo que el panel SaaS expone para edición.

---

*Documento generado para EasyOrder — arquitectura interna. No distribuir.*
