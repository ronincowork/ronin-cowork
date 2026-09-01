# professional_en
The floor. Every key a surface reads is here, in plain English, so a lexicon that says
nothing paints exactly this. `check-lexicon` holds this file complete.

- **label:** Professional
- **blurb:** The plain words. Every other lexicon falls through to these.
- **desk_profile:** desk profile
- **campaign:** Campaign
- **campaigns:** Campaigns
- **add_agent.card:** Add Agent to Team
- **add_agent.card_summary:** The Team answers the rest.
- **add_agent.title:** Add Agent to Team
- **add_agent.name:** name
- **add_agent.name_placeholder:** name
- **add_agent.instruction:** instruction
- **add_agent.instruction_placeholder:** what this Agent should do
- **add_agent.provider:** model provider
- **add_agent.model:** model
- **add_agent.default:** default
- **add_agent.task:** task  (optional)
- **add_agent.task_open:** open
- **add_agent.desk_line_control:** Managed file coordination is on for this Team: the desk contract applies, and a worktree is cut when the work needs it.
- **add_agent.desk_line_plain:** Managed file coordination is off for this Team: this Agent works in the shared checkout and reports to you.
- **add_agent.shell:** Open a shell, not an Agent
- **add_agent.shell_why:** A raw terminal in this Team — no Agent is launched and nothing is sent to it.
- **add_agent.actions:** Launch actions
- **add_agent.start:** Start
- **add_agent.cancel:** Cancel
- **add_agent.starting:** Starting…
- **add_agent.started:** Started {name}
- **add_agent.started_note:** Started {name} — {note}
- **add_agent.team:** team
- **add_agent.place:** place
- **add_agent.still_asked:** still asked
- **add_agent.none:** —
- **routines:** Routines
- **campaign.name:** Campaign name
- **campaign.name_placeholder:** Ronin Home
- **campaign.description:** Description
- **campaign.description_placeholder:** What this campaign is for
- **campaign.commons:** Campaign commons
- **campaign.view:** Campaign view
- **campaign.commons_short:** Commons
- **campaign.cowork_view:** Cowork View
- **campaign.coworks:** Coworks
- **campaign.cowork:** Cowork
- **campaign.new:** New Campaign
- **campaign.create:** Create Campaign
- **campaign.none:** No Campaigns yet.
- **campaign.saving:** saving…
- **campaign.name_needed:** A Campaign needs a name.
- **campaign.profile_hint:** Sets the words, the skin and the templates this Campaign opens with.
- **campaign.read_failed:** Could not read Campaigns — {message}
- **campaign.archive:** Archive
- **campaign.archived:** archived
- **campaign.archive_confirm:** Archive {title}? It stops nothing — its Agents keep running.
- **squad:** Team
- **player_one:** Lead session
- **team_kit:** Shared toolkit
- **loadout:** Tools and skills
- **behaviours:** Behaviours
- **mandate:** Mandate
- **session_type:** Session type
- **kind:** Kind
- **template:** Template
- **required_reading:** Required reading
- **reach:** Reach
- **recruit:** Recruit
- **output:** Output
- **routine_bundles:** Routine Bundles
- **go:** Go
- **save_template:** Save as template
- **publish:** Publish
- **tier.stock:** Built-in
- **tier.yours:** Mine
- **tier.library:** Community
- **kind.coding:** Software
- **kind.household:** Home
- **kind.personal:** Personal
- **kind.work:** Work
- **kind.social:** Events
- **kind.school:** Learning

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
- **desk.update:** Update
- **desk.install_services:** Install services
- **desk.log_out:** Log out
- **desk.log_out_title:** End this device’s session — the next visit asks for the password
- **desk.unreachable:** unreachable
- **desk.no_version_answer:** the operator did not answer /api/version
- **desk.release_detail:** release · built from {commit} · contract {contract} · started {started}
- **desk.dirty:** (dirty)
- **desk.checkout_detail:** a dev checkout, not a release — updated by git, not by the button · started {started}
- **desk.services_list:** services: {list}
- **desk.services_none:** services: none — the free build
- **desk.asking_feed:** asking the release feed…
- **desk.updater_predate:** this operator predates the updater — its next restart carries the routes
- **desk.feed_no_release:** the feed named no cowork release yet (a private repo needs gh auth on the host)
- **desk.cowork_up_to_date:** ✓ cowork up to date — {installed}
- **desk.cowork_checkout_latest:** latest cowork release is {latest} — this box runs a checkout, so the button stays off
- **desk.update_to:** Update to {latest}
- **desk.cowork_available:** cowork {latest} available (installed: {installed})
- **desk.none:** none
- **desk.update_services_to:** Update services to {latest}
- **desk.install_services_v:** Install services {latest}
- **desk.services_available_installed:** services {latest} available (installed: {installed})
- **desk.services_available:** services {latest} available
- **desk.services_up_to_date:** ✓ services up to date — {installed}
- **desk.updated_reloading:** ✓ updated to {release} — reloading
- **desk.update_timeout:** no new version answered after 5 minutes — journalctl --user -u "ronin-update-*" has the transcript
- **desk.updating:** updating to {latest} — fetch, verify, gate the candidate, swap. The page blinks at the swap; sessions are untouched…
- **desk.services_live_reloading:** ✓ services live: {list} — reloading
- **desk.services_timeout:** services did not answer after 5 minutes — journalctl --user -u "ronin-update-*" has the transcript
- **desk.installing_services:** installing services {latest} — fetch, verify, contract check, restart. The page blinks at the restart; sessions are untouched…

## launcher — launcher.js (the ＋ New board and its form)

## roster — roster.js (the ⌂ Roster tab)
- **roster.session_max:** session max
- **roster.session_max_title:** How many sessions may run at once. 0 = no limit. The owner sets this; agents cannot.
- **roster.running_of:** {n} / {max} running
- **roster.running_no_limit:** {n} running · no limit
- **roster.not_saved:** not saved — {message}
- **roster.team_name:** team name
- **roster.team_name_aria:** New team name
- **roster.add_team:** ＋ Team
- **roster.team_name_rule:** use letters, digits, - or _
- **roster.drag_into:** drag a session into {team}
- **roster.leads:** 人 leads {teams}
- **roster.no_role_yet:** has not said what it is doing yet
- **roster.stale:** ⚠ roster may be stale — {fault}
- **roster.drop_here:** Drop a session here to add it to {team}
- **roster.no_team:** no team
- **roster.no_sessions:** no sessions yet

## panels — panels.js (the session note and session teams sheets)
- **panels.note_sheet:** Session note
- **panels.save:** Save
- **panels.close:** Close
- **panels.note_placeholder:** What's this session working on?
- **panels.note:** session note
- **panels.loading:** loading…
- **panels.load_failed:** could not load — {message}
- **panels.saving:** saving…
- **panels.not_saved:** not saved — {message}

## commons — commons.js (the commons shell: tab strip and frame)
- **commons.tab_off:** {tab} — off, this service is not installed.
- **commons.sessions:** sessions

## campaign_view — campaign-view.js (Campaign Manage: the selector's Campaign-level surfaces)

