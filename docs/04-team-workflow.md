# Team workflow

Mandatory for all four members. Five minutes to read.

## The 10 rules

1. **Never push to `main`.** Use a branch and a pull request.
2. **One branch = one small task.** Under about 300 changed lines.
3. **Stay in your own module folder.** Need a change elsewhere? Ask the owner.
4. **Checks must pass** before you merge (once automatic checks are set up).
5. **Every pull request needs 1 approval.** Shared files need all other owners. Nobody approves their own.
6. **No secrets in the repo.** No keys, passwords, or service account files.
7. **Fake data only** in tests, seed data, screenshots, and demos.
8. **Follow the data contract.** No made-up names or values.
9. **Test locally first**, not on the real database.
10. **If you break `main`, fix or revert it at once** and tell the team.

## Ownership

Each module folder belongs to one owner (see `.github/CODEOWNERS`).

**Shared files** (all four owners approve): `docs/03-data-contract.md`, `shared/`, `.github/`, and the root `README.md`.

## Daily workflow

```
git checkout main && git pull origin main
git checkout -b feature/m3-report-form
# work, commit small and often
git pull origin main               # get the latest main BEFORE you push
git push -u origin feature/m3-report-form
```

Open a pull request, fill in the template, get one review, **squash and merge**, delete the branch.

- **Branches:** `feature/m1-...`, `fix/m3-...`, `docs/...`
- **Commits:** `type(scope): message`, for example `feat(m2): add SOS hold button`. Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`.

## Avoiding merge conflicts

1. Work only in your own folder.
2. Keep branches short. Merge within 1 to 3 days.
3. Pull `main` every day and again before you push.
4. Announce edits to shared files in the group chat. Keep those pull requests tiny and merge them the same day.
5. Format code with the same tool before every commit. Do not reformat files you did not change. Do not rename or move files without telling the team.
6. Add dependencies in their own small pull request.

**If a conflict happens:** run `git pull origin main`, open each file with conflict markers, keep your lines, their lines, or both, delete the markers, test, commit, and push. Generated or lock files: take the version from `main` and regenerate. Unsure? Ask the file's owner. Never force-push.

## Reviews

- Review within **24 hours**.
- Check: matches the description? In the right folder? Follows the data contract? No secrets or debug code? Tests for important logic?
- Be specific and kind. Do not approve what you did not understand.

## Automatic checks (CI/CD)

Not set up yet. Add them after the tech stack is confirmed. Plan: checks on every pull request, protected `main`, and deployment after merge.

## Done means

Merged through a reviewed pull request, checks pass, tested (on a real phone if it uses location, calls, or notifications), important logic has a test, docs updated, no secrets or debug code.

## Changing this guide

Open a pull request. All four members approve.
