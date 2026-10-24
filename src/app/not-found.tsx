import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-[96px] font-bold leading-none text-brand">404</div>
      <h1 className="text-2xl font-semibold">This page faded into the night.</h1>
      <p className="max-w-sm text-muted">It may have been moved or deleted. 夜は、まだ終わらない。</p>
      <Link href="/" className="rounded-full bg-brand px-6 py-3 font-semibold text-white transition-colors duration-150 hover:bg-brand-2">
        Back to YORU
      </Link>
    </div>
  );
}
