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
- **add_agent.actions:** Launch actions
- **add_agent.start:** Start
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
- **campaign.cowork:** Team
- **campaign.new:** New Desk
- **campaign.create:** Create Desk
- **campaign.saving:** saving…
- **campaign.name_needed:** A Desk needs a name.
- **squad:** Team
- **team_kit:** Shared toolkit
- **loadout:** Behaviors
- **behaviours:** Behaviors
- **glossary.installation:** installation
- **glossary.behaviour:** behaviour
- **mandate:** Mandate
- **session_type:** Session type
- **kind:** Kind
- **template:** Template
- **reach:** Reach
- **recruit:** Recruit
- **output:** Output
- **on:** On
- **off:** Off
- **go:** Go
- **save_template:** Save as template
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
- **desk.update:** Update
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

## campaign_view — campaign-view.js (Campaign Manage: the selector's Campaign-level surfaces)

- **campaign_view.roots_summary:** The folders this Campaign is allowed to work in.
- **campaign_view.new_summary:** Set the stage. It creates no Team and launches no Agent.
- **campaign_view.none_selected:** No Desk selected.
- **campaign_view.no_description:** No description yet.
- **campaign_view.no_profile:** As stock — none chosen.
- **campaign_view.roots_n:** {n} roots
- **campaign_view.roots_none:** None — an Agent here has nowhere to work.
- **campaign_view.name_help:** On the door, the browser tab and the address.
- **campaign_view.description_help:** What this body of work is for. Shown on its card.
- **campaign_view.head:** Desk: {name}
- **campaign_view.presets:** Presets
- **campaign_view.presets_help:** A preset copies all of its components into this Campaign. Change any one of them afterwards; the preset is not consulted again.
- **campaign_view.apply:** Apply
- **campaign_view.revert:** Revert
- **campaign_view.applied:** applied — every component below is now this Campaign’s own
- **campaign_view.applied_tag:** applied
- **campaign_view.skin:** Skin
- **campaign_view.skin_help:** The look — colours, corners, faces.
- **campaign_view.theme:** Theme
- **campaign_view.theme_desktop:** Desktop
- **campaign_view.theme_help:** Light or dark for pointer surfaces; Automatic is the house default — light.
- **campaign_view.theme_mobile:** Theme (mobile)
- **campaign_view.theme_mobile_help:** Light or dark for touch surfaces — iPad and phone; Automatic is the house default — light.
- **campaign_view.theme_light:** Light
- **campaign_view.theme_dark:** Dark
- **campaign_view.theme_auto:** Automatic
- **campaign_view.output:** Output
- **campaign_view.output_help:** What an Agent’s tile shows. Terminal Mirror is the one that ships; Detailed, Condensed and Cherry Pick arrive with Ronin Services.
- **campaign_view.with_services:** Ronin Services
- **campaign_view.services_title:** Arrives with Ronin Services.
- **campaign_view.lexicon:** Lexicon
- **campaign_view.lexicon_help:** The words. Held to one lexicon for now, so nothing on this page is offered.
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

## campaign_home — campaign-home.js (the root arrival: Machine Settings, Teams, Launch)

