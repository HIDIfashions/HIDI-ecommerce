import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Headphones, Heart, Leaf, PackageCheck, ShieldCheck } from "lucide-react";
import { CatalogImage } from "@/components/catalog-image";
import { WishlistButton } from "@/components/wishlist-button";
import { getProducts, formatPaise, type ApiProduct } from "@/lib/api";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

const ART = "/home/quiet-gold";
const FEATURED_LIMIT = 4;
const moods = [
  { title: "New Arrivals", subtitle: "Fresh stories", href: "/collections/new-arrivals", image: "mood-new-arrivals.webp" },
  { title: "Work Edit", subtitle: "Elevated everydays", href: "/collections/work-edit", image: "mood-work.webp" },
  { title: "Everyday", subtitle: "Beauty in simplicity", href: "/collections/everyday", image: "mood-everyday.webp" },
  { title: "Occasion", subtitle: "Made for your moments", href: "/collections/occasion", image: "mood-occasion.webp" },
] as const;

// Art direction: one appropriate hero image is fetched, not both desktop and mobile.
function HeroArtwork() {
  const common = {
    alt: "HIDI campaign concept in champagne-gold Indian wear",
    loading: "eager" as const,
    fetchPriority: "high" as const,
  };
  const { props: desktop } = getImageProps({
    ...common, src: `${ART}/hero-desktop.webp`, width: 843, height: 368,
    sizes: "(max-width: 959px) 100vw, 61vw",
  });
  const { props: mobile } = getImageProps({
    ...common, src: `${ART}/hero-mobile.webp`, width: 332, height: 368,
    sizes: "100vw",
  });
  return (
    <picture className={styles.heroVisual}>
      <source media="(max-width: 959px)" srcSet={mobile.srcSet ?? mobile.src} sizes="100vw" />
      {/* getImageProps supplies Next.js optimized URLs for this picture element. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...desktop} alt={common.alt} className={styles.heroImage} />
    </picture>
  );
}

function FeaturedCard({ product }: { product: ApiProduct }) {
  const href = `/products/${encodeURIComponent(product.slug)}`;
  const image = [...(product.images ?? [])].sort((a, b) => a.position - b.position)[0];
  const colours = Array.from(new Map(
    (product.variants ?? [])
      .filter((variant) => Boolean(variant.color?.trim()))
      .map((variant) => [variant.color.trim().toLowerCase(), variant]),
  ).values());

  return (
    <article className={styles.productCard} aria-label={product.name}>
      <div className={styles.productMedia}>
        <Link href={href} className={styles.productImageLink} aria-label={`View ${product.name}`}>
          <CatalogImage
            src={image?.url}
            alt={image?.alt || product.name}
            sizes="(max-width: 600px) 46vw, (max-width: 1199px) 23vw, 14vw"
            fallbackLabel={product.name}
            className={styles.productImage}
          />
        </Link>
        {/* Sibling of the product link: no button nested inside an anchor. */}
        <div className={styles.wishlist}>
          <WishlistButton slug={product.slug} />
          <Heart className={styles.wishlistIcon} aria-hidden="true" />
        </div>
        {!product.inStock && <span className={styles.soldOut}>Sold out</span>}
      </div>
      <div className={styles.productInfo}>
        <h3><Link href={href}>{product.name}</Link></h3>
        <p className={styles.price}>
          {product.minPricePaise !== product.maxPricePaise && <span>From </span>}
          {formatPaise(product.minPricePaise)}
        </p>
        {colours.length > 0 && (
          <ul className={styles.swatches} aria-label={`Listed colours for ${product.name}`}>
            {colours.slice(0, 4).map((variant) => {
              // Do not invent a colour when the catalogue has no valid hex value.
              const hex = variant.colorHex?.trim();
              const validHex = hex && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex);
              return (
                <li key={variant.color.toLowerCase()} title={variant.color}>
                  {validHex ? (
                    <span className={styles.swatch} style={{ backgroundColor: hex }}>
                      <span className={styles.srOnly}>{variant.color}</span>
                    </span>
                  ) : <span className={styles.colourName}>{variant.color}</span>}
                </li>
              );
            })}
            {colours.length > 4 && <li className={styles.colourName}>+{colours.length - 4} more</li>}
          </ul>
        )}
      </div>
    </article>
  );
}

