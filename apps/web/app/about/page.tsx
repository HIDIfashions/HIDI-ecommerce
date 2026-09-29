import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About HIDI",
  description: "Discover HIDI's point of view: modern Indian wear designed for ease, confidence and everyday elegance.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: "/about",
    title: "About HIDI",
    description: "Modern Indian wear designed for ease, confidence and everyday elegance.",
    images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
  },
  twitter: {
    card: "summary_large_image",
    title: "About HIDI",
    description: "Modern Indian wear designed for ease, confidence and everyday elegance.",
    images: ["/brand/hidi-hero-green-garden-fullbody.webp"],
  },
};
import Link from "next/link";
import styles from "./about.module.css";

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>Home / Discover HIDI</div>

      <section className={styles.hero}>
        <Image className={styles.video} src="/brand/hidi-manifesto-ananya.webp" alt="HIDI occasion-wear campaign in a sunlit architectural setting" width={1672} height={941} sizes="(max-width: 1288px) 100vw, 1240px" priority />

        <div className={styles.shade} aria-hidden="true" />

        <div className={styles.overlay}>
          <p className={styles.eyebrow}>DISCOVER HIDI</p>
          <h1>For every role you carry.</h1>
          <p className={styles.subtitle}>
            From responsibility and ambition to the moments that are entirely
            your own, HIDI is made for women who move through every day with
            ease, confidence and quiet elegance.
          </p>
          <div className={styles.actions}>
            <Link href="/collections/work-edit" className={styles.primaryButton}>
              Shop Work Edit
            </Link>
            <Link href="/collections/everyday" className={styles.secondaryButton}>
              Explore Everyday
            </Link>
          </div>
        </div>
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
