#!/usr/bin/env python3
"""
Genera la copia de los flujos de n8n lista para importar, con las URLs reales del entorno.

En git los flujos llevan marcadores (`__CHATWOOT_URL__`, `__CHATWOOT_CUENTA__`, …) en lugar de
las URLs de cada entorno: el repositorio es público y no debe publicar hosts ni rutas de webhook.
Los valores reales viven en `integrations/n8n/.env.<entorno>`, que no se sube (`.gitignore`:
`.env.*`). Copia `integrations/n8n/.env.example` y rellénalo.

Salida: `integrations/n8n/dist/<entorno>/*.json` y `integrations/n8n/dist/n8n-<entorno>.tar.gz`
(también ignorados por git), para subir al VPS como indica `flows/staging/README.md`.

Uso:
  python3 integrations/n8n/scripts/renderizar.py               # entorno staging
  python3 integrations/n8n/scripts/renderizar.py --comprobar   # solo revisa que en git no haya URLs
"""

import argparse
import json
import re
import sys
import tarfile
from pathlib import Path

N8N = Path(__file__).resolve().parents[1]
MARCADOR = re.compile(r"__([A-Z][A-Z0-9_]*)__")
# Cualquier URL escrita a mano en un flujo versionado es un error: debe ir como marcador.
URL = re.compile(r"https?://[^\s\"'\\<>{}`)]+")


def leer_env(ruta: Path) -> dict[str, str]:
    valores: dict[str, str] = {}
    for numero, linea in enumerate(ruta.read_text(encoding="utf-8").splitlines(), start=1):
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        clave, separador, valor = linea.partition("=")
        if not separador:
            sys.exit(f"{ruta.name}:{numero}: se esperaba CLAVE=valor")
        valores[clave.strip()] = valor.strip().strip('"').strip("'")
    return valores


def comprobar(carpeta: Path) -> None:
    """Falla si algún flujo versionado contiene una URL en lugar de un marcador."""
    errores = []
    for archivo in sorted(carpeta.glob("*.json")):
        texto = archivo.read_text(encoding="utf-8")
        json.loads(texto)
        errores += [f"{archivo.name}: {url}" for url in sorted(set(URL.findall(texto)))]
    if errores:
        sys.exit("URLs en flujos versionados (usa un marcador __NOMBRE__):\n  " + "\n  ".join(errores))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entorno", default="staging")
    parser.add_argument("--comprobar", action="store_true", help="solo revisar los flujos de git")
    args = parser.parse_args()

    origen = N8N / "flows" / args.entorno
    if not origen.is_dir():
        sys.exit(f"No existe la carpeta de flujos {origen.relative_to(N8N)}")
    comprobar(origen)
    if args.comprobar:
        print(f"{origen.relative_to(N8N)}: sin URLs escritas a mano")
        return

    env = N8N / f".env.{args.entorno}"
    if not env.exists():
        sys.exit(f"Falta {env.relative_to(N8N)}: copia .env.example y rellena los valores")
    valores = leer_env(env)

    destino = N8N / "dist" / args.entorno
    destino.mkdir(parents=True, exist_ok=True)
    for viejo in destino.glob("*.json"):
        viejo.unlink()

    usados: set[str] = set()
    for archivo in sorted(origen.glob("*.json")):
        texto = archivo.read_text(encoding="utf-8")
        faltan = sorted({m for m in MARCADOR.findall(texto) if not valores.get(m)})
        if faltan:
            sys.exit(f"{archivo.name}: sin valor en {env.name} para {', '.join(faltan)}")
        usados.update(MARCADOR.findall(texto))
        texto = MARCADOR.sub(lambda m: valores[m.group(1)].rstrip("/"), texto)
        json.loads(texto)
        (destino / archivo.name).write_text(texto, encoding="utf-8")

    paquete = N8N / "dist" / f"n8n-{args.entorno}.tar.gz"
    with tarfile.open(paquete, "w:gz") as tar:
        for archivo in sorted(destino.glob("*.json")):
            tar.add(archivo, arcname=archivo.name)

    total = len(list(destino.glob("*.json")))
    print(f"{total} flujos -> {destino.relative_to(N8N)} y {paquete.relative_to(N8N)}")
    print(f"Marcadores sustituidos: {', '.join(sorted(usados)) or 'ninguno'}")


if __name__ == "__main__":
    main()
