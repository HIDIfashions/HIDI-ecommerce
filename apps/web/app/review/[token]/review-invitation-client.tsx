"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./review.module.css";

type ReviewItem = {
  orderItemId: string;
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl?: string | null;
  size: string;
  color: string;
  quantity: number;
  reviewed: boolean;
  review?: {
    rating: number;
    title?: string | null;
    body: string;
    createdAt: string;
  } | null;
};

type Invitation = {
  orderNumber: string;
  reviewerName: string;
  completedAt?: string | null;
  items: ReviewItem[];
};

type Draft = {
  rating: number;
  title: string;
  body: string;
};

export function ReviewInvitationClient({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/invitations/${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to open this review invitation");
      setInvitation(body);
      setDrafts((current) => {
        const next = { ...current };
        for (const item of body.items ?? []) {
          if (!next[item.orderItemId]) next[item.orderItemId] = { rating: 5, title: "", body: "" };
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open this review invitation");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { rating: 5, title: "", body: "" }), ...patch },
    }));
  }

  async function submit(item: ReviewItem) {
    const draft = drafts[item.orderItemId] ?? { rating: 5, title: "", body: "" };
    setSending(item.orderItemId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/reviews/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderItemId: item.orderItemId,
          rating: draft.rating,
          title: draft.title,
          body: draft.body,
          reviewerName: invitation?.reviewerName,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? "Unable to submit review");
      setNotice(`Thank you — your review for ${item.productName} is now published.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit review");
    } finally {
      setSending(null);
    }
  }

  if (loading) {
    return <main className={styles.page}><section className={styles.card}>Opening your HIDI review invitation…</section></main>;
  }

  if (error && !invitation) {
    return <main className={styles.page}><section className={styles.card}><p className={styles.eyebrow}>HIDI</p><h1>Review link unavailable</h1><p>{error}</p></section></main>;
  }

  if (!invitation) return null;

  const remaining = invitation.items.filter((item) => !item.reviewed).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>HIDI · VERIFIED PURCHASE</p>
        <h1>How did your HIDI pieces feel?</h1>
        <p>Hi {invitation.reviewerName}. Your feedback on order <strong>{invitation.orderNumber}</strong> helps us improve fit, quality and the shopping experience.</p>
        <div className={styles.progress}>{remaining ? `${remaining} review${remaining === 1 ? "" : "s"} remaining` : "All reviews completed — thank you."}</div>
      </section>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.list}>
        {invitation.items.map((item) => {
          const draft = drafts[item.orderItemId] ?? { rating: 5, title: "", body: "" };
          return (
            <article className={styles.reviewCard} key={item.orderItemId}>
              <div className={styles.product}>
                {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} /> : <div className={styles.imageFallback}>HIDI</div>}
                <div>
                  <h2>{item.productName}</h2>
                  <p>{item.color} · Size {item.size}{item.quantity > 1 ? ` · Qty ${item.quantity}` : ""}</p>
                  <span>Verified purchase</span>
                </div>
              </div>

              {item.reviewed && item.review ? (
                <div className={styles.completed}>
                  <div className={styles.stars}>{"★".repeat(item.review.rating)}{"☆".repeat(5 - item.review.rating)}</div>
                  {item.review.title && <strong>{item.review.title}</strong>}
                  <p>{item.review.body}</p>
                  <span>Review submitted</span>
                </div>
              ) : (
                <div className={styles.form}>
                  <fieldset>
                    <legend>Your rating</legend>
                    <div className={styles.rating}>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          className={rating <= draft.rating ? styles.starActive : styles.star}
                          onClick={() => updateDraft(item.orderItemId, { rating })}
                          aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    Review title <span>optional</span>
                    <input
                      maxLength={120}
                      value={draft.title}
                      onChange={(event) => updateDraft(item.orderItemId, { title: event.target.value })}
                      placeholder="Beautiful fit, lovely fabric..."
                    />
                  </label>
                  <label>
                    Tell us about your experience
                    <textarea
                      minLength={10}
                      maxLength={2000}
                      rows={5}
                      value={draft.body}
                      onChange={(event) => updateDraft(item.orderItemId, { body: event.target.value })}
                      placeholder="How was the fit, fabric, colour and overall experience?"
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.submit}
                    disabled={sending === item.orderItemId || draft.body.trim().length < 10}
                    onClick={() => void submit(item)}
                  >
                    {sending === item.orderItemId ? "Publishing…" : "Publish review"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <p className={styles.footer}>Only products from this delivered HIDI order can be reviewed through this private link.</p>
    </main>
  );
}
