#!/usr/bin/env python3
"""
Director v2 (solo staging, [MVP] Pizzeria): correcciones para usarlo con varios restaurantes.

1. Nodo «Bot»: comparaba bot_status con "on" en minúsculas y distinguiendo mayúsculas. Chatwoot
   guarda el atributo como «On»/«Off», así que un contacto con bot=On no salía por ninguna rama y
   la ejecución se paraba ahí. Ahora compara sin distinguir mayúsculas (sin atributo = on).
2. Prompt del agente (nodo «Formatear Zonas»): los ejemplos usaban las zonas de La Isla
   (Arrecife, Playa Honda, Taiche) y su carta («pizzas, ensaladas»). Ahora salen de las zonas del
   restaurante (delivery_zone), y se añaden las respuestas nuevas de Despacho v2
   (ubicacion_necesaria, elegir_local, local_cerrado), y que con un pin de ubicación llame
   Despacho sin pedir zona.
3. Herramienta Despacho: la descripción de zona_confirmada_por_cliente ya no nombra zonas.
4. «Agente Cerrado»: usaba «La Isla Pizzería» fijo; ahora el nombre del restaurante.

Uso:  python3 integrations/n8n/scripts/director_v2.py   (reescribe el JSON de staging; la v1 queda en git)
"""

import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
ARCHIVO = RAIZ / "integrations" / "n8n" / "flows" / "staging" / "[MVP] Pizzeria.json"

flujo = json.loads(ARCHIVO.read_text(encoding="utf-8"))
nodos = {n["name"]: n for n in flujo["nodes"]}


def cambiar(texto: str, antes: str, despues: str, donde: str) -> str:
    if antes not in texto:
        raise SystemExit(f"{donde}: no encuentro el texto a cambiar: {antes[:80]}…")
    return texto.replace(antes, despues)


# 1. Bot: on/off sin distinguir mayúsculas ------------------------------------------------
reglas = nodos["Bot"]["parameters"]["rules"]["values"]
ESTADO = "={{ String($json.bot_status || 'on').trim().toLowerCase() }}"
for regla, valor in zip(reglas, ["on", "off"]):
    condicion = regla["conditions"]["conditions"][0]
    condicion["leftValue"] = ESTADO
    condicion["rightValue"] = valor

# 2. Prompt con las zonas del restaurante --------------------------------------------------
zonas = nodos["Formatear Zonas"]["parameters"]
code = zonas["jsCode"]
REEMPLAZOS = [
    (
        'no "Calle 14 # 21-10, Taiche".',
        'no "Calle 14 # 21-10, {{ZONA_EJEMPLO}}".',
    ),
    (
        'Ejemplo: Calle Mayor 12, 3ºA, Arrecife."',
        'Ejemplo: Calle Mayor 12, 3ºA, {{ZONA_EJEMPLO}}."',
    ),
    (
        '(frases como "en zona Taiche", "en Arrecife", "en Playa Honda", "esa dirección es en Taiche")',
        '(frases como "en {{ZONA_EJEMPLO}}" o "esa dirección es en {{ZONA_EJEMPLO}}"; zonas: {{ZONA_NOMBRES}})',
    ),
    (
        'Ejemplo: direccion_texto="Calle 14 # 21-10, Taiche".',
        'Ejemplo: direccion_texto="Calle 14 # 21-10, {{ZONA_EJEMPLO}}".',
    ),
    (
        "el cliente mencionó explícitamente Arrecife, Playa Honda o Taiche en esta conversación.",
        "el cliente mencionó explícitamente una de estas zonas en esta conversación: {{ZONA_NOMBRES}}.",
    ),
    (
        'ej: "Calle 40 #10-15, Playa Honda")',
        'ej: "Calle 40 #10-15, {{ZONA_EJEMPLO}}")',
    ),
    (
        '(ej: "Calle 14, Arrecife", "Playa Honda", "zona 3")',
        '(ej: "Calle 14, {{ZONA_EJEMPLO}}" o solo "{{ZONA_EJEMPLO}}")',
    ),
    (
        'pregunta directamente "¿Qué más querés agregar? Tenemos pizzas, ensaladas, bebidas y más."',
        'pregunta directamente "¿Qué más quieres agregar?" (no nombres productos de memoria)',
    ),
]
for antes, despues in REEMPLAZOS:
    code = cambiar(code, antes, despues, "Formatear Zonas")

