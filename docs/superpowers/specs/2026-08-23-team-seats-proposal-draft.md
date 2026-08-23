# DRAFT — not filed

Intended as the body of a GitHub proposal issue on `h0x91b/dev-3.0`. Nothing has been
published. Title below, body from `## Goal` onward.

**Title:** `Proposal: Team seats — sharing Spaces, projects and tasks with other people`

---

## Goal

Let more than one person use one dev3 host: an owner shares a Space (or a single project
or task) with teammates, who see the board, the tasks, the context and — depending on
their seat — can collaborate, review, or drive agents.

This proposal is an umbrella. It settles the object model and the doctrine, and commits
only to **v1: identity, ownership and presence**. Everything that needs a real
authorization boundary is named here as a follow-up and explicitly gated on a decision
record, because that boundary is a product decision and must not be chosen by whoever
implements it first.

## Why

dev3 is single-operator by construction. `dev3 remote` already serves the entire app to a
browser, but its auth is one anonymous session: a QR token is exchanged for a single
`dev3_session` HttpOnly cookie, and whoever holds it is the operator, with full RPC and
PTY access to every project on the machine. Sharing anything today means sharing
everything, including a shell.

Meanwhile the pieces a team needs already exist in isolation: Spaces group projects,
the Spaces dashboard already renders live work across them, `dev3 peek` is a read-only
glance at another task's terminal, tasks carry notes and overviews written for other
readers, and the agent mailbox already accepts messages aimed at a task. What is missing
is the notion that a second person exists.

## Prior art

**OpenClaw** is the closest comparable project — a locally-hosted agent gateway with the
same single-operator origin — and its teams story is instructive precisely because it has
**not shipped**. Two competing designs exist there:

