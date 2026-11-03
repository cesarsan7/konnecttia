# ADR 0003 — Acceso = módulo activo + permiso del rol

- Estado: aceptada (2026-11-02)

## Decisión

Dos capas independientes:
1. **Módulos por restaurante** (lo contratado): planes Básico y Premium más complementos.
2. **RBAC por usuario** (lo que cada persona puede hacer): permisos `recurso.acción` agrupados en
   roles. Plantillas globales y, en el MVP, roles por restaurante creados solo por Konnecttia.

Una acción se permite si el módulo del permiso está activo y algún rol del usuario lo concede.
Las dependencias entre módulos se resuelven en cadena (sin conexión de WhatsApp no hay agente).

## Implementación

`packages/access` (TypeScript, con pruebas) y migración `0001_access_modules_rbac.sql`. Una
prueba comprueba que el catálogo SQL y el de TypeScript coinciden.
