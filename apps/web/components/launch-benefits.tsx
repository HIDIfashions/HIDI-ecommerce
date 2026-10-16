"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BadgePercent, Coins, Gift, X } from "lucide-react";
import Link from "next/link";
import styles from "./launch-benefits.module.css";

type OfferKey = "rewards" | "rupeeDress" | "inaugural";

const offers = [
  {
    key: "rewards" as const,
    icon: Coins,
    eyebrow: "HIDI REWARDS",
    title: "₹2 back for every ₹100 you spend.",
    mobileTitle: "₹2 back / ₹100",
    short: "Rewards become eligible after the applicable return window closes.",
    terms: [
      "Earn ₹2 in HIDI Rewards for every complete ₹100 of eligible merchandise spend.",
      "Rewards become eligible after the 7-day return window closes and the order remains eligible.",
      "Cancelled, returned or refunded merchandise value does not earn rewards.",
      "HIDI Rewards are store credit, are non-transferable and are subject to wallet availability and HIDI reward terms.",
    ],
  },
  {
    key: "rupeeDress" as const,
    icon: Gift,
    eyebrow: "₹1 EXTRA DRESS",
    title: "Shop ₹3,999+ and unlock another eligible dress for ₹1.",
    mobileTitle: "₹1 dress on ₹3,999+",
    short: "A launch benefit on qualifying orders and selected styles.",
    terms: [
      "The qualifying purchase value shown at checkout must be ₹3,999 or more.",
      "One eligible promotional dress may be selected for ₹1 per qualifying order, subject to stock.",
      "The ₹1 benefit applies only to products identified as eligible for this launch promotion.",
      "If an order is changed, cancelled or returned, eligibility will be recalculated using the final qualifying purchase value.",
    ],
  },
  {
    key: "inaugural" as const,
    icon: BadgePercent,
    eyebrow: "INAUGURAL OFFER",
    title: "Flat 15% off eligible launch purchases.",
    mobileTitle: "Flat 15% off",
    short: "A limited-period welcome benefit for the HIDI launch.",
    terms: [
      "Flat 15% applies only to eligible launch merchandise and qualifying orders.",
      "The discount is calculated on eligible merchandise value shown at checkout.",
      "The ₹1 dress privilege and the alternative 15% offer are not combined. Final duration and exclusions require publication before launch.",
      "HIDI may withdraw or revise a launch promotion before purchase; confirmed paid orders keep the offer applied at checkout.",
    ],
  },
] as const;

export function LaunchBenefits() {
  const [active, setActive] = useState<OfferKey | null>(null);
  const selected = offers.find((offer) => offer.key === active) ?? null;
  const SelectedIcon = selected?.icon ?? null;

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  return (
    <>
      <section className={styles.section} aria-labelledby="hidi-launch-benefits">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>HIDI LAUNCH BENEFITS</p>
          <h2 id="hidi-launch-benefits">More value every time you choose HIDI.</h2>
          <p>
            Celebrate our launch with rewards and limited-period offers designed
            to make your first HIDI wardrobe edit even more rewarding.
          </p>
          <Link href="/collections/all" className={styles.shopLink}>
            Shop the launch <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className={styles.grid}>
          {offers.map(({ key, icon: Icon, eyebrow, title, mobileTitle, short }) => (
            <article className={styles.card} key={key}>
              <span className={styles.icon}><Icon size={23} strokeWidth={1.5} /></span>
              <p className={styles.cardEyebrow}>{eyebrow}</p>
              <strong className={styles.desktopTitle}>{title}</strong>
              <strong className={styles.mobileTitle}>{mobileTitle}</strong>
              <span className={styles.short}>{short}</span>
              <button type="button" className={styles.knowMore} onClick={() => setActive(key)}>
                Know more <ArrowRight size={13} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>

      {selected && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActive(null);
          }}
        >
          <section className={styles.modal} role="dialog" aria-modal="true" aria-label={selected.eyebrow + " terms and conditions"}>
            <button type="button" className={styles.close} onClick={() => setActive(null)} aria-label="Close terms and conditions">
              <X size={20} />
            </button>

            {SelectedIcon && <span className={styles.modalIcon}><SelectedIcon size={24} strokeWidth={1.5} /></span>}
            <p className={styles.modalEyebrow}>{selected.eyebrow}</p>
            <h3>{selected.title}</h3>
            <p className={styles.modalIntro}>Terms & conditions</p>

            <ol className={styles.terms}>
              {selected.terms.map((term) => <li key={term}>{term}</li>)}
            </ol>

            <p className={styles.note}>
              Final eligibility is confirmed at checkout. HIDI will show any product-specific exclusions before payment.
            </p>

            <div className={styles.modalActions}>
              <button type="button" onClick={() => setActive(null)}>Close</button>
              <Link href="/collections/all">Shop now <ArrowRight size={13} /></Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
