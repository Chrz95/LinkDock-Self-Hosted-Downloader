import { Icon } from '../ui/Icon';
import { ThemeToggle } from '../../features/theme/ThemeToggle';

/** Header controls independent of queue presentation. */
interface HeaderProps {
  isConnected: boolean;
  onLock: () => Promise<void>;
}
/**
 * Shows connection state and a browser-only lock action.
 * @param {HeaderProps} props - Session controls.
 * @param {boolean} props.isConnected - Whether the latest request succeeded.
 * @param {() => Promise<void>} props.onLock - Clears this browser session.
 * @returns {JSX.Element} Workspace header.
 */
export function Header({ isConnected, onLock }: HeaderProps) {
  return (
    <header className="topbar">
      <span className="breadcrumb">
        Your workspace <span>/</span> <strong>Overview</strong>
      </span>
      <div className="topbar-actions">
        <ThemeToggle />
        <span className="connection">
          <span className={isConnected ? 'status-dot' : 'status-dot offline'} />
          {isConnected ? 'Station connected' : 'Connecting…'}
        </span>
        <button
          className="lock-button"
          type="button"
          onClick={() => void onLock()}
          aria-label="Lock this browser"
        >
          <Icon name="lock" />
        </button>
      </div>
    </header>
  );
}
