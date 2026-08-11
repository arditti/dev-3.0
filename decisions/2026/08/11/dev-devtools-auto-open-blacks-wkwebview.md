# Dev-channel DevTools auto-open blacks out the WKWebView on macOS 26

## Context

Since at least 2026-08-05, every locally built dev-channel app (`bun run dev`)
opened a window that stayed pure black while the renderer inside it was
demonstrably alive: React booted, RPC flowed, `dom-ready` fired, a healthy
WebKit GPU/Networking/WebContent triple ran, and the unified log showed zero
errors. The installed production app rendered fine side by side with the same
Electrobun (1.18.1) native wrapper, and the same dev build rendered fine in
remote/browser mode. Native manual testing was written off as "broken
environment" and all QA fell back to the laggier browser mode.

## Investigation

Every documented blank-window cause was ruled out from logs: the `views://`
cwd bug (the `no-chdir-pin-child-cwd` record), missing bundle assets, a dead
renderer (`renderer-readiness-desktop-launch`), and the dev-channel 5173
hijack (boot logs show "falling back to bundled assets"). The one behavioral
difference between the dev and production main window was
`win.webview.openDevTools()` in `openMainWindow`'s `onDomReady`
(`src/bun/index.ts`), dev channel only — an FFI call into Electrobun's
`libNativeWrapper.dylib`, which drives Apple's private `_WKInspector` API. A
user screenshot showed the attached inspector pane rendering perfectly inside
the same NSWindow whose web-content area above it was black — the compositor
and window were fine; the content layer specifically never painted. Rebuilding
with the auto-open removed made the window render normally on macOS 26.6
(first controlled A/B on 2026-08-11).

This turned out to be a **known Electrobun bug**: blackboardsh/electrobun#357
(docked Web Inspector corrupts WKWebView content on macOS — shift/gray-out on
earlier versions, with #475 closed as its duplicate) — "fixed in the next
stable release", but as of 2026-08-11 the fix exists only in `1.18.4-beta.x`
while the latest stable (and dev3's pin) is 1.18.1.

## Decision

DevTools auto-open is platform-gated: `shouldAutoOpenDevTools()`
(`src/bun/devtools-auto-open.ts`) keeps the dom-ready auto-open on Linux and
Windows and skips it on macOS, where the docked inspector is broken across
versions per the upstream issues. `DEV3_DEVTOOLS=1` forces it on (e.g. to
re-test after an Electrobun upgrade), `DEV3_DEVTOOLS=0` forces it off. There
is deliberately no other entry point (no menu item or shortcut existed before
either); browser-mode QA via the task dev-server remains the way to get a
console on macOS.

## Risks

- Losing the auto-opened console on macOS dev builds unless developers know
  the env var; the trade is a one-line override vs. a black window that cost
  multiple debugging sessions.
- Untested whether opening the inspector *after* first paint (rather than at
  `dom-ready`) also blanks the layer; if a manual toggle is ever added, test
  that on macOS 26 first.
- Once an Electrobun stable ships the upstream fix and dev3 upgrades, the
  macOS gate should be re-evaluated (verify with `DEV3_DEVTOOLS=1` first).

## Alternatives considered

- Darwin-version gating (skip only on Darwin >= 25 / macOS 26): rejected —
  upstream reports show the docked inspector misbehaving on earlier macOS too
  (#197, #357, #469), so the whole platform is the honest boundary.
- Pure env opt-in with no platform default: rejected — Linux/Windows lose the
  working auto-open for no reason.
- Upgrading Electrobun to `1.18.4-beta.x` for the upstream fix: rejected for
  this change — a native-wrapper bump on a beta channel is its own risk and
  deserves its own tested change.
- A startup self-check that detects "renderer ready but never painted":
  rejected as scope creep — there is no reliable paint signal exposed through
  Electrobun, and removing the trigger eliminates the known failure mode.
