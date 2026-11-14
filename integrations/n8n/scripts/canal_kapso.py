#!/usr/bin/env python3
"""
Genera los dos flujos del adaptador de canal con Kapso (diseño: diseno/adaptador-canal-kapso.md):

  «[Canal] Entrada Kapso»    Un webhook para todos los restaurantes: verifica la firma, descarta
                             entregas repetidas, resuelve el restaurante por el número que recibe
                             el mensaje, respeta la pausa del agente y entrega un MensajeEntrante.
  «[Canal] Enviar mensaje»   Único subflujo de salida: texto, botones, lista, petición de
                             ubicación y plantilla, con alternativa en texto numerado.

Los flujos se escriben en flows/staging/. Se pueden regenerar: este script es la fuente de los
dos archivos (cambia el script, no el JSON).

PR A: «Entrada» termina con una respuesta de identidad de prueba («Soy el agente de pedidos del
restaurante X…») para probar el canal de punta a punta. El PR B sustituye esa respuesta por el
Director.

Uso:  python3 integrations/n8n/scripts/canal_kapso.py
"""

import json
import uuid
from pathlib import Path

DESTINO = Path(__file__).resolve().parents[1] / "flows" / "staging"

ID_ENTRADA = "CnEntradaKapso01"
ID_ENVIAR = "CnEnviarMensaje1"
NOMBRE_ENTRADA = "[Canal] Entrada Kapso"
NOMBRE_ENVIAR = "[Canal] Enviar mensaje"

CRED_POSTGRES = {"postgres": {"name": "staging_postgres"}}
CRED_KAPSO = {"kapsoApi": {"name": "staging_kapso"}}
NODO_KAPSO = "@kapso/n8n-nodes-kapso.kapso"


def uid(texto: str) -> str:
    """Id estable por nombre: el JSON no cambia entre ejecuciones."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "konnecttia-canal-kapso/" + texto))


def nodo(nombre, tipo, version, parametros, posicion, credenciales=None, **extra):
    n = {
        "parameters": parametros,
        "id": uid(nombre),
        "name": nombre,
        "type": tipo,
        "typeVersion": version,
        "position": list(posicion),
    }
    if credenciales:
        n["credentials"] = credenciales
    n.update(extra)
    return n


def codigo(nombre, js, posicion, por_item=False):
    parametros = {"jsCode": js}
    if por_item:
        parametros["mode"] = "runOnceForEachItem"
    return nodo(nombre, "n8n-nodes-base.code", 2, parametros, posicion)


def sql(nombre, consulta, parametros_sql, posicion, siempre_salida=False):
    opciones = {}
    if parametros_sql:
        opciones["queryReplacement"] = "={{ [ " + ", ".join(parametros_sql) + " ] }}"
    extra = {"alwaysOutputData": True} if siempre_salida else {}
    return nodo(
        nombre,
        "n8n-nodes-base.postgres",
        2.5,
        {"operation": "executeQuery", "query": consulta, "options": opciones},
        posicion,
        CRED_POSTGRES,
        **extra,
    )


def si_booleano(nombre, expresion, posicion):
    return nodo(
        nombre,
        "n8n-nodes-base.if",
        2.3,
        {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 3},
                "conditions": [
                    {
                        "id": uid(nombre + "/condicion"),
                        "leftValue": "={{ " + expresion + " }}",
                        "rightValue": True,
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                    }
                ],
                "combinator": "and",
            },
            "options": {},
        },
        posicion,
    )


def conexiones(*aristas):
    """aristas: (origen, destino) o (origen, destino, salida)."""
    resultado = {}
    for arista in aristas:
        origen, destino = arista[0], arista[1]
        salida = arista[2] if len(arista) > 2 else 0
        salidas = resultado.setdefault(origen, {"main": []})["main"]
        while len(salidas) <= salida:
            salidas.append([])
        salidas[salida].append({"node": destino, "type": "main", "index": 0})
    return resultado


def flujo(ident, nombre, nodos, aristas):
    return {
        "name": nombre,
        "nodes": nodos,
        "pinData": {},
        "connections": conexiones(*aristas),
        "active": False,
        "settings": {"executionOrder": "v1"},
        "id": ident,
        "tags": [],
    }


# --------------------------------------------------------------------------------------
# «[Canal] Entrada Kapso»
# --------------------------------------------------------------------------------------

JS_VERIFICAR_FIRMA = r"""// Kapso firma el cuerpo crudo con HMAC-SHA256 (hex) en X-Webhook-Signature.
// El secreto va en la variable de entorno KAPSO_WEBHOOK_SECRET del servicio n8n (no en el flujo).
const crypto = require('crypto');
const entrada = $input.first();
const cabeceras = entrada.json.headers || {};
const cab = (n) => cabeceras[n] ?? cabeceras[n.toLowerCase()];
const secreto = $env.KAPSO_WEBHOOK_SECRET;
if (!secreto) throw new Error('Falta KAPSO_WEBHOOK_SECRET en el entorno de n8n');

