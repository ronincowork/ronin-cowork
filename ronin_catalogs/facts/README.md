# Facts

What is true about the user and the Agent's situation, printed in the brief from the work
record. One Markdown file per fact; the file name is its id. A fact has a `line:` (the line
the brief prints, with `{record.path}` placeholders; `{, x}` prints `, <x>` only when x is set),
or a body with placeholders, or both. A fact whose placeholders all come out empty is not
printed. The header is in [tools/README.md](../tools/README.md#the-header); a fact's `depth:`
is `full` when blank, and at `seed` only its line is printed.

The office's facts (about_user, machine, account, office-workspaces, integrations_authentications,
teams_agents, epics, defaults) are built by src/facts.ts into `~/ronin/library/facts/<fact>.md`;
their files here print `{office.<fact>.line}` and its path at seed, `{office.<fact>.text}` at full,
as the files read at the Agent's birth. The rest are the Agent's own lines, from its work record.

The user's own `~/ronin/facts/<id>.md` replaces the stock file of that id whole, or adds one.
