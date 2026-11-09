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
| 4. Module 3 | Incident reporting, photo upload, auto-verification, safety map (+ M4 report review) | Done (9 Nov 2026) |
| 5. Module 4 | Full dashboard: response workflow, report review, safe points, announcements, analytics | Done (9 Nov 2026) |
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
| Hazard check before walking (integration with Module 3 map) | `route-preview` returns verified incidents within 50 m of the route (`incidentService.alongRoute`); warning in `start_journey_screen.dart` | `incidents.test.js` "warns about verified incidents along a planned walk" | Done |
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

| Proposal requirement | Implementation | Test | Status |
|---|---|---|---|
| Categorised reports with category, severity, location, description | `POST /api/incidents`, `incidentService.submit`, `report_incident_screen.dart` (pin from GPS, tap to move) | `incidents.test.js` "stores a pending report…", `incidents_test.dart` report form | Done |
| Anonymous reporting | `is_anonymous`, `user_id` null on the report; private `incident_report_owner` link not readable by staff (A20) | `incidents.test.js` "keeps anonymous reporters hidden…", RLS "never who sent an anonymous one" | Done |
| Optional photo (Supabase Storage) | `POST /api/incidents/reports/:id/photo`, private bucket `incident-photos`, EXIF/GPS removed (`photoStorage.cleanPhoto`); staff view through the API | `incidents.test.js` "optional photo" | Done (code); External (service-role key for Storage) |
| Reports go to the dashboard for manual review | `incident:new` to staff; `ReportsPage.jsx` (verify with severity and notes, reject, resolve) | `incidents.test.js` "security review", `socket.test.js` | Done (browser-tested) |
| Colour-coded safety map, verified only | `safety_map_screen.dart` (pins coloured by severity, with icon and word) | `incidents.test.js` "returns only verified incidents…" | Done |
| Bounding-box query (only the visible area) | `GET /api/incidents/map?south&west&north&east`, `centroid_geom && ST_MakeEnvelope` with GiST index; larger than 0.5° refused | `incidents.test.js` bbox tests, `incidents_test.dart` repository | Done |
| Auto-verify: 3+ different users, 50 m, 30 min (`ST_DWithin`) | Spatio-temporal grouping in `incidentService.submit` (advisory lock per category) | `incidents.test.js` auto-verification suite (incl. distance, window, category, concurrent reports) | Done |
| Report status tracking: pending, verified, rejected, resolved | `GET /api/incidents/mine`, `incident:status` socket event, `my_reports_screen.dart` | `incidents.test.js`, `socket.test.js`, `incidents_test.dart` "follow status changes live" | Done |

### Module 4: Admin security dashboard

