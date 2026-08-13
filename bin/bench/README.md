# bench — compare models on a frozen question

```bash
bin/bench/bench capture monday          # freeze every live session that has a ladder
bin/bench/bench run monday gpt-5.6-luna koshi_hosted_weights:qwen3-4b
bin/bench/bench table monday            # everything ever run against that dataset
bin/bench/bench ls                      # what is captured, what has been run
```

Datasets and results land in `~/.ronin_bench` (`BENCH_DIR` to move them). They are data,
not source, and they are deliberately outside the repo.

## Capture once, replay forever — the reason this tool exists

On 2026-08-10 two sessions benched the same local model on the same box within an hour
and got **9 right / 1 wrong** and **7 right / 3 wrong**. Neither was mistaken and neither
had a bug. One replayed a frozen snapshot; the other asked the live sessions, whose
ladders and transcripts had moved in between.

**A number from a live bench cannot be compared with any other number — including itself
an hour later — because the questions were not the same questions.** So `capture` freezes
the bytes and every model that ever runs against that dataset answers identical input.

That is the whole design. Everything else here is a table.

## A target is `outlet:model`

```
gpt-5.6-luna                        the default outlet (koshi_external)
koshi_external:gpt-5.4-mini
koshi_hosted_weights:qwen3-4b       whatever the local server is serving
```

Outlets come from `src/koshi-model.ts` — the same ones Koshi asks through. **Anything
Koshi can be pointed at, this can bench, because it is the same code path rather than a
copy of it.** A fourth outlet is benchable the day it exists, with no change here.

## Proxy is not truth — read this before quoting a score

Every captured item carries `proxy`: the rung that session's own agent had marked ACTIVE.
**It is a weak ground truth on purpose.** It is the very mark agents are bad at keeping,
which is the entire reason Koshi exists — so a model can be *right* against a blank or
stale proxy and be scored as wrong.

Measured, and worth keeping in mind: on two sessions where the agent had marked nothing,
a local 4B, a local 8B and a hosted model independently returned the **same** rung. Three
unrelated models agreeing where the agent is silent is an argument for Koshi, not three
misses.

So each item also has `truth`, which is `null` until a person edits the dataset file and
says what the right answer was. Fill in the ones you are sure of and leave the rest —
`table` then reports **SCORE** against your answer key alongside agreement with the proxy.
**Only the answer key is a benchmark.**

## Reading the table

`WRONG is the column that matters.` An abstain leaves the ladder alone; a wrong rung
writes a claim nobody made. A model that is cheaper, faster and abstains more is usually
the better watcher, and a model that is more often right while occasionally inventing a
rung is usually the worse one. Cost and latency are printed because they matter, and they
are the last thing to decide on.

`unreachable` is counted separately from an abstain. To Koshi they are the same — an
outage is an "I don't know" — but to whoever is reading a bench they are not: one is a
judgement, the other is a server that was not running.

## Adding a new kind of question

Today every item is Koshi's marker question (*which rung of your own ladder are you on?*).
When Reaper or New Session need benching, the shape to copy is `Item`: the prompt inputs,
the closed list of allowed answers, and the proxy. The enum is built per item from that
item's own options, so "invent an answer" stays something the grammar cannot express.