- **campaign_view.campaign_summary:** What this body of work is called, and what it is for.
- **campaign_view.desk_summary:** This Ronin install, its owner and its workspace configuration.
- **campaign_view.profile_summary:** The words, the skin and the templates this Campaign opens on.
- **campaign_view.roots_summary:** The folders this Campaign is allowed to work in.
- **campaign_view.templates_summary:** The Cowork templates this Campaign offers.
- **campaign_view.new_summary:** Set the stage. It creates no Cowork and launches no Agent.
- **campaign_view.none_selected:** No Campaign selected.
- **campaign_view.no_profiles:** No desk profiles on this install.
- **campaign_view.no_description:** No description yet.
- **campaign_view.no_profile:** As stock — none chosen.
- **campaign_view.roots_n:** {n} roots
- **campaign_view.roots_none:** None — an Agent here has nowhere to work.
- **campaign_view.new_project_desks:** New projects use desks?
- **campaign_view.new_project_desks_yes:** Desks
- **campaign_view.new_project_desks_no:** None
- **campaign_view.new_project_desks_help:** Desks: each coding session works at its own branch and worktree and hands in to the team. None: sessions work in the checkout. Written into a project’s RONIN_REPO when its root is added; the desks box on a root changes that one project.
- **campaign_view.name_help:** On the door, the browser tab and the address.
- **campaign_view.description_help:** What this body of work is for. Shown on its card.
- **campaign_view.head:** Campaign: {name}
- **campaign_view.presets:** Presets
- **campaign_view.presets_help:** A preset copies all of its components into this Campaign. Change any one of them afterwards; the preset is not consulted again.
- **campaign_view.apply:** Apply
- **campaign_view.applied:** applied — every component below is now this Campaign’s own
- **campaign_view.applied_tag:** applied
- **campaign_view.skin:** Skin
- **campaign_view.skin_help:** The look — colours, corners, faces. The page wears it now.
- **campaign_view.theme:** Theme
- **campaign_view.theme_help:** Light or dark, or whatever the device prefers.
- **campaign_view.theme_light:** Light
- **campaign_view.theme_dark:** Dark
- **campaign_view.theme_auto:** Automatic
- **campaign_view.output:** Output
- **campaign_view.output_help:** What an Agent’s tile shows. Terminal Mirror is the one that ships; Detailed, Condensed and Cherry Pick arrive with Ronin Services.
- **campaign_view.with_services:** Ronin Services
- **campaign_view.services_title:** Arrives with Ronin Services.
- **campaign_view.kind:** Kind
- **campaign_view.kind_help:** The default kind of work for a new Cowork or project here. Nothing reads it yet.
- **campaign_view.lexicon:** Lexicon
- **campaign_view.lexicon_help:** The words. Held to one lexicon for now, so nothing on this page is offered.
- **campaign_view.id:** Id
- **campaign_view.id_help:** Fixed once created — printed on every record that points here, so it cannot change.
- **campaign_view.agent_defaults:** Agent defaults
- **campaign_view.defaults_help:** These defaults land in the next Team or Agent form that opens. They remain editable there; nothing live changes.
- **campaign_view.provider_default:** Default provider
- **campaign_view.model_default:** Default model
- **campaign_view.default_reach:** Reach
- **campaign_view.default_recruit:** Recruit
- **campaign_view.default_output:** Output
- **campaign_view.default_dial:** Control
- **campaign_view.default_behaviours:** Behaviours
- **campaign_view.behaviours_help:** One shelf:name book per line.
- **campaign_view.defaults_summary:** {model} · {reach} · {dial}
- **campaign_view.option_open:** Open
- **campaign_view.option_discuss:** Discuss
- **campaign_view.option_plan:** Plan
- **campaign_view.option_execute:** Execute
- **campaign_view.option_nobody:** Nobody
- **campaign_view.option_propose:** Propose Agents
- **campaign_view.option_staff:** Staff Agents
- **campaign_view.option_a_plan:** A plan
- **campaign_view.option_ideas:** Ideas
- **campaign_view.option_code:** Code
- **campaign_view.option_artifact:** An artifact
- **campaign_view.option_no_code:** No code
- **campaign_view.option_team:** The Team
- **campaign_view.option_user:** You only
- **campaign_view.option_read:** Read
- **campaign_view.option_write:** Read and write
- **campaign_view.default_help:** The row a launch that names nothing starts from.
- **campaign_view.from_settei:** from SETTEI
- **campaign_view.col_provider:** Provider
- **campaign_view.col_model:** Preferred model
- **campaign_view.col_default:** Default
- **campaign_view.no_launch_table:** No launch table on this install.
- **campaign_view.roles:** Session roles
- **campaign_view.roles_summary:** What a launch here offers an Agent to be.
- **campaign_view.roles_help:** What a launch here offers an Agent to be. Templates for a whole Team do not exist yet.
- **campaign_view.roles_none:** No session roles on this install.
- **campaign_view.roles_loose:** No family
- **campaign_view.routines:** Routines
- **campaign_view.routines_help:** Choose what each new Cowork Agent starts with. Changes land in forms opened after this save; nothing already running or stored changes.
- **campaign_view.routines_n:** {n} on
- **campaign_view.routine_no_description:** No description supplied.
- **campaign_view.available:** Available
- **campaign_view.unavailable:** Unavailable
- **campaign_view.on:** On
- **campaign_view.off:** Off
- **campaign_view.rt_worktrees:** Ronin worktrees
- **campaign_view.rt_worktrees_what:** Desks, hand-in and team promotion: the desk reading, the tejun-desk tools, the git shims. On wherever a repository declares desks.
- **campaign_view.rt_by_repo:** per repository — see Project roots
- **campaign_view.rt_gbrain:** gbrain
- **campaign_view.rt_gbrain_what:** The shared memory service: its reading and its MCP tools for sessions born with it connected.
- **campaign_view.rt_koshi:** Koshi
- **campaign_view.rt_detail_koshi:** The smart fill behind launches and Mika.
- **campaign_view.rt_hotwords:** Hotwords
- **campaign_view.rt_hotwords_what:** The words dictation keeps mishearing, sent with your voice.
- **campaign_view.rt_present:** installed — no switch yet
- **campaign_view.rt_absent:** not installed
- **campaign_view.machine_summary:** The rest of the desk: Desk · Account · Archived · Messages · Help desk · Keypad.

## campaign_home — campaign-home.js (the root arrival: Machine Settings, Coworks, Launch)

- **campaign_home.machine_settings:** Machine Settings
- **campaign_home.campaign_is:** Admin Desk configuration
- **campaign_home.coworks_is:** Coworking space for Agents
- **campaign_home.launch:** Launch
- **campaign_home.launch_is:** Start a new Team or Agent
- **campaign_home.version:** v1.3
- **campaign_home.check_updates:** Check for updates
- **campaign_home.checking:** Checking…
- **campaign_home.check_unavailable:** Available after the next restart
- **campaign_home.up_to_date:** Up to date
- **campaign_home.update_available:** {version} available

## launch — launch-view.js (the Workbench where Teams and Agents begin)

- **launch.new_team:** New Team
- **launch.new_team_summary:** Define a Team, then launch its Agents.
- **launch.new_agent:** New Agent
- **launch.new_agent_summary:** Start an Agent in a Team or on its own.
- **forms.launch:** Launch
- **launch_mode.head:** launch mode
- **launch_mode.configured:** Model provider configuration
- **launch_mode.configured_sub:** Ronin adds nothing to the command. The Agent starts with whatever its provider CLI already loads.
- **launch_mode.live:** Dangerously
- **launch_mode.live_sub:** Ronin appends that provider’s own bypass flag, so the Agent does not stop to ask.
- **help.title:** Help
- **help.card_summary:** What each step means, beside the step you are on.
- **help.type:** New session
- **help.type_body:** Three kinds of thing can start here. A Cowork Agent is born into Ronin and gets the floor, its routines, its reading and its team. A bare-metal Agent is the provider’s own CLI and nothing else. A terminal is a pane with no agent in it at all. The choice decides which of the steps below exist — a terminal is asked three things because there are only three to ask.
- **help.top:** Name & kind
- **help.top_body:** The name is the only thing you must give. It is also the tag every session carries, so it is lowercase and typeable — the field enforces that as you type. A Team’s title is written for you from the name and is yours to change. The kind says what this is for, and it narrows the templates below to the ones that suit it.
- **help.template:** Template
- **help.template_body:** A template fills part of the form in and stops. Its answers become yours the moment they land — nothing stays linked, and you can change any of it. Make your own fills nothing in, and going back to it empties what a template wrote.
- **help.objective:** Common instructions
- **help.objective_body:** What everyone born onto this Team is told. The objective reaches them: it is written into the brief every new Agent reads at birth, in the Team’s own words.
- **help.instructions:** Instructions
- **help.instructions_body:** What this one Agent should do, in your words. It arrives as the first thing it reads.
- **help.team:** Team
- **help.team_body:** A new team is made first and the Agent is born into it. Joining an existing one lands that team’s answers in this form, which you can then change. No team is ordinary — a rōnin works alone and nothing is missing.
- **help.where:** Who and where
- **help.where_body:** The provider and model that open, and the folder they open in. The folder is where work starts, not a fence: an Agent reaches whatever it is asked to reach. A Team’s branch is the line its Agents hand work in to, and the lead promotes from it; blank means the Team’s own line.
- **help.mandate:** Mandate
- **help.mandate_body:** How far this Agent goes before it checks in, whether it may build out a team, and what it hands back. Open leads every one and means no requirement — it is not a gap.
- **help.loadout:** Tools and skills
- **help.loadout_body:** Launch mode decides what Ronin appends to the command that starts this Agent. Routines are resolved above and shown here with where each answer came from. Behaviours are documents you hand it at birth: the house’s own procedures, and the ways of working it can take.
- **help.kit:** Shared toolkit
- **help.kit_body:** What every Agent raised on this Team starts with. All of it lands in the next Agent form as an ordinary editable value — none of it is a constraint, and changing it here never touches a session already running.
- **help.lead:** Team lead
- **help.lead_body:** A lead is an offer, not a seat: a brief and a mandate that become a launch. Membership is never stored — a Team’s members are the live sessions carrying its tag.
- **new_team.common:** Common instructions
- **new_team.who_where:** Who and where
- **new_team.defaults_band:** Everything below this is the default for Agents launched within this team.
- **new_team.agents:** Agents
- **new_team.agents_meta:** {n} agents
- **new_team.agent_name:** name
- **new_team.agent_assignment:** what this Agent does
- **new_team.agent_lead_title:** Mark this Agent as the team lead
- **new_team.agent_more:** Its mandate
- **new_team.agent_drop:** Remove this Agent
- **new_team.agent_add:** ＋ Add an Agent
- **new_team.where:** Where
- **new_team.readable:** Title
- **launch.mode_team:** Team
- **launch.mode_agent:** Agent

## home — home.js (the status words and the launch receipt)
- **home.status_ready:** ready
- **home.status_thinking:** thinking…
- **home.status_awaiting_input:** awaiting input

## settei — settei.js (the ⚙ Configuration tab)
- **settei.saving:** saving…
- **settei.saved:** saved
- **settei.none_set:** — none set —
- **settei.unset_using:** unset — using {value}
- **settei.spec_not_installed:** {spec} — not installed
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
- **settei.group_projects:** projects · {n}
- **settei.dir_gone:** ✕ {dir} is gone
- **settei.projects_link:** Edit these in ▣ Project root — this room only shows them.
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
- **settei.use_gbrain:** use gbrain
- **settei.use_gbrain_hint:** tick this if your agents use it
- **settei.group_subscription:** subscription
- **settei.subscription:** subscription
- **settei.group_needed:** still needed
- **settei.needed_nothing:** nothing
- **settei.needed_satisfied:** your choices are satisfied
- **settei.setup_go:** start your setup session
- **settei.setup_started:** setup session started — see ⌂ Roster
- **settei.setup_failed:** could not start
- **settei.reading:** reading…

