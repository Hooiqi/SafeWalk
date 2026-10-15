# M3: Incident reporting and safety map

**Owner:** @member3

## Purpose
Let students report incidents and unsafe places, and let everyone see verified incidents on one map.

## Scope

**Must have**
- Report form: category, severity, "happening now" or "after the incident", location (GPS or pin on map), description, anonymous option
- New reports are saved as PENDING
- Safety map: pins for VERIFIED incidents, colour-coded by severity, tap for details
- My reports: list with status (pending, verified, rejected, resolved)
- Filters by category and time

**Extras**
- Heatmap and marker clustering
- Photo upload
- Fast "report happening now" shortcut

## Rules
- The public map shows only VERIFIED incidents.
- A student sees their own pending reports only in My reports.
- Anonymous reports store no user ID.
- Alerts and map details never show victim names or private details.

## Data
| Reads | Writes |
|---|---|
| `incidents` (VERIFIED, plus the user's own) | `incidents` (status PENDING) |

## Gives to other modules
M4 receives PENDING reports in its review queue, verifies or rejects them, and the verified ones appear on this map.

## Progress
- [ ] Report form and save
- [ ] Safety map with pins
- [ ] Detail card
- [ ] My reports
- [ ] Filters
- [ ] Heatmap and clustering (extra)
- [ ] Tests with seed data
- [ ] Integration test with M4
