(function(){
  var old=document.getElementById('wake-insp'); if(old) old.remove();
  var row=function(c,cc,txt,when,extra){
    return '<div style="display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid #232936;border-radius:8px;background:#141926;margin-bottom:4px;font-size:11.5px">'
      +'<span style="display:inline-flex;border-radius:999px;padding:1px 6px;font-size:9.5px;font-weight:600;color:'+cc+';border:1px solid '+cc+'66;background:'+cc+'22;white-space:nowrap">'+c+'</span>'
      +'<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8b95a8">'+txt+'</span>'
      +(extra||'')+'<span style="color:#6b7689;white-space:nowrap">'+when+'</span></div>';
  };
  var d=document.createElement('div');
  d.id='wake-insp';
  d.style.cssText='position:fixed;z-index:9999;left:24px;bottom:24px;width:560px;border:1px solid #2a3040;border-radius:12px;background:#0f1420;box-shadow:0 20px 50px rgba(0,0,0,.65);padding:12px 13px';
  d.innerHTML=
     '<div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b7689;margin-bottom:9px">Task inspector · expanded body</div>'
    +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:7px">'
      +'<span style="font-size:12.5px;font-weight:600;color:#e6ebf5">Watching</span>'
      +'<span style="font-size:10.5px;color:#6b7689">3</span>'
      +'<span style="margin-left:auto"><button style="border-radius:6px;padding:2px 8px;font-size:10.5px;border:1px solid #2a3040;background:transparent;color:#9aa4b8">+ Subscribe</button></span></div>'
    + row('cron','#a78bfa','09:00 digest of pr-activity, Mon–Fri','Tue 09:00')
    + row('pr-activity','#4496ff','PR #1620 · reviews, ci, comments','12m ago','<span style="color:#f0b232;white-space:nowrap;margin-right:3px">1 pending</span>')
    + row('deploy-finished','#f0b232','env=staging · debounce 2m','never')
    +'<button style="width:100%;border-radius:8px;padding:5px 0;font-size:11px;border:1px solid #232936;background:transparent;color:#4496ff">Show all 3 subscriptions</button>'
    +'<div style="margin-top:9px;padding-top:9px;border-top:1px solid #1d2331;font-size:10.5px;color:#6b7689">'
      +'Capped preview, peer of <b style="color:#8b95a8">Notes</b> (newest 3 + count + Show all → the overlay). '
      +'Sits in the expanded body — the inspector’s four bars are already 4/4 full.</div>';
  document.body.appendChild(d);
  return 'ok';
})();
