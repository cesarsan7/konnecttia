# Prueba de impresión de comanda en Siempre Juntos

8 de noviembre de 2026

## Para qué sirve esta visita

Queremos saber si el panel de EasyOrder puede imprimir una comanda en la impresora de cocina de Siempre Juntos, sin romper lo que ya funciona con FireSoft.

- Impresora de cocina: **HiPOS SOL801**, térmica de 80 mm, conectada por cable de red (a través de un adaptador PLC TP-Link).
- TPV: **FireSoft** en el terminal Windows «DESKPOS». Este programa no se toca.
- Al terminar, queremos tres datos: la **IP** de la impresora, si **sale la comanda** y **qué equipo** usará el panel.

No hace falta saber de informática: cada paso dice qué hacer y qué apuntar. Si algo no sale a la primera, **no insistas ni cambies ajustes**: haz una foto y apúntalo.

## Qué llevar y qué pedir en el local

Ve en un rato tranquilo (fuera de la hora punta) y avisa al responsable de que saldrá una tira de prueba en cocina.

**Lleva**

- Tu móvil, para hacer fotos y para entrar al panel.
- Usuario y contraseña del panel de Siempre Juntos (te los pasa Cesar).
- Este documento, impreso o abierto en el móvil.

**Pide en el local**

- Permiso del responsable para usar el equipo donde se abrirá el panel (el terminal FireSoft, una tableta u otro PC).
- Que alguien te enseñe dónde está la impresora de cocina y el router.
- Papel térmico de 80 mm en la impresora.

## Paso 1: averiguar la IP de la impresora

La IP es la «dirección» de la impresora en la red. Sin ella no podemos conectarla después.

1. Mira la impresora HiPOS SOL801 y haz una foto de ella, del cable de red y del adaptador PLC que tiene al lado.
2. Apaga la impresora, **mantén pulsado el botón FEED** y enciéndela sin soltarlo. Suele imprimir una hoja de autotest con sus datos de red.
3. Haz una foto de la hoja y apunta la **IP** (por ejemplo 192.168.1.50) y el **puerto** (normalmente 9100).
4. Si no sale la hoja, no insistas. Pide al responsable que mire en FireSoft la configuración de impresoras: allí suele estar la IP. Haz una foto de esa pantalla.

No cambies nada en FireSoft: solo mirar y fotografiar.

## Paso 2: imprimir una comanda de prueba desde el panel

Aquí probamos lo importante: que el panel mande una comanda a la impresora desde el equipo del local.

1. En el equipo elegido, abre **Google Chrome** y entra al panel con el usuario de Siempre Juntos.
2. Ve a **Pedidos** y pulsa el botón **Comanda** (arriba, junto a los filtros).
3. Elige **Papel: 80 mm** y **Copia: Cocina (sin precios)**. Deja desmarcadas las opciones de imprimir al llegar o al aceptar.
4. Pulsa **Imprimir una prueba**. Aparece el cuadro de impresión de Chrome.
5. Mira la lista de impresoras: **¿aparece la HiPOS SOL801** (u otro nombre parecido)? Apunta qué nombres ves y haz una foto del cuadro.
6. Si aparece, selecciónala e imprime. Comprueba que sale, que ocupa el ancho del papel y que se lee bien (letras, acentos y símbolo €).
7. Haz una foto de la tira impresa.

Si la impresora **no aparece** en la lista, para aquí: no instales nada. Anota los nombres que sí salen y sigue con el Paso 3 solo si la tira salió.

## Paso 3 (opcional): imprimir sin el cuadro de diálogo

Para que la cocina reciba cada pedido sin que nadie pulse nada, Chrome debe abrirse con la opción `--kiosk-printing` y la impresora de cocina debe ser la predeterminada de ese equipo.

**Atención:** si el equipo es el terminal FireSoft, **no cambies la impresora predeterminada de Windows**. FireSoft podría dejar de imprimir donde debe. En ese caso solo apunta que existe esta limitación; Cesar lo resolverá con otro equipo o con otro método.

Si el equipo es una tableta o un PC que no usa FireSoft y el responsable lo permite:

