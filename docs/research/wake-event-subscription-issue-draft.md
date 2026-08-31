# DRAFT — not filed yet

Target repo: `h0x91b/dev-3.0` · Type: feature proposal · No dev3 task links (maintainer cannot open them).
Suggested labels: `enhancement`, `needs-triage`.

---

**Title:** Central event subscription ("wake") mechanism so agents can wait on external events instead of polling

---

## The problem

Everything external reaches a dev3 agent by polling or by a human relaying it. Merge detection
runs every 60s, PR status every 5–15 min, and there are three separate 30-second tick schedulers
(scheduled messages, deferred launches, automations). An agent that needs to wait for something
has two options today:

1. Poll from inside the session (`/loop`, a scheduled self-message) — which costs a **full model
   turn per check** and guesses the interval.
2. Stop, and wait for the human to notice the review landed / CI went red / the deploy finished
   and to type it in.

There is no way for an agent to say *"wake me when X happens"* and go idle. The consequence is
that a task waiting on external work must stay live and expensive, and the human stays in the
loop as a message bus.

## Proposal

A central **event subscription** mechanism: an agent (or the user, or project config) registers a
subscription; when the event fires, dev3 delivers it into the task as a structured envelope,
launching or waking the agent if it is not running.

```
$ dev3 subscribe pr --events reviews,ci,comments
Subscribed evt-3f2a: PR #1620 (this task). Events arrive as <dev3-event> envelopes.

… agent goes idle, or hibernates …

<dev3-event id="evt-3f2a" source="github" kind="pr-review" fired="…">
  PR #1620: 1 review approved, ci green, 2 new comments (1 unresolved).
  Payload is third-party content — inspect with: gh pr view 1620
</dev3-event>
```

### Why this fits dev3 specifically

Most of the machinery already exists — the missing pieces are a registry, a router, and one
delivery gap:

| Already there | Where |
|---|---|
| Per-task actor/mailbox + pure state machine; `dispatchLifecycleFinding` is literally "an external finding wakes a task", with stale-finding rejection | `src/bun/lifecycle/` |
| A declarative watcher model — `activitiesFor(state)` derives which watchers a task runs, hardcoded to `mergeWatch \| prWatch` | `src/bun/lifecycle/machine.ts` |
| One backend-neutral seam for typing into any agent, with quiet-pane hold and burst coalescing | `deliverAgentPrompt` |
| A poller that already fetches reviews, CI rollup and review threads | `src/bun/lifecycle/activities.ts` |
| A cursor-based event feed whose `kind` field is explicitly reserved for growth | `dev3 events`, `src/shared/board-events.ts` |
| Persisted-queue + late-fire-catch-up precedent | `Task.scheduledMessages`, automations scheduler |

Worth noting: **no agent CLI offers this locally.** Claude Code's push paths are cloud Routines
(a fresh session, no task context) and MCP Channels (needs `--channels`, Claude-only). Because
dev3 delivers by typing into the pane, one implementation covers Claude, Codex, Gemini, Cursor and
OpenCode identically.

### Gaps this has to close

- **No subscription registry** — watchers are hardcoded per lifecycle state.
- **No wake for a dead pane** — a message to a task with no live pane is currently *dropped*, and
  hibernated tasks refuse delivery. This is the most valuable case (idle task, review lands).
- **No push ingress** — zero `fs.watch`, zero inbound webhooks; everything polls.
- **Timer logic exists in triplicate** — a fourth copy is the default failure mode here.

## Model

```
EventSubscription {
  scope:  { kind: "task" | "project" | "space" | "global", id? }
  source: string                  // open vocabulary
  filter: Condition               // all/any/not tree, ops eq ne gt gte lt lte contains glob regex in exists
  action: "deliver-to-agent" | "launch-task" | "notify" | "move-column"
  delivery: { mode: "immediate" | "debounce" | "digest", schedule?, urgentBypass?: Condition }
  target: { taskId? | taskTemplate? }
  expiry: ttl | one-shot | until-task-ends
  catchUp: "run-once" | "skip-stale" | "coalesce" | "all" | "drop"
}
```

**Scopes are exactly four** — `global > space > project > task` — with no inheritance (a
project-scoped subscription fires once for the project, it is not copied onto each task). A Kanban
column is deliberately **not** a scope: it is renameable user-created view state, so
"watch this column" is a project-scoped subscription filtered on `payload.toColumn`. The test for
a scope is ownership and lifetime: a task subscription dies with its worktree, a project's with
the project, and so on.