## new_team / team — new-team.js (the New Team surface; team.* rows are shared by the Team page family)
- **new_team.name:** Team name
- **new_team.role_placeholder:** development — or leave blank
- **new_team.role_desc:** Optional. Blank is an unclassified Team, which is a valid state.
- **team.objective:** Objective
- **team.repos:** Repositories
- **team.branch:** Branch
- **team.lines:** Team lines
- **team.promotion:** Promotion
- **team.parked_desks:** Parked desks
- **team.wipeboard:** Wipeboard
- **team.project_root:** Project root
- **team.command:** Command
- **team.control:** Control
- **team.mcp:** MCP
- **new_team.team_actions:** Team actions
- **team.team:** Team
- **team.roster:** Roster
- **team.status:** Status
- **team.mode:** Mode
- **team.role:** Role
- **new_team.name_invalid:** Lowercase letters, digits, _ and - only.
- **new_team.root_default:** — the box’s default —
- **new_team.title:** New Team

## new_team — new-team-form.js (the drawn raise form, staged beside the card above)
- **new_team.card_summary:** Template · kit · lead — the drawn form.
- **new_team.name_kind:** Name & kind
- **new_team.name_placeholder:** lowercase, digits, - _
- **new_team.objective_placeholder:** what this team is for
- **new_team.floor:** Cowork floor
- **new_team.floor_why:** The launch, campaign and team resolution, the shelf map, the birth receipt.
- **new_team.floor_tag:** floor
- **new_team.kit_meta:** {routines} routines · {books} books
- **new_team.lead_include:** Include a team lead
- **new_team.lead_include_sub:** Raised with the team and briefed.
- **new_team.lead_empty:** Open it empty
- **new_team.lead_empty_sub:** Ordinary. Add one whenever you like.
- **new_team.members:** members
- **new_team.members_note:** derived from live tags — never stored here
- **new_team.inherits:** an agent born here inherits
- **new_team.raising:** Raising the team…
- **new_team.save_name_placeholder:** template name
- **new_team.save_as_new:** Save as new template
- **new_team.saved_template:** Saved template {name}

## forms — form-steps.js (the drawn form idiom shared by New Team and New Agent)
- **forms.own:** Make your own
- **forms.own_blurb:** Fresh and empty. Fill it in yourself.
- **forms.library:** From the Ronin library
- **forms.library_blurb:** Published bundles, pulled in and run. Not yet built.
- **forms.default:** default
- **forms.provider:** model provider
- **forms.model:** model
- **forms.none:** —
- **forms.always:** always
- **forms.campaign_on:** campaign on
- **forms.campaign_off:** campaign off
- **forms.team_on:** team turns on
- **forms.team_off:** team turns off

## new_agent — new-agent.js (the drawn launch form, staged beside the ＋ New board)
- **new_agent.title:** New Agent
- **new_agent.card_summary:** Session type first — the drawn launch form.
- **new_agent.new_session:** New session
- **new_agent.type_cowork:** Cowork Agent
- **new_agent.type_cowork_sub:** Born into Ronin: the floor, its routines, its reading and its team.
- **new_agent.type_bare:** Bare-metal Agent
- **new_agent.type_bare_sub:** The provider’s agent and nothing else — no floor, no routines, no reading.
- **new_agent.type_terminal:** Terminal
- **new_agent.type_terminal_sub:** A raw tmux pane. No agent is launched and nothing is sent to it.
- **new_agent.name_model_kind:** Name, model & kind
- **new_agent.name_model:** Name & model
- **new_agent.name_where_model:** Name, where & model
- **new_agent.name_where:** Name & where
- **new_agent.name_placeholder:** name
- **new_agent.terminal_note:** A terminal takes no kind, no instructions, no mandate and no loadout.
- **new_agent.bare_note:** A bare-metal Agent takes no kind, no mandate and no loadout.
- **new_agent.instructions:** Instructions
- **new_agent.team_existing:** An existing team
- **new_agent.team_existing_sub:** Join it. Its answers land at birth.
- **new_agent.team_none:** No team — a rōnin
- **new_agent.team_none_sub:** Ordinary, not a gap.
- **new_agent.team_new:** A new team
- **new_agent.team_new_sub:** Created first, then this Agent is born into it.
- **new_agent.team_new_blank:** Blank makes no team — the Agent is a rōnin.
- **new_agent.a_ronin:** a rōnin
- **new_agent.loadout_meta:** {routines} routines · {books} books
- **new_agent.shelf_house:** behaviours · the house
- **new_agent.shelf_ways:** behaviours · ways of working
- **new_agent.session:** session
- **new_agent.created_first:** (created first)
- **new_agent.routines_terminal:** agent: none — a pane
- **new_agent.routines_bare:** no floor, no routines
- **new_agent.blank_note:** A blank field is an answer, not a gap.

## team_wipeboard — team-wipeboard.js (the team wipeboard channel on the Team page)
- **team_wipeboard.placeholder:** say something to the team — every member is interrupted
- **team_wipeboard.post:** Post
- **team_wipeboard.no_notice:** → (no notice)
- **team_wipeboard.cleared:** … earlier posts have cleared
- **team_wipeboard.empty:** Nothing on the board right now — posts clear after 48 hours.
- **team_wipeboard.read_failed:** Could not read the board — {message}
- **team_wipeboard.post_failed:** Could not post — {message} (your text is still in the box)
- **team_wipeboard.no_team:** No Team resolved — nothing to read.

## desks — desks.js (the ⑂ desk readings: tile head, roster column, Team page)
- **desks.detached:** (detached)
- **desks.worktree:** worktree {path}
- **desks.count_one:** 1 desk
- **desks.count_many:** {n} desks
- **desks.pending_n:** {n} pending
- **desks.private_n:** {n} private
- **desks.dirty_n:** {n} dirty
- **desks.parked_n:** {n} parked
- **desks.blocked_n:** {n} blocked
- **desks.none:** No desk listed yet. A coding launch opens one; the session lists its repos in TEGAMI.
- **desks.line:** → {line}
- **desks.ahead:** ahead {n}
- **desks.behind:** behind {n}
- **desks.dirty_files:** {n} unsaved
- **desks.pending_by:** update pending, by {who}
- **desks.parked:** parked
- **desks.unknown:** not found on this box
- **desks.blocked:** blocked: {why}
- **desks.promotion_blocking:** ⚠ {state} — {summary} ({id})
- **desks.promotion_last:** last {summary} · {id} · by {who}
- **desks.promotion_none:** none yet
- **desks.parked_gone:** {name} · gone · {n} ahead
- **desks.parked_none:** none

## team — team-view.js (the Team page)
- **team.flip_commons:** Show the Team commons in this workspace
- **team.flip_terminal:** Show the terminal in this workspace
- **team.workspace_1:** Workspace 1
- **team.workspace_2:** Workspace 2
- **team.commons_card:** Team commons
- **team.commons_summary:** See Docs / Wipeboard / Agent Message Queue / Team Configuration
- **team.roster_of:** Roster: {team}
- **team.workspace_blank:** Workspace
- **team.new_session:** New session
- **cowork.tab_roster:** Roster
- **cowork.tab_archives:** Archived
- **glossary.new_session:** new session
- **team.workspace_3:** Workspace 3
- **team.workspace_4:** Workspace 4
- **team.count_2_title:** Two workspaces around the roster
- **team.count_4_title:** Four workspaces, two by two
- **team.roster_title:** Roster
- **team.commons:** Team commons
- **team.arranged_by:** arranged by {from}
- **team.attached:** attached
- **team.add_member:** ＋ Add team member
- **team.add_member_summary:** A new session, born into the workspace you are in.
- **team.none_selected:** No Team selected
- **team.state:** State
- **team.record:** Record
- **team.record_tag_only:** tag-only — no durable roster; the team is its sessions’ tags
- **team.live_roster_n:** Live roster · {n}
- **team.live_roster_none:** Live roster · none
- **team.lead_none:** not designated
- **team.none_selected_dot:** No Team selected.
- **team.reading:** Reading the Team…
- **team.read_failed:** Could not read this Team — {message}
- **team.no_live:** No live sessions on this Team.

