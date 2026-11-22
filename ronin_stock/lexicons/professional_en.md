# professional_en
The floor. Every key a surface reads is here, in plain English, so a lexicon that says
nothing paints exactly this.

- **label:** Professional
- **blurb:** The plain words. Every other lexicon falls through to these.
- **desk_profile:** desk profile
- **campaign:** Desk
- **campaigns:** Desks
- **add_agent.name:** name
- **add_agent.name_placeholder:** name
- **add_agent.instruction:** instruction
- **add_agent.instruction_placeholder:** what this Agent should do
- **add_agent.starting:** Starting…
- **add_agent.started:** Started {name}
- **add_agent.started_note:** Started {name} — {note}
- **add_agent.team:** team
- **add_agent.place:** place
- **add_agent.still_asked:** still asked
- **installations:** Installations
- **defaults:** Defaults
- **campaign.name:** Desk name
- **campaign.name_placeholder:** Ronin Home
- **campaign.description:** Description
- **campaign.description_placeholder:** What this desk is for
- **campaign.coworks:** Teams
- **campaign.new:** New Desk
- **campaign.create:** Create Desk
- **campaign.saving:** saving…
- **campaign.name_needed:** A Desk needs a name.
- **squad:** Team
- **team_kit:** Shared toolkit
- **loadout:** Behaviors
- **behaviours:** Behaviors
- **mandate:** Mandate
- **session_type:** Session type
- **kind:** Kind
- **reach:** Reach
- **recruit:** Recruit
- **output:** Output
- **on:** On
- **off:** Off
- **go:** Go
- **publish:** Publish
- **kind.coding:** Software
- **kind.household:** Home
- **kind.personal:** Personal
- **kind.work:** Work
- **kind.social:** Events
- **kind.school:** Learning
- **kind.open:** Open

## desk — system.js (the ⚙ desk's own rooms: appearance, the updater, the account)
- **desk.row_release:** Release & update
- **desk.rail_collapse:** Collapse the rail
- **desk.rail_expand:** Expand the rail
- **desk.group_install:** This install
- **desk.passkeys:** passkeys
- **desk.passkey_name_placeholder:** this device
- **desk.passkey_name:** passkey name
- **desk.add_passkey:** Add a passkey
- **desk.add_passkey_title:** Register this device — Touch ID, Face ID or a security key
- **desk.no_passkeys:** none registered — this device can be the first.
- **desk.passkey_elsewhere:** (registered on {rp} — not usable from this address)
- **desk.remove:** Remove
- **desk.remove_named:** Remove {name}
- **desk.removed:** removed
- **desk.recovery_outstanding:** a recovery code is outstanding until {time}
- **desk.passkeys_predate:** this operator predates passkeys — its next restart carries the routes
- **desk.passkey_needs_https:** Adding a passkey needs the HTTPS address — this one is not a secure context.
- **desk.passkeys_unavailable:** Passkeys unavailable: {why}
- **desk.no_rp_name:** no relying-party name
- **desk.waiting_authenticator:** waiting for the authenticator…
- **desk.passkey_added:** ✓ passkey added
- **desk.cancelled:** cancelled
- **desk.yours_shadowing:** yours (replaces ours)
- **desk.yours:** yours
- **desk.profile_stock:** Stock
- **desk.profile_stock_blurb:** No profile — the look, the words and the tile as shipped.
- **desk.profile_not_saved:** desk profile not saved — {message}
- **desk.check_updates:** Check for updates
- **desk.check_updates_title:** Ask the release feeds what the latest versions are — both packages, only when pressed
- **desk.log_out:** Log out
- **desk.log_out_title:** End this device’s session — the next visit asks for the password
- **desk.unreachable:** unreachable
- **desk.no_version_answer:** the operator did not answer /api/version
- **desk.release_detail:** release · built from {commit} · contract {contract} · started {started}
- **desk.dirty:** (dirty)
- **desk.checkout_detail:** a dev checkout, not a release — updated by git, not by the button · started {started}
- **desk.services_list:** services: {list}
- **desk.services_none:** services: none — the free build
- **desk.updated_reloading:** ✓ updated to {release} — reloading
- **desk.update_timeout:** no new version answered after 5 minutes — journalctl --user -u "ronin-update-*" has the transcript
- **desk.services_live_reloading:** ✓ services live: {list} — reloading
- **desk.services_timeout:** services did not answer after 5 minutes — journalctl --user -u "ronin-update-*" has the transcript

## launcher — launcher.js (the ＋ New board and its form)

## roster — roster.js (the ⌂ Roster tab)
- **roster.not_saved:** not saved — {message}
- **roster.team_name:** team name
- **roster.team_name_aria:** New team name
- **roster.add_team:** ＋ Team
- **roster.team_name_rule:** use letters, digits, - or _
- **roster.drag_into:** drag a session into {team}
- **roster.leads:** 人 leads {teams}
- **roster.stale:** ⚠ roster may be stale — {fault}
- **roster.drop_here:** Drop a session here to add it to {team}
- **roster.no_team:** no team
- **roster.no_sessions:** no sessions yet

## panels — the shared Save word
- **panels.save:** Save

## commons — commons.js (the commons shell: tab strip and frame)
- **commons.tab_off:** {tab} — off, this service is not installed.

## campaign_view — campaign-view.js (Campaign Manage: the selector's Campaign-level surfaces)

- **campaign_view.roots_summary:** Each Workspace and the folders it works in.
- **campaign_view.new_summary:** Set the stage. It creates no Team and launches no Agent.
- **campaign_view.none_selected:** No Desk selected.
- **campaign_view.no_description:** No description yet.
- **campaign_view.name_help:** On the door, the browser tab and the address.
- **campaign_view.description_help:** What this body of work is for. Shown on its card.
- **campaign_view.head:** Desk: {name}
- **campaign_view.theme_desktop:** Desktop
- **campaign_view.theme_help:** Light or dark for pointer surfaces; Automatic is the house default — light.
- **campaign_view.theme_mobile:** Theme (mobile)
- **campaign_view.theme_mobile_help:** Light or dark for touch surfaces — iPad and phone; Automatic is the house default — light.
- **campaign_view.theme_light:** Light
- **campaign_view.theme_dark:** Dark
- **campaign_view.with_services:** Ronin Services
- **campaign_view.services_title:** Arrives with Ronin Services.
- **campaign_view.id:** Id
- **campaign_view.id_help:** Fixed once created — printed on every record that points here, so it cannot change.
- **campaign_view.agent_defaults:** Team and Agent defaults
- **campaign_view.defaults_help:** These defaults land in the next Team or Agent form that opens. They remain editable there; nothing live changes.
- **campaign_view.provider_default:** Default provider
- **campaign_view.model_default:** Default model
- **campaign_view.default_reach:** Reach
- **campaign_view.default_recruit:** Recruit
- **campaign_view.default_output:** Output
- **campaign_view.default_behaviours:** Behaviors
- **campaign_view.defaults_summary:** {model} · {reach}
- **campaign_view.option_open:** Open
- **campaign_view.col_provider:** Provider
- **campaign_view.col_model:** Preferred model
- **campaign_view.installations:** Installations
- **campaign_view.defaults:** Defaults
- **campaign_view.available:** Available
- **campaign_view.status_unreadable:** Status unreadable
- **campaign_view.not_installed:** Not installed
- **campaign_view.not_configured:** Not configured
- **campaign_view.installations_read_failed:** Installations could not be read. Nothing was changed; try again.
- **campaign_view.installation_status_read_failed:** Installation status could not be read. Choices are shown, but their machine status is unknown.
- **campaign_view.on:** On
- **campaign_view.off:** Off
- **campaign_view.machine_summary:** The rest of the desk: Desk · Account · Archived · Messages · Help desk · Keypad.

## jira — jira-panel.js (the Jira panel in Settings: connect, check, sync, the pairs)

