# USER JOURNEY: finding Ronin to starting work

This is the canonical new-owner journey. It owns the order of the experience, what each
surface must communicate, and the handoff between surfaces. Detailed implementation belongs
with the code it describes.

The journey is complete when a stranger can install Ronin on a machine they control, open
Ronin Setup, activate a provider, and begin useful work without help.

## The positioning spine

**The problem.** You already have agents. Once several are running, you become the thing
holding their terminals, status, and handoffs together.

**The answer.** Ronin adds a co-working space for those agents on a machine you control.

**The trust.** Same agents, same files, same machine. Ronin is the thin layer around the
work, not a new agent, model, or hosted box.

**The payoff.** See who needs you, enter the right tile, and let agents hand work to each
other instead of routing everything through you.

## The journey

```text
landing page → load Ronin → install Ronin → Ronin Home → Ronin Setup → first Agent
```

The public browser concepts live in the Ronin Lab design repository and do not ship in this
artifact. Installation deliberately hands off from the terminal to the private URL.

### Landing and load

The landing page helps a stranger recognize the multi-agent coordination problem and decide
whether Ronin is for them. It must say that Ronin runs around agents they already use, on a
machine they control, and does not replace their agents, models, files, or machine.

The Load Ronin page offers the canonical install command and a guide an Agent on the target
machine can follow. It explains that remote access stays private through the owner's VPN;
no public port is required.

### Install Ronin

Installation chooses and verifies the release, installs one copy and its dependencies,
starts Ronin, proves it answers, and prints the private address. The installer asks no
product choices. Its handoff belief is: “Ronin is running on my machine. This address is
the door back.”

### Ronin Home and Ronin Setup

The private address opens Ronin Home. **Machine Settings** opens **Ronin Setup** at
`#/setup`; it is the one first-run door, not a one-time form. Presets stay pinned beside
Register, Model providers, Workspace folders, Services, gbrain, and Templates.

Each surface records its own choice directly and remains available later. Measured provider
and machine state stays distinct from owner choices. Optional Services remain optional and
must disclose what leaves the machine before any request is made.

The handoff is complete when one provider is activated and at least one Workspace folder is
available for launching work.

### First Agent

The owner opens **＋ New**, chooses a Workspace folder and an activated provider/model, and
launches an Agent. Provider installation or sign-in continues in its own visible tile when
needed. Success is a live Agent returning a harmless test response, not merely an existing
process or model label.

## Rules across the journey

- **One visual house.** Public pages and the coworkspace use the semantic tokens governed by
  `docs/ui.md`; public pages use more space, not a different identity.
- **No agent prerequisite.** An Agent may perform the install or help later, but the owner
  can complete the required journey without one.
- **One telling.** Installation instructions have one source and other surfaces quote or
  link to it.
- **The screen is enough.** A handoff does not depend on remembering an earlier page or
  discovering a separate document.
- **Optional means optional.** Skipping an integration never makes base Ronin look broken.
- **Narrate, never gate.** Downloads, sign-ins, and activation show honest state while the
  rest of the coworkspace remains usable.

## Verification

A new owner must be able to answer yes to all of these:

1. Did I understand what Ronin is before installing it?
2. Did I knowingly run the install on the machine where my agents work?
3. Did the installer finish with a private address that worked?
4. Did Ronin Home lead me clearly to Ronin Setup?
5. Could I activate a provider and add a Workspace folder without a separate first-run form?
6. If I selected Services, did I understand what left the machine?
7. Did a newly launched Agent visibly answer a harmless prompt?

## Definition of done

A stranger, on their own machine, with no help, moves from the landing page through the real
installer and Ronin Setup into their first useful session, and every defect observed during
that walk is closed.