const crudo = await this.helpers.getBinaryDataBuffer(0, 'data');
const firma = String(cab('x-webhook-signature') || '').replace(/^sha256=/, '');
const esperada = crypto.createHmac('sha256', secreto).update(crudo).digest('hex');
let valida = false;
try {
  const a = Buffer.from(firma, 'hex');
  const b = Buffer.from(esperada, 'hex');
  valida = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
} catch (e) {
  valida = false;
}
if (!valida) return []; // firma inválida: se descarta (queda la ejecución sin salida)

let cuerpo;
try {
  cuerpo = JSON.parse(crudo.toString('utf8'));
} catch (e) {
  return [];
}
// Sin X-Idempotency-Key se usa el hash del cuerpo como clave de la entrega.
const clave = String(cab('x-idempotency-key') || crypto.createHash('sha256').update(crudo).digest('hex')).slice(0, 128);
return [{ json: { clave, evento: cab('x-webhook-event') || '', lote: cab('x-webhook-batch') === 'true', cuerpo } }];
"""

JS_DESEMPAQUETAR = r"""// Desempaqueta la entrega (lote o evento suelto), clasifica y agrupa por conversación.
// Formato v2 de Kapso: { message, conversation, phone_number_id } por evento. Los nombres de
// campos marcados «confirmar» se comprueban con el sandbox (ver el diseño, sección 9).
const { cuerpo, evento } = $('Verificar firma').first().json;
const lista = Array.isArray(cuerpo)
  ? cuerpo
  : Array.isArray(cuerpo && cuerpo.data)
    ? cuerpo.data
    : [(cuerpo && cuerpo.data) || cuerpo];

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const e164 = (v) => (soloDigitos(v) ? '+' + soloDigitos(v) : null);

