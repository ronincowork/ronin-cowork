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

| Service | What it is | Claude Code | Codex | Hermes | OpenCode | Others |
|---|---|---|---|---|---|---|
| **Subscription** | the plan you pay its maker for, signed in in the harness | yes | yes | | | |
| **API key in harness** *(recommended)* | a key from its maker's console, signed in in the harness | yes | yes | | | |
| **API key in Ronin key vault** | a key Ronin keeps and starts the Agent on | coming | yes | yes | yes | |
| **Ronin Gateway** | Ronin's own models; nothing to sign in | | yes | yes | | |
| **OpenRouter** | one OpenRouter key for many models, kept in the Ronin key vault | | | yes | yes | |
| **Terminal** | the harness's own sign-in in its terminal, done by hand | yes | yes | | yes | yes, the only way |

- **Subscription** and **API key in harness** sign the harness in without a terminal: the panel
  shows the link, the code, or a box for the code or key, with **Send** and **Cancel**. One at a
  time: signing in the other way replaces it. The one it is on is filled.
- **API key in Ronin key vault**, **Ronin Gateway** and **OpenRouter**: one not set up says so and
  opens Model services in Settings to add it. One set up is filled when New Agent offers it; press it
  to turn it off or on.
- **Terminal** opens the harness's own sign-in on the panel. Follow what it asks, then press
  **Done**, or **Cancel** to close it.

A harness already signed in warns first: signing in again signs out every Agent on it until you
finish. A second press goes ahead.

Under the services, **Model entries** lists the models of each service that is on, with **Hide** or
**Show** for what New Agent offers. **+ Add or change model services in Settings** comes after them.

**Turn off** stops Ronin using a harness for a while; every sign-in is kept, and **Turn on** brings
it back.

## The Helpful Assistant

**Subscription** and **API key in harness** open the Helpful Assistant: in Setup beside the step, in
Settings in a window over the page (put it away with −). She hears what you pressed and how it ends,
and helps. **Terminal** tells her, without opening her.

Enter keys and codes only on the panel, in the Ronin key vault, or in the harness's own terminal,
never in a message to an Agent.

## Check it works

Start an Agent on the harness and say hello, as in [Get started](get-started.md#say-hello). An answer
in the tile means you're done.
