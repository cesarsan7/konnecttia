#!/usr/bin/env python3
"""
Publica los flujos de flows/<entorno>/ en un n8n por su API pública (sin entrar al servidor).

Qué hace, por cada archivo:
  1. Si ya existe un flujo con ese nombre, lo actualiza; si no, lo crea.
  2. n8n da ids nuevos a los flujos que crea, y los flujos se llaman entre sí por id
     (Execute Workflow, herramientas): al final se reescriben esas referencias con los ids reales
     y se vuelve a guardar. Así no hace falta `n8n import:workflow`.
  3. Las credenciales se enlazan por id: n8n no deja listarlas por la API, así que sus ids se
     leen de `.env.<entorno>` (líneas `CRED_<nombre>=<id>`; el id es el último tramo de la URL de
     la credencial en n8n: /home/credentials/<id>). Sin id, el nodo queda con el nombre y se elige
     a mano en la interfaz.
  4. Nunca activa un flujo salvo que se pida con --activar.

Nada de esto lleva claves en el repositorio: la URL de n8n (`N8N_URL`) y los ids van en
`.env.<entorno>` (ignorado por git) o en variables de entorno; la clave de la API de n8n va en
`N8N_API_KEY`. Si no hay `N8N_API_KEY` no se envía cabecera (un proxy de red puede añadirla).

Uso:
  python3 integrations/n8n/scripts/publicar.py --dry-run
  python3 integrations/n8n/scripts/publicar.py
  python3 integrations/n8n/scripts/publicar.py "[Canal] Entrada Kapso" "[Canal] Enviar mensaje"
  python3 integrations/n8n/scripts/publicar.py --activar "[Canal] Entrada Kapso"

Los marcadores `__NOMBRE__` se sustituyen igual que en renderizar.py (mismos valores de
`.env.<entorno>`), así que los flujos con URLs del entorno se publican ya renderizados.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

N8N = Path(__file__).resolve().parents[1]
MARCADOR = re.compile(r"__([A-Z][A-Z0-9_]*)__")
# La API pública solo acepta estas claves en `settings`.
SETTINGS_PERMITIDOS = {
    "saveExecutionProgress",
    "saveManualExecutions",
    "saveDataErrorExecution",
    "saveDataSuccessExecution",
    "executionTimeout",
    "errorWorkflow",
    "timezone",
    "executionOrder",
}


def leer_env(ruta: Path) -> dict[str, str]:
    valores: dict[str, str] = {}
    if not ruta.exists():
        return valores
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valores[clave.strip()] = valor.strip().strip('"').strip("'")
    return valores


class Api:
    def __init__(self, base: str, clave: str | None):
        self.base = base.rstrip("/") + "/api/v1"
        self.clave = clave

    def llamar(self, metodo: str, ruta: str, cuerpo=None):
        datos = None if cuerpo is None else json.dumps(cuerpo).encode("utf-8")
        peticion = urllib.request.Request(self.base + ruta, data=datos, method=metodo)
        peticion.add_header("Accept", "application/json")
        if datos is not None:
            peticion.add_header("Content-Type", "application/json")
        if self.clave:
            peticion.add_header("X-N8N-API-KEY", self.clave)
        try:
            with urllib.request.urlopen(peticion, timeout=60) as respuesta:
                texto = respuesta.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            detalle = error.read().decode("utf-8", "replace")[:400]
            sys.exit(f"{metodo} {ruta}: HTTP {error.code} {detalle}")
        except urllib.error.URLError as error:
            sys.exit(f"{metodo} {ruta}: no se pudo conectar ({error.reason})")
        return json.loads(texto) if texto else {}

    def flujos_por_nombre(self) -> dict[str, str]:
        existentes: dict[str, str] = {}
        cursor = None
        while True:
            ruta = "/workflows?limit=100" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
            pagina = self.llamar("GET", ruta)
            for flujo in pagina.get("data", []):
                existentes[flujo["name"]] = flujo["id"]
            cursor = pagina.get("nextCursor")
            if not cursor:
                return existentes


def cargar_flujos(carpeta: Path, valores: dict[str, str], elegidos: list[str]) -> dict[str, dict]:
    flujos: dict[str, dict] = {}
    for archivo in sorted(carpeta.glob("*.json")):
        texto = archivo.read_text(encoding="utf-8")
        nombre = json.loads(texto)["name"]
        if elegidos and nombre not in elegidos:
            continue
        faltan = sorted({m for m in MARCADOR.findall(texto) if not valores.get(m)})
        if faltan:
            sys.exit(f"{archivo.name}: sin valor en .env para {', '.join(faltan)}")
        texto = MARCADOR.sub(lambda m: valores[m.group(1)].rstrip("/"), texto)
        flujos[nombre] = json.loads(texto)
    faltantes = [n for n in elegidos if n not in flujos]
    if faltantes:
        sys.exit("No hay flujo con ese nombre: " + ", ".join(faltantes))
    return flujos


def enlazar_credenciales(flujo: dict, valores: dict[str, str]) -> list[str]:
    """Pone el id de cada credencial usada por nombre. Devuelve los nombres sin id."""
    sin_id: set[str] = set()
    for nodo in flujo["nodes"]:
        for tipo, referencia in (nodo.get("credentials") or {}).items():
            ident = valores.get("CRED_" + referencia.get("name", "").replace(" ", "_"))
            if ident:
                nodo["credentials"][tipo] = {"id": ident, "name": referencia["name"]}
            else:
                sin_id.add(f"{referencia.get('name')} ({tipo})")
    return sorted(sin_id)


def cuerpo_api(flujo: dict) -> dict:
    return {
        "name": flujo["name"],
        "nodes": flujo["nodes"],
        "connections": flujo["connections"],
        "settings": {k: v for k, v in (flujo.get("settings") or {}).items() if k in SETTINGS_PERMITIDOS},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("flujos", nargs="*", help="nombres de flujo a publicar (por defecto, todos)")
    parser.add_argument("--entorno", default="staging")
    parser.add_argument("--dry-run", action="store_true", help="solo mostrar qué se haría")
    parser.add_argument("--activar", nargs="*", default=[], metavar="NOMBRE", help="activar estos flujos al terminar")
    args = parser.parse_args()

    valores = {**leer_env(N8N / f".env.{args.entorno}"), **{k: v for k, v in os.environ.items() if k.startswith(("N8N_", "CRED_"))}}
    if not valores.get("N8N_URL"):
        sys.exit(f"Falta N8N_URL (en .env.{args.entorno} o como variable de entorno)")

    carpeta = N8N / "flows" / args.entorno
    flujos = cargar_flujos(carpeta, valores, args.flujos)
    api = Api(valores["N8N_URL"], valores.get("N8N_API_KEY"))

    for nombre, flujo in flujos.items():
        sin_id = enlazar_credenciales(flujo, valores)
        if sin_id:
            print(f"AVISO {nombre}: credenciales sin id en .env ({', '.join(sin_id)}); se eligen a mano en n8n")

    if args.dry_run:
        for nombre, flujo in flujos.items():
            print(f"[dry-run] {nombre}: {len(flujo['nodes'])} nodos")
        return

    existentes = api.flujos_por_nombre()
    ids_reales: dict[str, str] = {}  # id del archivo -> id real en n8n
    # También los flujos que no se publican ahora: otros flujos pueden llamarlos por su id.
    for archivo in sorted(carpeta.glob("*.json")):
        datos = json.loads(archivo.read_text(encoding="utf-8"))
        if datos["name"] in existentes:
            ids_reales[datos["id"]] = existentes[datos["name"]]
    for nombre, flujo in flujos.items():
        if nombre in existentes:
            ids_reales[flujo["id"]] = existentes[nombre]
        else:
            creado = api.llamar("POST", "/workflows", cuerpo_api(flujo))
            ids_reales[flujo["id"]] = creado["id"]
            print(f"creado      {nombre} -> {creado['id']}")

    cambios = {viejo: nuevo for viejo, nuevo in ids_reales.items() if viejo != nuevo}
    for nombre, flujo in flujos.items():
        texto = json.dumps(flujo, ensure_ascii=False)
        for viejo, nuevo in cambios.items():
            texto = texto.replace(viejo, nuevo)
        flujo = json.loads(texto)
        real = ids_reales[flujos[nombre]["id"]]
        api.llamar("PUT", f"/workflows/{real}", cuerpo_api(flujo))
        print(f"actualizado {nombre} ({real})")

    for nombre in args.activar:
        if nombre not in flujos:
            sys.exit(f"--activar: {nombre} no está entre los flujos publicados")
        api.llamar("POST", f"/workflows/{ids_reales[flujos[nombre]['id']]}/activate")
        print(f"activado    {nombre}")


if __name__ == "__main__":
    main()