function textoDe(m) {
  const t = m.type;
  if (t === 'text') return (m.text && m.text.body) || (typeof m.text === 'string' ? m.text : '') || '';
  if (t === 'audio') return (m.kapso && m.kapso.transcript && m.kapso.transcript.text) || '';
  if (t === 'image' || t === 'video' || t === 'document') return (m[t] && m[t].caption) || '';
  if (t === 'button') return (m.button && m.button.text) || '';
  if (t === 'interactive') {
    const i = m.interactive || {};
    return (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || '';
  }
  return '';
}

const grupos = new Map();
const personal = new Map();
for (const e of lista) {
  const m = e.message || {};
  const conv = e.conversation || {};
  const phoneNumberId = String(e.phone_number_id || conv.phone_number_id || '');
  if (!phoneNumberId) continue;
  const tipoEvento = e.event || evento;
  const origen = (m.kapso && m.kapso.origin) || '';

  if (tipoEvento === 'whatsapp.message.sent') {
    if (origen !== 'business_app') continue; // respuestas propias y otros orígenes: se ignoran
    const tel = e164(m.to || conv.phone_number);
    if (tel) personal.set(phoneNumberId + '|' + tel, { tipo: 'personal', phone_number_id: phoneNumberId, telefono: tel });
    continue;
  }
  if (tipoEvento !== 'whatsapp.message.received') continue;

  const tel = e164(m.from || conv.phone_number);
  if (!tel) continue; // sin teléfono (solo BSUID): por ahora no se atiende
  const clave = phoneNumberId + '|' + tel;
  if (!grupos.has(clave)) {
    grupos.set(clave, {
      tipo: 'cliente',
      phone_number_id: phoneNumberId,
      conversacion_id: conv.id || null,
      cliente: { telefono: tel, bsuid: m.user_id || null, nombre: conv.contact_name || (e.contact && e.contact.name) || null },
      textos: [],
      ubicacion: null,
      adjuntos: [],
      respuesta_interactiva: null,
      mensaje_ids: [],
      recibido_at: null,
    });
  }
  const g = grupos.get(clave);
  const txt = textoDe(m).trim();
  if (txt) g.textos.push(txt);
  if (m.id) g.mensaje_ids.push(m.id);
  if (m.timestamp && !g.recibido_at) g.recibido_at = new Date(Number(m.timestamp) * 1000).toISOString();
  if (m.type === 'location' && m.location) {
    g.ubicacion = { lat: m.location.latitude, lng: m.location.longitude, direccion: m.location.address || m.location.name || null };
  }
  if (['audio', 'image', 'video', 'document'].includes(m.type)) {
    const medio = m[m.type] || {};
    g.adjuntos.push({
      tipo: m.type,
      url: medio.link || (m.kapso && m.kapso.media_url) || null, // confirmar
      transcripcion: (m.kapso && m.kapso.transcript && m.kapso.transcript.text) || null,
      mime: medio.mime_type || null,
      id: medio.id || null,
    });
  }
  if (m.type === 'interactive' && m.interactive) {
    const r = m.interactive.button_reply || m.interactive.list_reply;
    if (r) g.respuesta_interactiva = { id: r.id, titulo: r.title };
  }
}

const salida = [];
for (const g of grupos.values()) {
  salida.push({ json: { ...g, texto: g.textos.join('\n'), textos: undefined, recibido_at: g.recibido_at || new Date().toISOString() } });
}
for (const p of personal.values()) salida.push({ json: p });
return salida;
"""

SQL_RESOLVER_CANAL = """SELECT c.id AS canal_id,
       c.restaurante_id,
       c.sucursal_id,
       r.nombre AS restaurante_nombre,
       EXISTS (SELECT 1 FROM public.restaurante_modulo m
                WHERE m.restaurante_id = c.restaurante_id
                  AND m.modulo_code = 'whatsapp.agent' AND m.estado = 'activo') AS modulo_activo,
       COALESCE((SELECT config_value FROM public.restaurante_config
                  WHERE restaurante_id = c.restaurante_id AND config_key = 'agente_activo'), 'false') AS agente_activo,
       COALESCE((SELECT config_value FROM public.restaurante_config
                  WHERE restaurante_id = c.restaurante_id AND config_key = 'agente_pausa_minutos'), '0') AS pausa_minutos
FROM public.canal_whatsapp c
JOIN public.restaurante r ON r.id = c.restaurante_id
WHERE c.proveedor = 'kapso' AND c.phone_number_id = $1 AND c.estado = 'activo'
LIMIT 1;"""

JS_PREPARAR = r"""// Une el mensaje con el canal resuelto y decide si el agente atiende a este restaurante.
const d = $('Desempaquetar').item.json;
const c = $json;
const activo = c.modulo_activo === true && String(c.agente_activo).trim().toLowerCase() === 'true';
return { json: { ...d, ...c, pausa_minutos: Math.max(0, parseInt(c.pausa_minutos, 10) || 0), agente_ok: activo, es_personal: d.tipo === 'personal' } };
"""

SQL_PAUSAR = """INSERT INTO public.whatsapp_conversacion (canal_id, restaurante_id, telefono, pausado_hasta, pausado_por)
SELECT $1::bigint, $2::int, $3, now() + make_interval(mins => $4::int), 'personal'
WHERE $4::int > 0
ON CONFLICT (canal_id, telefono) DO UPDATE
  SET pausado_hasta = EXCLUDED.pausado_hasta, pausado_por = 'personal', updated_at = now();"""

SQL_REGISTRAR_ENTRANTE = """INSERT INTO public.whatsapp_conversacion (canal_id, restaurante_id, telefono, ultimo_entrante_at)
VALUES ($1::bigint, $2::int, $3, now())
ON CONFLICT (canal_id, telefono) DO UPDATE SET ultimo_entrante_at = now(), updated_at = now()
RETURNING (pausado_hasta IS NOT NULL AND pausado_hasta > now()) AS pausada;"""

JS_MENSAJE_ENTRANTE = r"""// Contrato MensajeEntrante (diseño, sección 2): lo único que ven el Director y los subflujos.
const p = $('Preparar').item.json;
return {
  json: {
    restaurante_id: p.restaurante_id,
    sucursal_id: p.sucursal_id,
    canal_id: p.canal_id,
    proveedor: 'kapso',
    phone_number_id: p.phone_number_id,
    conversacion_id: p.conversacion_id,
    restaurante_nombre: p.restaurante_nombre,
    cliente: p.cliente,
    texto: p.texto,
    ubicacion: p.ubicacion,
    adjuntos: p.adjuntos,
    respuesta_interactiva: p.respuesta_interactiva,
    mensaje_ids: p.mensaje_ids,
    recibido_at: p.recibido_at,
  },
};
"""

JS_RESPUESTA_PRUEBA = r"""// PR A: respuesta de identidad para probar el canal. El PR B la sustituye por el Director.
const m = $('MensajeEntrante').item.json;
const recibido = (m.texto || '(sin texto)').slice(0, 200);
return {
  json: {
    restaurante_id: m.restaurante_id,
    canal_id: m.canal_id,
    destinatario: m.cliente.telefono,
    tipo: 'texto',
    texto: `Soy el agente de pedidos del restaurante ${m.restaurante_nombre}. Recibí tu mensaje: «${recibido}». (Prueba del canal: el agente completo se conecta en el siguiente paso.)`,
  },
};
"""


def flujo_entrada():
    nodos = [
        nodo(
            "Webhook Kapso",
            "n8n-nodes-base.webhook",
            2.1,
            {"httpMethod": "POST", "path": "kapso-entrada", "responseMode": "onReceived", "options": {"rawBody": True}},
            (0, 0),
            webhookId=uid("webhook-kapso-entrada"),
        ),
        codigo("Verificar firma", JS_VERIFICAR_FIRMA, (240, 0)),
        sql(
            "Evento nuevo",
            "INSERT INTO public.whatsapp_evento (clave) VALUES ($1)\nON CONFLICT (clave) DO NOTHING\nRETURNING clave;",
            ["$json.clave"],
            (480, 0),
        ),
        codigo("Desempaquetar", JS_DESEMPAQUETAR, (720, 0)),
        sql("Resolver canal", SQL_RESOLVER_CANAL, ["$json.phone_number_id"], (960, 0)),
        codigo("Preparar", JS_PREPARAR, (1200, 0), por_item=True),
        si_booleano("¿Agente activo?", "$json.agente_ok", (1440, 0)),
        si_booleano("¿Escribió el personal?", "$json.es_personal", (1680, 0)),
        sql(
            "Pausar agente",
            SQL_PAUSAR,
            ["$json.canal_id", "$json.restaurante_id", "$json.telefono", "$json.pausa_minutos"],
            (1920, -160),
        ),
        sql(
            "Registrar entrante",
            SQL_REGISTRAR_ENTRANTE,
            ["$json.canal_id", "$json.restaurante_id", "$json.cliente.telefono"],
            (1920, 160),
        ),
        si_booleano("¿Conversación sin pausa?", "$json.pausada === false", (2160, 160)),
        codigo("MensajeEntrante", JS_MENSAJE_ENTRANTE, (2400, 160), por_item=True),
        nodo(
            "Marcar leído",
            NODO_KAPSO,
            1,
            {
                "resource": "whatsAppMessage",
                "operation": "markAsRead",
                "phoneNumberId": "={{ $json.phone_number_id }}",
                "messageId": "={{ $json.mensaje_ids[$json.mensaje_ids.length - 1] }}",
                "typingIndicator": True,
            },
            (2640, 160),
            CRED_KAPSO,
            onError="continueRegularOutput",
        ),
        codigo("Respuesta de prueba", JS_RESPUESTA_PRUEBA, (2880, 160), por_item=True),
        nodo(
            "Enviar mensaje",
            "n8n-nodes-base.executeWorkflow",
            1.3,
            {
                "workflowId": {
                    "__rl": True,
                    "value": ID_ENVIAR,
                    "mode": "list",
                    "cachedResultUrl": f"/workflow/{ID_ENVIAR}",
                    "cachedResultName": NOMBRE_ENVIAR,
                },
                "options": {},
            },
            (3120, 160),
        ),
    ]
    aristas = [
        ("Webhook Kapso", "Verificar firma"),
        ("Verificar firma", "Evento nuevo"),
        ("Evento nuevo", "Desempaquetar"),
        ("Desempaquetar", "Resolver canal"),
        ("Resolver canal", "Preparar"),
        ("Preparar", "¿Agente activo?"),
        ("¿Agente activo?", "¿Escribió el personal?", 0),
        ("¿Escribió el personal?", "Pausar agente", 0),
        ("¿Escribió el personal?", "Registrar entrante", 1),
        ("Registrar entrante", "¿Conversación sin pausa?"),
        ("¿Conversación sin pausa?", "MensajeEntrante", 0),
        ("MensajeEntrante", "Marcar leído"),
        ("Marcar leído", "Respuesta de prueba"),
        ("Respuesta de prueba", "Enviar mensaje"),
    ]
    return flujo(ID_ENTRADA, NOMBRE_ENTRADA, nodos, aristas)


# --------------------------------------------------------------------------------------
# «[Canal] Enviar mensaje»
# --------------------------------------------------------------------------------------

SQL_CANAL_SALIDA = """SELECT c.id AS canal_id,
       c.phone_number_id,
       (SELECT w.ultimo_entrante_at FROM public.whatsapp_conversacion w
         WHERE w.canal_id = c.id AND w.telefono = $2) AS ultimo_entrante_at
FROM public.canal_whatsapp c
WHERE c.restaurante_id = $1::int AND c.proveedor = 'kapso' AND c.estado = 'activo'
  AND ($3::bigint IS NULL OR c.id = $3::bigint)
ORDER BY (c.sucursal_id IS NOT NULL), c.id
LIMIT 1;"""

JS_CONSTRUIR_PAYLOAD = r"""// Entrada (subflujo): restaurante_id, canal_id (opcional), destinatario, tipo, texto,
// botones[], lista{}, plantilla{}. Salida: el cuerpo para la API de mensajes (formato Cloud API).
const m = $('Entrada').first().json;
const canal = $input.first().json;
const para = String(m.destinatario || '').replace(/\D/g, '');
const tipo = m.tipo || 'texto';
const texto = String(m.texto || '').trim();
const base = { restaurante_id: m.restaurante_id, destinatario: para ? '+' + para : null };
const no = (motivo) => [{ json: { ...base, enviar: false, motivo } }];

if (!canal.phone_number_id) return no('sin_canal');
if (!para) return no('sin_destinatario');
if (tipo !== 'plantilla' && !texto) return no('mensaje_vacio');

// Ventana de 24 h: solo se puede escribir libremente si el cliente escribió hace menos de 24 h.
const ventana = canal.ultimo_entrante_at && Date.now() - new Date(canal.ultimo_entrante_at).getTime() < 24 * 3600 * 1000;
if (tipo !== 'plantilla' && !ventana) return no('fuera_de_ventana');

const numerado = (lineas) => texto + '\n\n' + lineas.map((l, i) => `${i + 1}. ${l}`).join('\n');
let cuerpo;

if (tipo === 'botones') {
  const b = (Array.isArray(m.botones) ? m.botones : []).filter((x) => x && x.id && x.titulo);
  const cabe = b.length >= 1 && b.length <= 3 && b.every((x) => String(x.titulo).length <= 20) && texto.length <= 1024;
  cuerpo = cabe
    ? { type: 'interactive', interactive: { type: 'button', body: { text: texto }, action: { buttons: b.map((x) => ({ type: 'reply', reply: { id: String(x.id).slice(0, 256), title: String(x.titulo) } })) } } }
    : { type: 'text', text: { body: numerado(b.map((x) => x.titulo)).slice(0, 4096) } };
} else if (tipo === 'lista') {
  const secciones = ((m.lista && m.lista.secciones) || []).filter((s) => s && Array.isArray(s.filas) && s.filas.length);
  const filas = secciones.flatMap((s) => s.filas).filter((f) => f && f.id && f.titulo);
  const boton = String((m.lista && m.lista.boton) || 'Ver opciones');
  const cabe = filas.length >= 1 && filas.length <= 10 && filas.every((f) => String(f.titulo).length <= 24) && boton.length <= 20 && texto.length <= 1024;
  cuerpo = cabe
    ? {
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: texto },
          action: {
            button: boton,
            sections: secciones.map((s) => ({
              title: String(s.titulo || '').slice(0, 24) || undefined,
              rows: s.filas.map((f) => ({ id: String(f.id).slice(0, 200), title: String(f.titulo), description: f.descripcion ? String(f.descripcion).slice(0, 72) : undefined })),
            })),
          },
        },
      }
    : { type: 'text', text: { body: numerado(filas.map((f) => f.titulo + (f.descripcion ? ' · ' + f.descripcion : ''))).slice(0, 4096) } };
} else if (tipo === 'pedir_ubicacion') {
  cuerpo = { type: 'interactive', interactive: { type: 'location_request_message', body: { text: texto.slice(0, 1024) }, action: { name: 'send_location' } } };
} else if (tipo === 'plantilla') {
  const p = m.plantilla || {};
  if (!p.nombre) return no('plantilla_sin_nombre');
  const valores = Object.values(p.parametros || {});
  cuerpo = {
    type: 'template',
    template: {
      name: p.nombre,
      language: { code: p.idioma || 'es' },
      components: valores.length ? [{ type: 'body', parameters: valores.map((v) => ({ type: 'text', text: String(v) })) }] : [],
    },
  };
} else {
  cuerpo = { type: 'text', text: { body: texto.slice(0, 4096) } };
}

