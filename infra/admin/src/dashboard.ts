export function getDashboardHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accomplish Admin — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --background: #f9f9f9;
      --foreground: #202020;
      --card: #fcfcfc;
      --card-foreground: #202020;
      --primary: #213c20;
      --primary-foreground: #ffffff;
      --secondary: #d8dfd7;
      --secondary-foreground: #2b391e;
      --muted: #efefef;
      --muted-foreground: #646464;
      --accent: #e8e8e8;
      --border: #eae2e1;
      --input: #d8d8d8;
      --ring: #644a40;
      --destructive: #e54d2e;
      --warning: #EE7909;
      --success: #019E55;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.10);
    }

    html.dark {
      --background: #111;
      --foreground: #e5e5e5;
      --card: #1a1a1a;
      --card-foreground: #e5e5e5;
      --primary: #3a7a37;
      --primary-foreground: #ffffff;
      --secondary: #1e2d1d;
      --secondary-foreground: #a8c0a6;
      --muted: #252525;
      --muted-foreground: #888;
      --accent: #2a2a2a;
      --border: #333;
      --input: #333;
      --ring: #9a8a80;
      --destructive: #e54d2e;
      --warning: #EE7909;
      --success: #019E55;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.4);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
      background: var(--background);
      color: var(--foreground);
      -webkit-font-smoothing: antialiased;
    }

    .wrap { max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .header h1 { font-size: 28px; font-weight: 900; letter-spacing: -0.02em; }
    .header p { font-size: 14px; color: var(--muted-foreground); margin-top: 4px; }
    .header-actions { display: flex; gap: 10px; align-items: center; }
    .header-title-row { display: flex; align-items: center; gap: 10px; }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 0 16px; height: 36px; border-radius: 6px; border: none; cursor: pointer;
      font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
      transition: all 0.15s; white-space: nowrap; text-decoration: none;
    }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-primary { background: var(--primary); color: var(--primary-foreground); }
    .btn-primary:hover:not(:disabled) { background: #2a4d28; }
    .btn-outline { background: var(--card); color: var(--foreground); border: 1px solid var(--border); }
    .btn-outline:hover:not(:disabled) { background: var(--accent); }
    .btn-destructive { background: var(--destructive); color: #fff; }
    .btn-destructive:hover:not(:disabled) { opacity: 0.9; }
    .btn-ghost { background: transparent; color: var(--muted-foreground); }
    .btn-ghost:hover:not(:disabled) { background: var(--accent); color: var(--foreground); }
    .btn-sm { height: 32px; padding: 0 12px; font-size: 13px; }

    /* Cards */
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 24px; box-shadow: var(--shadow-sm); overflow: hidden;
    }

    /* Badges */
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 100px; font-size: 12px; font-weight: 500;
    }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-gray { background: var(--muted); color: var(--muted-foreground); }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-purple { background: #ede9fe; color: #5b21b6; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; }
    .badge-green .badge-dot { background: #22c55e; }
    .badge-amber .badge-dot { background: #f59e0b; }

    html.dark .badge-green { background: #14532d; color: #86efac; }
    html.dark .badge-amber { background: #451a03; color: #fbbf24; }
    html.dark .badge-blue { background: #1e3a5f; color: #93c5fd; }
    html.dark .badge-purple { background: #3b1f6e; color: #c4b5fd; }

    /* Hero Banner */
    .hero {
      background: linear-gradient(135deg, #213c20 0%, #2d5429 100%);
      border-radius: 20px; padding: 28px 32px; color: #fff; margin-bottom: 32px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .hero .ver { font-size: 36px; font-weight: 900; letter-spacing: -0.02em; }
    .hero .label { font-size: 13px; opacity: 0.7; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .hero .meta { font-size: 13px; opacity: 0.8; margin-top: 6px; }
    .hero-actions { display: flex; gap: 8px; }
    .hero .btn-hero { background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.25); }
    .hero .btn-hero:hover { background: rgba(255,255,255,0.25); }

    /* Sections */
    .section { margin-bottom: 32px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .section-header h2 { font-size: 15px; font-weight: 700; }

    /* Table */
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); padding: 12px 16px; }
    td { padding: 12px 16px; font-size: 14px; border-top: 1px solid var(--border); vertical-align: middle; }

    /* Override rows */
    .override-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px; background: var(--muted); border-radius: 12px; margin-bottom: 8px;
    }
    .override-row:last-child { margin-bottom: 0; }
    .override-inner { display: flex; align-items: center; gap: 16px; }

    /* Collapsible */
    .collapsible-toggle {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      font-size: 14px; font-weight: 600; color: var(--foreground); background: none; border: none;
      font-family: 'DM Sans', sans-serif; padding: 16px 24px; width: 100%;
    }
    .collapsible-toggle .arrow { transition: transform 0.2s; font-size: 12px; color: var(--muted-foreground); }
    .collapsible-toggle.open .arrow { transform: rotate(90deg); }
    .collapsible-body { display: none; padding: 0 24px 20px; }
    .collapsible-body.open { display: block; }
    .collapsible-body pre {
      background: #1a1a1a; color: #e0e0e0; padding: 16px 20px;
      border-radius: 12px; font-size: 13px; line-height: 1.6; overflow-x: auto;
      font-family: 'DM Sans', monospace;
    }
    html.dark .collapsible-body pre { background: #111; border: 1px solid var(--border); }

    /* Modal */
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0); backdrop-filter: blur(0px);
      display: flex; align-items: center; justify-content: center; z-index: 50;
      transition: background 0.15s ease-out, backdrop-filter 0.15s ease-out;
    }
    .modal-backdrop.visible { background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
    .modal-backdrop.hidden { display: none; }
    .modal {
      background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 24px;
      max-width: 480px; width: calc(100% - 32px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
      transform: scale(0.95) translateY(-10px); opacity: 0;
      transition: transform 0.15s ease-out, opacity 0.1s ease-out;
    }
    .modal-backdrop.visible .modal { transform: scale(1) translateY(0); opacity: 1; }
    .modal-backdrop.closing { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
    .modal-backdrop.closing .modal { transform: scale(0.95) translateY(-10px); opacity: 0; }
    .modal h3 { font-size: 18px; font-weight: 600; line-height: 1; letter-spacing: -0.01em; margin-bottom: 8px; }
    .modal-desc { font-size: 14px; color: var(--muted-foreground); margin-bottom: 20px; }
    .modal .diff { background: var(--muted); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6; }
    .modal .diff .old { color: var(--destructive); text-decoration: line-through; }
    .modal .diff .new { color: var(--success); font-weight: 600; }
    .modal .actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 16px; border-top: 1px solid var(--border); }
    .modal label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--muted-foreground); }
    .modal input, .modal select {
      width: 100%; height: 36px; border: 1px solid var(--border); border-radius: 6px;
      padding: 0 12px; font-family: 'DM Sans', sans-serif; font-size: 13px;
      background: var(--card); color: var(--foreground); margin-bottom: 16px;
    }
    .modal .confirm-hint { font-size: 12px; color: var(--muted-foreground); margin-top: -12px; margin-bottom: 16px; }
    .modal .warn-banner {
      display: flex; align-items: center; gap: 8px; padding: 10px 14px;
      background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px;
      margin-bottom: 16px; font-size: 13px; color: #92400e;
    }
    html.dark .modal .warn-banner { background: #451a03; border-color: #78350f; color: #fbbf24; }

    /* Deploy states */
    .deploy-state { display: flex; flex-direction: column; align-items: center; padding: 8px 0 4px; }
    .deploy-icon {
      width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px; transition: all 0.2s ease;
    }
    .deploy-icon.idle { background: var(--primary); }
    .deploy-icon.loading { background: var(--muted); }
    .deploy-icon.success { background: #dcfce7; }
    .deploy-icon.error { background: #fee2e2; }
    .deploy-spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: btn-spin 0.6s linear infinite; }
    .deploy-status { font-size: 14px; color: var(--muted-foreground); margin-bottom: 4px; }
    .btn.is-loading { position: relative; color: transparent; pointer-events: none; }
    .btn.is-loading::after {
      content: ''; position: absolute; width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
      border-radius: 50%; animation: btn-spin 0.6s linear infinite;
    }
    @keyframes btn-spin { to { transform: rotate(360deg); } }

    .result-banner {
      display: flex; align-items: center; gap: 8px; padding: 12px 16px;
      border-radius: 8px; margin-bottom: 16px; font-size: 13px; font-weight: 500;
    }
    .result-banner.success { background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; }
    .result-banner.error { background: #fee2e2; border: 1px solid #fecaca; color: #dc2626; }
    html.dark .result-banner.success { background: #14532d; border-color: #166534; color: #86efac; }
    html.dark .result-banner.error { background: #450a0a; border-color: #7f1d1d; color: #fca5a5; }

    .deploy-run-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; margin-top: 8px; color: var(--primary); text-decoration: none; }
    .deploy-run-link:hover { text-decoration: underline; }
    .deploy-status-badge {
      display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
      border-radius: 100px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .deploy-status-badge.queued { background: var(--muted); color: var(--muted-foreground); }
    .deploy-status-badge.in_progress { background: #dbeafe; color: #1e40af; }
    .deploy-status-badge.completed-success { background: #dcfce7; color: #166534; }
    .deploy-status-badge.completed-failure { background: #fee2e2; color: #dc2626; }

    /* Toast */
    #toast-container { position: fixed; top: 20px; right: 20px; z-index: 2000; display: flex; flex-direction: column; gap: 8px; }
    .toast {
      padding: 12px 20px; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 500;
      animation: toast-in 0.3s ease-out; min-width: 240px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .toast-success { background: var(--success); }
    .toast-error { background: var(--destructive); }
    @keyframes toast-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes toast-out { from { opacity: 1; } to { opacity: 0; transform: translateY(-10px); } }

    /* Commit rows */
    .commit-row { display: flex; gap: 12px; padding: 8px 16px; align-items: baseline; border-top: 1px solid var(--border); }
    .commit-row:first-child { border-top: none; }
    .commit-row .sha { font-family: 'DM Sans', monospace; font-size: 12px; color: var(--ring); font-weight: 500; background: var(--muted); padding: 2px 6px; border-radius: 4px; }
    .commit-row .msg { font-size: 13px; flex: 1; color: var(--foreground); }
    .commit-row .author { font-size: 12px; color: var(--muted-foreground); }
    .commit-row .date { font-size: 12px; color: var(--muted-foreground); }
    .expand-btn { background: none; border: none; cursor: pointer; font-size: 12px; color: var(--muted-foreground); font-family: 'DM Sans', sans-serif; padding: 2px 6px; }
    .expand-btn:hover { color: var(--foreground); }
    .commits-container { padding: 0 16px 12px; }

    /* Tab Bar */
    .tab-bar {
      display: flex; gap: 0; margin-bottom: 32px;
      border-bottom: 2px solid var(--border);
    }
    .tab {
      padding: 10px 20px; font-size: 14px; font-weight: 500; cursor: pointer;
      color: var(--muted-foreground); border: none; background: none;
      font-family: 'DM Sans', sans-serif; position: relative;
      transition: color 0.15s;
    }
    .tab:hover { color: var(--foreground); }
    .tab.active {
      color: var(--foreground); font-weight: 700;
    }
    .tab.active::after {
      content: ''; position: absolute; bottom: -2px; left: 0; right: 0;
      height: 2px; background: var(--primary); border-radius: 1px;
    }

    /* Checkbox */
    .checkbox-row {
      display: flex; align-items: center; gap: 10px; margin-bottom: 20px;
      font-size: 14px; cursor: pointer;
    }
    .checkbox-row input[type="checkbox"] {
      width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer;
      margin: 0;
    }

    /* Audit Log */
    .audit-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .audit-table thead th {
      font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--muted-foreground);
      text-align: left; padding: 12px 16px;
      border-bottom: 2px solid var(--border); background: var(--muted);
    }
    .audit-table thead th:last-child { text-align: right; }
    .audit-table tbody tr.audit-row {
      cursor: pointer; transition: background 0.12s;
      border-bottom: 1px solid var(--border);
    }
    .audit-table tbody tr.audit-row:hover { background: var(--muted); }
    .audit-action-dot {
      width: 7px; height: 7px; border-radius: 50%;
      display: inline-block; margin-right: 8px; vertical-align: middle;
    }
    .audit-action-dot.config { background: #3b82f6; }
    .audit-action-dot.deploy { background: #f59e0b; }
    .audit-action-dot.release { background: #10b981; }
    .audit-action-text { font-weight: 500; color: var(--foreground); }
    .audit-table td { padding: 11px 16px; vertical-align: middle; }
    .audit-time { font-size: 13px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .audit-source { font-size: 12.5px; color: var(--muted-foreground); font-style: italic; }
    .audit-user { font-size: 12.5px; color: var(--muted-foreground); white-space: nowrap; }
    .audit-chevron { color: var(--muted-foreground); font-size: 12px; transition: transform 0.2s, color 0.2s; display: inline-block; }
    tr.audit-expanded .audit-chevron { transform: rotate(90deg); color: var(--foreground); }
    .audit-detail-row td {
      padding: 0 16px 14px; background: var(--muted);
      border-bottom: 1px solid var(--border);
    }
    .audit-detail-content {
      font-size: 12.5px; color: var(--muted-foreground); line-height: 1.6;
      padding: 12px 16px; background: var(--card);
      border-radius: 8px; border: 1px solid var(--border);
    }
    .diff-tag {
      font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
      text-transform: uppercase; display: inline-block;
      padding: 2px 6px; border-radius: 3px; margin-right: 6px;
    }
    .diff-tag-rem { background: #fef2f2; color: #dc2626; }
    .diff-tag-add { background: #f0fdf4; color: #16a34a; }
    html.dark .diff-tag-rem { background: #450a0a; color: #fca5a5; }
    html.dark .diff-tag-add { background: #052e16; color: #86efac; }

    /* Health indicator */
    .health-dot {
      width: 8px; height: 8px; border-radius: 50%; display: inline-block;
      flex-shrink: 0;
    }
    .health-dot.ok { background: #22c55e; }
    .health-dot.degraded { background: #ef4444; }
    .health-dot.unknown { background: #9ca3af; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* Dark mode toggle */
    .dark-toggle {
      background: none; border: 1px solid var(--border); border-radius: 6px;
      width: 36px; height: 36px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--foreground); transition: background 0.15s;
    }
    .dark-toggle:hover { background: var(--accent); }

    /* Tooltip */
    .tooltip-wrap { position: relative; display: inline-flex; align-items: center; }
    .tooltip-icon {
      width: 16px; height: 16px; border-radius: 50%; background: var(--muted);
      color: var(--muted-foreground); display: inline-flex; align-items: center;
      justify-content: center; font-size: 11px; font-weight: 700; cursor: help;
      margin-left: 6px; flex-shrink: 0;
    }
    .tooltip-text {
      display: none; position: absolute; bottom: calc(100% + 8px); left: 50%;
      transform: translateX(-50%); background: #1a1a1a; color: #e0e0e0;
      padding: 8px 12px; border-radius: 6px; font-size: 12px; line-height: 1.5;
      width: 260px; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      pointer-events: none;
    }
    .tooltip-text::after {
      content: ''; position: absolute; top: 100%; left: 50%; margin-left: -5px;
      border-width: 5px; border-style: solid; border-color: #1a1a1a transparent transparent transparent;
    }
    .tooltip-wrap:hover .tooltip-text { display: block; }

    /* Resource links */
    .resource-links { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .resource-link {
      display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
      color: var(--muted-foreground); text-decoration: none; padding: 4px 10px;
      border: 1px solid var(--border); border-radius: 6px; transition: all 0.15s;
    }
    .resource-link:hover { color: var(--foreground); background: var(--accent); }

    /* Version comparison */
    .compare-grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: end; margin-bottom: 20px; }
    .compare-arrow { align-self: center; color: var(--muted-foreground); font-size: 18px; margin-bottom: 16px; }
    .compare-result { max-height: 400px; overflow-y: auto; }

    /* Tier badges inline */
    .tier-badges { display: inline-flex; gap: 4px; margin-left: 8px; vertical-align: middle; }
    .tier-badge { font-size: 10px; padding: 1px 6px; border-radius: 100px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }

    /* Loading */
    .loading { text-align: center; padding: 60px 0; color: var(--muted-foreground); font-size: 14px; }
    .loading-sm { text-align: center; padding: 16px 0; color: var(--muted-foreground); font-size: 13px; }

    /* Desktop manifest cards (legacy) */
    .manifest-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 16px; padding: 24px; box-shadow: var(--shadow-sm);
    }
    .manifest-card.empty { display: flex; align-items: center; justify-content: center; color: var(--muted-foreground); font-size: 14px; min-height: 120px; }

    /* Version Status tiles */
    .version-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .version-tile { background: var(--background); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
    .version-tile-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .version-tile-label { font-size: 12px; font-weight: 500; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.5px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .status-dot.green { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .status-dot.amber { background: var(--warning); box-shadow: 0 0 6px var(--warning); }
    .version-value { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; }
    .version-value.missing { color: var(--muted-foreground); font-size: 20px; font-weight: 500; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 500; }
    .status-badge.match { background: #e6f5ed; color: var(--success); }
    .status-badge.drift { background: #fef3e2; color: var(--warning); }
    html.dark .status-badge.match { background: #14532d; color: #86efac; }
    html.dark .status-badge.drift { background: #451a03; color: #fbbf24; }

    /* Downloads grid */
    .downloads-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .download-item { display: flex; align-items: center; gap: 12px; background: var(--background); border: 1px solid var(--border); border-radius: 14px; padding: 14px 18px; cursor: pointer; transition: border-color 0.15s ease; text-decoration: none; color: inherit; }
    .download-item:hover { border-color: var(--primary); }
    .download-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--secondary); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .download-label { font-size: 14px; font-weight: 500; }
    .download-sub { font-size: 12px; color: var(--muted-foreground); }

    /* Next Build row */
    .next-build-row { display: flex; align-items: center; gap: 16px; }
    .next-build-version { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .next-build-detail { font-size: 13px; color: var(--muted-foreground); }

    /* Desktop card with padding and title inside */

    /* Desktop version expand */
    .desktop-version-row { cursor: pointer; transition: background 0.12s; }
    .desktop-version-row:hover { background: var(--muted); }
    .desktop-files { padding: 0 16px 12px; }
    .desktop-file-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 16px; font-size: 13px; border-top: 1px solid var(--border); }
    .desktop-file-row:first-child { border-top: none; }

    /* Badge red for failures */
    .badge-red { background: #fee2e2; color: #dc2626; }
    html.dark .badge-red { background: #450a0a; color: #fca5a5; }
    .badge-yellow { background: #fef3c7; color: #92400e; }
    html.dark .badge-yellow { background: #451a03; color: #fbbf24; }
  </style>
</head>
<body>

<div id="toast-container"></div>
<div id="modal-root"></div>

<div class="wrap">
  <div class="header">
    <div>
      <div class="header-title-row">
        <h1>Accomplish Releases</h1>
        <span id="health-dot" class="health-dot unknown" title="Checking health..."></span>
      </div>
      <p>Manage deployed versions, overrides, and routing configuration</p>
    </div>
    <div class="header-actions">
      <a id="github-link" class="btn btn-outline btn-sm" target="_blank" rel="noopener" style="display:none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        GitHub
      </a>
      <button id="dark-toggle" class="dark-toggle" title="Toggle dark mode">
        <svg id="dark-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg id="dark-icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      </button>
      <button id="deploy-btn" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        Deploy New Build
      </button>
      <button id="desktop-release-btn" class="btn btn-primary" style="display:none;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        Release Desktop App
      </button>
    </div>
  </div>

  <div id="app-root"><div class="loading">Loading configuration...</div></div>
</div>

<script nonce="${nonce}">
// ── Escaping ──
function esc(str) {
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── State ──
var config = null;
var meta = null;
var manifests = {};
var expandedVersions = {};
var currentTab = 'desktop';
var auditEntries = null;
var auditLoading = false;
var expandedAuditEntries = {};
var auditDetailCache = {};
var auditDetailLoading = {};
var auditPollTimer = null;
var healthStatus = null;
var buildsList = null;
var deployRunUrl = null;
var deployStatusTimer = null;
var desktopManifests = null;
var desktopWorkflows = null;
var desktopVersions = null;
var desktopPackageVersion = null;
var desktopWorkflowsPollTimer = null;
var expandedDesktopVersions = {};
var desktopLoading = false;
var websiteVersion = null;

// ── API ──
function loadManifests() {
  var versions = config ? config.activeVersions : [];
  versions.forEach(function(bid) {
    if (manifests[bid]) return;
    fetch('/api/builds/' + encodeURIComponent(bid) + '/manifest')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { if (data) { manifests[bid] = data; renderAll(); } });
  });
}

function toggleExpand(bid) {
  if (expandedVersions[bid]) { delete expandedVersions[bid]; } else { expandedVersions[bid] = true; }
  renderAll();
}

function loadConfig() {
  fetch('/api/config')
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      if (data._meta) {
        meta = data._meta;
        delete data._meta;
        updateResourceLinks();
      }
      config = data;
      renderAll();
      loadManifests();
    })
    .catch(function(err) {
      document.getElementById('app-root').innerHTML = '<div class="loading">Failed to load config: ' + esc(err.message) + '</div>';
    });
}

function saveConfig(newConfig) {
  return fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newConfig)
  }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'HTTP ' + r.status); });
    return r.json();
  }).then(function(data) {
    config = data;
    renderAll();
    return data;
  });
}

function triggerDeploy(setAsDefault) {
  return fetch('/api/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setAsDefault: setAsDefault })
  }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'HTTP ' + r.status); });
    return r.json();
  });
}

function checkHealth() {
  fetch('/health')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      healthStatus = data.status;
      updateHealthDot();
    })
    .catch(function() {
      healthStatus = 'degraded';
      updateHealthDot();
    });
}

function updateHealthDot() {
  var dot = document.getElementById('health-dot');
  if (!dot) return;
  dot.className = 'health-dot ' + (healthStatus || 'unknown');
  dot.title = healthStatus === 'ok' ? 'All systems operational' : healthStatus === 'degraded' ? 'System degraded' : 'Checking health...';
}

function loadBuilds() {
  fetch('/api/builds')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data) { buildsList = data; renderAll(); }
    });
}

function loadDesktopManifests() {
  fetch('/api/desktop/manifests')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) { desktopManifests = data; renderAll(); })
    .catch(function(err) { showToast('Failed to load desktop manifests: ' + err.message, 'error'); });
}

function loadDesktopWorkflows() {
  fetch('/api/desktop/workflows')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) { desktopWorkflows = data; renderAll(); })
    .catch(function(err) { showToast('Failed to load desktop workflows: ' + err.message, 'error'); });
}

function loadDesktopVersions() {
  fetch('/api/desktop/versions')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) { desktopVersions = data; renderAll(); })
    .catch(function(err) { showToast('Failed to load desktop versions: ' + err.message, 'error'); });
}

function loadDesktopPackageVersion() {
  fetch('/api/desktop/package-version')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) { desktopPackageVersion = data.version; renderAll(); })
    .catch(function(err) { showToast('Failed to load desktop package version: ' + err.message, 'error'); });
}

function loadWebsiteVersion() {
  fetch('/api/website-version')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) { websiteVersion = data; renderAll(); })
    .catch(function(err) { showToast('Failed to load website version: ' + err.message, 'error'); });
}

function startDesktopPoll() {
  stopDesktopPoll();
  desktopWorkflowsPollTimer = setInterval(function() {
    if (currentTab !== 'desktop') { stopDesktopPoll(); return; }
    loadDesktopWorkflows();
  }, 30000);
}

function stopDesktopPoll() {
  if (desktopWorkflowsPollTimer) { clearInterval(desktopWorkflowsPollTimer); desktopWorkflowsPollTimer = null; }
}

function triggerDesktopRelease(updateLatestMac, updateLatestWin) {
  return fetch('/api/desktop/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updateLatestMac: updateLatestMac, updateLatestWin: updateLatestWin })
  }).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || 'HTTP ' + r.status); });
    return r.json();
  });
}

