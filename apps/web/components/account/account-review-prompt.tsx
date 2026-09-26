"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Star, X } from "lucide-react";
import { CatalogImage } from "@/components/catalog-image";
import { BROWSER_API_URL } from "@/lib/browser-api";
import { getAccessToken } from "@/lib/supabase-auth";
import type { AccountOrderItem } from "@/lib/account-data";
import styles from "./account-review-prompt.module.css";

type Props = {
  orderNumber: string;
  item: Pick<AccountOrderItem, "id" | "productName" | "slug" | "image" | "size" | "color" | "quantity" | "review">;
  onSubmitted?: () => Promise<void> | void;
};

export function AccountReviewPrompt({ orderNumber, item, onSubmitted }: Props) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(item.review?.rating ?? 5);
  const [title, setTitle] = useState(item.review?.title ?? "");
  const [body, setBody] = useState(item.review?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, busy]);

  function start(nextRating?: number) {
    if (item.review) return;
    if (nextRating) setRating(nextRating);
    setError("");
    setOpen(true);
  }

  async function submit() {
    if (item.review || busy) return;
    const reviewBody = body.trim();
    if (reviewBody.length < 10) {
      setError("Tell us a little more — your review should be at least 10 characters.");
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setError("Please sign in again before publishing your review.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${BROWSER_API_URL}/account/orders/${encodeURIComponent(orderNumber)}/items/${encodeURIComponent(item.id)}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rating, title, body: reviewBody }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message ?? "Unable to publish your review.");
      setOpen(false);
      await onSubmitted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to publish your review.");
    } finally {
      setBusy(false);
    }
  }

  if (item.review) {
    return (
      <div className={styles.completed}>
        <div>
          <span className={styles.completedLabel}><CheckCircle2 size={14} /> VERIFIED REVIEW</span>
          <div className={styles.completedStars} aria-label={`${item.review.rating} out of 5 stars`}>
            {"★".repeat(item.review.rating)}{"☆".repeat(5 - item.review.rating)}
          </div>
        </div>
        <div className={styles.completedCopy}>
          <strong>{item.review.title || "Your HIDI review"}</strong>
          <p>{item.review.body}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.prompt}>
        <div>
          <span>HOW DID THIS PIECE FEEL?</span>
          <strong>Your experience can help someone choose with confidence.</strong>
        </div>

        <div className={styles.promptActions}>
          <div className={styles.inlineStars} aria-label="Choose a rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => start(value)}
                aria-label={`Rate ${item.productName} ${value} star${value === 1 ? "" : "s"}`}
              >
                <Star size={19} strokeWidth={1.5} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" className={styles.writeButton} onClick={() => start()}>
            Write a review
          </button>
        </div>
      </div>

      {open && (
        <div
          className={styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`review-${item.id}-title`}>
            <button className={styles.close} type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close review">
              <X size={20} />
            </button>

            <div className={styles.product}>
              <div className={styles.thumb}>
                <CatalogImage src={item.image} alt={item.productName} sizes="88px" fallbackLabel={`HIDI / ${item.productName}`} />
              </div>
              <div>
                <p>VERIFIED PURCHASE</p>
                <h2 id={`review-${item.id}-title`}>{item.productName}</h2>
                <span>{item.color} · Size {item.size}{item.quantity > 1 ? ` · Qty ${item.quantity}` : ""}</span>
              </div>
            </div>

            <div className={styles.form}>
              <fieldset>
                <legend>How did this piece feel?</legend>
                <div className={styles.rating}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={value <= rating ? styles.starActive : styles.star}
                      onClick={() => setRating(value)}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      aria-pressed={value === rating}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <small>{rating === 5 ? "Loved it" : rating === 4 ? "Really liked it" : rating === 3 ? "It was good" : rating === 2 ? "Could be better" : "Not for me"}</small>
              </fieldset>

              <label>
                A short title <span>optional</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  placeholder="Beautiful fit, lovely fabric…"
                />
              </label>

              <label>
                Your experience
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  placeholder="Tell us about the fit, fabric, colour and how the piece felt to wear."
                />
                <small>{body.trim().length}/2000</small>
              </label>

              <p className={styles.guidance}>Your review is published as a verified HIDI purchase. Please focus on the product and your genuine experience.</p>

              {error && <p className={styles.error} role="alert">{error}</p>}

              <button
                className={styles.submit}
                type="button"
                disabled={busy || body.trim().length < 10}
                onClick={() => void submit()}
              >
                {busy ? "Publishing…" : "Publish review"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
