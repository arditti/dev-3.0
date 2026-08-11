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

## Decision

DevTools no longer auto-opens on the dev channel. The call is kept behind an
explicit opt-in: `DEV3_DEVTOOLS=1 bun run dev` restores the old behavior for
platforms/macOS versions where the attached inspector still composites
correctly. There is deliberately no other entry point (no menu item or
shortcut existed before either); browser-mode QA via the task dev-server
remains the way to get a console on macOS 26.

## Risks

- Losing the auto-opened console on dev builds where it *did* work (Linux,
  older macOS) unless developers know the env var; the trade is one-line
  opt-in vs. a black window that cost multiple debugging sessions.
- Untested whether opening the inspector *after* first paint (rather than at
  `dom-ready`) also blanks the layer; if a manual toggle is ever added, test
  that on macOS 26 first.
- The underlying compositing bug lives in Electrobun/WebKit, not here; a dev3
  code comment and this record are the only local breadcrumbs.

## Alternatives considered

- Platform-gating (`process.platform !== "darwin"`): rejected — the failure is
  macOS-*version*-specific and silently flips with OS updates; an explicit
  opt-in fails loud instead of black.
- A startup self-check that detects "renderer ready but never painted":
  rejected as scope creep — there is no reliable paint signal exposed through
  Electrobun, and removing the trigger eliminates the known failure mode.
- Reporting upstream and waiting: the Electrobun issue should be filed, but
  local dev on macOS 26 cannot stay broken meanwhile.
