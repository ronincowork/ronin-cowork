# Campaign scope — how a record says which body of work it belongs to

A **campaign** is a named body of work, and one install may run several side by side. The
durable record is the `campaign_config` (`src/campaign-config.ts`, its own writer, and
`docs/user-config.md` for the configuration boundary). This page is the other half: the
`campaign_id` that every scoped record points back with, the rules that keep those pointers
honest, and the compatibility window for everything written before campaigns existed.

The cardinality is deliberately asymmetric, and it is the whole design:

```text
campaign_config 1 ←── many team_rosters (Coworks)
campaign_config 1 ←── many project_roots
campaign_config 1 ←── many sessions (Agents)
campaign_config 1 ←── many saved templates

a running Cowork machine ── exposes one campaign_id
```

**A durable object has exactly one campaign. The running machine currently exposes one
campaign and owns none.** The record never holds a list of what belongs to it; the things
that belong to it point back. Multiple Campaign records remain a future capability; they
are not mixed together on today's Agent and Cowork screens.

## Where the pointer lives, per record

| Record | Where `campaign_id` is held | Identity becomes |
|---|---|---|
| `team_roster` | the **directory**: `team_rosters/<campaign_id>/<name>.md` | `campaign_id` + name |
| `project_root` | a `- **campaign_id:**` field in the owner's catalog | the name, still globally unique |
| saved template | a field on the row in the saved-templates catalog | `campaign_id` + name |
| live Agent | the tmux option **`@ronin-campaign`** | the session name, unchanged |

**The roster nests and the root does not**, and that asymmetry is the plan's. A Cowork name
has to resolve inside its campaign — two campaigns each having a `dev` is the ordinary case
— so the directory carries the identity and a file's own line can never disagree with where
it sits. Root names stay globally unique in this cut because the catalog keys them by
heading; removing that incidental constraint is a later storage decision.

**An Agent's campaign is an option, never a derivation from its Coworks.** Every Agent has
one campaign *even when it belongs to no Cowork* — a rōnin is first-class — so deriving it
from `@ronin-tags` would leave every teamless Agent belonging to nothing and invisible to
every view. It also means a running Agent joins a campaign with one `set-option` and no
restart, which is what the migration does.

## `''` means unmarked, and only one place resolves it

Every store reports what is written. A record from before campaigns has `campaign_id: ''`,
and no store turns that into a real id — **a store that invented identity it never stamped
would be a second writer**, and nobody could then say where the guess had been applied.

Resolving `''` onto the campaign the migration seeded happens in exactly one module,
`src/campaign-scope.ts`:

```ts
campaignResolver()          // '' → the initial campaign, hoisted once for a whole list
campaignFilter(wanted)      // '' answers yes for the initial campaign, no for any other
```

Both hand back a function rather than resolving one value: every caller is looking at a
list, and asking for the initial campaign once per row would be a store read per Agent on a
poll that already runs every two seconds.

The **initial campaign** is the earliest-created one — provenance, computed, never stored
as a "default campaign" pointer, and it counts an archived record so an install that
archived its first campaign still resolves legacy rows correctly.

**Reads fall back; writes never do.** Every create and every save emits an explicit id. That
is what makes the window closeable: when `migrateCampaignScope` has stamped a box, the
fallback stops changing any answer and can be deleted in one edit.

## The refusals

An Agent may join only a Cowork in its own campaign, and reference only a project_root in
its own campaign. Both are **refused with the two campaigns named**, never silently
corrected — quietly rewriting the caller's intent is how a scoping bug becomes invisible.

```
This Agent is in Campaign "health" and cannot join home-dev (home).
Project root "homeroot" belongs to Campaign "home", not "health".
```

Two deliberate non-refusals: a **tag-only team** has no roster and therefore no campaign to
conflict with, and an **unknown project_root** passes through — the launch resolver already
refuses that with a better message, and two refusals for one fault drift apart.

## Wipeboards: allocation, not namespacing

The plan requires that equal Cowork names in two campaigns not collide on the wipeboard, and
does not say how. **Namespacing the wipeboard store would be ambiguous**: a wipeboard *is* a
directory, so nothing on disk distinguishes a campaign directory called `health` from a board
called `health`, and `house` plus every roster-less board would need special-casing.

So the board store is untouched. A roster's `wipeboard:` is already an opaque pointer that
may point anywhere — "names do not decide anything… the board is that team's because the
roster says so" (`docs/wipeboards.md`) — so a new Cowork is simply **allocated a token
nothing else holds**: `dev` in the first campaign keeps `dev`, `dev` in the second gets
`home-dev`. Uniqueness is what the requirement needs; the token is never decomposed back
into its parts, so it needs no parseable separator.

Consequences worth stating: **nothing on disk moves**, no post or cursor is touched, `house`
and the roster-less boards keep their addresses, and an explicit `wipeboard:` the owner set
is taken as given — only the default is allocated.

## The migration

Additive and idempotent, run at boot behind the seed (`src/index.ts`):

1. `ensureInitialCampaign()` seeds the record from the install's existing campaign name,
   description and desk_profile — `src/campaign-config.ts`.
2. `migrateCampaignScope()` stamps everything unmarked into it: rosters are **re-homed**
   into `team_rosters/<id>/`, roots and templates are marked, and every live Agent is
   stamped with no restart.

It writes an id **only onto a record carrying none**, so a second run is a no-op and a
record the owner has already placed is never moved. It never guesses among several
campaigns: everything old belongs to the one campaign that existed before this feature,
which is what "earliest created" names. A record that cannot be moved is left exactly where
it is and read through the fallback — a failed migration must never lose one.

Wipeboards are absent from the migration on purpose: allocation means no board needs moving,
which is the strongest form of "without losing files or history".

## The projections

`campaign_id` rides every list a surface reads, resolved at the route boundary:

| Route | Carries | Filters |
|---|---|---|
| `GET /api/sessions`, `GET /api/home` | per Agent, through `withAxes` | machine Campaign |
| `GET /api/team-rosters` | per Cowork | machine Campaign by default; explicit `?campaign_id=` for management |
| `GET /api/project-roots` | per root | `?campaign_id=` (repeatable) |
| `GET /api/team-templates` | per template | — |

**Naming no campaign means the machine Campaign**, not every Campaign. `withAxes` is the
one funnel every browser-facing session list and event goes through, so an Agent from a
different Campaign cannot leak back onto a screen after the initial fetch.

## Implementation authority

- The pointer, the resolver, the refusals, the migration: `src/campaign-scope.ts`
- The record and its one writer: `src/campaign-config.ts`
- Storage per record: `src/team-rosters.ts` · `src/project-roots.ts` · `src/team-templates.ts`
- The live Agent's option: `src/tmux.ts` (`@ronin-campaign`)
- Vocabulary: `KOTOBA.md` (`campaign`, `campaign_config`, `campaign_id`)
- Tests: `tests/campaign-scope.test.ts` · `tests/team-roster-campaign.test.ts`
