# SafeWalk implementation plan and requirements traceability

Source of truth: *CAT304 G12 Extended Project Proposal* (sections 3.0, 5.1,
5.2, 12.0 diagrams 12.1 to 12.7). This file maps every proposal requirement
to its implementation and test, and lists what is still open.

**Status legend:** Done = implemented and covered by an automated test.
Done (manual) = implemented and checked by hand only. Partial = works, with
a limitation noted. Planned = scheduled for a later module sprint.
External = needs credentials or institutional data the team must supply.

## 1. Delivery stages

| Stage | Scope | State |
|---|---|---|
| 1. Setup | Monorepo, database schema, auth, RLS, shared design tokens | Done (6 Nov 2026) |
| 2. Module 1 | Live trip sharing, ETA watchdog, escalation, tracking page | Done (6 Nov 2026) |
| 3. Module 2 | Hold-to-confirm SOS, silent SOS, emergency calling, safe point navigator | Planned |
| 4. Module 3 | Incident reporting, photo upload, auto-verification, safety map | Planned |
| 5. Module 4 | Full dashboard: response workflow, report review, safe points, announcements, analytics | Planned |
| 6. Integration | Cross-module tests, field test on campus, final documentation | Planned |

The proposal's Gantt chart (Diagram 10.1) puts Modules 1 and 2 in Sprint 2,
Module 3 in Sprint 3 and Module 4 in Sprint 4.

## 2. Architecture (proposal 5.2.1, four tiers)

| Tier | Proposal | Implementation |
|---|---|---|
| Presentation | Flutter app, React dashboard, React tracking page | `apps/mobile`, `apps/dashboard`, `apps/tracking` |
| Application | Node.js + Express REST, Socket.io, node-cron watchdog | `apps/server` |
| Data | Supabase PostgreSQL + PostGIS, Auth + RLS, Storage | `supabase/migrations` |
| External | OSM, OSRM, Leaflet, FCM, Twilio SMS, Telegram, Email | adapters in `apps/server/src/modules/{routing,notifications}` |

Shared JavaScript constants and web design tokens live in `packages/shared`.
The Flutter app mirrors the constants in `apps/mobile/lib/core/constants.dart`.

## 3. Requirements traceability matrix

Test files: server tests are in `apps/server/test/`, Flutter tests in
`apps/mobile/test/`.

### Module 1: Live trip sharing and ETA monitoring

