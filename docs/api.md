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

## Security staff (`requireSecurityStaff`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/staff/me` | Staff profile; records `last_login` |
| GET | `/api/staff/alerts?scope=open\|all` | Alerts with user identity and last location |
| GET | `/api/staff/alerts/:id` | One alert with route geometry and location history |

## Socket.io

Connect with `auth: { token }` (Supabase JWT) or `auth: { shareToken }` (tracking link).
The server places the socket in rooms; clients cannot join rooms themselves.
Every server event includes `event_id` (for de-duplication) and `emitted_at`.

| Event | Direction | Who | Payload |
|---|---|---|---|
| `trip:location` | client to server | trip owner | `{ trip_id, sample }`, acknowledged with `{ ok, accepted, duplicates, rejected }` or `{ ok: false, error }` |
| `trip:heartbeat` | client to server | trip owner | same as above, stored with `is_heartbeat = true` |
| `trip:status` | server to client | owner, link viewers, staff (escalated trips) | `{ trip_id, status, eta_deadline, grace_expires_at, ended_at, end_reason, escalated_at }` |
| `trip:grace_prompt` | server to client | owner | `{ trip_id, grace_expires_at }` |
| `trip:position` | server to client | link viewers | `{ trip_id, lat, lng, recorded_at, battery_level, accuracy_m }` |
| `trip:signal` | server to client | owner, viewers, staff | `{ trip_id, signal_lost, signal_lost_at }` |
| `alert:new` | server to client | staff | `{ alert }` (same shape as `GET /api/staff/alerts/:id`) |
| `alert:position` | server to client | staff | live position of an escalated trip |
| `auth:expired` | server to client | any | the token expired; reconnect with a fresh one |
