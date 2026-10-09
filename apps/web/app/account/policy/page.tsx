import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/policy-page.module.css";

export const metadata: Metadata = {
  title: "Account terms & privacy notice",
  description: "How HIDI account sign-in works, your account responsibilities and how account information is used.",
  alternates: { canonical: "/account/policy" },
};

export default function AccountPolicyPage() {
  return <div className={styles.page}>
    <div className={styles.breadcrumbs}><Link href="/account">My HIDI</Link> / Account policy</div>
    <header className={styles.header}>
      <p className={styles.eyebrow}>HIDI ACCOUNT POLICY</p>
      <h1>Account terms &amp; privacy notice</h1>
      <p>Understand your account before requesting a sign-in code.</p>
      <p>Updated 10 October 2026</p>
    </header>

    <section className={styles.notice} id="terms">
      <h2>Your HIDI account</h2>
      <p>Use a mobile number you are authorised to use. Verifying your OTP signs you into the account linked to that number or creates an account if you are new to HIDI. Keep your OTP private and sign out on shared devices.</p>
      <p>Use accurate account and order details. Do not access another person’s account, misuse OTP requests or use HIDI for unlawful activity.</p>
      <p>Purchases must be made by someone legally able to enter into a contract. If you are under 18, ask a parent or lawful guardian to manage purchases for you. Do not provide another person’s personal information without their authority.</p>
      <p>Review the final price, delivery information and applicable <Link href="/shipping">shipping</Link> and <Link href="/returns">returns and exchange policies</Link> before placing an order. These account terms do not exclude your statutory consumer rights.</p>
    </section>

    <section className={styles.notice} id="privacy">
      <h2>Privacy notice for account sign-in</h2>
      <p>We use your mobile number to send a verification code, authenticate your account and connect you to your orders, rewards, preferences and aftercare services. Sign-in requests and verification attempts are also used to prevent misuse and protect accounts.</p>
      <p>Verification messages are processed by our authentication or SMS delivery providers, including MSG91 and Firebase when used. They receive the information needed to authenticate or deliver the requested code. HIDI’s hosting and database providers process account information to operate these services.</p>
      <p>Your sign-in session is stored on your device so you can remain signed in. Signing out removes the HIDI session from that device. Signing in does not subscribe you to promotional messages; optional marketing choices are separate and can be managed in <Link href="/account/preferences">Preferences</Link>.</p>
      <p>When you order or contact us, the details you provide are used for the requested purchase, delivery, payment, customer support or aftercare service. Relevant details may be shared with the providers carrying out those services.</p>
      <p>Account and order records may need to be retained to provide services, resolve disputes, prevent fraud or meet legal record-keeping requirements. You can ask about your information, request a correction or account deletion, or raise a privacy concern through <Link href="/contact">Contact &amp; Help</Link>. Some records may need to be retained where law requires it.</p>
      <p>If an enquiry involves a child’s personal information, contact HIDI before submitting that information. A sign-in OTP confirms control of a mobile number; it does not establish age or verified parental consent.</p>
    </section>

    <p className={styles.footerNote}><Link href="/account">Return to sign-in</Link> · <Link href="/contact">Contact &amp; Help</Link></p>
  </div>;
}
