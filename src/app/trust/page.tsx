import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, PublicShell } from "@/components/public/PublicShell";

export const metadata: Metadata = {
  title: "Trust Center",
  description: "How YORU keeps members safe: privacy controls, reporting, moderation and account security.",
  robots: { index: true, follow: true },
};

// Describes only what YORU actually does today. No certifications, audits or
// guarantees are claimed because none have been obtained.
export default function TrustPage() {
  return (
    <PublicShell>
      <LegalDoc title="Trust Center" updated="October 27, 2026">
        <p>
          This page explains, in plain words, the safety and privacy tools YORU has today and how moderation works. It describes the
          real product; when something is not available yet, we say so. YORU has not had an independent security audit or certification.
        </p>

        <h2>Your privacy controls</h2>
        <ul>
          <li>
            <b>Ghost Mode</b> (Settings → Privacy): hides your online dot. While it is on, YORU stops recording when you were last active, so
            other members and admins cannot see it. Your posts, comments and messages are still visible as usual.
          </li>
          <li>
            <b>Show me in Discover</b>: turn it off and you will not be suggested to other people on the Explore page.
          </li>
          <li>
            <b>Blocking</b>: blocked people cannot see your posts, comment, message you or find you in search, and you won&apos;t see theirs.
          </li>
          <li>
            <b>Collections</b> are private unless you choose “All members”. Leaderboards are opt-in.
          </li>
          <li>
            <b>AI Menace</b>: roasts aimed at you are opt-in and capped at the intensity you choose. Direct messages and chats are never sent to
            the AI.
          </li>
          <li>
            <b>Your data</b>: no ads, no selling of data, no third-party analytics or tracking. You can delete your account and everything you
            posted at any time (Settings → Account, or <Link href="/delete-account">Delete account</Link>). Details are in the{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </li>
        </ul>

        <h2>Reporting</h2>
        <p>
          Every post, comment, story, message and profile has a Report option in its ••• menu. You choose a category (harassment, hate,
          private information, spam, explicit content, impersonation, someone at risk, or something else) and can add details. The person
          you report is never told who reported them. Reports are limited per day to prevent abuse of the system.
        </p>

        <h2>How moderation works</h2>
        <ul>
          <li>Admins review every report in a private queue and can dismiss it, remove the content, mute the account (up to 30 days) or ban it.</li>
          <li>
            Automatic help is limited and transparent: when three or more different members report the same thing, or a report says someone
            may be at risk, it is flagged as escalated so admins look at it first. Nothing is removed and no one is punished automatically.
          </li>
          <li>A word filter set by admins masks listed words in new posts (✱✱✱). Admins can pause member posting (quiet mode) or slow it down during incidents.</li>
          <li>Every admin action is written to an audit log that admins can review.</li>
          <li>Creator labels are given only after an admin reviews an application with a link to the applicant&apos;s own work. The label is a community recognition, not a partnership with YORU.</li>
        </ul>

        <h2>Appeals</h2>
        <p>
          If you think a moderation decision was wrong, use the <Link href="/support">Support</Link> form (topic “Safety”) and tell us what
          happened. An admin reviews it and replies. There is no automated appeals system yet.
        </p>

        <h2>Account security</h2>
        <ul>
          <li>Passwords are handled by our authentication provider and stored only in hashed form; YORU staff cannot see them.</li>
          <li>Use a password you don&apos;t use anywhere else. YORU will never ask for your password in a message.</li>
          <li>Every action you take is checked on the server against your account and the database&apos;s access rules, not just hidden in the app.</li>
          <li>Uploaded files are checked: only your own uploads can be attached, file types are verified from their contents, and media is served only to signed-in members.</li>
          <li>Two-factor sign-in and self-service password reset are not available yet. If you lose access, contact us through Support.</li>
        </ul>

        <h2>Community guidelines</h2>
        <p>
          Jokes and banter between people who opted in are welcome. Attacks based on identity, harassment, sharing someone&apos;s private
          information, spam, explicit content and impersonation are not. YORU is for people aged 16 and over. The full rules are in the{" "}
          <Link href="/terms">Terms</Link>.
        </p>
      </LegalDoc>
    </PublicShell>
  );
}
