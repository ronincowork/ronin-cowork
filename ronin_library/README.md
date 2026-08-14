# ronin_library — the reference shelf

The longer reading the catalogs point an agent at. The catalogs say **what you can
do** — actions, macros, tools, session jobs; the library holds the **reference
material** a catalog entry may send you to: a how-to, a format, a worked method.

**Deliberately near-empty.** The shelf starts bare and grows one screened piece at a
time — nothing is carried in wholesale. A catalog entry that points at a document not
on this shelf is a dead link, and `check-catalogs` (a byoin_check) counts them.

**Yours beats ours, file for file.** The shipped shelf is a default way of working,
never a prescription. Your own library lives in the `library` store
(`$(ronin-store library)` — never spell the path): a file there with the **same name**
as a shipped one replaces it whole, and a new name sits beside the stock ones. Write
your own project-planning how-to and your sessions read yours, not ours. An upgrade
replaces this directory and never touches your store.
