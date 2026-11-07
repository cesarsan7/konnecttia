#!/usr/bin/env python3
"""
Despacho v2 (solo staging): el subflujo pide a la API de Konnecttia la cotización de recogida o
reparto en lugar de calcular zona, tarifa, mínimo y tiempo con SQL propio.

Qué cambia respecto a la v1 (integrations/n8n/flows/staging/[MVP] Despacho.json):
  - Nuevo nodo «Datos Restaurante»: slug y api_konnecttia_url del restaurante.
  - «Consultar Zona Delivery» (SQL por código postal o nombre) pasa a ser «Cotizar Reparto»
    (POST /public/<slug>/cotizacion): zonas por radio, código postal, toda la ciudad, tarifa por
    km, envío gratis, local que reparte, hora punta, modo ocupado y cola. Igual que la web.
  - Recogida: «Cotizar Retiro» antes de guardar; con varios locales pregunta cuál, o reconoce el
    que menciona el cliente. Guarda sucursal_id.
  - Las consultas de escritura usan parámetros ($1, $2…) en lugar de texto concatenado
    (antes una dirección con apóstrofo rompía la consulta).
  - Sin tiempos fijos en el código (antes 20 min, 30-45 min): si el restaurante no tiene tiempo
    configurado, el agente dice «a confirmar por el local».
  - El agente pregunta por los métodos de pago del restaurante (antes «efectivo o tarjeta»).
  - Director ([MVP] Pizzeria): la herramienta Despacho pasa el local elegido para recoger.
  - Reparto no disponible: respuesta propia para cada motivo de la API (fuera_de_cobertura,
    local_no_disponible y cualquiera nuevo), sin volver a pedir la dirección ni listar zonas.
  - Corrige «Persistir Delivery Pendiente», que leía restaurante_config sin filtrar por
    restaurante (con varios restaurantes podía usar el tiempo de otro).

Uso:  python3 integrations/n8n/scripts/despacho_v2.py   (reescribe el JSON de staging; la v1 queda en git)
"""

import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
ARCHIVO = RAIZ / "integrations" / "n8n" / "flows" / "staging" / "[MVP] Despacho.json"

TRIGGER = "$('When Executed by Another Workflow').first().json"
PEDIDO = "$('Obtener Pedido Activo').first().json"
DATOS = "$('Datos Restaurante').first().json"
CREDENCIAL = {"postgres": {"name": "staging postgres"}}

flujo = json.loads(ARCHIVO.read_text(encoding="utf-8"))
if any(n["name"] == "Datos Restaurante" for n in flujo["nodes"]):
    raise SystemExit("El flujo ya está en la v2")

nodos = {n["name"]: n for n in flujo["nodes"]}
conexiones = flujo["connections"]


def nodo(nombre, tipo, version, posicion, parametros, **extra):
    nuevo = {
        "parameters": parametros,
        "id": f"despacho-v2-{nombre.lower().replace(' ', '-').replace('¿', '').replace('?', '')}",
        "name": nombre,
        "type": tipo,
        "typeVersion": version,
        "position": posicion,
        **extra,
    }
    flujo["nodes"].append(nuevo)
    nodos[nombre] = nuevo
    return nuevo


def unir(origen, destino, salida=0, entrada=0):
    salidas = conexiones.setdefault(origen, {"main": []})["main"]
    while len(salidas) <= salida:
        salidas.append([])
    salidas[salida].append({"node": destino, "type": "main", "index": entrada})


def renombrar(viejo, nuevo):
    n = nodos.pop(viejo)
    n["name"] = nuevo
    nodos[nuevo] = n
    if viejo in conexiones:
        conexiones[nuevo] = conexiones.pop(viejo)
    for salidas in conexiones.values():
        for rama in salidas["main"]:
            for destino in rama:
                if destino["node"] == viejo:
                    destino["node"] = nuevo
    for otro in flujo["nodes"]:
        texto = json.dumps(otro["parameters"], ensure_ascii=False)
        if f"$('{viejo}')" in texto:
            otro["parameters"] = json.loads(texto.replace(f"$('{viejo}')", f"$('{nuevo}')"))


def cotizar(nombre, posicion, cuerpo_js):
    return nodo(
        nombre,
        "n8n-nodes-base.httpRequest",
        4.2,
        posicion,
        {
            "method": "POST",
            "url": f"={{{{ {DATOS}.api_url }}}}/public/{{{{ {DATOS}.slug }}}}/cotizacion",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": f"={{{{ JSON.stringify({cuerpo_js}) }}}}",
            "options": {"timeout": 8000},
        },
        onError="continueErrorOutput",
    )


