import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BadgePercent,
  Coins,
  Gem,
  Gift,
  HeartHandshake,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { getBestSellers, getProducts } from "@/lib/api";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const collections = [
  {
    title: "New Arrivals",
    copy: "Fresh silhouettes, thoughtful details.",
    href: "/collections/new-arrivals",
    image: "/products/tara-dusty-rose-straight-kurta/01-main.png",
  },
  {
    title: "Work Edit",
    copy: "Quiet elegance for long, real days.",
    href: "/collections/work-edit",
    image: "/products/ira-beige-office-kurta-set/01-main.png",
  },
  {
    title: "Everyday",
    copy: "Comfort that still feels considered.",
    href: "/collections/everyday",
    image: "/products/myra-peach-comfort-kurta-set/01-main.png",
  },
  {
    title: "Occasion",
    copy: "Presence without excess.",
    href: "/collections/occasion",
    image: "/products/kiara-wine-festive-kurta-set/01-main.png",
  },
] as const;

const standards = [
  { icon: Sparkles, title: "Premium fabrics", copy: "Comfort-first materials chosen for repeat wear." },
  { icon: BadgeCheck, title: "Quality checked", copy: "Every piece is reviewed before dispatch." },
  { icon: Gem, title: "Timeless design", copy: "Refined silhouettes beyond one season." },
  { icon: HeartHandshake, title: "Human support", copy: "Real help for fit, orders and exchanges." },
] as const;

