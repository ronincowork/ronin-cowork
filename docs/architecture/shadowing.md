# Shadowing — how a user makes a catalog theirs

Owner resources override shipped resources through the resolver in `src/resources.ts`.
This page owns the replacement rules; [KOTOBA](../../KOTOBA.md) owns the terminology.
For the owner journey, see [Customize Ronin](../getting-started/customize.md).

## The rule

```
resolve(<NAME>.md) = entries(ronin_catalogs/<NAME>.md)     ← stock, in file order
                   ⊕ entries(<catalogs store>/<NAME>.md)   ← yours
```

**It is an entry-merge, not a file swap**, and the difference is the point. Shadowing a
whole file to add one thing forks the other seven: the next upgrade improves them for
everyone but you, silently, with nothing to point at. So:

- **Key is the `## name` heading.** A user entry of that name **replaces the stock entry
  whole** — never field by field, because a field-merge means a field can never be
  removed and "what am I actually running" stops being answerable from either file alone.
- **A shadowed entry keeps the stock one's position.** Yours is a replacement, not a
  newcomer.
- **New names append**, after the stock ones.
- **`- **hidden:** yes` on a user entry deletes the stock entry of that name.** Without a
  tombstone you could add but never remove, and the only way to drop a stock entry would
  be editing the shipped file — the thing this exists to stop.
- **Every entry carries its `origin`** (`stock` | `user`), served on the APIs, so a
  surface can show that a list is yours rather than diverging from the shipped one
  silently.
- **A missing or empty user file is the ordinary path.** A fresh install has no user
  catalogs at all and must boot, serve and render exactly the stock lists.

Whole-file override is not a second mechanism — it is this one, in the case where your
file happens to define every stock name.

## What is shadowable

| Catalog | Shape | Rule |
|---|---|---|
| `behaviours/` with the owner's `ways/` store | one Markdown page per behaviour | whole-file, by filename |
| `TOOLS.md` | a table | same rule, keyed on the tool name in column 1 |
| `SKINS.md` | `## name` blocks | entry-merge. A skin is a set of design tokens and nothing else — no selector, so the worst a bad one does is look bad |
| `HOTWORDS.md` | a flat list under `## Terms` | **copy-on-write, not a merge** — see below |
| `MODEL_PROVIDERS.md` | `### <Vendor>` sections, keyed by the `- **provider:** id` each declares | entry-merge, at this file's heading level. A section of a shipped id replaces it whole and keeps its place; a new id appends; `- **hidden:** yes`, or a section whose every `launch` cell is `—`, withdraws the shipped provider. Every served entry carries `origin` and `shadowed`; the Model providers surface says the layer under each provider |
| `PROJECT_ROOTS.md` | already split by scope | **nothing to shadow** — the contract is stock, the roots are yours |

**Deliberately not shadowable:**

- **MICHI and TEGAMI** — session data in the session store, not stock catalogs. There is
  no shipped version to win over.
- **Your `PROJECT_ROOTS.md`** — already user scope. The shipped file keeps only the
  project_root contract; the providers and models it once carried are `MODEL_PROVIDERS.md`.

**`HOTWORDS.md` is the deliberate exception.** Both halves hold the same kind of thing —
words — so a merge would have to answer *"the owner deleted a stock term; does an upgrade
put it back?"* The answers are a tombstone list nobody asked for, or *yes*, and *yes*
means the ▥ tab cannot delete a word. So the first edit copies the whole document across
and from then on your file **is** the list. The cost, stated plainly: after that first
edit, new stock terms are not added for you. `src/services/koe/hotwords.ts` carries the full argument.

## Two scopes, and which is which

The shipped copies live in the install (`ronin_catalogs/`) and an **upgrade replaces them
wholesale** — that is what they are for. Yours live in the **catalogs store**, outside
every repo, where an upgrade cannot reach and an uninstall leaves them.

**Never spell that path by hand.** Ask for it: `storeDir('catalogs')` in TypeScript,
`$(ronin-store catalogs)` in bash. `docs/stores.md` is the rule (JUSHO) and `check-place`
is the gate. Every store also takes a `RONIN_<ID>_DIR` override, derived mechanically —
`RONIN_CATALOGS_DIR` points the lookup somewhere else, which is how the resolver is
tested.

## How you test a shadow

Catalogs are parsed **at request time** — no cache, no generated file — so a shadow takes
effect on the next request. Edit the file, reload the page: no restart.

The one exception is the resolver itself. It is `src/` code, and `src/` reaches the
running operator only when the owner restarts (`docs/repo-to-operator.md`). Changing the
*mechanism* needs a restart; using it does not.

The Behaviors Settings editor uses the same rule through a typed server authority. Save on
a stock Behavior explicitly creates the same scoped relative file in the owner `ways` store;
Save on an owner Behavior updates only that file; Save As is create-only and cannot replace a
stock or owner identity. The browser never receives or constructs an owner-store path.

## What an upgrade can and cannot touch

- **Can:** everything in `ronin_catalogs/`. Assume it is replaced.
- **Cannot:** anything in the catalogs store. That is the promise, and it is why a
  customisation belongs there and never in an edited shipped file.
- **A stock entry you shadowed stays shadowed** — an upgrade improving that entry does not
  reach you, by design. That is the trade for owning it, and the `origin` mark is how a
  surface can tell you so.

## One implementation, one statement

`src/resources.ts` holds the rule for the server. If it disagrees with this page, this page
is the contract to fix first.

Customisation is **install-level, never repo-level** (`DAIKUSAN.md`). Sourcing authored
Agent resources from an arbitrary checkout would let a cloned repository redefine the
Agent's installation. That is a security boundary, not a preference.
