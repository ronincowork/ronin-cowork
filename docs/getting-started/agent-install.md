# Install an Agent provider

Open **Harnesses** in [Ronin Setup](setup-workbench.md). Each provider has three
separate steps—**Install**, **Authenticate**, and **Ready**—because a CLI being present does
not prove that it is signed in or available to Ronin.

## Choose a provider

Choose the provider whose account and billing arrangement you want to use. Ronin connects
to that provider directly; it does not resell model access or put a Ronin credential
between you and the provider. You only need one working provider to continue Setup.

The provider stone tells you what this machine currently has:

- **Not installed** means Ronin has a safe installation command for that CLI.
- **Manual install** means the provider needs preparation Ronin should not guess or run.
- **Needs sign-in** means the CLI is present but has not been activated here.
- **Activated** means Ronin has recorded the provider as ready to launch.

## Install

Open the provider and press **Install**. Installation runs in a visible temporary terminal
on the Harnesses surface. You can watch the provider's own installer, respond to a
system prompt when necessary, and retain the exact failure if it does not complete. Ronin
measures the CLI again afterward; merely starting the terminal does not mark it installed.

If the provider offers an **Install guide** instead of an Install button, follow the linked
vendor preparation. Ronin deliberately avoids inventing an automatic command where its
registry cannot install the CLI safely.

## Authenticate and make it ready

Once Install has a check, press **Authenticate**. The provider's native sign-in opens in a
temporary terminal. Complete account, browser, device-code, billing, and trust choices
yourself; never paste a secret into an Agent conversation. **Done** measures the result and
records activation. **Close** leaves the provider unactivated.

When all three steps have checks, launch one Agent and send the harmless proof request in
[Get started](get-started.md#say-hello). That visible response—not an
installed command or a saved credential—is the end-to-end proof.

For the sign-in walkthrough, continue with [Provider sign-in](harness-sign-in.md).

Contributors: [provider installation construction](../architecture/agent-install.md) and
[provider registry](../architecture/harness-catalog.md).