| Proposal requirement | Implementation | Status |
|---|---|---|
| Staff login with admin email allow-list, Supabase Auth, RBAC, RLS | `security_staff`, `is_security_staff()`, `requireSecurityStaff`, dashboard login | Done (tests: `tripsApi.test.js`, `trackingAndRls.test.js`) |
| Emergency alert with alarm, live location, identity, time, type | `EmergenciesPage.jsx`, `alarm.js` | Done for SOS and overdue journeys (browser-tested) |
| Status workflow Received, On the Way, Arrived, Resolved | `POST /api/staff/alerts/:id/status`, `ResponsePanel.jsx`, timeline with officer and note; resolving an overdue alert closes the journey | Done (tests: `sos.test.js` workflow, `socket.test.js`) |
| Report management, grouping, verification | `/api/staff/incidents` (verify, reject, resolve, merge nearby duplicates), `ReportsPage.jsx` | Done (tests: `incidents.test.js` "security review") |
| Safe haven and campus resource management | `SafePointsPage.jsx` (pin on map, hours editor, contacts, activate), `/api/staff/safe-points` | Done (tests: `safePoints.test.js` management) |
| Security announcements ("Publish safety announcement", objective 4) | `announcement` table (ERD ANNOUNCEMENT), `/api/staff/announcements` (create, schedule, edit, withdraw, optional end time), `AnnouncementsPage.jsx` with an app preview; app: `GET /api/announcements`, home screen cards and `announcements_screen.dart`; `announcement:live` / `announcement:updated` socket events; URGENT pushed by FCM once (A25) | `announcements.test.js` (publishing, scheduling, expiry, editing, withdrawing, push once, access control, RLS), `socket.test.js` "tells every app user and the dashboard…", `announcements_test.dart` | Done |
| Analytics from real data ("View campus safety analytics"; section 6 "fixing unlit pathways") | `GET /api/staff/analytics?days=7|30|90|365` (`analyticsService.js`): alerts by type, time to acknowledge / arrive / resolve from `alert_status_log`, journeys and escalations, reports by category and review outcome, trend per day or week, hour of day, hotspots (`ST_ClusterDBSCAN`, 75 m), repair list of open lighting and path problems with CSV export; `AnalyticsPage.jsx` (A26) | `analytics.test.js` (every figure checked against seeded records) | Done |

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
| Firebase project + service account | Push notifications (grace prompt, urgent announcements) | server `.env` + mobile dart-defines |
| OSRM foot-routing server for production | Routing beyond fair-use demo limits | `OSRM_BASE_URL` |
| USM Security hotline number | Module 2 calling | +604-653 4999 (proposal Figure 1.1 and team list, 7 Nov 2026); `USM_SECURITY_EMERGENCY` dart-define |
| Supabase Storage service-role key | Report photos (Module 3) | `SUPABASE_SERVICE_ROLE_KEY` in `apps/server/.env` |
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
| A19 | On 9 Nov 2026 the team replaced the mandatory "Dark mode: orange & pink" palette with a new UI requirement | Adopted the Hallmark "Dusk" theme for every surface (dashboard, tracking page, Flutter app, new landing site). See `docs/design.md`. Dusk has no red: emergencies use the apricot accent, always with an icon and words |
| A20 | "Users can report anonymously", but reports must also count "independent users" for auto-verification and let the reporter track status | Anonymous reports store no `user_id`; a separate `incident_report_owner` row links the report to the account. RLS lets only the owner read it, never security staff, and the API never returns it. The app tells users their name is hidden from USM Security |
| A21 | The proposal gives example categories (stray animals, broken lighting, harassment, suspicious activities) but no full list | Suspicious activity, harassment, theft, broken lighting, stray animal, unsafe path, other (in `packages/shared` and `constants.dart`). Team can change the list in the migration enum and both constant files |
| A22 | How do reports become one incident? | A report joins the nearest pending or verified incident of the same category whose centre is within 50 m and which was reported in the last 30 minutes; otherwise it starts a new one. Older duplicates are merged by security on the dashboard. A rejected or resolved incident is never reopened |
| A23 | Colour-coded pins need more than Dusk's two signal colours | Low in bone, medium in apricot, high in the coral error colour, always with an icon and the severity word (see `docs/design.md`) |
| A24 | What does the public map show about an incident? | Category, severity, number of reports, times, how it was verified and a note written by security. Descriptions, photos and reporters are shown only to security staff |
| A25 | The ERD gives announcements a `priority` (VARCHAR) but no values, and the proposal does not say how users are told | Three priorities: Information, Advisory and Urgent. Every live announcement appears on the app's home screen (urgent ones first, above the journey card) and in an Announcements list; URGENT ones are also pushed (FCM) once to every registered phone. Staff can schedule a start time, set an end time, edit and withdraw. A live announcement's start time cannot move; raising it to Urgent pushes it once. Same colour steps as severity (A23) |
| A26 | What should "analyse campus safety data" show? | Only figures computed from SafeWalk's own records: alert counts and response times (first staff action, arrival, resolution), journeys and escalation rate, reports by category with the review outcome, rejected-as-false rate, reports and alerts over time and by hour, places where confirmed incidents repeat (within 75 m), and a repair list of confirmed broken lighting and unsafe paths. A median or rate is shown only with at least 3 values, otherwise the dashboard says there is not enough data. Malaysia time throughout |

## 7. Completion checklist (proposal acceptance criteria)

| # | Criterion | State |
|---|---|---|
| 1 | All four modules implemented | Done (Modules 1 to 4, including announcements and analytics from real records); campus field test still to do |
| 3 | Mobile app talks to the backend | Done (REST + Socket.io; web build verified against local server) |
| 4 | Dashboard receives real-time information | Done (alerts, positions, reports, announcements) |
| 5 | Tracking page works through a secure link | Done |
| 6 | ETA watchdog runs server-side | Done |
| 7 | Three-minute grace period | Done (`GRACE_PERIOD_SECONDS=180`) |
| 8 | Emergency escalation | Done |
| 9 | Hold-to-confirm SOS | Done |
| 10 | Silent SOS | Done |
| 11 | Safe point navigation uses spatial queries | Done (k-NN + opening hours + walking time) |
| 15 | Security manage emergency responses | Done |
| 17 | Safe points can be managed | Done |
| 12-14, 16 | Reports, auto-verification, report management | Done (Module 3) |
| 18 | Announcements | Done (Module 4) |
| 19 | Database security policies | Done for current tables (RLS tested) |
| 20 | Palette followed | Done: Dusk theme since 9 Nov 2026 (A19), tokens in `packages/shared/styles/tokens.css`, `apps/mobile/lib/core/theme.dart` |
| 21 | Responsive | Tracking page checked at phone and desktop widths; dashboard has a tablet layout |
| 22 | Important functionality tested | 120 server tests, 43 Flutter tests |
| 24 | No fabricated integrations or statistics | Unconfigured channels report "skipped"; sample data is labelled |
