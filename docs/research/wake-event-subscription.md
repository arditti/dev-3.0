# Research: central WAKE / event-subscription mechanism

Date: 2026-08-31. Status: research only — nothing here is implemented. Companion mocks:
`docs/research/wake-event-subscription-mocks/` (if present on this branch) and the dev3 task
artifact "Central WAKE / Event Subscription — Research".

## Problem

Everything external enters dev3 by polling: merge checks every 60s, PR status every 5–15 min,
three separate copy-pasted 30s tick schedulers (scheduled messages, deferred launches,
automations). No agent can say "wake me when X happens" and go idle — it either polls (burning a
model turn per check) or a human relays the event. The reference UX (seen in Claude): an agent
calls a subscribe tool, goes idle, and the platform later injects
`<wake reason="external-event"><event source="github" …>` envelopes as new turns.

Key strategic fact: Claude Code has **no local external-wake API** (only cloud Routines
`POST /fire`, which starts a fresh session, and MCP Channels, which need `--channels` and are
Claude-only). dev3 already owns the one seam that works for *every* harness — typing into the
agent's pane (`deliverAgentPrompt`, backend-neutral, with hold/coalescing). A WAKE bus on top of
that seam is harness-agnostic push no single agent CLI offers.

## What already exists (survey results)

| Piece | Where | Relevance |
|---|---|---|
| Per-task actor/mailbox + pure `transition(state, event)` | `src/bun/lifecycle/` | The consumer. `dispatchLifecycleFinding` (service.ts) is literally "external finding wakes a task", with stale-finding rejection |
| Declarative watcher derivation | `activitiesFor(state)` (machine.ts) | A subscription model in miniature, hardcoded to `mergeWatch \| prWatch` |
| One delivery seam | `deliverAgentPrompt` (`agent-prompt-delivery.ts`) | Backend-neutral typing into any agent; hold waits for a quiet pane and coalesces bursts; four decision records govern it |
| PR/merge polling | `lifecycle/activities.ts` + `git-poll-throttle.ts` | Already fetches reviews, CI rollup, review threads — stage 1 needs no new polling |
| Cursor-based event feed | `dev3 events` / `src/shared/board-events.ts` | `kind` field explicitly reserved for more event kinds |
| Cross-task message envelope | `wrapAgentMessage` | Precedent for a `<dev3-event>` envelope |
| Outbound-only transports | `notification-transports.ts` | exec/webhook egress; config deliberately outside RPC reach (security posture to copy) |
| Authenticated HTTP server | `remote-access-server.ts` | Ready-made home for an inbound webhook route (auth, rate limit, route dispatcher) |

Gaps: no subscription registry; **a message to a task with no live pane is dropped** (no
wake-dead-pane path); zero `fs.watch`, zero inbound webhooks; timer logic exists in triplicate.

## Design

### Subscription record

```
EventSubscription {
  id, createdBy: "agent" | "user" | "config",
  scope:  { kind: "task" | "project" | "space" | "global", id? },
  source: string,          // open vocabulary — built-ins and any custom emit source
  filter: Condition,       // generic predicate tree, below
  action: "deliver-to-agent" | "launch-task" | "notify" | "move-column",
  delivery: { mode: "immediate" | "debounce" | "digest",
              debounce?, schedule?, urgentBypass?: Condition },
  target: { taskId? | taskTemplate? },
  expiry: ttl | one-shot | until-task-ends
}
```

Storage: task-scoped on the `Task` record (the `scheduledMessages` pattern); project/space/global
in a new **additive** file — no renames, no format changes to existing files (on-disk invariants).

#### Scope is exactly four levels, and a column is not one of them

`global > space > project > task`, matching the product's own object model — the same four levels
the control-center overlay pre-filters by. A subscription belongs to exactly one, and a narrower
scope never inherits a wider one's subscriptions: a project-scoped subscription fires once for the
project, it is not silently copied onto each of its tasks.

**A Kanban column is deliberately not a scope.** It is a view of task state inside one project,
it is renameable and user-created, and a subscription keyed to it would break the moment someone
reorganises the board. The thing people actually want from "watch this column" is already
expressible without a new scope, as a **filter on a project-scoped subscription**:

```
scope:  { kind: "project", id: … }
source: "task-lifecycle"
filter: { all: [ { path: "payload.toColumn", op: "eq", value: "review-by-ai" } ] }
```

