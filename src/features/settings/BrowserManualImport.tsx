import { BROWSER_ACCESS } from '../../../shared/browserAccess';
import type { useBrowserAccess } from './useBrowserAccess';

/** Keeps optional file import and browser identity separate from the companion flow.
 * @param {object} props - Private import controls.
 * @returns {JSX.Element} Advanced manual cookie input.
 */
export function BrowserManualImport({
  access,
  userAgent,
  setUserAgent,
}: {
  access: ReturnType<typeof useBrowserAccess>;
  userAgent: string;
  setUserAgent: (value: string) => void;
}) {
  return (
    <div>
      <label>
        Browser User-Agent · optional
        <input
          type="text"
          value={userAgent}
          maxLength={BROWSER_ACCESS.maximumUserAgent}
          autoComplete="off"
          onChange={(event) => setUserAgent(event.target.value)}
        />
      </label>
      <label>
        Import site cookies.txt
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={(event) => {
            const [selected] = event.target.files ?? [];
            event.target.value = '';
            if (selected) {
              void access.importFile(selected, userAgent);
            }
          }}
        />
      </label>
      <p className="policy-footnote">
        Import only the source’s cookies. Other sites stay saved. Send cookies only to your trusted station over HTTPS.
      </p>
    </div>
  );
}
