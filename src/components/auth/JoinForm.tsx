"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ChaosLoader } from "@/components/ui/bits";
import { useApp } from "@/components/providers/AppProvider";
import { ApiError, get, post } from "@/lib/client/api";

type InviteState = { valid: boolean; first_user?: boolean; inviter?: string; reason?: string };

const REASONS: Record<string, string> = {
  not_found: "That invite code doesn't exist. Did you make it up?",
  revoked: "That invite was revoked. Someone changed their mind about you.",
  used_up: "That invite is all used up. Popular link, unpopular timing.",
  expired: "That invite expired. Like milk. Like your excuses.",
};

export function JoinForm({ code: initialCode }: { code: string }) {
  const { config } = useApp();
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", username: "", display_name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(c: string) {
    setChecking(true);
    setError(null);
    try {
      setInvite(await get<InviteState>(`/api/auth/invite/${encodeURIComponent(c || "_")}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not check that invite.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    // Fetch-on-mount: validate the invite from the URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check(initialCode);
  }, [initialCode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/join", { ...form, code });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-up failed.");
      setBusy(false);
    }
  }

  if (!invite && checking) return <ChaosLoader label="Checking your papers..." />;

  if (!invite?.valid) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check(code.trim());
        }}
      >
        <h1 className="text-xl font-black">Got an invite code?</h1>
        <p className="mt-1 text-sm text-muted">This place is invite-only. Ask a member for a link.</p>
        {invite && !invite.valid && (
          <p className="mt-3 rounded-xl bg-hot/15 p-2 text-sm font-semibold text-hot">{REASONS[invite.reason ?? "not_found"]}</p>
        )}
        {error && <p className="mt-3 rounded-xl bg-hot/15 p-2 text-sm font-semibold text-hot">{error}</p>}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          placeholder="invite code"
          className="mt-4 w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 font-mono outline-none focus:border-brand"
          aria-label="Invite code"
        />
        <Button type="submit" disabled={checking || !code} className="mt-4 w-full py-3">
          {checking ? "Checking..." : "Check invite"}
        </Button>
        <p className="mt-4 text-center text-sm text-muted">
          Already a member?{" "}
          <Link href="/login" className="font-bold text-brand">
            Log in
          </Link>
        </p>
      </form>
    );
  }

  const field = (key: keyof typeof form, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="mt-3 block text-sm font-semibold">
      {label}
      <input
        {...props}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 outline-none focus:border-brand"
      />
    </label>
  );

  return (
    <form onSubmit={submit}>
      <h1 className="text-xl font-black">{invite.first_user ? "Found the empire 👑" : "You've been summoned"}</h1>
      <p className="mt-1 text-sm text-muted">
        {invite.first_user
          ? "Nobody's here yet. The first account becomes the owner (admin of all chaos)."
          : `${invite.inviter ?? "Someone"} vouched for you. Don't make them regret it (you will).`}
      </p>
      {error && <p className="mt-3 rounded-xl bg-hot/15 p-2 text-sm font-semibold text-hot">{error}</p>}
      {field("display_name", "Display name", { required: true, maxLength: 40, placeholder: "Ethan", autoComplete: "nickname" })}
      {field("username", "Username", {
        required: true,
        pattern: "[A-Za-z0-9_]{3,20}",
        title: "3-20 letters, numbers or underscores",
        placeholder: "EthanLang",
        autoComplete: "username",
      })}
      {field("email", "Email", { required: true, type: "email", autoComplete: "email" })}
      {config.mode === "supabase" &&
        field("password", "Password (8+ chars)", { required: true, type: "password", minLength: 8, autoComplete: "new-password" })}
      <Button type="submit" disabled={busy} variant="chaos" className="mt-5 w-full py-3">
        {busy ? "Processing your paperwork..." : "Join IsraelTokn't"}
      </Button>
    </form>
  );
}
