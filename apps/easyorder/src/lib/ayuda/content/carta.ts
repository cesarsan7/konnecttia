import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const carta: HelpPage = {
  slug: HELP_SLUG.Menu,
  title: "Carta",
  summary: "Crea categorías, productos y extras, y decide qué se ve en tu carta online.",
  group: HELP_GROUP.Business,
  keywords: [
    "productos",
    "categorías",
    "extras",
    "suplementos",
    "precios",
    "tamaños",
    "alérgenos",
    "foto",
    "agotado",
    "ocultar",
    "disponible",
    "menú",
  ],
  purpose: [
    "La carta es lo que tus clientes ven y piden en la web. Aquí creas y ordenas lo que vendes, con sus precios, fotos y alérgenos.",
    "Los productos son lo que vendes. Los extras son suplementos que el cliente puede añadir, como queso o una salsa.",
  ],
  steps: [
    {
      text: "Entra en Carta. Arriba tienes dos pestañas: Productos y Extras.",
      shot: {
        file: "carta-productos",
        alt: "Carta con las categorías y los productos, cada uno con su precio e interruptor de disponible",
      },
    },
    {
      text: "Crea primero una categoría (hamburguesas, bebidas, postres…). Un producto siempre vive dentro de una.",
    },
    {
      text: "Pulsa «Nuevo producto». Ponle nombre, elige la categoría, indica el precio (o los precios por tamaño), añade una foto y marca los alérgenos.",
      shot: {
        file: "carta-producto",
        alt: "Formulario de un producto con nombre, categoría, precios, foto y alérgenos",
      },
    },
    {
      text: "En la pestaña Extras crea los suplementos con su precio (0 si es gratis) y elige en qué productos se ofrecen.",
      shot: {
        file: "carta-extras",
        alt: "Lista de extras con su precio y si están disponibles",
      },
    },
    {
      text: "Para cambiar algo, pulsa el nombre del producto. Con el interruptor «Disponible» marcas un producto como agotado sin quitarlo de la carta.",
    },
    {
      text: "Usa «Ocultar» para quitar un producto o una categoría de la carta sin borrarlos, y las flechas para cambiar el orden.",
    },
    {
      text: "Si tienes muchos productos, búscalos escribiendo parte del nombre.",
    },
  ],
  faq: [
    {
      question: "Hay un producto agotado, ¿qué hago?",
      answer:
        "Apaga el interruptor «Disponible». Sigue en tu carta, pero el cliente no puede pedirlo. Cuando vuelva a haber, lo enciendes.",
    },
    {
      question: "¿Qué diferencia hay entre ocultar y borrar?",
      answer:
        "Ocultar solo lo quita de la carta y lo puedes recuperar. Borrar lo elimina del todo y te pide confirmar.",
    },
    {
      question: "No puedo subir la foto",
      answer:
        "Usa una foto JPG, PNG o WebP de menos de 5 MB. Si tu cuenta no tiene la subida activada, te pedirá pegar la dirección (URL) de la foto.",
    },
    {
      question: "No puedo crear productos",
      answer:
        "Primero necesitas al menos una categoría. Y tu rol tiene que poder crear productos: pide al propietario que lo revise en Equipo.",
    },
    {
      question: "¿Para qué sirven los alérgenos?",
      answer: "Se muestran al cliente en la carta online, junto al producto.",
    },
  ],
  related: [HELP_SLUG.WebOrders, HELP_SLUG.Orders, HELP_SLUG.Settings],
};
