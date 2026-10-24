import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public/PublicShell";
import { ContactForm } from "@/components/public/ContactForm";
import { supportEmail } from "@/lib/support";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with YORU, report a problem or make a privacy request.",
  robots: { index: true, follow: true },
};

export default function SupportPage() {
  const email = supportEmail();
  return (
    <PublicShell>
      <div className="legal">
        <h1>Support</h1>
        <p>
          Need help with your account, want to report something, or have a privacy question? Send us a message below. Most answers are also in the{" "}
          <Link href="/faq">FAQ</Link>.
        </p>
        {email && (
          <p>
            You can also email us at <a href={`mailto:${email}`}>{email}</a>.
          </p>
        )}
      </div>
      <div className="mt-6">
        <ContactForm />
      </div>
      <div className="legal mt-10">
        <h2>Quick help</h2>
        <ul>
          <li>
            <b>Report or block someone:</b> tap the ••• menu on their post, comment, story, message or profile.
          </li>
          <li>
            <b>Forgot your password:</b> send us a message with the email on your account and we&apos;ll help you get back in.
          </li>
          <li>
            <b>Delete your account:</b> Settings → Account → Delete my account, or see <Link href="/delete-account">Delete your account</Link>.
          </li>
          <li>
            <b>Change notifications, roasts or privacy:</b> Settings in the app.
          </li>
        </ul>
        <h2>Safety</h2>
        <p>
          If you or someone else is in immediate danger, contact your local emergency services. For content involving a child&apos;s safety, report it
          in the app and choose &quot;Report abuse or a safety issue&quot; above so we can act quickly.
        </p>
      </div>
    </PublicShell>
  );
}
