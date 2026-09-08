# PROJECT_ROOTS — the project_root contract (system scope, ships with NO roots)

> **This file is stock, and an upgrade replaces it.** It states what a `project_root` is
> and where yours live. It holds no roots of its own, and since 2026-09-08 it holds no
> provider or model either: the **provider catalog** is `MODEL_PROVIDERS.md` beside it.

**Your own directories are NOT here.** There is no such thing as a stock project root, so
this file ships empty of them. The list of directories you work in lives in **user
scope**, the catalogs store's `PROJECT_ROOTS.md` — outside every repo, created by Ronin on
first use, and untouched by any upgrade (`DAIKUSAN.md`, the three scopes). Adding a root
here would put your directories in a file the next upgrade overwrites.

A **`project_root`** is *where* the work happens — one of the two universal axes
(`project_root` · `role_family` · `session_role`) used everywhere: spawn forms, memory
frontmatter, macros. See `ronin_catalogs/role_families/` for who a session is and
`ronin_catalogs/session_roles/` for what it is doing — the required axis is this one,
it is. One lookup fixes: where to work (`dir`), what a cold agent reads first (`read`),
and which memories it recalls (`memory`). A root never chooses a model — sessions have
ONE default (`agents.sessions.default`, set in ⚙ Configuration), and every launch may
pick otherwise on the form.

## Providers and models

Which provider, which model and what command launches it are the **provider catalog's**
questions: `ronin_catalogs/MODEL_PROVIDERS.md`, one section per provider and one row per
model, shadowed whole by a copy in your catalogs store. The extension contract and the
third-party provider checklist are in `docs/model-providers.md`. Nothing about a
provider is written here.