- **jira.col_level:** Level
- **jira.col_kind_only:** Kind
- **jira.col_id:** Ronin
- **jira.col_item_id:** Id
- **jira.col_title:** Title
- **jira.col_status_only:** Status
- **jira.col_created:** Created in
- **jira.col_holders:** Holders
- **jira.col_key:** Jira
- **jira.goes_up:** goes up
- **jira.refresh:** Refresh
- **jira.items:** Work items by level
- **jira.check:** Check
- **jira.sync_now:** Sync now
- **jira.title:** Jira
- **jira.never:** never
- **jira.step_site:** In Jira, open the space you want Ronin on. The address bar gives the Site URL (up to .atlassian.net); the space key is the short code before every work item number (KAN in KAN-1).
- **jira.step_account:** admin.atlassian.com › your organization › Directory › Service accounts › Create a service account. Any name, 6–30 characters. On Select app roles, give Jira the role User and leave every other app at None.
- **jira.step_token:** Open the account › Create credentials › API token. Any name; expiry up to 365 days. The Review page shows the expiry date: enter it below.
- **jira.step_scopes:** Scopes: read:jira-work, write:jira-work and read:jira-user. Create, copy, and paste the token below straight away. Scopes cannot be changed later; a missing one means a new token.
- **jira.step_access:** On a Free site, nothing to do. On a paid site, in the space: Space settings › Access, add the account as Member.
- **jira.step_linking:** In Jira: Settings › Work items › Work item linking › Activate, if it is off.
- **jira.checking:** Checking…
- **jira.syncing:** Syncing…
- **jira.all_good:** Every check passes.
- **jira.synced_one:** {item} synced.
- **jira.synced:** Synced.
- **jira.saving:** Saving…
- **jira.before:** In Atlassian
- **jira.before_help:** Keep this panel open while you make the account: the token goes straight into the field below.
- **jira.connect:** Connect
- **jira.connected:** Connected, and the first sync has run.
- **jira.site:** Site URL
- **jira.site_help:** The address you open Jira at, up to .atlassian.net: https://your-site.atlassian.net. Copy it from any Jira page.
- **jira.space:** Space key
- **jira.space_help:** The space’s short code, not its name: KAN in KAN-1. Also in Space settings › Details.
- **jira.token:** API token
- **jira.token_help:** Kept by Ronin with Services; never shown again.
- **jira.expiry:** Token expiry
- **jira.expiry_help:** No call returns it: the date from the Review page.
- **jira.connect_warning:** Connect puts on the space, labelled ronin-do and unassigned, what Ronin’s items says: nothing (Off), epics and everything under them, or every work item. Then, in Jira, assign one work item to the account or label it ronin-do, and press Sync now.
- **jira.connection:** Connection
- **jira.account:** Account
- **jira.renew:** The token expires in {n} days. Make a new one (steps 3–4), paste it here, then revoke the old one.
- **jira.replace_token:** Replace token
- **jira.token_replaced:** Token replaced.
- **jira.new_token:** New API token
- **jira.disconnect:** Disconnect
- **jira.disconnect_confirm:** Disconnect this Desk from Jira? Every pair drops; nothing is deleted on either side.
- **jira.disconnected:** Disconnected.
- **jira.sync:** Sync
- **jira.last_check:** Last check
- **jira.pair_count:** Pairs
- **jira.waiting:** Waiting to go up
- **jira.sync_failed:** Sync failed
- **jira.pairs:** Pairs
- **jira.pairs_n:** {n} pairs
- **jira.filter:** Filter: key, id, title, status, holder
- **jira.col_kind:** Level · kind
- **jira.col_started:** Started in
- **jira.col_flagged:** Flagged
- **jira.col_last_in:** Last in
- **jira.col_last_out:** Last out
- **jira.col_waiting:** Waiting
- **jira.resync:** Re-sync
- **jira.flagged:** Flagged
- **jira.filter_label:** Filter
- **jira.how:** How it runs
- **jira.polling:** Polling
- **jira.polling_text:** Down, Jira → Ronin: Jira is read every minute while Ronin is open in a browser, hourly otherwise; off, only Sync now reads it.
- **jira.assigned:** Assigned items
- **jira.assigned_text:** Up, Ronin → Jira: changes to items that came from Jira go out to Jira; off, they stay in Ronin.
- **jira.ronin:** Ronin’s items
- **jira.ronin_off:** Off
- **jira.ronin_off_sub:** Nothing made in Ronin goes up.
- **jira.ronin_epics:** Under an epic
- **jira.ronin_epics_sub:** Epics and everything under them go up; items with no epic stay in Ronin.
- **jira.ronin_all:** All
- **jira.ronin_all_sub:** Every item made in Ronin goes up.
- **jira.ronin_text:** Up, Ronin → Jira: items made in Ronin are created on Jira and their changes go out: none, those under an epic, or all. Widening it sends what newly qualifies, parents first.
- **jira.how_master:** Services › Jira
- **jira.how_master_text:** the master switch, in Installations; off, nothing moves.
- **jira.saved:** Saved.
- **jira.how_sync:** Sync now
- **jira.how_sync_text:** always reads: the space checked, one read, what is waiting sent, and the deleted-item check.
- **jira.items_n:** {n} items · {p} paired
- **jira.items_connected:** On Jira, the key; not yet, goes up if How it runs sends it, else stays in Ronin.
- **jira.items_preview:** What Connect will put on the space, labelled ronin-do and unassigned, under How it runs as set now.
- **jira.open_items:** Open
- **jira.open_pairs:** Open
- **jira.off:** Services › Jira is off for this Desk. Turn it on in Installations › Ronin Services, then come back here.
- **jira.card_summary:** This Desk’s Jira space: connect, check, sync.
- **jira.stays:** stays in Ronin
- **jira.items_counts:** {on} on Jira · {go} to go · {stay} stay in Ronin
- **jira.checking_text:** Checking the site, the account, the space and its permissions.
- **jira.syncing_one:** Syncing {item} with Jira.
- **jira.syncing_text:** Checking the space, reading Jira, sending what is waiting, then checking for deleted work items.
- **jira.connecting:** Connecting…
- **jira.connecting_text:** Checking the account, then sending {n} items, then the first read.
- **jira.replacing_text:** Checking the new token, then the first read.
- **jira.widening_text:** Saving, then sending {n} items.
- **jira.items_filtered:** {n} hidden by a filter
- **jira.refreshing:** Refreshing…
- **jira.refreshing_text:** Reading the work items and the Jira connection again.
- **jira.refreshed:** Refreshed at {at}.

## campaign_home — campaign-home.js (the root arrival: Machine Settings, Teams, Launch)

- **campaign_home.ronin_home:** Ronin Home
- **campaign_home.launch:** New Project
- **campaign_home.settings:** Settings
- **campaign_home.check_updates:** Check for updates
- **campaign_home.agent_harness:** Agent Harness
- **campaign_home.agent_harness_is:** The CLIs on this machine, the accounts they launch on, and the models
- **campaign_home.settings_is_hosted:** This Desk’s settings
- **campaign_home.business_lounge:** Business Lounge
- **campaign_home.business_lounge_is:** Your account, office and subscription, at Ronin HQ
- **campaign_home.side_hosted:** Models, Help, Settings and the Business Lounge
- **setup.provider_gate:** Activate one model provider in Setup or Agent Harness to use this.
- **setup.provider_gate_hosted:** Activate one model provider in Agent Harness to use this.
- **setup.open_settings:** Open Ronin Settings
- **setup.open_setup:** Open Ronin Setup
- **setup.irasshai_open:** Helpful Assistant
- **setup.irasshai_open_title:** Your welcome Agent: start here
- **setup.irasshai_here:** Here, in Assist
- **setup.irasshai_opening:** Opening…
- **setup.irasshai_failed:** Couldn’t open the Helpful Assistant

## harness — models-surface.js, workbench-catalog.js (the Agent Harness workbench's stones and Refresh; KAN-236)

- **harness.stones:** Harness
- **harness.stones_summary:** The CLIs: install, sign in, ready
- **harness.refresh:** Refresh
- **harness.refresh_summary:** One press: harnesses, accounts
- **harness.step_harnesses:** Harnesses
- **harness.step_harnesses_detail:** Each activated CLI: its version, the newest release, and its own model list. Only these models can launch on a subscription.

## accounts — accounts-surface.js, account-editors.js (the Accounts tilespace and the forms every page shares; KAN-236)

- **accounts.title:** Accounts
- **accounts.card_summary:** Personal API · Ronin API: which harnesses, which models
- **accounts.lede:** Accounts a harness can launch on, apart from its own sign-in. A key added here, or on a harness page, is one record; the harnesses it serves and the models it offers are yours to tick.
- **accounts.kind_subscription:** Subscription
- **accounts.kind_personal_api:** Personal API
- **accounts.kind_ronin_api:** Ronin API
- **accounts.ronin_api_name:** Ronin API
- **accounts.ronin_api_note:** From Ronin Cloud onboarding, or the house gateway running on this machine. Usage is stamped by the gateway.
- **accounts.add_title:** Add {kind}
- **accounts.edit_title:** Edit {kind}
- **accounts.field_name:** Name
- **accounts.field_vendor:** API provider
- **accounts.field_url:** Base URL
- **accounts.field_wire:** Wire API
- **accounts.field_key:** API key
- **accounts.field_key_keep:** API key (leave blank to keep)
- **accounts.field_endpoint:** Gateway endpoint
- **accounts.field_token:** House token
- **accounts.field_token_keep:** House token (leave blank to keep)
- **accounts.vendor_openai:** OpenAI API
- **accounts.vendor_mistral:** Mistral API
- **accounts.vendor_custom:** OpenAI-compatible API
- **accounts.wire_chat:** Chat Completions
- **accounts.wire_responses:** Responses
- **accounts.save:** Save
- **accounts.cancel:** Cancel
- **accounts.add_personal_api:** Add Personal API
- **accounts.add_ronin_api:** Add Ronin API
- **accounts.add_token:** Add token
- **accounts.discover:** Discover
- **accounts.edit:** Edit
- **accounts.remove:** Remove
- **accounts.serves:** Serves
- **accounts.offers:** Offers
- **accounts.offers_dated:** Offers · discovered {date}
- **accounts.discover_first:** Press Discover to read this endpoint’s model list.
- **accounts.no_binding:** no binding yet
- **accounts.seeded:** add a token to use it
- **accounts.configured:** Configured
- **accounts.key_missing:** Key missing
- **accounts.models_n:** {n} models · {m} offered
- **accounts.not_discovered:** Models not discovered
- **accounts.none_yet:** None yet
- **accounts.step_detail:** Each Personal API and Ronin API account is asked for its list; you tick what it offers on Accounts.
- **accounts.missing_account:** Missing account
- **accounts.approvals_off:** YOLO — approvals off
- **accounts.approvals_off_short:** YOLO
- **accounts.approvals_prompt:** Ask for approval
- **accounts.reasoning_default:** Provider default
- **accounts.preset_add:** Add preset
- **accounts.preset_edit:** Edit preset
- **accounts.preset_name:** Name shown under Model
- **accounts.preset_account:** Account
- **accounts.preset_model:** Model
- **accounts.preset_reasoning:** Reasoning effort
- **accounts.preset_approvals:** Approvals

## models — models-records-surface.js, models-surface.js (the Models tilespace; KAN-236)

- **models.records:** Models
- **models.records_summary:** Offered · presets · defaults
- **models.offered:** Offered per account
- **models.offered_none:** No accounts yet. Add one on Accounts or on a harness page.
- **models.presets:** Presets
- **models.presets_lede:** A preset names harness, account, model and knobs; it appears under Model in New Agent. Today every preset is a Hermes named setup.

## launch — launch-view.js (the Workbench where Teams and Agents begin)

