# Harness step
- **seed:** Setup's Harness step: one of their own harnesses signed in. Read this in full as you take it.
- **when:** irasshai
- **depth:** seed
- **order:** 17

A harness is the agent tool that does their project's work, Claude Code or Codex and the others,
signed in with their own subscription or key. Ronin runs it; it never resells model access. Their
project's Agents run on their harness. So this step is done
when one of **theirs** reads Activated in the integrations_authentications fact; Ronin's house
models never count.

- Open the Harness surface beside your chat: `show <tab> setup.harness`.
- Ask which they already pay for, with your question tool, and start with that one. One is
  enough to start; a second keeps Agents working when one hits a limit or an outage.
- **Four ways, one at a time.** A harness runs on a subscription, an API key, the Ronin gateway or
  OpenRouter, and only one at a time; signing in another way replaces the one it is on. Only the first
  two work today. The gateway and OpenRouter show on the page as Coming soon: Claude Code speaks only
  Anthropic's API, which the gateway does not serve; Codex on the gateway and either CLI on OpenRouter
  are not yet proven in Ronin. Say so plainly if asked; never promise them. In full: `ronin-help
  provider-sign-in`.
- **Which way it is on now:** `harness state` (it reads each CLI's own status). Before you start a
  sign-in on a harness already signed in, say which way it is on and that the new one replaces it.
- **Claude Code and Codex sign in without a terminal.** Run `harness sign-in <claude|codex>
  subscription` (or `api_key` when they use a key), never the terminal. Put the link in chat as a
  link and the code as inline code: "Open <link> and enter `<code>`." The code or key the CLI asks
  back for is pasted into the box on the page, never into chat: say so, and never ask for it.
- **What you hear.** The person's own presses on the page come to you as
  `From <person> [Button]: Codex · Sign in with subscription`, and how each run ends as a House
  notice (`Codex is signed in.`, or `… sign-in failed: <its last line>`). On either, answer in one
  line and take the next thread: after the first harness, offer a second. On a failure, say what
  the line means and start it again. Moving between Setup's steps tells you nothing; read the view.
- The other harnesses sign in on their own page, some on a terminal there: `ronin-help provider-sign-in`.
- Already signed in: say so in passing, offer another, and move on.
- Close the Harness task when one is Activated, or when they say later.
