# The Build Brief funnel

This is the canonical end-to-end contract for what a new Cowork Agent is told. It covers
the launch facts entering composition, the material selected from Behaviors, capabilities,
and Session Boot, how much of each source is delivered, and the final Build Brief and birth
packet. The narrower [Agent composition](agent-composition.md) and
[Session Boot](session-boot.md) pages explain their respective source systems; this page
owns the join between them.

## The two outputs

Birth produces two related artifacts:

- The **Build Brief** states the resolved assignment, mandate, Team and project facts and
  contains one `Read first:` instruction.
- The **birth packet** is the per-session `README.md` named by that instruction. It is the
  one document the newborn reads before acting.

The brief does not paste every teaching source. The packet does not decide the Agent's
assignment. Resolution happens first; compilation then gives the resolved Agent the right
depth of teaching without duplicating whole catalogs.

```text
explicit assignment + inherited defaults + installed and measured facts
                                |
                                v
                         launch resolver
                                |
             +------------------+------------------+
             |                  |                  |
         Behaviors          capabilities       Session Boot
     floor / conditional   selected by facts   selected levels
     selected / sought     and available tools and declarations
             |                  |                  |
             +------------------+------------------+
                                |
                         ordered sources
                                |
                                v
                     birth README compiler
                  deduplicate + choose depth
                                |
                    enforce one-read budget
                                |
              +-----------------+-----------------+
              v                                   v
       session README                    Build Brief Read first
       + birth receipt                  + optional acknowledgement
```

Bare-metal and terminal sessions do not enter this funnel. A Cowork Agent does.

## 1. Resolve the Agent before selecting teaching

The launch resolver settles explicit launch choices, template provenance, Campaign and
Team defaults, enabled installations, connection state, provider state, Team membership
and lead designation, project root, and repository arrangement. Defaults fill blanks;
they do not remain live links after birth.

Those facts resolve the Agent's mandate, assignment, Behaviors and capability bundles.
The reading list is an output of that resolution, never an independent hand-maintained
list.

## 2. Select sources

### Behaviors

The directory is the delivery scope:

| Scope | Inclusion mechanism | Result |
|---|---|---|
| `floor/` | Every resolved file, automatically | Applied to every Cowork Agent. |
| `conditional/` | A file is applied when all of its authored `requires:` predicates match the resolved launch facts. | Applied only to matching Agents; for example Team-lead teaching follows the explicit lead designation. |
| `selected/` | Explicit Agent selection, or an inherited Team then Campaign default, after availability resolution. | The chosen files are applied; invalid or unavailable names do not silently become teaching. |
| `sought/` | Every resolved file contributes to a generated virtual index; no maintained list. | Awareness only. The source files are not applied. |

Stock and owner Behavior files resolve at the same semantic coordinate. An owner file
shadows the stock file whole; a new owner name extends the shelf.

### Tools and capabilities

The tools and their teaching are deliberately separate:

- `ronin_bin/` contains the public Agent-callable tool entry points. Owner tools live in
  the external tools store and can project onto the same Agent `PATH`.
- A composite tool is still one tool. Its public entry point remains in `ronin_bin/`; its
  internal orchestration belongs behind that entry point in `src/` or `libexec/`.
- `ronin_catalogs/capabilities/` contains no executables. Each Markdown file groups and
  teaches real tools through its `## Tools` table. A tool may appear in more than one
  capability without being copied or renamed.

Every resolved capability definition is considered. Its `requires:` predicates are
evaluated against settled launch facts such as arrangement, installation, selected
Behavior, connection, Campaign, Team, and lead designation.

For selected bundles, Ronin parses the `## Tools` table and checks which eligible tools
actually exist on this box. It then renders one virtual `CAPABILITIES.md` overview. There
is no separately maintained capability index and no concatenation of the full capability
files.

Context requirements select teaching; they do not grant command authority. Cowork tools
remain Cowork tools, while installation and connection requirements may also control
feature or integration tool delivery.

### Session Boot

Session Boot contributes only applicable resolved files:

| Source | Inclusion mechanism |
|---|---|
| `all/` | Every Cowork Agent. This stock shelf is intentionally limited to Ronin Utility and the rendered KOTOBA glossary. |
| `routine/...` | Exact files named by enabled or disabled installation/feature contribution declarations. |
| `<service>_connected/` and `house/` | Declared directory or file references selected by their feature or house facts. The legacy connected name does not assert runtime health. |
| Owner `root/<project_root>/` | Live contents for the resolved project root. Stock cannot define owner project roots. |
| Explicit launch seeds | Exact additional source paths supplied by the launch. |

Within a stock/owner Session Boot coordinate, the owner file shadows stock whole. Levels
are otherwise additive. Missing files and dangling links deliver nothing rather than
failing birth.

## 3. Choose the delivery depth

Participation does not mean that every full file is pasted into the packet. The compiler
uses these delivery depths:

