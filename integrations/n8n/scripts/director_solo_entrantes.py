#!/usr/bin/env python3
"""
Director (staging, [MVP] Pizzeria): procesar solo los mensajes que escribe el cliente.

El webhook de Chatwoot envía «message_created» también para los mensajes salientes (las
respuestas del propio agente y las de un humano) y para las notas privadas. Esos eventos no
traen el teléfono del cliente y el flujo fallaba en «Nuevo usuario» («telefono is required»);
además el agente podría responderse a sí mismo. Se añade el nodo «¿Mensaje del cliente?» entre
Webhook y Variables: sigue solo si event = message_created, message_type = incoming y no es
una nota privada.

Uso:  python3 integrations/n8n/scripts/director_solo_entrantes.py
"""

import json
from pathlib import Path

ARCHIVO = Path(__file__).resolve().parents[3] / "integrations" / "n8n" / "flows" / "staging" / "[MVP] Pizzeria.json"
NOMBRE = "¿Mensaje del cliente?"

flujo = json.loads(ARCHIVO.read_text(encoding="utf-8"))
if any(n["name"] == NOMBRE for n in flujo["nodes"]):
    raise SystemExit("El filtro ya está")


def condicion(ident, izquierda, derecha):
    return {
        "id": ident,
        "leftValue": izquierda,
        "rightValue": derecha,
        "operator": {"type": "string", "operation": "equals"},
    }


flujo["nodes"].append(
    {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": False, "leftValue": "", "typeValidation": "loose", "version": 2},
                "conditions": [
                    condicion("solo-mensajes", "={{ String($json.body.event || '') }}", "message_created"),
                    condicion("solo-entrantes", "={{ String($json.body.message_type || '') }}", "incoming"),
                    condicion("sin-notas", "={{ String($json.body.private === true) }}", "false"),
                ],
                "combinator": "and",
            },
            "options": {},
        },
        "id": "director-solo-entrantes",
        "name": NOMBRE,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [184, 1024],
    }
)
conexiones = flujo["connections"]
siguiente = conexiones["Webhook"]["main"][0]
conexiones["Webhook"]["main"][0] = [{"node": NOMBRE, "type": "main", "index": 0}]
# Salida «true» hacia Variables; la «false» no va a ningún sitio (el evento se ignora).
conexiones[NOMBRE] = {"main": [siguiente, []]}

ARCHIVO.write_text(json.dumps(flujo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Filtro añadido: Webhook → {NOMBRE} → {', '.join(t['node'] for t in siguiente)}")
