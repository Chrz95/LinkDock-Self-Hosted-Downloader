import type { DownloadJob } from '../../../../../shared/contracts';
import { SOURCE_TYPE } from '../../../../../shared/sources';
import { DEVIANTART_SECTIONS } from '../../../../../shared/deviantart';
interface CollectionScopeProps {
  job: DownloadJob;
}
/**
 * Shows the exact collection options retained across pauses, retries and station restarts.
 * @param {CollectionScopeProps} props - Library record.
 * @param {DownloadJob} props.job - Saved source scope without account credentials.
 * @returns {JSX.Element | null} Compact pinned choices or legacy guidance.
 */
export function CollectionScope({ job }: CollectionScopeProps) {
  if (job.sourceType !== SOURCE_TYPE.deviantart) {
    return null;
  }
  const scope = job.deviantart;
  return (
    <details className="collection-scope">
      <summary>Collection choices</summary>
      {scope ? (
        <dl>
          <dt>Artist profiles</dt>
          <dd>
            {DEVIANTART_SECTIONS.filter((section) => scope.include.includes(section.value))
              .map((section) => section.label)
              .join(', ')}
          </dd>
          <dt>Media</dt>
          <dd>{scope.original ? 'Prefer available originals' : 'Regular source media'}</dd>
          <dt>Writing</dt>
          <dd>
            {scope.stories === 'text'
              ? 'Plain text · TXT'
              : scope.stories === 'html'
                ? 'Formatted document · HTML'
                : 'Skip textual content'}
          </dd>
        </dl>
      ) : (
        <p>Older collection: source choices were not recorded.</p>
      )}
      <p>
        New downloads use saved Settings. These choices stay with this download when it resumes or restarts. A specific
        gallery, folder or post link keeps its own scope.
      </p>
    </details>
  );
}
