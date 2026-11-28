# github
- **seed:** sign this office in to GitHub in one call: Ronin runs gh's device login, you give the link and code
- **when:**
- **depth:** seed
- **serves:** irasshai
- **order:** 75

## Usage

`github sign-in` starts GitHub's own device sign-in for github.com over HTTPS and prints the link and
the code to enter there; the page shows the same, with **Copy** and **Cancel**. The person approves it on
GitHub in their own browser. Once approved, Ronin sets git up to use it (`gh auth setup-git`), so git
clones what they own. How it ends comes to you as a House notice ("GitHub is signed in.").
`github cancel` stops it. Nothing else is needed: no gh help, no gh commands of your own. `github --help`.
