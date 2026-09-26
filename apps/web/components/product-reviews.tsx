import Link from "next/link";
import type { ApiProductReviews } from "@/lib/api";
import styles from "./product-reviews.module.css";

function reviewDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function ReviewInvitationGuidance() {
  return (
    <details className={styles.reviewGuidance}>
      <summary className={styles.reviewButton}>
        How to write a review <span className={styles.reviewToggle} aria-hidden="true">+</span>
      </summary>
      <div className={styles.guidanceContent}>
        <strong>Your purchase. Your honest experience.</strong>
        <p>Reviews are linked to delivered orders. Sign in to My HIDI and open Orders to review any eligible piece directly.</p>
        <p>If you received a HIDI review email, the private link in that message will continue to work as well.</p>
        <Link href="/account">View my orders <span aria-hidden="true">→</span></Link>
      </div>
    </details>
  );
}

export function ProductReviews({ data }: { data: ApiProductReviews }) {
  const rounded = Math.round(data.averageRating * 10) / 10;
  const hasReviews = data.reviewCount > 0;
  const verifiedCount = data.verifiedReviewCount ?? data.reviews.filter((review) => review.verifiedPurchase).length;
  const distribution = data.ratingDistribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  return (
    <section className={styles.section} id="reviews" aria-labelledby="product-reviews-heading">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CUSTOMER REVIEWS</p>
          <h2 id="product-reviews-heading">What HIDI customers say</h2>
        </div>
      </div>

      {hasReviews ? (
        <div className={styles.overview}>
          <div className={styles.summary}>
            <strong>{rounded.toFixed(1)}</strong>
            <div>
              <span className={styles.stars} role="img" aria-label={`${rounded.toFixed(1)} out of 5 stars`}>
                {"★".repeat(Math.round(data.averageRating)) + "☆".repeat(5 - Math.round(data.averageRating))}
              </span>
              <small>{data.reviewCount} review{data.reviewCount === 1 ? "" : "s"}</small>
              {verifiedCount > 0 && (
                <span className={styles.verifiedSummary}>
                  {verifiedCount} verified purchase{verifiedCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          <div className={styles.distribution} aria-label="Rating distribution">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = distribution[rating as 1 | 2 | 3 | 4 | 5] ?? 0;
              const percentage = data.reviewCount ? Math.round((count / data.reviewCount) * 100) : 0;
              return (
                <div className={styles.distributionRow} key={rating}>
                  <span>{rating} <span aria-hidden="true">★</span></span>
                  <div
                    className={styles.distributionTrack}
                    role="img"
                    aria-label={`${rating} star: ${count} review${count === 1 ? "" : "s"}, ${percentage}%`}
                  >
                    <span className={styles.distributionFill} style={{ width: `${percentage}%` }} />
                  </div>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>

          <p className={styles.trustNote}>
            Verified purchase means the review is matched to a delivered HIDI order. Ratings include all published customer reviews for this style.
          </p>
        </div>
      ) : (
        <div className={styles.empty}>
          <div>
            <strong>No reviews yet.</strong>
            <p>Your experience could help someone find their next favourite piece.</p>
          </div>
        </div>
      )}

      {data.reviews.length > 0 && (
        <div className={styles.grid}>
          {data.reviews.map((review) => (
            <article key={review.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.stars} role="img" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                {review.verifiedPurchase && <span className={styles.verified}>Verified purchase</span>}
              </div>
              {review.title && <h3>{review.title}</h3>}
              <p>{review.body}</p>
              <footer>
                <strong>{review.reviewerName}</strong>
                <span>{reviewDate(review.createdAt)}</span>
              </footer>
            </article>
          ))}
        </div>
      )}

      <ReviewInvitationGuidance />
    </section>
  );
}
