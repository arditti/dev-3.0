# WAKE / event-subscription — UI mocks

`screenshots/` holds mocks rendered **inside the real running dev-3.0 UI** (headless Chromium,
streamer mode on). The `mock-*.js` files are the DOM-injection scripts that produced them: start
the app (`dev3 dev-server start`), open it in a browser, and run a script with
`agent-browser eval -b "$(base64 -i mock-control-center.js)"`. They use the app's own Tailwind
token classes, so the mocks inherit the real theme rather than approximating it.

| Screenshot | Shows |
|---|---|
| `00-baseline-board.png` | Baseline: the real project board, unmodified |
| `01-baseline-settings.png` | Baseline: the real Global Settings screen |
| `02-task-scope-watching-card.png` | Task scope — a "Watching" section on the real task card |
| `03-control-center-missed-fires-backfill.png` | The "dev3 was closed → N fires missed" banner with per-waker catch-up verdicts |
| `04-control-center-subscriptions.png` | ⚠️ Subscriptions across all scopes — **content valid, placement superseded** |
| `05-control-center-pending-deadletter.png` | ⚠️ Pending delivery, dead-letter, TTL-expired strips — **content valid, placement superseded** |
| `06-waker-store-and-firing-log.png` | ⚠️ Waker store and firing log — **content valid, placement superseded** |

## ⚠️ Screenshots 03–06 show a rejected placement

They render the control center as a **Global Settings section**. The `/ux-principal` pass
(2026-08-31) rejected that: `settings.forbidden` includes `daily_operational_action`, and
pending deliveries, dead-letter and a firing log are operational. Read the rows, the chips,
the states and the copy — those carry over unchanged — but **do not build the container**.
The decided homes are in `docs/research/wake-event-subscription.md`, section
"UI placement": an overlay (dialog wide / BottomSheet narrow) for the operational lists, the
task card's shared deferred-timer chip plus a capped inspector preview for task scope, and the
renamed Project Settings `Events & Schedules` tab for waker definitions only.

`index.html` / `report.js` are the earlier standalone artifact version of the same mocks, kept
because they carry the CLI/agent-cron transcript screens the in-app mocks do not cover.
