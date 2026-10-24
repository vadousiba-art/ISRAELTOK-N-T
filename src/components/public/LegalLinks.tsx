import Link from "next/link";
import clsx from "clsx";

export const LEGAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
];

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={clsx("flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted", className)}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-ink">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
