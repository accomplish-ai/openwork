/**
 * Openwork Release Bot - Cloudflare Worker
 *
 * Receives Slack interactive button clicks and triggers GitHub release workflow.
 *
 * Required secrets (set via wrangler secret put):
 * - SLACK_SIGNING_SECRET: From Slack App → Basic Information
 * - GITHUB_TOKEN: GitHub PAT with repo and workflow scopes
 */

export default {
  async fetch(request, env, ctx) {
    // Only accept POST from Slack
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Get request body
      const body = await request.text();

      // Verify Slack signature
      const signature = request.headers.get('x-slack-signature');
      const timestamp = request.headers.get('x-slack-request-timestamp');

      const isValid = await verifySlackSignature(signature, timestamp, body, env.SLACK_SIGNING_SECRET);
      if (!isValid) {
        console.error('Invalid Slack signature');
        return new Response('Invalid signature', { status: 401 });
      }

      // Parse Slack payload
      const params = new URLSearchParams(body);
      const payload = JSON.parse(params.get('payload'));

      // Get action (release_patch, release_minor, release_major)
      const actionId = payload.actions[0].action_id;
      const bumpType = actionId.replace('release_', '');
      const responseUrl = payload.response_url;

      // Validate bump type
      if (!['patch', 'minor', 'major'].includes(bumpType)) {
        await postToSlack(responseUrl, {
          response_type: 'ephemeral',
          text: `❌ Invalid release type: ${bumpType}`
        });
        return new Response('', { status: 200 });
      }

      const typeEmoji = { patch: '🔧', minor: '✨', major: '🚀' };

      // Immediately acknowledge and post "triggering" message
      ctx.waitUntil(postToSlack(responseUrl, {
        response_type: 'in_channel',
        replace_original: false,
        text: `${typeEmoji[bumpType]} ${capitalize(bumpType)} release triggered by <@${payload.user.id}>! Building...`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${typeEmoji[bumpType]} *${capitalize(bumpType)} release* triggered by <@${payload.user.id}>!\n\n_Building... this may take ~10 minutes._`
            },
            accessory: {
              type: 'button',
              text: { type: 'plain_text', text: 'View Build', emoji: true },
              url: 'https://github.com/accomplish-ai/openwork/actions/workflows/release.yml',
              style: 'primary'
            }
          }
        ]
      }));

      // Trigger GitHub workflow
      const githubResponse = await fetch(
        'https://api.github.com/repos/accomplish-ai/openwork/actions/workflows/release.yml/dispatches',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'openwork-release-bot',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: { bump_type: bumpType }
          })
        }
      );

      if (!githubResponse.ok) {
        const error = await githubResponse.text();
        console.error('GitHub API error:', githubResponse.status, error);
        await postToSlack(responseUrl, {
          response_type: 'ephemeral',
          replace_original: false,
          text: `❌ Failed to trigger release: ${githubResponse.status}`
        });
      }

      // Return empty 200 to acknowledge receipt
      return new Response('', { status: 200 });

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({
        response_type: 'ephemeral',
        text: `❌ Error: ${error.message}`
      });
    }
  }
};

/**
 * Post message to Slack via response_url
 */
async function postToSlack(responseUrl, message) {
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  if (!response.ok) {
    console.error('Failed to post to Slack:', response.status, await response.text());
  }
  return response;
}

/**
 * Create JSON response for Slack
 */
function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Verify Slack request signature using HMAC-SHA256
 * See: https://api.slack.com/authentication/verifying-requests-from-slack
 */
async function verifySlackSignature(signature, timestamp, body, secret) {
  if (!signature || !timestamp || !secret) {
    return false;
  }

  // Check timestamp is recent (within 5 minutes) to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.error('Slack request timestamp too old');
    return false;
  }

  // Create signature base string
  const sigBasestring = `v0:${timestamp}:${body}`;

  // Calculate expected signature using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(sigBasestring)
  );

  // Convert to hex string
  const expectedSignature = 'v0=' + Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Compare signatures
  return signature === expectedSignature;
}
