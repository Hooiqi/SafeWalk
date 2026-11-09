# M2: Emergency SOS and safe places

## Status (7 Nov 2026): implemented

| Part | Location |
|---|---|
| SOS API, idempotency, live location, "I'm safe" | `apps/server/src/modules/sos/` |
| Safe point navigator (opening hours, k-NN, walking time, directions) | `apps/server/src/modules/safePoints/` |
| Security response workflow | `apps/server/src/modules/alerts/alertStatusService.js`, `apps/dashboard/src/components/ResponsePanel.jsx` |
| Safe point management | `apps/dashboard/src/pages/SafePointsPage.jsx` |
| Mobile SOS and navigator | `apps/mobile/lib/features/{sos,safe_points}/`, `lib/services/sos_controller.dart` |
| Tables | `safe_point`, `sos_alert` (HOLD / SILENT), `location_log.alert_id`, `alert_status_log` |

- [x] Hold-to-confirm SOS (3 s), silent SOS, emergency call buttons
- [x] SOS with GPS, identity and time to the dashboard; live location; contacts alerted
- [x] Duplicate protection and retries
- [x] Safe points: 21 supplied points loaded; open-now filter, k-NN, walking-time ranking, directions
- [x] Security response workflow and safe point management
- [ ] Security pins the 21 safe points on the map (dashboard)
- [ ] Field test on a real phone (calling, background location during SOS)

> **Note (6 Nov 2026):** the Extended Project Proposal is now the source of truth
> for this module's scope (section 5.1 and Diagram 12.x). Code goes in the apps
> (`apps/server/src/modules/…`, `apps/mobile/lib/features/…`, `apps/dashboard`),
> not in this folder. See `docs/PLAN.md` for the requirement list. The scope
> below is from the earlier planning stage.

**Owner:** @member2

## Purpose
Get help fast and guide the student to the nearest safe place.

## Scope

**Must have**
- Large SOS button with press-and-hold, so it does not trigger by accident
- On trigger: call USM security, with a second button for 999
- Save the SOS event with location, create an SOS alert, and share location with trusted contacts
- Safe places list and map: nearest security booths, guard posts, clinics, and 24-hour places, sorted by distance
- Navigate to a safe place

**Extras**
- Shake-to-trigger
- Discreet trigger mode

**Team task:** walk the campus and record real coordinates for `safe_locations`. This original data is a strong point for the viva.

## Data
| Reads | Writes |
|---|---|
| `contacts`, `safe_locations` | `sos_events`, `alerts` (type SOS), `safe_locations` |

## Gives to other modules
M4 receives SOS alerts with the location and shows them at the top of the security queue.

## Notes
- Use a test phone number in demos, never the real security line.
- Keep 8 to 10 real safe locations so the nearest-first list looks convincing.

## Progress
- [ ] SOS button and call buttons
- [ ] Save SOS event and alert
- [ ] Notify trusted contacts
- [ ] Safe locations data collected
- [ ] Nearest-first list and map
- [ ] Tests with seed data
- [ ] Integration test with M4
