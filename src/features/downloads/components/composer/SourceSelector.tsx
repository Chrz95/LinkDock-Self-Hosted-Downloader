import type { SourceType } from '../../../../../shared/sources';
import { Icon } from '../../../../components/ui/Icon';
import { SOURCE_OPTIONS } from './composerConstants';

/** Controlled source selector. */
interface SourceSelectorProps {
  selectedSource: SourceType;
  onSourceChange: (sourceType: SourceType) => void;
}
/**
 * Offers explicit engines while keeping a useful automatic default.
 * @param {SourceSelectorProps} props - Selection and change handler.
 * @param {SourceType} props.selectedSource - Active source mode.
 * @param {(sourceType: SourceType) => void} props.onSourceChange - Changes the requested engine.
 * @returns {JSX.Element} Accessible source button group.
 */
export function SourceSelector({ selectedSource, onSourceChange }: SourceSelectorProps) {
  return (
    <div
      className="source-selector"
      aria-label="Download source"
    >
      {SOURCE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selectedSource === option.value}
          onClick={() => onSourceChange(option.value)}
        >
          <Icon name={option.icon} />
          {option.label}
        </button>
      ))}
    </div>
  );
}
