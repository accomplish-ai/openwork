export function getDashboardHtml(): string {
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
    .header-actions { display: flex; gap: 10px; }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 0 16px; height: 36px; border-radius: 6px; border: none; cursor: pointer;
      font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
      transition: all 0.15s; white-space: nowrap;
    }
    .btn-primary { background: var(--primary); color: var(--primary-foreground); }
    .btn-primary:hover { background: #2a4d28; }
    .btn-outline { background: var(--card); color: var(--foreground); border: 1px solid var(--border); }
    .btn-outline:hover { background: var(--accent); }
    .btn-destructive { background: var(--destructive); color: #fff; }
    .btn-destructive:hover { opacity: 0.9; }
    .btn-ghost { background: transparent; color: var(--muted-foreground); }
    .btn-ghost:hover { background: var(--accent); color: var(--foreground); }
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
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; }
    .badge-green .badge-dot { background: #22c55e; }
    .badge-amber .badge-dot { background: #f59e0b; }

    /* Hero Banner */
    .hero {
      background: linear-gradient(135deg, #213c20 0%, #2d5429 100%);
      border-radius: 20px; padding: 28px 32px; color: #fff; margin-bottom: 32px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .hero .ver { font-size: 36px; font-weight: 900; letter-spacing: -0.02em; }
    .hero .label { font-size: 13px; opacity: 0.7; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .hero .meta { font-size: 13px; opacity: 0.8; margin-top: 6px; }
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

    /* Audit Log — Editorial Table */
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
    .audit-chevron { color: #ccc; font-size: 12px; transition: transform 0.2s, color 0.2s; display: inline-block; }
    tr.audit-expanded .audit-chevron { transform: rotate(90deg); color: #666; }
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

    /* Loading */
    .loading { text-align: center; padding: 60px 0; color: var(--muted-foreground); font-size: 14px; }
  </style>
</head>
<body>

<div id="toast-container"></div>
<div id="modal-root"></div>

<div class="wrap">
  <div class="header">
    <div>
      <h1>Accomplish Releases</h1>
      <p>Manage deployed versions, overrides, and routing configuration</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-primary" onclick="showDeployModal()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        Deploy New Build
      </button>
    </div>
  </div>

  <div id="app-root"><div class="loading">Loading configuration...</div></div>
</div>

<script>
// ── Escaping ──
function esc(str) {
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── API ──
var config = null;
var manifests = {};
var expandedVersions = {};
var currentTab = 'releases';
var auditEntries = null;
var auditLoading = false;
var expandedAuditEntries = {};
var auditPollTimer = null;

function loadManifests() {
  var versions = config ? config.activeVersions : [];
  versions.forEach(function(bid) {
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
  root.innerHTML = '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>';
  var backdrop = root.querySelector('.modal-backdrop');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { backdrop.classList.add('visible'); });
  });
}

function closeModal() {
  var root = document.getElementById('modal-root');
  var backdrop = root.querySelector('.modal-backdrop');
  if (!backdrop) { root.innerHTML = ''; return; }
  backdrop.classList.remove('visible');
  backdrop.classList.add('closing');
  setTimeout(function() { root.innerHTML = ''; }, 150);
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

// ── Render Hero ──
function renderHero() {
  var versionCount = config.activeVersions ? config.activeVersions.length : 0;
  var workerCount = versionCount * 2;
  var defaultManifest = config.default ? manifests[config.default] : null;
  var deployMeta = defaultManifest
    ? 'Deployed ' + new Date(defaultManifest.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  return '<div class="hero">' +
    '<div>' +
      '<div class="label">Current Default</div>' +
      '<div class="ver">v' + esc(config.default || 'none') + '</div>' +
      '<div class="meta">' + esc(String(versionCount)) + ' versions &bull; ' + esc(String(workerCount)) + ' workers' + (deployMeta ? ' &bull; ' + esc(deployMeta) : '') + '</div>' +
    '</div>' +
    '<button class="btn btn-hero" onclick="showChangeDefaultModal()">Change Default</button>' +
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

    var actions = '';
    if (!isDefault) {
      actions += '<button class="btn btn-outline btn-sm" onclick="showPromoteModal(\\'' + esc(bid) + '\\')">Promote</button> ';
      actions += '<button class="btn btn-ghost btn-sm" style="color:var(--destructive);" onclick="showSunsetModal(\\'' + esc(bid) + '\\')">Sunset</button>';
    }

    var hasManifest = !!manifests[bid];
    var isExpanded = !!expandedVersions[bid];
    var expandBtn = hasManifest
      ? ' <button class="expand-btn" onclick="toggleExpand(\\'' + esc(bid) + '\\')">' + (isExpanded ? '&#9660;' : '&#9654;') + '</button>'
      : '';

    rows += '<tr>' +
      '<td><strong style="font-weight:600;">' + esc(bid) + '</strong>' + expandBtn + '</td>' +
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
    '<div class="section-header"><h2>All Versions</h2></div>' +
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
        '<button class="btn btn-ghost btn-sm" onclick="showEditOverrideModal(' + i + ')">Edit</button>' +
        '<button class="btn btn-ghost btn-sm" style="color:var(--destructive);" onclick="showDeleteOverrideModal(' + i + ')">Delete</button>' +
      '</div></div>';
  });

  if (!overrides.length) {
    rows = '<div style="padding:20px;text-align:center;color:var(--muted-foreground);font-size:14px;">No overrides configured</div>';
  }

  return '<div class="section">' +
    '<div class="section-header"><h2>Desktop Overrides</h2>' +
      '<button class="btn btn-outline btn-sm" onclick="showAddOverrideModal()">+ Add Override</button>' +
    '</div>' +
    '<div class="card" style="padding:20px 24px;">' + rows + '</div></div>';
}

// ── Render KV Config ──
function renderKV() {
  var json = JSON.stringify(config, null, 2);
  return '<div class="section"><div class="card">' +
    '<button class="collapsible-toggle" onclick="toggleKV(this)">' +
      '<span class="arrow">&#9654;</span> Raw KV Config' +
    '</button>' +
    '<div class="collapsible-body"><pre>' + esc(json) + '</pre></div>' +
  '</div></div>';
}

function toggleKV(btn) {
  btn.classList.toggle('open');
  btn.nextElementSibling.classList.toggle('open');
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
    '<div class="actions">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="confirmChangeDefault()">Confirm</button>' +
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
    '<div class="actions">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="confirmPromote(\\'' + esc(bid) + '\\')">Promote</button>' +
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
  showModal(
    '<h3>Remove ' + esc(bid) + '</h3>' +
    '<p style="font-size:14px;color:var(--muted-foreground);margin-bottom:16px;">Remove <strong>' + esc(bid) + '</strong> from activeVersions?</p>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-destructive" onclick="confirmSunset(\\'' + esc(bid) + '\\')">Remove</button>' +
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

function showAddOverrideModal() {
  if (!config.activeVersions.length) { showToast('No active versions available', 'error'); return; }
  var options = config.activeVersions.map(function(v) {
    return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
  }).join('');
  showModal(
    '<h3>Add Override</h3>' +
    '<label>Desktop Range</label>' +
    '<input id="modal-range" type="text" placeholder="e.g. >=2.0.0 <2.1.0">' +
    '<label>Target Build</label>' +
    '<select id="modal-target">' + options + '</select>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="confirmAddOverride()">Add Override</button>' +
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
    '<label>Desktop Range</label>' +
    '<input id="modal-range" type="text" value="' + esc(o.desktopRange) + '">' +
    '<label>Target Build</label>' +
    '<select id="modal-target">' + options + '</select>' +
    '<div class="actions">' +
      '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" onclick="confirmEditOverride(' + idx + ')">Save</button>' +
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
      '<button class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-destructive" onclick="confirmDeleteOverride(' + idx + ')">Delete</button>' +
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
      '<button class="btn btn-outline" id="deploy-cancel-btn" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" id="deploy-confirm-btn" onclick="confirmDeploy()">Deploy</button>' +
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

  triggerDeploy(setAsDefault).then(function() {
    result.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#dcfce7;border-radius:8px;margin-bottom:16px;border:1px solid #bbf7d0;">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<span style="font-size:13px;color:#166534;font-weight:500;">Deploy triggered — check GitHub Actions for progress</span>' +
    '</div>';
    confirmBtn.textContent = 'Done';
    confirmBtn.classList.remove('is-loading');
    confirmBtn.onclick = closeModal;
    checkbox.style.display = 'none';
  }).catch(function(err) {
    result.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#fee2e2;border-radius:8px;margin-bottom:16px;border:1px solid #fecaca;">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>' +
      '<span style="font-size:13px;color:#dc2626;font-weight:500;">' + esc(err.message) + '</span>' +
    '</div>';
    confirmBtn.classList.remove('is-loading');
    confirmBtn.textContent = 'Retry';
    cancelBtn.style.display = '';
    checkbox.style.opacity = '1';
    checkbox.style.pointerEvents = '';
  });
}

// ── Tab Bar ──
function switchTab(tab) {
  currentTab = tab;
  if (tab === 'audit') {
    if (!auditEntries) { loadAuditLog(); }
    startAuditPoll();
  } else {
    stopAuditPoll();
  }
  renderAll();
}

function renderTabBar() {
  return '<div class="tab-bar">' +
    '<button class="tab' + (currentTab === 'releases' ? ' active' : '') + '" onclick="switchTab(\\'releases\\')">Releases</button>' +
    '<button class="tab' + (currentTab === 'audit' ? ' active' : '') + '" onclick="switchTab(\\'audit\\')">Audit Log</button>' +
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

function toggleAuditEntry(id) {
  if (expandedAuditEntries[id]) { delete expandedAuditEntries[id]; } else { expandedAuditEntries[id] = true; }
  renderAll();
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
    return '<div><strong>Set as default:</strong> ' + esc(String(!!entry.details.setAsDefault)) + '</div>';
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
  return 'config';
}

function renderAuditLog() {
  if (auditLoading) {
    return '<div class="card"><div class="loading">Loading audit log...</div></div>';
  }
  if (!auditEntries || !auditEntries.length) {
    return '<div class="card"><div class="loading">No audit entries yet</div></div>';
  }

  var rows = '';
  auditEntries.forEach(function(entry) {
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
    var detailHtml = renderAuditDetailContent(entry);
    var hasDetail = !!detailHtml;

    rows += '<tr class="audit-row' + (isExpanded ? ' audit-expanded' : '') + '" onclick="toggleAuditEntry(\\'' + esc(entryId) + '\\')">' +
      '<td class="audit-time">' + esc(time) + '</td>' +
      '<td><span class="audit-action-dot ' + dotClass + '"></span><span class="audit-action-text">' + actionLabel + '</span></td>' +
      '<td class="audit-source">' + sourceLabel + '</td>' +
      '<td class="audit-user">' + userLabel + '</td>' +
      '<td style="text-align:right;">' + (hasDetail ? '<span class="audit-chevron">\\u25B8</span>' : '') + '</td>' +
    '</tr>';

    if (hasDetail) {
      rows += '<tr class="audit-detail-row" style="display:' + (isExpanded ? 'table-row' : 'none') + ';">' +
        '<td colspan="5"><div class="audit-detail-content">' + detailHtml + '</div></td>' +
      '</tr>';
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

// ── Render All ──
function renderAll() {
  if (!config) return;
  var content = renderTabBar();
  if (currentTab === 'releases') {
    content += renderHero() + renderVersions() + renderOverrides() + renderKV();
  } else if (currentTab === 'audit') {
    content += renderAuditLog();
  }
  document.getElementById('app-root').innerHTML = content;
}

// ── Init ──
loadConfig();
</script>
</body>
</html>`;
}
