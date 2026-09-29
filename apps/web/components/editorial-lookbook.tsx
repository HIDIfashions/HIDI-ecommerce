"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CatalogImage } from "./catalog-image";
import { communityLooks, editorialLooks } from "@/lib/editorial-content";
import styles from "./editorial-lookbook.module.css";
export function EditorialLookbook({ archive = false }: { archive?: boolean }) {
  const [filter, setFilter] = useState("All"), [position, setPosition] = useState({ first: true, last: false });
  const track = useRef<HTMLDivElement>(null);
  const approved = communityLooks.filter(entry => entry.approved && entry.permissionConfirmed);
  const isCommunity = !archive && approved.length > 0, entries = isCommunity ? approved : editorialLooks;
  const shown = filter === "All" ? entries : entries.filter(entry => entry.edit === filter);
  useEffect(() => {
    const element = track.current;
    if (!element || archive) return;
    const update = () => setPosition({ first: element.scrollLeft < 2, last: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(element); element.addEventListener("scroll", update, { passive: true }); update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [archive, filter]);
  function move(direction: number) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({ left: direction * (element.querySelector("article")?.getBoundingClientRect().width ?? element.clientWidth) + direction * 20, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <section className={styles.section} aria-labelledby={archive ? "lookbook-archive-title" : "hidi-lookbook-title"} data-neutral-surface data-section="lookbook">
    <div className={styles.header}><div><p className={styles.eyebrow}>{isCommunity ? "THE HIDI COMMUNITY" : "THE HIDI JOURNAL"}</p>
      {archive ? <h1 id="lookbook-archive-title">The HIDI lookbook.</h1> : <h2 id="hidi-lookbook-title">{isCommunity ? "Seen in HIDI." : "Life, styled in HIDI."}</h2>}
      <p className={styles.caption}>{isCommunity ? "Real styling, shared with permission." : "HIDI editorial photography. Inspiration for your own way of wearing it."}</p></div>
      {!archive && <div className={styles.controls}><button type="button" onClick={() => move(-1)} disabled={position.first} aria-label="Previous look"><ArrowLeft size={18} aria-hidden="true" /></button><button type="button" onClick={() => move(1)} disabled={position.last} aria-label="Next look"><ArrowRight size={18} aria-hidden="true" /></button></div>}
    </div>
    {archive && <div className={styles.filters} role="group" aria-label="Filter lookbook">{["All", "Work", "Everyday", "Occasion"].map(value => <button type="button" key={value} aria-pressed={value === filter} onClick={() => setFilter(value)}>{value}</button>)}</div>}
    <div ref={track} className={archive ? styles.grid : styles.track} aria-label={isCommunity ? "Customer styling photographs" : "Editorial lookbook"} tabIndex={archive ? undefined : 0}>
      {shown.map(entry => <article key={entry.id} className={styles.look}><Link href={entry.href}><span className={styles.image}><CatalogImage src={entry.image} alt={entry.alt} sizes={archive ? "(max-width: 760px) 50vw, 33vw" : "(max-width: 760px) 76vw, 30vw"} /></span><span className={styles.edit}>{entry.edit}</span><h3>{entry.title}</h3>{"credit" in entry && <span className={styles.credit}>{String(entry.credit)}</span>}</Link></article>)}
    </div>
    <div className={styles.bottom}><p>{isCommunity ? "Every story is shared with its creator’s permission." : "Seen in HIDI — your story belongs here. Share your look with our team to be considered."}</p><Link href={archive ? "/contact" : "/lookbook"}>{archive ? "Share your HIDI look" : "Explore the lookbook"}<ArrowRight size={14} aria-hidden="true" /></Link></div>
  </section>;
}
