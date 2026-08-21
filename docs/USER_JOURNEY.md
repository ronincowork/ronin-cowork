# USER JOURNEY — finding Ronin to starting work

This is the canonical new-owner journey. It owns the order of the experience, what each
surface must communicate, the handoff between surfaces, and the remaining gaps. Detailed
implementation belongs with the code it describes.

The journey is complete when a stranger can cross all five surfaces on a machine that is
not ours, without help, and begin useful work.

## The positioning spine

**The problem.** You already have agents. Once several are running, you become the thing
holding their terminals, status, and handoffs together.

**The answer.** Ronin adds a co-working space for those agents on a machine you control.

**The trust.** Same agents, same files, same machine. Ronin is the thin layer around the
work, not a new agent, model, or hosted box.

**The payoff.** See who needs you, enter the right tile, and let agents hand work to each
other instead of routing everything through you.

## The five surfaces

```text
1 landing_page
      ↓
2 load_ronin
      ↓
3 install_ronin
      ↓
4 cowork_setup
      ↓
5 cowork — immediate post-Save state
```

The browser concepts are maintained in the separate Ronin Lab design repository and do
not ship in this artifact. Surface 3 is deliberately a terminal handoff rather than
another web page.

### 1 · `landing_page`

**Job:** help a stranger recognize the multi-agent coordination problem and decide whether
Ronin is for them.

**Must communicate:**

- Ronin is a co-working space around agents the person already uses.
- It runs on a machine the person controls.
- It does not replace their agents, models, files, or machine.
- The one forward action is **Load Ronin**.

**Handoff belief:** “This is for the problem I have when one agent becomes several.”

**Current state:** redesigned and browser-walked as a concept. The real public landing still
needs to be replaced from the approved concept and released through `ronin-site` on Azure.

### 2 · `load_ronin`

**Job:** turn interest into one safe, comprehensible installation action on the correct
machine.

It presents two equal doors:

1. Copy the install command into a terminal on the target machine.
2. Hand the installation guide to an agent already running on the target machine.

It must say that a remote Cowork remains private and can be opened from any device connected
to the same VPN. No public port is required.

**Handoff belief:** “I know where Ronin will live, what this will do, and that success ends
with an address.”

**Current state:** redesigned and browser-walked as a concept. The one canonical command is:

```sh
curl -fsSL https://raw.githubusercontent.com/ronincowork/ronin-cowork/master/scripts/get-ronin | sh
```

### 3 · `install_ronin`

**Job:** choose the correct release, verify it, install one copy with its dependencies,
start Ronin, prove it answers, and print the private address for `cowork_setup`.

The installer asks no product-positioning or setup questions. Its output should explain
progress and failures in plain language, without requiring the person to understand service
managers, bind addresses, or ports.

**Handoff belief:** “Ronin is running on my machine. This address is the door back.”

**Current state:** the bundled v1.1.0 install path and platform artifacts shipped and were
walked on this machine. The required remaining proof is the complete real command on a clean
machine that is not ours.

### 4 · `cowork_setup`

**Job:** show that RoninCoWork is running on this machine, ask only for answers it can use,
save them once, and open RoninCoWork. No agent is required.

This surface is always called **`cowork_setup`**. Never shorten it to “setup,” “the setup
page,” or “first run”: those names lose the fact that this is the threshold into the
coworkspace, not machine installation or generic configuration.

The approved interaction shows the complete question set on one page: machine, owner, first
project, agents, new-session defaults, and optional Services. The owner can read ahead,
answer in any order, and preview the resulting Cowork state without saving. It is not a
wizard and does not hide later questions behind Continue buttons.

Measured machine facts sit beside the form. Optional choices remain optional, and every
answer remains editable inside Cowork.

If Ronin Services is offered, its disclosure is part of this surface: selecting Services
sends the email address, terms version, and activation request into the Shiwake activation
flow, which sends the verification email and begins that process. Merely storing the email
locally is not activation. Declining Services sends none of those and does not diminish base
Cowork.

The Agents section reports facts before it offers actions. An installed agent is already
there: its fixed tick is a measured fact and there is nothing to do. An absent agent with a
known install path is a choice. Selecting it records the owner’s intent in `wanted`, which
causes the unmet requirement to appear in `needed`, then dispatches the mechanical install.
An absent agent Ronin cannot install has no working control and says why.

