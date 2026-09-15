import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  const products = (await getProducts()).slice(0, 8);
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">THE NEW WORK EDIT</p>
          <h1>Quietly confident.<br />Made for your every day.</h1>
          <p>Indian silhouettes with clean lines, considered colour and comfort that carries you through the day.</p>
          <div className="button-row">
            <Link className="button button-dark" href="/collections/new-arrivals">Shop new arrivals</Link>
            <Link className="button button-light" href="/collections/work-edit">Explore Work Edit</Link>
          </div>
        </div>
        <div className="hero-art" aria-label="HIDI campaign placeholder">
          <div className="hero-frame frame-one" /><div className="hero-frame frame-two" />
          <div className="hero-note">Campaign imagery<br />goes here</div>
        </div>
      </section>
      <section className="editorial container section-space">
        <div className="section-heading"><p className="eyebrow">DRESS FOR THE DAY YOU HAVE</p><h2>Three moods. One calm wardrobe.</h2></div>
        <div className="editorial-grid">
          <Link href="/collections/work-edit" className="editorial-card edit-work"><span>01</span><div><h3>Work Edit</h3><p>Polished without trying too hard.</p></div></Link>
          <Link href="/collections/everyday" className="editorial-card edit-everyday"><span>02</span><div><h3>Everyday Ease</h3><p>Pieces you will reach for again.</p></div></Link>
          <Link href="/collections/occasion" className="editorial-card edit-occasion"><span>03</span><div><h3>Occasion</h3><p>Presence, with restraint.</p></div></Link>
        </div>
      </section>
      <section className="container section-space">
        <div className="section-heading split-heading"><div><p className="eyebrow">JUST IN</p><h2>The newest HIDI pieces</h2></div><Link className="text-link" href="/collections/new-arrivals">View all →</Link></div>
        <div className="product-grid">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>
      </section>
      <section className="brand-story section-space"><div className="container brand-story-inner"><div className="story-mark">HIDI</div><div><p className="eyebrow">OUR POINT OF VIEW</p><h2>Style should feel like you — only more certain.</h2><p>We design Indian wear around real routines: work, family, travel, dinners and the hundred ordinary moments in between.</p><Link className="text-link" href="/about">Discover HIDI →</Link></div></div></section>
      <section className="promise container section-space"><div><strong>Thoughtful fabrics</strong><span>Chosen for repeat wear and comfort.</span></div><div><strong>Easy exchanges</strong><span>A simple, clear 7-day process.</span></div><div><strong>Secure payments</strong><span>UPI, cards and trusted payment rails.</span></div><div><strong>Real support</strong><span>Helpful humans when you need us.</span></div></section>
    </>
  );
}