function toggleDesktopVersion(version) {
  if (expandedDesktopVersions[version]) { delete expandedDesktopVersions[version]; } else { expandedDesktopVersions[version] = true; }
  renderAll();
}

function updateResourceLinks() {
  var ghLink = document.getElementById('github-link');
  if (ghLink && meta && meta.githubRepo) {
    ghLink.href = 'https://github.com/' + meta.githubRepo;
    ghLink.style.display = '';
  }
}

function getBuiltTiers(bid) {
  if (!buildsList) return [];
  var entry = null;
  for (var i = 0; i < buildsList.length; i++) {
    if (buildsList[i].buildId === bid) { entry = buildsList[i]; break; }
  }
  return entry && entry.tiers ? entry.tiers : [];
}

// ── Toast ──
function showToast(message, type) {
  type = type || 'success';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.animation = 'toast-out 0.3s ease-out forwards';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// ── Modal ──
function showModal(html) {
  var root = document.getElementById('modal-root');
  root.innerHTML = '<div class="modal-backdrop"><div class="modal">' + html + '</div></div>';
  var backdrop = root.querySelector('.modal-backdrop');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { backdrop.classList.add('visible'); });
  });
  setTimeout(function() {
    var focusable = root.querySelector('input, select, button');
    if (focusable) focusable.focus();
  }, 200);
}

