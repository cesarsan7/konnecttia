#!/usr/bin/env python3
"""
Compara el código de los nodos «Code» de los flujos del repositorio con los publicados en n8n
(solo lectura, por la API pública). Sirve para saber si lo que corre en staging es lo que hay en
`main`: publicar.py sube lo que tiene el clon local, así que un clon sin `git pull` publica código viejo.

Variables: N8N_URL (https://n8n.staging.konnecttia.com) y N8N_API_KEY (si un proxy no la añade).

Uso:
  git pull && python3 integrations/n8n/scripts/comprobar_publicado.py
  python3 integrations/n8n/scripts/comprobar_publicado.py "[Agente] Director" "[Canal] Enviar mensaje"

Sale con código 1 si algún nodo difiere o falta (útil antes de probar una corrección).
"""

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

FLUJOS = Path(__file__).resolve().parents[1] / "flows" / "staging"
POR_DEFECTO = ["[Agente] Director", "[Agente] Llamar API", "[Canal] Entrada Kapso", "[Canal] Enviar mensaje"]


def pedir(base: str, ruta: str) -> dict:
    cabeceras = {"Accept": "application/json"}
    if os.environ.get("N8N_API_KEY"):
        cabeceras["X-N8N-API-KEY"] = os.environ["N8N_API_KEY"]
    url = f"{base.rstrip('/')}/api/v1/{ruta}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=cabeceras), timeout=60) as r:
        return json.load(r)


def codigo_por_nodo(flujo: dict) -> dict[str, str]:
    return {
        n["name"]: n["parameters"]["jsCode"]
        for n in flujo.get("nodes", [])
        if isinstance(n.get("parameters"), dict) and "jsCode" in n["parameters"]
    }


def main() -> int:
    base = os.environ.get("N8N_URL")
    if not base:
        print("Falta N8N_URL.", file=sys.stderr)
        return 2
    nombres = sys.argv[1:] or POR_DEFECTO
    commit = subprocess.run(
        ["git", "log", "-1", "--format=%h %s"], capture_output=True, text=True, cwd=FLUJOS
    ).stdout.strip()
    print(f"Repositorio local en: {commit}")
    publicados = {w["name"]: w["id"] for w in pedir(base, "workflows?limit=250")["data"]}
    hay_diferencias = False
    for nombre in nombres:
        ruta = FLUJOS / f"{nombre}.json"
        if not ruta.exists() or nombre not in publicados:
            print(f"✗ {nombre}: no está {'en el repositorio' if not ruta.exists() else 'publicado'}")
            hay_diferencias = True
            continue
        local = codigo_por_nodo(json.loads(ruta.read_text(encoding="utf-8")))
        remoto = codigo_por_nodo(pedir(base, f"workflows/{publicados[nombre]}"))
        distintos = sorted(n for n in local if remoto.get(n) != local[n])
        sobran = sorted(set(remoto) - set(local))
        if distintos or sobran:
            hay_diferencias = True
            print(f"✗ {nombre}: difieren {', '.join(distintos) or '—'}" + (f"; solo publicados: {', '.join(sobran)}" if sobran else ""))
        else:
            print(f"✓ {nombre}: el código publicado es el del repositorio")
    if hay_diferencias:
        print("\nHay código distinto: haz `git pull` y publica con publicar.py; vuelve a comprobar.")
    return 1 if hay_diferencias else 0


if __name__ == "__main__":
    sys.exit(main())
