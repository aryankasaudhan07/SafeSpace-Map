import type { MetadataRoute } from "next";

// Installable app ("Add to home screen"), with shortcuts for the two urgent actions.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeSpace Map",
    short_name: "SafeSpace",
    description: "AI safety companion for women in Delhi: unsafe spots, safest routes, SOS and live location.",
    start_url: "/",
    display: "standalone",
    background_color: "#ecedf0",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "SOS · Help now", short_name: "SOS", url: "/?go=help" },
      { name: "Report a spot", short_name: "Report", url: "/?go=report" },
    ],
  };
}
