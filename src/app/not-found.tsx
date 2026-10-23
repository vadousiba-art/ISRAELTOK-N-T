import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="glitch sticker text-[110px] leading-none text-hot" data-text="404">
        404
      </div>
      <h1 className="text-2xl font-black">This page touched grass and never came back.</h1>
      <p className="max-w-sm text-muted">
        It has been formally declared missing by three cats in sunglasses. The UN is &quot;monitoring the situation&quot;.
      </p>
      <Link href="/" className="rounded-full bg-brand px-6 py-3 font-black text-white transition hover:scale-105">
        Return to the chaos
      </Link>
    </div>
  );
}
