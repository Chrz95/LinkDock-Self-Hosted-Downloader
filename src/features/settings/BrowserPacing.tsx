import { useState } from 'react';
import { BROWSER_ACCESS, BROWSER_ACTION } from '../../../shared/browserAccess';
import type { useBrowserAccess } from './useBrowserAccess';
interface BrowserPacingProps {
  access: ReturnType<typeof useBrowserAccess>;
}
/**
 * Saves a bounded extractor request delay independently of imported browser credentials.
 * @param {BrowserPacingProps} props - Current session controls.
 * @param {ReturnType<typeof useBrowserAccess>} props.access - Metadata and fixed action handler.
 * @returns {JSX.Element} Pacing preferences with seconds labeled explicitly.
 */
export function BrowserPacing({ access }: BrowserPacingProps) {
  const [delay, setDelay] = useState<number | null>(null);
  return (
    <div className="browser-pacing">
      <label>
        Video request delay · seconds
        <input
          type="number"
          min={0}
          max={BROWSER_ACCESS.maximumDelaySeconds}
          step={1}
          value={delay ?? access.snapshot?.delaySeconds ?? 0}
          onChange={(event) => setDelay(event.target.valueAsNumber)}
        />
      </label>
      <button
        type="button"
        className="primary-button"
        onClick={() =>
          void access.command(BROWSER_ACTION.settings, {
            delaySeconds: delay ?? access.snapshot?.delaySeconds ?? 0,
          })
        }
      >
        Save request delay
      </button>
    </div>
  );
}
