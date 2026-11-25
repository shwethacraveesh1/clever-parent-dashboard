import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const STORAGE_KEY = 'magicLinkToken';

function tokenFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  return new URLSearchParams(hash).get('token');
}

// Survives React StrictMode's double effect so the same token is POSTed once,
// but a different token (new login) starts a new verify.
let pending = null; // { token, promise }

export default function VerifyPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let token = tokenFromHash();
    if (token) {
      // Keep a copy so HMR / remount after clearing the hash can still verify.
      sessionStorage.setItem(STORAGE_KEY, token);
      window.history.replaceState(null, '', '/verify');
    } else {
      token = sessionStorage.getItem(STORAGE_KEY);
    }

    if (!token) {
      setError('This sign-in link is missing a token.');
      return;
    }

    if (!pending || pending.token !== token) {
      pending = {
        token,
        promise: api.verify(token).finally(() => {
          sessionStorage.removeItem(STORAGE_KEY);
        }),
      };
    }

    let alive = true;
    pending.promise
      .then(() => {
        if (alive) navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        if (alive) setError('This sign-in link is invalid or has expired. Request a new one.');
      });

    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <section className="panel">
      <h1>Signing you in…</h1>
      {error ? (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <p>
            <Link to="/login">Back to sign in</Link>
          </p>
        </>
      ) : (
        <p className="lede">One moment.</p>
      )}
    </section>
  );
}
