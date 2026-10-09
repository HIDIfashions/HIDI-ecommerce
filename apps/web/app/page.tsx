import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, RefreshCcw, ShieldCheck, Truck } from "lucide-react";
import { EditorialDetailImage } from "@/components/editorial-detail-image";
import { AmbientHero } from "@/components/editorial-motion";
import { EditorialProductCard } from "@/components/editorial-product-card";
import { EditorialLookbook } from "@/components/editorial-lookbook";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { getFeaturedProducts } from "@/lib/api";
import { SHIPPING_COPY, RETURN_COPY, LAUNCH_OFFER_COPY } from "@/lib/shopping-guidance";
import { configuredWhatsAppNumber } from "@/lib/product-sharing";
import styles from "./home.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };
const edits = [
  { eyebrow: "WORKWEAR EDIT", title: "Quiet confidence.", href: "/collections/work-edit", image: "/products/ira-beige-office-kurta-set/01-main.png", detail: "/products/ira-beige-office-kurta-set/03-detail.png" },
  { eyebrow: "EVERYDAY", title: "Ease, beautifully considered.", href: "/collections/everyday", image: "/products/myra-peach-comfort-kurta-set/01-main.png", detail: "/products/myra-peach-comfort-kurta-set/03-detail.png" },
  { eyebrow: "OCCASION", title: "Presence, without excess.", href: "/collections/occasion", image: "/products/kiara-wine-festive-kurta-set/01-main.png", detail: "/products/kiara-wine-festive-kurta-set/03-detail.png" },
] as const;
const privileges = [
  { title: "The ₹1 HIDI Privilege", copy: "Planned launch privilege: ₹3,999+ and one selected style for ₹1.", href: "/offers#rupee", cta: "Read eligibility details" },
  { title: "A Little Silver", copy: "A 2 g silver launch keepsake is planned. Qualifying orders and allocation are awaiting confirmation.", href: "/offers#silver", cta: "Read launch details" },
  { title: "HIDI Rewards", copy: "Earn HIDI rewards when you shop and use them toward a future order.", href: "/account", cta: "View rewards" },
] as const;
const services = [
  { icon: Truck, title: "Complimentary shipping", copy: SHIPPING_COPY, href: "/shipping" },
  { icon: RefreshCcw, title: "Returns & exchanges", copy: RETURN_COPY, href: "/returns" },
  { icon: ShieldCheck, title: "Secure checkout", copy: "Read our payment guidance.", href: "/contact#payments" },
] as const;
export default async function Home() {
  const featured = await getFeaturedProducts(6);
  const whatsapp = configuredWhatsAppNumber();
  const validWhatsapp = Boolean(whatsapp);
  const whatsappHref = validWhatsapp ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("Hi HIDI, I would like help choosing a style.") : "/contact";
  return <div className={styles.home} data-hidi-editorial="v2">
    <section className={styles.hero} aria-labelledby="hidi-hero-title" data-section="hero">
      <AmbientHero videoSrc={process.env.HIDI_HERO_VIDEO_URL} />
      <div className={styles.heroShade} aria-hidden="true" />
      <div className={styles.heroContent}><p className={styles.heroEyebrow}>HIDI / NEW SEASON</p><h1 id="hidi-hero-title">Wear the feeling.</h1><p className={styles.heroIntro}>A quieter kind of statement.</p><Link href="/collections/new-arrivals" className={styles.heroCta}>Discover the collection<ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link></div>
    </section>
    <section className={styles.editSection} aria-labelledby="hidi-edits-title" data-neutral-surface data-section="edits">
      <header className={styles.sectionHeader + " container"}><div><p className={styles.eyebrow}>SHOP BY EDIT</p><h2 id="hidi-edits-title">For every side of you.</h2></div><span className={styles.sectionNote}>Work. Everyday. Occasion.</span></header>
      <div className={styles.edits + " container"} aria-label="Shop HIDI edits">{edits.map((edit, index) => <Link className={styles.editCard} href={edit.href} key={edit.href}>
        <Image src={edit.image} alt="" fill sizes={index === 0 ? "(max-width: 760px) calc(100vw - 36px), (max-width: 1504px) calc(60vw - 50.4px), 852px" : "(max-width: 760px) calc(50vw - 24px), (max-width: 1504px) calc(40vw - 33.6px), 568px"} className={styles.editPrimary} />
        <EditorialDetailImage key={edit.detail} src={edit.detail} sizes={index === 0 ? "(max-width: 760px) calc(100vw - 36px), (max-width: 1504px) calc(60vw - 50.4px), 852px" : "(max-width: 760px) calc(50vw - 24px), (max-width: 1504px) calc(40vw - 33.6px), 568px"} className={styles.editDetail} /><span className={styles.editShade} aria-hidden="true" />
        <span className={styles.editCopy}><small>{edit.eyebrow}</small><strong>{edit.title}</strong><span>Discover<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></span></span>
      </Link>)}</div>
    </section>
    <section className={styles.featured + " container"} aria-labelledby="hidi-featured-title" data-neutral-surface data-section="featured">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>THE HIDI EDIT</p><h2 id="hidi-featured-title">Pieces to live in now.</h2></div><Link href="/collections/all" className={styles.textLink}>Shop all<ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" /></Link></header>
      {featured.length ? <div className={styles.productGrid}>{featured.map(product => <EditorialProductCard key={product.slug} product={product} />)}</div> : <p className={styles.empty}>Our latest edit is being prepared. <Link href="/collections/all">Explore the collection</Link>.</p>}
    </section>
    <section className={styles.privileges} aria-labelledby="hidi-privileges-title" data-neutral-surface data-section="privileges"><div className="container"><details className={styles.privilegeDetails}>
      <summary><span><span className={styles.eyebrow}>HIDI PRIVILEGES</span><span id="hidi-privileges-title" className={styles.privilegeTitle}>A little more, just for you.</span></span><span className={styles.privilegeSummary}>Discover your privileges <span aria-hidden="true">+</span></span></summary>
      <div className={styles.privilegeGrid}>{privileges.map(privilege => <div className={styles.privilegeCard} key={privilege.title}><h3>{privilege.title}</h3><p>{privilege.copy}</p><Link href={privilege.href}>{privilege.cta}<ArrowRight size={14} aria-hidden="true" /></Link></div>)}</div>
      <p className={styles.privilegesFinePrint}>Preview information: promotional eligibility is not yet available at checkout. {LAUNCH_OFFER_COPY}</p>
    </details></div></section>
    <section className={styles.craft + " container"} aria-labelledby="hidi-craft-title" data-neutral-surface data-section="craft">
      <div className={styles.craftImage}><Image src="/products/anika-ivory-embroidered-set/03-detail.png" alt="Ivory embroidered styling from the HIDI editorial archive" fill sizes="(max-width: 760px) 100vw, 50vw" /></div>
      <div className={styles.craftCopy}><p className={styles.eyebrow}>THE DETAILS MATTER</p><h2 id="hidi-craft-title">Beautiful to look at.<br />Considered to wear.</h2><p className={styles.craftIntro}>Look a little closer. Discover the details that make a piece feel like you.</p>
        <div className={styles.pillars}><div><h3>Fabric &amp; feel</h3><p>Explore the fabric and care information on each piece.</p></div><div><h3>Find your fit</h3><p>Use the size guide and available garment measurements to choose with confidence.</p></div><div><h3>A considered edit</h3><p>A curated wardrobe for workdays, slow days and occasions.</p></div></div>
        <Link href="/about" className={styles.textLink}>The HIDI point of view<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </section>
    <EditorialLookbook />
    <section className={styles.serviceStrip} aria-label="HIDI shopping services" data-neutral-surface data-section="services"><div className={styles.serviceGrid + " container"}>
      {services.map(({ icon: Icon, title, copy, href }) => <Link href={href} className={styles.serviceItem} key={title}><Icon size={18} strokeWidth={1.45} aria-hidden="true" /><div><strong>{title}</strong><span>{copy}</span></div></Link>)}
      <Link href={whatsappHref} className={styles.serviceItem + " " + styles.serviceLink} target={validWhatsapp ? "_blank" : undefined} rel={validWhatsapp ? "noreferrer" : undefined}><WhatsAppIcon size={18} className={styles.serviceWhatsappIcon} /><div><strong>{validWhatsapp ? "Human shopping help" : "Order & product help"}</strong><span>{validWhatsapp ? "Fit and product support on WhatsApp." : "Orders, size information and aftercare."}</span></div></Link>
    </div></section>
  </div>;
}
