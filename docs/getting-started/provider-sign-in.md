# Harness sign-in

Ronin runs the harnesses you already pay for: Claude Code, Codex, Antigravity CLI and others, each
signed in with your own account. Nobody sits between you and the provider. One is enough to start;
a second keeps your Agents working when one hits a limit or an outage.

Each harness holds one sign-in: your **subscription** (Claude Pro or Max, ChatGPT Plus or Pro) or an
**API key** (pay as you go). Signing in again replaces the one before.

## In Setup

Open **Harness** in Setup. Each harness is a bar that says where it stands: **Sign in**,
**Signing in**, **Signed in** or **Off**.

**Claude Code and Codex** sign in without a terminal. Press **Sign in**, then **Sign in with your
subscription** or **Use an API key**. The bar shows only what you need to do:

- **Codex, subscription:** a link and a code. Open the link, sign in, and enter the code there.
- **Claude Code:** a link. Open it, sign in, and paste the code it gives you into the box on the bar,
  then press **Send**.
- **Codex, API key:** a box for your OpenAI API key. Paste it and press **Send**.

The bar turns **Signed in** by itself when the harness finishes. **Cancel** stops the sign-in.

**Other harnesses** sign in on their own terminal, opened in the bar: follow what it asks, then
press **Close**. **Hermes** uses API connections, set up in its bar.

If the Helpful Assistant is open, she sees each sign-in you start and how it ends, and can sign a
harness in with you.

Enter keys and codes only in the bar or the harness's own terminal, never in a message to an Agent.

## In Settings

**Harnesses** in Settings shows every harness with three steps, **Install**, **Authenticate** and
**Ready**. Authenticate opens the harness's terminal sign-in; press **Done** when it is finished,
or **Cancel** to close it. **Turn off** stops Ronin using a harness for a while; your sign-in is
kept, and **Turn on** brings it back.

## Check it works

Start an Agent on the harness and say hello, as in [Get started](get-started.md#say-hello). An answer
in the tile means you're done.
