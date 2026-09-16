# Terminal file-path links: the scope gate admits the OS temp directories

## Context

Cmd/Ctrl+Click file links in the terminal only resolve paths inside an allow-list (`allowedRoots` in `src/bun/rpc-handlers/terminal-paths.ts`), originally the home directory plus registered project roots — see `decisions/2026/08/06/terminal-file-path-links.md`. Agents routinely write screenshots and scratch output to `/tmp` (Codex prints them under "Viewed Image"), and those paths stayed plain text with no signal why.

## Investigation

The regex in `src/mainview/terminal-file-links.ts` matches `/tmp/x/y.png` fine; `statPathKind` returned `null` purely because `/tmp` is under neither root. On macOS `/tmp` is a symlink to `/private/tmp` and `os.tmpdir()` is `/var/folders/.../T`, so the same "temp" is three different string prefixes, and the gate is a string-prefix check that deliberately does not resolve symlinks.

## Decision

`tempRoots()` in `terminal-paths.ts` adds `os.tmpdir()`, `/tmp` and `realpathSync("/tmp")` (non-Windows) to `allowedRoots`, so resolution, preview and open all accept them. Covered by `src/bun/rpc-handlers/__tests__/terminal-paths.test.ts`.

## Risks

The temp directory is shared and world-writable, so in remote mode an authenticated client can now preview any readable file under it — the same exposure class the home directory already carries, since agents write there constantly. Files under `/tmp` are short-lived, so links there are more likely than others to go stale within the 10s resolve cache.

## Alternatives considered

Registering `/tmp` as a project (rejected: nonsensical on the board). Resolving symlinks in the gate generally (rejected: widens the gate to every symlink target under `$HOME`, which the original record explicitly declined). Whitelisting only image files under `/tmp` (rejected: agents also drop logs, diffs and reports there).
