function buildPoints(samples, field) {
  const values = samples
    .map((sample) => ({ time: Number(sample.recordedAt ?? sample.updatedAt ?? 0), value: sample[field] === null || sample[field] === undefined || sample[field] === '' ? NaN : Number(sample[field]) }))
    .filter((item) => Number.isFinite(item.time) && item.time > 0 && Number.isFinite(item.value))
    .sort((a, b) => a.time - b.time)
    .slice(-24);

  if (values.length < 2) return { points: '', latest: values[values.length - 1]?.value, latestTime: values[values.length - 1]?.time, count: values.length };
  const min = Math.min(...values.map((item) => item.value));
  const max = Math.max(...values.map((item) => item.value));
  const range = max - min || 1;
  const points = values.map((item, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 55 - ((item.value - min) / range) * 42;
    return `${x},${y}`;
  }).join(' ');
  return { points, latest: values[values.length - 1].value, latestTime: values[values.length - 1].time, count: values.length };
}

export default function TrendCard({ title, field, unit, samples, digits = 1 }) {
  const graph = buildPoints(samples, field);
  return (
    <article className="trend-card">
      <div className="trend-card-header"><span>{title}</span><span className="trend-record-count">{graph.count} points</span></div>
      <div className="trend-value">{graph.latest === undefined ? '—' : graph.latest.toFixed(digits)} {graph.latest !== undefined && <small>{unit}</small>}</div>
      {graph.count >= 2 ? (
        <svg className="trend-svg" viewBox="0 0 100 65" preserveAspectRatio="none" role="img" aria-label={`${title} historical trend`}>
          <line x1="0" y1="57" x2="100" y2="57" className="trend-baseline" />
          <polyline points={graph.points} className="trend-line" />
        </svg>
      ) : (
        <div className="trend-empty">{graph.count === 1 ? 'One real reading received. A trend appears after another timestamped reading.' : 'Waiting for timestamped readings from the ESP32.'}</div>
      )}
      <p>{graph.count ? `${graph.count} real timestamped sample${graph.count === 1 ? '' : 's'} · latest ${new Date(graph.latestTime).toLocaleString()}` : 'No real samples yet'}</p>
    </article>
  );
}
