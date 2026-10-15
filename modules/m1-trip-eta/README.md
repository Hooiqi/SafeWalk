# M1: Trip sharing and ETA monitoring

**Owner:** @member1

## Purpose
Let a student share a trip with trusted people, and alert them and security automatically if the student does not arrive on time.

## Scope

**Must have**
- Trusted contacts: find a registered user, send and accept a request
- Create a trip: destination, ETA, grace period, who to share with
- Live location sharing during the trip
- Contact view: live position and ETA countdown
- "I have arrived", extend ETA, cancel trip
- **Missed-ETA check on the server:** if the trip is overdue after the grace period, mark it MISSED and create a MISSED_ETA alert with the last known location

**Extras**
- Trip history
- Battery-friendly location updates

## Data
| Reads | Writes |
|---|---|
| `users`, `contacts` | `contacts`, `trips`, `alerts` (type MISSED_ETA) |

## Gives to other modules
M4 receives MISSED_ETA alerts and shows them to security.

## Hard parts
Location tracking while the screen is off (differs between phones), and testing the missed-ETA check. Test on a real phone early.

## Progress
- [ ] Contacts
- [ ] Create and run a trip
- [ ] Live location sharing
- [ ] Contact view
- [ ] Missed-ETA check
- [ ] Tests with seed data
- [ ] Integration test with M4
