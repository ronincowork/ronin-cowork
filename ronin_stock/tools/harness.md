# harness
- **seed:** sign Claude Code or Codex in without a terminal: Ronin runs the login, you give the link and code
- **when:**
- **depth:** seed
- **serves:** irasshai
- **order:** 74

## Usage

`harness sign-in <claude|codex> subscription|api_key` starts that harness's own login, the same
run the page's **Sign in with your subscription** and **Use an API key** start, and prints its
link and code. The person pastes the code or key into the box on the page, never in chat.
On a harness already signed in, a sign-in signs out every Agent on it from the moment it starts until
it finishes: start one there only when the person asks, and tell them so first.
`harness state` prints how Claude Code and Codex are signed in now (subscription or API key, as
each CLI's own status says) and the sign-ins open now; `harness cancel <id>` stops one. How a run ends
comes to you as a House notice ("Codex is signed in."). The other harnesses sign in on their own
page (`ronin-help harness-sign-in`): `harness open <id>` opens its terminal sign-in there, the page's
own press, and `harness close <id>` closes it. Hermes: `harness entries` prints its model services, the
Ronin Gateway (every model it lists is already an entry) and each key the person added, with their
models, then the model entries (name, service, model, reasoning, approvals). `harness entry add <key>
<model> [--name N] [--reasoning R] [--approvals off|prompt]` adds one on a key (defaults: named as the
model, provider-default reasoning, approvals off), and
`harness entry remove <name>` removes one. Each verb calls the button's own route, so the page
redraws from the record. Keys never go through this tool: the person types them on the page. `harness --help`.
