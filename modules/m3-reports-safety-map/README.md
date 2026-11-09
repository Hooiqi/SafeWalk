# M3: Incident reporting and safety map

> **Note (6 Nov 2026):** the Extended Project Proposal is now the source of truth
> for this module's scope (section 5.1 and Diagram 12.x). Code goes in the apps
> (`apps/server/src/modules/…`, `apps/mobile/lib/features/…`, `apps/dashboard`),
> not in this folder. See `docs/PLAN.md` for the requirement list. The scope
> below is from the earlier planning stage.

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
| `incident_group` (VERIFIED, plus the user's own reports) | `incident_report` (its incident starts PENDING) |

## Gives to other modules
M4 receives PENDING reports in its review queue, verifies or rejects them, and the verified ones appear on this map.

## Progress (9 Nov 2026)
- [x] Report form and save (category, severity, pin, description, anonymous, optional photo)
- [x] Safety map with colour-coded pins, loaded for the visible area only
- [x] Detail sheet
- [x] My reports with live status
- [x] Crowdsourced auto-verification (3 people, 50 m, 30 minutes)
- [x] Hazard warning when planning a walk (Module 1)
- [x] Review queue in the dashboard: verify, reject, resolve, merge duplicates (Module 4)
- [x] Tests: `apps/server/test/incidents.test.js`, `socket.test.js`, `apps/mobile/test/incidents_test.dart`
- [ ] Filters by category and time on the map (extra)
- [ ] Heatmap and clustering (extra)

Decisions taken while building it are A20 to A24 in `docs/PLAN.md`.
