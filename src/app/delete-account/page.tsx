import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public/PublicShell";
import { ContactForm } from "@/components/public/ContactForm";

export const metadata: Metadata = {
  title: "Delete your account",
  description: "How to delete your YORU account and data.",
  robots: { index: true, follow: true },
};

export default function DeleteAccountPage() {
  return (
    <PublicShell>
      <div className="legal">
        <h1>Delete your YORU account</h1>
        <h2>In the app (fastest)</h2>
        <ul>
          <li>Open YORU and sign in.</li>
          <li>Go to Settings → Account → Delete my account.</li>
          <li>Type your username to confirm and tap Delete forever.</li>
        </ul>
        <p>Your account is deleted immediately and you are signed out.</p>
        <h2>What gets deleted</h2>
        <p>
          Your login, profile and photo, posts and uploads, comments, reactions, votes, awards, bookmarks, stories, direct and group messages, AI chat
          history, notifications and settings. Copies in our providers&apos; backups and logs expire on their normal schedule. See the{" "}
          <Link href="/privacy">Privacy Policy</Link> for details.
        </p>
        <h2>Can&apos;t sign in?</h2>
        <p>
          Send a request below with your username and the email on your account. We&apos;ll verify it&apos;s you and delete the account, normally
          within 30 days. You can also ask us to delete specific content without deleting your account.
        </p>
      </div>
      <div className="mt-6">
        <ContactForm defaultTopic="deletion" />
      </div>
    </PublicShell>
  );
}
