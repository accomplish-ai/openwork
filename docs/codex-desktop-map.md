# Codex Desktop Map

Last updated: 2026-02-28

Purpose:
- Give the screen agent a persistent, detailed visual map of the Codex desktop app.
- Reduce guesswork for mouse targeting.
- Describe where controls usually are, what they do, and how to verify that the pointer is on target.

Status:
- This is a local operator map based on the current Codex desktop layout visible in the user's screenshots and current project guidance.
- Use this as the first-reference document for Codex UI tasks.
- Do not assume every pixel is fixed forever. Use the map as a landmark system, then verify with current screenshots/live frames.

## 1. Core principle

Do not treat Codex as an unknown app.
Treat it as a mostly stable layout with:
- a left navigation sidebar
- a main thread pane
- a bottom composer
- a footer/status row
- top-right repo controls

For Codex tasks, navigate by landmarks first, then by exact control, then by hover verification.

## 2. Whole-window layout

Use the active Codex window bounds as the reference rectangle.

Normalized layout:
- Left sidebar: x 0% to 24%
- Main pane: x 24% to 100%
- Top toolbar/header: y 0% to 7%
- Conversation body / content body: y 7% to 80%
- Composer band: y 80% to 95%
- Footer/status row: y 95% to 100%

Interpretation:
- Almost every chat action happens in the main pane.
- Almost every thread-navigation action starts in the left sidebar.
- Almost every send action ends in the composer band near the bottom-right.

## 3. Left sidebar map

The left sidebar is the navigation column on the far left.

### 3.1 Top-left macOS controls

At the very top-left edge of the window are the macOS traffic-light buttons:
- red: close window
- yellow: minimize
- green: zoom/fullscreen

Do not click these when the intended target is `New thread`.

### 3.2 Primary nav rows

Below the traffic lights is the primary nav stack.

Expected order:
1. `New thread`
2. `Automations`
3. `Skills`

Expected position:
- around x 2% to 16% of full window width
- around y 5% to 18% of full window height

Meaning:
- `New thread`: opens a blank conversation
- `Automations`: opens recurring task/automation UI
- `Skills`: opens available skill/tooling UI

Targeting:
- click the center of the row label area
- do not click too high into the title bar
- do not click the icon edge; prefer the middle of the full row

Hover verification:
- row background typically darkens or gains a gray highlight under the pointer

### 3.3 Threads section

Below the primary nav rows is the `Threads` section.

Landmarks:
- heading text `Threads`
- thread groups and thread titles below it

Expected region:
- x 2% to 22%
- y 28% to 82%

Meaning:
- each thread row opens an existing conversation

Targeting:
- click the title text row, not the tiny timestamp at the far right
- if two thread rows are close together, aim for the text center of the correct row

Hover verification:
- the row darkens or highlights
- selected/current thread usually has a stronger active background state than hover

### 3.4 Bottom-left settings/upgrade area

Near the bottom of the sidebar:
- `Settings` usually appears near the far bottom-left
- an `Upgrade` button may appear near the bottom edge

These are not chat-send controls.

## 4. Main pane map

The main pane is everything to the right of the sidebar.

It contains:
- thread title/header
- conversation content
- hero empty-state content for new threads
- suggestion cards
- composer
- footer/status row

## 5. Top header / toolbar

At the top of the main pane:
- thread title at left, often `New thread`
- repo/workspace controls at right, often `Open` and `Commit`

Expected vertical band:
- y 0% to 7%

### 5.1 Thread title

Usually on the upper-left of the main pane.

Meaning:
- confirms which conversation is open

Use:
- verification only
- not the normal send target

### 5.2 `Open`

Usually top-right of the main pane.

Meaning:
- choose or switch repo/workspace context

Use:
- repo/task context changes only
- not for sending chat messages

### 5.3 `Commit`

Usually to the right of or near `Open`.

Meaning:
- opens commit/source-control flow

Use:
- source-control tasks only
- not for chat messages

## 6. New-thread empty-state layout

When a new thread is open, the main pane often shows:
- centered Codex logo/cloud-like icon
- large hero text such as `Let's build`
- workspace/project label below, such as `openwork`
- suggestion cards above the composer

These are orientation landmarks, not send controls.

### 6.1 Hero block

Expected region:
- x 45% to 60%
- y 34% to 52%

Contains:
- logo mark
- hero heading
- workspace label

Do not click here to send a message.

### 6.2 Suggestion cards

Expected region:
- x 30% to 88%
- y 70% to 82%

Appearance:
- rounded rectangular cards
- each card contains canned example text

Meaning:
- predefined prompts or task starters

Rule:
- ignore these unless the user explicitly asked to use that exact card
- never use them as a fallback for failed sending

## 7. Composer map

The composer is the most important target for Codex chat.

Definition:
- the wide rounded text input at the bottom of the main pane
- directly above the footer row
- directly below the suggestion cards on new-thread screens

Expected region:
- x 30% to 88%
- y 84% to 95%

Primary landmark:
- find the footer row containing `Local`, access status, and branch name
- the composer is immediately above that row

### 7.1 Composer structure

From left to right, inside the composer:
- `+` button at the left interior
- model selector, for example `GPT-5.3-Codex`
- effort selector, for example `Low`
- large text-entry body
- microphone icon near the right edge
- circular send button at the far-right edge

