import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../lib/logger/logger';

/** Child content protected from unexpected render failures. */
interface ErrorBoundaryProps {
  children: ReactNode;
}
/** Whether a render error has been caught. */
interface ErrorBoundaryState {
  hasError: boolean;
}
/**
 * Keeps unexpected rendering failures recoverable without exposing internal details.
 * @param {ErrorBoundaryProps} props - Protected application content.
 * @param {ReactNode} props.children - Application tree to render.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state = { hasError: false };
  /**
   * Switches to a safe fallback after React catches a render error.
   * @returns {ErrorBoundaryState} Error state.
   */
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }
  /**
   * Reports the error class without leaking application data.
   * @param {Error} error - Caught render error.
   * @param {ErrorInfo} _information - React component trace.
   */
  override componentDidCatch(error: Error, _information: ErrorInfo): void {
    logger.error('Application render failed.', error);
  }
  /**
   * Renders either protected content or a reload action.
   * @returns {ReactNode} Content or accessible fallback.
   */
  override render(): ReactNode {
    const { children } = this.props;
    const { hasError } = this.state;
    if (!hasError) {
      return children;
    }
    return (
      <main className="unlock-shell">
        <div className="unlock-card">
          <h1>Something went adrift.</h1>
          <p>Your station’s transfers keep running. Reload to reconnect.</p>
          <a
            className="primary-button"
            href="/"
          >
            Reload LinkDock
          </a>
        </div>
      </main>
    );
  }
}