# --- Datos del restaurante (slug y URL de la API) ---------------------------------------
nodo(
    "Datos Restaurante",
    "n8n-nodes-base.postgres",
    2.4,
    [-1008, 304],
    {
        "operation": "executeQuery",
        "query": (
            "SELECT r.slug, NULLIF(rtrim(trim(c.config_value), '/'), '') AS api_url\n"
            "FROM public.restaurante r\n"
            "LEFT JOIN public.restaurante_config c\n"
            "  ON c.restaurante_id = r.id AND c.config_key = 'api_konnecttia_url'\n"
            "WHERE r.id = $1"
        ),
        "options": {"queryReplacement": f"={{{{ [ {TRIGGER}.restaurante_id ] }}}}"},
    },
    credentials=CREDENCIAL,
    onError="continueErrorOutput",
)
rama_ok = conexiones["Obtener Pedido Activo"]["main"][0]
conexiones["Obtener Pedido Activo"]["main"][0] = [
    {"node": "Datos Restaurante", "type": "main", "index": 0}
]
conexiones["Datos Restaurante"] = {"main": [rama_ok, []]}
unir("Datos Restaurante", "Respuesta Error Sistema", salida=1)

# --- Recogida ----------------------------------------------------------------------------
cotizar(
    "Cotizar Retiro",
    [-672, 0],
    f"{{ tipo_despacho: 'retiro', subtotal: Number({PEDIDO}.subtotal || 0),"
    f" texto_local: String({TRIGGER}.direccion_texto || '') }}",
)
nodo(
    "¿Retiro Disponible?",
    "n8n-nodes-base.if",
    2.3,
    [-448, 0],
    {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 3},
            "conditions": [
                {
                    "id": "check-retiro",
                    "leftValue": "={{ $json.disponible }}",
                    "rightValue": True,
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                }
            ],
            "combinator": "and",
        },
        "options": {},
    },
)
nodo(
    "Respuesta Retiro No Disponible",
    "n8n-nodes-base.code",
    2,
    [448, -192],
    {
        "jsCode": """const q = $json || {};
const locales = Array.isArray(q.locales) ? q.locales : [];
let respuesta;
if (q.motivo === 'elegir_local' && locales.length > 0) {
  const lista = locales.map(l => l.direccion ? `${l.nombre} (${l.direccion})` : l.nombre).join(' o ');
  respuesta = `¿En qué local lo recoges: ${lista}?`;
} else if (q.motivo === 'local_cerrado') {
  respuesta = 'Ahora mismo el local está cerrado, así que no puedo tomar el pedido para recoger.';
} else if (q.motivo === 'recogida_no_disponible') {
  respuesta = 'Este restaurante no tiene recogida en el local. ¿Te lo enviamos a domicilio?';
} else {
  respuesta = 'No puedo preparar la recogida en ese local. ¿En cuál prefieres recogerlo?';
}
return [{ json: {
  success: false,
  motivo: q.motivo || 'retiro_no_disponible',
  tipo_despacho: 'retiro',
  respuesta_agente: respuesta,
  puede_continuar: false,
  mutar_db: false,
  locales
} }];"""
    },
)
conexiones["¿Es Retiro?"]["main"][0] = [{"node": "Cotizar Retiro", "type": "main", "index": 0}]
unir("Cotizar Retiro", "¿Retiro Disponible?")
unir("Cotizar Retiro", "Respuesta Error Sistema", salida=1)
unir("¿Retiro Disponible?", "Preparar Retiro", salida=0)
unir("¿Retiro Disponible?", "Respuesta Retiro No Disponible", salida=1)
unir("Respuesta Retiro No Disponible", "Merge Respuesta Final", entrada=1)

