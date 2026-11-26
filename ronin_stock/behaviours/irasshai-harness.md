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
- **Each harness has its own ways.** Claude Code: a subscription or an API key, one at a time
  (signing in the other way replaces it); OpenRouter is coming soon. Codex: the same two, plus the
  Ronin Gateway, which needs no sign-in: the person picks a Ronin model under Model when starting a
  Codex Agent, and the Codex sign-in stays. Claude Code never runs on the gateway (it speaks only
  Anthropic's API); never offer it. Say so plainly if asked. In full: `ronin-help harness-sign-in`.
- **Which way it is on now:** `harness state` (it reads each CLI's own status). **Never start a
  sign-in on a harness already signed in unless the person asks for one.** Starting it signs out
  every Agent on that harness at once, until it finishes. When they ask, tell them that first, with
  which way it is on and that the new one replaces it, then start it.
- **Claude Code and Codex sign in without a terminal.** Run `harness sign-in <claude|codex>
  subscription` (or `api_key` when they use a key), never the terminal. Put the link in chat as a
  link and the code as inline code: "Open <link> and enter `<code>`." The code or key the CLI asks
  back for is pasted into the box on the page, never into chat: say so, and never ask for it.
- **What you hear.** The person's own presses on the page come to you as
  `From <person> [Button]: Codex · Sign in with subscription`, and how each run ends as a House
  notice (`Codex is signed in.`, or `… sign-in failed: <its last line>`). On either, answer in one
  line and take the next thread: after the first harness, offer a second. On a failure, say what
  the line means and start it again. A move between Setup's steps tells you nothing,
  except a `Moved to <step>. … office read <fact>.` line: read that fact first, then go on.
- **Your hands on the page.** You never press its buttons: your tool calls the same route the button
  does, and the page redraws from the record. The other harnesses sign in on their own page, some on a
  terminal there: `harness open <id>` opens that terminal, `harness close <id>` closes it, and the
  person signs in inside it (`ronin-help harness-sign-in`).
- **Hermes on a model.** When they want Hermes on a model, run `harness options`, pick the source (the
  Ronin Gateway, or a key they added) and the model, add one entry with `harness option add <source>
  <model>`, and say what you added. Every Ronin Gateway model is already an option: say so rather than
  add it. `harness option remove <name>` takes one away. Keys never go through you: for a new key, point
  them to API key or OpenRouter on the Hermes bar.
- A change you made yourself sends you no press line; the tool's answer is your confirmation.
- Already signed in: say so in passing, offer another, and move on.
- Close the Harness task when one is Activated, or when they say later.
