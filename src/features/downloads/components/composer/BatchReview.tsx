import type { BatchPreview } from '../../../../../shared/batch';

/** Server review may become stale; the server always repeats validation before committing. */
interface BatchReviewProps {
  review: BatchPreview | null;
  message: string;
}
/**
 * Shows exactly what the owner is approving without starting transfers during review.
 * @param {BatchReviewProps} props - Review and submission feedback.
 * @param {BatchPreview | null} props.review - Validated counts and skipped links.
 * @param {string} props.message - Last accepted submission result.
 * @returns {JSX.Element | null} Batch review panel or completion feedback.
 */
export function BatchReview({ review, message }: BatchReviewProps) {
  if (!review && !message) {
    return null;
  }
  return (
    <div
      className="batch-review"
      aria-live="polite"
    >
      {message && <p>{message}</p>}
      {review && (
        <div>
          <p>
            {review.newCount} new downloads · {review.duplicates.length} duplicates skipped
          </p>
          <small>Nothing starts until you choose Queue. Links are validated again when submitted.</small>
          {review.duplicates.length > 0 && (
            <details>
              <summary>Review skipped duplicates</summary>
              <ul>
                {[...new Set(review.duplicates)].map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
