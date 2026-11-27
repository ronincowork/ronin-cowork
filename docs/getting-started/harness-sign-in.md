# Harness sign-in

Ronin runs the harnesses you already pay for: Claude Code, Codex, Antigravity CLI and others. Once a
harness is installed it can run; what it needs is access to models. One is enough to start; a second
keeps your Agents working when one hits a limit or an outage.

## Where

**Harness** in Setup and **Harness** in Settings show the same thing: a stone per harness, saying
where it stands: **Not installed**, **Installing**, **No model service**, **Signing in**, **Active**
or **Off**. Press one to open it.

## Model services

An open harness shows **Model services**: first the services it can use, then the model entries of
each one that is on.

| Harness | Its services |
|---|---|
| Claude Code | Subscription · API key · OpenRouter · Terminal *(Backup)* |
| Codex | Subscription · API key · Ronin Gateway · OpenRouter · Terminal *(Backup)* |
| Hermes | Ronin Gateway · API key · OpenRouter |
| OpenCode | API key · OpenRouter · Terminal *(Backup)* |
| Antigravity, Grok and the rest | Terminal |

- **Subscription**: the plan you pay its maker for, signed in in the harness.
- **API key**: for Claude Code and Codex, a key from its maker's console, signed in in the harness. For
  Hermes and OpenCode, which have no key login of their own, a key kept in the Ronin key vault.
- **Ronin Gateway**: Ronin's own models; nothing to sign in.
- **OpenRouter**: one OpenRouter key, kept in the Ronin key vault, for many models.
- **Terminal**: the harness's own sign-in in its terminal, done by hand: the backup to the others.

Subscription and API key on Claude Code and Codex sign the harness in without a terminal: the panel
shows the link, the code, or a box for the code or key, with **Send** and **Cancel**. One at a time:
signing in the other way replaces it. The one it is on is filled.

An outside service with no key yet reads **Not signed in**: press it to add the key in Model services.
One signed in is filled when New Agent offers it; press it to turn it off or on.

**Terminal** opens the harness's own sign-in on the panel. Follow what it asks, then press **Done**, or
**Cancel** to close it. Under it, **Copy code** copies the code the terminal showed; **Copy link** copies its link
once it is on screen (a note says to click in the terminal to show it); **Go Back** takes the harness
back a screen when it offers that. While it is open,
**Done** and **Cancel** stand in the row where **Terminal** was.

A harness already signed in warns first: signing in again signs out every Agent on it until you
finish. A second press goes ahead.

Under the services, **Model entries** lists the models of each service that is on, with **Hide** or
**Show** for what New Agent offers. **+ Add or change model services in Settings** comes after them.

**Turn off** stops Ronin using a harness for a while; every sign-in is kept, and **Turn on** brings
it back.

## The Helpful Assistant

**Subscription** and **API key** open the Helpful Assistant: in Setup beside the step, in
Settings in a window over the page (put it away with −). She hears what you pressed and how it ends,
and helps. **Terminal** tells her, without opening her.

Enter keys and codes only on the panel, in the Ronin key vault, or in the harness's own terminal,
never in a message to an Agent.

## Check it works

Start an Agent on the harness and say hello, as in [Get started](get-started.md#say-hello). An answer
in the tile means you're done.