So a column may appear in a `filter` (which tasks moved where) and in an `action`
(`move-column`, where the event pushes a task), but never in `scope`. Same reasoning excludes
label, agent, and priority: those are filter dimensions over a project's events, not owners of
subscriptions. The test for a scope is ownership and lifetime — who deletes it and when it dies —
and only the four objects above answer that: a task subscription dies with its worktree, a project
one with the project, a space one with the space, a global one only when the user removes it.

### Filters — generic condition tree

```
Condition = { all: Condition[] } | { any: Condition[] } | { not: Condition }
          | { path, op, value }        // path into {source, kind, key, payload.*}
ops: eq ne gt gte lt lte contains startsWith endsWith glob regex in exists
```

CLI accepts one expression parsed into the tree:
`--when 'payload.branch == "main" && payload.attempts >= 3'`. Evaluator is an in-house,
dependency-free pure function (~150 lines), format-compatible with `json-rules-engine` /
`rulepilot` condition schemas. Deliberately not a scripting language.

### Providers — extensibility tiers

`EventSourceProvider { kind, accepts(sub), start(subs, emit) }` emitting normalized
`Dev3Event { source, kind, key, occurredAt, origin, payload }`. The registry, router, envelope,
delivery and audit log are source-blind.

1. **Built-in providers** — GitHub PR/issue, branch, timer (cron/RRULE), file watch,
   task-lifecycle. One TS module each under `src/bun/events/providers/`.
2. **`dev3 event emit --source deploy --kind finished --key prod-42 --json '{…}'`** — universal
   zero-code ingestion over the CLI socket; any script/CI/deploy/custom CLI becomes a source.
   Provenance is stamped (`origin: cli` + emitting task id), unforgeable.
3. **Command-poll subscriptions** — `{ command, interval, dedupe: output-hash | json-path }`;
   the engine polls on the shared throttled schedule, fires on transitions. Any read-only CLI
   becomes a source via configuration.
4. **Webhook ingress** — tokened route on the remote-access server (stage 3).

### Waker store

A **waker** = named reusable definition (provider + config + default filter/action). The store
lists built-ins (`pr-activity`, `issue-opened`, `ci-verdict`, `cron`, `file-changed`,
`task-lifecycle`) next to user customs (`deploy-finished` via emit contract, `staging-healthy`
via command-poll, `sentry-alert` via webhook). Model-catalog pattern: dev3 owns the skeleton,
the user owns the contents; customs are first-class everywhere. Project customs live in
`.dev3/config.json` and sit behind the `foreignCode` trust boundary (they run commands).

### Delivery policy (chatty sources)

- `immediate` — CI verdicts, deploys; hold still merges simultaneous bursts.
- `debounce` — quiet-window with a cap; 14 review comments in 10 minutes → one wake.
- `digest` — accumulate, deliver hourly / daily-at-9 / cron; envelope groups events by kind with
  counts and the *current end-state*.
- `urgentBypass: Condition` — evaluated per event, jumps the batch (red build wakes now, comments
  wait for the digest).

### Queueing semantics (Kafka/SQS vocabulary, mapped local — no brokers)

Two stores, both plain local: an **append-only event log** read by cursor per subscription
(the `dev3 events` shape), and an **SQS-style pending-deliveries queue**: ack on
`delivered`/`held`, visibility-timeout retry after crash (idempotency via per-event `key` +
transition-only firing, the `computeSignalKey` pattern), per-waker `messageTtl` (stale news
expires instead of waking an agent), dead-letter after N attempts (auto-pause + attention),
`dev3 subscribe clear <id>` purge. Implementation: `bun:sqlite` table (~300 lines; `plainjob`
as the blueprint). **Temporal/Kafka/SQS/BullMQ/DBOS all rejected** — each requires a server or
datastore the update-channel rules cannot guarantee; steal semantics, not infrastructure.

### Downtime, missed fires, and backfill

dev3 is a desktop app: it is closed overnight, the laptop sleeps, the machine reboots. A cron
that fired at 02:00 while the app was down has no runtime to fire into, so **every schedule
declares what happens when it is missed** — never a silent global default. The existing
automations scheduler already models exactly this (missed/catch-up taxonomy with a grace
window, first-tick late-fire catch-up in the scheduled-message scheduler); the bus generalizes
it into one policy field.

