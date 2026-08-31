# WAKE / event-subscription — UI mocks

`screenshots/` holds mocks rendered **inside the real running dev-3.0 UI** (headless Chromium,
streamer mode on). The `mock-*.js` files are the DOM-injection scripts that produced them: start
the app (`dev3 dev-server start`), open it in a browser, then run one with
`agent-browser eval -b "$(base64 -i mock-overlay.js)"`.

Every screenshot below matches the placement decided by the `/ux-principal` pass — see
`../wake-event-subscription.md`, section "UI placement (decided via /ux-principal)".

| Screenshot | Shows | Script |
|---|---|---|
| `00-baseline-board.png` | Baseline: the real project board, unmodified | — |
| `01-baseline-settings.png` | Baseline: the real Global Settings screen, unmodified | — |
| `02-task-scope-watching-card.png` | An early card treatment, kept for the row/chip vocabulary | `mock-task-watch.js` |
| `03-overlay-scope-everything.png` | **The control center overlay**, scope = Everything: missed-fires notice + subscriptions across all four scopes | `mock-overlay.js` |
| `04-overlay-pending-deadletter-and-log.png` | Same overlay, lower half: pending delivery, dead-letter, TTL-expired, firing audit log | `mock-overlay.js` |
| `05-overlay-scope-this-task.png` | **The same component pre-filtered to one task** — this is what "one component, four pre-filters" means | `mock-overlay-task.js` |
| `06-card-chip-popover.png` | Task card `signals` chip (soonest next wake) and its popover with `Manage…` | `mock-card-chip.js` |
| `07-inspector-watching-preview.png` | Capped `Watching` preview for the inspector's expanded body, peer of Notes | `mock-inspector2.js` |

Notes for whoever implements this:

- The mocks use **inline styles** for colour and font-size because several arbitrary Tailwind
  values (`text-[10px]`, `border-amber-400/40`) are not in the app's compiled CSS. Real code uses
  the token classes in bible §7 — and note there is **no `info` token**, so the sky-blue used for
  scope badges and "woke hibernated task" needs either a mapping to an existing token or a
  proper proposal to `better-colors`.
- React re-renders wipe injected DOM, so the inspector preview (`07`) is rendered as a
  positioned panel rather than literally inside the inspector body. Its content and cap
  behaviour are the spec; its container is the inspector's expanded body.
- Screenshot `03` shows the missed-fires notice inside the overlay. On startup the same
  information also arrives as a toast — the ruled path for missed runs — never as a dashboard
  banner.