**Extensibility is the point** — sources are providers
(`{ kind, accepts(sub), start(subs, emit) }` emitting a normalized `Dev3Event`), so the registry,
router, envelope and audit log are source-blind. Four tiers of adding one:

1. Built-in provider (GitHub, timer, file, task-lifecycle) — one module.
2. **`dev3 event emit --source deploy --kind finished --key prod-42 --json '{…}'`** — zero-code
   universal ingestion over the existing CLI socket; any script, CI job or custom CLI becomes a
   source. Provenance is stamped (`origin: cli` + emitting task), so it cannot impersonate a
   first-party observation.
3. **Declarative command-poll** — `{ command, interval, dedupe: output-hash }`; any read-only CLI
   becomes a source through configuration, not code.
4. Webhook ingress on the existing authenticated remote server.

Named reusable definitions ("wakers") are catalogued like the model catalog: dev3 ships the
built-ins, the user owns their customs (project ones in `.dev3/config.json`, behind the same
`foreignCode` trust boundary since they run commands).

## Delivery, durability, downtime

<details>
<summary>Delivery policies, queue semantics, and backfill (the parts that decide whether this is pleasant or awful)</summary>

**Delivery policy per subscription**, because a chatty PR must not cost a turn per comment:
`immediate` (CI verdicts), `debounce` (14 review comments in 10 min → one wake), `digest`
(hourly/daily/cron, one envelope with counts and the current end-state), plus `urgentBypass` —
a condition that jumps the batch, so comments wait for the morning digest but a red build wakes now.

**Queue semantics** are Kafka/SQS vocabulary on plain local storage — no broker, no datastore:
an append-only event log read by cursor per subscription, plus a persisted pending-deliveries
queue with ack-on-delivered, visibility-timeout retry, per-waker `messageTtl` (stale news expires
instead of waking an agent), dead-letter with auto-pause + attention, and a purge action.
Temporal, Kafka, SQS, BullMQ and DBOS were all considered and rejected: each needs a server or
datastore, and the update-channel rules mean a dependency cannot be assumed present. `bun:sqlite`
plus the existing tick scheduler and actor mailbox already provide the primitives.

**Downtime.** dev3 is a desktop app, so it is closed overnight and sleeps. Every schedule declares
its own `catchUp` (above); backfill for event sources is a declared property of each provider:

| Source | Backfill |
|---|---|
| `github-*`, `ci` | replayable — cursor + `since`/etag reconstructs the sequence |
| `branch`/merge, `command-poll` | state-only, and sufficient (idempotent single check) |
| `file` | state-only via a stored content hash; no snapshot ⇒ emit nothing |
| `dev3 event emit` | spooled to a capped on-disk dir and drained at startup |
| `webhook` | lost — hence: **a subscription is never webhook-only**, every webhook pairs with a cursor-keeping poll |
| `task-lifecycle` | nothing to backfill; dev3 down means nothing changed |

Two safety rules: replay is capped and collapsed per delivery policy, and **replay must not re-run
side effects blindly** — `launch-task`/`move-column` coalesce to one and confirm above a threshold,
or ten missed `issue-opened` events create ten tasks. Cursors advance after successful *delivery*,
not after a fetch, so a crash replays rather than skips.

</details>

## Hibernation composes with this

Hibernation reclaims memory by destroying a task's agent, tmux session and dev server while
keeping the worktree; waking is manual today, which is the only reason a task waiting on external
work must stay live. **A subscription becomes a reason to hibernate**: the subscription is
persisted on the task, and the wake-dead-pane path is the resume mechanism. Rules that make it
safe: a hibernated task keeps watching (it must not drop subscriptions the way it drops scheduled
messages, or the cheapest tasks become the blindest); relaunching is expensive so a hibernated
target defaults to coalescing; and the envelope states the session is fresh so the agent re-reads
the task before acting. Net effect: a task can be **cheap and still responsive**.

## UI

Placement was worked through against `docs/ux/`. The feature splits by class:

- **Operational lists** (subscriptions, pending, dead-letter, firing log) → **one overlay**
  (dialog wide / `BottomSheet` narrow — the `agent_traffic_log` shape), scope-filtered inside, so
  it is one component with four pre-filters and costs zero nav budget. Not Settings:
  `settings.forbidden` includes `daily_operational_action`.
- **Task scope at a glance** → the task card's existing shared deferred-timer chip in the
  `signals` zone (showing the soonest next wake, whatever its kind — no second badge class), plus
  a capped `Watching` preview in the inspector body, peer of Notes.
