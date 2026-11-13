# Tools

A Cowork Agent is born knowing how to work inside Ronin. It gets two kinds of help at
birth: **tools** it can run, and **behaviours** that guide how it works.

## Tools

Tools do jobs and report what happened. Every Cowork Agent has:

- **edges**: message another Agent, post to the Team's wipeboard, read another Agent's record. See [Team Lead and edges](team-lead-and-edges.md).
- **work-record** and **item**: keep its own record and the work items it holds. See [work records](what-agents-write-down.md) and [work items](work-items.md).
- **session tools**: check on an Agent, archive one, or end one; a Team lead can also start one.
- **team**: read the Team's record.
- **worktree-desk**: a private folder and branch for code, and a hand-in when the work is ready for review. See [managed worktrees](desks.md).
- **machine-settings** and **ronin-host**: read this machine's settings and health.
- **mika**: ask Mika, the house assistant.
- **secret**: get a password or key from you without it passing through chat. See [Handing an Agent a secret](#handing-an-agent-a-secret).
- **ronin-help**: the pages you are reading now, and the meaning of a Ronin word: `ronin-help` lists the topics, `ronin-help <topic>` prints one, `ronin-help <brief>` prints a brief by its file name, `ronin-help <word>` looks a word up.

The provider's own tools (reading files, running commands, searching) are there too;
Ronin adds to them and takes nothing away.

## Handing an Agent a secret

When an Agent needs a password or key (a KVM login, an API token), it never needs to see it
in chat, and you never paste it into a message.

- **The Agent asks:** `secret ask <name> --for "<what it is>"`. A paste field opens at the foot
  of its tile, where the message box sits, in Chat and in Terminal: the conversation or terminal
  above stays readable and scrollable, so the Agent's instructions stay in view while you paste.
  Click into it, paste, and press **Save**, or **Cancel** (Escape in the field cancels too).
  Beside the value is **Expires**, one choice of four: **Nothing** (the default: not known),
  **A date** (a date picker), **Never** (it does not expire, recorded as such), or **In N days**
  (a number of days from today, with 30, 90 and 180 as quick picks; it is saved as the date it
  lands on). Choosing Nothing again clears whatever was picked.
  Save says *Saving…*, then *Saved* shows for a moment before the field closes; if the save is
  refused, it stays open and says why. The Agent hears
  only `saved: <name>` or `cancelled: <name>`.
- **The Agent uses it by its file:** `secret path <name>` prints where it is, to pass as
  `--password-file` or read in its own script. `secret ls` lists the names, with
  `expires <date>` or `never expires` beside each that has one, and nothing beside the rest.
- **An expiry for one already saved:** `secret expires <name> <YYYY-MM-DD|<N>d|never|clear>`
  sets it without re-pasting (`90d` is 90 days from today); `clear` makes it not known again.
  Only the expiry changes.

Each secret is one file in `~/ronin/services_secrets`, readable only by you. Expiry dates are kept
beside them in `secrets-expiry.json`, never inside a value file. Ronin never
prints a value, and no reply, log or chat carries one. A name is lowercase letters, digits,
`_` and `-`.

## Behaviours

Behaviours are short written guidance: how to plan, how to work in a Team, when to write
things down. Some reach every Cowork Agent; others you choose when you start an Agent or
a Team, under **Features and Behaviours**. They guide; they do not lock anything.

## Mandate

Each Agent also gets a **mandate**: how far it goes before it checks in (Reach), whether
it may bring in more Agents (Recruit), and what it hands back (Output). You set it on the
New Agent form.

## Read more

- [Customize Ronin](../getting-started/customize.md): change the guidance new Agents get
- [Tools and capabilities](../architecture/tool-surface.md): how it is built
