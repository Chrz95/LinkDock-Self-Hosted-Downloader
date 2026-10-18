import { PAGE_INFO, type WorkspaceNavigationProps } from '../../app/navigation';
import { Icon } from '../ui/Icon';

/**
 * Shares one route inventory between desktop and phone navigation.
 * @param {WorkspaceNavigationProps} props - Active route.
 * @param {WorkspacePage} props.page - Current workspace page.
 * @returns {JSX.Element} Desktop page links with an announced selected state.
 */
export function WorkspaceNavigation({ page }: WorkspaceNavigationProps) {
  return (
    <nav aria-label="Workspace">
      {Object.entries(PAGE_INFO).map(([id, item]) => (
        <a
          key={id}
          href={item.href}
          className={id === page ? 'nav-item selected' : 'nav-item'}
          aria-current={id === page ? 'page' : undefined}
        >
          <Icon name={item.icon} />
          {item.label}
        </a>
      ))}
    </nav>
  );
}
