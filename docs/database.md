# Database

Supabase PostgreSQL with PostGIS. Migrations: `supabase/migrations/`.
All location columns are `geography(…, 4326)` (WGS 84 latitude/longitude, distances in metres).

## ERD entities (proposal Diagram 12.5) to tables

| ERD entity | Table | Created in | Notes |
|---|---|---|---|
| USER | `app_user` | `20261106000100` | `user` is reserved in PostgreSQL. `user_id` references Supabase `auth.users`; the row is created by a trigger at sign-up |
| SECURITY_STAFF | `security_staff` | `20261106000100` | The admin email allow-list |
| TRUSTED_CONTACT | `trusted_contact` | `20261106000100` | |
| TRIP | `trip` | `20261106000100` | |
| LOCATION_LOG | `location_log` | `20261106000100` | |
| SOS_ALERT | `sos_alert` | `20261106000100` | Shared by Module 1 (trigger `ETA`) and Module 2 (`HOLD`, `SILENT`) |
| ALERT_STATUS_LOG | `alert_status_log` | `20261106000100` | `staff_id` is null for system entries |
| SAFE_POINT | `safe_point` | `20261107000100` | 21 team-supplied points loaded by `20261107000200` without coordinates (pinned by staff) |
| INCIDENT_GROUP | `incident_group` | `20261110000100` | One incident on the map, made of one or more reports |
| INCIDENT_REPORT | `incident_report` | `20261110000100` | `user_id` is null for anonymous reports (see `incident_report_owner`) |
| ANNOUNCEMENT | `announcement` | `20261110000200` | ERD `announce_id`, `staff_id`, `title`, `message_body`, `priority` (INFO, ADVISORY, URGENT), `published_at` (a future time schedules it) |

Each module adds its own tables when it is built, so the schema is reviewed
with the code that uses it.

## Additions beyond the ERD

| Table.column | Why |
|---|---|
| `trip_trusted_contact` (table) | The proposal says contacts are chosen per trip; the ERD has no table for that choice |
| `trip.destination_label` | Readable destination for contacts and history |
| `trip.route_distance_m`, `route_duration_s`, `route_source` | Keep the OSRM result and flag straight-line estimates |
| `trip.extension_count` | Limit how often the ETA can be extended |
| `trip.signal_lost_at` | Heartbeat monitoring result shown to contacts and security |
| `trip.escalated_at`, `ended_at`, `end_reason` | Record state-machine transitions |
| `trip.share_expires_at` | Tracking-link expiry after the trip ends |
| `trip.updated_at` | Auditing |
| `location_log.accuracy_m`, `received_at` | GPS accuracy and server receipt time |
| `security_staff.is_active`, `created_at` | Disable staff without deleting history |
| `trusted_contact.created_at` | Auditing |
| `alert_status` value `NEW` | Alert not yet acknowledged by staff (see PLAN.md A3) |
| `sos_alert.client_request_id` | Idempotency key: a retried SOS request never creates a second alert |
| `sos_alert.accuracy_m`, `share_token`, `share_expires_at` | GPS accuracy; live link for trusted contacts and its expiry |
| `sos_alert.user_safe_at` | The person reported they are safe (sharing stops; security still resolves) |
| `alert_status_log.note` | What the officer arranged ("Patrol 2 dispatched") |
| `incident_group.last_reported_at` | Time window for grouping and auto-verification |
| `incident_group.reviewed_at`, `resolved_at` | When security verified, rejected or resolved it |
| `incident_group.public_note`, `staff_note` | A note everyone sees on the map; an internal note for security |
| `incident_group.updated_at` | Auditing |
| `incident_report.category`, `severity_level` | What each person chose; the incident keeps the highest severity |
| `incident_report.accuracy_m` | GPS accuracy when the pin is the phone's position |
| `announcement.expires_at` | Optional end time: hidden from the app afterwards |
| `announcement.withdrawn_at`, `withdrawn_by` | Taken down early by security, and by whom |
| `announcement.announced_at` | When the app was told (socket, and push if URGENT); claimed with a conditional UPDATE so it is announced and pushed once |
| `announcement.push_summary` | Push delivery counts for the dashboard (`recipients`, `sent`, `failed`, `skipped`) |
| `announcement.created_at`, `updated_at` | Auditing |
| `incident_report_owner` (table) | Private link from every report to its sender: "My reports", one vote per person for auto-verification, rate limiting. Readable only by its owner (no staff policy), so anonymous reports stay anonymous to security (PLAN A20) |
| Storage bucket `incident-photos` | Private; photos are served to staff through the API after EXIF removal |
| `location_log.alert_id` (and `trip_id` nullable) | Location history of an SOS raised outside a journey; each row belongs to exactly one trip or alert |
| `trip_end_reason` value `RESOLVED_BY_SECURITY` | Security resolved the overdue alert of an escalated journey |
| `safe_point.name` + `category` | The ERD's single `name_and_category` column, split for filtering (PLAN.md A16) |
| `safe_point.opening_schedule` | Machine-readable weekly hours used to filter by "open now"; `operating_hours` keeps the text shown to users |
| `safe_point.location_description`, `contact_notes`, `notes`, `data_source`, `is_active` | Display details, other numbers, exceptions (holidays), provenance, retire without deleting |

## Constraints that enforce business rules

- `trip_one_open_per_user`: at most one ACTIVE / GRACE_PROMPT / ESCALATED trip per user.
- `sos_alert_one_eta_per_trip`: a trip escalates at most once.
- `location_log_trip_sample_key (trip_id, recorded_at)`: a resent GPS sample is ignored.
- `trusted_contact_has_channel`: a contact needs a phone, Telegram id or email.
- Phone numbers must be in international format (`+60…`).
- `sos_alert_request_key (user_id, client_request_id)` and `sos_alert_one_open_sos_per_user`: no duplicate SOS alerts.
- `location_log_one_owner`: a location sample belongs to a trip or an alert, never both.

## Opening hours

`public.safe_point_is_open(schedule, at)` evaluates a schedule in Malaysia time
(`{"always": true}` or `{"weekly": {"mon": [["08:00","17:00"]], …}}`; a range
ending at or before its start runs past midnight). The navigator filters with it
before the k-NN search. `apps/server/src/modules/safePoints/openingHours.js`
computes "closes at / opens at" for display, and a test checks that both agree
for every stored schedule across a full week.

## Row Level Security

Defined in `20261106000200_auth_and_rls.sql`; tested in `apps/server/test/trackingAndRls.test.js`.

| Table | Student / staff user | Security staff | anon |
|---|---|---|---|
| `app_user` | read/update own | read | none |
| `security_staff` | none | read | none |
| `trusted_contact` | full access to own | none | none |
| `trip`, `trip_trusted_contact`, `location_log` | read own | read escalated trips only | none |
| `sos_alert` | read own | read, update status | none |
| `alert_status_log` | read own alerts' log | read, insert as self | none |
| `safe_point` | read active | read all, insert, update | none |
| `announcement` | read live ones | read all, insert, update | none |

Trips, location logs and alerts are written only by the Node server, which
connects with the database connection string (table owner, bypasses RLS) and
applies its own authorisation. Clients have no INSERT/UPDATE policies on those
tables, so the anon key plus a user token cannot forge them.

Security staff are recognised by `public.is_security_staff(uid)`: the user's
Supabase Auth email must be **confirmed** and match an active
`security_staff.admin_email`. The server uses the same function, so the API
and RLS cannot disagree.

## Seed data

`supabase/seed.sql` inserts one clearly labelled placeholder staff email
(`security.demo@safewalk.test`) for local development only.
