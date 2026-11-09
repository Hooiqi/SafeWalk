# Setup, running and demo

## Prerequisites

- Node.js 20 or newer
- Flutter 3.47 or newer (Dart 3.13; see `apps/mobile/pubspec.yaml`) and an Android emulator or phone
- Supabase: the Supabase CLI with Docker (local), or a free Supabase cloud project

## 1. Database and auth (Supabase)

**Local (recommended for development):**

```bash
supabase start
```

```bash
supabase db reset
```

`db reset` applies `supabase/migrations` and `supabase/seed.sql`.
`supabase status` prints the API URL, anon key, JWT secret and the database URL.
Confirmation emails are caught by Inbucket at http://localhost:54324.

**Cloud project:** link and push the migrations, then run the INSERT from
`supabase/seed.sql` with your real staff emails in the SQL editor.

```bash
supabase link --project-ref <your-project-ref>
```

```bash
supabase db push
```

Staff accounts: add the email to `security_staff`, then create the user in
Supabase Auth (Dashboard > Authentication > Add user, or sign up) and confirm
the email. Unconfirmed emails never get staff access.

## 2. Server

```bash
npm install
```

```bash
cp apps/server/.env.example apps/server/.env
```

Fill in `DATABASE_URL` and either `SUPABASE_URL` (JWKS) or, for the local
CLI, `SUPABASE_JWT_SECRET`. Then:

```bash
npm run dev:server
```

## 3. Web apps

```bash
cp apps/tracking/.env.example apps/tracking/.env
```

```bash
cp apps/dashboard/.env.example apps/dashboard/.env
```

Set `VITE_SUPABASE_ANON_KEY` in the dashboard `.env`. Then, in two terminals:

```bash
npm run dev:tracking
```

```bash
npm run dev:dashboard
```

Tracking page: http://localhost:5173/t/<token>. Dashboard: http://localhost:5174.

The public landing page needs no keys:

```bash
npm run dev:landing
```

It runs at http://localhost:5175. Its buttons point at the local app and
dashboard; for a deployment, copy `apps/landing/.env.example` to
`apps/landing/.env` and set `VITE_APP_URL` and `VITE_DASHBOARD_URL`.

## 4. Mobile app

See `apps/mobile/README.md`.

## 5. Tests

Server tests need a PostgreSQL 14+ server with PostGIS 3 (they create and drop
`safewalk_test_*` databases). Set `TEST_ADMIN_DATABASE_URL` if it is not
`postgres://postgres:postgres@localhost:5432/postgres`. The Supabase CLI
database works: `postgres://postgres:postgres@127.0.0.1:54322/postgres`.

```bash
npm test
```

```bash
cd apps/mobile && flutter test
```

## 6. Put the safe points on the map (once)

The 21 safe points supplied by the team are loaded by the migrations, but the
list has no coordinates, so none are on the map yet. Sign in to the dashboard as
security staff, open **Safe points**, select each point (filter "Needs
location"), click its position on the map and press **Save**. Hours, phone
numbers and notes can be corrected on the same form. The student app shows
only points that are active and pinned.

## 7. Demonstrating Module 3

Photos: in development the server keeps them in `PHOTO_STORAGE_DIR`
(`./.data/incident-photos` in `.env.example`). With a Supabase project, set
`SUPABASE_SERVICE_ROLE_KEY` instead; the migration creates the private
`incident-photos` bucket.

1. In the app, open **Report an incident** on Home. Choose what happened and how
   serious it is, describe it, check the pin (your GPS position; tap the map to
   move it), optionally report anonymously and add a photo, then **Send report**.
2. The dashboard's **Safety reports** page shows it at once. Open it, adjust the
   severity, add a note for everyone and press **Verify and show on map**.
   **Mark resolved** takes it off the map; **Reject as false** removes it.
   Nearby duplicates can be merged with **Merge here**.
3. In the app, **My reports** updates live; **Safety map** shows the incident,
   coloured by severity. Tap a pin for details.
4. Auto-verification: three different accounts reporting the same category
   within 50 m and 30 minutes put the incident on the map without review.
5. Plan a walk that passes a verified incident: the start screen warns about it.

## 8. Demonstrating Module 2

1. In the app, open **SOS** and hold the button for 3 seconds (or turn on
   **Silent SOS** first). A quick tap does nothing.
2. The dashboard's **Live emergencies** shows the SOS with an alarm (enable sound
   once per session). Press **Received alert**, **On the way** (with a note),
   **Arrived at location**, **Resolved**; the phone and the contact's live link
   update immediately.
3. The trusted contact receives the live link (SMS / Telegram / email when
   configured; otherwise use **Share live location link** in the app).
4. **Safe points** in the app lists the nearest places that are open now, ranked
   by walking time, with call and directions.
5. **I'm safe now** stops location sharing; security still resolves the alert.

The emergency call buttons use `+604-653 4999` (USM Security) and `999`.
Change them with `--dart-define=USM_SECURITY_EMERGENCY=+60...` if needed.

## 9. Demonstrating Module 1

For a demo without a long walk, set `DEV_ETA_OVERRIDE_SECONDS=60` in
`apps/server/.env` (ignored in production) and restart the server.

1. Register in the app, add a trusted contact, start a journey.
2. Open the tracking link (shown in the server log and shareable from the app) in a browser.
3. Sign in to the dashboard as an allow-listed, confirmed staff email.
4. Let the ETA pass: the app shows the check-in prompt (3 minutes).
5. Do not respond: the trip escalates, the dashboard shows the alert with an alarm,
   the tracking page shows the emergency state, and contacts are messaged on every
   configured channel (unconfigured channels are logged as "skipped").

Without a phone, `npm run simulate-walk -w @safewalk/server -- --email … --password … --stop-after 3`
plays the phone's part with a real test account (see the script header).

## Environment variables

All variables are documented in `apps/server/.env.example`,
`apps/dashboard/.env.example`, `apps/tracking/.env.example`,
`apps/landing/.env.example` and
`apps/mobile/env/dev.example.json`. Never commit real `.env` files or keys.
The service-role key and database URL are used only by the server.
