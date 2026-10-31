# Work Record
- **label:** Work Record
- **blurb:** How do I keep my objective, repositories and documents truthful?
- **class:** cowork
- **requires:** —
- **order:** 20

Reach for this bundle when your objective or your repositories change: it is the one record
the owner reads on your tile and roster. The record keeps what is about you: your
objective, repositories, and the ids of the items you hold, with their status. Work items
are the `item` tool's: the Work Item capability.

**Show docs** means list the documents attached to the items you hold: `work-record read`
shows them. **Add a doc** means put a document on your work record:
`work-record add_doc <path>|<url>` adds it to the item you hold (`--item <id>` when you hold several). **Update work record** means record your current objective and repositories
through the typed dispatcher.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `work-record update_record` | write: objective and repositories on the record | priority | `work-record --help` |
| `work-record workspace` | read/write: list, add or remove repositories this Agent records as current work; accepts a handle or full URL and a separate branch | priority | `work-record workspace --help` |
| `work-record read` | read: the record and the items held, with their status | priority | `work-record --help` |
| `work-record add_doc` | write: add a document to the item you hold | priority | `work-record --help` |

More: `ronin-help work-record`
