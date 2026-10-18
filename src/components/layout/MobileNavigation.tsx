import { Icon } from '../ui/Icon';

/**
 * Offers touch-sized section shortcuts without an overlay above the phone keyboard or download controls.
 * @returns {JSX.Element} Compact phone navigation.
 */
export function MobileNavigation() {
  return (
    <nav
      className="mobile-navigation"
      aria-label="Mobile workspace"
    >
      <a href="#main">
        <Icon name="grid" />
        Overview
      </a>
      <a href="#add-download">
        <Icon name="plus" />
        Add link
      </a>
      <a href="#downloads">
        <Icon name="download" />
        Library
      </a>
    </nav>
  );
}
