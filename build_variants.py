from pathlib import Path
import shutil, re, zipfile
base=Path('/mnt/data/work71')

def make_variant(name, theme):
    out=Path(f'/mnt/data/{name}')
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(base,out)
    html=out/'index.html'
    s=html.read_text(encoding='utf-8')
    # version
    s=s.replace('V3.3.71','V3.3.72'+theme.upper(),1)
    # shorten tagline and hide old hero/module content via CSS rather than deleting functional nodes
    s=s.replace('看穿一份履歷，也看穿一個職缺。上傳一次，完成媒合、健診、模擬面試、進度追蹤、客製履歷與提案簡報。','依照步驟完成履歷、職缺、健診、面試與求職文件。')
    # replace workspace nav block
    start=s.index('  <nav class="workspace-nav" id="workspaceNav"')
    end=s.index('  </nav>', start)+len('  </nav>')
    nav='''  <nav class="workspace-nav" id="workspaceNav" aria-label="求職步驟導覽">
    <div class="sidebar-brand"><span class="sidebar-brand-mark">J</span><div><b>JobSight</b><small>個人求職工作台</small></div></div>
    <div class="sidebar-heading">求職流程</div>
    <button type="button" class="workspace-nav-item active" data-scroll-target="resumeWorkspace" data-sidebar-step="1">
      <span class="workspace-nav-icon">01</span><span><b>準備履歷</b><small>上傳一次，全部工具共用</small></span>
    </button>
    <button type="button" class="workspace-nav-item" data-workspace-target="t1" data-sidebar-step="2">
      <span class="workspace-nav-icon">02</span><span><b>找目標職缺</b><small>分析適配程度</small></span>
    </button>
    <button type="button" class="workspace-nav-item" data-workspace-target="t2" data-sidebar-step="3">
      <span class="workspace-nav-icon">03</span><span><b>檢查履歷</b><small>找出可改善的地方</small></span>
    </button>
    <button type="button" class="workspace-nav-item" data-workspace-target="t4" data-sidebar-step="4">
      <span class="workspace-nav-icon">04</span><span><b>練習面試</b><small>題目與回答準備</small></span>
    </button>
    <button type="button" class="workspace-nav-item" data-workspace-target="t6" data-sidebar-step="5">
      <span class="workspace-nav-icon">05</span><span><b>客製履歷</b><small>針對職缺重新編排</small></span>
    </button>
    <button type="button" class="workspace-nav-item" data-workspace-target="t7" data-sidebar-step="6">
      <span class="workspace-nav-icon">06</span><span><b>面試提案</b><small>製作面試簡報</small></span>
    </button>
    <div class="sidebar-progress" id="sidebarProgress">
      <div class="sidebar-progress-top"><span>目前進度</span><b id="sidebarProgressValue">0%</b></div>
      <div class="sidebar-progress-bar"><i id="sidebarProgressBar"></i></div>
      <p id="sidebarProgressHint">先完成履歷上傳</p>
    </div>
  </nav>'''
    s=s[:start]+nav+s[end:]
    # hide old hero and module grid, make intake primary
    css=f'''\n<style id="sidebarWorkflowDesign">\n/* v3.3.72{theme.upper()} — 逐步側邊欄：避免重複資訊，將操作變成單一路徑 */\n:root{{--sb-navy:#12233F;--sb-blue:#2563EB;--sb-soft:#EEF4FF;--sb-border:#E5EAF2;--sb-text:#172033;--sb-muted:#667085;--sb-bg:#F6F8FB;}}\nbody{{background:var(--sb-bg);padding:0 24px 80px;}}\n.wrap{{max-width:1240px;margin-left:285px;margin-right:auto;}}\n#workspaceHome{{display:none!important;}}\n.workspace-module-grid{{display:none!important;}}\nheader{{margin-bottom:18px;}}\n.workspace-intake{{margin-top:0;}}\n.workspace-nav{{position:fixed;left:18px;top:18px;bottom:18px;width:245px;display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid var(--sb-border);border-radius:20px;padding:18px 14px;box-shadow:0 12px 36px rgba(20,33,61,.08);z-index:100;box-sizing:border-box;overflow:auto;}}\n.sidebar-brand{{display:flex;align-items:center;gap:10px;padding:4px 8px 18px;border-bottom:1px solid var(--sb-border);margin-bottom:8px;}}\n.sidebar-brand-mark{{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#2563EB,#4F8CFF);color:#fff;display:grid;place-items:center;font-weight:900;font-size:18px;box-shadow:0 6px 16px rgba(37,99,235,.22);}}\n.sidebar-brand b{{display:block;font-size:16px;color:var(--sb-navy);letter-spacing:-.02em;}}\n.sidebar-brand small{{display:block;font-size:10px;color:var(--sb-muted);margin-top:2px;}}\n.sidebar-heading{{font-size:10px;font-weight:800;color:#98A2B3;letter-spacing:.12em;padding:8px 10px 6px;}}\n.workspace-nav-item{{position:relative;display:flex;align-items:center;gap:11px;text-align:left;border:0;background:transparent;border-radius:12px;padding:11px 10px;color:var(--sb-muted);cursor:pointer;font-family:'Noto Sans TC',sans-serif;width:100%;}}\n.workspace-nav-item:hover{{background:#F7F9FC;color:var(--sb-text);}}\n.workspace-nav-item.active{{background:var(--sb-soft);color:var(--sb-blue);}}\n.workspace-nav-item:not(:last-of-type)::after{{content:'';position:absolute;left:25px;top:42px;height:9px;border-left:1px dashed #D5DCE8;pointer-events:none;}}\n.workspace-nav-icon{{width:30px;height:30px;border-radius:9px;background:#F1F4F8;display:grid;place-items:center;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;flex:none;color:#7A8496;}}\n.workspace-nav-item.active .workspace-nav-icon{{background:#fff;color:var(--sb-blue);box-shadow:0 2px 8px rgba(37,99,235,.12);}}\n.workspace-nav-item b{{display:block;font-size:13px;line-height:1.3;}}\n.workspace-nav-item small{{display:block;font-size:10px;color:var(--sb-muted);margin-top:2px;white-space:nowrap;}}\n.sidebar-progress{{margin-top:auto;background:#F8FAFD;border:1px solid var(--sb-border);border-radius:13px;padding:12px;}}\n.sidebar-progress-top{{display:flex;justify-content:space-between;font-size:10px;color:var(--sb-muted);margin-bottom:8px;}}\n.sidebar-progress-top b{{color:var(--sb-blue);}}\n.sidebar-progress-bar{{height:6px;background:#E9EEF5;border-radius:99px;overflow:hidden;}}\n.sidebar-progress-bar i{{display:block;width:0;height:100%;background:linear-gradient(90deg,#2563EB,#60A5FA);border-radius:99px;transition:width .25s ease;}}\n.sidebar-progress p{{font-size:10px;color:#667085;line-height:1.5;margin:8px 0 0;}}\n.tab-panel{{scroll-margin-top:20px;}}\n@media(max-width:900px){{body{{padding:0 14px 60px;}}.wrap{{margin-left:0;max-width:none;}}.workspace-nav{{position:sticky;top:8px;left:auto;bottom:auto;width:100%;height:auto;max-height:none;display:grid;grid-template-columns:repeat(3,1fr);padding:10px;margin-bottom:14px;overflow:visible;}}.sidebar-brand,.sidebar-heading,.sidebar-progress{{display:none;}}.workspace-nav-item{{padding:9px;}}.workspace-nav-item:not(:last-of-type)::after{{display:none;}}.workspace-nav-item small{{display:none;}}}}\n@media(max-width:600px){{.workspace-nav{{grid-template-columns:repeat(2,1fr);}}.workspace-nav-icon{{width:28px;height:28px;}}}}\n</style>\n'''
    # insert before workspaceDesignSystem style to override later? Better append after existing workspaceDesignSystem, before dynPage.
    marker='<style id="dynPageSizeStyle"></style>'
    s=s.replace(marker, css+marker)
    # add version comment in body
    s=s.replace('JobSight 個人求職工作台','JobSight 個人求職工作台',1)
    html.write_text(s,encoding='utf-8')
    # replace workspace JS
    js=out/'js/workspace-ui.js'
    js_text='''/* JobSight v3.3.72 — Step Sidebar Workflow */\n(function(){\n  const nav=document.getElementById('workspaceNav');\n  if(!nav) return;\n  const fileInput=document.getElementById('fileInput');\n  const jd=document.getElementById('sharedJobDesc');\n  const progressValue=document.getElementById('sidebarProgressValue');\n  const progressBar=document.getElementById('sidebarProgressBar');\n  const progressHint=document.getElementById('sidebarProgressHint');\n  function legacyClick(target){\n    const btn=document.querySelector('.tab-btn[data-tab="'+target+'"]');\n    if(btn){btn.click();setTimeout(()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}),30);}\n  }\n  function setActive(target){nav.querySelectorAll('.workspace-nav-item').forEach(el=>el.classList.toggle('active',el.dataset.workspaceTarget===target));}\n  nav.querySelectorAll('[data-workspace-target]').forEach(el=>el.addEventListener('click',()=>{setActive(el.dataset.workspaceTarget);legacyClick(el.dataset.workspaceTarget);}));\n  const first=nav.querySelector('[data-scroll-target="resumeWorkspace"]');\n  first?.addEventListener('click',()=>{nav.querySelectorAll('.workspace-nav-item').forEach(el=>el.classList.remove('active'));first.classList.add('active');document.getElementById('resumeWorkspace')?.scrollIntoView({behavior:'smooth',block:'start'});});\n  document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>setActive(btn.dataset.tab)));\n  function updateProgress(){\n    const hasResume=!!(fileInput?.files?.length)||(typeof resumeText!=='undefined'&&resumeText.trim().length>10)||!!document.getElementById('fileChip')?.offsetParent;\n    const hasJob=!!(jd&&jd.value.trim().length>10);\n    const done2=!!document.querySelector('#dot2.done'),done1=!!document.querySelector('#dot1.done'),done4=!!document.querySelector('#dot4.done');\n    let score=(hasResume?20:0)+(hasJob?20:0)+(done1?15:0)+(done2?15:0)+(done4?15:0)+((document.querySelector('#dot6.done')||document.querySelector('#dot7.done'))?15:0);\n    score=Math.min(100,score);\n    if(progressValue) progressValue.textContent=score+'%';\n    if(progressBar) progressBar.style.width=score+'%';\n    if(progressHint) progressHint.textContent=score<20?'先完成履歷上傳':score<40?'再貼上目標職缺':score<70?'開始檢查與媒合':score<90?'準備面試與客製履歷':'完成最後的求職文件';\n  }\n  fileInput?.addEventListener('change',updateProgress);jd?.addEventListener('input',updateProgress);\n  const observer=new MutationObserver(updateProgress);\n  ['dot1','dot2','dot4','dot6','dot7'].forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class']});});\n  updateProgress();\n})();\n'''
    js.write_text(js_text,encoding='utf-8')
    # remove old workspace css from file? Keep but override; okay.
    # zip
    zip_path=Path(f'/mnt/data/{name}.zip')
    if zip_path.exists(): zip_path.unlink()
    with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
        for p in out.rglob('*'):
            if p.is_file(): z.write(p,p.relative_to(out))
    return zip_path

for name,theme in [('zhitou-jobsight-v3.3.72A','a'),('zhitou-jobsight-v3.3.72B','b')]:
    make_variant(name,theme)
print('done')
