import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { getBestSellers, getProducts } from "@/lib/api";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const edits = [
  {
    eyebrow: "THE WORK EDIT",
    title: "Quiet confidence, all day.",
    href: "/collections/work-edit",
    image: "/products/ira-beige-office-kurta-set/01-main.png",
  },
  {
    eyebrow: "EVERYDAY",
    title: "Ease, without looking ordinary.",
    href: "/collections/everyday",
    image: "/products/myra-peach-comfort-kurta-set/01-main.png",
  },
  {
    eyebrow: "OCCASION",
    title: "Presence, without excess.",
    href: "/collections/occasion",
    image: "/products/kiara-wine-festive-kurta-set/01-main.png",
  },
] as const;

export default async function Home() {
  const [catalogue, bestSellers] = await Promise.all([
    getProducts(),
    getBestSellers(8),
  ]);

  const featured = (bestSellers.length ? bestSellers : catalogue).slice(0, 4);

  return (
    <>
      <section className={styles.hero}>
        <Image
          src="/brand/hidi-hero-green-garden.png"
          alt="HIDI editorial collection"
          fill
          priority
          unoptimized
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} aria-hidden="true" />

        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>HIDI / NEW SEASON</p>
          <h1>Wear the feeling.</h1>
          <p className={styles.heroIntro}>
            Indian wear with a modern point of view — calm, considered and made
            for the life you actually live.
          </p>
          <Link href="/collections/new-arrivals" className={styles.heroCta}>
            Shop new arrivals <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>

        <span className={styles.heroIndex}>HIDI · 01</span>
      </section>

      <section className={styles.intro + " container"}>
        <p className={styles.eyebrow}>THE HIDI POINT OF VIEW</p>
        <div className={styles.introGrid}>
          <h2>Indian wear,<br />edited with restraint.</h2>
          <p>
            We focus on proportion, fabric, colour and the way a piece feels when
            you live in it. Nothing added just to make the page louder.
          </p>
        </div>
      </section>

      <section className={styles.edits} aria-label="Shop HIDI edits">
        {edits.map((edit) => (
          <Link className={styles.editCard} href={edit.href} key={edit.href}>
            <Image src={edit.image} alt="" fill sizes="(max-width: 760px) 100vw, 33vw" />
            <span className={styles.editShade} aria-hidden="true" />
            <span className={styles.editCopy}>
              <small>{edit.eyebrow}</small>
              <strong>{edit.title}</strong>
              <span>Discover <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" /></span>
            </span>
          </Link>
        ))}
      </section>

      <section className={styles.featured + " container"}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>{bestSellers.length ? "MOST CHOSEN" : "NEW TO HIDI"}</p>
            <h2>{bestSellers.length ? "Pieces customers return to." : "A first look at HIDI."}</h2>
          </div>
          <Link href="/collections/all" className={styles.textLink}>
            Shop all <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </header>

        <div className={styles.productGrid}>
          {featured.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>

      <section className={styles.manifesto}>
        <div className={styles.manifestoInner + " container"}>
          <p className={styles.eyebrow}>HIDI</p>
          <h2>Designed to feel considered.<br />Never complicated.</h2>
          <div className={styles.manifestoBottom}>
            <p>
              Modern Indian silhouettes, thoughtful details and an experience
              that gives the clothes room to speak.
            </p>
            <Link href="/about" className={styles.lightLink}>
              Discover our story <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