| Material | Packet depth | Exactly what the newborn receives |
|---|---|---|
| Floor Behavior | **Full inline text** | The complete resolved file. |
| Matched conditional Behavior | **Full inline text** | The complete resolved file. |
| Selected Behavior | **Shelf card** | Title, first useful prose sentence (at most 180 characters), and resolved path. The Agent opens the full file when needed. |
| Sought Behavior | **Generated awareness entry** | Title, first useful prose sentence (at most 180 characters), and resolved path inside virtual `SOUGHT.md`. It is explicitly not an instruction to follow now. |
| Selected capability | **Generated tool projection** | Label, blurb, projected priority commands with shortened authority, unique help routes, and the full capability-document path inside virtual `CAPABILITIES.md`. The full document is not copied or added again as a shelf card. |
| Session Boot `all/`, routine, connected, and house teaching | **Full inline text** | The complete resolved file. The glossary is rendered with the active desk lexicon first. |
| Owner project-root document | **Shelf card** | Title, first useful prose sentence, and resolved path. |
| Explicit seed outside an inline teaching location | **Shelf card** | Title, first useful prose sentence, and resolved path. |

Empty sources are omitted. Headings in inline documents are demoted beneath the packet's
own heading. A shelf card is discoverability, not an instruction that the entire document
has already been read. A generated overview is disposable compiler output derived from
the resolved source files; contributors edit those sources, never the generated fragment.

## 4. Order and deduplicate

The resolved source order is:

1. applied floor Behaviors;
2. matched conditional Behaviors;
3. applied selected Behaviors;
4. declared routine, connection, or house teaching;
5. universal Session Boot material other than the glossary;
6. owner project-root material;
7. generated capability overview;
8. generated sought-awareness overview, when the shelf is non-empty;
9. rendered KOTOBA glossary;
10. explicit launch seeds.

The compiler converts non-inline sources into the single **On your shelf** table before
the inline sections. It resolves real paths and includes the same underlying source only
once, even when two coordinates or symlinks lead to it. A source that disappears between
resolution and compilation is omitted; stale content is never substituted.

The glossary remains the last inline background section because it is reference and the
least costly material to miss in a truncated first window. Explicit seeds may add cards
after resolution, but they do not turn ordinary project documents into inline authority.

## 5. Compile one bounded packet

`compileBirthReadmeAt` writes one `README.md` beside the session's work record and birth
receipt. Its last line is:

```text
— end of packet for <session> —
```

Every supported provider caps one file read. `PACKET_BUDGET` in `src/birth-readme.ts`
therefore holds the compiled packet to 30,000 bytes and 450 lines. Bytes are the hard cap;
the line limit protects the first-window reading habit. `tests/session-boot.test.ts`
compiles the fullest real stock birth and fails if the packet exceeds either bound or if
the working contracts drift out of the first window.

Do not raise the budget to fit new prose. Shorten the source, change appropriate reference
material from inline teaching to a card, or make optional material conditional. Delivery
depth is an architectural decision and must not be changed merely to silence the test.

## 6. Replace the source list with one read instruction

Before compilation, the Build Brief temporarily names the resolved sources. After the
packet is written and measured, that list is replaced by the `Read first:` sentence built
by `readFirstSentence`:

> Read first: `<path>` — 424 lines, 27 KB, one read; it ends with the line "— end of
> packet for `<session>` —". Do not act before you have seen that line.

An over-budget packet is still written, but the operator log warns and the sentence tells
the Agent to read it in ordered parts until the terminator. That is failure visibility,
not permission for the stock packet to remain oversized.

## 7. Record what left and confirm what arrived

`birth-receipt.json` records the packet path, bytes, lines, section count, terminator, and
`over_budget` state. When the launch profile requests acknowledgement, the Agent is asked
to quote the terminator. The receipt records what Ronin emitted; the acknowledgement is
evidence that the newborn reached the end before acting.

## Change checkpoint

Any change to Behaviors, capabilities, tools, Session Boot, launch resolution, or packet
compilation must answer all of these:

1. What launch fact selects the material?
2. Is it applied instruction, generated awareness, a tool projection, or searchable
   reference?
3. Is the delivery depth full inline text, generated excerpt, shelf card, or none?
4. Does the source describe a real tool, or merely group and teach one?
5. Does stock/owner shadowing still resolve at one semantic coordinate?
6. Is ordering and real-path deduplication preserved?
7. Does the fullest stock packet still fit one read with working rules in the first
   window?
8. Do the Build Brief, receipt, and acknowledgement still describe the same packet?

The historical reason for this boundary is concrete: in September 2026 a vocabulary
source was pointed at a 105 KB UI string table. The packet grew to 121 KB and more than
2,000 lines, pushing essential working rules beyond the newborn's first read. The real
shelf budget test and the delivery-depth distinctions above exist to prevent that class of
failure.
