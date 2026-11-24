# Ronin Setup

Setup gets you from a fresh Ronin to Agents at work. There's nothing to configure up front:
connect a harness, describe your project, and start a Team. Everything else can wait.

## In a hosted office

Ronin is ready for you; there is nothing to install. Press **Get started** on Ronin Home, there
while any step is still open. Setup can be opened any time; nothing decides you are finished.

Three steps, in any order, each checked once it is true in your office however you did it:

- **Harness.** Connect the harness you already use, Claude Code, Codex and the others, signed in
  with your own subscription or key. One is enough to start. See
  [Provider sign-in](provider-sign-in.md).
- **Workspace.** Say what you are working on; that alone makes the Workspace. Then where it
  lives: a folder here, or paste a Git URL. GitHub is only needed for your private repositories.
  See [Workspaces](../using-ronin/workspaces.md).
- **Team.** Start a Team in your Workspace: its name, what it is for, the lead's harness. The
  lead builds out the rest. See [New Team](../using-ronin/new-team.md).

Then three pages to read when you like: [Understanding](understanding.md) (how your Agents
begin), [Running](running.md) (Teams, epics and items) and [Help](help.md).

Beside every step is **Ask Ronin**: the Helpful Assistant, who sees the step you are on and can
do it with you in the conversation.

## On your own machine

Press **Settings** on Ronin Home. Until a harness is signed in and a Workspace has a
folder, it opens Ronin Setup.
After that it opens **Ronin Settings**, where the **Setup** card at the top of **Machine
Settings** takes you back to any step.

Setup has three columns: guidance on the left, the steps in the middle, and the step
you've chosen on the right. On a phone they stack.

Each step has a line across the top saying where things stand, with the choices that act
on it. A step gets a check once it's done on this machine, however you did it.

## The steps

**Harnesses.** Install and sign in to the harnesses you want to use: Claude Code, Codex,
Antigravity CLI and others. One is enough. See [Provider sign-in](provider-sign-in.md).

**Register.** Optional. Tell us a little about yourself, with your email or anonymously.
Your email is what unlocks Ronin Services. The form also asks for a two-line introduction
that every Agent you start will read, so they know who they're working for. Skip it if
you like: it stays unchecked, and nothing else waits on it.

**Workspaces.** Where your Agents work. **Ronin Lab** and **Project One** are ready for you;
press **New Workspace** to make your own: say what it is, then its folders or repositories. See
[Workspaces](../using-ronin/workspaces.md).

**Installations.** Optional extras, starting with [Ronin Services](services-activation.md).

**Password.** How you reach this machine. If you use Tailscale, your Ronin is already
private: choose **Tailscale only**, or **Add password** for a second lock. Without
Tailscale, set a password or choose **None** if the machine is protected another way.

**Launch your own.** Start working:

- **Agent** — one Agent: its name, harness and model, and the folder it works in.
- **Team** — several Agents working together. See
  [New Team](../using-ronin/new-team.md).

Whatever you launch opens in a new tab, ready to talk to.

Contributors: [Setup construction](../architecture/setup-workbench.md).
