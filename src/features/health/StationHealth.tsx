import { useStationHealth } from './useStationHealth';
import { StationMetrics } from './StationMetrics';
import { EngineChecks } from './EngineChecks';
import { UtilityUpdates } from '../utilities/UtilityUpdates';
import { SystemMetrics } from './SystemMetrics';

/**
 * Adds lazy, authenticated operational visibility with ordinary mobile controls.
 * @returns {JSX.Element} Collapsible station-health panel.
 */
export function StationHealth() {
  const health = useStationHealth();
  return (
    <details
      className="station-settings station-health"
      onToggle={(event) => health.setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span>Station health</span>
        <span className="policy-summary">System, storage &amp; engines</span>
      </summary>
      {health.isOpen && (
        <div
          className="health-content"
          aria-busy={health.isLoading}
        >
          <div className="health-intro">
            <p>Current station measurements. Engine checks are cached for one minute and do not contact media sites.</p>
            <button
              type="button"
              disabled={health.isLoading}
              onClick={health.refresh}
            >
              {health.isLoading ? 'Checking station…' : 'Refresh status'}
            </button>
          </div>
          {health.errorMessage && (
            <p
              className="form-error"
              role="alert"
            >
              {health.errorMessage}
            </p>
          )}
          {health.snapshot && (
            <div>
              <p className="health-timestamp">
                Station snapshot:{' '}
                <time dateTime={health.snapshot.checkedAt}>{new Date(health.snapshot.checkedAt).toLocaleString()}</time>
              </p>
              <StationMetrics snapshot={health.snapshot} />
              <SystemMetrics system={health.snapshot.system} />
              <EngineChecks engines={health.snapshot.engines} />
              <UtilityUpdates />
              <p className="policy-footnote">
                Available means the local version command passed. Authentication, codecs, peer availability and actual
                downloads still need a source test. Process memory and station uptime describe LinkDock; storage
                describes its data filesystem. Utility updates have their own idle-time controls above.
              </p>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
