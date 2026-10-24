import type { MetadataRoute } from "next";

// Lets phones "Add to Home Screen" (iPhone) / install the site as an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IsraelTokn't",
    short_name: "IsraelTokn't",
    description: "The internet was a mistake. You made it worse.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#04060d",
    theme_color: "#04060d",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
