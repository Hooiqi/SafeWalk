# Design system

Visual reference: "Dark mode: orange & pink" palette (provided by the team).

## Palette (mandatory)

| Token | Hex | Use |
|---|---|---|
| Background | `#120F11` | App and page background |
| Surface | `#1E191C` | Cards, panels, navigation |
| Primary accent | `#FF6B81` | Primary buttons, active and emergency states |
| Secondary accent | `#FFA372` | Secondary emphasis, live route trail, warnings |
| Text primary | `#FDF9FA` | Headings and body |
| Text secondary | `#A89FA3` | Supporting text, labels |
| Border | `#322B2E` | Dividers and outlines |

Implemented in `packages/shared/styles/tokens.css` (web) and
`apps/mobile/lib/core/theme.dart` (Flutter). Only tints of these colours are
derived (e.g. a raised surface `#262024`); no other hues are used.

## Conventions

- The orange-to-pink gradient is used only for the SafeWalk wordmark.
- Status is never shown by colour alone: every badge has a text label
  (e.g. "Check-in needed", "Alert raised").
  Neutral = in progress, orange = needs attention, pink = emergency, grey = finished.
- Maps get most of the screen; status sits in a bottom sheet on phones and a side
  panel on wide screens. OpenStreetMap tiles are darkened (CSS filter on the web,
  `darkModeTileBuilder` in Flutter); markers are not.
- Typography: Inter on the web, the platform font in Flutter; one family,
  weights 400 to 700, tabular numbers for times and counts.
- Forms: visible labels, `*` for required fields, helper text explaining why
  data is collected, inline validation messages.
- Every list has loading, empty and error states.

## Screenshots

See `docs/screenshots/` (captured from the running apps with sample data; map
tiles were not reachable in the capture environment, so map backgrounds are blank).