## services — services-card.js (the Services activation card)
- **services.stage_not_requested:** Not requested
- **services.stage_not_requested_blurb:** Ronin Services are not switched on for this machine.
- **services.stage_requesting:** Sending…
- **services.stage_requesting_blurb:** Asking Ronin to send your confirmation email.
- **services.stage_awaiting_email:** Check your email
- **services.stage_awaiting_email_blurb:** Open the link we sent. Any device is fine — your phone works.
- **services.stage_verified:** Email confirmed
- **services.stage_verified_blurb:** Ronin has what it needs. Services install next.
- **services.stage_installing:** Installing Services
- **services.stage_installing_blurb:** This machine is fetching and verifying the download.
- **services.stage_installed:** Services are ready
- **services.stage_installed_blurb:** Nothing further to do.
- **services.stage_expired:** This link expired
- **services.stage_expired_blurb:** Ask for a fresh confirmation email below.
- **services.stage_cancelled:** Request cancelled
- **services.stage_cancelled_blurb:** Nothing was switched on, and the address was not kept.
- **services.stage_address_changed:** Address changed
- **services.stage_address_changed_blurb:** A new confirmation email is on its way.
- **services.stage_error:** Waiting to send
- **services.stage_error_blurb:** Ronin HQ could not be reached. This will retry.
- **services.unreachable:** could not reach the operator
- **services.entitlement:** entitlement
- **services.email:** Your email address
- **services.disclosure:** Ronin receives this address, the accepted terms version, and a request from 
- **services.send_confirmation:** Send confirmation email
- **services.check_status:** Check status
- **services.resend:** Resend
- **services.change_address:** Change address
- **services.cancel_request:** Cancel request
- **services.resend_after:** you can resend after {time}
- **services.change_and_retry:** Change address and try again
- **services.install_now:** Install Services now
- **services.egress_summary:** what this machine has sent ({n})
- **services.working:** working…
- **services.failed:** that did not work
- **services.new_address_prompt:** New email address for Ronin Services

## services — services-activation.js (the bar's Services state and pop-over)
- **services.resend_confirmation:** Resend confirmation
- **services.change_email:** Change email
- **services.cancel_services:** Cancel Ronin Services
- **services.bar_ready:** Services ready
- **services.bar_installing:** Installing Ronin Services…
- **services.bar_verified:** Confirmation received
- **services.bar_awaiting_email:** Email confirmation required
- **services.bar_expired:** Services confirmation expired
- **services.bar_error:** Ronin Services needs attention
- **services.confirmation_address:** Confirmation address: {email}
- **services.activation:** Ronin Services activation
- **services.checking:** Checking…
- **services.sending:** Sending…
- **services.cancelling:** Cancelling…
- **services.new_confirmation_prompt:** Send the new confirmation to:
- **services.changing:** Changing…

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
- **machine.scope:** scope
- **machine.scope_container:** container limit
- **machine.scope_note:** These are this container’s numbers, not the host’s.
- **machine.unavailable:** not readable here
- **machine.unavailable_note:** This system does not expose these, so they are left unanswered rather than reported as zero.
- **machine.read_failed:** Could not read the machine just now.
- **machine.refresh:** Refresh
- **machine.refresh_title:** Read the machine again now
- **machine.stop:** Stop watching
- **machine.stop_title:** Stop gathering machine readings and hide the gauge. Nothing was installed on the box, so there is nothing to undo — turn it back on whenever you like.
- **machine.stopped:** Off. Reload to clear the gauge.
- **machine.save_failed:** Could not save that.

## gbrain — gbrain.js (the gbrain commons tab)
- **gbrain.running:** ● running
- **gbrain.stopped:** ○ stopped
- **gbrain.vm_only:** VM only
- **gbrain.network:** network reachable
- **gbrain.none:** none
- **gbrain.off:** off
- **gbrain.on:** on
- **gbrain.unknown:** unknown
- **gbrain.intro:** What is running, what can leave this VM, and what gbrain can draw from.
- **gbrain.refresh:** ↻ Refresh
- **gbrain.n_connected:** {n} connected
- **gbrain.process:** Local gbrain process
- **gbrain.listening:** Listening
- **gbrain.provider:** External model provider
- **gbrain.integrations:** Integrations
- **gbrain.public_access:** Public access
- **gbrain.privacy_head:** Privacy and reach
- **gbrain.details:** Local details
- **gbrain.endpoint:** {address}:{port} · gbrain {version} · observed {time}
- **gbrain.version_unknown:** version unknown
- **gbrain.search_head:** Search
- **gbrain.embeddings:** Local embeddings
- **gbrain.model:** Model
- **gbrain.dimensions:** Dimensions
- **gbrain.retrieval_hybrid:** hybrid (keyword + semantic)
- **gbrain.retrieval_keyword:** degraded — keyword only
- **gbrain.retrieval:** Retrieval
- **gbrain.answers_on:** gbrain composition available
- **gbrain.answers_off:** composed by the agent (by design)
- **gbrain.answers:** Answers
- **gbrain.reason:** Reason
- **gbrain.integrations_unread:** Integration status could not be read.
- **gbrain.ask_assistant:** Ask PersonalAssistant
- **gbrain.not_installed:** gbrain is not installed
- **gbrain.removing:** Removing
- **gbrain.installing:** Installing
- **gbrain.removing_detail:** running — units, wiring, shelves (your brain repo is kept)
- **gbrain.installing_detail:** running — weights, gbrain, cabinet, wiring
- **gbrain.remove:** Remove
- **gbrain.install:** Install
- **gbrain.failed_detail:** failed — the log below says where
- **gbrain.install_pitch:** One press installs everything: the local embedding weights, gbrain itself (pinned), your brain repo, the server, and the session wiring. Downloads come from github.com and huggingface.co; nothing else leaves the VM.
- **gbrain.retry_install:** Retry install
- **gbrain.load:** Load gbrain
- **gbrain.remove_button:** Remove gbrain…
- **gbrain.remove_confirm:** Remove gbrain from this machine? The server, tokens, wiring and shelves go; your brain repo and its pages are KEPT.
- **gbrain.checking:** checking…
- **gbrain.status:** gbrain status

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
- **pad.ask_sheet:** Macro arguments
- **pad.ask_placeholder:** Enter sends · Esc cancels
- **pad.ask_label:** macro arguments
- **pad.sheet:** Work Louder pad
- **pad.title:** ▦ Work Louder
- **pad.press_key:** press a pad key…
- **pad.capture:** ⊕ Capture
- **pad.close:** Close
- **pad.args_placeholder:** args (k=v …) — optional
- **pad.ask_on_press:** ask on press
- **pad.ask_on_press_title:** Every press pops a prompt for the args (e.g. buildout) — Enter fires
- **pad.save:** Save
- **pad.key_title:** key {chord}
- **pad.unbound:** — unbound —
- **pad.group_macros:** ⚡ macros
- **pad.group_keys:** ⌨ keys (to the active tile)
- **pad.active_tile:** ▸ active tile
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
- **pad.key_esc:** ⎋ Esc
- **pad.key_tab:** ⇥ Tab
- **pad.key_shift_tab:** ⇧⇥ Shift-Tab
- **pad.key_up:** ↑ Up
- **pad.key_down:** ↓ Down
- **pad.key_left:** ← Left
- **pad.key_right:** → Right
- **pad.key_interrupt:** ^C Interrupt
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

## roots — projectroots.js (the ▣ Project roots tab)
- **roots.add:** ＋ Add a project root
- **roots.add_hint:** A directory on this machine that Agents here may work in.
- **roots.add_save:** Add
- **roots.read_failed:** could not read the catalog — {message}
- **roots.save:** save
- **roots.cancel:** cancel
- **roots.edit:** edit
- **roots.archive_failed:** could not archive it — {message}
- **roots.exclude:** exclude
- **roots.exclude_title:** Remove it from the catalog. Nothing on disk is touched.
- **roots.exclude_confirm:** Exclude "{name}" from your Ronin?

The catalog entry goes. {dir} is not touched.
- **roots.exclude_failed:** could not exclude it — {message}
- **roots.empty:** No project roots yet — add one below.
- **roots.loading:** loading…
- **roots.chip_reviewed_desks:** reviewed · desks
- **roots.chip_reviewed:** reviewed
- **roots.chip_direct:** direct
- **roots.chip_reviewed_title:** Reviewed: work happens at desks that hand in to a team line; team promotion moves {working}; {stable} moves by PR. The branch mounted here is incidental.
- **roots.chip_direct_title:** Direct: commits land on {stable} itself. No desks, no team line.
- **roots.chip_shared:** shared checkout
- **roots.chip_shared_title:** No RONIN_REPO record: sessions share this checkout and the claim hook guards the index. Add the record to declare reviewed desks or direct publishing.

## docs — docs.js (the ▧ Docs tab)
- **docs.back_title:** Back to the list
- **docs.save:** Save
- **docs.pill_tracked:** Tracked
- **docs.pill_plans:** Plans
- **docs.pill_docs:** Docs
- **docs.shelf_empty:** Nothing on this shelf — a project root names its places on its record (Project roots → docs / plans).
- **roots.f_docs:** docs
- **roots.f_docs_hint:** Where this root keeps its documentation — directories or files, relative to the directory
- **roots.f_plans:** plans
- **roots.f_plans_hint:** Where this root keeps its build-out plans
- **roots.f_mode:** publishing
- **roots.f_mode_hint:** Reviewed uses a working branch and a final PR to stable. Direct publishes on stable itself.
- **roots.mode_reviewed:** reviewed release
- **roots.mode_direct:** direct publishing
- **roots.f_working:** working
- **roots.f_working_hint:** The integration branch for reviewed work. You choose its name.
- **roots.f_stable:** stable
- **roots.f_stable_hint:** The published branch. You choose its name.
- **roots.f_coordination:** coordination
- **roots.f_coordination_hint:** Managed supplies private desks and hand-in. None uses the repository checkout.
- **roots.desks_managed:** managed
- **roots.desks_none:** none
- **roots.profile_confirm:** Rewrite RONIN_REPO with this repository profile?\n\nBefore:\n{before}\n\nAfter:\n{after}\n\nRunning Agents may still have the earlier instructions.
- **docs.open_browser:** Open in browser ↗
- **docs.frame_title:** document
- **docs.discard_confirm:** Discard unsaved changes?
- **docs.loading:** loading…
- **docs.saving:** saving…
- **docs.saved:** saved
- **docs.work_record_note:** Ask an agent to list a document with write_tegami --doc <path>. If a document is missing, ask the agent to update its work record.

