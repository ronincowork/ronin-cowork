# professional_en
The floor. Every key a surface reads is here, in plain English, so a lexicon that says
nothing paints exactly this. `check-lexicon` holds this file complete.

- **label:** Professional
- **blurb:** The plain words. Every other lexicon falls through to these.
- **desk_profile:** desk profile
- **campaign:** Campaign
- **campaigns:** Campaigns
- **campaign_kind:** Kind
- **squad:** Team
- **player_one:** Lead session
- **team_kit:** Shared toolkit
- **loadout:** Tools and skills
- **behaviours:** Behaviours
- **mandate:** Mandate
- **reach:** Scope
- **recruit:** Team
- **output:** Deliverable
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
- **desk.appearance:** appearance
- **desk.theme_flip_title:** The shell's mode — tap to flip. Ronin follows this device until you flip away; flip back to match and it follows again.
- **desk.theme_dark:** ● dark
- **desk.theme_light:** ○ light
- **desk.skin:** skin
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
- **launcher.team_none:** — team —
- **launcher.team_new:** ＋ new team…
- **launcher.team_new_prompt:** New team name (letters, digits, - _):
- **launcher.head:** put a session out to work
- **launcher.name_title:** session name — how you address this session afterwards
- **launcher.name:** session name
- **launcher.what:** what this session is told
- **launcher.where_title:** project_root — where the work happens (sets the directory + reading list)
- **launcher.model_title:** Which session_launch_spec to launch
- **launcher.team_title:** Team the new session joins (tag)
- **launcher.gbrain_on:** gbrain on
- **launcher.gbrain_off:** gbrain off
- **launcher.gbrain_on_title:** This session can reach gbrain — and any other MCP servers the CLI is wired with. Click to launch it with none.
- **launcher.gbrain_off_title:** This session launches with NO MCP servers — gbrain and every other connector off. Click to launch connected.
- **launcher.start:** Start
- **launcher.cancel:** Cancel
- **launcher.mode_manual:** manual
- **launcher.mode_manual_title:** Your text is the whole prompt — nothing added, nothing templated
- **launcher.mode_assisted:** assisted
- **launcher.mode_assisted_title:** Say it long-form; Ronin composes the brief around it
- **launcher.mode_manual_note:** your words, untouched
- **launcher.mode_assisted_note:** Koshi fills the rest
- **launcher.mode_manual_say:** Sent word for word — nothing added.
- **launcher.mode_assisted_say:** Say it in plain terms and Koshi your AI admin will handle the rest; the below selections are optional.
- **launcher.what_placeholder:** exactly what you want said to the agent
- **launcher.what_placeholder_assisted:** Describe in plain terms what this session should do and cover…
- **launcher.name_placeholder:** session name (required)
- **launcher.name_placeholder_assisted:** session name (optional — named from your text)
- **launcher.optional:** optional
- **launcher.seed_placeholder:** read first (optional): paths, comma-separated
- **launcher.seed:** read first — paths, comma-separated
- **launcher.inject_placeholder:** extra instruction (optional)
- **launcher.inject:** extra instruction
- **launcher.reference_title:** Point this session at ONE existing session (review it, fork from it, watch it)
- **launcher.reference_none:** — no session —
- **launcher.setup_offer:** 新 start your setup session
- **launcher.cannot_launch:** this combination cannot be launched — see the definition files it names
- **launcher.powered_by:** powered by {name} ↗
- **launcher.no_roles:** no session_roles in ronin_catalogs/session_roles/
- **launcher.own_kind:** session task
- **launcher.saved:** saved launches
- **launcher.saved_role_missing:** "{label}" names session_role "{role}", which is not in the catalog.
- **launcher.where_none:** — no project_roots —
- **launcher.launch_failed:** could not put a session out — {message}

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
- **panels.teams_sheet:** Session teams
- **panels.team_placeholder:** add a team (letters, digits, - _)
- **panels.team_hint:** Agents resolve these with {cmd}.
- **panels.add_team:** add a team
- **panels.no_team:** on no team
- **panels.remove:** remove
- **panels.join:** join:

## commons — commons.js (the commons shell: tab strip and frame)
- **commons.tab_off:** {tab} — off, this service is not installed.
- **commons.close_title:** Back to the terminal
- **commons.sessions:** sessions

## home — home.js (the status words and the launch receipt)
- **home.status_ready:** ready
- **home.status_thinking:** thinking…
- **home.status_awaiting_input:** awaiting input
- **home.receipt_manual:** manual
- **home.receipt_assisted:** assisted
- **home.receipt_no_agent:** no agent
- **home.receipt_kill:** kill
- **home.receipt_kill_title:** Wrong? Remove the session now.

