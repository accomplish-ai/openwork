# Agent Computer Mastery Spec

This document teaches an agent how to reliably navigate macOS and collaborate through Codex, Cursor, and ChatGPT Atlas.

Use this as a retrieval guide, not a giant always-loaded prompt.

## 1) Goal and Limits

- Goal: operate like a power user on macOS and in coding assistants.
- Limit: no agent can know every app perfectly in advance.
- Required behavior: when app details are unknown, discover quickly with a repeatable process instead of guessing.

## 2) Universal Prompt Contract

When writing to any agent (Codex, Cursor, Atlas), use this structure:

```text
Task:
Context:
Constraints:
Definition of done:
Output format:
Validation:
```

Rules:

- `Task`: one concrete objective.
- `Context`: files, environment, versions, current state.
- `Constraints`: what not to change, style rules, safety rules.
- `Definition of done`: objective pass criteria.
- `Output format`: exact sections expected in the reply.
- `Validation`: commands/tests/checks to prove success.

## 3) Agent Reply Contract

When returning results, use this structure:

```text
Outcome:
Changes made:
Validation run:
Open issues:
Next options:
```

Rules:

- Report facts, not guesses.
- Include exact file paths and commands.
- If blocked, state the blocker and the minimum user action required.
- Keep logs summarized unless full logs are requested.

## 4) macOS System Mastery

### 4.1 Find anything quickly

- Apps:
- Spotlight: `Cmd+Space`, type app name.
- Finder apps: `/Applications`, `/System/Applications`.
- Terminal: `ls /Applications`, `mdfind "kMDItemKind == 'Application' && kMDItemFSName == '*NAME*'"`.
- Files:
- Terminal content search: `rg "pattern" /path`.
- File-name search: `find /path -name "*name*"`.
- Metadata search: `mdfind "query"`.
- Settings:
- Open System Settings and use built-in search bar first.
- If unknown location, search setting name directly, then verify in the sidebar category.
- Logs and diagnostics:
- Console app.
- `~/Library/Logs`
- `/Library/Logs`
- App support/config:
- `~/Library/Application Support`
- `~/Library/Preferences`
- `~/Library/Caches`

### 4.2 Core System Settings map (high-value)

- Network and internet:
- `System Settings > Wi-Fi`
- `System Settings > Network`
- Privacy and permissions:
- `System Settings > Privacy & Security`
- Key sections: `Accessibility`, `Screen Recording`, `Files and Folders`, `Full Disk Access`, `Microphone`, `Camera`.
- Input and UX:
- `System Settings > Keyboard`
- `System Settings > Trackpad`
- `System Settings > Mouse`
- Display and audio:
- `System Settings > Displays`
- `System Settings > Sound`
- Accounts and startup:
- `System Settings > Users & Groups`
- `System Settings > General > Login Items`
- Power/storage/time:
- `System Settings > Battery`
- `System Settings > General > Storage`
- `System Settings > General > Date & Time`
- Accessibility:
- `System Settings > Accessibility`

### 4.3 Unknown App Discovery Playbook

Use this order:

1. Open app and inspect top menu bar.
2. Open app settings (`Cmd+,` in most apps).
3. Check `Help` menu and search command name.
4. Check command palette if available (`Cmd+Shift+P` in many developer tools).
5. Inspect app logs/settings folders in `~/Library`.
6. Verify behavior with a minimal reproducible action.
7. Only then propose steps to user.

## 5) Codex Workflow (How to write to Codex)

Use direct, execution-ready instructions:

```text
Task: Fix <issue>.
Context: Repo path is <path>. Relevant files: <paths>.
Constraints: Do not edit <x>. Keep style <y>. No destructive git commands.
Definition of done: <tests pass + behavior>.
Output format: summary + changed files + tests run + risks.
Validation: run <commands>.
```

Best practices:

- Give exact paths and expected behavior.
- Ask for tool execution, not just advice, when you want edits.
- Request verification commands explicitly.
- Ask for a short diff summary if speed matters.
- For Codex chat tasks: open the target thread first, type in the bottom message composer, then send and verify.
- On Codex new-thread screens, do not click starter suggestion cards unless the user explicitly requested that exact card.
- Use `Shift+Enter` for newline and `Enter` to send unless the UI says otherwise.

