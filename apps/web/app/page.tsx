import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/api";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const editorialCards = [
  {
    number: "01",
    title: "Work Edit",
    description: "Polished without trying too hard.",
    href: "/collections/work-edit",
    image: "/products/aara-sage-work-kurta/01-main.png",
    alt: "Aara Sage Work Kurta from the HIDI Work Edit",
  },
  {
    number: "02",
    title: "Everyday Ease",
    description: "Pieces you will reach for again.",
    href: "/collections/everyday",
    image: "/products/myra-peach-comfort-kurta-set/01-main.png",
    alt: "Myra Peach Comfort Kurta Set from HIDI Everyday",
  },
  {
    number: "03",
    title: "Occasion",
    description: "Presence, with restraint.",
    href: "/collections/occasion",
    image: "/products/kiara-wine-festive-kurta-set/01-main.png",
    alt: "Kiara Wine Festive Kurta Set from HIDI Occasion",
  },
] as const;

export default async function Home() {
  const products = (await getProducts()).slice(0, 8);

  return (
    <>
      <section className={styles.videoHero} aria-label="Discover HIDI">
        <video
          className={styles.video}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="HIDI brand film"
        >
          <source src="/video/discover-hidi.mp4" type="video/mp4" />
        </video>

        <div className={styles.shade} aria-hidden="true" />

        <div className={styles.content}>
          <Image
            className={styles.logo}
            src="/brand/hidi-logo-dark.png"
            alt="HIDI — Wear the Feeling"
            width={540}
            height={180}
            priority
          />
          <p className={styles.line}>For every role you carry.</p>
          <div className={styles.actions}>
            <Link className={`${styles.button} ${styles.lightButton}`} href="/collections/new-arrivals">
              Shop new arrivals
            </Link>
            <Link className={`${styles.button} ${styles.ghostButton}`} href="/about">
              Discover HIDI
            </Link>
          </div>
        </div>
      </section>

      <section className="editorial container section-space">
        <div className="section-heading">
          <p className="eyebrow">DRESS FOR THE DAY YOU HAVE</p>
          <h2>Three moods. One calm wardrobe.</h2>
        </div>
        <div className="editorial-grid">
          {editorialCards.map((card) => (
            <Link key={card.title} href={card.href} className="editorial-card">
              <Image
                src={card.image}
                alt={card.alt}
                fill
                sizes="(max-width: 800px) 100vw, 33vw"
                style={{
                  objectFit: "cover",
                  objectPosition: "center top",
                  position: "absolute",
                  inset: 0,
                  zIndex: 0,
                  transition: "transform .45s ease",
                }}
              />
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 1,
                  background: "linear-gradient(to bottom, rgba(0,0,0,.08) 30%, rgba(0,0,0,.62) 100%)",
                }}
              />
              <span style={{ position: "relative", zIndex: 2 }}>{card.number}</span>
              <div style={{ position: "relative", zIndex: 2 }}>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section-space">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">JUST IN</p><h2>The newest HIDI pieces</h2></div>
          <Link className="text-link" href="/collections/new-arrivals">View all →</Link>
        </div>
        <div className="product-grid">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      </section>

      <section className="brand-story section-space">
        <div className="container brand-story-inner">
          <div className="story-mark">HIDI</div>
          <div>
            <p className="eyebrow">OUR POINT OF VIEW</p>
            <h2>Style should feel like you — only more certain.</h2>
            <p>We design Indian wear around real routines: work, family, travel, dinners and the hundred ordinary moments in between.</p>
            <Link className="text-link" href="/about">Discover HIDI →</Link>
          </div>
        </div>
      </section>

      <section className={`promise container ${styles.promiseSection}`}>
        <div><strong>Thoughtful fabrics</strong><span>Chosen for repeat wear and comfort.</span></div>
        <div><strong>Easy exchanges</strong><span>A simple, clear 7-day process.</span></div>
        <div><strong>Secure payments</strong><span>UPI, cards and trusted payment rails.</span></div>
        <div><strong>Real support</strong><span>Helpful humans when you need us.</span></div>
      </section>
    </>
  );
}
