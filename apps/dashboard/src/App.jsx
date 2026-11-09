import { Navigate, Route, Routes } from 'react-router-dom';
import TopBar from './components/TopBar.jsx';
import EmergenciesPage from './pages/EmergenciesPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SafePointsPage from './pages/SafePointsPage.jsx';
import { useAuth } from './lib/useAuth.js';
import { useEmergencies } from './lib/useEmergencies.js';
import { supabaseConfigured } from './lib/supabase.js';

function StaffShell({ auth }) {
  const emergencies = useEmergencies(auth.session.access_token);
  const open = emergencies.alerts.filter((a) => a.status !== 'RESOLVED').length;
  return (
    <div className="shell">
      <TopBar staff={auth.staff} onSignOut={auth.signOut} openCount={open} />
      <main className="shell__main">
        <Routes>
          <Route path="/emergencies" element={<EmergenciesPage accessToken={auth.session.access_token} emergencies={emergencies} />} />
          <Route path="/safe-points" element={<SafePointsPage accessToken={auth.session.access_token} />} />
          <Route path="*" element={<Navigate to="/emergencies" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AuthGate() {
  const auth = useAuth();
  if (auth.loading) return <p className="muted state">Checking your session</p>;
  if (!auth.session) return <LoginPage notice={auth.notice} />;
  if (auth.staffError) {
    return (
      <div className="state state--error" role="alert">
        <p>Could not verify staff access: {auth.staffError.message}</p>
        <button type="button" className="btn" onClick={auth.signOut}>Sign out</button>
      </div>
    );
  }
  return <StaffShell auth={auth} />;
}

export default function App() {
  if (!supabaseConfigured) {
    return (
      <p className="state state--error" role="alert">
        Supabase is not configured. Copy apps/dashboard/.env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
      </p>
    );
  }
  return <AuthGate />;
}
