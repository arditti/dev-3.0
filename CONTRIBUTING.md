# Contributing to dev-3.0

Thanks for contributing! The canonical, exhaustive rulebook is [`AGENTS.md`](AGENTS.md) — it is written for AI coding agents working inside dev3 worktrees, but every rule in it applies to human contributors too. This file is the short path in: setup, the rules PRs most often bounce on, and what to expect from review.

## Setup

```bash
bun install
bun run dev     # build, package, launch locally (no HMR/watch flow — this is the only dev loop)
bun run lint    # TypeScript type-check
bun run test    # renderer + backend + CLI suites (~6s)
```

## Before opening a PR

The [pull request template](.github/pull_request_template.md) is the checklist; these are the rules behind its most-bounced items:

- **Changelog entry, dated to the merge day.** Every code change ships one file under `change-logs/YYYY/MM/DD/<type>-<slug>.md` — and `YYYY/MM/DD` is the day the PR is expected to **merge**, not the day you started. If the work spans days, `git mv` the entry before opening the PR. Format spec: [`change-logs/README.md`](change-logs/README.md).
- **Decision records — write them, and keep old ones honest.** Non-obvious choices, workarounds, and reverse-engineered behavior go in `decisions/YYYY/MM/DD/<slug>.md` (never numbered). If your change makes an **existing** record's claims false, add a supersede note to it pointing at a new record in the same commit — see [`decisions/README.md`](decisions/README.md).
- **Full verification, not partial.** Before the PR: `bun run lint` clean and the complete `bun run test` green. Sibling test files assert against the same components, so running only the file you edited is not sufficient. Re-run after any rebase.
- **Rebase on `main` first.** `git fetch origin main && git rebase origin/main` before pushing — PRs are squash-merged and reviewed against current `main`.
- **English only in the repo.** Commit messages, comments, changelog entries, decision records, PR text.
- **i18n and design tokens.** User-facing strings go through `t()` with keys in all three locales (`en`/`ru`/`es`); colors come from the semantic token classes, never hardcoded hex/rgb.
- **No native dialogs.** The app also runs headless in a browser (`dev3 remote`) — use the in-app `confirm()` service, toasts, or a React modal.
- **Registries stay in lockstep with features.** New surface or action → `docs/ux/`; new shortcut → `src/mainview/keymap.ts`; new search token → the search help strings in `i18n/translations/*/help.ts`; non-obvious capability → consider `ask-dev3` / tips (sparingly — see AGENTS.md).
- **Pin new dependencies to an exact version.** Maintainer builds resolve packages through a mirror that can lag the npm registry, so a freshly published patch version may not install. An exact pin makes the failure visible and fixable instead of environment-dependent.
- **UI changes get manual browser QA.** A green suite does not verify a visual surface. Take screenshots in streamer mode (`&streamer=on`).

## What review looks like here

Reviews are hands-on: the reviewer typically checks out the branch, runs it, and verifies findings by measurement rather than by reading the diff. Expect concrete repro steps for anything flagged, and reciprocate — PR descriptions that say what you verified (and what you did not) get reviewed faster. Mark the PR ready (not draft) when you want a review, and don't arm auto-merge; merging is the maintainer's call.
