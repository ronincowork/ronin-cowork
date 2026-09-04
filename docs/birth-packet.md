# The birth packet — what a new Agent reads, and why it fits one read

A Cowork Agent is born with one document: the README compiled into its session record
(`~/.ronin/sessions/<name>-<stamp>/README.md`). The brief it starts with names that file,
its size, and the line it ends with. Everything Ronin needs the newborn to know is in it,
in the order it needs to be known. This page is the contract for that document.

## The invariant

**One read delivers the whole packet, and the rules come first.**

Every CLI a newborn may be caps what one read returns, and every model opens a file in a
first window of about 250 lines. Measured on this box, 2026-09-04:

| Provider | One read delivers at most |
|---|---|
| Codex (`codex-cli` 0.151.0) | about 10,000 tokens of shell output, then `Warning: truncated output` |
| Claude Code (2.1.260) | 30,000 characters per Bash call, saved to a file with a 2 KB preview beyond that; 25,000 tokens per Read, then a `PARTIAL view` banner |

So the compiled packet is held to a **budget**: `PACKET_BUDGET` in `src/birth-readme.ts`,
30,000 bytes and 450 lines. Bytes are the hard cap, the smallest single read among the
providers. Lines are the habit: the fullest stock birth compiles to about 425 lines with
the Routine contracts inside the first 250. `tests/session-boot.test.ts` compiles the real
stock shelf at its fullest, every Routine on, and holds it to the budget; a shelf addition
that would break one read fails that test, not a newborn.

## What is in it, in order

1. **The Routine contracts** — BASE ABILITIES (fork versus spawn, the work record, the
   wipeboard), WORKTREES (the desk, hand-in, never `git push`), and each Routine's on-page
   or its off-page saying what the Agent is working without.
2. **The maps** — `docs/README.md`, the question-first index, and `docs/RONIN_UTILITY.md`,
   the coworkspace for an Agent: pages, workbenches, surfaces, the tile head, Locked and
   Unlocked, copy and paste.
3. **The owner's root shelf**, as cards: title, first sentence, path. Never pasted in.
4. **SESSION_MACROS**, generated at birth from the live macro catalog.
5. **KOTOBA_GLOSSARY**, last: the house names and the plain word to say for each, rendered
   with the owner's desk words. Reference, and the least costly thing to miss.

The packet's last line is `— end of packet for <session> —`.

## What the newborn is told

The brief's `Read first:` sentence, built by `readFirstSentence` in `src/birth-readme.ts`:

> Read first: `<path>` — 424 lines, 27 KB, one read; it ends with the line "— end of
> packet for <session> —". Do not act before you have seen that line.

When a packet is over budget the sentence says so and asks for it in parts, in order,
until that line, and the compiler has already written a warning to the operator log.

## What the record keeps

The birth receipt (`birth-receipt.json` beside the README) carries a `packet` block: path,
bytes, lines, sections, terminator, `over_budget`. That is what left. When the launch
profile asks for an acknowledgement, the ACK rule asks the newborn to quote the packet's
last line — that is what arrived, on the tape, in the Agent's own words.

## Adding to the shelf

Put the file on the shelf (`docs/session-boot.md` says where each level reaches) and run
the session-boot tests. If the real-shelf test fails, the packet no longer fits one read:
shorten the file, make it a card instead of inline reading, or move it to a Routine so only
the Agents who need it pay for it. Do not raise the budget to make room; it is the
provider's cap, not ours.

## Why this page exists

On 2026-09-03 a sweep commit re-pointed the shelf's vocabulary entry at the 105 KB UI string
table. The packet became 121 KB and 2,150 lines, with every contract after line 1,997.
Nothing measured the real shelf, so nothing objected. The next day a newborn read its first
240 lines, never reached fork-versus-spawn, and used an internal sub-agent where the owner
had asked for a visible Ronin fork. The packet is now 27 KB, and the test above is what
would have refused the swap.
