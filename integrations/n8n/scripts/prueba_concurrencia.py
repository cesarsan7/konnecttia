#!/usr/bin/env python3
"""
Prueba de concurrencia del agente de WhatsApp: N clientes ficticios escriben a la vez al número de un
restaurante del staging y el script mide si el agente los atiende a todos, cuánto tarda y que las
conversaciones no se mezclan.

Cómo funciona: envía a «[Canal] Entrada Kapso» webhooks con el mismo formato que Kapso (v2, firmados con
HMAC-SHA256) y teléfonos ficticios (+1 555 555 01xx, números de ficción). Después lee las ejecuciones de n8n
(solo lectura) y resume: ejecuciones del Director por cliente, errores, duración (p50/p95/máx.), mensajes
duplicados y cruces de conversación (el teléfono del mensaje y el del contexto de la API deben coincidir).

Qué NO hace: no escribe a WhatsApp ni a nadie. Las respuestas del agente a esos teléfonos ficticios fallan
en Kapso (esperado). Sí crea carritos de prueba en el restaurante del canal y gasta modelo de OpenAI. Por defecto
la conversación termina en el resumen con los botones «Sí, confirmar»: no se crea ningún pedido.

Variables de entorno:
  N8N_URL                 https://n8n.staging.konnecttia.com
  KAPSO_WEBHOOK_SECRET    secreto del webhook de Kapso del número (el mismo que usa n8n)
  N8N_API_KEY             clave de la API de n8n (para leer las ejecuciones)
  PHONE_NUMBER_ID         phone_number_id de Kapso del canal a probar

Uso (PowerShell):
  $env:N8N_URL = "https://n8n.staging.konnecttia.com"
  $env:KAPSO_WEBHOOK_SECRET = "<secreto>"; $env:N8N_API_KEY = "<clave>"; $env:PHONE_NUMBER_ID = "<id>"
  python integrations/n8n/scripts/prueba_concurrencia.py --clientes 5 --confirmar
  python integrations/n8n/scripts/prueba_concurrencia.py --clientes 25 --confirmar
  python integrations/n8n/scripts/prueba_concurrencia.py --clientes 10 --rafaga --confirmar   # prueba del buffer

Limpieza de los datos de prueba (restaurante del canal; teléfonos +1555555 01xx):
  DELETE FROM public.agente_carrito WHERE telefono LIKE '+155555501%';
  DELETE FROM public.whatsapp_conversacion WHERE telefono LIKE '+155555501%';
"""

import argparse
import hashlib
import hmac
import json
import os
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

PREFIJO_TELEFONO = "155555501"  # +1 555 555 01xx: números ficticios (reservados para ficción)
GUION = ["Hola", "Quiero una arepa burger", "Si", "Recoger", "Efectivo"]
GUION_CON_PEDIDO = [*GUION, "Sí, confirmar"]
LIMITE_CLIENTES = 99


def telefono(indice: int) -> str:
    return f"{PREFIJO_TELEFONO}{indice:02d}"


def firmar(cuerpo: bytes, secreto: str) -> str:
    return hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()


def evento(phone_number_id: str, indice: int, texto: str) -> dict:
    tel = telefono(indice)
    ahora = int(time.time())
    return {
        "message": {
            "id": f"wamid.PRUEBA{uuid.uuid4().hex}",
            "from": tel,
            "text": {"body": texto},
            "type": "text",
            "kapso": {"direction": "inbound", "has_media": False},
            "timestamp": str(ahora),
        },
        "conversation": {
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"prueba-concurrencia/{phone_number_id}/{tel}")),
            "phone_number": tel,
            "contact_name": f"Prueba {indice:02d}",
            "phone_number_id": phone_number_id,
            "status": "active",
        },
        "phone_number_id": phone_number_id,
        "is_new_conversation": False,
    }