function closeModal() {
  var root = document.getElementById('modal-root');
  var backdrop = root.querySelector('.modal-backdrop');
  if (!backdrop) { root.innerHTML = ''; return; }
  backdrop.classList.remove('visible');
  backdrop.classList.add('closing');
  setTimeout(function() { root.innerHTML = ''; }, 150);
  if (deployStatusTimer) { clearInterval(deployStatusTimer); deployStatusTimer = null; }
}

// ── Dark Mode ──
function initDarkMode() {
  var isDark = localStorage.getItem('admin-dark-mode') === 'true';
  if (isDark) {
    document.documentElement.classList.add('dark');
  }
  updateDarkModeIcons();
}

function toggleDarkMode() {
  var isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('admin-dark-mode', String(isDark));
  updateDarkModeIcons();
}

function updateDarkModeIcons() {
  var isDark = document.documentElement.classList.contains('dark');
  var moon = document.getElementById('dark-icon-moon');
  var sun = document.getElementById('dark-icon-sun');
  if (moon) moon.style.display = isDark ? 'none' : '';
  if (sun) sun.style.display = isDark ? '' : 'none';
}

// ── Helpers ──
function getOverrideTargets() {
  var s = {};
  (config.overrides || []).forEach(function(o) { s[o.webBuildId] = true; });
  return s;
}

function getRole(buildId) {
  if (buildId === config.default) return { label: 'Default', badge: 'badge-green', dot: true };
  if (getOverrideTargets()[buildId]) return { label: 'Pinned', badge: 'badge-amber', dot: true };
  return { label: 'Standby', badge: 'badge-gray', dot: false };
}

function semverTooltipHtml() {
  return '<span class="tooltip-wrap">' +
    '<span class="tooltip-icon">?</span>' +
    '<span class="tooltip-text">Semver range syntax: ">=1.0.0 &lt;2.0.0", "^1.2.3", "~1.2.0", "1.x". Matches desktop app version to route to a specific web build.</span>' +
  '</span>';
}

function auditKvKey(entry) {
  return entry.kvKey;
}

function extractRunId(url) {
  if (!url) return null;
  var match = url.match(/\\/actions\\/runs\\/(\\d+)/);
  return match ? match[1] : null;
}

// ── Render Version Status ──
function renderVersionStatus() {
  var webVer = websiteVersion ? websiteVersion.version : null;
  var liteManifest = desktopManifests && desktopManifests.lite;
  var entManifest = desktopManifests && desktopManifests.enterprise;
  var liteVer = liteManifest ? liteManifest.version : null;

  // Website tile
  var webTile;
  if (!webVer) {
    webTile = '<div class="version-tile">' +
      '<div class="version-tile-header"><span class="version-tile-label">Website</span></div>' +
      '<div class="version-value missing">Loading...</div></div>';
  } else {
    var webDot = 'green';
    var webBadge = liteVer && webVer === liteVer
      ? '<span class="status-badge match">&#10003; In sync</span>'
      : '<span class="status-badge match">&#10003; Live</span>';
    webTile = '<div class="version-tile">' +
      '<div class="version-tile-header"><span class="version-tile-label">Website</span><span class="status-dot ' + webDot + '"></span></div>' +
      '<div class="version-value">v' + esc(webVer) + '</div>' +
      webBadge + '</div>';
  }

  // Lite tile
  var liteTile;
  if (!liteManifest) {
    liteTile = '<div class="version-tile">' +
      '<div class="version-tile-header"><span class="version-tile-label">Auto-Updater Lite</span><span class="status-dot amber"></span></div>' +
      '<div class="version-value missing">No manifest found</div>' +
      '<span class="status-badge drift">&#9888; Missing</span></div>';
  } else {
    var liteDot = webVer && liteVer === webVer ? 'green' : 'amber';
    var liteBadge = webVer && liteVer === webVer
      ? '<span class="status-badge match">&#10003; Matches website</span>'
      : '<span class="status-badge drift">&#9888; Version drift</span>';
    liteTile = '<div class="version-tile">' +
      '<div class="version-tile-header"><span class="version-tile-label">Auto-Updater Lite</span><span class="status-dot ' + liteDot + '"></span></div>' +
      '<div class="version-value">v' + esc(String(liteVer)) + '</div>' +
      liteBadge + '</div>';
  }

  // Enterprise tile
  var entTile;
  if (!entManifest) {
    entTile = '<div class="version-tile">' +
      '<div class="version-tile-header"><span class="version-tile-label">Auto-Updater Enterprise</span><span class="status-dot amber"></span></div>' +
      '<div class="version-value missing">Not configured</div>' +
      '<span class="status-badge drift">&#9888; Missing</span></div>';
  } else {
    var entVer = entManifest.version;
    var entDot = webVer && entVer === webVer ? 'green' : 'amber';
    var entBadge = webVer && entVer === webVer
      ? '<span class="status-badge match">&#10003; Matches website</span>'
      : '<span class="status-badge drift">&#9888; Version drift</span>';
    entTile = '<div class="version-tile">' +
      '<div class="version-tile-header"><span class="version-tile-label">Auto-Updater Enterprise</span><span class="status-dot ' + entDot + '"></span></div>' +
      '<div class="version-value">v' + esc(String(entVer)) + '</div>' +
      entBadge + '</div>';
  }

  return '<div class="section">' +
    '<div class="section-header"><h2>Version Status</h2></div>' +
    '<div class="card" style="padding:24px;">' +
    '<div class="version-grid">' + webTile + liteTile + entTile + '</div></div></div>';
}

