import Link from "next/link";
import { Facebook, Instagram, Youtube } from "lucide-react";
import { NewsletterSignup } from "@/components/newsletter-signup";

function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.244 2H21l-6.52 7.45L22 22h-5.89l-4.61-6.03L6.22 22H3.46l6.75-7.72L3 2h6.04l4.17 5.52L18.244 2Zm-1.03 18h1.53L8.2 3.9H6.56L17.214 20Z" />
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
          <div className="wordmark footer-wordmark">HIDI</div>
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
            <SocialLink href={instagram} label="HIDI on Instagram"><Instagram size={18} strokeWidth={1.6} /></SocialLink>
            <SocialLink href={facebook} label="HIDI on Facebook"><Facebook size={18} strokeWidth={1.6} /></SocialLink>
            <SocialLink href={x} label="HIDI on X"><XIcon size={17} /></SocialLink>
            <SocialLink href={youtube} label="HIDI on YouTube"><Youtube size={19} strokeWidth={1.6} /></SocialLink>
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