| `catchUp` | On startup, for fires missed while down | Fits |
|---|---|---|
| `run-once` | Fire once now, however many were missed, marked late with the original due time | Nightly maintenance — running it 5 h late is still useful |
| `skip-stale` | Drop it if older than `grace` (default 30 min); otherwise fire | Morning digests — yesterday's 09:00 digest is noise at 14:00 |
| `coalesce` | Collapse all missed occurrences into one fire carrying the count and window | Hourly health polls — 10 missed fires are one "you were down" |
| `all` | Replay each missed occurrence in order (hard cap, then coalesce the remainder) | Rare; only where each tick has independent meaning |
| `drop` | Never catch up; wait for the next scheduled time | Anything whose value is purely "right now" |

Two things make this honest rather than hand-waving:

- **Every timer subscription persists `lastFiredAt` and `nextDueAt`.** On boot the engine
  compares them against the clock, so "did we miss anything" is a computation, not a guess. A
  cron with no `lastFiredAt` (freshly created while down) never backfills — it starts at its
  next due time.
- **External sources backfill by cursor, not by clock.** For GitHub-shaped sources the engine
  re-polls with the stored etag/cursor and replays what genuinely happened while down (subject
  to the same `messageTtl` and transition dedupe), which is strictly better than a timer's
  guess. A webhook that arrived while the app was down is simply lost — that is inherent to a
  desktop app with no always-on receiver, and it is why polling sources keep a cursor even after
  webhooks exist.

Sleep versus shutdown are the same case: the tick loop detects a wall-clock jump larger than the
interval and runs the same catch-up evaluation (the existing pollers already re-stagger after a
sleep). The user always learns what happened — the control center shows a "dev3 was closed
HH:MM → HH:MM, N fires missed" banner with the per-waker verdict and a **Run skipped now**
action, and nothing that was skipped is silently forgotten. TTL expiry, dead-letter, and this
banner are the three places the platform admits it did not deliver something.

### Hibernation is the point, not a side effect

Hibernation today reclaims memory by destroying a task's agent, tmux session and dev server while
keeping its worktree and column; waking is explicit and manual. That manual step is the only
reason a task waiting on something external must stay live and expensive. The bus removes it:
**a subscription is a reason to hibernate.** An agent that has said "wake me when the review
lands" needs no process at all in the meantime — the subscription outlives the session because it
is persisted on the `Task` record, and the router's wake-dead-pane path (un-hibernate → relaunch
agent → deliver the envelope as its first prompt) is exactly the resume mechanism.

That composition is worth stating as a rule rather than leaving implicit:

- **A hibernated task keeps watching.** Hibernation currently refuses column changes and drops
  scheduled messages; it must *not* drop subscriptions, or the feature inverts — the cheapest
  tasks would be the blindest. The engine polls on behalf of a hibernated task exactly as for a
  live one; only delivery differs.
- **`hibernateOnIdle` becomes offerable.** Once an event can wake a task, the app can propose
  hibernation when a task's only remaining work is waiting: "this task is idle with 2
  subscriptions — hibernate until one fires?" Opt-in per task, never automatic, because
  hibernation destroys a session the user may be reading.
- **Waking has a cost, so the delivery policy carries the weight.** Relaunching an agent is far
  more expensive than typing into a live pane, so a hibernated target is the strongest argument
  for `digest`/`debounce` and for transition-only firing: one wake for a batch, not one per
  comment. A subscription whose target is hibernated should default to coalescing.
- **The wake reason must survive into the prompt.** The envelope already names the source and
  kind; for a hibernated task it additionally states that the session is fresh — the agent lost
  its context and must re-read the task, its notes, and the worktree before acting. Waking an
  agent into a stale assumption is worse than not waking it.
- **A wake that cannot start the agent is not a silent failure.** If relaunch fails the delivery
  goes to the queue's retry path and then dead-letter with attention, never a dropped event.

Net effect: the memory-reclaim feature and the automation feature reinforce each other. Today a
task either stays live and costs resources or hibernates and goes blind; with the bus a task can
be **cheap and still responsive**, which is the combination that makes many parallel long-lived
tasks practical.

### Router (delivery resolution order)

