# Data contract and naming rules

This is the shared agreement between the four modules. It does not depend on any technology. When the tech stack is chosen, translate it into the real database.

**Rules**
1. Never type shared names or values by hand in more than one place. Keep one list (this file, later a constants file).
2. Changing a shared name or field needs approval from all four owners, in one pull request together with the code that uses it.
3. The contract is frozen after week 1. Adding a new optional field is fine if you tell the team. Renaming or deleting a field needs full approval.

## Naming

| Thing | Style | Example |
|---|---|---|
| Entity (table or collection) | `snake_case`, plural | `sos_events` |
| Field | `camelCase` | `userId`, `lastLocation` |
| Enum value | `UPPER_SNAKE_CASE` | `MISSED_ETA` |
| Boolean | `is` or `has` prefix | `isAnonymous` |
| List | plural noun | `sharedWith` |
| Field with a unit | unit suffix | `graceMin`, `distanceM` |

## Data formats

- **IDs:** system-generated. Never use names, emails, or student IDs as IDs.
- **Time:** UTC. Show Malaysia time (Asia/Kuala_Lumpur) in the UI only.
- **Place:** one `location` field with latitude and longitude. Use `lastLocation` and `lastLocationAt` for a moving user.
- **Units:** meters for distance, minutes for duration, stated in the field name.
- **Phone numbers:** international format, for example `+60123456789`.
- **Optional fields:** leave them out. No null and no empty strings.
- **Every record has:** `createdAt`, `updatedAt`, `createdBy` (user ID, or `SYSTEM`). Anonymous reports store no `createdBy`.

## Shared values

| Name | Allowed values |
|---|---|
| `userRole` | `STUDENT`, `STAFF`, `SECURITY`, `ADMIN` |
| `tripStatus` | `ACTIVE`, `ARRIVED`, `MISSED`, `CANCELLED` |
| `alertType` | `MISSED_ETA`, `SOS`, `PUBLIC_ADVISORY` |
| `alertStatus` | `NEW`, `ACKNOWLEDGED`, `DISPATCHED`, `RESOLVED` |
| `severity` | `MINOR`, `MODERATE`, `SERIOUS` |
| `incidentCategory` | `POOR_LIGHTING`, `SUSPICIOUS_ACTIVITY`, `HARASSMENT`, `ASSAULT`, `ROAD_ACCIDENT`, `ANIMAL_HAZARD`, `OTHER` |
| `incidentStatus` | `PENDING`, `VERIFIED`, `REJECTED`, `RESOLVED` |
| `reportTiming` | `HAPPENING_NOW`, `AFTER_INCIDENT` |
| `safeLocationType` | `SECURITY_BOOTH`, `GUARD_POST`, `CLINIC`, `OPEN_24H` |

## Entities

(opt) = optional. Every entity also has the standard fields above, except `audit_logs` (no `updatedAt`).

| Entity | Written by | Fields |
|---|---|---|
| `users` | Shared | `name`, `role` (userRole), `phoneNumber` (opt), `notificationToken` (opt) |
| `contacts` | M1 | `userId`, `contactUserId`, `status` (PENDING or ACCEPTED) |
| `trips` | M1 | `userId`, `sharedWith` (list of user IDs), `origin`, `destination`, `eta`, `graceMin`, `status` (tripStatus), `lastLocation`, `lastLocationAt` |
| `sos_events` | M2 | `userId`, `location`, `status` (alertStatus) |
| `safe_locations` | M2 | `name`, `type` (safeLocationType), `location`, `openHours` (opt), `contactNumber` (opt) |
| `incidents` | M3 (M4 staff update status) | `category`, `severity`, `reportTiming`, `description`, `location`, `photoUrls` (opt), `isAnonymous`, `status` (starts as PENDING), `verifiedBy` (opt), `verifiedAt` (opt), `rejectReason` (opt) |
| `alerts` | M1, M2, M3, M4 staff | `type`, `severity`, `status`, `message`, `sourceId`, `userId` (opt), `location` (opt), `targetUserIds` (opt), `handledBy` (opt) |
| `audit_logs` | M4 | `action`, `targetEntity`, `targetId`, `performedBy`, `note` (opt). Never edited or deleted. |

## Notifications

- Notification data keys use `camelCase`, for example `alertId`, `type`, `severity`.
- Messages never include a victim's name or exact private details.
