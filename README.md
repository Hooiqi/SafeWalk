# SafeWalk

A campus safety system for USM. It helps students and staff share trips, call for help fast, report unsafe places, and receive verified safety alerts. Security staff get one place to see and respond.

> **Status:** planning. The tech stack is not confirmed yet. See `docs/05-tech-stack-decision.md`.

## The four modules

| Module | What it does |
|---|---| 
| [M1 Trip and ETA](modules/m1-trip-eta/) | Share a live trip. Auto-alert contacts and security if the student does not arrive on time. |
| [M2 SOS and safe places](modules/m2-sos-safe-places/) | One-tap emergency call and location sharing. Shows the nearest booths and safe places. |
| [M3 Reports and safety map](modules/m3-reports-safety-map/) | Report incidents and unsafe spots. Everyone sees verified incidents on a map. |
| [M4 Alerts and dashboard](modules/m4-alerts-dashboard/) | Security dashboard, case tracking, verified advisories, and push notifications. | 

The modules are independent. They connect only through the shared data defined in `docs/03-data-contract.md`.

## Repo structure

```
safewalk/
├── README.md                    this file
├── docs/                        project documents (read these first)
│   ├── 01-problem-and-solution.md
│   ├── 02-system-overview.md
│   ├── 03-data-contract.md      shared names and data shapes
│   ├── 04-team-workflow.md      Git rules everyone follows
│   ├── 05-tech-stack-decision.md
│   └── wireframes/              screen designs
├── modules/                     one folder per module (code goes here)
│   ├── m1-trip-eta/
│   ├── m2-sos-safe-places/
│   ├── m3-reports-safety-map/
│   └── m4-alerts-dashboard/
├── shared/                      code or config used by more than one module
└── .github/                     code owners and pull request template
```

Each module folder has a `README.md` with its scope, the data it reads and writes, and a progress checklist. When the tech stack is confirmed, each owner creates their project inside their own module folder.

## Where to start

1. Read `docs/01` to `docs/04`.
2. Confirm the tech stack together (`docs/05`).
3. Agree and freeze the data contract (`docs/03`).
4. Each owner works only inside their own module folder.

## Rules in one line

Branch, pull request, review, merge. Never push to `main`. Stay in your own folder. See `docs/04-team-workflow.md`.