nodos["Preparar Retiro"]["parameters"]["jsCode"] = f"""const trigger = {TRIGGER} || {{}};
const pedido = {PEDIDO} || {{}};
const q = $('Cotizar Retiro').first().json || {{}};

// pedido.id puede ser string o numero segun variante de funcion; trigger.pedido_id es el fallback seguro
const pedidoId = pedido.id || pedido.pedido_id || trigger.pedido_id;

return [{{
  json: {{
    pedido_id: pedidoId,
    pedido_numero: pedido.pedido_numero,
    pedido_codigo: pedido.pedido_codigo || null,
    tipo_despacho: 'retiro',
    fee: 0,
    subtotal: Number(pedido.subtotal || 0),
    total: Number(pedido.subtotal || 0),
    sucursal_id: q.local ? q.local.id : null,
    local_nombre: q.local ? q.local.nombre : null,
    local_direccion: q.local ? q.local.direccion : null,
    tiempo_estimado: q.tiempo_estimado || null,
    telefono: trigger.telefono,
    session_id: trigger.session_id
  }}
}}];"""

nodos["Actualizar Pedido Retiro"]["parameters"] = {
    "operation": "executeQuery",
    "query": (
        "UPDATE pedidos\n"
        "SET\n"
        "  tipo_despacho = 'retiro',\n"
        "  direccion = NULL,\n"
        "  lat = NULL,\n"
        "  lng = NULL,\n"
        "  distancia_km = NULL,\n"
        "  costo_envio = 0,\n"
        "  total = subtotal,\n"
        "  sucursal_id = COALESCE($2::bigint, sucursal_id),\n"
        "  tiempo_estimado = NULLIF($3, ''),\n"
        "  updated_at = NOW()\n"
        "WHERE id = $1::int AND restaurante_id = $4::int\n"
        "RETURNING *,\n"
        "  (SELECT datos_bancarios FROM restaurante WHERE id = pedidos.restaurante_id LIMIT 1) AS datos_bancarios"
    ),
    "options": {
        "queryReplacement": (
            "={{ [ $json.pedido_id, $json.sucursal_id, $json.tiempo_estimado || '', "
            f"{TRIGGER}.restaurante_id ] }}}}"
        )
    },
}

PAGO_JS = """const metodos = ($('{nodo}').first().json.metodos_pago || []);
const NOMBRES = {{ efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia', bizum: 'Bizum' }};
const lista = metodos.map(m => NOMBRES[m] || m);
const preguntaPago = lista.length > 1
  ? `¿Cómo vas a pagar: ${{lista.slice(0, -1).join(', ')}} o ${{lista[lista.length - 1]}}?`
  : lista.length === 1 ? `El pago es en ${{lista[0]}}. ¿Te parece bien?` : '¿Cómo vas a pagar?';"""

nodos["Respuesta Retiro"]["parameters"]["jsCode"] = (
    PAGO_JS.format(nodo="Cotizar Retiro")
    + """
const pedidoDB = $json || {};
const prep = $('Preparar Retiro').first().json || {};
const subtotal = Number(pedidoDB.subtotal || 0);
const tiempo = pedidoDB.tiempo_estimado || 'a confirmar por el local';
const nombre = pedidoDB.nombre_cliente && pedidoDB.nombre_cliente !== 'no definida' ? pedidoDB.nombre_cliente : null;
const local = prep.local_nombre ? ` en ${prep.local_nombre}${prep.local_direccion ? ` (${prep.local_direccion})` : ''}` : ' en el local';

function money(v) {
  return '€' + Number(v || 0).toFixed(2).replace('.', ',');
}

return [{
  json: {
    success: true,
    tipo_despacho: 'retiro',
    respuesta_agente: `Perfecto, tu pedido${pedidoDB.pedido_codigo ? ` ${pedidoDB.pedido_codigo}` : ''} será para recoger${local}. Tiempo estimado: ${tiempo}. Subtotal: ${money(subtotal)}.${!nombre ? ' ¿Cuál es tu nombre?' : ` ${preguntaPago}`}`,
    pedido_id: pedidoDB.id,
    pedido_numero: pedidoDB.pedido_numero,
    pedido_codigo: pedidoDB.pedido_codigo || null,
    subtotal,
    costo_envio: 0,
    total: subtotal,
    tiempo_estimado: pedidoDB.tiempo_estimado || null,
    sucursal_id: prep.sucursal_id || null,
    nombre_conocido: !!nombre
  }
}];"""
)