## 6) Cursor Workflow (How to write to Cursor)

Choose mode intentionally:

- Use `Ask` for exploration/architecture.
- Use `Agent/Edit` for implementation and file changes.

Prompt template:

```text
Implement <feature/fix> in <files>.
Keep <constraints>.
Return:
1) files changed
2) why each change was needed
3) commands run
4) remaining risks
```

Cursor-specific guidance:

- Pin/open target files before prompting to improve relevance.
- Include acceptance tests in prompt.
- Ask Cursor to avoid touching unrelated files.
- Ask for small, reviewable commits/diffs.

## 7) ChatGPT Atlas Workflow

Use Atlas for planning, research framing, and structured synthesis, then move executable work to Codex/Cursor.

Prompt template:

```text
Role: Senior technical analyst.
Task: Produce a plan for <goal>.
Context: <project/system context>.
Constraints: <time/cost/risk limits>.
Output: decision table + recommended plan + rollback plan.
```

Rules:

- Ask for assumptions to be listed explicitly.
- Ask for trade-offs and failure modes.
- Ask for output in copy-pasteable checklists.
- Convert accepted plan into Codex/Cursor execution prompt.

Note:

- If your ChatGPT UI label differs from "Atlas", keep the same prompt structure.

## 8) Read-Back Protocol (How to read messages and report back)

When an agent message is long, parse in this order:

1. Claimed outcome
2. Actual files changed
3. Validation evidence
4. Risks/blockers

Return to the user with:

```text
What was requested:
What was actually done:
Proof:
Gaps:
Recommended next command:
```

## 9) Cross-Agent Handoff Template

Use this exact minimal handoff:

```text
Objective:
Current state:
Changed files:
Pending tasks:
Constraints:
Verification commands:
```

Keep it under 200 words unless asked otherwise.

## 10) Cost-Control Rules (Important)

To avoid high token cost every turn:

1. Keep root `AGENTS.md` short and pointer-only.
2. Load only one relevant section of this spec at a time.
3. Reuse templates instead of writing new long instructions.
4. Avoid repeating unchanged background context.
5. Summarize logs; provide full output only on request.

## 11) Quick Commands Cheat Sheet

```bash
# System info
sw_vers
uname -a

# Find apps and files
ls /Applications
mdfind "Cursor"
mdfind "kMDItemDisplayName == '*Codex*'"
rg "keyword" /Users/hareli/Projects/openwork

# Common macOS data locations
ls ~/Library/"Application Support"
ls ~/Library/Logs
```

## 12) Codex Desktop Operation Playbook (Detailed)

Use this section when the user asks for direct Codex UI actions.

### 12.1 Execution loop (always follow in order)

1. Restate the mission in one sentence before acting.
2. Bring Codex to foreground.
3. Verify Codex is focused.
4. Navigate only to UI needed for the mission.
5. Execute one action.
6. Verify state changed as expected.
7. Continue until the mission definition of done is fully satisfied.

Never stop at "I am about to click." Finish the click and verify result.

### 12.2 Bring Codex to front (do not assume focus)

Use this priority order:

1. Click Codex in Dock.
2. If not visible, use `Cmd+Tab` until Codex is active.
3. If Codex is not running, open Spotlight (`Cmd+Space`), type `Codex`, press `Enter`.
4. If Spotlight fails, open from `/Applications`.

Focus verification checklist:

- macOS menu bar app name shows `Codex`.
- Codex window is frontmost (not behind another app).
- Visible workspace or thread belongs to requested task context.

### 12.3 Codex UI map for task routing

Use the smallest navigation that solves the task:

- Source control task: open Source Control (branch icon) or `Ctrl+Shift+G`.
- File/task reading: use Explorer.
- Thread review/respond: use Threads.
- Sending a chat message: open Threads, select the correct thread, then use the bottom composer field.

Codex thread screen map:

