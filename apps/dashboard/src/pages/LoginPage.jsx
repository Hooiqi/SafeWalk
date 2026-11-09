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
      <form className="login__card glass" onSubmit={submit} noValidate>
        <span className="wordmark">SafeWalk</span>
        <h1>Security sign in</h1>
        <p className="muted">For USM Security Department staff on the allow-list.</p>

        {notice && <p className="form-error" role="alert">{notice}</p>}

        <div className="field">
          <label htmlFor="email">
            Staff email <span className="req" aria-hidden="true">*</span>
          </label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">
            Password <span className="req" aria-hidden="true">*</span>
          </label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn--primary login__submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
