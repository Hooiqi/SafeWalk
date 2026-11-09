# Design system

Since 9 Nov 2026 every SafeWalk surface uses the **Dusk** theme from the
[Hallmark](https://github.com/Nutlope/hallmark) design skill. It replaces the
earlier "Dark mode: orange & pink" palette (decision A19 in `docs/PLAN.md`).
Dusk suits a safety service used after dark: a slate night with two calm signal
colours and nothing alarming on screen until something is actually wrong.

## Colours

| Token (web) | Flutter `SwColors` | Value | Use |
|---|---|---|---|
| `--color-paper` | `background` | `#0E1017` | App and page background |
| `--color-paper-2` | `surface` | `#151820` | Bands, panels, navigation |
| `--color-paper-3` | `surfaceRaised` | `#1E212A` | Raised surfaces, inputs |
| `--color-rule` | `border` | `#2A2E36` | Dividers and outlines |
| `--color-ink` | `text` | `#F4F1ED` | Headings and body |
| `--color-ink-2` | `text2` | `#CACED4` | Secondary text, icons |
| `--color-muted` | `textMuted` | `#999FA9` | Captions, labels |
| `--color-accent` (periwinkle) | `primary` | `#A0B0F4` | Primary buttons, links, focus, **done / safe / on**, the route |
| `--color-accent-2` (apricot) | `secondary`, `alert` | `#F4BA87` | **Open / waiting / needs attention**: SOS, check-ins, alerts, the person's position |
| `--color-error` | `error` | `#F47C70` | Form validation errors |

The web tokens are written in OKLCH in `packages/shared/styles/tokens.css`
(apps) and `apps/landing/src/tokens.css` (landing page). The hex values above
are their sRGB equivalents used in `apps/mobile/lib/core/theme.dart`.

Severity on the safety map (Module 3) adds one more colour, because the
proposal asks for colour-coded pins: **low** in bone (`--color-ink-2`),
**medium** in apricot, **high** in coral (`--color-error`). Each pin also shows
the category icon, and every severity label pairs its chevron icon with the word.

There are exactly two signals. Periwinkle means finished or fine, apricot means
open or waiting. Neither is red (the error colour is kept for form errors), so an emergency is apricot **plus an icon and
words** ("SOS sent", "Alert raised"); status is never shown by colour alone.

## Type

- Display: **Wix Madefor Display** 500 (headings, the wordmark, big numbers).
- Body: **Wix Madefor Text** 400/500/600.
- Tabular numbers for times, distances and counts.
- Sentence case everywhere. No tracked capitals, no eyebrow labels.

Web apps load both from Google Fonts. The Flutter app bundles them in
`apps/mobile/assets/fonts/` (SIL Open Font License, `OFL.txt`).

## Surfaces and shape

- Radius 18 px for cards, 10 px inside them, full pill for buttons and badges.
- Smoked glass (`.glass`) with a lit top edge for panels floating over maps.
- Bone "wells" (light cards) only on the landing page, to show a message as the
  recipient sees it.
- The landing hero sits on a photograph of the USM Penang main entrance at dusk
  (supplied by the team), graded towards the Dusk palette and kept under a slate
  scrim (`apps/landing/public/photos/`). Before publishing the page, confirm the
  team has permission to use that photograph.
- Spacing comes from `--space-*` tokens only.

## Conventions

- **Dashboard:** top bar (fewer than 7 destinations), the alert queue beside the
  selected alert's detail, map and response timeline.
- **Tracking page:** map full-screen on desktop with a floating glass status
  panel; stacked map then panel on phones.
- **Maps:** OpenStreetMap tiles darkened with a CSS filter on the web and
  `darkModeTileBuilder` in Flutter. Map colours are CSS classes (`.mark-route`,
  `.mark-person`, `.mark-point`, ...) defined in `packages/shared/styles/ui.css`,
  so no colour literals live in components.
- Every list and screen has loading, empty, error and full states.
- Every control has a visible `:focus-visible` ring; every animation has a
  reduced-motion fallback.
- Forms: visible labels, helper text explaining why data is collected, inline
  validation messages.

## Checking it

The Hallmark linter checks the web code statically and in a real browser:

```bash
node <hallmark>/skills/hallmark/scripts/sloplint.mjs apps/landing/index.html apps/landing/src --render --url http://localhost:5175/
```

Deliberate exceptions are marked in the stylesheets with a
`Hallmark · dismissed <rule>` comment and a reason.

## Screenshots

See `docs/screenshots/` (captured from the running apps with sample data; map
tiles were not reachable in the capture environment, so map backgrounds are blank).
