# Capabilities

One Markdown definition per **Agent capability**: a coherent group of actual executable
tools the Agent is taught at birth. The document states the question those tools answer,
their authority, and the teaching around them. It is not itself executable. A capability
may contain several tools or one tool, and a tool may be taught by more than one capability
without being renamed. A document with no actual tool is not a capability: put installation
facts in `../installations/`, working guidance in `../behaviours/`, and system explanation
in `../../docs/`.

A capability document is a teaching layer, not an authority layer. Selection changes what
the Build Brief teaches and emphasizes for that Agent; it does not grant, withhold,
authorize, or forbid an installed tool or its help.

Capabilities may teach primitive and composite tools alike. The canonical boundaries are
in [`docs/architecture/tool-surface.md`](../../docs/architecture/tool-surface.md).

The folder is the catalog. Ronin reads every definition here and in the owner's
`<catalogs store>/capabilities/` (a file of the same name shadows the shipped one whole; a
new name is added). Every definition groups actual Agent tools and carries its own
`requires:` facts; an installation or integration without Agent tools remains on its own
shelf. Nothing in the resolver knows a capability by name.

## The definition

`- **key:** value` lines under the title, an optional `## Tools` table containing only live
executables, then the full teaching as ordinary Markdown. The first prose paragraph after
the keys is the card text a newborn sees on its shelf: say when to reach for this bundle.

## Shipped file index

These exact files are the source catalog for the virtual `YOUR TOOLS` view:

| Group | File | Scope |
|---|---|---|
| Core | `edges.md` | live cross-session and Team communication/read tool |
| Core | `work-record.md` | live personal record, document, and held-project tool |
| Core | `agent_session.md` | live Agent/session inspection and lifecycle tools |
| Core | `worktree-desk.md` | live desk tool and managed-worktree teaching available to every Cowork Agent |
| Core | `machine-settings.md` | typed Campaign, installation, provider, and machine settings |
| Core | `cowork_team.md` | live Cowork Team roster, project, custody, and member-status tools; designated-lead teaching is conditionally embedded |
| Conditional | `ronin-host.md` | advanced host inspection and guarded restart tool |
| Conditional | `mika.md` | installed house-assistant launcher |

Ronin reads these files, applies each file's predicates to teaching, checks each listed
executable, and generates the virtual `YOUR TOOLS` overview from the selected definitions.
The virtual view is not a parallel catalog and is never maintained by hand.

| Key | Holds |
|---|---|
| `label` | the title shown in the birth overview and on the shelf |
| `blurb` | one sentence: the question this bundle answers |
| `class` | `cowork` (part of every Cowork Agent's vocabulary) · `feature` (an installed part of Ronin) · `integration` (a connected outside service) |
| `requires` | predicates, comma-separated, that must all hold for the document to be taught (below); blank or `—` selects it for every Cowork Agent |
| `order` | sort position in the overview |
| `hidden` | `yes` withdraws a definition without deleting the file |

## The `## Tools` table

One row per actual tool, columns found by name in any order:

| Column | Holds |
|---|---|
| `Tool` | the live executable as typed — `session_check`, or executable plus operation such as `machine-settings read`; the first word is a delivery candidate |
| `Authority` | the tool's one job, in a word or two: read · write · create · end · read/write; never a caller category |
| `Teach` | `priority` marks a tool taught in the birth overview; blank leaves it to `--help` |
| `Help` | the discovery route when it is not `<tool> --help` |

A nonexistent command does not establish a capability and must not be listed here. A row
whose executable is absent from this particular box — not in the owner's tools store or
`ronin_bin/` — is delivered or taught nowhere; the birth receipt names it under `missing`
when its class is eligible for delivery.

## `requires:` — the launch facts a bundle may read

| Predicate | Holds when |
|---|---|
| `installation:<name>` | that system installation is on for this birth |
| `behaviour:<name>` | that behaviour is selected and available for this birth |
| `arrangement:managed` | the resolved assignment holds a managed desk, or any work location is a managed worktree — the birth root alone does not decide |
| `arrangement:checkout` | the Agent works in checkouts only |
| `connected` | MCP is on |
| `campaign` | born into a Campaign, so Machine and Campaign settings are a surface this Agent has |
| `team` | born onto a Team |
| `lead` | born as that Team's designated lead |

An unknown predicate never holds, so a misspelt requirement omits that teaching rather
than adding it to the Build Brief. Every fact is settled by the launch resolver before the Agent
process exists; none is a picker on a form.

## Teaching and availability

At birth the resolver selects definitions for teaching. Predicates about role or work
context — `lead`, `team`, `campaign`, and `arrangement` — never withhold an installed
Cowork tool: every shipped tool in a `cowork` definition is callable by every Cowork Agent.
The `installation`, `behaviour`, and `connected` predicates on `feature` and `integration`
definitions still govern tool placement because they represent whether that feature is
enabled or connected; Ronin Host therefore remains conditional. Role or work-context
predicates on the same document still affect teaching only.

The compiler renders one virtual overview from selected definitions — title, blurb,
priority tools with their jobs, help routes, and the full-document path — and puts the
full document on the shelf as a card. The birth receipt records every definition with
`selected`, `reason`, `tools` and `missing`. `docs/architecture/session-boot.md` and
`docs/architecture/birth-packet.md` own the packet; `docs/architecture/installations.md` owns the cascade.
