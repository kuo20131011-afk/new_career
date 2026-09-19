/* JobSight v3.3.71 — 個人求職工作台 UI
   僅負責導覽、狀態呈現與視覺層，不取代既有 t1/t2/t4/t6/t7 功能。
*/
(function(){
  const nav = document.getElementById('workspaceNav');
  if (!nav) return;
  const progressRing = document.getElementById('workspaceProgressRing');
  const progressValue = document.getElementById('workspaceProgressValue');
  const progressTitle = document.getElementById('workspaceProgressTitle');
  const progressHint = document.getElementById('workspaceProgressHint');
  const fileInput = document.getElementById('fileInput');
  const jd = document.getElementById('sharedJobDesc');
  const upload = document.getElementById('resumeWorkspace');

  function legacyClick(target){
    const btn = document.querySelector('.tab-btn[data-tab="' + target + '"]');
    if (btn) {
      btn.click();
      setTimeout(() => {
        const panel = document.getElementById(target);
        if (panel) panel.scrollIntoView({behavior:'smooth', block:'start'});
      }, 30);
    }
  }

  function setActive(target){
    nav.querySelectorAll('.workspace-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.workspaceTarget === target);
    });
  }

  nav.querySelectorAll('[data-workspace-target]').forEach(el => {
    el.addEventListener('click', () => {
      const target = el.dataset.workspaceTarget;
      setActive(target);
      legacyClick(target);
    });
  });

  nav.querySelector('[data-workspace-home]')?.addEventListener('click', () => {
    nav.querySelectorAll('.workspace-nav-item').forEach(el => el.classList.remove('active'));
    nav.querySelector('[data-workspace-home]')?.classList.add('active');
    document.getElementById('workspaceHome')?.scrollIntoView({behavior:'smooth', block:'start'});
  });

  document.querySelectorAll('[data-scroll-target]').forEach(el => {
    el.addEventListener('click', () => document.getElementById(el.dataset.scrollTarget)?.scrollIntoView({behavior:'smooth', block:'start'}));
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setActive(btn.dataset.tab));
  });

  function updateProgress(){
    const hasResume = !!(fileInput && fileInput.files && fileInput.files.length) || (typeof resumeText !== 'undefined' && resumeText.trim().length > 10) || !!document.getElementById('fileChip')?.offsetParent;
    const hasJob = !!(jd && jd.value.trim().length > 10);
    const hasAnalysis = !!document.querySelector('#dot1.done, #dot2.done, #dot4.done');
    let score = (hasResume ? 40 : 0) + (hasJob ? 35 : 0) + (hasAnalysis ? 25 : 0);
    score = Math.min(100, score);
    if (progressRing) progressRing.style.setProperty('--progress', score * 3.6 + 'deg');
    if (progressValue) progressValue.textContent = score + '%';
    if (progressTitle){
      progressTitle.textContent = score === 100 ? '準備完成，可開始投遞' : hasResume && hasJob ? '可以開始 AI 分析' : hasResume ? '再加入一份目標職缺' : '先上傳你的履歷';
    }
    if (progressHint){
      progressHint.textContent = score === 100 ? '媒合、健診與面試準備都已具備，可以逐項優化。' : hasResume && hasJob ? '按下上方一鍵分析，或從功能導覽選擇單項工具。' : '只要準備好履歷與目標職缺，JobSight 就能接手下一步。';
    }
  }
  fileInput?.addEventListener('change', updateProgress);
  jd?.addEventListener('input', updateProgress);
  const observer = new MutationObserver(updateProgress);
  ['dot1','dot2','dot4'].forEach(id => { const el=document.getElementById(id); if(el) observer.observe(el,{attributes:true,attributeFilter:['class']}); });
  updateProgress();
})();
