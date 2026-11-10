import type { MetadataRoute } from "next";

/** App instalable del tablero: se abre a pantalla completa desde el icono del móvil o del escritorio. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EasyOrder · Tablero",
    short_name: "EasyOrder",
    description: "Tablero de pedidos de tu restaurante.",
    start_url: "/panel",
    scope: "/",
    display: "standalone",
    background_color: "#0E2A33",
    theme_color: "#0E2A33",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
