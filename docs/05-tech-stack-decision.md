# Tech stack decision

**Status:** decided by the Extended Project Proposal, Table 5.1 (23 Oct 2026).

## What we need

| Need | Why | Decision |
|---|---|---|
| Mobile app | Students use it on their phones (Android first, iOS if possible) | |
| Backend and database | Store trips, alerts, reports. Real-time updates. | |
| Server-side scheduled job | Detect a missed ETA even if the phone is off | |
| Push notifications | Alerts to contacts, security, and campus advisories | |
| Maps and location | Live location, safety map, nearest safe places | |
| Security dashboard | Web page for security staff (M4) | |
| Login | Only USM accounts, with roles | |
| Hosting | Where the dashboard and backend run | |

## Questions to answer

- Does everyone know the chosen tools, or can we learn them in time?
- Is it free for a prototype? Does it need a payment card?
- Does the assignment brief limit what we can use?
- Can each person build their module and test it alone?
- Can we demo it on a real phone?

## Options discussed

(Add rows here. One example from earlier planning: Flutter app with Firebase backend and a React dashboard. It is a candidate, not a decision.)

| Option | Pros | Cons |
|---|---|---|
| | | |

## Final decision

From the Extended Project Proposal (Table 5.1 and Diagram 12.7):

| Need | Decision |
|---|---|
| Mobile app | Flutter (Dart) |
| Security dashboard and tracking page | React.js (Vite) |
| Backend | Node.js + Express |
| Real-time | Socket.io |
| Scheduled job (ETA watchdog) | node-cron on the server |
| Database | Supabase PostgreSQL + PostGIS |
| Login and access control | Supabase Auth + Row Level Security, staff email allow-list |
| File storage | Supabase Storage (Module 3 photos) |
| Maps and routing | OpenStreetMap + Leaflet (web), flutter_map (Flutter), OSRM walking API |
| Push notifications | Firebase Cloud Messaging |
| Contact alerts | Twilio SMS, Telegram Bot API, email (Nodemailer) |
| Version control | GitHub |

