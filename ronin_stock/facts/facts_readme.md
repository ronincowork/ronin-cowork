# Facts

What is true, printed in an Agent's brief. One fact-print per fact: a Markdown file saying how
the brief prints it, named by the fact's id. The whole model is in
[docs/architecture/brief.md](../../docs/architecture/brief.md#facts).

**The office-facts** are one suite, the same for every Agent: `about_user`, `machine`,
`account` (hosted), `office-workspaces`, `integrations_authentications`, `epics`,
`teams_agents` and `defaults`. Each has one builder in `src/facts.ts` that reads its sources of
truth and writes `~/ronin/office/facts/<fact>.md` whenever one of them changes; an Agent reads
the office as it is now by reading that file. The fact-prints here only say how the brief tells them:
their `line:` is `{office.<fact>.line} · {office.<fact>.path}` (at seed, the stock depth) and
their body `{office.<fact>.text}` (at full), both as the fact read at the Agent's birth.

**The Agent's own facts** (`you`, `workspace`, `work`, `team`, `integrations-on`, `model`,
`task`) print values from its configuration, the `brief` key on its work record, in full.

A fact has a `line:` (the line the brief prints, with `{record.path}` placeholders; `{, x}`
prints `, <x>` only when x is set), or a body with placeholders, or both. A fact whose
placeholders all come out empty is not printed. The header is in
[tools_readme.md](../tools/tools_readme.md#the-header); a fact's `depth:` is `full` when blank, and at
`seed` only its line is printed. Layers raise or block a fact as for any file.

Anything that summarises office state is one of the nine builders, or reads them: no second
summary, and no screen stores its own answers.

A fact-print is a foundation: the person's custom-foundation, `~/ronin/custom/facts/<id>.md`,
replaces the stock one of that id whole, or adds one
([stock_readme.md](../stock_readme.md#three-places-each-with-one-meaning)).
