# Machine configuration

Ronin keeps machine configuration in one document:

```text
$(bin/ronin-store config)/machine_settings.json
```

The document contains the machine, owner, session, agent, setup, and Campaign choices.
Campaigns are keyed by their stable id inside `campaigns`. Authentication secrets and
passkeys are never returned by the configuration API.

When the machine document is absent, the first read imports `ronin.json` and the JSON
records in the Campaign store, writes the combined machine document atomically, and uses
that record from then on. Authentication and passkey records move to the credential store
during the same import.

`src/machine-settings.ts` owns normalization and the public record. It exports the only
two configuration operations:

```ts
readMachineSettings()
writeMachineSettings(family, value)
```

The read returns `{ set, observed, status, needed, schema }`. Only `set` is durable. The
durable document is read once and the in-process copy is replaced after an atomic write.
Machine observations are shared for five seconds; derived status and unmet needs use that
recent observation without repeating host probes inside collection reads.

The HTTP surface has one route and one verb in each direction:

```text
GET   /api/machine-settings
PATCH /api/machine-settings   { "family": "machine", "value": { "monitor": true } }
```

PATCH accepts a named family and its typed value. Unknown keys do not replace the
document. The browser uses `public/js/machine-settings.js`; the setup and standing views
interpret the schema through `public/js/machine-settings-schema.js`.

Runtime environment variables override server values for the running process. They are
not written into the document.

## Stock and store resources

`src/resources.ts` resolves shipped resources and the matching user store. A user file at
the same relative path replaces the shipped file whole; new user files join the result.
Every resolved item carries `origin` and `shadowed` state. Catalog sections, definitions,
SOPs, ways, skins, lexicons, templates, session readings, and bundles use this resolution
rule. Directory listings and file contents are shared by resolver calls within one HTTP
request and are read again for the next request.
