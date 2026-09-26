import Link from "next/link";
import { NewsletterSignup } from "@/components/newsletter-signup";

function InstagramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M13.6 21v-8h2.8l.42-3.2H13.6V7.75c0-.93.26-1.56 1.62-1.56H17V3.33A23.8 23.8 0 0 0 14.55 3C12.13 3 10.48 4.48 10.48 7.2v2.6H7.75V13h2.73v8h3.12Z" />
    </svg>
  );
}

function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.244 2H21l-6.52 7.45L22 22h-5.89l-4.61-6.03L6.22 22H3.46l6.75-7.72L3 2h6.04l4.17 5.52L18.244 2Zm-1.03 18h1.53L8.2 3.9H6.56L17.214 20Z" />
    </svg>
  );
}

function YouTubeIcon({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21.58 7.19a2.9 2.9 0 0 0-2.04-2.05C17.74 4.65 12 4.65 12 4.65s-5.74 0-7.54.49A2.9 2.9 0 0 0 2.42 7.2 30.1 30.1 0 0 0 1.93 12a30.1 30.1 0 0 0 .49 4.81 2.9 2.9 0 0 0 2.04 2.05c1.8.49 7.54.49 7.54.49s5.74 0 7.54-.49a2.9 2.9 0 0 0 2.04-2.05 30.1 30.1 0 0 0 .49-4.81 30.1 30.1 0 0 0-.49-4.81ZM9.95 15.15V8.85L15.4 12l-5.45 3.15Z" />
    </svg>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href?: string;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return <span className="social-link social-link-disabled" aria-label={label} title={label + " coming soon"}>{children}</span>;
  }
  return (
    <a className="social-link" href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      {children}
    </a>
  );
}

export function Footer() {
  const instagram = process.env.NEXT_PUBLIC_HIDI_INSTAGRAM_URL;
  const facebook = process.env.NEXT_PUBLIC_HIDI_FACEBOOK_URL;
  const x = process.env.NEXT_PUBLIC_HIDI_X_URL;
  const youtube = process.env.NEXT_PUBLIC_HIDI_YOUTUBE_URL;

  return (
    <footer className="footer">
      <div className="footer-grid container">
        <div className="footer-brand">
          <Link className="footer-logo" href="/" aria-label="HIDI — Wear the Feeling">
            <img src="/brand/hidi-logo-gold-inline.svg" alt="HIDI — Wear the Feeling" />
          </Link>
          <p className="muted">Indian wear with a calm point of view — made for work, everyday life and the moments in between.</p>
          <p className="footer-note">Wear the feeling.</p>
        </div>

        <div>
          <h3>Shop</h3>
          <Link href="/collections/new-arrivals">New Arrivals</Link>
          <Link href="/collections/work-edit">Work Edit</Link>
          <Link href="/collections/everyday">Everyday</Link>
          <Link href="/collections/occasion">Occasion</Link>
        </div>

        <div>
          <h3>Help</h3>
          <Link href="/shipping">Shipping</Link>
          <Link href="/returns">Returns & Exchanges</Link>
          <Link href="/account">My Account</Link>
          <Link href="/contact">Contact</Link>
        </div>

        <div>
          <h3>Stay close</h3>
          <p className="muted">Subscribe for launch offers, rewards updates, new edits and restocks.</p>

          <div className="social-links" aria-label="HIDI social channels">
            <SocialLink href={instagram} label="HIDI on Instagram"><InstagramIcon size={18} /></SocialLink>
            <SocialLink href={facebook} label="HIDI on Facebook"><FacebookIcon size={18} /></SocialLink>
            <SocialLink href={x} label="HIDI on X"><XIcon size={17} /></SocialLink>
            <SocialLink href={youtube} label="HIDI on YouTube"><YouTubeIcon size={19} /></SocialLink>
          </div>

          <NewsletterSignup />
          <p className="footer-small">By subscribing, you agree to receive HIDI updates. You can unsubscribe anytime.</p>
        </div>
      </div>

      <div className="footer-bottom container">
        <span>© 2026 HIDI. All rights reserved.</span>
        <span>Secure payments · Easy 7-day exchange</span>
      </div>
    </footer>
  );
}
