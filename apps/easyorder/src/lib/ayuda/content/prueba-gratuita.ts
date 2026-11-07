import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const pruebaGratuita: HelpPage = {
  slug: HELP_SLUG.Trial,
  title: "Prueba gratuita",
  summary: "Crea tu restaurante, pruébalo gratis y mira qué pasa cuando termina la prueba.",
  group: HELP_GROUP.Start,
  keywords: [
    "alta",
    "registro",
    "crear cuenta",
    "gratis",
    "probar",
    "plan",
    "caduca",
    "terminó",
    "días",
    "aprobación",
    "comisión",
  ],
  purpose: [
    "Puedes probar EasyOrder gratis con tu propio restaurante: creas tu carta y empiezas a recibir pedidos por la web, sin comisión por pedido.",
    "La prueba tiene un límite de días, de pedidos o de los dos. Lo fija Konnecttia y lo verás en la página de alta y en el aviso de arriba del panel.",
  ],
  steps: [
    {
      text: "Abre el enlace de alta que te ha dado Konnecttia (termina en «/alta»). Arriba verás cuánto dura la prueba.",
      shot: {
        file: "alta",
        alt: "Página de alta con el texto Prueba EasyOrder gratis y el formulario para crear la cuenta",
      },
    },
    {
      text: "Crea tu cuenta con tu email y una contraseña. Te enviamos un correo para confirmar el email: ábrelo y volverás a la página para seguir. Si ya tienes cuenta, pulsa «Ya tengo cuenta».",
    },
    {
      text: "Cuéntanos cómo es tu restaurante en tres pasos. «Tu restaurante»: el nombre, la dirección web de tu carta y, si quieres, tu nombre. «Tu local»: nombre, dirección, teléfono y zona horaria. «Servicio»: si ofreces recogida en el local, reparto a domicilio o las dos cosas.",
    },
    {
      text: "Pulsa «Crear mi restaurante». Entras en tu panel con la prueba ya activa. Empiezas cobrando en efectivo y con tarjeta; el resto de métodos (Bizum, transferencia) los activas luego en Ajustes.",
    },
    {
      text: "Mira el aviso de arriba del panel: te dice cuántos días y cuántos pedidos te quedan. Se pone en ámbar cuando quedan pocos.",
      shot: {
        file: "prueba-aviso",
        alt: "Panel con el aviso Prueba: te quedan 11 días y 50 pedidos",
      },
    },
    {
      text: "Cuando quieras seguir con EasyOrder, escribe a hola@konnecttia.com para activar tu plan.",
    },
  ],
  faq: [
    {
      question: "¿Cuánto dura la prueba?",
      answer:
        "Lo decide Konnecttia. Puede ser un número de días, un número de pedidos o las dos cosas (termina lo que ocurra primero). Lo ves en la página de alta y en el aviso del panel.",
    },
    {
      question: "¿Qué pasa cuando termina?",
      answer:
        "Tu carta deja de aceptar pedidos, pero tus datos se conservan: la carta, los clientes y los pedidos siguen ahí. Cuando actives tu plan, vuelves a recibir pedidos.",
    },
    {
      question: "¿Qué pedidos cuentan para el límite?",
      answer:
        "Los pedidos reales. No cuentan los carritos sin terminar ni los pedidos cancelados o caducados.",
    },
    {
      question: "Mi solicitud está «Pendiente de aprobación»",
      answer:
        "A veces Konnecttia revisa cada solicitud antes de activar los pedidos. Mientras tanto puedes preparar tu carta; te avisaremos en cuanto tu restaurante pueda recibir pedidos.",
    },
    {
      question: "Dice que el alta está cerrada",
      answer:
        "Konnecttia abre y cierra el alta. Escribe al email que aparece en esa página y te ayudamos a empezar.",
    },
    {
      question: "¿Puedo hacer otra prueba con el mismo email?",
      answer:
        "No: cada cuenta tiene una sola prueba. Si necesitas algo más, escríbenos a hola@konnecttia.com.",
    },
    {
      question: "¿Cobráis comisión por pedido?",
      answer: "No. EasyOrder no cobra comisión por los pedidos que recibes.",
    },
  ],
  related: [HELP_SLUG.FirstSteps, HELP_SLUG.Settings, HELP_SLUG.Payments],
};
