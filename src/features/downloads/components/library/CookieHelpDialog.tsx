import { useEffect, useId, useRef } from 'react';
import type { DownloadJob } from '../../../../../shared/contracts';
import { PAGE_INFO } from '../../../../app/navigation';
import { CookieHelpGuide } from './CookieHelpGuide';

/** Presents an accessible native modal with focus containment, Escape dismissal and focus restoration.
 * @param {object} props - Failed job and dismiss action.
 * @returns {JSX.Element} Mobile-compatible cookie recovery popup.
 */
export function CookieHelpDialog({ job, onClose }: { job: DownloadJob; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    if (element && !element.open) {
      element.showModal();
    }
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="cookie-help-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">BROWSER SESSION</p>
          <h2 id={title}>Connect your account to continue</h2>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <p className="cookie-help-filename">{job.filename}</p>
      <CookieHelpGuide job={job} />
      <footer>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Open original source
        </a>
        <a
          href={PAGE_INFO.library.href}
          onClick={onClose}
        >
          Go to Download library
        </a>
        <a
          href={PAGE_INFO.settings.href}
          onClick={onClose}
        >
          Open source settings
        </a>
      </footer>
    </dialog>
  );
}