- **campaign_home.ronin_home:** Ronin Home
- **campaign_home.launch:** New Project
- **campaign_home.desk:** Desk
- **campaign_home.desk_is:** All Teams, Agents, and work
- **campaign_home.team:** Team
- **campaign_home.team_is:** Choose a Team and open its Workbench
- **campaign_home.agent:** Agent
- **campaign_home.agent_is:** Choose an Agent and open its Workbench
- **campaign_home.settings:** Settings
- **campaign_home.check_updates:** Check for updates
- **setup.provider_gate:** Activate one model provider in Machine Setup to use this.
- **setup.open_settings:** Open Ronin Settings
- **setup.open_setup:** Open Ronin Setup

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
- **help.template_body:** A template fills part of the form in and stops. Its answers become yours the moment they land — nothing stays linked, and you can change any of it. An Agent template is a loadout for one session; a Team template is a cast, and picking one lands its Agents as rows you can edit. Make your own fills nothing in, and going back to it empties what a template wrote.
- **help.mandate_body:** How far this Agent goes before it checks in, whether it may build out a team, and what it hands back. Output takes as many answers as you mean — a plan AND the team AND no code — and nothing argues with a combination. Open means no requirement. None of it is enforced: the mandate is carried in the Agent’s letter and read by it, not imposed on it.
- **help.loadout_body:** Model and Launch mode are independent. Native means no override in that field; only Native model plus Native launch mode is the bare CLI command. Features add facilities or taught practices; behaviours say how ordinary work should be done.
- **help.agents:** Agents
- **help.agents_body:** The Agents this Team is raised with. A row is short on purpose — a name and what that Agent does — and opens for its mandate when you want it. 人 marks the lead; this form offers one, though a running Team may gain more. Raising creates the Team and then births every named row, the lead last. A Team with no rows is ordinary and raises fine.
- **help.behaviours:** What a Behavior is
- **help.behaviours_body:** Behaviors are specific guidance given to Agents at birth. Write it Down, Planning, Team Work, Visual Staging, and Working with the User are selectable; All Cowork Agents and Conditional Behaviors are applied by Ronin when their rules match.
- **help.type:** New session
- **help.type_body:** Three kinds of thing can start here. A Cowork Agent is born with everything Ronin provides on this box. A bare-metal Agent is the provider’s own CLI and nothing else. A terminal is a shell with no agent. The choice decides which of the steps below exist — a terminal is asked three things because there are only three to ask.
- **help.top:** Name & kind
- **help.template:** Template
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
- **new_team.agents_meta:** {n} agents
- **new_team.agent_name:** name
- **new_team.agent_name_taken:** Nothing was created. Choose another name for: {names}.
- **new_team.agent_assignment:** what this Agent does
- **new_team.agent_drop:** Remove this Agent
- **new_team.agent_add:** ＋ Add an Agent
- **new_team.readable:** Title

## home — home.js (the status words and the launch receipt)
- **home.stance_working:** working…
- **home.stance_replying:** replying…
- **home.stance_awaiting_you:** awaiting you
- **home.stance_asking:** asking you

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
- **settei.group_projects:** projects · {n}
- **settei.dir_gone:** ✕ {dir} is gone
- **settei.projects_link:** Edit these in ▣ Workspace folders — this room only shows them.
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
- **team.objective:** Objective
- **team.project_root:** Workspace folder
- **new_team.team_actions:** Team actions
- **team.team:** Team
- **team.roster:** Roster
- **new_team.name_invalid:** Lowercase letters, digits, _ and - only.
- **new_team.root_default:** — the box’s default —
- **new_team.title:** New Team

## new_team — new-team-form.js (the drawn raise form, staged beside the card above)
- **new_team.card_summary:** Template · kit · lead — the drawn form.
- **new_team.name_placeholder:** lowercase, digits, - _
- **new_team.objective_placeholder:** what this team is for
- **new_team.members:** members
- **new_team.members_note:** derived from live tags — never stored here
- **new_team.inherits:** an agent born here inherits
- **new_team.staffing_failed:** Team created, but {failed} of {total} Agents could not be launched: {names}. Open the Team and add them there.
- **new_team.raising:** Raising the team…
- **new_team.save_name_placeholder:** template name
- **new_team.save_as_new:** Save as new template
- **new_team.saved_template:** Saved template {name}

## forms — form-steps.js (the drawn form idiom shared by New Team and New Agent)
- **forms.library_note:** More on the Ronin library — Campaign → Templates → Check the library to see them and download the ones you want.
- **forms.default:** default
- **ask.answer:** Answer
- **setup_surface.identity_short:** Register as
- **setup_surface.kind_short:** You use Ronin for
- **setup_surface.preferred_feature_short:** Capability
- **setup_surface.reasons_short:** Describes you
- **setup_surface.run_location_short:** Install on
- **setup_surface.user_intro:** Introduce yourself to your Cowork Agents (up to two short lines)
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

## presets — Setup launch presets
- **presets.tile_view:** Tile view
- **presets.agents_side_by_side:** Agents run side by side
- **presets.side_by_side:** Side by side
- **presets.two_by_two:** Two by two
- **presets.repeats:** Repeats
- **presets.every_day:** Every day
- **presets.day_of_week:** Day of the week
- **presets.one_time:** One time
- **presets.day:** Day
- **presets.how_it_runs:** How it runs
- **presets.single_assistant:** Single assistant
- **presets.chief_of_staff:** Chief of Staff
- **presets.evaluate:** Evaluate
- **presets.evaluate_none:** Choose a folder
- **presets.workspace_folder:** workspace folder
- **presets.repository:** repository
- **presets.folder:** folder
- **presets.kept:** Kept
- **presets.keep:** Keep
- **presets.skip:** Skip