// ── Render Downloads ──
function renderDownloads() {
  if (!websiteVersion) return '';
  var downloads = websiteVersion.downloads || [];
  var seen = {};
  var unique = [];
  for (var i = 0; i < downloads.length; i++) {
    var key = downloads[i].platform + '-' + downloads[i].arch;
    if (!seen[key]) { seen[key] = true; unique.push(downloads[i]); }
  }
  if (!unique.length) return '';

  var items = '';
  for (var j = 0; j < unique.length; j++) {
    var d = unique[j];
    var icon = d.platform === 'macOS' ? '&#127822;' : '&#128187;';
    var sub = d.platform === 'macOS'
      ? (d.arch === 'ARM64' ? 'Apple Silicon' : 'Intel') + ' &middot; .dmg'
      : '64-bit &middot; .exe';
    items += '<a class="download-item" href="' + esc(d.url) + '" target="_blank" rel="noopener">' +
      '<div class="download-icon">' + icon + '</div>' +
      '<div><div class="download-label">' + esc(d.platform) + ' ' + esc(d.arch) + '</div>' +
      '<div class="download-sub">' + sub + '</div></div></a>';
  }

  return '<div class="section">' +
    '<div class="section-header"><h2>Downloads</h2>' +
    '<a href="https://accomplish.ai" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Visit Site &#8599;</a></div>' +
    '<div class="card" style="padding:24px;">' +
    '<div class="downloads-row">' + items + '</div></div></div>';
}

// ── Render Next Build ──
function renderNextBuild() {
  if (!desktopPackageVersion) return '';
  return '<div class="section">' +
    '<div class="section-header"><h2>Next Build Version</h2></div>' +
    '<div class="card" style="padding:20px 24px;">' +
    '<div class="next-build-row">' +
      '<div class="next-build-version">' + esc(desktopPackageVersion) + '</div>' +
      '<div class="next-build-detail">Next desktop release version</div>' +
      '<div style="margin-left:auto;"><button class="btn btn-primary" data-action="showDesktopReleaseModal">&#9654; Trigger Release</button></div>' +
    '</div></div></div>';
}

