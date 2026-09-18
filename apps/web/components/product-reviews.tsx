import type { ApiProductReviews } from "@/lib/api";
import styles from "./product-reviews.module.css";

function reviewDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function ProductReviews({ data }: { data: ApiProductReviews }) {
  const rounded = Math.round(data.averageRating * 10) / 10;

  return (
    <section className={styles.section} id="reviews">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>CUSTOMER REVIEWS</p>
          <h2>What HIDI customers say</h2>
        </div>
        <div className={styles.summary}>
          <strong>{data.reviewCount ? rounded.toFixed(1) : "—"}</strong>
          <div>
            <span className={styles.stars}>
              {data.reviewCount ? "★".repeat(Math.round(data.averageRating)) + "☆".repeat(5 - Math.round(data.averageRating)) : "☆☆☆☆☆"}
            </span>
            <small>{data.reviewCount} verified review{data.reviewCount === 1 ? "" : "s"}</small>
          </div>
        </div>
      </div>

      {data.reviews.length ? (
        <div className={styles.grid}>
          {data.reviews.map((review) => (
            <article key={review.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.stars}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                <span className={styles.verified}>Verified purchase</span>
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
      ) : (
        <div className={styles.empty}>
          <strong>No reviews yet.</strong>
          <p>Verified customer reviews will appear here after delivered HIDI orders are reviewed.</p>
        </div>
      )}
    </section>
  );
}
