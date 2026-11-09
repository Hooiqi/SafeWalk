# SafeWalk

Campus safety platform for Universiti Sains Malaysia (CAT304 Group Innovation
Project, Group 12). Students and staff share a live walk with trusted
contacts; a server-side watchdog alerts those contacts and the USM Security
Department if they do not arrive and do not respond.

> **Status (9 Nov 2026):** all four modules are implemented and tested:
> **Module 1 (Live Trip Sharing and ETA Monitoring)**, **Module 2 (Emergency SOS
> and Safe Point Navigator)**, **Module 3 (Incident Reporting and Safety Map)**
> and **Module 4 (Admin Centralized Security Dashboard)**, including safety
> announcements and campus safety analytics. Next: a field test on campus with
> real credentials. See [docs/PLAN.md](docs/PLAN.md) for the full requirements
> traceability matrix.
>
> **UI (9 Nov 2026):** every surface now uses the Hallmark **Dusk** theme, and a
> public landing page (`apps/landing`) was added. See [docs/design.md](docs/design.md).

## Modules (proposal 5.1)

| Module | State |
|---|---|
| M1 Live trip sharing and ETA monitoring | Implemented |
| M2 Emergency SOS and safe point navigator | Implemented |
| M3 Incident reporting and safety map | Implemented |
| M4 Admin centralised security dashboard | Implemented: staff login, live alerts with response workflow, report review, safe point management, announcements, analytics |

## Architecture (proposal 5.2.1, four tiers)

```
 Presentation   apps/mobile (Flutter)   apps/dashboard (React)   apps/tracking (React)
                      │  REST + Socket.io          │                     │ share token
 Application    apps/server  (Node.js + Express, Socket.io, node-cron ETA watchdog)
                      │  SQL                                   │ HTTPS
 Data           Supabase PostgreSQL + PostGIS, Auth, RLS        External: OSM/Leaflet, OSRM,
                (supabase/migrations)                           FCM, Twilio SMS, Telegram, SMTP
```

## Repository layout

```
apps/
  server/      Node.js API, Socket.io, ETA watchdog, notifications (+ tests)
  mobile/      Flutter app for students and staff
  tracking/    React page for trusted contacts (no login, secure link)
  dashboard/   React dashboard for USM Security staff
  landing/     Public landing page (static, Vite)
packages/
  shared/      JS constants and web design tokens shared by the apps
supabase/
  migrations/  Schema, RLS policies (applied by the Supabase CLI)
  seed.sql     Labelled local demo data only
  local/       Supabase shim used to run the tests on plain PostgreSQL
docs/          Plan, database, API, setup, and the original team documents
modules/       Per-module scope and progress notes (code lives in apps/)
```

## Quick start

Full instructions: [docs/setup.md](docs/setup.md).

```bash
npm install
```

```bash
npm test
```

```bash
npm run dev:server
```

## Documentation

| Document | Contents |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Stages, traceability matrix, ambiguities, external dependencies, checklist |
| [docs/setup.md](docs/setup.md) | Install, environment variables, running, tests, module demos |
| [docs/database.md](docs/database.md) | ERD mapping, additions, constraints, RLS |
| [docs/api.md](docs/api.md) | REST endpoints and Socket.io events |
| [docs/design.md](docs/design.md) | Dusk theme, tokens and UI conventions |
| [docs/04-team-workflow.md](docs/04-team-workflow.md) | Git rules |

## Known limitations (Module 1)

- Contact SMS, Telegram, email and FCM push need credentials; without them the
  server logs each delivery as "skipped" and the app suggests sharing the link
  manually.
- Background location has not yet been tested on a physical Android or iOS device.
- The default OSRM server is a fair-use public service; production use needs a
  self-hosted OSRM with the foot profile.

## Known limitations (Module 2)

- The 21 safe points have no coordinates until security staff pin them in the dashboard.
- Call buttons open the phone dialer with the number filled in; the phone asks the
  user to confirm the call (Android and iOS do not allow apps to call silently).
- Public-holiday and semester-break hours are shown as notes, not applied
  automatically by the "open now" filter.
- On Android a location notification is always visible while sharing (also during
  a silent SOS); its wording is neutral ("Location sharing is on").

## Known limitations (Module 3)

- Report photos need Supabase Storage (`SUPABASE_SERVICE_ROLE_KEY`); in
  development they can be kept in a local folder (`PHOTO_STORAGE_DIR`). Without
  either, reports still work and the app says the photo was not sent.
- Photo orientation information is removed together with the other metadata;
  the app re-encodes photos on the phone, which normally keeps them upright.
- The safety map shows verified incidents until security resolves them; nothing
  expires automatically.
- Duplicate reports more than 30 minutes apart start separate incidents;
  security merges them on the dashboard.

## Known limitations (Module 4)

- Urgent announcements are pushed only to phones that registered for
  notifications, and only when Firebase is configured on the server; otherwise
  the dashboard shows them as "not sent" and the app still shows them on Home.
- An announcement that reaches its end time disappears from the app the next
  time the list is loaded (no separate "ended" event).
- Analytics count what SafeWalk recorded. Response times come from the status
  buttons security presses, so they are only as accurate as those presses.
- Map tiles come from OpenStreetMap; for heavy production use a tile provider
  should be configured (`VITE_TILE_URL`, `TILE_URL`).

## Rules in one line

Branch, pull request, review, merge. Never push to `main`. See `docs/04-team-workflow.md`.
