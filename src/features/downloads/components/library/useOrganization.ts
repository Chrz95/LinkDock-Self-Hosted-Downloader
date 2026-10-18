import { useState, type SubmitEvent } from 'react';
import type { DownloadJob } from '../../../../../shared/contracts';
import { validateLibraryMetadata, type OrganizeDownload } from '../../../../../shared/library';

/**
 * Keeps label drafts through progress polling and exposes failed saves without losing edits.
 * @param {DownloadJob} job - Current persisted job and metadata.
 * @param {OrganizeDownload} onSave - Authenticated persistence callback.
 * @returns {object} Draft fields and explicit save/reset controls.
 */
export function useOrganization(job: DownloadJob, onSave: OrganizeDownload) {
  const folderValue = job.library?.folder ?? '';
  const tagsValue = job.library?.tags.join(', ') ?? '';
  const [draft, setDraft] = useState({ folder: folderValue, tags: tagsValue });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [message, setMessage] = useState('');
  const folder = isDirty ? draft.folder : folderValue;
  const tags = isDirty ? draft.tags : tagsValue;
  /** Resets this draft to the latest observed station labels. */
  function reset(): void {
    setIsDirty(false);
    setErrorMessage('');
    setMessage('');
  }
  /**
   * Saves the whole label edit together and leaves existing labels intact on failure.
   * @param {SubmitEvent<HTMLFormElement>} event - Explicit form submission.
   * @returns {Promise<void>} Persisted labels or visible error.
   */
  async function save(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');
    setMessage('');
    try {
      const metadata = validateLibraryMetadata({
        folder,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      await onSave(job.id, metadata);
      setIsDirty(false);
      setMessage('Labels saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Labels could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }
  return {
    folder,
    tags,
    isDirty,
    isSaving,
    errorMessage,
    message,
    save,
    reset,
    changeFolder: (value: string) => {
      setDraft({ folder: value, tags });
      setIsDirty(true);
      setMessage('');
    },
    changeTags: (value: string) => {
      setDraft({ folder, tags: value });
      setIsDirty(true);
      setMessage('');
    },
  };
}
