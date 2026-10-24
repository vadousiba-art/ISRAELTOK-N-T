import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public/PublicShell";
import { FAQ } from "@/lib/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about YORU.",
  robots: { index: true, follow: true },
};

export default function FaqPage() {
  return (
    <PublicShell>
      <div className="legal">
        <h1>Frequently asked questions</h1>
        <p className="text-sm text-muted">よくある質問</p>
      </div>
      <div className="mt-6 space-y-2">
        {FAQ.map((f, i) => (
          <details key={f.q} className="card group p-4 open:border-brand/50" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
              {f.q}
              <span className="text-brand transition-transform duration-200 group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">
        Didn&apos;t find your answer?{" "}
        <Link href="/support" className="text-brand underline">
          Contact support
        </Link>
        .
      </p>
    </PublicShell>
  );
}
