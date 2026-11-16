# ADR 0013 — Configuración del agente por plantilla estándar con herencia

- Estado: aceptada (2026-11-15). Implementada en los PR #141–#148 (ver «Plan de PR»).
- Relacionado: [ADR 0003](0003-acceso-modulos-y-rbac.md) (módulos y roles),
  [ADR 0012](0012-agente-whatsapp-multirestaurante.md) (agente multirestaurante).

## Contexto

Hay cada vez más parámetros del agente de WhatsApp (tono, pausas, caducidad del carrito, avisos de
estado al cliente, nota de alérgenos…). Hoy viven como claves sueltas en `restaurante_config`, sin
valores estándar compartidos y sin pantalla para el restaurante. Con muchos restaurantes eso obliga
a dar de alta valor por valor y a repetir las mismas decisiones. Además, parte de la funcionalidad
será complementaria y, previsiblemente, básica o premium.

## Evaluación de la propuesta

Se aprueba la idea: **una plantilla estándar que todos heredan y que cada restaurante puede
personalizar**, con una pestaña propia en Ajustes que solo existe si contrata el agente.
Ajustes al modelo de los roles, que no encaja del todo:

- Los roles se **asignan completos** (el restaurante elige una plantilla o crea otro rol). Con
  parámetros eso es incómodo: para cambiar un solo valor habría que copiar toda la plantilla y, a
  partir de ahí, perder los cambios futuros de la estándar.
- Se propone por tanto **herencia por parámetro**: cada valor se toma del restaurante si lo
  personalizó y, si no, de la plantilla estándar. «Restablecer» borra la personalización y vuelve
  a heredar. Se ve qué está personalizado y qué es estándar.

## Decisión

### 1. Datos (migración propia, la aplica el promotor)

- `config_clave` (diccionario que ya existe) gana columnas para describir cada parámetro:
  `grupo` (`agente`), `modulo_code` (módulo que lo habilita: básico o premium), `editable_por`
  (`restaurante` o `interno`), `minimo`, `maximo` y `opciones` (valores permitidos).
- Tabla nueva `config_plantilla (plantilla_code, clave, valor)`; hoy solo existe `estandar`.
  El código de plantilla queda en la clave para poder tener otras más adelante (p. ej. por plan)
  sin cambiar el modelo.
- `restaurante_config` no cambia: una fila es una personalización.
- Resolución, en un único sitio de la API: **valor del restaurante → plantilla estándar →
  sin valor**. Ningún valor de negocio queda escrito en el código. Todo lo que lee `agente_*`
  (contexto del agente, tareas programadas, avisos) usa ese resolvedor.
- Módulo nuevo `whatsapp.agent_pro` (premium), por el mecanismo de módulos que ya existe
  (`restaurante_modulo`, origen `plan`, `complemento` o `cortesia`). `whatsapp.agent` es el básico.

### 2. Pestaña «Agente de WhatsApp» en Ajustes del restaurante

- Solo aparece si el restaurante tiene el módulo `whatsapp.agent` y la persona el permiso
  `agent.configure` (ya existe). Sin el módulo no se ve nada.
- Se dibuja **a partir del diccionario**: añadir un parámetro es una fila nueva, no código de
  pantalla. Muestra el valor efectivo, si es estándar o personalizado y «Restablecer».
- Los parámetros premium aparecen bloqueados con el aviso habitual de módulo no contratado. La API
  también lo exige: guardar un valor premium sin `whatsapp.agent_pro` da 403, y las tareas
  (avisos de estado, expiración con aviso) ignoran a los restaurantes sin el módulo.
- Endpoints: `GET` y `PATCH /panel/:slug/ajustes/agente`, validados con el tipo, mínimo, máximo y
  opciones del diccionario; auditados.

### 3. Panel interno

- Pantalla «Agente» junto a las plantillas de rol: edita los valores de la plantilla estándar
  (`admin` escribe, `soporte` lee, todo auditado). Para cada parámetro muestra cuántos
  restaurantes lo heredan y cuántos lo personalizaron, para saber a cuántos afecta un cambio.
- En la ficha de cada restaurante: sus personalizaciones y los módulos del agente, editables por
  soporte en nombre del restaurante.
- Los parámetros `editable_por = interno` (p. ej. ventana de pausa mínima) no se ven en el panel
  del restaurante.

### 4. Parámetros iniciales

| Parámetro (clave)                            | Nivel   | Estándar               | Notas                                    |
| -------------------------------------------- | ------- | ---------------------- | ---------------------------------------- |
| `agente_activo`, nombre, tono, instrucciones | básico  | como hoy               | ya existen                               |
| `agente_pausa_minutos`, `…_derivar_minutos`  | básico  | como hoy               | ya existen                               |
| `cart_expiry_minutes`                        | básico  | 30                     | caducidad del carrito                    |
| `agente_nota_alergenos`                      | básico  | texto + enlace         | ver punto 5                              |
| `agente_derivar_email`                       | básico  | correo del propietario | aviso por correo al derivar              |
| `agente_notif_estados`                       | premium | ninguno                | estados que se avisan al cliente (elige) |
| `cart_warning_minutes`                       | premium | 5 antes                | aviso previo a la caducidad              |
| `pedido_pago_pendiente_expira_minutos`       | premium | 60                     | transferencia sin pagar; 0 = no cancelar |

