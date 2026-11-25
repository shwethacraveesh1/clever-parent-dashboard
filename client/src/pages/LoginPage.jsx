import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.requestLink(email.trim());
      navigate('/check-email', { state: { email: email.trim() }, replace: true });
    } catch (err) {
      setError(err.status === 400 ? 'Enter a valid email address.' : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h1>Sign in</h1>
      <p className="lede">We’ll email you a one-time link. No password needed.</p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Email me a link'}
        </button>
      </form>
    </section>
  );
}