## roots — the count line and chips
- **roots.chip_archived:** archived
- **roots.chip_archived_title:** Off the new-session picker. Still here, and still launchable by name.
- **roots.chip_gone:** directory is gone
- **roots.chip_gone_title:** Nothing on disk at this path — fix the path or exclude it
- **roots.chip_no_remote:** repo, no remote
- **roots.chip_no_remote_title:** A git repo with no origin
- **roots.chip_no_repo:** no repo
- **roots.chip_no_repo_title:** Not a git repo — legal, a project_root need not be one
- **roots.sessions_one:** {n} session
- **roots.sessions_many:** {n} sessions
- **roots.unarchive:** unarchive
- **roots.archive:** archive
- **roots.unarchive_title:** Put it back on the new-session picker.
- **roots.archive_title:** Take it off the new-session picker. It stays on this pane, and sessions already using it are untouched.
- **roots.count_one:** {n} project_root
- **roots.count_many:** {n} project_roots
- **roots.count_archived:** {n} archived
- **roots.untagged_one:** {n} untagged session
- **roots.untagged_many:** {n} untagged sessions

## stats — stats.js (the ▦ Stats tab)
- **stats.win_today:** Today
- **stats.win_week:** This week
- **stats.win_month:** This month
- **stats.win_all:** All time
- **stats.cap_forks:** forks
- **stats.cap_teams:** teams
- **stats.cap_board_posts:** wipeboard posts
- **stats.cap_board_reads:** wipeboard reads
- **stats.cap_voice:** voice
- **stats.cap_pad:** pad
- **stats.cap_copy:** copy panel
- **stats.faults_many:** ⚠ {n} stats probes are broken — counting has stopped for these. Paste this into a session to fix.
- **stats.faults_one:** ⚠ {n} stats probe is broken — counting has stopped for this. Paste this into a session to fix.
- **stats.range:** {from} → {to} · {days} days
- **stats.sessions:** Sessions
- **stats.active_days:** Active days
- **stats.live_now:** Live now
- **stats.peak:** peak {n}
- **stats.teams:** Teams
- **stats.migrated:** {n} migrated · {list}
- **stats.mek:** Task at birth × task at death
- **stats.started:** {n} started
- **stats.doing_now:** Doing right now
- **stats.born:** Born
- **stats.ended:** Ended
- **stats.lifetime:** Lifetime
- **stats.ctx_unused:** Context unused at close
- **stats.model:** Model
- **stats.ladder_height:** Work record progress
- **stats.at_gate:** {n} at a gate — waiting on you
- **stats.plan_docs:** Plan docs
- **stats.plans_in_flight:** in flight
- **stats.plans_landed:** landed
- **stats.plans_legs_done:** legs completed
- **stats.plans_stale:** stale 14d+
- **stats.plans_legs_median:** legs per plan (median)
- **stats.ladders_plans:** Work records & plans
- **stats.n_live:** {n} live
- **stats.surfaces:** Ronin surfaces
- **stats.macro_runs:** {n} macro runs
- **stats.macros:** Macros
- **stats.ui:** UI
- **stats.capabilities:** Capabilities
- **stats.unreachable:** Stats could not be read.
- **stats.unavailable:** Stats are not available on this install yet.

## setup — cowork-setup.js (the one-time cowork_setup page)
- **setup.campaign:** Campaign
- **setup.campaign_lede:** The body of work this Ronin configuration serves.
- **setup.campaign_name:** Campaign name
- **setup.campaign_description:** Description
- **setup.campaign_description_placeholder:** What this campaign is for
- **setup.machine:** This machine
- **setup.you:** You
- **setup.you_lede:** The name Ronin and your Agents use when they address you.
- **setup.kind:** Kind
- **setup.kind_lede:** What do you want to use this app for?
- **setup.routine_bundles:** Routine Bundles
- **setup.routine_bundles_lede:** Choose how much Ronin hands to each new Agent.
- **setup.recommended_short:** recommended
- **setup.bundle_nothing:** Nothing
- **setup.bundle_nothing_copy:** Your agents start clean — no reading, no shared macros, no records. Just the CLI.
- **setup.bundle_floor:** The floor
- **setup.bundle_floor_copy:** Ronin still sets each agent up and keeps its birth receipt, but hands it nothing extra.
- **setup.bundle_base:** Ronin Base
- **setup.bundle_base_copy:** Your agents arrive knowing the house: basic reading you can open and edit, simple macros for talking to each other, shared work records.
- **setup.bundle_worktrees:** Ronin Worktrees
- **setup.bundle_worktrees_copy:** Adds managed repositories: every agent codes at its own private desk — a git worktree — so there are no code collisions, and work is handed in deliberately.
- **setup.bundle_services:** Services
- **setup.bundle_services_copy:** Adds your Services to every agent — voice, transcripts, machine care.
- **setup.desk_profile:** Desk profile
- **setup.desk_profile_hint:** The look, the words, and how much terminal detail your workspace shows.
- **setup.desk_profile_stock:** Stock
- **setup.step:** cowork setup · nothing is saved yet
- **setup.connected:** YOU’RE CONNECTED
- **setup.connected_tail:** — Ronin is live on your machine.
- **setup.hero:** Make this coworkspace yours.
- **setup.hero_lede:** Tell Ronin Cowork who you are, where your work lives, and which agents you want here. You can change all of this later.
- **setup.running_on:** Running privately on {host}
- **setup.this_machine:** this machine
- **setup.stage_first:** First
- **setup.stage_first_title:** Set up your coworkspace
- **setup.identity:** Name your coworkspace
- **setup.identity_lede:** This is how you’ll recognize this machine in your roster.
- **setup.machine_name:** Coworkspace name
- **setup.machine_name_hint:** The machine’s real hostname will not change.
- **setup.machine_name_placeholder:** The workshop
- **setup.owner_name:** What should Ronin call you?
- **setup.owner_name_hint:** Mika and your working agents use this name.
- **setup.owner_name_placeholder:** Your name
- **setup.machine_details:** Machine details
- **setup.cores:** {n} cores
- **setup.memory:** {n} GB memory
- **setup.agents:** Your agents
- **setup.agents_lede:** Agents already found here are ready. Select any others you want RoninCoWork to add.
- **setup.col_agent:** Agent
- **setup.col_when_saved:** When you save
- **setup.col_status:** Status
- **setup.agent_ready:** Nothing—already ready.
- **setup.agent_installed:** Installed
- **setup.agent_install_if:** Install if selected.
- **setup.agent_available:** Available to add
- **setup.agent_needs_sudo:** Nothing—vendor installer needs sudo.
- **setup.agent_manual:** Manual install
- **setup.agent_details:** Installation details
- **setup.agent_why_not:** Why Ronin can’t install it
- **setup.agent_will_run:** {from}. RoninCoWork will run {command} on this machine.
- **setup.defaults:** How new sessions should start
- **setup.defaults_lede:** This is only the default. You can choose something different each time.
- **setup.model:** Start new sessions with
- **setup.model_hint:** These are the runnable models in Ronin’s launch catalog. A saved choice wins when one exists.
- **setup.mika:** Mika uses
- **setup.mika_hint:** The same runnable launch catalog supplies this list. A light model is recommended for Mika.
- **setup.recommended:** {model} (recommended)
- **setup.cap:** Maximum agent sessions
- **setup.cap_hint:** ≈700 MB per agent. Ronin reserves 25% (minimum 2 GB). Shells don’t count.
- **setup.cap_none:** No limit — allow any number
- **setup.cap_estimate:** {n} — Ronin estimate for this {ram} GB machine
- **setup.cap_n:** {n} agent sessions
- **setup.services_lede:** Extra capabilities for your coworkspace. Base RoninCoWork works fully without them.
- **setup.optional:** Optional
- **setup.services_intro_strong:** Keep the work on your machine, add the view around it.
- **setup.services_intro:** Services add live agent plans, readable transcripts, voice, usage history, and long-term memory.
- **setup.feature_gbrain:** Long-term agent memory
- **setup.services_start:** Start Ronin Services activation
- **setup.services_start_copy:** Ronin will send your email address, this terms version, and an activation request.
- **setup.email:** Email for the confirmation
- **setup.services_active:** Ronin Services are active
- **setup.services_in_progress:** Ronin Services activation is already in progress
- **setup.services_status:** Current status: {stage}.
- **setup.email_recorded:** Email already recorded securely
- **setup.activation_flow:** 1. Ronin emails a link → 2. You confirm the terms → 3. Services install.
- **setup.terms:** Confirming accepts the Services terms: share anonymous operating measurements—never your code or conversations—and don’t resell the Services. Declining sends nothing.
- **setup.gbrain_link:** Garry Tan’s open-source agent memory
- **setup.gbrain_copy:** . Agents search it before answering and add to it as they work. To keep your data local and serve gbrain, Ronin provides a local embeddings model that requires about 0.3 GB.
- **setup.gbrain_use:** Use gbrain memory
- **setup.stage_then:** Then
- **setup.stage_then_title:** Start your first project
- **setup.project:** What would you like to work on first?
- **setup.project_lede:** Leave it empty and add projects later from ▣ Roots — or give a folder and RoninCoWork registers it as your first project.
- **setup.folder:** Working folder
- **setup.folder_hint:** Pick from the suggestions or type the path — ~ is your home folder. It must already exist; RoninCoWork will not create or clone it.
- **setup.git_repo:** Git repository:
- **setup.git_unchecked:** Not checked yet — Git is optional
- **setup.short_name:** Short name (Optional)
- **setup.short_name_hint:** Left empty, the folder’s name is used. Lowercase letters, numbers, hyphens or underscores; at most 32 characters.
- **setup.purpose:** What are you working on? (Optional)
- **setup.purpose_hint:** One sentence gives agents useful context.
- **setup.purpose_placeholder:** A customer support dashboard
- **setup.review_stage:** When you save
- **setup.review_lede:** Review what RoninCoWork will do.
- **setup.review_owner:** Ronin will call you
- **setup.review_ready:** Ready agents · detected
- **setup.review_add:** RoninCoWork will install · consequence
- **setup.review_model:** New sessions start with
- **setup.review_gbrain:** gbrain memory
- **setup.review_project:** First project
- **setup.review_repo:** Git repository · detected
- **setup.review_purpose:** What are you working on?
- **setup.save:** Save and open RoninCoWork
- **setup.save_note:** You can change these choices later.
- **setup.use_value:** Use {value}
- **setup.the_hostname:** the hostname
- **setup.the_machine_user:** the machine user
- **setup.none_detected:** None detected
- **setup.install_in_tiles:** {agents} — install in visible tiles
- **setup.no_model:** No runnable model detected
- **setup.services_already:** Already selected · {stage}
- **setup.services_begin_for:** Begin activation for {email}
- **setup.services_begin_after:** Begin activation after you enter an email
- **setup.services_not_selected:** Not selected — nothing will be sent
- **setup.gbrain_selected:** Add local embeddings model · about 0.3 GB
- **setup.not_selected:** Not selected
- **setup.project_derived:** Use "{name}" — the folder's name
- **setup.project_skipped:** Skipped — add projects later from ▣ Roots
- **setup.none:** None
- **setup.no_description:** No description yet
- **setup.git_checking:** Checking this folder…
- **setup.folder_missing:** Folder does not exist
- **setup.git_local:** Local Git repository
- **setup.git_branch:** branch {branch}
- **setup.folder_no_git:** Existing folder · Git is optional
- **setup.err_folder_needed:** A project needs its working folder — add it, or clear the name to skip.
- **setup.err_short_name:** The short name: lowercase letters, numbers, hyphens or underscores — or leave it empty.
- **setup.err_folder_missing:** The working folder must already exist on this machine.
- **setup.err_email:** Enter the email address for Services confirmation.
- **setup.saving:** Saving…
- **setup.note_activation:** Services activation needs attention in the workspace.
- **setup.err_not_recorded:** could not record setup as finished — try Save again
- **setup.note_installs:** Agent installs can be retried from Configuration.
- **setup.saved:** Saved. Opening RoninCoWork…

