# M4: Alerts and security dashboard

**Owner:** @member4

## Purpose
Give USM security one place to manage emergencies and reports, and send reliable information to users.

## Scope

**Must have**
- **Live dispatch queue:** active SOS alerts, overdue-trip alerts, and reported issues on a campus map. High-priority cases are highlighted. Shows the student's identity, contact number, and location.
- **Triage and audit trail:** update statuses, assign patrol teams to locations, and record the time and person for every action
- **Report review:** security staff verify or reject pending reports (no AI screening)
- **Verified advisory broadcast:** send official announcements (for example dangerous wildlife or footpath maintenance) to all users
- **Push notifications:** alerts to the right contacts, security, and advisory notices to everyone
- In-app alerts tab for students
- Role-based access (student, security, admin)

**Extras**
- Basic analytics (incidents by area and time)
- Audible alert for new SOS

## Data
| Reads | Writes |
|---|---|
| `alerts`, `incidents`, `trips`, `users` | `alerts` (PUBLIC_ADVISORY, status updates), `incidents` (status, verifiedBy, verifiedAt, rejectReason), `audit_logs` |

## Gives to other modules
Verified incidents for M3's map, and notifications for M1 and M2 alerts.

## Notes
M4 has the most parts and is the first thing your supervisor will want to see. Start in week 1 with fake alerts and a "simulate alert" tool, so you do not wait for M1 to M3.

## Progress
- [ ] Fake alert data and simulate tool
- [ ] Dispatch queue and map
- [ ] Status updates and audit trail
- [ ] Report review queue
- [ ] Notifications
- [ ] Advisory broadcast
- [ ] Role-based access
- [ ] Integration tests with M1, M2, M3