const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: para, ...cuerpo };
return [{ json: { ...base, enviar: true, phone_number_id: canal.phone_number_id, payload_json: JSON.stringify(payload) } }];
"""

JS_RESULTADO_ENVIO = r"""// Resultado para quien llamó al subflujo.
const previo = $('Construir payload').first().json;
const r = $input.first().json;
const fallo = Boolean(r.error);
return [{ json: { enviado: !fallo, motivo: fallo ? 'error_kapso' : null, destinatario: previo.destinatario, message_id: (r.messages && r.messages[0] && r.messages[0].id) || null } }];
"""

JS_RESULTADO_NO_ENVIADO = r"""// No se envió (sin canal, fuera de la ventana de 24 h, mensaje vacío…): se informa a quien llamó.
const previo = $input.first().json;
return [{ json: { enviado: false, motivo: previo.motivo, destinatario: previo.destinatario } }];
"""


def flujo_enviar():
    nodos = [
        nodo(
            "Entrada",
            "n8n-nodes-base.executeWorkflowTrigger",
            1.1,
            {"inputSource": "passthrough"},
            (0, 0),
        ),
        sql(
            "Canal de salida",
            SQL_CANAL_SALIDA,
            ["$json.restaurante_id", "$json.destinatario", "$json.canal_id || null"],
            (240, 0),
            siempre_salida=True,
        ),
        codigo("Construir payload", JS_CONSTRUIR_PAYLOAD, (480, 0)),
        si_booleano("¿Se puede enviar?", "$json.enviar", (720, 0)),
        nodo(
            "Enviar a Kapso",
            NODO_KAPSO,
            1,
            {
                "resource": "whatsAppMessage",
                "operation": "sendRaw",
                "phoneNumberId": "={{ $json.phone_number_id }}",
                "payloadJson": "={{ $json.payload_json }}",
            },
            (960, -120),
            CRED_KAPSO,
            onError="continueRegularOutput",
        ),
        codigo("Resultado del envío", JS_RESULTADO_ENVIO, (1200, -120)),
        codigo("Resultado sin envío", JS_RESULTADO_NO_ENVIADO, (960, 120)),
    ]
    aristas = [
        ("Entrada", "Canal de salida"),
        ("Canal de salida", "Construir payload"),
        ("Construir payload", "¿Se puede enviar?"),
        ("¿Se puede enviar?", "Enviar a Kapso", 0),
        ("¿Se puede enviar?", "Resultado sin envío", 1),
        ("Enviar a Kapso", "Resultado del envío"),
    ]
    return flujo(ID_ENVIAR, NOMBRE_ENVIAR, nodos, aristas)


def escribir(datos):
    ruta = DESTINO / f"{datos['name']}.json"
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{ruta.relative_to(DESTINO.parents[1])}  ({len(datos['nodes'])} nodos)")


if __name__ == "__main__":
    escribir(flujo_enviar())
    escribir(flujo_entrada())