def enviar(url: str, secreto: str, phone_number_id: str, indice: int, texto: str) -> tuple[int, float]:
    cuerpo = json.dumps(evento(phone_number_id, indice, texto), ensure_ascii=False).encode()
    peticion = urllib.request.Request(
        url,
        data=cuerpo,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Event": "whatsapp.message.received",
            "X-Webhook-Payload-Version": "v2",
            "X-Idempotency-Key": uuid.uuid4().hex,
            "X-Webhook-Signature": firmar(cuerpo, secreto),
        },
    )
    inicio = time.monotonic()
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            return r.status, time.monotonic() - inicio
    except urllib.error.HTTPError as e:
        return e.code, time.monotonic() - inicio
    except Exception:
        return 0, time.monotonic() - inicio


def cliente(url, secreto, phone_number_id, indice, guion, pausa, rafaga, salida):
    mensajes = guion[:3] if rafaga else guion
    for texto in mensajes:
        estado, tiempo = enviar(url, secreto, phone_number_id, indice, texto)
        salida.append((indice, texto, estado, tiempo))
        time.sleep(0.4 if rafaga else pausa)


def pedir(base: str, ruta: str) -> dict:
    cabeceras = {"Accept": "application/json"}
    if os.environ.get("N8N_API_KEY"):
        cabeceras["X-N8N-API-KEY"] = os.environ["N8N_API_KEY"]
    with urllib.request.urlopen(urllib.request.Request(f"{base.rstrip('/')}/api/v1/{ruta}", headers=cabeceras), timeout=60) as r:
        return json.load(r)


def percentil(valores: list[float], p: float) -> float:
    if not valores:
        return 0.0
    ordenados = sorted(valores)
    return ordenados[min(len(ordenados) - 1, int(round(p * (len(ordenados) - 1))))]


