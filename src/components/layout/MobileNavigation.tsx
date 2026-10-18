import { Icon } from '../ui/Icon';
import { PAGE_INFO, type WorkspaceNavigationProps } from '../../app/navigation';

/**
 * Offers touch-sized page links without an overlay above the phone keyboard or download controls.
 * @param {WorkspaceNavigationProps} props - Active route.
 * @param {WorkspacePage} props.page - Current workspace page.
 * @returns {JSX.Element} Compact phone navigation.
 */
export function MobileNavigation({ page }: WorkspaceNavigationProps) {
  return (
    <nav
      className="mobile-navigation"
      aria-label="Mobile workspace"
    >
      {Object.entries(PAGE_INFO).map(([id, item]) => (
        <a
          key={id}
          href={item.href}
          aria-current={id === page ? 'page' : undefined}
        >
          <Icon name={item.icon} />
          {item.shortLabel}
        </a>
      ))}
    </nav>
  );
}
