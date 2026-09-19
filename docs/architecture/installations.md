# Installations and behaviours — what a new Agent is equipped with

Ronin settles what is installed on the machine before it asks how one Agent should
behave. Machine facts stay off Team and Agent forms; behaviours are the one kind of
addition chosen there.

## Three session types

| Session type | What starts | What Ronin adds |
|---|---|---|
| Terminal | A shell, no Agent CLI. | Nothing. |
| Bare-metal Agent | The provider CLI directly in the tmux session. | Nothing: no reading, work record, desk, or receipt. |
| Cowork Agent | The provider CLI through the unified birth transaction. | Everything Ronin is on this box: identity, work record, base reading, commands, the birth receipt, and every enabled system installation. |

A Cowork Agent is one thing. There is no floor or base switch; bare metal is the way to
have none of Ronin.

## System settings: installations and defaults

| Card | Holds | Reaches |
|---|---|---|
| **Installations** | each installed component, on or off | the whole machine; never a Team or Agent question |
| **Defaults** | the behaviours a new Team starts from | the next New Team form and a teamless Agent form; existing Teams are untouched |

An installation definition (`ronin_catalogs/installations/<name>.md`) has one of two
effects. A `system` installation contributes its reading, tools, and server parts to every
Cowork Agent when on, and its `reading_off` page when off. A
`provider` installation makes its named behaviours available to choose. The
effect name is implementation vocabulary; the owner still sees an Installation.

An installation may require another. Unmet requirements grey it out and name the
requirement. Turning one off changes the next birth; server parts follow at Ronin
restart, and a running Agent never changes.

## The cascade: behaviours

Campaign defaults → Team → Agent carries one kind of choice: a **behaviour**. A behaviour
can say how ordinary work should be done or add a facility and its taught practice. Its
definition in `ronin_catalogs/behaviours/<name>.md` may name an installation and carry
reading, Behaviors, and tools. Capability documents conditionally select
knowledge, emphasis, and tool-job teaching for the Build Brief.

An installation-gated behaviour appears on forms only while its installation and every
requirement are on. A launch request naming an unavailable behaviour is born without it;
the birth receipt names it as undelivered and birth still succeeds. Providerless
behaviours are always on offer.

Every Cowork Agent receives mandate teaching from the Ronin floor. The selected stock shelf includes `buildout`, `recruit`,
`write_it_down`, `more_checkpoints`, `report_before_fixing`, `visual_staging`,
`gbrain`, `trello`, and `perplexity`. A Team's required behaviours cannot
be removed on an Agent form. Every form uses the same tall, wrapping behaviour stone;
its separate read glyph opens the definition page without changing the choice.

There is no inherit control and no reach-down. A Campaign default fills the next form;
a Team saves complete selected and required lists; an Agent launch may supply its own
complete list. A template clobbers only the fields it carries.

## Capability bundles: the tools an Agent is taught

A capability document is a teaching layer, not an authority layer. Selection changes what
the Build Brief teaches and emphasizes for that Agent; it does not grant, withhold,
authorize, or forbid an installed tool or its help.

The commands an Agent is taught are grouped into **capability bundles**, one authored
Markdown document each in `ronin_catalogs/capabilities/` (the owner's catalogs store
shadows a name whole and adds new ones). A bundle is a document grouping, not an
executable: it answers one question, lists the actual tools that answer it in a `## Tools`
table — each with its job, whether it is emphasized at birth, and its help route — and
carries the teaching around them. A capability lists one or more actual tools; a tool may
be surfaced by more than one bundle.

Each document's `requires:` line names the launch facts that select its teaching: a system
installation being on, a behaviour being selected, a managed worktree in the resolved
assignment, a Campaign, a Team, or the lead designation. The five
Cowork bundles ship with Ronin; Ronin Host, Ronin Services, gbrain, Trello, Perplexity and
future add-ons are one more file each, gated the same way. Nothing in the resolver knows a
bundle by name.

At birth the resolver selects the documents whose requirements hold and the packet compiler
renders one **YOUR TOOLS** overview from exactly those documents. Selection by role or work
context (`lead`, `team`, `campaign`, or `arrangement`) changes knowledge only: every shipped
Cowork tool is on every Cowork Agent's PATH. Feature and integration tools are placed only
when their installation, behaviour, or connection requirements hold; Ronin Host remains
conditional. A tool the box lacks is recorded in the receipt and never taught. The format is
`ronin_catalogs/capabilities/README.md`.

## Conditional instructions

Some reading follows a fact set elsewhere and is never a picker: Team lead status, Team
membership, and whether the Workspace Folder's `RONIN_REPO` declares a worktree root or
a checkout. The birth packet points at the relevant Team and repository pages.

## Resolution

One resolver runs before the Agent process exists:

1. Installations contribute system material and decide which behaviours are available.
2. Campaign defaults answer for a teamless Agent.
3. A Team's complete selected and required behaviour lists answer for its Agents.
4. An Agent's launch list, when present, answers for that Agent.
5. Root arrangement, lead status, and Team membership add conditional reading.
6. The capability documents whose `requires:` hold are selected for teaching. All existing
   Cowork tools and the tools of enabled feature/integration documents are projected; the
   receipt records every document with `selected`, `reason`, `tools` and `missing`.
7. One packet and receipt record the result, with `stated_by` naming
   `installation · campaign · team · agent · conditional`.

The same result feeds the birth README, command directory, and receipt. Provider-native
MCP configuration is outside Agent launch resolution.

## Catalog definitions

Definitions live in `ronin_catalogs/installations/` and `ronin_catalogs/behaviours/`, one
Markdown file per name; each directory's README carries the format. The owner's stores
shadow a stock definition whole. Campaign and Team records hold only switches and names.

A definition records enablement; it is not a security boundary. An off feature is not
taught, offered, or placed in normal command lookup. Role and work-context facts change
teaching only and do not change an installed Cowork tool or its help.
