import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { appMode, supabaseAnonKey, supabaseUrl } from "@/lib/config";
import { AppProvider } from "@/components/providers/AppProvider";

// Config is read per request (env can differ between build and runtime).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "YORU — 夜", template: "%s · YORU" },
  description: "The internet after dark. A private, Japanese-inspired network for anime, manga, Vocaloid, gaming and art fans.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080808" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
  ],
};

// Applies the saved theme + motion preference before first paint.
const bootScript = `(function(){try{var t=localStorage.getItem('itn-theme')||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t;var m=localStorage.getItem('itn-motion');if(m==='reduce'||m==='full'){document.documentElement.dataset.motion=m}}catch(e){document.documentElement.dataset.theme='dark'}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = appMode();
  const publicConfig = {
    mode,
    supabaseUrl: mode === "supabase" ? (supabaseUrl() ?? null) : null,
    supabaseAnonKey: mode === "supabase" ? (supabaseAnonKey() ?? null) : null,
  };
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-dvh">
        <AppProvider config={publicConfig}>{children}</AppProvider>
      </body>
    </html>
  );
}
