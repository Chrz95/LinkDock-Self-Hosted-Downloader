import { useState } from 'react';
import { DOWNLOAD_STATUS, type DownloadJob } from '../../../../../shared/contracts';
import { JOB_OPTIONS } from '../../../../../shared/jobOptions';
import { SOURCE_TYPE, VIDEO_QUALITY, mediaQualityLabel, type DownloadQuality } from '../../../../../shared/sources';
import { MediaQualityOptions } from '../composer/MediaQualityOptions';
import { useJobOption } from './useJobOption';
interface MediaVersionProps {
  job: DownloadJob;
}
/**
 * Queues a new source representation while keeping the original record and any partial/published bytes intact.
 * @param {MediaVersionProps} props - Existing video source.
 * @param {DownloadJob} props.job - Source link and retained requested representation.
 * @returns {JSX.Element | null} Explicit additional-version form for video-source jobs.
 */
export function MediaVersion({ job }: MediaVersionProps) {
  const [quality, setQuality] = useState<DownloadQuality>(job.quality ?? VIDEO_QUALITY.balanced);
  const option = useJobOption(job.id);
  if (job.sourceType !== SOURCE_TYPE.video) {
    return null;
  }
  const duplicate =
    quality === (job.quality ?? VIDEO_QUALITY.balanced) &&
    job.status !== DOWNLOAD_STATUS.failed &&
    job.status !== DOWNLOAD_STATUS.cancelled;
  return (
    <details className="organization-editor media-version">
      <summary>Download another version</summary>
      <p>Current request: {mediaQualityLabel(job.quality)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void option.save(
            JOB_OPTIONS.mediaCopy,
            { quality },
            'New version queued from the original source. Existing download retained.',
          );
        }}
      >
        <fieldset disabled={option.busy}>
          <legend className="visually-hidden">New video or audio version</legend>
          <MediaQualityOptions
            quality={quality}
            isDisabled={option.busy}
            onChange={setQuality}
          />
          <button
            type="submit"
            disabled={duplicate}
          >
            {option.busy ? 'Queuing…' : 'Queue this version'}
          </button>
        </fieldset>
      </form>
      <p>
        Downloads again from the original site using the current global completion folder and station settings. Existing
        partial files, saved files and collection labels stay with the original job. Matching versions already queued or
        saved are blocked.
      </p>
      {duplicate && <p>Choose a different quality or output format to add another version.</p>}
      {option.message && <output className="organization-saved">{option.message}</output>}
      {option.error && (
        <p
          className="form-error"
          role="alert"
        >
          {option.error}
        </p>
      )}
    </details>
  );
}
