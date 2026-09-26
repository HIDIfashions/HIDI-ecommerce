import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  MessageCircle,
  RefreshCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { getBestSellers, getProducts } from "@/lib/api";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const principles = [
  {
    index: "01",
    title: "Considered silhouettes",
    copy: "Clean proportions that feel polished without becoming formal or overworked.",
  },
  {
    index: "02",
    title: "Comfort in the details",
    copy: "Fabric, movement and finish are considered for the hours you actually wear them.",
  },
  {
    index: "03",
    title: "Quietly expressive",
    copy: "Colour and craft bring character while the overall look stays calm and easy.",
  },
] as const;

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

const services = [
  {
    icon: Truck,
    title: "Complimentary shipping",
    copy: "On orders above ₹1,499.",
  },
  {
    icon: RefreshCcw,
    title: "Easy exchange",
    copy: "Simple exchange within 7 days.",
  },
  {
    icon: ShieldCheck,
    title: "Secure checkout",
    copy: "Protected payment experience.",
  },
] as const;

export default async function Home() {
  const [catalogue, bestSellers] = await Promise.all([
    getProducts(),
    getBestSellers(8),
  ]);

  const hasSales = bestSellers.length > 0;
  const featured = hasSales
    ? [
        ...bestSellers,
        ...catalogue.filter(
          (product) => !bestSellers.some((best) => best.id === product.id),
        ),
      ].slice(0, 4)
    : catalogue.slice(0, 4);

  const whatsapp = (process.env.NEXT_PUBLIC_HIDI_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const whatsappHref = whatsapp
    ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("Hi HIDI, I would like help choosing a style.")
    : "/account";

  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <Image
          src="/brand/hidi-hero-green-garden-fullbody.webp"
          alt="HIDI full-length garden editorial"
          fill
          priority
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
            Shop new arrivals
            <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>

        <span className={styles.heroIndex}>HIDI · 01</span>
      </section>

      <section className={styles.intro}>
        <div className="container">
          <div className={styles.introLead}>
            <div>
              <p className={styles.eyebrow}>THE HIDI POINT OF VIEW</p>
              <h2>Indian wear, made to feel effortless.</h2>
            </div>

            <div className={styles.introCopy}>
              <p>
                A modern wardrobe built around proportion, fabric and comfort —
                designed for workdays, slow days and everything in between.
              </p>
              <Link href="/about" className={styles.inlineLink}>
                About HIDI
                <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className={styles.principleGrid}>
            {principles.map((principle) => (
              <article className={styles.principle} key={principle.index}>
                <span>{principle.index}</span>
                <div>
                  <strong>{principle.title}</strong>
                  <p>{principle.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.editSection}>
        <header className={styles.editHeader + " container"}>
          <p className={styles.eyebrow}>SHOP BY EDIT</p>
          <h2>Work. Everyday. Occasion.</h2>
        </header>

        <div className={styles.edits} aria-label="Shop HIDI edits">
          {edits.map((edit) => (
            <Link className={styles.editCard} href={edit.href} key={edit.href}>
              <Image
                src={edit.image}
                alt=""
                fill
                sizes="(max-width: 760px) 100vw, 33vw"
              />
              <span className={styles.editShade} aria-hidden="true" />
              <span className={styles.editCopy}>
                <small>{edit.eyebrow}</small>
                <strong>{edit.title}</strong>
                <span>
                  Discover
                  <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.featured + " container"}>
        <header className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>THE HIDI EDIT</p>
            <h2>Pieces to live in now.</h2>
          </div>
          <div className={styles.sectionAside}>
            <p>
              {hasSales
                ? "A rotating edit led by what customers are choosing now."
                : "A considered first look at the styles defining HIDI."}
            </p>
            <Link href="/collections/all" className={styles.textLink}>
              Shop all
              <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className={styles.productGrid}>
          {featured.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>

      <section className={styles.serviceStrip} aria-label="HIDI shopping services">
        <div className={styles.serviceGrid + " container"}>
          {services.map(({ icon: Icon, title, copy }) => (
            <div className={styles.serviceItem} key={title}>
              <Icon size={18} strokeWidth={1.45} aria-hidden="true" />
              <div>
                <strong>{title}</strong>
                <span>{copy}</span>
              </div>
            </div>
          ))}
          <Link
            href={whatsappHref}
            className={styles.serviceItem + " " + styles.serviceLink}
            target={whatsapp ? "_blank" : undefined}
            rel={whatsapp ? "noreferrer" : undefined}
          >
            <MessageCircle size={18} strokeWidth={1.45} aria-hidden="true" />
            <div>
              <strong>Human shopping help</strong>
              <span>Fit and product support on WhatsApp.</span>
            </div>
          </Link>
        </div>
      </section>

      <section className={styles.manifesto} aria-label="HIDI occasion editorial">
        <Image
          src="/brand/hidi-manifesto-ananya.webp"
          alt="Ananya in a royal purple HIDI occasion dress"
          width={1672}
          height={941}
          sizes="100vw"
          className={styles.manifestoFullImage}
        />
      </section>
    </div>
  );
}
