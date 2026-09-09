# Model providers — known update gap

Update is offered only when a provider is authenticated and Refresh found a newer version.
One narrower ownership gap remains for a future change: before Ronin runs an npm update, it
should prove that npm owns the installed binary on this machine. Unknown ownership must mean
no npm update.

On 2026-09-09, `~/.local/bin/claude` resolved into Claude Code's own
`~/.local/share/claude/versions/` store, while the corresponding global npm package was
absent. The old registry npm update failed with `EEXIST`. Adding `--force` would risk
overwriting Claude's own launcher and must never be used. The immediate correction uses
Claude's vendor command, `claude update`; generic per-box npm ownership detection is deferred.

Sources checked on 2026-09-09:

- Claude Code native installs self-update: https://code.claude.com/docs/en/getting-started#auto-updates
- Gemini CLI enables automatic updates by default: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md
- Grok enables launch-time auto-update by default: https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/05-configuration.md
- Codex documents an explicit update, with no automatic-update claim: https://developers.openai.com/codex/cli/
- Hermes documents an explicit manual update: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/updating.md
