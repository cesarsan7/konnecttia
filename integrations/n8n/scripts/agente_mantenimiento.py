#!/usr/bin/env python3
"""
Genera «[Agente] Mantenimiento»: cada 2 minutos pide a la API la caducidad de carritos y, con el
módulo premium, los avisos y las cancelaciones de pagos pendientes, y envía los mensajes que la API
devuelve por «[Canal] Enviar mensaje». La lógica y los textos viven en la API; aquí solo se
programa y se envía.

Uso: python3 integrations/n8n/scripts/agente_mantenimiento.py   (escribe en flows/staging/)
Después se publica con publicar.py; el flujo queda inactivo hasta activarlo (--activar).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agente_director import (  # noqa: E402
    API_URL,
    CRED_AGENTE_API,
    codigo,
    escribir,
    flujo,
    nodo,
    ref_flujo,
)

ID_MANTENIMIENTO = "AgMantenimien001"
NOMBRE = "[Agente] Mantenimiento"
ID_ENVIAR = "CnEnviarMensaje1"
NOMBRE_ENVIAR = "[Canal] Enviar mensaje"

JS_MENSAJES = r"""// Mensajes que la API pide enviar: cambios de estado, avisos de caducidad y cancelaciones de pago.
const r = $input.first().json || {};
const lista = [...(r.estados || []), ...(r.avisos || []), ...(r.pedidos_cancelados || [])];
return lista
  .filter((m) => m && m.canal_id && m.destinatario && m.texto)
  .map((m) => ({
    json: {
      restaurante_id: m.restaurante_id,
      canal_id: m.canal_id,
      destinatario: m.destinatario,
      texto: m.texto,
    },
  }));
"""


def flujo_mantenimiento():
    nodos = [
        nodo(
            "Cada 2 minutos",
            "n8n-nodes-base.scheduleTrigger",
            1.2,
            {"rule": {"interval": [{"field": "minutes", "minutesInterval": 2}]}},
            (0, 0),
        ),
        nodo(
            "Mantenimiento API",
            "n8n-nodes-base.httpRequest",
            4.2,
            {
                "method": "POST",
                "url": f"{API_URL}/agente/mantenimiento/caducidad",
                "authentication": "genericCredentialType",
                "genericAuthType": "httpHeaderAuth",
                "options": {"timeout": 30000},
            },
            (240, 0),
            CRED_AGENTE_API,
        ),
        codigo("Mensajes a enviar", JS_MENSAJES, (480, 0)),
        nodo(
            "Enviar mensaje",
            "n8n-nodes-base.executeWorkflow",
            1.3,
            {"workflowId": ref_flujo(ID_ENVIAR, NOMBRE_ENVIAR), "options": {}},
            (720, 0),
            onError="continueRegularOutput",
        ),
    ]
    aristas = [
        ("Cada 2 minutos", "Mantenimiento API"),
        ("Mantenimiento API", "Mensajes a enviar"),
        ("Mensajes a enviar", "Enviar mensaje"),
    ]
    return flujo(ID_MANTENIMIENTO, NOMBRE, nodos, aristas)


if __name__ == "__main__":
    escribir(flujo_mantenimiento())
