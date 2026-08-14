# Shadowing — how a user makes a catalog theirs

> **The law is `DAIKUSAN.md`**: *edit nothing shipped — put a file with the same name in
> your catalog directory and it wins.* This is that law, built. One statement, three
> implementations (`src/catalog.ts`, `bin/tejun`, `bin/tejun-step`), and this page is the
> statement all three obey.

## The rule

```
resolve(<NAME>.md) = entries(tejun_catalogs/<NAME>.md)     ← stock, in file order
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
| `SESSION_JOBS.md` | `## name` blocks | entry-merge |
| `MACROS.md` | `## name` blocks | entry-merge |
| `ACTIONS.md` | `## name` blocks | entry-merge |
| `TOOLS.md` | a table | same rule, keyed on the tool name in column 1 |
| `HOTWORDS.md` | a flat list under `## Terms` | **copy-on-write, not a merge** — see below |
| `PROJECT_ROOTS.md` | already split by scope | **nothing to shadow** — the launch table is stock, the roots are yours |

**Deliberately not shadowable:**

- **MICHI and TEGAMI** — session data in the session store, not stock catalogs. There is
  no shipped version to win over (owner's ruling, 2026-08-11).
- **Your `PROJECT_ROOTS.md`** — already user scope. The shipped file keeps only the
  provider·model launch table, which is stock because every install needs brains.
- **`workspace_macro`** — machinery in `src/spawn.ts`, not a catalog. A markdown file
  cannot author machinery.

**`HOTWORDS.md` is the deliberate exception.** Both halves hold the same kind of thing —
words — so a merge would have to answer *"the owner deleted a stock term; does an upgrade
put it back?"* The answers are a tombstone list nobody asked for, or *yes*, and *yes*
means the ▥ tab cannot delete a word. So the first edit copies the whole document across
and from then on your file **is** the list. The cost, stated plainly: after that first
edit, new stock terms are not added for you. `src/services/koe/hotwords.ts` carries the full argument.

## Two scopes, and which is which

The shipped copies live in the install (`tejun_catalogs/`) and an **upgrade replaces them
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

## What an upgrade can and cannot touch

- **Can:** everything in `tejun_catalogs/`. Assume it is replaced.
- **Cannot:** anything in the catalogs store. That is the promise, and it is why a
  customisation belongs there and never in an edited shipped file.
- **A stock entry you shadowed stays shadowed** — an upgrade improving that entry does not
  reach you, by design. That is the trade for owning it, and the `origin` mark is how a
  surface can tell you so.

## Three implementations, one statement

`src/catalog.ts` holds the rule for the server; `bin/tejun` and `bin/tejun-step` are
Python and cannot import it, so they implement the same statement — this page — rather
than sharing the code. If the two ever disagree, this page is what they are both wrong
about, and it is the thing to fix first.

Customisation is **install-level, never repo-level** (`DAIKUSAN.md`): actions and macros
tell agents what to do, so sourcing them from whatever tree you happen to be standing in
would let a cloned repo define your agent's behaviour. That is a security boundary, not a
preference.