## settei — settei.js (the ⚙ Configuration tab)
- **settei.saving:** saving…
- **settei.saved:** saved
- **settei.none_set:** — none set —
- **settei.unset_using:** unset — using {value}
- **settei.spec_not_installed:** {spec} — not installed
- **settei.blurb:** What this install is set to — and what it is running on.
- **settei.measured:** measured {time}
- **settei.group_you:** you and this machine
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

## new_team / team — new-team.js (the New Team view; team.* rows are shared by the Team page family)
- **new_team.define:** Define the Team
- **new_team.define_eyebrow:** 1 · Define the Team
- **new_team.definition:** Team definition
- **new_team.name:** Team name
- **new_team.name_desc:** Lowercase letters, digits, _ and - . This is also the tag its sessions carry.
- **new_team.role_placeholder:** development — or leave blank
- **team.team_role:** Team role
- **new_team.role_desc:** Optional. Blank is an unclassified Team, which is a valid state.
- **team.objective:** Objective
- **new_team.objective_desc:** Optional. Rides the brief of every session born onto this Team.
- **new_team.root:** Default project root
- **new_team.root_desc:** Optional. Seeds where sessions are born; a launch may override it.
- **team.repos:** Repositories
- **new_team.repos_desc:** Optional, comma-separated.
- **team.branch:** Branch
- **new_team.optional:** Optional.
- **team.wipeboard:** Wipeboard
- **new_team.wipeboard_desc:** Optional. Blank uses the Team’s own name.
- **new_team.build_roster:** Build the roster
- **new_team.build_roster_eyebrow:** 2 · Build the roster
- **new_team.sessions_heading:** Sessions · one or many
- **new_team.roster_notice:** A Team with no sessions is complete and valid. Add one or more proposed sessions, check them against the real launch resolver, then raise them in order.
- **new_team.add_seat:** Add proposed session
- **new_team.check_seats:** Check seats
- **new_team.create_and_raise:** Create Team and raise sessions
- **new_team.roster_actions:** Roster actions
- **new_team.transaction:** Team transaction
- **new_team.open_team:** Open Team
- **new_team.proposed_session:** Proposed session
- **new_team.no_brief:** No brief yet.
- **new_team.preflight:** preflight {verdict}
- **new_team.resolved_name:** Resolved name
- **team.project_root:** Project root
- **team.command:** Command
- **team.control:** Control
- **team.mcp:** MCP
- **new_team.edit_session:** Edit session
- **new_team.designate_lead:** Designate as lead
- **new_team.no_lead:** No lead
- **new_team.remove_proposal:** Remove proposal
- **new_team.seat_actions:** Proposed session actions
- **new_team.retry_unresolved:** Retry unresolved sessions
- **new_team.create:** Create Team
- **team.team:** Team
- **team.roster:** Roster
- **new_team.completed:** Completed
- **new_team.error:** Error
- **team.status:** Status
- **team.mode:** Mode
- **team.role:** Role
- **new_team.reason:** Reason
- **new_team.retry_seat:** Retry this seat
- **new_team.lead_line:** Lead: {status}
- **new_team.name_invalid:** Lowercase letters, digits, _ and - only.
- **new_team.name_taken:** "{name}" already has a roster.
- **new_team.preflight_unreachable:** The dry run could not be reached — {message}
- **new_team.raising:** Checking the roster, then raising sessions in order…
- **new_team.root_default:** — the box’s default —
- **new_team.title:** New Team

## preview / seat — agent-config-preview.js (the seat preview half of Agent Configuration)
- **seat.session_role:** Session role
- **seat.name:** Name
- **preview.team_objective:** Team objective
- **preview.team_repos:** Team repositories
- **preview.team_branch:** Team branch
- **preview.team_wipeboard:** Team wipeboard
- **preview.team_state:** Team state
- **preview.dir:** Directory
- **preview.agent:** Launches an agent
- **preview.label:** Agent label
- **preview.model:** Model bias
- **preview.permissions:** Permissions
- **preview.posture:** Posture
- **preview.opening:** Opening template
- **preview.ack:** Acknowledgement gate
- **preview.cli:** CLI
- **seat.mcp:** gbrain
- **preview.mcp_default:** gbrain default
- **preview.mcp_always:** gbrain locked on
- **preview.lifecycle:** Lifecycle
- **preview.cap_exempt:** Exempt from the session max
- **preview.yes:** yes
- **preview.no:** no
- **preview.title:** Preview
- **preview.brief_head:** The brief this session is born with
- **preview.resolved_head:** What it resolves to
- **preview.reading_head:** Read at birth
- **preview.nothing_yet:** Nothing to preview yet.
- **preview.unresolved:** This seat did not resolve far enough to preview.
- **preview.no_reading:** No birth reading reported.
- **preview.source_unknown:** source not reported