- Left sidebar: the leftmost vertical panel, usually about the left quarter of the window.
- Treat the full Codex window as a layout grid:
- left sidebar: roughly x 0% to 24% of the window width.
- main thread pane: roughly x 24% to 100%.
- top toolbar: roughly y 0% to 7%.
- conversation body: roughly y 7% to 80%.
- composer band: roughly y 80% to 95%.
- footer/status row: roughly y 95% to 100%.
- `New thread`: near the top of the left sidebar as a row with a pencil/edit icon. Click the center of that row label, not the macOS window controls above it.
- `Automations`: second row in that top sidebar group.
- `Skills`: third row in that top sidebar group.
- Thread list: below the `Threads` heading in the left sidebar. Click the thread title row to open that conversation.
- Main thread pane: the large right-side area that shows the active conversation.
- New-thread screen landmarks:
- `New thread` row: around x 2% to 16%, y 5% to 10% of the full window.
- Thread rows: around x 2% to 22%, y 28% to 82%.
- Hero text/logo block: centered in main pane around x 45% to 60%, y 34% to 52%; not a send target.
- Suggestion cards: above the composer around x 30% to 88%, y 70% to 82%; non-target UI unless explicitly requested.
- Composer: around x 30% to 88%, y 84% to 95%, directly below the suggestion cards and directly above the footer row.
- Messages and replies: appear in the main pane above the composer; the newest visible content is nearest the bottom of the conversation area.
- Starter cards/suggestion chips: rectangular cards above the composer on empty/new-thread screens. Treat them as non-target UI unless the user explicitly asked for that exact card.
- Composer: the widest rounded text field anchored at the bottom of the main pane, directly above the footer/status row (`Local`, permission label such as `Full access`, branch name).
- Footer landmark rule: find the row that shows `Local`, access status, and branch name; the composer is the large rounded field immediately above that row.
- Composer safe click zone: the lower-middle interior of that rounded field. Aim around the horizontal center and slightly below the field midpoint. Avoid the top border, placeholder-text band, and the cards above it.
- Send button: the circular arrow button inside the far-right end of the composer. Click the center of the circle. Do not click slightly above it, and do not confuse it with the microphone icon just to its left.
- Microphone button: the small mic icon immediately left of the send button. It starts voice input and does not send the typed message.
- Hover confirmation cue: when the cursor is truly on a clickable Codex button, the button area often turns darker/gray or shows a stronger highlight. Treat that hover-state change as evidence that the pointer is on target before clicking.
- Composer utility controls: the `+` button at the far-left interior opens attach/insert options; the model picker (for example `GPT-5.3-Codex`) and effort picker (for example `Low`) sit along the lower-left interior of the composer and are not the typing target.
- Top bar title: top-left of the main pane shows the current thread title (for example `New thread`).
- Workspace selector: project/workspace label under hero text or in the footer (for example `openwork` or `Local`); useful for verification, not for sending.
- Top-right controls: `Open` opens or switches repo context; `Commit` opens the commit flow. These are unrelated to chat send unless the user asked for repo/source-control actions.
- Button meaning quick map:
- `New thread`: open a blank conversation.
- Thread row: open that existing conversation.
- `Open`: choose or switch repo/workspace context.
- `Commit`: open source-control commit flow.
- Composer body: put caret here and type.
- Send up-arrow: submit the typed message.
- Microphone: start voice input; not send.
- Starter card: run a canned task prompt; ignore unless explicitly requested.

Wrong-panel guardrail:

- Do not enter Threads/other panels if user asked for commit/push.
- If wrong panel was opened, return immediately to Source Control and continue.

### 12.4 Action completion rule (critical)

An action is complete only after observable state change.

- Selecting/highlighting an option is not execution.
- For dialogs with final CTA, the agent must click the final button.
- After each click, wait briefly and confirm UI changed.

Required verification after final-action click:

- Button state changes, modal closes, or progress indicator appears.
- Success/failure toast, sync indicator, or changed git status is visible.
- If nothing changes, retry once and investigate blocker.
- If visual verification is available, capture a fresh screenshot/live frame after a failed attempt and correct the miss direction instead of stopping at one retry.
- Do not end the turn while retry budget remains and no hard blocker is present.

### 12.5 Codex commit and push SOP (all changes, blank message)