El reparto básico/premium es una decisión comercial pendiente (ver «Decisiones»). Las
notificaciones de estado fuera de la ventana de 24 h de WhatsApp requerirán plantillas de Meta
(coste por mensaje): por eso encajan como premium; es post-MVP y hoy no se envían.

### 5. Alérgenos: fuera de WhatsApp

El agente deja de dar o resumir alérgenos por línea. Cuando el cliente pregunta, o en el resumen
previo a confirmar, dice la nota `agente_nota_alergenos` (estándar: «Para información de
alérgenos, consulta la carta: {carta_url}») y nunca afirma que algo no tiene alérgenos. Se evita
dar información incorrecta en un chat y se ahorran tokens. Requisito: la carta pública debe mostrar
los alérgenos de cada producto. Conviene una revisión legal de que el enlace cumple la obligación
de informar antes de la compra.

### 6. Purga de pedidos de un restaurante (panel interno)

Para limpiar los pedidos de prueba de staging sin borrar el restaurante:

- `POST /plataforma/restaurantes/:id/purgar-pedidos`, solo `admin`, con confirmación escribiendo
  el enlace (`slug`) del restaurante, como el borrado.
- **Solo funciona si la API tiene `PURGA_PEDIDOS_PERMITIDA=true`**, que se define únicamente en
  staging. En producción responde 403 aunque se llame al endpoint: La Isla y los clientes reales
  no se pueden purgar.
- Opciones: antes de una fecha, y si se limpian también carritos del agente, derivaciones,
  conversaciones del agente y clientes. Por defecto: pedidos con sus justificantes, incidencias y
  registros de estado (se borran en cascada).
- Una sola transacción, devuelve cuántas filas de cada tipo y queda en la auditoría. Los archivos
  de justificantes y fotos de entrega en Storage se borran después, con mejor esfuerzo.

## Plan de PR (cada uno independiente, MVP)

1. Purga de pedidos en interno (no depende del resto).
2. Fundación: migración, resolvedor, `GET/PATCH ajustes/agente`, módulo premium.
3. Pestaña de Ajustes y pantalla interna de la plantilla.
4. Alérgenos → nota con enlace.
5. Expiración de carritos y pedidos con aviso (flujo programado de n8n que llama a la API).
6. Notificaciones de estado al cliente (premium): tabla de avisos pendientes en la API y flujo de
   n8n que los envía por el adaptador de Kapso. Requiere migración.
7. Aviso por correo al derivar.
8. Limpieza (`whatsapp_evento` > 7 días, flujos `[MVP]`, «noti lovable») y auditoría de
   `DEFAULT 1` en las funciones SQL.

## Riesgos

- **Un cambio en la plantilla afecta en vivo a todos los que heredan.** Mitigación: la pantalla
  muestra a cuántos afecta antes de guardar y queda auditado. Los restaurantes que ya tienen
  valores guardados (p. ej. la pausa de 120 min) cuentan como personalizados y no cambian.
- **Todos los lectores de `agente_*` deben usar el resolvedor.** Se cubre con pruebas y una única
  función de lectura.
- El diccionario pasa a mandar sobre la pantalla: cada parámetro nuevo exige su fila y sus límites.

## Decisiones del promotor (2026-11-15)

1. **Premium (`whatsapp.agent_pro`):** notificaciones de estado, aviso previo a la caducidad del
   carrito y cancelación automática de pagos pendientes. Todo lo demás es básico.
2. **Derivación:** el aviso va por correo, al propietario por defecto o a `agente_derivar_email`
   si está configurado. No se deriva por WhatsApp.
3. **`PURGA_PEDIDOS_PERMITIDA=true` solo en staging.**
4. Caducidad del carrito 30 min con aviso a los 25; cancelación de pago pendiente a los 60 min
   (0 = no cancelar), configurable por restaurante.
5. Alérgenos fuera de WhatsApp: nota con enlace a la carta; el agente nunca los afirma ni descarta.
6. La limpieza se hace solo en staging; los flujos `[MVP]` y «noti lovable» (flujo operativo de La
   Isla) no se tocan sin decisión expresa. `DEFAULT 1` en funciones SQL: solo informe de solo
   lectura (`packages/db/checks/default_restaurante_report.sql`); la migración exige confirmar antes
   con los flujos activos que nadie llama sin restaurante.

## Estado del plan

| PR  | Contenido                                             |
| --- | ----------------------------------------------------- |
| 141 | Purga de pedidos en interno                           |
| 142 | Plantilla estándar, módulo premium, API de ajustes    |
| 143 | Pestaña de Ajustes y pantalla interna                 |
| 144 | Alérgenos → nota con enlace                           |
| 145 | Caducidad de carritos, aviso previo, pagos pendientes |
| 146 | Avisos de estado por WhatsApp (premium)               |
| 147 | Correo al derivar                                     |
| 148 | Purga de `whatsapp_evento` e informe de `DEFAULT 1`   |
