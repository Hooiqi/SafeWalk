import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';

/** The dashboard shell: one top bar. Five short destinations still fit one row on a desktop. */
export default function TopBar({ staff, onSignOut, openCount, pendingReports = 0, liveAnnouncements = 0 }) {
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
          <NavLink to="/reports" className="topbar__link">
            Safety reports
            {pendingReports > 0 && (
              <span className="topbar__count topbar__count--quiet num" aria-label={`${pendingReports} waiting for review`}>
                {pendingReports}
              </span>
            )}
          </NavLink>
          <NavLink to="/safe-points" className="topbar__link">
            Safe points
          </NavLink>
          <NavLink to="/announcements" className="topbar__link">
            Announcements
            {liveAnnouncements > 0 && (
              <span className="topbar__count topbar__count--quiet num" aria-label={`${liveAnnouncements} live`}>
                {liveAnnouncements}
              </span>
            )}
          </NavLink>
          <NavLink to="/analytics" className="topbar__link">
            Analytics
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
