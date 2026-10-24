"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ApiError, post } from "@/lib/client/api";
import { Button } from "@/components/ui/bits";
import { SUPPORT_TOPICS, TOPIC_LABELS, type SupportTopic } from "@/lib/support";

const field = "mt-1 w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function ContactForm({ defaultTopic = "general" }: { defaultTopic?: SupportTopic }) {
  const [form, setForm] = useState({ email: "", topic: defaultTopic as SupportTopic, message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/support", form);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="card flex items-start gap-3 p-4" role="status">
        <CheckCircle2 className="mt-0.5 shrink-0 text-brand" />
        <div>
          <div className="font-semibold">Message sent.</div>
          <p className="text-sm text-muted">Thanks! We&apos;ll get back to you at the email you gave, usually within a few days.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <label className="block text-sm font-semibold">
        What do you need help with?
        <select value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value as SupportTopic }))} className={field}>
          {SUPPORT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Your email
        <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.slice(0, 200) }))} placeholder="you@example.com" className={field} autoComplete="email" />
      </label>
      <label className="block text-sm font-semibold">
        Message
        <textarea
          required
          minLength={5}
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value.slice(0, 2000) }))}
          placeholder={form.topic === "deletion" ? "Your YORU username, and what you'd like deleted." : "Tell us what's going on. Include your username if it's about your account."}
          className={`${field} h-32 resize-none`}
        />
      </label>
      {/* Honeypot for bots; hidden from people and screen readers. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} className="hidden" name="website" />
      {error && <p className="rounded-xl bg-brand/15 p-2 text-sm text-brand-2">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full py-3">
        {busy ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