**Handoff belief:** “This is my Cowork, on my machine, shaped by choices I can change.”

**Current state:** the one-page interaction is the live `?setup` implementation, but its
form is written and organized for someone who already understands Ronin’s machinery. The
next job is to redesign `cowork_setup` for a first-time, non-technical owner: plain questions,
clear consequences, strong defaults, optional detail, and an honest preview of what their
answers shape. The Shiwake activation contract above remains required; a `firstrun.js` that
only stores the email locally is a regression.

### 5 · `cowork` — immediate post-Save state

**Job:** turn `cowork_setup` choices directly into visible work without another page or
decision.

Each absent agent selected in `cowork_setup` gets its own running installation tile. Selecting
absent Claude and Codex therefore opens Cowork with two tiles installing and then waiting for
sign-in. An agent already installed is a fact, not another choice or implied launch. Selecting
no absent agents opens Cowork ready for **＋ New**. Agent installation or vendor sign-in
continues inside its tile; the chosen first project is already attached where possible.

**Handoff belief:** “My agents have somewhere to work, I can see what needs me, and I know
where to begin.”

**Current state:** the immediate Cowork state is designed as a concept. Existing `?tiles=`
routing can open chosen sessions, but the exact live post-Save composition and first-use
path still need implementation against this design. There must be no intermediate
“cowork_setup tile selection” screen.

## Rules across the journey

- **One visual house.** Public pages and Cowork use the semantic tokens governed by
  `docs/ui.md`; public pages use more space, not a different identity.
- **The mark is hito.** The kaki open hexagon and authored 人 are the Ronin identity. It is
  a stylistic human mark, not a Japanese reading test.
- **No terminal cosplay.** Mono is for commands, compact system labels, and identity—not
  every sentence.
- **No agent prerequisite.** An agent may perform the install or help later, but the owner
  can complete the required journey without one.
- **One telling.** Installation instructions have one source and other surfaces quote or
  link to it.
- **The screen is enough.** A handoff does not depend on remembering an earlier page or
  discovering a separate document.
- **Optional means optional.** Skipping an integration never makes base Cowork look broken.
- **Narrate, never gate.** Downloads, sign-ins, and activation show honest state while the
  rest of Cowork remains usable.

## Durable E2E evidence

The Services activation and recurring Tomodachi paths were walked against the live public
path on 2026-08-20. The activation completed through email verification on another device,
polling returned the entitlement, the gated artifact installed, and Services remained
discoverable after restart. The recurring send returned a durable receipt and an identical
resend returned the same receipt without duplication.

That walk found five defects hidden by green test suites: missing disclosure, stuck install
state after updater failure, an artifact naming mismatch, a stale-store path silently taking
the ungated feed, and a misleading seam-test skip message. Those defects were closed. This is
why the final gate remains a real foreign-machine walk rather than test-suite success alone.

## What remains

1. Move the approved landing and load pages into the deployable `ronin-site` implementation.
2. Redesign the live `cowork_setup` form for a first-time, non-technical owner without
   regressing Shiwake activation, disclosure, measured agent facts, or wanted/needed intent.
3. Implement the immediate post-Save Cowork tiles and their direct route into useful work.
4. Walk the real install command and all five surfaces on a clean machine that is not ours.
5. Record every defect from that walk here until it is closed; then move stable behavior into
   the owning implementation docs.

## Verification

A new owner must be able to answer yes to all of these:

1. Did I understand what Ronin is before installing it?
2. Did I knowingly run the install on the machine where my agents work?
3. Did the installer finish with an address that worked?
4. Did `cowork_setup` explain every question in language I understood and let me skip
   optional choices?
5. If I selected Services, did I understand what left the machine?
6. After Save, did each implied action either happen or show honest progress in a tile?
7. Did I know how to start my first useful session?
8. Could I find the VPN path for reaching a remote Cowork before failing at public access?

## Definition of done

A stranger, on their own machine, with no help, moves from `landing_page` through the real
installer into their first useful session, and every defect observed during that walk is
closed.
