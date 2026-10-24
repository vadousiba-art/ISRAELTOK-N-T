import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, PublicShell } from "@/components/public/PublicShell";
import { LEGAL_UPDATED } from "@/lib/support";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using YORU.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <PublicShell>
      <LegalDoc title="Terms of Service" updated={LEGAL_UPDATED}>
        <p>
          Welcome to YORU (夜). These Terms are an agreement between you and the people who run YORU (&quot;we&quot;, &quot;us&quot;). By creating an
          account or using YORU on the web or in the Android app, you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If
          you don&apos;t agree, please don&apos;t use YORU.
        </p>

        <h2>1. Who can use YORU</h2>
        <ul>
          <li>You must be at least 16 years old.</li>
          <li>You must give accurate sign-up information and may only have one personal account.</li>
          <li>You can&apos;t use YORU if we have previously banned you, or if the law where you live doesn&apos;t allow it.</li>
        </ul>

        <h2>2. Your account</h2>
        <p>
          You are responsible for what happens on your account and for keeping your password safe. Tell us right away through the{" "}
          <Link href="/support">contact form</Link> if you think someone else is using it. You can delete your account at any time in Settings.
        </p>

        <h2>3. Your content</h2>
        <p>
          You keep ownership of what you post. By posting on YORU you give us a worldwide, non-exclusive, royalty-free license to host, store, copy,
          display and distribute that content to the people allowed to see it, only as needed to run and improve YORU. This license ends when you
          delete the content or your account, except where someone else has already reshared it (for example a quote post) or where we must keep it
          for legal reasons.
        </p>
        <p>Only post content you have the right to share. You are responsible for your content and the consequences of posting it.</p>

        <h2>4. Community rules</h2>
        <p>YORU is for fun, fandom and roasting your friends, not for hurting people. Don&apos;t post or send anything that:</p>
        <ul>
          <li>harasses, bullies, threatens or targets someone, or encourages others to do so;</li>
          <li>attacks people for race, ethnicity, nationality, religion, gender, gender identity, sexual orientation, disability or similar traits;</li>
          <li>is sexual content involving anyone under 18 (we report this to authorities), or is sexually explicit or non-consensual intimate imagery;</li>
          <li>promotes self-harm, suicide, terrorism or violent extremism, or depicts graphic violence for shock;</li>
          <li>shares someone&apos;s private information (doxxing) or impersonates another person in a misleading way;</li>
          <li>sells or promotes illegal goods or services, scams, spam, malware or phishing;</li>
          <li>infringes copyright, trademark or other rights, or breaks any law.</li>
        </ul>
        <p>Also don&apos;t try to break, overload, scrape or get around YORU&apos;s security, limits or bans, or use automated accounts.</p>

        <h2>5. Reporting, blocking and moderation</h2>
        <p>
          Use the ••• menu on any post, comment, story, message or profile to report or block. Admins may remove content, mute, suspend or ban accounts,
          and limit features (for example quiet mode or slow mode) when needed to keep YORU safe, with or without notice. Admin actions are logged. If
          you think we got something wrong, contact us through the <Link href="/support">contact form</Link>.
        </p>

        <h2>6. AI features</h2>
        <p>
          The AI Menace and other comedy tools generate jokes automatically. Their output can be wrong, weird or offensive, isn&apos;t reviewed by a
          person before you see it, and does not represent our views. Don&apos;t rely on it for facts or advice. Others can only aim roasts at you if
          you turn on &quot;Let others roast me&quot;, and you can set the maximum roast intensity in Settings.
        </p>

        <h2>7. Copyright complaints</h2>
        <p>
          If you believe content on YORU infringes your copyright, send us the details (the content, your work, and your contact information) through
          the <Link href="/support">contact form</Link>. We&apos;ll review it and remove infringing content. Repeat infringers lose their accounts.
        </p>

        <h2>8. The service</h2>
        <p>
          YORU is free to use. We may change, add or remove features, and we may suspend or stop the service. We&apos;ll try to give notice of major
          changes in the app. The Android app loads the live service, so it updates without reinstalling.
        </p>

        <h2>9. Ending your use</h2>
        <p>
          You can stop using YORU and delete your account at any time. We may suspend or end your access if you break these Terms, if required by law,
          or to protect other members. Sections 3 (for content already shared), 6, 10 and 11 continue to apply after your account ends.
        </p>

        <h2>10. Disclaimers</h2>
        <p>
          YORU is provided &quot;as is&quot; and &quot;as available&quot;. To the extent allowed by law, we make no warranties of any kind, including
          that YORU will be uninterrupted, secure or error-free. Content on YORU comes from members and AI tools, not from us, and we are not
          responsible for it.
        </p>

        <h2>11. Limitation of liability</h2>
        <p>
          To the extent allowed by law, we are not liable for any indirect, incidental, special, consequential or punitive damages, or any loss of
          data, profits or goodwill, arising from your use of YORU. Nothing in these Terms limits rights you have under consumer protection laws that
          can&apos;t be waived.
        </p>

        <h2>12. Changes to these Terms</h2>
        <p>
          We may update these Terms. We&apos;ll change the date above and announce significant changes in the app. If you keep using YORU after changes
          take effect, you accept the new Terms.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions about these Terms? Use the contact form at <Link href="/support">yoru-social.vercel.app/support</Link>.
        </p>
      </LegalDoc>
    </PublicShell>
  );
}
