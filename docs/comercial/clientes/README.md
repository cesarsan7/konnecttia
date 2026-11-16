# Presentaciones comerciales por cliente

Cada cliente tiene su carpeta `clientes/<slug-del-cliente>/` con:

- `README.md`: enlace a la presentación publicada, fecha, datos usados y pendientes por confirmar.
- `presentacion/`: copia de los archivos de la presentación (`deck.json`, `deck.css`, `slides/`), por si hay que rehacerla o adaptarla a otro cliente.

## Cómo se genera una presentación nueva

1. Datos reales del cliente: su seed (`packages/db/seeds/<slug>*.sql`) y su carta. Sin cifras ni testimonios inventados.
2. Estado de cada función: solo de `guia-comercial.md` (Disponible / En pruebas / Próximamente, sin fechas).
3. Estructura base (11 diapositivas): portada, punto de partida, dónde ganas valor, carta digital, pedido web y reparto, panel, agente de WhatsApp, clientes y crecimiento, qué hay hoy y qué viene, cómo arrancamos, próximos pasos.
4. Diseño de Konnecttia, tipo Slides de Claude. El precio no va en la presentación: va en la propuesta.
5. Guardar aquí la copia y apuntar en el README del cliente lo que quedó por confirmar.