- **launch.new_team:** New Team
- **launch.new_team_summary:** Define a Team, then launch its Agents.
- **launch.new_agent:** New Agent
- **launch.new_agent_summary:** Start an Agent in a Team or on its own.
- **forms.launch:** Launch
- **launch_mode.head:** launch mode
- **launch_mode.mode:** Mode
- **launch_mode.configured:** Native
- **launch_mode.configured_sub:** Do not override the provider CLI’s approval behavior. Model selection is separate.
- **launch_mode.live:** Dangerously
- **launch_mode.live_sub:** Use that provider CLI’s own approval-bypass launch.
- **help.title:** Help
- **help.card_summary:** What each step means, beside the step you are on.
- **help.top_body:** The name is the only thing you must give, and it is also the tag every session carries, so it is lowercase and typeable — the field enforces that as you type. A Team’s title is written for you from the name and is yours to change. The kind says what this is for, and it narrows the templates below to the ones that suit it.
- **help.mandate_body:** How far this Agent goes before it checks in, whether it may build out a team, and what it hands back. Output takes as many answers as you mean — a plan AND the team AND no code — and nothing argues with a combination. Open means no requirement. None of it is enforced: the mandate is carried in the Agent’s letter and read by it, not imposed on it.
- **help.loadout_body:** Model and Launch mode are independent. Native means no override in that field; only Native model plus Native launch mode is the bare CLI command. Features add facilities or taught practices; behaviours say how ordinary work should be done.
- **help.agents:** Agents
- **help.agents_body:** The Agents this Team is raised with. A row is short on purpose — a name and what that Agent does — and opens for its mandate when you want it. 人 marks the lead; this form offers one, though a running Team may gain more. Raising creates the Team and then births every named row, the lead last. A Team with no rows is ordinary and raises fine.
- **help.behaviours:** What a Behavior is
- **help.behaviours_body:** Behaviors are specific guidance given to Agents at birth. Team Work and Working with the User are selectable; Write it Down, All Cowork Agents and Conditional Behaviors are applied by Ronin when their rules match.
- **help.type:** New session
- **help.type_body:** Three kinds of thing can start here. A Cowork Agent is born with everything Ronin provides on this box. A bare-metal Agent is the provider’s own CLI and nothing else. A terminal is a shell with no agent. The choice decides which of the steps below exist — a terminal is asked three things because there are only three to ask.
- **help.top:** Name & kind
- **help.objective:** Common instructions
- **help.objective_body:** What everyone born onto this Team is told. The objective reaches them: it is written into the brief every new Agent reads at birth, in the Team’s own words.
- **help.instructions:** Instructions
- **help.instructions_body:** What this one Agent should do, in your words. It arrives as the first thing it reads.
- **help.team:** Team
- **help.team_body:** A new team is made first and the Agent is born into it. Joining an existing one lands that team’s answers in this form, which you can then change. No team is ordinary — a rōnin works alone and nothing is missing.
- **help.where:** Who and where
- **help.where_body:** The provider and model that open, and the folder they open in. The folder is where work starts, not a fence: an Agent reaches whatever it is asked to reach. A Team’s branch is the line its Agents hand work in to, and the lead promotes from it; blank means the Team’s own line.
- **help.mandate:** Mandate
- **help.loadout:** Behaviors
- **help.kit:** Shared toolkit
- **help.kit_body:** What every Agent raised on this Team starts with. All of it lands in the next Agent form as an ordinary editable value — none of it is a constraint, and changing it here never touches a session already running.
- **new_team.who_where:** Who and where
- **new_team.agents:** Agents
- **new_team.agent_name:** name
- **new_team.agent_name_taken:** Nothing was created. Choose another name for: {names}.
- **new_team.agent_add:** ＋ Add an Agent
- **new_team.readable:** Title

## home — home.js (the status words and the launch receipt)
- **home.stance_working:** working…
- **home.stance_awaiting_you:** awaiting you
- **home.stance_asking:** asking you
- **home.stance_no_progress:** no progress for 12 min

## settei — settei.js (the ⚙ Configuration tab)
- **settei.saving:** saving…
- **settei.saved:** saved
- **settei.none_set:** — none set —
- **settei.pick_model:** choose a model to save
- **settei.unset_using:** unset — using {value}
- **settei.blurb:** What this install is set to — and what it is running on.
- **settei.measured:** measured {time}
- **settei.group_you:** you and this machine
- **settei.group_campaign:** campaign
- **settei.hardware:** hardware
- **settei.virtual:** virtual
- **settei.physical:** physical
- **settei.cores_ram:** {cores} cores · {ram} GB
- **settei.running:** running
- **settei.os_node:** {os} · node {node}
- **settei.release_contract:** {release} · contract {contract}
- **settei.reachable_at:** Ronin reachable at
- **settei.reach_secure:** {exposure} · HTTPS by tailscale serve · plain {at}
- **settei.reach_alias:** · or {alias} (MagicDNS)
- **settei.reach_ssh:** reach by ssh
- **settei.group_capacity:** capacity
- **settei.group_models:** how work gets a model
- **settei.key_set:** ✓ set
- **settei.key_not_set:** not set
- **settei.key_presence:** presence only — the value stays in .env
- **settei.weights_downloaded:** ✓ downloaded
- **settei.weights_size:** {mb} MB · koshi_weights store
- **settei.local_weights:** local weights
- **settei.weights_none:** none downloaded
- **settei.group_agents:** agent installations
- **settei.agents_hint:** a tick means it is on the box — tick an empty one to put it on the needed list
- **settei.installed:** installed
- **settei.not_installed_tick:** not installed — tick to put it on the needed list
- **settei.group_services:** services
- **settei.ronin_services:** Ronin Services
- **settei.group_subscription:** subscription
- **settei.services_activation:** Services activation
- **settei.group_needed:** still needed
- **settei.needed_nothing:** nothing
- **settei.needed_satisfied:** your choices are satisfied
- **settei.setup_go:** start your setup session
- **settei.setup_started:** setup session started — see ⌂ Roster
- **settei.setup_failed:** could not start
- **settei.reading:** reading…

## new_team / team — new-team.js (the New Team surface; team.* rows are shared by the Team page family)
- **new_team.name:** Team name
- **team.objective:** Objective
- **team.project_root:** Workspace folder
- **team.team:** Team
- **new_team.name_invalid:** Lowercase letters, digits, _ and - only.
- **new_team.root_default:** — the box’s default —
- **new_team.title:** New Team

## new_team — new-team-form.js (the drawn raise form, staged beside the card above)
- **new_team.card_summary:** Kind · kit · lead — the drawn form.
- **new_team.kind_summary:** Optional — Kind
- **new_team.name_placeholder:** lowercase, digits, - _
- **new_team.objective_placeholder:** what this team is for
- **new_team.members:** members
- **new_team.members_note:** derived from live tags — never stored here
- **new_team.inherits:** an agent born here inherits
- **new_team.staffing_failed:** Team created, but {failed} of {total} Agents could not be launched: {names}. Open the Team and add them there.
- **new_team.raising:** Raising the team…

## forms — form-steps.js (the drawn form idiom shared by New Team and New Agent)
- **forms.default:** default
- **ask.answer:** Answer
- **setup_surface.identity_short:** Register as
- **setup_surface.kind_short:** You use Ronin for
- **setup_surface.preferred_feature_short:** Capability
- **setup_surface.reasons_short:** Describes you
- **setup_surface.run_location_short:** Install on
- **ask.none:** None
- **ask.chosen:** {n} chosen
- **ask.find:** type to find
- **ask.nothing:** Nothing to choose.
- **ask.after:** Choose {field} first.
- **yes:** Yes
- **no:** No
- **forms.required:** Required
- **forms.reason_not_on_machine:** not on this machine
- **forms.reason_turned_off:** turned off
- **forms.provider_off:** {name} — not on this machine
- **forms.model_word:** {model} · {tier}
- **forms.model_off:** {model} · {tier} — not on this machine
- **forms.tier_light:** light
- **forms.tier_standard:** standard
- **forms.tier_frontier:** frontier
- **forms.provider:** model provider
- **forms.model:** model
- **forms.none:** —
- **forms.on:** On
- **forms.off:** Off

## new_agent — new-agent.js (the drawn launch form, staged beside the ＋ New board)
- **new_agent.title:** New Agent
- **new_agent.model_package:** Model
- **new_agent.defaults_cascade_team:** Defaults cascade from Desk → Workspace → Team → this Agent. Changes on this form apply only to this Agent.
- **new_agent.defaults_cascade_desk:** Defaults cascade from Desk → this Agent. Changes on this form apply only to this Agent.
- **new_agent.team_defaults:** Team defaults
- **new_agent.desk_defaults:** Desk defaults
- **new_agent.card_summary:** Session type first — the drawn launch form.
- **new_agent.type_cowork:** Cowork Agent
- **new_agent.type_cowork_sub:** Born with Ronin capabilities, behaviors, and assigned Team.
- **new_agent.type_bare:** Bare-metal Agent
- **new_agent.type_bare_sub:** The provider’s agent and nothing else.
- **new_agent.type_terminal:** Terminal
- **new_agent.type_terminal_sub:** A raw tmux pane, no agent launched, and nothing sent to it.
- **new_agent.name_placeholder:** name
- **new_agent.bare_note:** A bare-metal Agent takes no kind, no mandate and no loadout.
- **new_agent.instructions:** Instructions
- **new_agent.team_none:** No team (rōnin)
- **new_agent.team_none_sub:** Ordinary, not a gap.
- **new_agent.team_new:** New team
- **new_agent.team_new_sub:** Created first, then this Agent is born into it.
- **new_agent.team_current:** Current team
- **new_agent.team_current_sub:** Choose from your teams.
- **new_agent.which_team:** Which team
- **new_agent.session:** session
- **new_agent.created_first:** (created first)
- **new_agent.blank_note:** A blank field is an answer, not a gap.
- **new_agent.make_team_lead:** Make team lead
- **new_agent.team_lead:** Team lead

## team_wipeboard — team-wipeboard.js (the team wipeboard channel on the Team page)
- **team_wipeboard.placeholder:** say something to the team — every member is interrupted
- **team_wipeboard.post:** Post
- **team_wipeboard.no_notice:** → (no notice)
- **team_wipeboard.cleared:** … earlier posts have cleared
- **team_wipeboard.empty:** Nothing on the board right now — posts clear after 48 hours.
- **team_wipeboard.post_failed:** Could not post — {message} (your text is still in the box)
- **team_wipeboard.no_team:** No Team resolved — nothing to read.

