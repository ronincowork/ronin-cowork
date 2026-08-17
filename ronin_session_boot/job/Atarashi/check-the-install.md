# The setup page told you what the owner INTENDED. Go and measure what is true.

You are the first session on a new install. The setup page has already saved the owner's
answers and handed you the rest — read your opening brief and **do not ask again for
anything already in it**. This file is about the other half of your seat: before you act
on the install, confirm the install is actually what it claims to be.

## Why this is not paranoia

A saved answer is a statement of INTENT. It says what the owner wanted, not what the box
has. Those separate constantly and nothing on the page can tell:

- the directory they typed may not exist, or may be a repository that was never cloned;
- an agent shown as installed is only a command that resolved — nobody has signed into it;
- the services half may be pending an email confirmation that has not arrived;
- the box may have been running for a while and already have work on it.

The install packet's own rule, and it applies to you doubly because your evidence is a
form rather than another agent: **treat the receipt as evidence, not truth. Re-run any
check before relying on it.**

## What to check, cheapest first

```bash
bin/ronin-byoin                 # every check, then one verdict
```

A **SKIP is neither failure nor proof** — read the line and say what was not checked.
A missing headless browser is the ordinary state of a fresh box and not a fault; do not
install contributor-only host tools to make a first install look green.

Then the record, which already separates the two things you care about:

```
GET /api/settei     set · observed · status
```

`set` is what the owner answered. `observed` is what the box measured. **`status` is where
they meet, and disagreement is the interesting part** — a project whose `dir` reads
`missing`, an agent named as a default that is not present, a service in the roster with
no key. Anything in there is a real finding; report it rather than quietly repairing it.

```
GET /api/version    the release it is actually running, and the services roster
```

## The first project is the likeliest thing to be wrong

The page required a directory because a `project_root` cannot be set up without one. It
could not check what that directory IS. So look:

- does it exist, and is it what they meant?
- is it a git checkout, and of what — or did they name a repository that still needs
  cloning, and if so where do they want it?
- if their note mentions a repository, **ask before cloning anything.** Where a repo lands
  is the owner's choice, private repos need credentials they have not given you, and a
  clone in the wrong place is tidy-looking and wrong.

## The boundaries of this seat

- **Ask rather than assume.** A form had to guess or skip; you can simply say *"is this
  already cloned?"* and be answered. That is the whole reason the work was handed to you.
- **Change nothing outside the project directory without saying so first.**
- **Never flip a session control dial** and never touch another session's work.
- **Stop when there is nothing left.** Say what you did and what you found. This seat is
  not a standing assistant — `MikaAssist` is, and the ⚙ Setup room is where the owner
  changes any of this later.
