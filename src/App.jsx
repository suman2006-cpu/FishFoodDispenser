import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { onValue, push, ref, serverTimestamp, set } from 'firebase/database';
import { auth, db, DEVICE_ID, DEVICE_PATH, OFFLINE_TIMEOUT_MS, isFirebaseConfigured } from './firebase.js';
import { SENSOR_CARDS } from './config/sensors.js';
import MetricCard from './components/MetricCard.jsx';
import SignIn from './components/SignIn.jsx';
import TrendCard from './components/TrendCard.jsx';

function SetupNotice() {
  return (
    <main className="setup-shell">
      <section className="setup-card">
        <div className="brand-mark brand-mark--large">🐟</div>
        <p className="eyebrow">PROJECT STARTER READY</p>
        <h1>Connect your Firebase project</h1>
        <p className="muted">The dashboard files are prepared. Add your Firebase web-app settings to <code>.env.local</code> to continue.</p>
        <div className="setup-steps">
          <div><span>01</span><p>Create a Firebase project and Realtime Database.</p></div>
          <div><span>02</span><p>Enable Email/Password sign-in and create your owner account.</p></div>
          <div><span>03</span><p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in the web-app config.</p></div>
          <div><span>04</span><p>Publish the owner/device-specific database rules from <code>firebase/database.rules.json</code>.</p></div>
        </div>
        <p className="notice">No sample sensor values are shown as real data. The dashboard will wait for readings from the actual ESP32.</p>
      </section>
    </main>
  );
}

