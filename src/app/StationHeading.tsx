import { Icon } from '../components/ui/Icon';

/**
 * Gives the station its visual introduction without mixing transfer behavior into presentation.
 * @returns {JSX.Element} Workspace heading.
 */
export function StationHeading() {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">
          <span className="tiny-line" />
          YOUR PRIVATE DOWNLOAD STUDIO
        </p>
        <h1>
          Everything worth keeping<span>.</span>
        </h1>
        <p>Videos, moments and files. Collected from everywhere. Kept right here.</p>
      </div>
      <span className="private-badge">
        <Icon name="lock" />
        LOCAL BY DESIGN
      </span>
    </div>
  );
}
