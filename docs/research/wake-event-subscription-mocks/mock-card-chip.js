(function(){
  var old=document.getElementById('wake-chip-pop'); if(old) old.remove();
  var title=[].slice.call(document.querySelectorAll('div')).filter(function(e){
    return e.textContent.trim().indexOf('Research central wake')===0 && e.children.length===0;})[0];
  if(!title) return 'no card';
  var card=title.closest('div[class*="rounded"]');
  for(var i=0;i<4 && card && card.clientWidth<200;i++) card=card.parentElement;

  // 1. the chip in the signals zone (reuses the shared deferred-timer slot)
  var sig=document.createElement('div');
  sig.id='wake-chip';
  sig.style.cssText='display:flex;align-items:center;gap:5px;padding:3px 7px;border-top:1px solid #232936;font-size:10px;color:#9aa4b8';
  sig.innerHTML='<span style="color:#a78bfa">◷</span><span><b style="color:#e6ebf5">Tue 09:00</b> · next wake</span>'
    + '<span style="color:#6b7689">·</span><span>3 watching</span>'
    + '<span style="margin-left:auto;color:#f0b232">1 pending</span>';
  card.appendChild(sig);

  // 2. its popover, anchored above the card
  var r=card.getBoundingClientRect();
  var pop=document.createElement('div');
  pop.id='wake-chip-pop';
  pop.style.cssText='position:fixed;z-index:9999;width:330px;left:'+Math.round(r.left)+'px;top:'+Math.round(r.bottom+8)+'px;'
    +'border:1px solid #2a3040;border-radius:12px;background:#0f1420;box-shadow:0 18px 44px rgba(0,0,0,.6);padding:10px 11px;font-size:11.5px;color:#9aa4b8';
  var row=function(c,cc,txt,when){
    return '<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;border:1px solid #232936;border-radius:8px;background:#141926;margin-bottom:4px">'
      +'<span style="display:inline-flex;border-radius:999px;padding:1px 6px;font-size:9.5px;font-weight:600;color:'+cc+';border:1px solid '+cc+'66;background:'+cc+'22;white-space:nowrap">'+c+'</span>'
      +'<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8b95a8">'+txt+'</span>'
      +'<span style="color:#6b7689;white-space:nowrap">'+when+'</span></div>';
  };
  pop.innerHTML='<div style="display:flex;align-items:center;margin-bottom:7px">'
      +'<span style="font-size:11px;font-weight:700;color:#e6ebf5">Watching</span>'
      +'<span style="margin-left:6px;color:#6b7689;font-size:10.5px">3 active · task #23</span></div>'
    + row('cron','#a78bfa','09:00 digest Mon–Fri','Tue 09:00')
    + row('pr-activity','#4496ff','PR #1620 reviews · ci','12m ago')
    + row('deploy','#f0b232','env=staging · debounce 2m','—')
    + '<div style="display:flex;align-items:center;gap:6px;border:1px solid #f0b23259;background:#f0b2321a;border-radius:8px;padding:5px 6px;margin:6px 0;color:#9aa4b8">'
      +'<span>⚠ 1 pending — pane busy</span>'
      +'<button style="margin-left:auto;border-radius:6px;padding:2px 6px;font-size:10.5px;background:transparent;border:1px solid #2a3040;color:#9aa4b8">clear</button></div>'
    + '<div style="display:flex;gap:5px;margin-top:2px">'
      +'<button style="flex:1;border-radius:7px;padding:4px 0;font-size:10.5px;border:1px solid #4496ff80;background:#4496ff2e;color:#e6ebf5">Manage…</button>'
      +'<button style="border-radius:7px;padding:4px 9px;font-size:10.5px;border:1px solid #2a3040;background:transparent;color:#9aa4b8">Run now</button>'
      +'<button style="border-radius:7px;padding:4px 9px;font-size:10.5px;border:1px solid #2a3040;background:transparent;color:#9aa4b8">Pause all</button></div>'
    + '<div style="margin-top:7px;font-size:10px;color:#6b7689">One shared chip: shows the soonest wake whatever its kind — no second timer badge.</div>';
  document.body.appendChild(pop);
  return 'chip+pop';
})();