## new_agent — new-agent.js (the drawn launch form, staged beside the ＋ New board)
- **new_agent.title:** New Agent
- **new_agent.model_package:** Model
- **new_agent.defaults_cascade_team:** Defaults cascade from Desk → Team → this Agent. Changes on this form apply only to this Agent.
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
- **work_items.intro:** Select a work item to read its Project. Drag between stages to request a move.
- **work_items.refresh:** Refresh Work Items
- **work_items.details:** Show stone details
- **work_items.loading:** Loading Work Items…
- **work_items.failed:** Could not load Work Items.
- **team_kanban.beta:** Beta
- **team_kanban.beta_message:** Task Manager is in beta. Follow Projects from ideas to done using Tools and the Work Record. We’re making it easier for Agents to keep them current without forcing upkeep.
- **team_kanban.header_collapse:** Collapse
- **team_kanban.header_expand:** Expand
- **team_kanban.back:** Back to Task Manager
- **team_kanban.project:** Project
- **team_kanban.status_projects:** Projects by status
- **team_kanban.project_missing:** This Project is not in the current scope.
- **team_kanban.stage:** Status
- **team_kanban.holder:** Holder
- **team_kanban.progress:** Progress
- **team_kanban.next:** Next
- **team_kanban.evidence:** Evidence
- **team_kanban.open_owner:** Open @{name}
- **team_kanban.waiting:** waiting on
- **team_kanban.asked:** asked
- **team_kanban.desk_summary:** Projects across this Desk’s Teams and Agents
- **team.lead:** Team lead
- **team.workspace_1:** Workspace 1
- **team.workspace_2:** Workspace 2
- **team.commons_card:** Commons
- **team.commons_summary:** See Roster / Docs / Wipeboard / Messages / Configuration
- **team.workspace_blank:** Workspace
- **workspace.close_surface:** Close this work surface
- **cowork.tab_archives:** Archived
- **team.workspace_3:** Workspace 3
- **team.workspace_4:** Workspace 4
- **team.roster_title:** Roster
- **team.commons:** Commons
- **team.arranged_by:** arranged by {from}
- **team.state:** State

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
- **machine.no_reading:** No reading of the machine yet.
- **machine.stop:** Stop watching
- **machine.stop_title:** Stop gathering machine readings and hide the gauge. Nothing was installed on the box, so there is nothing to undo — turn it back on whenever you like.
- **machine.stopped:** Off — the gauge is hidden.
- **machine.save_failed:** Could not save that.

## gbrain — gbrain-setup-state.js and gbrain.js (the Ronin Setup work surface)
- **gbrain.retry_install:** Retry install
- **gbrain.load:** Load gbrain
- **gbrain.status_diagnosis:** Setup could not read the local gbrain status. Nothing was changed.
- **gbrain.check_again:** Check again
- **gbrain.setup_intro:** A shared, searchable memory for your Agents.
- **gbrain.setup_q_installed:** Installed
- **gbrain.setup_q_accounts:** Accounts linked
- **gbrain.setup_checking:** Checking…
- **gbrain.setup_not_installed:** Not installed
- **gbrain.setup_services_needed_hint:** gbrain comes with Ronin Services.
- **gbrain.setup_open_services:** Open Ronin Services
- **gbrain.setup_services_off:** Installed · Ronin Services is switched off
- **gbrain.setup_services_off_hint:** Turn Services on for this Cowork in Team Configuration.
- **gbrain.setup_load_hint:** One press. Downloads come from github.com and huggingface.co.
- **gbrain.setup_installing:** Installing…
- **gbrain.setup_removing:** Removing…
- **gbrain.setup_failed:** Install did not finish
- **gbrain.setup_install_log:** Install log
- **gbrain.setup_running:** Installed · running
- **gbrain.setup_running_keyword:** Installed · running · keyword-only search
- **gbrain.setup_stopped:** Installed · not running
- **gbrain.setup_stopped_hint:** Turn Ronin Services off and on in Team Configuration, or ask an Agent to look.
- **gbrain.setup_check_assistant:** Ask an Agent to check gbrain
- **gbrain.setup_unreadable:** Could not read
- **gbrain.setup_linked:** Linked
- **gbrain.setup_not_linked:** Not linked
- **gbrain.setup_no_accounts:** None to link on this install.
- **gbrain.setup_accounts_hint:** Your Personal Assistant links one when you ask, with your approval.
- **gbrain.setup_provider_first:** A model provider comes first.
- **gbrain.setup_open_providers:** Open Model providers
- **gbrain.setup_ready:** Everything is good to go.
- **gbrain.setup_start_assistant:** Start your first Personal Assistant
- **gbrain.setup_launching:** Launching…
- **gbrain.setup_launched:** Launched in a new tab.
- **gbrain.setup_launch_failed:** Launch failed.

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

