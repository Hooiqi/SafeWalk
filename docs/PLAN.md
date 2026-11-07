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
| 3. Module 2 | Hold-to-confirm SOS, silent SOS, emergency calling, safe point navigator (+ M4 response workflow and safe point management) | Done (7 Nov 2026) |
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

| Proposal requirement | Implementation | Test | Status |
|---|---|---|---|
| Hold-to-confirm SOS (about 3 s, prevents accidental activation) | `mobile/lib/widgets/hold_to_confirm_button.dart`, `features/sos/sos_screen.dart` | `sos_widgets_test.dart` (fires at 3 s, early release cancels, disabled) | Done |
| SOS captures GPS, identity (session) and timestamp | `POST /api/sos`, `server/src/modules/sos/sosService.js` | `sos.test.js` "stores the alert with identity, GPS and time" | Done |
| SOS works without a GPS fix | App sends after 6 s without GPS; first location received becomes the alert location | `sos.test.js` "goes through without GPS", `sos_controller_test.dart` | Done |
| Duplicate protection | Idempotency key per press + one open SOS per user (unique indexes) | `sos.test.js` "a retried request never creates a second alert" (incl. concurrent) | Done |
| Reliable delivery on a bad connection | App retries with back-off using the same key | `sos_controller_test.dart` "keeps retrying … same request id" | Done |
| SOS reaches the Security Dashboard immediately | `publisher.alertNew`, dashboard `useEmergencies` | `sos.test.js`, `socket.test.js` | Done |
| Live location during an SOS (security + trusted contacts) | `sos:location` socket event, HTTP batch fallback, SOS share link `/t/<token>` | `socket.test.js` "streams SOS positions …", `sos.test.js` live link | Done |
| Trusted contacts alerted in parallel (SMS/Telegram/Email) | `sosMessage` via dispatcher | `sos.test.js` | Done (code); External (credentials) |
| One-tap call to USM Security hotline, 999 fallback | `services/phone_dialer.dart`, numbers in `AppConfig` (overridable) | Manual | Done (manual); opens dialer, see A13 |
| Silent SOS | `trigger_type = SILENT`, no vibration, no call prompt, contacts told not to call | `sos.test.js`, `sos_controller_test.dart` | Done |
| User marks themselves safe | `POST /api/sos/:id/safe`; stops sharing, notifies contacts and security; alert stays for security | `sos.test.js` "user marks themselves safe" | Done |
| Nearest safe points with name, category, hours, phone, walking directions | `GET /api/safe-points/nearest`, `/directions` (OSRM steps), `features/safe_points/safe_points_screen.dart` | `safePoints.test.js` | Done |
| Filter by operating hours before ranking | SQL `public.safe_point_is_open` (Malaysia time, ranges across midnight) | `openingHours.test.js` (JS and SQL agree over a week for every schedule) | Done |
| PostGIS k-NN | `ORDER BY location <-> point` with GiST index | `safePoints.test.js` | Done |
| Rank by actual walking time | OSRM table service (one request for all candidates), straight-line fallback | `safePoints.test.js` "…then ranks by walking time" | Done |
| Verified safe point data | 21 points supplied by the team, loaded by migration `20261107000200` without coordinates | `safePoints.test.js` "loads the 21 supplied safe points without inventing locations" | Partial: locations must be pinned by staff (see A14) |
| SOS during a journey | Alert linked to the open trip; journey link shows the SOS | `sos.test.js` | Done |

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
| Emergency alert with alarm, live location, identity, time, type | `EmergenciesPage.jsx`, `alarm.js` | Done for SOS and overdue journeys (browser-tested) |
| Status workflow Received, On the Way, Arrived, Resolved | `POST /api/staff/alerts/:id/status`, `ResponsePanel.jsx`, timeline with officer and note; resolving an overdue alert closes the journey | Done (tests: `sos.test.js` workflow, `socket.test.js`) |
| Report management, grouping, verification | | Planned |
| Safe haven and campus resource management | `SafePointsPage.jsx` (pin on map, hours editor, contacts, activate), `/api/staff/safe-points` | Done (tests: `safePoints.test.js` management) |
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
| USM Security hotline number | Module 2 calling | +604-653 4999 (proposal Figure 1.1 and team list, 7 Nov 2026); `USM_SECURITY_EMERGENCY` dart-define |
| Map location of each safe point | Module 2 navigator | Pin in the dashboard (Safe points page); the supplied list has no coordinates |
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
| A13 | "One-tap calling": Android and iOS do not let an app place a call without the user confirming in the dialer (direct calling needs the CALL_PHONE permission and is refused by iOS) | SafeWalk opens the dialer with the number filled in: one tap in SafeWalk plus the dialer's call button |
| A14 | The safe point list has no coordinates | Loaded without locations; staff pin each on the dashboard map. No coordinates are guessed |
| A15 | Pusat Sejahtera lists +604-693 3999 / 4900, unlike the other 653 numbers; some hours have exceptions (public holidays, semester break, Friday lunch) | Stored as supplied; exceptions shown as notes; team to re-check the 693 numbers |
| A16 | ERD SAFE_POINT has one `name_and_category` column | Split into `name` + `category` so the app can filter and colour by category |
| A17 | Should an SOS notify trusted contacts? Module 2 text mentions only security; 5.2.3 2B/2C say SOS alerts and live location go to configured channels and contacts | Contacts are notified and get a live link |
| A18 | What closes an SOS: the user or security? | The user can mark themselves safe (sharing stops), but only security resolves the alert |

## 7. Completion checklist (proposal acceptance criteria)

| # | Criterion | State |
|---|---|---|
| 1 | All four modules implemented | Modules 1 and 2 done; Module 4 partly (response workflow, safe points); Module 3 and rest of 4 planned |
| 3 | Mobile app talks to the backend | Done (REST + Socket.io; web build verified against local server) |
| 4 | Dashboard receives real-time information | Done for ETA escalations |
| 5 | Tracking page works through a secure link | Done |
| 6 | ETA watchdog runs server-side | Done |
| 7 | Three-minute grace period | Done (`GRACE_PERIOD_SECONDS=180`) |
| 8 | Emergency escalation | Done |
| 9 | Hold-to-confirm SOS | Done |
| 10 | Silent SOS | Done |
| 11 | Safe point navigation uses spatial queries | Done (k-NN + opening hours + walking time) |
| 15 | Security manage emergency responses | Done |
| 17 | Safe points can be managed | Done |
| 12-14, 16, 18 | Reports, auto-verification, report management, announcements | Planned (Modules 3-4) |
| 19 | Database security policies | Done for current tables (RLS tested) |
| 20 | Palette followed | Done (tokens in `packages/shared/styles/tokens.css`, `apps/mobile/lib/core/theme.dart`) |
| 21 | Responsive | Tracking page checked at phone and desktop widths; dashboard has a tablet layout |
| 22 | Important functionality tested | 75 server tests, 31 Flutter tests |
| 24 | No fabricated integrations or statistics | Unconfigured channels report "skipped"; sample data is labelled |