## team — team-view.js (the Team page)
- **work_items.title:** Work Items
- **work_items.refresh:** Refresh Work Items
- **work_items.loading:** Loading Work Items…
- **work_items.failed:** Could not load Work Items.
- **work_items.unavailable:** Unavailable.
- **work_items.no_epic:** No epic
- **work_items.flagged:** flagged
- **work_items.priority:** Priority
- **work_items.holder:** Holder
- **work_items.nobody:** nobody
- **work_items.parent:** Parent
- **work_items.comments:** Comments
- **work_items.attachments:** Attachments
- **plans.attachment:** Plan {name}
- **plans.gone:** {name} · gone
- **plans.gone_hint:** gone
- **work_items.links:** Links
- **work_items.history:** History
- **work_items.status:** Status
- **work_items.objective:** Objective
- **work_items.details:** Details
- **work_items.moving:** Moving…
- **work_items.move_failed:** The status did not change.
- **work_items.subtasks:** Subtasks
- **work_items.team_held_by:** Team {team} (lead {lead})
- **work_items.team_held:** Team {team}
- **work_items.workspace_held:** Workspace {workspace}
- **work_items.id:** Id
- **work_items.kind:** Kind
- **work_items.origin:** Started in
- **work_items.from_jira:** from Jira ({who})
- **work_items.from_ronin:** Ronin ({who})
- **work_items.handed_in:** Handed in
- **work_items.handed_in_by:** Handed in by {who} {at}
- **work_items.on_team_line:** on team line
- **work_items.with_lead:** with the lead
- **work_items.promoted_at:** promoted to dev {at}
- **work_items.live:** live
- **work_items.comment_one:** comment
- **work_items.comment_many:** comments
- **work_items.done_n:** Done ({n})
- **work_items.count:** {n}
- **work_items.comment_box:** Add a comment
- **work_items.comment_send:** Comment
- **work_items.comment_sending:** Sending…
- **work_items.comment_failed:** The comment was not added.
- **work_items.comment_told:** Added; sent to {names}.
- **work_items.comment_nobody:** Added. No Agent holds this item, so nobody was sent it.
- **work_items.checkout:** Assign to agent
- **work_items.checkout_to:** To
- **work_items.checkout_meta:** Copies it into live work
- **work_items.checkout_pick:** Pick an Agent or a Team.
- **work_items.checking_out:** Assigning…
- **work_items.checked_out:** Assigned as {id}.
- **work_items.checkout_failed:** It was not assigned.
- **work_items.team_named:** Team {name}
- **work_items.playbook_make_mine:** Customize
- **work_items.playbook_make_mine_meta:** Saved as yours, over Ronin’s
- **work_items.playbook_save:** Save
- **work_items.playbook_not_saved:** It was not saved.
- **work_items.playbook_add:** Add subtask
- **work_items.playbook_add_task:** Add task
- **work_items.playbook_add_title:** Its title
- **work_items.playbook_delete_mine:** Delete my version
- **work_items.playbook_not_deleted:** It was not deleted.
- **find_item.playbooks_empty:** There are no playbooks.
- **find_item.playbook_new:** New playbook
- **find_item.playbook_save:** Save
- **find_item.playbook_not_saved:** It was not saved.
- **find_item.playbook_new_title:** Its title
- **find_item.playbook_new_text:** What the Agent who checks it out does.
- **team.workspace_1:** Tilespace 1
- **team.workspace_2:** Tilespace 2
- **team.commons_card:** Commons
- **team.commons_summary:** See Roster / Docs / Wipeboard / Messages / Configuration
- **team.workspace_blank:** Tilespace
- **workspace.close_surface:** Close this work surface
- **cowork.tab_archives:** Archived
- **team.workspace_3:** Tilespace 3
- **team.workspace_4:** Tilespace 4
- **team.roster_title:** Roster
- **team.commons:** Commons
- **team.arranged_by:** arranged by {from}
- **team.state:** State

## epics — epics-surface.js (the Epics board: a row of Epic stones, the picked Epic's bar (pressed, its reading), its Assigned, Flagged and Status questions, its items as bars; w334, KAN-309, KAN-310)
- **epics.all:** All
- **epics.assigned:** Assigned
- **epics.flagged:** Flagged
- **epics.yes:** Yes
- **epics.no:** No
- **epics.unassigned:** Unassigned
- **epics.group:** {status} · {n}
- **epics.open_n:** {n} open
- **epics.pick_epic:** Pick an Epic to see its work items.
- **epics.none_picked:** No items for what Assigned, Flagged and Status pick.

## team_epics — team-epics.js (the Team workbench's Epics card; KAN-232)
- **team_epics.none:** No Epics for this Team yet.
- **epics.title:** Epics

## services — services-card.js (the Services activation card)
- **services.stage_not_requested:** Not installed
- **services.stage_not_requested_blurb:** Ronin Services are not installed on this machine.
- **services.stage_installing:** Installing Services
- **services.stage_installing_blurb:** This machine is fetching and verifying the download.
- **services.stage_installed:** Services are ready
- **services.stage_installed_blurb:** Nothing further to do.
- **services.stage_error:** Needs attention
- **services.stage_error_blurb:** The Services install did not finish.
- **services.unreachable:** could not reach the operator
- **services.entitlement:** entitlement
- **services.install_now:** Install Services now
- **services.egress_summary:** what this machine has sent ({n})
- **services.working:** working…
- **services.failed:** that did not work

## services — services-activation.js (the bar's Services state and pop-over)
- **services.bar_ready:** Services ready
- **services.bar_installing:** Installing Ronin Services…
- **services.bar_error:** Ronin Services needs attention
- **services.activation:** Ronin Services activation

## machine — machine-panel.js (the desk's machine block)
- **machine.head:** this machine
- **machine.off:** Watching is off. Nothing is gathered, and nothing was ever installed on the box.
- **machine.memory_free:** memory free
- **machine.of:** {free} of {total}
- **machine.memory_note:** MemAvailable: what a new allocation could get. A healthy box shows little free memory — the kernel spends it on cache, and hands it back on demand.
- **machine.headroom:** headroom
- **machine.swap:** swap
- **machine.swap_none:** none — a memory spike is a kill, not slowness
- **machine.used_of:** {used} used of {total}
- **machine.load:** load
- **machine.load_value:** {one} · {five} · {fifteen}  on {cpus} cores
- **machine.load_note:** 1, 5 and 15 minute averages. Compare against the core count, not against zero.
- **machine.disk:** disk
- **machine.disk_note:** The filesystem holding Ronin’s home.
- **machine.scope:** scope
- **machine.scope_container:** container limit
- **machine.scope_note:** These are this container’s numbers, not the host’s.
- **machine.unavailable:** not readable here
- **machine.unavailable_note:** This system does not expose these, so they are left unanswered rather than reported as zero.
- **machine.no_reading:** No reading of the machine yet.
- **machine.stop:** Stop watching
- **machine.stop_title:** Stop gathering machine readings and hide the gauge. Nothing was installed on the box, so there is nothing to undo — turn it back on whenever you like.
- **machine.stopped:** Off — the gauge is hidden.
- **machine.save_failed:** Could not save that.

## koshi — koshi.js (the 目 Koshi tab)
- **koshi.restart:** ↻ Restart Koshi
- **koshi.restart_title:** Stop and start the watcher. Settings apply on their own; this is for when it is not running at all.
- **koshi.restarting:** restarting…
- **koshi.restart_failed:** it did not come back up
- **koshi.blurb_running:** Which model each Koshi job asks. Changes apply within a minute — no restart needed.
- **koshi.blurb_stopped:** Koshi is NOT running. Nothing is watching any work record.
- **koshi.outlet_not_built:** {outlet} — not built
- **koshi.pick_title:** Which outlet this job asks
- **koshi.not_built:** Not built yet
- **koshi.not_built_note:** Not built yet — nothing asks anything.
- **koshi.saving:** saving…

## pad — padpanel.js (the ▦ Work Louder pad panel)
- **pad.sheet:** Work Louder pad
- **pad.title:** ▦ Work Louder
- **pad.press_key:** press a pad key…
- **pad.capture:** ⊕ Capture
- **pad.close:** Close
- **pad.save:** Save
- **pad.key_title:** key {chord}
- **pad.unbound:** — unbound —
- **pad.group_keys:** ⌨ keys (to the active tile)
- **pad.press_to_capture:** press the pad key to capture…
- **pad.program:** ⚙ Program pad…
- **pad.write:** Write
- **pad.config:** ⧉ Config
- **pad.config_title:** Copy the pad's current config JSON to the clipboard
- **pad.restore:** Restore backup…
- **pad.clean_write:** clean write
- **pad.clean_write_title:** Replace every key with the Ronin default, including keys set by hand in Input
- **pad.pick_prompt:** pick the pad in the browser prompt… (quit the Input app first)
- **pad.reading:** reading the pad…
- **pad.layer_n:** Layer {n}
- **pad.layer_active:** • active
- **pad.connected:** pad fw {version} — Write overwrites the chosen layer's keys (backup downloads first)
- **pad.error:** pad: {message}
- **pad.no_layout:** pad: that layer has no layout to write into
- **pad.layer_n_lower:** layer {n}
- **pad.overwrite_confirm:** Overwrite the 13 keys of "{layer}" with the Ronin layout?
The pad's current config downloads as a backup first.
- **pad.writing:** writing…
- **pad.written:** ✓ "{layer}" is now the Ronin layer — switch the pad to it and press a key. Knob unchanged? Replug the pad: the firmware applies keys and joystick live but caches the encoder from boot.
- **pad.write_partial:** write finished but the pad did not store: {parts} — the backup file has the original
- **pad.toast_written:** ▦ pad programmed with the Ronin layout ✓
- **pad.toast_rejected:** ▦ pad rejected: {parts}
- **pad.write_failed:** write failed: {message} — the backup file has the original
- **pad.config_copied:** ✓ pad config copied to clipboard
- **pad.clipboard_blocked:** clipboard blocked — use the https url
- **pad.config_read_failed:** config read failed: {message}
- **pad.restoring:** restoring…
- **pad.restored:** ✓ backup restored to the pad
- **pad.restore_failed:** restore failed: {message}