1. Cierra todas las ventanas de Chrome.
2. Clic derecho en el acceso directo de Chrome, **Propiedades**, campo **Destino**.
3. Al final del texto, deja un espacio y añade `--kiosk-printing`. Acepta.
4. En Windows, pon la impresora de cocina como predeterminada (Configuración, Impresoras y escáneres).
5. Abre Chrome con ese acceso directo, repite la prueba del Paso 2 y apunta si ahora imprime **sin** preguntar.

## Paso 4: probar con un pedido de prueba

Solo si el Paso 2 funcionó. Con esto vemos cómo queda una comanda de verdad y si se duplica con lo que ya hace FireSoft.

1. En **Pedidos**, abre **Comanda** y marca **Imprimir al pulsar «Aceptar pedido»**.
2. Crea un pedido con **Nuevo pedido**: teléfono inventado, dos productos de la carta, uno con una nota (por ejemplo «sin cebolla»). Márcalo como **PRUEBA** en el nombre del cliente.
3. Púlsalo **Aceptar pedido** y mira la impresora de cocina.
4. Comprueba: ¿sale una sola tira? ¿se leen bien cantidades y notas? ¿tarda poco? Haz una foto.
5. Pregunta al responsable: **¿quién hace hoy el pedido en FireSoft?** Si alguien también lo teclea allí, cocina recibiría dos comandas. Apunta la respuesta.
6. Cancela el pedido de prueba desde el panel para que no cuente en las estadísticas.

## Hoja de resultados

Rellénala en el local (edita las celdas directamente) y adjunta las fotos al terminar.

| Dato                                                                     | Respuesta |
| ------------------------------------------------------------------------ | --------- |
| Fecha y hora de la visita                                                |           |
| Equipo donde se abrirá el panel (terminal FireSoft, tableta, otro PC)    |           |
| ¿Tiene Google Chrome?                                                    |           |
| IP de la impresora                                                       |           |
| Puerto (normalmente 9100)                                                |           |
| ¿Salió la hoja de autotest?                                              |           |
| ¿La impresora aparece en el cuadro de impresión de Chrome? Nombre exacto |           |
| ¿Salió la comanda de prueba?                                             |           |
| ¿Se lee bien (ancho, letras, acentos, €)?                                |           |
| ¿Se corta el papel solo?                                                 |           |
| ¿Imprime sin preguntar con `--kiosk-printing`? (Paso 3)                  |           |
| En el pedido de prueba, ¿una sola tira o dos?                            |           |
| ¿Quién hace hoy el pedido en FireSoft?                                   |           |
| ¿Se corta alguna vez la conexión de la impresora (PLC)?                  |           |
| Observaciones del responsable del local                                  |           |

**Fotos que traer:** la impresora y su cableado, la hoja de autotest, el cuadro de impresión con la lista de impresoras, la tira de prueba y la pantalla de configuración de impresoras de FireSoft.

## Si algo falla

Prueba solo lo de la tabla. Si no se arregla, haz una foto, anota lo que pasó y escribe a Cesar: es un dato valioso, no un fracaso.

| Qué pasa                             | Qué probar                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| No sale la hoja de autotest          | Revisa papel y tapa cerrada; repite el gesto (apagar, FEED, encender). Si no, mira la IP en FireSoft. |
| La impresora no aparece en Chrome    | No instales nada. Anota los nombres que aparecen y haz foto. Lo resuelve Cesar.                       |
| Sale papel en blanco o letras raras  | Anota el nombre de la impresora elegida y haz foto de la tira.                                        |
| Sale cortado o muy pequeño           | Comprueba que en Comanda está elegido 80 mm. Haz foto.                                                |
| La impresión tarda mucho o se pierde | Pregunta si el adaptador PLC pierde conexión; apunta cuándo ocurre.                                   |
| Sale la comanda dos veces            | Pregunta quién teclea el pedido en FireSoft y apunta la respuesta.                                    |
| FireSoft se comporta raro            | Para todo, no toques nada más y avisa al responsable y a Cesar.                                       |