# --- Reparto -----------------------------------------------------------------------------
renombrar("Consultar Zona Delivery", "Cotizar Reparto")
viejo = nodos["Cotizar Reparto"]
flujo["nodes"].remove(viejo)
posicion = viejo["position"]
del nodos["Cotizar Reparto"]
COORD = (
    "(v => (v === '' || v == null || isNaN(Number(v))) ? undefined : Number(v))"
)
cotizar(
    "Cotizar Reparto",
    posicion,
    "{ tipo_despacho: 'delivery', subtotal: Number(" + PEDIDO + ".subtotal || 0),"
    " lat: " + COORD + "(" + TRIGGER + ".lat ?? " + PEDIDO + ".lat),"
    " lng: " + COORD + "(" + TRIGGER + ".lng ?? " + PEDIDO + ".lng),"
    " codigo_postal: $('Detectar Zona').first().json.postalCode || undefined,"
    " zona_nombre: $('Detectar Zona').first().json.matchedZone || undefined }",
)
nodos["¿Zona Encontrada?"]["parameters"]["conditions"]["conditions"] = [
    {
        "id": "check-zona",
        "leftValue": "={{ $json.disponible }}",
        "rightValue": True,
        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
    }
]

nodos["Validar Mínimo y Calcular Total"]["parameters"]["jsCode"] = f"""const trigger = {TRIGGER} || {{}};
const pedido = {PEDIDO} || {{}};
const q = $('Cotizar Reparto').first().json || {{}};

function money(v) {{
  return '€' + Number(v || 0).toFixed(2).replace('.', ',');
}}

// Filtrar palabras clave de tipo — no son direcciones reales
const TIPO_KW = ['delivery','retiro','retirar','recoger','pickup'];
const rawAddr = String(trigger.direccion_texto || '').trim();
const isTipoKeyword = TIPO_KW.includes(rawAddr.toLowerCase());
const efectivaDireccion = isTipoKeyword
  ? (pedido.direccion || '')
  : (rawAddr || pedido.direccion || '');

const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
const subtotal = Number(q.subtotal ?? pedido.subtotal ?? 0);
const fee = Number(q.envio || 0);

const base = {{
  pedido_id: pedido.id || pedido.pedido_id || trigger.pedido_id,
  pedido_numero: pedido.pedido_numero,
  pedido_codigo: pedido.pedido_codigo || null,
  tipo_despacho: 'delivery',
  direccion: efectivaDireccion,
  codigo_postal: trigger.codigo_postal || q.codigo_postal || '',
  lat: num(trigger.lat) ?? num(pedido.lat),
  lng: num(trigger.lng) ?? num(pedido.lng),
  zona_nombre: q.zona ? q.zona.nombre : null,
  sucursal_id: q.local ? q.local.id : null,
  distancia_km: q.distancia_km ?? null,
  fee,
  subtotal,
  total: Number(q.total ?? subtotal + fee),
  minimo: Number(q.minimo || 0),
  falta_para_minimo: Number(q.falta_para_minimo || 0),
  envio_gratis_desde: q.envio_gratis_desde ?? null,
  tiempo_estimado: q.tiempo_estimado || null,
  telefono: trigger.telefono,
  session_id: trigger.session_id
}};

if (!q.alcanza_minimo) {{
  return [{{
    json: {{
      ...base,
      puede_continuar: false,
      motivo: 'minimo_no_alcanzado',
      delivery_pendiente_minimo: true,
      respuesta_agente: `Mantengo delivery a ${{base.direccion}}. Tu pedido es de ${{money(subtotal)}} y el mínimo para esa zona es ${{money(base.minimo)}} (faltan ${{money(base.falta_para_minimo)}}). ¿Quieres agregar algo más para llegar al mínimo o prefieres pasar a retiro?`
    }}
  }}];
}}

return [{{
  json: {{
    ...base,
    puede_continuar: true,
    delivery_pendiente_minimo: false
  }}
}}];"""

ESCRITURA_DELIVERY = (
    "UPDATE pedidos\n"
    "SET\n"
    "  tipo_despacho = 'delivery',\n"
    "  direccion = NULLIF($2, ''),\n"
    "  lat = $3::numeric,\n"
    "  lng = $4::numeric,\n"
    "  postal_code = NULLIF($5, ''),\n"
    "  costo_envio = $6::numeric,\n"
    "  total = $7::numeric,\n"
    "  tiempo_estimado = NULLIF($8, ''),\n"
    "  sucursal_id = COALESCE($9::bigint, sucursal_id),\n"
    "  distancia_km = $10::numeric,\n"
    "  updated_at = NOW()\n"
    "WHERE id = $1::int AND restaurante_id = $11::int\n"
    "RETURNING *{extra}"
)
PARAMS_DELIVERY = (
    "={{ [ $json.pedido_id, $json.direccion || '', $json.lat, $json.lng, "
    "String($json.codigo_postal || ''), Number($json.fee || 0), Number($json.total || 0), "
    "$json.tiempo_estimado || '', $json.sucursal_id, $json.distancia_km, "
    f"{TRIGGER}.restaurante_id ] }}}}"
)
nodos["Actualizar Pedido Delivery"]["parameters"] = {
    "operation": "executeQuery",
    "query": ESCRITURA_DELIVERY.format(
        extra=",\n  (SELECT datos_bancarios FROM restaurante WHERE id = pedidos.restaurante_id LIMIT 1) AS datos_bancarios"
    ),
    "options": {"queryReplacement": PARAMS_DELIVERY},
}
nodos["Persistir Delivery Pendiente"]["parameters"] = {
    "operation": "executeQuery",
    "query": ESCRITURA_DELIVERY.format(extra=""),
    "options": {"queryReplacement": PARAMS_DELIVERY},
}

