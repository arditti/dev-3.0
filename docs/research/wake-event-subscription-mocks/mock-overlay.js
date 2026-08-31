(function () {
  var old = document.getElementById('wake-mock-overlay');
  if (old) old.remove();

  var C = {
    accent: '#4496ff', agent: '#a78bfa', warn: '#f0b232',
    danger: '#ef4444', ok: '#3fb950', info: '#38bdf8',
  };
  var chip = function (t, c) {
    return '<span style="display:inline-flex;align-items:center;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:600;color:' +
      c + ';border:1px solid ' + c + '66;background:' + c + '22;white-space:nowrap">' + t + '</span>';
  };
  var scopeTag = function (t, c) {
    return '<span style="border-radius:4px;padding:0 5px;font-size:10px;font-weight:600;color:' + c +
      ';border:1px solid ' + c + '80;white-space:nowrap">' + t + '</span>';
  };
  var gbtn = function (t, c) {
    return '<button style="border-radius:6px;padding:3px 7px;font-size:11px;background:transparent;border:1px solid ' +
      (c ? c + '4d' : 'var(--edge,#2a3040)') + ';color:' + (c || 'var(--fg-2,#9aa4b8)') + '">' + t + '</button>';
  };

  // rows: [chipHtml, meta, times, acts]
  var rows = [
    [chip('pr-activity', C.accent),
     'PR <b style="color:var(--fg,#e6ebf5)">#1620</b> · reviews, ci, comments · <b style="color:var(--fg,#e6ebf5)">immediate</b>, bypass <code>ci == "failed"</code>',
     scopeTag('task #23', '#6b7689'), 'last fired 12 min ago<br>by agent · 24 total'],
    [chip('cron', C.agent),
     '<code>0 9 * * 1-5</code> → <b style="color:var(--fg,#e6ebf5)">digest</b> of pr-activity',
     scopeTag('task #23', '#6b7689'), 'next Tue 09:00<br>by agent'],
    [chip('issue-opened', C.accent),
     '<code>label != "wontfix"</code> → <b style="color:var(--fg,#e6ebf5)">launch task</b> "Triage: {title}"',
     scopeTag('project', C.info), 'last fired 2 d ago<br>by user · 14 total'],
    [chip('deploy-finished', C.warn),
     '<code>status == "failed"</code> → <b style="color:var(--fg,#e6ebf5)">notify</b> + attention',
     scopeTag('project', C.info), 'never fired<br>from .dev3/config.json'],
    [chip('task-lifecycle', C.accent),
     '<code>toColumn == "review-by-ai"</code> → deliver to coordinator #9',
     scopeTag('space: work', C.info), 'last fired 3 h ago<br>by user · 41 total'],
    [chip('cron', C.agent),
     'nightly 02:00 → <b style="color:var(--fg,#e6ebf5)">launch task</b> "Repo hygiene sweep"',
     scopeTag('global', C.ok), 'next tonight 02:00<br>by user'],
  ];

  var rowHtml = rows.map(function (r) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--edge,#232936);border-radius:10px;background:var(--raised,#141926);margin-bottom:6px">' +
      '<div style="width:104px;flex:none">' + r[0] + '</div>' +
      '<div style="flex:1;min-width:0;font-size:12.5px;color:var(--fg-2,#9aa4b8)">' + r[1] + '</div>' +
      '<div style="width:96px;flex:none">' + r[2] + '</div>' +
      '<div style="width:132px;flex:none;font-size:11px;line-height:1.3;color:var(--fg-muted,#6b7689)">' + r[3] + '</div>' +
      '<div style="display:flex;gap:4px;flex:none">' + gbtn('⏸') + gbtn('✕', C.danger) + '</div>' +
      '</div>';
  }).join('');

  var tab = function (t, on) {
    return '<button style="border-radius:8px;padding:4px 11px;font-size:12px;font-weight:' + (on ? '600' : '400') +
      ';border:1px solid ' + (on ? C.accent + '80' : 'var(--edge,#232936)') +
      ';background:' + (on ? C.accent + '2e' : 'transparent') +
      ';color:' + (on ? 'var(--fg,#e6ebf5)' : 'var(--fg-2,#9aa4b8)') + '">' + t + '</button>';
  };

  var wrap = document.createElement('div');
  wrap.id = 'wake-mock-overlay';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(4,6,12,.66);backdrop-filter:blur(2px)';
  wrap.innerHTML =
    '<div role="dialog" aria-label="Events and schedules" style="width:min(1080px,calc(100vw - 2rem));max-height:calc(100vh - 4rem);display:flex;flex-direction:column;border:1px solid var(--edge,#2a3040);border-radius:14px;background:var(--base,#0b0f1a);box-shadow:0 24px 64px rgba(0,0,0,.6);overflow:hidden">' +

      // header
      '<div style="display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--edge,#232936);background:var(--elevated,#161c2b)">' +
        '<span style="font-size:14px;font-weight:600;color:var(--fg,#e6ebf5)">Events &amp; Schedules</span>' +
        '<span style="font-size:11px;color:var(--fg-muted,#6b7689)">what wakes your agents</span>' +
        '<span style="margin-left:auto;display:flex;gap:6px;align-items:center">' +
          '<button style="border-radius:8px;padding:4px 11px;font-size:12px;font-weight:600;border:none;background:' + C.accent + ';color:#fff">Subscribe…</button>' +
          gbtn('✕') +
        '</span>' +
      '</div>' +

      // scope filter row
      '<div style="display:flex;align-items:center;gap:6px;padding:10px 16px;border-bottom:1px solid var(--edge,#232936)">' +
        '<span style="font-size:11px;color:var(--fg-muted,#6b7689);margin-right:2px">Scope</span>' +
        tab('This task', false) + tab('Project', false) + tab('Space', false) + tab('Everything', true) +
        '<span style="margin-left:auto;display:flex;gap:6px;align-items:center">' +
          '<span style="font-size:11px;color:var(--fg-muted,#6b7689)">source</span>' + gbtn('All ▾') +
          '<span style="font-size:11px;color:var(--fg-muted,#6b7689)">status</span>' + gbtn('All ▾') +
        '</span>' +
      '</div>' +

      // body
      '<div style="padding:14px 16px;overflow:auto">' +

        // missed-fires notice
        '<div style="border:1px solid ' + C.info + '59;background:' + C.info + '14;border-radius:10px;padding:10px 11px;margin-bottom:14px">' +
          '<div style="font-size:12.5px;font-weight:600;color:var(--fg,#e6ebf5)">dev-3.0 was closed 22:14 → 08:07 — 3 scheduled fires were missed</div>' +
          '<div style="font-size:11.5px;color:var(--fg-3,#8b95a8);margin:3px 0 8px">Each waker decided for itself; nothing ran while the app was down.</div>' +
          [['nightly hygiene sweep', 'catch-up <b style="color:var(--fg,#e6ebf5)">run-once</b> · missed 02:00, 5 h late', 'ran at 08:07 ✓', C.ok],
           ['PR digest 09:00', 'catch-up <b style="color:var(--fg,#e6ebf5)">skip-stale</b> · grace 30 min exceeded', 'skipped → next 09:00', '#6b7689'],
           ['hourly staging health', 'catch-up <b style="color:var(--fg,#e6ebf5)">coalesce</b> · 10 fires → 1', '1 delivered 08:07', C.info],
           ['deploy-finished', 'external source · <b style="color:var(--fg,#e6ebf5)">backfilled</b> by cursor', '2 events replayed ✓', C.ok]]
            .map(function (r) {
              return '<div style="display:flex;align-items:center;gap:10px;border:1px solid var(--edge,#232936);border-radius:8px;background:var(--raised,#141926);padding:6px 9px;margin-bottom:4px;font-size:11.5px">' +
                '<span style="width:168px;flex:none;color:var(--fg,#e6ebf5)">' + r[0] + '</span>' +
                '<span style="flex:1;color:var(--fg-3,#8b95a8)">' + r[1] + '</span>' +
                '<span style="color:' + r[3] + '">' + r[2] + '</span></div>';
            }).join('') +
          '<div style="display:flex;gap:5px;margin-top:7px">' +
            '<button style="border-radius:6px;padding:3px 8px;font-size:11px;border:1px solid ' + C.accent + '80;background:' + C.accent + '33;color:var(--fg,#e6ebf5)">Run skipped now</button>' +
            gbtn('Dismiss') + gbtn('Catch-up policy…') +
          '</div>' +
        '</div>' +

        '<div style="font-size:12px;font-weight:600;color:var(--fg,#e6ebf5);margin-bottom:7px">Active subscriptions <span style="font-weight:400;color:var(--fg-muted,#6b7689)">6 · 2 task · 2 project · 1 space · 1 global</span></div>' +
        rowHtml +

        // pending / dead-letter
        '<div style="display:flex;align-items:center;gap:9px;border:1px solid ' + C.warn + '59;background:' + C.warn + '14;border-radius:10px;padding:8px 10px;margin:10px 0 6px;font-size:12px;color:var(--fg-2,#9aa4b8)">' +
          '<span>⚠ <b style="color:var(--fg,#e6ebf5)">1 pending delivery</b> — pr-activity → task #23, agent pane busy; arrives when it goes quiet</span>' +
          '<span style="margin-left:auto">' + gbtn('clear') + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:9px;border:1px solid ' + C.danger + '59;background:' + C.danger + '14;border-radius:10px;padding:8px 10px;margin-bottom:6px;font-size:12px;color:var(--fg-2,#9aa4b8)">' +
          '<span>⛔ <b style="color:var(--fg,#e6ebf5)">dead-letter</b> — sentry-alert → task #19, 5 attempts failed, subscription auto-paused</span>' +
          '<span style="margin-left:auto;display:flex;gap:4px">' + gbtn('retry') + gbtn('dismiss') + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:9px;border:1px solid var(--edge,#232936);background:var(--raised,#141926);border-radius:10px;padding:8px 10px;font-size:12px;color:var(--fg-3,#8b95a8)">' +
          '<span>⏳ 2 deliveries expired by TTL in the last 24 h (stale CI results, never delivered)</span>' +
          '<span style="margin-left:auto">' + gbtn('view log') + '</span></div>' +

        // firing log
        '<div style="font-size:12px;font-weight:600;color:var(--fg,#e6ebf5);margin:14px 0 3px">Recent firings</div>' +
        '<div style="font-size:11px;color:var(--fg-3,#8b95a8);margin-bottom:7px">Append-only audit log — every firing, its target, and what happened.</div>' +
        '<div style="border:1px solid var(--edge,#232936);border-radius:10px;overflow:hidden">' +
          [['14:12', 'pr-activity', 'task #23', 'delivered', C.ok],
           ['13:58', 'issue-opened', 'launched task #44', 'delivered', C.ok],
           ['09:00', 'cron digest', 'task #23', 'woke hibernated task', C.info],
           ['08:41', 'sentry-alert', 'task #19', 'failed — dead-letter', C.danger],
           ['02:00', 'cron', 'task #41 "hygiene sweep"', 'delivered', C.ok]]
            .map(function (r, i) {
              return '<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;font-size:11.5px;background:' +
                (i % 2 ? 'var(--raised,#141926)' : 'transparent') + '">' +
                '<span style="width:44px;color:var(--fg-muted,#6b7689);font-family:ui-monospace,monospace">' + r[0] + '</span>' +
                '<span style="width:124px;color:var(--fg,#e6ebf5)">' + r[1] + '</span>' +
                '<span style="flex:1;color:var(--fg-2,#9aa4b8)">→ ' + r[2] + '</span>' +
                '<span style="color:' + r[4] + '">' + r[3] + '</span></div>';
            }).join('') +
        '</div>' +

        '<div style="margin-top:12px;font-size:11px;color:var(--fg-muted,#6b7689)">Waker definitions and catch-up policy live in Project Settings → Events &amp; Schedules. ' +
        '<span style="color:' + C.accent + '">Open →</span></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);
  return 'overlay';
})();