## pad — pad.js (the pad's ⌨ key labels)
- **pad.key_enter:** ↵ Enter
- **pad.key_newline:** ⌥↵ Newline
- **pad.key_delete_word:** ⌥⌫ Delete word
- **pad.key_tab:** ⇥ Tab
- **pad.key_shift_tab:** ⇧⇥ Shift-Tab
- **pad.key_up:** ↑ Up
- **pad.key_down:** ↓ Down
- **pad.key_left:** ← Left
- **pad.key_right:** → Right
- **pad.key_next_tile:** ⇄ Next tile
- **pad.key_session_switcher:** ⌸ Session switcher
- **pad.key_commons:** ⌂ Commons
- **pad.key_tile_1:** ⊞ Tile 1 (top-left)
- **pad.key_tile_2:** ⊞ Tile 2 (top-right)
- **pad.key_tile_3:** ⊞ Tile 3 (bottom-left)
- **pad.key_tile_4:** ⊞ Tile 4 (bottom-right)
- **pad.key_scroll_up:** ⤒ Scroll up
- **pad.key_scroll_down:** ⤓ Scroll down
- **pad.key_layout_cycle:** ▚ Layout 1→2→4
- **pad.key_tile_up:** 🕹 Tile up
- **pad.key_tile_down:** 🕹 Tile down
- **pad.key_tile_left:** 🕹 Tile left
- **pad.key_tile_right:** 🕹 Tile right

## wipeboard — wipeboard.js (the ▤ Wipeboard tab)

## wipeboard — the kind note

## roots — github-workspace-setup.js (the GitHub CLI stone) and the folder picker
- **roots.cancel_folder:** Cancel
- **roots.github_auth_stone:** GitHub CLI
- **roots.github_auth_state:** Connect account
- **roots.github_auth_connected_state:** Connected{account}
- **roots.github_auth_unavailable_state:** Install GitHub CLI
- **roots.github_auth_heading:** GitHub CLI
- **roots.github_auth_lede:** GitHub CLI is Ronin’s recommended guided connection. Existing Git credentials, SSH, and other Git connections remain available.
- **roots.github_install:** Install
- **roots.github_install_step:** Install
- **roots.github_auth_step:** Authenticate
- **roots.github_ready_step:** Connected
- **roots.github_installed:** Installed
- **roots.github_installing:** Installing…
- **roots.github_not_installed:** Not installed
- **roots.github_signed_in:** Signed in as {account}
- **roots.github_not_signed_in:** Not signed in
- **roots.github_auth_unreadable:** Could not verify
- **roots.github_after_install:** After install
- **roots.github_ready:** GitHub CLI connected
- **roots.github_not_ready:** Not connected
- **roots.github_connect:** Connect GitHub
- **roots.github_connect_guided:** Use GitHub CLI with Mika
- **roots.github_connect_mika:** Let Mika connect GitHub
- **roots.github_connect_guided_irasshai:** Use GitHub CLI with the Helpful Assistant
- **roots.github_connect_irasshai:** Let the Helpful Assistant connect GitHub
- **roots.git_other_method:** Use another method
- **roots.git_other_open:** Use your preferred Git or SSH setup here, then return to your Workspace.
- **roots.github_remove_auth:** Remove authentication
- **roots.github_removing_auth:** Removing GitHub authentication…
- **roots.github_done:** Done
- **roots.github_close:** Close
- **roots.github_missing:** GitHub CLI is not installed.
- **roots.github_connected:** Connected to GitHub as {account}.
- **roots.github_not_connected:** GitHub is not connected on this machine.
- **roots.github_unreadable:** Ronin could not verify GitHub authentication.
- **roots.github_waiting:** Finish GitHub authentication in the window first.

## help_outline — help-outline.js (the Help workbench's pages)
- **help_outline.running_work_items:** Running work items
- **help_outline.planning:** Writing a plan
- **help_outline.playbooks:** Playbooks

## docs — docs.js (the ▧ Docs tab)
- **docs.back_title:** Back to the list
- **docs.close_agent:** Close documents and return to this Agent
- **docs.close_chat:** Close documents and return to Chat
- **docs.save:** Save
- **docs.pill_tracked:** Tracked
- **docs.pill_plans:** Plans
- **docs.pill_docs:** Docs
- **docs.birth_brief:** Birth brief
- **docs.brief_now:** Brief now
- **docs.shelf_empty:** Nothing on this shelf — a Workspace's folders keep their docs in docs/ and README.md.
- **docs.plans_empty:** No plans yet. A lead writes one with the user: plan write <name>.
- **folders.up:** ← Up
- **folders.home:** Home
- **folders.search:** Find a folder here
- **folders.hidden:** Show hidden folders
- **folders.new:** ＋ New folder here
- **folders.new_name:** Folder name
- **folders.git:** Start Git version history
- **folders.create:** Create and select
- **folders.loading:** Reading folders…
- **folders.choose:** Choose
- **folders.empty:** No matching folders here.
- **folders.new_in:** ＋ New folder in {name}
- **folders.name_needed:** Give the new folder a name.
- **folders.create_confirm:** Create this folder on the Ronin machine?\n\n{target}
- **folders.create_title:** Create folder
- **folders.creating:** Creating…
- **docs.open_browser:** Open in browser ↗
- **docs.frame_title:** document
- **docs.discard_confirm:** Discard unsaved changes?
- **docs.loading:** loading…
- **docs.saving:** saving…
- **docs.saved:** saved
- **docs.work_record_note:** Ask an agent to add a document with work-record add_doc <path>. If a document is missing, ask the agent to update its work record.

## stats — stats.js (the ▦ Stats tab)

## customize — customize-rail.js (the Customize rail's sections and resources)
- **customize.sec_behavior:** Behavior
- **customize.sec_people:** People & work
- **customize.sec_presentation:** Presentation
- **customize.saved_launches:** Saved launches
- **customize.saved_launches_blurb:** The launcher form, filled in ahead of time and named.
- **customize.skins:** Skins
- **customize.skins_what:** a look — a set of design tokens, and nothing else
- **customize.skins_blurb:** A set of design tokens and nothing else. Choosing one is a setting, and stays on the gear.

## customize — customize.js
- **customize.title:** Customize
- **customize.rail_label:** Customize resources

## customize — customize-resources.js
- **customize.unavailable:** Not available in this preview.
- **customize.reading:** reading…
- **customize.read_failed:** could not read — {message}
- **customize.not_a_list:** the route did not answer with a list
- **customize.empty:** Nothing here yet. That is an ordinary state, not a fault.
- **customize.read_entry:** Read entry

## customize — customize-role-families.js

## customize — customize-handoff.js
- **customize.handoff_head:** Making it yours
- **customize.handoff_read_only:** One file per {thing}, named by its token, in ~/ronin/custom/{dir}/. Ronin cannot create that file for you yet — ask your agent to add one, and point it at the folder’s own readme in ronin_stock/{dir}/, which states the format and every field.
- **customize.handoff_ask_agent:** Ask your agent to add one.

## pane — panes.js (the pane registry's tab labels)
- **pane.settei:** Configuration
- **pane.hotwords:** Hotwords
- **pane.koshi:** Koshi

## desk — desk.js (the desk's rows and tooltips)
- **cowork.tab_health:** Desk
- **cowork.tab_themes:** Themes
- **cowork.tab_account:** Account
- **cowork.tab_profile:** Desk profile
- **cowork.tab_roots:** Workspace folders
- **cowork.tab_help:** Help desk
- **cowork.tab_keypad:** Keypad
- **cowork.tab_messages:** Messages
- **messages.empty:** No messages are waiting.
- **messages.note:** A message waits only while a draft or dialog is present. After two minutes Ronin attempts it once, then removes it.
- **messages.from:** From
- **messages.to_label:** To
- **messages.waiting:** Waiting
- **messages.state_age:** {state} · {age}
- **messages.type_tell:** Agent tell
- **messages.type_wipeboard:** Wipeboard notification
- **messages.type_owner:** Owner message
- **messages.type_typed:** Typed in the Message box
- **messages.type_house:** House message
- **messages.type_jikan:** Cron job
- **messages.dismiss:** Dismiss
- **messages.dismiss_all:** Dismiss All
- **messages.dismiss_all_count:** Dismiss All ({count})
- **messages.action_failed:** Message action failed — {reason}
- **cowork.h_mika:** Mika Assist
- **cowork.mika_button:** ミ Ask Mika
- **cowork.mika_text:** Ask about Ronin itself — how it works, workspace folders, starting a session, changing a setting. She starts if she is not up.
- **cowork.keypad_missing:** The keypad did not build on this page.

## desk — the install group heading

## dial / gauge / mark — widgets.js (the control dial, the context gauge, the role menu)
- **gauge.used:** ⛽ {label} {pct}% used

## tape — tapeview.js (the RIREKI tape view)
- **tape.summarize_now:** Summarize now
- **tape.summary_policy:** Summary production
- **tape.policy_on_demand:** On demand
- **tape.policy_keep_current:** Keep current
- **tape.jump_title:** Jump to the latest output — the deterministic way back to the bottom, whatever the scroll is doing.
- **tape.jump:** ↓ latest
- **tape.fold_code:** ⌨ code

## work_record — work-record.js (the work record chip and panel)
- **work_record.items:** Work items
- **work_record.agent_asking:** Asking you: answer in its terminal
- **work_record.agent_no_progress:** No progress for 12 min: look in its terminal
- **work_record.no_items:** No work items held.
- **work_record.task_at_hand:** Task at hand
- **work_record.task_unstated:** No task stated in this work record.
- **work_record.worktrees:** Worktrees
- **work_record.branch:** Branch
- **work_record.teams:** Teams

## tile — tile.js (the Agent terminal tile)

## composer — composer.js
- **composer.placeholder:** Message…
- **composer.title:** Enter sends · Shift+Enter or Option+Enter for a new line
- **composer.mic_title:** Dictate into this box — tap again to stop, then ↵ to send
- **composer.send:** Send
- **composer.held:** Not sent — {why}. Your text is kept.
- **composer.why_not_connected:** the tile is not connected
- **composer.why_refused:** the session refused it

