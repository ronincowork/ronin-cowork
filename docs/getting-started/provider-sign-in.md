# Provider sign-in

Ronin runs the Agents you already pay for: Claude Code, Codex, Antigravity CLI and others, each
signed in with your own account. Nobody sits between you and the provider, and you can
add another provider whenever you like. One is enough to start.

## Pick a provider

Open **Model providers** in [Ronin Setup](setup-workbench.md), or from the **Models** door
on Ronin Home. Each provider is a stone that says where it stands:

- **Not installed** — Ronin can install it for you.
- **Manual install** — the provider needs a step Ronin won't guess; you get an
  **Install guide** link instead.
- **Needs sign-in** — installed, not yet signed in.
- **Activated** — ready for your Agents.
- **Off** — you turned it off; your sign-in is kept.

Press a stone to open it. Its page has three steps: **Install**, **Authenticate** and
**Ready**. Each gets a check when it's done.

## Install

Press **Install**. The provider's own installer runs in a terminal right on the page, so you
can watch it and answer anything it asks. When it finishes, Install gets its check.

## Sign in

Press **Authenticate**. The provider's own sign-in opens in the same place. Follow it: a
browser login, a device code, or an API key, whichever you use with that provider.

Under the terminal, give this sign-in a name you'll recognise, such as "Personal Claude" or
"Work API", and choose its type: **Account / subscription**, **API key**,
**Third-party service** or **Not signed in**. Then press **Done**. **Cancel** closes the
terminal without finishing.

Enter passwords and keys only in the provider's own sign-in, never in a message to an
Agent.

## Ready

When all three steps have checks, the provider is **Activated**. Under the steps you'll see
the models it offers. **Refresh all model providers**, at the top, checks every provider
again.

To stop using a provider for a while, press **Turn off**. Agents already running keep going,
and **Turn on** brings it back without signing in again.

## Check it works

Start an Agent with this provider and say hello, as in [Get started](get-started.md#say-hello).
An answer in the tile means you're done.