## customize — customize-rail.js (the Customize rail's sections and resources)
- **customize.sec_behavior:** Behavior
- **customize.sec_people:** People & work
- **customize.sec_presentation:** Presentation
- **customize.macros:** Macros
- **customize.macros_what:** a workflow an agent runs when you type +name:
- **customize.macros_blurb:** Saved instructions you would otherwise have typed to your agent.
- **customize.sops:** SOPs
- **customize.sops_read:** Read procedure
- **customize.sops_blurb:** How this house goes about a domain — fetched by a situation, never pushed.
- **customize.actions:** Actions
- **customize.actions_read:** Read action
- **customize.actions_what:** a primitive step macros are composed from
- **customize.actions_blurb:** The cataloged procedures macros are made of.
- **customize.tools:** Tools
- **customize.tools_why:** TOOLS.md is a table, and the server has no table reader — the rule in docs/shadowing.md is implemented in ronin_bin/tejun and not in src/catalog.ts (prerequisite P1).
- **customize.tools_blurb:** The executables that implement actions. A markdown row cannot author one.
- **customize.role_families:** Role families
- **customize.role_families_blurb:** The shelves of the ＋ New board. Presentation only — a family never rides a launch.
- **customize.session_roles:** Session roles
- **customize.session_roles_blurb:** What a session is doing now. Its fields cascade into every launch.
- **customize.saved_launches:** Saved launches
- **customize.saved_launches_blurb:** The launcher form, filled in ahead of time and named.
- **customize.skins:** Skins
- **customize.skins_what:** a look — a set of design tokens, and nothing else
- **customize.skins_blurb:** A set of design tokens and nothing else. Choosing one is a setting, and stays on the gear.
- **customize.readings:** Session readings
- **customize.readings_read:** Read reading
- **customize.readings_blurb:** What a new session reads before anything else. A reading you add reaches the next session born, never a running one.

## customize — customize.js
- **customize.title:** Customize
- **customize.rail_label:** Customize resources

## customize — customize-resources.js
- **customize.unavailable:** Not available in this preview.
- **customize.reading:** reading…
- **customize.read_failed:** could not read — {message}
- **customize.not_a_list:** the route did not answer with a list
- **customize.empty:** Nothing here yet. That is an ordinary state, not a fault.
- **customize.roles_not_a_list:** the session-role route did not answer with a list
- **customize.roles_read_failed:** could not read session roles — {message}
- **customize.read_entry:** Read entry

## customize — customize-role-families.js
- **customize.family_warning:** Changing a shipped family makes the whole definition yours; later improvements to Ronin’s copy stop reaching it.
- **customize.family_summary:** Choose which session roles this Family presents.
- **customize.pinned_first:** pinned first: {role}
- **customize.saving_membership:** Saving membership…
- **customize.membership_saved:** Membership saved.
- **customize.membership_bar:** {family} membership

## customize — customize-handoff.js
- **customize.handoff_head:** Making it yours
- **customize.handoff_read_only:** One file per {thing}, named by its token, in your catalogs store under {dir}. Ronin cannot create that file for you yet — ask your agent to add one, and point it at the directory’s own README, which states the format and every field.
- **customize.handoff_store_hint:** Ask for the store path with: bin/ronin-store catalogs — never spell it by hand.
- **customize.handoff_ask_agent:** Ask your agent to add one.

## pane — panes.js (the pane registry's tab labels)
- **pane.sessions:** ⌂ Roster
- **pane.archives:** Archived
- **pane.new:** ＋ New session
- **pane.wipe:** ▤ Wipeboard
- **pane.docs:** ▧ Docs
- **pane.settei:** Configuration
- **pane.proj:** Project roots
- **pane.hotwords:** Hotwords
- **pane.koshi:** Koshi
- **pane.gbrain:** gbrain
- **pane.stats:** Stats

## desk — desk.js (the desk's rows and tooltips)
- **cowork.commons:** Ronin Desk
- **cowork.tab_health:** Desk
- **cowork.tab_account:** Account
- **cowork.tab_profile:** Desk profile
- **cowork.tab_roots:** Project roots
- **cowork.tab_help:** Help desk
- **cowork.tab_keypad:** Keypad
- **cowork.tab_messages:** Messages
- **messages.empty:** No messages are waiting.
- **messages.note:** Sometimes Agent-to-Agent messages get stuck and need your help. Try Again is gentle; Force gives it one determined shove. 😉
- **messages.to:** To {target}
- **messages.meta:** {source} · {attempts} attempts · waiting {age}
- **messages.waiting:** waiting
- **messages.age_now:** just now
- **messages.age_seconds:** {count} seconds
- **messages.age_minute:** 1 minute
- **messages.age_minutes:** {count} minutes
- **messages.age_hour:** 1 hour
- **messages.age_hours:** {count} hours
- **messages.age_days:** {count} days
- **messages.retry:** Try Again
- **messages.force:** Force
- **messages.dismiss:** Dismiss
- **messages.trying:** Trying…
- **messages.forcing:** Forcing…
- **messages.dismissing:** Dismissing…
- **messages.delivered:** Delivered and cleared.
- **messages.dismissed:** Message dismissed.
- **messages.retained:** Still waiting — {reason}
- **messages.action_failed:** Message action failed — {reason}
- **cowork.h_configuration:** Configuration
- **cowork.h_appearance:** Appearance
- **cowork.h_release:** Release & update
- **cowork.h_hotwords:** Hotwords
- **cowork.h_koshi:** Koshi
- **cowork.h_gbrain:** gbrain
- **cowork.h_log_out:** Log out
- **cowork.h_mika:** Mika Assist
- **cowork.mika_button:** ミ Ask Mika
- **cowork.mika_text:** Ask about Ronin itself — how it works, project roots, starting a session, changing a setting. She starts if she is not up.
- **cowork.keypad_missing:** The keypad did not build on this page.

## desk — the install group heading