| Proposal requirement | Implementation | Test | Status |
|---|---|---|---|
| Select destination on an interactive campus map | `mobile/lib/features/journey/start_journey_screen.dart` (tap to pin, flutter_map + OSM) | Manual (screenshots) | Done (manual) |
| Show current location | `mobile/lib/services/location_service.dart` | Manual | Done (manual) |
| Calculate walking route and ETA with OSRM | `server/src/modules/routing/osrmClient.js`, `POST /api/trips/route-preview` | `tripsApi.test.js` "computes the route and ETA on the server" | Done |
| ETA computed on the server, not trusted from the client | `tripService.startTrip` | `tripsApi.test.js` | Done |
| Choose trusted contacts | `contactRoutes.js`, `contacts_screen.dart`, picker in start screen | `tripsApi.test.js` "trusted contacts", "only allows the user own contacts" | Done |
| Secure, unique tracking link | 256-bit random token (`generateShareToken`) | `trackingAndRls.test.js` | Done |
| Contacts follow without installing the app | `apps/tracking` (React + Leaflet) | `trackingAndRls.test.js`, `socket.test.js` | Done |
| Live GPS, destination, remaining time, last updated, status | `StatusPanel.jsx`, `JourneyMap.jsx` | Manual (screenshots) | Done (manual) |
| Token access restriction and expiry | `trackingService.resolveToken`, link valid while open + 30 min | `trackingAndRls.test.js` "stays readable 30 minutes after arrival, then expires" | Done |
| Link must not expose private data | `getTrackingView` returns name, route and position only | `trackingAndRls.test.js` "without exposing private details" | Done |
| Stream live GPS and heartbeat (WebSocket) | `socketServer.js`, `TripTracker` | `socket.test.js`, `trip_tracker_test.dart` | Done |
| Server-side ETA countdown independent of the phone | `etaWatchdog.js` (node-cron) | `watchdog.test.js` "escalates even when the phone went silent" | Done |
| Heartbeat monitoring | `markLostSignals` in watchdog; signal-lost banner on tracking page and dashboard | `watchdog.test.js` "flags lost heartbeats" | Done |
| Stage 1: ETA expires, notify user, 3-minute grace, extend or confirm safe | Watchdog stage 1, FCM + `trip:grace_prompt`, grace UI in `active_journey_screen.dart` | `watchdog.test.js` Stage 1, extend, confirm-safe tests | Done |
| Stage 2: escalate with route history and last GPS | Watchdog stage 2 creates `sos_alert` (trigger ETA) | `watchdog.test.js` Stage 2 | Done |
| Stage 2: notify trusted contacts (SMS, Telegram, Email) | `notifications/dispatcher.js` and channels | `watchdog.test.js`, `dispatcher.test.js` | Done (code); External (credentials) |
| Stage 2: push alert to Security Dashboard | `publisher.alertNew`, dashboard `useEmergencies` | `socket.test.js` "pushes the overdue escalation" | Done |
| State machine: Active, Grace Prompt, Escalated (+ Completed, Cancelled) | `tripStateMachine.js` + conditional updates | `tripStateMachine.test.js` | Done |
| No duplicate escalation | Conditional UPDATE + `FOR UPDATE SKIP LOCKED` + unique ETA alert per trip | `watchdog.test.js` "never escalates the same trip twice" | Done |
| Safe arrival ends monitoring; contacts see it | `ARRIVE` transition; tracking page "Arrived safely" | `tripsApi.test.js`, `trip_tracker_test.dart` | Done |
| Hazard check before walking (integration with Module 3 map) | Requires Module 3 | | Planned (Module 3) |
| Journey history | `GET /api/trips`, `history_screen.dart` | `tripsApi.test.js` "lists journey history" | Done |
| Offline buffering and reconnection | `TripTracker` buffer + HTTP batch upload, socket `connectionStateRecovery` | `trip_tracker_test.dart` "buffers samples while offline" | Done |
| Background location on the phone | Android foreground service, iOS background mode | Needs a real device | Partial (not device-tested yet) |

### Module 2: Emergency SOS and safe point navigator

| Proposal requirement | Implementation | Status |
|---|---|---|
| Hold-to-confirm SOS (about 3 s) | `sos_alert` table and `HOLD` trigger type exist | Planned |
| One-tap call to USM Security hotline, 999 fallback | | Planned; External (hotline number confirmation) |
| Silent SOS | `SILENT` trigger type exists | Planned |
| Nearest safe point, PostGIS k-NN, filter by hours, rank by walking time | | Planned; External (verified safe-point data) |

### Module 3: Incident reporting and safety map

| Proposal requirement | Status |
|---|---|
| Categorised, anonymous reports with severity, location, description, optional photo | Planned |
| Manual verification by security staff | Planned |
| Colour-coded safety map (verified only), bounding-box query | Planned |
| Auto-verify: 3+ independent users, 50 m, 30 min (`ST_DWithin`) | Planned |
| Report status tracking: pending, verified, rejected, resolved | Planned |

### Module 4: Admin security dashboard

| Proposal requirement | Implementation | Status |
|---|---|---|
| Staff login with admin email allow-list, Supabase Auth, RBAC, RLS | `security_staff`, `is_security_staff()`, `requireSecurityStaff`, dashboard login | Done (tests: `tripsApi.test.js`, `trackingAndRls.test.js`) |
| Emergency alert with alarm, live location, identity, time, type | `EmergenciesPage.jsx`, `alarm.js` | Done for ETA escalations (manual check) |
| Status workflow Received, On the Way, Arrived, Resolved | Schema and RLS ready (`alert_status`, `alert_status_log`) | Planned |
| Report management, grouping, verification | | Planned |
| Safe haven and campus resource management | | Planned |
| Security announcements | | Planned |
| Analytics from real data | | Planned |

## 4. Database (proposal 5.2.4, Diagram 12.5)

See [database.md](database.md) for the mapping of ERD entities to tables and
every column added beyond the ERD.

## 5. External services and information the team must supply