## roots — projectroots.js (the ▣ Workspace folders tab)
- **roots.add:** ＋ Add workspace folder
- **roots.add_hint:** Choose or create a folder on this machine where Agents should start.
- **roots.add_save:** Add
- **roots.read_failed:** could not read the catalog — {message}
- **roots.save:** save
- **roots.cancel:** cancel
- **roots.handle_needed:** Give this Workspace Folder a handle.
- **roots.edit:** edit
- **roots.edit_folder:** Edit
- **roots.edit_folder_title:** Change the summary, shelves, match words, or repository workflow.
- **roots.save_folder:** Save
- **roots.cancel_folder:** Cancel
- **roots.archive_folder:** Archive
- **roots.unarchive_folder:** Unarchive
- **roots.exclude_folder:** Exclude
- **roots.summary:** Summary
- **roots.summary_none:** No summary yet.
- **roots.section_folder:** Folder
- **roots.section_repository:** Repository
- **roots.fact_directory:** Directory
- **roots.fact_handle:** Workspace Folder handle
- **roots.fact_docs:** Docs
- **roots.fact_plans:** Plans
- **roots.fact_match:** Match
- **roots.fact_remote:** Remote
- **roots.fact_branch:** Branch
- **roots.fact_publishing:** Publishing
- **roots.fact_worktrees:** Worktrees
- **roots.profile_undeclared:** Not declared
- **roots.repository_none:** Not a Git repository. A workspace folder does not need to be one.
- **roots.add_head:** Add a workspace
- **roots.keep_hint:** Keep a folder on this machine for Teams and Agents to start in.
- **roots.keep_lede:** Keep a folder on this machine for Teams and Agents to start in; a folder not kept is simply left alone.
- **roots.picker_path:** Path
- **roots.picker_none:** None yet
- **roots.picker_keep:** Keep
- **roots.picker_kept:** Kept
- **roots.archive_failed:** could not archive it — {message}
- **roots.exclude:** exclude
- **roots.exclude_title:** Remove it from the catalog. Nothing on disk is touched.
- **roots.exclude_confirm:** Exclude "{name}" from your Ronin?

The catalog entry goes. {dir} is not touched.
- **roots.exclude_failed:** could not exclude it — {message}
- **roots.empty:** No workspace folders yet. Choose or create the first one above.
- **roots.loading:** loading…
- **roots.chip_worktrees:** Repository: Worktrees allowed
- **roots.chip_checkout:** Repository: use checkout
- **roots.chip_reviewed_title:** Reviewed: work moves through {working}, then review reaches {stable}. The branch mounted here is incidental.
- **roots.chip_direct_title:** Direct: commits land on {stable} itself.
- **roots.chip_shared:** Repository: use checkout
- **roots.chip_shared_title:** No RONIN_REPO record: sessions use this checkout. Edit this root to declare its repository workflow.
- **roots.stone_plain_folder:** Plain folder
- **roots.stone_repo_no_remote:** Repository · no remote
- **roots.stone_repo_worktrees:** Repository · Worktrees
- **roots.stone_repo_checkout:** Repository · checkout
- **roots.git_access:** Git access
- **roots.git_access_available:** Access available
- **roots.git_access_unavailable:** Access unavailable
- **roots.git_access_not_checked:** Not checked
- **roots.git_access_check_failed:** Check failed
- **roots.git_access_checking:** Checking…
- **roots.git_access_check:** Check access
- **roots.git_access_not_checked_detail:** Ronin has not checked read access to this repository’s origin.
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
- **roots.git_other_method:** Use another method
- **roots.git_other_open:** Use your preferred Git or SSH setup here, then return to the Workspace Folder and check Git access.
- **roots.github_remove_auth:** Remove authentication
- **roots.github_removing_auth:** Removing GitHub authentication…
- **roots.github_done:** Done
- **roots.github_close:** Close
- **roots.github_missing:** GitHub CLI is not installed.
- **roots.github_connected:** Connected to GitHub as {account}.
- **roots.github_not_connected:** GitHub is not connected on this machine.
- **roots.github_unreadable:** Ronin could not verify GitHub authentication.
- **roots.github_waiting:** Finish GitHub authentication in the window first.
- **roots.github_clone_stone:** Clone a repository
- **roots.github_clone_ready_state:** Uses existing Git access
- **roots.github_clone_heading:** Clone a repository
- **roots.github_clone_lede:** Clone a GitHub repository and add its folder as a Ronin workspace.
- **roots.github_clone_ready:** Cloning uses this machine’s existing Git access. GitHub CLI is optional.
- **roots.github_repository:** GitHub repository
- **roots.github_clone:** Clone and add workspace
- **roots.github_cloning:** Cloning repository…
- **roots.github_cloned:** Added {name} as a workspace.