## dial / gauge / mark — widgets.js (the control dial, the context gauge, the role menu)
- **gauge.used:** ⛽ {label} {pct}% used
- **dial.user:** Owner only
- **dial.user_help:** Owner only — outside agents may not read or type here
- **dial.read:** Outside agents: watch
- **dial.read_help:** Outside agents may watch this session, not type into it
- **dial.write:** Outside agents: type
- **dial.write_help:** Outside agents may type into this session

## tape — tapeview.js (the RIREKI tape view)
- **tape.summarize_now:** Summarize now
- **tape.summary_policy:** Summary production
- **tape.policy_on_demand:** On demand
- **tape.policy_keep_current:** Keep current
- **tape.jump_title:** Jump to the latest output — the deterministic way back to the bottom, whatever the scroll is doing.
- **tape.jump:** ↓ latest
- **tape.fold_code:** ⌨ code

## ladder — shingo.js (the ladder chip and panel)
- **ladder.task_at_hand:** Task at hand
- **ladder.task_unstated:** No task stated in this work record.
- **ladder.current_action:** Current action
- **ladder.worktrees:** Worktrees
- **ladder.branch:** Branch
- **ladder.coworks:** Coworks
- **ladder.tracked_documents:** Tracked documents
- **ladder.docs_none:** No tracked documents.
- **ladder.progress:** Progress
- **ladder.none:** no work record yet
- **ladder.gate:** GATE
- **ladder.legs_undetermined:** — legs undetermined

## tile — tile.js (the Agent terminal tile)

## macros — tilemacros.js (the ⚡ menu)
- **macros.button_title:** Macros — drop one into this session's input
- **macros.cooldown:** sent — wait {s}s before sending it again
- **macros.none_previewed:** no macros previewed — see MACROS.md

## composer — composer.js
- **composer.placeholder:** Message…
- **composer.title:** Enter sends · Shift+Enter or Option+Enter for a new line
- **composer.mic_title:** Dictate into this box — tap again to stop, then ↵ to send
- **composer.send:** Send

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
- **archives.delete_aria:** Permanently delete archived session {name}
- **archives.delete_title:** Hard delete this archive
- **archives.delete_confirm:** Hard delete archived session "{name}"? Its saved Ronin record cannot be rehydrated after this.

## retire — session-retire.js (the tile's retire sheet)
- **retire.sheet:** Retire {name}
- **retire.copy:** Archive stops the session and frees its RAM, while keeping it available to rehydrate. Hard delete permanently removes its Ronin record.
- **retire.archive:** Archive
- **retire.hard_delete:** Hard delete

## retire — the working words
- **retire.archive_failed:** could not archive it
- **retire.archiving:** archiving…
- **retire.delete_failed:** could not hard delete it
- **retire.deleting:** deleting…

## customize — the shadow-trade notice
- **customize.shadow_trade:** Changing one of Ronin’s own entries makes it yours: it moves to your catalogs store, 

## provenance — provenance.js (the add-your-own button)
- **provenance.add_own:** ＋ add your own {what}
- **provenance.add_own_title:** Create your own {file} in the catalogs store — yours, outside every repo, untouched by upgrades
- **provenance.create_failed:** could not create it — {message}
- **provenance.made:** made {path} — edit it, or tell an agent to
- **provenance.exists:** yours is at {path}

## switcher — macros.js (the session switcher)
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
- **bar.keys_title:** Esc, ^C, jump to latest, Tab and the arrows

## output — output.js (the RIREKI view picker)
- **output.locked:** Locked
- **output.terminal_mirror:** Terminal Mirror
- **output.detailed:** Detailed
- **output.condensed:** Condensed
- **output.cherry_pick:** Cherry Pick
- **output.agent_summary:** Agent Summary
- **output.aria:** Output
- **output.title:** Output shown in this tile

## bar — viewport.js (the layout button)

## term — termview.js (the copy hint)
- **term.copy_hint:** Trying to copy? Hold {mod} while you drag, then ⌘C.

## gauge — ramrpm.js (the RAM gauge)
- **gauge.no_swap:** no swap
- **gauge.swap:** swap {used}
- **gauge.container_limit:** (container limit)
- **gauge.ram_title:** RAM_RPM — {free} free of {total}{where} · load {load} on {cpus} · {swap}

## request — request.js (the client's own two messages)
- **request.cancelled:** cancelled
- **request.unreachable:** could not reach Ronin — network or server down

## head — tilehead.js (the tile head's help and quiet words)
- **head.dial_help:** Who may touch this session: 👤 owner only · 👁 outside agents watch · 🤖 outside agents type. Yours to turn; agents never flip it.
- **head.dot_help:** Connection: green = attached, grey = disconnected
- **head.rename_help:** Edit this Agent title
- **head.rename_quiet:** Rename session — no session in this tile yet
- **head.rename_prompt:** Edit Agent title
- **head.rename_failed:** Could not rename session: {reason}
- **head.view_work_record:** View Work Record
- **head.work_record_help:** View repositories, current action, and the work record
- **head.work_record_quiet:** View Work Record — no Agent in this workspace
- **head.output_help:** Output — live terminal or one of RIREKI’s unlocked views
- **head.mention_help:** Mention another session — choose a name to add it to the message box
- **head.mention_quiet:** Mentions — no session in this tile yet
- **head.macros_quiet:** Macros — no session in this tile yet
- **head.more_help:** This session's other controls — 🏷 teams, ⛽ context, 🎛 control, 📄 docs, 📝 note, 🗑 kill
- **head.gauge_help:** Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading.
- **head.dial_quiet:** Control dial — no session in this tile yet
- **head.note_help:** Session note (post-it)
- **head.note_quiet:** Session note — no session in this tile yet
- **head.note_has:** Session note (has notes)
- **head.note_empty:** Session note (empty)
- **head.kill_help:** Kill session (ends it + its viewers)
- **head.kill_quiet:** Kill session — no session in this tile yet

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
- **bar.keys:** Keys
- **bar.ni_title:** Ronin — keys, home, new session, board, pad
- **bar.new:** New
- **bar.shape_title:** Two workspaces — click for four
- **bar.shape_two:** Two workspaces — click for four
- **bar.shape_four:** Four workspaces — click for two

## me — tiledrop.js (the メ sheet)
- **me.status:** Status
- **me.ladder:** Work record
- **me.macros:** Macros
- **me.mention:** Mention session
- **me.groups:** Groups
- **me.docs:** Docs
- **me.note:** Note
- **me.control:** Control
- **me.kill:** Kill session
- **me.title:** This session — status, work record, macros, groups, docs, note, control

## new_team — new-team-launch.js (the transaction's own sentences)

## new_team — new-team-preflight.js (the preflight notes)

## pad — weblink.js (the pad's failure sentences)
- **pad.open_failed:** could not open the pad — 1) System Settings → Privacy & Security → 
- **pad.device_error:** device error
- **pad.no_reply:** {method}: pad did not reply

## docs — the empty line and count
- **docs.empty_team:** No tracked documents.
- **docs.empty:** No session has listed a doc yet. An agent lists one with: write_tegami --doc <path>
- **docs.count_one:** 1 doc
- **docs.count_many:** {n} docs

## errors — the where-words and the dead tile
- **errors.uncaught_at:** uncaught error at {at}
- **errors.uncaught:** uncaught error
- **errors.unhandled:** unhandled promise

## desk — the rail toggle and the inert row

## league — league-board.js (the League board)
- **league.lead:** lead
- **league.holding_empty:** Every live session is on a Team
- **league.no_members:** No live members
- **league.holding:** Holding area
- **league.active:** Active Team
- **league.resting:** Resting Team
- **league.not_recorded:** Not recorded
- **league.unassigned:** Unassigned
- **league.unassigned_summary:** Live sessions that carry no Team membership.
- **league.title:** League
- **league.controls:** League controls
- **league.hide_rosters:** Hide rosters
- **league.show_rosters:** Show rosters
- **league.new_team_summary:** Define the Team, then build its session roster.
- **league.rosters_unavailable:** Durable rosters unavailable — showing live Teams only.

## docs — tiledocs.js
- **docs.empty_session:** This session has listed no docs yet. An agent lists one with: write_tegami --doc <path>

## head — tilementions.js
- **head.mention_aria:** Mention another session

## workspace — workspace-layouts.js
- **workspace.resize:** Resize {column}

## stats — the tooltip, foot and UI rows
- **stats.mek_seg:** launched {birth} · died {end} — {n}
- **stats.foot:** Counted on this machine — no code, no prompts, no names. See README/STATS.md.
- **stats.tab_proj:** ▣ Project root
- **stats.tab_stats:** ▦ Stats
- **stats.dials_changed:** dials changed
- **stats.desktop_touch:** desktop : touch

## wipeboard — the status lines

## tile — the prompt, the ended line, the picker tooltips
- **tile.session_ended:** session ended.
- **output.title_locked:** Output — Locked only. Ronin Services is not installed.
- **output.title_choose:** Output — choose the live terminal or a RIREKI view

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
- **customize.handoff_seed:** Ronin can create your own {file} in your catalogs store — outside every repo, untouched by upgrades. The path is the answer: hand it to your agent, or open it yourself.
- **customize.entry:** entry

## hotwords — the count and ownership lines
- **hotwords.count_one:** {n} word sent with your voice
- **hotwords.count_many:** {n} words sent with your voice
- **hotwords.none:** no words yet — dictation runs unbiased
- **hotwords.own_list:** ◆ your list — an upgrade cannot touch it, and will not add to it either
- **hotwords.stock_list:** Ronin's stock list — your first edit makes a copy that is yours