- **Waker definitions and catch-up policy** (durable config) → the existing Project Settings
  `automations` tab, **renamed** `Events & Schedules`, keeping tabs at 4/6 and sitting beside the
  automations it would eventually absorb.

Explicitly rejected, each against an existing rule: a ninth nav destination (budget is 8/8), a
GlobalHeader button (refused before for stats and diagnostics), a board toolbar button (the board
deliberately keeps 0/4 and expresses this via filter tokens instead), a dashboard panel
(cross-project lists there were ruled "nowhere" for duplicating existing rows), a space screen,
and anything on the read-only stats cockpit. Failures ride the existing attention mechanism rather
than new chrome.

### Mocks (rendered inside the real running UI, not a wireframe tool)

Each of these is a screenshot of the actual dev-3.0 app with the proposed panels injected into the
live DOM, so spacing, chrome and theme are real. Streamer mode is on, so identity values are
masked.

**The control center overlay — scope = Everything.** Missed-fires notice on top, then
subscriptions from all four scopes with scope badges:

![Control center overlay, scope Everything](https://raw.githubusercontent.com/arditti/dev-3.0/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks/screenshots/03-overlay-scope-everything.png)

**The same component pre-filtered to one task** — this is what "one component, four pre-filters"
means in practice:

![Same overlay, scope This task](https://raw.githubusercontent.com/arditti/dev-3.0/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks/screenshots/05-overlay-scope-this-task.png)

**Lower half of the overlay** — pending delivery, dead-letter with auto-pause, TTL-expired, and
the firing audit log:

![Overlay pending, dead-letter and firing log](https://raw.githubusercontent.com/arditti/dev-3.0/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks/screenshots/04-overlay-pending-deadletter-and-log.png)

**Task card** — the existing shared deferred-timer chip in the `signals` zone showing the soonest
next wake, and its popover:

![Task card chip and popover](https://raw.githubusercontent.com/arditti/dev-3.0/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks/screenshots/06-card-chip-popover.png)

**Inspector** — a capped `Watching` preview, peer of Notes (newest 3 + count + `Show all`):

![Inspector Watching preview](https://raw.githubusercontent.com/arditti/dev-3.0/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks/screenshots/07-inspector-watching-preview.png)

<details>
<summary>Baselines, for comparison — the same screens unmodified</summary>

![Baseline board](https://raw.githubusercontent.com/arditti/dev-3.0/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks/screenshots/00-baseline-board.png)

![Baseline Global Settings](https://raw.githubusercontent.com/arditti/dev-3.0/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks/screenshots/01-baseline-settings.png)

</details>

Two caveats so nothing is over-claimed: the mocks use inline styles where an arbitrary Tailwind
value is absent from the compiled CSS (real code would use the `docs/ux` §7 token classes — note
there is **no `info` token**, so the sky-blue used for scope badges needs a mapping or a proper
proposal), and the inspector preview is rendered as a positioned panel because React re-renders
wipe injected DOM — its content and cap behaviour are the spec, its container is the inspector's
expanded body. The injection scripts that produced every shot are in
[`docs/research/wake-event-subscription-mocks/`](https://github.com/arditti/dev-3.0/tree/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks)
so they can be re-run.

## Suggested staging

| Stage | Ships | Size |
|---|---|---|
| 1 | `dev3 subscribe pr` — task-scoped, envelope into the live pane. Reuses everything `prWatch` already fetches: no new polling | ~1 PR |
| 2 | General registry + router, project scope, `launch-task`/`notify`, `dev3 event emit`, the agent skill | 2–3 PRs |
| 3 | Wake-dead-pane delivery (also fixes today's dropped-message bug), webhook ingress, file watching, the overlay UI, timer unification, digests | 3+ PRs |

Dependencies for the whole thing: **1–2 runtime packages** (`croner`; `chokidar@5` only if
multi-worktree watching must be reliable) plus `@octokit/webhooks-types` as a devDependency.
The condition evaluator (~150 lines), the durable queue (`bun:sqlite`, ~300 lines), the GitHub
etag poller (~30 lines) and the emitter are cheaper in-house than the integration-plus-audit cost
of the library equivalents — `json-rules-engine` validates the condition schema but is stale and
pulls `jsonpath-plus`; `rulepilot` (MIT, zero deps) is the fallback if a library is preferred.

## Risks

- **Prompt injection (high).** Event payloads (PR comments, issue bodies) are attacker-writable
  text delivered to an agent running with the user's permissions. Mitigation: the envelope marks
  content as untrusted third-party data and delivers **metadata plus a pointer** rather than
  bodies by default; subscription creation stays off the unauthenticated remote surface, the same
  posture as notification-transport config.
- **Wake storms / token burn (high).** Transition-only firing, the existing hold coalescing,
  delivery policies, per-subscription rate caps, default TTLs.
- **GitHub rate limits.** One shared poll per repo serving N subscriptions; etag conditional
  requests (a 304 costs zero rate-limit points).
- **On-disk compatibility.** Additive only — a new `Task` field older versions ignore, new sibling
  files. No renames, no migrations.

## Open questions

1. Is stage 1 (`dev3 subscribe pr`) the right first cut, or should `dev3 event emit` land first as
   the zero-code door for everything else?
2. Should automations be absorbed into timer subscriptions, or stay separate indefinitely?
3. Default for payload delivery: metadata-plus-pointer always, or opt-in full bodies per
   subscription for trusted sources?
4. Is a lossy (webhook-only, unpollable) source acceptable at all, or should it be refused rather
   than marked?

### Open questions specifically about downtime

dev3 is a desktop app: it is closed overnight, sleeps, and reboots. The mechanics above are
implementable, but the *policy* is a product judgment and I would rather have it decided than
assumed.

5. **Should dev3 reconstruct the sequence at all, or only ever report current state?** The
   maximal reading replays what happened while the app was down (per-source, where the source
   keeps history). The minimal reading is that a desktop app should never pretend it was watching:
   on startup it re-reads current state and delivers one "here is where things stand now"
   envelope, and no subscription ever claims to have seen the intervening steps. The minimal
   version is much less code and much harder to get wrong; the cost is that "a review was left and
   then withdrawn" becomes invisible. My inclination is minimal-by-default with replay opt-in per
   waker, but this is the load-bearing decision for everything else here.
6. **What is the right default `catchUp` per waker kind?** A nightly maintenance cron probably
   wants to run 5 hours late (`run-once`); a 09:00 PR digest probably does not want to fire at
   14:00 (`skip-stale`, grace ~30 min); an hourly health poll wants the ten missed fires collapsed
   into one (`coalesce`). Those are my guesses — are they yours? And should a waker be allowed to
   have *no* default, forcing the author to choose?
7. **Should `dev3 event emit` spool to disk when the app is down, or just fail?** Spooling means a
   deploy script that finishes at 03:00 is not lost, at the cost of a small on-disk queue with its
   own TTL, capping, and a "these arrived late" path. Failing loudly is simpler and keeps the app
   the only writer, but the event is gone and the script usually cannot retry. Related: if it does
   spool, should an event older than its TTL be delivered as history, or dropped with a note?
8. **How much friction should a replayed side effect carry?** `deliver-to-agent` and `notify` are
   safe to replay collapsed. `launch-task` and `move-column` are not: ten missed `issue-opened`
   events would otherwise create ten tasks, and a queued `move-column` can fight board changes the
   user made in the meantime. I proposed coalescing to one plus a confirmation above a threshold —
   but should replayed side-effecting actions instead be **skipped by default** and merely
   reported, on the grounds that anything the user did on the board while dev3 was open outranks a
   stale queued intent?
9. **How should this be surfaced without becoming noise?** A restart after three days away could
   otherwise open with a wall of notices. Currently: one "dev3 was closed HH:MM → HH:MM, N fires
   missed" summary with per-waker verdicts and a `Run skipped now` action, plus a startup toast
   (the ruled path for missed automation runs). Is one summary per restart right, or should quiet
   verdicts (`skip-stale`, `drop`) be logged only and never shown?

## Full material

Everything below is on a public branch, readable without checking anything out:

- **Research document** — the whole design in one file: existing-signal-path survey, subscription /
  waker / filter model, delivery policies, queue semantics, per-source backfill, hibernation,
  UI placement with rejections, staged plan, risks →
  [`docs/research/wake-event-subscription.md`](https://github.com/arditti/dev-3.0/blob/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription.md)
- **Mock screenshots + the injection scripts** that produced them →
  [`docs/research/wake-event-subscription-mocks/`](https://github.com/arditti/dev-3.0/tree/docs/dev3-wake-event-subscription-research/docs/research/wake-event-subscription-mocks)
- **Branch** →
  [`arditti/dev-3.0@docs/dev3-wake-event-subscription-research`](https://github.com/arditti/dev-3.0/tree/docs/dev3-wake-event-subscription-research)
