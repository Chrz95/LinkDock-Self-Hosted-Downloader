import type { EngineHealth } from '../../../shared/health';

/** Engine checks are local command probes, not provider tests. */
interface EngineChecksProps {
  engines: EngineHealth[];
}
/**
 * Displays real versions, bounded failure reasons and timestamps without raw engine errors.
 * @param {EngineChecksProps} props - Cached engine checks.
 * @param {EngineHealth[]} props.engines - Per-engine availability and action guidance.
 * @returns {JSX.Element} Responsive engine status list.
 */
export function EngineChecks({ engines }: EngineChecksProps) {
  return (
    <ul className="engine-health">
      {engines.map((engine) => (
        <li key={engine.id}>
          <div className="engine-heading">
            <h4>{engine.label}</h4>
            <span className={`engine-state ${engine.state}`}>{engine.state}</span>
          </div>
          {engine.version && <p className="engine-version">{engine.version}</p>}
          <p>{engine.detail}</p>
          <small>
            Checked <time dateTime={engine.checkedAt}>{new Date(engine.checkedAt).toLocaleTimeString()}</time>
          </small>
        </li>
      ))}
    </ul>
  );
}
