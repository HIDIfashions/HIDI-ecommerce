import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, Truck, RefreshCcw } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/api";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const edits = [
  {
    number: "01",
    title: "Work Edit",
    description: "Quiet polish for long days, sharp meetings and everything after.",
    href: "/collections/work-edit",
    image: "/products/aara-sage-work-kurta/01-main.png",
    alt: "Aara Sage Work Kurta from the HIDI Work Edit",
    tone: "For the workday",
  },
  {
    number: "02",
    title: "Everyday Ease",
    description: "Soft structure, easy silhouettes and pieces you will reach for again.",
    href: "/collections/everyday",
    image: "/products/myra-peach-comfort-kurta-set/01-main.png",
    alt: "Myra Peach Comfort Kurta Set from HIDI Everyday",
    tone: "For every day",
  },
  {
    number: "03",
    title: "Occasion",
    description: "A little more presence, while still feeling unmistakably like you.",
    href: "/collections/occasion",
    image: "/products/kiara-wine-festive-kurta-set/01-main.png",
    alt: "Kiara Wine Festive Kurta Set from HIDI Occasion",
    tone: "For the moments",
  },
] as const;

const trust = [
  { icon: Truck, title: "Complimentary shipping", text: "On orders above ₹1,499" },
  { icon: RefreshCcw, title: "Easy 7-day exchange", text: "Simple, transparent support" },
  { icon: ShieldCheck, title: "Secure checkout", text: "Trusted payment rails" },
  { icon: Sparkles, title: "Quality checked", text: "Every piece before dispatch" },
] as const;

export default async function Home() {
  const products = (await getProducts()).slice(0, 8);

  return (
    <>
      <section className={styles.videoHero} aria-label="Discover HIDI">
        <video className={styles.video} autoPlay muted loop playsInline preload="metadata" aria-label="HIDI brand film">
          <source src="/video/discover-hidi.mp4" type="video/mp4" />
        </video>
        <div className={styles.shade} aria-hidden="true" />

        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>INDIAN WEAR FOR THE LIFE YOU ACTUALLY LIVE</p>
          <Image className={styles.heroLogo} src="/brand/hidi-logo-dark.png" alt="HIDI — Wear the Feeling" width={540} height={180} priority />
          <h1>For every role you carry.</h1>
          <p className={styles.heroCopy}>
            Thoughtful Indian wear for work, everyday rituals and occasions — designed to feel composed, comfortable and entirely your own.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/collections/new-arrivals">Shop new arrivals <ArrowRight size={15} aria-hidden="true" /></Link>
            <Link className={styles.secondaryCta} href="/collections/work-edit">Explore the Work Edit</Link>
          </div>
        </div>

        <div className={styles.heroNote}><span>HIDI / 2026</span><span>Wear the feeling</span></div>
      </section>

      <section className={styles.trustBar} aria-label="Why shop HIDI">
        <div className={styles.trustInner}>
          {trust.map(({ icon: Icon, title, text }) => (
            <div className={styles.trustItem} key={title}>
              <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
              <div><strong>{title}</strong><span>{text}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.intro} container`}>
        <p className={styles.kicker}>DRESS FOR THE DAY YOU HAVE</p>
        <div className={styles.introGrid}>
          <h2>Three moods.<br />One calm wardrobe.</h2>
          <div>
            <p>HIDI is built around the rhythm of real life — pieces that feel right at 9 AM, still feel right at 6 PM, and never ask you to become someone else.</p>
            <Link className={styles.inlineLink} href="/about">Our point of view <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className={`${styles.edits} container`}>
        {edits.map((card) => (
          <Link key={card.title} href={card.href} className={styles.editCard}>
            <Image src={card.image} alt={card.alt} fill sizes="(max-width: 900px) 100vw, 33vw" className={styles.editImage} />
            <div className={styles.editShade} aria-hidden="true" />
            <div className={styles.editTop}><span>{card.number}</span><span>{card.tone}</span></div>
            <div className={styles.editBottom}>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <span className={styles.editLink}>Explore edit <ArrowRight size={14} aria-hidden="true" /></span>
            </div>
          </Link>
        ))}
      </section>

      <section className={`${styles.productSection} container`}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>JUST IN</p>
            <h2>The newest HIDI pieces</h2>
            <p>Considered silhouettes, calm colour and details made for repeat wear.</p>
          </div>
          <Link className={styles.inlineLink} href="/collections/new-arrivals">View all new arrivals <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className={styles.productGrid}>{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      </section>

      <section className={styles.manifesto}>
        <div className={`${styles.manifestoInner} container`}>
          <div className={styles.manifestoMark} aria-hidden="true">HIDI</div>
          <div className={styles.manifestoCopy}>
            <p className={styles.kicker}>OUR POINT OF VIEW</p>
            <h2>Style should feel like you — only more certain.</h2>
            <p>We are not designing for a fantasy wardrobe. We are designing for your Monday, your commute, your lunch with family, your travel day and the celebration that appears at the end of a long week.</p>
            <Link className={styles.manifestoLink} href="/about">Discover HIDI <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <section className={`${styles.serviceSection} container`}>
        <div className={styles.serviceIntro}>
          <p className={styles.kicker}>THE HIDI STANDARD</p>
          <h2>Thoughtful from first click to final fit.</h2>
        </div>
        <div className={styles.serviceGrid}>
          <div><span>01</span><strong>Wearable first</strong><p>Comfort, proportion and repeat wear matter as much as the first impression.</p></div>
          <div><span>02</span><strong>Clear choices</strong><p>Honest product details, visible sizing and straightforward pricing.</p></div>
          <div><span>03</span><strong>Human support</strong><p>Real help when fit, delivery or exchange questions come up.</p></div>
          <div><span>04</span><strong>Built on trust</strong><p>Verified customer reviews and secure payment experiences as HIDI grows.</p></div>
        </div>
      </section>
    </>
  );
}
