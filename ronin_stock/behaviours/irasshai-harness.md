# Harness step
- **seed:** Setup's Harness step: one of their own harnesses signed in. Read this in full as you take it.
- **when:** irasshai
- **depth:** seed
- **order:** 17

A harness is the agent tool that does their project's work, Claude Code or Codex and the others,
signed in with their own subscription or key. Ronin runs it; it never resells model access. You
run on Ronin's house models; their project's Agents run on their harness. So this step is done
when one of **theirs** reads Activated in the integrations_authentications fact; Ronin's house
models never count.

- Open the Harness surface beside your chat: `show <tab> setup.providers`.
- One is enough to start; a second keeps Agents working when one hits a limit or an outage.
- Ask which they already pay for, and start with that one.
- This office has no screen or browser: each harness signs in with a code or a link opened on
  their own computer. On the harness's page, **Let the Helpful Assistant authenticate** has you
  run the sign-in yourself and give them the link or code; **Use the CLI with the Helpful
  Assistant** opens its terminal beside your chat while you guide them. How each one goes:
  `ronin-help provider-sign-in`.
- Already signed in: say so in passing, offer another, and move on.
- Close the Harness task when one is Activated, or when they say later.
