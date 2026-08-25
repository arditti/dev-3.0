# Board task ordering — design spec

Status: **parked** (design approved, implementation deliberately deferred).
Date: 2026-08-25.

## Goal

Let the user control the order of task cards on the Kanban board, per column and
board-wide: a derived sort with a selectable key, plus an optional manual
drag-order layer on top. Applies to the **Kanban board only** — the Active Tasks
sidebar, Activity Overview, and coordinator board snapshot keep today's strict
priority-band order via the untouched shared comparator.

## Approved decisions (from brainstorming)

1. **Layered model** — derived sort by default (selectable key), manual override on top.
2. **Manual beats bands** — a manually positioned card sits exactly where dropped,
   even above higher-priority cards; no re-prioritization side effect.
3. **Board only** — other surfaces keep `compareTasksInBand` / `taskSortRank` unchanged.
4. **Scope** — board-wide default sort key + per-column override.
5. **Manual persistence model: approach A** — a column is either *derived* or
   *manual*. The first vertical drag inside a derived column snapshots the current
   visual order into an ordered task-id array and flips the column to manual;
   "Reset to sorted" flips it back. (Rejected: sparse per-task fractional positions
   — the composition ambiguity that got `Task.columnOrder` removed in
   `decisions/2026/08/11/derive-in-column-task-order.md`; and always-manual — loses
   live derived ordering.)

## Data model

New optional fields on `Project` (`projects.json`, in-place schema addition; path
untouched, complies with the on-disk invariants in AGENTS.md):

```ts
boardSortKey?: TaskSortKey;                    // absent = "priority-activity" (today's behavior)
columnSort?: Record<string, ColumnSortState>;  // key: built-in status slug or custom column id

interface ColumnSortState {
  key?: TaskSortKey;        // per-column override of the board default
  dir?: "asc" | "desc";
  manualOrder?: string[];   // task ids; presence = column is hand-ordered
}
```

### Sort keys

| Key | Source | Notes |
|---|---|---|
| `priority-activity` | `taskSortRank` + activity clock | Default; identical to today, still honors global `taskSortOrder` for in-band direction |
| `created` | `createdAt` | |
| `updated` | `updatedAt` | Noisy (agent writes bump it) — documented in the picker copy |
| `time-in-column` | `statusEnteredAt ?? movedAt ?? createdAt` | On review/done columns this *is* "when the agent finished"; one key, contextual label |
| `last-terminal-output` | new `Task.lastTerminalOutputAt` | See below |
| `task-number` | `seq` | |
| `title` | effective title (custom override or auto) | |
| `pr-state` | `prNumber` / `prStatusCache` | no PR → open → checks failing → mergeable; missing data last |
| `diff-size` | `completedDiffStats` (live diff-stat where available) | Missing data last |

Missing data always sorts last; `seq` is the universal final tiebreak.
Completed/cancelled columns lose their hard-coded newest-first sort and instead
default to `time-in-column` desc, overridable like any other column.

## `Task.lastTerminalOutputAt`

- **Never** sourced from tmux `#{window_activity}` — it is self-polluted by
  dev3's own resize jiggle (idle prompts repaint on SIGWINCH; ~45–49 of 60 live
  panes share one jumping timestamp). See
  `decisions/2026/08/25/board-age-is-column-age-not-terminal-silence.md`.
- Stamped in memory at the backend-neutral chokepoint every real output byte
  already passes: `ingestPtyOutput()` (`src/bun/pty-server.ts:292`), which already
  maintains `session.lastOutputTime` for both native and tmux backends.
- Persisted on the `focusMs` precedent (`src/bun/focus-tracker.ts` →
  `data.addTaskFocusMs`): in-memory pending map, flushed every ~60 s plus once on
  the 15 s idle edge, through a minimal `withFileLock` writer that does **not**
  bump `updatedAt`/`movedAt`/history — no board-resort spam.
- The board re-sorts by this key only when a flush lands (normal task-updated
  push): at most ~once a minute, not per keystroke.
- Documented semantics: "last output dev3 witnessed" — a detached tmux agent
  after an app restart is not observed until reattach
  (`rehydrateTaskLifecycles` does not recreate pty sessions).

## Board sorting semantics

`sortTasksForColumn` becomes: **`manualOrder` if present → else column key (or
board default) → `seq` tiebreak**. In a manual column there is no banding at all
— the array is the truth. Ids that left the column are pruned lazily; tasks not
yet in the array (new arrivals) are placed **at the top**. Hibernated cards stay
non-draggable, so they hold their snapshotted spot but cannot be moved.

## Interactions & UI

- Vertical drag in a derived column → snapshot + flip to manual, dragged card at
  its drop index. Vertical drag in a manual column → splice the array.
  Cross-column drag stays a status move (unchanged).
- Per-column sort control in the column header (key + direction + visible
  "Hand-ordered" state + "Reset to sorted" which deletes `manualOrder`); board
  default picker at board level. **Exact placement must go through the mandatory
  `/ux-principal` pass at implementation time** (new header actions → complexity
  budget); this spec does not fix pixels.
- New RPC handlers (settings-config domain): `setBoardSort`, `setColumnSort`,
  `reorderColumnManual`; renderer updates via the existing project-updated push.

## Migration & docs

- No migration: absent fields = today's behavior everywhere. The dormant
  `Task.columnOrder` field stays as-is (load/save round-trip only).
- Ship with a decision record superseding the manual-order parts of
  `decisions/2026/08/11/derive-in-column-task-order.md` (manual order returns as
  an explicit per-column mode with different storage, not per-task positions),
  plus one `feature-` changelog entry with a `Short:` line.

## Testing

- Unit: `sortTasksForColumn` manual mode, new-arrival placement, pruning,
  missing-data-last per key; flush writer for `lastTerminalOutputAt` (asserts no
  `updatedAt` bump); project-prefs writers; RPC handler tests; `KanbanColumn`
  drag tests.
- Manual UI QA (`/debug-ui`, streamer mode): flip a column to manual by
  dragging, reset-to-sorted, per-column key change, and a column sorted by
  last-terminal-output while an agent produces output.
