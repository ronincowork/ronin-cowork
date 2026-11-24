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
`harness state` prints the sign-ins open now; `harness cancel <id>` stops one. How a run ends
comes to you as a House notice ("Codex is signed in."). The other harnesses sign in on their own
page: `ronin-help provider-sign-in`. `harness --help`.
