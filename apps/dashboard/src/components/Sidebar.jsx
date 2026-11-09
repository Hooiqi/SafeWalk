import { NavLink } from 'react-router-dom';

export default function Sidebar({ staff, onSignOut, openCount }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="brand">SafeWalk</span>
        <span className="sidebar__product">Security Dashboard</span>
      </div>

      <nav aria-label="Dashboard">
        <p className="sidebar__section">Emergency response</p>
        <NavLink to="/emergencies" className="nav-item">
          <span>Live emergencies</span>
          {openCount > 0 && <span className="nav-item__count sw-num" aria-label={`${openCount} open`}>{openCount}</span>}
        </NavLink>
        <p className="sidebar__section">Campus resources</p>
        <NavLink to="/safe-points" className="nav-item">
          <span>Safe points</span>
        </NavLink>
      </nav>

      <div className="sidebar__footer">
        <p className="sidebar__staff">
          <strong>{staff.full_name}</strong>
          <span className="sw-muted">{staff.admin_email}</span>
          <span className="sw-muted">{staff.role === 'SECURITY_ADMIN' ? 'Security admin' : 'Security officer'}{staff.badge_no ? ` · ${staff.badge_no}` : ''}</span>
        </p>
        <button type="button" className="sw-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
