import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Eventos: subir imágenes de plantillas (≤ 4 MB) e importar listas en CSV.
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  // Para poder publicarse como pestaña de Teams y como tab de icam web dashboard (iframe).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://go.imparcapital.com https://teams.microsoft.com https://*.teams.microsoft.com https://*.office.com https://*.cloud.microsoft",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