function formatAge(timestamp, now) {
  if (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0) return 'No cloud heartbeat received yet';
  const seconds = Math.max(0, Math.floor((now - Number(timestamp)) / 1000));
  if (seconds < 2) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.floor(minutes / 60)}h ago`;
}

function stateLabel(value) {
  const normalized = String(value || 'unknown').toLowerCase();
  if (normalized === 'dispensing') return { text: 'Dispensing', className: 'state--busy' };
  if (normalized === 'error' || normalized === 'fault') return { text: 'Needs attention', className: 'state--error' };
  if (normalized === 'idle' || normalized === 'ready' || normalized === 'complete' || normalized === 'completed') return { text: 'Ready', className: 'state--ready' };
  return { text: value ? String(value) : 'Waiting for device', className: 'state--unknown' };
}

function Dashboard({ user }) {
  const [telemetry, setTelemetry] = useState(null);
  const [lastSeen, setLastSeen] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [feedingEvents, setFeedingEvents] = useState([]);
  const [readingHistory, setReadingHistory] = useState([]);
  const [dataError, setDataError] = useState('');
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandNotice, setCommandNotice] = useState('');
  const [lastCommandId, setLastCommandId] = useState('');
  const [now, setNow] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!db) return undefined;
    const cleanups = [];
    const onError = (error) => setDataError(error?.message || 'Unable to read Firebase data. Check your rules and configuration.');

    cleanups.push(onValue(ref(db, `${DEVICE_PATH}/telemetry/latest`), (snapshot) => {
      setTelemetry(snapshot.val());
      setDataError('');
    }, onError));
    cleanups.push(onValue(ref(db, `${DEVICE_PATH}/presence/lastSeen`), (snapshot) => {
      const value = snapshot.val();
      setLastSeen(value === null ? null : Number(value));
    }, onError));
    cleanups.push(onValue(ref(db, `${DEVICE_PATH}/commands/latestResult`), (snapshot) => {
      setLatestResult(snapshot.val());
    }, onError));
    cleanups.push(onValue(ref(db, `${DEVICE_PATH}/history/readings`), (snapshot) => {
      const value = snapshot.val();
      const readings = value && typeof value === 'object'
        ? Object.entries(value).map(([id, reading]) => ({ id, ...reading }))
        : [];
      readings.sort((a, b) => Number(a.recordedAt || a.updatedAt || 0) - Number(b.recordedAt || b.updatedAt || 0));
      setReadingHistory(readings.slice(-24));
    }, onError));
    cleanups.push(onValue(ref(db, `${DEVICE_PATH}/history/feedingEvents`), (snapshot) => {
      const value = snapshot.val();
      const events = value && typeof value === 'object'
        ? Object.entries(value).map(([id, event]) => ({ id, ...event }))
        : [];
      events.sort((a, b) => Number(b.completedAt || b.recordedAt || 0) - Number(a.completedAt || a.recordedAt || 0));
      setFeedingEvents(events.slice(0, 5));
    }, onError));
    cleanups.push(onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => setServerOffset(Number(snapshot.val()) || 0), onError));

    return () => cleanups.forEach((unsubscribe) => unsubscribe());
  }, []);

  const correctedNow = now + serverOffset;
  const online = Number.isFinite(lastSeen) && lastSeen > 0 && correctedNow - lastSeen <= OFFLINE_TIMEOUT_MS;
  const feederState = stateLabel(telemetry?.feederState);
  const updatedAt = telemetry?.updatedAt;

  useEffect(() => {
    if (!lastCommandId || latestResult?.commandId !== lastCommandId) return;
    const resultStatus = String(latestResult.status || 'received');
    setCommandNotice(`ESP32 acknowledgement: ${resultStatus}${latestResult.message ? ` — ${latestResult.message}` : ''}`);
  }, [latestResult, lastCommandId]);

  const feedNow = useCallback(async () => {
    if (!db || !user || !online) return;
    if (String(telemetry?.feederState || '').toLowerCase() === 'dispensing') {
      setCommandNotice('A dispensing operation is already reported as active.');
      return;
    }
    const accepted = window.confirm('Send a dispense-food command to the ESP32?');
    if (!accepted) return;

    setCommandBusy(true);
    setCommandNotice('');
    try {
      const commandRef = push(ref(db, `${DEVICE_PATH}/commands/requests`));
      setLastCommandId(commandRef.key);
      await set(commandRef, {
        commandId: commandRef.key,
        action: 'DISPENSE',
        status: 'pending',
        requestedAt: serverTimestamp(),
        requestedBy: user.uid,
      });
      setCommandNotice(`Command ${commandRef.key} queued. Waiting for the ESP32 acknowledgement.`);
    } catch (error) {
      setCommandNotice(`Command failed: ${error?.message || 'check Firebase rules and connectivity'}`);
    } finally {
      setCommandBusy(false);
    }
  }, [user, online, telemetry?.feederState]);

  const resultTime = useMemo(() => {
    if (!latestResult?.completedAt) return '';
    return new Date(Number(latestResult.completedAt)).toLocaleString();
  }, [latestResult]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Smart Fish Feeder home"><span className="brand-mark">🐟</span><span><strong>FinPilot</strong><small>SMART FEEDING SYSTEM</small></span></a>
        <div className="topbar-actions">
          <span className={`connection-pill ${online ? 'connection-pill--online' : 'connection-pill--offline'}`}><span className="status-dot" />{online ? 'Device online' : lastSeen ? 'Device offline' : 'Waiting for device'}</span>
          <button className="quiet-button" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      <main id="top" className="main-content">
        <section className="hero-section">
          <div>
            <p className="eyebrow">YOUR AQUARIUM, AT A GLANCE</p>
            <h1>Smart Fish Feeder <span className="heading-accent">Dashboard</span></h1>
            <p className="hero-description">Monitor live sensor readings and manage feeding from anywhere.</p>
          </div>
          <div className="hero-device-card">
            <div className="device-orb">🐠</div>
            <div><span className="small-label">DEVICE ID</span><strong>{DEVICE_ID}</strong><span className="muted small-text">{formatAge(lastSeen, correctedNow)}</span></div>
          </div>
        </section>

        {dataError && <div className="alert alert--error" role="alert">Firebase error: {dataError}</div>}

        <section className="section-block">
          <div className="section-heading"><div><p className="eyebrow">LIVE TELEMETRY</p><h2>Sensor overview</h2></div><span className="live-label"><span className="live-wave" /> Live cloud data</span></div>
          <div className="metrics-grid">
            {SENSOR_CARDS.map((sensor) => <MetricCard key={sensor.id} sensor={sensor} telemetry={telemetry} />)}
          </div>
          <p className="data-footnote">Readings are populated only by the ESP32. Missing values are shown as unavailable instead of being replaced with demo data.</p>
        </section>

        <section className="section-block trends-section">
          <div className="section-heading"><div><p className="eyebrow">SENSOR HISTORY</p><h2>Recent trends</h2></div><span className="history-count">Up to 24 samples per chart</span></div>
          <div className="trend-grid">
            <TrendCard title="Temperature" field="temperatureC" unit="°C" samples={readingHistory} digits={1} />
            <TrendCard title="Water pH" field="ph" unit="pH" samples={readingHistory} digits={2} />
            <TrendCard title="Food weight" field="foodWeightG" unit="g" samples={readingHistory} digits={1} />
          </div>
          <p className="data-footnote">Charts remain empty until firmware writes timestamped records to <code>history/readings</code>. No demonstration data is generated.</p>
        </section>

        <section className="content-grid section-block">
          <article className="panel feeder-panel">
            <div className="panel-header"><div><p className="eyebrow">DISPENSER CONTROL</p><h2>Feeding station</h2></div><span className={`state-pill ${feederState.className}`}>{feederState.text}</span></div>
            <div className="feeder-illustration"><div className="feeder-halo" /><div className="feeder-icon">🐟</div><span className="feeder-caption">REMOTE CONTROL</span></div>
            <div className="status-message"><span className="message-icon">▤</span><div><span className="small-label">DEVICE DISPLAY MESSAGE</span><p>{telemetry?.displayMessage || 'Waiting for the ESP32 to report its display message.'}</p></div></div>
            <button className="primary-button dispense-button" onClick={feedNow} disabled={!online || commandBusy || String(telemetry?.feederState || '').toLowerCase() === 'dispensing'}>
              {commandBusy ? 'Sending command…' : String(telemetry?.feederState || '').toLowerCase() === 'dispensing' ? 'Dispensing in progress' : '🐟  Dispense food now'}
            </button>
            {!online && <p className="disabled-note">Remote feeding is disabled until the ESP32 reports a recent heartbeat.</p>}
            {commandNotice && <p className="command-notice" role="status">{commandNotice}</p>}
            {latestResult && <div className="latest-result"><span className="small-label">LATEST DEVICE ACKNOWLEDGEMENT</span><strong>{latestResult.status || 'Received'}</strong><span>{latestResult.message || latestResult.detail || 'The ESP32 reported a command result.'}</span>{resultTime && <small>{resultTime}</small>}</div>}
          </article>

          <article className="panel health-panel">
            <div className="panel-header"><div><p className="eyebrow">CONNECTION HEALTH</p><h2>Device status</h2></div><span className={`large-status-dot ${online ? 'large-status-dot--online' : ''}`} /></div>
            <div className="connection-state"><span className={`connection-symbol ${online ? 'connection-symbol--online' : ''}`}>{online ? '✓' : '!'}</span><div><strong>{online ? 'Connected to cloud' : 'No fresh heartbeat'}</strong><p>{online ? 'The ESP32 has reported within the expected time window.' : 'Last readings may be stale. Check device power, Wi-Fi, and Firebase authentication.'}</p></div></div>
            <div className="health-detail"><span>Last cloud heartbeat</span><strong>{lastSeen ? new Date(lastSeen).toLocaleString() : 'Not received'}</strong></div>
            <div className="health-detail"><span>Telemetry update time</span><strong>{updatedAt ? new Date(Number(updatedAt)).toLocaleString() : 'Not received'}</strong></div>
            <div className="health-detail"><span>RTC time from hardware</span><strong>{telemetry?.rtcTime || 'Not received'}</strong></div>
            <div className="health-note"><span>ⓘ</span><p>The connection badge is based on heartbeat age, not just whether this browser can access Firebase.</p></div>
          </article>
        </section>

        <section className="section-block history-section">
          <div className="section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Feeding history</h2></div><span className="history-count">{feedingEvents.length} recent record{feedingEvents.length === 1 ? '' : 's'}</span></div>
          <div className="panel history-panel">
            {feedingEvents.length ? (
              <div className="table-wrap"><table><thead><tr><th>Time</th><th>Source</th><th>Status</th><th>Food weight</th></tr></thead><tbody>{feedingEvents.map((event) => <tr key={event.id}><td>{event.completedAt || event.recordedAt ? new Date(Number(event.completedAt || event.recordedAt)).toLocaleString() : '—'}</td><td>{event.source || '—'}</td><td><span className={`table-status ${String(event.status).toLowerCase().includes('fail') || String(event.status).toLowerCase().includes('error') ? 'table-status--error' : ''}`}>{event.status || 'Recorded'}</span></td><td>{event.foodWeightG !== undefined ? `${event.foodWeightG} g` : '—'}</td></tr>)}</tbody></table></div>
            ) : (
              <div className="empty-history"><span>◷</span><strong>No feeding events yet</strong><p>Completed dispensing events will appear here once the ESP32 writes them to Firebase.</p></div>
            )}
          </div>
        </section>

        <footer className="footer"><span>FinPilot · Smart Fish Feeding System</span><span>Signed in as {user.email || user.uid}</span></footer>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (!isFirebaseConfigured) return <SetupNotice />;
  if (user === undefined) return <main className="loading-shell"><div className="spinner"/><p>Connecting to Firebase…</p></main>;
  if (!user) return <SignIn />;
  return <Dashboard user={user} />;
}