function renderHero() {
  var versionCount = config.activeVersions ? config.activeVersions.length : 0;
  var workerCount = versionCount * 2;
  var defaultManifest = config.default ? manifests[config.default] : null;
  var deployMeta = defaultManifest
    ? 'Deployed ' + new Date(defaultManifest.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  var heroButtons = '<button class="btn btn-hero" data-action="showChangeDefaultModal">Change Default</button>';
  if (config.previousDefault) {
    heroButtons = '<button class="btn btn-hero" data-action="showRollbackModal" style="border-color:rgba(255,200,200,0.4);">Rollback to ' + esc(config.previousDefault) + '</button> ' + heroButtons;
  }

  return '<div class="hero">' +
    '<div>' +
      '<div class="label">Current Default</div>' +
      '<div class="ver">v' + esc(config.default || 'none') + '</div>' +
      '<div class="meta">' + esc(String(versionCount)) + ' versions &bull; ' + esc(String(workerCount)) + ' workers' + (deployMeta ? ' &bull; ' + esc(deployMeta) : '') + '</div>' +
    '</div>' +
    '<div class="hero-actions">' + heroButtons + '</div>' +
  '</div>';
}

// ── Render Versions Table ──
function renderVersions() {
  var versions = config.activeVersions.slice().sort(function(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return (parseInt(pb[1]) || 0) - (parseInt(pa[1]) || 0);
  });

  var rows = '';
  versions.forEach(function(bid) {
    var role = getRole(bid);
    var isDefault = bid === config.default;
    var dotHtml = role.dot ? '<span class="badge-dot"></span>' : '';

    var tiers = getBuiltTiers(bid);
    var tierHtml = '';
    if (tiers.length) {
      tierHtml = '<span class="tier-badges">';
      tiers.forEach(function(t) {
        var cls = t === 'lite' ? 'badge-blue' : 'badge-purple';
        tierHtml += '<span class="badge tier-badge ' + cls + '">' + esc(t) + '</span>';
      });
      tierHtml += '</span>';
    }

    var actions = '';
    if (!isDefault) {
      actions += '<button class="btn btn-outline btn-sm" data-action="showPromoteModal" data-arg="' + esc(bid) + '">Promote</button> ';
      actions += '<button class="btn btn-ghost btn-sm" style="color:var(--destructive);" data-action="showSunsetModal" data-arg="' + esc(bid) + '">Sunset</button>';
    }

    var hasManifest = !!manifests[bid];
    var isExpanded = !!expandedVersions[bid];
    var expandBtn = hasManifest
      ? ' <button class="expand-btn" data-action="toggleExpand" data-arg="' + esc(bid) + '">' + (isExpanded ? '&#9660;' : '&#9654;') + '</button>'
      : '';

    rows += '<tr>' +
      '<td><strong style="font-weight:600;">' + esc(bid) + '</strong>' + tierHtml + expandBtn + '</td>' +
      '<td><span class="badge ' + role.badge + '">' + dotHtml + esc(role.label) + '</span></td>' +
      '<td style="text-align:right;white-space:nowrap;">' + actions + '</td>' +
    '</tr>';

    if (isExpanded && manifests[bid]) {
      var commits = manifests[bid].commits || [];
      var commitHtml = '';
      commits.forEach(function(c) {
        commitHtml += '<div class="commit-row">' +
          '<span class="sha">' + esc(c.sha) + '</span>' +
          '<span class="msg">' + esc(c.message) + '</span>' +
          '<span class="author">' + esc(c.author) + '</span>' +
          '<span class="date">' + esc(c.date.substring(0, 10)) + '</span>' +
        '</div>';
      });
      rows += '<tr><td colspan="3" style="padding:0;"><div class="commits-container">' + commitHtml + '</div></td></tr>';
    }
  });

  if (!versions.length) {
    rows = '<tr><td colspan="3" style="text-align:center;color:var(--muted-foreground);padding:20px;">No active versions</td></tr>';
  }

  return '<div class="section">' +
    '<div class="section-header"><h2>All Versions</h2>' +
      '<button class="btn btn-outline btn-sm" data-action="showCompareModal">Compare</button>' +
    '</div>' +
    '<div class="card"><table>' +
      '<thead><tr><th style="padding-top:16px;">Build ID</th><th style="padding-top:16px;">Role</th><th style="padding-top:16px;"></th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div></div>';
}

// ── Render Overrides ──
function renderOverrides() {
  var overrides = config.overrides || [];
  var rows = '';

  overrides.forEach(function(o, i) {
    rows += '<div class="override-row">' +
      '<div class="override-inner">' +
        '<code style="font-size:14px;font-weight:500;">' + esc(o.desktopRange) + '</code>' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
        '<span style="color:var(--primary);font-weight:600;">' + esc(o.webBuildId) + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:6px;">' +
        '<button class="btn btn-ghost btn-sm" data-action="showEditOverrideModal" data-arg="' + i + '">Edit</button>' +
        '<button class="btn btn-ghost btn-sm" style="color:var(--destructive);" data-action="showDeleteOverrideModal" data-arg="' + i + '">Delete</button>' +
      '</div></div>';
  });

  if (!overrides.length) {
    rows = '<div style="padding:20px;text-align:center;color:var(--muted-foreground);font-size:14px;">No overrides configured</div>';
  }

  return '<div class="section">' +
    '<div class="section-header"><h2>Desktop Overrides</h2>' +
      '<button class="btn btn-outline btn-sm" data-action="showAddOverrideModal">+ Add Override</button>' +
    '</div>' +
    '<div class="card" style="padding:20px 24px;">' + rows + '</div></div>';
}

// ── Render KV Config ──
function renderKV() {
  var json = JSON.stringify(config, null, 2);
  var linksHtml = '';
  if (meta) {
    linksHtml = '<div class="resource-links">';
    if (meta.accountId) {
      linksHtml += '<a class="resource-link" href="https://dash.cloudflare.com/' + esc(meta.accountId) + '/workers-and-pages" target="_blank" rel="noopener">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>' +
        'CF Workers</a>';
    }
    if (meta.accountId && meta.kvNamespaceId) {
      linksHtml += '<a class="resource-link" href="https://dash.cloudflare.com/' + esc(meta.accountId) + '/workers/kv/namespaces/' + esc(meta.kvNamespaceId) + '" target="_blank" rel="noopener">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>' +
        'KV Namespace</a>';
    }
    linksHtml += '</div>';
  }

  return '<div class="section"><div class="card">' +
    '<button class="collapsible-toggle" data-action="toggleKV">' +
      '<span class="arrow">&#9654;</span> Raw KV Config' +
    '</button>' +
    '<div class="collapsible-body"><pre>' + esc(json) + '</pre>' + linksHtml + '</div>' +
  '</div></div>';
}

// ── Modals ──
function showChangeDefaultModal() {
  var options = config.activeVersions
    .filter(function(v) { return v !== config.default; })
    .map(function(v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');

  if (!options) { showToast('No other versions available', 'error'); return; }

  showModal(
    '<h3>Change Default Version</h3>' +
    '<label>New default version</label>' +
    '<select id="modal-new-default">' + options + '</select>' +
    '<label style="margin-top:12px;">Type the selected version to confirm</label>' +
    '<input id="modal-confirm-input" type="text" data-confirm-select="modal-new-default" placeholder="Type version to confirm" autocomplete="off">' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-primary" id="modal-confirm-btn" data-action="confirmChangeDefault" disabled>Confirm</button>' +
    '</div>');
}

function confirmChangeDefault() {
  var newDefault = document.getElementById('modal-new-default').value;
  var updated = JSON.parse(JSON.stringify(config));
  updated.default = newDefault;
  saveConfig(updated).then(function() {
    closeModal();
    showToast('Default changed to ' + newDefault);
  }).catch(function(err) { showToast(err.message, 'error'); });
}

function showPromoteModal(bid) {
  showModal(
    '<h3>Promote ' + esc(bid) + ' to Default</h3>' +
    '<div class="diff">' +
      '<div><span class="old">default: "' + esc(config.default) + '"</span></div>' +
      '<div><span class="new">default: "' + esc(bid) + '"</span></div>' +
    '</div>' +
    '<label>Type <strong>' + esc(bid) + '</strong> to confirm</label>' +
    '<input id="modal-confirm-input" type="text" data-confirm-value="' + esc(bid) + '" placeholder="' + esc(bid) + '" autocomplete="off">' +
    '<div class="confirm-hint">This will change the default version for all users</div>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-primary" id="modal-confirm-btn" data-action="confirmPromote" data-arg="' + esc(bid) + '" disabled>Promote</button>' +
    '</div>');
}

function confirmPromote(bid) {
  var updated = JSON.parse(JSON.stringify(config));
  updated.default = bid;
  saveConfig(updated).then(function() {
    closeModal();
    showToast(bid + ' promoted to default');
  }).catch(function(err) { showToast(err.message, 'error'); });
}

function showSunsetModal(bid) {
  var affectedOverrides = (config.overrides || []).filter(function(o) { return o.webBuildId === bid; });
  var warnHtml = '';
  if (affectedOverrides.length) {
    var rangeList = affectedOverrides.map(function(o) { return esc(o.desktopRange); }).join(', ');
    warnHtml = '<div class="warn-banner">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
      '<span>' + affectedOverrides.length + ' override(s) will also be removed: ' + rangeList + '</span>' +
    '</div>';
  }

  showModal(
    '<h3>Remove ' + esc(bid) + '</h3>' +
    '<p style="font-size:14px;color:var(--muted-foreground);margin-bottom:16px;">Remove <strong>' + esc(bid) + '</strong> from activeVersions?</p>' +
    warnHtml +
    '<label>Type <strong>' + esc(bid) + '</strong> to confirm</label>' +
    '<input id="modal-confirm-input" type="text" data-confirm-value="' + esc(bid) + '" placeholder="' + esc(bid) + '" autocomplete="off">' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-destructive" id="modal-confirm-btn" data-action="confirmSunset" data-arg="' + esc(bid) + '" disabled>Remove</button>' +
    '</div>');
}

function confirmSunset(bid) {
  var updated = JSON.parse(JSON.stringify(config));
  updated.activeVersions = updated.activeVersions.filter(function(v) { return v !== bid; });
  updated.overrides = (updated.overrides || []).filter(function(o) { return o.webBuildId !== bid; });
  saveConfig(updated).then(function() {
    closeModal();
    showToast(bid + ' removed from active versions');
  }).catch(function(err) { showToast(err.message, 'error'); });
}

function showRollbackModal() {
  var prev = config.previousDefault;
  if (!prev) return;

  showModal(
    '<h3>Rollback to ' + esc(prev) + '</h3>' +
    '<p class="modal-desc">This will restore <strong>' + esc(prev) + '</strong> as the default version.</p>' +
    '<div class="diff">' +
      '<div><span class="old">default: "' + esc(config.default) + '"</span></div>' +
      '<div><span class="new">default: "' + esc(prev) + '"</span></div>' +
    '</div>' +
    '<label>Type <strong>' + esc(prev) + '</strong> to confirm rollback</label>' +
    '<input id="modal-confirm-input" type="text" data-confirm-value="' + esc(prev) + '" placeholder="' + esc(prev) + '" autocomplete="off">' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-destructive" id="modal-confirm-btn" data-action="confirmRollback" disabled>Rollback</button>' +
    '</div>');
}

function confirmRollback() {
  var prev = config.previousDefault;
  var updated = JSON.parse(JSON.stringify(config));
  updated.default = prev;
  saveConfig(updated).then(function() {
    closeModal();
    showToast('Rolled back to ' + prev);
  }).catch(function(err) { showToast(err.message, 'error'); });
}

function showAddOverrideModal() {
  if (!config.activeVersions.length) { showToast('No active versions available', 'error'); return; }
  var options = config.activeVersions.map(function(v) {
    return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
  }).join('');
  showModal(
    '<h3>Add Override</h3>' +
    '<label>Desktop Range ' + semverTooltipHtml() + '</label>' +
    '<input id="modal-range" type="text" placeholder="e.g. >=2.0.0 <2.1.0">' +
    '<label>Target Build</label>' +
    '<select id="modal-target">' + options + '</select>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-primary" data-action="confirmAddOverride">Add Override</button>' +
    '</div>');
}

function confirmAddOverride() {
  var range = document.getElementById('modal-range').value.trim();
  var target = document.getElementById('modal-target').value;
  if (!range) { showToast('Desktop range is required', 'error'); return; }
  if (!target) { showToast('Target build is required', 'error'); return; }
  var updated = JSON.parse(JSON.stringify(config));
  updated.overrides = updated.overrides || [];
  updated.overrides.push({ desktopRange: range, webBuildId: target });
  saveConfig(updated).then(function() {
    closeModal();
    showToast('Override added');
  }).catch(function(err) { showToast(err.message, 'error'); });
}

function showEditOverrideModal(idx) {
  var o = config.overrides[idx];
  var options = config.activeVersions.map(function(v) {
    return '<option value="' + esc(v) + '" ' + (v === o.webBuildId ? 'selected' : '') + '>' + esc(v) + '</option>';
  }).join('');
  showModal(
    '<h3>Edit Override</h3>' +
    '<label>Desktop Range ' + semverTooltipHtml() + '</label>' +
    '<input id="modal-range" type="text" value="' + esc(o.desktopRange) + '">' +
    '<label>Target Build</label>' +
    '<select id="modal-target">' + options + '</select>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-primary" data-action="confirmEditOverride" data-arg="' + idx + '">Save</button>' +
    '</div>');
}

function confirmEditOverride(idx) {
  var range = document.getElementById('modal-range').value.trim();
  var target = document.getElementById('modal-target').value;
  if (!range) { showToast('Desktop range is required', 'error'); return; }
  var updated = JSON.parse(JSON.stringify(config));
  updated.overrides[idx] = { desktopRange: range, webBuildId: target };
  saveConfig(updated).then(function() {
    closeModal();
    showToast('Override updated');
  }).catch(function(err) { showToast(err.message, 'error'); });
}

function showDeleteOverrideModal(idx) {
  var o = config.overrides[idx];
  showModal(
    '<h3>Delete Override</h3>' +
    '<p style="font-size:14px;color:var(--muted-foreground);margin-bottom:16px;">Remove override <strong>' + esc(o.desktopRange) + '</strong> &rarr; <strong>' + esc(o.webBuildId) + '</strong>?</p>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-destructive" data-action="confirmDeleteOverride" data-arg="' + idx + '">Delete</button>' +
    '</div>');
}

function confirmDeleteOverride(idx) {
  var updated = JSON.parse(JSON.stringify(config));
  updated.overrides.splice(idx, 1);
  saveConfig(updated).then(function() {
    closeModal();
    showToast('Override deleted');
  }).catch(function(err) { showToast(err.message, 'error'); });
}

function showDeployModal() {
  showModal(
    '<h3>Deploy New Build</h3>' +
    '<p class="modal-desc">This will trigger a new build and deployment via GitHub Actions.</p>' +
    '<label class="checkbox-row"><input type="checkbox" id="modal-set-default"> Set as default version after deploy</label>' +
    '<div id="deploy-result"></div>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" id="deploy-cancel-btn" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-primary" id="deploy-confirm-btn" data-action="confirmDeploy">Deploy</button>' +
    '</div>');
}

function confirmDeploy() {
  var setAsDefault = document.getElementById('modal-set-default').checked;
  var confirmBtn = document.getElementById('deploy-confirm-btn');
  var cancelBtn = document.getElementById('deploy-cancel-btn');
  var result = document.getElementById('deploy-result');
  var checkbox = document.querySelector('.checkbox-row');

  confirmBtn.classList.add('is-loading');
  cancelBtn.style.display = 'none';
  checkbox.style.opacity = '0.4';
  checkbox.style.pointerEvents = 'none';

  triggerDeploy(setAsDefault).then(function(data) {
    var runUrl = data.runUrl;
    var runLinkHtml = '';
    var actionsIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>';
    if (runUrl) {
      deployRunUrl = runUrl;
      runLinkHtml = '<a class="deploy-run-link" href="' + esc(runUrl) + '" target="_blank" rel="noopener">' + actionsIcon + 'View Workflow Run</a>';
      var runId = extractRunId(runUrl);
      if (runId) { startDeployStatusPoll(runId, result); }
    } else if (meta && meta.githubRepo) {
      runLinkHtml = '<a class="deploy-run-link" href="https://github.com/' + esc(meta.githubRepo) + '/actions/workflows/release-web.yml" target="_blank" rel="noopener">' + actionsIcon + 'View GitHub Actions</a>';
    }
    result.innerHTML = '<div class="result-banner success">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<span>Deploy triggered successfully</span>' +
    '</div>' + runLinkHtml + '<div id="deploy-status-area"></div>';
    confirmBtn.textContent = 'Done';
    confirmBtn.classList.remove('is-loading');
    confirmBtn.setAttribute('data-action', 'closeModal');
    confirmBtn.removeAttribute('disabled');
    checkbox.style.display = 'none';
  }).catch(function(err) {
    result.innerHTML = '<div class="result-banner error">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>' +
      '<span>' + esc(err.message) + '</span>' +
    '</div>';
    confirmBtn.classList.remove('is-loading');
    confirmBtn.textContent = 'Retry';
    cancelBtn.style.display = '';
    checkbox.style.opacity = '1';
    checkbox.style.pointerEvents = '';
  });
}

function startDeployStatusPoll(runId, resultContainer) {
  if (deployStatusTimer) { clearInterval(deployStatusTimer); }
  deployStatusTimer = setInterval(function() {
    fetch('/api/deploy/status?run_id=' + encodeURIComponent(runId))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) return;
        var area = document.getElementById('deploy-status-area');
        if (!area) { clearInterval(deployStatusTimer); deployStatusTimer = null; return; }
        var badgeClass = 'queued';
        var label = data.status;
        if (data.status === 'in_progress') { badgeClass = 'in_progress'; label = 'In Progress'; }
        if (data.status === 'completed') {
          badgeClass = data.conclusion === 'success' ? 'completed-success' : 'completed-failure';
          label = data.conclusion === 'success' ? 'Success' : (data.conclusion || 'Failed');
          clearInterval(deployStatusTimer);
          deployStatusTimer = null;
          if (data.conclusion === 'success') { loadConfig(); }
        }
        area.innerHTML = '<div style="margin-top:8px;"><span class="deploy-status-badge ' + badgeClass + '">' + esc(label) + '</span></div>';
      });
  }, 5000);
}

