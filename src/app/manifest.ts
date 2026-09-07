import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JasMiamiMethod",
    short_name: "Jasmethod",
    description: "Daily training and coaching",
    start_url: "/today",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0c4a6e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