def informe(base: str, inicio_iso: str, esperados: dict[str, int]) -> int:
    flujos = {w["name"]: w["id"] for w in pedir(base, "workflows?limit=250")["data"]}
    director = flujos.get("[Agente] Director")
    lista, cursor = [], None
    for _ in range(20):
        pagina = pedir(base, f"executions?limit=250&workflowId={director}" + (f"&cursor={cursor}" if cursor else ""))
        lista += pagina["data"]
        cursor = pagina.get("nextCursor")
        if not cursor or pagina["data"][-1]["startedAt"] < inicio_iso:
            break
    ejecuciones = [e for e in lista if e["startedAt"] >= inicio_iso]
    por_tel: dict[str, list] = {}
    duraciones, errores, cruces, sin_servicio = [], 0, 0, 0
    for e in ejecuciones:
        d = pedir(base, f"executions/{e['id']}?includeData=true")
        runs = d["data"]["resultData"]["runData"]
        entrada = runs["Entrada"][0]["data"]["main"][0][0]["json"]
        tel = entrada["cliente"]["telefono"]
        if not tel.startswith("+" + PREFIJO_TELEFONO):
            continue
        por_tel.setdefault(tel, []).append(entrada.get("texto"))
        if e["stoppedAt"]:
            ini = datetime.fromisoformat(e["startedAt"].replace("Z", "+00:00"))
            fin = datetime.fromisoformat(e["stoppedAt"].replace("Z", "+00:00"))
            duraciones.append((fin - ini).total_seconds())
        if e["status"] != "success":
            errores += 1
        if "Respuesta sin servicio" in runs:
            sin_servicio += 1
        contexto = runs.get("Pedir contexto", [{}])[0].get("data", {}).get("main", [[{"json": {}}]])[0][0]["json"]
        tel_ctx = (contexto.get("respuesta") or {}).get("cliente", {}).get("telefono")
        if tel_ctx and tel_ctx != tel:
            cruces += 1
    total = sum(len(v) for v in por_tel.values())
    esperado_total = sum(esperados.values())
    duplicados = sum(max(0, len(v) - len(set(v))) for v in por_tel.values())
    print("\n=== Informe de n8n ===")
    print(f"Clientes con ejecuciones: {len(por_tel)} de {len(esperados)}")
    print(f"Ejecuciones del Director: {total} (mensajes enviados: {esperado_total}; con buffer pueden ser menos)")
    if duraciones:
        print(f"Duración del Director: p50 {statistics.median(duraciones):.1f} s · p95 {percentil(duraciones, 0.95):.1f} s · máx. {max(duraciones):.1f} s")
    print(f"Ejecuciones con error: {errores} · «respuesta sin servicio» (API/contexto caído): {sin_servicio}")
    print(f"Cruces de conversación (teléfono del mensaje ≠ teléfono del contexto): {cruces}")
    print(f"Mensajes repetidos dentro de un mismo cliente: {duplicados}")
    faltan = [t for t in esperados if "+" + t not in por_tel]
    if faltan:
        print(f"Clientes SIN ninguna ejecución: {len(faltan)} (p. ej. +{faltan[0]})")
    return 1 if (errores or cruces or sin_servicio or faltan) else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--clientes", type=int, default=5, help="clientes simultáneos (máx. 99)")
    parser.add_argument("--pausa", type=float, default=12.0, help="segundos entre mensajes de un cliente (lo que tarda en teclear)")
    parser.add_argument("--rampa", type=float, default=2.0, help="segundos en los que arrancan todos los clientes")
    parser.add_argument("--rafaga", action="store_true", help="cada cliente manda sus 3 primeros mensajes seguidos (prueba del buffer)")
    parser.add_argument("--hasta-pedido", action="store_true", help="llega a «Sí, confirmar»: CREA pedidos de prueba en el restaurante")
    parser.add_argument("--solo-enviar", action="store_true", help="no lee n8n al terminar")
    parser.add_argument("--confirmar", action="store_true", help="imprescindible: acepto que crea carritos de prueba y gasta modelo")
    args = parser.parse_args()
    base, secreto, phone_number_id = os.environ.get("N8N_URL"), os.environ.get("KAPSO_WEBHOOK_SECRET"), os.environ.get("PHONE_NUMBER_ID")
    if not (base and secreto and phone_number_id):
        print("Faltan N8N_URL, KAPSO_WEBHOOK_SECRET o PHONE_NUMBER_ID.", file=sys.stderr)
        return 2
    if not args.confirmar:
        print("Esto crea carritos de prueba en el restaurante del canal y gasta modelo de OpenAI. Repite con --confirmar.", file=sys.stderr)
        return 2
    if not 1 <= args.clientes <= LIMITE_CLIENTES:
        print(f"--clientes debe estar entre 1 y {LIMITE_CLIENTES}.", file=sys.stderr)
        return 2
    guion = GUION_CON_PEDIDO if args.hasta_pedido else GUION
    url = f"{base.rstrip('/')}/webhook/kapso-entrada"
    inicio_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    print(f"{args.clientes} clientes → {url} · guion: {len(guion) if not args.rafaga else 3} mensajes · pausa {args.pausa:.0f} s")
    salida: list[tuple[int, str, int, float]] = []
    inicio = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.clientes) as pool:
        for i in range(1, args.clientes + 1):
            pool.submit(cliente, url, secreto, phone_number_id, i, guion, args.pausa, args.rafaga, salida)
            time.sleep(args.rampa / args.clientes)
    total = time.monotonic() - inicio
    tiempos = [t for *_, t in salida]
    fallos = [s for _, _, s, _ in salida if s != 200]
    print("\n=== Webhooks enviados ===")
    print(f"{len(salida)} mensajes en {total:.0f} s · respuesta del webhook p50 {statistics.median(tiempos):.2f} s · máx. {max(tiempos):.2f} s")
    print(f"Respuestas distintas de 200: {len(fallos)}" + (f" (códigos: {sorted(set(fallos))})" if fallos else ""))
    esperados: dict[str, int] = {}
    for indice, *_ in salida:
        esperados[telefono(indice)] = esperados.get(telefono(indice), 0) + 1
    if args.solo_enviar:
        return 1 if fallos else 0
    print("Esperando 90 s a que el Director termine los últimos mensajes…")
    time.sleep(90)
    codigo = informe(base, inicio_iso, esperados)
    return 1 if (fallos or codigo) else 0


if __name__ == "__main__":
    sys.exit(main())
