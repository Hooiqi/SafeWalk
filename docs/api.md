# SafeWalk server API

Base URL: `http://localhost:4000` in development. JSON uses `snake_case`.
Authenticated routes need `Authorization: Bearer <Supabase access token>`.
Errors: `{ "error": { "code": "TRIP_ALREADY_OPEN", "message": "…", "details": [...] } }`.

## Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + database check |
| GET | `/api/track/:token` | Trusted-contact view of one journey. `404` unknown, `410 LINK_EXPIRED`. Rate limited per IP |

## Student / staff user (`requireAppUser`)

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/me` | | Profile |
| PATCH | `/api/me` | `full_name?`, `matric_or_staff_id?`, `phone_number?`, `device_fcm_token?` | Update profile |
| GET | `/api/contacts` | | Trusted contacts |
| POST | `/api/contacts` | `contact_name`, at least one of `phone_number`, `email`, `telegram_chat_id` | Add (max 10) |
| PATCH / DELETE | `/api/contacts/:id` | | Edit / remove own contact |
| POST | `/api/trips/route-preview` | `origin`, `destination` (`{lat,lng}`) | OSRM walking route: `distance_m`, `duration_s`, `geometry`, `source` |
| POST | `/api/trips` | `origin`, `destination`, `contact_ids[]`, `destination_label?`, `battery_level?`, `accuracy_m?` | Start journey. Returns trip, `tracking_url`, `link_delivery[]`. `409 TRIP_ALREADY_OPEN` |
| GET | `/api/trips/active` | | `{ trip }` or `{ trip: null }` |
| GET | `/api/trips?limit=&before=` | | History, newest first |
| GET | `/api/trips/:id` | | One own trip |
| POST | `/api/trips/:id/locations` | `samples[]` (`lat`, `lng`, `recorded_at`, `battery_level?`, `accuracy_m?`, `is_heartbeat?`) | HTTP fallback / offline flush |
| POST | `/api/trips/:id/extend` | `minutes`: 5, 10 or 15 | ACTIVE or GRACE_PROMPT to ACTIVE |
| POST | `/api/trips/:id/arrive` | | To COMPLETED (`ARRIVED`) |
| POST | `/api/trips/:id/confirm-safe` | | GRACE_PROMPT or ESCALATED to COMPLETED (`SAFE_CONFIRMED`) |
| POST | `/api/trips/:id/cancel` | | ACTIVE to CANCELLED |

Illegal transitions return `409 INVALID_TRIP_STATE`.

### Module 2: SOS and safe points

| Method | Path | Body / query | Description |
|---|---|---|---|
| POST | `/api/sos` | `trigger_type` (`HOLD`/`SILENT`), `client_request_id` (UUID, reuse on retry), `location?`, `accuracy_m?`, `battery_level?`, `recorded_at?` | Raise an SOS. `201` new, `200` with `existing: true` when it is a retry or an SOS is already open. Returns `tracking_url` and `status_history` |
| GET | `/api/sos/active` | | `{ alert }` or `{ alert: null }` |
| GET | `/api/sos/:id` | | Own alert with the security response timeline |
| POST | `/api/sos/:id/locations` | `samples[]` | HTTP fallback for live location. `409 SOS_NOT_ACTIVE` after it ends |
| POST | `/api/sos/:id/safe` | | User reports they are safe (sharing stops, contacts and security told) |
| GET | `/api/safe-points` | | Active safe points with a location, `opening` status; `pending_location_count` |
| GET | `/api/safe-points/nearest?lat=&lng=&limit=` | | Open now (Malaysia time), k-NN, ranked by walking time (`walking.source` = `OSRM` or `STRAIGHT_LINE_ESTIMATE`) |
| GET | `/api/safe-points/:id/directions?lat=&lng=` | | Walking route with `steps[]` (instruction, distance) |

## Security staff (`requireSecurityStaff`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/staff/me` | Staff profile; records `last_login` |
| GET | `/api/staff/alerts?scope=open\|all` | Alerts with user identity and last location |
| GET | `/api/staff/alerts/:id` | One alert with location history (`trail`), `last_location` and `status_history` |
| POST | `/api/staff/alerts/:id/status` | `{ status: RECEIVED \| ON_THE_WAY \| ARRIVED \| RESOLVED, note? }`. Forward only (`409 INVALID_ALERT_STATUS`); concurrent change `409 ALERT_CHANGED`. Resolving an overdue alert also closes its journey |
| GET | `/api/staff/safe-points` | All safe points incl. inactive and unpinned, with `opening_schedule` |
| POST | `/api/staff/safe-points` | Create (name, category, location or null, operating_hours, opening_schedule, contact_phone, …) |
| PATCH | `/api/staff/safe-points/:id` | Update any field; records the officer in `updated_by` |

## Socket.io

Connect with `auth: { token }` (Supabase JWT) or `auth: { shareToken }` (tracking link).
The server places the socket in rooms; clients cannot join rooms themselves.
Every server event includes `event_id` (for de-duplication) and `emitted_at`.

| Event | Direction | Who | Payload |
|---|---|---|---|
| `trip:location` | client to server | trip owner | `{ trip_id, sample }`, acknowledged with `{ ok, accepted, duplicates, rejected }` or `{ ok: false, error }` |
| `trip:heartbeat` | client to server | trip owner | same as above, stored with `is_heartbeat = true` |
| `sos:location` | client to server | person who raised the SOS | `{ alert_id, sample }`, acknowledged like `trip:location` |
| `trip:status` | server to client | owner, link viewers, staff (escalated trips) | `{ trip_id, status, eta_deadline, grace_expires_at, ended_at, end_reason, escalated_at }` |
| `trip:grace_prompt` | server to client | owner | `{ trip_id, grace_expires_at }` |
| `trip:position` | server to client | link viewers | `{ trip_id, lat, lng, recorded_at, battery_level, accuracy_m }` |
| `trip:signal` | server to client | owner, viewers, staff | `{ trip_id, signal_lost, signal_lost_at }` |
| `alert:new` | server to client | staff | `{ alert }` (same shape as `GET /api/staff/alerts/:id`) |
| `alert:position` | server to client | staff, SOS link viewers | live position of an SOS (`alert_id`) or an escalated trip (`trip_id`) |
| `alert:status` | server to client | staff, the person, SOS / journey link viewers | `{ alert_id, trigger_type, trip_id, status, resolved_at, user_safe_at, latest: { new_status, updated_at, staff_name, note } }` |
| `auth:expired` | server to client | any | the token expired; reconnect with a fresh one |
