/* JobSight v3.3.72 — Step Sidebar Workflow */
(function(){
  const nav=document.getElementById('workspaceNav');
  if(!nav) return;
  const fileInput=document.getElementById('fileInput');
  const jd=document.getElementById('sharedJobDesc');
  const progressValue=document.getElementById('sidebarProgressValue');
  const progressBar=document.getElementById('sidebarProgressBar');
  const progressHint=document.getElementById('sidebarProgressHint');
  function legacyClick(target){
    const btn=document.querySelector('.tab-btn[data-tab="'+target+'"]');
    if(btn){btn.click();setTimeout(()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}),30);}
  }
  function setActive(target){nav.querySelectorAll('.workspace-nav-item').forEach(el=>el.classList.toggle('active',el.dataset.workspaceTarget===target));}
  nav.querySelectorAll('[data-workspace-target]').forEach(el=>el.addEventListener('click',()=>{setActive(el.dataset.workspaceTarget);legacyClick(el.dataset.workspaceTarget);}));
  const first=nav.querySelector('[data-scroll-target="resumeWorkspace"]');
  first?.addEventListener('click',()=>{nav.querySelectorAll('.workspace-nav-item').forEach(el=>el.classList.remove('active'));first.classList.add('active');document.getElementById('resumeWorkspace')?.scrollIntoView({behavior:'smooth',block:'start'});});
  document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>setActive(btn.dataset.tab)));
  function updateProgress(){
    const hasResume=!!(fileInput?.files?.length)||(typeof resumeText!=='undefined'&&resumeText.trim().length>10)||!!document.getElementById('fileChip')?.offsetParent;
    const hasJob=!!(jd&&jd.value.trim().length>10);
    const done2=!!document.querySelector('#dot2.done'),done1=!!document.querySelector('#dot1.done'),done4=!!document.querySelector('#dot4.done');
    let score=(hasResume?20:0)+(hasJob?20:0)+(done1?15:0)+(done2?15:0)+(done4?15:0)+((document.querySelector('#dot6.done')||document.querySelector('#dot7.done'))?15:0);
    score=Math.min(100,score);
    if(progressValue) progressValue.textContent=score+'%';
    if(progressBar) progressBar.style.width=score+'%';
    if(progressHint) progressHint.textContent=score<20?'先完成履歷上傳':score<40?'再貼上目標職缺':score<70?'開始檢查與媒合':score<90?'準備面試與客製履歷':'完成最後的求職文件';
  }
  fileInput?.addEventListener('change',updateProgress);jd?.addEventListener('input',updateProgress);
  const observer=new MutationObserver(updateProgress);
  ['dot1','dot2','dot4','dot6','dot7'].forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class']});});
  updateProgress();
})();
