(() => {
  const anchor = [...document.querySelectorAll('h3')].find(h => h.textContent.trim() === 'Active subscriptions');
  const wrap = anchor.parentElement.parentElement;
  const d = document.createElement('div');
  d.className = 'mb-4 rounded-xl border px-3 py-3';
  d.style.borderColor = '#38bdf866'; d.style.background = '#38bdf814';
  d.innerHTML = `
    <div class="text-fg text-[13px] font-semibold">dev-3.0 was closed 22:14 → 08:07 — 3 scheduled fires were missed</div>
    <p class="text-fg-3 mt-1 mb-2 text-[12px]">Each waker decides for itself; nothing ran while the app was down.</p>
    <div class="space-y-1.5">
      <div class="flex items-center gap-3 rounded-lg border border-edge bg-raised px-2.5 py-2 text-[12px]">
        <span class="text-fg w-44">nightly hygiene sweep</span>
        <span class="text-fg-3 flex-1">catch-up <b class="text-fg">run-once</b> · missed 02:00, 5 h late</span>
        <span style="color:#34d399">ran at 08:07 ✓</span>
      </div>
      <div class="flex items-center gap-3 rounded-lg border border-edge bg-raised px-2.5 py-2 text-[12px]">
        <span class="text-fg w-44">PR digest 09:00</span>
        <span class="text-fg-3 flex-1">catch-up <b class="text-fg">skip-stale</b> · grace 30 min exceeded</span>
        <span class="text-fg-muted">skipped, folded into next 09:00</span>
      </div>
      <div class="flex items-center gap-3 rounded-lg border border-edge bg-raised px-2.5 py-2 text-[12px]">
        <span class="text-fg w-44">hourly staging health</span>
        <span class="text-fg-3 flex-1">catch-up <b class="text-fg">coalesce</b> · 10 fires missed → 1</span>
        <span style="color:#38bdf8">1 delivered at 08:07</span>
      </div>
      <div class="flex items-center gap-3 rounded-lg border border-edge bg-raised px-2.5 py-2 text-[12px]">
        <span class="text-fg w-44">deploy-finished (event)</span>
        <span class="text-fg-3 flex-1">external source · <b class="text-fg">backfilled</b> from GitHub since last cursor</span>
        <span style="color:#34d399">2 events replayed ✓</span>
      </div>
    </div>
    <div class="mt-2 flex gap-1.5">
      <button class="rounded-lg border px-2 py-1 text-[11px] text-fg" style="border-color:#4496ff80;background:#4496ff33">Run skipped now</button>
      <button class="rounded-lg border border-edge bg-elevated px-2 py-1 text-[11px] text-fg-2">Dismiss</button>
      <button class="rounded-lg border border-edge bg-elevated px-2 py-1 text-[11px] text-fg-2">Catch-up policy…</button>
    </div>`;
  wrap.insertBefore(d, anchor.parentElement);
  return 'added';
})();
