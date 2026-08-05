# 205 — Terminal file-path links: regex + on-disk verification, Cmd/Ctrl+Click only

## Context

Agents constantly print file paths ("Draft is ready at kb-playbook-drafts/waf.md") with no way to open them. ghostty-web already linkifies URLs via its `ILinkProvider` system; file paths need custom detection, relative-path resolution, and an open action that fits both desktop and browser/remote mode.

## Investigation

ghostty-web providers get one buffer row at a time but an `ILink.range` may span rows, and `IBufferLine.isWrapped` lets us stitch soft-wrapped logical lines back together. tmux mouse mode swallows plain clicks (decision 098), but ghostty's link activation rides the separate bubble-phase `click` event, with the modifier policy left to each provider's `activate()` — which is why URL Cmd+Click works today.

## Decision

`src/mainview/terminal-file-links.ts`: a permissive regex over the stitched logical line finds candidates (absolute/`~`/relative, `:line:col` suffixes, bare filenames with extensions); the `resolveTerminalPaths` RPC (`src/bun/rpc-handlers/terminal-paths.ts`) stats each candidate against the task worktree then the project dir, and only existing paths become links (10s renderer cache). False regex positives ("e.g", prose like "types.But") are filtered by existence, not by regex cleverness. Activation requires Cmd/Ctrl so plain clicks keep reaching tmux apps. Open behavior is `GlobalSettings.terminalPathOpenMode` (preview modal / OS default / reveal); browser mode always previews in-app because host-side `Utils.openPath` is invisible remotely.

## Risks

An RPC per hovered logical line (cached, batched) — negligible in practice but nonzero; wide (CJK) characters shift column mapping since we assume 1 cell = 1 char, mislocating link underlines on such lines (paths still open correctly once hit).

## Alternatives considered

Linkify optimistically and verify at click time (rejected: underlines dead tokens, trains users to distrust links); OSC 8 injection by rewriting the output stream (rejected: mutating the PTY stream is invasive, see decision 066's complexity); per-candidate single RPCs (rejected for chattiness in favor of per-line batches).
