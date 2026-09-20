/* JobSight v3.3.76 — enterprise-grade sidebar workflow + unified progress */
(function(){
  const nav=document.getElementById('workspaceNav'); if(!nav) return;
  const fileInput=document.getElementById('fileInput'), jd=document.getElementById('sharedJobDesc');
  const progressEls={value:document.getElementById('sidebarProgressValue'),bar:document.getElementById('sidebarProgressBar'),hint:document.getElementById('sidebarProgressHint'),heroValue:document.getElementById('workspaceProgressValue'),heroTitle:document.getElementById('workspaceProgressTitle'),heroHint:document.getElementById('workspaceProgressHint')};
  const guide={mark:document.getElementById('currentGuideMark'),title:document.getElementById('currentGuideTitle'),text:document.getElementById('currentGuideText'),next:document.getElementById('currentGuideNext')};
  const cfg={
    resumeWorkspace:{n:'01',title:'先準備好求職資料',text:'上傳履歷並貼上目標職缺；後續分析會共用這份資料。',next:'完成後進入第 2 步'},
    t1:{n:'02',title:'查看職缺媒合結果',text:'查看履歷與目標職缺的匹配重點、優勢與待補強項目。',next:'完成後進入第 3 步'},
    t2:{n:'03',title:'檢查履歷內容',text:'找出 ATS、內容結構與表達上的改善機會。',next:'完成後進入第 4 步'},
    t4:{n:'04',title:'開始練習面試',text:'依履歷與職缺需求準備面試題目、回答方向與反問問題。',next:'完成後進入第 5 步'},
    t6:{n:'05',title:'製作客製履歷',text:'依目標職缺重新聚焦履歷重點，不新增不存在的經歷。',next:'完成後進入第 6 步'},
    t7:{n:'06',title:'準備面試提案',text:'把經驗與成果整理成面試時可直接使用的提案簡報。',next:'完成主要流程'}
  };
  const steps=[
    {step:1,target:'resumeWorkspace',done:()=>hasResume(),available:()=>true},
    {step:2,target:'t1',done:()=>done('dot1'),available:()=>hasResume()&&hasJob()},
    {step:3,target:'t2',done:()=>done('dot2'),available:()=>done('dot1')},
    {step:4,target:'t4',done:()=>!!document.querySelector('#dot4.done'),available:()=>!!document.querySelector('#dot4.done')},
    {step:5,target:'t6',done:()=>!!document.querySelector('#dot6.done'),available:()=>!!document.querySelector('#dot4.done')},
    {step:6,target:'t7',done:()=>!!document.querySelector('#dot7.done'),available:()=>!!document.querySelector('#dot6.done')}
  ];
  function hasResume(){return !!(fileInput?.files?.length)||(typeof resumeText!=='undefined'&&resumeText.trim().length>10)||!!document.getElementById('fileChip')?.offsetParent}
  function hasJob(){return !!(jd&&jd.value.trim().length>10)}
  function done(key){return !!document.querySelector('#'+key+'.done')}
  function getProgress(){
    const parts=[hasResume(),hasJob(),done('dot1'),done('dot2'),done('dot4'),done('dot6'),done('dot7')];
    return Math.round(parts.reduce((n,v)=>n+(v?1:0),0)/parts.length*100);
  }
  function syncProgress(){
    const score=getProgress();
    [progressEls.value,progressEls.heroValue].forEach(e=>{if(e)e.textContent=score+'%'});
    [progressEls.bar].forEach(e=>{if(e)e.style.width=score+'%'});
    const hint=score===0?'先完成履歷上傳':score<30?'補上目標職缺':score<58?'完成媒合與履歷健診':score<72?'開始面試準備':score<86?'完成客製履歷':'完成最後的面試提案';
    if(progressEls.hint)progressEls.hint.textContent=hint;
    if(progressEls.heroHint)progressEls.heroHint.textContent=hint;
    if(progressEls.heroTitle)progressEls.heroTitle.textContent=score===100?'主要流程已完成':'求職準備度 '+score+'%';
  }
  function syncStates(){
    const items=[...nav.querySelectorAll('.workspace-nav-item')];
    items.forEach(el=>{
      const n=Number(el.dataset.sidebarStep), s=steps.find(x=>x.step===n), isDone=s?.done(), available=s?.available();
      const active=el.classList.contains('active');
      el.classList.toggle('completed',!!isDone&&!active); el.classList.toggle('locked',!available&&!isDone&&!active); el.setAttribute('aria-disabled',(!available&&!isDone)?'true':'false');
      const badge=el.querySelector('.step-state'); if(badge)badge.textContent=active?'現在':(isDone?'已完成':(available?'可開始':'待解鎖'));
    });
  }
  function updateGuide(target){const c=cfg[target]||cfg.resumeWorkspace; if(guide.mark)guide.mark.textContent=c.n;if(guide.title)guide.title.textContent=c.title;if(guide.text)guide.textContent=c.text;if(guide.next)guide.next.textContent=c.next;}
  function legacyClick(target){const btn=document.querySelector('.tab-btn[data-tab="'+target+'"]');if(btn){btn.click();setTimeout(()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}),30);}}
  function setActive(target){nav.querySelectorAll('.workspace-nav-item').forEach(el=>el.classList.toggle('active',el.dataset.workspaceTarget===target||el.dataset.scrollTarget===target));updateGuide(target);syncStates();syncProgress();}
  nav.querySelectorAll('.workspace-nav-item').forEach(el=>el.addEventListener('click',()=>{
    const n=Number(el.dataset.sidebarStep),s=steps.find(x=>x.step===n); if(s && !s.available() && !s.done()) return;
    const target=el.dataset.workspaceTarget||el.dataset.scrollTarget||'resumeWorkspace'; setActive(target); if(target==='resumeWorkspace')document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}); else legacyClick(target);
  }));
  document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>setActive(btn.dataset.tab)));
  document.querySelectorAll('[data-workspace-target="t1"]').forEach(btn=>btn.addEventListener('click',()=>{const s=steps[1];if(s.available())legacyClick('t1');}));
  fileInput?.addEventListener('change',()=>{syncProgress();syncStates()}); jd?.addEventListener('input',()=>{syncProgress();syncStates()});
  const observer=new MutationObserver(()=>{syncProgress();syncStates()});
  ['dot1','dot2','dot4','dot6','dot7'].forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class']});});
  updateGuide('resumeWorkspace');syncProgress();syncStates();
})();
