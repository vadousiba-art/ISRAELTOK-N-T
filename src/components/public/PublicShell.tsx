import Link from "next/link";
import { Logo, Tagline } from "@/components/ui/Logo";
import { LegalLinks } from "./LegalLinks";

// Layout for the public, no-login pages (website, legal, help).
export function PublicShell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--brand)_16%,transparent),transparent_70%)]" aria-hidden />
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/about" aria-label="YORU home" className="flex flex-col gap-1">
            <Logo width={112} />
            <Tagline className="hidden sm:block" />
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/faq" className="hidden rounded-full px-3 py-1.5 text-ink-2 hover:text-ink sm:block">
              FAQ
            </Link>
            <Link href="/support" className="hidden rounded-full px-3 py-1.5 text-ink-2 hover:text-ink sm:block">
              Support
            </Link>
            <Link href="/login" className="rounded-full px-3 py-1.5 text-ink-2 hover:text-ink">
              Log in
            </Link>
            <Link href="/join" className="rounded-full bg-brand px-3.5 py-1.5 font-semibold text-white transition-colors duration-150 hover:bg-brand-2">
              Join
            </Link>
          </nav>
        </div>
      </header>
      <main className={wide ? "mx-auto max-w-5xl px-4 py-10" : "mx-auto max-w-3xl px-4 py-10"}>{children}</main>
      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center">
          <LegalLinks />
          <p className="text-xs text-muted">© {new Date().getFullYear()} YORU · 夜は、まだ終わらない。</p>
        </div>
      </footer>
    </div>
  );
}

export function LegalDoc({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="legal">
      <h1>{title}</h1>
      <p className="text-sm text-muted">Last updated {updated}</p>
      {children}
    </article>
  );
}
