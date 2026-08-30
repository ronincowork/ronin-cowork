# Provider sign-in — establish one Agent without exposing credentials

The goal is one usable provider, not every integration. The owner chooses the account and
billing arrangement and performs credential-bearing authorization. An Agent may inspect
safe status, explain consequences, run a login command with approval, and verify the result;
it never asks the owner to paste a key into chat or a recorded tile.

## First establish what exists

Use the `cowork_setup` or Configuration Agent list, or inspect from the same login shell a
Ronin tile receives:

```bash
for command in claude codex gemini grok hermes; do
  command -v "$command" 2>/dev/null || true
done
```

This proves only whether a CLI is found. Ronin deliberately does not treat installation as
authentication. The stock launch catalog currently offers Anthropic through Claude Code
and OpenAI through Codex; Configuration may list additional Agent CLIs whose provider/model
launch support or authentication evidence is incomplete.

## Choose billing before login

Ask the owner whether this Agent should use an existing subscription login or separately
billed API access. Do not infer the answer from a model name.

Environment variables can override a subscription session. Inspect names and precedence
without printing values. `tejun-secrets` is the preferred installed-box report; it names
which provider credential would win and never prints its value. A stale or even empty
provider key can select API billing ahead of an OAuth profile. Resolve a conflict with the
owner rather than dismissing the CLI warning.

## Codex / OpenAI

Codex has a safe status command:

```bash
codex login status
```

If it already reports the arrangement the owner chose, change nothing. For a ChatGPT
subscription on a remote machine, the supported device flow is:

```bash
codex login --device-auth
codex login status
```

The owner opens the URL, enters the displayed one-time code, and authorizes in their own
browser. Success for this route is `Logged in using ChatGPT`. Plain `codex login` is also
valid when its browser callback can return on the same machine.

API-key login is a separate billing choice. Use it only when the owner explicitly chooses
API billing. `codex login --with-api-key` reads standard input; the owner must supply it
directly, outside chat, documentation, wipeboards, shell history, and recorded tiles.

## Claude Code / Anthropic

Use Claude Code's own current login/status surface and follow the interactive instructions
it displays. This repository does not carry a provider-neutral command that proves Claude
subscription versus API billing, so do not translate “CLI installed” into “signed in.”

Before launch, use `tejun-secrets` to check whether `ANTHROPIC_API_KEY` or
`ANTHROPIC_AUTH_TOKEN` is in force without revealing its value. Those variables outrank an
OAuth/default profile and can silently move work to per-token billing. If the safe evidence
cannot distinguish the active account, report **unknown** and let the first interactive
launch request owner-controlled authorization.

## Other Agent CLIs

Gemini CLI, Grok CLI, and Hermes may appear in the Agent registry, but the stock
provider/model launch table and safe authentication evidence are not equivalent to that
registry. Do not invent a sign-in command or normalize one provider's status output into
another's. Follow current first-party CLI instructions, keep credentials with the owner,
and report unsupported or unknowable states plainly. Hermes currently has no safe automatic
installer in Ronin.

## Verify without reading a secret

A status command proves only what it explicitly reports. The universal end-to-end proof is
a real launch through Ronin followed by the harmless exchange in
[Get started](get-started.md#prove-one-working-agent). Record provider/model and observable
success, not a token, account identifier, or authentication artifact.