Use this exact sequence when user asks to commit/push all changes including unstaged and leave commit message blank:

1. Bring Codex to front using section 12.2.
2. Open Source Control (`Ctrl+Shift+G` or branch icon).
3. Confirm repository is the expected one (for this project: `openwork`).
4. Ensure all changes are included:
- Use `Include unstaged = ON` when that control exists.
- Otherwise run `Stage All Changes` from Source Control actions.
5. Verify changed-file count reflects full working tree.
6. Leave commit message field empty if UI supports autogeneration/empty commit message flow.
7. Select `Commit and push` as next step.
8. Click `Continue` (or equivalent final confirmation button).
9. Wait for push completion feedback.
10. Verify success:
- branch sync indicator settles,
- push success message appears, or
- Source Control shows clean/updated state.
11. If prompted for auth/conflict, resolve prompt and continue.
12. Report exact completed actions and final outcome.

Do not stop after selecting `Commit and push`; click `Continue`.

### 12.6 Input reliability rules (mouse/keyboard)

- Keyboard shortcut fails: click Codex window once, retry shortcut.
- Text input fails: click directly in field, then type/paste.
- Click seems ignored: verify no overlay/modal interception, then retry.
- If repeated failure: switch to menu-based path for same action.

Typing reliability micro-protocol:

1. Click once in the intended input field.
2. Confirm caret is visible in that field.
3. Paste/type full text.
4. Re-read first and last 10-20 characters to confirm text landed in the correct field.
5. Only then send/submit.

### 12.7 Recovery when stuck or uncertain

Use this fallback order:

1. Re-check mission and current UI state.
2. Return to smallest known-good state (usually Source Control root).
3. Execute one minimal step.
4. Verify change.
5. Repeat.

If blocked by permissions, auth, merge conflict, or missing remote access, report:

- exact blocker,
- where it appears,
- smallest user action required.

### 12.8 Mandatory progress reporting format for live UI tasks

During execution, report actions as completed facts:

```text
Action done:
Observed result:
Next immediate action:
```

Avoid speculative phrasing such as "I will click" without confirming click happened.

### 12.9 Self-awareness and self-UI filtering (critical)

When operating inside Codex, the agent must treat Codex assistant surfaces as self-environment, not a separate actor.

Definitions:

- `self-UI`: Codex assistant bubbles, helper panes, "agent" labels, and side assistant widgets inside Codex.
- `target-UI`: only the controls needed for the user mission (thread list, composer, source control, dialogs, and needed controls).

Rules:

- Do not describe assistant side panels (for example Codex helper panes) unless user explicitly asks about them.
- Never report "another agent is on screen" as mission context when that surface is Codex self-UI.
- Never talk about Codex as if it is an external teammate while operating inside Codex.
- Prioritize only user-requested target surfaces: app under control, dialog needed for task, and required controls.
- If uncertain whether a visible panel is relevant, ignore it and proceed with mission-critical UI first.

Allowed mention of self-UI:

- Only when it blocks action (for example modal overlay preventing click), and only as a blocker report.

### 12.10 Conversation continuity protocol (critical)

If the user says `continue`, `go on`, or similar, assume same thread context by default.

Required sequence before asking user for repeated context:

1. Read the latest user request in current thread.
2. Read the previous assistant action/result in current thread.
3. Restate inferred active mission in one line.
4. Resume execution from last completed step.

Do not ask "what are we working on?" unless both conditions are true:

- thread context is genuinely unavailable, and
- last actionable task cannot be inferred from recent messages.

When context is partially missing, ask one targeted clarification question tied to the inferred mission, not a broad reset request.

Mini template:

```text
Inferred mission:
Last completed step:
Next step now:
```

### 12.11 Commit/push anti-stall guardrail (critical)

Use this when user intent includes push (examples: "commit and push", "push changes").

Decision rule:

- If push is requested, plain `Commit` is not an acceptable terminal action.
- Required path is `Commit and push` followed by final confirmation (`Continue` or equivalent).

Timed execution guard:

1. Select `Commit and push`.
2. Within 2 seconds, perform final click on `Continue`.
3. Within 5 seconds, verify a state change (modal closes/progress/toast/git state update).

