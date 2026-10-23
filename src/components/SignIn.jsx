import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(err?.message || 'Sign-in failed. Check your account and Firebase Authentication setup.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand-mark brand-mark--large">🐟</div>
        <p className="eyebrow">SMART AQUATIC CARE</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to monitor your feeder and access its controls.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Email address<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <p role="alert" className="error-message">{error}</p>}
          <button className="primary-button full-width" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
        </form>
        <p className="fine-print">Dashboard access is restricted by Firebase Authentication and database rules.</p>
      </div>
    </main>
  );
}
