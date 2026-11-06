# SafeWalk

Campus safety platform for Universiti Sains Malaysia (CAT304 Group Innovation
Project, Group 12). Students and staff share a live walk with trusted
contacts; a server-side watchdog alerts those contacts and the USM Security
Department if they do not arrive and do not respond.

> **Status (6 Nov 2026):** project setup and **Module 1 (Live Trip Sharing and
> ETA Monitoring)** are implemented and tested. Modules 2 to 4 follow the
> proposal's sprint plan. See [docs/PLAN.md](docs/PLAN.md) for the full
> requirements traceability matrix.

## Modules (proposal 5.1)

| Module | State |
|---|---|
| M1 Live trip sharing and ETA monitoring | Implemented |
| M2 Emergency SOS and safe point navigator | Planned (alert tables ready) |
| M3 Incident reporting and safety map | Planned |
| M4 Admin centralised security dashboard | Staff login and live overdue-alert view implemented; rest planned |

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
| [docs/setup.md](docs/setup.md) | Install, environment variables, running, tests, Module 1 demo |
| [docs/database.md](docs/database.md) | ERD mapping, additions, constraints, RLS |
| [docs/api.md](docs/api.md) | REST endpoints and Socket.io events |
| [docs/design.md](docs/design.md) | Palette and UI conventions |
| [docs/04-team-workflow.md](docs/04-team-workflow.md) | Git rules |

## Known limitations (Module 1)

- Contact SMS, Telegram, email and FCM push need credentials; without them the
  server logs each delivery as "skipped" and the app suggests sharing the link
  manually.
- Background location has not yet been tested on a physical Android or iOS device.
- The default OSRM server is a fair-use public service; production use needs a
  self-hosted OSRM with the foot profile.
- Checking known hazards before a walk depends on the Module 3 safety map.

## Rules in one line

Branch, pull request, review, merge. Never push to `main`. See `docs/04-team-workflow.md`.
