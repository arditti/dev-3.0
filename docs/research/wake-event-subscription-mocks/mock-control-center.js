(() => {
  // Add nav item after "Notifications"
  const nav = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === 'Notifications' && b.className.includes('min-h-11'),
  );
  const active = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === 'Appearance' && b.className.includes('min-h-11'),
  );
  const activeCls = active.className;
  const idleCls = nav.className;
  active.className = idleCls;
  const item = nav.cloneNode(true);
  item.textContent = 'Events & Schedules';
  item.className = activeCls;
  nav.parentElement.insertBefore(item, nav.nextSibling);

  // Replace content pane
  const h = [...document.querySelectorAll('h2,h1')].find((e) => e.textContent.trim() === 'Appearance');
  const head = h.parentElement; // .mb-7
  const pane = head.parentElement;

  const chip = (t, tone) =>
    `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}">${t}</span>`;
  const built = 'border-accent/40 bg-accent/15 text-fg';
  const custom = 'border-amber-400/40 bg-amber-400/10 text-amber-200';
  const timer = 'border-violet-400/40 bg-violet-400/10 text-violet-200';
  const scope = (t, c) =>
    `<span class="rounded border px-1.5 py-px text-[10px] font-semibold ${c}">${t}</span>`;
  const btn = (t, extra = '') =>
    `<button class="rounded-lg border border-edge bg-elevated px-2 py-1 text-[11px] text-fg-2 hover:border-edge-active hover:text-fg ${extra}">${t}</button>`;

  const row = (c, meta, times, acts) => `
    <div class="flex items-center gap-3 rounded-xl border border-edge bg-raised px-3 py-2.5">
      <div class="w-32 shrink-0">${c}</div>
      <div class="min-w-0 flex-1 text-[13px] text-fg-2">${meta}</div>
      <div class="w-40 shrink-0 text-[11px] leading-tight text-fg-muted">${times}</div>
      <div class="flex shrink-0 gap-1">${acts}</div>
    </div>`;

  head.innerHTML = `
    <h2 class="text-fg text-xl font-semibold tracking-tight outline-none">Events &amp; Schedules</h2>
    <p class="text-fg-3 mt-1 text-sm">What wakes your agents — subscriptions, schedules, and pending deliveries.</p>`;

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="mb-6">
      <div class="mb-3 flex items-center gap-2">
        <h3 class="text-fg text-sm font-semibold">Active subscriptions</h3>
        <span class="text-fg-muted text-xs">scope</span>
        <button class="rounded-lg border border-edge bg-elevated px-2 py-1 text-xs text-fg">All ▾</button>
        <span class="text-fg-muted text-xs">source</span>
        <button class="rounded-lg border border-edge bg-elevated px-2 py-1 text-xs text-fg-2">All ▾</button>
        <button class="ml-auto rounded-lg border border-accent/50 bg-accent/20 px-2.5 py-1 text-xs font-medium text-fg">+ Subscribe…</button>
      </div>
      <div class="space-y-2">
        ${row(
          chip('pr-activity', built),
          'PR <code class="text-fg">#1620</code> · reviews, ci, comments · <b class="text-fg">immediate</b>, bypass <code class="text-fg">ci == "failed"</code> ' +
            scope('task #23', 'border-edge text-fg-3'),
          'last fired 12 min ago<br>by agent · 24 total',
          btn('⏸') + btn('✕', 'text-danger border-danger/40'),
        )}
        ${row(
          chip('cron', timer),
          '<code class="text-fg">0 9 * * 1-5</code> → <b class="text-fg">digest</b> of pr-activity ' +
            scope('task #23', 'border-edge text-fg-3'),
          'next Tue 09:00<br>by agent',
          btn('⏸') + btn('✕', 'text-danger border-danger/40'),
        )}
        ${row(
          chip('issue-opened', built),
          '<code class="text-fg">label != "wontfix"</code> → <b class="text-fg">launch task</b> "Triage: {title}" ' +
            scope('project', 'border-sky-400/50 text-sky-300'),
          'last fired 2 d ago<br>by user · 14 total',
          btn('⏸') + btn('✕', 'text-danger border-danger/40'),
        )}
        ${row(
          chip('deploy-finished', custom),
          '<code class="text-fg">status == "failed"</code> → <b class="text-fg">notify</b> + attention ' +
            scope('project', 'border-sky-400/50 text-sky-300') +
            ' <span class="text-fg-muted">from .dev3/config.json</span>',
          'never fired<br>by config',
          btn('⏸') + btn('✕', 'text-danger border-danger/40'),
        )}
        ${row(
          chip('cron', timer),
          'nightly 02:00 → <b class="text-fg">launch task</b> "Repo hygiene sweep" ' +
            scope('global', 'border-emerald-400/50 text-emerald-300'),
          'next tonight 02:00<br>by user',
          btn('⏸') + btn('✕', 'text-danger border-danger/40'),
        )}
        ${row(
          chip('message --in', timer),
          '"check CI again" — scheduled message, listed here too ' + scope('task #31', 'border-edge text-fg-3'),
          'fires 15:40',
          btn('edit') + btn('✕', 'text-danger border-danger/40'),
        )}
      </div>
    </div>

    <div class="mb-6 space-y-2">
      <div class="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-[13px] text-fg-2">
        <span>⚠ <b class="text-fg">1 pending delivery</b> — pr-activity → task #23, agent pane busy; arrives when it goes quiet</span>
        <span class="ml-auto flex gap-1">${btn('clear')}</span>
      </div>
      <div class="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] text-fg-2">
        <span>⛔ <b class="text-fg">dead-letter</b> — sentry-alert → task #19, 5 attempts failed, subscription auto-paused</span>
        <span class="ml-auto flex gap-1">${btn('retry')}${btn('dismiss')}</span>
      </div>
      <div class="flex items-center gap-3 rounded-xl border border-edge bg-raised px-3 py-2.5 text-[13px] text-fg-3">
        <span>⏳ 2 deliveries expired by TTL in the last 24 h (stale CI results, not delivered)</span>
        <span class="ml-auto flex gap-1">${btn('view log')}</span>
      </div>
    </div>

    <div class="mb-6">
      <h3 class="text-fg mb-1 text-sm font-semibold">Waker store</h3>
      <p class="text-fg-3 mb-3 text-xs">Built-ins ship with dev-3.0 · customs are yours and behave identically.</p>
      <div class="grid grid-cols-3 gap-2">
        ${[
          ['pr-activity', 'Reviews, CI, comments on a pull request', built, 'built-in'],
          ['issue-opened', 'A new GitHub issue in this repo', built, 'built-in'],
          ['cron', 'A schedule — timer provider', timer, 'built-in'],
          ['file-changed', 'A path glob inside the worktree', built, 'built-in'],
          ['deploy-finished', 'Your deploy script calls <code>dev3 event emit</code>', custom, 'custom · emit'],
          ['staging-healthy', '<code>curl -sf …/health</code> every 2 min, fire on change', custom, 'custom · poll'],
        ]
          .map(
            ([n, d, tone, tag]) => `
          <div class="rounded-xl border border-edge bg-raised p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-fg text-[13px] font-semibold">${n}</span>
              ${chip(tag, tone)}
            </div>
            <p class="text-fg-muted mt-1 mb-2 text-[11px] leading-snug">${d}</p>
            <button class="rounded-lg border border-accent/50 bg-accent/20 px-2 py-1 text-[11px] font-medium text-fg">Subscribe</button>
          </div>`,
          )
          .join('')}
      </div>
      <button class="mt-2 rounded-lg border border-edge bg-elevated px-2.5 py-1 text-xs text-fg-2">+ New waker…</button>
    </div>

    <div>
      <h3 class="text-fg mb-1 text-sm font-semibold">Recent firings</h3>
      <p class="text-fg-3 mb-3 text-xs">Append-only audit log — every firing, its target, and what happened.</p>
      <div class="overflow-hidden rounded-xl border border-edge">
        ${[
          ['14:12', 'pr-activity', 'task #23', 'delivered', 'text-emerald-300'],
          ['13:58', 'issue-opened', 'launched task #44', 'delivered', 'text-emerald-300'],
          ['09:00', 'cron digest', 'task #23', 'woke hibernated task', 'text-sky-300'],
          ['08:41', 'sentry-alert', 'task #19', 'failed — dead-letter', 'text-danger'],
          ['02:00', 'cron', 'task #41 "hygiene sweep"', 'delivered', 'text-emerald-300'],
        ]
          .map(
            ([t, w, tg, st, c], i) => `
          <div class="flex items-center gap-3 px-3 py-2 text-[12px] ${i % 2 ? 'bg-raised' : 'bg-base'}">
            <span class="text-fg-muted w-12 font-mono">${t}</span>
            <span class="text-fg w-32">${w}</span>
            <span class="text-fg-2 flex-1">→ ${tg}</span>
            <span class="${c}">${st}</span>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;

  // wipe old content, keep header
  [...pane.children].forEach((c) => {
    if (c !== head) c.remove();
  });
  pane.appendChild(body);
  return 'ok';
})();
