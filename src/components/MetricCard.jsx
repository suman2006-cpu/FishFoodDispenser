export default function MetricCard({ sensor, telemetry }) {
  const raw = telemetry?.[sensor.field];
  const hasValue = raw !== undefined && raw !== null && raw !== '';
  const value = hasValue ? sensor.format(raw) : '—';

  return (
    <article className="metric-card">
      <div className="metric-topline">
        <span className="metric-icon" aria-hidden="true">{sensor.icon}</span>
        <span className={`data-dot ${hasValue ? 'data-dot--live' : ''}`} title={hasValue ? 'Value received' : 'Waiting for data'} />
      </div>
      <p className="metric-label">{sensor.label}</p>
      <div className="metric-reading">
        <span>{value}</span>
        {hasValue && sensor.unit && <span className="metric-unit">{sensor.unit}</span>}
      </div>
      <p className="metric-description">{sensor.description}</p>
    </article>
  );
}
