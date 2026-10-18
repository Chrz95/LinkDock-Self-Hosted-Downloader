import { Icon } from '../../../../components/ui/Icon';

/** Empty filters need different guidance from a new collection. */
interface DownloadEmptyProps {
  hasFilters: boolean;
}
/**
 * Explains whether to clear filters or add a first source.
 * @param {DownloadEmptyProps} props - Current collection view.
 * @param {boolean} props.hasFilters - Whether the result is restricted.
 * @returns {JSX.Element} Quiet empty state.
 */
export function DownloadEmpty({ hasFilters }: DownloadEmptyProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="download" />
      </span>
      <h3>{hasFilters ? 'No matching downloads.' : 'Your next download starts here.'}</h3>
      <p>
        {hasFilters
          ? 'Try another search, folder or tag, or clear your filters.'
          : 'Drop in a video, post, magnet or file link. Your station takes it from here.'}
      </p>
    </div>
  );
}
