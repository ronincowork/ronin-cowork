# codex — the account that pays for a Ronin coding session

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `codex.md`) replaces
> this file whole — a default, not law.
> **Voice: relay.** Written for the agent to walk a person through, not to follow itself.
> **Tool: `tejun-secrets [path]`** — establish whether a project names an OpenAI key
> before advising on credentials. It reports names and exposure state, never values.

For an interactive Codex session in Ronin, use the owner's **ChatGPT subscription
account**. That is the normal account for coding work in a tile; it keeps the session on
the plan the owner chose instead of quietly creating per-token API charges.

## Establish first

Run `codex login status` before changing anything. It says whether Codex is using
ChatGPT or an API key without showing a credential. If the answer already matches the
owner's choice, leave it alone.

When a project may need an OpenAI key, run `tejun-secrets [path]` before the
conversation as well. `OPENAI_API_KEY` is a project credential, not evidence that an
interactive Ronin tile should use API billing.

## Signing in to the owner's ChatGPT account

The reliable Ronin path is device authorization:

1. Run `codex login --device-auth`.
2. Relay the URL and one-time code it prints to the owner. They open the URL, sign in to
   the intended ChatGPT account, and enter that code themselves.
3. Run `codex login status`; done means it says `Logged in using ChatGPT`.

Do not tell someone to find a Codex option inside the ordinary ChatGPT chat interface.
There is none: authorization happens on the separate page the login command supplies.
Plain `codex login` is fine when its browser callback opens and returns on the same
machine; use device authorization when that is not frictionless.

## API keys are the exception

Use an API key only when the owner explicitly wants API billing — for example,
programmatic API work, a distinct billing boundary, or a provider configuration that
requires it. State that consequence before changing the login. The key belongs in the
secret mechanism described by `secrets.md`, never in a prompt, a session transcript, a
document, or source control.

`codex login --with-api-key` reads a key from standard input. An agent must never ask
the owner to paste that value into the chat or expose it while diagnosing an account.
After any change, `codex login status` is the only confirmation needed.

## When the status is wrong

Do not guess from the model name, a browser tab, or an invoice. Read the status, inspect
the project's secret *names* with `tejun-secrets` when applicable, then ask the owner
which account should pay. Use the device-code flow to return an interactive tile to the
owner's ChatGPT account; use API-key login only after the owner has deliberately chosen
that exception.
