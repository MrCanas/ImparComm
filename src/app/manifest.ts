import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ImparComm",
    short_name: "ImparComm",
    description: "CRM relacional por empleado de Impar Capital",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F5F5",
    theme_color: "#1E2A56",
    lang: "es",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
