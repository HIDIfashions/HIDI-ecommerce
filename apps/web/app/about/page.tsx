import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About HIDI & Ananya Nagalla",
  description: "Introduced by actress Ananya Nagalla, HIDI offers women’s Indian wear for work, everyday dressing and occasions.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: "/about",
    title: "About HIDI & Ananya Nagalla",
    description: "Introduced by actress Ananya Nagalla, HIDI offers women’s Indian wear for work, everyday dressing and occasions.",
    images: ["/brand/hidi-logo-gold.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "About HIDI & Ananya Nagalla",
    description: "Introduced by actress Ananya Nagalla, HIDI offers women’s Indian wear for work, everyday dressing and occasions.",
    images: ["/brand/hidi-logo-gold.jpg"],
  },
};
import Link from "next/link";
import styles from "./about.module.css";

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>Home / Meet HIDI</div>

      <section className={styles.brandHero}>
        <div className={styles.brandIntro}>
          <p className={styles.sectionEyebrow}>MEET HIDI · WEAR THE FEELING</p>
          <h1>Considered clothing.<br />A clear point of view.</h1>
          <p className={styles.brandLead}>Indian wear for the many roles you carry.</p>
          <p>Introduced by actress Ananya Nagalla, HIDI brings together women’s Indian wear for work, everyday dressing and occasions. Our point of view is simple: feel comfortable, look composed and be yourself.</p>
          <div className={styles.actions}>
            <Link href="/collections/all" className={styles.darkButton}>Explore HIDI</Link>
            <Link href="/contact" className={styles.outlineButton}>Talk to our team ↗</Link>
          </div>
        </div>
        <div className={styles.brandPanel}>
          <img src="/brand/hidi-logo-header.svg?v=8f2e2b8731a3" alt="HIDI — Wear the Feeling" width="280" height="148" />
          <p>FOR EVERY ROLE.<br />FOR EVERY DAY.<br /><em>For you.</em></p>
          <span>WORK · EVERYDAY · OCCASIONS</span>
        </div>
      </section>
      <section className={styles.assurance} aria-label="Shop with confidence">
        <div><span>01 / TRANSPARENCY</span><h2>Know your purchase.</h2><p>Style details, available sizes and pricing on every product page.</p><Link href="/collections/all">Browse the collection ↗</Link></div>
        <div><span>02 / CLARITY</span><h2>Clear policies.</h2><p>Shipping is ₹0.00 on every order. Review return eligibility before you buy.</p><Link href="/returns">Read our returns policy ↗</Link></div>
        <div><span>03 / CONNECTION</span><h2>A team you can reach.</h2><p>Questions about a piece or an order? Find the right way to contact HIDI.</p><Link href="/contact">Contact HIDI ↗</Link></div>
      </section>

      <section className={styles.story}>
        <p className={styles.sectionEyebrow}>OUR POINT OF VIEW</p>
        <div className={styles.storyGrid}>
          <h2>Clothing that moves with your life.</h2>
          <p>
            Some women wear uniforms. Some carry titles. Some care for people,
            teach, lead teams, build careers and hold families together. HIDI is
            for the woman behind every role — thoughtfully chosen Indian wear
            for the hours when she wants to feel comfortable, composed and
            completely herself.
          </p>
        </div>
      </section>

      <section className={styles.values} aria-label="HIDI values">
        <article className={styles.valueCard}>
          <span>01</span>
          <h3>Ease</h3>
          <p>Thoughtful silhouettes designed for movement, comfort and long days.</p>
        </article>
        <article className={styles.valueCard}>
          <span>02</span>
          <h3>Confidence</h3>
          <p>Polished Indian wear that feels refined without feeling overdone.</p>
        </article>
        <article className={styles.valueCard}>
          <span>03</span>
          <h3>Everyday elegance</h3>
          <p>Quiet pieces you can return to across work, weekends and occasions.</p>
        </article>
      </section>

      <section className={styles.closing}>
        <p className={styles.sectionEyebrow}>WEAR THE FEELING</p>
        <h2>For every role you carry, there is still you.</h2>
        <Link href="/collections/all" className={styles.darkButton}>
          Discover the collection
        </Link>
      </section>
    </div>
  );
}