export default async function Home() {
  const [catalogue, bestSellers] = await Promise.all([
    getProducts(),
    getBestSellers(8),
  ]);
  const hasSales = bestSellers.length > 0;
  const featured = hasSales ? bestSellers : catalogue.slice(0, 8);
  const hero = catalogue.find((product) => product.slug === "meher-gold-beige-occasion-set")
    ?? catalogue.find((product) => product.slug === "sana-sand-kurta-set")
    ?? catalogue[0];
  const heroImage = hero?.images?.find((image) => image.url?.trim())?.url
    ?? "/products/sana-sand-kurta-set/01-main.png";
  const whatsapp = (process.env.NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const whatsappHref = whatsapp
    ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("Hi HIDI, I would like help choosing a style.")
    : "/account";

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>TRADITION, MADE BEAUTIFULLY MODERN</p>
          <h1>Indian wear for every version of you.</h1>
          <p className={styles.heroIntro}>
            Calm colour, considered fabrics and graceful silhouettes for work,
            everyday life and the moments you want to remember.
          </p>
          <div className={styles.heroActions}>
            <Link href="/collections/new-arrivals" className={styles.primaryButton}>
              Shop new arrivals <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/collections/all" className={styles.secondaryButton}>
              Explore collections
            </Link>
          </div>
          <div className={styles.heroNote}>
            <span>Wear the feeling</span>
            <p>More than outfits — pieces designed to feel naturally yours.</p>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <Image
            src={heroImage}
            alt={hero?.name ?? "HIDI ethnic wear"}
            fill
            priority
            sizes="(max-width: 820px) 100vw, 58vw"
            className={styles.heroImage}
          />
          <div className={styles.heroVeil} aria-hidden="true" />
          <div className={styles.heroBadge}>
            <span>THE HIDI EDIT</span>
            <strong>{hero?.name ?? "Quietly elegant Indian wear"}</strong>
          </div>
        </div>
      </section>

      <section className={styles.collectionStrip} aria-label="Shop HIDI collections">
        {collections.map((item) => (
          <Link href={item.href} key={item.title} className={styles.collectionCard}>
            <div className={styles.collectionImage}>
              <Image src={item.image} alt="" fill sizes="(max-width: 760px) 50vw, 25vw" />
            </div>
            <div className={styles.collectionCopy}>
              <span>{item.title}</span>
              <p>{item.copy}</p>
              <b>Discover <ArrowRight size={13} aria-hidden="true" /></b>
            </div>
          </Link>
        ))}
      </section>

      <section className={styles.launchBenefits} aria-labelledby="hidi-launch-benefits">
        <div className={styles.launchIntro}>
          <p className={styles.eyebrow}>HIDI LAUNCH BENEFITS</p>
          <h2 id="hidi-launch-benefits">More value every time you choose HIDI.</h2>
          <p>
            Celebrate our launch with rewards and limited-period offers designed
            to make your first HIDI wardrobe edit even more rewarding.
          </p>
          <Link href="/collections/all" className={styles.launchCta}>
            Shop the launch <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className={styles.launchOfferGrid}>
          <article className={styles.launchOfferCard}>
            <span className={styles.launchOfferIcon}><Coins size={23} strokeWidth={1.5} /></span>
            <p>HIDI REWARDS</p>
            <strong>₹2 back for every ₹100 you spend.</strong>
            <span>HIDI Rewards become eligible after the applicable return window closes.</span>
          </article>

          <article className={styles.launchOfferCard}>
            <span className={styles.launchOfferIcon}><Gift size={23} strokeWidth={1.5} /></span>
            <p>₹1 EXTRA DRESS</p>
            <strong>Shop ₹3,500+ and unlock another eligible dress for ₹1.</strong>
            <span>Launch offer on eligible styles and qualifying orders. Terms apply.</span>
          </article>

          <article className={styles.launchOfferCard}>
            <span className={styles.launchOfferIcon}><BadgePercent size={23} strokeWidth={1.5} /></span>
            <p>INAUGURAL OFFER</p>
            <strong>Flat 15% off eligible launch purchases.</strong>
            <span>Limited-period inaugural benefit on eligible orders. Terms apply.</span>
          </article>
        </div>
      </section>

      <section className={styles.standardBar} aria-label="The HIDI standard">
        {standards.map(({ icon: Icon, title, copy }) => (
          <div className={styles.standardItem} key={title}>
            <Icon size={19} strokeWidth={1.4} aria-hidden="true" />
            <div>
              <strong>{title}</strong>
              <span>{copy}</span>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.featured + " container"}>
        <header className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>{hasSales ? "BEST SELLERS" : "FEATURED FOR LAUNCH"}</p>
            <h2>{hasSales ? "The HIDI pieces customers choose most." : "A considered first look at HIDI."}</h2>
          </div>
          <div className={styles.sectionAside}>
            <p>
              {hasSales
                ? "Ranked by sold quantity from confirmed and fulfilled HIDI orders — never by invented ratings."
                : "Best Sellers will appear here automatically once confirmed customer orders create real sales data."}
            </p>
            <Link href="/collections/all">
              Shop all <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className={styles.productGrid}>
          {featured.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>

      <section className={styles.brandBand}>
        <div className={styles.brandBandInner + " container"}>
          <div className={styles.brandStory}>
            <p className={styles.eyebrow}>ROOTED IN HERITAGE. DESIGNED FOR TODAY.</p>
            <h2>Premium does not have to feel distant.</h2>
            <p>
              HIDI brings together Indian silhouettes, restrained styling and an
              easy online experience so getting dressed feels simpler — and more
              like you.
            </p>
            <Link href="/about" className={styles.storyLink}>
              Our story <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.whatsappCard}>
            <div className={styles.whatsappCopy}>
              <div className={styles.whatsappBrandRow}>
                <div className={styles.whatsappIconBadge} aria-hidden="true">
                  <WhatsAppIcon size={31} />
                </div>
                <div>
                  <span>PERSONAL SHOPPING SUPPORT</span>
                  <small>HIDI styling desk · WhatsApp</small>
                </div>
              </div>

              <h3>Need help choosing?</h3>
              <p>
                Ask HIDI about a product, fit, size or styling before you order.
                Get a human response without leaving the shopping flow.
              </p>

              <div className={styles.whatsappBenefits} aria-label="WhatsApp shopping support">
                <span>Fit & size help</span>
                <span>Product questions</span>
                <span>Order assistance</span>
              </div>

              <Link
                href={whatsappHref}
                className={styles.whatsappButton}
                target={whatsapp ? "_blank" : undefined}
                rel={whatsapp ? "noreferrer" : undefined}
              >
                <WhatsAppIcon size={17} />
                Chat on WhatsApp
                <ArrowRight size={14} aria-hidden="true" />
              </Link>

              <small className={styles.whatsappFinePrint}>
                Opens WhatsApp with a ready-to-send HIDI message.
              </small>
            </div>

            <div className={styles.whatsappVisual} aria-hidden="true">
              <div className={styles.phoneMockup}>
                <div className={styles.phoneTop}>
                  <span className={styles.phoneAvatar}>
                    <WhatsAppIcon size={16} />
                  </span>
                  <div>
                    <strong>HIDI Styling Desk</strong>
                    <small>Typically replies during store hours</small>
                  </div>
                  <i />
                </div>

                <div className={styles.phoneChat}>
                  <div className={styles.receivedBubble}>
                    Hi ✨ Tell us the style you’re considering and your usual size.
                    We’ll help you choose.
                  </div>
                  <div className={styles.sentBubble}>
                    I like this kurta set. Would M or L suit a relaxed fit?
                  </div>
                  <div className={styles.receivedBubble}>
                    Share your usual fit preference and we’ll guide you before you order.
                  </div>
                </div>

                <div className={styles.phoneComposer}>
                  <span>Message HIDI…</span>
                  <b>➤</b>
                </div>
              </div>
              <span className={styles.visualNote}>Human help. Before you buy.</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.promise + " container"}>
        <div className={styles.promiseLead}>
          <p className={styles.eyebrow}>SHOP WITH CONFIDENCE</p>
          <h2>A premium experience beyond the first impression.</h2>
        </div>
        <div className={styles.promiseGrid}>
          <div><Truck size={20} /><strong>Complimentary shipping</strong><span>On qualifying orders.</span></div>
          <div><RefreshCcw size={20} /><strong>Easy exchange</strong><span>Clear 7-day exchange support.</span></div>
          <div><ShieldCheck size={20} /><strong>Secure payments</strong><span>Trusted payment flow through Razorpay.</span></div>
        </div>
      </section>
    </>
  );
}
