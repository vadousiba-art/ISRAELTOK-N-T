import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Download, Flame, MessagesSquare, Palette, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { PublicShell } from "@/components/public/PublicShell";
import { Logo, TAGLINE, TAGLINE_JP } from "@/components/ui/Logo";
import { CATEGORIES } from "@/lib/jokes";
import { FAQ } from "@/lib/faq";

export const metadata: Metadata = {
  title: "YORU — The internet after dark",
  description: "YORU (夜) is a free social network for anime, manga, music, Vocaloid, gaming and art fans. Posts, stories, group chats, nightly streaks and an AI comedian.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "YORU — The internet after dark",
    description: "A social network for anime, manga, Vocaloid, gaming and art fans.",
    images: ["/brand/yoru/feature-graphic.png"],
  },
};

const FEATURES = [
  { icon: Sparkles, title: "Feed & stories", body: "Post text, photos, GIFs, video and polls. 24-hour stories, reactions, ||spoilers|| and Tonight's picks." },
  { icon: MessagesSquare, title: "Group chats & DMs", body: "Realtime chats with typing indicators, replies, reactions and media." },
  { icon: Flame, title: "Levels & night streaks", body: "Earn XP, check in every night, climb from 新人 Newcomer to 夜の王 Night Sovereign." },
  { icon: Palette, title: "Make it yours", body: "Slide to recolor the entire app. Ambient stars, sakura, rain or fireflies." },
  { icon: Bot, title: "The AI Menace", body: "An opt-in AI comedian that roasts posts, rates takes and joins the chat." },
  { icon: ShieldCheck, title: "Safe by design", body: "Members-only content, block & report, admin moderation, no ads, no tracking." },
];

const SCREENS = [
  { src: "/brand/yoru/screens/1-home.png", alt: "YORU home feed with stories and nightly check-in" },
  { src: "/brand/yoru/screens/2-profile.png", alt: "A YORU profile with level ring and XP bar" },
  { src: "/brand/yoru/screens/3-color.png", alt: "The app color slider recoloring YORU in blue" },
  { src: "/brand/yoru/screens/4-chat.png", alt: "A YORU group chat" },
];

export default async function AboutPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return (
    <PublicShell wide>
      {deleted && (
        <p className="mb-6 rounded-2xl border border-line bg-card p-4 text-sm text-ink-2" role="status">
          Your account has been deleted. Thanks for spending some nights with us. 夜は、まだ終わらない。
        </p>
      )}
      <section className="flex flex-col items-center py-8 text-center">
        <Logo width={300} />
        <p className="tagline mt-4 text-sm text-ink">{TAGLINE}</p>
        <p className="mt-2 text-muted">{TAGLINE_JP}</p>
        <h1 className="mt-8 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">Find your people. Your next conversation starts here.</h1>
        <p className="mt-3 max-w-xl text-ink-2">
          A free social network for anime, manga, music, Vocaloid, gaming and art fans. No ads. No algorithm farming you. Just the internet after dark.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/join" className="rounded-full bg-brand px-6 py-3 font-semibold text-white transition-colors duration-150 hover:bg-brand-2">
            Create a free account
          </Link>
          <a href="/download/yoru.apk" download="YORU.apk" className="flex items-center gap-2 rounded-full border border-line bg-card px-6 py-3 font-semibold transition-colors duration-150 hover:border-brand">
            <Download size={18} /> Android app
          </a>
          <Link href="/login" className="rounded-full px-6 py-3 font-semibold text-ink-2 hover:text-ink">
            Log in
          </Link>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {CATEGORIES.map((c) => (
            <span key={c.tag} className="rounded-full border border-line px-3 py-1 text-sm text-ink-2">
              {c.label} <span className="text-muted">{c.jp}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 py-6 sm:justify-center" aria-label="Screenshots">
        {SCREENS.map((s) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={s.src} src={s.src} alt={s.alt} width={240} height={427} loading="lazy" className="w-[200px] shrink-0 snap-center rounded-[28px] border border-line shadow-2xl sm:w-[220px]" />
        ))}
      </section>

      <section className="grid gap-3 py-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5">
            <f.icon className="text-brand" size={22} />
            <h2 className="mt-3 font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-ink-2">{f.body}</p>
          </div>
        ))}
      </section>

      <section id="download" className="card my-8 grid gap-6 p-6 sm:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Smartphone className="text-brand" size={22} /> Get the app
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            Android: install YORU from Aptoide, or download the APK here. iPhone: open this site in Safari → Share → Add to Home Screen.
          </p>
          <a href="/download/yoru.apk" download="YORU.apk" className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-2">
            <Download size={18} /> Download YORU for Android
          </a>
          <p className="mt-2 text-xs text-muted">Android 7.0 or newer · about 150 KB · free</p>
        </div>
        <div className="text-sm text-ink-2">
          <h3 className="font-semibold text-ink">Installing the APK</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Tap Download and open the file when it finishes.</li>
            <li>If Android asks, allow your browser to install apps for this download.</li>
            <li>Tap Install, then open YORU and sign in or create an account.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">Only install YORU from this website or our official store listings.</p>
        </div>
      </section>

      <section className="py-8">
        <h2 className="text-xl font-semibold">Questions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FAQ.slice(0, 6).map((f) => (
            <div key={f.q} className="card p-4">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-1 text-sm text-ink-2">{f.a}</p>
            </div>
          ))}
        </div>
        <Link href="/faq" className="mt-4 inline-block text-sm text-brand underline">
          All questions
        </Link>
      </section>
    </PublicShell>
  );
}