### 7.2 Text-entry body

Meaning:
- where the caret should go
- where typed text should appear

Safe click zone:
- lower-middle interior of the rounded field
- horizontally near the center
- vertically slightly below the field midpoint

Avoid:
- top border
- placeholder text band
- upper portion close to suggestion cards
- border edges

Why:
- the user reports the agent tends to aim too high
- upper-half misses can land in empty space or non-input area

### 7.3 `+` button

Location:
- far-left inside the composer

Meaning:
- attach/insert options

Do not confuse with:
- text entry body
- send

### 7.4 Model selector

Location:
- lower-left portion inside the composer

Examples:
- `GPT-5.3-Codex`

Meaning:
- selects model

Not a send control.

### 7.5 Effort selector

Location:
- near the model selector

Examples:
- `Low`

Meaning:
- selects effort/reasoning level

Not a send control.

### 7.6 Microphone button

Location:
- near the bottom-right interior of the composer
- immediately left of the send button

Meaning:
- starts voice input

Do not click this when the task is to send typed text.

### 7.7 Send button

Location:
- far-right interior of the composer
- circular button with an upward arrow

Meaning:
- submit typed text

Targeting rule:
- click the center of the circle
- do not click above it
- do not click the gap between mic and send
- do not click the top half of the composer expecting send

Hover verification:
- the circle or its background usually darkens/highlights when the pointer is truly on it

## 8. Footer row map

The footer row sits immediately below the composer.

Typical items:
- `Local`
- access status such as `Full access`
- branch name such as `main`

Meaning:
- environment/status indicators

Use:
- landmark for locating the composer

Rule:
- if you can identify the footer row, move upward to find the composer

## 9. Message history map

In active threads, messages appear above the composer in the conversation body.

Meaning:
- newest content is nearest the bottom of the conversation body
- outbound message bubbles should appear there after send

Verification cues for successful send:
- your message appears as a new outbound item near the bottom
- composer clears or resets
- model response indicator may appear

## 10. Meaning of each commonly requested control

`New thread`
- open a blank conversation

Thread row
- open that existing conversation

`Open`
- choose/switch repository or workspace context

`Commit`
- open commit workflow

Composer body
- place caret and type

Send up-arrow
- submit current typed message

Microphone
- start voice capture

Starter card
- launch canned prompt

`Settings`
- app settings

## 11. Codex task recipes

### 11.1 Open a new thread

1. Focus Codex.
2. Move to left sidebar.
3. Find `New thread` near the top.
4. Hover-confirm row highlight.
5. Click center of row.
6. Verify a blank/new thread screen opens.

### 11.2 Open an existing thread

1. Focus Codex.
2. Move to left sidebar `Threads` section.
3. Find correct thread title row.
4. Hover-confirm row highlight.
5. Click title row.
6. Verify conversation content changes.

### 11.3 Type in the composer

1. Find footer row.
2. Move just above it to the wide rounded composer.
3. Click lower-middle interior of the composer.
4. Verify caret appears in the text field.
5. Type/paste text.

### 11.4 Send typed text

Preferred path:
1. Focus composer.
2. Type message.
3. Press `Enter`.
4. Verify outbound bubble + cleared composer.

Fallback path:
1. Move to send button circle at far-right of composer.
2. Hover-confirm darker/highlighted state.
3. Click center of the circle.
4. Verify outbound bubble + cleared composer.

### 11.5 Recover from a miss

If the attempted action did not happen:
1. Capture a fresh screenshot or live frame.
2. Compare actual pointer landing point to intended target.
3. Classify miss:
- high
- low
- left
- right
- overlay/interception
- uncertain
4. Retry with a small directional correction.

For the current user issue:
- if the pointer landed high, correct downward
- do not repeat the same Y coordinate if the screenshot proves it missed high

## 12. Retry policy for Codex misclicks

For Codex send/focus actions:
- do not stop after one miss if live verification is available
- keep retrying while retry budget remains

Default budget:
- up to 90 seconds
- up to 8 corrected attempts
- fresh visual verification after each failed attempt

Hard blockers:
- modal overlay intercepting clicks
- permissions issue
- wrong app or wrong thread
- control disabled
- retry budget exhausted

## 13. Specific anti-patterns

Do not:
- click suggestion cards when the task is to send a custom message
- click the hero text/logo block
- click the macOS traffic lights instead of `New thread`
- click the microphone when the task is text send
- click the upper half of the composer when the lower-middle body is the intended target
- stop the attempt without visual verification of success if screenshots/live frames are available

## 14. What to verify after each attempted action

After thread-open click:
- selected thread changed
- main pane content changed

After `New thread` click:
- blank/new-thread layout visible

After composer focus click:
- caret appears in composer
- typed text lands in composer

After send:
- outbound bubble appears
- composer clears
- response indicator appears or thread state changes

## 15. Priority order for Codex orientation

When uncertain, locate in this order:
1. full Codex window bounds
2. left sidebar
3. footer row
4. composer above footer row
5. send button at far-right of composer

This order is safer than searching random central UI first.

## 16. Canonical rules

For Codex UI tasks:
- read this file first
- use it as the primary visual map
- verify against current screenshot/live frame
- prefer stable landmarks over guesswork
- prefer verified state change over one-shot clicking
