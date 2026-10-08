import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Para poder publicarse como pestaña de Teams (iframe dentro de Teams).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.office.com https://*.cloud.microsoft",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
