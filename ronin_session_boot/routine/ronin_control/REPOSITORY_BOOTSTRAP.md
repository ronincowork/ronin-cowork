# REPOSITORY BOOTSTRAP — when Control needs a repository

If `GET /api/settei` hands you a `needed[]` item saying a project root needs a local Git
repository, use the named tool:

```bash
ronin-repo-init <project-root>
```

It initializes Git in the existing directory. It does not create the directory, add a
remote, or assume the owner wants the work published anywhere. Report its `INITIALIZED`
or `READY` verdict; the task disappears from the next SETTEI read once `.git` exists.