## controls — terminal-controls.js (what Stop, Clear and Copy say in the box)
- **controls.stopping:** Stopping…
- **controls.stop_sent:** Stop sent.
- **controls.stop_idle:** Stop sent. The Agent was not working.
- **controls.stop_waiting:** Stop sent. Waiting for the Agent to stop…
- **controls.stopped:** Stopped. The Agent is no longer working.
- **controls.stop_working:** Stop sent, but the Agent is still working.
- **controls.stop_failed:** Stop not sent: {why}
- **controls.clear_failed:** Clear not sent: {why}
- **controls.copied:** Copied.

## hotwords — hotwords.js (the ▥ Hotwords tab)
- **hotwords.placeholder:** a word it keeps getting wrong
- **hotwords.label:** a word dictation keeps getting wrong
- **hotwords.add:** Add
- **hotwords.loading:** loading…
- **hotwords.remove:** Remove {word}
- **hotwords.load_failed:** could not load

## archives — archives.js (the Archived tab)
- **archives.title:** Archived sessions
- **archives.unavailable:** unavailable
- **archives.read_failed:** archive could not be read
- **archives.empty:** no archived sessions
- **archives.ago:** {age} ago
- **archives.rehydrate_btn:** Rehydrate
- **archives.rehydrating:** rehydrating…
- **archives.group_none:** Ronin — no team
- **archives.card:** Rehydrate Archived
- **archives.sort:** Sort
- **archives.sort_recent:** Recently archived
- **archives.sort_team:** Team
- **archives.team_card:** Rehydrate Agents
- **archives.delete_aria:** Permanently delete archived session {name}
- **archives.delete_title:** Hard delete this archive
- **archives.delete_confirm:** Hard delete archived session "{name}"? Its saved Ronin record cannot be rehydrated after this.

## retire — session-retire.js (the tile's retire sheet)
- **retire.sheet:** Retire {name}
- **retire.copy:** Archive is resumable and leaves desks alone. Delete safely closes only clean, handed-in desks. Hard Delete irreversibly removes the Agent and every owned desk after preserving destructive evidence.
- **retire.archive:** Archive
- **retire.shutdown:** Delete
- **retire.hard_delete:** Hard Delete
- **retire.hard_delete_confirm:** Hard Delete is irreversible. Delete Agent {name} and every desk it owns, including dirty and unhanded work? Destructive evidence will be preserved.\n\nConfirm exact targets: {exact}

## retire — the working words
- **retire.archive_failed:** could not archive it
- **retire.shutdown_failed:** could not safely shut it down
- **retire.already_ended:** {name} had already ended; its row is removed.
- **retire.shutting_down:** starting shutdown…
- **retire.resolving:** Resolving Agent…
- **retire.archiving:** archiving…
- **retire.hard_delete_failed:** could not hard delete it
- **retire.hard_deleting:** starting Hard Delete…
- **retire.items_label:** Work still held
- **retire.items_confirm:** {name} holds {items}, not flagged: finish or flag it and hand in its desks first, or close anyway; it goes to the Team flagged, its lead told.
- **retire.items_anyway:** Close anyway
- **retire.items_keep:** Keep it open

## customize — the shadow-trade notice
- **customize.shadow_trade:** Changing one of Ronin’s own makes it yours: your copy goes in ~/ronin/custom/, where an upgrade cannot touch it — and improvements Ronin makes to it will not reach you. That is the trade for owning it.

## provenance — provenance.js (the add-your-own button)
- **provenance.add_own:** ＋ add your own {what}
- **provenance.add_own_title:** Create your own {file} in ~/ronin/custom/ — yours, outside every repo, untouched by upgrades
- **provenance.create_failed:** could not create it — {message}
- **provenance.made:** made {path} — edit it, or tell an agent to
- **provenance.exists:** yours is at {path}

## switcher — session-picker.js
- **switcher.sheet:** Session switcher
- **switcher.hint:** ↑↓ move · same key (or ↵) opens it · Esc cancels
- **switcher.title:** Switch tile {n}
- **switcher.now:** — now: {session}

## errors — errors.js (the fail bar)
- **errors.title:** ⚠ Ronin hit an error. The top bar still works — a pane may not. Reload; if it persists the cause is below.
- **errors.dismiss:** Dismiss

## events — events.js (the birth chip)
- **events.open:** Open

## bar — layout.js

## koe — read-aloud.js (the tile's speaker, hosted offices)
- **koe.speak_help:** Read the last reply aloud
- **koe.speak_stop:** Stop reading aloud
- **koe.speak_failed:** Read aloud failed ({status}).
- **koe.speed_help:** Playback speed — press for the next

## seat — seat-view.js (a gecko's tile: its status line, work record and Tells thread; KAN-755)
- **seat.thread:** Tells
- **seat.status:** Status line: {status}
- **seat.status_none:** No status line.
- **seat.task:** Task at hand: {objective}
- **seat.to:** To @{name}
- **seat.from:** From {name} [{channel}]
- **seat.empty:** No Tells yet. What you send here goes to its inbox; it reads it when it next looks.

## transcript — tile-transcript.js (the tile's journal view)
- **transcript.title:** Transcript
- **transcript.toggle:** Transcript
- **transcript.terminal:** Term
- **transcript.toggle_help:** Term → Chat → Notes → Work → All → Term: each press shows more of the record
- **transcript.no_session:** Transcript — no Agent in this tile
- **transcript.loading:** Loading transcript…
- **transcript.empty:** No transcript output yet.
- **transcript.unavailable:** Transcript unavailable for this Agent.
- **transcript.failed:** Transcript could not be loaded. Retrying…
- **transcript.stance_working:** Working
- **transcript.stance_asking:** Waiting for your answer in Terminal
- **transcript.answer_in_terminal:** Answer in Terminal
- **transcript.stance_no_progress:** No progress for 12 min
- **transcript.open_in_terminal:** Open in Terminal
- **transcript.back_to_chat:** Continue in Chat

## output — output.js (the RIREKI view picker)
- **output.locked:** Locked
- **output.terminal_mirror:** Terminal Mirror

## bar — viewport.js (the layout button)

## term — termview.js (the copy hint)

## gauge — ramrpm.js (the header gauge: Agents, Compute, Storage)
- **gauge.agents:** Agents
- **gauge.compute:** Compute
- **gauge.storage:** Storage
- **gauge.storage_of:** {used} of {total} GB
- **gauge.agents_of:** {live} of {max}
- **gauge.details:** How full this office is

## request — request.js (the client's own two messages)
- **request.cancelled:** cancelled
- **request.malformed:** Ronin answered, but the answer did not arrive whole
- **request.unreachable:** could not reach Ronin — network or server down

## island — tile-island.js (the item island in the tile header: a pill per held work item; w271, w272, KAN-238)
- **island.items:** Work items held
- **island.down:** Show the work items with their status
- **island.up:** Put the work items back in the header
- **island.subtask:** 1 subtask
- **island.subtasks:** {n} subtasks
- **island.handed_in:** handed in
- **island.on_dev:** on dev
- **island.stance_asking:** Question: a dialog is waiting for you
- **island.stance_no_progress:** No progress for 12 min
- **island.stance_awaiting_you:** Your turn: the turn ended
- **island.stance_interrupted:** Stopped: interrupted
- **island.stance_error:** Stopped: a tool failed
- **island.stance_gaps:** This harness cannot report {list}
- **island.gap_question:** a question
- **island.gap_turn:** the end of a turn
- **island.gap_interrupted:** an interruption
- **island.gap_error:** a failed tool
- **island.wide:** More detail
- **island.narrow:** Less detail
- **island.under:** under {id}
- **island.attachments:** {n} attached
- **island.comment:** 1 comment
- **island.comments:** {n} comments
- **island.moved:** moved {age} ago

## head — tilehead.js (the tile head's help and quiet words)
- **head.rename_help:** Edit this Agent title
- **head.rename_quiet:** Rename session — no session in this tile yet
- **head.rename_prompt:** Edit Agent title
- **head.rename_failed:** Could not rename session: {reason}
- **head.gauge_help:** Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading.
- **head.minimize_help:** Close this view — the Agent keeps running
- **head.minimize_quiet:** Close view — no Agent in this tilespace

## pad — pad.js (the pad's widget captions)
- **pad.w_encoder:** encoder — volume and play/pause; it speaks media-key only, so it cannot drive Ronin
- **pad.w_joystick:** joystick — flick to move between tiles
- **pad.w_touch:** touch strip — cycles the pad layers (not bindable here)
- **pad.w_esc:** Escape — a real universal Esc key, works in any app
- **pad.w_tab:** Tab — a real universal Tab key, works in any app
- **pad.w_enter:** Enter — a real universal Enter key, works in any app
- **pad.w_delete_word:** Option+Delete (delete word) — universal, works in any app
- **pad.w_newline:** Option+Enter (newline without send) — universal, works in any app
- **pad.w_wispr:** Wispr push-to-talk (right ⌥) — Wispr handles it, Ronin stays out of the way

## bar — layout.js (the ニ sheet)
- **bar.expand_header:** Expand header
- **bar.collapse_header:** Collapse header
- **bar.keys:** Keys
- **bar.new:** New
- **bar.shape_title:** Two workspaces — click for four
- **bar.shape_two:** Two workspaces — click for four
- **bar.shape_four:** Four workspaces — click for two

## me — tilehead.js (the メ menu, js/menu.js)
- **me.mention:** Mention a session
- **me.kill:** Delete or archive…
- **me.agent_title:** This Agent — work record, docs, file, mention, output, delete
- **me.work_record:** Work record
- **me.docs:** Docs
- **me.configuration:** Configuration
- **me.configuration_hint:** mandate, Behaviors
- **me.docs_none:** No documents on this Agent's record.
- **me.attach:** Send a file
- **me.attach_hint:** or drag one onto the tile
- **me.markdown:** Markdown
- **me.markdown_hint:** off shows the marks as written
- **me.no_record:** This Agent has not written a work record yet.
- **head.menu_quiet:** Menu — no Agent in this tilespace
- **menu.empty:** Nothing here yet.

