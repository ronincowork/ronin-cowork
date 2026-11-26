# Model services

A model service is a connection Ronin uses to call a model API. A harness is the CLI that runs the Agent. A **model option** is the named choice shown in New Agent. An **API model ID** is the identifier sent to a model service when that option is used. For a private API connection, the user supplies the private API key and defines each model option on that connection. Separately, in the settings for a specific harness, the user chooses which compatible model services and model options New Agent should show for that harness. Two harnesses can use the same connection and named models. Two connections can each have a model called “Fast” and send requests to different endpoints.

## Who supplies the model choices?

| Model service or in-harness models | Who supplies the names in New Agent? | What changes the list? |
|---|---|---|
| Ronin Gateway | Ronin Gateway supplies a display name, API model ID, tier and “use it for” line. For a Gateway response or cache entry with only an ID, Ronin displays the ID. | The machine reads the Gateway list at startup and on refresh. A successful refresh replaces the cached list. An ID removed upstream disappears from new choices after that refresh. When Ronin Gateway is unreachable, New Agent can still display the cached list. |
| OpenRouter | HQ can publish starters. The user can also name models for their OpenRouter connection. | HQ publishes the display name and exact OpenRouter ID in its Admin Models table, delivered to the machine in `office_unit/models.json` as its `openrouter_starters` list. Ronin seeds eligible starters once per connection, using the IDs available to its key. The user can then add, rename or remove options. Refreshing preserves those edits. |
| Private API key | The user names each option and enters the exact API model ID on that connection. | Saving or removing an option changes what compatible harnesses offer. Discovery can show IDs available at the endpoint. Only saved options appear in New Agent. |
| In-harness models | The harness supplies the model options available under its current subscription or harness API key. | The refreshed CLI list determines membership and launch IDs. HQ Admin can edit the display name for a matching CLI and ID. Without an HQ name, Ronin uses the CLI’s name. **Native** delegates the model choice to the harness. |

Ronin Gateway is a model service only. New Agent lists harnesses; the Gateway never appears beside them. It works with Codex and Hermes, and its list begins with the tier options the Gateway supplies. A model service starts shown on every harness it works with, until that harness's settings narrow or hide it.

A **harness API key** is supplied to and managed by the CLI. Ronin never receives it. A **private API key** (short form **private key**) is supplied to Ronin and stored for a model service connection. The same API vendor can support either arrangement.

## From Settings to an API request

1. In **Settings → Harnesses and models**, configure the service connection. A private connection records the provider, endpoint, API protocol and credential. Settings returns connection details and model choices to the UI with the credential value omitted.
2. On the service page, inspect the Gateway list or edit the named options for OpenRouter or a private API. For example, a user could name an option “Fast” and set its model ID to `vendor/model-a`. The name is what the person reads. The ID is what the endpoint receives.
3. In **Hermes harness settings**, choose which compatible model services and model options New Agent shows when Hermes is selected. For example, select OpenRouter for Hermes and leave Ronin Gateway unselected for Hermes. Gateway can still be configured on the machine and selected separately for another harness. In **Codex harness settings**, the in-harness model options come from Codex’s own list. If Codex offers Astra and Sol, those are Codex in-harness model options. New Agent shows Harness and Model. All options are shown by default for each eligible model service except Ronin Gateway, which requires selection in that harness’s settings. Native launches without a model argument. A named in-harness option passes the chosen ID to the CLI.
4. At launch the harness adapter resolves the selected option to its connection, credential, protocol and API model ID. Which harnesses can use a model service is a technical fact the service reports, worked out from its API protocol and never ticked: Hermes speaks Chat and Responses, Codex speaks Responses, OpenCode speaks Chat, and Claude Code uses no model service. A new harness needs an adapter for the protocol it will use. Which of those services and model options a harness shows is set only in that harness's settings.

**Campaign defaults** select the starting choices that Workspaces, Teams and Agents inherit. Model services supply their model options. Each harness supplies its own in-harness model options. Personal accounts and office unit rentals belong in the Business Lounge.

## A launch with no default

When nothing names a harness and model, Ronin takes the first step that works. Each step is a harness, a model service and a model.

| Step | Harness | Model service | Model |
|---|---|---|---|
| CLI | the default's harness, else the first signed in | its own sign-in | CLI default |
| Gateway | Codex, else Hermes | Ronin Gateway | `default`, the office's tier |
| Private API | Codex, else Hermes | a private API | the first model option that harness shows |
| OpenRouter | Codex, else Hermes | OpenRouter | the first model option that harness shows |

- **An Agent with no default set** walks CLI, Gateway, Private API, OpenRouter. The first CLI sign-in is still written as the default, so this is reached when nothing is signed in.
- **Irasshai** always walks Gateway, Private API, OpenRouter, CLI.

A service step needs an installed harness that works with the service and shows it in its settings. Working means signed in, key present, or the Gateway answering on its port; no test request is made, so a listening Gateway can still reject the call. The progression writes nothing. It lives in [the launch progression](../../src/launch-progression.ts).

## When Ronin Gateway can't be used

Ronin keeps what the Gateway's last model-list read found, as the service's `status`. The list is read at start-up and on Refresh, never on a timer.

| Status | The read found | What the person sees |
|---|---|---|
| ready (no status) | the list, not stopped | Gateway options as usual |
| `stopped` | the list with `stopped: true`: the office's house models are stopped, allowance used up or no plan | Gateway options greyed in New Agent, pointing to the Business Lounge |
| `token_rejected` | HTTP 401 | Gateway options greyed: the gateway rejected the office's token |
| `unreachable` | no answer, or any other failure | Gateway options greyed: the gateway could not be reached |

The Model services card shows the same line. The status informs and blocks nothing: no launch is refused by it, and a launch with no default takes its next step, since a greyed option is not selectable. A running Agent that meets a stopped gateway shows the gateway's own line in its terminal.

## Checking a change end to end

Read `GET /api/model-services` to see each connection's `service_type`, discovered IDs and launchable named options (`models`). Follow the connection ID into the harness catalog, change the model services shown for that harness in Setup and reopen New Agent, and check the empty-list case. At the request boundary, verify the endpoint, protocol and exact model ID with a fixture credential. A cached Gateway list alone cannot verify the live Gateway or HQ catalog.

The implementation walkthrough and regression coverage start in [the model service record](../../src/model-services.ts), [the harness catalog](../../src/harness-catalog.ts), [the launch adapters](../../src/model-service-launch.ts) and [the model services tests](../../tests/model-services.test.ts). The native CLI extension contract lives in [Model providers](harness-catalog.md).
