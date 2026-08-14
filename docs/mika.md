# MIKA — the house assistant

**Mika is who you ask when the thing you need doing is Ronin's own business.** How does a
dial work, add this repo, start me a session for the flaky render test, call me Glen.

She is **a session**, not a service and not a model call the house makes on your behalf.
She runs on your own brain from the launch table, in a tile you can watch, with a dial you
can turn. That is the whole of what makes her different from a koshi, and the difference is
mechanical rather than a matter of taste:

| | **koshi** | **mika** |
|---|---|---|
| what it is | one stateless API call | a seated agent in a tile |
| its law | *never authors — it marks* | authoring is the job |
| who pays | the house, metered, needs a key | you, on your own brain |
| lives in | `ronin-services` | **cowork** — she works, alone, in the free build |

## Getting to her

| | |
|---|---|
| **ミ Mika Assist** in the header | brings her tile forward, starting her if she is not up. Then you just talk to her |
| `+system_help: how do dials work?` typed anywhere | `ronin_bin/mika` routes it to her, wherever you typed it |
| `mika "<question>"` in any pane | the same, by hand |

**Her four jobs** are catalogued in `ronin_catalogs/MIKA_MACROS.md`:
`system_help` (the default) · `project_root` · `new_session` · `system_config`.

They are in **their own catalog, not `MACROS.md`** — so no surface that lists session
macros can show them. `+system_config:` on every tile's ⚡ menu would be noise forever.
A separate file rather than a `hidden:` flag, because three surfaces read that list and a
flag is a filter one of them eventually gets written without.

## The one rule — propose, never write

**She shows the change as what it will become and waits for a yes.** Then the yes goes
through the machinery that already exists: `POST /api/project-roots`, `POST /api/launch`,
`PUT /api/owner`. No second write path and no new refusal rules — which is also the honest
answer to "an agent wrote to my catalog". It did not. It drafted, and you said yes.

The action is `propose-and-confirm` (`ronin_catalogs/ACTIONS.md`), and any macro that
changes something the owner did not spell out themselves may use it.

**Never a secret** — no key, no token, no credential is read back or written. **Never a
path spelled by hand** — `ronin-store <id>`, always. An assistant is exactly the actor most
likely to helpfully guess a home directory.

## She is a singleton

One session named `mika`, tagged `mika`. The second request finds the first. Two of her
editing `PROJECT_ROOTS.md` at once is a real bug, and unlike a ladder marker a catalog
write is not recomputed next turn.

Both callers check, and neither can produce a second one anyway: `/api/launch` refuses a
name that already exists.

## She honours the dial

A koshi ignores the dial because it is house machinery in the recorder's category — it
reads panes nobody talks to. **Mika is a session you converse with**, so reaching her is an
ordinary send: `ronin_bin/mika` hands off to `tejun-send`, and her dial governs it like any
other session's. At 👤 the request is refused and says so.

A house agent that cannot be silenced by the dial is a house agent that cannot be silenced.

**And it will not type over your draft.** `tejun-send` does the pre-send check and answers
`BLOCKED` when there is real unsubmitted text at her prompt; `POST /api/sessions/:name/send`
checks the dial but not the prompt, which is why the tool does not use it. Mika is the
session you are most likely to be mid-sentence in, which makes her the last one that should
ever be written to blind.

**The check is ghost-aware, and that half is what makes it usable.** Claude renders a
suggested reply at the prompt — the kind you press Tab to accept — in dim text, and there is
almost always one there. Dim is the CLI talking, not you: read as a draft it would block
every send forever, read as an empty prompt it is exactly right. `capture-pane` without
`-e` strips the colour and loses the distinction entirely, which is how a reader (this one)
mistook a suggestion for a draft.

## The session max — counted, never blocked

**She counts toward the total. The cap never refuses her.** Two rules, and collapsing them
is the mistake: *blocking somebody who is asking for help is rude.* Ten of ten running, and
she is the eleventh.

It exempts the **spawn**, never the **census**: she counts the moment she exists, so the
NEXT session is the one refused. **Nothing is evicted to make room** and no session is ever
chosen to die.

The implementation is one field in the catalog and one condition in code:

```markdown
- **cap:** exempt          # ronin_catalogs/SESSION_JOBS.md, on MikaAssist
```

```ts
if (opts.agent !== false && !opts.exempt) await assertUnderMax();   // src/tmux.ts
```

It lives in the catalog rather than in code for the reason every other launch constant
does: **nothing in `src/` may name a session_job**, or the catalog stops being the answer
to what a session is.

## What she is made of

Six things, and five of them are data:

| | |
|---|---|
| `ronin_catalogs/SESSION_JOBS.md` | the `MikaAssist` entry — icon ミ, her posture, her opening, `cap: exempt` |
| `ronin_catalogs/MIKA_MACROS.md` | her four jobs |
| `ronin_catalogs/ACTIONS.md` | `propose-and-confirm` |
| `ronin_catalogs/TOOLS.md` | the `mika` row |
| `ronin_bin/mika` | the tool: send to her, or start her and then send |
| `public/js/mika.js` | the ミ button: bring her tile forward, starting her if needed |

Plus four one-line edits on the launch path so `cap:` is read, carried and honoured
(`catalog.ts`, `spawn.ts`, `routes/launch.ts`, `tmux.ts`).

**No new endpoint, and no new kind of thing.** She is born through `/api/launch` like every
session, and reached with `tejun-send`, the tool every agent already uses to reach any
session.

## Not built, deliberately

Listed so nobody re-derives one by accident and so re-adding it is a decision:

- **Machine-wide repo discovery.** It needs a *declined* list to behave — never re-offer
  what was turned down — and that is a new store. Naming the directory is one sentence.
- **Send-time interception** of the four names. `ronin_bin/mika` is correct everywhere
  including a pane Ronin cannot see; a second path for the ones it can watch would be pure
  speed. Addable later, changing nothing here.
- **A general settings locator.** `system_config` handles the two settings that exist.
- **A question box on the ミ button.** Making someone phrase the question before Mika has
  said hello is the form problem again, one surface further out.

## Where the reasoning lives

The build-out plan, in the lab repo's wip directory — including everything cut from v1 and
why. `KOTOBA.md` § MIKA for the vocabulary, and R31 for the ruling that separated her
from KOSHI.
