(function(){
  var title = [].slice.call(document.querySelectorAll('div')).filter(function(e){
    return e.textContent.trim().indexOf('Research central wake')===0 && e.children.length===0; })[0];
  var card = title.closest('div[class*="rounded"]');
  for (var i=0;i<4 && card && card.clientWidth < 200;i++) card = card.parentElement;
  var chip = function(t,c){ return '<span class="inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold" style="color:'+c+';border-color:'+c+'66;background:'+c+'22">'+t+'</span>'; };
  var d = document.createElement('div');
  d.className = 'mt-1.5 rounded-lg border border-edge bg-raised px-2 py-2';
  d.innerHTML =
    '<div class="mb-1.5 flex items-center gap-1.5">'
    + '<span class="text-fg text-[11px] font-semibold">Watching</span>'
    + '<span class="text-fg-muted text-[10px]">3 active</span>'
    + '<span class="ml-auto text-[10px]" style="color:#f0b232">1 pending</span></div>'
    + '<div class="space-y-1">'
    + '<div class="flex items-center gap-1.5 text-[10px]">'+chip('pr-activity','#4496ff')+'<span class="text-fg-2 truncate">PR #1620 reviews·ci</span><span class="text-fg-muted ml-auto whitespace-nowrap">12m ago</span></div>'
    + '<div class="flex items-center gap-1.5 text-[10px]">'+chip('cron','#a78bfa')+'<span class="text-fg-2 truncate">09:00 digest Mon–Fri</span><span class="text-fg-muted ml-auto whitespace-nowrap">Tue 09:00</span></div>'
    + '<div class="flex items-center gap-1.5 text-[10px]">'+chip('deploy','#f0b232')+'<span class="text-fg-2 truncate">env=staging, debounce</span><span class="text-fg-muted ml-auto whitespace-nowrap">—</span></div>'
    + '</div>'
    + '<button class="mt-1.5 w-full rounded border border-edge bg-elevated py-0.5 text-[10px] text-fg-2">Manage…</button>';
  card.appendChild(d);
  return card.className.slice(0,40);
})();
