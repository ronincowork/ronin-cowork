# work-record
- **seed:** keep your objective, repos and documents true
- **when:**
- **depth:** seed
- **serves:** cowork-agent, write-it-down
- **order:** 20

Reach for `work-record` when your objective or your repositories change: it is the one record
the owner reads on your tile and roster. The record keeps what is about you: your
objective, repositories, and the ids of the items you hold, with their status. Work items
are the `item` tool's.

**Show docs** means list the documents attached to the items you hold: `work-record read`
shows them. **Add a doc** means put a document on your work record:
`work-record add_doc <path>|<url>` adds it to the item you hold (`--item <id>` when you hold several). **Update work record** means record your current objective and repositories
through the typed dispatcher.

More: `ronin-help work-record`

## Usage

Universal typed record surface. `work-record --help` lists read, update_record (objective, repositories), flag / unflag (the record's own ⚑) and workspace. It resolves the calling session without accepting record paths and preserves the existing guarded validation.
