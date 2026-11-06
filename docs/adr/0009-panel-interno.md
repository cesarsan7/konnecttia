# ADR 0009 — Panel interno de Konnecttia: dentro de `apps/easyorder`, protegido en la API

- Estado: aceptada (2026-11-06)
- Origen: pieza 8 del plan del panel (alta de restaurantes, plan, módulos) y pieza K (métodos de
  pago permitidos por Konnecttia). Ver `docs/plan-panel-easyorder.md`.

## Contexto

Hasta ahora, dar de alta un restaurante, cambiar su plan, activar un complemento o limitar sus
métodos de pago se hacía por SQL. `docs/konnecTTia.md` y el mapa del repositorio prevén un
`apps/admin` para esto, pero montarlo hoy obliga a añadir otro servicio y otro dominio en
EasyPanel (despliegue, variables de Supabase, CORS, certificado) cuando el volumen de trabajo
interno es pequeño: una o dos personas, unas pocas operaciones.

## Decisión

1. **La interfaz del panel interno vive en `apps/easyorder`**, bajo `/interno` (`/interno`,
   `/interno/[id]`, `/interno/nuevo`). Es el mismo despliegue, el mismo login de Supabase y el
   mismo `PanelProvider` que el panel de los restaurantes. No se crea otro servicio ni dominio.
2. **La frontera de seguridad está en la API.** La interfaz solo decide qué mostrar. Toda ruta
   `/plataforma/*` de `apps/api` exige un Bearer de Supabase válido **y** una fila activa en
   `plataforma_miembro` (middleware `requirePlatform`): 401 sin sesión, 403 si no es del equipo.
   Nadie entra por ser propietario de un restaurante.
3. **Dos roles de plataforma.** `soporte` solo lee; `admin` lee y escribe (`requirePlatform`
   con el rol mínimo en cada ruta). Un `soporte` que intenta escribir recibe 403 y queda en la
   auditoría.
4. **Sin alta desde la interfaz.** Las personas del equipo se insertan por SQL (el primer
   usuario debe existir antes en Supabase Auth):

   ```sql
   INSERT INTO public.plataforma_miembro (user_id, email, rol)
   VALUES ('<uuid-del-usuario-en-supabase>', '<email-de-la-persona>', 'admin');
   ```

   Baja sin borrar historial: `UPDATE public.plataforma_miembro SET activo = false WHERE user_id = '<uuid>';`
5. **Toda escritura se audita** con `actor_tipo = 'plataforma'` (valor nuevo del CHECK de
   `auditoria`), el usuario que actúa y el restaurante afectado. Los accesos denegados también.
6. **La interfaz no da acceso a ningún restaurante.** «Abrir su panel» solo navega a
   `/panel/<slug>`; para operar dentro hay que ser miembro de ese restaurante.

## API

| Ruta                                            | Rol mínimo | Qué hace                                                                   |
| ----------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `GET /plataforma/yo`                            | soporte    | `{ email, rol }`; la interfaz decide si muestra el panel                   |
| `GET /plataforma/restaurantes?q=`               | soporte    | Lista con plan, locales, equipo, pedidos de 30 días y último pedido        |
| `GET /plataforma/restaurantes/:id`              | soporte    | Ficha: plan, módulos frente al catálogo, métodos de pago, locales, equipo  |
| `POST /plataforma/restaurantes`                 | admin      | Alta: restaurante, local principal, plan, módulos e invitación Propietario |
| `PUT /plataforma/restaurantes/:id/plan`         | admin      | Cambia el plan y resincroniza los módulos de origen `plan`                 |
| `PUT /plataforma/restaurantes/:id/modulos/:c`   | admin      | Activar (complemento/cortesía), suspender o cancelar un módulo             |
| `PUT /plataforma/restaurantes/:id/metodos-pago` | admin      | Métodos permitidos (`null` = todos) y limpieza de los activos              |

Reglas relevantes:

