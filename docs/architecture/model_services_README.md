# Model services

A model service is the connection an office uses to call a model API. A harness is the CLI that runs the Agent. In New Agent, choose a harness, a compatible model service, and then a model from that connection. Two harnesses can use the same connection and named models. Two connections can each have a model called “Fast” and send requests to different endpoints.

## Who supplies the model choices?

| Source | Who supplies the names in New Agent? | What changes the list? |
|---|---|---|
| Ronin Gateway | The office Gateway supplies the model IDs. Each ID is also its visible name. | The machine reads the Gateway list at startup and on refresh. A successful refresh replaces the cached list. An ID removed upstream disappears from new choices after that refresh. An offline office can still display its last successful list. |
| OpenRouter | HQ can publish starters. The office user can also name models for their OpenRouter connection. | HQ publishes the display name and exact OpenRouter ID in its Admin Models table, delivered to the office in `office_unit/models.json` as rows with `cli: openrouter`. The office seeds eligible starters once per connection, using the IDs available to its key. The user can then add, rename or remove options. Refreshing preserves those edits. |
| Private API key | The office user names each option and enters the exact API model ID on that connection. | Saving or removing an option changes what compatible harnesses offer. Discovery can show IDs available at the endpoint. Only saved options appear in New Agent. |
| CLI sign-in | The CLI supplies its native model choices through its own authentication. | The machine reads the CLI's provider summary. A native launch uses the CLI's own credentials and model selection. |

## From Settings to an API request

1. In **Settings → Harnesses and models**, configure the service connection. A private connection records the provider, endpoint, API protocol and credential. Settings returns connection details and model choices to the UI with the credential value omitted.
2. On the service page, inspect the Gateway list or edit the named options for OpenRouter or a private API. For example, an office could name an option “Fast” and set its model ID to `vendor/model-a`. The name is what the person reads. The ID is what the endpoint receives.
3. In **Setup → Harnesses** or **New Agent**, selecting a service scopes the list to that connection. Switching services clears the previous model selection in New Agent. An OpenRouter connection with six saved options offers those six. With zero it offers none, and the user must choose another route or configure a model before launching through it.
4. At launch the harness adapter resolves the selected option to its connection, credential, protocol and API model ID. Compatibility depends on the adapter. Hermes supports Chat and Responses, Codex supports Responses, and OpenCode supports Chat. A new harness needs an adapter for the protocol it will use.

**Campaign defaults** select the starting choices that Workspaces, Teams and Agents inherit. The model names themselves belong to the service. Personal accounts and office rentals belong in the Business Lounge.

## How Irasshai chooses

For a fresh launch, Irasshai tries these routes in order.

1. A configured Ronin Gateway with a reachable endpoint and a selectable Gateway model. If the Gateway offers a model ID called `default`, Irasshai prefers it.
2. A configured personal-key connection with a selectable named option. This includes OpenRouter. An API key alone supplies no launch choice.
3. A signed-in CLI with a selectable native route.

The Gateway reachability check opens a TCP connection. A listening endpoint can still reject the subsequent API request. This order describes selection before launch.

## Checking a change end to end

Read `GET /api/model-services` to see each connection's `service_type`, discovered IDs and launchable named options (`models`). Follow the connection ID into the harness catalog, switch between two services in New Agent, and check the empty-list case. At the request boundary, verify the endpoint, protocol and exact model ID with a fixture credential. A cached Gateway list alone cannot verify the live Gateway or HQ catalog.

The implementation walkthrough and regression coverage start in [the model service record](../../src/model-services.ts), [the harness catalog](../../src/model-providers.ts), [the launch adapters](../../src/model-service-launch.ts) and [the model services tests](../../tests/model-services.test.ts). The native CLI extension contract lives in [Model providers](model-providers.md).
