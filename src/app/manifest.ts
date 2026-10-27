import type { MetadataRoute } from "next";

// Lets phones "Add to Home Screen" (iPhone) / install the site as an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "YORU 夜",
    short_name: "YORU",
    description: "The internet after dark. 夜は、まだ終わらない。",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080808",
    theme_color: "#080808",
    icons: [
      { src: "/brand/yoru/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/yoru/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
