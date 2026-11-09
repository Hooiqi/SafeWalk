import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';

/** The dashboard shell: one top bar. Two destinations do not earn a sidebar. */
export default function TopBar({ staff, onSignOut, openCount }) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="wordmark" href="/emergencies">
          SafeWalk <span className="topbar__product">Security</span>
        </a>
        <nav aria-label="Dashboard" className="topbar__nav">
          <NavLink to="/emergencies" className="topbar__link">
            Live emergencies
            {openCount > 0 && (
              <span className="topbar__count num" aria-label={`${openCount} open`}>
                {openCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/safe-points" className="topbar__link">
            Safe points
          </NavLink>
        </nav>
        <div className="topbar__staff">
          <span className="topbar__who">
            <span>{staff.full_name}</span>
            <span className="muted small">{staff.role === 'SECURITY_ADMIN' ? 'Security admin' : 'Security officer'}</span>
          </span>
          <button type="button" className="btn" onClick={onSignOut}>
            <LogOut aria-hidden="true" /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
