import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // La ubicación solo se pide si el cliente pulsa «Usar mi ubicación».
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  // Solo HTTPS durante un año (sin subdominios: no todos los servicios del dominio lo tienen).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Restricciones que no afectan a los scripts de Next: nadie la incrusta, sin plugins ni <base>.
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@konnecttia/domain"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // El service worker no se cachea: una versión nueva debe llegar al abrir la app.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
