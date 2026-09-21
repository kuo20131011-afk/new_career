/* V3.3.99 UI fixes: resume detail modal, run progress visibility, step-line cleanup. */
(function(){
  function ensureResumeModal(){
    if(document.getElementById('v399ResumeModal')) return;
    const modal=document.createElement('div');
    modal.id='v399ResumeModal';
    modal.className='v399-modal-backdrop';
    modal.innerHTML=`
      <div class="v399-modal" role="dialog" aria-modal="true" aria-labelledby="v399ResumeModalTitle">
        <div class="v399-modal-head">
          <div><div class="v399-modal-kicker">履歷文字</div><h3 id="v399ResumeModalTitle">完整擷取內容</h3></div>
          <button type="button" class="v399-modal-close" aria-label="關閉">×</button>
        </div>
        <div class="v399-modal-meta" id="v399ResumeModalMeta"></div>
        <pre class="v399-modal-body" id="v399ResumeModalBody"></pre>
      </div>`;
    document.body.appendChild(modal);
    const close=()=>{modal.style.display='none'; document.body.classList.remove('v399-modal-open');};
    modal.querySelector('.v399-modal-close').addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal) close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && modal.style.display!=='none') close();});
    modal._open=function(){
      const body=document.getElementById('v399ResumeModalBody');
      const meta=document.getElementById('v399ResumeModalMeta');
      const text=(typeof resumeText==='string' ? resumeText : '') || '';
      body.textContent=text || '目前沒有可顯示的履歷文字。';
      meta.textContent=text ? `共 ${text.length.toLocaleString()} 字｜內容僅在此瀏覽器視窗顯示` : '尚未擷取履歷文字';
      modal.style.display='flex'; document.body.classList.add('v399-modal-open');
    };
  }
  function bind(){
    ensureResumeModal();
    const btn=document.getElementById('pdfPreviewToggleBtn');
    if(btn && !btn.dataset.v399Bound){
      btn.dataset.v399Bound='1';
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        const modal=document.getElementById('v399ResumeModal');
        if(modal && typeof modal._open==='function') modal._open();
      },true);
    }
    const run=document.getElementById('runAllBtn');
    if(run) run.setAttribute('aria-live','polite');
  }
  function enhanceRunStatus(){
    const run=document.getElementById('runAllBtn');
    const status=document.getElementById('runAllStatus');
    if(!run || !status || run.dataset.v3100Bound) return;
    run.dataset.v3100Bound='1';
    const sync=()=>{
      if(run.classList.contains('v399-running')){
        status.classList.add('v399-running-status');
        if(!status.textContent.trim()) status.textContent='AI 分析正在執行中，請稍候…';
      }else{
        status.classList.remove('v399-running-status');
      }
    };
    new MutationObserver(sync).observe(run,{attributes:true,attributeFilter:['class','disabled']});
    sync();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{bind();enhanceRunStatus();}); else {bind();enhanceRunStatus();}
})();