| Item | Needed for | Where it goes |
|---|---|---|
| Supabase project (or Supabase CLI + Docker locally) | Auth, database, storage | `apps/server/.env`, `apps/dashboard/.env`, `apps/mobile/env/dev.json` |
| Real security staff emails | Dashboard allow-list | `security_staff` rows (SQL editor; not committed) |
| Twilio account + sender number | SMS to trusted contacts | `apps/server/.env` |
| Telegram bot token | Telegram alerts | `apps/server/.env` |
| SMTP account | Email alerts | `apps/server/.env` |
| Firebase project + service account | Push notifications (grace prompt) | server `.env` + mobile dart-defines |
| OSRM foot-routing server for production | Routing beyond fair-use demo limits | `OSRM_BASE_URL` |
| Confirmed USM Security hotline number | Module 2 calling | Config (Module 2). Proposal Figure 1.1 shows +604-653 4333/4334 and emergency line +604-653 4999; confirm with JKUSM before use |
| Verified safe-point list (name, location, hours, phone) | Module 2 navigator | Entered by staff through Module 4 |
| Institutional approval to connect to JKUSM | Real deployment | Supervisor / JKUSM |

## 6. Ambiguities and decisions

| # | Issue | Decision taken (team to confirm) |
|---|---|---|
| A1 | Section 4.0 mentions a "one-tap SOS button"; Module 2 and Diagram 12.2 specify hold-to-confirm SOS and one-tap *calling* | Treat them as separate: SOS alert = hold about 3 s; calling buttons = one tap |
| A2 | Section 6.0 lists SDGs 3, 5, 11; Section 7.0 also cites SDG 16 (and `docs/01` lists 16) | Not changed in code. Align the report wording |
| A3 | ERD `SOS_ALERT.status` lists RECEIVED first, but "Received Alert" is also a button staff press | Added `NEW` as the initial, unacknowledged status so the dashboard knows when to keep the alarm on |
| A4 | "Confirm safety" during the grace period: end the trip, or keep it active? | Ends the trip as `COMPLETED` (`SAFE_CONFIRMED`); users who are still walking choose "I need more time" |
| A5 | Can a user cancel during the grace period? | No. Only ACTIVE trips can be cancelled; after the ETA the user must answer the check-in, so a cancel cannot silence an alert |
| A6 | Heartbeat loss: should it escalate early? | No (not in the proposal). It is flagged to contacts and security; escalation still follows the ETA + grace timeline |
| A7 | ERD has no table for which contacts were chosen for a trip | Added `trip_trusted_contact` |
| A8 | OSRM's public demo server ignores the foot profile | Default to the FOSSGIS foot server (`routing.openstreetmap.de/routed-foot`); self-host for production |
| A9 | Leaflet is a JavaScript library | React apps use Leaflet; Flutter uses `flutter_map`, the Dart counterpart with the same tile/layer model |
| A10 | Existing `docs/03-data-contract.md` (camelCase, different enum values) predates the proposal ERD | The ERD (snake_case) is followed; `docs/03` updated to point to it |
| A11 | `docs/02` says alerts never include victim names; the proposal says SOS alerts include identity for security | Security staff see identity (proposal); trusted-contact link shows only the traveller's name; no identity in public views |
| A12 | Should only `@usm.my` / `@student.usm.my` emails be allowed? | Configurable `ALLOWED_USER_EMAIL_DOMAINS`; empty for demos |

## 7. Completion checklist (proposal acceptance criteria)

| # | Criterion | State |
|---|---|---|
| 1 | All four modules implemented | Module 1 done; Modules 2 to 4 planned |
| 3 | Mobile app talks to the backend | Done (REST + Socket.io; web build verified against local server) |
| 4 | Dashboard receives real-time information | Done for ETA escalations |
| 5 | Tracking page works through a secure link | Done |
| 6 | ETA watchdog runs server-side | Done |
| 7 | Three-minute grace period | Done (`GRACE_PERIOD_SECONDS=180`) |
| 8 | Emergency escalation | Done |
| 9-18 | SOS, safe points, reports, auto-verification, staff management, announcements | Planned |
| 19 | Database security policies | Done for current tables (RLS tested) |
| 20 | Palette followed | Done (tokens in `packages/shared/styles/tokens.css`, `apps/mobile/lib/core/theme.dart`) |
| 21 | Responsive | Tracking page checked at phone and desktop widths; dashboard has a tablet layout |
| 22 | Important functionality tested | 47 server tests, 14 Flutter tests |
| 24 | No fabricated integrations or statistics | Unconfigured channels report "skipped"; sample data is labelled |
