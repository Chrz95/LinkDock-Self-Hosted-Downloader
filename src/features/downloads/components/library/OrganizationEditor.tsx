import type { DownloadJob } from '../../../../../shared/contracts';
import { LIBRARY_LIMIT, type OrganizeDownload } from '../../../../../shared/library';
import { useOrganization } from './useOrganization';

/** Organization is available on every retained job without changing physical files. */
interface OrganizationEditorProps {
  job: DownloadJob;
  onSave: OrganizeDownload;
}
/**
 * Edits a logical folder and bounded comma-separated tags using ordinary mobile form controls.
 * @param {OrganizationEditorProps} props - Job and persistence behavior.
 * @param {DownloadJob} props.job - Current record.
 * @param {OrganizeDownload} props.onSave - Atomic label replacement.
 * @returns {JSX.Element} Collapsible labels editor.
 */
export function OrganizationEditor({ job, onSave }: OrganizationEditorProps) {
  const draft = useOrganization(job, onSave);
  return (
    <details className="organization-editor">
      <summary aria-label={`Organize ${job.filename}`}>Organize download</summary>
      <form onSubmit={(event) => void draft.save(event)}>
        <fieldset disabled={draft.isSaving}>
          <legend className="visually-hidden">Organization for {job.filename}</legend>
          <label>
            Folder
            <input
              type="text"
              value={draft.folder}
              maxLength={LIBRARY_LIMIT.folderCharacters}
              list="library-folder-options"
              autoComplete="off"
              placeholder="Unfiled"
              onChange={(event) => draft.changeFolder(event.target.value)}
            />
          </label>
          <label>
            Tags
            <input
              type="text"
              value={draft.tags}
              maxLength={LIBRARY_LIMIT.inputCharacters}
              autoComplete="off"
              placeholder="Travel, inspiration"
              onChange={(event) => draft.changeTags(event.target.value)}
            />
          </label>
          <p>One folder · up to {LIBRARY_LIMIT.tags} tags, separated by commas. Leave fields empty to clear labels.</p>
          <div className="organization-actions">
            <button
              type="submit"
              disabled={!draft.isDirty}
            >
              {draft.isSaving ? 'Saving…' : 'Save labels'}
            </button>
            <button
              type="button"
              disabled={!draft.isDirty}
              onClick={draft.reset}
            >
              Reset labels
            </button>
          </div>
        </fieldset>
        {draft.message && <output className="policy-saved">{draft.message}</output>}
        {draft.errorMessage && (
          <p
            className="form-error"
            role="alert"
          >
            {draft.errorMessage}
          </p>
        )}
      </form>
    </details>
  );
}