## ladder — the chip tooltip and side line
- **ladder.side:** {state} — the work record below is held, not stale

## errors — main.js (the session-list failure)
- **errors.no_session_list:** could not load the session list

## roots — the edit form
- **roots.f_handle:** handle
- **roots.f_handle_hint:** The short name — this IS the shortcut
- **roots.f_directory:** directory
- **roots.f_directory_hint:** Any absolute path, at any depth
- **roots.f_remit:** remit
- **roots.f_remit_hint:** The one line you pick it from in a list
- **roots.f_remit_placeholder:** what this is
- **roots.f_match:** match
- **roots.f_match_hint:** Words that suggest this project_root from free-form intent
- **roots.f_match_placeholder:** comma separated

## pad — cell tooltips and idle lines
- **pad.unbound_tip:** unbound — tap to bind
- **pad.active_tile_word:** active tile
- **pad.asks_on_press:** (asks on press)
- **pad.prog_ready:** writes F13–F24 + 🎙 Wispr straight onto the pad — no Input app needed
- **pad.prog_needs_webhid:** programming the pad needs Chrome/Edge on desktop (WebHID)

## macros — no-blurb and accessible names
- **macros.no_blurb:** no blurb yet — add a blurb: line to its MACROS.md entry
- **macros.aria_send:** {label} — +{name} ⏎, typed into the session and sent for you
- **macros.aria_drop:** {label} — +{name}: dropped into the input for you to finish

## voice — voice.js failures
- **voice.failed:** Dictation failed ({why})
- **voice.failed_network:** Dictation failed (network)
- **voice.mic_blocked:** Mic blocked — open Ronin over the https url and allow the microphone

## provenance — the mark tooltips
- **provenance.shadowed:** Yours — this replaces Ronin's shipped entry of the same name. Upgrades to that entry will not reach you.
- **provenance.own:** Yours — added by you, in your catalogs store. An upgrade cannot touch it.

## workspace — workspace-primitives.js (the Kit's own words)
- **workspace.channels:** Team channels
- **workspace.channel_chat:** Chat
- **workspace.channel_wipeboard:** Wipeboard
- **workspace.channel_docs:** Docs
- **workspace.channel_team_configuration:** Team Configuration
- **workspace.channel_agent_message_queue:** Agent Message Queue
- **team_config.no_roster:** This Cowork has no saved roster.
- **team_config.loading:** Loading Team Configuration…
- **team_config.cowork_id:** Cowork ID
- **team_config.title:** Readable title
- **team_config.kind:** Kind
- **team_config.kind_coding:** Coding
- **team_config.kind_work:** Work
- **team_config.kind_personal:** Personal
- **team_config.kind_household:** Household
- **team_config.kind_social:** Social
- **team_config.kind_school:** School
- **team_config.objective:** Purpose
- **team_config.project_root:** Project root
- **team_config.default:** Default
- **team_config.branch:** Branch
- **team_config.wipeboard:** Wipeboard
- **team_config.references:** References
- **team_config.references_help:** One URL or note per line.
- **team_config.routines:** Routines
- **team_config.routines_help:** This complete on/off map is the Team’s own. Campaign changes affect only the next Team form.
- **team_config.kit_floor_alone:** the floor alone — no Routine is on
- **team_config.no_description:** No description supplied.
- **team_config.behaviours:** Behaviours
- **team_config.behaviours_help:** One shelf:name book per line.
- **team_config.required:** Require these behaviours for each new Agent
- **team_config.provider:** Provider
- **team_config.model:** Model
- **team_config.reach:** Reach
- **team_config.recruit:** Recruit
- **team_config.output:** Output
- **team_config.dial:** Control
- **team_config.next_form:** These defaults land in the next Agent form that opens. Nothing live changes.
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
- **bar.brand_title:** ⛩ ronin — the session roster
- **bar.league:** League
- **bar.league_title:** Open League in a new browser tab
- **bar.newtab_title:** Open a second Ronin in a new browser tab
- **bar.new_title:** ⌃⇧N — start a new session: pick what it is for, where it works and who it is
- **keys.esc:** Esc
- **keys.interrupt_title:** Ctrl-C (interrupt)
- **keys.latest_title:** Jump to latest output
- **keys.more:** More keys
- **keys.enter:** Enter
- **keys.tab:** Tab
- **keys.shift_tab:** Shift-Tab
- **keys.shift_tab_face:** ⇧Tab
- **keys.up:** Up
- **keys.down:** Down
- **keys.left:** Left
- **keys.right:** Right

## glossary — the words an agent says to a person for the house terms (KOTOBA_GLOSSARY.md, rendered at session birth; no UI reads these)
- **glossary.ronin:** Ronin
- **glossary.coworkspace:** the coworkspace
- **glossary.tile:** tile
- **glossary.session:** session
- **glossary.agent:** agent
- **glossary.commons:** session commons
- **glossary.desk:** the desk
- **glossary.workbench:** the workbench
- **glossary.workspace:** workspace
- **glossary.surface:** surface
- **glossary.terminal_tile:** terminal tile
- **glossary.team_commons:** team commons
- **glossary.campaign:** campaign
- **glossary.campaign_commons:** the commons
- **glossary.cowork_commons:** cowork commons
- **glossary.selector_column:** selector column
- **glossary.tab:** tab
- **glossary.cowork_setup:** cowork setup
- **glossary.locked:** Locked / Unlocked
- **glossary.roster:** the roster
- **glossary.launch:** launch
- **glossary.team_roster:** Cowork record
- **glossary.team_lead:** team lead · 人
- **glossary.wipeboard:** wipeboard
- **glossary.brief:** Brief
- **glossary.docs:** the Docs tab
- **glossary.configuration:** Configuration
- **glossary.hotwords:** Hotwords
- **glossary.project_root:** project root
- **glossary.project_root_list:** the project root list
- **glossary.customization:** your own macros and jobs
- **glossary.pad:** Pad
- **glossary.control:** Control
- **glossary.launch_mode:** Model provider configuration · Dangerously
- **glossary.team:** Cowork
- **glossary.note:** Note
- **glossary.work_record:** work record
- **glossary.rung:** rung · leg · phase · gate
- **glossary.memory:** memory
- **glossary.stats:** Stats
- **glossary.macros:** macros
- **glossary.macro:** macro
- **glossary.invocation:** typing a macro
- **glossary.desk_profile:** desk profile
- **glossary.session_type:** session type
- **glossary.kind:** kind
- **glossary.template:** template
- **glossary.behaviour:** behaviour
- **glossary.routine:** routine
- **glossary.ronin_base:** Ronin Base
- **glossary.routine_floor:** Cowork floor
- **glossary.ronin_worktrees:** worktrees
- **glossary.ronin_services:** Ronin Services
- **glossary.specialized_routine:** specialized routine
- **glossary.terminal:** terminal
- **glossary.bare_metal_agent:** bare-metal Agent
- **glossary.cowork_agent:** Cowork Agent
- **glossary.mandate:** mandate
- **glossary.reach:** Reach
- **glossary.recruit:** Recruit
- **glossary.output:** Output
- **glossary.fork:** fork
- **glossary.harakiri:** harakiri
- **glossary.packet_kinds:** Usage counts · Feedback · Macro submission
- **glossary.packet:** what gets sent
- **glossary.egress_log:** where Ronin has connected
- **glossary.services:** Services
- **glossary.session_menu:** Status · Work record · Macros · Detach · Kill session
- **glossary.message_queue:** message queue
- **league.commons:** League commons
- **league.view:** League view
- **league.team_roster:** Team roster
- **league.team_roster_saving:** Adding {session} to {team}…
- **league.selector_views:** Views
- **league.selector_teams:** Teams
- **league.selector_new:** New
- **league.templates:** Templates
- **league.agents:** Agents
- **league.no_agents:** No live Agents
- **league.new_agent:** New Agent
- **league.new_agent_summary:** A new Agent, born into the workspace you are in.
- **league.delete_team:** Delete team
- **league.delete_team_confirm:** Delete {team}? {count} Agents will lose this Team membership.
- **league.members:** Team members
- **league.no_members:** No Agents assigned yet.
- **league.role_unset:** Role not set
- **league.team_lead:** Team Lead
- **league.make_team_lead:** Make Lead
- **league.rename_agent:** Rename
- **league.rename_agent_prompt:** Edit Agent title
- **league.remove_member:** Remove
- **league.remove_named_member:** Remove {name} from this team
- **league.choose_member:** Choose an Agent to add
- **league.no_available_members:** No other Agents available
- **league.assign_member:** Assign
- **league.launch_team:** Launch
- **league.ronin:** Ronin: no team
- **league.no_ronin:** No Rōnin Agents
- **league.team_roster_removing:** Removing {session} from {team}…
- **league.open_workspace:** League workspace
- **customize.desk_profiles:** Desk profiles
- **customize.desk_profiles_blurb:** Your standing defaults for the surfaces you work at — a skin, a lexicon, a campaign kind, a Team page arrangement. Choosing one is a setting, on the gear.
- **customize.lexicons:** Lexicons
- **customize.lexicons_blurb:** The words a surface uses — a wording or a language, one file each. Say only what changes; the rest falls through to the floor.