## docs — docs.js (the ▧ Docs tab)
- **docs.back_title:** Back to the list
- **docs.close_agent:** Close documents and return to this Agent
- **docs.save:** Save
- **docs.pill_tracked:** Tracked
- **docs.pill_plans:** Plans
- **docs.pill_docs:** Docs
- **docs.shelf_empty:** Nothing on this shelf — a workspace folder names its places on its record (Workspace folders → docs / plans).
- **roots.f_docs:** docs
- **roots.f_docs_hint:** Where this root keeps its documentation — directories or files, relative to the directory
- **roots.f_plans:** plans
- **roots.f_plans_hint:** Where this root keeps its build-out plans
- **roots.group_root:** Workspace folder
- **roots.group_root_help:** An existing directory on this machine where Agents may work.
- **roots.group_repository:** Advanced repository workflow
- **roots.group_repository_help:** Optional Git publishing and Worktrees choices. An ordinary folder needs none of these.
- **roots.f_mode:** publishing
- **roots.mode_reviewed:** reviewed release
- **roots.mode_direct:** direct publishing
- **roots.f_working:** working
- **roots.f_working_hint:** The integration branch for reviewed work. You choose its name.
- **roots.f_stable:** stable
- **roots.f_stable_hint:** The published branch. You choose its name.
- **roots.f_worktrees:** Worktrees
- **roots.worktrees_enabled:** Use Ronin Worktrees
- **roots.worktrees_disabled:** Use the checkout
- **roots.flow_reviewed:** {working} → review → {stable}
- **roots.flow_direct:** commits → {stable}
- **roots.flow_worktrees:** Agents with Worktrees on use their own working folder and branch; other Agents use the checkout.
- **roots.flow_checkout:** Every Agent uses this checkout, even when the Agent has Worktrees on.
- **roots.flow_preview:** Flow: {branches}. {worktrees} Saving this profile does not create, move, or rename branches.
- **roots.profile_confirm:** Rewrite RONIN_REPO with this repository profile?\n\nBefore:\n{before}\n\nAfter:\n{after}\n\nRunning Agents may still have the earlier instructions.
- **roots.profile_confirm_title:** Confirm repository settings
- **roots.profile_confirm_action:** Use these settings
- **folders.selected:** Selected folder
- **folders.none_selected:** None selected
- **folders.start_context:** This is where the Agent will start.
- **folders.up:** ← Up
- **folders.home:** Home
- **folders.search:** Find a folder here
- **folders.hidden:** Show hidden folders
- **folders.new:** ＋ New folder here
- **folders.new_name:** Folder name
- **folders.git:** Start Git version history
- **folders.create:** Create and select
- **folders.inspecting:** Checking the starting context…
- **folders.git_found:** Git repository
- **folders.ordinary:** Ordinary folder
- **folders.context_found:** Project instructions: {files}
- **folders.context_none:** No recognized project instructions here; the Agent can still start here.
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
- **docs.work_record_note:** Ask an agent to list a document with work-record document add <path>. If a document is missing, ask the agent to update its work record.

## roots — the count line and chips
- **roots.chip_archived:** archived
- **roots.chip_archived_title:** Off the new-session picker. Still here, and still launchable by name.
- **roots.chip_gone:** directory is gone
- **roots.chip_gone_title:** Nothing on disk at this path — fix the path or exclude it
- **roots.chip_no_remote:** repo, no remote
- **roots.chip_no_remote_title:** A git repo with no origin
- **roots.chip_no_repo:** no repo
- **roots.chip_no_repo_title:** Not a git repo — a workspace folder does not need to be one
- **roots.sessions_one:** {n} session
- **roots.sessions_many:** {n} sessions
- **roots.unarchive:** unarchive
- **roots.archive:** archive
- **roots.unarchive_title:** Put it back on the new-session picker.
- **roots.archive_title:** Take it off the new-session picker. It stays on this pane, and sessions already using it are untouched.
- **roots.count_one:** {n} workspace folder
- **roots.count_many:** {n} workspace folders
- **roots.count_archived:** {n} archived

