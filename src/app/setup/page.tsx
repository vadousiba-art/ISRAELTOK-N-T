import Link from "next/link";
import { aiConfig, appMode, supabaseServiceKey } from "@/lib/config";
import { Logo, Tagline } from "@/components/ui/Logo";

export const metadata = { title: "Setup" };

function Row({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex gap-3 rounded-xl border border-line p-3">
      <span className="text-xl">{ok ? "✅" : "⚠️"}</span>
      <span>
        <span className="block font-bold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
    </li>
  );
}

export default function SetupPage() {
  const mode = appMode();
  const ai = aiConfig();
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="flex flex-col items-center">
        <Logo width={260} />
        <Tagline size="lg" className="mt-2" />
      </div>
      <div className="card mt-8 p-6">
        <h1 className="text-2xl font-black">Setup &amp; configuration</h1>
        <p className="mt-1 text-sm text-muted">
          Current mode: <b className="text-ink">{mode}</b>
          {mode === "demo" && " — running on an embedded Postgres (PGlite) in .data/. Great for trying it out locally."}
          {mode === "unconfigured" && " — no database configured and demo mode is off in production."}
        </p>
        <ul className="mt-5 space-y-2">
          <Row
            ok={mode === "supabase"}
            label="Supabase (database, auth, realtime, storage)"
            hint="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then run the SQL in supabase/migrations."
          />
          <Row
            ok={mode !== "supabase" || Boolean(supabaseServiceKey())}
            label="Supabase service role key (server only)"
            hint="SUPABASE_SERVICE_ROLE_KEY — needed for invite sign-ups, uploads and the AI Menace bot. Never exposed to browsers."
          />
          <Row
            ok={Boolean(ai.apiKey)}
            label="Anthropic API key (AI Menace)"
            hint={
              ai.apiKey
                ? `Using model ${ai.model}.`
                : "ANTHROPIC_API_KEY is not set — the Menace runs in offline 'Menace Lite' mode with canned jokes."
            }
          />
        </ul>
        <h2 className="mt-6 font-black">Quick start</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in the values.</li>
          <li>
            Apply <code>supabase/migrations/*.sql</code> (Supabase CLI <code>supabase db push</code> or paste into the SQL editor).
          </li>
          <li>Restart the server. The first person to sign up at <code>/join</code> becomes the owner.</li>
          <li>Owner/admins create invite links in the Admin panel. Optional: <code>npm run seed</code> for demo content.</li>
        </ol>
        <p className="mt-6 text-sm text-muted">Full instructions are in README.md.</p>
        {mode !== "unconfigured" && (
          <Link href="/" className="mt-6 inline-block rounded-full bg-brand px-5 py-2.5 font-bold text-white">
            Back to the chaos
          </Link>
        )}
      </div>
    </div>
  );
}