1. Live pane → `<dev3-event …>` envelope via `deliverAgentPrompt` (+hold).
2. Task exists, pane dead/hibernated → **new wake path**: un-hibernate, relaunch agent, queue the
   envelope as first prompt (also fixes today's scheduled-message drop).
3. No target task → spawn via the automations path.
4. `notify` → existing notification fan-out.
Every firing lands in the audit log + board-events feed.

### Management surface

CLI: `dev3 subscribe <waker> [--scope …]`, `list [--scope task|project|space|all]`,
`unsubscribe <id> | --all`, `pause/resume <id>`, `show <id>` (record + firing history),
`test` (dry-run a filter against recent log events), `clear <id>` (purge pending).

Ownership: an agent freely manages its own task scope; wider-scope entries created by the user
are the user's — an agent wanting one removed raises attention.

### UI placement (decided via `/ux-principal`, 2026-08-31)

The first draft put the control center in Global Settings. **Rejected**: `settings.forbidden`
includes `daily_operational_action`, and pending deliveries, dead-letter items and a firing log
are operational, not durable preferences ("Settings does not own daily operational commands").

The feature is **not one surface** — it is three feature classes that the manifest sends to
three different homes:

| Part | Class | Home |
|---|---|---|
| Subscription/schedule **list**, pending, dead-letter, firing history | diagnostic / status + operational | **One overlay**, scope-parameterised |
| **Per-task preview** — what will wake this task | status | Task card `signals` chip + a capped preview in the inspector body |
| **Waker definitions**, custom wakers, catch-up policy | durable configuration | **Project Settings → existing `automations` tab, renamed `Events & Schedules`** |

**1 · The control center is an overlay, not a destination.** It follows the `agent_traffic_log` /
`task_notes_log` precedent exactly: dialog on wide, `BottomSheet` on narrow, opened to answer one
question, costing **zero** nav budget and zero header chrome. Scope is a filter *inside* it
(task / project / space / everything), pre-set by where it was opened from — one component, four
pre-filters, which is what "same component, pre-filtered" means in practice. Entry points, all
established for this shape: the task-card chip popover (`Manage…`), the inspector preview's
`Show all N` row, the native **View** menu, the **⇧⌘P** action palette, and one shortcut
registered in `keymap.ts` (⇧⌘E proposed — verify against the registry, which is the source of
truth). Global scope is that same overlay opened with `scope=everything`, **not** a screen.

**2 · Task scope reuses the existing chip; it does not add a card action.** The card's action
strip is 4/4 ("there is no slot 5"), but the `signals` zone is where new badges land and already
owns one shared **deferred-timer chip** slot (`scheduledLaunch` on a To Do card,
`ScheduledMessagesChip` on a live-agent card, never both). Subscriptions are the same class —
a deferred agent interaction — so the chip **shows the soonest next wake whatever its kind**, and
its popover enumerates all of them. The manifest's "do not add a second timer badge class" is
honoured by extension, not by a new badge. In the inspector, a `Watching` preview sits in the
expanded body as a peer of `notes_preview`, capped the same way (newest 3 + count +
`Show all N` → the overlay), per the 2026-08-14 log rule.

**3 · Definitions go where Automations already went, and cost no new tab.** The 2026-07-05
decision put RRULE automations in a Project Settings tab because they are durable config, with
run history inside the tab. An automation *is* a timer subscription with
`action: launch-task`, so the fourth tab is **renamed** rather than joined by a fifth: tabs stay
4/6, waker definitions and catch-up policy land beside the automations they will eventually
absorb, and the operational lists stay out of Settings.

**Rejected placements**, each against a rule already on the books:

- **A ninth nav destination** — the budget is 8/8, spent (restated 2026-08-22); a single-feature
  screen was already refused for Automations.
- **A GlobalHeader button or pill** — refused for stats and diagnostics; the wide header already
  runs ~9-10 controls against §12.3's "never a 9-icon row". Failures instead ride the **existing
  attention mechanism** (`raiseAttention` → card bell + count), which is what it is for.
- **A board toolbar button** — the board has deliberately kept 0 of its 4 toolbar slots and has
  no toolbar at all. The board expresses this through **filter tokens** instead
  (`is:watching`, `has:pending`), the established extension path.
- **A dashboard panel** — §10 rules a cross-project list there "nowhere", because a panel and the
  project rows rendered the same tasks twice. Global scope is the overlay.
- **A space screen or per-space entry** — a space is a subject of the board, never a place.
- **Anything on the Productivity Stats cockpit** — read-only by charter; no filters, no mutation.
- **A "dev3 was closed, N fires missed" dashboard banner** — missed runs already have a ruled
  path: toast + status on startup (2026-07-05), with the detail inside the overlay.

Manifest edits are deliberately **deferred to the implementing PR** — writing rules for an
unbuilt surface would make the manifest describe a product that does not exist, and
`docs/ux/` is under an enforced size budget. When stage 1 lands, that PR must: add the overlay
to bible §5 + `ux-architecture.yaml` with its `allowed`/`forbidden` lists, extend
`task_info_panel.allowed` with `watching_preview`, extend the `deferred_timer_chip` note to the
third state, record the tab rename, and add one ≤5-line `UX_DECISIONS.md` entry. A `help.ts`
topic plus `data-help-id` zone ship in the same commit, and the entry point must be
touch-reachable (≥44px) — no feature may be touch-unreachable.

### Shipped skill

Extend the auto-installed dev3 agent skill (or add a sibling `dev3-events` skill) so agents can
*configure* the mechanism per project: define custom wakers ("deployment" differs per project),
write filters, auto-subscribe when relevant (a task that opens a PR subscribes to `pr-activity`;
a deploy task registers the project's `deploy-finished` waker, proposing it to the user when it
belongs in `.dev3/config.json`), unsubscribe etiquette (transition-only, TTLs, clean up when the
reason is gone).

## Open-source verdicts (npm, live, 2026-08-31)

| Concern | Verdict |
|---|---|
| Cron | **Adopt `croner`** (v10, 0 deps, Bun-first, tz/DST-correct scheduling) |
| File watching | **`chokidar@5`** (pure JS since v4) if multi-worktree reliability matters; else debounced built-in `fs.watch` |
| GitHub payload types | **Adopt `@octokit/webhooks-types`** (devDependency, zero runtime cost) |
| GitHub polling | In-house ~30 lines: Events API + `If-None-Match` etags (304 = zero rate-limit cost), honor `X-Poll-Interval` |
| Condition evaluator | In-house ~150 lines. `json-rules-engine` validates the schema but fails the bar (stale, `jsonpath-plus` dep with an RCE-history CVE). `rulepilot` (MIT, zero deps, TS) is the fallback if we prefer a library. `@gorules/zen-engine` is modern but ships per-platform Rust binaries — wrong size |
| Durable queue | In-house on `bun:sqlite`. **DBOS Transact is Postgres-only (verified)** — out; `plainjob` is the design blueprint |
| Emitter | In-house / typed `node:events` |

Net new runtime deps for the whole platform: **1–2** (croner; chokidar if needed).

## Migration impact

**Data: none** — every store is additive (new Task field older versions ignore, new sibling
files, new SQLite file). **Code: staged absorptions**, each a whole-in-one-change rewrite per the
no-deprecation rule: prWatch/mergeWatch become the first providers (stage 2, behavior
identical); scheduled messages untouched (wake path *fixes* their drop bug); automations are the
one real re-expression candidate (a timer subscription with `action: launch-task`) — absorb only
after the bus is proven. Hooks, the events feed, notifications, push messages: untouched — the
bus emits into them.

## Staged plan

1. **PR activity subscription** (~1 PR): `dev3 subscribe pr`, task-scoped, envelope into the live
   pane. Reuses everything prWatch already fetches. Mirrors the reference UX exactly.
2. **Registry + router** (2–3 PRs): general subscription model, project scope, `launch-task` /
   `notify` actions, issue-opened + branch-moved sources, `dev3 event emit`, the skill.
3. **Wake + ingress** (3+ PRs, independently shippable): wake-dead-pane delivery, webhook route,
   file watching, control-center UI, timer unification, digests.

## Risks

- **Prompt injection (high):** event payloads are attacker-writable text typed into an agent.
  Envelope marks third-party content; deliver metadata + pointer, not bodies, by default;
  subscription creation stays off the unauthenticated surface.
- **Wake storms / token burn (high):** transition-only firing, hold coalescing, delivery
  policies, rate caps, TTLs.
- GitHub rate limits: one shared poll per repo; etag polling.
- Zombie subscriptions: task-scoped die with the task; wider scopes get TTL + visible list.
- Not to be confused with the typed main→renderer push-bus redesign
  (`decisions/2026/07/16/typed-push-bus-design.md`) — a sibling, kept separate.
