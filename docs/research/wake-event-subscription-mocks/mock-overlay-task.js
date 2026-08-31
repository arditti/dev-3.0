(function(){
  var w=document.getElementById('wake-mock-overlay'); if(!w) return 'no overlay';
  var body=w.querySelector('[role=dialog] > div:last-child'); body.scrollTop=0;
  var tabs=w.querySelectorAll('[role=dialog] > div:nth-child(2) button');
  // tabs[0..3] = This task, Project, Space, Everything
  tabs[3].style.cssText=tabs[3].style.cssText.replace(/border:[^;]+/,'border:1px solid #232936').replace(/background:[^;]+/,'background:transparent').replace(/color:[^;]+/,'color:#9aa4b8').replace(/font-weight:600/,'font-weight:400');
  tabs[0].style.cssText=tabs[0].style.cssText.replace(/border:[^;]+/,'border:1px solid #4496ff80').replace(/background:[^;]+/,'background:#4496ff2e').replace(/color:[^;]+/,'color:#e6ebf5').replace(/font-weight:400/,'font-weight:600');
  // keep only task-scoped rows (first two), retitle counts
  var rows=[].slice.call(body.children).filter(function(e){return e.style.display==='flex'&&e.textContent.indexOf('last fired')>-1||/pr-activity|cron|issue-opened|deploy-finished|task-lifecycle/.test(e.textContent)&&e.style.borderRadius==='10px'});
  var kept=0;
  [].slice.call(body.children).forEach(function(e){
    var t=e.textContent;
    if(/by agent|by user|from \.dev3/.test(t) && e.tagName==='DIV' && e.style.borderRadius==='10px'){
      kept++;
      if(!/task #23/.test(t)) e.remove();
    }
  });
  // header count line
  [].slice.call(body.children).forEach(function(e){
    if(e.textContent.indexOf('Active subscriptions')===0)
      e.innerHTML='Active subscriptions <span style="font-weight:400;color:#6b7689">2 — everything watching task #23</span>';
  });
  // missed-fires notice is global; scope it down
  var m=body.firstElementChild;
  m.querySelector('div').innerHTML='dev-3.0 was closed 22:14 → 08:07 — 1 fire for this task was missed';
  var inner=[].slice.call(m.children).filter(function(e){return e.style.borderRadius==='8px'});
  inner.forEach(function(e,i){ if(i!==1) e.remove(); });
  // firing log → task only
  var logRows=body.querySelectorAll('div[style*="overflow:hidden"] > div');
  [].slice.call(logRows).forEach(function(r){ if(r.textContent.indexOf('task #23')===-1) r.remove(); });
  // footer hint
  var f=body.lastElementChild; f.innerHTML='This task’s agent manages these itself via <code>dev3 subscribe</code>. Project-wide wakers: <span style="color:#4496ff">switch scope above →</span>';
  return 'task scope';
})();