## seat — agent-config-fields.js (the seat form half of Agent Configuration)
- **seat.session_role_desc:** What this session is doing. Blank is a real launch — no reading, no mark.
- **seat.name_desc:** Left unset, the server derives it from the role and the prompt.
- **seat.mode_desc:** Manual sends your words untouched. Assisted composes the brief.
- **seat.prompt:** What it is for
- **seat.prompt_desc:** The agent's first message.
- **seat.project_root_desc:** Unset falls to the Team's root, then the top active root.
- **seat.cmd:** Launch command
- **seat.cmd_desc:** Unset falls to the role’s model bias, then the install default.
- **seat.mcp_desc:** Unset means whatever the resolved profile says.
- **seat.tags:** Further teams
- **seat.tags_desc:** Memberships beyond the birth team.
- **seat.seed:** Read first
- **seat.seed_desc:** Paths read before anything else. Assisted mode only.
- **seat.inject:** Extra instruction
- **seat.inject_desc:** Appended verbatim. Assisted mode only.
- **seat.reference:** Pointed at
- **seat.reference_desc:** One session this one is aimed at.
- **seat.inherit:** inherit
- **seat.on:** on
- **seat.off:** off
- **seat.manual:** manual
- **seat.assisted:** assisted
- **seat.inherit_title:** Return {field} to unset — the resolved profile answers it
- **seat.cmd_no_agent:** This seat launches no agent, so it cannot carry a command.
- **seat.prompt_no_agent:** A plain terminal has nobody to tell — an empty prompt is valid here.

## team_wipeboard — team-wipeboard.js (the team wipeboard channel on the Team page)
- **team_wipeboard.placeholder:** say something to the team — every member is interrupted
- **team_wipeboard.post:** Post
- **team_wipeboard.no_notice:** → (no notice)
- **team_wipeboard.cleared:** … earlier posts have cleared
- **team_wipeboard.empty:** Nothing on the board right now — posts clear after 48 hours.
- **team_wipeboard.read_failed:** Could not read the board — {message}
- **team_wipeboard.post_failed:** Could not post — {message} (your text is still in the box)
- **team_wipeboard.no_team:** No Team resolved — nothing to read.

## team — team-view.js (the Team page)
- **team.flip_commons:** Show the Team commons in this workspace
- **team.flip_terminal:** Show the terminal in this workspace
- **team.workspace_1:** Workspace 1
- **team.workspace_2:** Workspace 2
- **team.roster_title:** Team Roster
- **team.commons:** Team commons
- **team.arranged_by:** arranged by {from}
- **team.attached:** attached
- **team.add_member:** ＋ Add team member
- **team.add_member_summary:** Existing session or a new one — arrives with its own slice.
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
- **koshi.blurb_stopped:** Koshi is NOT running. Nothing is watching any ladder.
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
- **wipeboard.back:** ‹ wipeboards
- **wipeboard.back_title:** Back to the wipeboard listing
- **wipeboard.brief:** brief
- **wipeboard.brief_title:** Show / hide the brief
- **wipeboard.brief_placeholder:** what this wipeboard is for, and what is to be discussed
- **wipeboard.brief_label:** wipeboard brief
- **wipeboard.say_placeholder:** say something to everyone on this wipeboard
- **wipeboard.say_label:** post to this wipeboard
- **wipeboard.open_team:** Open the {team} team's wipeboard
- **wipeboard.open_custom:** Open the custom wipeboard "{name}"
- **wipeboard.add:** ＋ wipeboard
- **wipeboard.add_title:** Start a custom wipeboard — a team already has one automatically
- **wipeboard.add_prompt:** Name the wipeboard (letters, digits, - _):
- **wipeboard.not_notified:** On the wipeboard, but not notified — its dial is not 🤖
- **wipeboard.remove_member:** Remove {name} from this wipeboard
- **wipeboard.membership_follows:** membership follows the team — tag sessions in the ⌂ Roster
- **wipeboard.add_member:** ＋ add…
- **wipeboard.team_option:** +{team} (team)

## wipeboard — the kind note
- **wipeboard.kind_team:** team wipeboard
- **wipeboard.kind_custom:** custom wipeboard

## roots — projectroots.js (the ▣ Project roots tab)
- **roots.include:** ＋ include
- **roots.include_title:** Ask Mika to include a directory — she reads it and proposes the entry
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
- **roots.empty:** nothing included yet — ＋ include asks Mika to point Ronin at a directory
- **roots.loading:** loading…

