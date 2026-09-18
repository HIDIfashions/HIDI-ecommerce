import Link from "next/link";

export function Footer() {
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
          <p className="muted">New edits, restocks and thoughtful notes from HIDI.</p>
          <form className="newsletter">
            <input aria-label="Email address" type="email" placeholder="Email address" />
            <button type="submit">Join</button>
          </form>
          <p className="footer-small">By joining, you agree to receive HIDI updates. You can unsubscribe anytime.</p>
        </div>
      </div>

      <div className="footer-bottom container">
        <span>© 2026 HIDI. All rights reserved.</span>
        <span>Secure payments · Easy 7-day exchange</span>
      </div>
    </footer>
  );
}
