import { useState, type FormEvent } from 'react';
import { BULK_ACTION, validateBulkLibrary, mergeBulkOrganization, type TagMode } from '../../../../shared/bulkLibrary';
import type { BulkLibraryState } from './useBulkLibrary';

/**
 * Builds explicit partial edits, preserving omitted fields and validating every proposed merged label set.
 * @param {BulkLibraryState} selection - Selected jobs and authenticated persistence.
 * @returns {object} Controlled optional folder and tag changes.
 */
export function useBulkOrganization(selection: BulkLibraryState) {
  const [changeFolder, setChangeFolder] = useState(false);
  const [folder, setFolder] = useState('');
  const [tagMode, setTagMode] = useState<TagMode | ''>('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  /**
   * Preflights the entire selection before sending one organization transaction.
   * @param {FormEvent<HTMLFormElement>} event - Ordinary form submission.
   * @returns {Promise<void>} Validated save or inline field error.
   */
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    try {
      const edit = validateBulkLibrary({
        action: BULK_ACTION.organize,
        ids: selection.selectedJobs.map((job) => job.id),
        ...(changeFolder ? { folder } : {}),
        ...(tagMode
          ? {
              tagMode,
              tags: tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            }
          : {}),
      });
      if (edit.action === BULK_ACTION.organize) {
        selection.selectedJobs.forEach((job) => mergeBulkOrganization(job.library, edit));
        await selection.organize(edit);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Check the proposed labels.');
    }
  }
  return { changeFolder, setChangeFolder, folder, setFolder, tagMode, setTagMode, tags, setTags, error, save };
}
/** Typed field contract shared with the compact editor. */
export type BulkOrganizationDraft = ReturnType<typeof useBulkOrganization>;
