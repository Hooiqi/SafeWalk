# System overview

## Users

| Role | What they do |
|---|---|
| Student or staff | Share trips, call for help, report incidents, view the map, receive alerts |
| Security staff | Monitor alerts, verify reports, track cases, send advisories |
| Admin | Manage security accounts and settings |

## How the modules connect

```
M1 Trip and ETA ───────┐
                       │  writes alerts
M2 SOS and safe places ┼─────────────────►  M4 Alerts and dashboard
                       │                     (shows queue, sends notifications)
M3 Reports and map ────┘                              │
        ▲                                             │ verified reports,
        └─────────────────────────────────────────────┘ advisories
```

- M1 raises a **missed-ETA alert** when a trip is overdue.
- M2 raises an **SOS alert** when the emergency button is used.
- M3 stores incident reports as **pending**. M4 staff verify them, and only verified ones show on the public map.
- M4 turns alerts into notifications and gives security a live dashboard.

## Key design decisions

- **Independent modules.** Each module can be built and tested alone, using fake data.
- **Server-side ETA check.** A missed ETA must be detected even if the phone is off or dead.
- **Verify before public.** Public safety information is approved by security staff first, to stop false alarms and protect victims.
- **Emergencies are never delayed.** SOS and missed-ETA alerts go straight to security.
- **Privacy first.** Location is shared only with chosen contacts. Alerts never include victim names or private details. Anonymous reporting is available.
- **No AI screening.** Reports are reviewed by people.