- **Alta en una transacción**: `restaurante` (solo lo pedido; el resto con los valores por
  defecto de la tabla), su `sucursal` principal (la crea el trigger de la migración 0003 y se le
  pone el nombre del local), `restaurante_plan`, copia de los módulos del plan a
  `restaurante_modulo` con origen `plan` e invitación con la plantilla de rol Propietario para el
  email indicado. El email se envía con el mailer de Resend si está configurado; la respuesta
  incluye siempre el enlace (o el token si la API no conoce la URL del panel).
- **Slug**: formato `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 a 40 caracteres, único, y fuera de una lista
  de slugs reservados (`RESERVED_SLUGS` en `packages/domain`: `panel`, `interno`, `api`, `admin`,
  `www`, `plataforma`, `privacidad`…). Es una constante técnica porque esos nombres chocan con
  rutas de la web.
- **Cambio de plan**: los módulos de origen `plan` que el plan nuevo no incluye se quitan; los
  que faltan se añaden; los de origen `complemento` o `cortesia`, y el estado (suspendido,
  cancelado) de los que ya existen, se respetan.
- **Módulos y `depende_de`**: no se activa un módulo si sus dependencias no están activas
  (`422 dependency_missing`) y no se suspende ni cancela uno mientras otro módulo activo dependa
  de él (`409 has_dependents`). Los módulos `core` y `future` no se gestionan desde aquí.
- **Métodos de pago (K)**: `restaurante.metodos_pago_permitidos` (`NULL` = todos). Al fijar una
  lista se quitan de `payment_methods` los métodos que ya no se permiten (la respuesta los
  devuelve). En Ajustes del restaurante, `metodos_disponibles` es esa lista y guardar un método no
  permitido da `422 payment_method_not_allowed`. La carta pública y el checkout leen
  `payment_methods` ya limitado a la lista, así que un método no permitido no se ofrece nunca,
  ni siquiera si se cargó por SQL.

## Migración

`0022_plataforma.sql`: tabla `plataforma_miembro`, columna `restaurante.metodos_pago_permitidos`
(jsonb, `NULL` por defecto) y valor `plataforma` en el CHECK de `auditoria.actor_tipo`. Solo
añade; sin filas en `plataforma_miembro` nadie entra al panel interno y todo restaurante conserva
los métodos que tiene.

## Consecuencias

- **Reversible.** Las rutas `/plataforma/*` no dependen de dónde esté la interfaz: si mañana se
  mueve a `apps/admin`, la API no cambia. Basta con mover `app/interno` y `components/interno`
  y reutilizar `lib/interno` (cliente de la API y lógica pura).
- El panel interno comparte despliegue con el panel de los restaurantes: un fallo de la web
  afecta a ambos, y la sesión de Supabase es la misma. A cambio, no hay otro servicio que operar.
- `apps/admin` sigue previsto para cuando el panel interno crezca (roles propios por
  restaurante, plantillas de Konnecttia, pruebas gratuitas, facturación). `apps/admin/README.md`
  apunta a esta decisión.
- La API del panel interno acepta peticiones del origen de la web (CORS ya limita a los
  orígenes permitidos). Quien tenga un token válido pero no sea del equipo solo obtiene 403.
- Pendiente (siguientes partes de la pieza 8): ver y editar roles de cualquier restaurante,
  plantillas de rol propias de Konnecttia, pruebas gratuitas y su conversión, checklist de
  configuración del primer acceso.

## Alternativas descartadas

- **`apps/admin` ya, como servicio aparte**: otro dominio, otro despliegue y otra configuración
  de Supabase y CORS para un uso mínimo. Se hará cuando compense.
- **Reutilizar el rol `owner` de un restaurante para dar acceso interno**: mezcla dos niveles de
  confianza; un propietario de un restaurante no debe poder tocar a otros.
- **Dar de alta restaurantes solo por SQL**: lo que había; propenso a errores (módulos del plan
  sin copiar, local principal sin nombre, invitación sin crear) y sin auditoría.
