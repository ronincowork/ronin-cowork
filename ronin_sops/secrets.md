# secrets — keys, tokens, and the one mistake that cannot be undone

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `secrets.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.
> **Tool: `tejun-secrets [path]`** — which env files exist, the key NAMES in each, whether
> git tracks them, whether `.gitignore` covers them, and which provider credential a
> launched agent would actually use. Run it before the conversation, not after. It never
> prints a value; exit 4 means something is already public.

A secret is **configuration, not code**. It differs per machine, it changes without the
program changing, and it is the one kind of mistake that a later commit cannot take back.

## The approach

1. **The ignore rule comes before the file.** `.env` in `.gitignore` on day one, while
   the repo is empty and nobody is in a hurry. Adding it after the file exists is a race
   you sometimes lose.
2. **Keep a tracked template.** `.env.example` carries the key *names* and no values — it
   is how the next person and the deploy both learn what to set. A template holding a
   real value is the quiet version of this whole problem.
3. **One key per purpose, and per place.** The same key across local, staging and
   production means rotating it breaks all three at once, which is why nobody rotates it.
4. **Ask who else needs it.** That decides where it lives: a key one person uses belongs
   in their environment; a key three people need belongs in whatever the house already
   uses to share them, and *never* in a message that stays scrolled back.

## Which account pays for the agent

The one credential decision every install makes, and the one that costs money when it is
made by accident. (Who the install belongs to is `accounts.md`; this is what pays.)

- **A subscription** (Claude Pro/Max and the like) — you log the CLI in once on this box
  and sessions use it. Flat monthly cost, nothing to rotate, nothing in any file.
- **An API key** — billed per token, set in the environment. Right when you need
  programmatic access, separate billing, or per-project separation.

**The order they resolve in is fixed, and it is where people get hurt:**
`ANTHROPIC_API_KEY` → `ANTHROPIC_AUTH_TOKEN` → an OAuth profile → the default profile on
disk. **A set `ANTHROPIC_API_KEY` silently outranks a subscription login — and an empty
one still wins its slot.** So a stale export in a shell profile can quietly move every
session onto per-token billing, and the only symptom is the invoice. Pick one, and check
which one is actually winning (`tejun-secrets`) rather than assuming.

Two follow-ons worth knowing: if you log in *both* ways the CLI may warn about the
conflict — resolve it, don't dismiss it. And what a Ronin pane inherits is the **service's**
environment, not the shell you are typing in; when those disagree, the pane is the one
that counts.

## When one leaks

**Rotate it. Assume it was scraped within the minute.**

Public repos are scanned continuously by people who are not curious. So the order is:
issue a new key, deploy the new key, revoke the old one — and only then, if you like,
tidy the history. Rewriting history is not the fix and never was: the value was published
the moment it was pushed, and a force-push does not un-send it. An afternoon spent on
`filter-repo` while the old key is still live is an afternoon of the wrong work.

## What not to do

Do not paste a key into a session to "check it" — panes are taped, and the tape outlives
the pane. Do not put one in a commit message, a doc, an issue, or a wipeboard. Do not
send one to an agent that did not need it. If a key must be seen, it is read from the
environment by the thing that needs it, and nobody looks at it.