// ── Version Comparison ──
function showCompareModal() {
  if (!config.activeVersions || config.activeVersions.length < 2) {
    showToast('Need at least 2 active versions to compare', 'error');
    return;
  }
  var options = config.activeVersions.map(function(v) {
    return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
  }).join('');
  var secondOptions = config.activeVersions.slice(1).concat(config.activeVersions.slice(0, 1)).map(function(v) {
    return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
  }).join('');

  showModal(
    '<h3>Compare Versions</h3>' +
    '<p class="modal-desc">Compare commits between two versions.</p>' +
    '<div class="compare-grid">' +
      '<div><label>From</label><select id="compare-from">' + options + '</select></div>' +
      '<div class="compare-arrow">&rarr;</div>' +
      '<div><label>To</label><select id="compare-to">' + secondOptions + '</select></div>' +
    '</div>' +
    '<div id="compare-result"></div>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" data-action="closeModal">Close</button>' +
      '<button class="btn btn-primary" data-action="runCompare">Compare</button>' +
    '</div>');
}

function runCompare() {
  var fromBid = document.getElementById('compare-from').value;
  var toBid = document.getElementById('compare-to').value;
  var result = document.getElementById('compare-result');
  if (fromBid === toBid) { result.innerHTML = '<div class="loading-sm">Same version selected</div>'; return; }
  result.innerHTML = '<div class="loading-sm">Loading manifests...</div>';

  var needed = [];
  if (!manifests[fromBid]) needed.push(fetch('/api/builds/' + encodeURIComponent(fromBid) + '/manifest').then(function(r) { return r.ok ? r.json() : null; }).then(function(d) { if (d) manifests[fromBid] = d; }));
  if (!manifests[toBid]) needed.push(fetch('/api/builds/' + encodeURIComponent(toBid) + '/manifest').then(function(r) { return r.ok ? r.json() : null; }).then(function(d) { if (d) manifests[toBid] = d; }));

  Promise.all(needed).then(function() {
    var fromM = manifests[fromBid];
    var toM = manifests[toBid];
    if (!fromM || !toM) { result.innerHTML = '<div class="loading-sm">Manifest not available for one or both versions</div>'; return; }
    var fromShas = {};
    (fromM.commits || []).forEach(function(c) { fromShas[c.sha] = true; });
    var newCommits = (toM.commits || []).filter(function(c) { return !fromShas[c.sha]; });

    if (!newCommits.length) {
      result.innerHTML = '<div class="loading-sm">No new commits between these versions</div>';
      return;
    }
    var html = '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">' + newCommits.length + ' new commit(s) in ' + esc(toBid) + '</div><div class="compare-result">';
    newCommits.forEach(function(c) {
      html += '<div class="commit-row">' +
        '<span class="sha">' + esc(c.sha) + '</span>' +
        '<span class="msg">' + esc(c.message) + '</span>' +
        '<span class="date">' + esc(c.date.substring(0, 10)) + '</span>' +
      '</div>';
    });
    html += '</div>';
    result.innerHTML = html;
  });
}

// ── Tab Bar ──
function switchTab(tab) {
  currentTab = tab;
  window.location.hash = tab;
  if (tab === 'audit') {
    if (!auditEntries) { loadAuditLog(); }
    startAuditPoll();
  } else {
    stopAuditPoll();
  }
  if (tab === 'desktop') {
    if (!desktopManifests) { loadDesktopManifests(); }
    if (!desktopWorkflows) { loadDesktopWorkflows(); }
    if (!desktopVersions) { loadDesktopVersions(); }
    if (!desktopPackageVersion) { loadDesktopPackageVersion(); }
    startDesktopPoll();
  } else {
    stopDesktopPoll();
  }
  updateHeaderButtons();
  renderAll();
}

function initTabFromHash() {
  var hash = window.location.hash.replace('#', '');
  if (hash === 'audit' || hash === 'releases' || hash === 'desktop') {
    currentTab = hash;
  }
}

function updateHeaderButtons() {
  var deployBtn = document.getElementById('deploy-btn');
  var desktopReleaseBtn = document.getElementById('desktop-release-btn');
  if (deployBtn) deployBtn.style.display = currentTab === 'desktop' ? 'none' : '';
  if (desktopReleaseBtn) desktopReleaseBtn.style.display = currentTab === 'desktop' ? '' : 'none';
}

function renderTabBar() {
  return '<div class="tab-bar">' +
    '<button class="tab' + (currentTab === 'desktop' ? ' active' : '') + '" data-action="switchTab" data-arg="desktop">Desktop Releases</button>' +
    '<button class="tab' + (currentTab === 'releases' ? ' active' : '') + '" data-action="switchTab" data-arg="releases">Web Releases</button>' +
    '<button class="tab' + (currentTab === 'audit' ? ' active' : '') + '" data-action="switchTab" data-arg="audit">Audit Log</button>' +
  '</div>';
}

// ── Audit Log ──
function loadAuditLog() {
  auditLoading = true;
  renderAll();
  fetch('/api/audit?limit=50')
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data) {
      auditEntries = data.entries || [];
      auditLoading = false;
      renderAll();
    })
    .catch(function(err) {
      auditEntries = [];
      auditLoading = false;
      renderAll();
      showToast('Failed to load audit log: ' + err.message, 'error');
    });
}

function startAuditPoll() {
  stopAuditPoll();
  auditPollTimer = setInterval(function() {
    if (currentTab !== 'audit') { stopAuditPoll(); return; }
    fetch('/api/audit?limit=50')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { if (data) { auditEntries = data.entries || []; renderAll(); } });
  }, 30000);
}

function stopAuditPoll() {
  if (auditPollTimer) { clearInterval(auditPollTimer); auditPollTimer = null; }
}

function toggleAuditEntry(entryId) {
  if (expandedAuditEntries[entryId]) {
    delete expandedAuditEntries[entryId];
    renderAll();
    return;
  }
  expandedAuditEntries[entryId] = true;
  if (!auditDetailCache[entryId] && !auditDetailLoading[entryId]) {
    loadAuditDetail(entryId);
  }
  renderAll();
}

function loadAuditDetail(entryId) {
  var entry = null;
  for (var i = 0; i < auditEntries.length; i++) {
    if (auditEntries[i].id === entryId) { entry = auditEntries[i]; break; }
  }
  if (!entry) return;
  var key = auditKvKey(entry);
  if (!key) {
    auditDetailCache[entryId] = entry;
    renderAll();
    return;
  }
  auditDetailLoading[entryId] = true;
  renderAll();
  fetch('/api/audit/' + encodeURIComponent(key))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      delete auditDetailLoading[entryId];
      if (data) { auditDetailCache[entryId] = data; }
      renderAll();
    })
    .catch(function() {
      delete auditDetailLoading[entryId];
      renderAll();
    });
}

function diffConfigLines(before, after) {
  var lines = [];
  if (before.default !== after.default) {
    lines.push('<div><span class="diff-tag diff-tag-rem">removed</span>Default: ' + esc(before.default) + '</div>');
    lines.push('<div style="margin-top:4px"><span class="diff-tag diff-tag-add">added</span>Default: ' + esc(after.default) + '</div>');
  }
  var bList = before.overrides || [];
  var aList = after.overrides || [];
  bList.forEach(function(o) {
    var found = aList.some(function(a) { return a.desktopRange === o.desktopRange && a.webBuildId === o.webBuildId; });
    if (!found) {
      lines.push('<div style="margin-top:4px"><span class="diff-tag diff-tag-rem">removed</span>Override: Desktop ' + esc(o.desktopRange) + ' \\u2192 Web ' + esc(o.webBuildId) + '</div>');
    }
  });
  aList.forEach(function(o) {
    var found = bList.some(function(b) { return b.desktopRange === o.desktopRange && b.webBuildId === o.webBuildId; });
    if (!found) {
      lines.push('<div style="margin-top:4px"><span class="diff-tag diff-tag-add">added</span>Override: Desktop ' + esc(o.desktopRange) + ' \\u2192 Web ' + esc(o.webBuildId) + '</div>');
    }
  });
  var bV = (before.activeVersions || []).slice().sort();
  var aV = (after.activeVersions || []).slice().sort();
  if (JSON.stringify(bV) !== JSON.stringify(aV)) {
    bV.filter(function(v) { return aV.indexOf(v) === -1; }).forEach(function(v) {
      lines.push('<div style="margin-top:4px"><span class="diff-tag diff-tag-rem">removed</span>Active version: ' + esc(v) + '</div>');
    });
    aV.filter(function(v) { return bV.indexOf(v) === -1; }).forEach(function(v) {
      lines.push('<div style="margin-top:4px"><span class="diff-tag diff-tag-add">added</span>Active version: ' + esc(v) + '</div>');
    });
  }
  return lines.length ? lines.join('') : '<div style="color:var(--muted-foreground);">No visible differences</div>';
}

