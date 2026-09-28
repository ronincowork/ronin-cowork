# The data path — how server state reaches the browser

Read this first for anything that shows server state on screen. It is the one rule, the
one contract, and the one recipe. The pages it links hold the detail for each part.

## The rule

**The server pushes when its state changes. A surface subscribes when it opens and paints
what it is handed. Nothing in the browser asks on a clock.**

Three consequences, and every module in `public/js/` and `src/ws/` follows them:

1. **One copy.** The browser holds one copy of each server resource, in `store.js`. No
   surface keeps its own, and no surface fetches a resource the store holds.
2. **Change-only delivery.** A subscriber hears a resource only when a field a surface
   paints moved. The store and the server both compare by the painted fields, so a surface
   never checks whether it should repaint, and nothing tears down and rebuilds on data
   that did not change.
3. **What you initiate answers you.** A write returns its own result in its response. The
   change it caused reaches every open tab, this one included, by the push.

There are no guards in surfaces, no retry loops, no throttles, no visibility checks
standing in for a close. When something seems to need one, the shape upstream is wrong.

## The picture

```
 tmux notifications ─┐                              ┌─ subscribe / unsubscribe
 2 s heartbeat ──────┤   src/ws/events.ts           │        ▲
 store-folder watch ─┤   one tick → one listing     │   surfaces (tile, roster, wipeboard …)
 write routes ───────┤   signature-diffed pushes ───┼──▶ public/js/store.js
 services (gbrain,   │   held values on connect     │   one socket, one copy per resource
   machine) ─────────┘   `want` answered in order   │        │
                                                    └─ paint what is handed
```

The server observes or is told; it never waits to be asked. The browser holds and paints;
it never asks on its own clock.

## The contract — every message on `/events`

**Held resources.** Published when the resource changes, sent only when it differs from the
last, and sent whole to every fresh connection, a reconnect included. That is a tab's
snapshot: no browser reads these over REST.

| Message | What it is | Changes when |
|---|---|---|
| `{t:'sessions', list}` | the session listing with its Team and lead axes | a tmux notification, or a painted field moved on the tick |
| `{t:'home', rows}` | one row per session: stance, model, context gauge, work record | a painted field moved on the tick |
| `{t:'teams', rosters}` | the Team rosters, the shape of `GET /api/team-rosters` | a roster or project write |
| `{t:'messages', list}` | the message queue | a file in the queue folder changed |
| `{t:'memory', reading}` | the machine reading behind the memory gauge; `{off:true}` once when watching is off | the machine service's reading moved |

**Asked-for resources.** Per board or per Team, held by nobody until a surface wants one.
Subscribing sends `{t:'want', resource, board|team}` on the socket, and the server answers
that one connection with the message it broadcasts to everyone on a write. Snapshot and
changes come down the one ordered channel, so a snapshot can never overwrite a newer
change. Each reconnect says the wants of every live subscription again.

| Message | Wanted as | Changes when |
|---|---|---|
| `{t:'wipeboard', board, posts, more}` | `wipeboard:<board>` | a file under that board's folder changed |
| `{t:'jikan', team, jobs}` | `jikan:<team>`, or `jikan:*` for every Team | that Team's jobs file changed |
| `{t:'shutdown', id, …operation}` | `resource:'shutdown', id`, by a socket that reopened mid-shutdown | each phase of the operation, and its end |

**Feeds.** Listened to while a surface is open, not held: a transcript's records, a Team
page draft, Mika's readiness after a `POST /api/mika/ready` answers `starting`, the
Setup, GitHub setup, Services setup and gbrain progress while their work runs. Each is
`{t:'<name>', …}` with the same answer its GET route gives, and the action that started
the work answers with the same snapshot.

`src/ws/events.ts` is the one place that sends; `src/ws/watchers.ts` scopes the
per-session feeds. [Runtime connection](tmux-connection.md) has the server table with
every trigger spelled out.

## The lifecycle of a surface

```js
import { subscribe } from './store.js';

let stop = null;
return {
  enter() { stop = subscribe('home', (rows) => paint(rows)); }, // snapshot now, then each change
  leave() { stop?.(); stop = null; },                            // nothing heard after this
};
```

- **Open** subscribes. The store hands the current value at once if it holds one, or sends
  the `want` and hands the answer when it arrives.
- **While open** the store hands each change, and only changes.
- **Close** unsubscribes. The seat that placed the surface calls its close; a surface never
  guesses it closed from a visibility check.