async function FeaturedProducts() {
  let products: ApiProduct[];
  try {
    products = await getProducts();
    if (!Array.isArray(products)) throw new Error("Unexpected catalogue response");
  } catch {
    console.error("[HIDI home] Unable to load the featured catalogue.");
    return (
      <div className={styles.catalogueState} role="status">
        <p>The collection could not load right now.</p>
        <span>Please refresh this page to try again.</span>
        <Link href="/collections/all" className={styles.textLink}>Browse collections <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    );
  }

  // Preserve API order within each group. Do not label unsold items "bestsellers".
  const featured = [
    ...products.filter((product) => product.inStock),
    ...products.filter((product) => !product.inStock),
  ].slice(0, FEATURED_LIMIT);

  if (featured.length === 0) {
    return (
      <div className={styles.catalogueState}>
        <p>A new chapter is on its way.</p>
        <span>Our collection will appear here when products are published.</span>
      </div>
    );
  }
  return <div className={styles.productGrid}>{featured.map((product) => <FeaturedCard key={product.id} product={product} />)}</div>;
}

function FeaturedLoading() {
  return (
    <div className={styles.productGrid} aria-busy="true" aria-label="Loading featured pieces">
      {Array.from({ length: FEATURED_LIMIT }, (_, index) => (
        <div className={styles.skeletonCard} key={index} aria-hidden="true">
          <div className={styles.skeletonImage} /><div className={styles.skeletonLine} /><div className={styles.skeletonPrice} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  // SiteShell already supplies <main>, Header and Footer. Do not duplicate them.
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <HeroArtwork />
        <div className={styles.heroCopy}>
          <h1 id="home-title" className={styles.heroTitle}>More<br />Than Outfits</h1>
          <p className={styles.heroTagline}>A feeling you wear</p>
          <p className={styles.heroDescription}>Timeless ethnicwear for every version of you.<br className={styles.desktopBreak} /> Rooted in tradition, designed for today.</p>
          <div className={styles.heroActions}>
            <Link href="/collections/new-arrivals" className={styles.primaryButton}>Shop new arrivals <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/about" className={styles.secondaryButton}>Explore our story</Link>
          </div>
          <p className={styles.signature}>Wear the feeling</p>
        </div>
      </section>

      <section className={styles.moodSection} aria-labelledby="mood-title">
        <div className={styles.sectionHeading}>
          <h2 id="mood-title" className={styles.eyebrow}>Shop by mood</h2>
          <Link href="/collections/all" className={styles.textLink}>View all <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        <div className={styles.moodGrid}>
          {moods.map((mood) => (
            <Link key={mood.href} href={mood.href} className={styles.moodCard}>
              <div className={styles.moodVisual}>
                <Image src={`${ART}/${mood.image}`} alt="" fill sizes="(max-width: 600px) 30vw, 18vw" className={styles.moodImage} />
              </div>
              <div className={styles.moodCopy}>
                <h3>{mood.title}</h3><p>{mood.subtitle}</p><ArrowRight size={21} strokeWidth={1} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className={styles.discovery}>
        <section className={styles.featuredSection} aria-labelledby="featured-title">
          <div className={styles.sectionHeading}>
            <h2 id="featured-title" className={styles.eyebrow}>Featured pieces</h2>
            <Link href="/collections/all" className={styles.textLink}>Shop all <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <Suspense fallback={<FeaturedLoading />}><FeaturedProducts /></Suspense>
        </section>
        <section className={styles.storyCard} aria-labelledby="story-title">
          <div className={styles.storyVisual}>
            <Image src={`${ART}/detail.webp`} alt="Embroidery detail from the selected HIDI concept artwork" fill sizes="(max-width: 1199px) 50vw, 24vw" className={styles.storyImage} />
          </div>
          <div className={styles.storyCopy}>
            <p className={styles.eyebrow}>The HIDI way</p>
            <h2 id="story-title">Rooted in Tradition,<br />Woven for Today</h2>
            <p className={styles.storyDescription}>Indian wear for your workdays, celebrations and everything in between. Discover the feeling behind HIDI.</p>
            <Link href="/about" className={styles.secondaryButton}>Our story <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>

      <section className={styles.trustStrip} aria-label="Shopping with HIDI">
        <div className={styles.trustItem}><ShieldCheck aria-hidden="true" /><div><h2>Secure checkout</h2><p>UPI and card payments</p></div></div>
        <div className={styles.trustItem}><PackageCheck aria-hidden="true" /><div><h2>Returns &amp; exchanges</h2><Link href="/returns">View eligibility and terms</Link></div></div>
        <div className={styles.trustItem}><Leaf aria-hidden="true" /><div><h2>Fabric &amp; fit</h2><Link href="/collections/all">Explore product details</Link></div></div>
        <div className={styles.trustItem}><Headphones aria-hidden="true" /><div><h2>Customer support</h2><Link href="/contact">Get in touch</Link></div></div>
      </section>
      <div className={styles.closingLine} aria-hidden="true"><span />Wear the feeling<span /></div>
    </div>
  );
}
