# Install an Agent provider

Open **Harness** in [Ronin Setup](setup-workbench.md) or in Settings: both show the same panel. A
harness is installed first, then given its models under **Model services**, because a CLI being
present does not give it any models.

## Choose a provider

Choose the provider whose account and billing arrangement you want to use. Ronin connects
to that provider directly; it does not resell model access or put a Ronin credential
between you and the provider. You only need one working provider to continue Setup.

The provider stone tells you where it stands:

- **Not installed**: the CLI is not on this machine. Ronin installs it, or links its install guide.
- **Installing**: its installer is open.
- **No model service**: installed, with nothing giving it models yet.
- **Signing in**: a sign-in is open.
- **Active**: its own sign-in or a model service gives it models.
- **Off**: turned off; every sign-in is kept.

## Install

Open the provider and press **Install**. Installation runs in a visible temporary terminal
on the harness's panel. You can watch the provider's own installer, respond to a
system prompt when necessary, and retain the exact failure if it does not complete. Ronin
measures the CLI again afterward; merely starting the terminal does not mark it installed.

If the provider offers an **Install guide** instead of an Install button, follow the linked
vendor preparation. Ronin deliberately avoids inventing an automatic command where its
registry cannot install the CLI safely.

## Give it its models

Once it is installed, **Model services** lists what the harness can use: its own sign-in by
subscription or API key, a key in the Ronin key vault, the Ronin Gateway, OpenRouter, or its
terminal. Never paste a secret into an Agent conversation.

When it reads **Active**, launch one Agent and send the harmless proof request in
[Get started](get-started.md#say-hello). That visible response, not an installed command or a saved
credential, is the end-to-end proof.

For the sign-in walkthrough, continue with [Provider sign-in](harness-sign-in.md).

Contributors: [provider installation construction](../architecture/agent-install.md) and
[provider registry](../architecture/harness-catalog.md).