## stats — stats.js (the ▦ Stats tab)

## customize — customize-rail.js (the Customize rail's sections and resources)
- **customize.sec_behavior:** Behavior
- **customize.sec_people:** People & work
- **customize.sec_presentation:** Presentation
- **customize.tools:** Tools
- **customize.tools_blurb:** Agent-facing executables selected and taught by capability documents.
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
- **customize.read_entry:** Read entry

## customize — customize-role-families.js

## customize — customize-handoff.js
- **customize.handoff_head:** Making it yours
- **customize.handoff_read_only:** One file per {thing}, named by its token, in your catalogs store under {dir}. Ronin cannot create that file for you yet — ask your agent to add one, and point it at the directory’s own README, which states the format and every field.
- **customize.handoff_store_hint:** Ask for the store path with: bin/ronin-store catalogs — never spell it by hand.
- **customize.handoff_ask_agent:** Ask your agent to add one.

## pane — panes.js (the pane registry's tab labels)
- **pane.docs:** ▧ Docs
- **pane.settei:** Configuration
- **pane.hotwords:** Hotwords
- **pane.koshi:** Koshi
- **pane.gbrain:** gbrain

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

## ladder — shingo.js (the ladder chip and panel)
- **ladder.task_at_hand:** Task at hand
- **ladder.task_unstated:** No task stated in this work record.
- **ladder.worktrees:** Worktrees
- **ladder.branch:** Branch
- **ladder.coworks:** Teams
- **ladder.tracked_documents:** Tracked documents
- **ladder.docs_none:** No tracked documents.
- **ladder.progress:** Progress
- **ladder.none:** no work record yet
- **ladder.gate:** GATE
- **ladder.legs_undetermined:** — legs undetermined

## tile — tile.js (the Agent terminal tile)

## composer — composer.js
- **composer.placeholder:** Message…
- **composer.title:** Enter sends · Shift+Enter or Option+Enter for a new line
- **composer.mic_title:** Dictate into this box — tap again to stop, then ↵ to send
- **composer.send:** Send
- **composer.held:** Not sent — {why}. Your text is kept.
- **composer.why_not_connected:** the tile is not connected
- **composer.why_refused:** the session refused it

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
- **retire.copy:** Archive is resumable and leaves desks alone. Delete safely closes only clean, handed-in desks. Hard Delete irreversibly removes the Agent and every owned desk after preserving destructive evidence.
- **retire.archive:** Archive
- **retire.shutdown:** Delete
- **retire.hard_delete:** Hard Delete
- **retire.hard_delete_confirm:** Hard Delete is irreversible. Delete Agent {name} and every desk it owns, including dirty and unhanded work? Destructive evidence will be preserved.\n\nConfirm exact targets: {exact}

## retire — the working words
- **retire.archive_failed:** could not archive it
- **retire.shutdown_failed:** could not safely shut it down
- **retire.shutting_down:** starting shutdown…
- **retire.resolving:** Resolving Agent…
- **retire.archiving:** archiving…
- **retire.hard_delete_failed:** could not hard delete it
- **retire.hard_deleting:** starting Hard Delete…

## customize — the shadow-trade notice
- **customize.shadow_trade:** Changing one of Ronin’s own entries makes it yours: it moves to your catalogs store, 

## provenance — provenance.js (the add-your-own button)
- **provenance.add_own:** ＋ add your own {what}
- **provenance.add_own_title:** Create your own {file} in the catalogs store — yours, outside every repo, untouched by upgrades
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
- **transcript.stance_asking:** Waiting for your answer

## output — output.js (the RIREKI view picker)
- **output.locked:** Locked
- **output.terminal_mirror:** Terminal Mirror
- **output.aria:** Output
- **output.title:** Output shown in this tile

## bar — viewport.js (the layout button)

## term — termview.js (the copy hint)

## gauge — ramrpm.js (the RAM gauge)
- **gauge.no_swap:** no swap
- **gauge.swap:** swap {used}
- **gauge.container_limit:** (container limit)
- **gauge.ram_title:** RAM_RPM — {free} free of {total}{where} · load {load} on {cpus} · {swap}
- **gauge.ram_details:** Machine memory
- **gauge.ram_available:** RAM available
- **gauge.ram_total:** RAM total
- **gauge.free:** free
- **gauge.load:** Load
- **gauge.on_cpus:** on {cpus} CPUs
- **gauge.swap_label:** Swap
- **gauge.swap_detail:** {used} of {total} used