## docs — docs.js (the ▧ Docs tab)
- **docs.back_title:** Back to the list
- **docs.save:** Save
- **docs.open_browser:** Open in browser ↗
- **docs.frame_title:** document
- **docs.discard_confirm:** Discard unsaved changes?
- **docs.loading:** loading…
- **docs.saving:** saving…
- **docs.saved:** saved

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
- **stats.ladder_height:** How far up the ladder
- **stats.at_gate:** {n} at a gate — waiting on you
- **stats.plan_docs:** Plan docs
- **stats.plans_in_flight:** in flight
- **stats.plans_landed:** landed
- **stats.plans_legs_done:** legs completed
- **stats.plans_stale:** stale 14d+
- **stats.plans_legs_median:** legs per plan (median)
- **stats.ladders_plans:** Ladders & plans
- **stats.n_live:** {n} live
- **stats.surfaces:** Ronin surfaces
- **stats.macro_runs:** {n} macro runs
- **stats.macros:** Macros
- **stats.ui:** UI
- **stats.capabilities:** Capabilities
- **stats.unreachable:** Stats could not be read.
- **stats.unavailable:** Stats are not available on this install yet.

## setup — cowork-setup.js (the one-time cowork_setup page)
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
- **customize.team_roles:** Team roles
- **customize.team_roles_blurb:** What a TEAM is. The house ships none — every one is yours.
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
- **desk.row_appearance:** Appearance
- **desk.row_release:** Release & update
- **desk.close_title:** Back to what this tile was showing
- **desk.rail_collapse:** Collapse the rail
- **desk.group_app:** This app

## desk — the install group heading
- **desk.group_install:** This install

## dial / gauge / mark — widgets.js (the control dial, the context gauge, the role menu)
- **gauge.used:** ⛽ {label} {pct}% used
- **mark.none:** not marked
- **mark.none_title:** Clear the mark — this session has not said what it is doing
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
- **ladder.none:** no ladder up yet
- **ladder.gate:** GATE
- **ladder.legs_undetermined:** — legs undetermined
- **ladder.quiet:** quiet {age}

## tile — tile.js (the session picker)
- **tile.pick_session:** — pick session —
- **tile.gone:** {name}  (gone?)
- **tile.new_session:** ➕ new session…

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
- **archives.rehydrate:** Rehydrate {name}
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
- **bar.layout_one:** {n} terminal — click for {next}
- **bar.layout_many:** {n} terminals — click for {next}

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
- **head.select_help:** Pick / switch the session shown in this tile
- **head.chip_help:** Where this session is on its ladder, and how long it has been there. Opens the ladder.
- **head.job_help:** What this session is doing
- **head.job_quiet:** What a session is doing — no session in this tile yet
- **head.job_read:** {job} — click to change what this session is doing
- **head.job_unmarked:** Not marked — click to say what this session is doing
- **head.branch_help:** Branches this session is working on
- **head.branch_quiet:** Branches — no session in this tile yet
- **head.branch_no_michi:** Branches — michi is not installed, so TEGAMI checkout data is unavailable
- **head.detached:** (detached)
- **head.branch_none:** No branch listed yet. The session keeps its repos list current in TEGAMI.
- **head.output_help:** Output — live terminal or one of RIREKI’s unlocked views
- **head.commons_help:** ⌃⇧C — the CoWorking Commons: roster, new session, wipeboard, docs, roots, hotwords. Opens over this tile; ✕ comes back.
- **head.mention_help:** Mention another session — choose a name to add it to the message box
- **head.mention_quiet:** Mentions — no session in this tile yet
- **head.macros_quiet:** Macros — no session in this tile yet
- **head.more_help:** This session's other controls — 🏷 teams, ⛽ context, 🎛 control, 📄 docs, 📝 note, 🗑 kill
- **head.tags_help:** Teams this session is on
- **head.tags_quiet:** Teams — no session in this tile yet
- **head.tags_read:** Teams: {teams}
- **head.tags_none:** Teams (none yet)
- **head.gauge_help:** Context gauge — how full this session's context window is, read off the pane's own status line. Hidden until there is a reading.
- **head.dial_quiet:** Control dial — no session in this tile yet
- **head.docs_help:** This session's docs — open one over this tile
- **head.docs_quiet:** This session's docs — no session in this tile yet
- **head.docs_no_michi:** This session's docs — michi is not installed, so no session keeps a doc list
- **head.docs_read:** Docs — {n} listed by this session. Opens one over this tile; ✕ comes back.
- **head.docs_none:** Docs — this session has listed none yet. An agent lists one with write_tegami --doc
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
- **errors.tile_failed:** tile {n} failed to build
- **bar.keys:** Keys
- **bar.ni_title:** Ronin — keys, home, new session, board, pad
- **bar.new:** New
- **bar.mika:** Mika Assist
- **bar.commons:** Commons
- **bar.keypad:** Keypad
- **bar.desk:** Admin Desk