- [`openclaw#105322`](https://github.com/openclaw/openclaw/issues/105322) + PR `#105353`,
  from a contributor: local accounts with scrypt verifiers, opaque revocable sessions, a
  `member` role holding zero operator scopes, exact per-resource grants, one-time invite
  links with three closed presets (Read / Read+Request-Changes / Read+Write), append-only
  change requests with optimistic-revision approval, and a restricted `/teams` portal
  distinct from the operator dashboard — no settings, no terminals, no global broadcasts.
  The implementation was complete and green. It was closed as `not_planned` on
  2026-08-23 anyway: the review verdict was that a cross-cutting authentication and
  authorization boundary needs explicit maintainer product and security sponsorship, and
  cannot be selected by a contributor patch.
- [`openclaw#112499`](https://github.com/openclaw/openclaw/issues/112499) and
  [`openclaw#112495`](https://github.com/openclaw/openclaw/issues/112495), from the
  maintainer, still open and pending a product decision: sessions get a permanent
  `createdBy` identity and avatar, presence rendered distinctly from ownership, a
  filter-by-person facet, and per-session visibility states — shared, read-only, suggest,
  draft. `suggest` lets a non-collaborator queue a proposed prompt that the owner
  approves inline (send now / enqueue / edit / delete), with verbatim sends credited to
  the suggester. Invite links are a signed token bound to `(session, role, expiry)` minted
  through the existing device-pairing seam, plus a "knock" flow to request send rights.

The first lesson is the sequencing: **the authorization seam is the product decision.**
A finished implementation did not survive proposing one.

The second lesson is the doctrine, which both designs require stated in plain language in
their docs, and which this proposal adopts verbatim below.

The third is empirical: OpenClaw's own team deployment is Cloudflare Access SSO in front
of a single-operator gateway where every admitted person can steer every session. The
cheap option is the one actually in production.

Beyond OpenClaw: Google Docs roles (viewer / commenter / editor) are the mental model
users arrive with; `tmux attach -r` is the prior art for a read-only terminal client;
Figma per-file invites are the prior art for per-resource links.

## Doctrine (hard requirement, not a caveat)

> Anyone who can drive an agent can make it do anything the agent can do, as the host
> user, with the host user's credentials. Inside one host, seats are a **usability**
> feature, not a security boundary. Real confinement requires separate machines or
> separate runtimes and is out of scope.

This must appear in the shared-access documentation and in the app where a seat is
granted, not only in an issue. Two consequences that shape the whole design:

- The only honest security boundary is **admission** — who reaches the server at all.
  Everything past admission is a convenience.
- Therefore `Operator` is a seat you trust a person with, not a capability you hand out
  because a checkbox existed.

## Object model

Four new concepts, named so they don't collide with what dev3 already means:

- **Identity** — a person, derived from the admission layer (a trusted-proxy header, or a
  local account if one is ever added). Optional end to end: a host with one identity must
  render zero collaboration chrome. Solo dev3 looks exactly as it does today.
- **Seat** — what an identity may do on this host. Four, ordered:
  | Seat | Can |
  |---|---|
  | **Observer** | read the board, cards, overviews, notes, diffs, artifacts; read-only terminal tail |
  | **Reviewer** | Observer, plus review comments, approve/decline completion, merge PRs |
  | **Collaborator** | Observer, plus create/edit tasks, notes, labels, column moves — no shell |
  | **Operator** | everything, including driving agents, panes and dev servers |
- **Grant** — a seat bound to a scope. Scope is a **Space**, a project, or a single task.
- **Sharing unit** — the Space is the default and the one the UI leads with. It is
  already the grouping abstraction, it already has a dashboard rendering live work across
  its projects, and it already carries a `sensitive` flag that streamer mode honours.
  A "team room" is a Space with grants.

`Task.createdBy` becomes the ownership stamp. It is permanent and set at creation.
Presence — who is currently looking at a task — is rendered as visually distinct chrome
from ownership; conflating the two is a mistake OpenClaw explicitly reports hitting.

Naming note: dev3's `draft` is taken and means something unrelated (an unfinished task
with no worktree, one-way promotion). The visibility state OpenClaw calls `draft` needs a
different word here — `private` is the candidate.

## v1 — what this proposal commits to

**Identity, ownership and presence. No enforcement, no security claims.**

1. **Admission is delegated, not built.** The host is placed behind an identity-aware
   proxy; dev3 reads the authenticated identity from a trusted header. dev3 does not grow
   a password store, email delivery, or SSO in v1.
2. **`Task.createdBy`** stamped at creation, with the identity's avatar on the task card
   and in the task header. Absent on solo hosts, and absent on every task created before
   the feature — a missing owner is normal, never an error state.
3. **Presence** — who is viewing a task right now, rendered distinctly from ownership.
4. **Filter by person** in the sidebar and the Spaces dashboard.
5. **Documentation** — a shared-access page plus the doctrine paragraph, both stating that
   v1 grants no isolation whatsoever: everyone admitted is an operator.

That is deliberately thin. It is the part that is honest without an authorization seam,
it is independently useful (attribution on a multi-person host is most of the day-to-day
value), and it forces nothing about the boundary decision.

**Prerequisite to state plainly:** `dev3 remote` publishes a Cloudflare **quick** tunnel
whose `*.trycloudflare.com` hostname is random per `cloudflared` process
(`src/cli/commands/remote.ts`), and the session cookie is bound to it. Access policies
bind to a hostname in a zone you control, so putting Access in front requires a **named**
tunnel on the owner's own domain. Supporting a named tunnel is part of v1's scope, or v1
is documented as LAN-only. This is not a configuration footnote; it is the gate.

## Non-goals for v1

- Any authorization boundary: no seat enforcement, no scoped RPC, no read-only PTY.
- Local accounts, passwords, email, SSO, SCIM, billing, or any hosted service.
- Federation between two dev3 hosts, or syncing state between teammates' machines.
- Per-seat cost accounting or budgets.
- Changing how a task's worktree, git identity, or `gh` account works.

## Follow-ups, each independently shippable

Named here so the umbrella is legible; **none of them start before a decision record
settles the authorization seam** (see Open questions).

- **F1 — Seat enforcement.** The `member` seat class, grants persisted, and every
  `rpc-handlers/*` method plus the PTY WebSocket upgrade scoped to a seat. This is the
  large one: it touches the entire RPC surface and both terminal backends. Two existing
  pieces help — the read-only pane-capture seam
  (`decisions/2026/08/04/read-only-pane-capture-seam.md`) and `dev3 peek`, which is
  already a read-only terminal observation with defined freshness semantics.
- **F2 — Suggest mode.** A non-Operator composes a prompt for an agent; it lands in an
  owner-approved queue instead of the pane. Half-built already: the agent mailbox and its
  quiet-window coalescing are the transport, so this is mostly the review UI plus
  "suggested by X" attribution.
- **F3 — Per-resource invite links.** A signed, expiring, revocable token bound to
  `(scope, seat, expiry)`, minted through the existing QR-token exchange. A link narrows
  what an already-admitted identity gets; it never admits an outsider past the proxy.
- **F4 — Knock flow.** An Observer requests a higher seat on one scope; the owner gets a
  one-click approve/deny.
- **F5 — Visibility states** per task (`shared` / `read-only` / `suggest` / `private`),
  which only become meaningful once F1 exists.

## dev3-specific hazards the OpenClaw designs do not have

These are the reasons this cannot be a port of someone else's design.

1. **One shared PTY.** dev3 shares a single PTY across clients and sizes it to the
   smallest one (`decisions/2026/06/03/shared-pty-smallest-client-size.md`). Two people on
   one agent pane means interleaved keystrokes and a terminal sized for whoever has the
   narrowest window. A read-only client mode — a client that attaches without contributing
   to sizing or input — is new work, and it is the technical core of the Observer seat.
2. **Credentials and cost.** A teammate's agent run consumes the owner's Claude or Codex
   subscription and executes as the owner's unix user. There is no per-seat budget and v1
   does not add one; the documentation must say so.
3. **The worktree belongs to the owner.** Commits a teammate causes carry the owner's git
   identity, and PRs open under the owner's `gh` account. Attribution inside dev3 does not
   propagate to git or GitHub, and pretending otherwise would be worse than saying it.
4. **`draft` is taken**, as above.
5. **`~/.dev3.0/` is frozen.** Identities and grants go in a **new** file, `team.json`,
   beside the existing state — never reshaping `projects.json`, `tasks.json` or
   `spaces.json`, never renaming or moving anything, and absent-readable so an older
   installed version that knows nothing about seats still opens the board normally. This
   follows the on-disk invariants in `AGENTS.md` and
   `decisions/2026/04/20/freeze-dev3-home-layout.md`.
6. **No native dialogs.** Every surface here has to work in the browser, which the
   renderer already satisfies — but it rules out any OS-level prompt in an invite or
   approval flow.
7. **Streamer mode and sensitive Spaces already exist** and are partial prior art for
   "do not show this teammate my private work" — worth reusing rather than reinventing,
   though masking is a display concern and not a grant.

## Open questions

1. **The seam.** Does dev3 grow a generic per-resource authorization layer that the whole
   RPC surface consults, or does each surface check seats itself? This is the decision that
   killed `openclaw#105322` and it must be settled in a decision record before F1 begins.
2. **Does an invite link ever admit an outsider,** or only narrow an identity the proxy has
   already admitted? Leaning strongly to the latter — the link must not become a second
   admission path with weaker properties than the first.
3. **Is Operator grantable at all,** or is it "this host is shared with people I trust
   with a shell, full stop"? Given the doctrine, offering a checkbox that promises less
   than it delivers is the more dangerous option.
4. **Named tunnel scope** — does dev3 manage a named Cloudflare tunnel itself, or document
   bring-your-own-proxy and stay out of it?
5. **What identity looks like without a proxy.** LAN and SSH-forward users have no trusted
   header. Do they get a single local owner identity, or is shared access simply
   unavailable to them in v1?

## Acceptance criteria for v1

- A host with exactly one identity is pixel-identical to today: no avatars, no presence,
  no person filter, no new empty states.
- A task created by an identified user shows that owner on its card and header, and the
  stamp survives rename, move, hibernation and restart.
- A task created before the feature, or on a solo host, renders with no owner and no
  placeholder.
- Two browsers on two identities show each other as presence on the same task, visually
  distinguishable from the owner stamp.
- The person filter narrows the sidebar and the Spaces dashboard, and an empty result is
  an explained empty state, not a blank panel.
- The shared-access documentation and the in-app copy both state that v1 provides no
  isolation, in those words.
- `team.json` absent, empty, or malformed loads as "solo host" and never blocks startup;
  an older app version opens the same data directory unaffected.

## Validation gates

- Renderer, backend and CLI suites green (`bun run test`), plus new coverage for identity
  resolution, the absent-identity path, and `team.json` tolerance.
- `bun run lint`.
- Manual browser QA of the board, task header and Spaces dashboard in **both** the
  one-identity and two-identity configurations, screenshots in streamer mode.
- A decision record for the identity source and the `team.json` contract, committed with
  the code.
