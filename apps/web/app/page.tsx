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
  { icon: Truck, title: "Complimentary shipping", text: "Above ₹1,499" },
  { icon: RefreshCcw, title: "7-day exchange", text: "Simple & transparent" },
  { icon: ShieldCheck, title: "Secure payments", text: "Trusted checkout" },
  { icon: Sparkles, title: "Quality checked", text: "Before dispatch" },
] as const;

export default async function Home() {
  const products = (await getProducts()).slice(0, 8);

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroEditorial}>
          <div className={styles.heroMeta}>
            <span>Indian wear for real days</span>
            <span>Work · Everyday · Occasion</span>
          </div>

          <div className={styles.heroCopyWrap}>
            <p className={styles.heroEyebrow}>QUIETLY CONFIDENT INDIAN WEAR</p>
            <h1>For every role you carry.</h1>
            <p className={styles.heroCopy}>
              Indian wear for work, everyday rituals and occasions — calm in spirit, confident in presence.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryCta} href="/collections/new-arrivals">
                Shop new arrivals <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <Link className={styles.textCta} href="/collections/work-edit">
                Explore Work Edit
              </Link>
            </div>
          </div>

          <div className={styles.heroSignature}>
            <span>01</span>
            <p>Designed around real routines, long days and repeat wear.</p>
          </div>
        </div>

        <div className={styles.heroMedia}>
          <video className={styles.video} autoPlay muted loop playsInline preload="metadata" aria-label="HIDI brand film">
            <source src="/video/discover-hidi.mp4" type="video/mp4" />
          </video>
          <div className={styles.mediaShade} aria-hidden="true" />
          <div className={styles.mediaCaption}>
            <span>Quiet confidence</span>
            <strong>Work · Everyday · Occasion</strong>
          </div>
        </div>
      </section>

      <section className={styles.trustBar} aria-label="Why shop HIDI">
        <div className={styles.trustInner}>
          {trust.map(({ icon: Icon, title, text }) => (
            <div className={styles.trustItem} key={title}>
              <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
              <div><strong>{title}</strong><span>{text}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.statement} container`}>
        <div className={styles.statementIndex}>02</div>
        <div className={styles.statementCopy}>
          <p className={styles.kicker}>DRESS FOR THE DAY YOU HAVE</p>
          <h2>Not louder.<br />Just more certain.</h2>
        </div>
        <div className={styles.statementText}>
          <p>HIDI is built for the rhythm of real life: the commute, the meeting, the family lunch, the airport, the dinner after work.</p>
          <Link className={styles.inlineLink} href="/about">Read our point of view <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className={`${styles.edits} container`}>
        <Link href={edits[0].href} className={`${styles.editCard} ${styles.editLarge}`}>
          <Image src={edits[0].image} alt={edits[0].alt} fill sizes="(max-width: 900px) 100vw, 65vw" className={styles.editImage} />
          <div className={styles.editShade} />
          <div className={styles.editTop}><span>{edits[0].number}</span><span>{edits[0].tone}</span></div>
          <div className={styles.editBottom}>
            <h3>{edits[0].title}</h3>
            <p>{edits[0].description}</p>
            <span className={styles.editLink}>Explore edit <ArrowRight size={14} /></span>
          </div>
        </Link>

        <div className={styles.editStack}>
          {edits.slice(1).map((card) => (
            <Link key={card.title} href={card.href} className={`${styles.editCard} ${styles.editSmall}`}>
              <Image src={card.image} alt={card.alt} fill sizes="(max-width: 900px) 100vw, 35vw" className={styles.editImage} />
              <div className={styles.editShade} />
              <div className={styles.editTop}><span>{card.number}</span><span>{card.tone}</span></div>
              <div className={styles.editBottom}>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <span className={styles.editLink}>Explore edit <ArrowRight size={14} /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.launchValues}>
        <div className="container">
          <div className={styles.launchValuesGrid}>
            <div className={styles.launchValuesLead}>
              <p className={styles.kicker}>MADE FOR REPEAT WEAR</p>
              <h2>Good clothes should make the day easier.</h2>
            </div>
            <div className={styles.valueCard}>
              <span>01</span>
              <strong>Thoughtful fabrics</strong>
              <p>Chosen for comfort, movement and the kind of wear that lasts beyond one occasion.</p>
            </div>
            <div className={styles.valueCard}>
              <span>02</span>
              <strong>Easy silhouettes</strong>
              <p>Shapes designed to feel composed without becoming restrictive or overworked.</p>
            </div>
            <div className={styles.valueCard}>
              <span>03</span>
              <strong>Quality checked</strong>
              <p>Every piece is checked before dispatch so the product you receive matches the HIDI standard.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.productSection} container`}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.kicker}>JUST IN / 03</p>
            <h2>The newest HIDI pieces</h2>
          </div>
          <div className={styles.sectionHeaderAside}>
            <p>Considered silhouettes, calm colour and details made for repeat wear.</p>
            <Link className={styles.inlineLink} href="/collections/new-arrivals">View all <ArrowRight size={14} /></Link>
          </div>
        </div>
        <div className={styles.productGrid}>
          {products.map((product) => <ProductCard key={product.slug} product={product} />)}
        </div>
      </section>

      <section className={styles.manifesto}>
        <div className={`${styles.manifestoInner} container`}>
          <div className={styles.manifestoLeft}>
            <span className={styles.manifestoNumber}>04</span>
            <div className={styles.manifestoPhrase} aria-hidden="true">REAL<br />DAYS</div>
          </div>
          <div className={styles.manifestoCopy}>
            <p className={styles.kicker}>OUR POINT OF VIEW</p>
            <h2>Style should feel like you — only more certain.</h2>
            <p>We choose restraint over noise, wearability over spectacle, and thoughtful detail over trend for trend’s sake.</p>
            <Link className={styles.manifestoLink} href="/about">Discover HIDI <ArrowRight size={14} /></Link>
          </div>
        </div>
      </section>

      <section className={`${styles.serviceSection} container`}>
        <div className={styles.serviceIntro}>
          <p className={styles.kicker}>05 / OUR STANDARD</p>
          <h2>Thoughtful from first click to final fit.</h2>
        </div>
        <div className={styles.serviceGrid}>
          <div><span>01</span><strong>Wearable first</strong><p>Comfort, proportion and repeat wear matter as much as first impression.</p></div>
          <div><span>02</span><strong>Clear choices</strong><p>Honest product detail, visible sizing and straightforward pricing.</p></div>
          <div><span>03</span><strong>Human support</strong><p>Real help when fit, delivery or exchange questions come up.</p></div>
          <div><span>04</span><strong>Built on trust</strong><p>Verified reviews and secure payment experiences as HIDI grows.</p></div>
        </div>
      </section>
    </>
  );
}
