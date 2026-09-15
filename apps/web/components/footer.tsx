import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid container">
        <div>
          <div className="wordmark footer-wordmark">HIDI</div>
          <p className="muted">Indian wear with a calm point of view — thoughtfully made for real days.</p>
        </div>
        <div>
          <h3>Shop</h3>
          <Link href="/collections/new-arrivals">New Arrivals</Link>
          <Link href="/collections/work-edit">Work Edit</Link>
          <Link href="/collections/everyday">Everyday</Link>
        </div>
        <div>
          <h3>Help</h3>
          <Link href="/shipping">Shipping</Link>
          <Link href="/returns">Returns</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <div>
          <h3>Stay close</h3>
          <p className="muted">New edits, restocks and private offers.</p>
          <form className="newsletter">
            <input aria-label="Email address" type="email" placeholder="Your email" />
            <button type="submit">Join</button>
          </form>
        </div>
      </div>
      <div className="footer-bottom container">© 2026 HIDI. All rights reserved.</div>
    </footer>
  );
}
