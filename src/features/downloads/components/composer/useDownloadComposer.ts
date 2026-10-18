import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { SOURCE_TYPE, VIDEO_QUALITY } from '../../../../../shared/sources';
import type { SourceType, DownloadQuality } from '../../../../../shared/sources';
import { MAXIMUM_TORRENT_BYTES } from './composerConstants';
import type { AddDownloadProps } from './composer.types';
import { MAXIMUM_BATCH_LINKS, type BatchPreview } from '../../../../../shared/batch';
import { previewBatch } from '../../services/downloadApi';
import { readSharedDraft, clearSharedDraft } from '../../../mobile';

/**
 * Owns source selection and submission errors while keeping the visual composer small.
 * @param {AddDownloadProps} props - Queue callbacks.
 * @param {AddDownloadProps['onAdd']} props.onAdd - Enqueues a link with engine and quality options.
 * @param {AddDownloadProps['onUpload']} [props.onUpload] - Enqueues uploaded torrent metadata.
 * @param {AddDownloadProps['onBatch']} [props.onBatch] - Atomically submits reviewed batches.
 * @returns {object} Controlled form state and event handlers.
 */
export function useDownloadComposer({ onAdd, onUpload, onBatch }: AddDownloadProps) {
  const [sourceType, updateSourceType] = useState<SourceType>(SOURCE_TYPE.auto);
  const [quality, updateQuality] = useState<DownloadQuality>(VIDEO_QUALITY.balanced);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(readSharedDraft);
  const [review, setReview] = useState<BatchPreview | null>(null);
  const [message, setMessage] = useState('');
  const urls = draft
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  /**
   * Preserves rejected input so a source error never loses the submitted link.
   * @param {SubmitEvent<HTMLFormElement>} event - Composer form submission.
   * @returns {Promise<void>} Queue acceptance or inline error.
   */
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      if (!urls.length || urls.length > MAXIMUM_BATCH_LINKS) {
        throw new Error(`Paste between 1 and ${MAXIMUM_BATCH_LINKS} links, one per line.`);
      }
      if (urls.length > 1) {
        if (!onBatch) {
          throw new Error('Update the station to enable batch downloads.');
        }
        if (!review) {
          setReview(await previewBatch(urls, sourceType, quality));
          return;
        }
        const result = await onBatch(urls, sourceType, quality);
        setMessage(`${result.newCount} downloads added · ${result.duplicates.length} duplicates skipped`);
      } else {
        await onAdd(urls[0]!, sourceType, quality);
        setMessage('Download added to your station.');
      }
      setDraft('');
      setReview(null);
      clearSharedDraft();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not add the link.');
    } finally {
      setIsSubmitting(false);
    }
  }
  /**
   * Checks metadata size before sending a browser-selected torrent file.
   * @param {ChangeEvent<HTMLInputElement>} event - File input change.
   * @returns {Promise<void>} Accepted upload or actionable error.
   */
  async function handleTorrentUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const [file] = event.target.files ?? [];
    event.target.value = '';
    if (!file || !onUpload) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      if (file.size > MAXIMUM_TORRENT_BYTES || !file.name.toLowerCase().endsWith('.torrent')) {
        throw new Error('Choose a .torrent file no larger than 2 MiB.');
      }
      await onUpload(file);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload this torrent.');
    } finally {
      setIsSubmitting(false);
    }
  }
  /**
   * Invalidates a review when the owner edits links or engine choices.
   * @param {string} value - Updated draft.
   */
  function changeDraft(value: string): void {
    setDraft(value);
    setReview(null);
    setMessage('');
  }
  /**
   * Changes the engine without reusing a review for different source semantics.
   * @param {SourceType} value - Engine choice.
   */
  function setSourceType(value: SourceType): void {
    updateSourceType(value);
    if (value !== SOURCE_TYPE.auto && value !== SOURCE_TYPE.video) {
      updateQuality(VIDEO_QUALITY.balanced);
    }
    setReview(null);
  }
  /**
   * Changes resolution and invalidates previous duplicate matching.
   * @param {DownloadQuality} value - Resolution preference.
   */
  function setQuality(value: DownloadQuality): void {
    updateQuality(value);
    setReview(null);
  }
  const buttonLabel = isSubmitting
    ? 'Working…'
    : urls.length > 1
      ? review
        ? `Queue ${review.newCount} downloads`
        : `Review ${urls.length} links`
      : 'Add download';
  return {
    draft,
    changeDraft,
    review,
    message,
    buttonLabel,
    canSubmit: !review || review.newCount > 0,
    sourceType,
    setSourceType,
    quality,
    setQuality,
    isSubmitting,
    errorMessage,
    fileInput,
    handleSubmit,
    handleTorrentUpload,
  };
}
