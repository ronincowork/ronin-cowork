# Templates — agent loadouts and team casts

A template is a preset that fills part of a launch form and stops. Its answers become
yours, everything it wrote stays editable, and only provenance remains — a template is
never a live link. There are two kinds, on two shelves, and the difference is the
owner's own distinction:

> "If you have a template for one single agent activity, that would be an agent
> template. If you have a kind of team-oriented requirement with multiple agents
> coordinating to deliver on a task, that would be a team template."

The short rule (the owner's, 2026-09-01): **agents are people, teams are projects.**

**An agent template is a person you'd assign** — one session's loadout: the reading,
tools, mandate and starting brief. A system administrator you spin up when Ronin is
acting crazy; a health checker for your own application; a front-end developer; a
personal assistant with the brain connected. If the box's name is a job title, it
belongs here.

**A team template is a project — a cast that delivers a task.** Several agents with
assignments and mandates, coordinating on one job, the lead just one of them, marked.
A Dinner Party is a host's right hand, menu-and-shopping, table-and-room and the
entertainment; Staff My Codebase is a code coordinator and an assessor who staffs the
specialists; Health Checks is a check lead and a checker on a rhythm. If the box's
name is a task — do health checks, redo the study, bake for the fair — it belongs
here.

## Where they live

```text
ronin_catalogs/templates/agents/<token>.md   ← loadouts, offered by the New Agent form
ronin_catalogs/templates/teams/<token>.md    ← casts, offered by the New Team form
```

Neither form is shown a template written for the other. The doors are
`GET /api/templates/agents` and `GET /api/templates/teams`; `?kind=` narrows each tray
to the boxes whose `kinds` include it, and `open` screens nothing. Field-by-field,
both shapes are documented in [`ronin_catalogs/templates/README.md`](../ronin_catalogs/templates/README.md).

Picking a box overlays exactly the fields it carries onto the form — inherited defaults
land first, the template clobbers only what it states, your hand is last — and pressing
Start makes those values the record's own. A cast's agent rows land on the New Team
form as editable lines: delete the activity tracker, add a fourth course, rename the
lead. A Dinner Party for eleven is the form, not another template.

## Your agent keeps your templates

This is the part worth knowing: **templates are plain files, and your agent reads and
writes them for you.** You never need a form to grow the library — you say what you
want kept, in conversation, and the session does the filing.

Worked example — the house has a standing dinner-party menu book:

1. *"Keep this menu book with the Dinner Party template."*
2. The agent saves the document as an SOP in **your** store
   (`<sops store>/dinner_party_menus.md` — `bin/ronin-store sops` names the place).
3. It copies the shipped `templates/teams/dinner_party.md` into **your** catalogs store
   (`<catalogs store>/templates/teams/dinner_party.md`) — a same-named file replaces
   the shipped one whole — and adds the book to the copy:
   `- **behaviours:** sops:dinner_party_menus`.
4. Every team raised from Dinner Party now reads your menu book at birth. An upgrade
   never touches either file, because both live in your stores, not the install.

The same pattern carries a style guide onto Ship an App, a deploy runbook onto Raid My
Codebase, or race notes onto Health & Fitness. Coding teams are where this earns the
most — real projects have real documents — but any cast or loadout can carry a book.

Two rules the agent follows when it files for you:

- **A shipped box is shadowed whole, never edited in place.** Your copy replaces ours
  file-for-file; delete your copy and the shipped box is back.
- **A new name adds a box; `- **hidden:** yes` in a same-named file withdraws one.**
- **What came from the library can go again.** A box installed from the library, or one
  you saved, is removed from its detail on the Campaign page's Templates surface
  (`DELETE /api/templates/<shelf>/<name>`) — your file only; removing your copy of a
  shipped name brings the shipped box back.

## Saving from the forms

Both forms offer *Save as template* over what you have filled in. A save is always a
NEW file in your store, on the saving form's shelf — an existing name on that shelf is
refused, never silently shadowed. Shipped boxes are edited on the campaign page (or by
your agent, as above), not from a launch form.

## The shipped handful, and the library

A handful ships — one or two a kind, so every launch form has something on the tray — and
**the Ronin library on ronincowork.com is where the rest live** (owner, 2026-09-03). Four
projects: **Staff My Codebase** 🎬 for code, **Morning Brief** ☕ for work, **Health &
Fitness** 🏃 for yourself, **Dinner Party** 🕯 for the house; and five people: the Personal
Assistant 📇 (gbrain on, born into its own team), the System Administrator 🔧, the Office
Manager ⚙, the Housekeeper 🔑 and the Training Coach 🏋. The first project to try is Staff
My Codebase: a code coordinator born as the marked lead, and an assessor that surveys your
codebase, staffs one specialist per service into the team, and hands you a crew — its
procedure is `ronin_sops/codebase_team.md`. Everything else — Ship an App, Raid My
Codebase, Health Checks, Ship the Tour, Bake for the Fair, Redo the Study, Put the Garden
Right, the Bookkeeper, the Designer and the rest — is a bundle on the library: see it there,
download it inside Ronin (Campaign → Templates → Check the library), and it lands on your
shelf like anything you wrote. The listing is the directory (`ls ronin_catalogs/templates/teams
"$(bin/ronin-store catalogs)/templates/teams"`), never a page like this one.

## Bundles and the template library

A template names its books and its Routines; it carries no copy of them, and on the
shelf that is right. It is wrong for a download: a Dinner Party template is worthless on
another install without the menu book it reads. So the one place copies are allowed is
**in transit** — a **template bundle**, one JSON document (`ronin-bundle/1`) holding a team
template, the agent templates beside it, the SOPs and ways they name, the Routines they
turn on, and those Routines' macros, actions and tools. On install every copy lands in
**your own stores** — catalogs, sops, ways, library, and a `tools` store for executables —
where the ordinary readers find it exactly as they find anything you wrote by hand. Nothing
a bundle installs touches the install itself; an upgrade never sees it.

```text
{ format: "ronin-bundle/1", name, label, art, blurb, kinds, version,
  files:   [{ store: catalogs|sops|ways|library|tools, path, text }],   whole files
  entries: [{ catalog: MACROS.md|ACTIONS.md|TOOLS.md, name, text }] }   entry-merged
```

**The template library** is the shelf of bundles on ronincowork.com
(https://ronincowork.com/library/index.json, `ronin-library/1`), and the Campaign page's **Templates** card is the way in: *Check the
library* reads the index — only when pressed, never on a timer — and pressing a bundle
shows the **plan** before anything is written: each item, the shelf it lands on, and its
outcome. Three rules an install obeys, all of them the house's already:

- a copy identical to what ships is **skipped** — a shadow that changes nothing is an
  upgrade-proof copy nobody asked for;
- a file of yours is written over only by the second button, *Install, replacing my N*;
- a tool never replaces one of Ronin's — a bundle may add a command, never take one.

Every read of the library goes through the one allowlisted client (`src/activation/transport.ts`)
and lands in the egress record like any other call. The index carries a `sha256` per bundle
and the install refuses a document that does not match it.

**Yours, outward.** A team card's *Download as a bundle* (or `bin/ronin-bundle pack <team>`)
builds the same document from this install — your copies only, since what ships is on every
install — for a library of your own or for the public one. The code is `src/bundles.ts`;
the door is `src/routes/library-api.ts`; the surface is `public/js/campaign-templates.js`.