## keys — keysrow.js (the composer's keys row)
- **keys.escape_face:** Esc
- **keys.escape:** Escape

## composer — the ✕ clear

## phone — phone.js (the mobile document: Teams, a Team's Agents | Docs, one Agent's tile)
- **phone.coworks:** Teams
- **phone.launch_card:** Launch New Agent
- **phone.launch_defaults:** Everything else launches with this Team's defaults.
- **phone.no_coworks:** No Teams yet.
- **phone.no_agents:** No Agents on this Team yet.
- **phone.agents:** Agents
- **phone.docs:** Docs
- **phone.back:** Back

## new_team — new-team-launch.js (the transaction's own sentences)

## new_team — new-team-preflight.js (the preflight notes)

## pad — weblink.js (the pad's failure sentences)
- **pad.open_failed:** could not open the pad — 1) System Settings → Privacy & Security → 
- **pad.device_error:** device error
- **pad.no_reply:** {method}: pad did not reply

## docs — the empty line and count
- **docs.empty_team:** No tracked documents.
- **docs.empty:** No session has listed a doc yet. An agent adds one with: work-record add_doc <path>
- **docs.count_one:** 1 doc
- **docs.count_many:** {n} docs

## errors — the where-words and the dead tile
- **errors.uncaught_at:** uncaught error at {at}
- **errors.uncaught:** uncaught error
- **errors.unhandled:** unhandled promise

## desk — the rail toggle and the inert row

## league — league-board.js (the League board)
- **league.no_members:** No live members

## workspace — workspace-layouts.js
- **workspace.resize:** Resize {column}

## stats — the tooltip, foot and UI rows

## wipeboard — the status lines

## tile — the prompt, the ended line, the picker tooltips
- **tile.session_ended:** session ended.

## tape — the summary default and the alt note
- **tape.no_summary:** No summary has been written yet.
- **tape.alt_note_partial:** history begins mid-session · scrollback above is reconstructed from the tape
- **tape.alt_note:** scrollback above is reconstructed from the tape

## tape — output.js summary notes
- **tape.writing_summary:** Writing a summary…
- **tape.summary_unavailable:** Summary unavailable — {message}

## customize — three more paragraphs
- **customize.handoff_read_only_shelf:** This preview reads this shelf and does not write it. Your own agent can change it 
- **customize.handoff_deferred:** Deferred in this preview.
- **customize.handoff_seed:** Ronin can create your own {file} in ~/ronin/custom/ — outside every repo, untouched by upgrades. The path is the answer: hand it to your agent, or open it yourself.
- **customize.entry:** entry

## hotwords — the count and ownership lines
- **hotwords.count_one:** {n} word sent with your voice
- **hotwords.count_many:** {n} words sent with your voice
- **hotwords.none:** no words yet — dictation runs unbiased
- **hotwords.own_list:** ◆ your list — an upgrade cannot touch it, and will not add to it either
- **hotwords.stock_list:** Ronin's stock list — your first edit makes a copy that is yours

## errors — main.js (the session-list failure)

## pad — cell tooltips and idle lines
- **pad.unbound_tip:** unbound — tap to bind
- **pad.active_tile_word:** active tile
- **pad.prog_ready:** writes F13–F24 + 🎙 Wispr straight onto the pad — no Input app needed
- **pad.prog_needs_webhid:** programming the pad needs Chrome/Edge on desktop (WebHID)

## voice — voice.js failures
- **voice.failed:** Dictation failed ({why})
- **voice.failed_network:** Dictation failed (network)
- **voice.mic_blocked:** Mic blocked — open Ronin over the https url and allow the microphone

## provenance — the mark tooltips
- **provenance.shadowed:** Yours — this replaces Ronin's shipped entry of the same name. Upgrades to that entry will not reach you.
- **provenance.own:** Yours — added by you, in ~/ronin/custom/. An upgrade cannot touch it.

## team_jikan — team-jikan.js (the Cron jobs tab on the team commons)

- **team_jikan.help:** Cron jobs send a message to a team lead or named member at the time you choose.
- **team_jikan.new:** New job
- **team_jikan.request:** Request
- **team_jikan.request_placeholder:** Write the message the agent should receive
- **team_jikan.request_help:** Plain words, exactly as if you typed them to the agent.
- **team_jikan.to:** To
- **team_jikan.team:** Team
- **team_jikan.to_lead:** Team lead (default)
- **team_jikan.when:** When
- **team_jikan.expires:** Expires
- **team_jikan.expires_help:** Optional. Recurring jobs stop after this date and time.
- **team_jikan.checking:** Checking next runs…
- **team_jikan.next_three:** Next: {runs}
- **team_jikan.never:** No future runs
- **team_jikan.add:** Schedule job
- **team_jikan.close:** Close
- **team_jikan.edit:** Edit job
- **team_jikan.save:** Save changes
- **team_jikan.filter_message:** Filter messages
- **team_jikan.remove_confirm:** Remove this job?
- **team_jikan.all_teams_summary:** Scheduled messages across every team
- **team_jikan.none:** No jobs yet. Choose New job to schedule a message.

## workspace — workspace-primitives.js (the Kit's own words)
- **team_config.no_roster:** This Team has no saved record.
- **team_config.loading:** Loading Team Configuration…
- **team_config.cowork_id:** Team ID
- **team_config.title:** Title
- **team_config.kind:** Kind
- **team_config.kind_coding:** Coding
- **team_config.kind_work:** Work
- **team_config.kind_personal:** Personal
- **team_config.kind_household:** Household
- **team_config.kind_social:** Social
- **team_config.kind_school:** School
- **team_config.objective:** Purpose
- **where.born_in:** Born in
- **where.additional:** Additional workspaces
- **where.col_branch:** Branch
- **where.label:** Where it works
- **where.summary:** born in {root} · {repos}
- **where.none:** no auto worktree
- **team_config.default:** Default
- **team_config.provider:** Provider
- **team_config.model:** Model
- **team_config.reach:** Reach
- **team_config.recruit:** Recruit
- **team_config.output:** Output
- **team_config.team_step:** Team
- **team_config.agent_defaults:** New Agent defaults
- **team_config.next_form:** What each new Agent on this Team starts from. Nothing live changes.
- **team_config.saving:** Saving…
- **team_config.saved:** Saved
- **workspace.explorer:** Explorer
- **workspace.explorer_collapse:** Collapse explorer
- **workspace.explorer_expand:** Expand explorer
- **workspace.tab_name:** Name this tab
- **workspace.tab_name_title:** Name this browser tab — what it is for. Empty is the default name.
- **workspace.columns:** Workspace columns
- **workspace.slot_show:** {column} — click to show, drag to move
- **workspace.slot_hide:** {column} — click to hide, drag to move

## bar / keys — index.html (the page's own words, filled by public/js/pagewords.js at boot)
- **bar.new_title:** ⌃⇧N — start a new session: pick what it is for, where it works and who it is
- **keys.latest_title:** Jump to latest output
- **keys.tab:** Tab
- **keys.shift_tab:** Shift-Tab
- **keys.shift_tab_face:** ⇧Tab
- **keys.up:** Up
- **keys.down:** Down
- **keys.left:** Left
- **keys.right:** Right

## glossary — the work record's word for the mandate
- **glossary.mandate:** mandate
- **league.agents:** Agents
- **league.delete_team:** Delete team
- **league.delete_team_confirm:** Delete {team}? {count} Agents will lose this Team membership.
- **league.people:** People
- **league.no_lead_title:** Team lead not assigned
- **league.no_lead_help:** Assign an Agent already on this Team, or add a new Agent for the role.
- **league.choose_lead:** Choose an Agent as team lead
- **league.no_lead_candidates:** No current Agents to assign
- **league.assign_lead:** Assign lead
- **league.add_lead_agent:** Add new Agent
- **league.add_lead_prompt:** Join this Team as its team lead.
- **league.expand_people:** Expand Agent details
- **league.compact_people:** Compact Agent details
- **league.team_lead:** Team Lead
- **league.make_team_lead:** Make Lead
- **league.rename_agent:** Rename
- **league.rename_agent_prompt:** Edit Agent title
- **league.close_agent:** Close
- **league.close_named_agent:** Close {name}
- **league.remove_member:** Remove
- **league.remove_named_member:** Remove {name} from this team
- **league.choose_member:** Choose an Agent to add
- **league.no_available_members:** No other Agents available
- **league.assign_member:** Assign
- **league.launch_team:** Launch
- **league.ronin:** Ronin: no team
- **agent.workbench:** Agent
- **agent.self:** Self
- **agent.commons:** Commons
- **agent.team_membership:** Team membership
- **agent.team_membership_summary:** Add or remove this Agent from installed Teams
- **agent.join_team:** Join
- **agent.no_teams:** No Teams are installed.
- **agent.team_tasks_summary:** Work items held by {team}
- **customize.desk_profiles:** Desk profiles
- **customize.desk_profiles_blurb:** Your standing defaults for the surfaces you work at — a skin, a lexicon, a campaign kind, a Team page arrangement. Choosing one is a setting, on the gear.
- **customize.lexicons:** Lexicons
- **customize.lexicons_blurb:** The words a surface uses — a wording or a language, one file each. Say only what changes; the rest uses the stock words.
- **files.title:** Explorer
- **files.summary:** Your home folder: view, move, manage and edit
- **feedback.button:** Feedback
- **feedback.title:** Feedback
- **feedback.message:** What would you like to tell us?
- **feedback.message_placeholder:** Tell us anything. What do you like? What should we add or change?
- **feedback.message_help:** Write as much or as little as you want. Everything below is optional.
- **feedback.about:** A little about you
- **feedback.about_developer:** Developer
- **feedback.about_founder:** Founder
- **feedback.about_researcher:** Researcher
- **feedback.about_student:** Student
- **feedback.using:** What do you use Ronin for?
- **feedback.using_coding:** Coding
- **feedback.using_research:** Research
- **feedback.using_writing:** Writing
- **feedback.using_operations:** Operations
- **feedback.kind:** What kind of feedback is this?
- **feedback.kind_like:** Something I like
- **feedback.kind_idea:** An idea
- **feedback.kind_problem:** Something is not working
- **feedback.kind_question:** A question
- **feedback.other:** Something else
- **feedback.reply_email:** Reply email address (optional)
- **feedback.reply_invalid:** Enter an email address or leave it blank.
- **feedback.reply_help:** If you would like to hear from us, we may reply or invite you to the Ronin community. No spam. This address is never stored with this Ronin install’s identity.
- **feedback.send:** Send
- **feedback.sending:** Sending…
- **feedback.sent:** Sent — thank you
- **feedback.thank_you:** Thank you for helping us make Ronin better.
- **setup_surface.providers:** Model providers
- **setup_surface.authenticate_mika:** Let Mika authenticate
- **setup_surface.authenticate_guided:** Use the CLI with Mika
- **setup_surface.authenticate_irasshai:** Let the Helpful Assistant authenticate
- **setup_surface.authenticate_guided_irasshai:** Use the CLI with the Helpful Assistant
- **setup_surface.providers_summary_unread:** Every provider and model Ronin offers, and what this machine has.
- **setup_surface.providers_summary:** {providers} providers · {models} models · {activated} activated here
- **setup_surface.section_yours:** Yours
- **setup_surface.no_cli:** No CLI in Ronin’s registry serves this provider, so it cannot be installed or signed in here.
- **setup_surface.no_cli_state:** No CLI
- **setup_surface.no_models:** The catalog lists no models for this provider.
- **setup_surface.refresh_all:** Refresh all model providers
- **setup_surface.refreshing_accounts:** Reading account lists…
- **setup_surface.last_ran:** Last ran {date}
- **setup_surface.never_ran:** Never run — every provider offers Native only until it runs.
- **setup_surface.models_read:** Model list read {date} by {cli} {version}
- **setup_surface.models_not_read:** Model list not read yet — press Refresh all model providers.
- **setup_surface.provider_models_n:** {vendor} · {n} models
- **setup_surface.part_models_n:** {n} models
- **setup_surface.fact_installed:** Installed
- **setup_surface.fact_signed_in:** Signed in
- **setup_surface.fact_activated:** Activated
- **setup_surface.yes:** yes
- **setup_surface.no:** no
- **setup_surface.col_model:** Model
- **setup_surface.col_tier:** Tier
- **setup_surface.model_default_mark:** the default

