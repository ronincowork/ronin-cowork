# accounts — who this install is for, and what it runs on

> Stock SOP. Your own copy in the sops store (`ronin-store sops` → `accounts.md`) replaces
> this file whole — a default, not law.
> **Voice: agent.** How the agent establishes and records who this install is for — not a walkthrough to relay.
> **Tool: `tejun-account`** — the owner's name, the entitlement, the limits they set, and
> what is still unanswered. Pair it with **`tejun-secrets`**, which answers which provider
> credential is actually in force. Run both before asking the owner anything; half these
> questions are already answered on disk.

Model/provider wiring is documented in `docs/model-providers.md`; the credentials that
make those providers usable follow `secrets.md`. This SOP records neither.

A fresh box knows nothing about the person using it, and **nothing shipped may name a
person** — so Ronin falls back to the login name rather than inventing one. A fallback is
not an answer; it is the absence of one wearing a name. Establishing the real answers is
the first conversation with a new install.

## What is worth knowing, and where it goes

- **Who the owner is.** A display name, set once. It is SETTEI — the owner's own
  configuration — and it lives in the config store, never in a repo and never in this
  file.
- **What this install is entitled to.** A free cowork install runs alone and complete; a
  services install additionally carries an entitlement. `tejun-account` says which this
  box is.
- **What they set for themselves.** Session limits and the like — their choices, not
  ours, and they survive an upgrade because of where they live.
- **What the work needs to reach.** Every account this install talks to, listed by name
  once: the source control host, the databases, the deploy target, whatever else. Names
  only — the credentials themselves follow `secrets.md`, and a key never lands here.

## Asking

Ask when the answer is genuinely missing, not to confirm what the tools already resolved,
and ask in the flow of real work rather than as a form on day one. A person who came to
build something will answer "what should I call you?" in passing and abandon a
questionnaire.

Two things worth getting right early, because they are awkward later: the **name**, which
otherwise sits wrong on everything that greets them; and **which account pays for the
agent** (`secrets.md`), because discovering that in a bill is the expensive way.

## What never goes in

The owner's configuration is served whole over HTTP by design, which is exactly why it
holds no credential — not an API key, not a token, not a password. If something must be
secret, it is not configuration and it is not here (`secrets.md`).

And no fact about this box gets written into this file, or any other. Names, entitlements
and limits are **measured** — `tejun-account` measures them, and a document that repeated
them would be wrong the first time anything changed.
