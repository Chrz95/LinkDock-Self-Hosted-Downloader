import { SOURCE_TYPE } from '../../../../shared/sources';
import { Icon } from '../../../components/ui/Icon';
import { SourceSelector } from './composer/SourceSelector';
import { ComposerOptions } from './composer/ComposerOptions';
import { useDownloadComposer } from './composer/useDownloadComposer';
import type { AddDownloadProps } from './composer/composer.types';
import { LinkInput } from './composer/LinkInput';
import { BatchReview } from './composer/BatchReview';
import { PAGE_INFO } from '../../../app/navigation';

/**
 * Composes a multi-source download request with explicit quality and metadata-upload controls.
 * @param {AddDownloadProps} props - Queue behavior.
 * @param {AddDownloadProps['onAdd']} props.onAdd - Submits a link and its options.
 * @param {AddDownloadProps['onUpload']} [props.onUpload] - Submits a local torrent file.
 * @param {AddDownloadProps['onBatch']} [props.onBatch] - Submits reviewed batches.
 * @returns {JSX.Element} Source-aware download composer.
 */
export function AddDownload({ onAdd, onUpload, onBatch }: AddDownloadProps) {
  const composer = useDownloadComposer({ onAdd, onUpload, onBatch });
  return (
    <section
      id="add-download"
      className="composer"
      aria-labelledby="composer-title"
    >
      <div className="composer-heading">
        <span className="composer-icon">
          <Icon name="plus" />
        </span>
        <div>
          <span className="composer-overline">START SOMETHING GOOD</span>
          <h2 id="composer-title">What are we saving today?</h2>
        </div>
        <span className="composer-tag">YOUR STATION. YOUR FILES.</span>
      </div>
      <fieldset
        className="composer-fields"
        disabled={composer.isSubmitting}
      >
        <legend className="visually-hidden">Add downloads</legend>
        <SourceSelector
          selectedSource={composer.sourceType}
          onSourceChange={composer.setSourceType}
        />
        {composer.sourceType === SOURCE_TYPE.deviantart && (
          <p className="composer-note">
            Paste artwork, a story/journal, a gallery or an artist URL. Stories save as text; media uses available
            originals.
          </p>
        )}
        <form onSubmit={(event) => void composer.handleSubmit(event)}>
          <LinkInput
            draft={composer.draft}
            isDisabled={composer.isSubmitting}
            buttonLabel={composer.buttonLabel}
            canSubmit={composer.canSubmit}
            onChange={composer.changeDraft}
          />
          <BatchReview
            review={composer.review}
            message={composer.message}
          />
          {composer.errorMessage && (
            <p
              className="form-error"
              role="alert"
            >
              {composer.errorMessage}
            </p>
          )}
          <ComposerOptions
            quality={composer.quality}
            isDisabled={composer.isSubmitting}
            supportsMedia={composer.sourceType === SOURCE_TYPE.video || composer.sourceType === SOURCE_TYPE.auto}
            canUpload={Boolean(onUpload)}
            fileInput={composer.fileInput}
            onQualityChange={composer.setQuality}
            onTorrentUpload={composer.handleTorrentUpload}
          />
          <p
            className="composer-note"
            id="download-help"
          >
            Videos &amp; audio · Instagram · DeviantArt galleries &amp; stories · Torrents &amp; magnets · Direct files
            {' · '}
            <a href={PAGE_INFO.settings.href}>More sites &amp; browser verification</a>
          </p>
        </form>
      </fieldset>
    </section>
  );
}