nodos["Respuesta Delivery OK"]["parameters"]["jsCode"] = (
    PAGO_JS.format(nodo="Cotizar Reparto")
    + """
const pedidoDB = $json || {};
const fee = Number(pedidoDB.costo_envio || 0);
const subtotal = Number(pedidoDB.subtotal || 0);
const total = Number(pedidoDB.total || 0);
const tiempo = pedidoDB.tiempo_estimado || 'a confirmar por el local';
const nombre = pedidoDB.nombre_cliente && pedidoDB.nombre_cliente !== 'no definida' ? pedidoDB.nombre_cliente : null;

function money(v) {
  return '€' + Number(v || 0).toFixed(2).replace('.', ',');
}

return [{
  json: {
    success: true,
    tipo_despacho: 'delivery',
    respuesta_agente: `Perfecto, delivery${pedidoDB.direccion ? ` a ${pedidoDB.direccion}` : ''}. Costo de envío: ${fee === 0 ? 'gratis' : money(fee)}. Tiempo estimado: ${tiempo}. Total: ${money(total)}.${!nombre ? ' ¿Cuál es tu nombre?' : ` ${preguntaPago}`}`,
    pedido_id: pedidoDB.id,
    pedido_numero: pedidoDB.pedido_numero,
    pedido_codigo: pedidoDB.pedido_codigo || null,
    subtotal,
    costo_envio: fee,
    total,
    direccion: pedidoDB.direccion,
    tiempo_estimado: pedidoDB.tiempo_estimado || null,
    sucursal_id: pedidoDB.sucursal_id || null,
    nombre_conocido: !!nombre
  }
}];"""
)

nodos["Respuesta Mínimo Delivery"]["parameters"]["jsCode"] = """const pedidoDB = $json || {};
const trigger = $('When Executed by Another Workflow').first().json || {};
const q = $('Cotizar Reparto').first().json || {};

function money(v) {
  return '€' + Number(v || 0).toFixed(2).replace('.', ',');
}

const subtotal = Number(pedidoDB.subtotal || 0);
const fee = Number(pedidoDB.costo_envio || 0);
const minimo = Number(q.minimo || 0);
const falta = Number(q.falta_para_minimo || Math.max(0, minimo - subtotal));
const totalEstimado = subtotal + fee;
const tiempo = pedidoDB.tiempo_estimado || 'a confirmar por el local';

return [{
  json: {
    success: false,
    motivo: 'minimo_no_alcanzado',
    tipo_despacho: 'delivery',
    respuesta_agente: `Mantengo delivery${pedidoDB.direccion ? ` a ${pedidoDB.direccion}` : ''}. Tu pedido va en ${money(subtotal)} y el mínimo para esa zona es ${money(minimo)}: faltan ${money(falta)}. Si llegas al mínimo, el total estimado con envío será ${money(totalEstimado)} y el tiempo estimado será ${tiempo}. ¿Quieres agregar algo más o prefieres pasar a retiro?`,
    pedido_id: pedidoDB.id,
    pedido_numero: pedidoDB.pedido_numero,
    pedido_codigo: pedidoDB.pedido_codigo || null,
    subtotal,
    costo_envio: fee,
    total_estimado: totalEstimado,
    falta_para_minimo: falta,
    direccion: pedidoDB.direccion || trigger.direccion_texto || null,
    tiempo_estimado: pedidoDB.tiempo_estimado || null
  }
}];"""

