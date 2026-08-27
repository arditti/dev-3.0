# OSC 8 hyperlink URIs are captured from the PTY stream, not the terminal

## Context

Agents (Claude Code among them) render markdown links as OSC 8 hyperlinks. Two independent breaks kept them dead in dev3: tmux forwards OSC 8 only to clients whose terminal declares the `hyperlinks` terminal-feature (our attach client's `xterm-256color` never did), and CLIs gate emission on `supports-hyperlinks` heuristics whose `TERM_PROGRAM` allowlists (`ghostty`, `iTerm.app`, `kitty`, …) never include tmux, so nothing emitted OSC 8 in the first place.

## Investigation

With the plumbing fixed, links still did not click. ghostty-web 0.4.0 assigns `hyperlink_id` to cells (its renderer draws the hover underline from that), but its wasm module exports no hyperlink accessor at all — `WasmTerminal.getHyperlinkUri()` is literally `return null`, so the built-in `OSC8LinkProvider` always produces zero links and `LinkDetector.getLinkAt` finds nothing to activate. 0.4.0 is the latest release; there is no upstream fix to upgrade to. The URI enters the wasm parser and never comes back out.

## Decision

Capture URIs before the bytes reach the terminal. `src/mainview/terminal-osc8-links.ts`: `createOsc8Tracker` is a small escape-sequence state machine fed every PTY chunk in `writeToTerminal` (TerminalView) — it pairs each OSC 8 start/end and remembers visible label → URI (LRU, whitespace-stripped keys since wide glyphs read back from cells with padding blanks). `createOsc8LinkProvider`, registered via `term.registerLinkProvider`, finds contiguous `hyperlink_id` cell ranges per row (stitching wrapped rows, bounded), resolves the label through the tracker — falling back to the label itself when it is already an http(s)/mailto URI — and activates with `window.open` on Ctrl/Cmd+click (the desktop `new-window-open` intercept routes that to `Utils.openExternal`). Emission/forwarding fixes live in `src/bun/tmux/config.ts` (`terminal-features …:hyperlinks`, `set-environment -g FORCE_HYPERLINK 1`) and `buildAgentEnv` (`FORCE_HYPERLINK=1` for the native backend).

## Risks

Label→URI mapping is heuristic: two on-screen links with the same visible label resolve to the most recently streamed URI, and a label whose glyphs the cell readback mangles (astral codepoints become blanks) may miss the map. tmux re-emits OSC 8 on every redraw, which only refreshes the same mapping. Non-http(s)/mailto URIs are deliberately dropped. If a future ghostty-web implements `getHyperlinkUri`, the built-in provider will start answering first and this provider becomes redundant — delete it then.

## Alternatives considered

Upgrading ghostty-web (no release implements the accessor); reconstructing wasm hyperlink ids by counting OSC 8 starts in the stream (ids are page-managed and deduplicated inside ghostty core — unreconstructible); rewriting the stream to append the URI as visible text (changes displayed content); patching the wasm (not ours to fork for this).
