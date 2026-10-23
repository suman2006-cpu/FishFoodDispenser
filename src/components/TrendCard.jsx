function buildPoints(samples, field) {
  const values = samples
    .map((sample) => ({ time: Number(sample.recordedAt ?? sample.updatedAt ?? 0), value: Number(sample[field]) }))
    .filter((item) => Number.isFinite(item.value))
    .slice(-24);

  if (values.length < 2) return { points: '', latest: values[values.length - 1]?.value, count: values.length };
  const min = Math.min(...values.map((item) => item.value));
  const max = Math.max(...values.map((item) => item.value));
  const range = max - min || 1;
  const points = values.map((item, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 55 - ((item.value - min) / range) * 42;
    return `${x},${y}`;
  }).join(' ');
  return { points, latest: values[values.length - 1].value, count: values.length };
}

export default function TrendCard({ title, field, unit, samples, digits = 1 }) {
  const graph = buildPoints(samples, field);
  return (
    <article className="trend-card">
      <div className="trend-card-header"><span>{title}</span><span className="trend-record-count">{graph.count} points</span></div>
      <div className="trend-value">{graph.latest === undefined ? '—' : graph.latest.toFixed(digits)} <small>{unit}</small></div>
      {graph.count >= 2 ? (
        <svg className="trend-svg" viewBox="0 0 100 65" preserveAspectRatio="none" role="img" aria-label={`${title} historical trend`}>
          <line x1="0" y1="57" x2="100" y2="57" className="trend-baseline" />
          <polyline points={graph.points} className="trend-line" />
        </svg>
      ) : (
        <div className="trend-empty">Waiting for historical samples</div>
      )}
      <p>Latest available historical sample</p>
    </article>
  );
}
