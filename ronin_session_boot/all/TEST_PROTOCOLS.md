# test_protocols — where testing lives

There is one test command in this house: `bin/ronin-byoin` — every check, one verdict,
nothing hand-rolled around it. `docs/test-protocols.md` (in Ronin's own directory) is
the whole contract: who runs what, when, and how to read the verdict. If you change
Ronin's code, its catalogs, or anything in the user stores — a session task, a skin, a
macro, an SOP shadow — run BYOIN afterward and read what it says. A SKIP is not a pass.
