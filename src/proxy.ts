import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { appMode, supabaseAnonKey, supabaseUrl } from "@/lib/config";

const PUBLIC = ["/login", "/join", "/setup"];

// Optimistic auth gate + Supabase session refresh. Real authorization happens
// in Postgres (RLS + RPC checks); this only keeps logged-out users on /login.
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const mode = appMode();

  if (mode === "unconfigured") {
    if (pathname.startsWith("/setup")) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", req.url));
  }

  let res = NextResponse.next({ request: req });
  let authed = false;

  if (mode === "demo") {
    authed = Boolean(req.cookies.get("itn_demo_uid")?.value);
  } else {
    const sb = createServerClient(supabaseUrl()!, supabaseAnonKey()!, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await sb.auth.getUser();
    authed = Boolean(data.user);
  }

  if (!authed && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (authed && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|seed|brand|download|icon.png|apple-icon.png|favicon.ico|manifest.webmanifest).*)"],
};
