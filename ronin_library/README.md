# ronin_library — the reference shelf

**test_protocols:** changed anything here? run `bin/ronin-byoin` and read the verdict — `docs/test-protocols.md` is the page.

The longer reading an action or macro sends an agent to. The catalogs say **what you can
do**; the library holds the **reference a catalog entry points at** — a format, a worked
method, a set of locations.

## Library or SOP — the one question

Both shelves are markdown, both are shadowed file-for-file by a store, and neither is
prescriptive. **The difference is who fetches it:**

| | fetched by | arrives | written for |
|---|---|---|---|
| **`ronin_library/`** | the **machinery** — an action names it, `ronin_bin/tejun` inlines it at compile | mid-task, unasked | the agent, mid-step |
| **`ronin_sops/`** | the **situation** — nothing names it until one arises | when someone goes looking | a person, relayed by the agent |

So: **an action leads to a library page; an action never leads to an SOP.** An SOP may
point at an action (its `> Tool:` header does), and the arrow runs that way only. Ruled by
the owner, 2026-08-15 — before it, the compile key read `sop:` and pulled from the wrong
shelf.

The practical test when you are unsure: **if you can name the action that would cite it,
it is library.** If the only answer is "someone would look it up when the topic came up",
it is an SOP.

## Citing one

```markdown
## write-handoff-doc
- **library:** documents
```

`ronin_bin/tejun` resolves `<name>.md` against the library store first, then this shelf,
and inlines the winner into the compile blob — so a redefined page takes effect on the
very next run and nobody goes looking for it. A catalog entry pointing at a page that is
not on either shelf is a dead link, and `check-catalogs` (a byoin_check) counts them.

## Yours beats ours, file for file

The shipped shelf is a default way of working, never a prescription. Your own library
lives in the `library` store (`ronin-store library` — never spell the path): a file there
with the **same name** as a shipped one replaces it whole, and a new name sits beside the
stock ones. Write your own project-planning how-to and your sessions read yours, not ours.
An upgrade replaces this directory and never touches your store.

**Deliberately near-empty.** The shelf starts bare and grows one screened piece at a time
— nothing is carried in wholesale.
