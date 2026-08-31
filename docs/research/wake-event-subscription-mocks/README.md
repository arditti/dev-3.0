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
| `04-control-center-subscriptions.png` | Global scheduler control center — subscriptions across all scopes |
| `05-control-center-pending-deadletter.png` | Pending delivery, dead-letter, TTL-expired strips |
| `06-waker-store-and-firing-log.png` | Waker store (built-ins + customs) and the firing audit log |

`index.html` / `report.js` are the earlier standalone artifact version of the same mocks, kept
because they carry the CLI/agent-cron transcript screens the in-app mocks do not cover.
