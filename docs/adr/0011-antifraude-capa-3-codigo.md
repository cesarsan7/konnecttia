# ADR 0011 — Antifraude capa 3: código de verificación solo con riesgo

- Estado: propuesta (2026-11-08), pendiente de que el promotor elija proveedor y tope de gasto
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

## Decisión propuesta

1. **Canal:** WhatsApp (plantilla de autenticación) por el mismo número y proveedor del agente
   (ADR 0005); SMS solo como alternativa si WhatsApp no entrega. Es unas cinco veces más barato.
2. **Cuándo se pide el código** (cualquiera de estas):
   - teléfono sin ningún pedido entregado en ese restaurante,
   - reparto con pago en efectivo,
   - importe por encima de un umbral por restaurante (clave de configuración, sin clave = sin regla).
3. **Cuándo no:** el cliente con un pedido entregado antes no repite el código.
4. **Tope de gasto:** clave de configuración con un máximo mensual de códigos por restaurante; al
   llegar al tope, se bloquea el pedido de riesgo y se avisa al local.
5. **Alcance:** el pedido por WhatsApp no lo necesita (el número ya está verificado por Meta); solo
   el checkout web.

## Qué tocaría (si se aprueba)

- Componente: API (checkout público), web (paso del código), n8n (envío de la plantilla).
- Reutiliza: `fn_telefono_bloqueado`, claves de configuración del antifraude, Turnstile, auditoría.
- Tablas nuevas a proponer: códigos de verificación (teléfono, código con hash, caducidad, intentos).
  No se crean hasta aprobar esta propuesta.
- Riesgo: medio. Un fallo de entrega impide pedir; mitigación: reintento y, si falla, mensaje para
  pedir por WhatsApp o llamar al local.
- Fase: post-MVP.

## Pendiente del promotor

1. Elegir canal (WhatsApp o SMS) y presupuesto mensual.
2. Confirmar las reglas de riesgo y el umbral de importe.
