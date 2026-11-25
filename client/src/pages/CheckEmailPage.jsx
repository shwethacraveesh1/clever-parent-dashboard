import { Link, useLocation } from 'react-router-dom';

export default function CheckEmailPage() {
  const email = useLocation().state?.email;

  return (
    <section className="panel">
      <h1>Check your email</h1>
      <p className="lede">
        If that email is on file, we sent a sign-in link
        {email ? (
          <>
            {' '}
            to <strong>{email}</strong>
          </>
        ) : null}
        . In local development the link is printed in the API server console.
      </p>
      <p>
        <Link to="/login">Use a different email</Link>
      </p>
    </section>
  );
}