- **Reconnect** is a new connection with no memory: the server sends every held resource
  whole and the store re-sends every live want. `renew()` on a resumed tab does the same.
  A terminal socket that drops unexpectedly also renews the store by force: `/events` only
  listens, so after a sleep it can sit dead while still saying open, and the terminal's
  first keystroke is what finds the link gone.
- **Unreachable** is said from the socket: the page shows the failure bar whenever the
  socket is closed and not yet reopened, desktop and phone, and clears it on open.

What a surface reads at the moment it opens and does not hold is fine when it is not a
published resource: a work record's desks are one `GET /api/desks?session=` at ladder
open, because they are a git computation made for that moment. That is a snapshot, not a
poll.

## The server side

- **One tick, one listing.** A tmux notification, or the 2 s heartbeat while a browser is
  connected, takes one session listing and builds `sessions` and `home` from it. Each is
  signed on the painted fields (`activity` and a stance's `at` are left out) and sent only
  when the signature moved. A connection that joins mid-tick is sent only what it missed.
- **Write routes push.** Roster and project routes push `teams` after a successful write.
  The action routes for Mika, shutdown, gbrain and the setups push their progress.
- **Store folders are watched.** Boards, cron jobs and the message queue are files, and
  every writer — a route, a CLI tool in a child process, the server itself — changes a
  file. `watchStore` reads after the change and pushes if the resource moved, one write to
  one push. This is how an Agent's `edges wipeboard post` reaches every tab.
- **Services push too.** The machine and gbrain parts under `src/services/` call the same
  `broadcastEvent` / `publishHeld`; the contract does not know which repository a message
  comes from.

The server's clocks, and why each exists: cron (`jikan`), session retention, the message
delivery queue, the pty heartbeat, the HQ confirmation wait while a registration is
pending, the machine service's one-minute reading, and the 2 s tick. None of them exists
for the browser's sake. The tick is the one place the server observes rather than is told,
because the context gauge is painted by the CLI on its own screen and announced to nobody.

## Adding a pushed resource

1. **Name the resource and its message:** `{t:'<name>', <field>}`, the same answer its GET
   route gives, if it has one.
2. **Decide held or asked-for.** Global and small: held, published with `publishHeld`, sent
   on connect. Per key: asked-for, answered from the `want` handler, with the key in the
   message.
3. **Find the change.** A write route: push after the successful write. A file: put the
   folder under `watchStore`. Something outside the process that leaves no file: the tick,
   with a painted-fields signature, and say so in the docs.
4. **In the store,** add the message to `receive` (held) or the key to `WANTED` (asked-for).
5. **In the surface,** subscribe on enter and unsubscribe on leave. Delete any read the
   surface used to make for it. Delete the GET route if nothing else reads it.
6. **Prove it** in `tests/home-push.test.ts` (a change pushes once, an unchanged tick
   pushes nothing, a fresh connection gets it) and beside the surface (opens and paints
   from a push, makes no request, hears nothing after close).
7. **Say what is** in [Runtime connection](tmux-connection.md)'s table and
   [UI](ui.md)'s update-paths table. No comment describes what used to happen.

## Proof

- `tests/store.test.js`, `tests/home-push.test.ts`, `tests/team-push.test.js`,
  `tests/pushed-surfaces.test.js`, `tests/tile-store.test.js`, `tests/setup-push.test.js`,
  `tests/shutdown-push.test.ts`, `tests/session-retire-ui.test.js`,
  `tests/unreachable-banner.test.js`, `tests/desks-session.test.ts` — each proves a push
  reaches its surface, an unchanged tick is silent, and no request is made after open.
- `grep -rn setInterval public/js` is empty. Every `setTimeout` left is a debounce, a UI
  delay, or the tile wire's reconnect.
- A browser on Home for 40 idle seconds makes no request to any data route, and one idle
  socket receives each held resource exactly once. Reproduce on a private rig
  ([verification](../development/verification.md)): open the page with Playwright, count
  requests by path for 40 s, and open a plain WebSocket to `/events` and count message
  types for 7 s.

## Ownership

| Part | File |
|---|---|
| the store, the socket, wants, the failure bar | `public/js/store.js`, `public/js/errors.js` |
| what each message means to the page (chips, feeds) | `public/js/events.js` |
| the tick, held values, watchers, `want` | `src/ws/events.ts`, `src/ws/watchers.ts` |
| the home rows | `homeRows` in `src/routes/launch.ts` |
| pushes from services | `src/services/machine`, `src/services/gbrain` (the `ronin-services` repository) |
