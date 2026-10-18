import { useEffect, useRef, useState } from 'react';
import { API_PATH, DOWNLOAD_PATH } from '../../../../../shared/contracts';
import { beginNativeDownload, probeDelivery } from '../../services/fileDelivery';

/** Archives collect exactly one job's published files. */
interface ArchiveDownloadProps {
  jobId: string;
}
/**
 * Checks a ZIP request before delegating the streamed attachment to the native browser download manager.
 * @param {ArchiveDownloadProps} props - Completed collection identity.
 * @param {string} props.jobId - Owning job UUID.
 * @returns {JSX.Element} Explicit archive action and inline preparation feedback.
 */
export function ArchiveDownload({ jobId }: ArchiveDownloadProps) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  /** Prepares and requests one native download without buffering bytes. @returns {Promise<void>} Request initiated. */
  async function download(): Promise<void> {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setIsPreparing(true);
    setErrorMessage('');
    setMessage('');
    const url = `${API_PATH.downloads}/${jobId}${DOWNLOAD_PATH.archive}`;
    try {
      await probeDelivery(url, request.signal);
      if (!request.signal.aborted) {
        beginNativeDownload(url);
        setMessage('ZIP requested. Your browser manages the download and cancellation.');
      }
    } catch (error) {
      if (!request.signal.aborted) {
        setErrorMessage(error instanceof Error ? error.message : 'The archive could not be prepared. Try again.');
      }
    } finally {
      if (!request.signal.aborted) {
        setIsPreparing(false);
      }
    }
  }
  return (
    <div className="archive-download">
      <button
        type="button"
        disabled={isPreparing}
        onClick={() => void download()}
      >
        {isPreparing ? 'Checking saved files…' : 'Save all as ZIP'}
      </button>
      {message && <output>{message}</output>}
      {errorMessage && (
        <p
          className="form-error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
