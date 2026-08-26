# github — how we go about source control

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `github.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.

Most of what goes wrong here is not knowing what state you are in. The standard is small
commits, one declared publishing arrangement, and a copy somewhere that is never more than
a day behind. Establish the repository's arrangement before changing it; do not infer policy merely
from whichever branch happens to be checked out.

## The two arrangements

### Reviewed: working branch → PR → stable branch

Use this for Ronin product repositories and any project where the owner wants a review
gate. The repository declares both names: commonly `dev → master`, but `dev → main` is the
same arrangement. Agents integrate work continuously on the declared working branch, push
it there, and open one pull request to the declared stable branch. They never merge that PR
themselves. Temporary local branches or worktrees may isolate concurrent work, but they are
folded back into the shared working branch and are not published as a garden of remote
feature branches.

The stable branch is the reviewed/released line. The working branch is the one shared
development line. A pull request is the owner's gate between them. The gate, not whether
the stable branch happens to be spelled `main` or `master`, defines this arrangement.

### Direct: publish to the stable branch

Use this where agents are free to publish without a PR gate. The repository declares the
branch, commonly `main` or `master`; either name is valid. Agents commit directly to that
branch and push it. There is no separate shared development branch and no pull request for
ordinary work. A laboratory for riffing, sketching, adding and deleting ideas is the main
example, but the arrangement is defined by direct publishing, not by the repository's purpose.

In this mode, **history is the artifact**. Commit whenever a coherent thought lands, before
deleting or replacing an idea, and at the end of each useful turn of work. Do not squash the
trail into a polished story and do not rewrite published history: an idea removed today must
remain findable tomorrow with `git log`, `git show`, or a revert. Deletions are ordinary
commits, not loss.

Several agents may contribute to the declared branch, but each stages only its own files and
preserves unrelated dirty work in a shared checkout. Fetch before pushing; if the remote
branch moved, integrate without force-pushing or discarding another agent's commits. Direct
publishing removes review ceremony, not coordination or verification.

The owner chooses the mode when the repository is created or included and records it in the
repository's standing agent instructions or README. Changing modes is a deliberate repository
decision, never an agent's convenience. If neither the repository nor the owner makes it clear,
ask before the first commit.

## Making a new repository

Four decisions, then the mechanics. Take them in this order — two of them are one-way.

**1. Where it lives.** House work goes in the `ronincowork` organisation, one repo per
project, named for the project (`ronin-koe`, not `koe-app`).

**2. Visibility — one-way.** Base Ronin is the open-source half and is **public**; a
`ronin_service` is the rented half and is **private**. `ronin-cowork` is public,
`ronin-services` is private, and a repo that IS a Service (KOE, MICHI, KOSHI…) follows
`ronin-services`. When in doubt, **private**: private→public is a click, and
public→private does not un-publish — by then it is cloned, cached and indexed. Ask the
owner rather than guess when a repo is genuinely neither half.

**3. Secrets, BEFORE the first push — also one-way.** A push publishes the whole
HISTORY, not the current tree: a key committed in week one and deleted in week two is
still published. Three checks, because the first one alone only reads the working tree:

```sh
tejun-secrets .                                     # what .env holds, and whether it is ignored
git log --all --pretty=format: --name-only | sort -u | grep -E '(^|/)\.env|\.pem$|secret'
git grep -nIE '(sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
```

A `.env.example` holding NAMES with placeholder values is meant to be tracked; a `.env`
holding values is not, and belongs in `.gitignore` before the first commit. If a real key
is already in the history, the answer is **rotate the key**, not rewrite the history
(`ronin_sops/secrets.md`).

**4. Declare the arrangement, and write it down.** Choose reviewed or direct per the two
sections above, and record the choice — the branch names, and whether a working branch
exists at all — in the repo's `CLAUDE.md` or README **at creation**. An arrangement
nobody wrote down is one the next agent infers from whichever branch is checked out,
which the top of this file warns against. Name the default branch to match: under direct
publishing there is no `dev`, and none should be created later out of habit.

Then the mechanics. `gh` is the tool, and on a Ronin box it is **not always on `PATH`**
even though pushes work — git reaches it through a credential helper by absolute path, so
check `git config --list --show-origin | grep credential` and call it there rather than
concluding it is missing:

```sh
gh repo create ronincowork/<name> --private --description "…"   # no --add-readme: history exists
cd <local repo> && git remote add origin https://github.com/ronincowork/<name>.git
git push -u origin <stable branch>
```

Push an existing local history rather than initialising an empty repo and copying files
in — the history is the thing the repo was for. Afterwards confirm what actually landed:
`git ls-remote --heads origin` (the branches you meant, and no others) and
`git ls-tree -r origin/<branch> --name-only | grep -E '(^|/)\.env'` (nothing but the
example).

## The approach

1. **One repo per project, made at the start** — before there is anything to lose. A
   repo added later begins with no history, which is the thing it was for.
2. **Commit when something works**, not when the day ends. The message says what changed
   and why; the diff already says how.
3. **Push every day.** A commit on one machine is not a backup.
4. **Work on the arrangement's declared line** — the working branch under review, or the
   stable branch under direct publishing. A temporary isolation branch has one named purpose
   and disappears when integrated.
5. **A pull request is how you show someone** — the diff with a place to talk about it.
   It is the reviewed arrangement's gate, not ceremony imposed where direct publishing was chosen.
6. **Nothing secret goes in.** Keys, tokens, credentials. A secret committed is a secret
   published, and deleting the file later does not take it out of the history — so this
   is a question to ask before the first push, not after (`secrets.md`, and
   `tejun-secrets` answers it in one run).

## When it goes sideways

`git status` before anything else; it names the state and usually the way out. Never
force-push a branch someone else has. If work is uncommitted and the next step is
drastic, commit it first even badly — a bad commit is recoverable, a lost change is not.

## Ronin product work

Ronin's product repositories use the reviewed arrangement; `ronin_methodology.md` adds their
release and landing rules. A Ronin repository may deliberately use direct publishing: being
under the Ronin name does not silently impose a PR gate.