## request — request.js (the client's own two messages)
- **request.cancelled:** cancelled
- **request.malformed:** Ronin answered, but the answer did not arrive whole
- **request.unreachable:** could not reach Ronin — network or server down

## head — tilehead.js (the tile head's help and quiet words)
- **head.rename_help:** Edit this Agent title
- **head.rename_quiet:** Rename session — no session in this tile yet
- **head.rename_prompt:** Edit Agent title
- **head.rename_failed:** Could not rename session: {reason}
- **head.work_record_help:** View repositories, current action, and the work record
- **head.work_record_quiet:** View Work Record — no Agent in this workspace
- **head.output_help:** Output — live terminal or one of RIREKI’s unlocked views
- **head.mention_help:** Mention another session — choose a name to add it to the message box
- **head.mention_quiet:** Mentions — no session in this tile yet
- **head.gauge_help:** Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading.
- **head.docs_help:** This Agent's tracked docs — open one over this tile
- **head.docs_quiet:** This Agent's docs — no Agent in this workspace
- **head.docs_read:** Docs — {n} tracked by this Agent. Open one over this tile.
- **head.docs_none:** Docs — this Agent is tracking none yet.
- **head.minimize_help:** Close this view — the Agent keeps running
- **head.minimize_quiet:** Close view — no Agent in this workspace
- **head.kill_help:** Delete or archive this Agent
- **head.kill_quiet:** Delete or archive Agent — no Agent in this workspace

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

## me — tiledrop.js (the メ sheet)
- **me.ladder:** Work record
- **me.mention:** Mention session
- **me.docs:** Docs
- **me.kill:** Kill session
- **me.output:** Output
- **me.minimize:** Minimize
- **me.agent_title:** This Agent — work record, docs, output, close
- **me.title:** This session — status, work record, groups, docs, note, control

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
- **phone.me_title:** This Agent — work record, docs, output, close

## new_team — new-team-launch.js (the transaction's own sentences)

## new_team — new-team-preflight.js (the preflight notes)

## pad — weblink.js (the pad's failure sentences)
- **pad.open_failed:** could not open the pad — 1) System Settings → Privacy & Security → 
- **pad.device_error:** device error
- **pad.no_reply:** {method}: pad did not reply

## docs — the empty line and count
- **docs.empty_team:** No tracked documents.
- **docs.empty:** No session has listed a doc yet. An agent lists one with: work-record document add <path>
- **docs.count_one:** 1 doc
- **docs.count_many:** {n} docs

## errors — the where-words and the dead tile
- **errors.uncaught_at:** uncaught error at {at}
- **errors.uncaught:** uncaught error
- **errors.unhandled:** unhandled promise

## desk — the rail toggle and the inert row

## league — league-board.js (the League board)
- **league.no_members:** No live members

## docs — tiledocs.js
- **docs.empty_session:** Nothing tracked yet. Ask this Agent to update its Work Record with the docs it is tracking; they will appear here.

## head — tilementions.js
- **head.mention_aria:** Mention another session

## workspace — workspace-layouts.js
- **workspace.resize:** Resize {column}

## stats — the tooltip, foot and UI rows

## wipeboard — the status lines

## tile — the prompt, the ended line, the picker tooltips
- **tile.session_ended:** session ended.
- **output.title_off:** Output — Locked only. Ronin Services is off for this Agent.
- **output.title_locked:** Output — Locked only. Ronin Services is not installed.
- **output.title_choose:** Output — the live terminal, or Locked to watch without typing

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

## roots — the edit form
- **roots.f_handle:** Workspace Folder handle
- **roots.f_handle_hint:** The stable handle used by sessions and tools, such as ronin_lab.
- **roots.f_title:** display title
- **roots.f_title_hint:** The name shown on screen. Changing it never changes the handle or directory.
- **roots.f_title_placeholder:** optional
- **roots.f_directory:** directory
- **roots.f_directory_hint:** Any absolute path, at any depth
- **roots.f_remit:** remit
- **roots.f_remit_hint:** The one line you pick it from in a list
- **roots.f_remit_placeholder:** what this is
- **roots.f_match:** match
- **roots.f_match_hint:** Words that suggest this workspace folder from free-form intent
- **roots.f_match_placeholder:** comma separated

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
- **provenance.own:** Yours — added by you, in your catalogs store. An upgrade cannot touch it.

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
- **team_jikan.remove:** Remove

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