function renderAuditDetailContent(entry) {
  if (entry.action === 'config_updated' && entry.details && entry.details.before && entry.details.after) {
    return diffConfigLines(entry.details.before, entry.details.after);
  }
  if (entry.action === 'deploy_triggered' && entry.details) {
    var html = '<div><strong>Set as default:</strong> ' + esc(String(!!entry.details.setAsDefault)) + '</div>';
    if (entry.details.runUrl) {
      html += '<div style="margin-top:4px"><strong>Run:</strong> <a href="' + esc(entry.details.runUrl) + '" target="_blank" rel="noopener" style="color:var(--primary);">' + esc(entry.details.runUrl) + '</a></div>';
    }
    return html;
  }
  if (entry.action === 'release_completed' && entry.details && entry.details.buildId) {
    return '<div><strong>Build ID:</strong> ' + esc(entry.details.buildId) + '</div>';
  }
  if (entry.details && Object.keys(entry.details).length) {
    return '<pre style="margin:0;font-size:12px;white-space:pre-wrap;">' + esc(JSON.stringify(entry.details, null, 2)) + '</pre>';
  }
  return '';
}

function getActionDotClass(action) {
  if (action === 'config_updated') return 'config';
  if (action === 'deploy_triggered') return 'deploy';
  if (action === 'release_completed') return 'release';
  if (action === 'desktop_release_triggered') return 'deploy';
  return 'config';
}

