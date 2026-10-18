import { useEffect, useState } from 'react';
import { canPromptInstall, observeInstallation, promptInstallation, getMobileRegistration } from './serviceWorker';

/**
 * Offers native installation where available, with an ordinary browser-menu fallback elsewhere.
 * @returns {JSX.Element} Install controls and share-menu guidance.
 */
export function InstallApp() {
  const [canInstall, setCanInstall] = useState(canPromptInstall);
  const [errorMessage, setErrorMessage] = useState('');
  const isInstalled = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = observeInstallation(() => setCanInstall(canPromptInstall()));
    if (window.isSecureContext && 'serviceWorker' in navigator) {
      void getMobileRegistration().catch(() => {
        if (isMounted) {
          setErrorMessage('Mobile setup is unavailable. Reload when your station is reachable.');
        }
      });
    }
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);
  /** Shows the optional browser install prompt on an explicit click. @returns {Promise<void>} Prompt completed. */
  async function install(): Promise<void> {
    try {
      await promptInstallation();
    } catch {
      setErrorMessage('Use your browser menu to install LinkDock or try again later.');
    }
  }
  return (
    <section aria-labelledby="install-title">
      <h3 id="install-title">Your station. One tap away.</h3>
      <p className="policy-footnote">
        {isInstalled
          ? 'LinkDock is running as an installed app.'
          : window.isSecureContext
            ? 'Use Install app or Add to Home Screen in your browser menu.'
            : 'An HTTPS station address enables mobile installation. The website works here without installation.'}
      </p>
      {canInstall && !isInstalled && (
        <button
          className="primary-button"
          type="button"
          onClick={() => void install()}
        >
          Install LinkDock
        </button>
      )}
      <p className="policy-footnote">
        On supported devices, share a link from another app to LinkDock. It opens for review before downloading. Install
        and share-menu availability vary by browser.
      </p>
      {errorMessage && (
        <p
          className="form-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </section>
  );
}
