# M2: Emergency SOS and safe places

**Owner:** @member2

## Purpose
Get help fast and guide the student to the nearest safe place.

## Scope

**Must have**
- Large SOS button with press-and-hold, so it does not trigger by accident
- On trigger: call USM security, with a second button for 999
- Save the SOS event with location, create an SOS alert, and share location with trusted contacts
- Safe places list and map: nearest security booths, guard posts, clinics, and 24-hour places, sorted by distance
- Navigate to a safe place

**Extras**
- Shake-to-trigger
- Discreet trigger mode

**Team task:** walk the campus and record real coordinates for `safe_locations`. This original data is a strong point for the viva.

## Data
| Reads | Writes |
|---|---|
| `contacts`, `safe_locations` | `sos_events`, `alerts` (type SOS), `safe_locations` |

## Gives to other modules
M4 receives SOS alerts with the location and shows them at the top of the security queue.

## Notes
- Use a test phone number in demos, never the real security line.
- Keep 8 to 10 real safe locations so the nearest-first list looks convincing.

## Progress
- [ ] SOS button and call buttons
- [ ] Save SOS event and alert
- [ ] Notify trusted contacts
- [ ] Safe locations data collected
- [ ] Nearest-first list and map
- [ ] Tests with seed data
- [ ] Integration test with M4
