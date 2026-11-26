# Model services

A model service is a connection Ronin uses to call a model API. A harness is the CLI that runs the Agent. A **model option** is the named choice shown in New Agent. An **API model ID** is the identifier sent to a model service when that option is used. The intended harness setting controls which compatible model services and which model options appear in New Agent. Two harnesses can use the same connection and named models. Two connections can each have a model called “Fast” and send requests to different endpoints.

## Who supplies the model choices?

| Model service or in-harness models | Who supplies the names in New Agent? | What changes the list? |
|---|---|---|
| Ronin Gateway | The office Gateway supplies the model IDs. Each ID is also its visible name. | The machine reads the Gateway list at startup and on refresh. A successful refresh replaces the cached list. An ID removed upstream disappears from new choices after that refresh. An offline office can still display its last successful list. |
| OpenRouter | HQ can publish starters. The office user can also name models for their OpenRouter connection. | HQ publishes the display name and exact OpenRouter ID in its Admin Models table, delivered to the office in `office_unit/models.json` as rows with `cli: openrouter`. The office seeds eligible starters once per connection, using the IDs available to its key. The user can then add, rename or remove options. Refreshing preserves those edits. |
| Private API key | The user names each option and enters the exact API model ID on that connection. | Saving or removing an option changes what compatible harnesses offer. Discovery can show IDs available at the endpoint. Only saved options appear in New Agent. |
| In-harness models | The harness supplies the model options available under its current subscription or harness API key. | Use the list the CLI itself offers, such as its terminal model picker. **CLI default** delegates the model choice to the harness. |

A **harness API key** is supplied to and managed by the CLI. Ronin never receives it. A **private API key** (short form **private key**) is supplied to Ronin and stored for a model service connection. The same API vendor can support either arrangement.

## From Settings to an API request

1. In **Settings → Harnesses and models**, configure the service connection. A private connection records the provider, endpoint, API protocol and credential. Settings returns connection details and model choices to the UI with the credential value omitted.
2. On the service page, inspect the Gateway list or edit the named options for OpenRouter or a private API. For example, a user could name an option “Fast” and set its model ID to `vendor/model-a`. The name is what the person reads. The ID is what the endpoint receives.
3. In the planned **Hermes harness settings**, choose which compatible model services and model options New Agent shows when Hermes is selected. For example, select OpenRouter for Hermes and leave Ronin Gateway unselected for Hermes. Gateway can still be configured on the machine and selected separately for another harness. In **Codex harness settings**, the in-harness model options come from Codex’s own list. If Codex offers Astra and Sol, those are Codex in-harness model options. Each harness has its own New Agent display preferences (w1029).
4. At launch the harness adapter resolves the selected option to its connection, credential, protocol and API model ID. Compatibility depends on the adapter. Hermes supports Chat and Responses, Codex supports Responses, and OpenCode supports Chat. A new harness needs an adapter for the protocol it will use.

**Campaign defaults** select the starting choices that Workspaces, Teams and Agents inherit. Model services supply their model options. Each harness supplies its own in-harness model options. Personal accounts and office rentals belong in the Business Lounge.

## How Irasshai chooses

For a fresh launch, Irasshai tries these routes in order.

1. A configured Ronin Gateway with a reachable endpoint and a selectable Gateway model. If the Gateway offers a model ID called `default`, Irasshai prefers it.
2. A configured personal-key connection with a selectable named option. This includes OpenRouter. An API key alone supplies no launch choice.
3. A signed-in CLI with a selectable native route.

The Gateway reachability check opens a TCP connection. A listening endpoint can still reject the subsequent API request. This order describes selection before launch.

## Checking a change end to end

Read `GET /api/model-services` to see each connection's `service_type`, discovered IDs and launchable named options (`models`). Follow the connection ID into the harness catalog, change the model services shown for that harness in Setup and reopen New Agent, and check the empty-list case. At the request boundary, verify the endpoint, protocol and exact model ID with a fixture credential. A cached Gateway list alone cannot verify the live Gateway or HQ catalog.

The implementation walkthrough and regression coverage start in [the model service record](../../src/model-services.ts), [the harness catalog](../../src/model-providers.ts), [the launch adapters](../../src/model-service-launch.ts) and [the model services tests](../../tests/model-services.test.ts). The native CLI extension contract lives in [Model providers](model-providers.md).