## glossary — the words an agent says to a person for the house terms (ronin_catalogs/lexicons/professional_en.md, rendered at session birth; no UI reads these)
- **glossary.coworkspace:** the coworkspace
- **glossary.tile:** tile
- **glossary.desk:** the desk
- **glossary.workspace:** workspace
- **glossary.team_commons:** team commons
- **glossary.campaign_commons:** the commons
- **glossary.cowork_commons:** cowork commons
- **glossary.tab:** tab
- **glossary.locked:** Locked / Unlocked
- **glossary.roster:** the roster
- **glossary.team_roster:** Team record
- **glossary.team_lead:** team lead · 人
- **glossary.wipeboard:** wipeboard
- **glossary.cron_jobs:** Cron jobs
- **glossary.docs:** the Docs tab
- **glossary.configuration:** Configuration
- **glossary.hotwords:** Hotwords
- **glossary.project_root:** workspace folder
- **glossary.team:** Team
- **glossary.note:** Note
- **glossary.work_record:** work record
- **glossary.memory:** memory
- **glossary.stats:** Stats
- **glossary.desk_profile:** desk profile
- **glossary.session_type:** session type
- **glossary.terminal:** terminal
- **glossary.bare_metal_agent:** bare-metal Agent
- **glossary.cowork_agent:** Cowork Agent
- **glossary.mandate:** mandate
- **glossary.reach:** Reach
- **glossary.recruit:** Recruit
- **glossary.output:** Output
- **glossary.harakiri:** harakiri
- **glossary.packet:** what gets sent
- **glossary.egress_log:** where Ronin has connected
- **glossary.message_queue:** message queue
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
- **agent.team_tasks:** {team} Task Manager
- **agent.team_tasks_summary:** Projects held by {team}
- **customize.desk_profiles:** Desk profiles
- **customize.desk_profiles_blurb:** Your standing defaults for the surfaces you work at — a skin, a lexicon, a campaign kind, a Team page arrangement. Choosing one is a setting, on the gear.
- **customize.lexicons:** Lexicons
- **customize.lexicons_blurb:** The words a surface uses — a wording or a language, one file each. Say only what changes; the rest uses the stock words.
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
- **setup_surface.providers_summary_unread:** Every provider and model Ronin offers, and what this machine has.
- **setup_surface.providers_summary:** {providers} providers · {models} models · {activated} activated here
- **setup_surface.providers_summary_dated:** {counts} · catalog updated {date}
- **setup_surface.catalog_date_unstated:** Date not stated
- **setup_surface.section_yours:** Yours
- **setup_surface.no_cli:** No CLI in Ronin’s registry serves this provider, so it cannot be installed or signed in here.
- **setup_surface.no_cli_state:** No CLI
- **setup_surface.no_models:** The catalog lists no models for this provider.
- **setup_surface.refresh_all:** Refresh all model providers
- **setup_surface.refreshing_all:** Refreshing…
- **setup_surface.last_ran:** Last ran {date}
- **setup_surface.never_ran:** Never run — every provider offers Native only until it runs.
- **setup_surface.models_read:** Model list read {date} by {cli} {version}
- **setup_surface.models_not_read:** Model list not read yet — press Refresh all model providers.
- **setup_surface.provider_models_n:** {vendor} · {n} models
- **setup_surface.fact_installed:** Installed
- **setup_surface.fact_signed_in:** Signed in
- **setup_surface.fact_activated:** Activated
- **setup_surface.yes:** yes
- **setup_surface.no:** no
- **setup_surface.col_model:** Model
- **setup_surface.col_tier:** Tier
- **setup_surface.col_cost:** Cost
- **setup_surface.col_good_at:** Good at
- **setup_surface.col_not_good_at:** Not good at
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

## behaviours — behaviour-surface.js
- **behaviours.title:** Behaviors
- **behaviours.card_summary:** Optional, All Cowork Agents, and Conditional guidance Agents receive at birth.
- **behaviours.intro:** Behaviors are specific guidance given to Agents at birth.
- **behaviours.available:** Optional
- **behaviours.auto:** All Cowork Agents
- **behaviours.auto_included:** All Ronin Agents include these
- **behaviours.bare_metal_excludes:** Exclude by using a bare metal Agent.
- **behaviours.conditional:** Conditional
- **behaviours.requires:** When
- **behaviours.yours:** Yours
- **behaviours.stock:** Ronin
- **campaign_view.desk_settings:** Desk Settings
