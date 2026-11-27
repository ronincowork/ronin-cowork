# Harness sign-in

Ronin runs the harnesses you already pay for: Claude Code, Codex, Antigravity CLI and others, each
signed in with your own account. Nobody sits between you and the provider. One is enough to start;
a second keeps your Agents working when one hits a limit or an outage.

## The ways each harness runs

**Claude Code and Codex** sign in one of two ways, and only one at a time:

1. **Subscription**: the plan you pay its maker for (Claude Pro or Max, ChatGPT Plus or Pro).
2. **API key**: a key from its maker's console, paid as you go.

Both are the harness's own sign-in, kept by the harness itself; signing in the other way replaces it.
Which one it is on comes from the harness's own status (`claude auth status`, `codex login status`),
so the bar always shows the true one.

**Codex** also runs on the **Ronin Gateway**, Ronin's own models. It needs no sign-in: pick a Ronin
model under **Model** when you start a Codex Agent, and your Codex sign-in stays as it is. Claude Code
does not run on the gateway: it speaks only Anthropic's API.

**OpenRouter**, one OpenRouter account for many models, is coming soon for both.

## Signing in

Every harness signs in the same way, in Setup and in Settings, with one of two presses:

- **Authenticate with Agent (recommended):** the Helpful Assistant signs the harness in with you.
  In Setup she opens beside the step; in Settings, in a window on the page (**−** puts it away).
  On Claude Code and Codex she asks which way, **Subscription** or **API key**, and starts it; then
  you see only what you need to do:
  - **Codex, subscription:** a link and a code. Open the link, sign in, and enter the code there.
  - **Claude Code:** a link. Open it, sign in, and paste the code it gives you into the box, then
    press **Send**.
  - **Codex, API key:** a box for your OpenAI API key. Paste it and press **Send**.

  On the other harnesses she opens the terminal sign-in and talks you through it.
- **Terminal:** the harness's own sign-in in a terminal. Follow what it asks, then press **Done**.
  **Cancel** closes it.

If the harness is already signed in, the first press warns you: signing in again signs out every
Agent on that harness until you finish. A second press goes ahead.

Enter keys and codes only in the box or the harness's own terminal, never in a message to an Agent.

## In Setup

Open **Harness** in Setup. Each harness is a bar that says where it stands: **Not set up**,
**Signing in**, **Active** or **Off**. Press a bar to sign it in; it turns **Active** by itself
when the harness finishes. **Hermes** runs on a model service: the Ronin Gateway, your own API key
or OpenRouter. Press one in its bar to see its model entries; you add or change them in Settings,
Model services.

## In Settings

**Harnesses** in Settings shows every harness with three steps, **Install**, **Authenticate** and
**Ready**. **Turn off** stops Ronin using a harness for a while; your sign-in is kept, and
**Turn on** brings it back.

Under the steps, **Models** picks what New Agent offers for that harness: first which model services
are on (In harness, Ronin Gateway, API key, OpenRouter), then **Hide** or **Show** for each model in
them. Hermes's page has only Models.

## Check it works

Start an Agent on the harness and say hello, as in [Get started](get-started.md#say-hello). An answer
in the tile means you're done.