If stalled:

- No state change after selecting `Commit and push`: re-click `Continue` once.
- If still unchanged, close/reopen commit dialog and repeat full flow.
- If blocked by validation/auth/conflict prompt, report blocker and resolve prompt path.

Completion proof (must be reported):

- Exact final action clicked (`Continue`).
- Observable post-click evidence (push progress/success indicator).
- End state (cleaner Source Control or updated sync state).

### 12.12 Click precision and transition speed (critical)

Use this for small/high-impact buttons such as `Commit and push` and `Continue`.

Target-lock click protocol:

1. Bring target button fully into view (no overlap, no clipping).
2. Pause for visual confirmation of exact label text.
3. Move to the center area of the target button, not near edges.
4. Wait briefly for hover confirmation when available (button darkens, turns gray, or shows a stronger highlight).
5. Click only after hover confirmation or after a brief settle when hover is subtle.
6. Confirm pressed state immediately (highlight/ripple/pressed state).
5. If no pressed state, click center once more.

Adaptive retry rule:

1. If the click does not change UI state, do not stop immediately.
2. Capture a fresh screenshot/live frame when available.
3. Classify the miss as `high`, `low`, `left`, `right`, `overlay`, or `uncertain`.
4. Retry with a small correction, usually 6-16 screen points in the needed direction.
5. Repeat until verified or the mission-specific retry budget is exhausted.

Near-miss prevention:

- Do not click while moving; settle pointer first.
- Prefer single deliberate clicks over fast inaccurate clicks.
- If adjacent buttons exist (`Commit` vs `Commit and push`), re-read label text before click.

Speed budget for commit flow:

- From opening commit dialog to selecting `Commit and push`: <= 4 seconds.
- From selecting `Commit and push` to clicking `Continue`: <= 2 seconds.
- If budget exceeded, trigger stuck-recovery immediately (no idle waiting).

Post-click confirmation:

- If button remains unchanged after two centered clicks, assume miss/overlay and reopen the step.
- Report exact retry reason (`miss`, `overlay`, `focus lost`, `unknown`).

### 12.13 Codex thread send-and-verify protocol (critical)

Use this whenever the mission includes sending a chat message in Codex.

Required sequence:

1. Confirm correct thread is open (context/title matches mission).
2. Focus the message composer field (bottom input area of the active thread).
   - Prefer accessibility/text-input discovery when available; click the center of the returned composer frame.
   - If visual fallback is required, target the widest rounded input above the footer row and click its lower-middle interior, not the top half.
3. Check whether composer already contains text.
4. If text exists and overwrite behavior is ambiguous, ask one short clarification:
- `replace draft`,
- `append to draft`, or
- `send draft as-is`.
5. If user provided exact text to send, use that exact text and do not improvise.
6. Enter text into composer:
- click composer once,
- if focus is not visible, click the same center point once more and slightly lower if needed (do not drift upward to nearby cards),
- confirm caret is in composer,
- paste/type message.
7. Send message (`Enter` or Send button).
   - If using the Send button, hover-confirm the circular arrow first: the button should darken or highlight under the cursor before click.
8. If multi-line text is needed before send, use `Shift+Enter` for line breaks.
9. Verify send within 3 seconds using visible evidence:
- outbound message bubble appears in thread,
- composer clears/resets, and
- response-in-progress indicator appears.
10. If evidence is incomplete, capture a fresh screenshot/live frame and inspect the miss before retrying.
11. Correct based on observed miss direction:
- if the pointer/click landed high, retry lower,
- if low, retry higher,
- if left/right, correct horizontally,
- use small corrections first, usually 6-16 screen points.
12. Continue the verify-and-correct loop until send is verified or the retry budget is exhausted.
13. Retry budget:
- up to `90` seconds total for the send attempt,
- up to `8` corrected attempts,
- fresh visual verification after each failed attempt.
14. If still not verified after the budget is exhausted, report blocker with exact observed UI state.
15. Do not end the turn after a miss while retry budget remains.

Starter-card guardrail:

- In a new thread, treat suggestion cards/chips (for example "Create a one-page $pdf...") as non-target UI.
- Never click a suggestion card as a workaround for failed send.
- If composer send fails, retry once per step 10, then report blocker.
- If additional project context is needed, gather it from local files/tools, not from suggestion cards.

Truthfulness guardrail:

- Never claim "message sent" unless step 9 is satisfied.
- If not verified, say `send not yet verified` and continue recovery.

### 12.14 Multi-turn Codex bug-resolution loop (critical)

Use this when user asks to talk with Codex repeatedly until a bug is solved.

Turn loop:

1. Keep the original bug statement anchored in every outbound message.
2. End every outbound message with: `Is the original bug solved now?`
3. Send using section 12.13 and verify before reporting success.
4. Read Codex's full reply before composing next turn.
5. Classify result as `solved`, `not solved`, or `blocked`.
6. If `solved`, stop loop and report completion immediately.
7. If `not solved`, continue same thread with the next targeted step.
8. If `blocked`, ask user only for the smallest missing input.

Continuity guardrails:

- If user reports previous send did not happen, trust that report and re-run section 12.13 from composer check.
- Do not open a new thread unless user explicitly requests a new thread.

### 12.15 Autonomous outbound messaging and unattended mode (critical)

Use this when the user wants the agent to generate its own messages to another AI and continue without live supervision.

Prerequisites before first send:

1. Confirm user explicitly allowed autonomous outbound messaging for this task.
2. Confirm desktop-control readiness is healthy (`ready`) and required permissions are granted:
- `System Settings > Privacy & Security > Accessibility`
- `System Settings > Privacy & Security > Screen Recording`
- `System Settings > Privacy & Security > Input Monitoring` (if keyboard events are required)
3. Confirm target app/thread is correct.
4. Confirm stop condition is defined (for example: bug solved, max turns reached, or blocker encountered).

Autonomous message-generation rule:

- If user did not provide exact text, the agent must generate concise outbound messages using this structure:

```text
Goal:
Current state:
Request:
Output needed:
Is the original goal solved now?
```

- Keep each outbound message tied to the same original mission.
- Do not switch topics or threads unless user requested it.

Send-and-verify requirement (no exceptions):

1. Follow section 12.13 exactly.
2. A turn counts only if send is verified by visible evidence.
3. If send is not verified after one retry, stop loop and report blocker immediately.

Unattended loop contract:

1. Send one message.
2. Verify send.
3. Wait and read full reply.
4. Classify reply as `solved`, `not solved`, or `blocked`.
5. If `not solved`, send next targeted message.
6. If `solved` or `blocked`, stop and report.

Default unattended limits (when user does not specify):

- Max turns: `6`
- Max idle wait per turn: `120` seconds for first token/response indicator
- Retry on failed send verification: `1`

Mandatory stop conditions:

- User intervention required (login/CAPTCHA/2FA/permission prompt not auto-resolvable)
- Repeated send verification failure
- Target thread/context mismatch
- Safety boundary reached (would perform irreversible or high-risk action without explicit user approval)

Required final report to user:

```text
Mission:
Turns completed:
Last status: solved | not solved | blocked
Evidence:
Next required user action (if blocked):
```

### 12.16 Compose-and-talk protocol for Codex threads (critical)

Use this when user asks how to type/talk to an AI in Codex or when repeated chat turns are required.

Where to type:

1. Open `Threads`.
2. Click the target thread title.
3. Locate the composer at the bottom of that thread (single-line or multi-line input field).
4. Click inside the composer until a caret appears.
   - If the first click misses, click the same lower-middle point again rather than a nearby random point.
5. Ignore starter/suggestion cards unless the user explicitly asks to run one of them.

How to write outbound messages:

1. Keep one concrete objective per message.
2. Include expected output format when precision matters.
3. Keep constraints explicit (`do not edit X`, `run tests Y`).
4. End with a direct request for the next action or verification evidence.

How to send safely:

1. Use `Enter` to send (or click Send).
2. If you need a newline before sending, use `Shift+Enter`.
3. Verify the message appears in the thread and composer clears.
4. If no send evidence appears, retry once, then report blocker.
5. Do not click starter suggestions as a send fallback.
