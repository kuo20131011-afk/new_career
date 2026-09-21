const fs=require('fs'), vm=require('vm');
class El{constructor(id){this.id=id;this.value='';this.textContent='';this.hidden=true;this.dataset={};this.classList={set:new Set(),toggle:(c,on)=>{if(on)this.classList.set.add(c);else this.classList.set.delete(c)},add:c=>this.classList.set.add(c),remove:c=>this.classList.set.delete(c)};this.attrs={};}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]||null}focus(){}}
const els={};
const providers=['claude','gemini','chatgpt','agnes','nvidia','groq','openrouter','mistral'];
for(const id of ['inlineAiConfig','inlineAiTitle','inlineAiStatus','inlineApiKey','inlineApiModel']) els[id]=new El(id);
for(const p of providers){const e=new El('p-'+p);e.dataset.provider=p;els['p-'+p]=e}
const session=new Map();
const document={getElementById:id=>els[id]||null,querySelectorAll:sel=>sel==='.v400-provider-option'?providers.map(p=>els['p-'+p]):[],addEventListener:()=>{}};
const context={document,sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},window:{addEventListener:()=>{}},setTimeout:(fn)=>fn(),alert:msg=>{context.lastAlert=msg}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('/mnt/data/career_edit/js/api-keys.js','utf8'),context);
context.selectInlineProvider('gemini');
const selected={provider:context.inlineSelectedProvider,visible:els.inlineAiConfig.hidden===false,title:els.inlineAiTitle.textContent,key:els.inlineApiKey.value,model:els.inlineApiModel.value,active:els['p-gemini'].classList.set.has('active')};
els.inlineApiKey.value='AIzaTEST';els.inlineApiModel.value='gemini-test';context.saveInlineAiConfig();
const saved={provider:session.get('resumeMatcher_provider'),key:session.get('resumeMatcher_key_gemini'),model:session.get('resumeMatcher_model_gemini'),status:els.inlineAiStatus.textContent};
console.log(JSON.stringify({selected,saved,lastAlert:context.lastAlert||null},null,2));
