# Kimi Code in Ronin

- **stop_keys:** Escape
- **clear_keys:** C-c
- **launch_native:** ["kimi"]
- **launch_model:** ["kimi", "--model", "{model}"]
- **launch_native_dangerously:** ["kimi", "--auto"]
- **launch_model_dangerously:** ["kimi", "--model", "{model}", "--auto"]
- **launch_resume:** ["kimi", "--session", "{session_id}"]
- **launch_new_session_id:** —
- **launch_isolation:** —
- **transcript_journal:** —
- **launch_initial:** message

CLI id and command: `kimi`. Vendor: `moonshot` (Moonshot AI), its `vendor` in `src/agents.ts`; transcript `~/.kimi-code/sessions/<workspace>/<session-id>/agents/main/wire.jsonl`, no adapter. Reviewed 2026-11-15.
Version: **2.6.2**. Installed into a scratch home and its help read; never signed in or run
through Ronin.

## Install and sign in

`npm install -g @moonshot-ai/kimi-code` (Node 22.19 or later; Ronin's bundled Node serves).
Moonshot's curl installer is not used: it installs into `~/.kimi-code/bin` and adds that to
`.bashrc`, which the login shell Ronin resolves commands through never reads. Signing in is
`kimi login` (device code; `--region global` for kimi.ai, `mainland-cn` for kimi.com), which
writes `~/.kimi-code/credentials/managed:kimi-code.json`, the file Ronin reads as "signed
in". A Moonshot API key is set with `kimi provider` instead, and the owner's **Done**
activates it. Update runs `npm install -g @moonshot-ai/kimi-code@latest`.

## Ronin launch sequence

| Model | Launch mode | Command core |
|---|---|---|
| Native | Native | `kimi` |
| Named | Native | `kimi --model <model>` |
| Native | Dangerously | `kimi --auto` |
| Named | Dangerously | `kimi --model <model> --auto` |

**The brief is its first message.** Kimi Code has no option that runs a first prompt and
stays open (`-p` answers once and exits; there is no positional prompt), so Ronin queues the
brief's "Read first" line as a House notice and the message queue delivers it once Kimi's
screen reads ready: its `│ >` input box. On a folder it has not seen, Kimi first asks
**Trust this folder?**; the screen reads as asking (its `↑↓ navigate · Enter select` footer)
and the brief waits until that is answered. Dangerously is `--auto`
(Never Ask); upstream's `--yolo` still asks on risky actions, so it is not Ronin's
Dangerously. Model ids are Kimi Code's model aliases from its `config.toml`.

Chat shows the terminal only. Sessions live in
`~/.kimi-code/sessions/<workspace>/<session-id>/agents/main/wire.jsonl` (each sub-agent has
its own), but the line format of the current Kimi Code is not published, so no log reader is
written. Resume syntax is `kimi --session <id>`; Ronin does not read the id, so Archive
refuses.

Stop sends Escape; Clear sends Ctrl+C.

Shared [code ownership and test boundaries](README.md#code-ownership) apply to this CLI.

[Upstream reference](https://moonshotai.github.io/kimi-code/en/guides/sessions). Update the evidence/version when changing this integration.
