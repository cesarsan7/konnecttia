# ADR 0011 — Antifraude capa 3: código de verificación solo con riesgo

- Estado: aceptada (2026-11-09). El promotor decidió: solo WhatsApp por ahora desde un número central de Konnecttia (el SMS queda descartado y se podrá añadir más adelante), umbral de importe de 30 € por defecto ajustable por restaurante y tope de 10 € al mes por restaurante
- Desarrolla: plan del panel, pieza Q (capas 1 y 2 ya en producción, migración 0021)

## Contexto

Las capas 1 y 2 ya funcionan: límites de pedidos por teléfono, captcha Turnstile opcional y
teléfonos bloqueados por restaurante. El paso de n8n que consulta `fn_telefono_bloqueado` ya está
en el flujo `[MVP] Apertura` de staging («Verificar Puede Pedir»). Falta la capa 3: pedir un código
cuando el pedido web tiene riesgo, para frenar pedidos falsos sin molestar al cliente habitual.

## Opciones y coste

| Opción                                      | Coste por 1.000 códigos | Notas                                                            |
| ------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| WhatsApp, plantilla de autenticación (Meta) | ≈ 16,6 €                | Tarifa España 0,0166 € por mensaje. Requiere plantilla aprobada. |
| SMS (Twilio)                                | ≈ 87,5 $                | 0,0875 $ por segmento. Sin plantilla; llega a cualquier móvil.   |
| Sin capa 3 (solo capas 1 y 2)               | 0                       | Riesgo: pedidos falsos de teléfonos nuevos con pago en efectivo. |

Las tarifas son de consulta pública (noviembre de 2026) y pueden cambiar; confirmar antes de contratar.

## Decisión

1. **Canal: WhatsApp, con plantilla de autenticación, desde un número central de Konnecttia.**
   Una sola cuenta de WhatsApp Business y una sola plantilla aprobada para todos los
   restaurantes; el coste lo asume Konnecttia y entra en el tope de cada restaurante. El
   **SMS queda descartado por ahora**: la clave `antifraude_codigo_canal` ya admite `sms` en la
   base (migración 0026), pero la API no lo ofrece; se retoma si algún restaurante lo pide.
   Sin clave, la capa 3 queda apagada.
2. **Cuándo se pide el código** (cualquiera de estas):
   - teléfono sin ningún pedido entregado en ese restaurante,
   - reparto con pago en efectivo,
   - importe a partir del umbral: **30 € por defecto**. Cada restaurante puede cambiarlo en
     la clave `antifraude_codigo_importe_umbral_eur`; sin clave se aplica el valor por defecto.
3. **Cuándo no:** el cliente con un pedido entregado antes no repite el código.
4. **Tope de gasto:** 10 € al mes por restaurante por defecto (clave de configuración, ajustable
   desde `/interno`). Equivale a unos 600 códigos por WhatsApp. Al llegar al tope, el pedido de
   riesgo no se bloquea en seco: se pide pagar con tarjeta o llamar al local, y se avisa al local
   y a Konnecttia.
5. **Alcance:** el pedido por WhatsApp no lo necesita (el número ya está verificado por Meta); solo
   el checkout web.
6. **Quién envía el código.** Como el mensaje sale de un número central, el cliente debe saber de
   qué local es. Meta solo permite enviar códigos en plantillas de autenticación, que siguen un
   formato oficial (texto del código y poco más; sin enlaces ni emojis). Por eso:
   - La pantalla del checkout dice dónde llegará el código: «Te enviamos un código por WhatsApp
     desde Pedidos Konnecttia» y nombra el restaurante.
   - Se intentará que la plantilla lleve el nombre del restaurante («Pedidos · La Isla»). Es una
     variable de la cabecera o del texto, **pendiente de confirmar con la aprobación de Meta**
     (el nombre debe tener 15 caracteres o menos como parámetro). Si Meta no lo aprueba, el mensaje
     lleva solo el nombre de Konnecttia y el local se nombra en la pantalla.
   - Se envía directamente desde la API a la API de WhatsApp de Meta; n8n no interviene en este
     paso (el cliente espera con el checkout abierto y es un paso de seguridad).

## Qué tocaría (si se aprueba)

- Componente: API (checkout público y envío por la API de WhatsApp de Meta), web (paso del código), `/interno` (activar el canal en el alta).
- Reutiliza: `fn_telefono_bloqueado`, claves de configuración del antifraude, Turnstile, auditoría.
- Tablas nuevas a proponer: códigos de verificación (teléfono, código con hash, caducidad, intentos).
  No se crean hasta aprobar esta propuesta.
- Riesgo: medio. Un fallo de entrega impide pedir; mitigación: reintento y, si falla, mensaje para
  pedir por WhatsApp o llamar al local.
- Fase: MVP.

## Pendiente

1. Promotor: crear o confirmar la cuenta de WhatsApp Business de Konnecttia y pedir la aprobación
   de la plantilla de autenticación (puede tardar de horas a unos días).
2. Confirmar con Meta si la plantilla admite el nombre del restaurante (punto 6).
3. Confirmar las tarifas de Meta a partir de octubre de 2026.
