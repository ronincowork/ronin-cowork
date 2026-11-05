# Ronin Setup

Setup gets you from a fresh Ronin to Agents at work. There's nothing to configure up front:
connect a provider, pick a folder, and launch. Everything else can wait.

## Opening it

Press **Settings** on Ronin Home. Until you've answered every step, it opens Ronin Setup.
After that it opens **Ronin Settings**, where the **Setup** card at the top of **Machine
Settings** takes you back to any step.

Setup has three columns: guidance on the left, the steps in the middle, and the step
you've chosen on the right. On a phone they stack.

Each step has a line across the top saying where things stand, with the choices that
answer it. A step gets a check once you've answered it, by doing it or by saying not now.

## The steps

**Model providers.** Install and sign in to the Agents you want to use: Claude Code, Codex,
Antigravity CLI and others. One is enough. See [Provider sign-in](provider-sign-in.md).

**Register.** Optional. Tell us a little about yourself, with your email or anonymously.
Your email is what unlocks Ronin Services. The form also asks for a two-line introduction
that every Agent you start will read, so they know who they're working for. Press
**No thank you** to skip.

**Workspace folders.** Where your Agents work. **Ronin Lab** and **Project One** are ready
for you; add your own folders or GitHub repositories here. See
[Workspace folders](workspace-folders.md).

**Installations.** Optional extras, starting with [Ronin Services](services-activation.md).

**Password.** How you reach this machine. If you use Tailscale, your Ronin is already
private: choose **Tailscale only**, or **Add password** for a second lock. Without
Tailscale, set a password or choose **None** if the machine is protected another way.

**Launch your own.** Start working:

- **Agent** — one Agent: its name, provider and model, and the folder it works in.
- **Team** — several Agents working together. See
  [New Team](../using-ronin/new-team.md).
- **Presets** — ready-made starts, such as a Personal Assistant, a Morning Briefing, or a
  Team to build a new project. **You use Ronin for** narrows them to building software,
  life assistants, or research and writing.

Whatever you launch opens in a new tab, ready to talk to.

Contributors: [Setup construction](../architecture/setup-workbench.md).
