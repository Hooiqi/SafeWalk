# M1: Trip sharing and ETA monitoring

**Owner:** @member1

## Purpose
Protect students on solo or late-night walks: share a live journey with trusted
contacts, and alert them and USM Security automatically if the student does not
arrive and does not respond (proposal 5.1, Module 1).

## Where the code is
| Part | Location |
|---|---|
| Trip API, state machine, location ingest | `apps/server/src/modules/trips/` |
| ETA watchdog (node-cron) | `apps/server/src/modules/watchdog/etaWatchdog.js` |
| OSRM routing | `apps/server/src/modules/routing/` |
| Contact notifications | `apps/server/src/modules/notifications/` |
| Tracking link API | `apps/server/src/modules/tracking/` |
| Mobile screens | `apps/mobile/lib/features/{journey,contacts,history}/`, `lib/services/trip_tracker.dart` |
| Trusted-contact page | `apps/tracking/` |
| Tables | `trip`, `trip_trusted_contact`, `location_log`, `trusted_contact`, `sos_alert` (`ETA`) |

## Progress
- [x] Trusted contacts (add, edit, remove)
- [x] Destination on map, OSRM route and ETA
- [x] Secure tracking link with expiry
- [x] Live GPS and heartbeat over Socket.io, offline buffering
- [x] Trusted-contact tracking page
- [x] Server-side watchdog: grace period (3 min), escalation, heartbeat loss
- [x] Escalation reaches the security dashboard
- [x] Contact alerts over SMS / Telegram / email (needs credentials to send)
- [x] Journey history
- [x] Automated tests (server and Flutter)
- [ ] Field test on a real phone (background location, screen off)
- [ ] Hazard check before walking (needs the Module 3 map)
