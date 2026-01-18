# One-Click Slack Release Design

## Overview

Enable true one-click releases from Slack: click a button → release builds and publishes automatically → Slack notifies when complete.

## Goal

Replace the current two-click flow with a seamless one-click experience using a Cloudflare Worker as the bridge between Slack and GitHub.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Slack Reminder (scheduled 10am & 7pm Israel)               │
│                                                                 │
│  📦 Release Reminder - Openwork                                │
│  5 commits since v0.2.1:                                       │
│  • abc123 fix: something                                       │
│  • def456 feat: new feature                                    │
│                                                                 │
│  [🔧 Patch → 0.2.2]  [✨ Minor → 0.3.0]  [🚀 Major → 1.0.0]    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User clicks button
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Slack sends POST to Cloudflare Worker                      │
│                                                                 │
│  Worker: openwork-release-bot.workers.dev                      │
│  - Verifies Slack signature (security)                         │
│  - Parses action: patch|minor|major                            │
│  - Calls GitHub API: workflow_dispatch                         │
│  - Returns: "🚀 Release triggered! Building..."                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ GitHub API call
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. GitHub Actions: release.yml runs                           │
│                                                                 │
│  - Bumps version                                                │
│  - Builds macOS ARM64 + Intel                                  │
│  - Creates GitHub Release (published, not draft)               │
│  - Notifies Slack: "✅ Released v0.2.2!"                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Slack: #openwork-opensource-releases                       │
│                                                                 │
│  ✅ Openwork v0.2.2 Released!                                  │
│  [View Release]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Cloudflare Worker

**File:** Deploy via Wrangler CLI or Cloudflare Dashboard

```javascript
export default {
  async fetch(request, env) {
    // Only accept POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify Slack signature
    const signature = request.headers.get('x-slack-signature');
    const timestamp = request.headers.get('x-slack-request-timestamp');
    const body = await request.text();

    if (!verifySlackSignature(signature, timestamp, body, env.SLACK_SIGNING_SECRET)) {
      return new Response('Invalid signature', { status: 401 });
    }

    // Parse Slack payload
    const params = new URLSearchParams(body);
    const payload = JSON.parse(params.get('payload'));

    // Get action (patch, minor, major)
    const actionId = payload.actions[0].action_id;
    const bumpType = actionId.replace('release_', ''); // release_patch -> patch

    // Trigger GitHub workflow
    const response = await fetch(
      `https://api.github.com/repos/accomplish-ai/openwork/actions/workflows/release.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'openwork-release-bot'
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { bump_type: bumpType }
        })
      }
    );

    if (!response.ok) {
      return new Response(JSON.stringify({
        response_type: 'ephemeral',
        text: `❌ Failed to trigger release: ${response.status}`
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Return success message to Slack
    return new Response(JSON.stringify({
      response_type: 'ephemeral',
      text: `🚀 ${bumpType.charAt(0).toUpperCase() + bumpType.slice(1)} release triggered! Building...`
    }), { headers: { 'Content-Type': 'application/json' } });
  }
};

function verifySlackSignature(signature, timestamp, body, secret) {
  // Implement HMAC-SHA256 verification
  // See: https://api.slack.com/authentication/verifying-requests-from-slack
}
```

### 2. Updated release-reminder.yml

Change buttons from URL buttons to interactive buttons:

```yaml
# Before (URL buttons - opens browser)
{ type: "button", text: {...}, url: $workflow_url }

# After (Interactive buttons - POSTs to Worker)
{
  type: "button",
  text: { type: "plain_text", text: "🔧 Patch → \($patch)", emoji: true },
  action_id: "release_patch"
}
```

### 3. Updated release.yml

```yaml
# Change draft to false
- name: Create Release
  uses: softprops/action-gh-release@v2
  with:
    draft: false  # Was: true
    # ... rest of config

# Add Slack notification at the end
- name: Notify Slack
  if: success()
  env:
    SLACK_WEBHOOK: ${{ secrets.SLACK_RELEASE_WEBHOOK_URL }}
  run: |
    curl -X POST -H 'Content-type: application/json' \
      --data "{
        \"blocks\": [
          {
            \"type\": \"section\",
            \"text\": {
              \"type\": \"mrkdwn\",
              \"text\": \"✅ *Openwork v${{ needs.version-bump.outputs.new_version }} Released!*\"
            },
            \"accessory\": {
              \"type\": \"button\",
              \"text\": { \"type\": \"plain_text\", \"text\": \"View Release\" },
              \"url\": \"https://github.com/${{ github.repository }}/releases/tag/v${{ needs.version-bump.outputs.new_version }}\"
            }
          }
        ]
      }" \
      "$SLACK_WEBHOOK"
```

### 4. Slack App Configuration

1. Go to Slack App settings → Interactivity & Shortcuts
2. Toggle ON "Interactivity"
3. Set Request URL: `https://openwork-release-bot.<your-subdomain>.workers.dev`
4. Save

## Secrets Configuration

| Location | Secret Name | Value |
|----------|-------------|-------|
| Cloudflare Worker | `SLACK_SIGNING_SECRET` | From Slack App → Basic Information → Signing Secret |
| Cloudflare Worker | `GITHUB_TOKEN` | GitHub PAT with `repo` and `workflow` scopes |
| GitHub Repo | `SLACK_RELEASE_WEBHOOK_URL` | Already configured |

## Setup Steps

1. **Create Cloudflare Account** (if needed)
   - Go to https://dash.cloudflare.com
   - Sign up (free)

2. **Create Worker**
   - Workers & Pages → Create → Worker
   - Name: `openwork-release-bot`
   - Deploy the code above

3. **Add Worker Secrets**
   - Worker → Settings → Variables → Add
   - `SLACK_SIGNING_SECRET` and `GITHUB_TOKEN`

4. **Create GitHub PAT**
   - GitHub → Settings → Developer settings → Personal access tokens
   - Generate with `repo` and `workflow` scopes

5. **Configure Slack App**
   - Enable Interactivity
   - Set Request URL to Worker URL

6. **Update Workflows**
   - `release-reminder.yml` - Change to interactive buttons
   - `release.yml` - Add Slack notification, change draft to false

## Security

- Slack requests are verified via HMAC-SHA256 signature
- GitHub token is stored as Cloudflare secret (encrypted)
- Worker only accepts POST requests
- Minimal permissions: only triggers one specific workflow

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid Slack signature | 401 Unauthorized |
| GitHub API fails | Ephemeral error message to user |
| Release build fails | No completion notification (user checks GitHub) |
| Worker down | Slack shows "dispatch failed" error |

## Future Improvements

- Add "Cancel Release" button if build is taking too long
- Add release notes preview in Slack before confirming
- Support for release branches (not just main)