# Fuera de cobertura: antes de la lógica de v1, los motivos que da la API.
fuera = nodos["Respuesta Fuera Cobertura"]["parameters"]["jsCode"]
fuera = fuera.replace(
    "let respuesta, motivo;\n",
    """let respuesta, motivo;
const cot = $('Cotizar Reparto').first().json || {};
if (cot.motivo === 'ubicacion_necesaria') {
  return [{ json: {
    success: false, motivo: 'ubicacion_necesaria', puede_continuar: false, mutar_db: false,
    respuesta_agente: 'Para saber si llegamos a tu dirección, compárteme tu ubicación por WhatsApp (📎 → Ubicación). También puedes pasar a recogida en el local.'
  } }];
}
if (cot.motivo === 'local_cerrado') {
  return [{ json: {
    success: false, motivo: 'local_cerrado', puede_continuar: false, mutar_db: false,
    respuesta_agente: 'Ahora mismo el local que reparte en tu zona está cerrado, así que no puedo tomar el pedido a domicilio.'
  } }];
}
if (cot.motivo === 'reparto_no_disponible') {
  return [{ json: {
    success: false, motivo: 'reparto_no_disponible', puede_continuar: false, mutar_db: false,
    respuesta_agente: 'Este restaurante no tiene reparto a domicilio. ¿Te lo preparamos para recoger en el local?'
  } }];
}
if (cot.motivo === 'fuera_de_cobertura') {
  // La API ya comprobó la ubicación: no pedir otra vez la dirección ni listar zonas.
  // Se mantiene el delivery; el cambio a recogida solo si el cliente lo confirma.
  const dir = String(trigger.direccion_texto || '').trim();
  const esTipo = ['delivery','retiro','retirar','recoger','pickup'].includes(dir.toLowerCase());
  const donde = dir && !esTipo ? `"${dir}"` : 'esa ubicación';
  return [{ json: {
    success: false, motivo: 'fuera_de_cobertura', puede_continuar: false, mutar_db: false,
    respuesta_agente: `Lo siento, ${donde} queda fuera de nuestra zona de reparto. ¿Quieres probar con otra dirección o prefieres recogerlo en el local?`
  } }];
}
if (cot.motivo === 'local_no_disponible') {
  return [{ json: {
    success: false, motivo: 'local_no_disponible', puede_continuar: false, mutar_db: false,
    respuesta_agente: 'Ahora mismo el local que reparte en tu zona no está recibiendo pedidos a domicilio. ¿Prefieres recogerlo en el local?'
  } }];
}
if (cot.motivo) {
  // Motivo nuevo de la API: respuesta neutra en lugar de la lógica de zonas de v1 (La Isla).
  return [{ json: {
    success: false, motivo: String(cot.motivo), puede_continuar: false, mutar_db: false,
    respuesta_agente: 'No he podido confirmar el reparto a esa dirección. ¿Quieres probar con otra o prefieres recogerlo en el local?'
  } }];
}
""",
)
nodos["Respuesta Fuera Cobertura"]["parameters"]["jsCode"] = fuera

flujo["versionId"] = "despacho-v2-fuera-cobertura"

# --- Director (Pizzeria): para recoger, que pase el local que eligió el cliente ---------------
DIRECTOR = RAIZ / "integrations" / "n8n" / "flows" / "staging" / "[MVP] Pizzeria.json"
director = json.loads(DIRECTOR.read_text(encoding="utf-8"))
herramienta = next(n for n in director["nodes"] if n["name"] == "Despacho")
entradas = herramienta["parameters"]["workflowInputs"]["value"]
ANTES = "Dirección de entrega en texto. Para retiro envía cadena vacía."
AHORA = (
    "Dirección de entrega en texto. Para retiro: el local donde quiere recoger si el cliente lo "
    "dijo (nombre o calle, p. ej. «Siempre Juntos 1» o «el de Carlos V»); si no lo dijo, cadena vacía."
)
if ANTES not in entradas["direccion_texto"]:
    raise SystemExit("La descripción de direccion_texto del Director no es la esperada")
entradas["direccion_texto"] = entradas["direccion_texto"].replace(ANTES, AHORA)
ARCHIVO.write_text(json.dumps(flujo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
DIRECTOR.write_text(json.dumps(director, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Despacho v2 escrito en {ARCHIVO.relative_to(RAIZ)} ({len(flujo['nodes'])} nodos)")
print(f"Director actualizado: {DIRECTOR.relative_to(RAIZ)} (herramienta Despacho, direccion_texto)")
