# github — how we go about source control

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `github.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.

Most of what goes wrong here is not knowing what state you are in. The standard is small
commits, one branch you work on, and a copy somewhere that is never more than a day
behind.

## The approach

1. **One repo per project, made at the start** — before there is anything to lose. A
   repo added later begins with no history, which is the thing it was for.
2. **Commit when something works**, not when the day ends. The message says what changed
   and why; the diff already says how.
3. **Push every day.** A commit on one machine is not a backup.
4. **`main` is what works.** Trying something that might not? Branch — and delete the
   branch when it lands or when you abandon it. A branch nobody can name the purpose of
   is dead weight.
5. **A pull request is how you show someone** — the diff with a place to talk about it.
   Not ceremony, and not required when nobody is reviewing.
6. **Nothing secret goes in.** Keys, tokens, credentials. A secret committed is a secret
   published, and deleting the file later does not take it out of the history — so this
   is a question to ask before the first push, not after.

## When it goes sideways

`git status` before anything else; it names the state and usually the way out. Never
force-push a branch someone else has. If work is uncommitted and the next step is
drastic, commit it first even badly — a bad commit is recoverable, a lost change is not.

## Ronin's own repos are not this

They run a release branch and a review gate of their own, written down in those repos.
This SOP is for the_owner's projects.