function renderAuditLog() {
  if (auditLoading) {
    return '<div class="card"><div class="loading">Loading audit log...</div></div>';
  }
  if (!auditEntries || !auditEntries.length) {
    return '<div class="card"><div class="loading">No audit entries yet</div></div>';
  }

  var sorted = auditEntries.slice().sort(function(a, b) {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  var rows = '';
  sorted.forEach(function(entry) {
    var entryId = entry.id;
    var isExpanded = !!expandedAuditEntries[entryId];
    var time = new Date(entry.timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
    var actionLabel = esc(entry.action.replace(/_/g, ' '));
    actionLabel = actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1);
    var dotClass = getActionDotClass(entry.action);
    var sourceLabel = entry.source ? esc(entry.source) : '';
    var userLabel = entry.user ? esc(entry.user.replace(/@.*$/, '')) : (entry.source === 'ci' ? 'CI' : '\\u2014');

    rows += '<tr class="audit-row' + (isExpanded ? ' audit-expanded' : '') + '" data-action="toggleAuditEntry" data-arg="' + esc(entryId) + '">' +
      '<td class="audit-time">' + esc(time) + '</td>' +
      '<td><span class="audit-action-dot ' + dotClass + '"></span><span class="audit-action-text">' + actionLabel + '</span></td>' +
      '<td class="audit-source">' + sourceLabel + '</td>' +
      '<td class="audit-user">' + userLabel + '</td>' +
      '<td style="text-align:right;"><span class="audit-chevron">\\u25B8</span></td>' +
    '</tr>';

    if (isExpanded) {
      if (auditDetailLoading[entryId]) {
        rows += '<tr class="audit-detail-row"><td colspan="5"><div class="audit-detail-content"><div class="loading-sm">Loading details...</div></div></td></tr>';
      } else if (auditDetailCache[entryId]) {
        var detailHtml = renderAuditDetailContent(auditDetailCache[entryId]);
        if (detailHtml) {
          rows += '<tr class="audit-detail-row"><td colspan="5"><div class="audit-detail-content">' + detailHtml + '</div></td></tr>';
        } else {
          rows += '<tr class="audit-detail-row"><td colspan="5"><div class="audit-detail-content" style="color:var(--muted-foreground);">No additional details</div></td></tr>';
        }
      } else {
        rows += '<tr class="audit-detail-row"><td colspan="5"><div class="audit-detail-content" style="color:var(--muted-foreground);">Failed to load details</div></td></tr>';
      }
    }
  });

  return '<div class="section">' +
    '<div class="section-header"><h2>Audit Log</h2></div>' +
    '<div class="card"><table class="audit-table"><thead><tr>' +
      '<th style="width:160px;">Time</th>' +
      '<th>Event</th>' +
      '<th style="width:90px;">Source</th>' +
      '<th style="width:140px;">User</th>' +
      '<th style="width:32px;"></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

// ── Render Desktop ──

function formatDuration(startIso, endIso) {
  var start = new Date(startIso).getTime();
  var end = new Date(endIso).getTime();
  var diffMs = end - start;
  if (diffMs < 0) return '—';
  var mins = Math.floor(diffMs / 60000);
  var secs = Math.floor((diffMs % 60000) / 1000);
  if (mins > 0) return mins + 'm ' + secs + 's';
  return secs + 's';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function renderDesktopWorkflows() {
  if (!desktopWorkflows) {
    return '<div class="section"><div class="section-header"><h2>Recent Release Workflows</h2></div>' +
      '<div class="card" style="padding:20px 24px;"><div class="loading-sm">Loading workflows...</div></div></div>';
  }
  if (!desktopWorkflows.length) {
    return '<div class="section"><div class="section-header"><h2>Recent Release Workflows</h2></div>' +
      '<div class="card" style="padding:20px 24px;"><div class="loading">No workflow runs found</div></div></div>';
  }

  var rows = '';
  desktopWorkflows.forEach(function(run) {
    var badgeClass = 'badge-gray';
    var label = esc(run.status);
    if (run.status === 'completed') {
      if (run.conclusion === 'success') { badgeClass = 'badge-green'; label = 'Success'; }
      else if (run.conclusion === 'failure') { badgeClass = 'badge-red'; label = 'Failure'; }
      else if (run.conclusion === 'cancelled') { badgeClass = 'badge-gray'; label = 'Cancelled'; }
      else { badgeClass = 'badge-gray'; label = esc(run.conclusion || 'Unknown'); }
    } else if (run.status === 'in_progress') {
      badgeClass = 'badge-yellow'; label = 'In Progress';
    } else if (run.status === 'queued') {
      badgeClass = 'badge-gray'; label = 'Queued';
    }

    var started = new Date(run.run_started_at || run.created_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    var duration = run.status === 'completed' ? formatDuration(run.run_started_at || run.created_at, run.updated_at) : '—';

    rows += '<tr>' +
      '<td><span class="badge ' + badgeClass + '">' + label + '</span></td>' +
      '<td>' + esc(run.actor) + '</td>' +
      '<td class="audit-time">' + esc(started) + '</td>' +
      '<td class="audit-time">' + esc(duration) + '</td>' +
      '<td style="text-align:right;"><a class="btn btn-ghost btn-sm" href="' + esc(run.html_url) + '" target="_blank" rel="noopener">View</a></td>' +
    '</tr>';
  });

  return '<div class="section"><div class="section-header"><h2>Recent Release Workflows</h2></div>' +
    '<div class="card"><table><thead><tr>' +
      '<th style="padding-top:16px;">Status</th>' +
      '<th style="padding-top:16px;">Actor</th>' +
      '<th style="padding-top:16px;">Started</th>' +
      '<th style="padding-top:16px;">Duration</th>' +
      '<th style="padding-top:16px;"></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

function renderDesktopVersions() {
  if (!desktopVersions) {
    return '<div class="section"><div class="section-header"><h2>R2 Artifacts</h2></div>' +
      '<div class="card" style="padding:20px 24px;"><div class="loading-sm">Loading versions...</div></div></div>';
  }
  if (!desktopVersions.length) {
    return '<div class="section"><div class="section-header"><h2>R2 Artifacts</h2></div>' +
      '<div class="card" style="padding:20px 24px;"><div class="loading">No artifacts found in R2</div></div></div>';
  }

  var rows = '';
  desktopVersions.forEach(function(v) {
    var isExpanded = !!expandedDesktopVersions[v.version];
    var archSet = {};
    var tierSet = {};
    v.files.forEach(function(f) {
      if (f.name.indexOf('arm64') !== -1) archSet['arm64'] = true;
      if (f.name.indexOf('x64') !== -1) archSet['x64'] = true;
      if (f.name.indexOf('Enterprise') !== -1) tierSet['enterprise'] = true;
      else tierSet['lite'] = true;
    });

    var archBadges = '';
    Object.keys(archSet).forEach(function(a) {
      archBadges += '<span class="badge badge-gray" style="margin-left:4px;">' + esc(a) + '</span>';
    });
    var tierBadges = '';
    Object.keys(tierSet).forEach(function(t) {
      var cls = t === 'lite' ? 'badge-blue' : 'badge-purple';
      tierBadges += '<span class="badge tier-badge ' + cls + '" style="margin-left:4px;">' + esc(t) + '</span>';
    });

    var expandIcon = isExpanded ? '&#9660;' : '&#9654;';

    var r2Btn = '';
    if (meta && meta.accountId) {
      r2Btn = '<a href="https://dash.cloudflare.com/' + esc(meta.accountId) + '/r2/default/buckets/openwork?prefix=downloads/' + encodeURIComponent(v.version) + '/" target="_blank" rel="noopener" class="btn btn-outline btn-sm" onclick="event.stopPropagation();">View in R2</a> ';
    }

    rows += '<tr class="desktop-version-row" data-action="toggleDesktopVersion" data-arg="' + esc(v.version) + '">' +
      '<td><strong style="font-weight:600;">' + esc(v.version) + '</strong>' + tierBadges + archBadges + '</td>' +
      '<td>' + esc(String(v.files.length)) + ' file(s)</td>' +
      '<td style="text-align:right;">' + r2Btn + '<span class="expand-btn">' + expandIcon + '</span></td>' +
    '</tr>';

    if (isExpanded) {
      var fileRows = '';
      v.files.forEach(function(f) {
        fileRows += '<div class="desktop-file-row">' +
          '<span>' + esc(f.name) + '</span>' +
          '<span style="color:var(--muted-foreground);">' + esc(formatFileSize(f.size)) + '</span>' +
        '</div>';
      });
      rows += '<tr><td colspan="3" style="padding:0;"><div class="desktop-files">' + fileRows + '</div></td></tr>';
    }
  });

  var r2BucketLink = '';
  if (meta && meta.accountId) {
    r2BucketLink = ' <a href="https://dash.cloudflare.com/' + esc(meta.accountId) + '/r2/default/buckets/openwork" target="_blank" rel="noopener" style="font-size:13px;font-weight:400;color:var(--muted-foreground);text-decoration:none;margin-left:8px;">Open R2 &#8599;</a>';
  }

  return '<div class="section"><div class="section-header"><h2>R2 Artifacts' + r2BucketLink + '</h2></div>' +
    '<div class="card"><table><thead><tr>' +
      '<th style="padding-top:16px;">Version</th>' +
      '<th style="padding-top:16px;">Files</th>' +
      '<th style="padding-top:16px;"></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

// ── Desktop Release Modal ──
function showDesktopReleaseModal() {
  showModal(
    '<h3>Release Desktop App</h3>' +
    '<p class="modal-desc">This will trigger a new desktop build and release via GitHub Actions.</p>' +
    (desktopPackageVersion ? '<div style="margin-bottom:16px;font-size:13px;color:var(--muted-foreground);">Version: <strong style="color:var(--foreground);">' + esc(desktopPackageVersion) + '</strong></div>' : '') +
    '<label class="checkbox-row"><input type="checkbox" id="modal-update-latest-mac" checked> Update latest-mac manifest (enables auto-updates)</label>' +
    '<label class="checkbox-row"><input type="checkbox" id="modal-update-latest-win" checked> Update latest-win manifest (enables auto-updates)</label>' +
    '<div id="desktop-release-result"></div>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" id="desktop-release-cancel-btn" data-action="closeModal">Cancel</button>' +
      '<button class="btn btn-primary" id="desktop-release-confirm-btn" data-action="confirmDesktopRelease">Release</button>' +
    '</div>');
}

function confirmDesktopRelease() {
  var updateLatestMac = document.getElementById('modal-update-latest-mac').checked;
  var updateLatestWin = document.getElementById('modal-update-latest-win').checked;
  var confirmBtn = document.getElementById('desktop-release-confirm-btn');
  var cancelBtn = document.getElementById('desktop-release-cancel-btn');
  var result = document.getElementById('desktop-release-result');
  var checkbox = document.querySelector('.checkbox-row');

  confirmBtn.classList.add('is-loading');
  cancelBtn.style.display = 'none';
  checkbox.style.opacity = '0.4';
  checkbox.style.pointerEvents = 'none';

  triggerDesktopRelease(updateLatestMac, updateLatestWin).then(function(data) {
    var runUrl = data.runUrl;
    var runLinkHtml = '';
    var actionsIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>';
    if (runUrl) {
      runLinkHtml = '<a class="deploy-run-link" href="' + esc(runUrl) + '" target="_blank" rel="noopener">' + actionsIcon + 'View Workflow Run</a>';
    } else if (meta && meta.githubRepo) {
      runLinkHtml = '<a class="deploy-run-link" href="https://github.com/' + esc(meta.githubRepo) + '/actions/workflows/release.yml" target="_blank" rel="noopener">' + actionsIcon + 'View GitHub Actions</a>';
    }
    result.innerHTML = '<div class="result-banner success">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<span>Desktop release triggered successfully</span>' +
    '</div>' + runLinkHtml;
    confirmBtn.textContent = 'Done';
    confirmBtn.classList.remove('is-loading');
    confirmBtn.setAttribute('data-action', 'closeModal');
    confirmBtn.removeAttribute('disabled');
    checkbox.style.display = 'none';
    loadDesktopWorkflows();
  }).catch(function(err) {
    result.innerHTML = '<div class="result-banner error">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>' +
      '<span>' + esc(err.message) + '</span>' +
    '</div>';
    confirmBtn.classList.remove('is-loading');
    confirmBtn.textContent = 'Retry';
    cancelBtn.style.display = '';
    checkbox.style.opacity = '1';
    checkbox.style.pointerEvents = '';
  });
}

// ── Render All ──
function renderAll() {
  if (!config) return;
  var content = renderTabBar();
  if (currentTab === 'releases') {
    content += renderHero() + renderVersions() + renderOverrides() + renderKV();
  } else if (currentTab === 'desktop') {
    content += renderVersionStatus() + renderDownloads() + renderNextBuild() + renderDesktopWorkflows() + renderDesktopVersions();
  } else if (currentTab === 'audit') {
    content += renderAuditLog();
  }
  document.getElementById('app-root').innerHTML = content;
}

// ── Event Delegation: #app-root ──
document.getElementById('app-root').addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.getAttribute('data-action');
  var arg = el.getAttribute('data-arg');

  switch (action) {
    case 'switchTab': switchTab(arg); break;
    case 'showChangeDefaultModal': showChangeDefaultModal(); break;
    case 'showPromoteModal': showPromoteModal(arg); break;
    case 'showSunsetModal': showSunsetModal(arg); break;
    case 'showRollbackModal': showRollbackModal(); break;
    case 'toggleExpand': toggleExpand(arg); break;
    case 'showEditOverrideModal': showEditOverrideModal(parseInt(arg)); break;
    case 'showDeleteOverrideModal': showDeleteOverrideModal(parseInt(arg)); break;
    case 'showAddOverrideModal': showAddOverrideModal(); break;
    case 'showCompareModal': showCompareModal(); break;
    case 'toggleKV':
      el.classList.toggle('open');
      el.nextElementSibling.classList.toggle('open');
      break;
    case 'toggleAuditEntry': toggleAuditEntry(arg); break;
    case 'toggleDesktopVersion': toggleDesktopVersion(arg); break;
    case 'showDesktopReleaseModal': showDesktopReleaseModal(); break;
  }
});

// ── Event Delegation: #modal-root ──
document.getElementById('modal-root').addEventListener('click', function(e) {
  var backdrop = e.target.closest('.modal-backdrop');
  if (backdrop && e.target === backdrop) { closeModal(); return; }

  var el = e.target.closest('[data-action]');
  if (!el) return;
  var action = el.getAttribute('data-action');
  var arg = el.getAttribute('data-arg');

  switch (action) {
    case 'closeModal': closeModal(); break;
    case 'confirmChangeDefault': confirmChangeDefault(); break;
    case 'confirmPromote': confirmPromote(arg); break;
    case 'confirmSunset': confirmSunset(arg); break;
    case 'confirmRollback': confirmRollback(); break;
    case 'confirmAddOverride': confirmAddOverride(); break;
    case 'confirmEditOverride': confirmEditOverride(parseInt(arg)); break;
    case 'confirmDeleteOverride': confirmDeleteOverride(parseInt(arg)); break;
    case 'confirmDeploy': confirmDeploy(); break;
    case 'confirmDesktopRelease': confirmDesktopRelease(); break;
    case 'runCompare': runCompare(); break;
  }
});

// ── Event Delegation: type-to-confirm inputs ──
document.getElementById('modal-root').addEventListener('input', function(e) {
  var input = e.target;
  var expected = null;
  if (input.hasAttribute('data-confirm-value')) {
    expected = input.getAttribute('data-confirm-value');
  } else if (input.hasAttribute('data-confirm-select')) {
    var sel = document.getElementById(input.getAttribute('data-confirm-select'));
    expected = sel ? sel.value : null;
  }
  if (expected === null) return;
  var confirmBtn = document.getElementById('modal-confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = input.value !== expected;
  }
});

// ── Keyboard Navigation ──
document.addEventListener('keydown', function(e) {
  var modalRoot = document.getElementById('modal-root');
  var backdrop = modalRoot ? modalRoot.querySelector('.modal-backdrop:not(.closing)') : null;
  if (!backdrop) return;

  if (e.key === 'Escape') {
    closeModal();
    e.preventDefault();
    return;
  }

  if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
    var primaryBtn = backdrop.querySelector('.btn-primary:not(:disabled), .btn-destructive:not(:disabled)');
    if (primaryBtn) {
      primaryBtn.click();
      e.preventDefault();
    }
    return;
  }

  if (e.key === 'Tab') {
    var focusable = backdrop.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { last.focus(); e.preventDefault(); }
    } else {
      if (document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  }
});

// ── Static button listeners ──
document.getElementById('deploy-btn').addEventListener('click', showDeployModal);
document.getElementById('desktop-release-btn').addEventListener('click', showDesktopReleaseModal);
document.getElementById('dark-toggle').addEventListener('click', toggleDarkMode);

// ── Hash change listener ──
window.addEventListener('hashchange', function() {
  var hash = window.location.hash.replace('#', '');
  if ((hash === 'audit' || hash === 'releases' || hash === 'desktop') && hash !== currentTab) {
    switchTab(hash);
  }
});

// ── Init ──
initDarkMode();
initTabFromHash();
loadConfig();
loadWebsiteVersion();
checkHealth();
loadBuilds();
if (currentTab === 'audit') { loadAuditLog(); startAuditPoll(); }
if (currentTab === 'desktop') { loadDesktopManifests(); loadDesktopWorkflows(); loadDesktopVersions(); loadDesktopPackageVersion(); startDesktopPoll(); }
updateHeaderButtons();
</script>
</body>
</html>`;
}