REGLA_57 = "57. Si Despacho responde con motivo=zona_no_identificada"
code = cambiar(
    code,
    REGLA_57,
    "57a. Si Despacho responde con motivo=ubicacion_necesaria, pide al cliente que comparta su "
    "ubicación por WhatsApp (📎 → Ubicación) y vuelve a llamar Despacho con lat y lng; no le pidas "
    "la zona. Si responde motivo=elegir_local, pregunta en qué local recoge usando la lista que "
    "devuelve y llama Despacho con tipo=retiro y direccion_texto=<local elegido>. Si responde "
    "motivo=local_cerrado, explica que el local está cerrado y no tomes el pedido.\n" + REGLA_57,
    "Formatear Zonas",
)

EXCEPCION_C = "   EXCEPCIÓN C: si hay dirección frecuente guardada que ya contiene zona → pregunta si usa esa dirección; si sí, llama Despacho directamente."
code = cambiar(
    code,
    EXCEPCION_C,
    EXCEPCION_C
    + "\n   EXCEPCIÓN D: si el cliente envió su ubicación de WhatsApp (pin con lat/lng) → no pidas zona "
    "ni dirección escrita: llama Despacho directamente con lat y lng (Despacho elige la zona y el local).",
    "Formatear Zonas",
)

ANTES_REPLACE = """sm = sm.replace('{{ZONA_LISTA}}', zonaLista);
sm = sm.replace('{{ZONA_NOMBRES}}', zonaNombres);
sm = sm.replace('{{ZONA_NOMBRES_SLASH}}', zonaNombresSlash);"""
code = cambiar(
    code,
    ANTES_REPLACE,
    """// Ejemplo de zona para el prompt: la primera zona del restaurante, sin la parte entre paréntesis.
const zonaEjemplo = (zonaNames[0] || 'tu zona').replace(/\\s*\\(.*\\)\\s*$/, '');
sm = sm.replaceAll('{{ZONA_LISTA}}', zonaLista || '   (este restaurante no tiene zonas de reparto)');
sm = sm.replaceAll('{{ZONA_NOMBRES}}', zonaNombres || 'sin zonas configuradas');
sm = sm.replaceAll('{{ZONA_NOMBRES_SLASH}}', zonaNombresSlash || 'sin zonas configuradas');
sm = sm.replaceAll('{{ZONA_EJEMPLO}}', zonaEjemplo);""",
    "Formatear Zonas",
)
for nombre in ("Taiche", "Playa Honda", "La Isla"):
    if nombre in code:
        raise SystemExit(f"Formatear Zonas sigue nombrando «{nombre}»")
zonas["jsCode"] = code

# 3. Herramienta Despacho -------------------------------------------------------------------
entradas = nodos["Despacho"]["parameters"]["workflowInputs"]["value"]
entradas["zona_confirmada_por_cliente"] = cambiar(
    entradas["zona_confirmada_por_cliente"],
    "el cliente dijo explícitamente la zona (Arrecife/Playa Honda/Taiche)",
    "el cliente dijo explícitamente una de las zonas de reparto del restaurante",
    "Despacho.zona_confirmada_por_cliente",
)

# 4. Agente Cerrado con el nombre del restaurante ---------------------------------------------
cerrado = nodos["Agente Cerrado"]["parameters"]["options"]
cerrado["systemMessage"] = cambiar(
    cerrado["systemMessage"],
    "Eres el asistente virtual de La Isla Pizzería por WhatsApp.",
    "Eres el asistente virtual de {{ $('Obtener Config Restaurante').isExecuted ? "
    "($('Obtener Config Restaurante').first().json.nombre || 'este restaurante') : "
    "'este restaurante' }} por WhatsApp.",
    "Agente Cerrado",
)

restantes = [
    n["name"]
    for n in flujo["nodes"]
    if any(z in json.dumps(n["parameters"], ensure_ascii=False) for z in ("Taiche", "La Isla"))
]
if restantes:
    print("Aviso: aún mencionan La Isla/Taiche:", ", ".join(restantes))

ARCHIVO.write_text(json.dumps(flujo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Director v2 escrito en {ARCHIVO.relative_to(RAIZ)}")