## Provider sign-in record
- **setup_surface.api_key:** API key
- **setup_surface.third_party:** Third-party service
- **setup_surface.third_party_hint:** For example, OpenRouter. Put the service or account name in the title.
- **setup_surface.not_authenticated:** Not signed in
- **setup_surface.cancel:** Cancel
- **setup_surface.sign_in_recorded:** Your sign-in record: {method} · {title}

- **setup_surface.naming_authentication:** Naming this authentication
- **setup_surface.authentication_type:** Authentication type
- **setup_surface.account_subscription:** Account / subscription

- **setup_surface.type_before_close:** Choose an authentication type, or Not signed in.

- **setup_surface.authentication_title:** Authentication title
- **setup_surface.authentication_title_hint:** Choose a title

- **setup_surface.title_before_done:** To finish, give this authentication a title.

- **campaign_view.machine:** Machine
- **campaign_view.workspaces:** Workspaces
- **campaign_view.machine_settings:** Machine Settings
- **campaign_view.cloud_account:** Cloud Account
- **campaign_view.cloud_account_summary:** Account, office, subscription and house-model usage, as Ronin HQ records it. Read-only.
- **machine_status.title:** Machine status
- **machine_status.summary:** What this office has set up, what it hasn’t and what is available, in one doc any Agent reads, kept current.
- **machine_status.where:** Kept at {path}. Agents read it there, or with office read.
- **machine_status.stamp:** Written {when}

## behaviours — behaviour-surface.js
- **behaviours.title:** Behaviors
- **behaviours.yours:** Yours
- **behaviours.stock:** Ronin
- **campaign_view.desk_settings:** Desk Settings

## brief — brief-step.js, brief-author.js, behaviour-surface.js and the brief settings on every page (what an Agent is told; KAN-480, BRIEF_WORDING 3–5)
- **brief.from_campaign:** Campaign
- **brief.from_workspace:** Workspace
- **brief.from_team:** Team
- **brief.from_user:** your settings
- **brief.why_added:** added by the {layer}
- **brief.why_integration:** {name} on
- **brief.why_role:** {role} role
- **brief.why_service:** {name} running
- **brief.why_workspace:** in {name}
- **brief.why_cowork:** every Cowork Agent
- **brief.why_lead:** Team lead
- **brief.why_team:** on a Team
- **brief.why_desk:** at a desk
- **brief.why_checkout:** in a checkout
- **brief.why_pm:** project management on
- **brief.why_hosted:** hosted office
- **brief.why_new_owner:** new owner
- **brief.why_owner:** the owner
- **brief.why_member:** a member
- **brief.why_service_off:** {name} not running
- **brief.why_not:** not {what}
- **brief.why_every:** every Agent
- **brief.integrations:** Integrations
- **brief.integrations_help_layer:** On here is on for everything below.
- **brief.pm:** Project management
- **brief.on_from_word:** On, from the {layer}
- **brief.on:** On
- **brief.off:** Off
- **brief.pm_on_layer:** Work items for every Agent below: the item model, and the guidance for each role.
- **brief.pm_off_layer:** Off here and below: no work items guidance.
- **brief.off_from_word:** Off, from the {layer}
- **brief.set_on:** Set on
- **brief.depth_seed:** Seed
- **brief.depth_full:** Full
- **brief.depth:** Depth
- **brief.add:** Add
- **brief.add_help:** Brought in for every Agent below, at this depth.
- **behaviours.customize:** Customize Behaviors
- **brief.comes:** Comes with this Agent
- **brief.told_here:** An Agent here is told
- **brief.comes_help:** What this Agent will be told anyway, and why. Read-only.
- **brief.told_here_help:** What a new Agent here is told, and why, as saved. Read-only.
- **brief.names:** Names
- **brief.block:** Block
- **brief.block_help:** Never told to any Agent below.
- **brief.only:** Only
- **brief.only_help:** When set, nothing else is told below; a behavior brings its tools.
- **author.depth_none:** When added
- **author.depth_none_sub:** Told only where a Campaign, Workspace, Team or Agent adds it.
- **author.depth_seed:** Seed
- **author.depth_seed_sub:** Its one line, and where to read more.
- **author.depth_full:** Full
- **author.depth_full_sub:** The whole text, from the start.
- **author.command_placeholder:** the command, e.g. deploy-site
- **author.name_placeholder:** from the title if left blank
- **author.integration_placeholder:** e.g. netlify
- **author.integration:** Integration
- **author.integration_help:** Its behavior is told to an Agent while this integration is on for it.
- **author.command:** Command
- **author.name:** Name
- **author.command_help:** A command you have, on the PATH or in ~/ronin/custom/tools. Ronin writes what Agents are told about it; the command stays yours.
- **author.title:** Title
- **author.seed:** Seed
- **author.seed_tool_help:** Its one job, in one line.
- **author.seed_help:** One line that stands on its own: what this guidance is for.
- **author.line:** Line
- **author.line_help:** The line the brief prints, with values in braces: User: {user.name}.
- **author.when:** When it is in play
- **author.depth:** Depth
- **author.serves:** Serves
- **author.serves_help:** Serves: told under these behaviors. None: under Other tools.
- **author.depth_help:** Depth: how much of it an Agent is told.
- **author.when_help:** When it is in play: all chosen must hold. None chosen: every Agent.
- **author.tool_text:** What --help does not say
- **author.text:** Text
- **author.bridge_tools:** Its tools
- **author.seed_tool:** Its one job
- **author.add_tool:** Add a tool
- **author.create:** Create
- **forms.save:** Save
- **behaviours.save_mine:** Save my version
- **forms.cancel:** Cancel
- **author.actions:** Save or cancel
- **author.integration_needed:** Name the integration.
- **author.command_needed:** Name the command.
- **author.name_needed:** Give it a name.
- **brief.mandate_group:** Mandate: {axis}
- **brief.facts:** Facts
- **brief.tools:** Tools
- **author.new_tool:** New tool
- **author.new_bridge:** New bridge
- **behaviours.new:** New Behavior
- **behaviours.edit:** Edit
- **author.make_mine:** Make my version
- **brief.user_help:** What every Agent you start is told. Open any file to read it, or save your own version: yours replaces Ronin’s by name and survives updates.
- **brief.user_settings:** For every Agent you start
- **brief.card_summary:** What every Agent is told: facts, behaviors and tools, and your own versions of them.
- **agent_composition.send:** Send
- **brief.intro:** What this Agent is told: the integrations it works with, the behaviors you add, and what comes with its situation.
- **agent_composition.sending:** Sending…
- **agent_composition.unchanged:** Its brief is unchanged: nothing was sent.
- **agent_composition.updated:** The Agent has been sent its new brief.
- **campaign_view.brief_help:** What every Agent in this Campaign is told. Agents already working are sent the change.
- **team_config.brief_help:** What every Agent on this Team is told. Agents already working are sent the change.
- **workspaces.brief_help:** What every Agent in this Workspace is told. Agents already working are sent the change.
- **work_record.part_session:** Session
- **work_record.part_user:** User
- **work_record.part_people:** People
- **work_record.part_setting:** Setting
- **work_record.part_agent:** Agent
- **work_record.part_work:** Work
- **work_record.part_brief_settings:** Brief settings
- **work_record.yes:** yes
- **work_record.no:** no
- **work_record.brief:** Brief
- **work_record.brief_show:** What this Agent is told
- **work_record.no_brief:** No brief for this Agent.
- **customize.behaviours:** Behaviors
- **customize.behaviours_read:** Read behavior
- **customize.behaviours_blurb:** What every Agent is told: facts, behaviors and tools, each a file you can replace with your own.
