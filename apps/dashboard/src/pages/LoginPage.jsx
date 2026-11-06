import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function LoginPage({ notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : err.message);
    setBusy(false);
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit} noValidate>
        <p className="brand">SafeWalk</p>
        <h1>Security staff sign in</h1>
        <p className="sw-muted">For authorised USM Security Department personnel. Access is limited to allow-listed staff emails.</p>

        {notice && <p className="form-error" role="alert">{notice}</p>}

        <label className="label" htmlFor="email">
          Staff email <span aria-hidden="true">*</span>
        </label>
        <input id="email" className="sw-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="label" htmlFor="password">
          Password <span aria-hidden="true">*</span>
        </label>
        <input id="password" className="sw-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <p className="form-error" role="alert">{error}</p>}

        <button type="submit" className="sw-button sw-button--primary login__submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
