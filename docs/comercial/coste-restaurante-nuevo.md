# Coste de un restaurante nuevo en Konnecttia

9 de noviembre de 2026

Un restaurante que recibe todos sus pedidos por el agente de WhatsApp cuesta a Konnecttia unos 6 € al mes con 100 pedidos y unos 173 € con 1.000; si los pedidos entran por la web, el coste variable es casi cero.

## Supuestos

- **Medido o dado por el promotor:** VPS de la UE de 16 GB a 30 $ al mes; el alta de un restaurante lleva 3 horas si ya se tienen todos los datos del cliente; en desarrollo la IA no ha costado más de 10 $.
- **Tarifas consultadas (noviembre de 2026):** Resend, WhatsApp de Meta, Chatwoot y el modelo de IA del agente (ver Fuentes).
- **Estimado, a confirmar con datos reales:** 8 respuestas del agente por pedido; 25 llamadas al modelo por pedido con unos 5.000 tokens de entrada y 300 de salida cada una; 4 correos por pedido (1 al local y 3 al cliente).
- **Peor caso:** todos los pedidos pasan por el agente de WhatsApp. Los pedidos hechos en la web no gastan IA ni mensajes de WhatsApp.
- **Cambio:** 1 $ = 0,92 € (supuesto).

## Coste mensual por restaurante

Con el agente en todos los pedidos, el coste variable pasa de 6 € a 173 € y casi todo es WhatsApp de Meta a partir de 200 pedidos.

| Pedidos al mes | IA del agente (€) | WhatsApp de Meta (€) | Chatwoot (€) | Total variable (€) | Correos al mes |
| -------------- | ----------------- | -------------------- | ------------ | ------------------ | -------------- |
| 100            | 5,7               | 0                    | 0            | 5,7                | 400            |
| 200            | 11,4              | 10,0                 | 0            | 21,4               | 800            |
| 300            | 17,1              | 23,2                 | 0            | 40,3               | 1.200          |
| 500            | 28,5              | 49,8                 | 0            | 78,3               | 2.000          |
| 1.000          | 57,0              | 116,2                | 0            | 173,2              | 4.000          |

Costes que no dependen del restaurante, compartidos por toda la plataforma:

| Servicio              | Coste                | Cuándo se paga                                                        |
| --------------------- | -------------------- | --------------------------------------------------------------------- |
| VPS de la UE, 16 GB   | 30 $ al mes (27,6 €) | Siempre; con 10 restaurantes son 2,8 € cada uno                       |
| Resend, plan gratuito | 0 €                  | Hasta 3.000 correos al mes y 100 al día, entre todos los restaurantes |
| Resend, plan Pro      | 20 $ al mes (18,4 €) | Desde 50.000 correos al mes incluidos; sin límite diario              |
| Chatwoot propio       | 0 €                  | Sin límite de mensajes; solo gasta recursos del VPS                   |

El límite de 100 correos al día se alcanza con unos 25 pedidos diarios en toda la plataforma, antes que el de 3.000 al mes. Con tres o cuatro restaurantes activos conviene pasar a Pro.

## Qué pesa más y qué decidir

El agente de WhatsApp es el único coste que crece de verdad con los pedidos, así que su precio debe cubrirlo.

- **Precio del agente:** con 300 pedidos al mes cuesta unos 40 €; el precio del complemento debería cubrir eso o incluir un número de pedidos y cobrar el exceso.
- **Cambio de Meta del 1 de octubre de 2026:** según varias fuentes del sector, las respuestas dentro de las 24 horas dejan de ser gratis: los primeros 1.000 mensajes por número y mes sin coste, y después la tarifa de plantilla de utilidad (0,0166 € en España). Falta confirmarlo en la tarifa oficial de Meta o con Kapso, porque cambia la tabla de arriba.
- **Modelo del agente:** los flujos usan `gpt-4.1-mini`, que OpenAI marca como obsoleto; al cambiar de modelo el coste por pedido puede variar.
- **Código antifraude:** con el tope de 10 € al mes por restaurante caben unos 600 códigos por WhatsApp (0,0166 € cada uno) o unos 120 por SMS (unos 0,08 € cada uno).
- **Correo obligatorio en el checkout:** sube el gasto de Resend a unos 4 correos por pedido, ya recogido en la tabla.

## Alta de un restaurante

Dar de alta un restaurante lleva unas 3 horas si ya se tienen todos los datos del cliente; sin ellos, el tiempo lo marca la espera de la carta y los horarios.

- La importación de la carta desde `/interno` (carta en un archivo) y el checklist de alta son lo que más acorta esas horas.
- Falta medir cuánto baja con la importación; conviene apuntar las horas reales de las dos próximas altas, p. ej. Arepa's Factory.
- Falta el coste de la hora de trabajo para convertir las 3 horas en euros.

## Fuentes

- [Resend: precios y límites](https://resend.com/pricing.md): gratuito 3.000 correos al mes y 100 al día; Pro desde 20 $ con 50.000 correos.
- [Meta: precios de WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing): mensajes gratuitos y de pago por tipo de plantilla.
- [Tarifas de WhatsApp en España](https://whautomate.com/whatsapp-business-api-pricing-spain): 0,0585 € marketing, 0,0166 € utilidad y autenticación (resumen de un tercero).
- [Cambio de Meta del 1 de octubre de 2026](https://respond.io/blog/whatsapp-pricing-change-2026): primeros 1.000 mensajes de servicio gratis por número y mes (resumen de un tercero).
- [Chatwoot: planes y edición gratuita](https://www.featurebase.app/blog/chatwoot-pricing.md): edición propia gratuita con licencia MIT; la nube gratuita admite 2 agentes y 500 conversaciones.
- [OpenAI: GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini.md): 0,40 $ de entrada y 1,60 $ de salida por millón de tokens.
