# Plan
- **label:** Plan
- **blurb:** Write an order with the user, order it, and close it at the end.
- **class:** cowork
- **requires:** behaviour:project-management, lead
- **order:** 26

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `plan ls` | read: every plan in the Workspace, name, status, date and by; `--status` narrows it to Draft, Ordered or Closed | priority | `plan --help` |
| `plan read` | read: one plan, whole; `<workspace>/<name>` reads one anywhere in your Campaign; `--template` is the blank | priority | `plan --help` |
| `plan write` | write: create or replace a Draft, from `--file <path>` or stdin | priority | `plan --help` |
| `plan order` | write: Draft → Ordered, frozen from here | priority | `plan --help` |
| `plan close` | write: Ordered → Closed, the Closed line written once | priority | `plan --help` |

## Syntax

- A name is lowercase letters, digits and `-`; `<workspace>/<name>` is the full form an epic
  attaches: `item attach <epic> plan:<name>`.
- The Workspace is your Team's; on several Teams, or none, add `--workspace <name>`.
- The Status line under the title is the tool's: anything you write there is replaced.
- An Ordered plan is not rewritten: change the epics.

More: `ronin-help planning`
