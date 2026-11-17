#!/usr/bin/env python3
"""
Resumen de las ejecuciones recientes de n8n (solo lectura, por la API pública).

Para revisar una prueba por WhatsApp: por cada mensaje del cliente muestra el restaurante y el canal
que resolvió «[Canal] Entrada Kapso», qué herramientas llamó el Director (con sus argumentos), la
respuesta enviada y cualquier nodo con error. No imprime secretos: ni cabeceras ni firmas.

Variables: N8N_URL (https://n8n.staging.konnecttia.com) y N8N_API_KEY (si un proxy no la añade).

Uso:
  python3 integrations/n8n/scripts/revisar_ejecuciones.py --desde 2026-11-17T10:00:00Z
  python3 integrations/n8n/scripts/revisar_ejecuciones.py --limite 40 --solo-errores
"""

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

DIRECTOR = "[Agente] Director"
RECORTE = 300


def pedir(base: str, ruta: str, params: dict | None = None) -> dict:
    url = f"{base.rstrip('/')}/api/v1/{ruta}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    cabeceras = {"Accept": "application/json"}
    clave = os.environ.get("N8N_API_KEY")
    if clave:
        cabeceras["X-N8N-API-KEY"] = clave
    with urllib.request.urlopen(urllib.request.Request(url, headers=cabeceras), timeout=60) as r:
        return json.load(r)


def salida(run: dict) -> list[dict]:
    principal = run.get("data", {}).get("main", [])
    return [item["json"] for rama in principal if rama for item in rama]


def corto(valor: object) -> str:
    texto = valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
    return texto if len(texto) <= RECORTE else texto[:RECORTE] + "…"


def resumir(ejecucion: dict, nombres: dict[str, str]) -> list[str]:
    nombre = nombres.get(ejecucion["workflowId"], ejecucion["workflowId"])
    datos = ejecucion.get("data", {}).get("resultData", {})
    runs = datos.get("runData", {})
    lineas = [f"#{ejecucion['id']} {nombre} · {ejecucion['status']} · {ejecucion['startedAt']}"]
    if nombre != DIRECTOR:
        for nodo, corridas in runs.items():
            for corrida in corridas:
                if "error" in corrida:
                    lineas.append(f"   ✗ {nodo}: {corto(corrida['error'].get('message', ''))}")
        return lineas
    entrada = next((s for s in salida(runs.get("Entrada", [{}])[0]) if s), {})
    lineas.append(
        f"   restaurante_id={entrada.get('restaurante_id')} canal_id={entrada.get('canal_id')}"
        f" ({entrada.get('restaurante_nombre')}) · cliente={entrada.get('cliente', {}).get('telefono')}"
    )
    lineas.append(f"   cliente dice: {corto(entrada.get('texto') or entrada.get('ubicacion') or '')}")
    agente = next(iter(salida(runs.get("Agente", [{}])[0])), {})
    for paso in agente.get("intermediateSteps", []):
        accion = paso.get("action", {})
        lineas.append(f"   → {accion.get('tool')} {corto(accion.get('toolInput'))}")
        lineas.append(f"       ← {corto(paso.get('observation', ''))}")
    respuesta = next(iter(salida(runs.get("Respuesta", [{}])[0])), {})
    lineas.append(f"   agente responde ({respuesta.get('tipo')}): {corto(respuesta.get('texto', ''))}")
    for nodo, corridas in runs.items():
        for corrida in corridas:
            if "error" in corrida:
                lineas.append(f"   ✗ {nodo}: {corto(corrida['error'].get('message', ''))}")
    return lineas


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--desde", help="solo ejecuciones iniciadas después (ISO 8601, UTC)")
    parser.add_argument("--limite", type=int, default=25)
    parser.add_argument("--solo-errores", action="store_true")
    args = parser.parse_args()
    base = os.environ.get("N8N_URL")
    if not base:
        print("Falta N8N_URL.", file=sys.stderr)
        return 2
    nombres = {w["id"]: w["name"] for w in pedir(base, "workflows", {"limit": 250})["data"]}
    lista = pedir(base, "executions", {"limit": args.limite})["data"]
    relevantes = [
        e
        for e in lista
        if nombres.get(e["workflowId"], "").startswith(("[Agente] Director", "[Canal]"))
        and (not args.desde or e["startedAt"] > args.desde)
        and (not args.solo_errores or e["status"] != "success")
    ]
    for resumen in reversed(relevantes):
        detalle = pedir(base, f"executions/{resumen['id']}", {"includeData": "true"})
        print("\n".join(resumir(detalle, nombres)))
    if not relevantes:
        print("Sin ejecuciones del agente en ese rango.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
